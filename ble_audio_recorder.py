#!/usr/bin/env python3
"""
BLE Audio Recorder for Xiao nRF52840 Sense
Connects to AudioStreamer device and saves audio to WAV files
"""

import asyncio
import struct
import wave
import os
from datetime import datetime
from bleak import BleakClient, BleakScanner
import numpy as np
from collections import deque

# BLE Service and Characteristic UUIDs (from your firmware)
AUDIO_SERVICE_UUID = "12345678-1234-5678-1234-567812345678"
AUDIO_DATA_CHAR_UUID = "12345679-1234-5678-1234-567812345678"

class BLEAudioRecorder:
    def __init__(self):
        self.client = None
        self.device_address = None
        self.audio_samples = []
        self.is_connected = False
        self.is_recording = False
        self.packet_count = 0
        self.start_time = None
        
        # Audio parameters - will calculate actual rate
        self.nominal_sample_rate = 16000  # Firmware setting
        self.actual_sample_rate = 1600    # Calculated from BLE transmission rate
        self.sample_width = 2  # 16-bit
        self.channels = 1  # Mono
        
    async def scan_for_device(self, timeout=10):
        """Scan for AudioStreamer device"""
        print("🔍 Scanning for AudioStreamer device...")
        
        devices = await BleakScanner.discover(timeout=timeout)
        
        for device in devices:
            if device.name and ("MicStreamer" in device.name or "AudioStreamer" in device.name):
                print(f"✅ Found AudioStreamer: {device.name} ({device.address})")
                self.device_address = device.address
                return device.address
                
        print("❌ AudioStreamer device not found")
        return None
    
    async def connect(self):
        """Connect to the BLE device"""
        if not self.device_address:
            if not await self.scan_for_device():
                return False
        
        try:
            print(f"🔗 Connecting to {self.device_address}...")
            self.client = BleakClient(self.device_address)
            await self.client.connect()
            
            if self.client.is_connected:
                print("✅ Connected to AudioStreamer")
                self.is_connected = True
                return True
            else:
                print("❌ Failed to connect")
                return False
                
        except Exception as e:
            print(f"❌ Connection error: {e}")
            return False
    
    def audio_data_handler(self, sender, data):
        """Handle incoming audio data from BLE"""
        if not self.is_recording:
            return
            
        self.packet_count += 1
        
        # Convert bytes to 16-bit signed integers
        if len(data) >= 2:
            # Unpack as little-endian 16-bit signed integers
            samples = struct.unpack(f'<{len(data)//2}h', data)
            
            # Add to audio samples list
            self.audio_samples.extend(samples)
            
            # Print stats every 500 packets
            if self.packet_count % 500 == 0:
                duration = len(self.audio_samples) / self.actual_sample_rate
                print(f"📦 Recorded {self.packet_count} packets, "
                      f"Duration: {duration:.1f}s, "
                      f"Samples: {len(self.audio_samples)}")
    
    async def start_recording(self, duration_seconds=10):
        """Start recording audio for specified duration"""
        try:
            print(f"🎵 Starting audio recording for {duration_seconds} seconds...")
            
            # Clear previous recording
            self.audio_samples = []
            self.packet_count = 0
            self.start_time = datetime.now()
            
            # Start notification handler
            await self.client.start_notify(AUDIO_DATA_CHAR_UUID, self.audio_data_handler)
            
            print("✅ Audio recording started")
            print("🎤 Speak into the microphone!")
            print(f"⏱️  Recording for {duration_seconds} seconds...")
            
            self.is_recording = True
            
            # Record for specified duration
            for i in range(duration_seconds):
                await asyncio.sleep(1)
                duration = len(self.audio_samples) / self.actual_sample_rate
                print(f"⏱️  Recording... {i+1}/{duration_seconds}s - Audio: {duration:.1f}s")
            
            # Stop recording
            self.is_recording = False
            await self.client.stop_notify(AUDIO_DATA_CHAR_UUID)
            
            print("🛑 Recording stopped")
            return True
            
        except Exception as e:
            print(f"❌ Failed to record audio: {e}")
            return False
    
    def save_audio_file(self, filename=None, recording_duration=None):
        """Save recorded audio to WAV file with correct sample rate"""
        if not self.audio_samples:
            print("❌ No audio data to save")
            return None
            
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"xiao_audio_{timestamp}.wav"
        
        try:
            # Calculate actual sample rate based on data received
            if recording_duration:
                calculated_rate = len(self.audio_samples) / recording_duration
                print(f"📊 Calculated sample rate: {calculated_rate:.0f} Hz")
                actual_rate = int(calculated_rate)
            else:
                actual_rate = self.actual_sample_rate
            
            # Convert to numpy array
            audio_array = np.array(self.audio_samples, dtype=np.int16)
            
            # Create WAV file with CORRECT sample rate
            with wave.open(filename, 'wb') as wav_file:
                wav_file.setnchannels(self.channels)
                wav_file.setsampwidth(self.sample_width)
                wav_file.setframerate(actual_rate)  # Use calculated rate!
                wav_file.writeframes(audio_array.tobytes())
            
            # Calculate file info
            duration = len(self.audio_samples) / actual_rate
            file_size = os.path.getsize(filename)
            
            print(f"💾 Audio saved to: {filename}")
            print(f"📊 File info:")
            print(f"   Duration: {duration:.2f} seconds")
            print(f"   Samples: {len(self.audio_samples)}")
            print(f"   Sample rate: {actual_rate} Hz (corrected)")
            print(f"   File size: {file_size:,} bytes")
            print(f"   Packets received: {self.packet_count}")
            
            return filename
            
        except Exception as e:
            print(f"❌ Error saving audio file: {e}")
            return None
    
    def analyze_audio(self):
        """Analyze the recorded audio data"""
        if not self.audio_samples:
            print("❌ No audio data to analyze")
            return
        
        audio_array = np.array(self.audio_samples, dtype=np.int16)
        
        # Calculate statistics  
        duration = len(self.audio_samples) / self.actual_sample_rate
        max_amplitude = np.max(np.abs(audio_array))
        rms = np.sqrt(np.mean(audio_array.astype(np.float32) ** 2))
        
        # Find dynamic range
        min_val = np.min(audio_array)
        max_val = np.max(audio_array)
        
        print(f"\n📊 AUDIO ANALYSIS:")
        print(f"   Duration: {duration:.2f} seconds")
        print(f"   Total samples: {len(self.audio_samples):,}")
        print(f"   Sample rate: {self.actual_sample_rate} Hz")
        print(f"   Max amplitude: {max_amplitude:,} ({max_amplitude/32767*100:.1f}% of full scale)")
        print(f"   RMS level: {rms:.0f}")
        print(f"   Dynamic range: {min_val:,} to {max_val:,}")
        print(f"   Packets received: {self.packet_count}")
        print(f"   Avg samples per packet: {len(self.audio_samples)/self.packet_count:.1f}")
    
    async def disconnect(self):
        """Disconnect from BLE device"""
        try:
            self.is_recording = False
            
            if self.client and self.client.is_connected:
                await self.client.disconnect()
                print("📱 Disconnected from AudioStreamer")
            
            self.is_connected = False
            
        except Exception as e:
            print(f"❌ Disconnect error: {e}")

