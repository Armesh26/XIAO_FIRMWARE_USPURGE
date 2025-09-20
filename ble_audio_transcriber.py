#!/usr/bin/env python3
"""
BLE Audio Transcriber for Xiao nRF52840 Sense
Connects to MicStreamer device and transcribes audio in real-time
"""

import asyncio
import struct
import wave
import tempfile
import os
from datetime import datetime
import speech_recognition as sr
from bleak import BleakClient, BleakScanner
import numpy as np
from collections import deque
import threading
import time

# BLE Service and Characteristic UUIDs (from your firmware)
AUDIO_SERVICE_UUID = "12345678-1234-5678-1234-567812345678"
AUDIO_DATA_CHAR_UUID = "12345679-1234-5678-1234-567812345678"

class BLEAudioTranscriber:
    def __init__(self):
        self.client = None
        self.device_address = None
        self.audio_buffer = deque(maxlen=16000)  # 1 second buffer at 16kHz
        self.transcription_buffer = deque(maxlen=80000)  # 5 seconds for transcription
        self.recognizer = sr.Recognizer()
        self.is_connected = False
        self.is_recording = False
        self.packet_count = 0
        self.transcription_thread = None
        self.stop_transcription = False
        
        # Audio parameters (matching your firmware)
        self.sample_rate = 16000
        self.sample_width = 2  # 16-bit
        self.channels = 1  # Mono
        
    async def scan_for_device(self, timeout=10):
        """Scan for MicStreamer device"""
        print("🔍 Scanning for MicStreamer device...")
        
        devices = await BleakScanner.discover(timeout=timeout)
        
        for device in devices:
            if device.name and ("MicStreamer" in device.name or "AudioStreamer" in device.name):
                print(f"✅ Found MicStreamer: {device.name} ({device.address})")
                self.device_address = device.address
                return device.address
                
        print("❌ MicStreamer device not found")
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
                print("✅ Connected to MicStreamer")
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
        self.packet_count += 1
        
        # Convert bytes to 16-bit signed integers
        if len(data) >= 2:
            # Unpack as little-endian 16-bit signed integers
            samples = struct.unpack(f'<{len(data)//2}h', data)
            
            # Add to both buffers
            self.audio_buffer.extend(samples)
            self.transcription_buffer.extend(samples)
            
            # Print stats every 100 packets
            if self.packet_count % 100 == 0:
                print(f"📦 Received {self.packet_count} packets, "
                      f"Buffer: {len(self.transcription_buffer)} samples")
    
    def transcription_worker(self):
        """Background thread for continuous transcription"""
        print("🎤 Transcription thread started")
        last_transcription_time = time.time()
        
        while not self.stop_transcription:
            try:
                current_time = time.time()
                
                # Transcribe every 3 seconds if we have enough data
                if (current_time - last_transcription_time >= 3.0 and 
                    len(self.transcription_buffer) >= 16000):  # At least 1 second of audio
                    
                    # Get audio data from buffer
                    audio_data = list(self.transcription_buffer)
                    
                    # Convert to numpy array and normalize
                    audio_array = np.array(audio_data, dtype=np.int16)
                    
                    # Create temporary WAV file
                    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
                        with wave.open(tmp_file.name, 'wb') as wav_file:
                            wav_file.setnchannels(self.channels)
                            wav_file.setsampwidth(self.sample_width)
                            wav_file.setframerate(self.sample_rate)
                            wav_file.writeframes(audio_array.tobytes())
                        
                        # Transcribe using speech recognition
                        try:
                            with sr.AudioFile(tmp_file.name) as source:
                                audio = self.recognizer.record(source)
                                text = self.recognizer.recognize_google(audio)
                                
                                if text.strip():
                                    timestamp = datetime.now().strftime("%H:%M:%S")
                                    print(f"🗣️  [{timestamp}] Transcription: {text}")
                                    
                        except sr.UnknownValueError:
                            print("🤷 Could not understand audio")
                        except sr.RequestError as e:
                            print(f"❌ Transcription service error: {e}")
                        except Exception as e:
                            print(f"❌ Transcription error: {e}")
                        finally:
                            # Clean up temporary file
                            try:
                                os.unlink(tmp_file.name)
                            except:
                                pass
                    
                    last_transcription_time = current_time
                    
                    # Clear old data from transcription buffer (keep last 2 seconds)
                    if len(self.transcription_buffer) > 32000:
                        # Remove oldest data, keep newest 32000 samples (2 seconds)
                        for _ in range(len(self.transcription_buffer) - 32000):
                            self.transcription_buffer.popleft()
                
                time.sleep(0.5)  # Check every 500ms
                
            except Exception as e:
                print(f"❌ Transcription worker error: {e}")
                time.sleep(1)
        
        print("🛑 Transcription thread stopped")
    
    async def start_audio_streaming(self):
        """Enable notifications to start audio streaming"""
        try:
            print("🎵 Starting audio streaming...")
            
            # Start notification handler
            await self.client.start_notify(AUDIO_DATA_CHAR_UUID, self.audio_data_handler)
            
            print("✅ Audio streaming started")
            print("🎤 Listening for audio... Speak into the microphone!")
            print("📝 Transcription will appear every few seconds")
            print("🛑 Press Ctrl+C to stop")
            
            self.is_recording = True
            
            # Start transcription thread
            self.transcription_thread = threading.Thread(target=self.transcription_worker)
            self.transcription_thread.daemon = True
            self.transcription_thread.start()
            
            return True
            
        except Exception as e:
            print(f"❌ Failed to start audio streaming: {e}")
            return False
    
    async def stop_audio_streaming(self):
        """Stop audio streaming"""
        try:
            if self.client and self.client.is_connected:
                await self.client.stop_notify(AUDIO_DATA_CHAR_UUID)
                print("🛑 Audio streaming stopped")
            
            self.is_recording = False
            self.stop_transcription = True
            
            if self.transcription_thread:
                self.transcription_thread.join(timeout=2)
            
        except Exception as e:
            print(f"❌ Error stopping audio streaming: {e}")
    
    async def disconnect(self):
        """Disconnect from BLE device"""
        try:
            await self.stop_audio_streaming()
            
            if self.client and self.client.is_connected:
                await self.client.disconnect()
                print("📱 Disconnected from MicStreamer")
            
            self.is_connected = False
            
        except Exception as e:
            print(f"❌ Disconnect error: {e}")
    
    def print_stats(self):
        """Print connection and buffer statistics"""
        if self.is_connected:
            buffer_seconds = len(self.audio_buffer) / self.sample_rate
            transcription_seconds = len(self.transcription_buffer) / self.sample_rate
            
            print(f"\n📊 Statistics:")
            print(f"   Connected: {self.is_connected}")
            print(f"   Recording: {self.is_recording}")
            print(f"   Packets received: {self.packet_count}")
            print(f"   Audio buffer: {buffer_seconds:.1f}s")
            print(f"   Transcription buffer: {transcription_seconds:.1f}s")

