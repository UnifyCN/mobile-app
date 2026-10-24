import { typography } from '@/constants/Typography';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import type { LinkProps } from 'expo-router';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Blob3 from '../../assets/images/Blob3.svg';
import Blob8 from '../../assets/images/Blob8.svg';
import Blob10 from '../../assets/images/Blob10.svg';
import Blob11 from '../../assets/images/Blob11.svg';
import Blob12 from '../../assets/images/Blob12.svg';
import { useAnalytics } from '@/utils/analytics';
import type { ModuleProgressStatus } from '@/types/learn';

type Props = {
  title: string;
  modulesLabel: string;
  href?: LinkProps['href'];
  colorTheme?: string;
  icon?: string;
  index?: number;
  moduleId?: string;
  progress?: ModuleProgressStatus;
};

// Map Sanity icon values (snake_case) to MaterialCommunityIcons outline variants
const mapIconName = (iconName: string): string => {
  const iconMap: { [key: string]: string } = {
    // Original icons (keeping for backward compatibility)
    AccountBalanceOutlined: 'bank-outline',
    AssignmentIndOutlined: 'account-tie-outline',
    CottageOutlined: 'home-outline',
    ArticleOutlined: 'file-document-outline',
    PassportOutlined: 'passport',
    // New Sanity icon values (snake_case)
    account_balance: 'bank-outline',
    assignment_ind: 'account-tie-outline',
    cottage: 'home-outline',
    article: 'file-document-outline',
    passport: 'passport',
    school: 'school-outline',
    book: 'book-outline',
    work: 'briefcase-outline',
    computer: 'laptop-outline',
    business: 'office-building-outline',
    science: 'flask-outline',
    language: 'translate',
    history: 'clock-time-four-outline',
    psychology: 'brain',
    menu_book: 'book-open-page-variant',
    auto_stories: 'book-open-outline',
    calculate: 'calculator',
    palette: 'palette-outline',
    music_note: 'music-note-outline',
    sports_esports: 'gamepad-variant-outline',
  };
  return iconMap[iconName] || 'bank-outline';
};

export default function PathwayCard({
  title,
  modulesLabel,
  href,
  colorTheme,
  icon,
  index = 0,
  moduleId,
  progress = 'not_started',
}: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const { trackModuleCardClicked } = useAnalytics();
  const backgroundColor = colorTheme || '#d9d9d9';
  const iconName = mapIconName(icon || 'account_balance');

  // Cycle through blobs: Blob3, Blob8, Blob10, Blob11, Blob12, repeat
  const blobIndex = index % 5;
  const BlobComponent =
    blobIndex === 0
      ? Blob3
      : blobIndex === 1
        ? Blob8
        : blobIndex === 2
          ? Blob10
          : blobIndex === 3
            ? Blob11
            : Blob12;

  const isInProgress = progress === 'in_progress';
  const isCompleted = progress === 'completed';

  const CardInner = (
    <>
      <View style={[styles.banner, { backgroundColor }]}>
        {/* Blob background overlay - cycles through Blob3, Blob8, Blob10, Blob11, Blob12 */}
        <View
          style={
            blobIndex === 0
              ? styles.blob3Container
              : blobIndex === 1
                ? styles.blob8Container
                : blobIndex === 2
                  ? styles.blob10Container
                  : blobIndex === 3
                    ? styles.blob11Container
                    : styles.blob12Container
          }
        >
          <BlobComponent
            width={160}
            height={160}
            fill='#FFFFFF'
            opacity={0.3}
          />
        </View>
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons
            name={iconName as any}
            size={32}
            color='#FFFFFF'
          />
        </View>

        {/* Progress badge — top-left */}
        {isInProgress && (
          <View style={styles.progressBadge}>
            <View style={styles.progressDot} />
            <Text style={styles.progressBadgeText}>
              {t('learn.pathwayCard.continue')}
            </Text>
          </View>
        )}
        {isCompleted && (
          <View style={[styles.progressBadge, styles.completedBadge]}>
            <Feather name='check' size={10} color='#FFFFFF' />
            <Text style={styles.progressBadgeText}>
              {t('learn.pathwayCard.done')}
            </Text>
          </View>
        )}

        <View style={styles.contentContainer}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.meta}>{modulesLabel}</Text>
        </View>
      </View>
    </>
  );

  if (href) {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        style={styles.card}
        onPress={() => {
          if (moduleId) {
            trackModuleCardClicked(moduleId, title);
          }
          router.push(href);
        }}
      >
        {CardInner}
      </TouchableOpacity>
    );
  }

  return <View style={styles.card}>{CardInner}</View>;
}

const styles = StyleSheet.create({
  card: {
    width: '48%',
    minHeight: 148,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#fff',
    paddingTop: 0,
    paddingHorizontal: 0,
    paddingBottom: 0,
    marginBottom: 12,
    shadowColor: '#575757',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  banner: {
    width: '100%',
    minHeight: 148,
    borderRadius: 20,
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 16,
    position: 'relative',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  blob3Container: {
    position: 'absolute',
    top: -68,
    right: -70,
    width: 160,
    height: 160,
    overflow: 'hidden',
    transform: [{ rotate: '-45deg' }],
  },
  blob8Container: {
    position: 'absolute',
    top: -75,
    right: -75,
    width: 160,
    height: 160,
    overflow: 'hidden',
    transform: [{ rotate: '35deg' }],
  },
  blob10Container: {
    position: 'absolute',
    top: -80,
    right: 90,
    width: 160,
    height: 160,
    overflow: 'hidden',
    transform: [{ rotate: '45deg' }],
  },
  blob11Container: {
    position: 'absolute',
    top: -100,
    right: 86,
    width: 160,
    height: 160,
    overflow: 'hidden',
    transform: [{ rotate: '-35deg' }],
  },
  blob12Container: {
    position: 'absolute',
    top: 10,
    right: 42,
    width: 160,
    height: 160,
    overflow: 'hidden',
    transform: [{ rotate: '13deg' }],
  },
  iconContainer: {
    position: 'absolute',
    top: 10,
    right: 16,
    zIndex: 1,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 20,
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  completedBadge: {
    backgroundColor: 'rgba(0,0,0,0.30)',
  },
  progressDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  progressBadgeText: {
    ...typography.caption,

    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  contentContainer: {
    marginTop: 'auto',
  },
  title: {
    ...typography.cardTitle,

    color: '#FFFFFF',
    marginBottom: 0,
  },
  meta: {
    ...typography.secondary,

    color: '#FFFFFF',
  },
});
