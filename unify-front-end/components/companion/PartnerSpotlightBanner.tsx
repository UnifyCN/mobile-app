import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useTranslation } from 'react-i18next';
import { getSpotlightPartner, isVerifiedPartner } from '@/constants/Partners';
import { RESOURCE_THEME } from '@/constants/ResourceTheme';
import { PARTNER_CATEGORY_COLORS } from '@/types/partner';
import Monogram from '@/components/learn/Resources/Monogram';
import { useAnalytics } from '@/utils/analytics';
import { launchResourceLink } from '@/utils/openResourceLink';
import { buildPartnerUrl, partnerDetailHref } from '@/utils/partners';

const SOURCE = 'companion_ai';

interface Props {
  /** Called on dismiss and after Book, so the banner does not return. */
  onClose: () => void;
}

/**
 * One banner above the Companion composer, offered once a chat has shown the
 * person needs immigration help (see `shouldShowCompanionSpotlight`). It sits
 * outside the message list on purpose: the AI's answer stays neutral and the
 * partner never appears inside it.
 */
export default function PartnerSpotlightBanner({ onClose }: Props) {
  const partner = getSpotlightPartner();
  const router = useRouter();
  const { t } = useTranslation();
  const {
    trackPartnerSpotlightShown,
    trackPartnerSpotlightDismissed,
    trackResourcesPartnerWebsiteClicked,
    trackResourcesLinkFailed,
  } = useAnalytics();

  useEffect(() => {
    if (partner) trackPartnerSpotlightShown(partner.slug, SOURCE);
  }, [partner, trackPartnerSpotlightShown]);

  if (!partner?.website) return null;

  const accent = PARTNER_CATEGORY_COLORS[partner.category];

  const handleBook = async () => {
    onClose();
    await launchResourceLink({
      buildUrl: () => buildPartnerUrl(partner, SOURCE),
      onIntent: () =>
        trackResourcesPartnerWebsiteClicked(
          partner.slug,
          partner.partnershipType,
          SOURCE
        ),
      launch: url =>
        WebBrowser.openBrowserAsync(url, {
          controlsColor: accent,
          toolbarColor: '#FFFFFF',
        }),
      onFailure: reason =>
        trackResourcesLinkFailed(partner.slug, 'partner_website', reason),
    });
  };

  const handleDismiss = () => {
    trackPartnerSpotlightDismissed(partner.slug, SOURCE);
    onClose();
  };

  const title = t('learn.resources.spotlight.companionTitle');
  const meetingFacts = t('learn.resources.spotlight.meetingFacts');
  const facts = isVerifiedPartner(partner)
    ? `${t('learn.resources.spotlight.verifiedPartner')} · ${meetingFacts}`
    : meetingFacts;

  return (
    <View style={styles.banner}>
      <TouchableOpacity
        style={styles.body}
        onPress={() =>
          router.push(partnerDetailHref(partner.slug, SOURCE) as any)
        }
        activeOpacity={0.75}
        accessibilityRole='button'
        accessibilityLabel={`${title}. ${facts}. ${t(
          'learn.resources.spotlight.openDetailsA11y',
          { name: partner.name }
        )}`}
      >
        <Monogram
          name={partner.name}
          category={partner.category}
          size={36}
          source={partner.logo}
        />
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.facts} numberOfLines={2}>
            {facts}
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.book, { backgroundColor: accent }]}
        onPress={handleBook}
        activeOpacity={0.8}
        accessibilityRole='link'
        accessibilityLabel={t('learn.resources.spotlight.bookA11y', {
          name: partner.name,
        })}
      >
        <Text style={styles.bookText}>
          {t('learn.resources.spotlight.book')}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={handleDismiss}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 12 }}
        accessibilityRole='button'
        accessibilityLabel={t('learn.resources.spotlight.dismiss')}
      >
        <Feather name='x' size={18} color={RESOURCE_THEME.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: RESOURCE_THEME.surface,
    borderWidth: 1,
    borderColor: RESOURCE_THEME.cardBorder,
    borderRadius: 16,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 12,
    marginBottom: 8,
    shadowColor: '#23211D',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  text: { flex: 1 },
  title: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    color: RESOURCE_THEME.textCard,
  },
  facts: {
    fontSize: 12,
    lineHeight: 16,
    color: RESOURCE_THEME.textSecondary,
    marginTop: 2,
  },
  book: {
    borderRadius: 10,
    paddingHorizontal: 14,
    minHeight: 36,
    justifyContent: 'center',
  },
  bookText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
