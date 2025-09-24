/**
 * Fixed BLE Connection Component using react-native-ble-manager
 * Uses the new event system as per documentation
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
import BleManager, { Peripheral } from 'react-native-ble-manager';
import { Bluetooth, BluetoothOff } from 'lucide-react-native';
import { logger } from '../services/LoggerService';

const AUDIO_SERVICE_UUID = '12345678-1234-5678-1234-567812345678';
const AUDIO_CHAR_UUID = '12345679-1234-5678-1234-567812345678';
const DEVICE_NAME = 'MicStreamer';

interface BLEConnectionProps {
  onConnectionChange: (connected: boolean) => void;
  onAudioData: (data: number[], deviceId: string) => void;
}

const BLEConnectionFixed: React.FC<BLEConnectionProps> = ({ onConnectionChange, onAudioData }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discoveredDevices, setDiscoveredDevices] = useState<Peripheral[]>([]);
  const [connectionInfo, setConnectionInfo] = useState<any>(null);

  useEffect(() => {
    initializeBLE();
    
    // Setup event listeners using the new API
    const stopScanListener = BleManager.onStopScan((args) => {
      logger.logBLEEvent('🛑 Scan stopped via event', { status: args.status });
      setIsScanning(false);
    });

    const discoverListener = BleManager.onDiscoverPeripheral((peripheral) => {
      logger.logBLEEvent('📱 Peripheral discovered via event', {
        name: peripheral.name || 'Unknown',
        id: peripheral.id.substring(0, 8) + '...',
        rssi: peripheral.rssi
      });
      
      setDiscoveredDevices(prev => {
        if (!prev.find(d => d.id === peripheral.id)) {
          return [...prev, peripheral];
        }
        return prev;
      });
    });

    const connectListener = BleManager.onConnectPeripheral((args) => {
      logger.logBLEEvent('🔗 Connected via event', { peripheralId: args.peripheral });
    });

    const disconnectListener = BleManager.onDisconnectPeripheral((args) => {
      logger.logBLEEvent('🔌 Disconnected via event', { 
        peripheralId: args.peripheral,
        status: args.status 
      });
      if (args.peripheral === connectionInfo?.deviceId) {
        setIsConnected(false);
        setConnectionInfo(null);
        onConnectionChange(false);
      }
    });

    const stateListener = BleManager.onDidUpdateState((args) => {
      logger.logBLEEvent('📡 BLE state changed via event', { state: args.state });
    });

    const notificationListener = BleManager.onDidUpdateValueForCharacteristic((data) => {
      // Handle audio data notifications
      if (data.service.toLowerCase() === AUDIO_SERVICE_UUID.toLowerCase() &&
          data.characteristic.toLowerCase() === AUDIO_CHAR_UUID.toLowerCase()) {
        
        try {
          // Convert bytes to int16 samples exactly like Python: np.frombuffer(data, dtype=np.int16)
          const bytes = new Uint8Array(data.value);
          
          // Create Int16Array from bytes (little-endian, like Python's frombuffer)
          const audioSamples = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
          
          // Convert to regular array for processing - EXACTLY like React web app
          const samplesArray = Array.from(audioSamples);
          
          // React web app logging (simplified)
          console.log(`🎵 AudioRecorder received: ${samplesArray.length} samples`);
          
          // Send to AudioRecorder callback (exactly like React web app)
          onAudioData(samplesArray);
          
          // Also call global handlers like React web app does
          // @ts-ignore - global is available in React Native
          if (global.audioRecorderHandler) {
            // @ts-ignore - global is available in React Native
            global.audioRecorderHandler(samplesArray, null);
          }
          
          // Call Deepgram handler if transcribing
          // @ts-ignore - global is available in React Native
          if (global.deepgramAudioHandler) {
            // @ts-ignore - global is available in React Native
            global.deepgramAudioHandler(samplesArray);
          }
          
        } catch (err) {
          logger.logBLEError('Error processing audio data (Python-style)', err);
        }
      }
    });

    // Cleanup listeners
    return () => {
      stopScanListener.remove();
      discoverListener.remove();
      connectListener.remove();
      disconnectListener.remove();
      stateListener.remove();
      notificationListener.remove();
    };
  }, [onAudioData, onConnectionChange, connectionInfo?.deviceId]);

  const initializeBLE = useCallback(async () => {
    try {
      logger.logBLEEvent('🔧 Initializing BLE Manager with new API');
      
      await BleManager.start({ 
        showAlert: false,
        restoreIdentifierKey: 'XiaoAudioTranscriber',
        queueIdentifierKey: 'XiaoAudioTranscriber'
      });
      
      logger.logBLEEvent('✅ BLE Manager initialized successfully');
    } catch (err) {
      logger.logBLEError('❌ BLE Manager init failed', err);
      setError('Failed to initialize BLE');
    }
  }, []);

  const scanForDevices = useCallback(async () => {
    if (isScanning) {
      logger.logBLEEvent('⚠️ Already scanning');
      return;
    }

    try {
      setIsScanning(true);
      setError(null);
      setDiscoveredDevices([]);
      
      logger.logBLEEvent('🔍 Starting BLE scan with new API');
      
      // Check BLE state
      const state = await BleManager.checkState();
      logger.logBLEEvent('📡 BLE state', { state });
      
      if (state !== 'on') {
        throw new Error(`Bluetooth is ${state}`);
      }

      // Start scan - devices will come via onDiscoverPeripheral event
      await BleManager.scan([], 10, true); // 10 seconds, allow duplicates
      
      logger.logBLEEvent('🔍 Scan started, waiting for events...');
      
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
      
      logger.logBLEEvent('🔗 Connecting to device', { 
        name: device.name, 
        id: device.id.substring(0, 8) + '...'
      });

      // Connect
      await BleManager.connect(device.id);
      
      // Retrieve services
      await BleManager.retrieveServices(device.id);
      
      // Start notifications for audio
      await BleManager.startNotification(
        device.id,
        AUDIO_SERVICE_UUID,
        AUDIO_CHAR_UUID
      );
      
      // Update state
      const info = {
        deviceName: device.name,
        deviceId: device.id,
        rssi: device.rssi
      };
      setConnectionInfo(info);
      setIsConnected(true);
      setIsConnecting(false);
      onConnectionChange(true);
      
      logger.logBLEEvent('✅ Connected and monitoring audio', info);
      
    } catch (err) {
      logger.logBLEError('❌ Connection failed', err);
      setError('Connection failed: ' + (err as Error).message);
      setIsConnecting(false);
    }
  }, [onConnectionChange]);

  const disconnect = useCallback(async () => {
    if (!connectionInfo?.deviceId) return;
    
    try {
      await BleManager.stopNotification(
        connectionInfo.deviceId,
        AUDIO_SERVICE_UUID,
        AUDIO_CHAR_UUID
      );
      
      await BleManager.disconnect(connectionInfo.deviceId);
      
      setIsConnected(false);
      setConnectionInfo(null);
      onConnectionChange(false);
      setError(null);
      
      logger.logBLEEvent('✅ Disconnected successfully');
    } catch (err) {
      logger.logBLEError('❌ Disconnect failed', err);
    }
  }, [connectionInfo?.deviceId, onConnectionChange]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🔗 BLE Manager (Fixed API)</Text>
      
      <View style={[
        styles.statusContainer,
        { backgroundColor: error ? '#fdf2f2' : isConnected ? '#d4edda' : '#f8f9fa' }
      ]}>
        <Text style={[
          styles.statusText,
          { color: error ? '#721c24' : isConnected ? '#155724' : '#666' }
        ]}>
          {error && '❌ ' + error}
          {isConnected && !error && '✅ Connected & Audio Streaming'}
          {isConnecting && !error && '🔄 Connecting...'}
          {isScanning && !error && '🔍 Scanning for devices...'}
          {!isConnected && !isConnecting && !isScanning && !error && '📱 Ready to scan'}
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
          <Text style={styles.infoText}>ID: {connectionInfo.deviceId.substring(0, 8)}...</Text>
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

export default BLEConnectionFixed;