async def main():
    """Main function"""
    print("🎤 BLE Audio Recorder for Xiao nRF52840 Sense")
    print("=" * 50)
    
    recorder = BLEAudioRecorder()
    
    try:
        # Connect to device
        if not await recorder.connect():
            return
        
        # Record audio
        print("\n🎙️  RECORDING SESSION")
        duration = 10  # Record for 10 seconds
        
        if await recorder.start_recording(duration):
            # Analyze the recording
            recorder.analyze_audio()
            
            # Save to file with correct sample rate
            filename = recorder.save_audio_file(recording_duration=duration)
            
            if filename:
                print(f"\n🎵 SUCCESS! Audio saved to: {filename}")
                print(f"📱 You can now:")
                print(f"   1. Play the file: open {filename}")
                print(f"   2. Analyze in audio software")
                print(f"   3. Check audio quality and levels")
                print(f"   4. Verify microphone is working correctly")
    
    except KeyboardInterrupt:
        print("\n🛑 Recording interrupted by user")
    
    except Exception as e:
        print(f"❌ Error: {e}")
    
    finally:
        await recorder.disconnect()

if __name__ == "__main__":
    print("📋 This script will:")
    print("   1. Connect to your AudioStreamer device")
    print("   2. Record 10 seconds of audio")
    print("   3. Save to timestamped WAV file")
    print("   4. Analyze audio quality")
    print()
    
    asyncio.run(main())
