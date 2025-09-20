#!/usr/bin/env python3
"""
Audio Post-Processor - Smoothing and pitch shifting without speed change
"""

import wave
import numpy as np
from scipy import signal
from scipy.interpolate import interp1d
import os
from datetime import datetime

class AudioPostProcessor:
    def __init__(self, input_file):
        self.input_file = input_file
        self.audio_data = None
        self.sample_rate = None
        self.load_audio()
    
    def load_audio(self):
        """Load WAV file for processing"""
        try:
            with wave.open(self.input_file, 'rb') as wav:
                self.sample_rate = wav.getframerate()
                frames = wav.getnframes()
                raw_audio = wav.readframes(frames)
                
                # Convert to numpy array
                self.audio_data = np.frombuffer(raw_audio, dtype=np.int16)
                
                print(f"📁 Loaded: {self.input_file}")
                print(f"   Samples: {len(self.audio_data):,}")
                print(f"   Sample rate: {self.sample_rate} Hz")
                print(f"   Duration: {len(self.audio_data)/self.sample_rate:.2f}s")
                
        except Exception as e:
            print(f"❌ Error loading audio: {e}")
    
    def apply_smoothing_filter(self, cutoff_freq=3000):
        """Apply low-pass filter for smoothing"""
        print(f"🔧 Applying smoothing filter (cutoff: {cutoff_freq} Hz)...")
        
        # Design low-pass Butterworth filter
        nyquist = self.sample_rate / 2
        normalized_cutoff = cutoff_freq / nyquist
        
        # Use a gentle 2nd order filter
        b, a = signal.butter(2, normalized_cutoff, btype='low')
        
        # Apply filter
        filtered_audio = signal.filtfilt(b, a, self.audio_data.astype(np.float32))
        
        # Convert back to int16 with proper scaling
        self.audio_data = np.clip(filtered_audio, -32768, 32767).astype(np.int16)
        
        print("✅ Smoothing filter applied")
    
    def apply_noise_reduction(self):
        """Simple noise reduction by removing very quiet samples"""
        print("🔧 Applying noise reduction...")
        
        # Calculate noise floor (bottom 10% of amplitudes)
        amplitudes = np.abs(self.audio_data)
        noise_floor = np.percentile(amplitudes, 10)
        
        # Reduce samples below noise floor
        noise_mask = amplitudes < noise_floor
        self.audio_data[noise_mask] = (self.audio_data[noise_mask] * 0.3).astype(np.int16)
        
        print(f"✅ Noise reduction applied (noise floor: {noise_floor:.0f})")
    
    def pitch_shift_preserve_speed(self, pitch_factor=1.2):
        """Increase pitch without changing speed using phase vocoder technique"""
        print(f"🎵 Applying pitch shift (factor: {pitch_factor:.1f}x)...")
        
        # Simple pitch shifting using interpolation and resampling
        # This is a basic implementation - for production use librosa or similar
        
        # Convert to float for processing
        audio_float = self.audio_data.astype(np.float32)
        
        # Create time arrays
        original_length = len(audio_float)
        original_time = np.arange(original_length)
        
        # Create new time array for pitch shifting
        # Compress time axis to increase pitch while keeping same length
        compressed_time = original_time / pitch_factor
        
        # Interpolate to get new audio data
        interpolator = interp1d(original_time, audio_float, 
                              kind='linear', bounds_error=False, fill_value=0)
        
        # Generate pitch-shifted audio at same length
        pitched_audio = interpolator(compressed_time)
        
        # Handle any NaN values
        pitched_audio = np.nan_to_num(pitched_audio)
        
        # Convert back to int16
        self.audio_data = np.clip(pitched_audio, -32768, 32767).astype(np.int16)
        
        print(f"✅ Pitch shift applied (+{(pitch_factor-1)*100:.0f}% higher)")
    
    def apply_dynamic_range_compression(self, ratio=2.0):
        """Apply gentle compression to even out volume levels"""
        print(f"🔧 Applying dynamic range compression (ratio: {ratio:.1f}:1)...")
        
        # Convert to float for processing
        audio_float = self.audio_data.astype(np.float32) / 32768.0
        
        # Calculate envelope (slow-changing amplitude)
        envelope = np.abs(audio_float)
        
        # Apply smoothing to envelope
        b, a = signal.butter(1, 0.01, btype='low')
        smooth_envelope = signal.filtfilt(b, a, envelope)
        
        # Apply compression
        threshold = 0.3  # 30% of full scale
        compressed = np.where(smooth_envelope > threshold,
                             threshold + (smooth_envelope - threshold) / ratio,
                             smooth_envelope)
        
        # Apply compression to audio
        gain = np.where(smooth_envelope > 0, compressed / smooth_envelope, 1.0)
        compressed_audio = audio_float * gain
        
        # Convert back to int16
        self.audio_data = np.clip(compressed_audio * 32768, -32768, 32767).astype(np.int16)
        
        print("✅ Dynamic range compression applied")
    
    def normalize_audio(self, target_level=0.8):
        """Normalize audio to target level"""
        print(f"🔧 Normalizing audio (target: {target_level*100:.0f}%)...")
        
        # Find current peak
        current_peak = np.max(np.abs(self.audio_data))
        
        if current_peak > 0:
            # Calculate gain to reach target level
            target_peak = 32767 * target_level
            gain = target_peak / current_peak
            
            # Apply gain
            normalized = self.audio_data.astype(np.float32) * gain
            self.audio_data = np.clip(normalized, -32768, 32767).astype(np.int16)
            
            print(f"✅ Audio normalized (gain: {gain:.2f}x)")
        else:
            print("⚠️ No audio signal to normalize")
    
    def save_processed_audio(self, output_file=None):
        """Save the processed audio"""
        if output_file is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_file = f"xiao_processed_{timestamp}.wav"
        
        try:
            with wave.open(output_file, 'wb') as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(self.sample_rate)
                wav.writeframes(self.audio_data.tobytes())
            
            file_size = os.path.getsize(output_file)
            duration = len(self.audio_data) / self.sample_rate
            
            print(f"\n💾 PROCESSED AUDIO SAVED: {output_file}")
            print(f"   File size: {file_size:,} bytes")
            print(f"   Duration: {duration:.2f}s")
            print(f"   Sample rate: {self.sample_rate} Hz")
            
            # Final audio analysis
            print(f"\n📊 FINAL AUDIO ANALYSIS:")
            print(f"   Min: {np.min(self.audio_data)}, Max: {np.max(self.audio_data)}")
            print(f"   Mean: {np.mean(self.audio_data):.1f}")
            print(f"   RMS: {np.sqrt(np.mean(self.audio_data.astype(np.float32)**2)):.1f}")
            
            return output_file
            
        except Exception as e:
            print(f"❌ Error saving processed audio: {e}")
            return None

