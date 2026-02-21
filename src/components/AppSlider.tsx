import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Slider from '@react-native-community/slider';

type AppSliderProps = {
  value: number;
  onValueChange: (value: number) => void;
  minimumValue: number;
  maximumValue: number;
  step?: number;
  minimumTrackTintColor?: string;
  maximumTrackTintColor?: string;
  thumbTintColor?: string;
  style?: object;
};

/**
 * Slider that avoids findDOMNode on web by using a native range input
 * instead of @react-native-community/slider's web implementation.
 */
export function AppSlider({
  value,
  onValueChange,
  minimumValue,
  maximumValue,
  step = 1,
  minimumTrackTintColor,
  maximumTrackTintColor,
  thumbTintColor,
  style,
}: AppSliderProps) {
  if (Platform.OS === 'web') {
    return (
      <View style={[styles.webWrap, style]}>
        {React.createElement('input', {
          type: 'range',
          min: minimumValue,
          max: maximumValue,
          step,
          value,
          onChange: (e: { target: { value: string } }) =>
            onValueChange(parseFloat(e.target.value)),
          style: {
            width: '100%',
            height: 48,
            margin: 0,
            accentColor: thumbTintColor ?? '#6A5CFF',
            cursor: 'pointer',
          },
        })}
      </View>
    );
  }

  return (
    <Slider
      style={style}
      minimumValue={minimumValue}
      maximumValue={maximumValue}
      step={step}
      value={value}
      onValueChange={onValueChange}
      minimumTrackTintColor={minimumTrackTintColor}
      maximumTrackTintColor={maximumTrackTintColor}
      thumbTintColor={thumbTintColor}
    />
  );
}

const styles = StyleSheet.create({
  webWrap: {
    width: '100%',
    height: 48,
  },
});
