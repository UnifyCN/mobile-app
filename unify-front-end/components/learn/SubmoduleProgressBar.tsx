import { typography } from '@/constants/Typography';
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Save from '@/assets/images/Save.svg';
import Save_Fill from '@/assets/images/Save_filled.svg';
import { useTranslation } from 'react-i18next';

const BOOKMARK_ICON_SIZE = 22;

interface SubmoduleProgressBarProps {
  currentProgress: number;
  totalPages: number;
  submoduleTitle: string;
  submoduleOrder: number;
  onClose: () => void;
  /** Lesson content pages only: bookmark control (same row as close). */
  onBookmarkPress?: () => void;
  isBookmarked?: boolean;
  bookmarkLoading?: boolean;
  /**
   * Subject (module) colorTheme.hex. When provided, the fill becomes a
   * subtle tint-to-solid gradient of that color so every lesson flow screen
   * reinforces the module's identity. Falls back to the neutral grey→black
   * gradient when omitted.
   */
  colorHex?: string;
}

// Convert a 6-char hex to an rgba-ish 8-char hex so we can render a
// lighter stop of the same hue without a colour-math dependency. Returns
// the input verbatim if it's already 8-char or not a standard hex.
function withAlpha(hex: string, alpha: number): string {
  if (!hex || hex[0] !== '#' || hex.length !== 7) return hex;
  const clamped = Math.max(0, Math.min(1, alpha));
  const aa = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
  return `${hex}${aa}`;
}

export default function SubmoduleProgressBar({
  currentProgress,
  totalPages,
  submoduleTitle,
  submoduleOrder,
  onClose,
  onBookmarkPress,
  isBookmarked = false,
  bookmarkLoading = false,
  colorHex,
}: SubmoduleProgressBarProps) {
  const { t } = useTranslation();
  const progressPercentage =
    totalPages > 0 ? (currentProgress / totalPages) * 100 : 0;

  const showBookmark = typeof onBookmarkPress === 'function';

  // Themed fill: a lighter tint of the subject colour at the leading edge
  // ramps up to the full colour at the filled end. Gives the bar a sense of
  // momentum without fighting the subject palette.
  const gradientColors: readonly [string, string] = colorHex
    ? [withAlpha(colorHex, 0.55), colorHex]
    : ['#797977', '#000000'];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onClose}
          style={styles.headerSide}
          accessibilityRole='button'
          accessibilityLabel={t('learn.lesson.closeLessonA11y')}
        >
          <Feather name='x' size={20} color='#878787' />
        </TouchableOpacity>

        <Text style={styles.title} numberOfLines={2}>
          {t('learn.module.section', { number: submoduleOrder })}:{' '}
          {submoduleTitle}
        </Text>

        <View style={styles.headerSide}>
          {showBookmark ? (
            <TouchableOpacity
              onPress={onBookmarkPress}
              disabled={bookmarkLoading}
              style={styles.bookmarkButton}
              accessibilityRole='button'
              accessibilityLabel={
                isBookmarked
                  ? t('learn.lesson.removeSavedPage')
                  : t('learn.lesson.saveLessonPage')
              }
            >
              {bookmarkLoading ? (
                <ActivityIndicator size='small' color='#878787' />
              ) : isBookmarked ? (
                <Save_Fill
                  width={BOOKMARK_ICON_SIZE}
                  height={BOOKMARK_ICON_SIZE}
                />
              ) : (
                <Save width={BOOKMARK_ICON_SIZE} height={BOOKMARK_ICON_SIZE} />
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.progressBarContainer}>
        <View style={styles.progressBarBackground}>
          <LinearGradient
            colors={gradientColors as unknown as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[
              styles.progressBarFill,
              { width: `${Math.min(progressPercentage, 100)}%` },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const SIDE_WIDTH = 44;

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    paddingTop: 30,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: '2%',
  },
  headerSide: {
    width: SIDE_WIDTH,
    minHeight: SIDE_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookmarkButton: {
    padding: 4,
  },
  title: {
    ...typography.cardTitle,
    flex: 1,
    color: '#343434',
    textAlign: 'center',
  },
  progressBarContainer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: '#EEEEEE',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  label: {
    ...typography.caption,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
});
