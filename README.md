# 🎤 XIAO Audio Transcriber

A complete BLE audio streaming and transcription system using the **Seeed Studio XIAO nRF52840 Sense** board with real-time speech-to-text capabilities.

## 🌟 Features

### 🔧 Firmware (XIAO Board)
- **Real-time Audio Capture** - 16kHz microphone streaming via BLE
- **Custom BLE Audio Service** - Optimized for continuous audio streaming
- **Professional Audio Quality** - 16-bit PCM, mono channel
- **Continuous Streaming** - 160 samples per packet, 10ms intervals
- **Comprehensive Debugging** - Detailed serial output and monitoring

### 📱 React Web App
- **BLE Audio Recording** - Capture audio directly from XIAO board
- **Live Transcription** - Real-time speech-to-text using Deepgram
- **Audio Playback** - Play recorded audio with proper audio context
- **Modern UI** - Beautiful, responsive interface with real-time status
- **Cross-platform** - Works on desktop and mobile browsers

## 🛠 Hardware Requirements

- **Seeed Studio XIAO nRF52840 Sense** board
- USB-C cable for programming and power
- Computer with Bluetooth capability
- Web browser with Web Bluetooth support (Chrome/Edge recommended)

## 📋 Software Requirements

### For Firmware Development
- **Nordic Connect SDK v3.1.1** or compatible
- **nRF Command Line Tools**
- **VS Code with nRF Connect extension** (recommended)

### For React App
- **Node.js** (v14 or higher)
- **npm** package manager
- **Modern web browser** with Web Bluetooth support

## 🏗 Project Structure

```
├── src/                              # Firmware source code
│   ├── main.c                        # Main application and BLE setup
│   ├── custom_audio_service.c        # Audio streaming service
│   └── custom_audio_service.h        # Service definitions
├── reactapp/                         # React web application
│   ├── src/
│   │   ├── App.js                    # Main React component
│   │   └── components/
│   │       ├── BLEConnection.js      # BLE connection management
│   │       ├── AudioRecorder.js      # Audio recording functionality
│   │       └── DeepgramTranscriber.js # Speech-to-text integration
│   ├── public/
│   ├── package.json                  # Dependencies
│   └── README.md                     # React app documentation
├── CMakeLists.txt                    # Firmware build configuration
├── prj.conf                          # Project configuration
└── README.md                         # This file
```

## 🚀 Quick Start

### 1. Build and Flash Firmware

```bash
# Build the firmware
west build -b xiao_ble/nrf52840/sense

# Flash via UF2 bootloader
# 1. Double-click reset button on XIAO board
# 2. Copy build/zephyr/zephyr.uf2 to XIAO-SENSE drive
```

### 2. Start React App

```bash
# Navigate to React app directory
cd reactapp

# Install dependencies
npm install

# Start development server
npm start
```

### 3. Use the Application

1. **Open browser** to `http://localhost:3000`
2. **Connect to XIAO board** - Click "Connect to XIAO Board"
3. **Start Recording** - Click "Start Recording" and speak into XIAO
4. **Live Transcription** - Click "Start Transcription" for real-time speech-to-text
5. **Playback** - Play recorded audio or download as WAV file

## 🔧 Technical Details

### Firmware Specifications
- **Audio Format**: 16-bit PCM, 16kHz sample rate, mono
- **BLE Streaming**: 160 samples per packet (320 bytes), 10ms intervals
- **Device Name**: "MicStreamer"
- **Service UUID**: `12345678-1234-5678-1234-567812345678`
- **Characteristic UUID**: `12345679-1234-5678-1234-567812345678`

### React App Features
- **Web Bluetooth API** - Direct BLE communication
- **Audio Context** - Professional audio processing
- **Deepgram Integration** - Live speech-to-text transcription
- **Real-time Status** - Stream monitoring and packet counting
- **Cross-browser Support** - Works on Chrome, Edge, and other modern browsers

## 🎵 Audio Flow

```
XIAO Microphone → BLE Stream → React App → Deepgram API → Live Transcription
                ↓
            Audio Recording → WAV File → Playback/Download
```

## 📱 Browser Compatibility

| Browser | Web Bluetooth | Audio Context | Status |
|---------|---------------|---------------|---------|
| Chrome  | ✅ Yes        | ✅ Yes        | ✅ Full Support |
| Edge    | ✅ Yes        | ✅ Yes        | ✅ Full Support |
| Safari  | ❌ No         | ✅ Yes        | ⚠️ Limited (No BLE) |
| Firefox | ❌ No         | ✅ Yes        | ⚠️ Limited (No BLE) |

## 🔍 Debugging

### Serial Output (Firmware)
Connect to serial at **115200 baud**:
```bash
screen /dev/cu.usbmodem1101 115200
```

### Browser Console (React App)
- **F12** → Console tab
- Look for BLE connection logs
- Monitor audio packet reception
- Check transcription status

### Expected Output
```
🎤 XIAO MIC (BLE): received 160 samples
🎵 Transcribing XIAO MIC: sent 160 samples to Deepgram
📝 Deepgram transcript received: "Hello world"
```

## ⚙️ Configuration

### Deepgram API Key
Update the API key in `reactapp/src/components/DeepgramTranscriber.js`:
```javascript
const DEEPGRAM_API_KEY = 'your-api-key-here';
```

### Audio Parameters
- **Sample Rate**: 16kHz (matches firmware)
- **Channels**: 1 (mono)
- **Bit Depth**: 16-bit
- **Encoding**: linear16 (for Deepgram)

## 🚨 Troubleshooting

### BLE Connection Issues
- Ensure XIAO board is powered and running firmware
- Check browser has Bluetooth permissions
- Try refreshing the page and reconnecting
- Verify "MicStreamer" appears in device list

### Audio Issues
- Check serial output for streaming status
- Verify audio stream is active in React app
- Ensure XIAO microphone is not blocked
- Test with different audio levels

### Transcription Issues
- Verify Deepgram API key is correct
- Check network connection
- Monitor browser console for errors
- Ensure audio packets are being sent to Deepgram

## 📚 API Reference

### BLE Service
- **Service UUID**: `12345678-1234-5678-1234-567812345678`
- **Audio Data Characteristic**: `12345679-1234-5678-1234-567812345678`
- **Properties**: Notify, Write

### Deepgram Configuration
- **Model**: nova-3 (latest)
- **Language**: en-US
- **Format**: linear16
- **Sample Rate**: 16000 Hz

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is open source. Feel free to modify and distribute according to your needs.

## 🙏 Acknowledgments

- **Seeed Studio** for the excellent XIAO nRF52840 Sense board
- **Nordic Semiconductor** for the nRF Connect SDK
- **Deepgram** for the speech-to-text API
- **React** and **Web Bluetooth** communities

---

**🎤 XIAO Audio Transcriber**  
*Real-time BLE audio streaming with live speech-to-text transcription*

Built with ❤️ for the XIAO nRF52840 Sense community