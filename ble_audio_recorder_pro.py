#!/usr/bin/env python3
"""
Professional BLE Audio Recorder with Real-time Pitch Correction
Integrates pitch_shifter_pro.py logic for high-quality audio processing.

Features:
- Real-time pitch correction during BLE streaming
- Professional librosa-based pitch shifting
- Optimized for nRF52840 16kHz audio streams
- Minimal latency processing
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
    LIBROSA_AVAILABLE = True
except ImportError:
    LIBROSA_AVAILABLE = False
    print("Warning: librosa not available. Install with: pip install librosa")

try:
    from bleak import BleakClient, BleakScanner
except ImportError:
    print("Error: bleak not installed. Install with: pip install bleak")
    exit(1)

# BLE Configuration
AUDIO_SERVICE_UUID = "12345678-1234-5678-9abc-def012345678"
AUDIO_CHAR_UUID = "87654321-4321-8765-cba9-fedcba987654"

# Audio Configuration
SAMPLE_RATE = 16000  # nRF52840 DMIC sample rate
CHANNELS = 1         # Mono audio
SAMPLE_WIDTH = 2     # 16-bit samples
CHUNK_SIZE = 320     # 160 samples * 2 bytes = 320 bytes per BLE packet

class PitchShiftProcessor:
    """Real-time pitch shifting processor using librosa logic from pitch_shifter_pro.py"""
    
    def __init__(self, semitones=0, buffer_size=1024):
        self.semitones = semitones
        self.buffer_size = buffer_size
        self.audio_buffer = np.array([], dtype=np.int16)
        
        if not LIBROSA_AVAILABLE:
            print("Warning: Pitch shifting disabled (librosa not available)")
            self.semitones = 0
    
    def process_chunk(self, chunk_data):
        """
        Process audio chunk with pitch shifting (from pitch_shifter_pro.py logic)
        
        Args:
            chunk_data: Raw bytes from BLE
        Returns:
            Processed int16 numpy array
        """
        if len(chunk_data) == 0:
            return np.array([], dtype=np.int16)
        
        # Convert bytes to int16 samples (little-endian)
        samples = np.frombuffer(chunk_data, dtype=np.int16)
        
        # Apply pitch shifting if enabled and librosa available
        if self.semitones != 0 and LIBROSA_AVAILABLE:
            return self._pitch_shift_ble_audio(samples)
        else:
            return samples
    
    def _pitch_shift_ble_audio(self, audio_data):
        """
        Process audio chunks from nRF52840 BLE stream (from pitch_shifter_pro.py)
        Optimized for 16kHz audio streams.
        """
        if self.semitones == 0:
            return audio_data
        
        # Convert int16 to float32 for processing
        audio_float = audio_data.astype(np.float32) / 32768.0
        
        # Buffer management for better quality
        self.audio_buffer = np.concatenate([self.audio_buffer, audio_data])
        
        # Process when we have enough samples
        if len(self.audio_buffer) >= self.buffer_size:
            # Take buffer for processing
            process_samples = self.audio_buffer[:self.buffer_size].astype(np.float32) / 32768.0
            
            # Apply librosa pitch shifting (from pitch_shifter_pro.py)
            try:
                shifted = librosa.effects.pitch_shift(
                    process_samples, 
                    sr=SAMPLE_RATE, 
                    n_steps=self.semitones,
                    hop_length=256,  # Smaller hop for lower latency
                    res_type='kaiser_fast'  # Faster processing for real-time
                )
                
                # Convert back to int16
                result = (shifted * 32767).astype(np.int16)
                
                # Update buffer (keep remaining samples)
                self.audio_buffer = self.audio_buffer[len(result):]
                
                return result
                
            except Exception as e:
                print(f"Pitch shift error: {e}")
                # Return original data on error
                result = self.audio_buffer[:len(audio_data)]
                self.audio_buffer = self.audio_buffer[len(result):]
                return result
        else:
            # Not enough samples yet, return original
            return audio_data

class BLEAudioRecorder:
    def __init__(self, device_name="AudioStreamer", pitch_semitones=0):
        self.device_name = device_name
        self.client = None
        self.audio_data = []
        self.is_recording = False
        self.start_time = None
        self.packet_count = 0
        
        # Initialize pitch processor with logic from pitch_shifter_pro.py
        self.pitch_processor = PitchShiftProcessor(semitones=pitch_semitones)
        
        print(f"🎤 BLE Audio Recorder initialized")
        if pitch_semitones != 0:
            print(f"🎵 Pitch correction: {pitch_semitones:+.1f} semitones")
        else:
            print("🎵 No pitch correction applied")

    async def find_device(self):
        """Scan for the BLE audio device"""
        print("🔍 Scanning for BLE devices...")
        devices = await BleakScanner.discover(timeout=10.0)
        
        for device in devices:
            name = getattr(device, 'name', None) or 'Unknown'
            if self.device_name.lower() in name.lower() or "micstreamer" in name.lower():
                print(f"✅ Found device: {name} ({device.address})")
                return device
        
        print(f"❌ Device '{self.device_name}' not found")
        return None

    def audio_notification_handler(self, sender, data):
        """Handle incoming BLE audio data with pitch processing"""
        if not self.is_recording:
            return
        
        self.packet_count += 1
        
        # Process audio chunk with pitch shifting (using pitch_shifter_pro.py logic)
        processed_samples = self.pitch_processor.process_chunk(data)
        
        # Add to recording buffer
        self.audio_data.extend(processed_samples)
        
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

    async def record_audio(self, duration_seconds=10):
        """Record audio for specified duration with pitch correction"""
        print(f"🎵 Starting {duration_seconds}s recording with pitch processing...")
        
        self.audio_data = []
        self.packet_count = 0
        self.is_recording = True
        self.start_time = time.time()
        
        # Record for specified duration
        await asyncio.sleep(duration_seconds)
        
        self.is_recording = False
        actual_duration = time.time() - self.start_time
        
        print(f"✅ Recording complete!")
        print(f"📊 Duration: {actual_duration:.2f}s")
        print(f"📦 Packets: {self.packet_count}")
        print(f"📈 Rate: {self.packet_count/actual_duration:.1f} packets/sec")
        
        return np.array(self.audio_data, dtype=np.int16)

    def save_wav(self, audio_data, filename=None):
        """Save processed audio to WAV file"""
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            pitch_suffix = f"_pitch{self.pitch_processor.semitones:+.1f}" if self.pitch_processor.semitones != 0 else ""
            filename = f"xiao_mic_pro{pitch_suffix}_{timestamp}.wav"
        
        # Calculate actual sample rate from streaming
        if self.start_time:
            actual_duration = time.time() - self.start_time
            calculated_rate = len(audio_data) / actual_duration
            
            # Use 16kHz if close to target, otherwise use calculated rate
            if abs(calculated_rate - SAMPLE_RATE) / SAMPLE_RATE < 0.1:
                save_rate = SAMPLE_RATE
                print(f"📊 Using target sample rate: {save_rate} Hz")
            else:
                save_rate = int(calculated_rate)
                print(f"📊 Using calculated sample rate: {save_rate} Hz")
        else:
            save_rate = SAMPLE_RATE
        
        # Save WAV file
        with wave.open(filename, 'wb') as wav_file:
            wav_file.setnchannels(CHANNELS)
            wav_file.setsampwidth(SAMPLE_WIDTH)
            wav_file.setframerate(save_rate)
            wav_file.writeframes(audio_data.tobytes())
        
        file_size = os.path.getsize(filename)
        duration = len(audio_data) / save_rate
        
        print(f"💾 Saved: {filename}")
        print(f"📊 File size: {file_size/1024:.1f} KB")
        print(f"📊 Duration: {duration:.2f} seconds")
        print(f"📊 Sample rate: {save_rate} Hz")
        if self.pitch_processor.semitones != 0:
            print(f"🎵 Pitch correction applied: {self.pitch_processor.semitones:+.1f} semitones")
        
        return filename

    async def disconnect(self):
        """Disconnect from BLE device"""
        if self.client and self.client.is_connected:
            await self.client.disconnect()
            print("🔌 Disconnected from device")

async def main():
    """Main function with professional pitch correction"""
    print("=== Professional BLE Audio Recorder ===")
    print("Using pitch_shifter_pro.py logic for high-quality processing")
    print()
    
    # Get pitch correction setting
    try:
        pitch_input = input("Enter pitch correction in semitones (0 for none, +2 for higher, -2 for lower): ").strip()
        pitch_semitones = float(pitch_input) if pitch_input else 0
    except ValueError:
        pitch_semitones = 0
        print("Using no pitch correction")
    
    # Get recording duration
    try:
        duration_input = input("Enter recording duration in seconds [10]: ").strip()
        duration = int(duration_input) if duration_input else 10
    except ValueError:
        duration = 10
        print("Using default duration: 10 seconds")
    
    recorder = BLEAudioRecorder(pitch_semitones=pitch_semitones)
    
    try:
        # Find and connect to device
        device = await recorder.find_device()
        if not device:
            return
        
        await recorder.connect_and_setup(device)
        
        # Record audio with pitch processing
        audio_data = await recorder.record_audio(duration)
        
        if len(audio_data) > 0:
            # Save processed audio
            filename = recorder.save_wav(audio_data)
            print(f"✅ Professional audio recording complete: {filename}")
        else:
            print("❌ No audio data received")
    
    except KeyboardInterrupt:
        print("\n⏹️ Recording stopped by user")
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        await recorder.disconnect()

if __name__ == "__main__":
    # Check dependencies
    if not LIBROSA_AVAILABLE:
        print("⚠️ For pitch correction, install librosa:")
        print("pip install librosa")
        print("Continuing without pitch correction...")
        print()
    
    asyncio.run(main())
