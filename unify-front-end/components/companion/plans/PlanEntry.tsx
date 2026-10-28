import React from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { typography } from '@/constants/Typography';
import { usePlans } from '@/hooks/companion/usePlans';
import { minTarget } from '@/utils/touchTarget';

export type PlanTarget = { proposalId: string } | { planId: string };

/**
 * Persistent entry to the account's settlement plan (direction B, mobile-app#364). It
 * sits above the conversation, outside any message, so it is the same in every
 * conversation and after a restart. While the read is pending it says so: loading and
 * a failed read never look like "no plan". An open draft comes first, because it still
 * needs the user's review; otherwise the most recently saved plan, with its current
 * progress read from the shared tasks.
 */
export function PlanEntry({
  onOpen,
  textKey,
}: {
  onOpen: (target: PlanTarget) => void;
  /** Changes with the system text size, so the text is measured again (see textScaleKey). */
  textKey?: string;
}) {
  const { t } = useTranslation();
  const { status, plans, drafts } = usePlans();
  if (status === 'unavailable' || status === 'signed_out') return null;

  if (status === 'loading' || status === 'failed') {
    return (
      <View style={[styles.card, { minHeight: minTarget() }]} accessibilityLiveRegion='polite'>
        <Icon />
        <View key={textKey} style={styles.text}>
          <Text style={styles.title}>{t('plans.entryTitle')}</Text>
          <Text style={styles.summary}>
            {status === 'loading' ? t('plans.entryLoading') : t('plans.entryFailed')}
          </Text>
        </View>
      </View>
    );
  }

  const draft = drafts[0];
  const plan = plans[0];
  if (!draft && !plan) return null;

  let label: string;
  let title: string;
  let summary: string;
  let target: PlanTarget;
  if (draft) {
    title = t('plans.entryDraftTitle');
    summary = t('plans.entryReview');
    label = t('plans.entryDraftA11y', { goal: draft.goal });
    target = { proposalId: draft.id };
  } else {
    const live = plan!.items.filter(i => !i.removed);
    summary = t('plans.entryProgress', {
      done: live.filter(i => i.state === 'completed').length,
      total: live.length,
    });
    // A Retry found a change: the remaining addition waits for the user's new approval.
    if (plan!.reviews.some(r => r.status === 'draft')) summary = t('plans.entryNeedsReview', { progress: summary });
    title = t('plans.entryTitle');
    label = t('plans.entryA11y', { goal: plan!.goal, summary });
    target = { planId: plan!.planId };
  }
  const goal = draft ? draft.goal : plan!.goal;

  return (
    <Pressable
      onPress={() => onOpen(target)}
      accessibilityRole='button'
      accessibilityLabel={label}
      style={({ pressed }) => [styles.card, { minHeight: minTarget() }, pressed && styles.pressed]}
    >
      <Icon draft={Boolean(draft)} />
      <View key={textKey} style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.goal} numberOfLines={2}>
          {goal}
        </Text>
        <Text style={styles.summary}>{summary}</Text>
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

function Icon({ draft = false }: { draft?: boolean }) {
  return (
    <View style={[styles.icon, draft && styles.iconDraft]}>
      <MaterialIcons name='event-note' size={20} color='#9A4A00' />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
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
  iconDraft: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#9A4A00' },
  text: { flex: 1 },
  title: { ...typography.secondary, fontWeight: '600', color: '#0F172A' },
  goal: { ...typography.secondary, color: '#0F172A' },
  summary: { ...typography.caption, color: '#475569' },
  flipped: { transform: [{ scaleX: -1 }] },
});
