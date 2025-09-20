#!/usr/bin/env python3
"""
Pitch Corrected Audio Recorder - Saves audio at correct 16kHz rate for proper pitch
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

class PitchCorrectedRecorder:
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
        """Handle audio packets with proper int16_t interpretation"""
        if not self.recording:
            return
            
        self.packet_count += 1
        
        # Interpret as little-endian int16_t samples
        if len(data) >= 2 and len(data) % 2 == 0:
            samples = struct.unpack(f'<{len(data)//2}h', data)
            self.audio_samples.extend(samples)
            
            # Show progress every 100 packets (less spam)
            if self.packet_count % 100 == 0:
                elapsed = (datetime.now() - self.start_time).total_seconds()
                ble_sample_rate = len(self.audio_samples) / elapsed
                print(f"📦 {self.packet_count} packets, {len(self.audio_samples)} samples, "
                      f"BLE rate: {ble_sample_rate:.0f} Hz")
    
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
    
    def save_corrected_audio(self, filename=None):
        """Save audio with CORRECTED sample rate for proper pitch"""
        if not self.audio_samples:
            print("❌ No audio to save")
            return None
        
        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"xiao_corrected_{timestamp}.wav"
        
        # Calculate BLE streaming rate
        elapsed = (datetime.now() - self.start_time).total_seconds()
        ble_sample_rate = int(len(self.audio_samples) / elapsed)
        
        # Use the ACTUAL DMIC rate (16kHz) for correct pitch
        corrected_sample_rate = 16000
        
        # Convert to numpy array
        audio_array = np.array(self.audio_samples, dtype=np.int16)
        
        print(f"\n📊 PITCH CORRECTION ANALYSIS:")
        print(f"   Total samples: {len(self.audio_samples):,}")
        print(f"   Recording time: {elapsed:.2f}s")
        print(f"   BLE streaming rate: {ble_sample_rate} Hz")
        print(f"   DMIC actual rate: 16,000 Hz")
        print(f"   Efficiency: {(ble_sample_rate/16000)*100:.1f}%")
        
        print(f"\n🎵 PITCH CORRECTION:")
        print(f"   Saving as: {corrected_sample_rate} Hz (correct DMIC rate)")
        print(f"   This will play at CORRECT pitch and tempo!")
        
        # Audio quality analysis
        print(f"\n📊 Audio quality:")
        print(f"   Min: {np.min(audio_array)}, Max: {np.max(audio_array)}")
        print(f"   Mean: {np.mean(audio_array):.1f}")
        print(f"   RMS: {np.sqrt(np.mean(audio_array.astype(np.float32)**2)):.1f}")
        
        try:
            # Create WAV file with CORRECTED 16kHz sample rate
            with wave.open(filename, 'wb') as wav:
                wav.setnchannels(1)        # Mono
                wav.setsampwidth(2)        # 16-bit
                wav.setframerate(corrected_sample_rate)  # 16kHz for correct pitch!
                wav.writeframes(audio_array.tobytes())
            
            file_size = os.path.getsize(filename)
            corrected_duration = len(self.audio_samples) / corrected_sample_rate
            
            print(f"\n💾 PITCH-CORRECTED WAV FILE: {filename}")
            print(f"   File size: {file_size:,} bytes")
            print(f"   Sample rate: {corrected_sample_rate} Hz (CORRECTED)")
            print(f"   Playback duration: {corrected_duration:.2f}s (at correct pitch)")
            
            return filename
            
        except Exception as e:
            print(f"❌ Error creating WAV: {e}")
            return None

async def main():
    recorder = PitchCorrectedRecorder()
    
    try:
        if await recorder.connect():
            if await recorder.record(10):  # 10 second recording
                filename = recorder.save_corrected_audio()
                if filename:
                    print(f"\n🎵 SUCCESS! PITCH-CORRECTED AUDIO: {filename}")
                    print("This should now play at CORRECT pitch and tempo!")
                    print("Audio will sound natural, not slow or low-pitched!")
    
    except KeyboardInterrupt:
        print("\n🛑 Interrupted")
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        if recorder.client:
            await recorder.client.disconnect()

if __name__ == "__main__":
    print("🎵 Pitch Corrected BLE Audio Recorder")
    print("Saves audio at correct 16kHz rate for proper pitch")
    print("=" * 55)
    
    asyncio.run(main())
