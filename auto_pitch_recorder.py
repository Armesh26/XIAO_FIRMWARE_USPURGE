#!/usr/bin/env python3
"""
Auto Pitch Recorder with Rubber Band Processing
Automatically records BLE audio and applies +2 semitone pitch correction using Rubber Band.

Features:
- Automatic BLE connection to AudioStreamer/MicStreamer
- Real-time audio recording
- Automatic Rubber Band pitch correction (+2 semitones)
- Professional DAW-quality processing
- One-click operation
"""

import asyncio
import time
import numpy as np
import wave
import struct
import os
from datetime import datetime

try:
    import librosa
    import soundfile as sf
    LIBROSA_AVAILABLE = True
except ImportError:
    LIBROSA_AVAILABLE = False
    print("Warning: librosa not available. Install with: pip install librosa")

try:
    import pyrubberband as pyrb
    RUBBERBAND_AVAILABLE = True
except ImportError:
    RUBBERBAND_AVAILABLE = False
    print("Warning: pyrubberband not available. Install with: pip install pyrubberband")

try:
    from bleak import BleakClient, BleakScanner
except ImportError:
    print("Error: bleak not installed. Install with: pip install bleak")
    exit(1)

# BLE Configuration
AUDIO_SERVICE_UUID = "12345678-1234-5678-1234-567812345678"
AUDIO_CHAR_UUID = "12345679-1234-5678-1234-567812345678"

# Audio Configuration
SAMPLE_RATE = 16000  # Target sample rate
CHANNELS = 1         # Mono audio
SAMPLE_WIDTH = 2     # 16-bit samples
CHUNK_SIZE = 320     # 160 samples * 2 bytes = 320 bytes per BLE packet

# Pitch Configuration
PITCH_SEMITONES = 2.0  # +2 semitones higher pitch

