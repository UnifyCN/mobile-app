import { typography, typographyColors } from '@/constants/Typography';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useEvents } from '@/hooks/events/useEvents';
import EventCard from '@/components/events/EventCard';
import { SkeletonLoader } from './SkeletonLoader';
import { Theme } from '@/constants/Theme';
import ViewMoreCardEvents from '@/components/icons/ViewMoreCardEvents.svg';
import EmptyFeedMessage from '@/components/profile/EmptyFeedMessage';
import { HorizontalCarousel } from './HorizontalCarousel';
import { getUpcomingEventsSorted } from '@/helpers/eventHelpers';
import {
  EVENT_CARD_WIDTH,
  EVENT_CARD_ASPECT_RATIO,
  EVENT_IMAGE_ASPECT_RATIO,
} from '@/constants/EventCard';

const EVENT_CARD_HEIGHT = Math.round(
  EVENT_CARD_WIDTH * EVENT_CARD_ASPECT_RATIO
);
const EVENT_CARD_IMAGE_HEIGHT = Math.round(
  EVENT_CARD_WIDTH * EVENT_IMAGE_ASPECT_RATIO
);

// Skeleton loader component for events
const EventSkeletonCard = () => {
  return (
    <View style={skeletonStyles.eventCard}>
      <View style={skeletonStyles.imageContainer}>
        <SkeletonLoader
          width='100%'
          height={EVENT_CARD_IMAGE_HEIGHT}
          borderRadius={0}
          style={skeletonStyles.eventImagePlaceholder}
        />
        <SkeletonLoader
          width={42}
          height={42}
          borderRadius={21}
          style={skeletonStyles.datePillSkeleton}
        />
      </View>
      <View style={skeletonStyles.eventContent}>
        <SkeletonLoader
          width='88%'
          height={22}
          borderRadius={4}
          style={skeletonStyles.titleSkeleton}
        />

        <View style={skeletonStyles.detailsContainer}>
          <View style={skeletonStyles.eventDetail}>
            <SkeletonLoader
              width={18}
              height={18}
              borderRadius={9}
              style={skeletonStyles.iconSkeleton}
            />
            <SkeletonLoader
              width='65%'
              height={14}
              borderRadius={4}
              style={skeletonStyles.detailSkeleton}
            />
          </View>

          <View style={skeletonStyles.eventDetail}>
            <SkeletonLoader
              width={18}
              height={18}
              borderRadius={9}
              style={skeletonStyles.iconSkeleton}
            />
            <SkeletonLoader
              width='75%'
              height={14}
              borderRadius={4}
              style={skeletonStyles.detailSkeleton}
            />
          </View>
        </View>
      </View>
    </View>
  );
};

interface EventsCarouselProps {
  title?: string;
  titleStyle?: any;
  showViewMore?: boolean;
  maxEvents?: number;
  style?: any;
  contentContainerStyle?: any;
}

export const EventsCarousel = ({
  title,
  titleStyle,
  showViewMore = true,
  maxEvents = 3,
  style,
  contentContainerStyle,
}: EventsCarouselProps) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: events, isLoading } = useEvents();

  const upcomingEvents = getUpcomingEventsSorted(events);

  const handleEventPress = (event: any) => {
    router.push({
      pathname: '/event-detail' as any,
      params: {
        eventId: String(event.id),
        event: JSON.stringify(event),
      },
    });
  };

  const handleViewMore = () => {
    router.push('/events' as any);
  };

  return (
    <View style={style}>
      <HorizontalCarousel
        title={title ?? t('events.gatherEvents')}
        titleStyle={titleStyle}
        data={upcomingEvents}
        isLoading={isLoading}
        maxItems={maxEvents}
        itemKeyExtractor={item => item.id}
        renderItem={item => (
          <EventCard event={item} onPress={() => handleEventPress(item)} />
        )}
        renderLoadingSkeleton={() => <EventSkeletonCard />}
        renderEmptyState={() => (
          <EmptyFeedMessage
            icon={<Feather name='calendar' size={24} color='#B4B1B1' />}
            message={t('events.noEvents')}
            submessage={
              <Text
                style={{
                  ...typography.secondary,
                  color: Theme.textInput,
                  textAlign: 'center',
                }}
              >
                {t('events.checkBackLater')}
              </Text>
            }
          />
        )}
        renderViewMore={() => (
          <TouchableOpacity
            style={styles.viewMoreCard}
            onPress={handleViewMore}
            activeOpacity={0.7}
          >
            <View style={styles.viewMoreContent}>
              <ViewMoreCardEvents
                width={EVENT_CARD_WIDTH}
                height='100%'
                preserveAspectRatio='none'
              />
              <View style={styles.viewMoreTextOverlay}>
                <Text style={styles.viewMoreText}>
                  {t('events.viewMore')}{' '}
                  <Feather name='arrow-right' size={16} color={Theme.black} />
                </Text>
                <Text style={styles.viewMoreSubtext}>
                  {t('events.moreToCheckOut')}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
        onViewMore={showViewMore ? handleViewMore : undefined}
        showViewMore={showViewMore}
        scrollViewStyle={styles.eventsCarousel}
        contentContainerStyle={contentContainerStyle}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  eventsCarousel: {
    marginBottom: 20,
  },
  viewMoreCard: {
    width: EVENT_CARD_WIDTH,
    alignSelf: 'stretch',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  },
  viewMoreContent: {
    width: EVENT_CARD_WIDTH,
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewMoreTextOverlay: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  viewMoreText: {
    ...typography.label,

    color: Theme.black,
  },
  viewMoreSubtext: {
    ...typography.secondary,

    color: typographyColors.secondary,
  },
});

const skeletonStyles = StyleSheet.create({
  eventCard: {
    backgroundColor: Theme.white,
    borderColor: Theme.borderCard,
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    width: EVENT_CARD_WIDTH,
    height: EVENT_CARD_HEIGHT,
  },
  imageContainer: {
    height: EVENT_CARD_IMAGE_HEIGHT,
    borderRadius: 0,
    overflow: 'hidden',
    position: 'relative',
  },
  eventImagePlaceholder: {
    backgroundColor: '#D5D5D5',
  },
  datePillSkeleton: {
    position: 'absolute',
    top: 10,
    left: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.68)',
  },
  eventContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  detailsContainer: {
    gap: 0,
  },
  eventDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 6,
  },
  titleSkeleton: {
    marginBottom: 6,
    backgroundColor: '#D5D5D5',
  },
  detailSkeleton: {
    flex: 1,
    backgroundColor: '#D5D5D5',
  },
  iconSkeleton: {
    backgroundColor: '#D5D5D5',
  },
});
