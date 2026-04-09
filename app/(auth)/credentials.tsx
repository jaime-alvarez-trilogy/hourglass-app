// Credentials screen — aligned with welcome screen design language
import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, ScrollView, Platform, Keyboard, StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useOnboarding } from '@/src/contexts/OnboardingContext';
import { GradientButton } from '@/src/components/GradientButton';

export default function CredentialsScreen() {
  const router = useRouter();
  const { submitCredentials, isLoading, error, step } = useOnboarding();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    if (step === 'verifying') router.push('/(auth)/verifying');
    if (step === 'env-select') router.push('/(auth)/env-select');
  }, [step]);

  function validate(): boolean {
    let valid = true;
    if (!email.trim()) { setEmailError('Email is required'); valid = false; }
    else setEmailError('');
    if (!password) { setPasswordError('Password is required'); valid = false; }
    else setPasswordError('');
    return valid;
  }

  async function handleSignIn() {
    Keyboard.dismiss();
    if (!validate()) return;
    await submitCredentials(email.trim(), password);
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.inner}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Sign In</Text>
            <Text style={styles.subtitle}>Enter your Crossover credentials</Text>
          </View>

          {/* Error banner */}
          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[
                styles.input,
                emailFocused && styles.inputFocused,
                !!emailError && styles.inputError,
              ]}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="you@crossover.com"
              placeholderTextColor="#3D3C52"
              editable={!isLoading}
              returnKeyType="next"
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            {emailError ? <Text style={styles.fieldError}>{emailError}</Text> : null}

            <Text style={[styles.label, { marginTop: 20 }]}>Password</Text>
            <TextInput
              ref={passwordRef}
              style={[
                styles.input,
                passwordFocused && styles.inputFocused,
                !!passwordError && styles.inputError,
              ]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor="#3D3C52"
              editable={!isLoading}
              returnKeyType="done"
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              onSubmitEditing={handleSignIn}
            />
            {passwordError ? <Text style={styles.fieldError}>{passwordError}</Text> : null}

            {/* Keychain note */}
            <View style={styles.keychainRow}>
              <Text style={styles.keychainIcon}>🔒</Text>
              <Text style={styles.keychainText}>
                Your credentials are stored securely in your device's Keychain and never leave your phone.
              </Text>
            </View>

            <Text style={styles.forgotText}>
              Forgot your password? Reset it at crossover.com
            </Text>
          </View>

          {/* CTA */}
          <View style={styles.ctaWrap}>
            <GradientButton label="Sign In" onPress={handleSignIn} loading={isLoading} />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0D0C14',
  },
  scroll: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  inner: {
    flex: 1,
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 8,
    justifyContent: 'space-between',
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    marginTop: 4,
  },
  errorBanner: {
    backgroundColor: '#1F1E29',
    borderWidth: 1,
    borderColor: '#F43F5E',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#F43F5E',
  },
  form: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#16151F',
    borderWidth: 1,
    borderColor: '#2F2E41',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#FFFFFF',
  },
  inputFocused: {
    borderColor: '#A78BFA',
  },
  inputError: {
    borderColor: '#F43F5E',
  },
  fieldError: {
    fontSize: 13,
    color: '#F43F5E',
    marginTop: 6,
  },
  keychainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 20,
    paddingHorizontal: 2,
  },
  keychainIcon: {
    fontSize: 13,
    marginTop: 1,
  },
  keychainText: {
    flex: 1,
    fontSize: 13,
    color: '#484F58',
    lineHeight: 20,
  },
  forgotText: {
    fontSize: 13,
    color: '#484F58',
    marginTop: 12,
    paddingHorizontal: 2,
  },
  ctaWrap: {
    marginTop: 32,
  },
});