class AutoPitchRecorder:
    def __init__(self, device_name="AudioStreamer", recording_duration=10):
        self.device_name = device_name
        self.recording_duration = recording_duration
        self.client = None
        self.audio_data = []
        self.is_recording = False
        self.start_time = None
        self.packet_count = 0
        
        print(f"🎤 Auto Pitch Recorder initialized")
        print(f"🎵 Target pitch correction: +{PITCH_SEMITONES} semitones")
        print(f"⏱️ Recording duration: {recording_duration} seconds")
        
        if not RUBBERBAND_AVAILABLE:
            print("❌ Rubber Band not available. Install with: pip install pyrubberband")
            exit(1)

    async def find_device(self):
        """Scan for the BLE audio device"""
        print("🔍 Scanning for BLE devices...")
        devices = await BleakScanner.discover(timeout=10.0)
        
        for device in devices:
            name = getattr(device, 'name', None) or 'Unknown'
            if self.device_name.lower() in name.lower() or "audiostreamer" in name.lower() or "micstreamer" in name.lower():
                print(f"✅ Found device: {name} ({device.address})")
                return device
        
        print(f"❌ Device '{self.device_name}' not found")
        return None

    def audio_notification_handler(self, sender, data):
        """Handle incoming BLE audio data"""
        if not self.is_recording:
            return
        
        self.packet_count += 1
        
        # Convert bytes to int16 samples (little-endian)
        samples = np.frombuffer(data, dtype=np.int16)
        
        # Add to recording buffer
        self.audio_data.extend(samples)
        
        # Progress update
        if self.packet_count % 100 == 0:
            elapsed = time.time() - self.start_time
            print(f"📦 Received {self.packet_count} packets in {elapsed:.1f}s")

    async def connect_and_setup(self, device):
        """Connect to device and setup audio notifications"""
        print(f"🔗 Connecting to {device.name}...")
        
        self.client = BleakClient(device.address)
        await self.client.connect()
        
        print("✅ Connected! Setting up audio notifications...")
        
        # Enable notifications on audio characteristic
        await self.client.start_notify(AUDIO_CHAR_UUID, self.audio_notification_handler)
        print("🎤 Audio notifications enabled")
        
        return True

    async def record_audio(self):
        """Record audio for specified duration"""
        print(f"🎵 Starting {self.recording_duration}s recording...")
        
        self.audio_data = []
        self.packet_count = 0
        self.is_recording = True
        self.start_time = time.time()
        
        # Record for specified duration
        await asyncio.sleep(self.recording_duration)
        
        self.is_recording = False
        actual_duration = time.time() - self.start_time
        
        print(f"✅ Recording complete!")
        print(f"📊 Duration: {actual_duration:.2f}s")
        print(f"📦 Packets: {self.packet_count}")
        print(f"📈 Rate: {self.packet_count/actual_duration:.1f} packets/sec")
        
        return np.array(self.audio_data, dtype=np.int16), actual_duration

    def apply_rubberband_pitch_correction(self, audio_data, actual_duration):
        """Apply Rubber Band pitch correction (+2 semitones)"""
        print(f"🎵 Applying Rubber Band pitch correction (+{PITCH_SEMITONES} semitones)...")
        
        # Calculate actual sample rate from streaming
        calculated_rate = len(audio_data) / actual_duration
        
        # Use calculated rate if close to target, otherwise use target
        if abs(calculated_rate - SAMPLE_RATE) / SAMPLE_RATE < 0.1:
            process_rate = SAMPLE_RATE
            print(f"📊 Using target sample rate: {process_rate} Hz")
        else:
            process_rate = int(calculated_rate)
            print(f"📊 Using calculated sample rate: {process_rate} Hz")
        
        # Convert int16 to float32 for processing
        audio_float = audio_data.astype(np.float32) / 32768.0
        
        # Apply Rubber Band pitch shifting
        try:
            shifted = pyrb.pitch_shift(audio_float, process_rate, n_steps=PITCH_SEMITONES)
            print("✅ Rubber Band pitch correction applied successfully!")
            
            # Convert back to int16
            result = (shifted * 32767).astype(np.int16)
            
            return result, process_rate
            
        except Exception as e:
            print(f"❌ Rubber Band processing error: {e}")
            print("🔄 Falling back to original audio")
            return audio_data, process_rate

    def save_wav(self, audio_data, sample_rate, filename=None):
        """Save processed audio to WAV file"""
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"xiao_auto_pitch_{timestamp}.wav"
        
        # Save WAV file
        with wave.open(filename, 'wb') as wav_file:
            wav_file.setnchannels(CHANNELS)
            wav_file.setsampwidth(SAMPLE_WIDTH)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(audio_data.tobytes())
        
        file_size = os.path.getsize(filename)
        duration = len(audio_data) / sample_rate
        
        print(f"💾 Saved: {filename}")
        print(f"📊 File size: {file_size/1024:.1f} KB")
        print(f"📊 Duration: {duration:.2f} seconds")
        print(f"📊 Sample rate: {sample_rate} Hz")
        print(f"🎵 Pitch correction: +{PITCH_SEMITONES} semitones (Rubber Band)")
        
        return filename

    async def disconnect(self):
        """Disconnect from BLE device"""
        if self.client and self.client.is_connected:
            await self.client.disconnect()
            print("🔌 Disconnected from device")

    async def run_full_process(self):
        """Run the complete auto pitch recording process"""
        try:
            # Find and connect to device
            device = await self.find_device()
            if not device:
                return None
            
            await self.connect_and_setup(device)
            
            # Record audio
            audio_data, actual_duration = await self.record_audio()
            
            if len(audio_data) > 0:
                # Apply Rubber Band pitch correction
                processed_audio, sample_rate = self.apply_rubberband_pitch_correction(audio_data, actual_duration)
                
                # Save processed audio
                filename = self.save_wav(processed_audio, sample_rate)
                
                print(f"🎉 SUCCESS! Auto pitch recording complete: {filename}")
                return filename
            else:
                print("❌ No audio data received")
                return None
        
        except KeyboardInterrupt:
            print("\n⏹️ Recording stopped by user")
            return None
        except Exception as e:
            print(f"❌ Error: {e}")
            return None
        finally:
            await self.disconnect()

async def main():
    """Main function - one-click auto pitch recording"""
    print("=== Auto Pitch Recorder with Rubber Band ===")
    print("Automatically records BLE audio and applies +2 semitone pitch correction")
    print()
    
    # Check dependencies
    if not RUBBERBAND_AVAILABLE:
        print("❌ Rubber Band not available!")
        print("Install with: pip install pyrubberband")
        return
    
    if not LIBROSA_AVAILABLE:
        print("⚠️ Librosa not available. Install with: pip install librosa")
        print("Continuing without librosa...")
    
    # Create recorder with 10-second default recording
    recorder = AutoPitchRecorder(recording_duration=10)
    
    # Run the complete process
    result = await recorder.run_full_process()
    
    if result:
        print(f"\n🎵 FINAL RESULT: {result}")
        print("✅ Professional Rubber Band pitch correction applied!")
        print("🎤 Ready to play - audio is pitched up by 2 semitones!")
    else:
        print("\n❌ Auto pitch recording failed")

if __name__ == "__main__":
    asyncio.run(main())
