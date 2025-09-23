import React, { useState, useRef, useCallback, useEffect } from 'react';
import styled from 'styled-components';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { FileText, Mic, MicOff, Copy, Trash2 } from 'lucide-react';

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
    if (props.active) return '#fdf2f2';
    if (props.error) return '#fdf2f2';
    return '#f8f9fa';
  }};
  color: ${props => {
    if (props.active) return '#e74c3c';
    if (props.error) return '#e74c3c';
    return '#666';
  }};
  font-weight: 500;
  justify-content: center;
`;

const TranscriptionBox = styled.div`
  background: #f8f9fa;
  border-radius: 12px;
  padding: 1.5rem;
  margin: 1rem 0;
  min-height: 200px;
  max-height: 400px;
  overflow-y: auto;
  font-size: 1rem;
  line-height: 1.6;
  color: #333;
  border: 2px solid #e9ecef;
  transition: border-color 0.3s ease;

  &:focus-within {
    border-color: #667eea;
  }
`;

const TranscriptionText = styled.div`
  white-space: pre-wrap;
  word-wrap: break-word;
  margin-bottom: 1rem;
`;

const LiveText = styled.span`
  background: rgba(102, 126, 234, 0.1);
  padding: 2px 4px;
  border-radius: 4px;
  color: #667eea;
  font-weight: 500;
`;

const Controls = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #e9ecef;
`;

const Stats = styled.div`
  font-size: 0.9rem;
  color: #666;
  font-family: monospace;
`;

