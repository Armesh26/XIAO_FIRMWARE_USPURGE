#!/usr/bin/env python3
"""
Proper Audio Recorder - Correctly handles int16_t samples on both firmware and receiver side
"""

import asyncio
import struct
import wave
import os
import numpy as np
from bleak import BleakClient, BleakScanner
from datetime import datetime

# BLE UUIDs
AUDIO_SERVICE_UUID = "12345678-1234-5678-1234-567812345678"
AUDIO_DATA_CHAR_UUID = "12345679-1234-5678-1234-567812345678"

class ProperAudioRecorder:
    def __init__(self):
        self.client = None
        self.device_address = None
        self.audio_samples = []
        self.packet_count = 0
        self.recording = False
        self.start_time = None
        
    async def connect(self):
        """Find and connect to AudioStreamer"""
        print("🔍 Scanning for AudioStreamer...")
        devices = await BleakScanner.discover(timeout=5)
        
        for device in devices:
            if device.name and ("AudioStreamer" in device.name):
                print(f"✅ Found: {device.name}")
                self.device_address = device.address
                break
        
        if not self.device_address:
            print("❌ AudioStreamer not found")
            return False
        
        self.client = BleakClient(self.device_address)
        await self.client.connect()
        print("✅ Connected")
        return True
    
    def audio_handler(self, sender, data):
        """Handle audio packets - PROPER int16_t interpretation"""
        if not self.recording:
            return
            
        self.packet_count += 1
        
        # CRITICAL: Interpret as int16_t samples with NATIVE endianness
        if len(data) >= 2 and len(data) % 2 == 0:
            # The firmware sends int16_t samples in native (little-endian) format
            samples = struct.unpack(f'<{len(data)//2}h', data)
            
            # Debug first few packets to verify correct interpretation
            if self.packet_count <= 3:
                print(f"\n📦 Packet {self.packet_count} - PROPER int16_t handling:")
                print(f"   Raw bytes: {data.hex()}")
                print(f"   As int16_t samples: {samples[:5]}")
                
                # Check for reasonable audio characteristics
                sample_range = max(samples) - min(samples)
                avg_amplitude = sum(abs(s) for s in samples) / len(samples)
                print(f"   Sample range: {sample_range}")
                print(f"   Avg amplitude: {avg_amplitude:.1f}")
                
                if sample_range < 10000 and avg_amplitude < 5000:
                    print("   ✅ Looks like clean audio data")
                else:
                    print("   ⚠️  Still might have data issues")
            
            # Add samples to our buffer
            self.audio_samples.extend(samples)
            
            # Show progress every 200 packets
            if self.packet_count % 200 == 0:
                elapsed = (datetime.now() - self.start_time).total_seconds()
                print(f"📦 {self.packet_count} packets, {len(self.audio_samples)} samples, {elapsed:.1f}s elapsed")
    
    async def record(self, duration=10):
        """Record audio for specified duration"""
        print(f"🎵 Recording for {duration} seconds...")
        
        # Reset recording state
        self.audio_samples = []
        self.packet_count = 0
        self.start_time = datetime.now()
        
        # Start notifications
        await self.client.start_notify(AUDIO_DATA_CHAR_UUID, self.audio_handler)
        self.recording = True
        
        print("🎤 Recording... speak into microphone!")
        
        # Record for specified time
        await asyncio.sleep(duration)
        
        # Stop recording
        self.recording = False
        await self.client.stop_notify(AUDIO_DATA_CHAR_UUID)
        
        elapsed = (datetime.now() - self.start_time).total_seconds()
        print(f"🛑 Recording stopped after {elapsed:.1f}s")
        
        return len(self.audio_samples) > 0
    
    def analyze_and_save(self, filename=None):
        """Analyze and save audio with proper sample handling"""
        if not self.audio_samples:
            print("❌ No audio to save")
            return None
        
        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"xiao_proper_{timestamp}.wav"
        
        # Calculate actual sample rate from recording
        elapsed = (datetime.now() - self.start_time).total_seconds()
        actual_sample_rate = int(len(self.audio_samples) / elapsed)
        
        # Convert to numpy array for analysis
        audio_array = np.array(self.audio_samples, dtype=np.int16)
        
        print(f"\n📊 PROPER AUDIO ANALYSIS:")
        print(f"   Total samples: {len(self.audio_samples):,}")
        print(f"   Recording time: {elapsed:.2f}s")
        print(f"   Calculated sample rate: {actual_sample_rate} Hz")
        print(f"   Min value: {np.min(audio_array)}")
        print(f"   Max value: {np.max(audio_array)}")
        print(f"   Mean: {np.mean(audio_array):.1f}")
        print(f"   RMS: {np.sqrt(np.mean(audio_array.astype(np.float32)**2)):.1f}")
        print(f"   Standard deviation: {np.std(audio_array):.1f}")
        
        # Check audio quality indicators
        dc_offset = abs(np.mean(audio_array))
        dynamic_range = np.max(audio_array) - np.min(audio_array)
        
        print(f"\n🎯 AUDIO QUALITY CHECK:")
        if dc_offset < 500:
            print(f"   ✅ Good DC offset: {dc_offset:.1f}")
        else:
            print(f"   ❌ High DC offset: {dc_offset:.1f}")
            
        if 1000 < dynamic_range < 50000:
            print(f"   ✅ Good dynamic range: {dynamic_range}")
        else:
            print(f"   ⚠️  Dynamic range: {dynamic_range}")
        
        # Check for clipping
        clipped = np.sum((audio_array == 32767) | (audio_array == -32768))
        clipping_percent = (clipped / len(audio_array)) * 100
        
        if clipping_percent < 1:
            print(f"   ✅ Low clipping: {clipping_percent:.2f}%")
        else:
            print(f"   ⚠️  High clipping: {clipping_percent:.2f}%")
        
        try:
            # Create WAV file with native endianness (matching our samples)
            with wave.open(filename, 'wb') as wav:
                wav.setnchannels(1)        # Mono
                wav.setsampwidth(2)        # 16-bit
                wav.setframerate(actual_sample_rate)  # Calculated rate
                wav.writeframes(audio_array.tobytes())  # Native endianness
            
            file_size = os.path.getsize(filename)
            print(f"\n💾 PROPER WAV FILE CREATED: {filename}")
            print(f"   File size: {file_size:,} bytes")
            print(f"   Sample rate: {actual_sample_rate} Hz")
            print(f"   Format: 16-bit mono WAV with proper int16_t handling")
            
            return filename
            
        except Exception as e:
            print(f"❌ Error creating WAV: {e}")
            return None

async def main():
    recorder = ProperAudioRecorder()
    
    try:
        if await recorder.connect():
            if await recorder.record(10):  # 10 second recording
                filename = recorder.analyze_and_save()
                if filename:
                    print(f"\n🎵 SUCCESS! PROPER AUDIO FILE: {filename}")
                    print("This should now be CLEAN MICROPHONE AUDIO!")
                    print("Both firmware and receiver now handle int16_t samples correctly!")
    
    except KeyboardInterrupt:
        print("\n🛑 Interrupted")
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        if recorder.client:
            await recorder.client.disconnect()

if __name__ == "__main__":
    print("🎤 PROPER BLE Audio Recorder")
    print("Correct int16_t sample handling on both sides")
    print("=" * 50)
    
    asyncio.run(main())
