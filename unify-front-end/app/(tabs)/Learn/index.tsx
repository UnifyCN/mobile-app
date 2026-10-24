import { typography } from '@/constants/Typography';
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useAnalytics } from '@/utils/analytics';
import { useLearnEvents } from '@/hooks/learn/useLearnEvents';
import LessonHeroCard from '../../../components/learn/LessonHeroCard';
import CarouselDots from '../../../components/learn/CarouselDots';
import SectionHeader from '../../../components/learn/SectionHeader';
import PathwayCard from '../../../components/learn/PathwayCard';
import { usePersonalizedModules } from '../../../hooks/learn/usePersonalizedModules';
import { useInProgressLessons } from '../../../hooks/progress/useInProgressLessons';
import {
  CurrentLessonSkeletonLoader,
  PathwayCardSkeletonLoader,
  CarouselDotsSkeletonLoader,
} from '../../../components/learn/learn-index-skeleton-loader';
import TabHeader from '@/components/home/HomeHeader';
import { useProgressCache } from '@/hooks/progress/useProgressCache';
import AnnouncementModal from '@/components/common/AnnouncementModal';
import SegmentedControl from '@/components/learn/Resources/SegmentedControl';
import ResourcesView from '@/components/learn/Resources/ResourcesView';
import { getTimeOfDayGreeting } from '@/utils/getTimeOfDayGreeting';
import { useCurrentUser } from '@/context/UserContext';
import { GiveawayBanner } from '@/components/giveaway/GiveawayBanner';

type LearnView = 'articles' | 'resources';

