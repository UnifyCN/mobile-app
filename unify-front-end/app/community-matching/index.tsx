import { typography } from '@/constants/Typography';
import { useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter, Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { useCurrentUser } from '@/context/UserContext';
import { useOnboardingProfile } from '@/hooks/onboarding/useOnboardingProfile';
import { getActiveCircleMembership } from '@/services/matching/circles';
import { getCurrentWaitlistEntry } from '@/services/matching/waitlist';
import { deriveTimeInCanadaFromArrivalDate } from '@/matching/pools';
import { useTranslation } from 'react-i18next';
import BackHeader from '@/components/BackHeader';
import LoadingScreen from '@/components/LoadingScreen';

// Design colors from Figma
const COLORS = {
  heroIconBackground: '#ffaf63',
  featureIconBackground: '#ff9d40',
  buttonBackground: '#ff9b3d',
  titleColor: '#000000',
  descriptionColor: '#474747',
  backLinkColor: '#585858',
  white: '#ffffff',
};

// Feature highlight component
function FeatureItem({
  icon,
  title,
  description,
  iconType = 'material',
}: {
  icon: string;
  title: string;
  description: string;
  iconType?: 'material' | 'feather';
}) {
  return (
    <View style={featureStyles.item}>
      <View style={featureStyles.iconCircle}>
        {iconType === 'material' ? (
          <MaterialIcons name={icon as any} size={20} color={COLORS.white} />
        ) : (
          <Feather name={icon as any} size={20} color={COLORS.white} />
        )}
      </View>
      <View style={featureStyles.textContainer}>
        <Text style={featureStyles.title}>{title}</Text>
        <Text style={featureStyles.description}>{description}</Text>
      </View>
    </View>
  );
}

const featureStyles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingVertical: 18,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 100,
    backgroundColor: COLORS.featureIconBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    gap: 5,
  },
  title: { ...typography.section, color: COLORS.titleColor },
  description: { ...typography.body, color: COLORS.titleColor },
});

export default function CommunityMatchingHome() {
  const { t } = useTranslation();
  const router = useRouter();
  const { currentUser } = useCurrentUser();

  const { data: onboardingProfile, isLoading: onboardingLoading } =
    useOnboardingProfile(currentUser?.id);

  const {
    data: waitlistEntry,
    isLoading: waitlistLoading,
    refetch: refetchWaitlist,
  } = useQuery({
    queryKey: ['community-waitlist'],
    queryFn: getCurrentWaitlistEntry,
    enabled: !!currentUser,
  });

  const { data: activeCircle, isLoading: circleLoading } = useQuery({
    queryKey: ['community-active-circle'],
    queryFn: getActiveCircleMembership,
    enabled: !!currentUser,
  });

  // Consolidated navigation effect with priority order:
  // 1. Active circle takes precedence - redirect to circle detail
  // 2. Waiting status - redirect to waiting room
  // 3. No waitlist entry - refetch to check status
  useEffect(() => {
    if (activeCircle) {
      const targetRoute = activeCircle.joined_at
        ? `/community-matching/circle/${activeCircle.circle_id}/chat`
        : `/community-matching/circle/${activeCircle.circle_id}`;
      router.replace(targetRoute as Href);
    } else if (waitlistEntry?.status === 'waiting') {
      router.replace('/community-matching/waiting-room' as const);
    } else if (!waitlistEntry && currentUser) {
      refetchWaitlist();
    }
  }, [activeCircle, waitlistEntry, currentUser, router, refetchWaitlist]);

  if (onboardingLoading || waitlistLoading || circleLoading) {
    return <LoadingScreen />;
  }

  const derivedTimeInCanada = deriveTimeInCanadaFromArrivalDate(
    onboardingProfile?.arrival_date
  );
  const hasPersona = !!onboardingProfile?.persona && !!derivedTimeInCanada;

  if (!hasPersona) {
    return (
      <View style={styles.root}>
        <BackHeader title='' onBack={() => router.back()} />
        <View style={styles.incompleteContainer}>
          <View style={styles.incompleteIconCircle}>
            <MaterialIcons name='person-add' size={32} color={COLORS.white} />
          </View>
          <Text style={styles.incompleteTitle}>
            {t('circles.completeProfile')}
          </Text>
          <Text style={styles.incompleteBody}>
            {t('circles.completeProfileBody')}
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() =>
              router.push('/community-matching/complete-onboarding' as const)
            }
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>
              {t('circles.completeOnboarding')}
            </Text>
            <Feather name='arrow-right' size={18} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <BackHeader title='' onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero section */}
        <View style={styles.heroSection}>
          <View style={styles.heroIconCircle}>
            <MaterialIcons name='group-add' size={34} color={COLORS.white} />
          </View>
          <Text style={styles.heroTitle}>{t('circles.title')}</Text>
          <Text style={styles.heroSubtitle}>{t('circles.description')}</Text>
        </View>

        {/* Features section */}
        <View style={styles.featuresSection}>
          <FeatureItem
            icon='group-add'
            iconType='material'
            title={t('circles.matching')}
            description={t('circles.matchingDesc')}
          />
          <FeatureItem
            icon='schedule'
            iconType='material'
            title={t('circles.twoWeekDuration')}
            description={t('circles.twoWeekDesc')}
          />
          <FeatureItem
            icon='chat-bubble'
            iconType='material'
            title={t('circles.groupChat')}
            description={t('circles.groupChatDesc')}
          />
        </View>
      </ScrollView>

      {/* Fixed footer with CTA */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/community-matching/onboarding' as const)}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>
            {t('circles.startMatching')}
          </Text>
          <Feather name='arrow-right' size={18} color={COLORS.white} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.back()}
          activeOpacity={0.6}
        >
          <Text style={styles.secondaryText}>
            {t('circles.backToCommunity')}
          </Text>
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
    paddingTop: 4,
    paddingBottom: 180,
  },
  // Hero section
  heroSection: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  heroIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 100,
    backgroundColor: COLORS.heroIconBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: {
    ...typography.title,
    color: COLORS.titleColor,
    marginBottom: 10,
  },
  heroSubtitle: {
    ...typography.body,
    color: COLORS.descriptionColor,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  // Features section
  featuresSection: {
    marginTop: 8,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    paddingBottom: 26,
    backgroundColor: '#fff',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: COLORS.buttonBackground,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  primaryButtonText: { ...typography.button, color: COLORS.white },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  secondaryText: { ...typography.cardTitle, color: COLORS.backLinkColor },
  // Incomplete onboarding state
  incompleteContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  incompleteIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.heroIconBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  incompleteTitle: {
    ...typography.title,
    color: COLORS.titleColor,
    textAlign: 'center',
  },
  incompleteBody: {
    ...typography.body,
    color: COLORS.descriptionColor,
    textAlign: 'center',
  },
});
