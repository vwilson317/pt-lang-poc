import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { theme } from '../theme';
import { COUNTRIES } from '../constants/countries';
import type { Gender, OpenTo } from '../types/profile';

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

const OPEN_TO_OPTIONS: { value: OpenTo; label: string }[] = [
  { value: 'men', label: 'Men' },
  { value: 'women', label: 'Women' },
  { value: 'everyone', label: 'Everyone' },
];

const LIVING_OPTIONS = [
  { value: 'living', label: 'Living here' },
  { value: 'traveling', label: 'Traveling' },
];

export interface SignupFormData {
  name: string;
  age: string;
  countryOfOrigin: string;
  gender: Gender;
  openTo: OpenTo;
  instagram: string;
  photoUri: string | null;
  currentLocation: string;
  livingOrTraveling: 'living' | 'traveling';
  leavingDate: string;
}

interface SignupScreenProps {
  onComplete: (data: SignupFormData) => void | Promise<void>;
  onBack?: () => void;
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => setOpen(!open)}
        style={styles.selectTouch}
      >
        <Text style={[styles.selectText, !value && styles.placeholder]}>
          {value ? options.find((o) => o.value === value)?.label ?? value : placeholder ?? 'Select'}
        </Text>
        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
      </Pressable>
      {open && (
        <View style={styles.optionsWrap}>
          {options.map((opt) => (
            <Pressable
              key={opt.value}
              onPress={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              style={styles.option}
            >
              <Text style={styles.optionText}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export function SignupScreen({ onComplete, onBack }: SignupScreenProps) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [countryOfOrigin, setCountryOfOrigin] = useState('');
  const [gender, setGender] = useState<Gender>('male');
  const [openTo, setOpenTo] = useState<OpenTo>('everyone');
  const [instagram, setInstagram] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState('');
  const [livingOrTraveling, setLivingOrTraveling] = useState<'living' | 'traveling'>('living');
  const [leavingDate, setLeavingDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [photoUrlInput, setPhotoUrlInput] = useState('');
  const pickImage = useCallback(async () => {
    try {
      const ImagePicker = await import('expo-image-picker');
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow access to photos to add a profile picture.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not pick image. You can paste an image URL below.');
    }
  }, []);

  const effectivePhotoUri = photoUri || (photoUrlInput.trim().startsWith('http') ? photoUrlInput.trim() : null);

  const validate = useCallback((): string | null => {
    if (!name.trim()) return 'Name is required';
    const ageNum = parseInt(age, 10);
    if (!age || isNaN(ageNum) || ageNum < 18 || ageNum > 120) return 'Valid age (18+) is required';
    if (!countryOfOrigin) return 'Country of origin is required';
    if (!currentLocation.trim()) return 'Current location is required';
    const photo = photoUri || (photoUrlInput.trim().startsWith('http') ? photoUrlInput.trim() : null);
    if (!photo) return 'Photo is required (add from library or paste URL)';
    if (livingOrTraveling === 'traveling' && !leavingDate.trim()) {
      return 'Leaving date is required when traveling';
    }
    if (livingOrTraveling === 'traveling') {
      const d = new Date(leavingDate);
      if (isNaN(d.getTime())) return 'Invalid leaving date';
    }
    return null;
  }, [name, age, countryOfOrigin, currentLocation, photoUri, photoUrlInput, livingOrTraveling, leavingDate]);

  const handleSubmit = useCallback(async () => {
    const err = validate();
    if (err) {
      Alert.alert('Please fix', err);
      return;
    }
    setSubmitting(true);
    try {
      const photo = photoUri || (photoUrlInput.trim().startsWith('http') ? photoUrlInput.trim() : null);
      await onComplete({
        name: name.trim(),
        age: age.trim(),
        countryOfOrigin,
        gender,
        openTo,
        instagram: instagram.trim().replace(/^@/, ''),
        photoUri: photo,
        currentLocation: currentLocation.trim(),
        livingOrTraveling,
        leavingDate: livingOrTraveling === 'traveling' ? leavingDate.trim() : '',
      });
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [name, age, countryOfOrigin, gender, openTo, instagram, photoUri, photoUrlInput, currentLocation, livingOrTraveling, leavingDate, validate, onComplete]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.form}>
        {onBack ? (
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>
        ) : null}
        <Text style={styles.title}>Sign up</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Age</Text>
          <TextInput
            style={styles.input}
            value={age}
            onChangeText={setAge}
            placeholder="18+"
            placeholderTextColor={theme.textSecondary}
            keyboardType="number-pad"
            maxLength={3}
          />
        </View>

        <SelectField
          label="Country of origin"
          value={countryOfOrigin}
          options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))}
          onChange={(v) => setCountryOfOrigin(v)}
          placeholder="Select country"
        />

        <SelectField
          label="Gender"
          value={gender}
          options={GENDERS}
          onChange={setGender}
        />

        <SelectField
          label="Open to"
          value={openTo}
          options={OPEN_TO_OPTIONS}
          onChange={setOpenTo}
        />

        <View style={styles.field}>
          <Text style={styles.label}>Instagram</Text>
          <TextInput
            style={styles.input}
            value={instagram}
            onChangeText={setInstagram}
            placeholder="@username"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Photo</Text>
          <Pressable onPress={pickImage} style={styles.photoButton}>
            {effectivePhotoUri ? (
              <Image source={{ uri: effectivePhotoUri }} style={styles.photoPreview} resizeMode="cover" />
            ) : (
              <Text style={styles.photoPlaceholder}>Add photo</Text>
            )}
          </Pressable>
          <TextInput
            style={[styles.input, { marginTop: 8 }]}
            value={photoUrlInput}
            onChangeText={(t) => {
              setPhotoUrlInput(t);
              if (t.trim().startsWith('http')) setPhotoUri(null);
            }}
            placeholder="Or paste image URL"
            placeholderTextColor={theme.textSecondary}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Current location</Text>
          <TextInput
            style={styles.input}
            value={currentLocation}
            onChangeText={setCurrentLocation}
            placeholder="City, Country"
            placeholderTextColor={theme.textSecondary}
          />
        </View>

        <SelectField
          label="Living or traveling"
          value={livingOrTraveling}
          options={LIVING_OPTIONS}
          onChange={(v) => setLivingOrTraveling(v as 'living' | 'traveling')}
        />

        {livingOrTraveling === 'traveling' && (
          <View style={styles.field}>
            <Text style={styles.label}>Leaving date *</Text>
            <TextInput
              style={styles.input}
              value={leavingDate}
              onChangeText={setLeavingDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.textSecondary}
            />
          </View>
        )}

        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          style={({ pressed }) => [
            styles.submitButton,
            (pressed || submitting) && styles.submitDisabled,
          ]}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitText}>Sign up</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: theme.bgDark,
  },
  scrollContent: {
    paddingBottom: 80,
  },
  form: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'web' ? 60 : 80,
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  backText: {
    fontSize: 16,
    color: theme.green,
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.gold,
    marginBottom: 24,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: 8,
  },
  input: {
    borderWidth: 2,
    borderColor: theme.green,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.textPrimary,
  },
  selectTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: theme.green,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  selectText: {
    fontSize: 16,
    color: theme.textPrimary,
  },
  placeholder: {
    color: theme.textSecondary,
  },
  chevron: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  optionsWrap: {
    marginTop: 4,
    borderWidth: 2,
    borderColor: theme.green,
    borderRadius: 12,
    overflow: 'hidden',
  },
  option: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  optionText: {
    fontSize: 16,
    color: theme.textPrimary,
  },
  photoButton: {
    width: 120,
    height: 160,
    borderWidth: 2,
    borderColor: theme.green,
    borderRadius: 12,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPreview: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  photoPlaceholder: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  submitButton: {
    backgroundColor: theme.green,
    paddingVertical: 16,
    borderRadius: 24,
    alignItems: 'center',
    marginTop: 24,
  },
  submitDisabled: {
    opacity: 0.7,
  },
  submitText: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.white,
  },
});
