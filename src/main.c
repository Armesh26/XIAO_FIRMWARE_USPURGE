/*
 * Copyright (c) 2021 Nordic Semiconductor ASA
 *
 * SPDX-License-Identifier: Apache-2.0
 */

#include <zephyr/kernel.h>
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/gap.h>
#include <zephyr/bluetooth/gatt.h>
#include <zephyr/audio/dmic.h>
#include <zephyr/logging/log.h>
#include <math.h>
#include "custom_audio_service.h"

LOG_MODULE_REGISTER(main, LOG_LEVEL_INF);

#define MAX_SAMPLE_RATE  16000
#define SAMPLE_BIT_WIDTH 16
#define BYTES_PER_SAMPLE sizeof(int16_t)
/* Milliseconds to wait for a block to be read. */
#define READ_TIMEOUT     1000

/* Optimized ring buffer for 16kHz streaming */
#define RING_BUFFER_SAMPLES 1024   // 1K samples = 2KB (2x512 bytes for peak load)
#define CHUNK_SAMPLES 160          // 160 samples per packet (320 bytes) for 10ms at 16kHz
#define BYTES_PER_PKT (CHUNK_SAMPLES * sizeof(int16_t))  // 320 bytes per packet

static int16_t ring_buffer[RING_BUFFER_SAMPLES];
static volatile uint32_t write_pos = 0;
static volatile uint32_t read_pos = 0;
static struct k_mutex ring_mutex;

/* DMIC configuration for smaller blocks */
#define DMIC_BLOCK_SIZE 1600   // Smaller blocks for continuous flow
#define DMIC_BLOCK_COUNT 4
K_MEM_SLAB_DEFINE_STATIC(mem_slab, DMIC_BLOCK_SIZE, DMIC_BLOCK_COUNT, 4);

/* BLE advertising data */
static const struct bt_data ad[] = {
    BT_DATA_BYTES(BT_DATA_FLAGS, (BT_LE_AD_GENERAL | BT_LE_AD_NO_BREDR)),
    BT_DATA_BYTES(BT_DATA_UUID128_ALL, BT_UUID_CUSTOM_AUDIO_SERVICE_VAL),
};

/* Scan response data - FIXED */
static const struct bt_data sd[] = {
    BT_DATA(BT_DATA_NAME_COMPLETE, "MicStreamer", sizeof("MicStreamer") - 1),
};

/* DMIC device and streaming control */
static const struct device *dmic_dev;
static bool dmic_started = false;

/* Ring buffer functions - SAMPLE-BASED (int16_t) */
static uint32_t ring_buffer_available_samples(void)
{
    uint32_t w = write_pos;
    uint32_t r = read_pos;
    
    if (w >= r) {
        return RING_BUFFER_SAMPLES - (w - r) - 1;
    } else {
        return r - w - 1;
    }
}

static uint32_t ring_buffer_used_samples(void)
{
    uint32_t w = write_pos;
    uint32_t r = read_pos;
    
    if (w >= r) {
        return w - r;
    } else {
        return RING_BUFFER_SAMPLES - (r - w);
    }
}

static void ring_buffer_write_samples(const int16_t *samples, uint32_t sample_count)
{
    k_mutex_lock(&ring_mutex, K_FOREVER);
    
    for (uint32_t i = 0; i < sample_count; i++) {
        if (ring_buffer_available_samples() > 0) {
            ring_buffer[write_pos] = samples[i];
            write_pos = (write_pos + 1) % RING_BUFFER_SAMPLES;
        } else {
            /* Buffer full - drop oldest sample by advancing read position */
            read_pos = (read_pos + 1) % RING_BUFFER_SAMPLES;
            ring_buffer[write_pos] = samples[i];
            write_pos = (write_pos + 1) % RING_BUFFER_SAMPLES;
        }
    }
    
    k_mutex_unlock(&ring_mutex);
}

