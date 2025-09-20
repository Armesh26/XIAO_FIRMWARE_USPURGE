# Xiao nRF52840 Sense BLE Audio Streaming Firmware

Custom Bluetooth Low Energy audio streaming firmware for the Seeed Studio Xiao nRF52840 Sense board, streaming a 440Hz sine wave over BLE using Nordic Connect SDK.

## 🎵 Features

- **Custom BLE Audio Service** - Streams audio data via GATT characteristic notifications
- **440Hz Sine Wave Generation** - Pure A4 note generated using integer-based lookup table
- **Real-time Streaming** - 8kHz sample rate, 10 samples per packet, 20ms intervals
- **Comprehensive Debugging** - Detailed serial output for monitoring and troubleshooting
- **Optimized for Xiao nRF52840** - Memory and performance optimized for the hardware
- **Fixed BLE Connection Issues** - Proper advertising and scan response handling

## 🛠 Hardware Requirements

- **Seeed Studio Xiao nRF52840 Sense** board
- USB-C cable for programming and power
- Mobile device with **nRF Connect** app for testing

## 📋 Software Requirements

- **Nordic Connect SDK v3.1.1** or compatible
- **nRF Command Line Tools**
- **VS Code with nRF Connect extension** (recommended)

## 🏗 Project Structure

```
├── src/
│   ├── main.c                    # Main application and BLE setup
│   ├── custom_audio_service.c    # Audio streaming service implementation
│   └── custom_audio_service.h    # Service header and definitions
├── CMakeLists.txt               # Build configuration
├── prj.conf                     # Project configuration
└── README.md                    # This file
```

## 🔧 Building and Flashing

### Build the Firmware
```bash
west build -b xiao_ble/nrf52840/sense
```

### Flash via UF2 Bootloader
1. **Double-click reset button** on Xiao board to enter bootloader mode
2. Board appears as **XIAO-SENSE** USB drive
3. **Copy the UF2 file**:
   ```bash
   cp build/zephyr/zephyr.uf2 /Volumes/XIAO-SENSE/
   ```
4. Board automatically reboots and runs the firmware

## 📱 Testing with nRF Connect App

1. **Install nRF Connect for Mobile** on your smartphone
2. **Scan for devices** - look for "AudioStreamer"
3. **Connect** to the device
4. **Find Custom Audio Service** (UUID: `12345678-1234-5678-1234-567812345678`)
5. **Locate Audio Data Characteristic** (UUID: `12345679-1234-5678-1234-567812345678`)
6. **Enable notifications** - audio streaming starts automatically
7. **Monitor audio data** - 16-bit signed PCM samples at 8kHz

## 🐛 Serial Debugging

Connect to serial output at **115200 baud**:
```bash
screen /dev/cu.usbmodem1101 115200
```

### Expected Output
```
=== AUDIO STREAMER STARTING ===
Board: Xiao nRF52840 Sense
Firmware: Custom Audio Streaming with 440Hz Sine Wave
Sample Rate: 8kHz, Samples per packet: 10
✅ Bluetooth initialized successfully
✅ Custom audio service initialized
✅ Advertising started successfully
=== READY FOR CONNECTIONS ===
```

When a client connects and enables notifications:
```
🔗 CLIENT CONNECTED!
📱 Device Address: XX:XX:XX:XX:XX:XX
🔔 NOTIFICATION STATUS CHANGED
🎵 STARTING AUDIO STREAMING!
📦 Sent 100 audio packets (errors: 0)
```

## ⚙️ Configuration

### Audio Parameters
- **Frequency**: 440Hz (A4 note)
- **Sample Rate**: 8kHz
- **Amplitude**: 16383 (reduced for stability)
- **Samples per Packet**: 10
- **Packet Interval**: 20ms

### BLE Configuration
- **Device Name**: "AudioStreamer"
- **MTU Size**: 65 bytes
- **Connection Interval**: 100-150ms
- **Data Length**: 27 bytes (hardware limit)

## 🔧 Technical Implementation

### Sine Wave Generation
- **Integer-based lookup table** (16 entries) for performance
- **Phase accumulator** instead of floating-point math
- **No FPU dependency** - runs on any ARM Cortex-M4

### BLE Service Structure
- **Primary Service**: Custom Audio Service
- **Characteristic**: Audio Data with notify and write properties
- **CCC Descriptor**: Client Characteristic Configuration for notifications

### Memory Usage
- **Flash**: ~186KB (23% of 788KB)
- **RAM**: ~47KB (18% of 256KB)
- **Stack Sizes**: Main 4KB, System Work Queue 4KB, BT RX 2KB

## 🚨 Troubleshooting

### Connection Issues
- Ensure proper BLE advertising parameters
- Check scan response data format
- Verify client has location permissions (Android)

### Audio Streaming Issues
- Monitor packet success rate in serial output
- Check MTU size compatibility
- Verify notification enable sequence

### Build Issues
- Ensure Nordic Connect SDK v3.1.1+ is installed
- Check board target: `xiao_ble/nrf52840/sense`
- Verify all dependencies are available

## 📚 References

- [Nordic Connect SDK Documentation](https://developer.nordicsemi.com/nRF_Connect_SDK/)
- [Seeed Studio Xiao nRF52840 Sense](https://wiki.seeedstudio.com/XIAO_BLE/)
- [nRF Connect for Mobile](https://www.nordicsemi.com/Products/Development-tools/nrf-connect-for-mobile)

## 📄 License

This project is open source. Feel free to modify and distribute according to your needs.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues, feature requests, or pull requests.

---

**Created for Xiao nRF52840 Sense BLE Audio Streaming**  
*Real-time 440Hz sine wave streaming over Bluetooth Low Energy*
