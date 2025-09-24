# 🔧 BLE Connection Troubleshooting Guide

## ✅ Current Status: BLE Manager Working Correctly
Your logs show that the React Native BLE Manager is working perfectly:
- ✅ Native module available
- ✅ BLE Manager import working  
- ✅ BLE initialization successful
- ✅ Scan completed successfully

## ❌ Issue: XIAO Device Not Found

The app is scanning correctly but not finding your `MicStreamer` device. Here are the troubleshooting steps:

### 1. **Check XIAO Hardware**
- [ ] **Power**: Is the XIAO board powered on? (LED should be on)
- [ ] **Firmware**: Is the correct firmware flashed and running?
- [ ] **Reset**: Try pressing the reset button on the XIAO board

### 2. **Check BLE Status on XIAO**
- [ ] **Boot logs**: Check the XIAO's serial output for BLE advertising messages
- [ ] **Service**: Verify the custom audio service is starting correctly
- [ ] **Advertising**: Confirm the device is advertising as "MicStreamer"

### 3. **Test with Other BLE Scanners**
Use another BLE scanner to verify the XIAO is visible:

**iOS Apps:**
- "LightBlue Explorer" (free)
- "BLE Scanner 4.0"

**Steps:**
1. Open BLE scanner app
2. Look for device named "MicStreamer"
3. If found: XIAO is working, issue is in our app
4. If not found: XIAO firmware/hardware issue

### 4. **Check Scan Results in App**
The app now logs ALL discovered devices. Check the logs to see:
- How many devices were found total
- What device names are being discovered
- If any devices have similar names

### 5. **Distance and Signal**
- [ ] **Proximity**: Keep iPhone within 3 feet of XIAO
- [ ] **Interference**: Move away from other BLE devices
- [ ] **Line of sight**: Remove physical obstructions

### 6. **Check Firmware Logs**
Connect to XIAO via serial monitor and look for:
```
[INF] Bluetooth initialized
[INF] Starting advertising...
[INF] Advertising as 'MicStreamer'
```

### 7. **Manual Device Selection**
The app now shows ALL discovered devices. Even if your XIAO isn't auto-detected, you can:
1. Tap "Scan & Connect"
2. Look in the discovered devices list
3. Manually tap on any device that might be your XIAO

## 🔍 Next Debugging Steps

**In the app logs, look for:**
- "All discovered devices" - shows everything found
- Device count - should be > 0 if any BLE devices nearby

**Most likely issues:**
1. **XIAO not powered/running** (90% of cases)
2. **Firmware not advertising correctly**
3. **XIAO already connected to another device**

## 🚀 Quick Test Commands

**To rebuild XIAO firmware:**
```bash
cd /path/to/xiao/project
west build -b xiao_ble_nrf52840_sense
west flash
```

**To check XIAO serial output:**
```bash
# Connect via serial monitor at 115200 baud
# Look for BLE initialization messages
```

Try these steps and let me know what you find!