static uint32_t ring_buffer_read_samples(int16_t *samples, uint32_t max_samples)
{
    k_mutex_lock(&ring_mutex, K_FOREVER);
    
    uint32_t available = ring_buffer_used_samples();
    uint32_t to_read = (max_samples < available) ? max_samples : available;
    
    for (uint32_t i = 0; i < to_read; i++) {
        samples[i] = ring_buffer[read_pos];
        read_pos = (read_pos + 1) % RING_BUFFER_SAMPLES;
    }
    
    k_mutex_unlock(&ring_mutex);
    return to_read;
}

/* BLE connection callbacks */
static void connected(struct bt_conn *conn, uint8_t err)
{
    char addr[BT_ADDR_LE_STR_LEN];
    
    bt_addr_le_to_str(bt_conn_get_dst(conn), addr, sizeof(addr));
    
    if (err) {
        LOG_ERR("❌ Connection FAILED to %s (error %u)", addr, err);
        LOG_INF("📱 Advertising will continue...");
        return;
    }
    
    LOG_INF("🔗 CLIENT CONNECTED!");
    LOG_INF("📱 Device Address: %s", addr);
    
    /* Request 2Mbps PHY for high throughput */
    int ret = bt_conn_le_phy_update(conn, BT_CONN_LE_PHY_PARAM_2M);
    if (ret) {
        LOG_WRN("⚠️ Failed to request 2M PHY: %d", ret);
    } else {
        LOG_INF("📡 Requested 2Mbps PHY for high throughput");
    }
    
    /* Request tight connection interval for low latency */
    struct bt_le_conn_param param = {
        .interval_min = 6,   // 7.5ms
        .interval_max = 8,   // 10ms  
        .latency = 0,        // No latency
        .timeout = 400,      // 4s timeout
    };
    
    ret = bt_conn_le_param_update(conn, &param);
    if (ret) {
        LOG_WRN("⚠️ Failed to request connection params: %d", ret);
    } else {
        LOG_INF("⚡ Requested tight connection interval (7.5-10ms)");
    }
    
    LOG_INF("💡 Next step: Enable notifications on Audio Data characteristic");
    LOG_INF("🎤 High-performance 16kHz audio streaming ready!");
}

static void disconnected(struct bt_conn *conn, uint8_t reason)
{
    char addr[BT_ADDR_LE_STR_LEN];
    
    bt_addr_le_to_str(bt_conn_get_dst(conn), addr, sizeof(addr));
    LOG_INF("📱 CLIENT DISCONNECTED");
    LOG_INF("Device: %s (reason: 0x%02x)", addr, reason);
    
    /* Stop streaming when disconnected */
    stop_mic_streaming();
    LOG_INF("🔇 Microphone streaming stopped");
    LOG_INF("📡 Advertising will resume for new connections");
}

BT_CONN_CB_DEFINE(conn_callbacks) = {
    .connected = connected,
    .disconnected = disconnected,
};

static int start_advertising(void)
{
    int err;
    
    LOG_INF("📡 Starting advertising...");
    
    struct bt_le_adv_param adv_param = BT_LE_ADV_PARAM_INIT(
        BT_LE_ADV_OPT_CONNECTABLE | BT_LE_ADV_OPT_USE_IDENTITY,
        BT_GAP_ADV_FAST_INT_MIN_2,  // 100ms
        BT_GAP_ADV_FAST_INT_MAX_2,  // 150ms  
        NULL);
    
    err = bt_le_adv_start(&adv_param, ad, ARRAY_SIZE(ad), sd, ARRAY_SIZE(sd));
    if (err) {
        LOG_ERR("❌ Advertising failed to start (err %d)", err);
        return err;
    }
    
    LOG_INF("✅ Advertising started successfully");
    return 0;
}

