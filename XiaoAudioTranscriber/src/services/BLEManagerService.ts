/**
 * BLE Manager Service for XIAO Audio Transcriber
 * Using react-native-ble-manager for better audio streaming support
 */

import BleManager, { Peripheral, PeripheralInfo } from 'react-native-ble-manager';
import { PermissionsAndroid, Platform, Alert, NativeModules, NativeEventEmitter } from 'react-native';
import { logger } from './LoggerService';

// BLE Configuration
export const AUDIO_SERVICE_UUID = '12345678-1234-5678-1234-567812345678';
export const AUDIO_CHAR_UUID = '12345679-1234-5678-1234-567812345678';
export const DEVICE_NAME = 'MicStreamer';

// Check if BleManager module is available
const BleManagerModule = NativeModules.BleManager;
if (!BleManagerModule) {
  console.error('❌ BleManager native module not found. Make sure react-native-ble-manager is properly linked.');
}
const bleManagerEmitter = BleManagerModule ? new NativeEventEmitter(BleManagerModule) : null;

class BLEManagerService {
  private isInitialized = false;
  private connectedPeripheralId: string | null = null;
  private onAudioDataCallback: ((data: number[], deviceId: string) => void) | null = null;
  private audioBuffer: number[] = []; // Buffer for packet reassembly
  private expectedSamplesPerPacket = 160;

