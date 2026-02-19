import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { theme } from '../theme';

interface LoginModalProps {
  visible: boolean;
  onLoginWithInstagram: (instagram: string) => void;
  onSignUp: () => void;
}

export function LoginModal({ visible, onLoginWithInstagram, onSignUp }: LoginModalProps) {
  const [instagram, setInstagram] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = () => {
    const trimmed = instagram.trim().replace(/^@/, '');
    if (!trimmed) return;
    setLoading(true);
    onLoginWithInstagram(trimmed);
    setLoading(false);
    setInstagram('');
  };

  const canLogin = instagram.trim().length > 0;

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.darkOverlay} />
      <View style={styles.content} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.title}>Login with Instagram</Text>
          <TextInput
            style={styles.input}
            value={instagram}
            onChangeText={setInstagram}
            placeholder="@username"
            placeholderTextColor="rgba(255,255,255,0.5)"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            onPress={handleLogin}
            disabled={!canLogin || loading}
            style={({ pressed }) => [
              styles.loginButton,
              (!canLogin || loading) && styles.loginButtonDisabled,
              pressed && canLogin && styles.pressed,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.loginButtonText}>Login</Text>
            )}
          </Pressable>
          <Pressable
            onPress={onSignUp}
            style={({ pressed }) => [styles.signUpButton, pressed && styles.pressed]}
          >
            <Text style={styles.signUpText}>Sign up</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'fixed',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    minHeight: '100vh',
    zIndex: 10000,
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  loginButton: {
    backgroundColor: theme.green,
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
    marginBottom: 12,
  },
  loginButtonDisabled: {
    opacity: 0.5,
  },
  loginButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.white,
  },
  signUpButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  signUpText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
  },
  pressed: {
    opacity: 0.85,
  },
});
