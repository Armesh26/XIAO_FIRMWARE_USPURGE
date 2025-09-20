#!/usr/bin/env python3
"""
Audio Data Analyzer - Debug the audio format and data flow
"""

import asyncio
import struct
import wave
import numpy as np
from bleak import BleakClient, BleakScanner

# BLE Service and Characteristic UUIDs
AUDIO_SERVICE_UUID = "12345678-1234-5678-1234-567812345678"
AUDIO_DATA_CHAR_UUID = "12345679-1234-5678-1234-567812345678"

class AudioAnalyzer:
    def __init__(self):
        self.client = None
        self.device_address = None
        self.raw_packets = []
        self.packet_count = 0
        
    async def scan_and_connect(self):
        """Find and connect to AudioStreamer"""
        print("🔍 Scanning for AudioStreamer...")
        devices = await BleakScanner.discover(timeout=5)
        
        for device in devices:
            if device.name and ("AudioStreamer" in device.name or "MicStreamer" in device.name):
                print(f"✅ Found: {device.name} ({device.address})")
                self.device_address = device.address
                break
        
        if not self.device_address:
            print("❌ Device not found")
            return False
        
        self.client = BleakClient(self.device_address)
        await self.client.connect()
        print(f"✅ Connected")
        return True
    
    def packet_handler(self, sender, data):
        """Analyze each packet in detail"""
        self.packet_count += 1
        self.raw_packets.append(data)
        
        # Print first 10 packets in detail
        if self.packet_count <= 10:
            print(f"\n📦 Packet {self.packet_count}:")
            print(f"   Raw bytes ({len(data)}): {data.hex()}")
            
            if len(data) >= 2:
                # Try different interpretations
                samples_le = struct.unpack(f'<{len(data)//2}h', data)  # Little-endian
                samples_be = struct.unpack(f'>{len(data)//2}h', data)  # Big-endian
                unsigned = struct.unpack(f'<{len(data)//2}H', data)   # Unsigned
                
                print(f"   As signed LE: {samples_le[:5]}...")
                print(f"   As signed BE: {samples_be[:5]}...")
                print(f"   As unsigned:  {unsigned[:5]}...")
                
                # Check for patterns
                max_val = max(abs(s) for s in samples_le)
                min_val = min(samples_le)
                max_pos = max(samples_le)
                
                print(f"   Range: {min_val} to {max_pos} (max abs: {max_val})")
        
        # Print summary every 100 packets
        elif self.packet_count % 100 == 0:
            print(f"📦 Received {self.packet_count} packets...")
    
    def analyze_data_stream(self):
        """Analyze the complete data stream"""
        if not self.raw_packets:
            print("❌ No data to analyze")
            return
        
        print(f"\n🔍 DEEP ANALYSIS OF {len(self.raw_packets)} PACKETS:")
        
        # Combine all packet data
        all_data = b''.join(self.raw_packets)
        print(f"   Total bytes: {len(all_data)}")
        
        # Convert to samples
        if len(all_data) >= 2:
            samples = struct.unpack(f'<{len(all_data)//2}h', all_data)
            print(f"   Total samples: {len(samples)}")
            
            # Statistical analysis
            samples_array = np.array(samples, dtype=np.int16)
            
            print(f"\n📊 AUDIO STATISTICS:")
            print(f"   Min value: {np.min(samples_array)}")
            print(f"   Max value: {np.max(samples_array)}")
            print(f"   Mean: {np.mean(samples_array):.1f}")
            print(f"   Std dev: {np.std(samples_array):.1f}")
            print(f"   RMS: {np.sqrt(np.mean(samples_array.astype(np.float32)**2)):.1f}")
            
            # Check for patterns
            unique_values = len(np.unique(samples_array))
            print(f"   Unique values: {unique_values} (out of {len(samples)})")
            
            # Check for silence
            silence_threshold = 100
            silent_samples = np.sum(np.abs(samples_array) < silence_threshold)
            print(f"   Silent samples: {silent_samples} ({silent_samples/len(samples)*100:.1f}%)")
            
            # Check for clipping
            clipped_samples = np.sum(np.abs(samples_array) > 30000)
            print(f"   Clipped samples: {clipped_samples} ({clipped_samples/len(samples)*100:.1f}%)")
            
            # Frequency analysis (simple)
            print(f"\n🌊 WAVEFORM ANALYSIS:")
            print(f"   First 20 samples: {samples[:20]}")
            print(f"   Middle 20 samples: {samples[len(samples)//2:len(samples)//2+20]}")
            print(f"   Last 20 samples: {samples[-20:]}")
            
            # Check for data corruption patterns
            zero_count = np.sum(samples_array == 0)
            max_count = np.sum(samples_array == 32767)
            min_count = np.sum(samples_array == -32768)
            
            print(f"\n🔍 DATA INTEGRITY:")
            print(f"   Zero samples: {zero_count} ({zero_count/len(samples)*100:.1f}%)")
            print(f"   Max value samples: {max_count} ({max_count/len(samples)*100:.1f}%)")
            print(f"   Min value samples: {min_count} ({min_count/len(samples)*100:.1f}%)")
            
            # Save debug WAV file
            debug_filename = "debug_audio_analysis.wav"
            with wave.open(debug_filename, 'wb') as wav_file:
                wav_file.setnchannels(1)
                wav_file.setsampwidth(2)
                wav_file.setframerate(16000)
                wav_file.writeframes(samples_array.tobytes())
            
            print(f"💾 Debug audio saved to: {debug_filename}")
            
    async def record_and_analyze(self, duration=5):
        """Record audio and analyze the data stream"""
        print(f"🎵 Recording for {duration} seconds for analysis...")
        
        await self.client.start_notify(AUDIO_DATA_CHAR_UUID, self.packet_handler)
        await asyncio.sleep(duration)
        await self.client.stop_notify(AUDIO_DATA_CHAR_UUID)
        
        print("🛑 Recording stopped")
        self.analyze_data_stream()

async def main():
    analyzer = AudioAnalyzer()
    
    try:
        if await analyzer.scan_and_connect():
            await analyzer.record_and_analyze(5)  # 5 second analysis
        
    except Exception as e:
        print(f"❌ Error: {e}")
    
    finally:
        if analyzer.client:
            await analyzer.client.disconnect()

if __name__ == "__main__":
    print("🔍 Audio Data Stream Analyzer")
    print("This will analyze the raw data format from your Xiao board")
    print("=" * 60)
    
    asyncio.run(main())