static int init_dmic(void)
{
    dmic_dev = DEVICE_DT_GET(DT_NODELABEL(dmic_dev));
    
    if (!device_is_ready(dmic_dev)) {
        LOG_ERR("❌ DMIC device %s is not ready", dmic_dev->name);
        return -ENODEV;
    }

    struct pcm_stream_cfg stream = {
        .pcm_width = SAMPLE_BIT_WIDTH,
        .mem_slab  = &mem_slab,
    };
    
    struct dmic_cfg cfg = {
        .io = {
            /* Configure PDM for proper 16-bit PCM output - use valid nRF52840 frequencies */
            .min_pdm_clk_freq = 1280000,  // 1.28 MHz (valid nRF52840 frequency)
            .max_pdm_clk_freq = 1280000,  // Fixed frequency  
            .min_pdm_clk_dc   = 50,       // 50% duty cycle
            .max_pdm_clk_dc   = 50,       // Fixed duty cycle
        },
        .streams = &stream,
        .channel = {
            .req_num_streams = 1,
        },
    };

    /* Configure for mono 16-bit PCM output */
    cfg.channel.req_num_chan = 1;
    cfg.channel.req_chan_map_lo = dmic_build_channel_map(0, 0, PDM_CHAN_LEFT);
    cfg.streams[0].pcm_rate = MAX_SAMPLE_RATE;
    cfg.streams[0].block_size = DMIC_BLOCK_SIZE;
    cfg.streams[0].pcm_width = SAMPLE_BIT_WIDTH;  // Explicitly set 16-bit

    LOG_INF("🎤 Configuring DMIC...");
    LOG_INF("PCM rate: %u Hz, channels: %u", cfg.streams[0].pcm_rate, cfg.channel.req_num_chan);
    LOG_INF("Block size: %u bytes", cfg.streams[0].block_size);

    int ret = dmic_configure(dmic_dev, &cfg);
    if (ret < 0) {
        LOG_ERR("❌ Failed to configure DMIC: %d", ret);
        return ret;
    }

    LOG_INF("✅ DMIC configured successfully");
    return 0;
}

static int start_dmic(void)
{
    if (dmic_started) {
        return 0;
    }
    
    int ret = dmic_trigger(dmic_dev, DMIC_TRIGGER_START);
    if (ret < 0) {
        LOG_ERR("❌ DMIC START trigger failed: %d", ret);
        return ret;
    }
    
    dmic_started = true;
    LOG_INF("✅ DMIC started successfully");
    return 0;
}

static void stop_dmic(void)
{
    if (!dmic_started) {
        return;
    }
    
    int ret = dmic_trigger(dmic_dev, DMIC_TRIGGER_STOP);
    if (ret < 0) {
        LOG_ERR("❌ DMIC STOP trigger failed: %d", ret);
        return;
    }
    
    dmic_started = false;
    LOG_INF("🛑 DMIC stopped");
}

