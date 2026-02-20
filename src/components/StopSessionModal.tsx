import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { BlurView } from 'expo-blur';
import { theme } from '../theme';

type StopSessionModalProps = {
  visible: boolean;
  uniqueMissCount: number;
  onResume: () => void;
  onStopAndCopy: () => void;
};

export function StopSessionModal({
  visible,
  uniqueMissCount,
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
        <BlurView intensity={46} tint="dark" style={styles.blurLayer} />
        <View style={styles.scrim} />
        <View style={styles.box}>
          <Text style={styles.title}>Stop session?</Text>
          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.button, styles.primary]}
              onPress={onStopAndCopy}
              activeOpacity={0.8}
            >
              <View style={styles.primaryContent}>
                {hasMissedWords && (
                  <FontAwesome5 name="copy" size={15} color={theme.textPrimary} />
                )}
                <Text style={styles.primaryText}>Stop</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.secondary]}
              onPress={onResume}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryText}>Cancel</Text>
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  blurLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.36)',
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
    marginBottom: 18,
    textAlign: 'center',
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
  primaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
