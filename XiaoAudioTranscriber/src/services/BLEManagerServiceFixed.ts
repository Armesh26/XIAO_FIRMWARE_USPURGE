/**
 * Fixed BLE Manager Service using event-driven approach
 * This uses the recommended pattern from react-native-ble-manager examples
 */

import BleManager, { Peripheral } from 'react-native-ble-manager';
import { PermissionsAndroid, Platform, NativeModules, NativeEventEmitter } from 'react-native';
import { logger } from './LoggerService';

// BLE Configuration
export const AUDIO_SERVICE_UUID = '12345678-1234-5678-1234-567812345678';
export const AUDIO_CHAR_UUID = '12345679-1234-5678-1234-567812345678';
export const DEVICE_NAME = 'MicStreamer';

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = BleManagerModule ? new NativeEventEmitter(BleManagerModule) : null;

class BLEManagerServiceFixed {
  private isInitialized = false;
  private connectedPeripheralId: string | null = null;
  private onAudioDataCallback: ((data: number[], deviceId: string) => void) | null = null;
  private discoveredDevices: Map<string, Peripheral> = new Map();
  private scanCallback: ((device: Peripheral) => void) | null = null;
  private isScanning = false;

  constructor() {
    logger.info('🔧 Fixed BLE Manager Service initialized');
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      logger.logBLEEvent('Initializing Fixed BLE Manager');
      
      if (!BleManagerModule) {
        throw new Error('BleManager native module not found');
      }
      
      // Start BLE Manager with minimal config
      await BleManager.start({ showAlert: false });
      
      // Setup event listeners FIRST
      this.setupEventListeners();
      
      // Check permissions
      await this.requestPermissions();
      
      this.isInitialized = true;
      logger.logBLEEvent('Fixed BLE Manager initialized successfully');
    } catch (error) {
      logger.logBLEError('Fixed BLE Manager initialization failed', error);
      throw error;
    }
  }

  private setupEventListeners(): void {
    if (!bleManagerEmitter) {
      logger.logBLEError('BLE Manager emitter not available');
      return;
    }
    
    // Key: Listen for discovered peripherals during scan
    bleManagerEmitter.addListener('BleManagerDiscoverPeripheral', (peripheral: Peripheral) => {
      logger.logBLEEvent('🔍 Peripheral discovered via event', {
        name: peripheral.name || 'Unknown',
        id: peripheral.id.substring(0, 8) + '...',
        rssi: peripheral.rssi
      });
      
      // Store the device
      this.discoveredDevices.set(peripheral.id, peripheral);
      
      // Call the callback if scanning
      if (this.scanCallback) {
        this.scanCallback(peripheral);
      }
    });

    // Stop scan event
    bleManagerEmitter.addListener('BleManagerStopScan', () => {
      logger.logBLEEvent('🛑 Scan stopped via event');
      this.isScanning = false;
    });

    // Connection events
    bleManagerEmitter.addListener('BleManagerConnectPeripheral', (args) => {
      logger.logBLEEvent('🔗 Connected to peripheral', { peripheralId: args.peripheral });
    });

    bleManagerEmitter.addListener('BleManagerDisconnectPeripheral', (args) => {
      logger.logBLEEvent('🔌 Disconnected from peripheral', { peripheralId: args.peripheral });
      if (args.peripheral === this.connectedPeripheralId) {
        this.connectedPeripheralId = null;
      }
    });

    // BLE state changes
    bleManagerEmitter.addListener('BleManagerDidUpdateState', (args) => {
      logger.logBLEEvent('📡 BLE state changed', { state: args.state });
    });
  }

  private async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'ios') {
      // iOS permissions handled via Info.plist
      return true;
    }

    if (Platform.OS === 'android') {
      const apiLevel = parseInt(Platform.Version.toString(), 10);

      try {
        if (apiLevel < 31) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          return granted === PermissionsAndroid.RESULTS.GRANTED;
        } else {
          const result = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
          ]);
          return Object.values(result).every(r => r === PermissionsAndroid.RESULTS.GRANTED);
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
      if (this.isScanning) {
        logger.logBLEEvent('⚠️ Already scanning, stopping previous scan');
        await BleManager.stopScan();
      }

      logger.logBLEEvent('🔍 Starting event-driven scan', { timeout });
      
      // Clear previous results
      this.discoveredDevices.clear();
      this.scanCallback = onDeviceFound;
      
      // Check BLE state
      const state = await BleManager.checkState();
      logger.logBLEEvent('📡 BLE state', { state });
      
      if (state !== 'on') {
        throw new Error(`Bluetooth is ${state}, not available for scanning`);
      }

      // Start scanning - the devices will come via events
      this.isScanning = true;
      await BleManager.scan([], Math.floor(timeout / 1000), false);
      
      logger.logBLEEvent('🔍 Scan started, waiting for events...');
      
      // Wait for scan to complete
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          this.isScanning = false;
          this.scanCallback = null;
          
          logger.logBLEEvent('⏰ Scan timeout reached', { 
            discovered: this.discoveredDevices.size,
            devices: Array.from(this.discoveredDevices.values()).map(d => ({
              name: d.name || 'Unknown',
              id: d.id.substring(0, 8) + '...'
            }))
          });
          
          resolve();
        }, timeout + 1000); // Extra second for cleanup
        
        // Listen for scan stop
        const stopListener = bleManagerEmitter?.addListener('BleManagerStopScan', () => {
          clearTimeout(timeoutId);
          stopListener?.remove();
          this.isScanning = false;
          this.scanCallback = null;
          
          logger.logBLEEvent('✅ Scan completed via event', { 
            discovered: this.discoveredDevices.size 
          });
          
          resolve();
        });
      });

    } catch (error) {
      this.isScanning = false;
      this.scanCallback = null;
      logger.logBLEError('❌ Scan failed', error);
      throw error;
    }
  }

  async connectToDevice(peripheralId: string): Promise<void> {
    try {
      logger.logBLEEvent('🔗 Connecting to device', { peripheralId });
      
      await BleManager.connect(peripheralId);
      this.connectedPeripheralId = peripheralId;
      
      // Discover services
      await BleManager.retrieveServices(peripheralId);
      
      logger.logBLEEvent('✅ Connected successfully', { peripheralId });
    } catch (error) {
      logger.logBLEError('❌ Connection failed', error);
      throw error;
    }
  }

  async startAudioMonitoring(onAudioData: (data: number[], deviceId: string) => void): Promise<void> {
    if (!this.connectedPeripheralId) {
      throw new Error('No device connected');
    }

    try {
      this.onAudioDataCallback = onAudioData;
      
      await BleManager.startNotification(
        this.connectedPeripheralId,
        AUDIO_SERVICE_UUID,
        AUDIO_CHAR_UUID
      );
      
      logger.logBLEEvent('🎵 Audio monitoring started');
    } catch (error) {
      logger.logBLEError('❌ Failed to start audio monitoring', error);
      throw error;
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

  async disconnect(): Promise<void> {
    if (!this.connectedPeripheralId) return;

    try {
      await BleManager.disconnect(this.connectedPeripheralId);
      this.connectedPeripheralId = null;
      logger.logBLEEvent('🔌 Disconnected successfully');
    } catch (error) {
      logger.logBLEError('❌ Disconnect failed', error);
    }
  }

  destroy(): void {
    if (bleManagerEmitter) {
      bleManagerEmitter.removeAllListeners('BleManagerDiscoverPeripheral');
      bleManagerEmitter.removeAllListeners('BleManagerStopScan');
      bleManagerEmitter.removeAllListeners('BleManagerConnectPeripheral');
      bleManagerEmitter.removeAllListeners('BleManagerDisconnectPeripheral');
      bleManagerEmitter.removeAllListeners('BleManagerDidUpdateState');
    }
    
    logger.logBLEEvent('🧹 Fixed BLE Manager service destroyed');
  }
}

export const bleManagerServiceFixed = new BLEManagerServiceFixed();
