import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

interface CirclesCardProps {
  scale?: number;
}

export default function CirclesCard({ scale = 1 }: CirclesCardProps) {
  const { t } = useTranslation();
  const s = scale;
  return (
    <View
      style={[
        styles.container,
        {
          width: 192 * s,
          borderRadius: 7 * s,
          paddingHorizontal: 11 * s,
          paddingVertical: 8 * s,
        },
      ]}
    >
      {/* Decorative semi-transparent circles */}
      <View
        style={[
          styles.decorCircle,
          {
            width: 51 * s,
            height: 49 * s,
            borderRadius: 25 * s,
            right: -4 * s,
            top: -9 * s,
          },
        ]}
      />
      <View
        style={[
          styles.decorCircle,
          {
            width: 51 * s,
            height: 49 * s,
            borderRadius: 25 * s,
            left: -7 * s,
            bottom: -9 * s,
          },
        ]}
      />

      {/* Content */}
      <View style={[styles.content, { width: 171 * s, gap: 8 * s }]}>
        {/* Logo */}
        <Image
          source={require('@/assets/images/unify-circles-icon.png')}
          style={[styles.logo, { width: 20 * s, height: 20 * s }]}
          contentFit='contain'
        />

        {/* Text block */}
        <View style={[styles.textBlock, { gap: 3 * s }]}>
          <Text
            style={[
              styles.title,
              {
                fontSize: Math.max(10 * s, 12),
                lineHeight: Math.max(13 * s, 15),
              },
            ]}
          >
            {t('preLogin.circles.title')}
          </Text>
          <Text
            style={[
              styles.description,
              {
                fontSize: Math.max(7.7 * s, 10),
                lineHeight: Math.max(10 * s, 12),
              },
            ]}
          >
            {t('preLogin.circles.description')}
          </Text>
        </View>

        {/* CTA button */}
        <View
          style={[
            styles.ctaButton,
            {
              borderRadius: 7 * s,
              paddingVertical: 5.5 * s,
              paddingHorizontal: 22 * s,
              gap: 7 * s,
            },
          ]}
        >
          <Text style={[styles.ctaText, { fontSize: Math.max(7.7 * s, 10) }]}>
            {t('preLogin.circles.cta')}
          </Text>
          <Ionicons name='arrow-forward' size={13 * s} color='#fff' />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F68B26',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 5,
  },
  decorCircle: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  content: {
    zIndex: 1,
  },
  logo: {
    // Unify circles logo
  },
  textBlock: {
    // Text container
  },
  title: {
    fontFamily: 'FunnelSans_600SemiBold',
    color: '#fff',
  },
  description: {
    fontFamily: 'FunnelSans_400Regular',
    color: '#fff',
  },
  ctaButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.24)',
    borderWidth: 0.55,
    borderColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: 'FunnelSans_600SemiBold',
    color: '#fff',
  },
});
