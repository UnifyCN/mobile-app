import React from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { typography } from '@/constants/Typography';
import { useTaskProgress } from '@/hooks/companion/useTaskActions';

/**
 * Compact Companion entry to the account's saved task progress (direction B,
 * mobile-app#361). It sits above the conversation, not in a message, so it is the
 * same in every conversation and never reads as a historical receipt. Hidden when
 * the feature is off, the contract version is unsupported, or nobody is signed in.
 */
export function CompanionTasksEntry({
  onOpen,
  textKey,
}: {
  onOpen: () => void;
  /** Changes with the system text size, so the text is measured again (see textScaleKey). */
  textKey?: string;
}) {
  const { t } = useTranslation();
  const view = useTaskProgress();
  if (view.status === 'unavailable' || view.status === 'signed_out')
    return null;

  let inProgress = 0;
  let waiting = 0;
  for (const p of view.byRef.values()) {
    if (p.removed) continue;
    if (p.state === 'in_progress') inProgress++;
    if (p.state === 'waiting') waiting++;
  }
  const summary =
    view.status === 'loading'
      ? t('taskActions.loading')
      : t('taskActions.entrySummary', {
          inProgressCount: inProgress,
          waitingCount: waiting,
        });

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole='button'
      accessibilityLabel={`${t('taskActions.entryTitle')}, ${summary}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.icon}>
        <MaterialIcons name='checklist' size={20} color='#9A4A00' />
      </View>
      <View key={textKey} style={styles.text}>
        <Text style={styles.title}>{t('taskActions.entryTitle')}</Text>
        <Text style={styles.summary} numberOfLines={2}>
          {summary}
        </Text>
      </View>
      <MaterialIcons
        name='chevron-right'
        size={22}
        color='#64748B'
        style={I18nManager.isRTL ? styles.flipped : undefined}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  pressed: { opacity: 0.7 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF4E8',
  },
  text: { flex: 1 },
  title: { ...typography.secondary, fontWeight: '600', color: '#0F172A' },
  summary: { ...typography.caption, color: '#475569' },
  flipped: { transform: [{ scaleX: -1 }] },
});
