#!/usr/bin/env python3
"""
Pitch Adjusted Audio Recorder - 10 second duration with higher pitch
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

class PitchAdjustedRecorder:
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
    
    def save_pitch_adjusted_audio(self, filename=None):
        """Save audio with adjusted sample rate for better pitch"""
        if not self.audio_samples:
            print("❌ No audio to save")
            return None
        
        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"xiao_adjusted_{timestamp}.wav"
        
        # Calculate the actual BLE streaming rate
        elapsed = (datetime.now() - self.start_time).total_seconds()
        ble_sample_rate = int(len(self.audio_samples) / elapsed)
        
        # Use a HIGHER sample rate to increase pitch (between BLE rate and 16kHz)
        # This will make the audio play faster and higher pitched
        adjusted_sample_rate = int(ble_sample_rate * 1.3)  # 30% higher for better pitch
        
        # Convert to numpy array
        audio_array = np.array(self.audio_samples, dtype=np.int16)
        
        print(f"\n📊 PITCH ADJUSTMENT ANALYSIS:")
        print(f"   Total samples: {len(self.audio_samples):,}")
        print(f"   Recording time: {elapsed:.2f}s")
        print(f"   BLE streaming rate: {ble_sample_rate} Hz")
        print(f"   Adjusted rate: {adjusted_sample_rate} Hz (+30% for higher pitch)")
        
        # Calculate playback duration
        playback_duration = len(self.audio_samples) / adjusted_sample_rate
        print(f"   Playback duration: {playback_duration:.2f}s")
        
        # Audio quality
        print(f"\n🎵 Audio quality:")
        print(f"   Min: {np.min(audio_array)}, Max: {np.max(audio_array)}")
        print(f"   Mean: {np.mean(audio_array):.1f}")
        print(f"   RMS: {np.sqrt(np.mean(audio_array.astype(np.float32)**2)):.1f}")
        
        try:
            # Create WAV file with ADJUSTED sample rate for better pitch
            with wave.open(filename, 'wb') as wav:
                wav.setnchannels(1)        # Mono
                wav.setsampwidth(2)        # 16-bit
                wav.setframerate(adjusted_sample_rate)  # 30% higher for better pitch
                wav.writeframes(audio_array.tobytes())
            
            file_size = os.path.getsize(filename)
            
            print(f"\n💾 PITCH-ADJUSTED AUDIO FILE: {filename}")
            print(f"   File size: {file_size:,} bytes")
            print(f"   Sample rate: {adjusted_sample_rate} Hz (adjusted)")
            print(f"   Should sound higher pitched and more natural!")
            
            return filename
            
        except Exception as e:
            print(f"❌ Error creating WAV: {e}")
            return None

async def main():
    recorder = PitchAdjustedRecorder()
    
    try:
        if await recorder.connect():
            if await recorder.record(10):  # 10 second recording
                filename = recorder.save_pitch_adjusted_audio()
                if filename:
                    print(f"\n🎵 SUCCESS! PITCH-ADJUSTED AUDIO: {filename}")
                    print("This should sound more natural with better pitch!")
    
    except KeyboardInterrupt:
        print("\n🛑 Interrupted")
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        if recorder.client:
            await recorder.client.disconnect()

if __name__ == "__main__":
    print("🎵 Pitch Adjusted BLE Audio Recorder")
    print("Increases sample rate by 30% for higher, more natural pitch")
    print("=" * 65)
    
    asyncio.run(main())
