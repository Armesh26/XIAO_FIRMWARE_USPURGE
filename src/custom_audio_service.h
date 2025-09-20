#ifndef CUSTOM_AUDIO_SERVICE_H
#define CUSTOM_AUDIO_SERVICE_H

#include <zephyr/bluetooth/bluetooth.h>
#include <zephyr/bluetooth/gatt.h>
#include <zephyr/bluetooth/uuid.h>

/* Custom Audio Service UUID */
#define BT_UUID_CUSTOM_AUDIO_SERVICE_VAL \
    BT_UUID_128_ENCODE(0x12345678, 0x1234, 0x5678, 0x1234, 0x567812345678)

#define BT_UUID_CUSTOM_AUDIO_SERVICE \
    BT_UUID_DECLARE_128(BT_UUID_CUSTOM_AUDIO_SERVICE_VAL)

/* Audio Data Characteristic UUID */
#define BT_UUID_AUDIO_DATA_CHAR_VAL \
    BT_UUID_128_ENCODE(0x12345679, 0x1234, 0x5678, 0x1234, 0x567812345678)

#define BT_UUID_AUDIO_DATA_CHAR \
    BT_UUID_DECLARE_128(BT_UUID_AUDIO_DATA_CHAR_VAL)

/* Function declarations */
int custom_audio_service_init(void);
int audio_data_send(const uint8_t *data, uint16_t len);
void start_sine_wave_streaming(void);
void stop_sine_wave_streaming(void);

#endif /* CUSTOM_AUDIO_SERVICE_H */
