import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  Linking,
  Share,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';
import { Event } from '@/types/events';
import { formatEventDate, formatEventTimeRange } from '@/helpers/dateHelpers';
import { Theme } from '@/constants/Theme';
import { useEffect, useMemo } from 'react';
import { useAnalytics } from '@/utils/analytics';
import BackHeader from '@/components/BackHeader';
import { useEvents } from '@/hooks/events/useEvents';
import {
  getSafeEventExternalUrl,
  handoffEventExternalUrl,
} from '@/helpers/eventHelpers';
import { TranslateButton } from '@/components/home/TranslateButton';

const EventDetailScreen = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { event, eventId } = useLocalSearchParams<{
    event?: string | string[];
    eventId?: string | string[];
  }>();
  const { data: events } = useEvents();

  const normalizedEventParam = Array.isArray(event) ? event[0] : event;
  const normalizedEventId = Array.isArray(eventId) ? eventId[0] : eventId;

  const initialEventData: Event | null = useMemo(() => {
    try {
      if (!normalizedEventParam) return null;
      return JSON.parse(normalizedEventParam) as Event;
    } catch (error) {
      console.error('Failed to parse event data:', error);
      return null;
    }
  }, [normalizedEventParam]);

  const eventData: Event | null = useMemo(() => {
    if (!normalizedEventId) {
      return initialEventData;
    }

    const matchedEvent = events?.find(
      currentEvent => String(currentEvent.id) === normalizedEventId
    );

    return matchedEvent ?? initialEventData;
  }, [events, initialEventData, normalizedEventId]);

  const { trackEventViewed, trackEventShared, trackEventExternalLinkClicked } =
    useAnalytics();

  // Handle redirect if event data is missing or invalid
  useEffect(() => {
    if (!eventData) {
      router.back();
    }
  }, [eventData, router]);

  // Track event view on mount
  useEffect(() => {
    if (eventData) {
      trackEventViewed(eventData.id.toString(), eventData.title);
    }
  }, [eventData, trackEventViewed]);

  if (!eventData) return null;

  const safeExternalLink = getSafeEventExternalUrl(eventData.externalLink);

  const handleExternalLink = async () => {
    await handoffEventExternalUrl({
      value: safeExternalLink,
      openUrl: url => Linking.openURL(url),
      onOpened: () =>
        trackEventExternalLinkClicked(eventData.id.toString(), eventData.title),
      onFailure: () =>
        Alert.alert(t('common.error'), t('events.linkOpenFailed')),
    });
  };

  // Using react native built in share
  const handleShare = async () => {
    try {
      trackEventShared(eventData.id.toString(), eventData.title);
      const shareParts = [
        t('events.shareMessage', { title: eventData.title }),
        t('events.shareDate', {
          date: formatEventDate(eventData.eventDatetime),
        }),
        t('events.shareLocation', { location: eventData.location }),
      ];
      if (safeExternalLink) {
        shareParts.push(t('events.shareLink', { url: safeExternalLink }));
      }

      await Share.share({
        message: shareParts.join('\n\n'),
        title: t('events.shareDialogTitle'),
        ...(safeExternalLink ? { url: safeExternalLink } : {}),
      });
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code !== 'SHARE_CANCELLED'
      ) {
        console.error('Error sharing event:', error);
      }
    }
  };

  return (
    <View style={styles.container}>
      {/* Header - Using BackHeader component with share button */}
      <BackHeader
        rightButton={
          <TouchableOpacity onPress={handleShare}>
            <Feather name='upload' size={24} color={Theme.black} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Event Title */}
        <Text style={styles.eventTitle}>{eventData.title}</Text>

        {/* Event Image - Card style (now directly after title) */}
        {eventData.coverPhotoUrl ? (
          <Image
            source={{ uri: eventData.coverPhotoUrl }}
            style={styles.eventImage}
            resizeMode='cover'
          />
        ) : (
          <View style={styles.imagePlaceholder} />
        )}

        {/* Metadata - Date and Time */}
        <View style={styles.metadataRow}>
          <Feather
            name='calendar'
            size={16}
            color={Theme.textAlternateGray}
            style={styles.metadataIcon}
          />
          <Text style={styles.metadataText}>
            {formatEventDate(eventData.eventDatetime)}
            <Text style={styles.metadataSecondary}>
              {' '}
              ·{' '}
              {formatEventTimeRange(
                eventData.eventDatetime,
                eventData.eventEndDatetime
              )}
            </Text>
          </Text>
        </View>

        {/* Metadata - Location */}
        <View style={styles.metadataRow}>
          <Feather
            name='map-pin'
            size={16}
            color={Theme.textAlternateGray}
            style={styles.metadataIcon}
          />
          <View style={styles.metadataContent}>
            <Text style={styles.metadataText}>{eventData.location}</Text>
            {eventData.address && (
              <Text style={styles.metadataSecondary}>{eventData.address}</Text>
            )}
          </View>
        </View>

        {/* Metadata - Hosted By */}
        {eventData.hostedBy && (
          <View style={styles.metadataRow}>
            <Feather
              name='user'
              size={16}
              color={Theme.textAlternateGray}
              style={styles.metadataIcon}
            />
            <Text style={styles.metadataText}>
              {t('events.hostedBy')}{' '}
              <Text style={styles.metadataHighlight}>{eventData.hostedBy}</Text>
            </Text>
          </View>
        )}

        {/* CTA Button - View Event Details (now placed after metadata, before About) */}
        {safeExternalLink && (
          <TouchableOpacity
            onPress={handleExternalLink}
            style={styles.ctaButton}
          >
            <Text style={styles.ctaButtonText}>{t('events.viewDetails')}</Text>
            <Feather name='external-link' size={18} color={Theme.white} />
          </TouchableOpacity>
        )}

        {/* About Event */}
        <Text style={styles.aboutTitle}>{t('events.aboutEvent')}</Text>
        {eventData.description ? (
          <Text style={styles.aboutText}>{eventData.description}</Text>
        ) : (
          <Text style={styles.aboutText}>{t('events.noEventDescription')}</Text>
        )}

        {/* Machine translation of the title + description. Renders nothing
            when the UI language is English. */}
        <TranslateButton type='event' id={eventData.id} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.white,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 4,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  eventTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: Theme.black,
    marginBottom: 12,
    lineHeight: 28,
  },
  eventImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 20,
    backgroundColor: Theme.imagePlaceholder,
  },
  imagePlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 20,
    backgroundColor: Theme.imagePlaceholder,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  metadataIcon: {
    marginRight: 10,
    marginTop: 2,
  },
  metadataContent: {
    flex: 1,
  },
  metadataText: {
    fontSize: 16,
    color: Theme.black,
    lineHeight: 22,
  },
  metadataSecondary: {
    fontSize: 16,
    color: Theme.textPostTime,
    lineHeight: 22,
  },
  metadataHighlight: {
    fontWeight: '700',
  },
  ctaButton: {
    backgroundColor: Theme.surfaceBlue,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  ctaButtonText: {
    color: Theme.white,
    fontSize: 16,
    fontWeight: '600',
    marginRight: 8,
  },
  aboutTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Theme.black,
    marginBottom: 12,
  },
  aboutText: {
    fontSize: 18,
    color: Theme.black,
    lineHeight: 27,
  },
});

export default EventDetailScreen;
