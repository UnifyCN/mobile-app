import React from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { tPlural } from '@/helpers/pluralKey';
import type { ArrivalCountdownShown } from '@/utils/analytics';

interface Props {
  countdown: ArrivalCountdownShown;
  /** Opens the arrival-date sheet. */
  onPress: () => void;
}

/** Card at the top of the Checklist: days to arrival, or the first 30 days. */
export function ArrivalCountdownCard({ countdown, onPress }: Props) {
  const { t, i18n } = useTranslation();

  const title =
    countdown.state === 'pre_arrival'
      ? tPlural(
          t,
          'checklist.arrivalCountdown.preArrival',
          countdown.days,
          i18n.language
        )
      : t('checklist.arrivalCountdown.first30Days');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole='button'
      accessibilityLabel={title}
      accessibilityHint={t('checklist.arrivalCountdown.changeHint')}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.iconChip}>
        <MaterialIcons
          name={countdown.state === 'pre_arrival' ? 'flight-land' : 'event'}
          size={22}
          color='#059669'
        />
      </View>
      <Text style={styles.title} maxFontSizeMultiplier={1.4}>
        {title}
      </Text>
      <MaterialIcons
        name={I18nManager.isRTL ? 'chevron-left' : 'chevron-right'}
        size={22}
        color='#B5B1B1'
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E7E4DE',
    backgroundColor: '#fff',
    shadowColor: '#575757',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.7,
  },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: '#000',
  },
});
