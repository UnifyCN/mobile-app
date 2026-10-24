import { typography } from '@/constants/Typography';
import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import BottomSheet from '@/components/common/BottomSheet';
import { RESOURCE_THEME } from '@/constants/ResourceTheme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/** The i18n keys rendered as bullets, in order. */
const CRITERIA_KEYS = [
  'learn.resources.howWeChoose.criteria.serves',
  'learn.resources.howWeChoose.criteria.published',
  'learn.resources.howWeChoose.criteria.eligibility',
  'learn.resources.howWeChoose.criteria.reviewed',
] as const;

/**
 * Explains how organizations get into the directory. A sheet rather than a
 * pushed screen: it is a side question about the list the person is already
 * looking at, not a place they navigated to.
 */
export default function HowWeChooseSheet({ visible, onClose }: Props) {
  const { t } = useTranslation();

  return (
    <BottomSheet visible={visible} onClose={onClose} snapPoint={0.58}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title} accessibilityRole='header'>
          {t('learn.resources.howWeChoose.title')}
        </Text>
        <Text style={styles.intro}>
          {t('learn.resources.howWeChoose.intro')}
        </Text>

        {CRITERIA_KEYS.map(key => (
          <View key={key} style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>{t(key)}</Text>
          </View>
        ))}

        <Text style={styles.footnote}>
          {t('learn.resources.howWeChoose.footnote')}
        </Text>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 4, paddingBottom: 32 },
  title: {
    ...typography.section,
    letterSpacing: -0.3,
    color: RESOURCE_THEME.textHeading,
    marginBottom: 8,
  },
  intro: {
    ...typography.secondary,
    color: RESOURCE_THEME.textSecondary,
    marginBottom: 18,
    fontWeight: '400',
  },
  bulletRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
    backgroundColor: RESOURCE_THEME.link,
  },
  bulletText: {
    ...typography.secondary,
    flex: 1,
    color: RESOURCE_THEME.textBody,
    fontWeight: '400',
  },
  footnote: {
    ...typography.caption,
    marginTop: 6,
    color: RESOURCE_THEME.textSecondary,
    fontWeight: '400',
  },
});
