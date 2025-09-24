# 🎤 XIAO Audio Transcriber

**Real-time audio transcription using XIAO nRF52840 Sense board and Deepgram Nova-3 API**

A React Native iOS application that connects to a Seeed Studio XIAO nRF52840 Sense board via Bluetooth LE to capture real-time audio and transcribe it using Deepgram's state-of-the-art Nova-3 speech recognition API.

## 🚀 Features

- **🔗 Bluetooth LE Connection**: Seamless connection to XIAO nRF52840 Sense board
- **🎵 Real-time Audio Capture**: High-quality audio streaming at 16kHz sample rate
- **🤖 AI-Powered Transcription**: Real-time speech-to-text using Deepgram Nova-3
- **📱 Native iOS Experience**: Optimized React Native app with native performance
- **📊 Advanced Logging**: Comprehensive logging system with UI viewer and file export
- **🎧 Audio Recording & Playback**: Record, save, and play back captured audio
- **📈 Real-time Monitoring**: Live statistics and connection status
- **🔧 Debug Tools**: Built-in BLE debugging and diagnostics

## 📋 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Hardware Setup](#-hardware-setup)
- [Firmware Setup](#-firmware-setup)
- [Configuration](#-configuration)
- [Usage](#-usage)
- [Components Overview](#-components-overview)
- [Audio Processing Pipeline](#-audio-processing-pipeline)
- [Troubleshooting](#-troubleshooting)
- [Development](#-development)
- [API Reference](#-api-reference)
- [Contributing](#-contributing)
- [License](#-license)

## 🏗 Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   XIAO Board    │◄──►│  React Native   │◄──►│   Deepgram      │
│                 │BLE │     iOS App     │HTTP│     Nova-3      │
│ • DMIC Capture  │    │ • Audio Proc.   │    │ • Transcription │
│ • BLE Streaming │    │ • UI/UX         │    │ • Real-time     │
│ • Zephyr RTOS   │    │ • File Storage  │    │ • High Accuracy │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Key Components:

1. **XIAO nRF52840 Sense**: Hardware audio capture and BLE transmission
2. **React Native App**: Audio processing, UI, and transcription coordination
3. **Deepgram Nova-3**: Cloud-based AI speech recognition

## 📚 Prerequisites

### Development Environment

- **macOS** (for iOS development)
- **Xcode 14+** with iOS SDK
- **Node.js 18+** and npm/yarn
- **React Native CLI** (`npm install -g react-native-cli`)
- **CocoaPods** (`sudo gem install cocoapods`)
- **iOS Developer Account** (for device deployment)

### Hardware Requirements

- **Seeed Studio XIAO nRF52840 Sense** board
- **iOS device** (iPhone/iPad) with Bluetooth LE support
- **USB-C cable** for XIAO programming
- **Computer** with USB port for firmware flashing

### API Requirements

- **Deepgram API Key** ([Get one here](https://deepgram.com))

## 🔧 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/xiao-audio-transcriber.git
cd xiao-audio-transcriber/XiaoAudioTranscriber
```

### 2. Install Dependencies

```bash
# Install Node.js dependencies
npm install

# Install iOS dependencies
cd ios
pod install
cd ..
```

### 3. Configure Deepgram API

Create or update your Deepgram service configuration:

```typescript
// src/services/DeepgramService.ts
const DEEPGRAM_API_KEY = 'your-deepgram-api-key-here';
```

### 4. iOS Setup

1. Open `ios/XiaoAudioTranscriber.xcworkspace` in Xcode
2. Select your development team in project settings
3. Update bundle identifier if needed
4. Ensure proper code signing setup

## 🔌 Hardware Setup

### XIAO nRF52840 Sense Preparation

1. **Connect XIAO to Computer**:
   - Use USB-C cable to connect XIAO to your computer
   - Board should appear as a USB device

2. **Install Arduino IDE** (if not already installed):
   - Download from [arduino.cc](https://www.arduino.cc/en/software)
   - Add Seeed XIAO boards to Arduino IDE

3. **Board Configuration**:
   - Select "Seeed XIAO nRF52840 Sense" as target board
   - Install required libraries (see firmware section)

## 🛠 Firmware Setup

The XIAO board runs Zephyr RTOS firmware that handles:
- Digital microphone (DMIC) audio capture
- Bluetooth LE advertising and GATT services
- Real-time audio streaming to connected devices

### Firmware Features:
- **16kHz sampling rate** for optimal quality/bandwidth balance
- **160-sample packets** transmitted via BLE
- **Ring buffer management** for continuous audio capture
- **Power-optimized** BLE advertising

### Flashing Firmware:
```bash
# Navigate to firmware directory
cd ../

# Build and flash (requires Zephyr SDK)
west build -b xiao_ble_sense
west flash
```

## ⚙️ Configuration

### BLE Configuration

```typescript
// Default BLE UUIDs (can be customized)
const AUDIO_SERVICE_UUID = "12345678-1234-5678-1234-567812345678";
const AUDIO_CHAR_UUID = "12345679-1234-5678-1234-567812345678";
const DEVICE_NAME = "MicStreamer";
```

### Audio Processing Settings

```typescript
// Audio configuration
const SAMPLE_RATE = 16000; // Hz
const CHANNELS = 1; // Mono
const SAMPLE_WIDTH = 2; // 16-bit
const BUFFER_SIZE = 8192; // Samples
```

### iOS Permissions

Required permissions are automatically configured in `Info.plist`:

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>This app uses Bluetooth to connect to XIAO audio device</string>
<key>NSMicrophoneUsageDescription</key>
<string>This app processes audio from external XIAO device</string>
```

## 🎯 Usage

### 1. Start the Application

```bash
# Start Metro bundler
npx react-native start

# Run on iOS device
npx react-native run-ios --device
```

### 2. Connect to XIAO Board

1. **Power on XIAO board** (ensure firmware is flashed)
2. **Open the app** on your iOS device
3. **Tap "Connect to XIAO"** - app will scan for nearby devices
4. **Select your XIAO board** from the discovered devices list
5. **Wait for connection confirmation** ✅

### 3. Record Audio

1. **Tap "Start Recording"** to begin audio capture
2. **Speak into the XIAO microphone** - audio will stream in real-time
3. **Tap "Stop Recording"** when finished
4. **Review recorded audio** - play back, view stats, or save to device

### 4. Real-time Transcription

1. **Ensure XIAO is connected** and audio is streaming
2. **Tap "Start Transcription"** to begin Deepgram processing
3. **Speak clearly** - transcription will appear in real-time
4. **View live and final results** in the transcription box
5. **Copy or clear text** as needed

### 5. Monitor and Debug

- **View Logs**: Tap "View Logs" for detailed system information
- **Export Logs**: Generate log files for debugging
- **Monitor Stats**: Check connection status, packet rates, audio quality
- **Debug BLE**: Use built-in BLE diagnostics tools

## 🧩 Components Overview

### Core Components

#### `BLEConnectionFixed.tsx`
- Manages Bluetooth LE connection using `react-native-ble-manager`
- Handles device discovery, connection, and audio data streaming
- Implements global audio handlers for efficient data flow

#### `AudioRecorder.tsx`
- Records audio from XIAO board to WAV files
- Provides playback functionality and audio quality validation
- Manages local file storage and recording sessions

#### `DeepgramTranscriber.tsx`
- Integrates with Deepgram Nova-3 API for real-time transcription
- Handles WebSocket connections and audio streaming
- Displays live and final transcription results

#### `LogsView.tsx`
- Centralized logging system with categorized log levels
- Real-time log display with export functionality
- Debugging and troubleshooting support

### Services

#### `BLEManagerService.ts`
- Singleton service for BLE operations
- Event-driven architecture for reliable connections
- Comprehensive error handling and state management

#### `DeepgramService.ts`
- WebSocket-based Deepgram API integration
- Real-time audio streaming and transcription
- Connection management and error recovery

#### `AudioProcessor.ts`
- Low-level audio data processing and conversion
- Ring buffer management for continuous audio
- WAV file creation and audio quality validation

#### `LoggerService.ts`
- Centralized logging with multiple severity levels
- Event-based logging system with UI updates
- File export and debugging utilities

## 🎵 Audio Processing Pipeline

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ XIAO Board  │───►│ BLE Stream  │───►│ Audio Proc. │───►│ WAV/Stream  │
│ DMIC → ADC  │    │ 160 samples │    │ Ring Buffer │    │ Files/API   │
│ 16kHz/16bit │    │ @ 100Hz     │    │ Quality Val.│    │ Storage     │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

### Processing Steps:

1. **Audio Capture**: XIAO DMIC captures audio at 16kHz
2. **BLE Transmission**: 160-sample packets sent every 10ms
3. **Ring Buffer**: Continuous buffering for seamless processing
4. **Quality Validation**: Real-time audio quality metrics
5. **Format Conversion**: WAV file creation or API streaming
6. **Storage/Transcription**: Local storage or Deepgram processing

## 🔍 Troubleshooting

### Common Issues

#### BLE Connection Problems
```
🔧 Solutions:
• Ensure XIAO firmware is properly flashed
• Check Bluetooth is enabled on iOS device
• Verify device permissions in iOS Settings
• Try toggling Bluetooth off/on
• Check distance between devices (< 10m)
```

#### Audio Quality Issues
```
🔧 Solutions:
• Check microphone is not obstructed
• Ensure stable BLE connection
• Verify sample rate configuration (16kHz)
• Check for interference from other devices
• Monitor packet loss in logs
```

#### Transcription Accuracy
```
🔧 Solutions:
• Speak clearly and at moderate pace
• Reduce background noise
• Ensure stable internet connection
• Check Deepgram API key validity
• Monitor audio quality metrics
```

#### App Performance
```
🔧 Solutions:
• Close other apps to free memory
• Ensure iOS device has sufficient storage
• Monitor battery level (BLE intensive)
• Check for iOS version compatibility
• Review app logs for memory issues
```

### Debug Tools

#### Built-in Diagnostics:
- **BLE State Monitor**: Real-time connection status
- **Audio Quality Metrics**: SNR, clipping, silence detection
- **Packet Rate Analysis**: Throughput and loss monitoring
- **Memory Usage Tracking**: Buffer utilization and leaks

#### Log Categories:
- **BLE Events**: Connection, discovery, data transfer
- **Audio Events**: Recording, processing, quality
- **Deepgram Events**: API calls, transcription, errors
- **File Events**: Storage, playback, export operations

## 🚀 Development

### Project Structure

```
XiaoAudioTranscriber/
├── src/
│   ├── components/           # React Native UI components
│   │   ├── AudioRecorder.tsx
│   │   ├── BLEConnectionFixed.tsx
│   │   ├── DeepgramTranscriber.tsx
│   │   └── LogsView.tsx
│   ├── services/            # Business logic services
│   │   ├── BLEManagerService.ts
│   │   ├── DeepgramService.ts
│   │   └── LoggerService.ts
│   └── utils/               # Utility functions
│       └── AudioProcessor.ts
├── ios/                     # iOS native configuration
├── android/                 # Android configuration (future)
└── __tests__/              # Unit tests
```

### Key Design Patterns

#### Singleton Services
- BLE and audio services use singleton pattern
- Ensures single point of truth for connection state
- Prevents resource conflicts and memory leaks

#### Event-Driven Architecture
- Global handlers for audio data flow
- Prevents React state infinite loops
- Efficient real-time data processing

#### Component Separation
- Each component has single responsibility
- Services handle business logic
- Components focus on UI and user interaction

### Testing

```bash
# Run unit tests
npm test

# Run specific test suite
npm test AudioProcessor

# Run with coverage
npm test -- --coverage
```

### Building for Production

```bash
# iOS Production Build
npx react-native run-ios --configuration Release

# Generate IPA for App Store
# (Configure in Xcode with proper provisioning profiles)
```

## 📖 API Reference

### BLEManagerService

```typescript
class BLEManagerService {
  // Connection management
  async scanForDevices(duration: number): Promise<void>
  async connectToDevice(deviceId: string): Promise<void>
  async disconnectFromDevice(): Promise<void>
  
  // State queries
  isConnected(): boolean
  getIsInitialized(): boolean
  
  // Event handlers
  setupEventListeners(): void
  destroy(): void
}
```

### AudioProcessor

```typescript
class AudioProcessor {
  // Audio processing
  processAudioData(audioData: number[]): Int16Array | null
  validateAudioData(audioData: number[]): AudioQuality
  
  // File operations
  createWavBlob(audioData: Int16Array, duration: number): Blob
  createWavData(audioData: number[], sampleRate?: number): string
  
  // Buffer management
  reset(): void
  getBufferStatus(): BufferStatus
}
```

### DeepgramService

```typescript
class DeepgramService {
  // Transcription control
  async startTranscription(): Promise<boolean>
  stopTranscription(): void
  
  // Audio streaming
  sendAudioData(audioData: Uint8Array): boolean
  
  // Event management
  setListeners(listeners: DeepgramListeners): void
  cleanup(): void
}
```

### LoggerService

```typescript
class LoggerService {
  // Logging methods
  info(message: string, data?: any): void
  warn(message: string, data?: any): void
  error(message: string, error?: any): void
  debug(message: string, data?: any): void
  
  // Specialized logging
  logBLEEvent(message: string, data?: any): void
  logAudioEvent(message: string, data?: any): void
  logDeepgramEvent(message: string, data?: any): void
  
  // Management
  clearLogs(): void
  generateLogFile(): Promise<string>
  addListener(callback: (logs: LogEntry[]) => void): () => void
}
```

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

### Development Setup

1. **Fork the repository**
2. **Create feature branch**: `git checkout -b feature/amazing-feature`
3. **Install dependencies**: `npm install && cd ios && pod install`
4. **Make changes** with proper testing
5. **Run tests**: `npm test`
6. **Commit changes**: `git commit -m 'Add amazing feature'`
7. **Push to branch**: `git push origin feature/amazing-feature`
8. **Open Pull Request**

### Code Standards

- **TypeScript** for type safety
- **ESLint** for code quality
- **Prettier** for code formatting
- **Jest** for unit testing
- **Conventional Commits** for commit messages

### Pull Request Process

1. Update documentation for any API changes
2. Add tests for new functionality
3. Ensure all tests pass
4. Update README if needed
5. Request review from maintainers

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Seeed Studio** for XIAO nRF52840 Sense hardware
- **Deepgram** for Nova-3 speech recognition API
- **React Native Community** for excellent BLE libraries
- **Zephyr Project** for RTOS firmware foundation

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/your-username/xiao-audio-transcriber/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-username/xiao-audio-transcriber/discussions)
- **Email**: support@your-domain.com

---

**Made with ❤️ by the XIAO Audio Transcriber Team**

*Turn your voice into text with the power of IoT and AI!*