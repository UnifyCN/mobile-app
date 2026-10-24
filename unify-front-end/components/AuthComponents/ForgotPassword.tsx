import { typography } from '@/constants/Typography';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { SimpleTextField, SubmitButton, ViewContainer } from './Components';
import { MaterialIcons } from '@expo/vector-icons';
import BackHeader from '../BackHeader';

interface ForgotPasswordProps {
  onBack: () => void;
  onCodeSent: (email: string) => void;
}

export default function ForgotPassword({
  onBack,
  onCodeSent,
}: Readonly<ForgotPasswordProps>) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [isEmailValid, setIsEmailValid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: 'error' | 'success';
    text: string;
  } | null>(null);
  const codeSentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (codeSentTimerRef.current) {
        clearTimeout(codeSentTimerRef.current);
      }
    };
  }, []);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    setIsEmailValid(emailRegex.test(email));
  };

  const handleResetPassword = async () => {
    setLoading(true);
    setMessage(null);

    try {
      // 'resetPasswordForEmail()' utilizes the 'Reset Password' email template in Supabase
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: undefined,
      });

      if (error) {
        setMessage({ type: 'error', text: error.message });
      } else {
        setMessage({
          type: 'success',
          text: t('auth.checkEmailCode'),
        });

        if (codeSentTimerRef.current) {
          clearTimeout(codeSentTimerRef.current);
        }

        codeSentTimerRef.current = setTimeout(() => {
          onCodeSent(email);
        }, 1500);
      }
    } catch (error: unknown) {
      const messageWithFallback =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : t('auth.forgotPasswordError');

      console.error('Password reset error:', error);
      setMessage({
        type: 'error',
        text: messageWithFallback,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ViewContainer style={styles.container}>
      <BackHeader
        title={t('auth.resetPassword')}
        onBack={onBack}
        backIcon='x'
      />

      <View style={styles.content}>
        <Text style={styles.description}>{t('auth.resetPasswordDesc')}</Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>{t('auth.emailAddress')}</Text>
          <View style={{ position: 'relative' }}>
            <SimpleTextField
              value={email}
              onChangeText={text => {
                setEmail(text);
                validateEmail(text);
              }}
              placeholder={t('auth.emailPlaceholder')}
              style={[
                styles.textField,
                message?.type === 'error' && { borderColor: '#f00' },
              ]}
              autoCapitalize='none'
            />
            {isEmailValid && (
              <MaterialIcons
                name='check-circle'
                size={24}
                color='#333'
                style={styles.tickIcon}
              />
            )}
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
          disabled={!isEmailValid}
          loading={loading}
          onPress={handleResetPassword}
          style={styles.button}
          labelStyle={styles.buttonText}
        >
          {t('auth.sendResetLink')}
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
  tickIcon: {
    position: 'absolute',
    right: 16,
    top: 16,
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
  message: { ...typography.secondary, marginBottom: 16 },
  errorMessage: {
    color: '#f00',
  },
  successMessage: {
    color: '#4CAF50',
  },
});
