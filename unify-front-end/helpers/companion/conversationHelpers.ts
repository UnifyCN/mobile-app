import { Conversation } from '@/services/companion/getConversations';

/**
 * Title persisted for a conversation that has no generated title yet. It is a
 * database value, not display copy — the UI renders
 * `companion.history.untitled` whenever a title equals this sentinel or is
 * blank, so the row reads in the user's language.
 */
export const DEFAULT_CONVERSATION_TITLE = 'New Conversation';

export interface GroupedConversations {
  yesterday: Conversation[];
  last7Days: Conversation[];
  last30Days: Conversation[];
  older: Conversation[];
}

export interface ConversationSection {
  /** i18n key — the caller translates it at render time. */
  titleKey: string;
  data: Conversation[];
  key: string;
}

/**
 * Filters conversations by search query (searches in title).
 *
 * `untitledLabel` is the already-translated label shown for conversations that
 * still carry the database default title, so a search matches what the user
 * actually sees on screen.
 */
export const filterConversations = (
  conversations: Conversation[] | undefined,
  searchQuery: string,
  untitledLabel: string = DEFAULT_CONVERSATION_TITLE
): Conversation[] => {
  if (!conversations) return [];
  if (!searchQuery.trim()) return conversations;

  const query = searchQuery.toLowerCase();
  return conversations.filter(conv => {
    const label = isUntitledConversation(conv.title)
      ? untitledLabel
      : (conv.title ?? '');
    return label.toLowerCase().includes(query);
  });
};

/** True when a conversation has no real title of its own yet. */
export const isUntitledConversation = (
  title: string | null | undefined
): boolean => !title?.trim() || title === DEFAULT_CONVERSATION_TITLE;

/**
 * Groups conversations by date ranges: Yesterday, Previous 7 Days, Previous 30 Days
 */
export const groupConversationsByDate = (
  conversations: Conversation[]
): GroupedConversations => {
  if (!conversations || conversations.length === 0) {
    return {
      yesterday: [],
      last7Days: [],
      last30Days: [],
      older: [],
    };
  }

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const last7Days = new Date(now);
  last7Days.setDate(last7Days.getDate() - 7);
  last7Days.setHours(0, 0, 0, 0);

  const last30Days = new Date(now);
  last30Days.setDate(last30Days.getDate() - 30);
  last30Days.setHours(0, 0, 0, 0);

  const grouped: GroupedConversations = {
    yesterday: [],
    last7Days: [],
    last30Days: [],
    older: [],
  };

  conversations.forEach(conv => {
    const updatedAt = new Date(conv.updated_at);

    if (updatedAt >= yesterday) {
      grouped.yesterday.push(conv);
    } else if (updatedAt >= last7Days) {
      grouped.last7Days.push(conv);
    } else if (updatedAt >= last30Days) {
      grouped.last30Days.push(conv);
    } else {
      grouped.older.push(conv);
    }
  });

  return grouped;
};

/**
 * Converts grouped conversations into sections for FlatList rendering
 * Only includes sections that have conversations
 */
export const createConversationSections = (
  grouped: GroupedConversations
): ConversationSection[] => {
  return [
    {
      titleKey: 'companion.history.sections.yesterday',
      data: grouped.yesterday,
      key: 'yesterday',
    },
    {
      titleKey: 'companion.history.sections.previous7Days',
      data: grouped.last7Days,
      key: 'last7Days',
    },
    {
      titleKey: 'companion.history.sections.previous30Days',
      data: grouped.last30Days,
      key: 'last30Days',
    },
    {
      titleKey: 'companion.history.sections.older',
      data: grouped.older,
      key: 'older',
    },
  ].filter(section => section.data.length > 0);
};
