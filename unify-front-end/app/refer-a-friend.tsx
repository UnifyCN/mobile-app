import { typography } from '@/constants/Typography';
import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useTranslation } from 'react-i18next';
import BackHeader from '@/components/BackHeader';
import { Theme } from '@/constants/Theme';
import { useInvite } from '@/hooks/referrals/useInvite';
import { ReferralCounter } from '@/components/referrals/ReferralCounter';
import { useAnalytics, AnalyticsEvents } from '@/utils/analytics';

/**
 * /refer-a-friend — settings sub-route.
 *
 *   ┌────────────────────────────────────┐
 *   │ ← Refer a friend                    │
 *   ├────────────────────────────────────┤
 *   │ headline + subhead                  │
 *   │                                     │
 *   │ ┌─────────────────────────────────┐ │  primary anchor: tap → share
 *   │ │      Invite a friend            │ │  sheet handles everything;
 *   │ └─────────────────────────────────┘ │  code is auto-clipboarded.
 *   │                                     │
 *   │ Your code (small explainer)         │
 *   │ ┌─────────────────────────────────┐ │  smaller pill, fallback only:
 *   │ │ YQAR67                  📋      │ │  verbal sharing or manual entry
 *   │ └─────────────────────────────────┘ │  if clipboard misses.
 *   │                                     │
 *   │ counter (only if > 0 invites)       │
 *   └────────────────────────────────────┘
 */
export default function ReferAFriendScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { code, loading, error, invite, inviting } = useInvite();
  const { capture } = useAnalytics();

  useEffect(() => {
    capture(AnalyticsEvents.INVITE_SCREEN_OPENED, {});
  }, [capture]);

  const handleCopy = async () => {
    if (!code) return;
    try {
      await Clipboard.setStringAsync(code);
      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success
      ).catch(() => {
        /* swallow */
      });
    } catch (err) {
      console.warn('refer-a-friend: copy failed', err);
    }
  };

  const isAndroid = Platform.OS !== 'ios';

  return (
    <View style={styles.container}>
      <BackHeader title={t('referrals.title')} onBack={() => router.back()} />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
      >
        <Text style={styles.headline}>{t('referrals.inviteDesc')}</Text>
        <Text style={styles.subhead}>{t('referrals.newcomersBenefit')}</Text>

        <TouchableOpacity
          onPress={invite}
          disabled={!code || inviting || isAndroid}
          activeOpacity={0.85}
          style={[
            styles.primaryCta,
            (!code || inviting || isAndroid) && styles.primaryCtaDisabled,
          ]}
          accessibilityRole='button'
          accessibilityLabel={t('referrals.inviteAFriend')}
        >
          {inviting ? (
            <ActivityIndicator color={Theme.white} />
          ) : (
            <Text style={styles.primaryCtaText}>
              {t('referrals.inviteAFriend')}
            </Text>
          )}
        </TouchableOpacity>

        {isAndroid ? (
          <Text style={styles.androidNotice}>{t('referrals.iosOnly')}</Text>
        ) : null}

        {error ? (
          <Text style={styles.errorText}>{t('referrals.couldntGenerate')}</Text>
        ) : null}

        <View style={styles.codeSection}>
          <Text style={styles.codeSectionLabel}>
            {t('referrals.yourInviteCode')}
          </Text>
          <Text style={styles.codeSectionExplainer}>
            {t('referrals.inviteCodeHint')}
          </Text>

          <Pressable
            onPress={handleCopy}
            disabled={!code}
            style={({ pressed }) => [
              styles.codePill,
              pressed && styles.codePillPressed,
              !code && styles.codePillDisabled,
            ]}
            accessibilityRole='button'
            accessibilityLabel={
              code
                ? `${t('referrals.yourInviteCode')}: ${code}`
                : t('referrals.loadingInviteCode')
            }
          >
            {loading || !code ? (
              <ActivityIndicator color={Theme.primaryGatherRed} size='small' />
            ) : (
              <>
                <Text style={styles.codePillText}>{code}</Text>
                <Feather
                  name='copy'
                  size={16}
                  color={Theme.textAlternateGray}
                />
              </>
            )}
          </Pressable>
        </View>

        <ReferralCounter />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.white },
  content: { flex: 1 },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 20,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  headline: { ...typography.title, color: Theme.black },
  subhead: { ...typography.body, color: Theme.textAlternateGray },
  primaryCta: {
    height: 56,
    borderRadius: 14,
    backgroundColor: Theme.primaryGatherRed,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryCtaDisabled: { backgroundColor: Theme.disabledGatherRed },
  primaryCtaText: { ...typography.button, color: Theme.white },
  androidNotice: {
    ...typography.caption,
    color: Theme.textPostTime,
    textAlign: 'center',
  },
  errorText: {
    ...typography.secondary,
    color: Theme.destructive,
    textAlign: 'center',
  },
  codeSection: {
    marginTop: 16,
    gap: 8,
  },
  codeSectionLabel: {
    ...typography.caption,
    color: Theme.textAlternateGray,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  codeSectionExplainer: { ...typography.caption, color: Theme.textPostTime },
  codePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#FAF6F0',
    paddingHorizontal: 16,
    marginTop: 4,
  },
  codePillPressed: { opacity: 0.6 },
  codePillDisabled: { opacity: 0.5 },
  codePillText: {
    fontSize: 18,
    letterSpacing: 3,
    fontFamily: 'monospace',
    color: Theme.black,
    fontWeight: '600',
  },
});
