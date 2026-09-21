import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import EventCard from '../cards/EventCard';
import GroupCard from '../cards/GroupCard';
import CirclesCard from '../cards/CirclesCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Figma artboard is 393px. Cap scale so cards stay compact on larger phones.
const FIGMA_WIDTH = 393;
const S = Math.min(SCREEN_WIDTH / FIGMA_WIDTH, 1.05);

// Figma absolute positions (in 393px frame):
// Events card:  x=34,  y=204,  w=300, h=194
// Circles card: x=165, y=137,  w=192, h=112
// Groups card:  x=165, y=368,  w=199, h=155
//
// Container origin at (34, 137):
//   Circles: left=131, top=0
//   Events:  left=0,   top=67
//   Groups:  left=131, top=231
// Container: w=330, h=386

// Shrink event & group cards slightly so they don't dominate the screen
const CARD_S = S * 0.85;

const CONTAINER_W = 300 * S;
const CONTAINER_H = 350 * S;

export default function BelongingScreen() {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.cardsContainer,
          { width: CONTAINER_W, height: CONTAINER_H },
        ]}
      >
        {/* Events card — left side, main card */}
        <View
          style={[
            styles.cardPosition,
            { left: 0, top: 67 * CARD_S, zIndex: 1 },
          ]}
        >
          <EventCard scale={CARD_S} />
        </View>

        {/* Circles card — overlaps top-right of events card */}
        <View
          style={[styles.cardPosition, { left: 110 * S, top: 0, zIndex: 2 }]}
        >
          <CirclesCard scale={CARD_S} />
        </View>

        {/* Groups card — bottom-right */}
        <View
          style={[
            styles.cardPosition,
            { left: 120 * S, top: 210 * CARD_S, zIndex: 2 },
          ]}
        >
          <GroupCard scale={CARD_S} />
        </View>
      </View>

      <View style={styles.textContainer}>
        <Text style={styles.title}>{t('preLogin.belonging.title')}</Text>
        <Text style={styles.description}>
          {t('preLogin.belonging.description')}
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