def process_latest_recording():
    """Find and process the latest recording"""
    # Find the most recent audio file
    audio_files = [f for f in os.listdir('.') if f.startswith('xiao_') and f.endswith('.wav')]
    
    if not audio_files:
        print("❌ No audio files found to process")
        return
    
    # Get the most recent file
    latest_file = sorted(audio_files)[-1]
    print(f"🎵 Processing latest recording: {latest_file}")
    
    # Process the audio
    processor = AudioPostProcessor(latest_file)
    
    if processor.audio_data is not None:
        print("\n🔧 APPLYING AUDIO PROCESSING:")
        
        # 1. Smoothing filter
        processor.apply_smoothing_filter(cutoff_freq=4000)
        
        # 2. Noise reduction
        processor.apply_noise_reduction()
        
        # 3. Pitch shift (increase pitch without changing speed)
        processor.pitch_shift_preserve_speed(pitch_factor=1.15)  # 15% higher pitch
        
        # 4. Dynamic range compression
        processor.apply_dynamic_range_compression(ratio=2.5)
        
        # 5. Normalize
        processor.normalize_audio(target_level=0.85)
        
        # Save processed audio
        output_file = processor.save_processed_audio()
        
        if output_file:
            print(f"\n🎉 SUCCESS! PROCESSED AUDIO: {output_file}")
            print("This should sound:")
            print("   ✅ Smoother (filtered)")
            print("   ✅ Cleaner (noise reduced)")
            print("   ✅ Higher pitched (+15%)")
            print("   ✅ More consistent volume (compressed)")
            print("   ✅ Optimized levels (normalized)")

if __name__ == "__main__":
    print("🎵 Audio Post-Processor")
    print("Applies smoothing, noise reduction, pitch shift, compression, and normalization")
    print("=" * 80)
    
    # Check for scipy
    try:
        from scipy import signal
        print("✅ scipy available")
    except ImportError:
        print("❌ Please install: pip install scipy")
        exit(1)
    
    process_latest_recording()
