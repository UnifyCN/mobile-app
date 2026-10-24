import { typography } from '@/constants/Typography';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import BackHeader from '@/components/BackHeader';
import FeedWithHook from '@/components/FeedWithHook';
import { useGetSavedPosts } from '@/hooks/posts/useGetSavedPosts';
import EmptyFeedMessage from '@/components/profile/EmptyFeedMessage';
import UnifyReplyIcon from '@/components/icons/UnifyReply.svg';
import { Theme } from '@/constants/Theme';

export default function SavedPage() {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <BackHeader title={t('saved.title')} />
      <FeedWithHook
        useFeedHook={useGetSavedPosts}
        ListEmptyComponent={
          <EmptyFeedMessage
            icon={<UnifyReplyIcon width={27} height={25} />}
            message={t('saved.empty')}
            submessage={
              <Text style={styles.emptyMessageSubtext}>
                {t('saved.emptyHint')}
              </Text>
            }
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  emptyMessageSubtext: {
    ...typography.secondary,
    color: Theme.textInput,
    textAlign: 'center',
  },
});
