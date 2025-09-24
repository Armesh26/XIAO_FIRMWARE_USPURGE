/**
 * Audio Processor Utility for React Native
 * Handles audio data conversion and processing for XIAO nRF52840 Sense
 * Matches Python audio processing logic exactly
 */

export class AudioProcessor {
  private sampleRate: number;
  private bufferSize: number;
  private buffer: Int16Array;
  private writeIndex: number;
  private readIndex: number;
  private dataCount: number;

  constructor() {
    this.sampleRate = 16000; // Default sample rate from XIAO board  
    this.bufferSize = 8192; // Ring buffer size
    this.buffer = new Int16Array(this.bufferSize);
    this.writeIndex = 0;
    this.readIndex = 0;
    this.dataCount = 0;
  }

  /**
   * Process incoming audio data from BLE (matches Python logic)
   * @param audioData - Raw audio data from XIAO board
   * @returns Processed audio chunk or null if not ready
   */
  processAudioData(audioData: number[]): Int16Array | null {
    if (!audioData || audioData.length === 0) {
      return null;
    }

    try {
      // Add to ring buffer (like Python extends audio_data list)
      for (let i = 0; i < audioData.length; i++) {
        this.buffer[this.writeIndex] = audioData[i];
        this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
        
        if (this.dataCount < this.bufferSize) {
          this.dataCount++;
        } else {
          this.readIndex = (this.readIndex + 1) % this.bufferSize;
        }
      }

      // Return processed chunk if we have enough data
      // React web app processes 80 samples per packet (160 bytes = 80 Int16 samples)
      if (this.dataCount >= 80) {
        return this.getAudioChunk(80); // Process 80 samples like React web app
      }
    } catch (error) {
      console.error('❌ Audio processing failed:', error);
    }

    return null;
  }


  /**
   * Get audio chunk from buffer
   * @param chunkSize - Size of chunk to return
   * @returns Audio chunk
   */
  private getAudioChunk(chunkSize: number): Int16Array {
    const chunk = new Int16Array(chunkSize);
    
    for (let i = 0; i < chunkSize; i++) {
      chunk[i] = this.buffer[this.readIndex];
      this.readIndex = (this.readIndex + 1) % this.bufferSize;
      this.dataCount--;
    }

    return chunk;
  }

  /**
   * Convert Int16Array to Uint8Array for Deepgram
   * @param audioData - 16-bit audio data
   * @returns 8-bit audio data for Deepgram
   */
  convertForDeepgram(audioData: Int16Array): Uint8Array {
    const uint8Array = new Uint8Array(audioData.length * 2);
    const view = new DataView(uint8Array.buffer);
    
    for (let i = 0; i < audioData.length; i++) {
      // Convert Int16 to little-endian bytes
      view.setInt16(i * 2, audioData[i], true);
    }
    
    return uint8Array;
  }

  /**
   * Validate audio data quality
   * @param audioData - Audio data to validate
   * @returns Validation result with quality metrics
   */
  validateAudioData(audioData: number[]): {
    isValid: boolean;
    min: number;
    max: number;
    mean: number;
    rms: number;
    dynamicRange: number;
    isSilent: boolean;
    isClipping: boolean;
  } {
    const samples = audioData;
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const rms = Math.sqrt(samples.reduce((a, b) => a + b * b, 0) / samples.length);
    
    const quality = {
      isValid: true,
      min,
      max,
      mean: Math.round(mean),
      rms: Math.round(rms),
      dynamicRange: max - min,
      isSilent: max - min < 100,
      isClipping: Math.abs(max) > 30000 || Math.abs(min) > 30000
    };

    if (quality.isSilent) {
      quality.isValid = false;
      console.warn('⚠️ Audio appears to be silent');
    }

    if (quality.isClipping) {
      quality.isValid = false;
      console.warn('⚠️ Audio appears to be clipping');
    }

    return quality;
  }

  /**
   * Create WAV blob from audio data - EXACTLY like React web app
   * @param audioData - Int16Array audio data  
   * @param duration - Duration in seconds
   * @returns Blob - WAV file blob
   */
  createWavBlob(audioData: Int16Array, duration: number | null = null): Blob {
    const CHANNELS = 1;
    const SAMPLE_WIDTH = 2;
    const sampleRate = this.sampleRate; // Use default like React web app
    
    const buffer = new ArrayBuffer(44 + audioData.length * 2);
    const view = new DataView(buffer);
    
    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + audioData.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, CHANNELS, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * CHANNELS * SAMPLE_WIDTH, true);
    view.setUint16(32, CHANNELS * SAMPLE_WIDTH, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, audioData.length * 2, true);
    
    // Write audio data
    let offset = 44;
    for (let i = 0; i < audioData.length; i++) {
      view.setInt16(offset, audioData[i], true);
      offset += 2;
    }
    
