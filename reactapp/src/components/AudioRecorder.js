import React, { useState, useRef, useCallback, useEffect } from 'react';
import styled from 'styled-components';
import { Mic, Square, Play, Pause, Download } from 'lucide-react';
import { audioProcessor } from '../utils/AudioProcessor';

const Container = styled.div`
  background: rgba(255, 255, 255, 0.95);
  border-radius: 20px;
  padding: 2rem;
  margin: 1rem;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
`;

const Title = styled.h2`
  color: #333;
  margin-bottom: 1.5rem;
  text-align: center;
  font-size: 1.5rem;
  font-weight: 600;
`;

const Button = styled.button`
  background: ${props => {
    if (props.active) return '#e74c3c';
    if (props.secondary) return '#6c757d';
    return '#667eea';
  }};
  color: white;
  border: none;
  border-radius: 12px;
  padding: 1rem 1.5rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.5rem;

  &:hover {
    background: ${props => {
      if (props.active) return '#c0392b';
      if (props.secondary) return '#5a6268';
      return '#5a67d8';
    }};
    transform: translateY(-2px);
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
  }

  &:disabled {
    background: #ccc;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  justify-content: center;
  gap: 1rem;
  flex-wrap: wrap;
  margin: 2rem 0;
`;

const Status = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 1rem 0;
  padding: 1rem;
  border-radius: 12px;
  background: ${props => {
    if (props.recording) return '#fdf2f2';
    if (props.error) return '#fdf2f2';
    return '#f8f9fa';
  }};
  color: ${props => {
    if (props.recording) return '#e74c3c';
    if (props.error) return '#e74c3c';
    return '#666';
  }};
  font-weight: 500;
  justify-content: center;
`;

const InfoBox = styled.div`
  background: #f8f9fa;
  border-radius: 12px;
  padding: 1rem;
  margin: 1rem 0;
  font-size: 0.9rem;
  color: #666;
`;

const Stats = styled.div`
  font-size: 0.9rem;
  color: #666;
  font-family: monospace;
  text-align: center;
  margin: 1rem 0;
