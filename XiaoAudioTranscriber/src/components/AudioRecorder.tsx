import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Mic, MicOff, Play, Pause, Square, Trash2, Download, Folder } from 'lucide-react-native';
import RNFS from 'react-native-fs';
import Sound from 'react-native-sound';
import { audioProcessor } from '../utils/AudioProcessor';
import { logger } from '../services/LoggerService';

interface AudioRecorderProps {
  isConnected: boolean;
  audioData?: number[] | null; // Optional since we use global handler
}

interface RecordingSession {
  id: string;
  filename: string;
  duration: number;
  timestamp: Date;
  filePath: string;
  size: number;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({
  isConnected,
  audioData,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentRecording, setCurrentRecording] = useState<RecordingSession | null>(null);
  const [recordings, setRecordings] = useState<RecordingSession[]>([]);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [soundInstance, setSoundInstance] = useState<Sound | null>(null);

  // Use refs for audio buffer to avoid re-renders (like React web app)
  const audioBufferRef = useRef<number[]>([]);
  const isRecordingRef = useRef(false);
  const recordingStartTime = useRef<number | null>(null);
  const durationInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const packetCountRef = useRef(0);

  // Initialize sound library
  useEffect(() => {
    Sound.setCategory('Playback');
    return () => {
      if (soundInstance) {
        soundInstance.release();
      }
    };
  }, [soundInstance]);

  // Load existing recordings on mount
  useEffect(() => {
    loadRecordings();
  }, []);

  // Handle audio data from BLE - EXACTLY like React web app
  useEffect(() => {
    const handleAudioData = (data: number[], audioStream?: any) => {
      console.log(`🎵 AudioRecorder received: ${data.length} samples`);
      
      // Update packet count
      packetCountRef.current += 1;
      if (packetCountRef.current % 10 === 0) {
        // setPacketCount could be added if needed
      }

      // Store audio data if recording
      if (isRecordingRef.current) {
        const samples = Array.from(data);
        audioBufferRef.current.push(...samples);
        
        console.log(`📝 Recording: captured ${samples.length} samples, total: ${audioBufferRef.current.length}`);
      }

      // Don't call onAudioData here - this creates infinite recursion
      // The AudioRecorder only needs to capture data for recording purposes
    };

    // Set up global handler (like React web app: window.audioRecorderHandler)
    // @ts-ignore - global is available in React Native
    global.audioRecorderHandler = handleAudioData;
    
    return () => {
      // @ts-ignore - global is available in React Native
      global.audioRecorderHandler = null;
    };
  }, []);

  // Also handle prop-based audio data for backwards compatibility
  useEffect(() => {
    if (audioData && isRecordingRef.current) {
      // Add to recording buffer (exactly like Python: self.audio_data.extend(samples))
      audioBufferRef.current.push(...audioData);
      
      // Simple progress update like Python
      if (packetCountRef.current % 100 === 0) {
        const elapsed = (Date.now() - (recordingStartTime.current || 0)) / 1000;
        console.log(`📦 Received ${packetCountRef.current} packets in ${elapsed.toFixed(1)}s`);
      }
    }
  }, [audioData]);


  // Note: Buffer clearing is handled in stopRecording function

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
      if (soundInstance) {
        soundInstance.release();
      }
      // Clear audio buffer on cleanup
      audioBufferRef.current = [];
    };
  }, [soundInstance]);

  // Update recording duration
  useEffect(() => {
    if (isRecording && recordingStartTime.current) {
      durationInterval.current = setInterval(() => {
        const elapsed = (Date.now() - recordingStartTime.current!) / 1000;
        setRecordingDuration(elapsed);
      }, 100);
    } else {
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
        durationInterval.current = null;
      }
    }

    return () => {
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
    };
  }, [isRecording]);

  const loadRecordings = useCallback(async () => {
    try {
      const recordingsDir = `${RNFS.DocumentDirectoryPath}/recordings`;
      
      // Create recordings directory if it doesn't exist
      const dirExists = await RNFS.exists(recordingsDir);
      if (!dirExists) {
        await RNFS.mkdir(recordingsDir);
      }

      // Get all files in recordings directory
      const files = await RNFS.readDir(recordingsDir);
      const wavFiles = files.filter(file => file.name.endsWith('.wav'));
      
      const loadedRecordings: RecordingSession[] = await Promise.all(
        wavFiles.map(async (file) => {
          const stats = await RNFS.stat(file.path);
          return {
            id: file.name.replace('.wav', ''),
            filename: file.name,
            duration: 0, // We'll calculate this when playing
            timestamp: new Date(stats.mtime),
            filePath: file.path,
            size: stats.size,
          };
        })
      );

      setRecordings(loadedRecordings.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));
    } catch (err) {
      console.error('❌ Error loading recordings:', err);
      setError('Failed to load recordings: ' + (err as Error).message);
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (!isConnected) {
      Alert.alert('Error', 'Please connect to XIAO board first');
      return;
    }

    try {
      console.log('🎤 Starting recording...');
      
      // Clear audio buffer and reset refs (like React web app)
      audioBufferRef.current = [];
      isRecordingRef.current = true;
      packetCountRef.current = 0;
      
      console.log('🔧 Recording refs set:', {
        isRecordingRef: isRecordingRef.current,
        bufferLength: audioBufferRef.current.length,
        packetCount: packetCountRef.current
      });
      
      // Reset audio processor
      audioProcessor.reset();
      
      setError(null);
      setRecordingDuration(0);
      recordingStartTime.current = Date.now();
      setIsRecording(true);
      
      logger.logAudioEvent('Started recording from XIAO board');
      console.log('✅ Recording started');
    } catch (err) {
      logger.logAudioEvent('Error starting recording', err);
      setError('Failed to start recording: ' + (err as Error).message);
    }
  }, [isConnected]);

  const stopRecording = useCallback(async () => {
    try {
      console.log('🛑 Stopping recording...');
      
      setIsRecording(false);
      isRecordingRef.current = false;
      
      // Clear duration timer
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
        durationInterval.current = null;
      }
      
      // Calculate actual sample rate from streaming data (like Python code)
      // Use actual elapsed time like Python: time.time() - self.start_time
      const actualDuration = recordingStartTime.current ? (Date.now() - recordingStartTime.current) / 1000 : recordingDuration;
      const calculatedSampleRate = audioBufferRef.current.length / actualDuration;
      
      // Note: We're getting 80 samples per packet instead of Python's 160
      // This means our firmware is configured differently than the Python version
      
      // Smart sample rate selection (like Python code)
      const TARGET_SAMPLE_RATE = 16000; // Fixed target like Python SAMPLE_RATE constant
      let effectiveSampleRate: number;
      if (Math.abs(calculatedSampleRate - TARGET_SAMPLE_RATE) / TARGET_SAMPLE_RATE < 0.1) {
        // Use target sample rate if calculated rate is close
        effectiveSampleRate = TARGET_SAMPLE_RATE;
        logger.logAudioEvent(`Using target sample rate: ${effectiveSampleRate} Hz`, {
          calculatedRate: calculatedSampleRate,
          targetRate: TARGET_SAMPLE_RATE,
          difference: Math.abs(calculatedSampleRate - TARGET_SAMPLE_RATE),
          percentDiff: (Math.abs(calculatedSampleRate - TARGET_SAMPLE_RATE) / TARGET_SAMPLE_RATE * 100).toFixed(1) + '%'
        });
        console.log(`📊 Using target sample rate: ${effectiveSampleRate} Hz`);
      } else {
        // Use calculated sample rate if significantly different
        effectiveSampleRate = Math.round(calculatedSampleRate);
        logger.logAudioEvent(`Using calculated sample rate: ${effectiveSampleRate} Hz`, {
          calculatedRate: calculatedSampleRate,
          targetRate: TARGET_SAMPLE_RATE,
          difference: Math.abs(calculatedSampleRate - TARGET_SAMPLE_RATE),
          percentDiff: (Math.abs(calculatedSampleRate - TARGET_SAMPLE_RATE) / TARGET_SAMPLE_RATE * 100).toFixed(1) + '%'
        });
        console.log(`📊 Using calculated sample rate: ${effectiveSampleRate} Hz`);
      }
      
      // Log recording completion to UI logs
      logger.logAudioEvent('Recording completed', {
        timerDuration: recordingDuration.toFixed(2) + 's',
        actualDuration: actualDuration.toFixed(2) + 's',
        packets: packetCountRef.current,
        packetRate: (packetCountRef.current / actualDuration).toFixed(1) + ' packets/sec',
        totalSamples: audioBufferRef.current.length,
          expectedSamples: packetCountRef.current * 80, // React web app uses 80 samples per packet
        calculatedSampleRate: calculatedSampleRate.toFixed(1) + ' Hz',
        targetSampleRate: TARGET_SAMPLE_RATE + ' Hz',
        effectiveSampleRate: effectiveSampleRate + ' Hz',
        note: 'Using 80 samples per packet (matches React web app)'
      });
      
      console.log(`✅ Recording complete!`);
      console.log(`📊 Timer duration: ${recordingDuration.toFixed(2)}s`);
      console.log(`📊 Actual duration: ${actualDuration.toFixed(2)}s`);
      console.log(`📦 Packets: ${packetCountRef.current}`);
      console.log(`📈 Rate: ${(packetCountRef.current / actualDuration).toFixed(1)} packets/sec`);
      console.log(`🎵 Actual samples: ${audioBufferRef.current.length}`);
      console.log(`🎯 Calculated sample rate: ${calculatedSampleRate.toFixed(1)} Hz`);
      console.log(`🎯 Target sample rate: ${TARGET_SAMPLE_RATE} Hz`);
      console.log(`🎯 Effective sample rate: ${effectiveSampleRate} Hz`);
      
      if (audioBufferRef.current.length === 0) {
        console.log('❌ No audio data in buffer!');
        setError('No audio data recorded');
        return;
      }

      // Create WAV file
      const recordingId = `recording_${Date.now()}`;
      const filename = `${recordingId}.wav`;
      const filePath = `${RNFS.DocumentDirectoryPath}/recordings/${filename}`;
      
      // Ensure recordings directory exists
      const recordingsDir = `${RNFS.DocumentDirectoryPath}/recordings`;
      const dirExists = await RNFS.exists(recordingsDir);
      if (!dirExists) {
        await RNFS.mkdir(recordingsDir);
      }

      // Convert to Int16Array EXACTLY like React web app
      const audioArray = new Int16Array(audioBufferRef.current);
      
      // Create WAV data using default sample rate (like React web app)
      const wavData = audioProcessor.createWavData(Array.from(audioArray));
      
      // Write file
      await RNFS.writeFile(filePath, wavData, 'base64');
      
      // Get file stats
      const stats = await RNFS.stat(filePath);
      
      // Create recording session
      const newRecording: RecordingSession = {
        id: recordingId,
        filename,
        duration: recordingDuration,
        timestamp: new Date(),
        filePath,
        size: stats.size,
      };

      setRecordings(prev => [newRecording, ...prev]);
      setCurrentRecording(newRecording);
      
      // Validate audio quality like React web app
      const quality = audioProcessor.validateAudioData(Array.from(audioArray));
      console.log('🎵 Audio Quality:', quality);
      
      console.log(`✅ Recording completed: ${audioArray.length} samples, ${recordingDuration.toFixed(1)}s`);
      
      // Clear audio buffer after processing (memory cleanup)
      audioBufferRef.current = [];
      isRecordingRef.current = false;
      setRecordingDuration(0);
      
      // Final logging like Python
      const fileSizeKB = stats.size / 1024;
      const duration = actualDuration; // Use actual elapsed time like Python
      
      console.log(`💾 Saved: ${filename}`);
      console.log(`📊 File size: ${fileSizeKB.toFixed(1)} KB`);
      console.log(`📊 Duration: ${duration.toFixed(2)} seconds`);
      console.log(`📊 Sample rate: ${effectiveSampleRate} Hz`);
      
      logger.logFileEvent('Recording saved', { 
        filename, 
        duration: duration.toFixed(1) + 's',
        size: stats.size,
        sampleRate: effectiveSampleRate + ' Hz' // Use calculated sample rate
      });
    } catch (err) {
      logger.logFileEvent('Error stopping recording', err);
      setError('Failed to save recording: ' + (err as Error).message);
    }
  }, [recordingDuration]);

  const playRecording = useCallback(async (recording: RecordingSession) => {
    try {
      // Stop current playback if any
      if (soundInstance) {
        soundInstance.stop();
        soundInstance.release();
      }

      setError(null);
      setIsPlaying(true);
      setCurrentRecording(recording);

      const sound = new Sound(recording.filePath, '', (error) => {
        if (error) {
          console.error('❌ Error loading sound:', error);
          setError('Failed to load audio file: ' + error.message);
          setIsPlaying(false);
          return;
        }

        sound.play((success) => {
          setIsPlaying(false);
          if (!success) {
            setError('Failed to play audio');
          }
        });
      });

      setSoundInstance(sound);
    } catch (err) {
      console.error('❌ Error playing recording:', err);
      setError('Failed to play recording: ' + (err as Error).message);
      setIsPlaying(false);
    }
  }, [soundInstance]);

  const stopPlayback = useCallback(() => {
    if (soundInstance) {
      soundInstance.stop();
      soundInstance.release();
      setSoundInstance(null);
    }
    setIsPlaying(false);
  }, [soundInstance]);

  const deleteRecording = useCallback(async (recording: RecordingSession) => {
    try {
      Alert.alert(
        'Delete Recording',
        `Are you sure you want to delete "${recording.filename}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              await RNFS.unlink(recording.filePath);
              setRecordings(prev => prev.filter(r => r.id !== recording.id));
              
              if (currentRecording?.id === recording.id) {
                setCurrentRecording(null);
                stopPlayback();
              }
              
              console.log(`🗑️ Deleted recording: ${recording.filename}`);
            }
          }
        ]
      );
    } catch (err) {
      console.error('❌ Error deleting recording:', err);
      setError('Failed to delete recording: ' + (err as Error).message);
    }
  }, [currentRecording, stopPlayback]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎤 Audio Recorder</Text>
      
      
      <View style={[
        styles.statusContainer,
        { backgroundColor: error ? '#fdf2f2' : isRecording ? '#d4edda' : '#f8f9fa' }
      ]}>
        <Text style={[
          styles.statusText,
          { color: error ? '#721c24' : isRecording ? '#155724' : '#666' }
        ]}>
          {error && '❌ ' + error}
          {isRecording && !error && `🎤 Recording... ${formatDuration(recordingDuration)}`}
          {!isRecording && !error && '📱 Ready to Record'}
        </Text>
      </View>



      <View style={styles.buttonContainer}>
        {!isRecording ? (
          <TouchableOpacity
            style={[styles.button, styles.recordButton]}
            onPress={startRecording}
            disabled={!isConnected}
          >
            <Mic size={20} color="white" />
            <Text style={styles.buttonText}>Start Recording</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.button, styles.stopButton]}
            onPress={stopRecording}
          >
            <Square size={20} color="white" />
            <Text style={styles.buttonText}>Stop Recording</Text>
          </TouchableOpacity>
        )}
        
        {error && (
          <TouchableOpacity
            style={[styles.button, styles.clearButton]}
            onPress={clearError}
          >
            <Text style={styles.buttonText}>Clear Error</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={() => {
            console.log('🧪 Manual test - Current state:', {
              isRecording: isRecording,
              isRecordingRef: isRecordingRef.current,
              audioBufferLength: audioBufferRef.current.length,
              packetCount: packetCountRef.current,
              hasAudioData: !!audioData,
              audioDataLength: audioData?.length || 0
            });
          }}
        >
          <Text style={styles.buttonText}>🧪 Debug State</Text>
        </TouchableOpacity>
      </View>

      {currentRecording && (
        <View style={styles.currentRecordingContainer}>
          <Text style={styles.currentRecordingTitle}>Current Recording:</Text>
          <Text style={styles.currentRecordingText}>{currentRecording.filename}</Text>
          <Text style={styles.currentRecordingDetails}>
            Duration: {formatDuration(currentRecording.duration)} | 
            Size: {formatFileSize(currentRecording.size)}
          </Text>
          
          <View style={styles.playbackControls}>
            {!isPlaying ? (
              <TouchableOpacity
                style={[styles.button, styles.playButton]}
                onPress={() => playRecording(currentRecording)}
              >
                <Play size={16} color="white" />
                <Text style={styles.buttonText}>Play</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.button, styles.pauseButton]}
                onPress={stopPlayback}
              >
                <Pause size={16} color="white" />
                <Text style={styles.buttonText}>Stop</Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              style={[styles.button, styles.deleteButton]}
              onPress={() => deleteRecording(currentRecording)}
            >
              <Trash2 size={16} color="white" />
              <Text style={styles.buttonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <ScrollView style={styles.recordingsContainer}>
        <Text style={styles.recordingsTitle}>📁 Saved Recordings ({recordings.length})</Text>
        
        {recordings.length === 0 ? (
          <Text style={styles.noRecordingsText}>No recordings yet. Start recording to see them here!</Text>
        ) : (
          recordings.map((recording) => (
            <View key={recording.id} style={styles.recordingItem}>
              <View style={styles.recordingInfo}>
                <Text style={styles.recordingFilename}>{recording.filename}</Text>
                <Text style={styles.recordingDetails}>
                  {formatDuration(recording.duration)} • {formatFileSize(recording.size)} • 
                  {recording.timestamp.toLocaleDateString()}
                </Text>
              </View>
              
              <View style={styles.recordingActions}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.playActionButton]}
                  onPress={() => playRecording(recording)}
                >
                  <Play size={14} color="white" />
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.actionButton, styles.deleteActionButton]}
                  onPress={() => deleteRecording(recording)}
                >
                  <Trash2 size={14} color="white" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
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
  pitchStatusContainer: {
    backgroundColor: '#e8f5e8',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#4caf50',
  },
  pitchStatusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2e7d32',
    textAlign: 'center',
  },
  pitchStatusSubtext: {
    fontSize: 12,
    color: '#388e3c',
    textAlign: 'center',
    marginTop: 4,
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    margin: 8,
    minWidth: 120,
    justifyContent: 'center',
  },
  recordButton: {
    backgroundColor: '#e74c3c',
  },
  stopButton: {
    backgroundColor: '#e74c3c',
  },
  playButton: {
    backgroundColor: '#27ae60',
  },
  pauseButton: {
    backgroundColor: '#f39c12',
  },
  deleteButton: {
    backgroundColor: '#e74c3c',
  },
  clearButton: {
    backgroundColor: '#6c757d',
  },
  secondaryButton: {
    backgroundColor: '#9b59b6',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  currentRecordingContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginVertical: 16,
  },
  currentRecordingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  currentRecordingText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  currentRecordingDetails: {
    fontSize: 12,
    color: '#999',
    marginBottom: 12,
  },
  playbackControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  recordingsContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginVertical: 16,
    maxHeight: 300,
  },
  recordingsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  noRecordingsText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
    padding: 20,
  },
  recordingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  recordingInfo: {
    flex: 1,
  },
  recordingFilename: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  recordingDetails: {
    fontSize: 12,
    color: '#666',
  },
  recordingActions: {
    flexDirection: 'row',
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  playActionButton: {
    backgroundColor: '#27ae60',
  },
  deleteActionButton: {
    backgroundColor: '#e74c3c',
  },
});

export default AudioRecorder;
