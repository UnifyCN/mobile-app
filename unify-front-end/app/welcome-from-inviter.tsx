import { typography } from '@/constants/Typography';
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  AccessibilityInfo,
  Dimensions,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useRouter } from 'expo-router';

import { useTranslation } from 'react-i18next';
import { Theme } from '@/constants/Theme';
import { Avatar } from '@/components/Avatar';
import { useReferralLookup } from '@/hooks/referrals/useReferralLookup';
import {
  GroupCarryoverList,
  useGroupSelection,
} from '@/components/referrals/GroupCarryoverList';
import { supabase } from '@/lib/supabase';
import { useAnalytics, AnalyticsEvents } from '@/utils/analytics';
import { useCurrentUser } from '@/context/UserContext';

/**
 * /welcome-from-inviter — variant A from /plan-design-review.
 *
 *   ┌────────────────────┐
 *   │   ✨ confetti ✨    │  one-shot ~1.2s, respects Reduce Motion
 *   │     [Avatar 120]    │  inviter is the visual anchor
 *   │  You are here       │
 *   │  because of Sarah.  │  30px Bold, near-black
 *   │  Sarah from Toronto │  16px regular gray (city if available)
 *   │  invited you...     │
 *   │  ┌──────────────┐   │
 *   │  │ Say hi to S. │   │  primary orange CTA
 *   │  └──────────────┘   │
 *   │  ┌──────────────┐   │
 *   │  │ Join groups  │   │  secondary outlined (only if any groups)
 *   │  └──────────────┘   │
 *   │     Skip for now    │
 *   └────────────────────┘
 *
 * Reachable only when the post-onboarding redeem returned success. If the lookup
 * fails (no referral row, or inviter deleted), renders a neutral fallback and
 * lets the user continue to home.
 *
 * No back button — this is a moment, not a place.
 */