async def main():
    """Main function"""
    print("🎤 BLE Audio Transcriber for Xiao nRF52840 Sense")
    print("=" * 50)
    
    # Check dependencies
    try:
        import speech_recognition as sr
        print("✅ speech_recognition available")
    except ImportError:
        print("❌ Please install: pip install SpeechRecognition")
        return
    
    try:
        import bleak
        print("✅ bleak available")
    except ImportError:
        print("❌ Please install: pip install bleak")
        return
    
    try:
        import numpy as np
        print("✅ numpy available")
    except ImportError:
        print("❌ Please install: pip install numpy")
        return
    
    transcriber = BLEAudioTranscriber()
    
    try:
        # Connect to device
        if not await transcriber.connect():
            return
        
        # Start audio streaming and transcription
        if not await transcriber.start_audio_streaming():
            return
        
        # Keep running until interrupted
        try:
            while True:
                await asyncio.sleep(10)
                transcriber.print_stats()
                
        except KeyboardInterrupt:
            print("\n🛑 Stopping...")
    
    except Exception as e:
        print(f"❌ Error: {e}")
    
    finally:
        await transcriber.disconnect()

if __name__ == "__main__":
    # Install required packages message
    print("📋 Required packages:")
    print("   pip install bleak speechrecognition numpy pyaudio")
    print("   On macOS: brew install portaudio")
    print("   On Ubuntu: sudo apt-get install portaudio19-dev")
    print()
    
    asyncio.run(main())
