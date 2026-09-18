# AI Companion Feature

## Overview

A conversational AI feature with persistent conversations, RAG (Retrieval Augmented Generation) for context-aware responses, and full conversation history.

## Database Schema

### `conversations` Table
- `id` (SERIAL): Internal ID for foreign keys
- `conversation_identifier` (UUID): Public identifier for URLs/APIs
- `user_id` (UUID): References `users(id)` with cascade delete
- `title` (TEXT): Auto-generated from first message
- `created_at`, `updated_at` (TIMESTAMPTZ): Auto-managed

### `messages` Table
- `id` (SERIAL): Primary key
- `conversation_id` (INT): References `conversations(id)` with cascade delete
- `role` (TEXT): 'user' or 'assistant'
- `content` (TEXT): Message text
- `sources` (JSONB): Optional RAG source documents
- `created_at` (TIMESTAMPTZ): Auto-set

**Design**: SERIAL IDs for performance, UUIDs for public use (privacy).

## Services (`services/companion/`)

- **`getConversations`**: Fetches all user conversations (ordered by `updated_at DESC`)
- **`getConversationMessages`**: Fetches messages for a conversation (ordered by `created_at ASC`)
- **`createConversation`**: Creates conversation with auto-generated title (calls `generate-title` edge function)
- **`saveMessage`**: Saves message (verifies user ownership first)
- **`getChatbotUsage`** / **`upsertChatbotUsage`**: Manages daily message limits (3/day)

## Hooks (`hooks/companion/`)

- **`useConversations`**: Fetches all conversations (used in history page)
- **`useConversationMessages(conversationIdentifier)`**: Fetches messages for a conversation
- **`useCreateConversation`**: Mutation to create conversation (invalidates `['conversations']`)
- **`useSaveMessage`**: Mutation to save message (invalidates messages + conversations queries)
- **`useChatbotUsage`** / **`useUpdateChatbotUsage`**: Daily message limit tracking
- **`useSendMessage`**: Main hook that handles:
  1. Creates conversation if needed
  2. Saves user message
  3. Calls RAG API with conversation context (last 10 messages)
  4. Saves bot response
  5. Returns: `{ sendMessage, isLoading, isWaitingForBot }`

## Edge Functions

### `rag-query` (source: UnifyCN/web-app `supabase/functions/rag-query/index.ts`)
The deployed function is owned by the web repo; this repo no longer carries a copy.
- **Input**: `prompt`, `conversationIdentifier`, `messages[]` (last 10)
- **Process**:
  1. Generates embedding (OpenAI)
  2. Searches knowledge base (similarity threshold: 0.3)
  3. Builds context from chunks
  4. Calls Gemini with conversation history + context
- **Output**: `{ answer: string, sources?: Source[] }`

### `generate-title/index.ts`
- Generates concise title (max 5-6 words) from first message
- Uses Gemini with `maxOutputTokens: 20`
- Returns: `{ title: string }`

## Components

- **`MessageWithSources`**: Renders messages with collapsible sources (bot messages only)
- **`TypingIndicator`**: Animated dots shown when `isWaitingForBot` is true

## Data Flow

### Sending a Message
1. User sends message → `useSendMessage.sendMessage()` called
2. Create conversation if needed (with title generation)
3. Save user message → query refetches, message appears
4. Wait 100ms for message to render
5. Show typing indicator (`isWaitingForBot = true`)
6. Call RAG API with last 10 messages for context
7. Save bot response → query refetches, response appears
8. Hide typing indicator

### Viewing History
1. `useConversations` fetches all conversations
2. Grouped by date (Yesterday, Last 7 Days, Last 30 Days)
3. Click conversation → navigate with `conversationId` param
4. `useConversationMessages` fetches messages for that conversation

### New Conversation
- Navigate without `conversationId` → `currentConversationId` cleared
- Next message creates new conversation

## Key Concepts

- **Context Window**: Only last 10 messages sent to RAG API
- **Loading States**: 
  - `isLoadingMessages`: Fetching from DB
  - `isLoading`: Entire send flow
  - `isWaitingForBot`: Only after user message visible (for typing indicator)
- **Query Invalidation**: `useSaveMessage` invalidates both messages and conversations queries
- **Security**: All queries filter by `user_id`, ownership verified before saves

## File Structure

```
app/(tabs)/companion/
  ├── index.tsx              # Main screen
  ├── history.tsx            # History page
  └── _layout.tsx            # Stack navigator

components/companion/        # MessageWithSources, TypingIndicator
hooks/companion/             # All React Query hooks
services/companion/          # All Supabase service functions
helpers/companion/           # Message formatting utilities
supabase/functions/          # rag-query, generate-title
```
