import React, { useState, useCallback } from 'react';
import styled from 'styled-components';
import { Bluetooth, BluetoothConnected, Wifi, WifiOff } from 'lucide-react';

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
  background: ${props => props.connected ? '#4CAF50' : '#667eea'};
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
  margin: 0.5rem auto;
  min-width: 200px;
  justify-content: center;

  &:hover {
    background: ${props => props.connected ? '#45a049' : '#5a67d8'};
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

const Status = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 1rem 0;
  padding: 1rem;
  border-radius: 12px;
  background: ${props => props.connected ? '#e8f5e8' : '#f8f9fa'};
  color: ${props => props.connected ? '#2e7d32' : '#666'};
  font-weight: 500;
`;

const DeviceInfo = styled.div`
  margin-top: 1rem;
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 12px;
  font-family: monospace;
  font-size: 0.9rem;
`;

const BLEConnection = ({ onConnectionChange, onAudioData }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [device, setDevice] = useState(null);
  const [error, setError] = useState(null);

  // BLE Configuration (matching auto_pitch_recorder.py)
  const AUDIO_SERVICE_UUID = "12345678-1234-5678-1234-567812345678";
  const AUDIO_CHAR_UUID = "12345679-1234-5678-1234-567812345678";

  const scanForDevices = useCallback(async () => {
    try {
      setIsConnecting(true);
      setError(null);

      // Check if Web Bluetooth is supported
      if (!navigator.bluetooth) {
        throw new Error('Web Bluetooth is not supported in this browser');
      }

      // Request device with specific service
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: 'AudioStreamer' },
          { namePrefix: 'MicStreamer' },
          { namePrefix: 'XIAO' }
        ],
        optionalServices: [AUDIO_SERVICE_UUID]
      });

      console.log('Found device:', device);
      setDevice(device);

      // Listen for disconnection
      device.addEventListener('gattserverdisconnected', () => {
        setIsConnected(false);
        setDevice(null);
        onConnectionChange(false);
      });

      return device;
    } catch (err) {
      console.error('Scan error:', err);
      setError(err.message);
      return null;
    }
  }, [onConnectionChange]);

  const connectToDevice = useCallback(async () => {
    try {
      setIsConnecting(true);
      setError(null);

      let targetDevice = device;
      if (!targetDevice) {
        targetDevice = await scanForDevices();
        if (!targetDevice) {
          return;
        }
      }

      console.log('Connecting to device...');
      const server = await targetDevice.gatt.connect();
      console.log('Connected to GATT server');

      // Get the audio service
      const service = await server.getPrimaryService(AUDIO_SERVICE_UUID);
      console.log('Got audio service');

      // Get the audio characteristic
      const characteristic = await service.getCharacteristic(AUDIO_CHAR_UUID);
      console.log('Got audio characteristic');

      // Start notifications
      await characteristic.startNotifications();
      console.log('Started notifications');

      // Store characteristic for later use
      setDevice({ ...device, characteristic, server });
      
      // Store the characteristic for audio streaming
      const audioStream = {
        characteristic,
        server,
        device: targetDevice
      };
      
      // Handle incoming audio data
      characteristic.addEventListener('characteristicvaluechanged', (event) => {
        const data = event.target.value;
        const audioData = new Int16Array(data.buffer);
        
        // Debug: Log first few packets to see what we're getting
        if (Math.random() < 0.01) { // 1% chance to log
          console.log(`🎤 XIAO MIC (BLE): received ${audioData.length} samples, first sample: ${audioData[0]}`);
          console.log(`   📡 Source: XIAO Board microphone via BLE`);
          console.log(`   🚫 NOT using laptop microphone`);
        }
        
        // Pass audio data and stream info to parent component
        if (onAudioData) {
          onAudioData(audioData, audioStream);
        }
      });

      setIsConnected(true);
      onConnectionChange(true);
      setError(null);

    } catch (err) {
      console.error('Connection error:', err);
      setError(err.message);
      setIsConnected(false);
      onConnectionChange(false);
    } finally {
      setIsConnecting(false);
    }
  }, [device, onConnectionChange, onAudioData, scanForDevices]);

  const disconnectDevice = useCallback(async () => {
    try {
      if (device && device.gatt.connected) {
        device.gatt.disconnect();
      }
      setIsConnected(false);
      setDevice(null);
      onConnectionChange(false);
      setError(null);
    } catch (err) {
      console.error('Disconnect error:', err);
      setError(err.message);
    }
  }, [device, onConnectionChange]);

  return (
    <Container>
      <Title>🔗 XIAO Board Connection</Title>
      
      <Status connected={isConnected}>
        {isConnected ? (
          <>
            <BluetoothConnected size={20} />
            Connected to {device?.name || 'XIAO Board'}
          </>
        ) : (
          <>
            <Bluetooth size={20} />
            Not Connected
          </>
        )}
      </Status>

      {error && (
        <div style={{ 
          color: '#e74c3c', 
          margin: '1rem 0', 
          padding: '1rem', 
          background: '#fdf2f2', 
          borderRadius: '8px',
          fontSize: '0.9rem'
        }}>
          Error: {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {!isConnected ? (
          <Button 
            onClick={connectToDevice} 
            disabled={isConnecting}
          >
            {isConnecting ? (
              <>
                <Wifi size={20} />
                Connecting...
              </>
            ) : (
              <>
                <Bluetooth size={20} />
                Connect to XIAO Board
              </>
            )}
          </Button>
        ) : (
          <Button 
            onClick={disconnectDevice}
            connected={true}
          >
            <WifiOff size={20} />
            Disconnect
          </Button>
        )}
      </div>

      {device && (
        <DeviceInfo>
          <strong>Device Info:</strong><br />
          Name: {device.name || 'Unknown'}<br />
          ID: {device.id}<br />
          Connected: {device.gatt?.connected ? 'Yes' : 'No'}
        </DeviceInfo>
      )}
    </Container>
  );
};

export default BLEConnection;
