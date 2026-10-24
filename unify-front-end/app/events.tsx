import { typography } from '@/constants/Typography';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  ScrollView,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';
import { useEvents } from '@/hooks/events/useEvents';
import EventCard from '@/components/events/EventCard';
import { useMemo, useState } from 'react';
import { Event, EventGenre } from '@/types/events';
import { Theme } from '@/constants/Theme';
import EmptyFeedMessage from '@/components/profile/EmptyFeedMessage';
import BackHeader from '@/components/BackHeader';
import {
  EventDateFilter,
  getEventsForDateFilter,
  getPresentEventGenres,
} from '@/helpers/eventHelpers';

const EVENTS_LIST_CARD_HEIGHT = 228;

const EventsScreen = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: events, isLoading, error } = useEvents();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<EventDateFilter>('Upcoming');
  const [selectedGenre, setSelectedGenre] = useState<EventGenre | null>(null);

  const tags = ['All', 'Upcoming', 'Past'] as const;
  const tagLabels: Record<string, string> = {
    All: t('events.all'),
    Upcoming: t('events.upcoming'),
    Past: t('events.past'),
  };
  const selectTag = (tag: EventDateFilter) => {
    setSelectedTag(tag);
  };

  const { filteredEvents, presentGenres, activeGenre, genreCounts } =
    useMemo(() => {
      const searchedEvents =
        events?.filter(event =>
          event.title.toLowerCase().includes(searchQuery.toLowerCase())
        ) ?? [];

      const dateFilteredEvents = getEventsForDateFilter(
        searchedEvents,
        selectedTag
      );
      const genres = getPresentEventGenres(dateFilteredEvents);
      const effectiveGenre =
        selectedGenre && genres.includes(selectedGenre) ? selectedGenre : null;
      const counts = new Map<EventGenre, number>();
      dateFilteredEvents.forEach(event => {
        counts.set(event.genre, (counts.get(event.genre) ?? 0) + 1);
      });

      return {
        filteredEvents: effectiveGenre
          ? dateFilteredEvents.filter(event => event.genre === effectiveGenre)
          : dateFilteredEvents,
        presentGenres: genres,
        activeGenre: effectiveGenre,
        genreCounts: counts,
      };
    }, [events, searchQuery, selectedGenre, selectedTag]);

  const renderEvent = ({ item }: { item: Event }) => (
    <View style={styles.eventItem}>
      <EventCard
        event={item}
        width={354}
        height={EVENTS_LIST_CARD_HEIGHT}
        onPress={() =>
          router.push({
            pathname: '/event-detail' as any,
            params: {
              eventId: String(item.id),
              event: JSON.stringify(item),
            },
          })
        }
      />
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <StatusBar style='dark' />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{t('events.loading')}</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <StatusBar style='dark' />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{t('events.failedToLoad')}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => router.back()}
          >
            <Text style={styles.retryButtonText}>{t('common.goBack')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BackHeader title={t('events.title')} />

      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Feather
            name='search'
            size={20}
            color={Theme.textInput}
            style={styles.searchIcon}
          />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
            placeholder={t('search.searchEvents')}
            placeholderTextColor={Theme.textInput}
          />
          {/* TODO: Implement addtional filter screen later */}
          {/* <TouchableOpacity>
            <ChartNoAxesGantt size={24} color='#666' />
          </TouchableOpacity> */}
        </View>
      </View>

      <View style={styles.tagsContainer}>
        {tags.map(tag => (
          <TouchableOpacity
            key={tag}
            style={[
              styles.tagButton,
              selectedTag === tag && styles.tagButtonSelected,
            ]}
            onPress={() => selectTag(tag)}
          >
            <Text
              style={[
                styles.tagText,
                selectedTag === tag && styles.tagTextSelected,
              ]}
            >
              {tagLabels[tag]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {presentGenres.length >= 2 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.genreTagsContainer}
          contentContainerStyle={styles.genreTagsContent}
          accessibilityRole='none'
          accessibilityLabel={t('events.filterByCategory')}
        >
          <Pressable
            accessibilityRole='button'
            accessibilityState={{ selected: activeGenre === null }}
            style={({ pressed }) => [
              styles.genreTagItem,
              activeGenre === null && styles.genreTagItemSelected,
              pressed && styles.genreTagItemPressed,
            ]}
            onPress={() => setSelectedGenre(null)}
          >
            <Text
              style={[
                styles.genreTagText,
                activeGenre === null && styles.genreTagTextSelected,
              ]}
            >
              {t('events.all')}
            </Text>
          </Pressable>
          {presentGenres.map(genre => (
            <Pressable
              key={genre}
              accessibilityRole='button'
              accessibilityState={{ selected: activeGenre === genre }}
              style={({ pressed }) => [
                styles.genreTagItem,
                activeGenre === genre && styles.genreTagItemSelected,
                pressed && styles.genreTagItemPressed,
              ]}
              onPress={() => setSelectedGenre(genre)}
            >
              <Text
                style={[
                  styles.genreTagText,
                  activeGenre === genre && styles.genreTagTextSelected,
                ]}
              >
                {t(`events.genre.${genre.toLowerCase()}`)}{' '}
                {genreCounts.get(genre)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <FlatList
        data={filteredEvents}
        renderItem={renderEvent}
        keyExtractor={item => item.id.toString()}
        contentContainerStyle={styles.eventsList}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
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
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.white,
  },
  eventsList: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 16,
  },
  eventItem: {
    alignSelf: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { ...typography.body, color: '#666' },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    ...typography.body,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: { ...typography.button, color: '#fff' },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    ...typography.cardTitle,
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: { ...typography.secondary, color: '#666', textAlign: 'center' },
  searchContainer: {
    paddingHorizontal: 20,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.surfaceTextInput,
    borderRadius: 100,
    paddingHorizontal: 24,
    paddingVertical: 8,
    height: 36,
    gap: 8,
  },
  searchIcon: {
    marginRight: 0,
  },
  searchInput: {
    ...typography.body,
    flex: 1,
    color: Theme.textAlternateGray,
  },
  tagsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginVertical: 16,
    gap: 10,
  },
  tagButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.textInactiveTab,
    backgroundColor: Theme.white,
  },
  tagButtonSelected: {
    backgroundColor: Theme.black,
    borderColor: Theme.black,
  },
  tagText: {
    ...typography.secondary,
    color: Theme.textInactiveTab,
    fontWeight: '500',
  },
  tagTextSelected: {
    color: Theme.white,
  },
  genreTagsContainer: {
    // ScrollView defaults to flexShrink: 1, so the FlatList below squeezes
    // the chip row and clips the bottom of each chip.
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: 16,
  },
  genreTagsContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  genreTagItem: {
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: Theme.surfaceTextInput,
  },
  genreTagItemSelected: {
    backgroundColor: Theme.black,
  },
  genreTagItemPressed: {
    opacity: 0.72,
  },
  genreTagText: {
    ...typography.caption,
    color: Theme.textAlternateGray,
    fontWeight: '500',
  },
  genreTagTextSelected: {
    color: Theme.white,
  },
});

export default EventsScreen;
