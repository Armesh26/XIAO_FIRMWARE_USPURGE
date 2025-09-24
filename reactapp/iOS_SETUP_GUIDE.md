# 🍎 iOS App Setup Guide - XIAO Audio Transcriber

This guide will walk you through setting up your React web app as a native iOS app using Capacitor.js.

## Prerequisites

### Required Software
1. **macOS** (required for iOS development)
2. **Xcode** (latest version from App Store)
3. **CocoaPods** (iOS dependency manager)
4. **Node.js** (v16 or higher)
5. **npm** or **yarn**

### Install CocoaPods
```bash
sudo gem install cocoapods
```

### Install Xcode Command Line Tools
```bash
sudo xcode-select --install
```

## Step-by-Step Setup

### 1. Build and Sync the App
```bash
cd /Users/armeshpereira/Documents/LastAttempt/reactapp

# Build the React app
npm run build

# Sync to iOS project
npx cap sync ios
```

### 2. Open in Xcode
```bash
npx cap open ios
```

### 3. Configure iOS Project in Xcode

#### A. Set Team and Bundle Identifier
1. Select the **App** project in the navigator
2. Go to **Signing & Capabilities**
3. Select your **Team** (Apple Developer Account)
4. Change **Bundle Identifier** to: `com.yourcompany.xiao.transcriber`

#### B. Add Required Capabilities
1. Click **+ Capability**
2. Add **Background Modes**:
   - ✅ Audio, AirPlay, and Picture in Picture
   - ✅ Background processing
3. Add **Bluetooth**:
   - ✅ Uses Bluetooth LE accessories

#### C. Configure App Icons
1. Open **Assets.xcassets** → **AppIcon**
2. Drag your app icons to the appropriate slots:
   - **iPhone App** (60pt): 120x120, 180x180
   - **iPhone Settings** (29pt): 58x58, 87x87
   - **iPhone Spotlight** (40pt): 80x80, 120x120
   - **App Store** (1024pt): 1024x1024

### 4. Test on Simulator
1. Select an iOS Simulator (iPhone 14 Pro recommended)
2. Click **Run** (▶️) or press `Cmd + R`
3. The app should launch and show your React interface

### 5. Test on Physical Device

#### A. Connect iPhone via USB
1. Connect your iPhone to Mac via USB cable
2. Trust the computer on your iPhone
3. In Xcode, select your device from the device list

#### B. Enable Developer Mode
1. On iPhone: **Settings** → **Privacy & Security** → **Developer Mode** → **On**
2. Restart iPhone when prompted
3. Re-enable Developer Mode after restart

#### C. Run on Device
1. Select your iPhone in Xcode
2. Click **Run** (▶️)
3. Trust the developer certificate on your iPhone when prompted

## Development Workflow

### Live Reload Development
```bash
# Start development server with live reload
npm run ios:dev
```

### Manual Build and Run
```bash
# Build and sync
npm run ios:build

# Open in Xcode
npm run ios:open

# Build and run directly
npm run ios:run
```

## App Store Submission

### 1. Prepare for Release
1. In Xcode: **Product** → **Archive**
2. Wait for archive to complete
3. Click **Distribute App**

### 2. App Store Connect Setup
1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. Create new app:
   - **Name**: XIAO Audio Transcriber
   - **Bundle ID**: com.yourcompany.xiao.transcriber
   - **SKU**: xiao-transcriber-2025

### 3. App Information
- **App Name**: XIAO Audio Transcriber
- **Subtitle**: Real-time Audio Transcription
- **Description**: Connect to your XIAO board and transcribe speech in real-time using Deepgram AI
- **Keywords**: bluetooth, audio, transcription, xiao, deepgram
- **Category**: Productivity
- **Age Rating**: 4+ (No objectionable content)

### 4. Screenshots Required
- **iPhone 6.7" Display**: 1290 x 2796 pixels
- **iPhone 6.5" Display**: 1242 x 2688 pixels
- **iPhone 5.5" Display**: 1242 x 2208 pixels

### 5. App Review Information
- **Contact Information**: Your contact details
- **Demo Account**: None required
- **Notes**: "This app connects to XIAO nRF52840 Sense boards via Bluetooth for real-time audio transcription using Deepgram AI."

## Troubleshooting

### Common Issues

#### 1. CocoaPods Installation Failed
```bash
# Update CocoaPods
sudo gem update cocoapods

# Clear CocoaPods cache
pod cache clean --all

# Reinstall
cd ios/App
pod install
```

#### 2. Build Errors
- Ensure Xcode is updated to latest version
- Clean build folder: **Product** → **Clean Build Folder**
- Delete derived data: **Xcode** → **Preferences** → **Locations** → **Derived Data**

#### 3. Bluetooth Not Working
- Check Info.plist has Bluetooth permissions
- Test on physical device (Bluetooth doesn't work in simulator)
- Ensure XIAO board is in pairing mode

#### 4. App Crashes on Launch
- Check console logs in Xcode
- Verify all Capacitor plugins are properly installed
- Test web version first to ensure React app works

### Debug Commands
```bash
# Check Capacitor version
npx cap doctor

# List installed plugins
npx cap ls

# Update all plugins
npx cap update
```

## Performance Optimization

### 1. Bundle Size Optimization
- Use `npm run build` to create optimized production build
- Enable gzip compression in web server
- Consider code splitting for large apps

### 2. iOS-Specific Optimizations
- Use `Capacitor.isNativePlatform()` to detect mobile
- Implement proper error handling for native features
- Test on multiple iOS versions (iOS 13+)

### 3. Battery Optimization
- Minimize background processing
- Use efficient audio processing
- Implement proper BLE connection management

## Security Considerations

### 1. API Keys
- Never hardcode API keys in the app
- Use environment variables for development
- Consider using Capacitor's secure storage for sensitive data

### 2. Network Security
- Use HTTPS for all API calls
- Implement proper certificate pinning if needed
- Validate all user inputs

### 3. Data Privacy
- Implement proper data encryption
- Follow GDPR/CCPA guidelines
- Add privacy policy and terms of service

## Support and Resources

### Documentation
- [Capacitor iOS Guide](https://capacitorjs.com/docs/ios)
- [Apple Developer Documentation](https://developer.apple.com/documentation/)
- [React Native vs Capacitor](https://capacitorjs.com/docs/guides/migrating-from-react-native)

### Community
- [Capacitor Discord](https://discord.gg/yyH927m)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/capacitor)
- [GitHub Issues](https://github.com/ionic-team/capacitor/issues)

---

## Quick Commands Reference

```bash
# Development
npm start                    # Start React dev server
npm run ios:dev             # Start with live reload
npm run ios:build           # Build and sync
npm run ios:open            # Open in Xcode
npm run ios:run             # Build and run

# Production
npm run build               # Build for production
npx cap sync ios           # Sync to iOS
npx cap open ios           # Open in Xcode
```

Your React app is now ready to be deployed as a native iOS app! 🚀
