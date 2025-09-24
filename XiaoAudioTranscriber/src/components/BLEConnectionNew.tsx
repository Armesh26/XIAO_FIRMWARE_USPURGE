/**
 * BLE Connection Component using react-native-ble-manager
 * Simplified version for better audio streaming
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Peripheral } from 'react-native-ble-manager';
import { Bluetooth, BluetoothOff } from 'lucide-react-native';
import BleManager, { Peripheral } from 'react-native-ble-manager';
import { logger } from '../services/LoggerService';

const AUDIO_SERVICE_UUID = '12345678-1234-5678-1234-567812345678';
const AUDIO_CHAR_UUID = '12345679-1234-5678-1234-567812345678';
const DEVICE_NAME = 'MicStreamer';
import { logger } from '../services/LoggerService';

interface BLEConnectionProps {
  onConnectionChange: (connected: boolean) => void;
  onAudioData: (data: number[], deviceId: string) => void;
}

const BLEConnectionNew: React.FC<BLEConnectionProps> = ({ onConnectionChange, onAudioData }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discoveredDevices, setDiscoveredDevices] = useState<Peripheral[]>([]);
  const [connectionInfo, setConnectionInfo] = useState<any>(null);

  useEffect(() => {
    initializeBLE();
  }, []);

  const initializeBLE = useCallback(async () => {
    try {
      await bleManagerService.initialize();
      logger.logBLEEvent('✅ BLE Manager ready');
    } catch (err) {
      logger.logBLEError('❌ BLE Manager init failed', err);
      setError('Failed to initialize BLE');
    }
  }, []);

  const scanForDevices = useCallback(async () => {
    if (isScanning) {
      logger.logBLEEvent('⚠️ Scan already in progress, ignoring new request');
      return;
    }

    try {
      setIsScanning(true);
      setError(null);
      setDiscoveredDevices([]);
      
      logger.logBLEEvent('🔍 Starting scan process');
      
      // Ensure BLE is initialized
      if (!bleManagerService.getIsInitialized()) {
        logger.logBLEEvent('🔧 Re-initializing BLE service...');
        await bleManagerService.initialize();
      }
      
      logger.logBLEEvent('📡 Calling scanForDevices...');
      
      // Add timeout wrapper to catch hanging scans
      const scanPromise = bleManagerService.scanForDevices(
        (device) => {
          logger.logBLEEvent('📱 Device found', { 
            name: device.name, 
            id: device.id 
          });
          
          setDiscoveredDevices(prev => {
            if (!prev.find(d => d.id === device.id)) {
              return [...prev, device];
            }
            return prev;
          });

          // Log discovered device info
          logger.logBLEEvent('📱 Device discovered', { 
            name: device.name || 'Unknown Device',
            id: device.id.substring(0, 8) + '...',
            rssi: device.rssi 
          });
        },
        15000 // Increased timeout for better discovery
      );

      // Add a timeout to detect hanging scans
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Scan timeout - operation took longer than expected'));
        }, 20000); // 20 second timeout
      });

      await Promise.race([scanPromise, timeoutPromise]);

      setIsScanning(false);
      
    } catch (err) {
      logger.logBLEError('❌ Scan failed', err);
      setError('Scan failed: ' + (err as Error).message);
      setIsScanning(false);
    }
  }, [isScanning]);

  const connectToDevice = useCallback(async (device: Peripheral) => {
    try {
      setIsConnecting(true);
      setError(null);
      
      logger.logBLEEvent('🔗 Connecting', { deviceId: device.id });

      // Connect to device
      await bleManagerService.connectToDevice(device.id);
      
      // Start audio monitoring
      await bleManagerService.startAudioMonitoring(onAudioData);
      
      // Update state
      setIsConnected(true);
      setIsConnecting(false);
      setConnectionInfo({
        deviceName: device.name,
        deviceId: device.id,
        rssi: device.rssi
      });
      onConnectionChange(true);
      
      logger.logBLEEvent('✅ Connected and monitoring audio');
      
    } catch (err) {
      logger.logBLEError('❌ Connection failed', err);
      setError('Connection failed: ' + (err as Error).message);
      setIsConnecting(false);
    }
  }, [onAudioData, onConnectionChange]);

  const disconnect = useCallback(async () => {
    try {
      await bleManagerService.disconnect();
      
      setIsConnected(false);
      setConnectionInfo(null);
      onConnectionChange(false);
      setError(null);
      
      logger.logBLEEvent('✅ Disconnected');
    } catch (err) {
      logger.logBLEError('❌ Disconnect failed', err);
    }
  }, [onConnectionChange]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🔗 BLE Manager Connection</Text>
      
      <View style={[
        styles.statusContainer,
        { backgroundColor: error ? '#fdf2f2' : isConnected ? '#d4edda' : '#f8f9fa' }
      ]}>
        <Text style={[
          styles.statusText,
          { color: error ? '#721c24' : isConnected ? '#155724' : '#666' }
        ]}>
          {error && '❌ ' + error}
          {isConnected && !error && '✅ Connected & Monitoring Audio'}
          {isConnecting && !error && '🔄 Connecting...'}
          {isScanning && !error && '🔍 Scanning...'}
          {!isConnected && !isConnecting && !isScanning && !error && '📱 Ready'}
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        {!isConnected ? (
          <TouchableOpacity
            style={[styles.button, styles.connectButton]}
            onPress={scanForDevices}
            disabled={isScanning || isConnecting}
          >
            {isScanning ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>
                🔍 Scan & Connect
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.button, styles.disconnectButton]}
            onPress={disconnect}
          >
            <Text style={styles.buttonText}>🔌 Disconnect</Text>
          </TouchableOpacity>
        )}
        
        {error && (
          <TouchableOpacity
            style={[styles.button, styles.clearButton]}
            onPress={() => setError(null)}
          >
            <Text style={styles.buttonText}>Clear Error</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity
          style={[styles.button, styles.debugButton]}
          onPress={() => {
            // Try connecting to MicStreamer by name (manual override)
            const mockDevice = {
              id: 'manual-micstreamer',
              name: 'MicStreamer',
              rssi: -50
            };
            logger.logBLEEvent('🔧 Manual connection attempt', { device: mockDevice });
            // This won't work but will help debug the connection flow
            setError('Manual connection - check if this triggers different errors');
          }}
        >
          <Text style={styles.buttonText}>🔧 Debug Connection</Text>
        </TouchableOpacity>
      </View>

      {discoveredDevices.length > 0 && (
        <View style={styles.devicesContainer}>
          <Text style={styles.devicesTitle}>
            📱 Discovered Devices ({discoveredDevices.length})
          </Text>
          <ScrollView style={styles.devicesList}>
            {discoveredDevices.map((device) => (
              <TouchableOpacity
                key={device.id}
                style={styles.deviceItem}
                onPress={() => connectToDevice(device)}
              >
                <Text style={styles.deviceName}>
                  {device.name || 'Unknown Device'}
                </Text>
                <Text style={styles.deviceDetails}>
                  ID: {device.id.substring(0, 8)}... | RSSI: {device.rssi || 'N/A'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {connectionInfo && (
        <View style={styles.infoContainer}>
          <Text style={styles.infoTitle}>Connection Info:</Text>
          <Text style={styles.infoText}>Device: {connectionInfo.deviceName}</Text>
          <Text style={styles.infoText}>ID: {connectionInfo.deviceId}</Text>
          <Text style={styles.infoText}>RSSI: {connectionInfo.rssi}</Text>
          <Text style={styles.infoText}>Status: ✅ Audio Streaming</Text>
        </View>
      )}
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
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
    marginBottom: 20,
  },
  statusContainer: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  buttonContainer: {
    gap: 12,
  },
  button: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  connectButton: {
    backgroundColor: '#667eea',
  },
  disconnectButton: {
    backgroundColor: '#e74c3c',
  },
  clearButton: {
    backgroundColor: '#6c757d',
  },
  debugButton: {
    backgroundColor: '#ffc107',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  devicesContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    maxHeight: 200,
  },
  devicesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  devicesList: {
    maxHeight: 150,
  },
  deviceItem: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#007bff',
  },
  deviceName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  deviceDetails: {
    fontSize: 12,
    color: '#666',
  },
  infoContainer: {
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1976d2',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
});

export default BLEConnectionNew;
