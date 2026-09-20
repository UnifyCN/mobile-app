import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COST_LABEL_KEYS, type LocalizedPartner } from '@/types/partner';
import { COST_CHIP, RESOURCE_THEME } from '@/constants/ResourceTheme';
import Monogram from './Monogram';

type Props = {
  partner: LocalizedPartner;
  onPress: () => void;
};

/**
 * One organization in a partner list (Figma 8132:33064).
 *
 * Renders in two places — a category's partner list and the landing screen's
 * search results — so it carries its own bottom margin rather than relying on
 * a divider from either parent.
 */
export default function PartnerRow({ partner, onPress }: Props) {
  const { t } = useTranslation();
  const costLabel = partner.cost ? t(COST_LABEL_KEYS[partner.cost]) : null;
  const costChip = partner.cost ? COST_CHIP[partner.cost] : null;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={styles.card}
      accessibilityRole='button'
      accessibilityLabel={[partner.name, partner.serviceArea, costLabel]
        .filter(Boolean)
        .join(', ')}
    >
      <Monogram
        name={partner.name}
        category={partner.category}
        size={44}
        source={partner.logo}
      />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {partner.name}
        </Text>
        <Text style={styles.tagline} numberOfLines={1}>
          {partner.tagline}
        </Text>
        <View style={styles.chips}>
          <View style={styles.chip}>
            <Feather
              name='map-pin'
              size={13}
              color={RESOURCE_THEME.textSecondary}
            />
            <Text style={styles.chipText} numberOfLines={1}>
              {partner.serviceArea}
            </Text>
          </View>
          {costLabel && costChip && (
            <View style={[styles.chip, { backgroundColor: costChip.background }]}>
              <Text
                style={[styles.chipText, { color: costChip.text }]}
                numberOfLines={1}
              >
                {costLabel}
              </Text>
            </View>
          )}
        </View>
      </View>
      {/* Stretched so the chevron centres on the whole card, not on the logo,
          which sits at the top of a card whose height varies with wrapping. */}
      <View style={styles.chevronWrap}>
        <Feather name='chevron-right' size={20} color='#C4C1BA' />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: RESOURCE_THEME.surface,
    borderWidth: 1,
    borderColor: RESOURCE_THEME.cardBorder,
    // 20 rather than the spec's 16, matching the category tiles this list
    // sits one tap behind.
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 15,
    marginBottom: 12,
    // Shared with CategoryTile and PathwayCard so every Learn card family
    // casts the same shadow.
    shadowColor: '#575757',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  body: { flex: 1, gap: 5 },
  name: { fontSize: 15, fontWeight: '800', color: RESOURCE_THEME.textCard },
  tagline: {
    fontSize: 13,
    lineHeight: 18,
    color: RESOURCE_THEME.textSecondary,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: RESOURCE_THEME.surfaceChipNeutral,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    color: RESOURCE_THEME.textSecondary,
  },
  chevronWrap: { alignSelf: 'stretch', justifyContent: 'center' },
});
