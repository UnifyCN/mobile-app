import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import ChecklistCard from '../cards/ChecklistCard';
import ChecklistModalCard from '../cards/ChecklistModalCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Figma artboard is 393px. Cap scale so cards stay compact on larger phones.
const FIGMA_WIDTH = 393;
const S = Math.min(SCREEN_WIDTH / FIGMA_WIDTH, 1.05);

// Shrink cards slightly so they fit nicely
const CARD_S = S * 0.85;

// Figma positions (393px frame):
// Checklist card: x=34, y=126
// Modal card:     x=127, y=306
//
// Container origin at (34, 126):
//   Checklist: left=0, top=0
//   Modal:     left=93, top=180

const CONTAINER_W = 330 * S;
const CONTAINER_H = 406 * S;

export default function ChecklistScreen() {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.cardsContainer,
          { width: CONTAINER_W, height: CONTAINER_H },
        ]}
      >
        {/* Checklist card — left side */}
        <View style={[styles.cardPosition, { left: 0, top: 0, zIndex: 1 }]}>
          <ChecklistCard scale={CARD_S} />
        </View>

        {/* Modal card — overlaps right side */}
        <View
          style={[
            styles.cardPosition,
            { left: 93 * S, top: 180 * S, zIndex: 2 },
          ]}
        >
          <ChecklistModalCard scale={CARD_S} />
        </View>
      </View>

      <View style={styles.textContainer}>
        <Text style={styles.title}>{t('preLogin.checklist.title')}</Text>
        <Text style={styles.description}>
          {t('preLogin.checklist.description')}
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
