import { useLearnEvents } from '@/hooks/learn/useLearnEvents';
import TabHeader from '@/components/home/HomeHeader';
import CategorySymbol, {
  categorySymbol,
} from '@/components/learn/CategorySymbol';
import {
  learnStyles as ui,
  LearnBack,
  LearnProgress,
} from '@/components/learn/LearnPrimitives';
import React, {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import {
  useRouter,
  useLocalSearchParams,
  Link,
  useFocusEffect,
} from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSanityModuleWithSubmodules } from '@/hooks/sanity/useSanityModules';
import { cachedProgressService } from '@/services/progress/cachedProgressService';
import {
  upsertModuleProgress,
  getModuleProgressStatus,
} from '@/services/learn/moduleProgressService';
import { Feather } from '@expo/vector-icons';
import { ModuleIndexSkeletonLoader } from '@/components/learn/module-index-skeleton-loader';
import { useTranslation } from 'react-i18next';
import { useAnalytics } from '@/utils/analytics';
import { isImmigrationModule } from '@/constants/PartnerSpotlight';
import SpotlightRow from '@/components/partners/SpotlightRow';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

type SectionUIState = 'completed' | 'active' | 'unlocked' | 'locked';

interface SectionViewModel {
  id: string;
  title: string;
  uiState: SectionUIState;
  ctaKey: 'common.review' | 'common.continue' | 'common.start' | null;
  progressPercent: number;
  isCompleted: boolean;
  unlocked: boolean;
}

