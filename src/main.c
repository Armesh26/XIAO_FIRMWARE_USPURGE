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

/* Size of a block for 100 ms of audio data. */
#define BLOCK_SIZE(_sample_rate, _number_of_channels) \
        (BYTES_PER_SAMPLE * (_sample_rate / 10) * _number_of_channels)

/* Driver will allocate blocks from this slab to receive audio data into them.
 * Application, after getting a given block from the driver and processing its
 * data, needs to free that block.
 */
#define MAX_BLOCK_SIZE   BLOCK_SIZE(MAX_SAMPLE_RATE, 2)
#define BLOCK_COUNT      4
K_MEM_SLAB_DEFINE_STATIC(mem_slab, MAX_BLOCK_SIZE, BLOCK_COUNT, 4);

static const struct device *dmic_dev;
static struct k_thread audio_thread;
static K_THREAD_STACK_DEFINE(audio_stack, 4096);
static bool audio_streaming_enabled = false;

/* Functions called by audio service */
void enable_microphone_streaming(void)
{
    audio_streaming_enabled = true;
    LOG_INF("🎤 Microphone streaming ENABLED");
}

void disable_microphone_streaming(void)
{
    audio_streaming_enabled = false;
    LOG_INF("🎤 Microphone streaming DISABLED");
}

/* Advertising data */
static const struct bt_data ad[] = {
    BT_DATA_BYTES(BT_DATA_FLAGS, (BT_LE_AD_GENERAL | BT_LE_AD_NO_BREDR)),
    BT_DATA_BYTES(BT_DATA_UUID128_ALL, BT_UUID_CUSTOM_AUDIO_SERVICE_VAL),
};

/* Scan response data - FIXED */
static const struct bt_data sd[] = {
    BT_DATA(BT_DATA_NAME_COMPLETE, "AudioStreamer", sizeof("AudioStreamer") - 1),
};

/* Audio streaming thread function */
static void audio_streaming_thread(void *p1, void *p2, void *p3)
{
    int ret;
    int block_counter = 0;
    
    LOG_INF("🎤 Audio streaming thread started");
    
    while (1) {
        if (!audio_streaming_enabled) {
            k_msleep(100);
            continue;
        }
        
        void *buffer;
        uint32_t size;
        
        ret = dmic_read(dmic_dev, 0, &buffer, &size, READ_TIMEOUT);
        if (ret < 0) {
            LOG_ERR("🎤 DMIC read failed: %d", ret);
            k_msleep(10);
            continue;
        }
        
        /* Process audio data */
        int16_t *samples = (int16_t *)buffer;
        uint32_t sample_count = size / sizeof(int16_t);
        
        /* Calculate audio levels for monitoring */
        int16_t max_amplitude = 0;
        int32_t sum_squares = 0;
        
        for (uint32_t j = 0; j < sample_count; j++) {
            int16_t sample = samples[j];
            int16_t abs_sample = (sample < 0) ? -sample : sample;
            
            if (abs_sample > max_amplitude) {
                max_amplitude = abs_sample;
            }
            sum_squares += (int32_t)sample * sample;
        }
        
        /* Calculate RMS amplitude */
        uint32_t rms = 0;
        if (sample_count > 0) {
            rms = (uint32_t)sqrt(sum_squares / sample_count);
        }
        
        /* Send audio data via BLE in chunks */
        const int samples_per_packet = 10; // Match BLE MTU limitations
        int16_t *current_samples = samples;
        uint32_t remaining_samples = sample_count;
        
        while (remaining_samples > 0 && audio_streaming_enabled) {
            uint32_t chunk_size = (remaining_samples > samples_per_packet) ? 
                                 samples_per_packet : remaining_samples;
            
            ret = audio_data_send((uint8_t*)current_samples, 
                                 chunk_size * sizeof(int16_t));
            if (ret < 0) {
                LOG_ERR("🔇 BLE audio send failed: %d", ret);
                break;
            }
            
            current_samples += chunk_size;
            remaining_samples -= chunk_size;
            
            /* Small delay between packets to avoid overwhelming BLE */
            k_msleep(5);
        }
        
        /* Log audio levels every 50 blocks */
        if (block_counter % 50 == 0) {
            LOG_INF("🎤 Block %d - Max: %d, RMS: %u, Samples: %u", 
                   block_counter, max_amplitude, rms, sample_count);
        }
        
        /* Free buffer immediately */
        k_mem_slab_free(&mem_slab, buffer);
        block_counter++;
    }
}

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
    audio_streaming_enabled = false;
    stop_sine_wave_streaming(); // This will handle the BLE notification state
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

