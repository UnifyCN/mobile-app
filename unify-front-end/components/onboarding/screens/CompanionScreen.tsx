import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const FIGMA_WIDTH = 393;
const S = Math.min(SCREEN_WIDTH / FIGMA_WIDTH, 1.05);

// Figma positions (393px frame):
// User bubble:    ~right-aligned, y=127, w=225, h=87
// AI response:    x=30, y=215, w=263, h=299
// Ask Anything:   x=30, y=446, w=159, h=89
// Form Help:      x=203, y=446, w=159, h=89
//
// Container origin at (30, 127):
//   User bubble: right-aligned, top=0
//   AI response: left=0, top=88
//   Feature cards: top=319

const CONTAINER_W = 335 * S;
const CONTAINER_H = 415 * S;

function UserBubble() {
  const { t } = useTranslation();

  return (
    <View
      style={[
        styles.userBubble,
        {
          maxWidth: 225 * S,
          borderRadius: 14 * S,
          padding: 12 * S,
        },
      ]}
    >
      <Text
        style={[
          styles.userBubbleText,
          { fontSize: 12.5 * S, lineHeight: 17 * S },
        ]}
      >
        {t('preLogin.companion.userMessage')}
      </Text>
    </View>
  );
}

function AIResponse() {
  const { t } = useTranslation();

  return (
    <View
      style={[
        styles.aiResponse,
        {
          width: 263 * S,
          height: 260 * S,
          borderRadius: 16 * S,
          padding: 16 * S,
        },
      ]}
    >
      <Text
        style={[styles.aiHeading, { fontSize: 14 * S, marginBottom: 8 * S }]}
      >
        {t('preLogin.companion.atAGlance')}
      </Text>
      <Text style={[styles.aiBody, { fontSize: 11.5 * S, lineHeight: 16 * S }]}>
        {t('preLogin.companion.glanceBody')}
      </Text>
      <Text
        style={[
          styles.aiHeading,
          { fontSize: 14 * S, marginTop: 14 * S, marginBottom: 6 * S },
        ]}
      >
        {t('preLogin.companion.whatToKnow')}
      </Text>
      <Text
        style={[styles.aiBody, { fontSize: 11.5 * S, lineHeight: 16 * S }]}
        numberOfLines={2}
      >
        <Text style={styles.aiBold}>
          {t('preLogin.companion.translinkLabel')}
        </Text>{' '}
        {t('preLogin.companion.translinkBody')}
      </Text>
    </View>
  );
}

function FeatureCard({
  iconName,
  iconBg,
  title,
  description,
}: {
  iconName: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  title: string;
  description: string;
}) {
  return (
    <View
      style={[
        styles.featureCard,
        {
          width: 159 * S,
          height: 89 * S,
          borderRadius: 12 * S,
          paddingHorizontal: 10 * S,
          paddingVertical: 8 * S,
          gap: 10 * S,
        },
      ]}
    >
      <View
        style={[
          styles.featureCardHeader,
          { height: 29 * S, borderRadius: 4 * S },
        ]}
      >
        <View
          style={[
            styles.featureIcon,
            {
              width: 29 * S,
              height: 29 * S,
              borderRadius: 4 * S,
              backgroundColor: iconBg,
            },
          ]}
        >
          <Ionicons name={iconName} size={14.5 * S} color='#fff' />
        </View>
        <Text
          style={[styles.featureTitle, { fontSize: 12 * S, marginLeft: 8 * S }]}
        >
          {title}
        </Text>
        <Ionicons
          name='chevron-forward'
          size={8 * S}
          color='#000'
          style={{ marginLeft: 'auto' }}
        />
      </View>
      <Text
        style={[
          styles.featureDescription,
          { fontSize: 12 * S, lineHeight: 14.5 * S },
        ]}
      >
        {description}
      </Text>
    </View>
  );
}

export default function CompanionScreen() {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.cardsContainer,
          { width: CONTAINER_W, height: CONTAINER_H },
        ]}
      >
        {/* User message bubble — right aligned */}
        <View
          style={[
            styles.cardPosition,
            {
              right: 0,
              top: 0,
              zIndex: 1,
            },
          ]}
        >
          <UserBubble />
        </View>

        {/* AI response card */}
        <View
          style={[
            styles.cardPosition,
            {
              left: 0,
              top: 88 * S,
              zIndex: 1,
            },
          ]}
        >
          <AIResponse />
        </View>

        {/* Ask Anything card */}
        <View
          style={[
            styles.cardPosition,
            {
              left: 0,
              top: 319 * S,
              zIndex: 2,
            },
          ]}
        >
          <FeatureCard
            iconName='chatbubble'
            iconBg='#F4B9DF'
            title={t('preLogin.companion.askAnything.title')}
            description={t('preLogin.companion.askAnything.description')}
          />
        </View>

        {/* Form Help card */}
        <View
          style={[
            styles.cardPosition,
            {
              left: 173 * S,
              top: 319 * S,
              zIndex: 2,
            },
          ]}
        >
          <FeatureCard
            iconName='document-text'
            iconBg='#F6A94C'
            title={t('preLogin.companion.formHelp.title')}
            description={t('preLogin.companion.formHelp.description')}
          />
        </View>
      </View>

      <View style={styles.textContainer}>
        <Text style={styles.title}>{t('preLogin.companion.title')}</Text>
        <Text style={styles.description}>
          {t('preLogin.companion.description')}
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
  // User bubble
  userBubble: {
    backgroundColor: '#5B7FC7',
  },
  userBubbleText: {
    fontFamily: 'FunnelSans_400Regular',
    color: '#fff',
  },
  // AI response
  aiResponse: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  aiHeading: {
    fontFamily: 'FunnelSans_600SemiBold',
    color: '#000',
  },
  aiBody: {
    fontFamily: 'FunnelSans_400Regular',
    color: '#000',
  },
  aiBold: {
    fontFamily: 'FunnelSans_600SemiBold',
  },
  // Feature cards
  featureCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D4D4D4',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
  },
  featureCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  featureIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: {
    fontFamily: 'FunnelSans_500Medium',
    color: '#000',
  },
  featureDescription: {
    fontFamily: 'FunnelSans_400Regular',
    color: '#686464',
  },
  // Bottom text
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
