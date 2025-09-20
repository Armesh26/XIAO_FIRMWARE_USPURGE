#!/usr/bin/env python3
"""
Simple BLE Audio Recorder - Creates properly formatted WAV files
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

class SimpleAudioRecorder:
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
            if device.name and ("AudioStreamer" in device.name or "MicStreamer" in device.name):
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
        """Handle audio packets"""
        if not self.recording:
            return
            
        self.packet_count += 1
        
        # Convert bytes to 16-bit signed samples
        if len(data) >= 2:
            samples = struct.unpack(f'<{len(data)//2}h', data)
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
    
    def save_wav(self, filename=None):
        """Save audio as WAV file with calculated sample rate"""
        if not self.audio_samples:
            print("❌ No audio to save")
            return None
        
        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"xiao_mic_{timestamp}.wav"
        
        # Calculate actual sample rate from recording
        elapsed = (datetime.now() - self.start_time).total_seconds()
        actual_sample_rate = int(len(self.audio_samples) / elapsed)
        
        print(f"📊 Audio info:")
        print(f"   Samples: {len(self.audio_samples):,}")
        print(f"   Recording time: {elapsed:.2f}s")
        print(f"   Calculated sample rate: {actual_sample_rate} Hz")
        
        try:
            # Ensure we have valid audio data
            audio_array = np.array(self.audio_samples, dtype=np.int16)
            
            # Basic audio validation
            if len(audio_array) == 0:
                print("❌ No audio data")
                return None
                
            # Create WAV file with proper parameters
            with wave.open(filename, 'wb') as wav:
                wav.setnchannels(1)        # Mono
                wav.setsampwidth(2)        # 16-bit
                wav.setframerate(actual_sample_rate)  # Calculated rate
                wav.writeframes(audio_array.tobytes())
            
            # Verify file was created
            file_size = os.path.getsize(filename)
            wav_duration = len(self.audio_samples) / actual_sample_rate
            
            print(f"💾 WAV file created: {filename}")
            print(f"   File size: {file_size:,} bytes")
            print(f"   WAV duration: {wav_duration:.2f} seconds")
            print(f"   Sample rate: {actual_sample_rate} Hz")
            
            return filename
            
        except Exception as e:
            print(f"❌ Error creating WAV: {e}")
            return None

async def main():
    recorder = SimpleAudioRecorder()
    
    try:
        if await recorder.connect():
            if await recorder.record(10):  # 10 second recording
                filename = recorder.save_wav()
                if filename:
                    print(f"\n🎵 SUCCESS! Try playing: {filename}")
                    print("The audio should now play at correct speed!")
    
    except KeyboardInterrupt:
        print("\n🛑 Interrupted")
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        if recorder.client:
            await recorder.client.disconnect()

if __name__ == "__main__":
    print("🎤 Simple BLE Audio Recorder")
    print("Creates properly formatted WAV files")
    print("=" * 40)
    
    asyncio.run(main())