int main(void)
{
    int ret;
    
    LOG_INF("=== MICROPHONE AUDIO STREAMER STARTING ===");
    LOG_INF("Board: Xiao nRF52840 Sense");
    LOG_INF("Firmware: Real-time Microphone Audio Streaming over BLE");
    LOG_INF("Sample Rate: 16kHz, Stereo, 16-bit PCM");
    
    /* Initialize DMIC */
    LOG_INF("🎤 Initializing DMIC...");
    dmic_dev = DEVICE_DT_GET(DT_NODELABEL(dmic_dev));
    if (!device_is_ready(dmic_dev)) {
        LOG_ERR("❌ DMIC device %s is not ready", dmic_dev->name);
        return -1;
    }
    
    struct pcm_stream_cfg stream = {
        .pcm_width = SAMPLE_BIT_WIDTH,
        .mem_slab  = &mem_slab,
    };
    
    struct dmic_cfg cfg = {
        .io = {
            /* PDM clock configuration for microphone */
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
    
    /* Configure for stereo continuous monitoring */
    cfg.channel.req_num_chan = 2;
    cfg.channel.req_chan_map_lo =
        dmic_build_channel_map(0, 0, PDM_CHAN_LEFT) |
        dmic_build_channel_map(1, 0, PDM_CHAN_RIGHT);
    cfg.streams[0].pcm_rate = MAX_SAMPLE_RATE;
    cfg.streams[0].block_size =
        BLOCK_SIZE(cfg.streams[0].pcm_rate, cfg.channel.req_num_chan);
    
    ret = dmic_configure(dmic_dev, &cfg);
    if (ret < 0) {
        LOG_ERR("❌ Failed to configure DMIC: %d", ret);
        return ret;
    }
    
    ret = dmic_trigger(dmic_dev, DMIC_TRIGGER_START);
    if (ret < 0) {
        LOG_ERR("❌ DMIC START trigger failed: %d", ret);
        return ret;
    }
    
    LOG_INF("✅ DMIC initialized and started");
    LOG_INF("📊 PCM output rate: %u Hz, channels: %u", 
           cfg.streams[0].pcm_rate, cfg.channel.req_num_chan);
    
    /* Initialize Bluetooth */
    LOG_INF("📡 Initializing Bluetooth...");
    ret = bt_enable(NULL);
    if (ret) {
        LOG_ERR("❌ Bluetooth init failed (err %d)", ret);
        return ret;
    }
    
    LOG_INF("✅ Bluetooth initialized successfully");
    
    /* Initialize custom audio service */
    LOG_INF("🎵 Initializing custom audio service...");
    ret = custom_audio_service_init();
    if (ret) {
        LOG_ERR("❌ Audio service init failed (err %d)", ret);
        return ret;
    }
    
    LOG_INF("✅ Custom audio service initialized");
    
    /* Start advertising */
    LOG_INF("📡 Starting Bluetooth advertising...");
    ret = start_advertising();
    if (ret) {
        LOG_ERR("❌ Failed to start advertising (err %d)", ret);
        return ret;
    }
    
    LOG_INF("✅ Advertising started successfully");
    
    /* Start audio streaming thread */
    LOG_INF("🎤 Starting audio streaming thread...");
    k_thread_create(&audio_thread, audio_stack,
                   K_THREAD_STACK_SIZEOF(audio_stack),
                   audio_streaming_thread, NULL, NULL, NULL,
                   K_PRIO_PREEMPT(7), 0, K_NO_WAIT);
    k_thread_name_set(&audio_thread, "audio_stream");
    
    LOG_INF("✅ Audio streaming thread started");
    LOG_INF("=== READY FOR CONNECTIONS ===");
    LOG_INF("Device Name: AudioStreamer");
    LOG_INF("Instructions:");
    LOG_INF("1. Open nRF Connect app");
    LOG_INF("2. Connect to 'AudioStreamer'");
    LOG_INF("3. Enable notifications on Audio Data characteristic");
    LOG_INF("4. Listen for REAL microphone audio data!");
    LOG_INF("===============================");
    
    return 0;
}
