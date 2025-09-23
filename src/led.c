#include "led.h"
#include <zephyr/drivers/gpio.h>
#include <zephyr/logging/log.h>

LOG_MODULE_REGISTER(led, LOG_LEVEL_INF);

int led_init(void)
{
    if (!gpio_is_ready_dt(&led)) {
        LOG_ERR("LED GPIO device is not ready");
        return -ENODEV;
    }

    int ret = gpio_pin_configure_dt(&led, GPIO_OUTPUT_INACTIVE);
    if (ret < 0) {
        LOG_ERR("Failed to configure LED GPIO: %d", ret);
        return ret;
    }

    LOG_INF("LED initialized successfully");
    return 0;
}

void led_set_connected(bool connected)
{
    if (connected) {
        LOG_INF("🔗 LED: Connection indicator ON");
        gpio_pin_set_dt(&led, 1);  // Turn on LED (active-low, so 1 = on)
    } else {
        LOG_INF("📱 LED: Connection indicator OFF");
        gpio_pin_set_dt(&led, 0);  // Turn off LED (active-low, so 0 = off)
    }
}

void led_set_on(bool on)
{
    gpio_pin_set_dt(&led, on ? 1 : 0);
}

void led_toggle(void)
{
    gpio_pin_toggle_dt(&led);
}
