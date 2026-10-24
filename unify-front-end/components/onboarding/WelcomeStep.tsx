import { typography } from '@/constants/Typography';
import React, { useRef } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Theme } from '@/constants/Theme';
import UnifyLogo from '../../components/icons/UnifyLogo.svg';

interface WelcomeStepProps {
  onNext: () => void;
  isRedo?: boolean;
  firstName: string;
  onChangeFirstName: (value: string) => void;
  error?: string;
}

export default function WelcomeStep({
  onNext,
  isRedo = false,
  firstName,
  onChangeFirstName,
  error,
}: WelcomeStepProps) {
  const { t } = useTranslation();
  const inputRef = useRef<TextInput>(null);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <UnifyLogo width={100} height={100} style={styles.logo} />
        <Text style={styles.title}>
          {t(isRedo ? 'quiz.welcome.titleRedo' : 'quiz.welcome.titleNew')}
        </Text>
        <Text style={styles.body}>
          {t(isRedo ? 'quiz.welcome.subtitleRedo' : 'quiz.welcome.subtitleNew')}
        </Text>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={firstName}
          onChangeText={onChangeFirstName}
          placeholder={t('quiz.firstName.placeholder')}
          placeholderTextColor={Theme.textInput}
          maxLength={24}
          autoCapitalize='words'
          autoCorrect={false}
          returnKeyType='next'
          autoFocus={!isRedo}
          onSubmitEditing={() => {
            if (firstName.trim()) onNext();
          }}
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    backgroundColor: Theme.white,
  },
  content: {
    alignItems: 'center',
    width: '100%',
  },
  logo: {
    marginBottom: 32,
  },
  title: {
    ...typography.title,
    color: Theme.black,
    marginBottom: 16,
    textAlign: 'center',
  },
  body: {
    ...typography.body,
    color: Theme.textInput,
    textAlign: 'center',
    maxWidth: '90%',
    marginBottom: 32,
  },
  input: {
    ...typography.body,
    width: '100%',
    height: 56,
    borderWidth: 1,
    borderColor: Theme.borderInfoText,
    borderRadius: 12,
    paddingHorizontal: 20,
    color: Theme.black,
    textAlign: 'center',
  },
  errorText: {
    ...typography.secondary,
    color: '#f00',
    marginTop: 12,
    textAlign: 'center',
  },
});
