import { typography } from '@/constants/Typography';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Theme } from '@/constants/Theme';

export function MatchingCompletionStep() {
  const { t } = useTranslation();

  return (
    <View style={styles.root}>
      <Text style={styles.headline}>{t('circles.completion.headline')}</Text>
      <Text style={styles.body}>{t('circles.completion.body')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  headline: { ...typography.section, color: Theme.black, textAlign: 'center' },
  body: { ...typography.body, color: Theme.textInput, textAlign: 'center' },
});
