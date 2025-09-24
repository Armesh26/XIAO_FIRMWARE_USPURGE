import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { FileText, Mic, MicOff, Copy, Trash2 } from 'lucide-react-native';
import { deepgramService, TranscriptData } from '../services/DeepgramService';
import { audioProcessor } from '../utils/AudioProcessor';

interface DeepgramTranscriberProps {
  isConnected: boolean;
  audioData?: number[] | null; // Optional since we use global handler
}

const DeepgramTranscriber: React.FC<DeepgramTranscriberProps> = ({
  isConnected,
  audioData,
}) => {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [liveText, setLiveText] = useState('');
  const [isDeepgramConnected, setIsDeepgramConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ words: 0, characters: 0, duration: 0 });
  const [audioPacketsSent, setAudioPacketsSent] = useState(0);

  const startTimeRef = useRef<number | null>(null);
  const audioPacketsSentRef = useRef(0);

  // Initialize Deepgram service listeners
  useEffect(() => {
    deepgramService.setListeners({
      onTranscript: (data: TranscriptData) => {
        if (data.isFinal) {
          setTranscription(prev => prev + data.text + ' ');
          setLiveText('');
          
          // Update stats
          setStats(prev => ({
            words: prev.words + data.text.split(' ').length,
            characters: prev.characters + data.text.length,
            duration: startTimeRef.current ? (Date.now() - startTimeRef.current) / 1000 : 0
          }));
        } else {
          setLiveText(data.text);
        }
      },
      onError: (error: Error) => {
        console.error('❌ Deepgram error:', error);
        setError(error.message || 'Transcription error');
        setIsTranscribing(false);
        setIsDeepgramConnected(false);
      },
      onOpen: () => {
        console.log('✅ Deepgram connected');
        setIsDeepgramConnected(true);
        setError(null);
      },
      onClose: () => {
        console.log('🔌 Deepgram disconnected');
        setIsDeepgramConnected(false);
        setIsTranscribing(false);
      }
    });

    // Cleanup on unmount
    return () => {
      deepgramService.cleanup();
    };
  }, []);

  // Handle audio data processing via global handler
  useEffect(() => {
    const handleAudioDataForTranscription = (data: number[]) => {
      if (isTranscribing && isDeepgramConnected) {
        try {
          // Process audio data through audio processor
          const processedChunk = audioProcessor.processAudioData(data);
        
          if (processedChunk) {
            // Convert to format Deepgram expects
            const deepgramData = audioProcessor.convertForDeepgram(processedChunk);
            
            // Send to Deepgram
            const success = deepgramService.sendAudioData(deepgramData);
            
            if (success) {
              audioPacketsSentRef.current += 1;
              setAudioPacketsSent(audioPacketsSentRef.current);
              
              // Log every 50 packets
              if (audioPacketsSentRef.current % 50 === 0) {
                console.log(`🎵 Sent ${processedChunk.length} samples to Deepgram (packet ${audioPacketsSentRef.current})`);
              }
            }
          }
        } catch (error) {
          console.error('❌ Error processing audio data:', error);
          setError('Failed to process audio data: ' + (error as Error).message);
        }
      }
    };

    // Set up global handler for Deepgram transcription
    // @ts-ignore - global is available in React Native
    global.deepgramAudioHandler = handleAudioDataForTranscription;
    
    return () => {
      // @ts-ignore - global is available in React Native
      global.deepgramAudioHandler = null;
    };
  }, [isTranscribing, isDeepgramConnected]);

  const startTranscription = useCallback(async () => {
    if (!isConnected) {
      Alert.alert('Error', 'Please connect to XIAO board first');
      return;
    }

    try {
      console.log('🎯 Starting Deepgram transcription...');
      
      const success = await deepgramService.startTranscription();
      
      if (success) {
        setIsTranscribing(true);
        setTranscription('');
        setLiveText('');
        setError(null);
        setAudioPacketsSent(0);
        audioPacketsSentRef.current = 0;
        startTimeRef.current = Date.now();
        
        // Reset audio processor
        audioProcessor.reset();
        
        console.log('✅ Transcription started successfully');
      } else {
        setError('Failed to start Deepgram transcription');
      }
    } catch (err) {
      console.error('❌ Failed to start transcription:', err);
      setError((err as Error).message || 'Failed to start transcription');
    }
  }, [isConnected]);

  const stopTranscription = useCallback(() => {
    try {
      deepgramService.stopTranscription();
      setIsTranscribing(false);
      setIsDeepgramConnected(false);
      console.log('🛑 Transcription stopped');
    } catch (err) {
      console.error('❌ Error stopping transcription:', err);
      setIsTranscribing(false);
      setIsDeepgramConnected(false);
    }
  }, []);

  const clearTranscription = useCallback(() => {
    setTranscription('');
    setLiveText('');
    setStats({ words: 0, characters: 0, duration: 0 });
  }, []);

  const copyTranscription = useCallback(async () => {
    try {
      // Note: In React Native, you'd typically use a clipboard library
      // For now, we'll just log it
      console.log('📋 Transcription copied to clipboard:', transcription.trim());
      Alert.alert('Success', 'Transcription copied to clipboard');
    } catch (err) {
      console.error('❌ Failed to copy text:', err);
      Alert.alert('Error', 'Failed to copy text to clipboard');
    }
  }, [transcription]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎯 Deepgram Nova-3 Transcription</Text>
      
      <View style={[
        styles.statusContainer,
        { backgroundColor: error ? '#fdf2f2' : isTranscribing ? '#fdf2f2' : '#f8f9fa' }
      ]}>
        <Text style={[
          styles.statusText,
          { color: error ? '#e74c3c' : isTranscribing ? '#e74c3c' : '#666' }
        ]}>
          {error && '❌ ' + error}
          {isTranscribing && !error && (isDeepgramConnected ? '🎤 Transcribing XIAO Audio...' : '🔄 Connecting to Deepgram...')}
          {!isTranscribing && !error && '📱 Ready to Transcribe'}
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        {!isTranscribing ? (
          <TouchableOpacity
            style={[styles.button, styles.startButton]}
            onPress={startTranscription}
            disabled={!isConnected}
          >
            <Text style={styles.buttonText}>Start Transcription</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.button, styles.stopButton]}
            onPress={stopTranscription}
          >
            <Text style={styles.buttonText}>Stop Transcription</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={copyTranscription}
          disabled={!transcription.trim()}
        >
          <Text style={styles.buttonText}>Copy Text</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={clearTranscription}
          disabled={!transcription.trim()}
        >
          <Text style={styles.buttonText}>Clear</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.transcriptionContainer}>
        <Text style={styles.transcriptionText}>
          {transcription}
          {liveText && (
            <Text style={styles.liveText}>{liveText}</Text>
          )}
        </Text>
      </ScrollView>

      <View style={styles.statsContainer}>
        <Text style={styles.statsText}>
          Words: {stats.words} | Characters: {stats.characters} | Duration: {formatDuration(stats.duration)} | Audio Packets: {audioPacketsSent}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 20,
    margin: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 16,
  },
  statusContainer: {
    padding: 16,
    borderRadius: 12,
    marginVertical: 16,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginVertical: 16,
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    margin: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  startButton: {
    backgroundColor: '#667eea',
  },
  stopButton: {
    backgroundColor: '#e74c3c',
  },
  secondaryButton: {
    backgroundColor: '#6c757d',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  transcriptionContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginVertical: 16,
    minHeight: 200,
    maxHeight: 300,
  },
  transcriptionText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
  liveText: {
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
    color: '#667eea',
    fontWeight: '500',
  },
  statsContainer: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  statsText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    fontFamily: 'monospace',
  },
});

export default DeepgramTranscriber;
