import React, { useState, useRef, useCallback, useEffect } from 'react';
import styled from 'styled-components';
import { Bluetooth, BluetoothOff, Wifi, WifiOff } from 'lucide-react';

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

const Status = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 1rem 0;
  padding: 1rem;
  border-radius: 12px;
  background: ${props => {
    if (props.connected) return '#d4edda';
    if (props.error) return '#f8d7da';
    return '#f8f9fa';
  }};
  color: ${props => {
    if (props.connected) return '#155724';
    if (props.error) return '#721c24';
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

const BLEConnection = ({ onConnectionChange, onAudioData }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [device, setDevice] = useState(null);
  const [bluetoothAvailable, setBluetoothAvailable] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState(null);

  const audioCharacteristicRef = useRef(null);
  const deviceRef = useRef(null);

  // BLE Configuration (matching firmware)
  const AUDIO_SERVICE_UUID = "12345678-1234-5678-1234-567812345678";
  const AUDIO_CHAR_UUID = "12345679-1234-5678-1234-567812345678";

  // Check Web Bluetooth availability
  useEffect(() => {
    const checkBluetoothSupport = () => {
      if (navigator.bluetooth) {
        setBluetoothAvailable(true);
        console.log('✅ Web Bluetooth API is available');
      } else {
        setBluetoothAvailable(false);
        setError('Web Bluetooth API not supported. Please use Chrome or Edge browser.');
        console.error('❌ Web Bluetooth API not supported');
      }
    };

    checkBluetoothSupport();
  }, []);

  const handleBLEError = useCallback((error, context) => {
    console.error(`❌ BLE Error in ${context}:`, error);
    
    let errorMessage = 'Unknown error';
    
    if (error.name === 'NotFoundError') {
      errorMessage = 'No XIAO device found. Make sure it\'s powered on and advertising.';
    } else if (error.name === 'SecurityError') {
      errorMessage = 'Bluetooth permission denied. Please allow Bluetooth access.';
    } else if (error.name === 'NetworkError') {
      errorMessage = 'Connection failed. Try moving closer to the device.';
    } else if (error.name === 'NotSupportedError') {
      errorMessage = 'Bluetooth LE not supported on this device.';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    setError(errorMessage);
    setIsConnecting(false);
    setIsConnected(false);
    onConnectionChange(false);
  }, [onConnectionChange]);

  const scanAndConnect = useCallback(async () => {
    if (!bluetoothAvailable) {
      setError('Web Bluetooth not available');
      return;
    }

    try {
      setIsConnecting(true);
      setError(null);
      console.log('🔍 Starting BLE scan for XIAO device...');

      // Request device with specific service UUID
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [AUDIO_SERVICE_UUID] },
          { name: 'MicStreamer' }
        ],
        optionalServices: [AUDIO_SERVICE_UUID]
      });

      console.log('📱 Found device:', device);
      setDevice(device);
      deviceRef.current = device;

      // Connect to device
      console.log('🔗 Connecting to device...');
      const server = await device.gatt.connect();
      console.log('✅ Connected to GATT server');

      // Get the audio service
      console.log('🔍 Discovering services...');
      const service = await server.getPrimaryService(AUDIO_SERVICE_UUID);
      console.log('✅ Found audio service');

      // Get the audio characteristic
      console.log('🔍 Getting audio characteristic...');
      const characteristic = await service.getCharacteristic(AUDIO_CHAR_UUID);
      console.log('✅ Found audio characteristic');

      audioCharacteristicRef.current = characteristic;

      // Set up audio data monitoring
      console.log('🎧 Starting audio notifications...');
      await characteristic.startNotifications();

      characteristic.addEventListener('characteristicvaluechanged', (event) => {
        const value = event.target.value;
        const audioData = new Int16Array(value.buffer);
        
        // Pass audio data to parent component
        if (onAudioData) {
          onAudioData(audioData, {
            deviceId: device.id,
            deviceName: device.name,
            rssi: device.gatt.connected ? 'Connected' : 'Disconnected',
            bufferSize: value.buffer.byteLength,
            sampleCount: audioData.length,
            bytesPerSample: value.buffer.byteLength / audioData.length
          });
        }
      });

      // Set up connection monitoring
      device.addEventListener('gattserverdisconnected', () => {
        console.log('🔌 Device disconnected');
        setIsConnected(false);
        onConnectionChange(false);
        setConnectionInfo(null);
      });

      // Update connection state
      setIsConnected(true);
      setIsConnecting(false);
      onConnectionChange(true);
      
      setConnectionInfo({
        deviceName: device.name,
        deviceId: device.id,
        serviceUUID: AUDIO_SERVICE_UUID,
        characteristicUUID: AUDIO_CHAR_UUID
      });

      console.log('🎉 BLE connection established successfully!');

    } catch (err) {
      handleBLEError(err, 'scanAndConnect');
    }
  }, [bluetoothAvailable, onConnectionChange, onAudioData, handleBLEError]);

  const disconnect = useCallback(async () => {
    try {
      if (deviceRef.current && deviceRef.current.gatt.connected) {
        console.log('🔌 Disconnecting from device...');
        deviceRef.current.gatt.disconnect();
      }
      
      setIsConnected(false);
      setDevice(null);
      setConnectionInfo(null);
      audioCharacteristicRef.current = null;
      deviceRef.current = null;
      onConnectionChange(false);
      setError(null);
      
      console.log('✅ Disconnected successfully');
    } catch (err) {
      console.error('❌ Error during disconnect:', err);
      setError('Error disconnecting: ' + err.message);
    }
  }, [onConnectionChange]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return (
    <Container>
      <Title>🔗 XIAO BLE Connection</Title>
      
      <Status connected={isConnected} error={error}>
        {error && (
          <>
            <BluetoothOff size={20} />
            Error: {error}
          </>
        )}
        {isConnected && !error && (
          <>
            <Bluetooth size={20} />
            Connected to XIAO Board
          </>
        )}
        {isConnecting && !error && (
          <>
            <Bluetooth size={20} />
            Connecting to XIAO Board...
          </>
        )}
        {!isConnected && !isConnecting && !error && (
          <>
            <BluetoothOff size={20} />
            Ready to Connect
          </>
        )}
      </Status>

      {bluetoothAvailable ? (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {!isConnected ? (
            <Button onClick={scanAndConnect} disabled={isConnecting}>
              <Bluetooth size={20} />
              {isConnecting ? 'Connecting...' : 'Connect to XIAO'}
            </Button>
          ) : (
            <Button onClick={disconnect} active>
              <BluetoothOff size={20} />
              Disconnect
            </Button>
          )}
          
          {error && (
            <Button onClick={clearError} secondary>
              Clear Error
            </Button>
          )}
        </div>
      ) : (
        <InfoBox>
          <strong>Web Bluetooth not available</strong><br/>
          This app requires Web Bluetooth API support. Please use:
          <ul>
            <li>Chrome browser (recommended)</li>
            <li>Microsoft Edge</li>
            <li>Opera browser</li>
          </ul>
          Safari and Firefox do not support Web Bluetooth.
        </InfoBox>
      )}

      {connectionInfo && (
        <InfoBox>
          <strong>Connection Details:</strong><br/>
          Device: {connectionInfo.deviceName}<br/>
          Service: {connectionInfo.serviceUUID}<br/>
          Characteristic: {connectionInfo.characteristicUUID}<br/>
          Status: Connected ✅
        </InfoBox>
      )}

      {!bluetoothAvailable && (
        <InfoBox>
          <strong>Browser Compatibility:</strong><br/>
          Web Bluetooth API is required for this app to function.<br/>
          Please switch to a compatible browser or use the iOS app version.
        </InfoBox>
      )}
    </Container>
  );
};

export default BLEConnection;