import { typography } from '@/constants/Typography';
import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Feather } from '@expo/vector-icons';
import BackHeader from '@/components/BackHeader';
import { useSavedLessonPages } from '@/hooks/learn/useSavedLessonPages';
import type { SavedLessonPageRow } from '@/services/learn/lessonPageSaves';
import { useSanityModules } from '@/hooks/sanity/useSanityModules';
import EmptyFeedMessage from '@/components/profile/EmptyFeedMessage';
import { Theme } from '@/constants/Theme';
import { formatRelativeTime } from '@/helpers/dateHelpers';
import { useAllHighlights } from '@/hooks/highlights/useHighlights';
import { Highlight } from '@/services/highlights/highlightService';

const DEFAULT_COLOR = '#F0F0F0';
const DEFAULT_ACCENT = Theme.textInput;

// Same icon map used by LessonHeroCard / PathwayCard
const mapIconName = (iconName: string): string => {
  const iconMap: Record<string, string> = {
    account_balance: 'bank-outline',
    assignment_ind: 'account-tie-outline',
    cottage: 'home-outline',
    article: 'file-document-outline',
    passport: 'passport',
    school: 'school-outline',
    book: 'book-outline',
    work: 'briefcase-outline',
    computer: 'laptop-outline',
    business: 'office-building-outline',
    science: 'flask-outline',
    language: 'translate',
    history: 'clock-time-four-outline',
    psychology: 'brain',
    menu_book: 'book-open-page-variant',
    auto_stories: 'book-open-outline',
    calculate: 'calculator',
    palette: 'palette-outline',
    music_note: 'music-note-outline',
    sports_esports: 'gamepad-variant-outline',
  };
  return iconMap[iconName] || 'book-outline';
};

interface UnifiedSection {
  key: string;
  submoduleTitle: string;
  moduleId: string;
  pages: SavedLessonPageRow[];
  highlights: Highlight[];
  latestDate: string;
}

interface SavedLessonCardProps {
  item: SavedLessonPageRow;
  accentColor: string;
  iconName: string;
  moduleTitle: string;
  onPress: () => void;
}

const SavedLessonCard = React.memo(function SavedLessonCard({
  item,
  accentColor,
  iconName,
  moduleTitle,
  onPress,
}: SavedLessonCardProps) {
  const pageTitle = item.pageTitleSnapshot?.trim() || `Page ${item.pageNumber}`;
  const lessonTitle = item.lessonTitleSnapshot?.trim() || 'Lesson';
  const timeAgo = formatRelativeTime(item.createdAt);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole='button'
      accessibilityLabel={`${pageTitle} from ${lessonTitle}`}
    >
      {/* Colored accent bar */}
      <View style={[styles.accentBar, { backgroundColor: accentColor }]} />

      <View style={styles.cardContent}>
        {/* Icon */}
        <View
          style={[styles.iconCircle, { backgroundColor: accentColor + '18' }]}
        >
          <MaterialCommunityIcons
            name={iconName as any}
            size={22}
            color={accentColor}
          />
        </View>

        {/* Text content */}
        <View style={styles.textContent}>
          <Text style={styles.moduleLabel} numberOfLines={1}>
            {moduleTitle}
          </Text>
          <Text style={styles.pageTitle} numberOfLines={2}>
            {pageTitle}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.lessonTitle} numberOfLines={1}>
              {lessonTitle}
            </Text>
            <Text style={styles.dotSeparator}>·</Text>
            <Text style={styles.timeAgo}>{timeAgo}</Text>
          </View>
        </View>

        {/* Chevron */}
        <Feather
          name='chevron-right'
          size={18}
          color={Theme.textInactiveTab}
          style={styles.chevron}
        />
      </View>
    </Pressable>
  );
});

