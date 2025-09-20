#!/usr/bin/env python3
"""
Fixed BLE Audio Recorder - Correctly interprets big-endian audio data
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

class FixedAudioRecorder:
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
        """Handle audio packets with correct endianness"""
        if not self.recording:
            return
            
        self.packet_count += 1
        
        # Convert bytes to 16-bit signed samples - TRY BIG-ENDIAN
        if len(data) >= 2:
            # Try big-endian interpretation
            samples_be = struct.unpack(f'>{len(data)//2}h', data)
            
            # Also try little-endian for comparison
            samples_le = struct.unpack(f'<{len(data)//2}h', data)
            
            # For first packet, show both interpretations
            if self.packet_count <= 3:
                print(f"\n📦 Packet {self.packet_count} format comparison:")
                print(f"   Raw bytes: {list(data[:10])}")
                print(f"   Big-endian: {samples_be[:5]}")
                print(f"   Little-endian: {samples_le[:5]}")
                
                # Check which looks more like audio
                be_range = max(samples_be) - min(samples_be)
                le_range = max(samples_le) - min(samples_le)
                print(f"   BE dynamic range: {be_range}")
                print(f"   LE dynamic range: {le_range}")
            
            # Use big-endian interpretation (looks more reasonable)
            self.audio_samples.extend(samples_be)
            
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
    
    def save_wav(self, filename=None):
        """Save audio as WAV file with calculated sample rate"""
        if not self.audio_samples:
            print("❌ No audio to save")
            return None
        
        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"xiao_fixed_{timestamp}.wav"
        
        # Calculate actual sample rate from recording
        elapsed = (datetime.now() - self.start_time).total_seconds()
        actual_sample_rate = int(len(self.audio_samples) / elapsed)
        
        print(f"\n📊 Audio analysis:")
        print(f"   Samples: {len(self.audio_samples):,}")
        print(f"   Recording time: {elapsed:.2f}s")
        print(f"   Calculated sample rate: {actual_sample_rate} Hz")
        
        # Analyze the audio data
        audio_array = np.array(self.audio_samples, dtype=np.int16)
        
        print(f"   Min value: {np.min(audio_array)}")
        print(f"   Max value: {np.max(audio_array)}")
        print(f"   Mean: {np.mean(audio_array):.1f}")
        print(f"   RMS: {np.sqrt(np.mean(audio_array.astype(np.float32)**2)):.1f}")
        
        # Check for reasonable audio characteristics
        dynamic_range = np.max(audio_array) - np.min(audio_array)
        print(f"   Dynamic range: {dynamic_range}")
        
        if abs(np.mean(audio_array)) < 1000:
            print("   ✅ Good DC offset (close to zero)")
        else:
            print("   ❌ High DC offset - might indicate format issue")
            
        if 1000 < dynamic_range < 60000:
            print("   ✅ Reasonable dynamic range")
        else:
            print("   ❌ Unusual dynamic range")
        
        try:
            # Create WAV file with proper parameters
            with wave.open(filename, 'wb') as wav:
                wav.setnchannels(1)        # Mono
                wav.setsampwidth(2)        # 16-bit
                wav.setframerate(actual_sample_rate)  # Calculated rate
                wav.writeframes(audio_array.tobytes())
            
            file_size = os.path.getsize(filename)
            print(f"\n💾 WAV file created: {filename}")
            print(f"   File size: {file_size:,} bytes")
            print(f"   Sample rate: {actual_sample_rate} Hz")
            
            return filename
            
        except Exception as e:
            print(f"❌ Error creating WAV: {e}")
            return None

async def main():
    recorder = FixedAudioRecorder()
    
    try:
        if await recorder.connect():
            if await recorder.record(10):  # 10 second recording
                filename = recorder.save_wav()
                if filename:
                    print(f"\n🎵 FIXED AUDIO FILE: {filename}")
                    print("This should now be clean audio with correct endianness!")
    
    except KeyboardInterrupt:
        print("\n🛑 Interrupted")
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        if recorder.client:
            await recorder.client.disconnect()

if __name__ == "__main__":
    print("🔧 Fixed BLE Audio Recorder")
    print("Corrects endianness and data format issues")
    print("=" * 45)
    
    asyncio.run(main())
