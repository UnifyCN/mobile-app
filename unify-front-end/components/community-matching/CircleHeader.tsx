import { typography } from '@/constants/Typography';
import { Feather } from '@expo/vector-icons';
import { Image, StyleSheet, Text, View } from 'react-native';

import { Theme } from '@/constants/Theme';

type CircleHeaderProps = {
  title: string;
  subtitle: string;
  dateRange?: string | null;
  countdownText?: string | null;
  isActive: boolean;
  statusText?: string;
  circleImageUrl?: string | null;
};

export function CircleHeader({
  title,
  subtitle,
  dateRange,
  countdownText,
  isActive,
  statusText,
  circleImageUrl,
}: CircleHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconHalo}>
        <View style={styles.iconBadge}>
          {circleImageUrl ? (
            <Image source={{ uri: circleImageUrl }} style={styles.iconImage} />
          ) : (
            <Feather name='users' size={30} color={Theme.white} />
          )}
        </View>
      </View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {dateRange ? <Text style={styles.meta}>{dateRange}</Text> : null}

      {countdownText ? (
        <View style={styles.countdownBadge}>
          <Text style={styles.countdownText}>⏱️ {countdownText}</Text>
        </View>
      ) : null}

      {statusText ? (
        <View
          style={[
            styles.statusPill,
            isActive ? styles.statusActive : styles.statusEnded,
          ]}
        >
          <Text
            style={isActive ? styles.statusActiveText : styles.statusEndedText}
          >
            {statusText}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: 0,
    paddingBottom: 4,
  },
  iconHalo: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#FDE6CF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  iconBadge: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: Theme.primaryGatherRed,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconImage: {
    width: '100%',
    height: '100%',
  },
  title: { ...typography.title, color: '#1F1300', textAlign: 'center' },
  subtitle: {
    ...typography.body,
    marginTop: 6,
    color: '#4A3F35',
    textAlign: 'center',
  },
  meta: {
    ...typography.secondary,
    marginTop: 8,
    color: '#6E6E6E',
    textAlign: 'center',
  },
  countdownBadge: {
    marginTop: 12,
    backgroundColor: '#fff3e6',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  countdownText: {
    color: '#ff820b',
    fontWeight: '600',
    fontSize: 14,
    textAlign: 'center',
  },
  statusPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    marginTop: 12,
  },
  statusActive: {
    backgroundColor: '#E6F8EE',
  },
  statusActiveText: {
    color: '#0F8B54',
    fontWeight: '600',
  },
  statusEnded: {
    backgroundColor: '#FDECE6',
  },
  statusEndedText: {
    color: '#B5330F',
    fontWeight: '600',
  },
});
