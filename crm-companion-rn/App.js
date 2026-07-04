import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Linking,
  Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function App() {
  const [sheetsUrl, setSheetsUrl] = useState('');
  const [syncActive, setSyncActive] = useState(false);
  const [logs, setLogs] = useState([]);
  const pollIntervalRef = useRef(null);

  useEffect(() => {
    // Load saved Sheets URL on startup
    loadSettings();
    return () => stopPolling();
  }, []);

  const loadSettings = async () => {
    try {
      const savedUrl = await AsyncStorage.getItem('google_sheets_url');
      if (savedUrl) setSheetsUrl(savedUrl);
    } catch (e) {
      addLog('Failed to load settings.', 'error');
    }
  };

  const saveSettings = async (url) => {
    try {
      await AsyncStorage.setItem('google_sheets_url', url);
      setSheetsUrl(url);
      Alert.alert('Saved', 'Google Sheet URL updated successfully.');
    } catch (e) {
      addLog('Failed to save settings.', 'error');
    }
  };

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prevLogs) => [
      { id: Date.now().toString() + Math.random(), text: `[${timestamp}] ${message}`, type },
      ...prevLogs.slice(0, 49) // Keep last 50 logs
    ]);
  };

  const startPolling = () => {
    if (!sheetsUrl) {
      Alert.alert('Error', 'Please enter your Google Sheets Apps Script Web App URL first.');
      return;
    }
    setSyncActive(true);
    addLog('Call Sync Listener started.', 'success');

    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`${sheetsUrl}?action=get_calls`);
        if (response.ok) {
          const calls = await response.json();
          if (Array.isArray(calls) && calls.length > 0) {
            calls.forEach((call) => {
              addLog(`Dial Command: Initiating call to ${call.name} (${call.phone})...`, 'success');
              // Cross-platform outbound call trigger
              Linking.openURL(`tel:${call.phone.replace(/\D/g, '')}`);
            });
          }
        }
      } catch (err) {
        addLog(`Sync error: ${err.message}`, 'error');
      }
    }, 5000); // Poll every 5 seconds
  };

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setSyncActive(false);
    addLog('Call Sync Listener stopped.', 'error');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>CRM Companion App</Text>
        <Text style={styles.headerSubtitle}>Cross-Platform Dialing Sync &amp; Lookup</Text>
      </View>

      <ScrollView style={styles.body}>
        {/* Settings Card */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Google Sheets Web App URL</Text>
          <TextInput
            style={styles.input}
            placeholder="https://script.google.com/macros/s/.../exec"
            placeholderTextColor="#64748B"
            value={sheetsUrl}
            onChangeText={setSheetsUrl}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.buttonSecondary} onPress={() => saveSettings(sheetsUrl)}>
            <Text style={styles.buttonText}>Save Configuration</Text>
          </TouchableOpacity>
        </View>

        {/* Sync Controls */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Dial Sync Status: {syncActive ? 'ACTIVE' : 'INACTIVE'}</Text>
          <TouchableOpacity
            style={syncActive ? styles.buttonStop : styles.buttonStart}
            onPress={syncActive ? stopPolling : startPolling}
          >
            <Text style={styles.buttonText}>
              {syncActive ? 'Stop Call Sync Listener' : 'Start Call Sync Listener'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Log Viewer */}
        <Text style={styles.logTitle}>System Operations Logs</Text>
        <View style={styles.logContainer}>
          {logs.length === 0 ? (
            <Text style={styles.logEmptyText}>No operations recorded yet. Start sync listener to listen for call requests.</Text>
          ) : (
            logs.map((log) => (
              <Text key={log.id} style={[styles.logText, log.type === 'success' ? styles.logSuccess : log.type === 'error' ? styles.logError : null]}>
                {log.text}
              </Text>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080C14',
  },
  header: {
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  body: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#A855F7',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: 'rgba(15,23,42,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(192, 132, 252, 0.3)',
    borderRadius: 8,
    padding: 12,
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 12,
  },
  buttonStart: {
    backgroundColor: '#A855F7',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  buttonStop: {
    backgroundColor: '#EF4444',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: '#0EA5E9',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  logTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#94A3B8',
    marginBottom: 8,
    textTransform: 'uppercase',
    paddingLeft: 4,
  },
  logContainer: {
    backgroundColor: '#020617',
    borderRadius: 8,
    padding: 12,
    minHeight: 150,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  logText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 6,
  },
  logSuccess: {
    color: '#34D399',
  },
  logError: {
    color: '#F87171',
  },
  logEmptyText: {
    color: '#64748B',
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 50,
  }
});
