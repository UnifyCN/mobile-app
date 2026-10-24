import { typography } from '@/constants/Typography';
import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { NewsCard } from '@/components/home/NewsCard';
import ViewMoreCardNews from '@/components/icons/ViewMoreCardNews.svg';
import { NewsDetails } from '@/types/news';
import { useNews } from '@/hooks/news/useNews';
import EmptyFeedMessage from '@/components/profile/EmptyFeedMessage';
import { Theme } from '@/constants/Theme';
import { HorizontalCarousel } from '@/components/HorizontalCarousel';
import { NewsCardSkeletonLoader } from '@/components/news/NewsCardSkeletonLoader';
import { DailyTipCard } from '@/components/tips/DailyTipCard';
import { DailyTipCardSkeletonLoader } from '@/components/tips/DailyTipCardSkeletonLoader';
import { useDailyTip } from '@/hooks/tips/useDailyTip';

export const NewsCarousel = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: news, isLoading } = useNews();

  const { data: dailyTip, isLoading: isTipLoading } = useDailyTip();

  const handleViewMore = () => {
    router.push('/news-tips' as any);
  };

  const handleNewsPress = (newsItem: NewsDetails) => {
    router.push({
      pathname: '/news-detail' as any,
      params: { news: JSON.stringify(newsItem) },
    });
  };

  const newsArray = news || [];

  return (
    <View style={styles.newsSection}>
      <HorizontalCarousel
        title={t('news.title')}
        titleStyle={styles.headerText}
        data={newsArray}
        isLoading={isLoading}
        maxItems={3}
        itemKeyExtractor={item => item.id}
        renderItem={item => (
          <NewsCard
            news={item}
            maxWidth={332}
            onPress={() => handleNewsPress(item)}
          />
        )}
        renderPrefix={() => {
          if (isTipLoading) return <DailyTipCardSkeletonLoader />;
          if (!dailyTip) return null;
          return (
            <DailyTipCard
              tip={dailyTip}
              maxWidth={332}
              onPress={() =>
                router.push({
                  pathname: '/tip-detail' as any,
                  params: { tip: JSON.stringify(dailyTip) },
                })
              }
            />
          );
        }}
        renderLoadingSkeleton={() => <NewsCardSkeletonLoader />}
        renderEmptyState={() => (
          <EmptyFeedMessage
            icon={<Feather name='file-text' size={24} color='#B4B1B1' />}
            message={t('news.noNews')}
            submessage={
              <Text
                style={{
                  ...typography.secondary,
                  color: Theme.textInput,
                  textAlign: 'center',
                }}
              >
                {t('news.checkBackLater')}
              </Text>
            }
          />
        )}
        renderViewMore={() => (
          <TouchableOpacity
            style={styles.viewMoreCardContainer}
            onPress={handleViewMore}
            activeOpacity={0.8}
          >
            <View style={styles.viewMoreContent}>
              <ViewMoreCardNews width={332} height={132} />
              <View style={styles.viewMoreTextOverlay}>
                <Text style={styles.viewMoreText}>
                  {t('news.viewMore')}{' '}
                  <Feather name='arrow-right' size={16} color='#000' />
                </Text>
                <Text style={styles.viewMoreSubtext}>
                  {t('news.moreToCheckOut')}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
        onViewMore={handleViewMore}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  newsSection: {
    paddingHorizontal: 20,
  },
  headerText: {
    ...typography.section,
  },
  viewMoreCardContainer: {
    width: 332,
    height: 132,
    borderRadius: 16,
    borderColor: Theme.borderCard,
    borderWidth: 1,
    backgroundColor: Theme.white,
    overflow: 'hidden',
  },
  viewMoreContent: {
    width: 332,
    height: 132,
    position: 'relative',
  },
  viewMoreTextOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  viewMoreText: {
    ...typography.label,

    color: '#000',
  },
  viewMoreSubtext: {
    ...typography.secondary,

    color: '#000',
  },
});