    // React Native compatibility: return ArrayBuffer instead of Blob
    return buffer as any; // Will be cast to Blob type for compatibility
  }

  /**
   * Create WAV blob from audio data
   * @param audioData - Audio data
   * @param duration - Duration in seconds
   * @returns WAV file data as base64 string
   */
  createWavData(audioData: number[], sampleRate?: number): string {
    const CHANNELS = 1;
    const SAMPLE_WIDTH = 2;
    // Use provided sample rate or fallback to default (like Python)
    const actualSampleRate = sampleRate || this.sampleRate;
    
    // Debug: Check audio data quality before WAV creation
    const audioRange = {
      min: Math.min(...audioData),
      max: Math.max(...audioData),
      avg: audioData.reduce((a, b) => a + b, 0) / audioData.length
    };
    
    console.log('🎵 Creating WAV file:', {
      audioDataLength: audioData.length,
      sampleRate: actualSampleRate,
      expectedDuration: audioData.length / actualSampleRate,
      audioRange,
      isReasonableAudio: Math.abs(audioRange.max - audioRange.min) > 100,
      hasVariation: new Set(audioData).size > 1,
      firstSamples: audioData.slice(0, 8),
      lastSamples: audioData.slice(-8),
      possibleIssues: {
        allZeros: audioData.every(s => s === 0),
        allSameValue: new Set(audioData).size === 1,
        tooQuiet: Math.abs(audioRange.max - audioRange.min) < 100,
        tooLoud: Math.abs(audioRange.max) > 30000 || Math.abs(audioRange.min) > 30000
      }
    });
    
    const buffer = new ArrayBuffer(44 + audioData.length * 2);
    const view = new DataView(buffer);
    
    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    // WAV header (PCM format)
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + audioData.length * 2, true); // File size - 8
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // Format chunk size
    view.setUint16(20, 1, true); // Audio format (PCM)
    view.setUint16(22, CHANNELS, true); // Number of channels
    view.setUint32(24, actualSampleRate, true); // Sample rate
    view.setUint32(28, actualSampleRate * CHANNELS * SAMPLE_WIDTH, true); // Byte rate
    view.setUint16(32, CHANNELS * SAMPLE_WIDTH, true); // Block align
    view.setUint16(34, 16, true); // Bits per sample
    writeString(36, 'data');
    view.setUint32(40, audioData.length * 2, true); // Data size
    
    console.log('🎵 WAV header created:', {
      sampleRate: actualSampleRate,
      channels: CHANNELS,
      bitsPerSample: 16,
      byteRate: actualSampleRate * CHANNELS * SAMPLE_WIDTH,
      blockAlign: CHANNELS * SAMPLE_WIDTH,
      dataSize: audioData.length * 2
    });
    
    // Write audio data
    let offset = 44;
    for (let i = 0; i < audioData.length; i++) {
      view.setInt16(offset, audioData[i], true);
      offset += 2;
    }
    
    // Debug: Check first few samples in WAV file
    const firstWavSamples = [];
    for (let i = 0; i < Math.min(4, audioData.length); i++) {
      firstWavSamples.push(view.getInt16(44 + i * 2, true));
    }
    
    console.log('🎵 WAV data written:', {
      firstOriginalSamples: audioData.slice(0, 4),
      firstWavSamples,
      samplesMatch: JSON.stringify(audioData.slice(0, 4)) === JSON.stringify(firstWavSamples)
    });
    
    // Convert to base64 (React Native compatible)
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    
    // Convert to base64 using manual implementation
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    let i = 0;
    
    while (i < binary.length) {
      const a = binary.charCodeAt(i++);
      const b = i < binary.length ? binary.charCodeAt(i++) : 0;
      const c = i < binary.length ? binary.charCodeAt(i++) : 0;
      
      const bitmap = (a << 16) | (b << 8) | c;
      
      result += chars.charAt((bitmap >> 18) & 63);
      result += chars.charAt((bitmap >> 12) & 63);
      result += i - 2 < binary.length ? chars.charAt((bitmap >> 6) & 63) : '=';
      result += i - 1 < binary.length ? chars.charAt(bitmap & 63) : '=';
    }
    
    return result;
  }

  /**
   * Reset the audio processor
   */
  reset(): void {
    this.writeIndex = 0;
    this.readIndex = 0;
    this.dataCount = 0;
    this.buffer.fill(0);
  }

  /**
   * Get current buffer status
   * @returns Buffer status information
   */
  getBufferStatus(): {
    dataCount: number;
    bufferSize: number;
    writeIndex: number;
    readIndex: number;
    utilization: number;
  } {
    return {
      dataCount: this.dataCount,
      bufferSize: this.bufferSize,
      writeIndex: this.writeIndex,
      readIndex: this.readIndex,
      utilization: (this.dataCount / this.bufferSize) * 100
    };
  }

}

// Export singleton instance
export const audioProcessor = new AudioProcessor();
