import { typography } from '@/constants/Typography';
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { supabase } from '@/lib/supabase';
import {
  SimpleTextField,
  SubmitButton,
  ViewContainer,
} from '@/components/AuthComponents/Components';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import BackHeader from '@/components/BackHeader';
import { useRouter } from 'expo-router';

export default function ResetPasswordPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);

  const validatePassword = (password: string) => {
    return password.length >= 8; // Can add more complex validation if needed
  };

  const handleResetPassword = async () => {
    setLoading(true);
    setMessage(null);

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setMessage({
        type: 'error',
        text: t('resetPassword.passwordsDoNotMatch'),
      });
      setLoading(false);
      return;
    }

    // Validate password strength
    if (!validatePassword(newPassword)) {
      setMessage({
        type: 'error',
        text: t('resetPassword.passwordTooShort'),
      });
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setMessage({ type: 'error', text: error.message });
      } else {
        setMessage({
          type: 'success',
          text: t('resetPassword.success'),
        });
        // Redirect to sign in after a short delay
        setTimeout(() => {
          router.push('/');
        }, 2000);
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: t('resetPassword.error'),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ViewContainer style={styles.container}>
      <BackHeader
        title={t('resetPassword.title')}
        onBack={() => router.back()}
        backIcon='x'
      />

      <View style={styles.content}>
        <Text style={styles.description}>{t('resetPassword.description')}</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>{t('resetPassword.newPassword')}</Text>
          <View style={{ position: 'relative' }}>
            <SimpleTextField
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder={t('resetPassword.newPasswordPlaceholder')}
              style={[
                styles.textField,
                message?.type === 'error' && { borderColor: '#f00' },
              ]}
              secureTextEntry={!passwordVisible}
              autoCapitalize='none'
            />
            <TouchableOpacity
              onPress={() => setPasswordVisible(!passwordVisible)}
              style={styles.eyeIcon}
            >
              <MaterialIcons
                name={passwordVisible ? 'visibility' : 'visibility-off'}
                size={24}
                color='#333'
              />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>{t('resetPassword.confirmPassword')}</Text>
          <View style={{ position: 'relative' }}>
            <SimpleTextField
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder={t('resetPassword.confirmPasswordPlaceholder')}
              style={[
                styles.textField,
                message?.type === 'error' && { borderColor: '#f00' },
              ]}
              secureTextEntry={!passwordVisible}
              autoCapitalize='none'
            />
          </View>
        </View>

        {message && (
          <Text
            style={[
              styles.message,
              message.type === 'error'
                ? styles.errorMessage
                : styles.successMessage,
            ]}
          >
            {message.text}
          </Text>
        )}

        <SubmitButton
          disabled={!newPassword || !confirmPassword}
          loading={loading}
          onPress={handleResetPassword}
          style={styles.button}
          labelStyle={styles.buttonText}
        >
          {t('resetPassword.title')}
        </SubmitButton>
      </View>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  description: {
    ...typography.body,
    color: '#666',
    marginBottom: 32,
    marginTop: 16,
  },
  inputContainer: {
    marginBottom: 24,
  },
  label: { ...typography.label, color: '#000', marginBottom: 8 },
  textField: {
    backgroundColor: '#fff',
    color: '#000',
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
    height: 57,
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    top: 16,
    zIndex: 1,
  },
  button: {
    backgroundColor: '#343434',
    borderRadius: 40,
    marginTop: 24,
    height: 42,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  buttonText: { ...typography.button, color: 'white', textAlign: 'center' },
  message: { ...typography.secondary, marginBottom: 16, textAlign: 'center' },
  errorMessage: {
    color: '#f00',
  },
  successMessage: {
    color: '#4CAF50',
  },
});
