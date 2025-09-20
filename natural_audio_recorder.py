#!/usr/bin/env python3
"""
Natural Audio Recorder - Saves audio at the actual streaming rate for natural playback
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

class NaturalAudioRecorder:
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
        """Handle audio packets"""
        if not self.recording:
            return
            
        self.packet_count += 1
        
        # Interpret as little-endian int16_t samples
        if len(data) >= 2 and len(data) % 2 == 0:
            samples = struct.unpack(f'<{len(data)//2}h', data)
            self.audio_samples.extend(samples)
            
            # Show progress every 100 packets
            if self.packet_count % 100 == 0:
                elapsed = (datetime.now() - self.start_time).total_seconds()
                current_rate = len(self.audio_samples) / elapsed
                print(f"📦 {self.packet_count} packets, {len(self.audio_samples)} samples, "
                      f"Rate: {current_rate:.0f} Hz")
    
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
    
    def save_natural_audio(self, filename=None):
        """Save audio at the ACTUAL streaming rate for natural playback"""
        if not self.audio_samples:
            print("❌ No audio to save")
            return None
        
        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"xiao_natural_{timestamp}.wav"
        
        # Calculate the ACTUAL BLE streaming rate
        elapsed = (datetime.now() - self.start_time).total_seconds()
        actual_sample_rate = int(len(self.audio_samples) / elapsed)
        
        # Convert to numpy array
        audio_array = np.array(self.audio_samples, dtype=np.int16)
        
        print(f"\n📊 NATURAL AUDIO ANALYSIS:")
        print(f"   Total samples: {len(self.audio_samples):,}")
        print(f"   Recording time: {elapsed:.2f}s")
        print(f"   Actual BLE rate: {actual_sample_rate} Hz")
        print(f"   Using ACTUAL rate for natural playback")
        
        # Audio quality
        print(f"\n🎵 Audio quality:")
        print(f"   Min: {np.min(audio_array)}, Max: {np.max(audio_array)}")
        print(f"   Mean: {np.mean(audio_array):.1f}")
        print(f"   RMS: {np.sqrt(np.mean(audio_array.astype(np.float32)**2)):.1f}")
        print(f"   Dynamic range: {np.max(audio_array) - np.min(audio_array)}")
        
        try:
            # Create WAV file with ACTUAL streaming rate for natural playback
            with wave.open(filename, 'wb') as wav:
                wav.setnchannels(1)        # Mono
                wav.setsampwidth(2)        # 16-bit
                wav.setframerate(actual_sample_rate)  # Use actual BLE rate!
                wav.writeframes(audio_array.tobytes())
            
            file_size = os.path.getsize(filename)
            playback_duration = len(self.audio_samples) / actual_sample_rate
            
            print(f"\n💾 NATURAL AUDIO FILE: {filename}")
            print(f"   File size: {file_size:,} bytes")
            print(f"   Sample rate: {actual_sample_rate} Hz (natural)")
            print(f"   Playback duration: {playback_duration:.2f}s (natural speed)")
            
            return filename
            
        except Exception as e:
            print(f"❌ Error creating WAV: {e}")
            return None

async def main():
    recorder = NaturalAudioRecorder()
    
    try:
        if await recorder.connect():
            if await recorder.record(10):  # 10 second recording
                filename = recorder.save_natural_audio()
                if filename:
                    print(f"\n🎵 SUCCESS! NATURAL AUDIO: {filename}")
                    print("This should play at NATURAL speed - not too fast or slow!")
    
    except KeyboardInterrupt:
        print("\n🛑 Interrupted")
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        if recorder.client:
            await recorder.client.disconnect()

if __name__ == "__main__":
    print("🎵 Natural BLE Audio Recorder")
    print("Saves audio at actual streaming rate for natural playback")
    print("=" * 60)
    
    asyncio.run(main())
