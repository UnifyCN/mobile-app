import { typography } from '@/constants/Typography';
import React, { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  AccessibilityInfo,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { ChevronRight, X } from 'lucide-react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';

import { Theme } from '@/constants/Theme';
import { useGiveawayCountdown } from '@/hooks/giveaway/useGiveawayCountdown';
import { useGiveawayEntry } from '@/hooks/giveaway/useGiveawayEntry';
import { useAnalytics, AnalyticsEvents } from '@/utils/analytics';
import { useHapticsPreference } from '@/context/HapticsContext';
import { GiftBoxIcon } from './GiftBoxIcon';

const ICON_SIZE = 44;

/**
 * GiveawayBanner — pinned above the feed tabs on Home.
 *
 *   Three states:
 *     1. active & not entered     → animated gift box + CTA + dismiss X
 *     2. active & entered         → "You're entered ✓" (no dismiss, no animation)
 *     3. expired or dismissed     → null
 *
 * Dismissal is per-session (component-local state). Re-mounts on next app
 * launch, so users who closed without entering see it again.
 */
export function GiveawayBanner() {
  const { t } = useTranslation();
  const router = useRouter();
  const { capture } = useAnalytics();
  const { hapticsEnabled } = useHapticsPreference();
  const { isActive } = useGiveawayCountdown();
  const { data: entry, isLoading } = useGiveawayEntry();
  const [dismissed, setDismissed] = useState(false);
  const [hasFiredShown, setHasFiredShown] = useState(false);

  const hasEntered = !!entry;
  const shouldRender = isActive && !dismissed;

  useEffect(() => {
    if (!shouldRender || isLoading || hasFiredShown) return;
    capture(AnalyticsEvents.GIVEAWAY_BANNER_SHOWN, {
      state: hasEntered ? 'entered' : 'cta',
    });
    setHasFiredShown(true);
  }, [shouldRender, isLoading, hasFiredShown, hasEntered, capture]);

  if (!shouldRender) return null;

  if (hasEntered) {
    return (
      <View style={styles.outerWrap}>
        <View
          style={[styles.card, styles.enteredCard]}
          accessibilityRole='text'
          accessibilityLabel={`${t('giveaway.banner.enteredHeadline')} ${t(
            'giveaway.banner.enteredSubtext'
          )}`}
        >
          <View style={styles.iconWrap}>
            <GiftBoxIcon size={ICON_SIZE} />
          </View>
          <View style={styles.textBlock}>
            <Text style={styles.headlineEntered} numberOfLines={1}>
              {t('giveaway.banner.enteredHeadline')}
            </Text>
            <Text style={styles.subtext} numberOfLines={1}>
              {t('giveaway.banner.enteredSubtext')}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const handlePress = () => {
    if (hapticsEnabled) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    capture(AnalyticsEvents.GIVEAWAY_BANNER_TAPPED);
    router.push('/giveaway' as Href);
  };

  const handleDismiss = () => {
    capture(AnalyticsEvents.GIVEAWAY_BANNER_DISMISSED);
    setDismissed(true);
    AccessibilityInfo.announceForAccessibility(t('giveaway.banner.headline'));
  };

  return (
    <View style={styles.outerWrap}>
      <View style={styles.card}>
        <Pressable
          style={({ pressed }) => [styles.pressArea, pressed && styles.pressed]}
          onPress={handlePress}
          accessibilityRole='button'
          accessibilityLabel={t('giveaway.banner.headline')}
          accessibilityHint={t('giveaway.welcome.cta')}
        >
          <WigglingGift />
          <View style={styles.textBlock}>
            <Text style={styles.headline} numberOfLines={1}>
              {t('giveaway.banner.headline')}
            </Text>
            <CountdownLine />
          </View>
          <ChevronRight
            color={Theme.textAlternateGray}
            size={20}
            strokeWidth={2.2}
          />
        </Pressable>
        <Pressable
          onPress={handleDismiss}
          hitSlop={12}
          style={({ pressed }) => [
            styles.dismissButton,
            pressed && styles.pressed,
          ]}
          accessibilityRole='button'
          accessibilityLabel={t('common.cancel')}
        >
          <X color={Theme.textInactiveTab} size={16} strokeWidth={2.4} />
        </Pressable>
      </View>
    </View>
  );
}

/**
 * The gift box sits still for ~2.5s, wiggles for ~600ms, repeats forever.
 * Pattern is deliberate: continuous motion is distracting; periodic motion
 * draws the eye exactly when the user might be scanning past it.
 */
function WigglingGift() {
  const rotation = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    rotation.value = withRepeat(
      withSequence(
        withDelay(
          2500,
          withTiming(-12, { duration: 100, easing: Easing.out(Easing.quad) })
        ),
        withTiming(12, { duration: 120, easing: Easing.inOut(Easing.quad) }),
        withTiming(-10, { duration: 120, easing: Easing.inOut(Easing.quad) }),
        withTiming(8, { duration: 120, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 140, easing: Easing.out(Easing.quad) })
      ),
      -1,
      false
    );

    scale.value = withRepeat(
      withSequence(
        withDelay(
          2500,
          withTiming(1.08, { duration: 150, easing: Easing.out(Easing.quad) })
        ),
        withTiming(1, { duration: 450, easing: Easing.out(Easing.quad) })
      ),
      -1,
      false
    );
  }, [rotation, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }, { scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.iconWrap, animatedStyle]}>
      <GiftBoxIcon size={ICON_SIZE} />
    </Animated.View>
  );
}

function CountdownLine() {
  const { t } = useTranslation();
  const { isActive, display } = useGiveawayCountdown();
  if (!isActive) return null;
  return (
    <Text style={styles.countdown} numberOfLines={1}>
      {t('giveaway.banner.countdownPrefix')} {display}
    </Text>
  );
}

const styles = StyleSheet.create({
  outerWrap: {
    paddingTop: 4,
    paddingBottom: 16,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E7',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F2DDA3',
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 72,
  },
  enteredCard: {
    backgroundColor: Theme.white,
    borderColor: Theme.borderCard,
  },
  pressArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconWrap: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textBlock: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
  },
  headline: {
    ...typography.cardTitle,
    color: Theme.black,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  headlineEntered: {
    ...typography.cardTitle,
    color: Theme.black,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  subtext: {
    ...typography.caption,
    color: Theme.textAlternateGray,
    marginTop: 2,
    fontWeight: '500',
  },
  countdown: {
    color: Theme.textAlternateGray,
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  dismissButton: {
    paddingLeft: 10,
    paddingVertical: 4,
  },
  pressed: {
    opacity: 0.6,
  },
});
