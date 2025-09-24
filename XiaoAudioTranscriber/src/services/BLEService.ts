/**
 * BLE Service for XIAO Audio Transcriber
 * Based on react-native-ble-plx reference implementation
 */

import {
  BleError,
  BleErrorCode,
  BleManager,
  Device,
  State as BluetoothState,
  LogLevel,
  type DeviceId,
  type UUID,
  type Characteristic,
  type Base64,
  type Subscription
} from 'react-native-ble-plx';
import { PermissionsAndroid, Platform, Alert } from 'react-native';
import { logger } from './LoggerService';

// BLE Configuration (matching firmware)
export const AUDIO_SERVICE_UUID = '12345678-1234-5678-1234-567812345678';
export const AUDIO_CHAR_UUID = '12345679-1234-5678-1234-567812345678';
export const DEVICE_NAME = 'MicStreamer';

const deviceNotConnectedErrorText = 'Device is not connected';

class BLEServiceInstance {
  manager: BleManager;
  device: Device | null;
  characteristicMonitor: Subscription | null;
  isCharacteristicMonitorDisconnectExpected = false;
  onAudioDataCallback: ((data: number[], device: Device) => void) | null = null;

  constructor() {
    this.device = null;
    this.characteristicMonitor = null;
    this.manager = new BleManager();
    this.manager.setLogLevel(LogLevel.Verbose);
    logger.info('🔧 BLE Service initialized');
  }

  createNewManager = () => {
    this.manager = new BleManager();
    this.manager.setLogLevel(LogLevel.Verbose);
    logger.info('🔧 BLE Manager recreated');
  };

  getDevice = () => this.device;

  initializeBLE = (): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      logger.logBLEEvent('Initializing BLE');
      
