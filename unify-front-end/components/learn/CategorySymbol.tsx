import React from 'react';
import { Platform, View } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { baseSanityId } from '@/constants/PartnerSpotlight';

// Use stable content IDs: the existing icon field is shared by unrelated topics.
export const CATEGORY_SYMBOLS = {
  documentation: {
    ios: 'person.text.rectangle',
    android: 'card-account-details-outline',
    foreground: '#8F3E31',
    background: '#EDD6D2',
  },
  employment: {
    ios: 'briefcase',
    android: 'briefcase-outline',
    foreground: '#2C4976',
    background: '#D1DAE8',
  },
  housing: {
    ios: 'house',
    android: 'home-outline',
    foreground: '#8D573B',
    background: '#F3E0D4',
  },
  healthcare: {
    ios: 'cross.case',
    android: 'medical-bag',
    foreground: '#853C70',
    background: '#E9D7E3',
  },
  safety: {
    ios: 'checkmark.shield',
    android: 'shield-check-outline',
    foreground: '#805B25',
    background: '#EFE2C7',
  },
  education: {
    ios: 'graduationcap',
    android: 'school-outline',
    foreground: '#786020',
    background: '#EEE5CB',
  },
  finance: {
    ios: 'banknote',
    android: 'cash',
    foreground: '#35664F',
    background: '#D9E8DF',
  },
  culture: {
    ios: 'globe.americas',
    android: 'earth',
    foreground: '#8C503E',
    background: '#EEDDD3',
  },
  immigration: {
    ios: 'person.crop.rectangle',
    android: 'passport',
    foreground: '#8F3E31',
    background: '#EDD6D2',
  },
  mentalHealth: {
    ios: 'brain.head.profile',
    android: 'head-heart-outline',
    foreground: '#6C5187',
    background: '#E5DDED',
  },
  taxes: {
    ios: 'doc.text',
    android: 'file-document-outline',
    foreground: '#44624D',
    background: '#E0E8DB',
  },
  transport: {
    ios: 'tram',
    android: 'tram',
    foreground: '#326C70',
    background: '#D7E8E8',
  },
  university: {
    ios: 'building.columns',
    android: 'bank-outline',
    foreground: '#65528B',
    background: '#E3DDEF',
  },
  fallback: {
    ios: 'book.closed',
    android: 'book-outline',
    foreground: '#58616D',
    background: '#E5E8ED',
  },
} as const;

const TOPICS: Record<string, keyof typeof CATEGORY_SYMBOLS> = {
  '0777d5d9-02fe-4e7d-b644-2e25d1c4579a': 'documentation',
  'baeece22-8ac0-48a0-b310-baab55e38f88': 'employment',
  '23aeb3ad-65e7-4e03-97b2-a3e14ffde080': 'housing',
  '1f43061d-0062-4ea5-bd82-6b25e8ee5a55': 'healthcare',
  '4044e0bc-d26b-4a1e-9b7d-6a5e95c7f8ce': 'safety',
  '40bfab0e-63a5-46e4-8911-24de6dd72ca2': 'education',
  '4c79ebb5-b03a-47aa-862e-6d0853eba7d4': 'finance',
  '80e8804e-c063-4264-ba4d-a02354718e57': 'culture',
  '9717e260-bdeb-4ee4-8d39-4159a48eb627': 'immigration',
  'ccf7fd11-ab7e-4dc1-a6a7-4ea6036b1a86': 'mentalHealth',
  'e0e9106e-c685-439a-8c67-2db46d7e7472': 'taxes',
  'fd8898a8-5802-4bd2-aa0b-097f89df5de0': 'transport',
  '1c0e599c-22a4-4b6f-ac12-3f4c01153eeb': 'university',
  '84087dee-349a-4755-86d9-4843295e2e77': 'university',
  'fcd707b0-cbd9-4069-a768-6e89e11d14f9': 'university',
};
const ICON_TOPICS: Record<string, keyof typeof CATEGORY_SYMBOLS> = {
  article: 'documentation',
  ArticleOutlined: 'documentation',
  work: 'employment',
  AssignmentIndOutlined: 'employment',
  cottage: 'housing',
  CottageOutlined: 'housing',
  medical_services: 'healthcare',
  local_hospital: 'healthcare',
  school: 'education',
  account_balance: 'finance',
  AccountBalanceOutlined: 'finance',
  language: 'culture',
  passport: 'immigration',
  PassportOutlined: 'immigration',
  psychology: 'mentalHealth',
  calculate: 'taxes',
};

export function categorySymbol(moduleId = '', icon = '') {
  return CATEGORY_SYMBOLS[
    TOPICS[baseSanityId(moduleId)] ?? ICON_TOPICS[icon] ?? 'fallback'
  ];
}

export default function CategorySymbol({
  moduleId,
  icon,
  size = 44,
  color,
}: {
  moduleId?: string;
  icon?: string;
  size?: number;
  color?: string;
}) {
  const symbol = categorySymbol(moduleId, icon);
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.26,
        backgroundColor: symbol.background,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {Platform.OS === 'ios' ? (
        <Image
          source={`sf:${symbol.ios}`}
          tintColor={color ?? symbol.foreground}
          style={{ width: size * 0.54, height: size * 0.54 }}
          contentFit='contain'
        />
      ) : (
        <MaterialCommunityIcons
          name={symbol.android}
          size={size * 0.54}
          color={color ?? symbol.foreground}
        />
      )}
    </View>
  );
}