export default function Learn() {
  useProgressCache();
  const { trackScreen } = useAnalytics();
  const { onLearnHubFocused } = useLearnEvents();
  const { t } = useTranslation();
  const { currentUser } = useCurrentUser();
  const bucket = getTimeOfDayGreeting();
  const trimmedName = currentUser?.firstName?.trim();
  const greeting = trimmedName
    ? t(`learn.greeting.${bucket}`, { name: trimmedName })
    : t(`learn.greeting.${bucket}Anon`);
  const isFocused = useIsFocused();
  const [heroIndex, setHeroIndex] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const [view, setView] = React.useState<LearnView>('articles');
  const { width } = useWindowDimensions();
  const sliderRef = React.useRef<ScrollView>(null);

  const { modules, isLoading, error, refetch } = usePersonalizedModules();

  const {
    lessons: inProgressLessons,
    isLoading: lessonsLoading,
    error: lessonsError,
    refresh: refreshLessons,
  } = useInProgressLessons();

  const lastTrackedRef = React.useRef<number>(0);

  useFocusEffect(
    React.useCallback(() => {
      const now = Date.now();
      if (now - lastTrackedRef.current > 500) {
        trackScreen('Learn Screen');
        lastTrackedRef.current = now;
      }
    }, [trackScreen])
  );

  // The user left any submodule / lesson flow (learn start/complete events).
  useFocusEffect(
    React.useCallback(() => {
      onLearnHubFocused();
    }, [onLearnHubFocused])
  );

  const onMomentumEnd = (e: any) => {
    const x = e.nativeEvent?.contentOffset?.x ?? 0;
    const i = Math.round(x / width);
    if (i !== heroIndex && i < inProgressLessons.length) setHeroIndex(i);
  };

  const handleDotPress = (i: number) => {
    if (i < inProgressLessons.length) {
      setHeroIndex(i);
      sliderRef.current?.scrollTo({ x: i * width, animated: true });
    }
  };

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshLessons(), refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [refreshLessons, refetch]);

  // Split modules into four sections
  const inProgressModules =
    modules?.filter(m => m.progress === 'in_progress') ?? [];
  const recommendedModules =
    modules?.filter(m => m.progress === 'not_started' && m.score > 0) ?? [];
  const exploreModules =
    modules?.filter(m => m.progress === 'not_started' && m.score === 0) ?? [];
  const completedModules =
    modules?.filter(m => m.progress === 'completed') ?? [];
  const hasPersonalizedResults = recommendedModules.length > 0;

  return (
    <View style={styles.root}>
      <TabHeader variant='minimal' />
      <View style={styles.container}>
        <StatusBar style='dark' />
        <SegmentedControl<LearnView>
          value={view}
          onChange={setView}
          style={styles.segmentedControl}
          options={[
            { value: 'articles', label: t('learn.segment.lessons') },
            { value: 'resources', label: t('learn.segment.resources') },
          ]}
        />
        {view === 'resources' ? (
          <ResourcesView />
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl
                refreshing={isFocused && refreshing}
                onRefresh={onRefresh}
              />
            }
          >
            <GiveawayBanner />
            <Text style={styles.pageTitle}>{greeting}</Text>
            <Text style={styles.pageSubtitle}>{t('learn.subtitle')}</Text>

            {/* In-progress lesson carousel */}
            {lessonsLoading ? (
              <>
                <View style={[styles.heroWrapper, { width }]}>
                  <View
                    style={{
                      width,
                      paddingRight: 30,
                      paddingVertical: 10,
                      paddingLeft: 1,
                    }}
                  >
                    <CurrentLessonSkeletonLoader />
                  </View>
                </View>
                <CarouselDotsSkeletonLoader />
              </>
            ) : lessonsError ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>
                  {t('learn.errorLoadingLessons')}
                </Text>
              </View>
            ) : inProgressLessons.length > 0 ? (
              <>
                <View style={[styles.heroWrapper, { width }]}>
                  <ScrollView
                    ref={sliderRef}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    onMomentumScrollEnd={onMomentumEnd}
                  >
                    {inProgressLessons.map((lesson, i) => {
                      const module = modules?.find(
                        m => m._id === lesson.moduleId
                      );
                      const submoduleCount = module?.submodules?.length || 0;

                      return (
                        <View
                          key={lesson.id}
                          style={{
                            width,
                            paddingRight: 30,
                            paddingVertical: 10,
                            paddingLeft: 1,
                          }}
                        >
                          <LessonHeroCard
                            moduleTitle={lesson.moduleTitle}
                            submoduleTitle={lesson.submoduleTitle}
                            currentPage={lesson.currentPage || 1}
                            totalPages={lesson.totalPages || 8}
                            currentSection={lesson.currentSection || 1}
                            totalSections={lesson.totalSections || 1}
                            colorHex={module?.colorTheme?.hex}
                            icon={module?.icon}
                            href={lesson.href as any}
                          />
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
                <CarouselDots
                  total={inProgressLessons.length}
                  activeIndex={heroIndex}
                  onDotPress={handleDotPress}
                />
              </>
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  {t('learn.noLessonsToContinue')}
                </Text>
                <Text style={styles.emptySubtext}>
                  {t('learn.startLessonToSeeHere')}
                </Text>
              </View>
            )}

            {/* Continue Learning — in-progress modules */}
            {inProgressModules.length > 0 && (
              <>
                <SectionHeader
                  title={t('learn.continueLearning')}
                  style={{ marginTop: 15 }}
                />
                <View style={styles.pathwaysGrid}>
                  {inProgressModules.map((module, index) => {
                    const blobIndex = index % 5;
                    return (
                      <PathwayCard
                        key={module._id}
                        title={module.title}
                        modulesLabel={t('learn.sectionCount', {
                          count: module.submodules?.length || 0,
                        })}
                        href={
                          `/(tabs)/Learn/modules/${module._id}?blobIndex=${blobIndex}` as any
                        }
                        colorTheme={module.colorTheme?.hex}
                        icon={module.icon}
                        index={index}
                        moduleId={module._id}
                        progress={module.progress}
                      />
                    );
                  })}
                </View>
              </>
            )}

            {!isLoading && (
              <SectionHeader
                title={
                  hasPersonalizedResults
                    ? t('learn.recommendedForYou')
                    : t('learn.subjects')
                }
                style={{ marginTop: 15 }}
              />
            )}
            <View style={styles.pathwaysGrid}>
              {isLoading ? (
                <>
                  <PathwayCardSkeletonLoader />
                  <PathwayCardSkeletonLoader />
                </>
              ) : error ? (
                <Text style={styles.errorText}>
                  {t('learn.errorLoadingModules')}
                </Text>
              ) : (hasPersonalizedResults
                  ? recommendedModules
                  : (modules ?? []).filter(
                      m =>
                        m.progress !== 'in_progress' &&
                        m.progress !== 'completed'
                    )
                ).length > 0 ? (
                (hasPersonalizedResults
                  ? recommendedModules
                  : (modules ?? []).filter(
                      m =>
                        m.progress !== 'in_progress' &&
                        m.progress !== 'completed'
                    )
                ).map((module, index) => {
                  const offset = inProgressModules.length;
                  const blobIndex = (offset + index) % 5;
                  return (
                    <PathwayCard
                      key={module._id}
                      title={module.title}
                      modulesLabel={t('learn.sectionCount', {
                        count: module.submodules?.length || 0,
                      })}
                      href={
                        `/(tabs)/Learn/modules/${module._id}?blobIndex=${blobIndex}&whyTag=${encodeURIComponent(module.why_tag || '')}` as any
                      }
                      colorTheme={module.colorTheme?.hex}
                      icon={module.icon}
                      index={offset + index}
                      moduleId={module._id}
                      progress={module.progress}
                    />
                  );
                })
              ) : (
                <Text style={styles.errorText}>
                  {t('learn.noModulesAvailable')}
                </Text>
              )}
            </View>

            {/* Explore More — unscored + completed */}
            {hasPersonalizedResults && exploreModules.length > 0 && (
              <>
                <SectionHeader
                  title={t('learn.exploreMore')}
                  style={{ marginTop: 24 }}
                />
                <View style={styles.pathwaysGrid}>
                  {exploreModules.map((module, index) => {
                    const offset =
                      inProgressModules.length + recommendedModules.length;
                    const blobIndex = (offset + index) % 5;
                    return (
                      <PathwayCard
                        key={module._id}
                        title={module.title}
                        modulesLabel={t('learn.sectionCount', {
                          count: module.submodules?.length || 0,
                        })}
                        href={
                          `/(tabs)/Learn/modules/${module._id}?blobIndex=${blobIndex}` as any
                        }
                        colorTheme={module.colorTheme?.hex}
                        icon={module.icon}
                        index={offset + index}
                        moduleId={module._id}
                        progress={module.progress}
                      />
                    );
                  })}
                </View>
              </>
            )}

            {completedModules.length > 0 && (
              <>
                <SectionHeader
                  title={t('common.completed')}
                  style={{ marginTop: 24 }}
                />
                <View style={styles.pathwaysGrid}>
                  {completedModules.map((module, index) => {
                    const offset =
                      inProgressModules.length +
                      recommendedModules.length +
                      exploreModules.length;
                    const blobIndex = (offset + index) % 5;
                    return (
                      <PathwayCard
                        key={module._id}
                        title={module.title}
                        modulesLabel={t('learn.sectionCount', {
                          count: module.submodules?.length || 0,
                        })}
                        href={
                          `/(tabs)/Learn/modules/${module._id}?blobIndex=${blobIndex}` as any
                        }
                        colorTheme={module.colorTheme?.hex}
                        icon={module.icon}
                        index={offset + index}
                        moduleId={module._id}
                        progress={module.progress}
                      />
                    );
                  })}
                </View>
              </>
            )}
          </ScrollView>
        )}
      </View>
      <AnnouncementModal
        storageKey='announcement.learnHighlights.v1'
        title={t('learn.announcementTitle')}
        body={t('learn.announcementBody')}
        buttonLabel={t('common.gotIt')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1, backgroundColor: '#fff' },
  // Gutter matches the 16pt body padding shared by both views under it.
  segmentedControl: { marginTop: 16, marginHorizontal: 16, marginBottom: 12 },
  scrollContent: { padding: 16, paddingBottom: 100 },
  pageTitle: {
    ...typography.title,

    color: '#000',
    marginBottom: 8,
  },
  pageSubtitle: {
    ...typography.body,

    color: '#000',
    marginBottom: 10,
  },
  heroWrapper: { marginTop: 8 },
  pathwaysGrid: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  errorText: {
    color: '#FF3B30',
    textAlign: 'center',
    marginTop: 20,
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginHorizontal: 20,
  },
  emptyText: {
    ...typography.section,

    color: '#575757',
    marginBottom: 8,
  },
  emptySubtext: {
    ...typography.secondary,

    color: '#62605B',
  },
});
