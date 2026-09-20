import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { formatNumber } from '@/utils/formatNumber';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const FIGMA_WIDTH = 393;
const S = Math.min(SCREEN_WIDTH / FIGMA_WIDTH, 1.05);

// Figma positions (393px frame):
// Finance:       x=0,   y=135, w=172, h=118
// Employment:    x=205, y=203, w=169, h=116
// Housing:       x=18,  y=330, w=149, h=102
// Documentation: x=225, y=370, w=203, h=139
//
// Container origin at (0, 135):
const CONTAINER_W = SCREEN_WIDTH;
const CONTAINER_H = 374 * S;

interface SubjectCardProps {
  color: string;
  iconName: keyof typeof Ionicons.glyphMap;
  title: string;
  sections: string;
  width: number;
  height: number;
  borderRadius: number;
}

function SubjectCard({
  color,
  iconName,
  title,
  sections,
  width,
  height,
  borderRadius,
}: SubjectCardProps) {
  const w = width * S;
  const h = height * S;
  const r = borderRadius * S;

  return (
    <View
      style={[
        styles.subjectCard,
        { width: w, height: h, borderRadius: r, backgroundColor: color },
      ]}
    >
      {/* Decorative blob approximation */}
      <View
        style={[
          styles.blob,
          {
            width: w * 0.7,
            height: w * 0.7,
            borderRadius: w * 0.35,
            backgroundColor: 'rgba(255,255,255,0.12)',
            top: -w * 0.25,
            left: -w * 0.15,
          },
        ]}
      />

      {/* Icon — top right */}
      <View style={[styles.iconContainer, { top: 10 * S, right: 14 * S }]}>
        <Ionicons
          name={iconName}
          size={28 * S}
          color='rgba(255,255,255,0.85)'
        />
      </View>

      {/* Title + sections — bottom left */}
      <View
        style={[styles.cardTextContainer, { left: 14 * S, bottom: 10 * S }]}
      >
        <Text style={[styles.cardTitle, { fontSize: 18 * (h / 118) }]}>
          {title}
        </Text>
        <Text style={[styles.cardSections, { fontSize: 14 * (h / 118) }]}>
          {sections}
        </Text>
      </View>
    </View>
  );
}

export default function LearnScreen() {
  const { t } = useTranslation();
  const sectionsLabel = (total: number) =>
    t('preLogin.learn.sections', { total: formatNumber(total) });

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.cardsContainer,
          { width: CONTAINER_W, height: CONTAINER_H },
        ]}
      >
        {/* Finance — top left */}
        <View style={[styles.cardPosition, { left: 0, top: 0, zIndex: 1 }]}>
          <SubjectCard
            color='#2FA43C'
            iconName='business-outline'
            title={t('preLogin.learn.subjects.finance')}
            sections={sectionsLabel(8)}
            width={172}
            height={118}
            borderRadius={20}
          />
        </View>

        {/* Employment — middle right */}
        <View
          style={[
            styles.cardPosition,
            { left: 205 * S, top: 68 * S, zIndex: 1 },
          ]}
        >
          <SubjectCard
            color='#985DBB'
            iconName='person-outline'
            title={t('preLogin.learn.subjects.employment')}
            sections={sectionsLabel(5)}
            width={169}
            height={116}
            borderRadius={20}
          />
        </View>

        {/* Housing — lower left */}
        <View
          style={[
            styles.cardPosition,
            { left: 18 * S, top: 195 * S, zIndex: 1 },
          ]}
        >
          <SubjectCard
            color='#E78D42'
            iconName='home-outline'
            title={t('preLogin.learn.subjects.housing')}
            sections={sectionsLabel(3)}
            width={149}
            height={102}
            borderRadius={17}
          />
        </View>

        {/* Documentation — bottom right */}
        <View
          style={[
            styles.cardPosition,
            { left: 225 * S, top: 235 * S, zIndex: 1 },
          ]}
        >
          <SubjectCard
            color='#2C7ACD'
            iconName='document-text-outline'
            title={t('preLogin.learn.subjects.documentation')}
            sections={sectionsLabel(5)}
            width={203}
            height={139}
            borderRadius={24}
          />
        </View>
      </View>

      <View style={styles.textContainer}>
        <Text style={styles.title}>{t('preLogin.learn.title')}</Text>
        <Text style={styles.description}>
          {t('preLogin.learn.description')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardsContainer: {
    position: 'relative',
    marginBottom: 24,
  },
  cardPosition: {
    position: 'absolute',
  },
  subjectCard: {
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  blob: {
    position: 'absolute',
  },
  iconContainer: {
    position: 'absolute',
  },
  cardTextContainer: {
    position: 'absolute',
    gap: 2,
  },
  cardTitle: {
    fontFamily: 'FunnelSans_600SemiBold',
    color: '#fff',
  },
  cardSections: {
    fontFamily: 'FunnelSans_400Regular',
    color: '#fff',
  },
  textContainer: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 40,
  },
  title: {
    fontFamily: 'FunnelSans_600SemiBold',
    fontSize: 24,
    lineHeight: 30,
    color: '#000',
    textAlign: 'center',
  },
  description: {
    fontFamily: 'FunnelSans_400Regular',
    fontSize: 16,
    lineHeight: 20,
    color: '#000',
    textAlign: 'center',
    maxWidth: 313,
  },
});