/* DMIC capture thread - continuously fills ring buffer */
static void dmic_capture_thread(void *arg1, void *arg2, void *arg3)
{
    ARG_UNUSED(arg1);
    ARG_UNUSED(arg2);
    ARG_UNUSED(arg3);
    
    int block_counter = 0;
    
    LOG_INF("🎤 DMIC capture thread started");
    
    while (1) {
        /* Wait for streaming to be enabled */
        while (!is_streaming_active()) {
            k_msleep(100);
        }
        
        /* Start DMIC when streaming begins */
        if (!dmic_started) {
            if (start_dmic() != 0) {
                k_msleep(1000);
                continue;
            }
            LOG_INF("🚀 Started microphone capture for ring buffer");
        }
        
        void *buffer;
        uint32_t size;
        
        int ret = dmic_read(dmic_dev, 0, &buffer, &size, 10);  // Very short timeout
        if (ret < 0) {
            if (ret == -EAGAIN) {
                k_yield();  // Just yield CPU, no delay
            } else {
                LOG_ERR("❌ DMIC read failed: %d", ret);
                k_msleep(10);  // Minimal delay on real errors
            }
            
            if (!is_streaming_active() && dmic_started) {
                stop_dmic();
            }
            continue;
        }

        /* Process and write audio data to ring buffer */
        if (is_streaming_active()) {
            /* Treat buffer as array of int16_t samples (CORRECT approach) */
            int16_t *samples = (int16_t*)buffer;
            uint32_t sample_count = size / sizeof(int16_t);
            
            /* Debug first DMIC block to see what we're getting */
            if (block_counter == 0) {
                LOG_INF("🔍 First DMIC block debug (int16_t samples):");
                LOG_INF("   Buffer size: %u bytes", size);
                LOG_INF("   Sample count: %u", sample_count);
                for (uint32_t i = 0; i < 5 && i < sample_count; i++) {
                    LOG_INF("   Sample[%u] = %d", i, samples[i]);
                }
            }
            
            /* Write int16_t samples directly to sample-based ring buffer */
            ring_buffer_write_samples(samples, sample_count);
            
            /* Log stats every 100 blocks */
            if (block_counter % 100 == 0) {
                uint32_t used = ring_buffer_used_samples();
                LOG_INF("🔄 Ring buffer: %u/%u samples used (%u%%)", 
                    used, RING_BUFFER_SAMPLES, (used * 100) / RING_BUFFER_SAMPLES);
            }
        }

        /* Free buffer immediately */
        k_mem_slab_free(&mem_slab, buffer);
        block_counter++;
        
        /* Stop DMIC if streaming is no longer active */
        if (!is_streaming_active() && dmic_started) {
            stop_dmic();
            LOG_INF("🛑 Stopped microphone capture (streaming disabled)");
        }
    }
}

/* Audio timer for consistent 10ms packet timing */
static struct k_work_delayable audio_timer_work;
static uint32_t audio_packet_counter = 0;

static void audio_timer_handler(struct k_work *work)
{
    if (!is_streaming_active()) {
        return;
    }
    
    /* Pull exactly 160 samples (320 bytes) from ring buffer */
    int16_t sample_buffer[CHUNK_SAMPLES];
    uint32_t samples_read = ring_buffer_read_samples(sample_buffer, CHUNK_SAMPLES);
    
    if (samples_read == CHUNK_SAMPLES) {
        /* Send complete packet via BLE */
        int err = send_mic_audio_data((uint8_t*)sample_buffer, BYTES_PER_PKT);
        if (err == 0) {
            audio_packet_counter++;
            
            /* Debug first few packets */
            if (audio_packet_counter <= 3) {
                LOG_INF("📦 Timer packet %u: %d samples, first sample = %d", 
                    audio_packet_counter, samples_read, sample_buffer[0]);
            }
            
            /* Log every 100 packets */
            if (audio_packet_counter % 100 == 0) {
                uint32_t buffer_used = ring_buffer_used_samples();
                LOG_INF("📡 Sent %u packets, ring buffer: %u/%u samples", 
                    audio_packet_counter, buffer_used, RING_BUFFER_SAMPLES);
            }
        }
    } else if (samples_read > 0) {
        LOG_WRN("⚠️ Partial packet: %u samples (need %u)", samples_read, CHUNK_SAMPLES);
    }
    
    /* Schedule next packet in 10ms for 16kHz streaming */
    k_work_schedule(&audio_timer_work, K_MSEC(10));
}

