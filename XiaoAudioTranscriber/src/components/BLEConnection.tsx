/**
 * BLE Connection Component for XIAO Audio Transcriber
 * Rewritten using proper BLE service patterns
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
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
import { Bluetooth, BluetoothOff, Wifi, WifiOff } from 'lucide-react-native';
import { bleManagerService, DEVICE_NAME } from '../services/BLEManagerService';
import { logger } from '../services/LoggerService';

interface BLEConnectionProps {
  onConnectionChange: (connected: boolean) => void;
  onAudioData: (data: number[], deviceId: string) => void;
}

interface DiscoveredDevice {
  id: string;
  name: string;
  rssi: number | null;
  timestamp: string;
}

const BLEConnection: React.FC<BLEConnectionProps> = ({ onConnectionChange, onAudioData }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bluetoothState, setBluetoothState] = useState<string>('Unknown');
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredDevice[]>([]);
  const [connectionInfo, setConnectionInfo] = useState<any>(null);

  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check BLE state on mount
  useEffect(() => {
    checkBluetoothState();
    return () => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
  }, []);

  const checkBluetoothState = useCallback(async () => {
    try {
      const state = await BLEService.getState();
      setBluetoothState(state);
      logger.logBLEEvent('Current BLE state', { state });
    } catch (err) {
      logger.logBLEError('Failed to get BLE state', err);
    }
  }, []);

  const handleError = useCallback((error: any, context: string) => {
    logger.logBLEError(`Error in ${context}`, error);
    
    let errorMessage = 'Unknown error';
    
    if (error.message?.includes('not found')) {
      errorMessage = 'No XIAO device found. Make sure it\'s powered on and advertising.';
    } else if (error.message?.includes('permission')) {
      errorMessage = 'Bluetooth permission denied. Please allow Bluetooth access.';
    } else if (error.message?.includes('timeout')) {
      errorMessage = 'Connection timeout. Try moving closer to the device.';
    } else if (error.message?.includes('not enabled')) {
      errorMessage = 'Bluetooth is not enabled. Please enable Bluetooth in Settings.';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    setError(errorMessage);
    setIsConnecting(false);
    setIsScanning(false);
    setIsConnected(false);
    onConnectionChange(false);
  }, [onConnectionChange]);

  const initializeBLE = useCallback(async () => {
    try {
      logger.logBLEEvent('Initializing BLE Manager');
      await bleManagerService.initialize();
      logger.logBLEEvent('BLE Manager initialized successfully');
    } catch (err) {
      logger.logBLEError('BLE Manager initialization failed', err);
      handleError(err, 'initialization');
    }
  }, [handleError]);

  const scanForDevices = useCallback(async () => {
    if (isScanning) {
      logger.logBLEEvent('Scan already in progress');
      return;
    }

    try {
      setIsScanning(true);
      setError(null);
      setDiscoveredDevices([]);
      
      logger.logBLEEvent('Starting device scan');
      
      // Initialize BLE if needed
      await initializeBLE();
      
      // Start scanning for all devices
      await BLEService.scanDevices(
        (device) => {
          const deviceInfo: DiscoveredDevice = {
            id: device.id,
            name: device.name || 'Unknown Device',
            rssi: device.rssi,
            isConnectable: device.isConnectable,
            serviceUUIDs: device.serviceUUIDs || [],
            timestamp: new Date().toLocaleTimeString()
          };

          logger.info('Device discovered', deviceInfo);

          setDiscoveredDevices(prev => {
            // Check if device already exists
            const exists = prev.some(d => d.id === device.id);
            if (!exists) {
              return [...prev, deviceInfo];
            }
            return prev;
          });

          // Check if this is our target device
          if (device.name === DEVICE_NAME) {
            logger.logBLEEvent('Target device found!', { deviceName: device.name });
            BLEService.stopDeviceScan();
            setIsScanning(false);
            connectToDevice(device);
          }
        },
        null, // Scan all devices
        false // Don't use legacy scan
      );

      // Set scan timeout
      scanTimeoutRef.current = setTimeout(async () => {
        logger.logBLEEvent('Scan timeout reached');
        await BLEService.stopDeviceScan();
        setIsScanning(false);
        
        if (discoveredDevices.length === 0) {
          setError('No BLE devices found. Make sure Bluetooth is enabled and devices are nearby.');
        } else {
          setError(`Found ${discoveredDevices.length} devices but no "${DEVICE_NAME}". Check the device list above.`);
        }
      }, 15000);

    } catch (err) {
      logger.logBLEError('Scan failed', err);
      handleError(err, 'scanning');
      setIsScanning(false);
    }
  }, [isScanning, initializeBLE, discoveredDevices.length, handleError]);

  const connectToDevice = useCallback(async (device: Device) => {
    try {
      setIsConnecting(true);
      setError(null);
      
      logger.logBLEEvent('Connecting to device', { 
        name: device.name, 
        id: device.id 
      });

      // Connect to device
      const connectedDevice = await BLEService.connectToDevice(device.id);
      
      // Try to discover services and characteristics (with fallback)
      try {
        await BLEService.discoverAllServicesAndCharacteristicsForDevice();
      } catch (discoveryError) {
        logger.logBLEError('Full service discovery failed, continuing with direct approach', discoveryError);
        // Continue anyway - we'll try to find the specific service we need
      }
      
      // Setup audio monitoring (this will find the specific service we need)
      await BLEService.setupAudioMonitoring(onAudioData);
      
      // Update connection info
      const info = {
        deviceName: connectedDevice.name,
        deviceId: connectedDevice.id,
        rssi: device.rssi,
        serviceUUID: '12345678-1234-5678-1234-567812345678',
        characteristicUUID: '12345679-1234-5678-1234-567812345678'
      };
      
      setConnectionInfo(info);
      setIsConnected(true);
      setIsConnecting(false);
      onConnectionChange(true);
      
      logger.logBLEEvent('Device connected successfully', info);
      
    } catch (err) {
      logger.logBLEError('Connection failed', err);
      handleError(err, 'connection');
    }
  }, [onAudioData, onConnectionChange, handleError]);

  const disconnect = useCallback(async () => {
    try {
      logger.logBLEEvent('Disconnecting device');
      await BLEService.disconnectDevice();
      
      setIsConnected(false);
      setConnectionInfo(null);
      onConnectionChange(false);
      setError(null);
      
      logger.logBLEEvent('Device disconnected successfully');
    } catch (err) {
      logger.logBLEError('Disconnect failed', err);
      handleError(err, 'disconnect');
    }
  }, [onConnectionChange, handleError]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const requestPermissions = useCallback(async () => {
    try {
      logger.logBLEEvent('Requesting Bluetooth permissions');
      const granted = await BLEService.requestBluetoothPermission();
      if (granted) {
        logger.logBLEEvent('Permissions granted');
        Alert.alert('Success', 'Bluetooth permissions granted!');
      } else {
        logger.logBLEError('Permissions denied');
        Alert.alert('Error', 'Bluetooth permissions are required for this app to work.');
      }
    } catch (err) {
      logger.logBLEError('Permission request failed', err);
      handleError(err, 'permissions');
    }
  }, [handleError]);

  const testBLEState = useCallback(async () => {
    try {
      const state = await BLEService.getState();
      setBluetoothState(state);
      logger.logBLEEvent('BLE state test', { state });
      Alert.alert('BLE State', `Current state: ${state}`);
    } catch (err) {
      logger.logBLEError('BLE state test failed', err);
      Alert.alert('Error', 'Failed to get BLE state: ' + (err as Error).message);
    }
  }, []);

  const isBluetoothReady = bluetoothState === 'PoweredOn';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🔗 XIAO BLE Connection</Text>
      
      <View style={[
        styles.statusContainer,
        { backgroundColor: error ? '#fdf2f2' : isConnected ? '#d4edda' : '#f8f9fa' }
      ]}>
        <Text style={[
          styles.statusText,
          { color: error ? '#721c24' : isConnected ? '#155724' : '#666' }
        ]}>
          {error && '❌ ' + error}
          {isConnected && !error && '✅ Connected to XIAO Board'}
          {isConnecting && !error && '🔄 Connecting to XIAO Board...'}
          {isScanning && !error && '🔍 Scanning for devices...'}
          {!isConnected && !isConnecting && !isScanning && !error && '📱 Ready to Connect'}
        </Text>
        <Text style={styles.stateText}>
          Bluetooth: {bluetoothState} {isBluetoothReady ? '✅' : '❌'}
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        {!isConnected ? (
          <TouchableOpacity
            style={[
              styles.button, 
              styles.connectButton,
              (!isBluetoothReady || isScanning) && styles.buttonDisabled
            ]}
            onPress={scanForDevices}
            disabled={!isBluetoothReady || isScanning}
          >
            {isScanning ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>
                {isScanning ? 'Scanning...' : 'Scan & Connect'}
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.button, styles.disconnectButton]}
            onPress={disconnect}
          >
            <Text style={styles.buttonText}>Disconnect</Text>
          </TouchableOpacity>
        )}
        
        {error && (
          <TouchableOpacity
            style={[styles.button, styles.clearButton]}
            onPress={clearError}
          >
            <Text style={styles.buttonText}>Clear Error</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.button, styles.testButton]}
          onPress={testBLEState}
        >
          <Text style={styles.buttonText}>Test BLE State</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.testButton]}
          onPress={requestPermissions}
        >
          <Text style={styles.buttonText}>Request Permissions</Text>
        </TouchableOpacity>
      </View>

      {/* Discovered Devices List */}
      {discoveredDevices.length > 0 && (
        <View style={styles.devicesContainer}>
          <Text style={styles.devicesTitle}>
            📱 Discovered Devices ({discoveredDevices.length})
          </Text>
          <ScrollView style={styles.devicesList} nestedScrollEnabled>
            {discoveredDevices.map((device) => (
              <View key={device.id} style={styles.deviceItem}>
                <View style={styles.deviceHeader}>
                  <Text style={styles.deviceName}>
                    {device.name === 'Unknown Device' ? '🔍 Unknown Device' : device.name}
                  </Text>
                  <Text style={styles.deviceRSSI}>
                    {device.rssi ? `${device.rssi} dBm` : 'N/A'}
                  </Text>
                </View>
                <Text style={styles.deviceDetails}>
                  ID: {device.id.substring(0, 8)}...
                </Text>
                <Text style={styles.deviceDetails}>
                  Connectable: {device.isConnectable ? '✅' : '❌'}
                </Text>
                {device.serviceUUIDs.length > 0 && (
                  <Text style={styles.deviceDetails}>
                    Services: {device.serviceUUIDs.length}
                  </Text>
                )}
                <Text style={styles.deviceTime}>
                  Found: {device.timestamp}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {connectionInfo && (
        <ScrollView style={styles.infoContainer}>
          <Text style={styles.infoTitle}>Connection Details:</Text>
          <Text style={styles.infoText}>Device: {connectionInfo.deviceName}</Text>
          <Text style={styles.infoText}>ID: {connectionInfo.deviceId}</Text>
          <Text style={styles.infoText}>RSSI: {connectionInfo.rssi} dBm</Text>
          <Text style={styles.infoText}>Service: {connectionInfo.serviceUUID}</Text>
          <Text style={styles.infoText}>Characteristic: {connectionInfo.characteristicUUID}</Text>
          <Text style={styles.infoText}>Status: Connected ✅</Text>
        </ScrollView>
      )}

      {!isBluetoothReady && (
        <View style={styles.warningContainer}>
          <Text style={styles.warningTitle}>Bluetooth Required</Text>
          <Text style={styles.warningText}>
            This app requires Bluetooth to connect to your XIAO board.
            Please enable Bluetooth in Settings and try again.
          </Text>
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
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  stateText: {
    fontSize: 14,
    color: '#666',
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
  testButton: {
    backgroundColor: '#17a2b8',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
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
  deviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  deviceName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  deviceRSSI: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
  },
  deviceDetails: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  deviceTime: {
    fontSize: 10,
    color: '#999',
    fontStyle: 'italic',
  },
  infoContainer: {
    backgroundColor: '#e3f2fd',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    maxHeight: 200,
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
    fontFamily: 'monospace',
  },
  warningContainer: {
    backgroundColor: '#fff3cd',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#ffeaa7',
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 8,
  },
  warningText: {
    fontSize: 14,
    color: '#856404',
  },
});

export default BLEConnection;