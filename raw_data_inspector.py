#!/usr/bin/env python3
"""
Raw Data Inspector - Deep dive into the actual data format
"""

import asyncio
import struct
from bleak import BleakClient, BleakScanner

# BLE UUIDs
AUDIO_SERVICE_UUID = "12345678-1234-5678-1234-567812345678"
AUDIO_DATA_CHAR_UUID = "12345679-1234-5678-1234-567812345678"

class RawDataInspector:
    def __init__(self):
        self.client = None
        self.device_address = None
        self.packet_count = 0
        
    async def connect(self):
        """Find and connect to AudioStreamer"""
        print("🔍 Scanning...")
        devices = await BleakScanner.discover(timeout=5)
        
        for device in devices:
            if device.name and ("AudioStreamer" in device.name):
                self.device_address = device.address
                break
        
        if not self.device_address:
            return False
        
        self.client = BleakClient(self.device_address)
        await self.client.connect()
        return True
    
    def inspect_packet(self, sender, data):
        """Inspect each packet in extreme detail"""
        self.packet_count += 1
        
        if self.packet_count <= 5:  # Only analyze first 5 packets
            print(f"\n📦 PACKET {self.packet_count} DEEP ANALYSIS:")
            print(f"   Length: {len(data)} bytes")
            print(f"   Raw hex: {data.hex()}")
            print(f"   Raw bytes: {list(data)}")
            
            if len(data) == 20:  # Expected packet size
                # Try different interpretations
                print(f"\n🔍 DATA INTERPRETATIONS:")
                
                # As 16-bit signed little-endian (most likely)
                samples_16_le = struct.unpack('<10h', data)
                print(f"   16-bit signed LE: {samples_16_le}")
                
                # As 16-bit signed big-endian  
                samples_16_be = struct.unpack('>10h', data)
                print(f"   16-bit signed BE: {samples_16_be}")
                
                # As 8-bit signed
                samples_8 = struct.unpack('20b', data)
                print(f"   8-bit signed: {samples_8[:10]}...")
                
                # As 32-bit (5 samples)
                if len(data) >= 20:
                    samples_32 = struct.unpack('<5i', data)
                    print(f"   32-bit signed: {samples_32}")
                
                # Check for patterns
                print(f"\n🎯 PATTERN ANALYSIS:")
                print(f"   All zeros? {all(b == 0 for b in data)}")
                print(f"   All same value? {len(set(data)) == 1}")
                print(f"   Ascending pattern? {list(data) == sorted(data)}")
                
                # Check if it looks like audio
                samples = samples_16_le
                max_val = max(abs(s) for s in samples)
                avg_val = sum(abs(s) for s in samples) / len(samples)
                
                print(f"   Max amplitude: {max_val}")
                print(f"   Avg amplitude: {avg_val:.0f}")
                print(f"   Dynamic range: {min(samples)} to {max(samples)}")
                
                # Check for reasonable audio characteristics
                if max_val > 1000:
                    print(f"   ✅ Has significant amplitude (likely audio)")
                else:
                    print(f"   ❌ Very low amplitude (might be noise/silence)")
                    
                if 100 < avg_val < 20000:
                    print(f"   ✅ Reasonable average level")
                else:
                    print(f"   ❌ Unusual average level")
            
        elif self.packet_count == 100:
            print(f"📊 Received 100 packets total...")
    
    async def inspect(self):
        """Start inspection"""
        print("🔍 Starting raw data inspection...")
        await self.client.start_notify(AUDIO_DATA_CHAR_UUID, self.inspect_packet)
        await asyncio.sleep(3)  # Inspect for 3 seconds
        await self.client.stop_notify(AUDIO_DATA_CHAR_UUID)
        print(f"🛑 Inspection complete. Analyzed {min(self.packet_count, 5)} packets in detail.")

async def main():
    inspector = RawDataInspector()
    
    try:
        if await inspector.connect():
            await inspector.inspect()
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        if inspector.client:
            await inspector.client.disconnect()

if __name__ == "__main__":
    print("🔍 Raw Data Inspector")
    print("Let's see exactly what data format your Xiao is sending")
    print("=" * 55)
    
    asyncio.run(main())
