#include <zephyr/kernel.h>
#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/gap.h>
#include <zephyr/bluetooth/gatt.h>
#include <zephyr/logging/log.h>
#include "custom_audio_service.h"

LOG_MODULE_REGISTER(main, LOG_LEVEL_INF);

/* Advertising data */
static const struct bt_data ad[] = {
    BT_DATA_BYTES(BT_DATA_FLAGS, (BT_LE_AD_GENERAL | BT_LE_AD_NO_BREDR)),
    BT_DATA_BYTES(BT_DATA_UUID128_ALL, BT_UUID_CUSTOM_AUDIO_SERVICE_VAL),
};

/* Scan response data - FIXED */
static const struct bt_data sd[] = {
    BT_DATA(BT_DATA_NAME_COMPLETE, "AudioStreamer", sizeof("AudioStreamer") - 1),
};

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
    LOG_INF("🎵 Audio streaming will start automatically when notifications enabled");
}

static void disconnected(struct bt_conn *conn, uint8_t reason)
{
    char addr[BT_ADDR_LE_STR_LEN];
    
    bt_addr_le_to_str(bt_conn_get_dst(conn), addr, sizeof(addr));
    LOG_INF("📱 CLIENT DISCONNECTED");
    LOG_INF("Device: %s (reason: 0x%02x)", addr, reason);
    
    /* Stop streaming when disconnected */
    stop_sine_wave_streaming();
    LOG_INF("🔇 Audio streaming stopped");
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
    int err;
    
    LOG_INF("=== AUDIO STREAMER STARTING ===");
    LOG_INF("Board: Xiao nRF52840 Sense");
    LOG_INF("Firmware: Custom Audio Streaming with 440Hz Sine Wave");
    LOG_INF("Sample Rate: 8kHz, Samples per packet: 10");
    
    /* Initialize Bluetooth */
    LOG_INF("Initializing Bluetooth...");
    err = bt_enable(NULL);
    if (err) {
        LOG_ERR("Bluetooth init failed (err %d)", err);
        return err;
    }
    
    LOG_INF("✅ Bluetooth initialized successfully");
    
    /* Initialize custom audio service */
    LOG_INF("Initializing custom audio service...");
    err = custom_audio_service_init();
    if (err) {
        LOG_ERR("Audio service init failed (err %d)", err);
        return err;
    }
    
    LOG_INF("✅ Custom audio service initialized");
    
    /* Start advertising */
    LOG_INF("Starting Bluetooth advertising...");
    err = start_advertising();
    if (err) {
        LOG_ERR("Failed to start advertising (err %d)", err);
        return err;
    }
    
    LOG_INF("✅ Advertising started successfully");
    LOG_INF("=== READY FOR CONNECTIONS ===");
    LOG_INF("Device Name: AudioStreamer");
    LOG_INF("Instructions:");
    LOG_INF("1. Open nRF Connect app");
    LOG_INF("2. Connect to 'AudioStreamer'");
    LOG_INF("3. Enable notifications on Audio Data characteristic");
    LOG_INF("4. Listen for 440Hz sine wave audio data!");
    LOG_INF("===============================");
    
    return 0;
}
