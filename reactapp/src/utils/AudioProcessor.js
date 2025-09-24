/**
 * Audio Processor Utility
 * Handles audio data conversion and processing for XIAO nRF52840 Sense
 */

export class AudioProcessor {
  constructor() {
    this.sampleRate = 16000; // Default sample rate from XIAO board
    this.bufferSize = 8192; // Ring buffer size
    this.buffer = new Int16Array(this.bufferSize);
    this.writeIndex = 0;
    this.readIndex = 0;
    this.dataCount = 0;
  }

  /**
   * Process incoming audio data from BLE
   * @param {Int16Array} audioData - Raw audio data from XIAO board
   * @returns {Int16Array|null} - Processed audio chunk or null if not ready
   */
  processAudioData(audioData) {
    if (!audioData || audioData.length === 0) {
      return null;
    }

    // Add data to ring buffer
    for (let i = 0; i < audioData.length; i++) {
      this.buffer[this.writeIndex] = audioData[i];
      this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
      
      if (this.dataCount < this.bufferSize) {
        this.dataCount++;
      } else {
        // Buffer is full, move read index
        this.readIndex = (this.readIndex + 1) % this.bufferSize;
      }
    }

    // Return processed chunk if we have enough data
    if (this.dataCount >= 160) { // 160 samples = 10ms at 16kHz
      return this.getAudioChunk(160);
    }

    return null;
  }

  /**
   * Get audio chunk from buffer
   * @param {number} chunkSize - Size of chunk to return
   * @returns {Int16Array} - Audio chunk
   */
  getAudioChunk(chunkSize) {
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
   * @param {Int16Array} audioData - 16-bit audio data
   * @returns {Uint8Array} - 8-bit audio data for Deepgram
   */
  convertForDeepgram(audioData) {
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
   * @param {Int16Array} audioData - Audio data to validate
   * @returns {Object} - Validation result with quality metrics
   */
  validateAudioData(audioData) {
    const samples = Array.from(audioData);
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
   * Create WAV blob from audio data
   * @param {Int16Array} audioData - Audio data
   * @param {number} duration - Duration in seconds
   * @returns {Blob} - WAV file blob
   */
  createWavBlob(audioData, duration = null) {
    const CHANNELS = 1;
    const SAMPLE_WIDTH = 2;
    const sampleRate = this.sampleRate;
    
    const buffer = new ArrayBuffer(44 + audioData.length * 2);
    const view = new DataView(buffer);
    
    // WAV header
    const writeString = (offset, string) => {
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
    
    return new Blob([buffer], { type: 'audio/wav' });
  }

  /**
   * Reset the audio processor
   */
  reset() {
    this.writeIndex = 0;
    this.readIndex = 0;
    this.dataCount = 0;
    this.buffer.fill(0);
  }

  /**
   * Get current buffer status
   * @returns {Object} - Buffer status information
   */
  getBufferStatus() {
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
