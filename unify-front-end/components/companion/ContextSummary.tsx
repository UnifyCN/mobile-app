import { LiveText as Text } from '@/components/common/LiveText';
import React, { forwardRef } from 'react';
import { I18nManager, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Theme } from '@/constants/Theme';
import { typography } from '@/constants/Typography';
import {
  CompanionContext,
  contextPlace,
  hasVisibleContext,
  latestCheck,
} from '@/helpers/companion/companionContext';
import { useContextLabels } from './contextLabels';

/** Link text: 6.9:1 on white (Theme.surfaceBlue is 3.9:1, too light here). */
export const CONTEXT_LINK_COLOR = '#2B5A9B';
const NOTICE_TEXT = '#7C2D12'; // 8.8:1 on NOTICE_BACKGROUND
const NOTICE_BACKGROUND = '#FFF7ED';

/**
 * Missing, conflicting or unavailable information, in words. Shown under the
 * answer and at the top of the sheet, so it is visible without opening
 * anything. Uses text and an icon, not colour alone.
 */
export function ContextNotice({ context }: { context: CompanionContext }) {
  const { t } = useTranslation();
  const labels = useContextLabels();
  const notes: string[] = [];
  const c = context.clarification;
  if (c?.kind === 'profile_conflict' && c.field === 'province') {
    notes.push(
      t('companion.context.clarifyProvince', {
        profile: c.profileValue,
        conversation: c.conversationValue,
      })
    );
  } else if (c?.kind === 'profile_conflict' && c.field === 'arrival_date') {
    notes.push(
      t('companion.context.clarifyArrival', {
        profile: labels.fieldValue('arrival_date', c.profileValue),
        conversation: labels.arrival(c.conversationValue),
      })
    );
  } else if (c?.kind === 'place_unclear') {
    notes.push(
      t('companion.context.clarifyPlace', {
        places: c.options.join(I18nManager.isRTL ? '، ' : ', '),
      })
    );
  } else if (c?.kind === 'missing') {
    notes.push(t('companion.context.missingProvince'));
  }
  if (context.guidance.status === 'unavailable') {
    notes.push(t('companion.context.unavailable'));
  }
  if (context.guidance.status === 'conflict') {
    notes.push(t('companion.context.conflict'));
  }
  if (context.unreadable.includes('checklist')) {
    notes.push(t('companion.context.checklistUnreadable'));
  }
  if (notes.length === 0) return null;
  return (
    <View style={styles.notice}>
      {notes.map(note => (
        <View key={note} style={styles.noticeRow}>
          <Ionicons
            name='alert-circle-outline'
            size={16}
            color={NOTICE_TEXT}
            style={styles.noticeIcon}
          />
          <Text style={styles.noticeText}>{note}</Text>
        </View>
      ))}
    </View>
  );
}

interface ContextSummaryProps {
  context: CompanionContext | null | undefined;
  onOpen?: () => void;
}

/**
 * The context line under an answer (direction B): a few quiet chips naming
 * what the answer used, any notice, the latest official check time, and the
 * "Sources and context" control that opens the bottom sheet. The ref is the
 * control, so the sheet can return focus to it on close.
 */
export const ContextSummary = forwardRef<View, ContextSummaryProps>(
  function ContextSummary({ context, onOpen }, ref) {
    const { t } = useTranslation();
    const labels = useContextLabels();
    if (!hasVisibleContext(context)) return null;

    const chips: string[] = [];
    const place = contextPlace(context);
    if (place) chips.push(place);
    const arrival = context.items
      .find(i => i.kind === 'conversation_detail')
      ?.fields.find(f => f.key === 'arrival');
    if (arrival) chips.push(labels.arrival(arrival.value));
    const taskCount = context.items.filter(
      i => i.kind === 'checklist_task'
    ).length;
    if (taskCount > 0) {
      chips.push(t('companion.context.tasksUsed', { number: taskCount }));
    }
    const checked = latestCheck(context);

    return (
      <View style={styles.container}>
        {chips.length > 0 && (
          <View
            style={styles.chips}
            accessible
            accessibilityLabel={`${t('companion.context.usedAria')}: ${chips.join(', ')}`}
          >
            {chips.map(chip => (
              <Text key={chip} style={styles.chip}>
                {chip}
              </Text>
            ))}
          </View>
        )}
        <ContextNotice context={context} />
        {checked && (
          <View style={styles.checkedRow}>
            <Ionicons
              name='time-outline'
              size={14}
              color={Theme.textInput}
              style={styles.checkedIcon}
            />
            <Text style={styles.checkedText}>
              {t('companion.context.checkedAt', { time: labels.time(checked) })}
            </Text>
          </View>
        )}
        {onOpen && (
          <Pressable
            ref={ref}
            onPress={onOpen}
            accessibilityRole='button'
            accessibilityLabel={t('companion.context.openDetails')}
            hitSlop={{ top: 6, bottom: 6 }}
            style={({ pressed }) => [
              styles.openButton,
              pressed && styles.openButtonPressed,
            ]}
          >
            <Text style={styles.openText}>
              {t('companion.context.openDetails')}
            </Text>
            <Ionicons
              name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'}
              size={16}
              color={CONTEXT_LINK_COLOR}
            />
          </Pressable>
        )}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    gap: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    ...typography.caption,
    color: Theme.textAlternateGray,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  notice: {
    backgroundColor: NOTICE_BACKGROUND,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  noticeIcon: {
    marginTop: 1,
    marginEnd: 6,
  },
  noticeText: {
    ...typography.caption,
    color: NOTICE_TEXT,
    flex: 1,
  },
  checkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkedIcon: {
    marginEnd: 4,
  },
  checkedText: {
    ...typography.caption,
    color: Theme.textInput,
    flexShrink: 1,
  },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: 44,
    gap: 2,
  },
  openButtonPressed: {
    opacity: 0.6,
  },
  openText: {
    ...typography.caption,
    fontWeight: '600',
    color: CONTEXT_LINK_COLOR,
  },
});
