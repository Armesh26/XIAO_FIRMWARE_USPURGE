#!/usr/bin/env python3
"""
BLE Debug Script - Simple scanner to find and connect to MicStreamer
"""

import asyncio
from bleak import BleakScanner, BleakClient

# Your firmware UUIDs
AUDIO_SERVICE_UUID = "12345678-1234-5678-1234-567812345678"
AUDIO_DATA_CHAR_UUID = "12345679-1234-5678-1234-567812345678"

async def scan_devices():
    """Scan for all BLE devices and look for MicStreamer"""
    print("🔍 Scanning for BLE devices...")
    
    devices = await BleakScanner.discover(timeout=10.0)
    
    print(f"\n📱 Found {len(devices)} BLE devices:")
    
    micstreamer_device = None
    
    for device in devices:
        name = device.name if device.name else "Unknown"
        rssi = getattr(device, 'rssi', 'N/A')
        print(f"   {name} ({device.address}) - RSSI: {rssi}")
        
        if name and ("MicStreamer" in name or "AudioStreamer" in name):
            micstreamer_device = device
            print(f"   ⭐ Found MicStreamer!")
    
    return micstreamer_device

async def connect_and_explore(device):
    """Connect to device and explore services"""
    print(f"\n🔗 Connecting to {device.name} ({device.address})...")
    
    try:
        async with BleakClient(device.address) as client:
            print(f"✅ Connected: {client.is_connected}")
            
            print("\n📋 Available services:")
            services = client.services
            
            for service in services:
                print(f"   Service: {service.uuid}")
                
                if service.uuid.lower() == AUDIO_SERVICE_UUID.lower():
                    print(f"   ⭐ Found Audio Service!")
                
                for char in service.characteristics:
                    print(f"      Char: {char.uuid} - Properties: {char.properties}")
                    
                    if char.uuid.lower() == AUDIO_DATA_CHAR_UUID.lower():
                        print(f"      ⭐ Found Audio Data Characteristic!")
                        
                        # Test notification
                        if "notify" in char.properties:
                            print(f"      📡 Supports notifications")
                            
                            def notification_handler(sender, data):
                                print(f"      📦 Received {len(data)} bytes: {data[:10].hex()}...")
                            
                            print("      🎵 Starting notifications...")
                            await client.start_notify(char.uuid, notification_handler)
                            
                            print("      ⏱️  Listening for 10 seconds...")
                            await asyncio.sleep(10)
                            
                            await client.stop_notify(char.uuid)
                            print("      🛑 Stopped notifications")
                        else:
                            print(f"      ❌ Does not support notifications")
    
    except Exception as e:
        print(f"❌ Connection error: {e}")

async def main():
    print("🎤 BLE Debug Scanner for MicStreamer")
    print("=" * 40)
    
    # Scan for devices
    device = await scan_devices()
    
    if not device:
        print("\n❌ MicStreamer not found. Make sure:")
        print("   1. Xiao board is powered on")
        print("   2. Firmware is running")
        print("   3. Board is advertising")
        print("   4. Not connected to another device")
        return
    
    # Connect and explore
    await connect_and_explore(device)

if __name__ == "__main__":
    asyncio.run(main())