      const subscription = this.manager.onStateChange(state => {
        logger.logBLEEvent('BLE State changed', { state });
        
        switch (state) {
          case BluetoothState.Unsupported:
            logger.logBLEError('Bluetooth not supported on this device');
            this.showError('Bluetooth is not supported on this device');
            reject(new Error('Bluetooth not supported'));
            break;
            
          case BluetoothState.PoweredOff:
            logger.logBLEEvent('Bluetooth powered off, attempting to enable');
            this.onBluetoothPowerOff();
            this.manager.enable().catch((error: BleError) => {
              if (error.errorCode === BleErrorCode.BluetoothUnauthorized) {
                this.requestBluetoothPermission();
              }
              reject(error);
            });
            break;
            
          case BluetoothState.Unauthorized:
            logger.logBLEError('Bluetooth unauthorized');
            this.requestBluetoothPermission();
            reject(new Error('Bluetooth unauthorized'));
            break;
            
          case BluetoothState.PoweredOn:
            logger.logBLEEvent('Bluetooth ready');
            resolve();
            subscription.remove();
            break;
            
          default:
            logger.logBLEError('Unsupported BLE state', { state });
            reject(new Error(`Unsupported state: ${state}`));
        }
      }, true);
    });

  onBluetoothPowerOff = () => {
    logger.logBLEEvent('Bluetooth powered off');
    this.showError('Bluetooth is turned off. Please enable Bluetooth in Settings.');
  };

  scanDevices = async (
    onDeviceFound: (device: Device) => void, 
    UUIDs: UUID[] | null = null, 
    legacyScan: boolean = false
  ): Promise<void> => {
    logger.logBLEEvent('Starting device scan', { 
      serviceUUIDs: UUIDs, 
      legacyScan,
      targetDevice: DEVICE_NAME 
    });

    return new Promise<void>((resolve, reject) => {
      this.manager
        .startDeviceScan(UUIDs, { allowDuplicates: false, legacyScan }, (error, device) => {
          if (error) {
            logger.logBLEError('Scan error', error);
            this.onError(error);
            this.manager.stopDeviceScan();
            reject(error);
            return;
          }
          
          if (device) {
            logger.debug('Device found during scan', {
              name: device.name || 'Unknown',
              id: device.id,
              rssi: device.rssi,
              isConnectable: device.isConnectable
            });
            onDeviceFound(device);
          }
        })
        .then(() => {
          logger.logBLEEvent('Scan started successfully');
          resolve();
        })
        .catch(error => {
          logger.logBLEError('Failed to start scan', error);
          reject(error);
        });
    });
  };

  stopDeviceScan = (): Promise<void> => {
    logger.logBLEEvent('Stopping device scan');
    return this.manager.stopDeviceScan();
  };

  connectToDevice = (deviceId: DeviceId, timeout: number = 10000): Promise<Device> =>
    new Promise<Device>((resolve, reject) => {
      logger.logBLEEvent('Connecting to device', { deviceId, timeout });
      
      this.manager.stopDeviceScan();
      this.manager
        .connectToDevice(deviceId, { timeout })
        .then(device => {
          this.device = device;
          logger.logBLEEvent('Device connected successfully', { 
            name: device.name, 
            id: device.id 
          });
          resolve(device);
        })
        .catch(error => {
          if (error.errorCode === BleErrorCode.DeviceAlreadyConnected && this.device) {
            logger.logBLEEvent('Device already connected', { deviceId });
            resolve(this.device);
          } else {
            logger.logBLEError('Connection failed', error);
            this.onError(error);
            reject(error);
          }
        });
    });

  discoverAllServicesAndCharacteristicsForDevice = async (): Promise<Device> =>
    new Promise<Device>((resolve, reject) => {
      if (!this.device) {
        const error = new Error(deviceNotConnectedErrorText);
        logger.logBLEError('Cannot discover services - no device connected');
        reject(error);
        return;
      }

      logger.logBLEEvent('Discovering services and characteristics', { 
        deviceId: this.device.id,
        deviceName: this.device.name,
        isConnected: this.device.isConnected
      });
      
      // Check if device is still connected
      this.manager.isDeviceConnected(this.device.id)
        .then(isConnected => {
          if (!isConnected) {
            throw new Error('Device is not connected');
          }
          
          logger.logBLEEvent('Device connection verified, starting service discovery');
          
          return this.manager.discoverAllServicesAndCharacteristicsForDevice(this.device!.id);
        })
        .then(device => {
          logger.logBLEEvent('Services and characteristics discovered', {
            servicesCount: device.services?.length || 0,
            serviceUUIDs: device.services?.map(s => s.uuid) || [],
            characteristicsCount: device.services?.reduce((total, service) => 
              total + (service.characteristics?.length || 0), 0) || 0
          });
          
          // Log detailed service information
          if (device.services) {
            device.services.forEach((service, index) => {
              logger.debug(`Service ${index + 1}`, {
                uuid: service.uuid,
                characteristicsCount: service.characteristics?.length || 0,
                characteristicUUIDs: service.characteristics?.map(c => c.uuid) || []
              });
            });
          }
          
          this.device = device;
          resolve(device);
        })
        .catch(error => {
          logger.logBLEError('Service discovery failed, trying alternative method', {
            error: error.message,
            errorCode: error.errorCode,
            reason: error.reason,
            deviceId: this.device?.id
          });
          
          // Try alternative service discovery method
          this.tryAlternativeServiceDiscovery()
            .then(device => {
              logger.logBLEEvent('Alternative service discovery succeeded');
              this.device = device;
              resolve(device);
            })
            .catch(altError => {
              logger.logBLEError('Alternative service discovery also failed', altError);
              this.onError(error);
              reject(error);
            });
        });
    });

  tryAlternativeServiceDiscovery = async (): Promise<Device> => {
    if (!this.device) {
      throw new Error(deviceNotConnectedErrorText);
    }

    logger.logBLEEvent('Trying alternative service discovery method');
    
    try {
      // Try to get services directly
      const services = await this.manager.servicesForDevice(this.device.id);
      logger.logBLEEvent('Services retrieved directly', {
        servicesCount: services.length,
        serviceUUIDs: services.map(s => s.uuid)
      });

      // For each service, try to get characteristics
      for (const service of services) {
        try {
          const characteristics = await this.manager.characteristicsForDevice(this.device.id, service.uuid);
          logger.debug(`Service ${service.uuid} characteristics`, {
            characteristicsCount: characteristics.length,
            characteristicUUIDs: characteristics.map(c => c.uuid)
          });
        } catch (charError) {
          logger.logBLEError(`Failed to get characteristics for service ${service.uuid}`, charError);
        }
      }

      // Return the device with services
      return this.device;
    } catch (error) {
      logger.logBLEError('Alternative service discovery failed', error);
      throw error;
    }
  };

  setupAudioMonitoring = (
    onAudioData: (data: number[], device: Device) => void
  ): Promise<void> => {
    if (!this.device) {
      const error = new Error(deviceNotConnectedErrorText);
      logger.logBLEError('Cannot setup audio monitoring - no device connected');
      throw error;
    }

    this.onAudioDataCallback = onAudioData;
    logger.logBLEEvent('Setting up audio monitoring', {
      serviceUUID: AUDIO_SERVICE_UUID,
      characteristicUUID: AUDIO_CHAR_UUID
    });

    return new Promise<void>((resolve, reject) => {
      // First try to find the service and characteristic
      this.findAudioServiceAndCharacteristic()
        .then(() => {
          logger.logBLEEvent('Audio service found, setting up monitoring');
          
          this.characteristicMonitor = this.manager.monitorCharacteristicForDevice(
            this.device!.id,
            AUDIO_SERVICE_UUID,
            AUDIO_CHAR_UUID,
            (error, characteristic) => {
              if (error) {
                if (error.errorCode === 2 && this.isCharacteristicMonitorDisconnectExpected) {
                  this.isCharacteristicMonitorDisconnectExpected = false;
                  return;
                }
                logger.logBLEError('Audio monitoring error', error);
                this.characteristicMonitor?.remove();
                reject(error);
                return;
              }

          if (characteristic?.value && this.onAudioDataCallback) {
            try {
              // Convert base64 to bytes with CAREFUL validation
              const base64 = characteristic.value;
              
              
              // Method 1: Direct base64 decode to ArrayBuffer (more reliable)
              const binaryString = atob(base64);
              const byteLength = binaryString.length;
              
              // Ensure byte length is even (each Int16 = 2 bytes)
              if (byteLength % 2 !== 0) {
                console.warn('⚠️ Odd byte length detected:', byteLength);
                return;
              }
              
              // Create ArrayBuffer and Int16Array directly (like React web app)
              const arrayBuffer = new ArrayBuffer(byteLength);
              const uint8View = new Uint8Array(arrayBuffer);
              
              // Fill the buffer with bytes
              for (let i = 0; i < byteLength; i++) {
                uint8View[i] = binaryString.charCodeAt(i);
              }
              
              // SWITCH TO 8-BIT: Treat each byte as a sample (0-255 → -128 to 127)
              const samples8bit = Array.from(uint8View).map(b => b - 128);
              
              console.log(`🔄 TRYING 8-BIT APPROACH: ${samples8bit.length} samples from ${byteLength} bytes`);
              
              // Quick quality check
              const sampleRange = {
                min: Math.min(...samples8bit),
                max: Math.max(...samples8bit),
                count: samples8bit.length
              };
              
              // Use 8-bit samples directly
              const audioSamples = samples8bit;
              
              // Send audio data (Python just extends the list)
              this.onAudioDataCallback(audioSamples, this.device!);
            } catch (err) {
              logger.logBLEError('Error processing audio data', err);
            }
          }
            }
          );

          // Check BLE MTU size - might explain packet splitting
          this.manager.requestMTUForDevice(this.device!.id, 512)
            .then(mtu => {
              logger.logBLEEvent('BLE MTU negotiated', { 
                requestedMTU: 512, 
                actualMTU: mtu,
                canFit320Bytes: mtu >= 320 + 3, // 3 bytes for BLE header
                note: mtu < 323 ? 'MTU too small for 320-byte packets - will be split' : 'MTU sufficient'
              });
            })
            .catch(err => {
              logger.logBLEError('MTU request failed', err);
            });

          logger.logBLEEvent('Audio monitoring setup complete');
          resolve();
        })
        .catch(error => {
          logger.logBLEError('Failed to find audio service', error);
          reject(error);
        });
    });
  };

  findAudioServiceAndCharacteristic = async (): Promise<void> => {
    if (!this.device) {
      throw new Error(deviceNotConnectedErrorText);
    }

    logger.logBLEEvent('Looking for audio service and characteristic', {
      serviceUUID: AUDIO_SERVICE_UUID,
      characteristicUUID: AUDIO_CHAR_UUID
    });

    try {
      // Try to get the specific service
      const services = await this.manager.servicesForDevice(this.device.id);
      logger.logBLEEvent('Available services', {
        services: services.map(s => s.uuid)
      });

      const audioService = services.find(s => s.uuid === AUDIO_SERVICE_UUID);
      if (!audioService) {
        throw new Error(`Audio service ${AUDIO_SERVICE_UUID} not found`);
      }

      logger.logBLEEvent('Audio service found', { serviceUUID: audioService.uuid });

      // Try to get characteristics for this service
      const characteristics = await this.manager.characteristicsForDevice(this.device.id, AUDIO_SERVICE_UUID);
      logger.logBLEEvent('Service characteristics', {
        characteristics: characteristics.map(c => c.uuid)
      });

      const audioCharacteristic = characteristics.find(c => c.uuid === AUDIO_CHAR_UUID);
      if (!audioCharacteristic) {
        throw new Error(`Audio characteristic ${AUDIO_CHAR_UUID} not found`);
      }

      logger.logBLEEvent('Audio characteristic found', { 
        characteristicUUID: audioCharacteristic.uuid,
        properties: audioCharacteristic.properties
      });

    } catch (error) {
      logger.logBLEError('Failed to find audio service/characteristic', error);
      throw error;
    }
  };

  stopAudioMonitoring = (): void => {
    logger.logBLEEvent('Stopping audio monitoring');
    this.isCharacteristicMonitorDisconnectExpected = true;
    this.characteristicMonitor?.remove();
    this.characteristicMonitor = null;
    this.onAudioDataCallback = null;
  };

  disconnectDevice = (): Promise<void> => {
    if (!this.device) {
      const error = new Error(deviceNotConnectedErrorText);
      logger.logBLEError('Cannot disconnect - no device connected');
      throw error;
    }

    logger.logBLEEvent('Disconnecting device', { deviceId: this.device.id });
    
    this.stopAudioMonitoring();
    
    return this.manager
      .cancelDeviceConnection(this.device.id)
      .then(() => {
        logger.logBLEEvent('Device disconnected successfully');
        this.device = null;
      })
      .catch(error => {
        if (error?.code !== BleErrorCode.DeviceDisconnected) {
          logger.logBLEError('Disconnect error', error);
          this.onError(error);
        }
      });
  };

  isDeviceConnected = (): boolean => {
    if (!this.device) {
      return false;
    }
    return this.manager.isDeviceConnected(this.device.id);
  };

  getState = (): Promise<BluetoothState> => {
    return this.manager.state();
  };

  onError = (error: BleError): void => {
    logger.logBLEError('BLE Error occurred', {
      errorCode: error.errorCode,
      message: error.message,
      reason: error.reason
    });

    switch (error.errorCode) {
      case BleErrorCode.BluetoothUnauthorized:
        this.requestBluetoothPermission();
        break;
      case BleErrorCode.LocationServicesDisabled:
        this.showError('Location services are disabled. Please enable location services for BLE scanning.');
        break;
      case BleErrorCode.BluetoothPoweredOff:
        this.showError('Bluetooth is turned off. Please enable Bluetooth.');
        break;
      case BleErrorCode.DeviceDisconnected:
        logger.logBLEEvent('Device disconnected (expected)');
        break;
      default:
        this.showError(`BLE Error: ${error.message}`);
    }
  };

  requestBluetoothPermission = async (): Promise<boolean> => {
    logger.logBLEEvent('Requesting Bluetooth permissions');
    
    if (Platform.OS === 'ios') {
      // iOS permissions are handled in Info.plist
      return true;
    }

    if (Platform.OS === 'android') {
      const apiLevel = parseInt(Platform.Version.toString(), 10);

      // For Android < 12, request location permission
      if (apiLevel < 31 && PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        const hasPermission = granted === PermissionsAndroid.RESULTS.GRANTED;
        logger.logBLEEvent('Location permission result', { granted, hasPermission });
        return hasPermission;
      }

      // For Android 12+, request BLE permissions
      if (PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN && PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT) {
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
    }

    logger.logBLEError('Permissions not granted');
    this.showError('Bluetooth permissions have not been granted');
    return false;
  };

  showError = (message: string): void => {
    logger.logBLEError('User-facing error', { message });
    Alert.alert('BLE Error', message);
  };

  showSuccess = (message: string): void => {
    logger.logBLEEvent('User-facing success', { message });
    Alert.alert('Success', message);
  };

  // Cleanup method
  destroy = (): void => {
    logger.logBLEEvent('Destroying BLE service');
    this.stopAudioMonitoring();
    this.manager.destroy();
  };
}

export const BLEService = new BLEServiceInstance();
