/**
 * BLE Debugger Component
 * Simple component to test native module availability
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  NativeModules,
} from 'react-native';
import BleManager from 'react-native-ble-manager';
import { logger } from '../services/LoggerService';

const BLEDebugger: React.FC = () => {
  const [status, setStatus] = useState<string>('Ready for testing');

  const testNativeModule = () => {
    try {
      const BleManagerModule = NativeModules.BleManager;
      
      if (BleManagerModule) {
        setStatus('✅ Native BleManager module found');
        logger.info('✅ Native BleManager module is available');
      } else {
        setStatus('❌ Native BleManager module NOT found');
        logger.error('❌ Native BleManager module is NOT available');
      }
    } catch (error) {
      setStatus('❌ Error checking native module');
      logger.error('Error checking native module', error);
    }
  };

  const testBleManagerImport = () => {
    try {
      if (typeof BleManager.start === 'function') {
        setStatus('✅ BleManager import successful');
        logger.info('✅ BleManager import is working');
      } else {
        setStatus('❌ BleManager import failed');
        logger.error('❌ BleManager import failed');
      }
    } catch (error) {
      setStatus('❌ Error importing BleManager');
      logger.error('Error importing BleManager', error);
    }
  };

  const testBleInitialization = async () => {
    try {
      setStatus('🔄 Testing BLE initialization...');
      
      await BleManager.start({ showAlert: false });
      
      setStatus('✅ BLE Manager started successfully');
      logger.info('✅ BLE Manager started successfully');
    } catch (error) {
      setStatus('❌ BLE Manager failed to start');
      logger.error('❌ BLE Manager failed to start', error);
    }
  };

  const runAllTests = async () => {
    setStatus('🧪 Running all tests...');
    
    // Test 1: Native module
    testNativeModule();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 2: Import
    testBleManagerImport();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Test 3: Initialization
    await testBleInitialization();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🔧 BLE Debug Panel</Text>
      
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>{status}</Text>
      </View>
      
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={testNativeModule}>
          <Text style={styles.buttonText}>Test Native Module</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.button} onPress={testBleManagerImport}>
          <Text style={styles.buttonText}>Test Import</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.button} onPress={testBleInitialization}>
          <Text style={styles.buttonText}>Test Initialization</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, styles.primaryButton]} 
          onPress={runAllTests}
        >
          <Text style={styles.buttonText}>Run All Tests</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    margin: 16,
    borderWidth: 2,
    borderColor: '#dee2e6',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
    marginBottom: 16,
  },
  statusContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    minHeight: 50,
    justifyContent: 'center',
  },
  statusText: {
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
  },
  buttonContainer: {
    gap: 8,
  },
  button: {
    backgroundColor: '#6c757d',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#007bff',
  },
  buttonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default BLEDebugger;
