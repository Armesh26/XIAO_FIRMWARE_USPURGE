import React, { useState, useCallback } from 'react';
import styled from 'styled-components';
import BLEConnection from './components/BLEConnection';
import DeepgramTranscriber from './components/DeepgramTranscriber';
import AudioRecorder from './components/AudioRecorder';

const AppContainer = styled.div`
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 1rem;
`;

const Header = styled.header`
  text-align: center;
  padding: 2rem 0;
  color: white;
`;

const Title = styled.h1`
  font-size: 2.5rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
`;

const Subtitle = styled.p`
  font-size: 1.2rem;
  opacity: 0.9;
  margin: 0;
`;

const ComponentsContainer = styled.div`
  max-width: 1200px;
  margin: 0 auto;
`;

const MetricsCard = styled.div`
  background: rgba(255, 255, 255, 0.95);
  border-radius: 16px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10px);
`;

const MetricsTitle = styled.h3`
  margin: 0 0 1rem 0;
  color: #333;
  font-size: 1.2rem;
  font-weight: 600;
`;

const MetricsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
`;

const MetricItem = styled.div`
  background: #f8f9fa;
  border-radius: 8px;
  padding: 1rem;
  text-align: center;
`;

const MetricLabel = styled.div`
  font-size: 0.8rem;
  color: #666;
  margin-bottom: 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const MetricValue = styled.div`
  font-size: 1.5rem;
  font-weight: 700;
  color: #333;
  font-family: monospace;
`;

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [audioData, setAudioData] = useState(null);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [audioMetrics, setAudioMetrics] = useState({
    sampleCount: 0,
    bufferSize: 0,
    bytesPerSample: 0,
    packetCount: 0
  });

  const handleConnectionChange = useCallback((connected) => {
    console.log(`🔗 Connection status changed: ${connected}`);
    setIsConnected(connected);
    
    if (!connected) {
      setConnectedDevice(null);
      setAudioData(null);
      // Reset metrics when disconnected
      setAudioMetrics({
        sampleCount: 0,
        bufferSize: 0,
        bytesPerSample: 0,
        packetCount: 0
      });
    }
  }, []);

  const handleAudioData = useCallback((data, audioStream) => {
    // Store the continuous audio stream data
    setAudioData(data);
    
    // Update audio metrics
    setAudioMetrics(prev => ({
      sampleCount: data.length,
      bufferSize: audioStream?.bufferSize || 0,
      bytesPerSample: audioStream?.bytesPerSample || 0,
      packetCount: prev.packetCount + 1
    }));
    
    // Store device info from audio stream
    if (audioStream && audioStream.device) {
      setConnectedDevice(audioStream.device);
    }
    
    // Pass to audio recorder if handler exists
    if (window.audioRecorderHandler) {
      window.audioRecorderHandler(data, audioStream);
    }
  }, []);

  const handleRecordingComplete = useCallback((audioArray) => {
    console.log(`🎵 Recording completed: ${audioArray.length} samples`);
  }, []);

  return (
    <AppContainer>
      <Header>
        <Title>🎤 XIAO Audio Transcriber</Title>
        <Subtitle>Real-time BLE Audio Streaming & Deepgram Transcription</Subtitle>
      </Header>
      
      <ComponentsContainer>
        <BLEConnection 
          onConnectionChange={handleConnectionChange}
          onAudioData={handleAudioData}
        />
        
        {isConnected && (
          <MetricsCard>
            <MetricsTitle>📊 Audio Stream Metrics</MetricsTitle>
            <MetricsGrid>
              <MetricItem>
                <MetricLabel>Sample Count</MetricLabel>
                <MetricValue>{audioMetrics.sampleCount}</MetricValue>
              </MetricItem>
              <MetricItem>
                <MetricLabel>Packet Size</MetricLabel>
                <MetricValue>{audioMetrics.bufferSize} bytes</MetricValue>
              </MetricItem>
              <MetricItem>
                <MetricLabel>Bytes per Sample</MetricLabel>
                <MetricValue>{audioMetrics.bytesPerSample.toFixed(1)}</MetricValue>
              </MetricItem>
              <MetricItem>
                <MetricLabel>Total Packets</MetricLabel>
                <MetricValue>{audioMetrics.packetCount.toLocaleString()}</MetricValue>
              </MetricItem>
            </MetricsGrid>
          </MetricsCard>
        )}
        
        <DeepgramTranscriber 
          isConnected={isConnected}
          audioData={audioData}
        />
        
        <AudioRecorder 
          isConnected={isConnected}
          onRecordingComplete={handleRecordingComplete}
          device={connectedDevice}
        />
      </ComponentsContainer>
    </AppContainer>
  );
}

export default App;