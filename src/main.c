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

/* Circular ring buffer for continuous audio streaming */
#define RING_BUFFER_SIZE 8192  // 8KB circular buffer
#define CHUNK_SIZE 20          // BLE packet size

static uint8_t ring_buffer[RING_BUFFER_SIZE];
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

/* Ring buffer functions */
static uint32_t ring_buffer_available_space(void)
{
    uint32_t w = write_pos;
    uint32_t r = read_pos;
    
    if (w >= r) {
        return RING_BUFFER_SIZE - (w - r) - 1;
    } else {
        return r - w - 1;
    }
}

static uint32_t ring_buffer_used_space(void)
{
    uint32_t w = write_pos;
    uint32_t r = read_pos;
    
    if (w >= r) {
        return w - r;
    } else {
        return RING_BUFFER_SIZE - (r - w);
    }
}

static void ring_buffer_write(const uint8_t *data, uint32_t len)
{
    k_mutex_lock(&ring_mutex, K_FOREVER);
    
    for (uint32_t i = 0; i < len; i++) {
        if (ring_buffer_available_space() > 0) {
            ring_buffer[write_pos] = data[i];
            write_pos = (write_pos + 1) % RING_BUFFER_SIZE;
        } else {
            /* Buffer full - drop oldest data by advancing read position */
            read_pos = (read_pos + 1) % RING_BUFFER_SIZE;
            ring_buffer[write_pos] = data[i];
            write_pos = (write_pos + 1) % RING_BUFFER_SIZE;
        }
    }
    
    k_mutex_unlock(&ring_mutex);
}

static uint32_t ring_buffer_read(uint8_t *data, uint32_t len)
{
    k_mutex_lock(&ring_mutex, K_FOREVER);
    
    uint32_t available = ring_buffer_used_space();
    uint32_t to_read = (len < available) ? len : available;
    
    for (uint32_t i = 0; i < to_read; i++) {
        data[i] = ring_buffer[read_pos];
        read_pos = (read_pos + 1) % RING_BUFFER_SIZE;
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
    LOG_INF("💡 Next step: Enable notifications on Audio Data characteristic");
    LOG_INF("🎤 Real microphone audio will stream when notifications enabled");
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
        .block_size = DMIC_BLOCK_SIZE,
        .pcm_rate = MAX_SAMPLE_RATE,
    };
    
    struct dmic_cfg cfg = {
        .io = {
            /* These fields can be used to limit the PDM clock
             * configurations that the driver is allowed to use
             * to those supported by the microphone.
             */
            .min_pdm_clk_freq = 1000000,
            .max_pdm_clk_freq = 3500000,
            .min_pdm_clk_dc   = 40,
            .max_pdm_clk_dc   = 60,
        },
        .streams = &stream,
        .channel = {
            .req_num_streams = 1,
        },
    };

    /* Configure for mono to simplify processing */
    cfg.channel.req_num_chan = 1;
    cfg.channel.req_chan_map_lo = dmic_build_channel_map(0, 0, PDM_CHAN_LEFT);

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
        
        int ret = dmic_read(dmic_dev, 0, &buffer, &size, 100);  // Shorter timeout
        if (ret < 0) {
            if (ret == -EAGAIN) {
                k_msleep(5);  // Short wait when no data
            } else {
                LOG_ERR("❌ DMIC read failed: %d", ret);
                k_msleep(50);
            }
            
            if (!is_streaming_active() && dmic_started) {
                stop_dmic();
            }
            continue;
        }

        /* Write audio data to ring buffer */
        if (is_streaming_active()) {
            ring_buffer_write((uint8_t*)buffer, size);
            
            /* Log stats every 100 blocks */
            if (block_counter % 100 == 0) {
                uint32_t used = ring_buffer_used_space();
                LOG_INF("🔄 Ring buffer: %u/%u bytes used (%u%%)", 
                    used, RING_BUFFER_SIZE, (used * 100) / RING_BUFFER_SIZE);
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

/* BLE streaming thread - reads from ring buffer and sends via BLE */
static void ble_streaming_thread(void *arg1, void *arg2, void *arg3)
{
    ARG_UNUSED(arg1);
    ARG_UNUSED(arg2);
    ARG_UNUSED(arg3);
    
    uint8_t chunk_buffer[CHUNK_SIZE];
    uint32_t packet_counter = 0;
    
    LOG_INF("📡 BLE streaming thread started");
    
    while (1) {
        /* Wait for streaming to be enabled */
        while (!is_streaming_active()) {
            k_msleep(100);
        }
        
        /* Read chunk from ring buffer */
        uint32_t bytes_read = ring_buffer_read(chunk_buffer, CHUNK_SIZE);
        
        if (bytes_read > 0) {
            /* Send via BLE */
            int err = send_mic_audio_data(chunk_buffer, bytes_read);
            if (err == 0) {
                packet_counter++;
            }
            
            /* Small delay to pace BLE transmissions */
            k_msleep(10);  // 10ms between packets = ~100 packets/sec
        } else {
            /* No data in ring buffer, wait a bit */
            k_msleep(5);
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