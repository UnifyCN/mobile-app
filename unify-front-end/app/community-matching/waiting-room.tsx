import React, { useEffect, useState, useRef } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Animated,
  Easing,
} from 'react-native';
import { useRouter, Href } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useCurrentUser } from '@/context/UserContext';
import {
  getCurrentWaitlistEntry,
  leaveCommunityWaitlist,
} from '@/services/matching/waitlist';
import { getActiveCircleMembership } from '@/services/matching/circles';
import { formatPersonaLabel, formatTimeInCanadaLabel } from '@/matching/pools';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import BackHeader from '@/components/BackHeader';
import LoadingScreen from '@/components/LoadingScreen';
import { formatRelativeTime } from '@/helpers/dateHelpers';

// Animated ripple circles for the waiting indicator
function WaitingAnimation() {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createRipple = (animatedValue: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(animatedValue, {
            toValue: 1,
            duration: 2000,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(animatedValue, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );
    };

    const animation1 = createRipple(ring1, 0);
    const animation2 = createRipple(ring2, 600);
    const animation3 = createRipple(ring3, 1200);

    animation1.start();
    animation2.start();
    animation3.start();

    return () => {
      animation1.stop();
      animation2.stop();
      animation3.stop();
    };
  }, [ring1, ring2, ring3]);

  const getAnimatedStyle = (animatedValue: Animated.Value) => ({
    transform: [
      {
        scale: animatedValue.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 2.5],
        }),
      },
    ],
    opacity: animatedValue.interpolate({
      inputRange: [0, 1],
      outputRange: [0.6, 0],
    }),
  });

  return (
    <View style={animStyles.container}>
      <Animated.View style={[animStyles.ring, getAnimatedStyle(ring1)]} />
      <Animated.View style={[animStyles.ring, getAnimatedStyle(ring2)]} />
      <Animated.View style={[animStyles.ring, getAnimatedStyle(ring3)]} />
      <View style={animStyles.centerCircle}>
        <Feather name='users' size={32} color='#fff' />
      </View>
    </View>
  );
}

const animStyles = StyleSheet.create({
  container: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 0,
    marginBottom: 10,
  },
  ring: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ff9d40',
  },
  centerCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ff9d40',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ff9d40',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
});

// Step item component with checkmark animation potential
function StepItem({ text, icon }: { text: string; icon: string }) {
  return (
    <View style={stepStyles.item}>
      <View style={stepStyles.iconCircle}>
        <Feather name={icon as any} size={16} color='#ff820b' />
      </View>
      <Text style={stepStyles.text}>{text}</Text>
    </View>
  );
}

const stepStyles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff3e6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    color: '#374151',
    fontSize: 15,
    lineHeight: 21,
  },
});

