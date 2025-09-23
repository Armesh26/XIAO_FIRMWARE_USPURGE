# XIAO Audio Transcriber

A React application that connects to your XIAO BLE Sense board and provides real-time audio transcription using Deepgram.

## Features

- 🔗 **BLE Connection**: Connect to XIAO board via Web Bluetooth API
- 🎤 **Audio Recording**: Record audio directly from XIAO board
- 🎯 **Real-time Transcription**: Live speech-to-text using Deepgram API
- 🎵 **Audio Playback**: Play back recorded audio
- 💾 **Download Support**: Save recordings as WAV files
- 📱 **Modern UI**: Beautiful, responsive interface

## Prerequisites

- XIAO BLE Sense board with custom audio service
- Modern browser with Web Bluetooth support (Chrome, Edge)
- Node.js and npm installed

## Installation

1. Navigate to the reactapp directory:
   ```bash
   cd reactapp
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm start
   ```

4. Open your browser to `http://localhost:3000`

## Usage

1. **Connect to XIAO Board**:
   - Click "Connect to XIAO Board"
   - Select your XIAO device from the Bluetooth device list
   - Wait for connection confirmation

2. **Record Audio**:
   - Click "Start Recording" to begin recording from XIAO board
   - Click "Stop Recording" when finished
   - Use "Play" to listen to your recording
   - Use "Download" to save as WAV file

3. **Transcribe Speech**:
   - Click "Start Transcription" to begin real-time transcription
   - Speak into your XIAO board microphone
   - View live transcription results
   - Copy or clear transcription text as needed

## XIAO Board Configuration

Your XIAO board should be running the custom audio service with these UUIDs:
- Service UUID: `12345678-1234-5678-1234-567812345678`
- Characteristic UUID: `12345679-1234-5678-1234-567812345678`

## Deepgram API

The app uses Deepgram's Nova-2 model for high-quality speech recognition:
- API Key: `6f8cc0568676f91acc28784457aea240539e9aab`
- Language: English (US)
- Smart formatting enabled
- Interim results for real-time feedback

## Browser Compatibility

- ✅ Chrome (recommended)
- ✅ Edge
- ✅ Opera
- ❌ Firefox (no Web Bluetooth support)
- ❌ Safari (no Web Bluetooth support)

## Troubleshooting

### Connection Issues
- Ensure your XIAO board is powered on and advertising
- Check that Bluetooth is enabled on your computer
- Try refreshing the page and reconnecting

### Audio Issues
- Verify the XIAO board is sending audio data
- Check browser console for any error messages
- Ensure microphone permissions are granted

### Transcription Issues
- Check internet connection for Deepgram API
- Verify the API key is correct
- Check browser console for Deepgram errors

## File Structure

```
reactapp/
├── public/
│   └── index.html
├── src/
│   ├── components/
│   │   ├── BLEConnection.js      # Bluetooth connection management
│   │   ├── AudioRecorder.js      # Audio recording and playback
│   │   └── DeepgramTranscriber.js # Speech transcription
│   ├── App.js                    # Main application component
│   └── index.js                  # Application entry point
├── package.json                  # Dependencies and scripts
└── README.md                     # This file
```

## Development

To build for production:
```bash
npm run build
```

To run tests:
```bash
npm test
```

## License

This project is open source and available under the MIT License.
