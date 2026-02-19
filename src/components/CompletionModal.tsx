import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { theme } from '../theme';

type CompletionModalProps = {
  visible: boolean;
  bestTimeMs: number | null;
  onRunAgain: () => void;
  onDone: () => void;
};

export function CompletionModal({
  visible,
  bestTimeMs,
  onRunAgain,
  onDone,
}: CompletionModalProps) {
  const bestStr =
    bestTimeMs != null
      ? `${Math.floor(bestTimeMs / 60000)}:${((bestTimeMs % 60000) / 1000).toFixed(1).padStart(4, '0')}`
      : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDone}
    >
      <View style={styles.overlay}>
        <View style={styles.box}>
          <Text style={styles.title}>Mandou bem!</Text>
          <Text style={styles.subtitle}>Nice!</Text>
          {bestStr != null && (
            <Text style={styles.best}>Best time: {bestStr}</Text>
          )}
          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.button, styles.primary]}
              onPress={onRunAgain}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryText}>Rodar de novo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.secondary]}
              onPress={onDone}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryText}>Encerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  box: {
    backgroundColor: theme.surfaceStrong,
    borderRadius: theme.cardRadius,
    padding: 28,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.stroke,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: theme.textMuted,
    marginBottom: 16,
  },
  best: {
    fontSize: 14,
    color: theme.info,
    marginBottom: 20,
  },
  buttons: {
    width: '100%',
    gap: 12,
  },
  button: {
    paddingVertical: 14,
    borderRadius: theme.optionRadius,
    alignItems: 'center',
  },
  primary: {
    backgroundColor: theme.brand,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: theme.stroke,
  },
  secondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
  },
});
