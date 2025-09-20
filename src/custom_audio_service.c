#include "custom_audio_service.h"
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <math.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

LOG_MODULE_REGISTER(custom_audio_service, LOG_LEVEL_INF);

static bool notify_enabled = false;
static struct k_work_delayable sine_work;
static bool streaming_active = false;
static uint32_t packet_count = 0;
static uint32_t error_count = 0;

/* Sine wave parameters */
#define SAMPLE_RATE 8000
#define FREQUENCY 440  // A4 note
#define AMPLITUDE 16383  // Reduced amplitude
#define SAMPLES_PER_PACKET 10
#define SINE_WORK_INTERVAL_MS 20  // Slower rate to reduce load

static uint32_t phase_accumulator = 0;
static const uint32_t phase_increment = (uint32_t)((uint64_t)FREQUENCY * 0xFFFFFFFF / SAMPLE_RATE);

/* Audio data write callback */
static ssize_t data_write_cb(struct bt_conn *conn,
                           const struct bt_gatt_attr *attr,
                           const void *buf, uint16_t len,
                           uint16_t offset, uint8_t flags)
{
    LOG_INF("Audio data write received: %d bytes", len);
    return len;
}

/* External function to enable microphone streaming */
extern void enable_microphone_streaming(void);
extern void disable_microphone_streaming(void);

/* CCC changed callback */
static void ccc_cfg_changed(const struct bt_gatt_attr *attr, uint16_t value)
{
    notify_enabled = (value == BT_GATT_CCC_NOTIFY);
    
    LOG_INF("🔔 NOTIFICATION STATUS CHANGED");
    LOG_INF("Value: 0x%04x (%s)", value, notify_enabled ? "ENABLED" : "DISABLED");
    
    if (notify_enabled) {
        LOG_INF("🎤 STARTING MICROPHONE STREAMING!");
        LOG_INF("📊 Source: Real microphone audio");
        LOG_INF("📈 Sample Rate: 16kHz Stereo");
        LOG_INF("📦 Format: 16-bit PCM");
        LOG_INF("⏱️  Real-time streaming via BLE");
        enable_microphone_streaming();
    } else {
        LOG_INF("🔇 STOPPING MICROPHONE STREAMING");
        disable_microphone_streaming();
    }
}

/* GATT service definition */
BT_GATT_SERVICE_DEFINE(audio_svc,
    BT_GATT_PRIMARY_SERVICE(BT_UUID_CUSTOM_AUDIO_SERVICE),
    BT_GATT_CHARACTERISTIC(BT_UUID_AUDIO_DATA_CHAR,
        BT_GATT_CHRC_NOTIFY | BT_GATT_CHRC_WRITE_WITHOUT_RESP,
        BT_GATT_PERM_WRITE | BT_GATT_PERM_READ,
        NULL, data_write_cb, NULL),
    BT_GATT_CCC(ccc_cfg_changed, BT_GATT_PERM_READ | BT_GATT_PERM_WRITE),
);

/* Simple sine wave lookup table (16 entries) */
static const int16_t sine_table[16] = {
    0, 12539, 23170, 30273, 32767, 30273, 23170, 12539,
    0, -12539, -23170, -30273, -32767, -30273, -23170, -12539
};

/* Generate sine wave samples using lookup table */
static void generate_sine_wave_samples(int16_t *samples, int count)
{
    for (int i = 0; i < count; i++) {
        // Use upper 4 bits of phase accumulator as table index
        uint8_t index = (phase_accumulator >> 28) & 0x0F;
        samples[i] = (sine_table[index] * AMPLITUDE) >> 15;
        phase_accumulator += phase_increment;
    }
}

/* Sine wave streaming work handler */
static void sine_work_handler(struct k_work *work)
{
    if (!streaming_active || !notify_enabled) {
        return;
    }
    
    int16_t samples[SAMPLES_PER_PACKET];
    generate_sine_wave_samples(samples, SAMPLES_PER_PACKET);
    
    int err = bt_gatt_notify(NULL, &audio_svc.attrs[1], 
                           samples, sizeof(samples));
    if (err) {
        error_count++;
        LOG_ERR("❌ Audio packet FAILED: %d (errors: %u)", err, error_count);
    } else {
        packet_count++;
        /* Log every 100 packets to avoid spam */
        if (packet_count % 100 == 0) {
            LOG_INF("📦 Sent %u audio packets (errors: %u)", packet_count, error_count);
            LOG_INF("🎵 Streaming 440Hz sine wave - %u samples/sec", 
                    SAMPLES_PER_PACKET * 1000 / SINE_WORK_INTERVAL_MS);
        }
    }
    
    /* Schedule next transmission */
    k_work_schedule(&sine_work, K_MSEC(SINE_WORK_INTERVAL_MS));
}

int custom_audio_service_init(void)
{
    k_work_init_delayable(&sine_work, sine_work_handler);
    
    LOG_INF("🎵 CUSTOM AUDIO SERVICE INITIALIZED");
    LOG_INF("📋 Service UUID: 12345678-1234-5678-1234-567812345678");
    LOG_INF("📋 Audio Data Char UUID: 12345679-1234-5678-1234-567812345678");
    LOG_INF("⚙️  Ready for GATT operations");
    
    return 0;
}

int audio_data_send(const uint8_t *data, uint16_t len)
{
    if (!notify_enabled) {
        return -ENOTCONN;
    }
    
    return bt_gatt_notify(NULL, &audio_svc.attrs[1], data, len);
}

void start_sine_wave_streaming(void)
{
    if (streaming_active) {
        LOG_WRN("⚠️  Streaming already active");
        return;
    }
    
    streaming_active = true;
    phase_accumulator = 0;  // Reset phase
    packet_count = 0;  // Reset counters
    error_count = 0;
    
    k_work_schedule(&sine_work, K_MSEC(SINE_WORK_INTERVAL_MS));
    LOG_INF("🚀 SINE WAVE STREAMING STARTED!");
    LOG_INF("📊 Phase reset, counters reset");
}

void stop_sine_wave_streaming(void)
{
    if (!streaming_active) {
        LOG_WRN("⚠️  Streaming already stopped");
        return;
    }
    
    streaming_active = false;
    k_work_cancel_delayable(&sine_work);
    
    LOG_INF("🛑 SINE WAVE STREAMING STOPPED");
    LOG_INF("📊 Final stats - Packets sent: %u, Errors: %u", packet_count, error_count);
    if (packet_count > 0) {
        LOG_INF("📈 Success rate: %u.%u%%", 
                (packet_count - error_count) * 100 / packet_count,
                ((packet_count - error_count) * 1000 / packet_count) % 10);
    }
}
