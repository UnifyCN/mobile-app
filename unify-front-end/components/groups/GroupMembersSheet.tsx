import { typography } from '@/constants/Typography';
import { View, Text, SectionList, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import BottomSheet from '@/components/common/BottomSheet';
import GroupMemberRow from './GroupMemberRow';
import { Theme } from '@/constants/Theme';
import { Feather } from '@expo/vector-icons';
import type { GroupMember } from '@/services/groups/getGroupMembers';

export default function GroupMembersSheet({
  visible,
  onClose,
  members,
}: {
  visible: boolean;
  onClose: () => void;
  members: GroupMember[];
}) {
  const { t } = useTranslation();
  const mutuals = members.filter(m => m.isMutual);
  const others = members.filter(m => !m.isMutual);

  const sections = [
    ...(mutuals.length > 0
      ? [{ key: 'mutuals', title: t('groups.peopleYouKnow'), data: mutuals }]
      : []),
    ...(others.length > 0
      ? [{ key: 'all', title: t('groups.allMembers'), data: others }]
      : []),
  ];

  return (
    <BottomSheet visible={visible} onClose={onClose} snapPoint={0.75}>
      {/* Sheet header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('common.members')}</Text>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{members.length}</Text>
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        renderSectionHeader={({ section }) => (
          <View
            style={[
              styles.sectionHeader,
              section.key === 'mutuals' && styles.mutualsSectionHeader,
            ]}
          >
            {section.key === 'mutuals' && (
              <Feather
                name='users'
                size={14}
                color={Theme.primaryGatherRed}
                style={styles.sectionIcon}
              />
            )}
            <Text
              style={[
                styles.sectionTitle,
                section.key === 'mutuals' && styles.mutualsSectionTitle,
              ]}
            >
              {section.title}
            </Text>
          </View>
        )}
        renderItem={({ item, section }) => (
          <GroupMemberRow member={item} highlight={section.key === 'mutuals'} />
        )}
        renderSectionFooter={({ section }) =>
          section.key === 'mutuals' ? (
            <View style={styles.sectionDivider} />
          ) : null
        }
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Theme.surfaceGray,
    marginBottom: 4,
  },
  headerTitle: { ...typography.section, color: Theme.black },
  countPill: {
    marginLeft: 8,
    backgroundColor: Theme.surfaceGray,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countText: {
    ...typography.caption,
    color: Theme.textAlternateGray,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 8,
  },
  mutualsSectionHeader: {
    paddingTop: 12,
  },
  sectionIcon: {
    marginRight: 6,
  },
  sectionTitle: {
    ...typography.secondary,
    color: Theme.textAlternateGray,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  mutualsSectionTitle: {
    color: Theme.primaryGatherRed,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: Theme.surfaceGray,
    marginTop: 8,
  },
  listContent: {
    paddingBottom: 40,
  },
});
