import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useConversations } from '@/hooks/companion/useConversations';
import {
  filterConversations,
  groupConversationsByDate,
  createConversationSections,
  isUntitledConversation,
  ConversationSection,
} from '@/helpers/companion/conversationHelpers';
import { Conversation } from '@/services/companion/getConversations';
import BackHeader from '@/components/BackHeader';
import { Theme } from '@/constants/Theme';
import NewChatIcon from '@/components/icons/NewChat.svg';
import ChatListIcon from '@/components/icons/ChatListIcon.svg';

export default function ConversationHistoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: conversations, isLoading } = useConversations();
  const [searchQuery, setSearchQuery] = useState('');

  const untitledLabel = t('companion.history.untitled');

  // Filter conversations by search query
  const filteredConversations = useMemo(
    () => filterConversations(conversations, searchQuery, untitledLabel),
    [conversations, searchQuery, untitledLabel]
  );

  // Group conversations by date ranges
  const groupedConversations = useMemo(
    () => groupConversationsByDate(filteredConversations),
    [filteredConversations]
  );

  // Create sections for FlatList (only includes sections with conversations)
  const sections = useMemo(
    () => createConversationSections(groupedConversations),
    [groupedConversations]
  );

  const handleConversationPress = (conversationId: string) => {
    router.replace({
      pathname: '/(tabs)/companion' as any,
      params: { conversationId },
    });
  };

  const handleNewChatPress = () => {
    router.replace('/(tabs)/companion' as any);
  };

  const renderConversationItem = ({ item }: { item: Conversation }) => (
    <TouchableOpacity
      style={styles.conversationItem}
      onPress={() => handleConversationPress(item.conversation_identifier)}
    >
      <ChatListIcon width={20} height={20} />
      <Text style={styles.conversationTitle} numberOfLines={1}>
        {isUntitledConversation(item.title) ? untitledLabel : item.title}
      </Text>
    </TouchableOpacity>
  );

  const renderSection = ({ item }: { item: ConversationSection }) => {
    if (item.data.length === 0) return null;

    return (
      <View style={styles.section}>
        <Text style={styles.sectionHeader}>{t(item.titleKey)}</Text>
        {item.data.map(conv => (
          <View key={conv.conversation_identifier}>
            {renderConversationItem({ item: conv })}
          </View>
        ))}
      </View>
    );
  };

  const hasNoConversations = !conversations || conversations.length === 0;
  const hasNoSearchResults = searchQuery.trim() && sections.length === 0;

  return (
    <View style={styles.container}>
      <BackHeader title={t('companion.history.title')} />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      ) : (
        <>
          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder={t('companion.history.searchPlaceholder')}
              placeholderTextColor='#999'
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <Feather
              name='search'
              size={20}
              color='#999'
              style={styles.searchIcon}
            />
          </View>

          <FlatList
            data={sections}
            keyExtractor={item => item.key}
            renderItem={renderSection}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <TouchableOpacity
                style={styles.newChatButton}
                onPress={handleNewChatPress}
              >
                <NewChatIcon width={20} height={20} />
                <Text style={styles.newChatText}>{t('companion.history.newChat')}</Text>
              </TouchableOpacity>
            }
            ListEmptyComponent={
              hasNoSearchResults ? (
                <View style={styles.emptyMessageContainer}>
                  <Text style={styles.emptyText}>{t('companion.history.noConversationsFound')}</Text>
                </View>
              ) : hasNoConversations ? (
                <View style={styles.emptyMessageContainer}>
                  <Text style={styles.emptyText}>{t('companion.history.noConversationsYet')}</Text>
                </View>
              ) : null
            }
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: Theme.textInput,
  },
  emptyMessageContainer: {
    paddingTop: 40,
    paddingBottom: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: Theme.textInput,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 24,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.borderInfoText,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Theme.black,
    padding: 0,
  },
  searchIcon: {
    marginLeft: 12,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  newChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  newChatText: {
    fontSize: 18,
    fontWeight: '600',
    color: Theme.black,
    marginLeft: 18,
  },
  section: {
    marginBottom: 15,
  },
  sectionHeader: {
    fontSize: 16,
    color: Theme.textInput,
    marginBottom: 15,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  conversationTitle: {
    fontSize: 18,
    color: Theme.black,
    marginLeft: 18,
    flex: 1,
  },
});