const DeepgramTranscriber = ({ isConnected, audioData }) => {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [liveText, setLiveText] = useState('');
  const [isDeepgramConnected, setIsDeepgramConnected] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({ words: 0, characters: 0, duration: 0 });
  const [audioPacketsSent, setAudioPacketsSent] = useState(0);

  const deepgramRef = useRef(null);
  const startTimeRef = useRef(null);

  // Deepgram API Key
  const DEEPGRAM_API_KEY = '6f8cc0568676f91acc28784457aea240539e9aab';
  
  // Test API key validity
  useEffect(() => {
    if (DEEPGRAM_API_KEY) {
      console.log('🔑 Deepgram API Key loaded:', DEEPGRAM_API_KEY.substring(0, 8) + '...');
    } else {
      console.error('❌ No Deepgram API Key found');
      setError('No Deepgram API Key configured');
    }
  }, []);

  const initializeDeepgram = useCallback(() => {
    const deepgram = createClient(DEEPGRAM_API_KEY);
    
    const connection = deepgram.listen.live({
      model: 'nova-3',       // Use the latest model
      language: 'en-US',
      smart_format: true,
      interim_results: true,
      endpointing: 300,
      utterance_end_ms: 1000,
      vad_events: true,
      encoding: 'linear16',  // Specify the audio encoding for 16-bit PCM
      sample_rate: 16000,    // Match the firmware sample rate
      channels: 1,           // Mono audio
    });

    connection.on(LiveTranscriptionEvents.Open, () => {
      console.log('✅ Deepgram connection opened successfully');
      setIsDeepgramConnected(true);
      setError(null);
    });

    connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      console.log('📝 Deepgram transcript received:', data);
      const transcript = data.channel?.alternatives?.[0]?.transcript;
      
      if (transcript && transcript.trim()) {
        console.log(`🎯 Transcript: "${transcript}" (final: ${data.is_final})`);
        
        if (data.is_final) {
          // Final transcript
          setTranscription(prev => prev + transcript + ' ');
          setLiveText('');
          
          // Update stats
          setStats(prev => ({
            words: prev.words + transcript.split(' ').length,
            characters: prev.characters + transcript.length,
            duration: (Date.now() - startTimeRef.current) / 1000
          }));
        } else {
          // Interim result
          setLiveText(transcript);
        }
      } else {
        console.log('⚠️ Empty or no transcript received');
      }
    });

    connection.on(LiveTranscriptionEvents.Error, (error) => {
      console.error('❌ Deepgram error:', error);
      setError(error.message || 'Transcription error');
      setIsTranscribing(false);
      setIsDeepgramConnected(false);
    });

    connection.on(LiveTranscriptionEvents.Close, () => {
      console.log('Deepgram connection closed');
      setIsDeepgramConnected(false);
      setIsTranscribing(false);
    });

    deepgramRef.current = connection;
    return connection;
  }, []);

  const startTranscription = useCallback(() => {
    if (!isConnected) {
      alert('Please connect to XIAO board first');
      return;
    }

    try {
      console.log('🎯 Starting transcription...');
      const connection = initializeDeepgram();
      setIsTranscribing(true);
      setTranscription('');
      setLiveText('');
      setError(null);
      startTimeRef.current = Date.now();
      setAudioPacketsSent(0);
      
      console.log('✅ Transcription started, waiting for audio data...');
    } catch (err) {
      console.error('❌ Failed to start transcription:', err);
      setError(err.message);
    }
  }, [isConnected, initializeDeepgram]);

  const stopTranscription = useCallback(() => {
    if (deepgramRef.current) {
      deepgramRef.current.finish();
      deepgramRef.current = null;
    }
    setIsTranscribing(false);
    setIsDeepgramConnected(false);
  }, []);

  const clearTranscription = useCallback(() => {
    setTranscription('');
    setLiveText('');
    setStats({ words: 0, characters: 0, duration: 0 });
  }, []);

  const copyTranscription = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(transcription.trim());
      // Could add a toast notification here
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  }, [transcription]);

  // Handle real-time audio data from BLE (continuous stream)
  useEffect(() => {
    if (audioData && isTranscribing && deepgramRef.current && isDeepgramConnected) {
      // The firmware sends 160 samples every 10ms continuously
      // Deepgram expects raw PCM data as Uint8Array
      const buffer = new ArrayBuffer(audioData.length * 2);
      const view = new DataView(buffer);
      for (let i = 0; i < audioData.length; i++) {
        view.setInt16(i * 2, audioData[i], true);
      }
      
      // Convert to Uint8Array for Deepgram
      const uint8Array = new Uint8Array(buffer);
      
      // Send audio data to Deepgram in real-time
      try {
        deepgramRef.current.send(uint8Array);
        
        // Track packets sent
        setAudioPacketsSent(prev => prev + 1);
        
        // Log every 100 packets to avoid spam
        if (Math.random() < 0.01) { // 1% chance to log
          console.log(`🎵 Transcribing XIAO MIC: sent ${audioData.length} samples (${uint8Array.length} bytes) to Deepgram`);
          console.log(`   🎤 Source: XIAO Board microphone (NOT laptop mic)`);
          console.log(`   First few samples: [${audioData.slice(0, 5).join(', ')}]`);
          console.log(`   Audio range: ${Math.min(...audioData)} to ${Math.max(...audioData)}`);
          console.log(`   Deepgram connected: ${isDeepgramConnected}`);
        }
      } catch (error) {
        console.error('❌ Error sending audio to Deepgram:', error);
        setError('Failed to send audio to Deepgram: ' + error.message);
      }
    } else if (audioData && isTranscribing && !isDeepgramConnected) {
      console.log('⚠️ Audio data received but Deepgram not connected yet');
    }
  }, [audioData, isTranscribing, isDeepgramConnected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (deepgramRef.current) {
        deepgramRef.current.finish();
      }
    };
  }, []);

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Container>
      <Title>🎯 Deepgram Transcription</Title>
      
      <Status active={isTranscribing} error={error}>
        {error && (
          <>
            <FileText size={20} />
            Error: {error}
          </>
        )}
        {isTranscribing && !error && (
          <>
            <Mic size={20} />
            {isDeepgramConnected ? 'Transcribing XIAO MIC (BLE)...' : 'Connecting to Deepgram...'}
          </>
        )}
        {!isTranscribing && !error && (
          <>
            <MicOff size={20} />
            Ready to Transcribe
          </>
        )}
      </Status>

      <ButtonGroup>
        {!isTranscribing ? (
          <Button onClick={startTranscription} disabled={!isConnected}>
            <Mic size={20} />
            Start Transcription
          </Button>
        ) : (
          <Button onClick={stopTranscription} active>
            <MicOff size={20} />
            Stop Transcription
          </Button>
        )}
        
        <Button onClick={copyTranscription} disabled={!transcription.trim()} secondary>
          <Copy size={20} />
          Copy Text
        </Button>
        
        <Button onClick={clearTranscription} disabled={!transcription.trim()} secondary>
          <Trash2 size={20} />
          Clear
        </Button>
      </ButtonGroup>

      <TranscriptionBox>
        <TranscriptionText>
          {transcription}
          {liveText && <LiveText>{liveText}</LiveText>}
        </TranscriptionText>
      </TranscriptionBox>

      <Controls>
        <Stats>
          Words: {stats.words} | Characters: {stats.characters} | Duration: {formatDuration(stats.duration)} | Audio Packets: {audioPacketsSent}
        </Stats>
      </Controls>
    </Container>
  );
};

export default DeepgramTranscriber;
