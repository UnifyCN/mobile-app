import { typography } from '@/constants/Typography';
import { useLearnEvents } from '@/hooks/learn/useLearnEvents';
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter, Href } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { useAnalytics } from '@/utils/analytics';
import { usePersonalizedModules } from '@/hooks/learn/usePersonalizedModules';
import { useInProgressLessons } from '@/hooks/progress/useInProgressLessons';
import TabHeader from '@/components/home/HomeHeader';
import { useProgressCache } from '@/hooks/progress/useProgressCache';
import AnnouncementModal from '@/components/common/AnnouncementModal';
import BottomSheet from '@/components/common/BottomSheet';
import SegmentedControl from '@/components/learn/Resources/SegmentedControl';
import ResourcesView from '@/components/learn/Resources/ResourcesView';
import { GiveawayBanner } from '@/components/giveaway/GiveawayBanner';
import CategorySymbol from '@/components/learn/CategorySymbol';
import { RESOURCE_THEME } from '@/constants/ResourceTheme';
import {
  learnStyles as s,
  ResumeRow,
} from '@/components/learn/LearnPrimitives';

const COURSE_FILTERS = ['all', 'started'] as const;

type LearnView = 'articles' | 'resources';

export default function Learn() {
  useProgressCache();
  const { trackScreen, trackModuleCardClicked } = useAnalytics();
  const { onLearnHubFocused } = useLearnEvents();
  useFocusEffect(
    React.useCallback(() => {
      onLearnHubFocused();
    }, [onLearnHubFocused])
  );
  const { t } = useTranslation();
  const router = useRouter();
  const isFocused = useIsFocused();
  const [refreshing, setRefreshing] = React.useState(false);
  const [view, setView] = React.useState<LearnView>('articles');
  const [filter, setFilter] = React.useState<'all' | 'started'>('all');
  const [showMore, setShowMore] = React.useState(false);
  const { modules, isLoading, error, refetch } = usePersonalizedModules();
  const {
    lessons,
    isLoading: lessonsLoading,
    error: lessonsError,
    refresh,
  } = useInProgressLessons();
  const lastTrackedRef = React.useRef(0);
  useFocusEffect(
    React.useCallback(() => {
      const now = Date.now();
      if (now - lastTrackedRef.current > 500) {
        trackScreen('Learn Screen');
        lastTrackedRef.current = now;
      }
    }, [trackScreen])
  );
  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, refetch]);
  const courses = (modules ?? []).filter(
    m => filter === 'all' || m.progress !== 'not_started'
  );
  const resume = (lesson: (typeof lessons)[number]) => (
    <ResumeRow
      key={lesson.id}
      isNext={lesson.isNext}
      title={lesson.title}
      subtitle={`${lesson.moduleTitle} · ${lesson.submoduleTitle}`}
      moduleId={lesson.moduleId}
      icon={modules?.find(m => m._id === lesson.moduleId)?.icon}
      onPress={() => {
        setShowMore(false);
        router.push(lesson.href as Href);
      }}
    />
  );
  return (
    <View style={s.screen}>
      <TabHeader variant='minimal' />
      <StatusBar style='dark' />
      <SegmentedControl<LearnView>
        value={view}
        onChange={setView}
        style={{ marginHorizontal: 16, marginVertical: 12 }}
        options={[
          { value: 'articles', label: t('learn.home.tabLabel') },
          { value: 'resources', label: t('learn.segment.resources') },
        ]}
      />
      {view === 'resources' ? (
        <ResourcesView />
      ) : (
        <ScrollView
          contentContainerStyle={s.content}
          refreshControl={
            <RefreshControl
              refreshing={isFocused && refreshing}
              onRefresh={onRefresh}
            />
          }
        >
          <GiveawayBanner />
          <View style={{ gap: 8 }}>
            <Text
              accessibilityRole='header'
              style={{
                ...typography.title,
                color: RESOURCE_THEME.textHeading,
              }}
            >
              {t('learn.home.heading')}
            </Text>
            <Text
              style={{
                ...typography.body,
                color: RESOURCE_THEME.textSubtitle,
              }}
            >
              {t('learn.home.subtitle')}
            </Text>
          </View>
          {lessonsLoading ? (
            <ActivityIndicator accessibilityLabel={t('common.loading')} />
          ) : lessonsError ? (
            <Pressable accessibilityRole='button' onPress={refresh}>
              <Text style={s.meta}>
                {t('learn.errorLoadingLessons')} {t('common.tryAgain')}
              </Text>
            </Pressable>
          ) : lessons[0] ? (
            <View style={{ gap: 4 }}>
              {resume(lessons[0])}
              {lessons.length > 1 && (
                <Pressable
                  onPress={() => setShowMore(true)}
                  accessibilityRole='button'
                  style={{ minHeight: 44, justifyContent: 'center' }}
                >
                  <Text style={[s.meta, { color: '#2C4976' }]}>
                    {t('learn.home.moreLessons')}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : null}
          <View
            style={[
              s.row,
              {
                justifyContent: 'space-between',
                borderBottomWidth: 1.5,
                borderBottomColor: '#E6E4DF',
              },
            ]}
          >
            <Text
              style={{
                ...typography.section,
                color: '#191919',
              }}
            >
              {t('learn.home.courses')}
            </Text>
            <View style={[s.row, { gap: 4 }]}>
              {COURSE_FILTERS.map(value => (
                <Pressable
                  key={value}
                  accessibilityRole='button'
                  accessibilityState={{ selected: filter === value }}
                  onPress={() => setFilter(value)}
                  style={({ pressed }) => [
                    {
                      minHeight: 44,
                      minWidth: 44,
                      paddingHorizontal: 4,
                      justifyContent: 'center',
                      alignItems: 'center',
                    },
                    pressed && s.pressed,
                  ]}
                >
                  <Text
                    style={[
                      s.meta,
                      {
                        ...typography.secondary,
                        color: value === filter ? '#181818' : '#62605B',
                        fontWeight: value === filter ? '500' : '400',
                      },
                    ]}
                  >
                    {t(`learn.home.${value}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          {isLoading ? (
            <ActivityIndicator accessibilityLabel={t('common.loading')} />
          ) : error ? (
            <Pressable accessibilityRole='button' onPress={refetch}>
              <Text style={s.meta}>
                {t('learn.errorLoadingModules')} {t('common.tryAgain')}
              </Text>
            </Pressable>
          ) : courses.length === 0 ? (
            <Text style={s.meta}>
              {t(
                filter === 'started'
                  ? 'learn.home.emptyStarted'
                  : 'learn.noModulesAvailable'
              )}
            </Text>
          ) : (
            <View style={{ gap: 14 }}>
              {courses.map(module => (
                <Pressable
                  key={module._id}
                  accessibilityLabel={`${module.title}. ${t('learn.home.moduleCount', { count: module.submodules?.length ?? 0 })}. ${module.progress === 'completed' ? t('learn.pathwayCard.done') : module.progress === 'in_progress' ? t('learn.home.started') : ''}`}
                  accessibilityRole='button'
                  onPress={() => {
                    trackModuleCardClicked(module._id, module.title);
                    router.push({
                      pathname: '/(tabs)/Learn/modules/[moduleId]',
                      params: {
                        moduleId: module._id,
                        whyTag: module.why_tag || '',
                      },
                    });
                  }}
                  style={({ pressed }) => [s.card, s.row, pressed && s.pressed]}
                >
                  <CategorySymbol moduleId={module._id} icon={module.icon} />
                  <View style={s.grow}>
                    <Text style={s.rowTitle}>{module.title.trim()}</Text>
                    <Text style={s.meta}>
                      {t('learn.home.moduleCount', {
                        count: module.submodules?.length ?? 0,
                      })}
                    </Text>
                  </View>
                  {module.progress !== 'not_started' && (
                    <Text style={[s.meta, { maxWidth: 75, color: '#2C4976' }]}>
                      {t(
                        module.progress === 'completed'
                          ? 'learn.pathwayCard.done'
                          : 'learn.home.started'
                      )}
                    </Text>
                  )}
                  <Feather name='chevron-right' size={16} color='#999' />
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      )}
      <BottomSheet visible={showMore} onClose={() => setShowMore(false)}>
        <View
          style={[s.row, { justifyContent: 'space-between', marginBottom: 16 }]}
        >
          <Text style={s.heading}>{t('learn.home.continue')}</Text>
          <Pressable
            accessibilityRole='button'
            accessibilityLabel={t('learn.home.close')}
            onPress={() => setShowMore(false)}
            style={{ padding: 12 }}
          >
            <Feather name='x' size={20} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 30 }}>
          {lessons.map(resume)}
        </ScrollView>
      </BottomSheet>
      <AnnouncementModal
        storageKey='announcement.learnHighlights.v1'
        title={t('learn.announcementTitle')}
        body={t('learn.announcementBody')}
        buttonLabel={t('common.gotIt')}
      />
    </View>
  );
}
