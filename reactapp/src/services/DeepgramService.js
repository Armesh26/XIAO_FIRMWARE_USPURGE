/**
 * Deepgram Service
 * Handles real-time audio transcription using Deepgram Nova-3 API
 */

import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';

export class DeepgramService {
  constructor() {
    this.apiKey = '6f8cc0568676f91acc28784457aea240539e9aab';
    this.connection = null;
    this.isConnected = false;
    this.isTranscribing = false;
    this.listeners = {
      onTranscript: null,
      onError: null,
      onOpen: null,
      onClose: null
    };
  }

  /**
   * Initialize Deepgram connection
   * @returns {Promise<boolean>} - Success status
   */
  async initialize() {
    try {
      if (!this.apiKey) {
        throw new Error('Deepgram API key not configured');
      }

      console.log('🔧 Initializing Deepgram Nova-3...');
      
      const deepgram = createClient(this.apiKey);
      
      this.connection = deepgram.listen.live({
        model: 'nova-3-general',
        language: 'en-US',
        smart_format: true,
        interim_results: true,
        endpointing: 300,
        utterance_end_ms: 1000,
        vad_events: true,
        encoding: 'linear16',
        sample_rate: 16000,
        channels: 1,
      });

      // Set up event listeners
      this.setupEventListeners();
      
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Deepgram:', error);
      this.handleError(error);
      return false;
    }
  }

  /**
   * Set up Deepgram event listeners
   */
  setupEventListeners() {
    if (!this.connection) return;

    this.connection.on(LiveTranscriptionEvents.Open, () => {
      console.log('✅ Deepgram connection opened');
      this.isConnected = true;
      this.isTranscribing = true;
      
      if (this.listeners.onOpen) {
        this.listeners.onOpen();
      }
    });

    this.connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      try {
        const transcript = data.channel?.alternatives?.[0]?.transcript;
        
        if (transcript && transcript.trim()) {
          console.log(`🎯 Transcript: "${transcript}" (final: ${data.is_final})`);
          
          if (this.listeners.onTranscript) {
            this.listeners.onTranscript({
              text: transcript,
              isFinal: data.is_final,
              confidence: data.channel?.alternatives?.[0]?.confidence || 0
            });
          }
        }
      } catch (error) {
        console.error('❌ Error processing transcript:', error);
      }
    });

    this.connection.on(LiveTranscriptionEvents.Error, (error) => {
      console.error('❌ Deepgram error:', error);
      this.handleError(error);
    });

    this.connection.on(LiveTranscriptionEvents.Close, () => {
      console.log('🔌 Deepgram connection closed');
      this.isConnected = false;
      this.isTranscribing = false;
      
      if (this.listeners.onClose) {
        this.listeners.onClose();
      }
    });
  }

  /**
   * Send audio data to Deepgram
   * @param {Uint8Array} audioData - Audio data to transcribe
   */
  sendAudioData(audioData) {
    if (!this.connection || !this.isConnected) {
      console.warn('⚠️ Deepgram not connected, cannot send audio data');
      return false;
    }

    try {
      this.connection.send(audioData);
      return true;
    } catch (error) {
      console.error('❌ Error sending audio to Deepgram:', error);
      this.handleError(error);
      return false;
    }
  }

  /**
   * Start transcription
   * @returns {Promise<boolean>} - Success status
   */
  async startTranscription() {
    try {
      const success = await this.initialize();
      if (success) {
        console.log('🎯 Deepgram transcription started');
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Failed to start transcription:', error);
      this.handleError(error);
      return false;
    }
  }

  /**
   * Stop transcription
   */
  stopTranscription() {
    try {
      if (this.connection) {
        this.connection.finish();
        this.connection = null;
      }
      
      this.isConnected = false;
      this.isTranscribing = false;
      
      console.log('🛑 Deepgram transcription stopped');
    } catch (error) {
      console.error('❌ Error stopping transcription:', error);
    }
  }

  /**
   * Set event listeners
   * @param {Object} listeners - Event listener functions
   */
  setListeners(listeners) {
    this.listeners = { ...this.listeners, ...listeners };
  }

  /**
   * Handle errors
   * @param {Error} error - Error to handle
   */
  handleError(error) {
    this.isConnected = false;
    this.isTranscribing = false;
    
    if (this.listeners.onError) {
      this.listeners.onError(error);
    }
  }

  /**
   * Get connection status
   * @returns {Object} - Connection status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      isTranscribing: this.isTranscribing,
      hasConnection: !!this.connection
    };
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.stopTranscription();
    this.listeners = {
      onTranscript: null,
      onError: null,
      onOpen: null,
      onClose: null
    };
  }
}

// Export singleton instance
export const deepgramService = new DeepgramService();
