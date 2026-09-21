import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import { formatNumber } from '@/utils/formatNumber';

const MEMBER_COUNT = 286;

interface GroupCardProps {
  scale?: number;
}

export default function GroupCard({ scale = 1 }: GroupCardProps) {
  const { t } = useTranslation();
  const s = scale;
  return (
    <View
      style={[
        styles.container,
        {
          width: 199 * s,
          borderRadius: 14 * s,
          paddingHorizontal: 14 * s,
          paddingVertical: 11 * s,
        },
      ]}
    >
      {/* Group photo */}
      <Image
        source={require('@/assets/images/group-card-photo.png')}
        style={[
          styles.photo,
          {
            width: 170 * s,
            height: 86 * s,
            borderRadius: 9 * s,
          },
        ]}
        contentFit='cover'
      />

      {/* Group info */}
      <View style={[styles.info, { marginTop: 9 * s }]}>
        <Text style={[styles.name, { fontSize: 16 * s }]} numberOfLines={1}>
          {t('preLogin.group.name')}
        </Text>
        <Text
          style={[styles.members, { fontSize: 12.5 * s, marginTop: 5 * s }]}
        >
          {t('preLogin.group.members', { total: formatNumber(MEMBER_COUNT) })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderWidth: 0.9,
    borderColor: '#CDCBCB',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 5,
  },
  photo: {
    width: '100%',
  },
  info: {
    width: '100%',
  },
  name: {
    fontFamily: 'FunnelSans_600SemiBold',
    color: '#000',
  },
  members: {
    fontFamily: 'FunnelSans_500Medium',
    color: '#9B9797',
  },
});
