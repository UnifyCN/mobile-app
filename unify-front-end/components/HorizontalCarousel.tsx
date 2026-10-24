import { typography, typographyColors } from '@/constants/Typography';
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Feather } from '@expo/vector-icons';

const SEE_ALL_COLOR = '#6A6A6A';

interface HorizontalCarouselProps<T> {
  title: string;
  titleStyle?: any;
  data: T[];
  isLoading: boolean;
  maxItems?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  renderLoadingSkeleton: () => React.ReactNode;
  renderEmptyState: () => React.ReactNode;
  renderViewMore?: () => React.ReactNode;
  renderPrefix?: () => React.ReactNode;
  onViewMore?: () => void;
  showViewMore?: boolean;
  style?: any;
  scrollViewStyle?: any;
  contentContainerStyle?: any;
  itemKeyExtractor?: (item: T, index: number) => string | number;
}

export function HorizontalCarousel<T>({
  title,
  titleStyle,
  data,
  isLoading,
  maxItems = 3,
  renderItem,
  renderLoadingSkeleton,
  renderEmptyState,
  renderViewMore,
  renderPrefix,
  onViewMore,
  showViewMore = true,
  style,
  scrollViewStyle,
  contentContainerStyle,
  itemKeyExtractor,
}: HorizontalCarouselProps<T>) {
  const { t } = useTranslation();
  const dataArray = data || [];
  const displayItems = dataArray.slice(0, maxItems);
  const hasMoreItems = dataArray.length > maxItems;

  return (
    <View style={style}>
      <View style={styles.header}>
        <Text style={[styles.headerText, titleStyle]}>{title}</Text>
        {showViewMore && onViewMore && (
          <TouchableOpacity onPress={onViewMore} style={styles.seeAllButton}>
            <Text style={styles.seeAllText}>{t('common.seeAll')}</Text>
            <Feather name='chevron-right' size={16} color={SEE_ALL_COLOR} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.carousel, scrollViewStyle]}
        contentContainerStyle={[
          styles.carouselContent,
          dataArray.length === 0 && !isLoading && styles.carouselContentEmpty,
          contentContainerStyle,
        ]}
      >
        {isLoading && (
          <View style={styles.loadingContainer}>
            {Array.from({ length: 2 }).map((_, index) => (
              <React.Fragment key={`skeleton-${index}`}>
                {renderLoadingSkeleton()}
              </React.Fragment>
            ))}
          </View>
        )}
        {!isLoading && dataArray.length === 0 && (
          <View style={styles.emptyContainer}>{renderEmptyState()}</View>
        )}
        {renderPrefix && <>{renderPrefix()}</>}
        {!isLoading && dataArray.length > 0 && (
          <>
            {displayItems.map((item, index) => {
              const key = itemKeyExtractor
                ? itemKeyExtractor(item, index)
                : index;
              return (
                <React.Fragment key={key}>
                  {renderItem(item, index)}
                </React.Fragment>
              );
            })}
            {hasMoreItems && renderViewMore && <>{renderViewMore()}</>}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerText: {
    flex: 1,
    marginRight: 12,
    ...typography.section,

    color: '#000',
  },
  seeAllButton: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeAllText: {
    ...typography.secondary,

    color: typographyColors.secondary,
  },
  carousel: {
    marginBottom: 30,
  },
  carouselContent: {
    paddingHorizontal: 0,
    paddingBottom: 6,
    gap: 12,
  },
  carouselContentEmpty: {
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  loadingContainer: {
    flexDirection: 'row',
    gap: 12,
    overflow: 'hidden',
    width: '100%',
  },
  emptyContainer: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
