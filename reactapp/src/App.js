import React, { useState, useCallback } from 'react';
import styled from 'styled-components';
import BLEConnection from './components/BLEConnection';
import AudioRecorder from './components/AudioRecorder';
import DeepgramTranscriber from './components/DeepgramTranscriber';

const AppContainer = styled.div`
  min-height: 100vh;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
`;

const Header = styled.header`
  text-align: center;
  margin-bottom: 2rem;
  color: white;
`;

const Title = styled.h1`
  font-size: 3rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  text-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
  background: linear-gradient(45deg, #fff, #f0f0f0);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
`;

const Subtitle = styled.p`
  font-size: 1.2rem;
  opacity: 0.9;
  margin: 0;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
`;

const ComponentsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  max-width: 1200px;
`;

const Row = styled.div`
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

const StatusBar = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  padding: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  z-index: 1000;
`;

const StatusIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 20px;
  background: ${props => props.connected ? '#4CAF50' : '#f44336'};
  color: white;
  font-weight: 600;
  font-size: 0.9rem;
`;

const App = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [audioData, setAudioData] = useState(null);
  const [recordedAudio, setRecordedAudio] = useState(null);
  const [audioHandler, setAudioHandler] = useState(null);

  const handleConnectionChange = useCallback((connected) => {
    setIsConnected(connected);
  }, []);

  const handleAudioData = useCallback((data, audioStream) => {
    // Store the continuous audio stream data
    setAudioData(data);
    
    // Also pass to the audio handler if it exists
    if (audioHandler) {
      audioHandler(data, audioStream);
    }
  }, [audioHandler]);

  const handleRecordingComplete = useCallback((audioData) => {
    setRecordedAudio(audioData);
  }, []);

  const handleAudioHandlerRegister = useCallback((handler) => {
    setAudioHandler(() => handler);
  }, []);

  return (
    <>
      <StatusBar>
        <div style={{ fontWeight: '600', color: '#333' }}>
          🎤 XIAO Audio Transcriber
        </div>
        <StatusIndicator connected={isConnected}>
          <div style={{ 
            width: '8px', 
            height: '8px', 
            borderRadius: '50%', 
            background: isConnected ? '#fff' : '#fff' 
          }} />
          {isConnected ? 'Connected' : 'Disconnected'}
        </StatusIndicator>
      </StatusBar>

      <AppContainer style={{ paddingTop: '80px' }}>
        <Header>
          <Title>🎤 XIAO Audio Transcriber</Title>
          <Subtitle>
            Connect to your XIAO board and transcribe speech in real-time with Deepgram
          </Subtitle>
        </Header>

        <ComponentsContainer>
          <Row>
            <BLEConnection 
              onConnectionChange={handleConnectionChange}
              onAudioData={handleAudioData}
            />
          </Row>

          <Row>
            <AudioRecorder 
              isConnected={isConnected}
              onAudioData={handleAudioData}
              onRecordingComplete={handleRecordingComplete}
              onAudioHandlerRegister={handleAudioHandlerRegister}
            />
            <DeepgramTranscriber 
              isConnected={isConnected}
              audioData={audioData}
            />
          </Row>
        </ComponentsContainer>
      </AppContainer>
    </>
  );
};

export default App;
