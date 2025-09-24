import React, { useState, useRef, useCallback, useEffect } from 'react';
import styled from 'styled-components';
import { FileText, Mic, MicOff, Copy, Trash2 } from 'lucide-react';
import { deepgramService } from '../services/DeepgramService';
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

  const startTimeRef = useRef(null);

  // Initialize Deepgram service listeners
  useEffect(() => {
    deepgramService.setListeners({
      onTranscript: (data) => {
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
      onError: (error) => {
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

  // Handle audio data processing
  useEffect(() => {
    if (audioData && isTranscribing && isDeepgramConnected) {
      try {
        // Process audio data through audio processor
        const processedChunk = audioProcessor.processAudioData(audioData);
        
        if (processedChunk) {
          // Convert to format Deepgram expects
          const deepgramData = audioProcessor.convertForDeepgram(processedChunk);
          
          // Send to Deepgram
          const success = deepgramService.sendAudioData(deepgramData);
          
          if (success) {
            setAudioPacketsSent(prev => prev + 1);
            
            // Log every 50 packets
            if (audioPacketsSent % 50 === 0) {
              console.log(`🎵 Sent ${processedChunk.length} samples to Deepgram (packet ${audioPacketsSent + 1})`);
            }
          }
        }
      } catch (error) {
        console.error('❌ Error processing audio data:', error);
        setError('Failed to process audio data: ' + error.message);
      }
    }
  }, [audioData, isTranscribing, isDeepgramConnected, audioPacketsSent]);

  const startTranscription = useCallback(async () => {
    if (!isConnected) {
      alert('Please connect to XIAO board first');
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
        startTimeRef.current = Date.now();
        
        // Reset audio processor
        audioProcessor.reset();
        
        console.log('✅ Transcription started successfully');
      } else {
        setError('Failed to start Deepgram transcription');
      }
    } catch (err) {
      console.error('❌ Failed to start transcription:', err);
      setError(err.message || 'Failed to start transcription');
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
      await navigator.clipboard.writeText(transcription.trim());
      console.log('✅ Transcription copied to clipboard');
    } catch (err) {
      console.error('❌ Failed to copy text:', err);
      alert('Failed to copy text to clipboard');
    }
  }, [transcription]);

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Container>
      <Title>🎯 Deepgram Nova-3 Transcription</Title>
      
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
            {isDeepgramConnected ? 'Transcribing XIAO Audio...' : 'Connecting to Deepgram...'}
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