import { typography } from '@/constants/Typography';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { Theme } from '@/constants/Theme';
import { useGiveawayCountdownPrecise } from '@/hooks/giveaway/useGiveawayCountdownPrecise';

const PULSE_DURATION = 220;

/**
 * Live, per-second countdown for the giveaway welcome screen.
 *
 * Four side-by-side blocks: DAYS · HRS · MIN · SEC. The seconds block gets
 * a subtle scale pulse every tick to draw the eye and signal "this is live."
 * Minutes/hours/days update naturally on their own cycle without animation
 * since they change too slowly for motion to add anything.
 */
export function LiveCountdown() {
  const { t } = useTranslation();
  const { isActive, days, hours, minutes, seconds } =
    useGiveawayCountdownPrecise();

  if (!isActive) return null;

  return (
    <View style={styles.container}>
      <Block value={days} label={t('giveaway.live.days')} />
      <Separator />
      <Block value={hours} label={t('giveaway.live.hours')} />
      <Separator />
      <Block value={minutes} label={t('giveaway.live.minutes')} />
      <Separator />
      <PulsingBlock value={seconds} label={t('giveaway.live.seconds')} />
    </View>
  );
}

function Block({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.block}>
      <Text style={styles.value}>{String(value).padStart(2, '0')}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

function PulsingBlock({ value, label }: { value: number; label: string }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withTiming(1.12, { duration: PULSE_DURATION / 2 }, () => {
      scale.value = withTiming(1, {
        duration: PULSE_DURATION / 2,
        easing: Easing.out(Easing.quad),
      });
    });
  }, [value, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.block}>
      <Animated.Text style={[styles.value, animatedStyle]}>
        {String(value).padStart(2, '0')}
      </Animated.Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

function Separator() {
  return <Text style={styles.separator}>:</Text>;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF8E7',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F2DDA3',
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 10,
  },
  block: {
    flex: 1,
    alignItems: 'center',
  },
  value: {
    ...typography.title,
    color: Theme.black,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  label: {
    ...typography.caption,
    color: Theme.textAlternateGray,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 6,
    fontWeight: '700',
  },
  separator: {
    ...typography.title,
    color: Theme.textInactiveTab,
    marginTop: -10,
  },
});
