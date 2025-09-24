/**
 * Logger Service for React Native
 * Manages app logs with different levels and UI display
 */

import RNFS from 'react-native-fs';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
}

class LoggerService {
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000;
  private listeners: ((logs: LogEntry[]) => void)[] = [];

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private formatTimestamp(): string {
    const now = new Date();
    return now.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  }

  private addLog(level: LogEntry['level'], message: string, data?: any): void {
    const log: LogEntry = {
      id: this.generateId(),
      timestamp: this.formatTimestamp(),
      level,
      message,
      data
    };

    this.logs.push(log);

    // Keep only the last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Also log to console for debugging
    console.log(`[${log.timestamp}] ${level.toUpperCase()}: ${message}`, data || '');

    // Notify listeners
    this.notifyListeners();
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener([...this.logs]));
  }

  // Public logging methods
  info(message: string, data?: any): void {
    this.addLog('info', message, data);
  }

  warn(message: string, data?: any): void {
    this.addLog('warn', message, data);
  }

  error(message: string, data?: any): void {
    this.addLog('error', message, data);
  }

  debug(message: string, data?: any): void {
    this.addLog('debug', message, data);
  }

  // Log management
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
    this.notifyListeners();
  }

  // Listener management
  addListener(callback: (logs: LogEntry[]) => void): () => void {
    this.listeners.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // BLE specific logging helpers
  logBLEEvent(event: string, data?: any): void {
    this.info(`🔗 BLE: ${event}`, data);
  }

  logBLEError(error: string, data?: any): void {
    this.error(`❌ BLE Error: ${error}`, data);
  }

  logAudioEvent(event: string, data?: any): void {
    this.info(`🎤 Audio: ${event}`, data);
  }

  logDeepgramEvent(event: string, data?: any): void {
    this.info(`🎯 Deepgram: ${event}`, data);
  }

  logFileEvent(event: string, data?: any): void {
    this.info(`📁 File: ${event}`, data);
  }

  /**
   * Generate logs as text file
   */
  async generateLogFile(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `audio_debug_logs_${timestamp}.txt`;
    const filePath = `${RNFS.DocumentDirectoryPath}/${filename}`;
    
    let logContent = `XIAO Audio Transcriber - Debug Logs\n`;
    logContent += `Generated: ${new Date().toISOString()}\n`;
    logContent += `Total Logs: ${this.logs.length}\n`;
    logContent += `========================================\n\n`;
    
    this.logs.forEach((log, index) => {
      logContent += `[${index + 1}] ${log.timestamp} [${log.level.toUpperCase()}] ${log.message}\n`;
      if (log.data) {
        logContent += `Data: ${JSON.stringify(log.data, null, 2)}\n`;
      }
      logContent += `\n`;
    });
    
    try {
      await RNFS.writeFile(filePath, logContent, 'utf8');
      console.log(`📄 Log file generated: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error('❌ Failed to generate log file:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const logger = new LoggerService();