`;

const AudioRecorder = ({ isConnected, onRecordingComplete, device }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedAudio, setRecordedAudio] = useState(null);
  const [audioData, setAudioData] = useState([]);
  const [packetCount, setPacketCount] = useState(0);
  const [error, setError] = useState(null);

  const audioBufferRef = useRef([]);
  const isRecordingRef = useRef(false);
  const startTimeRef = useRef(null);
  const durationIntervalRef = useRef(null);
  const packetCountRef = useRef(0);

  // Handle audio data from BLE
  useEffect(() => {
    const handleAudioData = (data, audioStream) => {
      console.log(`🎵 AudioRecorder received: ${data.length} samples`);
      
      // Update packet count
      packetCountRef.current += 1;
      if (packetCountRef.current % 10 === 0) {
        setPacketCount(packetCountRef.current);
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

    // This will be called by the parent component
    window.audioRecorderHandler = handleAudioData;
  }, []);

  const startRecording = useCallback(async () => {
    if (!isConnected) {
      alert('Please connect to XIAO board first');
      return;
    }

    try {
      console.log('🎤 Starting recording...');
      
      setIsRecording(true);
      isRecordingRef.current = true;
      setAudioData([]);
      audioBufferRef.current = [];
      setRecordingDuration(0);
      setPacketCount(0);
      packetCountRef.current = 0;
      startTimeRef.current = Date.now();
      setError(null);

      // Start duration timer
      durationIntervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setRecordingDuration((Date.now() - startTimeRef.current) / 1000);
        }
      }, 100);

      console.log('✅ Recording started');
    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      setError('Failed to start recording: ' + error.message);
      setIsRecording(false);
      isRecordingRef.current = false;
    }
  }, [isConnected]);

  const stopRecording = useCallback(async () => {
    try {
      setIsRecording(false);
      isRecordingRef.current = false;
      
      // Clear duration timer
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      console.log(`🛑 Stopping recording. Buffer length: ${audioBufferRef.current.length}`);
      
      if (audioBufferRef.current.length > 0) {
        // Convert to Int16Array
        const audioArray = new Int16Array(audioBufferRef.current);
        setAudioData(audioArray);
        
        // Create WAV blob
        const audioBlob = audioProcessor.createWavBlob(audioArray, recordingDuration);
        setRecordedAudio(audioBlob);
        
        // Validate audio quality
        const quality = audioProcessor.validateAudioData(audioArray);
        console.log('🎵 Audio Quality:', quality);
        
        // Notify parent component
        if (onRecordingComplete) {
          onRecordingComplete(audioArray);
        }
        
        console.log(`✅ Recording completed: ${audioArray.length} samples, ${recordingDuration.toFixed(1)}s`);
      } else {
        console.log('⚠️ No audio data captured during recording');
        setError('No audio data captured during recording');
      }
    } catch (error) {
      console.error('❌ Failed to stop recording:', error);
      setError('Failed to stop recording: ' + error.message);
    }
  }, [recordingDuration, onRecordingComplete]);

  const playRecording = useCallback(() => {
    if (!recordedAudio) return;

    try {
      const audioUrl = URL.createObjectURL(recordedAudio);
      const audio = new Audio(audioUrl);
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
      };
      
      audio.play();
      console.log('▶️ Playing recorded audio');
    } catch (error) {
      console.error('❌ Failed to play recording:', error);
      setError('Failed to play recording: ' + error.message);
    }
  }, [recordedAudio]);

  const downloadRecording = useCallback(() => {
    if (!recordedAudio) return;

    try {
      const url = URL.createObjectURL(recordedAudio);
      const a = document.createElement('a');
      a.href = url;
      a.download = `xiao_recording_${new Date().toISOString().replace(/[:.]/g, '-')}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log('⬇️ Recording downloaded');
    } catch (error) {
      console.error('❌ Failed to download recording:', error);
      setError('Failed to download recording: ' + error.message);
    }
  }, [recordedAudio]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Container>
      <Title>🎤 Audio Recorder</Title>
      
      <Status recording={isRecording} error={error}>
        {error && (
          <>
            <Mic size={20} />
            Error: {error}
          </>
        )}
        {isRecording && !error && (
          <>
            <Mic size={20} />
            Recording XIAO Audio... {formatDuration(recordingDuration)}
          </>
        )}
        {!isRecording && !error && (
          <>
            <Square size={20} />
            Ready to Record
          </>
        )}
      </Status>

      <ButtonGroup>
        {!isRecording ? (
          <Button onClick={startRecording} disabled={!isConnected}>
            <Mic size={20} />
            Start Recording
          </Button>
        ) : (
          <Button onClick={stopRecording} active>
            <Square size={20} />
            Stop Recording
          </Button>
        )}
        
        {recordedAudio && (
          <>
            <Button onClick={playRecording} secondary>
              <Play size={20} />
              Play
            </Button>
            
            <Button onClick={downloadRecording} secondary>
              <Download size={20} />
              Download
            </Button>
          </>
        )}
        
        {error && (
          <Button onClick={clearError} secondary>
            Clear Error
          </Button>
        )}
      </ButtonGroup>

      <Stats>
        Audio Packets: {packetCount} | 
        {audioData.length > 0 && `Samples: ${audioData.length.toLocaleString()}`} | 
        {recordingDuration > 0 && `Duration: ${formatDuration(recordingDuration)}`}
      </Stats>

      {device && (
        <InfoBox>
          <strong>Connected Device:</strong><br/>
          Name: {device.name || 'Unknown'}<br/>
          ID: {device.id || 'Unknown'}<br/>
          Status: Connected ✅
        </InfoBox>
      )}

      {!isConnected && (
        <InfoBox>
          <strong>Connection Required:</strong><br/>
          Please connect to your XIAO board first to start recording audio.
        </InfoBox>
      )}
    </Container>
  );
};

export default AudioRecorder;