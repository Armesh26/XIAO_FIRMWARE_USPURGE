#include "custom_audio_service.h"
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <math.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

LOG_MODULE_REGISTER(custom_audio_service, LOG_LEVEL_INF);

static bool notify_enabled = false;
static bool streaming_active = false;
static uint32_t packet_count = 0;
static uint32_t error_count = 0;

/* Audio data write callback */
static ssize_t data_write_cb(struct bt_conn *conn,
                           const struct bt_gatt_attr *attr,
                           const void *buf, uint16_t len,
                           uint16_t offset, uint8_t flags)
{
    LOG_INF("Audio data write received: %d bytes", len);
    return len;
}

/* CCC changed callback */
static void ccc_cfg_changed(const struct bt_gatt_attr *attr, uint16_t value)
{
    notify_enabled = (value == BT_GATT_CCC_NOTIFY);
    
    LOG_INF("🔔 NOTIFICATION STATUS CHANGED");
    LOG_INF("Value: 0x%04x (%s)", value, notify_enabled ? "ENABLED" : "DISABLED");
    
    if (notify_enabled) {
        LOG_INF("🎵 STARTING MICROPHONE STREAMING!");
        LOG_INF("📈 Sample Rate: 16kHz");
        LOG_INF("📦 Streaming real microphone audio");
        start_mic_streaming();
    } else {
        LOG_INF("🔇 STOPPING MICROPHONE STREAMING");
        stop_mic_streaming();
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

/* Send microphone audio data via BLE */
int send_mic_audio_data(const uint8_t *data, uint16_t len)
{
    if (!notify_enabled || !streaming_active) {
        return -ENOTCONN;
    }
    
    int err = bt_gatt_notify(NULL, &audio_svc.attrs[1], data, len);
    if (err) {
        error_count++;
        if (error_count % 10 == 0) {  // Log every 10 errors to avoid spam
            LOG_ERR("❌ Audio packet FAILED: %d (total errors: %u)", err, error_count);
        }
    } else {
        packet_count++;
        /* Log every 200 packets to avoid spam */
        if (packet_count % 200 == 0) {
            LOG_INF("📦 Sent %u mic audio packets (errors: %u)", packet_count, error_count);
            if (packet_count > 0) {
                uint32_t success_rate = (packet_count - error_count) * 100 / packet_count;
                LOG_INF("📈 Success rate: %u%%", success_rate);
            }
        }
    }
    
    return err;
}

int custom_audio_service_init(void)
{
    LOG_INF("🎵 CUSTOM AUDIO SERVICE INITIALIZED");
    LOG_INF("📋 Service UUID: 12345678-1234-5678-1234-567812345678");
    LOG_INF("📋 Audio Data Char UUID: 12345679-1234-5678-1234-567812345678");
    LOG_INF("⚙️  Ready for microphone audio streaming");
    
    return 0;
}

int audio_data_send(const uint8_t *data, uint16_t len)
{
    if (!notify_enabled) {
        return -ENOTCONN;
    }
    
    return bt_gatt_notify(NULL, &audio_svc.attrs[1], data, len);
}

void start_mic_streaming(void)
{
    if (streaming_active) {
        LOG_WRN("⚠️  Streaming already active");
        return;
    }
    
    streaming_active = true;
    packet_count = 0;  // Reset counters
    error_count = 0;
    
    LOG_INF("🚀 MICROPHONE STREAMING STARTED!");
    LOG_INF("📊 Counters reset, ready for mic data");
}

void stop_mic_streaming(void)
{
    if (!streaming_active) {
        LOG_WRN("⚠️  Streaming already stopped");
        return;
    }
    
    streaming_active = false;
    
    LOG_INF("🛑 MICROPHONE STREAMING STOPPED");
    LOG_INF("📊 Final stats - Packets sent: %u, Errors: %u", packet_count, error_count);
    if (packet_count > 0) {
        uint32_t success_rate = (packet_count - error_count) * 100 / packet_count;
        LOG_INF("📈 Success rate: %u%%", success_rate);
    }
}

bool is_streaming_active(void)
{
    return streaming_active && notify_enabled;
}
