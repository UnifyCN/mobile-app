import { typography, typographyColors } from '@/constants/Typography';
import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { NewsDetails } from '@/types/news';
import { Theme } from '@/constants/Theme';

interface NewsCardProps {
  news: NewsDetails;
  maxWidth?: number;
  onPress?: () => void;
}

export function NewsCard({ news, maxWidth, onPress }: NewsCardProps) {
  const { title, description, imageLink } = news;

  const CardWrapper = onPress ? TouchableOpacity : View;

  return (
    <CardWrapper
      style={[
        styles.newsCard,
        maxWidth !== undefined
          ? { width: maxWidth }
          : { width: '100%', marginRight: 0 },
      ]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      {imageLink ? (
        <Image
          source={{ uri: imageLink }}
          style={styles.newsImage}
          resizeMode='cover'
        />
      ) : (
        <View style={styles.newsImagePlaceholder} />
      )}
      <View style={styles.newsContent}>
        <Text style={styles.newsTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text
          style={styles.newsDescription}
          numberOfLines={2}
          ellipsizeMode='tail'
        >
          {description || ''}
        </Text>
      </View>
    </CardWrapper>
  );
}

const styles = StyleSheet.create({
  newsCard: {
    width: 332,
    minHeight: 132,
    backgroundColor: Theme.white,
    borderColor: Theme.borderCard,
    borderWidth: 1,
    borderRadius: 16,
    marginRight: 16,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  newsImagePlaceholder: {
    width: 100,
    height: '100%',
    backgroundColor: Theme.imagePlaceholder,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  newsImage: {
    width: 100,
    height: '100%',
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  newsContent: {
    flex: 1,
    backgroundColor: Theme.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  newsTitle: {
    ...typography.cardTitle,

    color: Theme.black,
    marginBottom: 6,
  },
  newsDescription: {
    ...typography.secondary,

    color: typographyColors.secondary,
  },
});