export default function WaitingRoomScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { currentUser } = useCurrentUser();
  const [joiningCircleId, setJoiningCircleId] = useState<string | null>(null);

  const {
    data: waitlistEntry,
    isLoading,
    refetch: refetchWaitlist,
  } = useQuery({
    queryKey: ['community-waitlist'],
    queryFn: getCurrentWaitlistEntry,
    enabled: !!currentUser,
  });

  const { data: activeCircle } = useQuery({
    queryKey: ['community-active-circle'],
    queryFn: getActiveCircleMembership,
    enabled: !!currentUser,
  });

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    const waitlistChannel = supabase
      .channel(`community-waitlist-${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_match_waitlist',
          filter: `user_id=eq.${currentUser.id}`,
        },
        () => refetchWaitlist()
      )
      .subscribe();

    const membersChannel = supabase
      .channel(`community-circle-members-${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_circle_members',
          filter: `user_id=eq.${currentUser.id}`,
        },
        payload => {
          setJoiningCircleId(payload.new.circle_id);
          router.replace(
            `/community-matching/circle/${payload.new.circle_id}` as Href
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(waitlistChannel);
      supabase.removeChannel(membersChannel);
    };
  }, [currentUser, refetchWaitlist, router]);

  useEffect(() => {
    if (activeCircle) {
      const targetRoute = activeCircle.joined_at
        ? `/community-matching/circle/${activeCircle.circle_id}/chat`
        : `/community-matching/circle/${activeCircle.circle_id}`;
      router.replace(targetRoute as Href);
    }
  }, [activeCircle, router]);

  useEffect(() => {
    if (!isLoading && !waitlistEntry && !joiningCircleId) {
      router.replace('/community-matching' as Href);
    }
  }, [waitlistEntry, isLoading, router, joiningCircleId]);

  const handleLeave = async () => {
    Alert.alert(
      t('circles.leaveWaitlistTitle'),
      t('circles.leaveWaitlistMessage'),
      [
        { text: t('circles.stay'), style: 'cancel' },
        {
          text: t('circles.leave'),
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveCommunityWaitlist();
              await queryClient.invalidateQueries({
                queryKey: ['community-waitlist'],
              });
              router.replace('/community-matching' as Href);
            } catch (error) {
              console.error('Failed to leave waitlist', error);
              Alert.alert(
                t('common.somethingWentWrong'),
                t('common.tryAgain')
              );
            }
          },
        },
      ]
    );
  };

  if (isLoading || !waitlistEntry) {
    return <LoadingScreen />;
  }

  const timeAgo = formatRelativeTime(waitlistEntry.created_at);

  return (
    <View style={styles.root}>
      <BackHeader
        title=''
        onBack={() => router.replace('/(tabs)/Gather' as Href)}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Animated waiting indicator */}
        <WaitingAnimation />

        {/* Status badge */}
        <View style={styles.statusBadge}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>{t('circles.lookingForCircle')}</Text>
        </View>

        {/* Title section */}
        <Text style={styles.title}>{t('circles.hangTight')}</Text>
        <Text style={styles.subtitle}>
          {t('circles.findingNewcomers')}
        </Text>

        {/* Your matching criteria */}
        <View style={styles.criteriaCard}>
          <Text style={styles.criteriaLabel}>{t('circles.yourMatchingGroup')}</Text>
          <View style={styles.criteriaRow}>
            <Feather name='user' size={16} color='#ff820b' />
            <Text style={styles.criteriaText}>
              {formatPersonaLabel(t, waitlistEntry.persona)}
            </Text>
          </View>
          <View style={styles.criteriaRow}>
            <Feather name='calendar' size={16} color='#ff820b' />
            <Text style={styles.criteriaText}>
              {formatTimeInCanadaLabel(t, waitlistEntry.time_in_canada)}
            </Text>
          </View>
        </View>

        {/* How it works section */}
        <View style={styles.stepsCard}>
          <Text style={styles.stepsHeading}>{t('circles.howMatchingWorks')}</Text>
          <StepItem
            text={t('circles.checkMatches')}
            icon='clock'
          />
          <StepItem
            text={t('circles.groupsForm')}
            icon='users'
          />
          <StepItem
            text={t('circles.notifiedWhenMatched')}
            icon='bell'
          />
        </View>

        {/* Joined timestamp */}
        <View style={styles.joinedInfo}>
          <Feather name='check-circle' size={16} color='#0F8B54' />
          <Text style={styles.joinedText}>{t('circles.joinedTime', { time: timeAgo })}</Text>
        </View>
      </ScrollView>

      {/* Leave button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.leaveButton}
          onPress={handleLeave}
          activeOpacity={0.7}
        >
          <Text style={styles.leaveButtonText}>{t('circles.leaveWaitlist')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 160,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#ECFDF5',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    gap: 8,
    marginBottom: 16,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  statusText: {
    color: '#059669',
    fontWeight: '600',
    fontSize: 14,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  criteriaCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  criteriaLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  criteriaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  criteriaText: {
    fontSize: 15,
    color: '#334155',
    fontWeight: '500',
  },
  stepsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  stepsHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  joinedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  joinedText: {
    color: '#0F8B54',
    fontSize: 14,
    fontWeight: '500',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    paddingBottom: 34,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  leaveButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  leaveButtonText: {
    color: '#DC2626',
    fontSize: 16,
    fontWeight: '600',
  },
});
