# BLE Audio Transcriber for Xiao nRF52840 Sense

Real-time audio transcription from your Xiao nRF52840 Sense BLE microphone streamer.

## 🎤 Features

- **Real-time BLE connection** to MicStreamer device
- **Continuous audio streaming** from ring buffer firmware
- **Live speech transcription** using Google Speech Recognition
- **Automatic device discovery** - finds your MicStreamer
- **Buffer management** - handles continuous audio flow
- **Statistics monitoring** - shows connection and buffer status

## 📋 Requirements

### Python Packages
```bash
pip install bleak speechrecognition numpy pyaudio
```

### System Dependencies

**macOS:**
```bash
brew install portaudio
```

**Ubuntu/Debian:**
```bash
sudo apt-get install portaudio19-dev python3-dev
```

**Windows:**
```bash
# PyAudio wheels should install automatically
pip install pyaudio
```

## 🚀 Usage

### 1. Flash Your Xiao Board
Make sure your Xiao nRF52840 Sense is running the ring buffer firmware from this repository.

### 2. Run the Transcriber
```bash
python3 ble_audio_transcriber.py
```

### 3. Expected Output
```
🎤 BLE Audio Transcriber for Xiao nRF52840 Sense
==================================================
✅ speech_recognition available
✅ bleak available  
✅ numpy available
🔍 Scanning for MicStreamer device...
✅ Found MicStreamer: MicStreamer (XX:XX:XX:XX:XX:XX)
🔗 Connecting to XX:XX:XX:XX:XX:XX...
✅ Connected to MicStreamer
🎵 Starting audio streaming...
✅ Audio streaming started
🎤 Listening for audio... Speak into the microphone!
📝 Transcription will appear every few seconds
📦 Received 100 packets, Buffer: 2000 samples
🗣️  [14:32:15] Transcription: Hello this is a test
📦 Received 200 packets, Buffer: 4000 samples
🗣️  [14:32:18] Transcription: The microphone is working great
```

## ⚙️ How It Works

### 1. **BLE Connection**
- Scans for "MicStreamer" device
- Connects using the custom audio service UUID
- Enables notifications on audio data characteristic

### 2. **Audio Processing**
- Receives 20-byte packets from ring buffer firmware
- Converts bytes to 16-bit signed integers
- Maintains circular buffers for continuous processing

### 3. **Transcription**
- Runs background transcription thread
- Transcribes every 3 seconds when enough audio is available
- Uses Google Speech Recognition API
- Creates temporary WAV files for processing

### 4. **Buffer Management**
- **Audio buffer**: 1-second rolling buffer for monitoring
- **Transcription buffer**: 5-second buffer for speech recognition
- Automatic cleanup of old data

## 🔧 Configuration

### Audio Parameters (matching firmware)
- **Sample Rate**: 16kHz
- **Bit Depth**: 16-bit
- **Channels**: Mono
- **Packet Size**: 20 bytes (10 samples)

### Transcription Settings
- **Transcription Interval**: 3 seconds
- **Minimum Audio**: 1 second required
- **Buffer Retention**: 2 seconds of recent audio

## 🐛 Troubleshooting

### "MicStreamer device not found"
- Ensure your Xiao board is powered and running the firmware
- Check that Bluetooth is enabled on your computer
- Try increasing scan timeout in the code

### "Transcription service error"
- Requires internet connection for Google Speech Recognition
- Check your network connectivity
- Consider using offline recognition libraries

### "Could not understand audio"
- Speak clearly into the microphone
- Ensure microphone is not obstructed
- Check audio levels in serial output

### PyAudio installation issues
```bash
# macOS with Homebrew
brew install portaudio
pip install pyaudio

# Ubuntu/Debian
sudo apt-get install portaudio19-dev python3-dev
pip install pyaudio
```

## 📊 Statistics

The script shows real-time statistics:
- **Connection status**
- **Recording status** 
- **Packets received**
- **Buffer levels**
- **Audio duration**

## 🔒 Privacy

- Audio is processed locally and sent to Google for transcription
- No audio data is stored permanently
- Temporary files are automatically cleaned up
- Consider offline transcription for sensitive applications

## 🚀 Advanced Usage

### Custom Recognition Engine
```python
# Replace Google with offline recognition
recognizer.recognize_sphinx(audio)  # CMU Sphinx (offline)
recognizer.recognize_whisper(audio)  # OpenAI Whisper (offline)
```

### Save Audio to File
```python
# Add to audio_data_handler
with wave.open('recording.wav', 'wb') as f:
    f.writeframes(audio_data)
```

### Real-time Processing
```python
# Reduce transcription interval for faster response
if (current_time - last_transcription_time >= 1.0):  # 1 second
```

## 📝 Notes

- Requires active internet connection for Google Speech Recognition
- Audio quality depends on microphone positioning and environment
- Transcription accuracy varies with speech clarity and background noise
- Buffer sizes can be adjusted for different latency/accuracy trade-offs

---

**Real-time speech transcription from your Xiao nRF52840 Sense!** 🎤📝
