import { typography } from '@/constants/Typography';
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

interface WelcomeScreenProps {
  onCreateAccount: () => void;
  onLogIn: () => void;
  onBack?: () => void;
}

export default function WelcomeScreen({
  onCreateAccount,
  onLogIn,
  onBack,
}: WelcomeScreenProps) {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.container}>
      {/* Back button */}
      {onBack && (
        <Pressable onPress={onBack} style={styles.backButton} hitSlop={12}>
          <Ionicons name='chevron-back' size={24} color='#000' />
        </Pressable>
      )}

      {/* Content centered */}
      <View style={styles.content}>
        {/* Logo */}
        <Image
          source={require('@/assets/images/splash-icon-light.png')}
          style={styles.logo}
          contentFit='contain'
        />

        {/* Text */}
        <Text style={styles.title}>{t('auth.welcome.title')}</Text>
        <Text style={styles.description}>{t('auth.welcome.subtitle')}</Text>
      </View>

      {/* Buttons at bottom */}
      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [
            styles.createButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={onCreateAccount}
        >
          <Text style={styles.createButtonText}>
            {t('auth.welcome.createAccount')}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.loginButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={onLogIn}
        >
          <Text style={styles.loginButtonText}>{t('auth.welcome.logIn')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  backButton: {
    marginTop: 8,
    marginLeft: 24,
    alignSelf: 'flex-start',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 31,
  },
  logo: {
    width: 300,
    height: 294,
    marginBottom: 40,
  },
  title: {
    ...typography.title,
    color: '#000',
    textAlign: 'center',
    marginBottom: 10,
  },
  description: {
    ...typography.body,
    color: '#000',
    textAlign: 'center',
    maxWidth: 313,
  },
  footer: {
    paddingHorizontal: 38,
    paddingBottom: 24,
    gap: 12,
  },
  createButton: {
    backgroundColor: '#000',
    height: 40,
    borderRadius: 12.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonText: { ...typography.button, color: '#fff' },
  loginButton: {
    backgroundColor: '#fff',
    height: 40,
    borderRadius: 12.5,
    borderWidth: 1,
    borderColor: '#CDCBCB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonText: { ...typography.button, color: '#050505' },
  buttonPressed: {
    opacity: 0.85,
  },
});
