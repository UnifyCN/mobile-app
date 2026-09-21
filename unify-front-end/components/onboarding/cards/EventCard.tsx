import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { formatNumber } from '@/utils/formatNumber';

interface EventCardProps {
  scale?: number;
}

// Illustrative date for the marketing card. Month and day are formatted with
// the active language so the badge is not stuck on the English abbreviation.
const SAMPLE_EVENT_DATE = new Date(2025, 5, 15);

export default function EventCard({ scale = 1 }: EventCardProps) {
  const { t, i18n } = useTranslation();
  const s = scale;
  const dayLabel = formatNumber(SAMPLE_EVENT_DATE.getDate());
  let monthLabel: string;
  try {
    monthLabel = SAMPLE_EVENT_DATE.toLocaleDateString(i18n.language, {
      month: 'short',
    });
  } catch {
    monthLabel = SAMPLE_EVENT_DATE.toLocaleDateString(undefined, {
      month: 'short',
    });
  }

  return (
    <View
      style={[
        styles.container,
        {
          width: 300 * s,
          height: 194 * s,
          borderRadius: 16 * s,
        },
      ]}
    >
      {/* Header image */}
      <Image
        source={require('@/assets/images/event-card-header.png')}
        style={[
          styles.headerImage,
          {
            height: 108 * s,
            borderTopLeftRadius: 16 * s,
            borderTopRightRadius: 16 * s,
          },
        ]}
        contentFit='cover'
      />

      {/* Date badge */}
      <View
        style={[
          styles.dateBadge,
          {
            width: 59 * s,
            height: 56 * s,
            borderRadius: 24 * s,
            top: 12 * s,
            left: 15 * s,
          },
        ]}
      >
        <Text
          style={[styles.dateDay, { fontSize: 18 * s, lineHeight: 22 * s }]}
        >
          {dayLabel}
        </Text>
        <Text
          style={[styles.dateMonth, { fontSize: 18 * s, lineHeight: 22 * s }]}
        >
          {monthLabel}
        </Text>
      </View>

      {/* Title */}
      <Text
        style={[
          styles.title,
          {
            fontSize: 18 * s,
            left: 15 * s,
            top: 115 * s,
          },
        ]}
        numberOfLines={1}
      >
        {t('preLogin.event.name')}
      </Text>

      {/* Time row */}
      <View style={[styles.infoRow, { left: 15 * s, top: 140 * s }]}>
        <Ionicons name='calendar-outline' size={16 * s} color='#9B9797' />
        <Text
          style={[styles.infoText, { fontSize: 14 * s, marginLeft: 6 * s }]}
        >
          {t('preLogin.event.time')}
        </Text>
      </View>

      {/* Location row */}
      <View style={[styles.infoRow, { left: 15 * s, top: 161 * s }]}>
        <Ionicons name='location-outline' size={16 * s} color='#9B9797' />
        <Text
          style={[styles.infoText, { fontSize: 14 * s, marginLeft: 6 * s }]}
          numberOfLines={1}
        >
          {t('preLogin.event.venue')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#CDCBCB',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 5,
  },
  headerImage: {
    width: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  dateBadge: {
    position: 'absolute',
    backgroundColor: '#ECE0D9',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  dateDay: {
    fontFamily: 'FunnelSans_500Medium',
    color: '#050505',
    textAlign: 'center',
  },
  dateMonth: {
    fontFamily: 'FunnelSans_500Medium',
    color: '#050505',
    textAlign: 'center',
    marginTop: -4,
  },
  title: {
    position: 'absolute',
    fontFamily: 'FunnelSans_600SemiBold',
    color: '#000',
  },
  infoRow: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoText: {
    fontFamily: 'FunnelSans_500Medium',
    color: '#9B9797',
  },
});