/* BLE streaming thread - now just manages the timer */
static void ble_streaming_thread(void *arg1, void *arg2, void *arg3)
{
    ARG_UNUSED(arg1);
    ARG_UNUSED(arg2);
    ARG_UNUSED(arg3);
    
    LOG_INF("📡 BLE streaming thread started");
    
    /* Initialize audio timer */
    k_work_init_delayable(&audio_timer_work, audio_timer_handler);
    
    while (1) {
        /* Wait for streaming to be enabled */
        while (!is_streaming_active()) {
            k_msleep(100);
        }
        
        /* Start audio timer for consistent 10ms packets */
        if (!k_work_delayable_is_pending(&audio_timer_work)) {
            LOG_INF("⏰ Starting 10ms audio timer for 16kHz streaming");
            audio_packet_counter = 0;
            k_work_schedule(&audio_timer_work, K_MSEC(10));
        }
        
        /* Sleep while timer handles streaming */
        k_msleep(1000);
        
        /* Stop timer if streaming stopped */
        if (!is_streaming_active()) {
            k_work_cancel_delayable(&audio_timer_work);
            LOG_INF("⏰ Audio timer stopped");
        }
    }
}

/* Thread definitions */
#define DMIC_THREAD_STACK_SIZE 2048
#define DMIC_THREAD_PRIORITY 5
K_THREAD_DEFINE(dmic_tid, DMIC_THREAD_STACK_SIZE, dmic_capture_thread, NULL, NULL, NULL,
                DMIC_THREAD_PRIORITY, 0, 0);

#define BLE_THREAD_STACK_SIZE 2048  
#define BLE_THREAD_PRIORITY 6
K_THREAD_DEFINE(ble_tid, BLE_THREAD_STACK_SIZE, ble_streaming_thread, NULL, NULL, NULL,
                BLE_THREAD_PRIORITY, 0, 0);

int main(void)
{
    int err;
    
    LOG_INF("=== RING BUFFER MICROPHONE STREAMER ===");
    LOG_INF("Board: Xiao nRF52840 Sense");
    LOG_INF("Firmware: Continuous Ring Buffer Audio Streaming");
    LOG_INF("Sample Rate: 16kHz, Mono channel");
    LOG_INF("Ring Buffer: 8KB circular buffer");
    LOG_INF("BLE Packet Size: 20 bytes");
    
    /* Initialize Bluetooth */
    LOG_INF("Initializing Bluetooth...");
    err = bt_enable(NULL);
    if (err) {
        LOG_ERR("❌ Bluetooth init failed (err %d)", err);
        return err;
    }
    
    LOG_INF("✅ Bluetooth initialized successfully");
    
    /* Initialize DMIC */
    LOG_INF("Initializing DMIC...");
    err = init_dmic();
    if (err) {
        LOG_ERR("❌ DMIC init failed (err %d)", err);
        return err;
    }
    
    LOG_INF("✅ DMIC initialized successfully");
    
    /* Initialize custom audio service */
    LOG_INF("Initializing custom audio service...");
    err = custom_audio_service_init();
    if (err) {
        LOG_ERR("❌ Audio service init failed (err %d)", err);
        return err;
    }
    
    LOG_INF("✅ Custom audio service initialized");
    
    /* Initialize ring buffer mutex */
    k_mutex_init(&ring_mutex);
    LOG_INF("✅ Ring buffer initialized");
    
    /* Start advertising */
    LOG_INF("Starting Bluetooth advertising...");
    err = start_advertising();
    if (err) {
        LOG_ERR("❌ Failed to start advertising (err %d)", err);
        return err;
    }
    
    LOG_INF("✅ Advertising started successfully");
    LOG_INF("=== READY FOR CONNECTIONS ===");
    LOG_INF("Device Name: MicStreamer");
    LOG_INF("Instructions:");
    LOG_INF("1. Open nRF Connect app");
    LOG_INF("2. Connect to 'MicStreamer'");
    LOG_INF("3. Enable notifications on Audio Data characteristic");
    LOG_INF("4. Listen for continuous microphone audio data!");
    LOG_INF("5. DMIC capture thread fills ring buffer");
    LOG_INF("6. BLE streaming thread sends from ring buffer");
    LOG_INF("===============================");
    
    /* Main thread can now idle - audio processing happens in separate threads */
    while (1) {
        k_msleep(10000);  // Sleep for 10 seconds, let other threads work
    }
    
    return 0;
}