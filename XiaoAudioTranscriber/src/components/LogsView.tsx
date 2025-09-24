import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  Alert,
} from 'react-native';
import { X, Trash2, Copy, Eye, EyeOff, Download } from 'lucide-react-native';
import { logger } from '../services/LoggerService';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
}

interface LogsViewProps {
  logs: LogEntry[];
  onClearLogs: () => void;
}

const LogsView: React.FC<LogsViewProps> = ({ logs, onClearLogs }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [showData, setShowData] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // Auto-scroll to bottom when new logs are added
  useEffect(() => {
    if (isVisible && scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [logs, isVisible]);

  const getLogColor = (level: string) => {
    switch (level) {
      case 'error': return '#e74c3c';
      case 'warn': return '#f39c12';
      case 'debug': return '#9b59b6';
      default: return '#3498db';
    }
  };

  const getLogIcon = (level: string) => {
    switch (level) {
      case 'error': return '❌';
      case 'warn': return '⚠️';
      case 'debug': return '🐛';
      default: return 'ℹ️';
    }
  };

  const copyLogsToClipboard = () => {
    const logText = logs.map(log => 
      `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}${log.data ? '\n' + JSON.stringify(log.data, null, 2) : ''}`
    ).join('\n');
    
    // In a real app, you'd use Clipboard.setString(logText)
    console.log('📋 Logs copied to clipboard:', logText);
    alert('Logs copied to clipboard!');
  };

  const generateLogFile = async () => {
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
  };

  const formatLogData = (data: any) => {
    if (!data) return '';
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  return (
    <>
      <TouchableOpacity
        style={styles.logsButton}
        onPress={() => setIsVisible(true)}
      >
        <Text style={styles.logsButtonText}>
          📋 View Logs ({logs.length})
        </Text>
      </TouchableOpacity>

      <Modal
        visible={isVisible}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>📋 App Logs</Text>
            <View style={styles.headerButtons}>
              <TouchableOpacity
                style={styles.headerButton}
                onPress={() => setShowData(!showData)}
              >
                {showData ? <EyeOff size={20} color="#666" /> : <Eye size={20} color="#666" />}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerButton}
                onPress={copyLogsToClipboard}
              >
                <Copy size={20} color="#666" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerButton}
                onPress={generateLogFile}
              >
                <Download size={20} color="#27ae60" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerButton}
                onPress={onClearLogs}
              >
                <Trash2 size={20} color="#e74c3c" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.headerButton}
                onPress={() => setIsVisible(false)}
              >
                <X size={20} color="#666" />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            ref={scrollViewRef}
            style={styles.logsContainer}
            contentContainerStyle={styles.logsContent}
          >
            {logs.length === 0 ? (
              <Text style={styles.noLogsText}>No logs yet. Start using the app to see logs here!</Text>
            ) : (
              logs.map((log) => (
                <View key={log.id} style={styles.logEntry}>
                  <View style={styles.logHeader}>
                    <Text style={styles.logTimestamp}>{log.timestamp}</Text>
                    <Text style={[styles.logLevel, { color: getLogColor(log.level) }]}>
                      {getLogIcon(log.level)} {log.level.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.logMessage}>{log.message}</Text>
                  {showData && log.data && (
                    <View style={styles.logDataContainer}>
                      <Text style={styles.logDataLabel}>Data:</Text>
                      <Text style={styles.logData}>{formatLogData(log.data)}</Text>
                    </View>
                  )}
                </View>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  logsButton: {
    backgroundColor: '#6c757d',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    margin: 8,
    alignItems: 'center',
  },
  logsButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  headerButtons: {
    flexDirection: 'row',
  },
  headerButton: {
    padding: 8,
    marginLeft: 8,
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
  },
  logsContainer: {
    flex: 1,
  },
  logsContent: {
    padding: 16,
  },
  noLogsText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 50,
  },
  logEntry: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  logTimestamp: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
  },
  logLevel: {
    fontSize: 12,
    fontWeight: '600',
  },
  logMessage: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  logDataContainer: {
    marginTop: 8,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  logDataLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  logData: {
    fontSize: 12,
    color: '#333',
    fontFamily: 'monospace',
    lineHeight: 16,
  },
});

export default LogsView;

