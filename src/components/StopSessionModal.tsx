import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { theme } from '../theme';

type StopSessionModalProps = {
  visible: boolean;
  uniqueMissCount: number;
  totalMissCount: number;
  onResume: () => void;
  onStopAndCopy: () => void;
};

export function StopSessionModal({
  visible,
  uniqueMissCount,
  totalMissCount,
  onResume,
  onStopAndCopy,
}: StopSessionModalProps) {
  const hasMissedWords = uniqueMissCount > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onResume}
    >
      <View style={styles.overlay}>
        <View style={styles.box}>
          <Text style={styles.title}>Stop session?</Text>
          <Text style={styles.subtitle}>
            {hasMissedWords
              ? `Copy ${uniqueMissCount} missed words (${totalMissCount} misses) to clipboard before stopping.`
              : 'No missed words yet. Stop now and return to start.'}
          </Text>
          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.button, styles.primary]}
              onPress={onStopAndCopy}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryText}>
                {hasMissedWords ? 'Stop + Copy missed words' : 'Stop session'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.secondary]}
              onPress={onResume}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryText}>Resume</Text>
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
    padding: 24,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: theme.stroke,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: theme.textMuted,
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 21,
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
    backgroundColor: theme.bad,
  },
  primaryText: {
    fontSize: 15,
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
