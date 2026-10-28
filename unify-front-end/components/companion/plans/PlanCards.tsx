import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { typography } from '@/constants/Typography';
import type { PlanProposal } from '@/services/companionActions/planContract';
import {
  isPlanUnresolved,
  proposalKey,
  type PlanStore,
} from '@/services/companionActions/planStore';
import { usePlanPhase } from '@/hooks/companion/usePlans';
import { minTarget } from '@/utils/touchTarget';
import { planReceiptSummary } from './planText';

/**
 * Compact cards under a conversation message (direction B, mobile-app#364): the plan
 * the answer suggested. A draft says it is not saved and opens the bottom sheet for
 * review. A saved plan shows its receipt (the recorded result, not assistant text) and
 * opens the plan. The card is a message reference: the plan itself lives outside it.
 */
export function PlanCards({
  messageId,
  proposals,
  store,
  onOpen,
}: {
  messageId: number | null;
  proposals: PlanProposal[];
  store: PlanStore | null;
  onOpen: (proposalId: string) => void;
}) {
  if (messageId === null) return null;
  const mine = proposals.filter(p => p.source?.messageId === messageId);
  return (
    <>
      {mine.map(p => (
        <PlanCard key={p.id} proposal={p} store={store} onOpen={() => onOpen(p.id)} />
      ))}
    </>
  );
}

function PlanCard({
  proposal,
  store,
  onOpen,
}: {
  proposal: PlanProposal;
  store: PlanStore | null;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const phase = usePlanPhase(store, proposalKey(proposal.id));
  const receipt = phase.phase === 'saved' ? phase.reply.receipt : proposal.receipt;
  const draft = proposal.status === 'draft' && !receipt;
  const existing = proposal.items.filter(i => i.kind === 'existing').length;
  const added = proposal.items.filter(i => i.kind === 'new' && i.include).length;
  const status = receipt
    ? receipt.undoneBy
      ? t('plans.cardUndone')
      : planReceiptSummary(t, receipt)
    : proposal.status === 'cancelled'
      ? t('plans.cardClosed')
      : isPlanUnresolved(phase)
        ? t('taskActions.checking')
        : t('plans.cardCounts', {
            existing: t('plans.existingCount', { count: existing }),
            added: t('plans.newCount', { count: added }),
          });
  return (
    <View testID='plan-card' style={[styles.card, draft && styles.cardDraft]}>
      <View style={styles.icon}>
        <MaterialIcons name='event-note' size={18} color='#9A4A00' />
      </View>
      <View style={styles.text}>
        <Text style={styles.eyebrow}>
          {draft ? t('plans.cardDraft') : t('plans.cardSaved')}
        </Text>
        <Text style={styles.title}>{proposal.goal}</Text>
        <Text style={styles.status} accessibilityLiveRegion='polite'>
          {status}
        </Text>
      </View>
      <Pressable
        accessibilityRole='button'
        accessibilityLabel={
          draft
            ? t('plans.reviewA11y', { goal: proposal.goal })
            : t('plans.continueA11y', { goal: proposal.goal })
        }
        onPress={onOpen}
        style={({ pressed }) => [styles.button, { minHeight: minTarget() }, pressed && styles.pressed]}
      >
        <Text style={styles.buttonText}>{draft ? t('plans.review') : t('plans.continue')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 6,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  cardDraft: { borderStyle: 'dashed', borderColor: '#9A4A00' },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF4E8',
  },
  text: { flex: 1, gap: 2 },
  eyebrow: { ...typography.caption, color: '#64748B' },
  title: { ...typography.secondary, fontWeight: '600', color: '#0F172A' },
  status: { ...typography.caption, color: '#475569' },
  button: {
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { ...typography.secondary, fontWeight: '600', color: '#9A4A00' },
  pressed: { opacity: 0.7 },
});
