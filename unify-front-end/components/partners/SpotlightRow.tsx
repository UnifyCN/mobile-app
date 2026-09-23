import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { getSpotlightPartner, isVerifiedPartner } from '@/constants/Partners';
import { RESOURCE_THEME } from '@/constants/ResourceTheme';
import {
  PARTNER_CATEGORY_COLORS,
  PARTNER_CATEGORY_TINTS,
} from '@/types/partner';
import Monogram from '@/components/learn/Resources/Monogram';
import { useAnalytics } from '@/utils/analytics';
import { partnerDetailHref, type PartnerCtaSource } from '@/utils/partners';

interface Props {
  /**
   * `card` — the tinted row on the Resources landing screen.
   * `inline` — the quiet row inside a Checklist item or at a module's end.
   */
  variant: 'card' | 'inline';
  source: PartnerCtaSource;
}

/**
 * Entry point to the spotlight partner's detail screen from outside the
 * directory. Renders nothing when no partner is in the spotlight, so callers
 * need no guard of their own.
 */
export default function SpotlightRow({ variant, source }: Props) {
  const partner = getSpotlightPartner();
  const router = useRouter();
  const { t } = useTranslation();
  const { trackPartnerSpotlightShown } = useAnalytics();

  useEffect(() => {
    if (partner) trackPartnerSpotlightShown(partner.slug, source);
  }, [partner, source, trackPartnerSpotlightShown]);

  if (!partner) return null;

  const accent = PARTNER_CATEGORY_COLORS[partner.category];
  const isCard = variant === 'card';
  const title = t(
    isCard
      ? 'learn.resources.spotlight.resourcesTitle'
      : 'learn.resources.spotlight.helpTitle'
  );
  const subtitle = t(
    isCard
      ? 'learn.resources.spotlight.resourcesSubtitle'
      : 'learn.resources.spotlight.helpSubtitle'
  );

  return (
    <TouchableOpacity
      style={[
        isCard ? styles.card : styles.inline,
        isCard && { backgroundColor: PARTNER_CATEGORY_TINTS[partner.category] },
      ]}
      onPress={() =>
        router.push(partnerDetailHref(partner.slug, source) as any)
      }
      activeOpacity={0.75}
      accessibilityRole='button'
      accessibilityLabel={`${title} ${subtitle}. ${t(
        'learn.resources.spotlight.openDetailsA11y',
        { name: partner.name }
      )}`}
    >
      <Monogram
        name={partner.name}
        category={partner.category}
        size={isCard ? 36 : 24}
        source={partner.logo}
      />
      <View style={styles.text}>
        <Text style={isCard ? styles.cardTitle : styles.inlineTitle}>
          {title}
        </Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {isVerifiedPartner(partner) && (
          <Text style={styles.label}>
            {t('learn.resources.spotlight.verifiedPartner')}
          </Text>
        )}
      </View>
      <Feather name='chevron-right' size={isCard ? 20 : 18} color={accent} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: RESOURCE_THEME.buttonOutline,
  },
  text: { flex: 1 },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: RESOURCE_THEME.textCard,
  },
  inlineTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: RESOURCE_THEME.textDetailWarm,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: RESOURCE_THEME.textSecondary,
    marginTop: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    color: RESOURCE_THEME.textSecondary,
    marginTop: 3,
  },
});
