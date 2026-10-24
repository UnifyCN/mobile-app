import { typography } from '@/constants/Typography';
import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Theme } from '@/constants/Theme';

interface ThankYouStepProps {
  isRedo?: boolean;
  firstName?: string;
}

export default function ThankYouStep({
  isRedo = false,
  firstName,
}: ThankYouStepProps) {
  const { t } = useTranslation();
  const trimmedName = firstName?.trim();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Image
          source={require('../../assets/images/logo-with-name.png')}
          style={styles.logo}
          resizeMode='contain'
        />
        <Text style={styles.headline}>
          {isRedo ? (
            <>
              {t('quiz.thankYou.titleRedoStart')}
              <Text style={styles.headlineItalic}>
                {t('quiz.thankYou.titleRedoItalic')}
              </Text>
            </>
          ) : trimmedName ? (
            t('quiz.thankYou.titlePersonalized', { name: trimmedName })
          ) : (
            <>
              {t('quiz.thankYou.titleDefaultStart')}
              <Text style={styles.headlineItalic}>
                {t('quiz.thankYou.titleDefaultItalic')}
              </Text>
            </>
          )}
        </Text>
        <Text style={styles.body}>
          {t(isRedo ? 'quiz.thankYou.bodyRedo' : 'quiz.thankYou.bodyDefault')}
        </Text>
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
    width: 280,
    height: 120,
    marginBottom: 10,
  },
  headline: {
    ...typography.section,
    color: Theme.black,
    textAlign: 'center',
    marginBottom: 16,
  },
  headlineItalic: {
    fontStyle: 'italic',
    fontWeight: '700',
    color: Theme.primaryGatherRed,
  },
  body: {
    ...typography.section,
    color: Theme.textInput,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
});
