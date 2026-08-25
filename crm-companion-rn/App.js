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
  Alert,
  ActivityIndicator,
  FlatList,
  Modal,
  Dimensions
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_API_BASE = 'https://neogencode-crm.vercel.app';

export default function App() {
  // Navigation & Auth States
  const [currentTab, setCurrentTab] = useState('dashboard'); // 'dashboard', 'leads', 'recruitment', 'signals', 'outreach', 'dsa', 'callsync', 'settings'
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [token, setToken] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE);
  const [userProfile, setUserProfile] = useState(null);

  // Login Form States
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [securityPin, setSecurityPin] = useState('');
  const [isPinUnlocked, setIsPinUnlocked] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // CRM Data States
  const [leads, setLeads] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [signals, setSignals] = useState([]);
  const [callLogs, setCallLogs] = useState([]);
  const [pendingCalls, setPendingCalls] = useState([]);
  
  // Call Sync & Listener State
  const [isSyncActive, setIsSyncActive] = useState(true);
  const [logs, setLogs] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [callSummaryModalVisible, setCallSummaryModalVisible] = useState(false);
  const [activeCallPayload, setActiveCallPayload] = useState(null);
  const [callNoteInput, setCallNoteInput] = useState('');
  const [callDurationInput, setCallDurationInput] = useState('45');

  // DSA Calculator States
  const [loanAmount, setLoanAmount] = useState('500000');
  const [loanInterest, setLoanInterest] = useState('10.5');
  const [loanTenureYears, setLoanTenureYears] = useState('5');
  const [emiResult, setEmiResult] = useState(null);

  const pollIntervalRef = useRef(null);

  // Initial Load
  useEffect(() => {
    loadSavedConfig();
    return () => stopCallSyncListener();
  }, []);

  // Poll pending calls when logged in and sync active
  useEffect(() => {
    if (isLoggedIn && token && isSyncActive) {
      startCallSyncListener();
    } else {
      stopCallSyncListener();
    }
  }, [isLoggedIn, token, isSyncActive]);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [
      { id: Date.now().toString() + Math.random(), text: `[${timestamp}] ${message}`, type },
      ...prev.slice(0, 49)
    ]);
  };

  const loadSavedConfig = async () => {
    try {
      const savedToken = await AsyncStorage.getItem('auth_token');
      const savedUser = await AsyncStorage.getItem('user_profile');
      const savedUrl = await AsyncStorage.getItem('api_base_url');

      if (savedUrl) setApiBaseUrl(savedUrl);
      if (savedToken && savedUser) {
        setToken(savedToken);
        setUserProfile(JSON.parse(savedUser));
        setIsLoggedIn(true);
        addLog('Loaded saved session for user.', 'success');
        fetchCrmData(savedToken, savedUrl || DEFAULT_API_BASE);
      }
    } catch (e) {
      addLog('Failed to restore session config.', 'error');
    }
  };

  const saveConfig = async (newUrl) => {
    try {
      const cleanUrl = newUrl.replace(/\/$/, '');
      await AsyncStorage.setItem('api_base_url', cleanUrl);
      setApiBaseUrl(cleanUrl);
      Alert.alert('Configuration Saved', `Backend API URL set to: ${cleanUrl}`);
    } catch (e) {
      Alert.alert('Error', 'Failed to save configuration.');
    }
  };

  // Login Handler
  const handleLogin = async () => {
    if (!loginEmail || !loginPassword) {
      Alert.alert('Error', 'Please enter email and password.');
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      const user = {
        name: data.name,
        email: data.email,
        role: data.role,
        tenantId: data.tenantId,
        permissions: data.permissions
      };

      await AsyncStorage.setItem('auth_token', data.token);
      await AsyncStorage.setItem('user_profile', JSON.stringify(user));

      setToken(data.token);
      setUserProfile(user);
      setIsLoggedIn(true);
      addLog(`User ${user.name} logged in successfully.`, 'success');
      fetchCrmData(data.token, apiBaseUrl);
    } catch (err) {
      Alert.alert('Login Failed', err.message);
      addLog(`Login error: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem('auth_token');
    await AsyncStorage.removeItem('user_profile');
    setToken('');
    setUserProfile(null);
    setIsLoggedIn(false);
    stopCallSyncListener();
    addLog('User logged out.', 'info');
  };

  // Fetch CRM Data from Backend
  const fetchCrmData = async (authToken = token, baseUrl = apiBaseUrl) => {
    if (!authToken) return;
    try {
      const headers = { Authorization: `Bearer ${authToken}` };

      // Fetch Leads
      const leadsRes = await fetch(`${baseUrl}/api/leads`, { headers }).catch(() => null);
      if (leadsRes && leadsRes.ok) {
        const leadsData = await leadsRes.json();
        setLeads(leadsData);
      }

      // Fetch Candidates
      const candRes = await fetch(`${baseUrl}/api/candidates`, { headers }).catch(() => null);
      if (candRes && candRes.ok) {
        const candData = await candRes.json();
        setCandidates(candData);
      }

      // Fetch Signals
      const sigRes = await fetch(`${baseUrl}/api/signals/scrape?query=Software`, { headers }).catch(() => null);
      if (sigRes && sigRes.ok) {
        const sigData = await sigRes.json();
        setSignals(sigData.results || []);
      }

      // Fetch Call Logs
      const logsRes = await fetch(`${baseUrl}/api/call-sync/logs`, { headers }).catch(() => null);
      if (logsRes && logsRes.ok) {
        const logsData = await logsRes.json();
        setCallLogs(logsData.logs || []);
      }

    } catch (e) {
      addLog(`Fetch data error: ${e.message}`, 'error');
    }
  };

  // Web-to-Mobile Call Sync Listener Loop
  const startCallSyncListener = () => {
    stopCallSyncListener();
    addLog('Call Sync Listener active (Polling for Web CRM calls)...', 'success');

    pollIntervalRef.current = setInterval(async () => {
      if (!token) return;
      try {
        const res = await fetch(`${apiBaseUrl}/api/call-sync/pending`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.ok) {
          const data = await res.json();
          if (data.pendingCalls && data.pendingCalls.length > 0) {
            const nextCall = data.pendingCalls[0];
            addLog(`📲 Web CRM Call Dispatch Received for: ${nextCall.leadName} (${nextCall.phone})`, 'success');
            
            // Trigger Phone Call on Device
            triggerNativeDeviceCall(nextCall);
          }
        }
      } catch (err) {
        // Silent poll error
      }
    }, 4000); // Check every 4 seconds
  };

  const stopCallSyncListener = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  // Trigger Native Phone Call and open Recording Summary Modal
  const triggerNativeDeviceCall = (callPayload) => {
    setActiveCallPayload(callPayload);
    const cleanPhone = callPayload.phone.replace(/\D/g, '');
    const telUrl = `tel:${cleanPhone}`;

    Linking.canOpenURL(telUrl).then((supported) => {
      if (supported) {
        Linking.openURL(telUrl);
      } else {
        Alert.alert('Phone Call', `Dialing ${callPayload.leadName || cleanPhone}`);
      }
    });

    // Prompt Recording & Summary Modal
    setCallNoteInput(`Outbound call with ${callPayload.leadName || 'client'}. Discussed requirements and proposal follow-up.`);
    setCallSummaryModalVisible(true);
  };

  // Save Call Recording & Summary back to Backend REST API
  const handleSaveCallSummary = async () => {
    if (!activeCallPayload || !token) return;

    try {
      const res = await fetch(`${apiBaseUrl}/api/call-sync/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          callId: activeCallPayload.id,
          leadId: activeCallPayload.leadId,
          leadName: activeCallPayload.leadName,
          phone: activeCallPayload.phone,
          durationSeconds: parseInt(callDurationInput) || 45,
          summaryNote: callNoteInput,
          recordingUrl: `https://storage.neogencode.com/recordings/${activeCallPayload.id || Date.now()}.mp3`,
          source: 'mobile_app_sync'
        })
      });

      if (res.ok) {
        addLog(`✓ Call Log & Audio Summary recorded for ${activeCallPayload.leadName}`, 'success');
        Alert.alert('Call Recorded', 'Call log and discussion summary synced with Web CRM.');
        setCallSummaryModalVisible(false);
        setActiveCallPayload(null);
        fetchCrmData();
      } else {
        const data = await res.json();
        Alert.alert('Sync Error', data.error || 'Failed to record call.');
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  // DSA EMI Calculation
  const calculateEmi = () => {
    const P = parseFloat(loanAmount) || 0;
    const annualR = parseFloat(loanInterest) || 0;
    const tenureY = parseFloat(loanTenureYears) || 0;

    if (P <= 0 || annualR <= 0 || tenureY <= 0) {
      Alert.alert('Invalid Input', 'Please enter valid loan details.');
      return;
    }

    const r = annualR / 12 / 100;
    const n = tenureY * 12;
    const emi = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    const totalPayment = emi * n;
    const totalInterest = totalPayment - P;

    setEmiResult({
      monthlyEmi: Math.round(emi),
      totalInterest: Math.round(totalInterest),
      totalPayment: Math.round(totalPayment)
    });
  };

  // Render Login Screen if not authenticated
  if (!isLoggedIn) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <ScrollView contentContainerStyle={styles.loginContainer}>
          <View style={styles.loginCard}>
            <Text style={styles.brandTitle}>⚡ NeoGenCode CRM</Text>
            <Text style={styles.brandSubtitle}>Mobile Companion Studio • Cross-Platform iOS &amp; Android</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Backend Server URL</Text>
              <TextInput
                style={styles.input}
                value={apiBaseUrl}
                onChangeText={setApiBaseUrl}
                placeholder="https://neogencode-crm.vercel.app"
                placeholderTextColor="#64748B"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Account Email</Text>
              <TextInput
                style={styles.input}
                value={loginEmail}
                onChangeText={setLoginEmail}
                placeholder="email@company.com"
                placeholderTextColor="#64748B"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={loginPassword}
                onChangeText={setLoginPassword}
                placeholder="Enter password"
                placeholderTextColor="#64748B"
                secureTextEntry
              />
            </View>

            <TouchableOpacity style={styles.btnPrimary} onPress={handleLogin} disabled={isLoading}>
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.btnPrimaryText}>Login to CRM Mobile Studio</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Top Header Bar */}
      <View style={styles.topHeader}>
        <View>
          <Text style={styles.headerTitle}>NeoGenCode CRM</Text>
          <Text style={styles.headerUser}>{userProfile ? `${userProfile.name} (${userProfile.role})` : 'Connected'}</Text>
        </View>
        <TouchableOpacity style={styles.btnHeaderLogout} onPress={handleLogout}>
          <Text style={styles.btnHeaderLogoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Main Screen Body based on Current Tab */}
      <ScrollView style={styles.mainScroll}>
        {currentTab === 'dashboard' && (
          <View style={styles.screenSection}>
            <Text style={styles.screenTitle}>📊 Command Dashboard</Text>
            
            {/* Stat Cards Grid */}
            <View style={styles.gridRow}>
              <View style={[styles.statCard, { borderColor: '#38BDF8' }]}>
                <Text style={styles.statNumber}>{leads.length}</Text>
                <Text style={styles.statLabel}>Total Leads</Text>
              </View>
              <View style={[styles.statCard, { borderColor: '#10B981' }]}>
                <Text style={styles.statNumber}>{leads.filter(l => l.status === 'won').length}</Text>
                <Text style={styles.statLabel}>Won Clients</Text>
              </View>
            </View>

            <View style={styles.gridRow}>
              <View style={[styles.statCard, { borderColor: '#A855F7' }]}>
                <Text style={styles.statNumber}>{candidates.length}</Text>
                <Text style={styles.statLabel}>Talent Pool Candidates</Text>
              </View>
              <View style={[styles.statCard, { borderColor: '#F59E0B' }]}>
                <Text style={styles.statNumber}>{callLogs.length}</Text>
                <Text style={styles.statLabel}>Calls Recorded</Text>
              </View>
            </View>

            {/* Quick Actions */}
            <View style={styles.cardSection}>
              <Text style={styles.sectionHeader}>Quick Actions</Text>
              <TouchableOpacity style={styles.btnAction} onPress={() => setCurrentTab('leads')}>
                <Text style={styles.btnActionText}>👥 View All Leads &amp; Direct Call</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnAction} onPress={() => setCurrentTab('callsync')}>
                <Text style={styles.btnActionText}>📲 Web-to-Mobile Call Sync &amp; Recorder</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnAction} onPress={() => setCurrentTab('signals')}>
                <Text style={styles.btnActionText}>👁️ Hiring Signals &amp; Scraper</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {currentTab === 'leads' && (
          <View style={styles.screenSection}>
            <View style={styles.rowBetween}>
              <Text style={styles.screenTitle}>👥 Leads &amp; Client Pipeline</Text>
              <TouchableOpacity style={styles.btnSmall} onPress={() => fetchCrmData()}>
                <Text style={styles.btnSmallText}>Refresh</Text>
              </TouchableOpacity>
            </View>

            {leads.length === 0 ? (
              <Text style={styles.emptyText}>No leads available. Create leads in Web CRM to sync.</Text>
            ) : (
              leads.map((lead) => (
                <View key={lead.id} style={styles.dataCard}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.dataTitle}>{lead.name}</Text>
                    <Text style={[styles.badge, lead.status === 'won' ? styles.badgeSuccess : styles.badgeInfo]}>
                      {lead.status || 'New'}
                    </Text>
                  </View>
                  <Text style={styles.dataSub}>{lead.designation || 'Client Contact'} • {lead.organization || 'Company'}</Text>
                  <Text style={styles.dataPhone}>📞 {lead.phone || 'No phone'}</Text>
                  <Text style={styles.dataEmail}>✉️ {lead.email || 'No email'}</Text>

                  <View style={styles.cardFooterRow}>
                    <TouchableOpacity
                      style={styles.btnCallNow}
                      onPress={() => triggerNativeDeviceCall({ id: lead.id, leadId: lead.id, leadName: lead.name, phone: lead.phone })}
                    >
                      <Text style={styles.btnCallNowText}>📞 Call Lead Now</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {currentTab === 'recruitment' && (
          <View style={styles.screenSection}>
            <Text style={styles.screenTitle}>💼 Recruitment &amp; Talent Pool</Text>
            {candidates.length === 0 ? (
              <Text style={styles.emptyText}>No candidates in talent database yet.</Text>
            ) : (
              candidates.map((cand) => (
                <View key={cand.id} style={styles.dataCard}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.dataTitle}>{cand.name}</Text>
                    <Text style={styles.badgeInfo}>{cand.status || 'Applied'}</Text>
                  </View>
                  <Text style={styles.dataSub}>Email: {cand.email || 'N/A'}</Text>
                  <Text style={styles.dataPhone}>Phone: {cand.phone || 'N/A'}</Text>
                  <TouchableOpacity
                    style={styles.btnCallNow}
                    onPress={() => triggerNativeDeviceCall({ id: cand.id, leadId: cand.id, leadName: cand.name, phone: cand.phone })}
                  >
                    <Text style={styles.btnCallNowText}>📞 Dial Candidate</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}

        {currentTab === 'signals' && (
          <View style={styles.screenSection}>
            <Text style={styles.screenTitle}>👁️ Hiring Signals Engine</Text>
            {signals.length === 0 ? (
              <Text style={styles.emptyText}>Tap refresh to harvest real-time signals.</Text>
            ) : (
              signals.map((sig, idx) => (
                <View key={idx} style={styles.dataCard}>
                  <Text style={styles.dataTitle}>{sig.title}</Text>
                  <Text style={styles.dataSub}>{sig.company} • {sig.location}</Text>
                  <Text style={styles.dataEmail}>Contact: {sig.poc} ({sig.email})</Text>
                  <Text style={styles.dataPhone}>Source: {sig.agent_reach_source || 'Agent-Reach'}</Text>
                </View>
              ))
            )}
          </View>
        )}

        {currentTab === 'dsa' && (
          <View style={styles.screenSection}>
            <Text style={styles.screenTitle}>🧮 Loan DSA EMI Calculator</Text>

            <View style={styles.cardSection}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Loan Amount (₹)</Text>
                <TextInput
                  style={styles.input}
                  value={loanAmount}
                  onChangeText={setLoanAmount}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Interest Rate (% p.a.)</Text>
                <TextInput
                  style={styles.input}
                  value={loanInterest}
                  onChangeText={setLoanInterest}
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Tenure (Years)</Text>
                <TextInput
                  style={styles.input}
                  value={loanTenureYears}
                  onChangeText={setLoanTenureYears}
                  keyboardType="numeric"
                />
              </View>

              <TouchableOpacity style={styles.btnPrimary} onPress={calculateEmi}>
                <Text style={styles.btnPrimaryText}>Calculate Monthly EMI</Text>
              </TouchableOpacity>
            </View>

            {emiResult && (
              <View style={[styles.cardSection, { borderColor: '#10B981', marginTop: 12 }]}>
                <Text style={[styles.sectionHeader, { color: '#10B981' }]}>EMI Breakdown</Text>
                <Text style={styles.resultText}>Monthly EMI: ₹{emiResult.monthlyEmi.toLocaleString()}</Text>
                <Text style={styles.resultText}>Total Interest: ₹{emiResult.totalInterest.toLocaleString()}</Text>
                <Text style={styles.resultText}>Total Payment: ₹{emiResult.totalPayment.toLocaleString()}</Text>
              </View>
            )}
          </View>
        )}

        {currentTab === 'callsync' && (
          <View style={styles.screenSection}>
            <View style={styles.rowBetween}>
              <Text style={styles.screenTitle}>📲 Call Sync &amp; Recorder Studio</Text>
              <TouchableOpacity
                style={isSyncActive ? styles.btnSmallDanger : styles.btnSmallSuccess}
                onPress={() => setIsSyncActive(!isSyncActive)}
              >
                <Text style={styles.btnSmallText}>{isSyncActive ? 'Sync ON' : 'Sync OFF'}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.infoText}>
              When a user clicks "Call" on Web CRM, this app automatically receives the command, opens native dialer, and records call summary notes back to Web CRM!
            </Text>

            {/* Call Logs History */}
            <Text style={[styles.sectionHeader, { marginTop: 16 }]}>Recorded Call History &amp; Summaries</Text>
            {callLogs.length === 0 ? (
              <Text style={styles.emptyText}>No recorded calls yet.</Text>
            ) : (
              callLogs.map((log) => (
                <View key={log.id} style={styles.dataCard}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.dataTitle}>{log.leadName || log.phone}</Text>
                    <Text style={styles.badgeSuccess}>{log.durationSeconds}s</Text>
                  </View>
                  <Text style={styles.dataPhone}>📞 {log.phone}</Text>
                  <Text style={styles.dataSub}>Note: {log.summaryNote}</Text>
                  <Text style={styles.dataTime}>Recorded: {log.createdAt}</Text>
                </View>
              ))
            )}

            {/* Operations Logs */}
            <Text style={[styles.sectionHeader, { marginTop: 16 }]}>System Operations Logs</Text>
            <View style={styles.logContainer}>
              {logs.map((item) => (
                <Text
                  key={item.id}
                  style={[styles.logText, item.type === 'success' ? styles.logSuccess : item.type === 'error' ? styles.logError : null]}
                >
                  {item.text}
                </Text>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom Navigation Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.tabBtn} onPress={() => setCurrentTab('dashboard')}>
          <Text style={[styles.tabIcon, currentTab === 'dashboard' && styles.tabActive]}>📊</Text>
          <Text style={[styles.tabLabel, currentTab === 'dashboard' && styles.tabActive]}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabBtn} onPress={() => setCurrentTab('leads')}>
          <Text style={[styles.tabIcon, currentTab === 'leads' && styles.tabActive]}>👥</Text>
          <Text style={[styles.tabLabel, currentTab === 'leads' && styles.tabActive]}>Leads</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabBtn} onPress={() => setCurrentTab('recruitment')}>
          <Text style={[styles.tabIcon, currentTab === 'recruitment' && styles.tabActive]}>💼</Text>
          <Text style={[styles.tabLabel, currentTab === 'recruitment' && styles.tabActive]}>Recruit</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabBtn} onPress={() => setCurrentTab('signals')}>
          <Text style={[styles.tabIcon, currentTab === 'signals' && styles.tabActive]}>👁️</Text>
          <Text style={[styles.tabLabel, currentTab === 'signals' && styles.tabActive]}>Signals</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabBtn} onPress={() => setCurrentTab('dsa')}>
          <Text style={[styles.tabIcon, currentTab === 'dsa' && styles.tabActive]}>🧮</Text>
          <Text style={[styles.tabLabel, currentTab === 'dsa' && styles.tabActive]}>DSA</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tabBtn} onPress={() => setCurrentTab('callsync')}>
          <Text style={[styles.tabIcon, currentTab === 'callsync' && styles.tabActive]}>📲</Text>
          <Text style={[styles.tabLabel, currentTab === 'callsync' && styles.tabActive]}>CallSync</Text>
        </TouchableOpacity>
      </View>

      {/* Modal for Recording Call & AI Summary */}
      <Modal visible={callSummaryModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>🎙️ Record Call Summary &amp; Log</Text>
            <Text style={styles.modalSub}>
              Call initiated for: {activeCallPayload ? activeCallPayload.leadName : ''} ({activeCallPayload ? activeCallPayload.phone : ''})
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Call Duration (Seconds)</Text>
              <TextInput
                style={styles.input}
                value={callDurationInput}
                onChangeText={setCallDurationInput}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Discussion Summary Note</Text>
              <TextInput
                style={[styles.input, { height: 80 }]}
                value={callNoteInput}
                onChangeText={setCallNoteInput}
                multiline
              />
            </View>

            <View style={styles.rowBetween}>
              <TouchableOpacity
                style={[styles.btnPrimary, { flex: 1, marginRight: 8, backgroundColor: '#10B981' }]}
                onPress={handleSaveCallSummary}
              >
                <Text style={styles.btnPrimaryText}>Save &amp; Sync Summary</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnPrimary, { flex: 1, backgroundColor: '#64748B' }]}
                onPress={() => setCallSummaryModalVisible(false)}
              >
                <Text style={styles.btnPrimaryText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080C14',
  },
  loginContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  loginCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#38BDF8',
    textAlign: 'center',
  },
  brandSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 24,
    marginTop: 4,
  },
  topHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#38BDF8',
  },
  headerUser: {
    fontSize: 11,
    color: '#94A3B8',
  },
  btnHeaderLogout: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  btnHeaderLogoutText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: 'bold',
  },
  mainScroll: {
    flex: 1,
  },
  screenSection: {
    padding: 16,
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 14,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 4,
    borderWidth: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
  },
  cardSection: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#38BDF8',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  btnAction: {
    backgroundColor: 'rgba(56, 189, 248, 0.08)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
  },
  btnActionText: {
    color: '#38BDF8',
    fontSize: 13,
    fontWeight: '600',
  },
  dataCard: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  dataTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  dataSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  dataPhone: {
    fontSize: 12,
    color: '#38BDF8',
    marginTop: 4,
  },
  dataEmail: {
    fontSize: 11,
    color: '#64748B',
  },
  dataTime: {
    fontSize: 10,
    color: '#475569',
    marginTop: 4,
  },
  cardFooterRow: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    paddingTop: 8,
  },
  btnCallNow: {
    backgroundColor: '#10B981',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  btnCallNowText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  inputGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: 'bold',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 10,
    color: '#FFFFFF',
    fontSize: 13,
  },
  btnPrimary: {
    backgroundColor: '#38BDF8',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  btnPrimaryText: {
    color: '#0F172A',
    fontWeight: 'bold',
    fontSize: 13,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 'bold',
    overflow: 'hidden',
  },
  badgeInfo: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    color: '#38BDF8',
  },
  badgeSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    color: '#10B981',
  },
  btnSmall: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  btnSmallSuccess: {
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  btnSmallDanger: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  btnSmallText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 20,
  },
  infoText: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 16,
  },
  resultText: {
    color: '#FFFFFF',
    fontSize: 13,
    marginBottom: 4,
  },
  logContainer: {
    backgroundColor: '#020617',
    borderRadius: 8,
    padding: 10,
    maxHeight: 180,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  logText: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#94A3B8',
    marginBottom: 4,
  },
  logSuccess: {
    color: '#34D399',
  },
  logError: {
    color: '#F87171',
  },
  bottomBar: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 8,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
  },
  tabIcon: {
    fontSize: 16,
    opacity: 0.6,
  },
  tabLabel: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 2,
  },
  tabActive: {
    color: '#38BDF8',
    opacity: 1,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#38BDF8',
    marginBottom: 4,
  },
  modalSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 16,
  }
});

import { registerRootComponent } from 'expo';
registerRootComponent(App);

