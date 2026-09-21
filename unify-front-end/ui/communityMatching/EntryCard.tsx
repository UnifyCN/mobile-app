import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter, Href } from 'expo-router';
import { useCurrentUser } from '@/context/UserContext';
import { getCurrentWaitlistEntry } from '@/services/matching/waitlist';
import { getActiveCircleMembership } from '@/services/matching/circles';

// Design colors from Figma
const COLORS = {
  cardBackground: '#f68b26',
  ellipse1: '#ff9d40',
  ellipse2: '#f59d4a',
  semiTransparentWhite: 'rgba(255,255,255,0.24)',
  white: '#ffffff',
};

interface EntryCardProps {
  onPress: () => void;
}

export function CommunityMatchingEntryCard({ onPress }: EntryCardProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { currentUser } = useCurrentUser();

  const { data: waitlistEntry, isLoading: waitlistLoading } = useQuery({
    queryKey: ['community-waitlist', currentUser?.id],
    queryFn: getCurrentWaitlistEntry,
    enabled: !!currentUser,
  });

  const { data: activeCircle, isLoading: circleLoading } = useQuery({
    queryKey: ['community-active-circle', currentUser?.id],
    queryFn: getActiveCircleMembership,
    enabled: !!currentUser,
  });

  const isLoading = waitlistLoading || circleLoading;
  const isInCircle = !!activeCircle;
  const isWaiting = waitlistEntry?.status === 'waiting';

  const handlePress = () => {
    if (activeCircle) {
      const targetRoute = activeCircle.joined_at
        ? `/community-matching/circle/${activeCircle.circle_id}/chat`
        : `/community-matching/circle/${activeCircle.circle_id}`;
      router.push(targetRoute as Href);
    } else if (isWaiting) {
      router.push('/community-matching/waiting-room' as Href);
    } else {
      onPress();
    }
  };

  const getStatusContent = () => {
    if (isLoading) {
      return {
        icon: null,
        badge: null,
        cta: t('common.loading'),
      };
    }
    if (isInCircle) {
      return {
        icon: 'message-circle' as const,
        badge: {
          text: t('circles.entryCard.inCircleBadge'),
          color: COLORS.white,
          bg: COLORS.semiTransparentWhite,
        },
        cta: t('circles.entryCard.inCircleCta'),
      };
    }
    if (isWaiting) {
      return {
        icon: 'clock' as const,
        badge: {
          text: t('circles.entryCard.waitingBadge'),
          color: COLORS.white,
          bg: COLORS.semiTransparentWhite,
        },
        cta: t('circles.entryCard.waitingCta'),
      };
    }
    return {
      icon: 'group-add' as const, // MaterialIcons icon
      badge: null,
      cta: t('circles.entryCard.joinCta'),
    };
  };

  const status = getStatusContent();

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={handlePress}
      activeOpacity={0.85}
    >
      {/* Decorative ellipses */}
      <View style={styles.ellipse1} />
      <View style={styles.ellipse2} />

      {/* Content */}
      <View style={styles.content}>
        {/* Icon */}
        <View style={styles.iconContainer}>
          {isLoading ? (
            <ActivityIndicator size='small' color={COLORS.white} />
          ) : status.icon === 'group-add' ? (
            <MaterialIcons name='group-add' size={20} color={COLORS.white} />
          ) : (
            <Feather name={status.icon!} size={20} color={COLORS.white} />
          )}
        </View>

        {/* Text content */}
        <View style={styles.copy}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{t('circles.title')}</Text>
            {status.badge && (
              <View
                style={[styles.badge, { backgroundColor: status.badge.bg }]}
              >
                <Text style={[styles.badgeText, { color: status.badge.color }]}>
                  {status.badge.text}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.subtitle}>
            {isInCircle
              ? t('circles.entryCard.inCircleSubtitle')
              : isWaiting
                ? t('circles.entryCard.waitingSubtitle')
                : t('preLogin.circles.description')}
          </Text>
        </View>
      </View>

      {/* CTA Button */}
      <View style={styles.ctaButton}>
        <Text style={styles.ctaText}>{status.cta}</Text>
        <Feather name='arrow-right' size={18} color={COLORS.white} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 15,
    marginHorizontal: 20,
    backgroundColor: COLORS.cardBackground,
    overflow: 'hidden',
    gap: 14,
  },
  // Decorative ellipses
  ellipse1: {
    position: 'absolute',
    top: -20,
    right: -10,
    width: 93,
    height: 89,
    borderRadius: 50,
    backgroundColor: COLORS.ellipse1,
  },
  ellipse2: {
    position: 'absolute',
    top: 30,
    right: 40,
    width: 93,
    height: 89,
    borderRadius: 50,
    backgroundColor: COLORS.ellipse2,
  },
  content: {
    gap: 14,
    zIndex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 100,
    backgroundColor: COLORS.semiTransparentWhite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    gap: 5,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.white,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 18,
    color: COLORS.white,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.semiTransparentWhite,
    borderWidth: 1,
    borderColor: COLORS.white,
    paddingVertical: 10,
    paddingHorizontal: 40,
    borderRadius: 12,
    gap: 12,
    zIndex: 1,
  },
  ctaText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
