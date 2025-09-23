#pragma once

#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>

/* LED GPIO configuration */
static const struct gpio_dt_spec led = GPIO_DT_SPEC_GET(DT_ALIAS(led0), gpios);

/* LED control functions */
int led_init(void);
void led_set_connected(bool connected);
void led_set_on(bool on);
void led_toggle(void);
