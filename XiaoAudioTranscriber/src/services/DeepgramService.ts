/**
 * Deepgram Service for React Native
 * Handles real-time audio transcription using Deepgram Nova-3 API
 */

export interface TranscriptData {
  text: string;
  isFinal: boolean;
  confidence: number;
}

export interface DeepgramListeners {
  onTranscript?: (data: TranscriptData) => void;
  onError?: (error: Error) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export class DeepgramService {
  private apiKey: string;
  private connection: WebSocket | null;
  private isConnected: boolean;
  private isTranscribing: boolean;
  private listeners: DeepgramListeners;

  constructor() {
    this.apiKey = '6f8cc0568676f91acc28784457aea240539e9aab';
    this.connection = null;
    this.isConnected = false;
    this.isTranscribing = false;
    this.listeners = {};
  }

  /**
   * Initialize Deepgram connection
   * @returns Promise<boolean> - Success status
   */
  async initialize(): Promise<boolean> {
    try {
      if (!this.apiKey) {
        throw new Error('Deepgram API key not configured');
      }

      console.log('🔧 Initializing Deepgram Nova-3...');
      
      // Create WebSocket connection
      const wsUrl = `wss://api.deepgram.com/v1/listen?model=nova-3-general&language=en-US&smart_format=true&interim_results=true&endpointing=300&utterance_end_ms=1000&vad_events=true&encoding=linear16&sample_rate=16000&channels=1`;
      
      this.connection = new WebSocket(wsUrl, [], {
        headers: {
          'Authorization': `Token ${this.apiKey}`,
        },
      });

      // Set up event listeners
      this.setupEventListeners();
      
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Deepgram:', error);
      this.handleError(error as Error);
      return false;
    }
  }

  /**
   * Set up WebSocket event listeners
   */
  private setupEventListeners(): void {
    if (!this.connection) return;

    this.connection.onopen = () => {
      console.log('✅ Deepgram connection opened');
      this.isConnected = true;
      this.isTranscribing = true;
      
      if (this.listeners.onOpen) {
        this.listeners.onOpen();
      }
    };

    this.connection.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'Results' && data.channel?.alternatives?.[0]?.transcript) {
          const transcript = data.channel.alternatives[0].transcript;
          const isFinal = data.is_final || false;
          const confidence = data.channel.alternatives[0].confidence || 0;
          
          console.log(`🎯 Transcript: "${transcript}" (final: ${isFinal})`);
          
          if (this.listeners.onTranscript) {
            this.listeners.onTranscript({
              text: transcript,
              isFinal,
              confidence
            });
          }
        }
      } catch (error) {
        console.error('❌ Error processing transcript:', error);
      }
    };

    this.connection.onerror = (error) => {
      console.error('❌ Deepgram WebSocket error:', error);
      this.handleError(new Error('WebSocket connection error'));
    };

    this.connection.onclose = () => {
      console.log('🔌 Deepgram connection closed');
      this.isConnected = false;
      this.isTranscribing = false;
      
      if (this.listeners.onClose) {
        this.listeners.onClose();
      }
    };
  }

  /**
   * Send audio data to Deepgram
   * @param audioData - Audio data to transcribe
   */
  sendAudioData(audioData: Uint8Array): boolean {
    if (!this.connection || !this.isConnected) {
      console.warn('⚠️ Deepgram not connected, cannot send audio data');
      return false;
    }

    try {
      this.connection.send(audioData);
      return true;
    } catch (error) {
      console.error('❌ Error sending audio to Deepgram:', error);
      this.handleError(error as Error);
      return false;
    }
  }

  /**
   * Start transcription
   * @returns Promise<boolean> - Success status
   */
  async startTranscription(): Promise<boolean> {
    try {
      const success = await this.initialize();
      if (success) {
        console.log('🎯 Deepgram transcription started');
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Failed to start transcription:', error);
      this.handleError(error as Error);
      return false;
    }
  }

  /**
   * Stop transcription
   */
  stopTranscription(): void {
    try {
      if (this.connection) {
        this.connection.close();
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
   * @param listeners - Event listener functions
   */
  setListeners(listeners: DeepgramListeners): void {
    this.listeners = { ...this.listeners, ...listeners };
  }

  /**
   * Handle errors
   * @param error - Error to handle
   */
  private handleError(error: Error): void {
    this.isConnected = false;
    this.isTranscribing = false;
    
    if (this.listeners.onError) {
      this.listeners.onError(error);
    }
  }

  /**
   * Get connection status
   * @returns Connection status
   */
  getStatus(): {
    isConnected: boolean;
    isTranscribing: boolean;
    hasConnection: boolean;
  } {
    return {
      isConnected: this.isConnected,
      isTranscribing: this.isTranscribing,
      hasConnection: !!this.connection
    };
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.stopTranscription();
    this.listeners = {};
  }
}

// Export singleton instance
export const deepgramService = new DeepgramService();
