import React from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet from '@/components/common/BottomSheet';
import { Theme } from '@/constants/Theme';
import { typography } from '@/constants/Typography';
import {
  CompanionContext,
  ContextItem,
  GuidanceSource,
} from '@/helpers/companion/companionContext';
import { getBottomSheetPadding } from '@/utils/safeAreaSpacing';
import { useContextLabels } from './contextLabels';
import { CONTEXT_LINK_COLOR, ContextNotice } from './ContextSummary';

interface Props {
  /** The answer's context; null when closed. */
  context: CompanionContext | null;
  onClose: () => void;
}

/**
 * "Sources and context" bottom sheet (direction B, ticket #362) for one
 * answer: the official pages it checked, with publisher, address and the time
 * they were read, and the account context it used. It overlays the
 * conversation, so the composer draft and scroll position stay as they were.
 */
export function CompanionContextSheet({ context, onClose }: Props) {
  const { t } = useTranslation();
  const labels = useContextLabels();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  // Larger text needs a taller sheet; the content scrolls when it still does
  // not fit.
  const snapPoint = Math.min(
    MAX_SNAP_POINT,
    BASE_SNAP_POINT + SNAP_POINT_PER_FONT_SCALE * Math.max(0, fontScale - 1)
  );

  const pages = context?.guidance.sources ?? [];
  const profile = context?.items.find(i => i.kind === 'profile');
  const stated = context?.items.find(i => i.kind === 'conversation_detail');
  const tasks = (context?.items ?? []).filter(
    (i): i is Extract<ContextItem, { kind: 'checklist_task' }> =>
      i.kind === 'checklist_task'
  );

  return (
    <BottomSheet
      visible={context !== null}
      onClose={onClose}
      snapPoint={snapPoint}
    >
      {context && (
        <View style={styles.flex} accessibilityViewIsModal>
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole='header'>
              {t('companion.context.drawerTitle')}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole='button'
              accessibilityLabel={t('companion.context.closeAria')}
              style={styles.closeButton}
            >
              <Ionicons name='close' size={22} color={Theme.textInput} />
            </Pressable>
          </View>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: getBottomSheetPadding(insets.bottom) },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <ContextNotice context={context} />

            <Section title={t('companion.context.sectionPages')}>
              {pages.length === 0 ? (
                <Text style={styles.muted}>
                  {t('companion.context.noPages')}
                </Text>
              ) : (
                pages.map(page => (
                  <PageRow
                    key={`${page.id}-${page.url}`}
                    page={page}
                    labels={labels}
                  />
                ))
              )}
            </Section>

            {(profile || context.unreadable.includes('profile')) && (
              <Section title={t('companion.context.sectionAccount')}>
                {profile?.kind === 'profile' ? (
                  profile.fields.map(field => (
                    <FieldRow
                      key={field.key}
                      label={t(`companion.context.field.${field.key}`)}
                      value={labels.fieldValue(field.key, field.value)}
                    />
                  ))
                ) : (
                  <Text style={styles.muted}>
                    {t('companion.context.profileUnreadable')}
                  </Text>
                )}
              </Section>
            )}

            {stated?.kind === 'conversation_detail' && (
              <Section title={t('companion.context.sectionConversation')}>
                {stated.fields.map(field => (
                  <FieldRow
                    key={field.key}
                    label={t(`companion.context.field.${field.key}`)}
                    value={labels.fieldValue(field.key, field.value)}
                  />
                ))}
              </Section>
            )}

            {(tasks.length > 0 || context.unreadable.includes('checklist')) && (
              <Section title={t('companion.context.sectionTasks')}>
                {tasks.length > 0 ? (
                  tasks.map(task => (
                    <View key={task.id} style={styles.taskRow}>
                      <Text style={styles.taskTitle}>
                        {task.title ?? t('companion.context.untitledTask')}
                      </Text>
                      <Text style={styles.taskState}>
                        {t(`companion.context.taskState.${task.state}`)}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.muted}>
                    {t('companion.context.checklistUnreadable')}
                  </Text>
                )}
              </Section>
            )}

            <Text style={styles.readOnlyNote}>
              {t('companion.context.readOnlyNote')}
            </Text>
          </ScrollView>
        </View>
      )}
    </BottomSheet>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole='header'>
        {title}
      </Text>
      {children}
    </View>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={styles.fieldRow}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

function PageRow({
  page,
  labels,
}: {
  page: GuidanceSource;
  labels: ReturnType<typeof useContextLabels>;
}) {
  const { t } = useTranslation();
  const status =
    page.status === 'checked' && page.checkedAt
      ? t('companion.context.pageChecked', {
          time: labels.time(page.checkedAt),
        })
      : page.status === 'excluded'
        ? t('companion.context.pageExcluded', { province: page.jurisdiction })
        : t('companion.context.pageFailed');
  const name = page.title ?? page.url;
  return (
    <View style={styles.page}>
      <Pressable
        onPress={() =>
          Linking.openURL(page.url).catch(err =>
            console.error('Failed to open URL:', err)
          )
        }
        accessibilityRole='link'
        accessibilityLabel={name}
        accessibilityHint={t('companion.openInBrowser')}
        style={({ pressed }) => [styles.pageLink, pressed && styles.pressed]}
      >
        <Text style={styles.pageTitle}>{name}</Text>
        <Ionicons name='open-outline' size={14} color={CONTEXT_LINK_COLOR} />
      </Pressable>
      <Text style={styles.publisher}>{page.publisher}</Text>
      <Text style={styles.url} selectable>
        {page.url}
      </Text>
      <View style={styles.statusRow}>
        {page.status !== 'checked' && (
          <Ionicons
            name='alert-circle-outline'
            size={14}
            color={Theme.textAlternateGray}
            style={styles.statusIcon}
          />
        )}
        <Text
          style={page.status === 'checked' ? styles.muted : styles.statusWarn}
        >
          {status}
        </Text>
      </View>
    </View>
  );
}

const BASE_SNAP_POINT = 0.8;
const SNAP_POINT_PER_FONT_SCALE = 0.1;
const MAX_SNAP_POINT = 0.92;

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    ...typography.section,
    color: Theme.black,
    flex: 1,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginEnd: -10,
  },
  content: {
    gap: 20,
    paddingTop: 4,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    ...typography.caption,
    fontWeight: '600',
    color: Theme.textAlternateGray,
  },
  muted: {
    ...typography.caption,
    color: Theme.textInput,
    flexShrink: 1,
  },
  page: {
    backgroundColor: Theme.surfaceEventCard,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },
  pageLink: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    minHeight: 44,
    paddingTop: 2,
  },
  pressed: {
    opacity: 0.6,
  },
  pageTitle: {
    ...typography.secondary,
    fontWeight: '600',
    color: CONTEXT_LINK_COLOR,
    flex: 1,
  },
  publisher: {
    ...typography.caption,
    color: Theme.secondaryBlack,
  },
  url: {
    ...typography.caption,
    color: Theme.textInput,
    // Addresses read left to right in every language.
    writingDirection: 'ltr',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statusIcon: {
    marginEnd: 4,
  },
  statusWarn: {
    ...typography.caption,
    color: Theme.textAlternateGray,
    flexShrink: 1,
  },
  fieldRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 8,
  },
  fieldLabel: {
    ...typography.secondary,
    color: Theme.textInput,
  },
  fieldValue: {
    ...typography.secondary,
    color: Theme.secondaryBlack,
    flexShrink: 1,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  taskTitle: {
    ...typography.secondary,
    color: Theme.secondaryBlack,
    flex: 1,
  },
  taskState: {
    ...typography.caption,
    color: Theme.textAlternateGray,
    backgroundColor: Theme.surfaceGray,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  readOnlyNote: {
    ...typography.caption,
    color: Theme.textInput,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.borderCard,
    paddingTop: 12,
  },
});