export default function ModuleIndex() {
  const router = useRouter();
  const { t } = useTranslation();
  const { trackScreen, trackModuleViewed } = useAnalytics();
  const { onLearnHubFocused } = useLearnEvents();
  useFocusEffect(
    useCallback(() => {
      onLearnHubFocused();
    }, [onLearnHubFocused])
  );
  const { moduleId, whyTag } = useLocalSearchParams<{
    moduleId: string;
    blobIndex?: string;
    whyTag?: string;
    highlightSubmoduleId?: string;
  }>();

  // U2: Strip whitespace and require non-empty content before we render the
  // "Why this?" banner — otherwise an empty or whitespace-only personalization
  // tag rendered an empty pill.
  // `decodeURIComponent` throws URIError on malformed percent-sequences
  // (e.g. a lone `%`), and `whyTag` arrives from URL params / deep links we
  // don't fully control. Guard it so a bad value yields an empty banner
  // instead of crashing the module screen on render.
  const decodedWhyTag = useMemo(() => {
    if (!whyTag) return '';
    try {
      return decodeURIComponent(whyTag).trim();
    } catch {
      return '';
    }
  }, [whyTag]);
  const {
    data: moduleData,
    isLoading,
    error,
  } = useSanityModuleWithSubmodules(moduleId || '');

  // Progress tracking
  const [submoduleProgresses, setSubmoduleProgresses] = useState<{
    [key: string]: any;
  }>({});
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load one progress snapshot per focus instead of one request per row.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const submodules = moduleData?.submodules;
      if (!submodules) {
        setIsRefreshing(false);
        return;
      }
      setIsRefreshing(true);
      void cachedProgressService
        .getProgressData()
        .then(data => {
          if (cancelled) return;
          const progressData: typeof submoduleProgresses = {};
          for (const submodule of submodules) {
            progressData[submodule._id] = data[moduleId || '']?.[
              submodule._id
            ] ?? {
              is_completed: false,
              progress_percent: 0,
              completed_lessons: 0,
              total_lessons: submodule.lessons?.length ?? 0,
            };
          }
          setSubmoduleProgresses(progressData);
        })
        .catch(error => {
          console.error('Error refreshing progress:', error);
        })
        .finally(() => {
          if (!cancelled) setIsRefreshing(false);
        });
      return () => {
        cancelled = true;
      };
    }, [moduleId, moduleData?.submodules])
  );

  const queryClient = useQueryClient();

  // ── learn_progress: write in_progress when module first loads ───────────────
  // Guard: don't downgrade a completed module back to in_progress
  const hasWrittenInProgressRef = useRef(false);
  useEffect(() => {
    if (!moduleId || hasWrittenInProgressRef.current) return;
    if (isLoading) return;

    hasWrittenInProgressRef.current = true;

    // Check current status before writing — don't downgrade completed
    getModuleProgressStatus(moduleId).then(currentStatus => {
      if (currentStatus === 'completed') return;
      upsertModuleProgress(moduleId, 'in_progress').then(() => {
        queryClient.invalidateQueries({ queryKey: ['personalize', 'learn'] });
      });
    });
  }, [moduleId, isLoading, queryClient]);

  // ── learn_progress: write completed when all submodules are finished ─────────
  const hasWrittenCompletedRef = useRef(false);
  useEffect(() => {
    if (hasWrittenCompletedRef.current) return;
    if (!moduleId || !moduleData?.submodules?.length) return;
    if (Object.keys(submoduleProgresses).length === 0) return;

    const allDone =
      moduleData.submodules.length > 0 &&
      moduleData.submodules.every(
        s => submoduleProgresses[s._id]?.is_completed === true
      );

    if (allDone) {
      hasWrittenCompletedRef.current = true;
      upsertModuleProgress(moduleId, 'completed').then(() => {
        queryClient.invalidateQueries({ queryKey: ['personalize', 'learn'] });
      });
    }
  }, [moduleId, moduleData?.submodules, submoduleProgresses, queryClient]);

  // Track module view
  const moduleTitle = moduleData?.title;
  const submoduleCount = moduleData?.submodules?.length || 0;
  const lastTrackedRef = useRef<number>(0);

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (moduleTitle && moduleId && now - lastTrackedRef.current > 500) {
        trackScreen(`Module: ${moduleTitle}`);
        trackModuleViewed(moduleId, moduleTitle, submoduleCount);
        lastTrackedRef.current = now;
      }
    }, [moduleTitle, submoduleCount, moduleId, trackScreen, trackModuleViewed])
  );

  // Build section view models with explicit UI states
  const sections: SectionViewModel[] = useMemo(() => {
    if (!moduleData?.submodules) return [];

    return moduleData.submodules.map((s, i) => {
      const progress = submoduleProgresses[s._id];
      const isCompleted = progress?.is_completed || false;
      // Coerce/clamp progressPercent to ensure it's a valid number in 0-100 range
      const raw = progress?.progress_percent;
      const n = typeof raw === 'number' ? raw : Number(raw);
      const progressPercent = Number.isFinite(n)
        ? Math.max(0, Math.min(100, n))
        : 0;
      // All sections are now unlocked at all times
      const unlocked = true;

      // Determine UI state
      let uiState: SectionUIState;
      let ctaKey: 'common.review' | 'common.continue' | 'common.start' | null;

      if (isCompleted) {
        uiState = 'completed';
        ctaKey = 'common.review';
      } else if (unlocked && progressPercent > 0) {
        uiState = 'active';
        ctaKey = 'common.continue';
      } else if (unlocked) {
        uiState = 'unlocked';
        ctaKey = 'common.start';
      } else {
        uiState = 'locked';
        ctaKey = null;
      }

      return {
        id: s._id,
        title: s.title,
        uiState,
        ctaKey,
        progressPercent,
        isCompleted,
        unlocked,
      };
    });
  }, [moduleData?.submodules, submoduleProgresses]);

  // Navigate to submodule index when user taps Start / Continue / Review
  const navigateToSection = async (section: SectionViewModel) => {
    try {
      if (!section?.id || !moduleId) {
        console.error('[ModuleIndex] Missing required params for navigation');
        return;
      }
      router.push({
        pathname: '/(tabs)/Learn/modules/[moduleId]/[submoduleId]' as any,
        params: { moduleId, submoduleId: section.id },
      });
    } catch (navError: any) {
      console.error('[ModuleIndex] Error navigating to section:', navError);
      try {
        router.replace('/(tabs)/Learn');
      } catch (fallbackError: any) {
        console.error(
          '[ModuleIndex] Error in fallback navigation:',
          fallbackError
        );
      }
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────────

  const renderSectionCard = (section: SectionViewModel, index: number) => {
    const progress = submoduleProgresses[section.id];
    const lessonCount = moduleData?.submodules?.[index]?.lessons?.length ?? 0;
    const completedLessons = Math.min(
      lessonCount,
      progress?.completed_lessons ?? 0
    );
    const displayPercent =
      lessonCount > 0 ? Math.round((completedLessons / lessonCount) * 100) : 0;
    return (
      <TouchableOpacity
        key={section.id}
        accessibilityLabel={`${section.title}. ${t('learn.home.lessonSummary', { count: lessonCount, done: completedLessons })}. ${displayPercent}%`}
        accessibilityRole='button'
        onPress={() => navigateToSection(section)}
        style={ui.card}
        activeOpacity={0.65}
      >
        <View style={ui.row}>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              backgroundColor: categorySymbol(moduleId, moduleData?.icon)
                .foreground,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 16 }}>
              {index + 1}
            </Text>
          </View>
          <View style={ui.grow}>
            <Text style={ui.rowTitle}>{section.title}</Text>
            <Text style={ui.meta}>
              {t('learn.home.lessonSummary', {
                count: lessonCount,
                done: Math.min(lessonCount, progress?.completed_lessons ?? 0),
              })}
            </Text>
          </View>
          <Feather name='chevron-right' size={18} color='#999' />
        </View>
        <View style={ui.row}>
          <LearnProgress
            value={displayPercent}
            label={section.title}
            color={categorySymbol(moduleId, moduleData?.icon).foreground}
          />
          <Text style={ui.meta}>{displayPercent}%</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Loading / Error states
  // ─────────────────────────────────────────────────────────────────────────────
  if (isLoading || isRefreshing) {
    return <ModuleIndexSkeletonLoader />;
  }

  if (error || !moduleData) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>
          {t('common.errorLoadingModule', {
            message: error?.message || t('common.unknownError'),
          })}
        </Text>
        <Link href='/(tabs)/Learn'>{t('common.goBackToLearn')}</Link>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <View style={ui.screen}>
      <TabHeader variant='minimal' />
      <ScrollView
        contentContainerStyle={ui.content}
        showsVerticalScrollIndicator={false}
      >
        <LearnBack
          title={t('learn.home.tabLabel')}
          onPress={() => router.replace('/(tabs)/Learn')}
        />
        <View style={ui.row}>
          <CategorySymbol
            moduleId={moduleId}
            icon={moduleData.icon}
            size={56}
          />
          <Text style={[ui.title, { flex: 1 }]}>{moduleData.title.trim()}</Text>
        </View>
        {moduleData.description ? (
          <Text style={ui.subtitle}>{moduleData.description}</Text>
        ) : null}
        {decodedWhyTag ? <Text style={ui.meta}>{decodedWhyTag}</Text> : null}
        <Text style={ui.heading}>{t('learn.home.modules')}</Text>
        {sections.map(renderSectionCard)}
        {isImmigrationModule(moduleId) && (
          <SpotlightRow variant='inline' source='learn_module' />
        )}
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 16,
    backgroundColor: '#FFFFFF',
  },
  errorText: { fontSize: 16, color: '#686464' },
});
