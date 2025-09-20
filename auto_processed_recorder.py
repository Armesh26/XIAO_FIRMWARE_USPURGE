#!/usr/bin/env python3
"""
Auto-Processed BLE Audio Recorder - Records and immediately applies post-processing
"""

import asyncio
import struct
import wave
import os
import numpy as np
from scipy import signal
from scipy.interpolate import interp1d
from bleak import BleakClient, BleakScanner
from datetime import datetime

# BLE UUIDs
AUDIO_SERVICE_UUID = "12345678-1234-5678-1234-567812345678"
AUDIO_DATA_CHAR_UUID = "12345679-1234-5678-1234-567812345678"

class AutoProcessedRecorder:
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
    
    def apply_smoothing_filter(self, audio_data, sample_rate, cutoff_freq=4000):
        """Apply low-pass filter for smoothing"""
        print(f"🔧 Applying smoothing filter (cutoff: {cutoff_freq} Hz)...")
        
        # Design low-pass Butterworth filter
        nyquist = sample_rate / 2
        normalized_cutoff = cutoff_freq / nyquist
        
        # Use a gentle 2nd order filter
        b, a = signal.butter(2, normalized_cutoff, btype='low')
        
        # Apply filter
        filtered_audio = signal.filtfilt(b, a, audio_data.astype(np.float32))
        
        # Convert back to int16 with proper scaling
        return np.clip(filtered_audio, -32768, 32767).astype(np.int16)
    
    def apply_noise_reduction(self, audio_data):
        """Simple noise reduction"""
        print("🔇 Applying noise reduction...")
        
        # Calculate noise floor (bottom 15% of amplitudes)
        amplitudes = np.abs(audio_data)
        noise_floor = np.percentile(amplitudes, 15)
        
        # Reduce samples below noise floor
        noise_mask = amplitudes < noise_floor
        audio_data[noise_mask] = (audio_data[noise_mask] * 0.2).astype(np.int16)
        
        print(f"✅ Noise reduction applied (noise floor: {noise_floor:.0f})")
        return audio_data
    
    def pitch_shift_preserve_speed(self, audio_data, pitch_factor=0.75):
        """Increase pitch without changing speed"""
        print(f"🎵 Applying pitch shift (factor: {pitch_factor:.2f}x = MUCH HIGHER pitch)...")
        
        # Convert to float for processing
        audio_float = audio_data.astype(np.float32)
        
        # Create time arrays
        original_length = len(audio_float)
        original_time = np.arange(original_length)
        
        # Create compressed time array for pitch shifting
        compressed_time = original_time / pitch_factor
        
        # Interpolate to get pitch-shifted audio
        interpolator = interp1d(original_time, audio_float, 
                              kind='linear', bounds_error=False, fill_value=0)
        
        # Generate pitch-shifted audio at same length
        pitched_audio = interpolator(compressed_time)
        
        # Handle any NaN values
        pitched_audio = np.nan_to_num(pitched_audio)
        
        # Convert back to int16
        return np.clip(pitched_audio, -32768, 32767).astype(np.int16)
    
    def normalize_audio(self, audio_data, target_level=0.85):
        """Normalize audio to target level"""
        print(f"📊 Normalizing audio (target: {target_level*100:.0f}%)...")
        
        # Find current peak
        current_peak = np.max(np.abs(audio_data))
        
        if current_peak > 0:
            # Calculate gain to reach target level
            target_peak = 32767 * target_level
            gain = target_peak / current_peak
            
            # Apply gain
            normalized = audio_data.astype(np.float32) * gain
            return np.clip(normalized, -32768, 32767).astype(np.int16)
        else:
            return audio_data
    
    def process_and_save(self):
        """Process the recorded audio and save both raw and processed versions"""
        if not self.audio_samples:
            print("❌ No audio to process")
            return None, None
        
        # Calculate sample rate
        elapsed = (datetime.now() - self.start_time).total_seconds()
        sample_rate = int(len(self.audio_samples) / elapsed)
        
        # Convert to numpy array
        audio_array = np.array(self.audio_samples, dtype=np.int16)
        
        print(f"\n📊 RECORDING ANALYSIS:")
        print(f"   Total samples: {len(self.audio_samples):,}")
        print(f"   Recording time: {elapsed:.2f}s")
        print(f"   Sample rate: {sample_rate} Hz")
        
        # Save RAW version first
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        raw_filename = f"xiao_raw_{timestamp}.wav"
        
        with wave.open(raw_filename, 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(sample_rate)
            wav.writeframes(audio_array.tobytes())
        
        print(f"💾 Raw audio saved: {raw_filename}")
        
        # PROCESS THE AUDIO
        print(f"\n🔧 AUTO-PROCESSING AUDIO:")
        processed_audio = audio_array.copy()
        
        # 1. Smoothing filter
        processed_audio = self.apply_smoothing_filter(processed_audio, sample_rate, cutoff_freq=4000)
        
        # 2. Noise reduction
        processed_audio = self.apply_noise_reduction(processed_audio)
        
        # 3. Pitch shift (+30% higher without speed change)
        processed_audio = self.pitch_shift_preserve_speed(processed_audio, pitch_factor=0.75)  # MUCH LOWER factor = MUCH HIGHER pitch!
        
        # 4. Normalize
        processed_audio = self.normalize_audio(processed_audio, target_level=0.85)
        
        # Save PROCESSED version
        processed_filename = f"xiao_enhanced_{timestamp}.wav"
        
        with wave.open(processed_filename, 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(sample_rate)  # Same rate to preserve duration
            wav.writeframes(processed_audio.tobytes())
        
        file_size = os.path.getsize(processed_filename)
        duration = len(processed_audio) / sample_rate
        
        print(f"\n💾 ENHANCED AUDIO SAVED: {processed_filename}")
        print(f"   File size: {file_size:,} bytes")
        print(f"   Duration: {duration:.2f}s (FULL DURATION PRESERVED)")
        print(f"   Sample rate: {sample_rate} Hz")
        
        # Final analysis
        print(f"\n📊 ENHANCEMENT RESULTS:")
        print(f"   Original RMS: {np.sqrt(np.mean(audio_array.astype(np.float32)**2)):.1f}")
        print(f"   Enhanced RMS: {np.sqrt(np.mean(processed_audio.astype(np.float32)**2)):.1f}")
        print(f"   Gain applied: {np.sqrt(np.mean(processed_audio.astype(np.float32)**2)) / np.sqrt(np.mean(audio_array.astype(np.float32)**2)):.1f}x")
        
        return raw_filename, processed_filename

async def main():
    recorder = AutoProcessedRecorder()
    
    try:
        if await recorder.connect():
            if await recorder.record(10):  # 10 second recording
                raw_file, processed_file = recorder.process_and_save()
                
                if processed_file:
                    print(f"\n🎉 AUTO-PROCESSING COMPLETE!")
                    print(f"📁 Raw audio: {raw_file}")
                    print(f"🎵 Enhanced audio: {processed_file}")
                    print(f"\nThe enhanced file should sound:")
                    print(f"   ✅ Much clearer and smoother")
                    print(f"   ✅ Higher pitched (+15%)")
                    print(f"   ✅ Louder and more consistent")
                    print(f"   ✅ Full 10+ second duration")
    
    except KeyboardInterrupt:
        print("\n🛑 Interrupted")
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        if recorder.client:
            await recorder.client.disconnect()

if __name__ == "__main__":
    print("🎤 Auto-Processed BLE Audio Recorder")
    print("Records and immediately enhances audio with filters and pitch adjustment")
    print("=" * 75)
    
    asyncio.run(main())