const HighlightItem = React.memo(function HighlightItem({
  highlight,
  onNavigate,
}: {
  highlight: Highlight;
  onNavigate: (h: Highlight) => void;
}) {
  const canNavigate =
    highlight.module_id != null &&
    highlight.submodule_id != null &&
    highlight.page_num != null;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.highlightItem,
        pressed && styles.highlightItemPressed,
      ]}
      onPress={() => onNavigate(highlight)}
      disabled={!canNavigate}
    >
      <View style={styles.highlightBar} />
      <Text style={styles.highlightText} numberOfLines={3}>
        "{highlight.selected_text}"
      </Text>
      {canNavigate && (
        <Feather
          name='chevron-right'
          size={16}
          color='#9CA3AF'
          style={styles.highlightChevron}
        />
      )}
    </Pressable>
  );
});

export default function SavedLessonsPage() {
  const router = useRouter();
  const { t } = useTranslation();

  const {
    data: pagesData,
    isLoading: isPagesLoading,
    isRefetching: isPagesRefetching,
    refetch: refetchPages,
    error: pagesError,
  } = useSavedLessonPages();

  const {
    data: highlightsData,
    isLoading: isHighlightsLoading,
    isRefetching: isHighlightsRefetching,
    refetch: refetchHighlights,
  } = useAllHighlights();

  const { data: modules } = useSanityModules();

  // Build lookups: moduleId → { color, icon, title } and submoduleId → submodule title
  const { moduleMap, submoduleTitleMap } = useMemo(() => {
    const mMap: Record<string, { color: string; icon: string; title: string }> =
      {};
    const sMap: Record<string, string> = {};
    if (modules) {
      for (const m of modules) {
        mMap[m._id] = {
          color: m.colorTheme?.hex || DEFAULT_ACCENT,
          icon: m.icon || 'book',
          title: m.title,
        };
        if (m.submodules) {
          for (const s of m.submodules) {
            if (s._id && s.title) {
              sMap[s._id] = s.title;
            }
          }
        }
      }
    }
    return { moduleMap: mMap, submoduleTitleMap: sMap };
  }, [modules]);

  const openLessonPage = useCallback(
    (item: SavedLessonPageRow) => {
      router.push({
        pathname:
          '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/lessons/[lessonId]/pages/[pageNum]' as any,
        params: {
          moduleId: item.moduleId,
          submoduleId: item.submoduleId,
          lessonId: item.lessonId,
          pageNum: String(item.pageNumber),
        },
      });
    },
    [router]
  );

  const navigateToHighlight = useCallback(
    (h: Highlight) => {
      if (h.module_id == null || h.submodule_id == null || h.page_num == null)
        return;
      router.push({
        pathname:
          '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/lessons/[lessonId]/pages/[pageNum]' as any,
        params: {
          moduleId: h.module_id,
          submoduleId: h.submodule_id,
          lessonId: h.lesson_id,
          pageNum: h.page_num.toString(),
        },
      });
    },
    [router]
  );

  // Group pages and highlights by submodule, merge, and sort
  const sections = useMemo((): UnifiedSection[] => {
    const pages = pagesData ?? [];
    const highlights = highlightsData ?? [];

    const sectionMap: Record<string, UnifiedSection> = {};

    for (const page of pages) {
      const key = page.submoduleId;
      if (!sectionMap[key]) {
        sectionMap[key] = {
          key,
          submoduleTitle: '',
          moduleId: page.moduleId,
          pages: [],
          highlights: [],
          latestDate: page.createdAt,
        };
      }
      sectionMap[key].pages.push(page);
      if (page.createdAt > sectionMap[key].latestDate) {
        sectionMap[key].latestDate = page.createdAt;
      }
    }

    for (const h of highlights) {
      const key = h.submodule_id || h.lesson_id;
      if (!sectionMap[key]) {
        sectionMap[key] = {
          key,
          submoduleTitle: h.submodule_title || '',
          moduleId: h.module_id || '',
          pages: [],
          highlights: [],
          latestDate: h.created_at,
        };
      } else {
        // Fill in submoduleTitle if we got it from the highlight
        if (!sectionMap[key].submoduleTitle && h.submodule_title) {
          sectionMap[key].submoduleTitle = h.submodule_title;
        }
      }
      sectionMap[key].highlights.push(h);
      if (h.created_at > sectionMap[key].latestDate) {
        sectionMap[key].latestDate = h.created_at;
      }
    }

    return Object.values(sectionMap)
      .map(section => ({
        ...section,
        pages: [...section.pages].sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt)
        ),
        highlights: [...section.highlights].sort((a, b) =>
          b.created_at.localeCompare(a.created_at)
        ),
      }))
      .sort((a, b) => b.latestDate.localeCompare(a.latestDate));
  }, [pagesData, highlightsData]);

  const totalItems = useMemo(
    () =>
      sections.reduce(
        (sum, s) => sum + s.pages.length + s.highlights.length,
        0
      ),
    [sections]
  );

  const isLoadingAll =
    (isPagesLoading && !pagesData) || (isHighlightsLoading && !highlightsData);
  const isRefetchingAny = isPagesRefetching || isHighlightsRefetching;

  const handleRefresh = useCallback(() => {
    refetchPages();
    refetchHighlights();
  }, [refetchPages, refetchHighlights]);

  const renderSection = useCallback(
    ({ item: section }: { item: UnifiedSection }) => {
      const mod = moduleMap[section.moduleId];
      const accentColor = mod?.color || DEFAULT_ACCENT;
      const iconName = mapIconName(mod?.icon || 'book');
      const moduleTitle = mod?.title || 'Lesson';
      const hasBoth = section.pages.length > 0 && section.highlights.length > 0;
      const itemCount = section.pages.length + section.highlights.length;

      // Resolve submodule title: prefer Sanity source-of-truth, fall back to DB snapshot
      const displayTitle =
        submoduleTitleMap[section.key] ||
        section.submoduleTitle ||
        (section.pages[0]?.lessonTitleSnapshot ?? moduleTitle);

      return (
        <View style={styles.sectionCard}>
          {/* Accent top border */}
          <View
            style={[styles.sectionAccentBar, { backgroundColor: accentColor }]}
          />

          {/* Section header */}
          <View style={styles.sectionHeader}>
            <View
              style={[
                styles.sectionIconCircle,
                { backgroundColor: accentColor + '20' },
              ]}
            >
              <MaterialCommunityIcons
                name={iconName as any}
                size={18}
                color={accentColor}
              />
            </View>
            <Text style={styles.sectionTitle} numberOfLines={2}>
              {displayTitle}
            </Text>
            <View
              style={[
                styles.sectionCountBadge,
                { backgroundColor: accentColor + '18' },
              ]}
            >
              <Text style={[styles.sectionCount, { color: accentColor }]}>
                {itemCount}
              </Text>
            </View>
          </View>

          {/* Pages */}
          {section.pages.length > 0 && (
            <>
              {hasBoth && (
                <Text style={styles.subHeader}>
                  {t('savedLessons.savedPages')}
                </Text>
              )}
              {section.pages.map(page => (
                <SavedLessonCard
                  key={page.id}
                  item={page}
                  accentColor={accentColor}
                  iconName={iconName}
                  moduleTitle={moduleTitle}
                  onPress={() => openLessonPage(page)}
                />
              ))}
            </>
          )}

          {/* Highlights */}
          {section.highlights.length > 0 && (
            <>
              {hasBoth && (
                <Text style={styles.subHeader}>
                  {t('savedLessons.highlights')}
                </Text>
              )}
              {section.highlights.map(h => (
                <HighlightItem
                  key={h.id}
                  highlight={h}
                  onNavigate={navigateToHighlight}
                />
              ))}
            </>
          )}
        </View>
      );
    },
    [moduleMap, submoduleTitleMap, openLessonPage, navigateToHighlight, t]
  );

  const keyExtractor = useCallback((item: UnifiedSection) => item.key, []);

  if (isLoadingAll) {
    return (
      <View style={styles.container}>
        <BackHeader title={t('savedLessons.title')} />
        <View style={styles.centered}>
          <ActivityIndicator size='large' color={Theme.black} />
        </View>
      </View>
    );
  }

  if (pagesError && !pagesData && !highlightsData) {
    return (
      <View style={styles.container}>
        <BackHeader title={t('savedLessons.title')} />
        <View style={styles.centered}>
          <Text style={styles.errorText}>
            {t('savedLessons.errorLoadingContent')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BackHeader title={t('savedLessons.title')} />
      {totalItems > 0 && (
        <Text style={styles.countLabel}>
          {t('savedLessons.savedCount', { count: totalItems })}
        </Text>
      )}
      <FlatList
        data={sections}
        keyExtractor={keyExtractor}
        renderItem={renderSection}
        contentContainerStyle={
          sections.length === 0 ? styles.emptyListContent : styles.listContent
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefetchingAny}
            onRefresh={handleRefresh}
          />
        }
        ListEmptyComponent={
          <EmptyFeedMessage
            icon={
              <Feather name='book-open' size={27} color={Theme.textInput} />
            }
            message={t('savedLessons.emptyTitle')}
            submessage={
              <Text style={styles.emptyMessageSubtext}>
                {t('savedLessons.emptyHint')}
              </Text>
            }
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  countLabel: {
    ...typography.caption,
    color: Theme.textInput,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 16,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    ...typography.secondary,
    color: Theme.textInput,
    textAlign: 'center',
  },

  // Section card
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EBEBEB',
    overflow: 'hidden',
    gap: 0,
  },
  sectionAccentBar: {
    height: 4,
    width: '100%',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  sectionIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    ...typography.secondary,
    flex: 1,
    color: Theme.black,
    fontWeight: '700',
  },
  sectionCountBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 24,
    alignItems: 'center',
  },
  sectionCount: { ...typography.caption, fontWeight: '700' },
  subHeader: {
    ...typography.caption,
    color: Theme.textInactiveTab,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginHorizontal: 14,
    marginTop: 4,
    marginBottom: 6,
    fontWeight: '700',
  },

  // Highlight item
  highlightItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginBottom: 8,
    backgroundColor: '#FAFAFA',
    borderRadius: 10,
    paddingVertical: 10,
    paddingRight: 10,
    gap: 10,
  },
  highlightItemPressed: {
    backgroundColor: '#F0F0F0',
  },
  highlightBar: {
    width: 3,
    alignSelf: 'stretch',
    backgroundColor: '#FCD34D',
    borderRadius: 2,
    marginLeft: 10,
  },
  highlightText: {
    ...typography.caption,
    flex: 1,
    color: Theme.black,
    fontStyle: 'italic',
  },
  highlightChevron: {
    flexShrink: 0,
  },

  // Card (kept exactly as before)
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 0,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    overflow: 'hidden',
  },
  cardPressed: {
    backgroundColor: '#F8F8F8',
  },
  accentBar: {
    width: 4,
  },
  cardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingLeft: 12,
    paddingRight: 14,
    gap: 12,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContent: {
    flex: 1,
  },
  moduleLabel: {
    ...typography.caption,
    color: Theme.textInput,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
    fontWeight: '600',
  },
  pageTitle: {
    ...typography.secondary,
    color: Theme.black,
    marginBottom: 3,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lessonTitle: { ...typography.caption, color: Theme.textInput, flexShrink: 1 },
  dotSeparator: {
    ...typography.caption,
    color: Theme.textInactiveTab,
    marginHorizontal: 5,
  },
  timeAgo: { ...typography.caption, color: Theme.textInactiveTab },
  chevron: {
    marginLeft: 4,
  },

  emptyMessageSubtext: {
    ...typography.secondary,
    color: Theme.textInput,
    textAlign: 'center',
  },
});