export default function WelcomeFromInviterScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { capture } = useAnalytics();
  const { currentUser } = useCurrentUser();
  const { data, isLoading } = useReferralLookup();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {
        // ignore — default false
      });
  }, []);

  const inviter = data?.inviter ?? null;
  const groups = useMemo(() => [], []); // Welcome screen is reached after redeem;
  // for now we don't re-fetch the groups carryover client-side. The redeem-referral
  // edge fn returned them, but we don't currently persist that response across the
  // navigation hop. Future: wire navigation params or a dedicated query. For v1
  // we render group carryover only when groups are available; without them we skip
  // straight to "Say hi" + Skip — which the design plan explicitly accepts.

  const { selected, toggle } = useGroupSelection([]);

  const goHome = () => router.replace('/(tabs)' as any);

  const handleSayHi = () => {
    if (!inviter) return goHome();
    // Drop the user on the inviter's profile so they can DM/follow from there.
    router.replace({
      pathname: '/profile' as any,
      params: { userId: inviter.id },
    });
  };

  const handleJoinGroups = async () => {
    if (!currentUser?.id || !inviter || groups.length === 0) return goHome();
    if (selected.size === 0) return goHome();

    setJoining(true);
    try {
      const rows = Array.from(selected).map(group_id => ({
        user_id: currentUser.id,
        group_id,
      }));
      const { error } = await supabase.from('group_members').upsert(rows, {
        onConflict: 'user_id,group_id',
        ignoreDuplicates: true,
      });
      if (error) {
        console.error('welcome: group join error', error);
      } else {
        capture(AnalyticsEvents.INVITE_GROUPS_JOINED_AT_SIGNUP, {
          inviter_id: inviter.id,
          invitee_id: currentUser.id,
          group_count: rows.length,
        });
      }
    } finally {
      setJoining(false);
      goHome();
    }
  };

  // Loading skeleton (1.5s budget; if `isLoading` past that, the parent renders
  // generic fallback via the `!inviter` branch below).
  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size='large' color={Theme.primaryGatherRed} />
      </View>
    );
  }

  if (!inviter) {
    return (
      <View style={styles.container}>
        <View style={styles.intimate}>
          <Text style={styles.headline}>{t('welcome.title')}</Text>
          <Text style={styles.subhead}>{t('welcome.subtitle')}</Text>
          <TouchableOpacity
            onPress={goHome}
            style={styles.primaryCta}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryCtaText}>
              {t('welcome.continueButton')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const inviterName = inviter.username;
  const nameWithCity = inviter.city
    ? `${inviterName} ${t('welcome.fromCity', { city: inviter.city })}`
    : inviterName;
  const sayHiLabel = t('welcome.sayHi', { name: inviterName });
  const joinLabel = t('welcome.joinGroups', {
    name: inviterName,
    count: groups.length,
  });

  return (
    <View style={styles.container}>
      {!reduceMotion && (
        <View pointerEvents='none' style={StyleSheet.absoluteFill}>
          <ConfettiCannon
            count={80}
            origin={{ x: Dimensions.get('window').width / 2, y: -10 }}
            fadeOut
            autoStart
            explosionSpeed={350}
            fallSpeed={1500}
            colors={[Theme.primaryGatherRed, '#FFD9A8', '#FAF6F0', '#FCEBD0']}
          />
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intimate}>
          <View style={styles.avatarRing}>
            <Avatar
              profilePictureUrl={inviter.profile_picture_url ?? undefined}
              username={inviterName}
              size={120}
            />
          </View>

          <Text style={styles.headline} accessibilityRole='header'>
            {t('welcome.becauseOf', { name: inviterName })}
          </Text>

          <Text style={styles.subhead}>
            {t('welcome.invitedYou', { name: nameWithCity })}
          </Text>

          <TouchableOpacity
            onPress={handleSayHi}
            activeOpacity={0.85}
            style={styles.primaryCta}
            accessibilityRole='button'
            accessibilityLabel={sayHiLabel}
          >
            <Text style={styles.primaryCtaText}>{sayHiLabel}</Text>
          </TouchableOpacity>

          {groups.length > 0 ? (
            <>
              <GroupCarryoverList
                inviterName={inviterName}
                groups={groups}
                selected={selected}
                onToggle={toggle}
              />
              <TouchableOpacity
                onPress={handleJoinGroups}
                activeOpacity={0.85}
                disabled={joining}
                style={[styles.secondaryCta, joining && { opacity: 0.6 }]}
                accessibilityRole='button'
                accessibilityLabel={joinLabel}
              >
                {joining ? (
                  <ActivityIndicator color={Theme.primaryGatherRed} />
                ) : (
                  <Text style={styles.secondaryCtaText}>{joinLabel}</Text>
                )}
              </TouchableOpacity>
            </>
          ) : null}

          <Pressable
            onPress={goHome}
            style={styles.skipPressable}
            accessibilityRole='button'
            accessibilityLabel={t('welcome.skipForNow')}
            hitSlop={8}
          >
            <Text style={styles.skipText}>{t('welcome.skipForNow')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  intimate: {
    width: '100%',
    maxWidth: 480, // never spread to fill iPad — keep the moment intimate
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 18,
  },
  avatarRing: {
    padding: 4,
    borderRadius: 999,
    shadowColor: Theme.primaryGatherRed,
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  headline: {
    ...typography.title,
    color: Theme.black,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  subhead: {
    ...typography.body,
    color: Theme.textAlternateGray,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  primaryCta: {
    width: '100%',
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: Theme.primaryGatherRed,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  primaryCtaText: {
    ...typography.button,
    color: Theme.white,
    textAlign: 'center',
  },
  secondaryCta: {
    width: '100%',
    minHeight: 56,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Theme.borderCard,
    backgroundColor: Theme.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  secondaryCtaText: {
    ...typography.button,
    color: Theme.black,
    textAlign: 'center',
  },
  skipPressable: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  skipText: {
    ...typography.secondary,
    color: Theme.textInput,
    textAlign: 'center',
  },
});
