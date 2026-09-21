import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Link, Href } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Theme } from '@/constants/Theme';
import { useTranslation } from 'react-i18next';

interface LessonHeroCardProps {
  moduleTitle?: string;
  submoduleTitle?: string;
  currentPage?: number;
  totalPages?: number;
  currentSection?: number;
  totalSections?: number;
  colorHex?: string;
  icon?: string;
  href?: Href;
}

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

export default function LessonHeroCard({
  moduleTitle = '',
  submoduleTitle = '',
  currentPage = 1,
  totalPages = 8,
  currentSection = 1,
  totalSections = 4,
  colorHex,
  icon,
  href,
}: LessonHeroCardProps) {
  const { t } = useTranslation();
  const iconName = mapIconName(icon || 'account_balance');

  const cardContent = (
    <View style={styles.card}>
      <View style={styles.content}>
        {/* Icon on top-left */}
        <View style={styles.iconContainer}>
          <MaterialCommunityIcons
            name={iconName as any}
            size={36}
            color={colorHex || '#000000'}
          />
        </View>

        {href && (
          <View style={styles.continueButtonContainer}>
            <View
              style={[
                styles.continueButton,
                colorHex ? { backgroundColor: colorHex } : null,
              ]}
            >
              <Text style={styles.continueButtonText}>{t('learn.heroCard.continue')}</Text>
            </View>
          </View>
        )}

        <View style={styles.textContainer}>
          <Text style={styles.metaText}>
            {t('learn.heroCard.sectionOf', {
              module: moduleTitle,
              current: currentSection,
              total: totalSections,
            })}
          </Text>
          <Text style={styles.title}>{submoduleTitle}</Text>
        </View>
      </View>
    </View>
  );

  if (href) {
    return (
      <Link href={href} asChild>
        <TouchableOpacity
          accessibilityRole='link'
          accessibilityLabel={
            submoduleTitle ? t('learn.heroCard.resumeSubmodule', { title: submoduleTitle }) : t('learn.heroCard.resumeLesson')
          }
        >
          {cardContent}
        </TouchableOpacity>
      </Link>
    );
  }

  return cardContent;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderWidth: 0.8,
    borderColor: '#CDCBCB',
    borderRadius: 16,
    padding: 0,
    marginRight: 10,
    shadowOffset: { width: 0, height: 3 },
    overflow: 'hidden',
  },
  content: {
    minHeight: 160,
    borderRadius: 16,
    backgroundColor: '#fff',
    padding: 20,
    position: 'relative',
  },
  iconContainer: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 1,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonContainer: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 2,
    minWidth: 101,
    height: 36,
    borderRadius: 10,
  },
  continueButton: {
    width: '100%',
    height: '100%',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Theme.primaryGatherRed,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 22,
  },
  textContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    zIndex: 1,
  },
  metaText: {
    color: '#000000',
    fontSize: 14,
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#000000',
    lineHeight: 28,
  },
});
