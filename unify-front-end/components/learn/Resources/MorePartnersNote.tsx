import { typography } from '@/constants/Typography';
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from '@/context/UserContext';
import { RESOURCE_THEME } from '@/constants/ResourceTheme';
import { getMorePartnersNoteProvince } from '@/utils/morePartnersNote';

/**
 * The one line above any partner list telling a user outside British Columbia
 * that more partners in their province are coming. Renders nothing for BC
 * users and for users with no recognized province.
 */
export default function MorePartnersNote() {
  const { t } = useTranslation();
  const province = getMorePartnersNoteProvince(
    useCurrentUser().currentUser?.province
  );
  if (!province) return null;

  return (
    <Text style={styles.note}>
      {t('resources.morePartnersComingSoon', { province })}
    </Text>
  );
}

const styles = StyleSheet.create({
  note: {
    ...typography.caption,
    color: RESOURCE_THEME.textSecondary,
    marginBottom: 12,
  },
});
