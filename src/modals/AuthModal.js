import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import useStore from '../store';
import { colors, spacing, radius, typography } from '../theme';
import { FormField, InfoBanner } from '../components/ui';
import { useKeyboardOffset } from '../utils/useKeyboardOffset';
import { APP_NAME } from '../config';

const TAB_OPTIONS = [
  { key: 'signup', label: 'Create Account' },
  { key: 'signin', label: 'Sign In' },
];

export default function AuthModal({ visible, onClose, defaultTab = 'signup' }) {
  const { signUp, signIn } = useStore();
  const kbOffset = useKeyboardOffset();

  const [tab, setTab] = useState(defaultTab);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reset = () => { setName(''); setEmail(''); setPassword(''); setError(''); setLoading(false); };
  const handleClose = () => { reset(); onClose(); };
  const switchTab = (t) => { setTab(t); setError(''); };

  const validate = () => {
    if (tab === 'signup' && !name.trim()) return 'Please enter your name.';
    if (!email.includes('@')) return 'Please enter a valid email.';
    if (!password) return 'Please enter a password.';
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError(''); setLoading(true);
    await new Promise(r => setTimeout(r, 700));
    if (tab === 'signup') signUp(name.trim(), email.trim().toLowerCase());
    else signIn(email.trim().toLowerCase());
    setLoading(false);
    handleClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
        <View style={[styles.container, { paddingBottom: kbOffset }]}>

          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.logo}>✈️ {APP_NAME}</Text>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

            {/* Tab bar */}
            <View style={styles.tabBar}>
              {TAB_OPTIONS.map(t => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
                  onPress={() => switchTab(t.key)}
                >
                  <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {tab === 'signup' && (
              <InfoBanner
                icon="🎁"
                title="Free account includes"
                subtitle="1 AI trip plan · 3 AI trip reviews · Traveler library · Group management"
                color="#9b6e00"
                bgColor={colors.yellowLight}
              />
            )}

            {tab === 'signup' && (
              <FormField label="Full Name" value={name} onChangeText={setName} placeholder="Arjun Sharma" autoCapitalize="words" />
            )}
            <FormField label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
            <FormField label="Password" value={password} onChangeText={setPassword} placeholder={tab === 'signup' ? 'Create a password' : 'Your password'} secureTextEntry />

            {!!error && <Text style={styles.error}>{error}</Text>}

            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitBtnLoading]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitBtnText}>{tab === 'signup' ? 'Create Free Account' : 'Sign In'}</Text>
              }
            </TouchableOpacity>

            {tab === 'signin' && (
              <TouchableOpacity onPress={() => switchTab('signup')} style={styles.switchLink}>
                <Text style={styles.switchLinkText}>Don&apos;t have an account? Sign up →</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.footer}>By continuing you agree to {APP_NAME}&apos;s Terms of Service and Privacy Policy.</Text>
          </ScrollView>
        </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { alignItems: 'center', padding: spacing.xxl, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  closeBtn: { position: 'absolute', left: spacing.xxl, top: spacing.xxl, padding: 4 },
  closeText: { fontSize: 18, color: colors.muted },
  logo: { ...typography.h3, color: colors.primary },
  content: { padding: spacing.xxl, paddingBottom: 80 },
  tabBar: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: radius.md, padding: 4, marginBottom: spacing.xl },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radius.sm },
  tabBtnActive: { backgroundColor: colors.surface, elevation: 2 },
  tabText: { ...typography.smallBold, color: colors.muted },
  tabTextActive: { color: colors.text },
  error: { ...typography.small, color: colors.red, marginBottom: spacing.md },
  submitBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', marginTop: spacing.md },
  submitBtnLoading: { opacity: 0.7 },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  switchLink: { alignItems: 'center', marginTop: spacing.lg },
  switchLinkText: { ...typography.small, color: colors.primary },
  footer: { ...typography.tiny, color: colors.muted, textAlign: 'center', marginTop: spacing.xxl, lineHeight: 18 },
});