  constructor() {
    logger.info('🔧 BLE Manager Service initialized');
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      logger.logBLEEvent('Initializing BLE Manager');
      
      // Check if native module is available
      if (!BleManagerModule) {
        throw new Error('BleManager native module not found. Please rebuild the app after running pod install.');
      }
      
      // Initialize BLE Manager with proper iOS config
      await BleManager.start({ 
        showAlert: false,
        restoreIdentifierKey: 'XiaoAudioTranscriber',
        queueIdentifierKey: 'XiaoAudioTranscriber',
        forceLegacy: false 
      });
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Request permissions
      await this.requestPermissions();
      
      this.isInitialized = true;
      logger.logBLEEvent('BLE Manager initialized successfully');
    } catch (error) {
      logger.logBLEError('BLE Manager initialization failed', error);
      throw error;
    }
  }

  private setupEventListeners(): void {
    if (!bleManagerEmitter) {
      logger.logBLEError('BLE Manager emitter not available');
      return;
    }
    
    // Peripheral discovered
    bleManagerEmitter.addListener('BleManagerDiscoverPeripheral', (peripheral: Peripheral) => {
      logger.debug('Peripheral discovered', {
        name: peripheral.name || 'Unknown',
        id: peripheral.id,
        rssi: peripheral.rssi
      });
    });

    // Peripheral connected
    bleManagerEmitter.addListener('BleManagerConnectPeripheral', (args) => {
      logger.logBLEEvent('Peripheral connected', { peripheralId: args.peripheral });
    });

    // Peripheral disconnected
    bleManagerEmitter.addListener('BleManagerDisconnectPeripheral', (args) => {
      logger.logBLEEvent('Peripheral disconnected', { peripheralId: args.peripheral });
      this.connectedPeripheralId = null;
    });

    // Characteristic value updated (notifications)
    bleManagerEmitter.addListener('BleManagerDidUpdateValueForCharacteristic', (data) => {
      this.handleCharacteristicUpdate(data);
    });

    // BLE state changed
    bleManagerEmitter.addListener('BleManagerDidUpdateState', (args) => {
      logger.logBLEEvent('BLE state changed', { state: args.state });
    });
  }

  private async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'ios') {
      // For iOS, we should still check if BLE permission is actually granted
      try {
        // Try to enable Bluetooth to trigger permission prompt if needed
        const isEnabled = await BleManager.checkState();
        logger.logBLEEvent('iOS BLE permission check', { isEnabled });
        return isEnabled === 'on';
      } catch (error) {
        logger.logBLEError('iOS BLE permission check failed', error);
        return false;
      }
    }

    if (Platform.OS === 'android') {
      const apiLevel = parseInt(Platform.Version.toString(), 10);

      try {
        if (apiLevel < 31) {
          // Android < 12
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          const hasPermission = granted === PermissionsAndroid.RESULTS.GRANTED;
          logger.logBLEEvent('Location permission result', { granted, hasPermission });
          return hasPermission;
        } else {
          // Android 12+
          const result = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
          ]);

          const hasPermissions = 
            result['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED &&
            result['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED;

          logger.logBLEEvent('BLE permissions result', { 
            connect: result['android.permission.BLUETOOTH_CONNECT'],
            scan: result['android.permission.BLUETOOTH_SCAN'],
            hasPermissions
          });

          return hasPermissions;
        }
      } catch (err) {
        logger.logBLEError('Permission request failed', err);
        return false;
      }
    }

    return false;
  }

  async scanForDevices(onDeviceFound: (device: Peripheral) => void, timeout: number = 10000): Promise<void> {
    try {
      logger.logBLEEvent('Starting BLE scan', { timeout });
      
      // Check BLE state first
      try {
        const state = await BleManager.checkState();
        logger.logBLEEvent('BLE state check', { state });
        
        if (state !== 'on') {
          throw new Error(`BLE is ${state}, not ready for scanning`);
        }
      } catch (stateError) {
        logger.logBLEError('BLE state check failed', stateError);
      }
      
      // Try enabling bluetooth explicitly (might trigger permissions)
      try {
        logger.logBLEEvent('Attempting to enable bluetooth...');
        await BleManager.enableBluetooth();
        logger.logBLEEvent('Bluetooth enable attempt completed');
      } catch (enableError) {
        logger.logBLEError('Bluetooth enable failed (this might be normal on iOS)', enableError);
      }
      
      // Clear previous scan results
      try {
        const connectedPeripherals = await BleManager.getConnectedPeripherals([]);
        logger.debug('Already connected peripherals', { count: connectedPeripherals.length });
      } catch (connectedError) {
        logger.logBLEError('Failed to get connected peripherals', connectedError);
      }

      // Start aggressive scanning - no service filter, allow duplicates, longer timeout
      logger.logBLEEvent('Starting aggressive scan', { 
        serviceUUIDs: 'none (scanning for all)',
        allowDuplicates: true,
        timeoutSeconds: timeout / 1000 
      });
      
      // Try the scan and catch any immediate failures
      try {
        logger.logBLEEvent('Calling BleManager.scan()...');
        // Try approach 1: Standard scan with proper iOS options
      logger.logBLEEvent('Trying scan approach 1: Standard scan with iOS config');
      await BleManager.scan(
        [], // No service filter
        Math.floor(timeout / 1000), // Ensure integer seconds
        false // No duplicates first
      );
        logger.logBLEEvent('Standard scan completed');
        
        // Check results immediately
        let discoveredPeripherals = await BleManager.getDiscoveredPeripherals();
        logger.logBLEEvent('After standard scan', { discovered: discoveredPeripherals.length });
        
        // If no devices found, try alternative approaches
        if (discoveredPeripherals.length === 0) {
          logger.logBLEEvent('No devices found, trying aggressive scan...');
          await BleManager.scan([], 5, true); // Short aggressive scan with duplicates
          discoveredPeripherals = await BleManager.getDiscoveredPeripherals();
          logger.logBLEEvent('After aggressive scan', { discovered: discoveredPeripherals.length });
          
          // If still no devices, try scanning for our specific service
          if (discoveredPeripherals.length === 0) {
            logger.logBLEEvent('Still no devices, trying service-specific scan...');
            await BleManager.scan([AUDIO_SERVICE_UUID], 3, false); // Scan for our service specifically
            discoveredPeripherals = await BleManager.getDiscoveredPeripherals();
            logger.logBLEEvent('After service-specific scan', { discovered: discoveredPeripherals.length });
          }
        }
        
      } catch (scanError) {
        logger.logBLEError('BleManager.scan() failed', scanError);
        throw new Error(`Scan failed: ${scanError.message || scanError}`);
      }
      
      // Get final discovered peripherals
      const discoveredPeripherals = await BleManager.getDiscoveredPeripherals();
      logger.logBLEEvent('Scan completed', { discovered: discoveredPeripherals.length });

      // Report ALL discovered devices for debugging
      logger.logBLEEvent('All discovered devices', {
        devices: discoveredPeripherals.map(p => ({
          name: p.name || 'Unknown',
          id: p.id.substring(0, 8) + '...',
          rssi: p.rssi
        }))
      });

      // Filter and report devices
      discoveredPeripherals.forEach(peripheral => {
        // Report every device to onDeviceFound for now (debugging)
        onDeviceFound(peripheral);
        
        // Log if it matches our target criteria
        if (peripheral.name && (
          peripheral.name.includes(DEVICE_NAME) || 
          peripheral.name.includes('Audio') ||
          peripheral.name.includes('Mic') ||
          peripheral.name.toLowerCase().includes('xiao') ||
          peripheral.name.toLowerCase().includes('ble')
        )) {
          logger.logBLEEvent('Potential target device found', { 
            name: peripheral.name, 
            id: peripheral.id.substring(0, 8) + '...',
            rssi: peripheral.rssi 
          });
        }
      });

    } catch (error) {
      logger.logBLEError('Scan failed', error);
      throw error;
    }
  }

  async connectToDevice(peripheralId: string): Promise<void> {
    try {
      logger.logBLEEvent('Connecting to device', { peripheralId });
      
      // Connect to peripheral
      await BleManager.connect(peripheralId);
      this.connectedPeripheralId = peripheralId;
      
      // Retrieve services and characteristics
      const peripheralInfo = await BleManager.retrieveServices(peripheralId);
      logger.logBLEEvent('Services retrieved', {
        peripheralId,
        services: peripheralInfo.services?.map(s => s.uuid) || []
      });

      // Request larger MTU for audio streaming
      try {
        const mtu = await BleManager.requestMTU(peripheralId, 512);
        logger.logBLEEvent('MTU negotiated', { 
          peripheralId, 
          mtu,
          canFit320Bytes: mtu >= 323,
          note: mtu >= 323 ? 'MTU sufficient for 320-byte packets' : 'MTU may cause packet splitting'
        });
      } catch (mtuError) {
        logger.logBLEError('MTU negotiation failed', mtuError);
      }

      logger.logBLEEvent('Device connected successfully', { peripheralId });

    } catch (error) {
      logger.logBLEError('Connection failed', error);
      this.connectedPeripheralId = null;
      throw error;
    }
  }

  async startAudioMonitoring(onAudioData: (data: number[], deviceId: string) => void): Promise<void> {
    if (!this.connectedPeripheralId) {
      throw new Error('No device connected');
    }

    try {
      this.onAudioDataCallback = onAudioData;
      this.audioBuffer = [];

      logger.logBLEEvent('Starting audio notifications', {
        peripheralId: this.connectedPeripheralId,
        serviceUUID: AUDIO_SERVICE_UUID,
        characteristicUUID: AUDIO_CHAR_UUID
      });

      // Start notifications for audio characteristic
      await BleManager.startNotification(
        this.connectedPeripheralId,
        AUDIO_SERVICE_UUID,
        AUDIO_CHAR_UUID
      );

      logger.logBLEEvent('Audio monitoring started successfully');

    } catch (error) {
      logger.logBLEError('Failed to start audio monitoring', error);
      throw error;
    }
  }

  private handleCharacteristicUpdate(data: {
    peripheral: string;
    service: string;
    characteristic: string;
    value: number[];
  }): void {
    // Only process audio characteristic updates
    if (data.service.toLowerCase() !== AUDIO_SERVICE_UUID.toLowerCase() ||
        data.characteristic.toLowerCase() !== AUDIO_CHAR_UUID.toLowerCase()) {
      return;
    }

    try {
      // Convert byte array to Int16 samples (little-endian)
      const bytes = new Uint8Array(data.value);
      const samples = new Int16Array(bytes.buffer);
      const audioSamples = Array.from(samples);

      logger.logAudioEvent(`Received audio packet`, {
        byteLength: bytes.length,
        sampleCount: audioSamples.length,
        expectedSamples: this.expectedSamplesPerPacket,
        range: {
          min: Math.min(...audioSamples),
          max: Math.max(...audioSamples),
          avg: Math.round(audioSamples.reduce((a, b) => a + b, 0) / audioSamples.length)
        }
      });

      // Add to buffer for packet reassembly
      this.audioBuffer.push(...audioSamples);

      // Check if we have enough samples for a complete packet
      if (this.audioBuffer.length >= this.expectedSamplesPerPacket) {
        const completePacket = this.audioBuffer.slice(0, this.expectedSamplesPerPacket);
        this.audioBuffer = this.audioBuffer.slice(this.expectedSamplesPerPacket);

        logger.logAudioEvent(`Complete packet assembled`, {
          packetSize: completePacket.length,
          bufferRemaining: this.audioBuffer.length
        });

        // Send complete packet to callback
        if (this.onAudioDataCallback) {
          this.onAudioDataCallback(completePacket, data.peripheral);
        }
      }

    } catch (error) {
      logger.logBLEError('Error processing audio data', error);
    }
  }

  async stopAudioMonitoring(): Promise<void> {
    if (!this.connectedPeripheralId) return;

    try {
      await BleManager.stopNotification(
        this.connectedPeripheralId,
        AUDIO_SERVICE_UUID,
        AUDIO_CHAR_UUID
      );
      
      this.onAudioDataCallback = null;
      this.audioBuffer = [];
      
      logger.logBLEEvent('Audio monitoring stopped');
    } catch (error) {
      logger.logBLEError('Failed to stop audio monitoring', error);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connectedPeripheralId) return;

    try {
      await this.stopAudioMonitoring();
      await BleManager.disconnect(this.connectedPeripheralId);
      
      this.connectedPeripheralId = null;
      logger.logBLEEvent('Device disconnected successfully');
    } catch (error) {
      logger.logBLEError('Disconnect failed', error);
    }
  }

  isConnected(): boolean {
    return this.connectedPeripheralId !== null;
  }

  getIsInitialized(): boolean {
    return this.isInitialized;
  }

  getConnectedDeviceId(): string | null {
    return this.connectedPeripheralId;
  }

  destroy(): void {
    // Remove all event listeners
    if (bleManagerEmitter) {
      bleManagerEmitter.removeAllListeners('BleManagerDiscoverPeripheral');
      bleManagerEmitter.removeAllListeners('BleManagerConnectPeripheral');
      bleManagerEmitter.removeAllListeners('BleManagerDisconnectPeripheral');
      bleManagerEmitter.removeAllListeners('BleManagerDidUpdateValueForCharacteristic');
      bleManagerEmitter.removeAllListeners('BleManagerDidUpdateState');
    }
    
    logger.logBLEEvent('BLE Manager service destroyed');
  }
}

export const bleManagerService = new BLEManagerService();
