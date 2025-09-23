import React, { useState, useRef, useCallback, useEffect } from 'react';
import styled from 'styled-components';
import { Mic, Square, Play, Pause, Download } from 'lucide-react';

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
    if (props.recording) return '#e74c3c';
    if (props.playing) return '#f39c12';
    return '#667eea';
  }};
  color: white;
  border: none;
  border-radius: 12px;
  padding: 1rem 2rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.5rem;
  min-width: 140px;
  justify-content: center;

  &:hover {
    background: ${props => {
      if (props.recording) return '#c0392b';
      if (props.playing) return '#e67e22';
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
    if (props.playing) return '#fef9e7';
    return '#f8f9fa';
  }};
  color: ${props => {
    if (props.recording) return '#e74c3c';
    if (props.playing) return '#f39c12';
    return '#666';
  }};
  font-weight: 500;
  justify-content: center;
`;

const Timer = styled.div`
  font-size: 2rem;
  font-weight: bold;
  text-align: center;
  margin: 1rem 0;
  color: #333;
`;

const AudioInfo = styled.div`
  margin-top: 1rem;
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 12px;
  font-family: monospace;
  font-size: 0.9rem;
`;

const AudioRecorder = ({ isConnected, onAudioData, onRecordingComplete, onAudioHandlerRegister }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioData, setAudioData] = useState([]);
  const [audioStreamActive, setAudioStreamActive] = useState(false);
  const [packetCount, setPacketCount] = useState(0);
  
  const audioBufferRef = useRef([]);
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);
  const audioContextRef = useRef(null);
  const sourceRef = useRef(null);
  const audioHandlerRef = useRef(null);
  const isRecordingRef = useRef(false);
  const packetCountRef = useRef(0);

  // Audio configuration (matching auto_pitch_recorder.py)
  const SAMPLE_RATE = 16000;
  const CHANNELS = 1;
  const SAMPLE_WIDTH = 2;

  useEffect(() => {
    if (isRecording) {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        setRecordingDuration(elapsed);
      }, 100);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording]);

  const createAudioBlob = useCallback((audioData) => {
    // Create WAV file from audio data
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
    view.setUint32(24, SAMPLE_RATE, true);
    view.setUint32(28, SAMPLE_RATE * CHANNELS * SAMPLE_WIDTH, true);
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
  }, []);

  const startRecording = useCallback(() => {
    if (!isConnected) {
      alert('Please connect to XIAO board first');
      return;
    }

    setIsRecording(true);
    isRecordingRef.current = true;
    setAudioData([]);
    audioBufferRef.current = [];
    setRecordingDuration(0);
    startTimeRef.current = Date.now();
    console.log('Started recording...');
  }, [isConnected]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    isRecordingRef.current = false;
    
    if (audioBufferRef.current.length > 0) {
      // Convert audio data to Int16Array
      const audioArray = new Int16Array(audioBufferRef.current);
      setAudioData(audioArray);
      
      // Create audio blob for playback
      const audioBlob = createAudioBlob(audioArray);
      setRecordedAudio(audioBlob);
      
      // Notify parent component
      if (onRecordingComplete) {
        onRecordingComplete(audioArray);
      }
      
      console.log(`Recording stopped. Captured ${audioArray.length} samples`);
    }
  }, [onRecordingComplete, createAudioBlob]);

  const playRecording = useCallback(async () => {
    if (!recordedAudio) return;

    try {
      setIsPlaying(true);
      
      // Close existing audio context if any
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        await audioContextRef.current.close();
      }
      
      // Create new audio context
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      
      // Resume audio context if suspended (required for user interaction)
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      // Get audio data from blob
      const arrayBuffer = await recordedAudio.arrayBuffer();
      const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
      
      // Create and configure audio source
      sourceRef.current = audioContextRef.current.createBufferSource();
      sourceRef.current.buffer = audioBuffer;
      sourceRef.current.connect(audioContextRef.current.destination);
      
      // Handle playback end
      sourceRef.current.onended = () => {
        setIsPlaying(false);
        sourceRef.current = null;
      };
      
      // Start playback
      sourceRef.current.start();
      console.log('Playback started');
      
    } catch (error) {
      console.error('Playback error:', error);
      setIsPlaying(false);
      alert('Playback failed: ' + error.message);
    }
  }, [recordedAudio]);

  const pauseRecording = useCallback(() => {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
        sourceRef.current = null;
        setIsPlaying(false);
        console.log('Playback stopped');
      } catch (error) {
        console.error('Error stopping playback:', error);
        setIsPlaying(false);
      }
    }
  }, []);

  const downloadRecording = useCallback(() => {
    if (!recordedAudio) return;

    const url = URL.createObjectURL(recordedAudio);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xiao_recording_${new Date().toISOString().replace(/[:.]/g, '-')}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [recordedAudio]);

  // Handle incoming audio data from BLE (continuous stream)
  useEffect(() => {
    const handleAudioData = (data, audioStream) => {
      // Track that audio stream is active
      setAudioStreamActive(true);
      packetCountRef.current += 1;
      
      // Update packet count every 10 packets
      if (packetCountRef.current % 10 === 0) {
        setPacketCount(packetCountRef.current);
      }
      
      // Always capture audio data when recording is active
      // The firmware sends 160 samples every 10ms continuously
      if (isRecordingRef.current) {
        // Convert Int16Array to regular array for storage
        const samples = Array.from(data);
        audioBufferRef.current.push(...samples);
        
        // Log every 100 packets to avoid spam
        if (audioBufferRef.current.length % 16000 === 0) {
          console.log(`Recording: ${audioBufferRef.current.length} samples captured`);
        }
      }
    };
    
    audioHandlerRef.current = handleAudioData;
    
    // Register the handler with the parent component
    if (onAudioHandlerRegister) {
      onAudioHandlerRegister(handleAudioData);
    }
  }, [onAudioHandlerRegister]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Container>
      <Title>🎤 Audio Recorder</Title>
      
      <Status recording={isRecording} playing={isPlaying}>
        {isRecording && (
          <>
            <Mic size={20} />
            Recording from XIAO MIC (BLE)... ({audioStreamActive ? 'Stream Active' : 'No Stream'})
          </>
        )}
        {isPlaying && (
          <>
            <Play size={20} />
            Playing Recording
          </>
        )}
        {!isRecording && !isPlaying && audioData.length === 0 && (
          <>
            <Mic size={20} />
            {audioStreamActive ? `Audio Stream Active (${packetCount} packets)` : 'Ready to Record'}
          </>
        )}
        {!isRecording && !isPlaying && audioData.length > 0 && (
          <>
            <Square size={20} />
            Recording Complete ({audioStreamActive ? 'Stream Active' : 'No Stream'})
          </>
        )}
      </Status>

      {isRecording && (
        <Timer>
          {formatTime(recordingDuration)}
        </Timer>
      )}

      <ButtonGroup>
        {!isRecording ? (
          <Button onClick={startRecording} disabled={!isConnected}>
            <Mic size={20} />
            Start Recording
          </Button>
        ) : (
          <Button onClick={stopRecording} recording>
            <Square size={20} />
            Stop Recording
          </Button>
        )}

        {recordedAudio && (
          <>
            {!isPlaying ? (
              <Button onClick={playRecording}>
                <Play size={20} />
                Play
              </Button>
            ) : (
              <Button onClick={pauseRecording} playing>
                <Pause size={20} />
                Pause
              </Button>
            )}
            
            <Button onClick={downloadRecording}>
              <Download size={20} />
              Download
            </Button>
          </>
        )}
      </ButtonGroup>

      <AudioInfo>
        <strong>Audio Stream Info:</strong><br />
        Stream Active: {audioStreamActive ? 'Yes' : 'No'}<br />
        Packets Received: {packetCount.toLocaleString()}<br />
        {audioData.length > 0 && (
          <>
            <br /><strong>Recording Info:</strong><br />
            Duration: {formatTime(recordingDuration)}<br />
            Samples: {audioData.length.toLocaleString()}<br />
            Sample Rate: {SAMPLE_RATE} Hz<br />
            Channels: {CHANNELS}<br />
            Size: {(audioData.length * 2 / 1024).toFixed(1)} KB
          </>
        )}
      </AudioInfo>
    </Container>
  );
};

export default AudioRecorder;
