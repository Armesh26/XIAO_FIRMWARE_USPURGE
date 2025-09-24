/**
 * XIAO Audio Transcriber iOS App
 * Real-time audio transcription using XIAO nRF52840 Sense board and Deepgram Nova-3
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  StatusBar,
  StyleSheet,
  useColorScheme,
  View,
  ScrollView,
  Text,
  SafeAreaView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import BLEConnectionFixed from './src/components/BLEConnectionFixed';
import AudioRecorder from './src/components/AudioRecorder';
import DeepgramTranscriber from './src/components/DeepgramTranscriber';
import LogsView from './src/components/LogsView';
import BLEDebugger from './src/components/BLEDebugger';
import { logger, LogEntry } from './src/services/LoggerService';
import { bleManagerService } from './src/services/BLEManagerService';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const safeAreaInsets = useSafeAreaInsets();
  const [isConnected, setIsConnected] = useState(false);
  const [connectedDeviceId, setConnectedDeviceId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Subscribe to logs
  useEffect(() => {
    const unsubscribe = logger.addListener((newLogs) => {
      setLogs(newLogs);
    });
    
    // Initialize with current logs
    setLogs(logger.getLogs());
    
    return unsubscribe;
  }, []);

  const handleConnectionChange = useCallback((connected: boolean) => {
    setIsConnected(connected);
    if (!connected) {
      setConnectedDeviceId(null);
    }
  }, []);

  const handleAudioData = useCallback((data: number[], deviceId: string) => {
    // Don't update state for every audio packet - causes infinite loops
    // Components use global handler instead
    setConnectedDeviceId(deviceId);
  }, []);

  const handleClearLogs = useCallback(() => {
    logger.clearLogs();
  }, []);

  // Log app startup
  useEffect(() => {
    logger.info('🚀 XIAO Audio Transcriber App Started');
    logger.info('📱 App initialized successfully');
    logger.debug('App configuration', {
      serviceUUID: '12345678-1234-5678-1234-567812345678',
      characteristicUUID: '12345679-1234-5678-1234-567812345678',
      deviceName: 'MicStreamer'
    });

    // Cleanup BLE service on unmount
    return () => {
      logger.info('🧹 Cleaning up BLE Manager service');
      bleManagerService.destroy();
    };
  }, []);

  return (
    <SafeAreaView style={[styles.container, { paddingTop: safeAreaInsets.top }]}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🎤 XIAO Audio Transcriber</Text>
          <Text style={styles.headerSubtitle}>
            Real-time audio transcription with XIAO nRF52840 Sense & Deepgram Nova-3
          </Text>
        </View>

        <BLEDebugger />
        
        <BLEConnectionFixed
          onConnectionChange={handleConnectionChange}
          onAudioData={handleAudioData}
        />

        <AudioRecorder
          isConnected={isConnected}
          audioData={null}
        />

        <DeepgramTranscriber
          isConnected={isConnected}
          audioData={null}
        />

        <LogsView
          logs={logs}
          onClearLogs={handleClearLogs}
        />

        <View style={styles.testLogsContainer}>
          <TouchableOpacity
            style={styles.testLogsButton}
            onPress={() => {
              logger.info('🧪 Test info log');
              logger.warn('⚠️ Test warning log');
              logger.error('❌ Test error log');
              logger.debug('🐛 Test debug log with data', { test: true, number: 42 });
            }}
          >
            <Text style={styles.testLogsButtonText}>🧪 Generate Test Logs</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.testLogsButton, { backgroundColor: '#27ae60', marginTop: 10 }]}
            onPress={async () => {
              try {
                const filePath = await logger.generateLogFile();
                Alert.alert(
                  'Log File Generated',
                  `Debug logs saved to:\n${filePath}\n\nYou can access this file through the device's file system.`,
                  [{ text: 'OK' }]
                );
              } catch (error) {
                Alert.alert('Error', `Failed to generate log file: ${error}`);
              }
            }}
          >
            <Text style={styles.testLogsButtonText}>📄 Generate Log File</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Connected: {isConnected ? '✅' : '❌'} | 
            Audio Data: Global handlers active |
            Device: {connectedDeviceId || 'None'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 24,
    margin: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  footer: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 16,
    margin: 16,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  footerText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    fontFamily: 'monospace',
  },
  testLogsContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 16,
    margin: 16,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    alignItems: 'center',
  },
  testLogsButton: {
    backgroundColor: '#9b59b6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  testLogsButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default App;
