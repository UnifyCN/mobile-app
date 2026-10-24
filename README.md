# Unify
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/UnifyCN/mobile-app)

A mobile app helping newcomers settle in Canada — built by [Unify](https://unifysocial.ca/).

Unify provides community, personalized checklists, AI-powered guidance, and educational content to support immigrants, refugees, international students, and skilled workers through their settlement journey.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | React Native 0.79 / Expo SDK 53 |
| **Routing** | Expo Router (file-based) |
| **Backend** | Supabase (Auth, PostgreSQL, Edge Functions) |
| **CMS** | Sanity (Learn content, checklist templates) |
| **State** | React Query v5 (server), Context API (local) |
| **Analytics** | PostHog |
| **Images** | AWS S3 (signed URLs) |
| **Email** | Resend API |
| **AI** | Google Gemini (via edge function proxy) |
| **UI** | React Native Paper, lucide-react-native |

## Features

The app is organized around **5 main tabs**:

### Home Feed
Three sub-feeds — **For You**, **Following**, and **Groups** — with infinite scroll, post creation, likes, comments, saves, and sharing. A horizontal carousel shows joined groups and community news. Feeds automatically filter blocked users (30s cached blocklist).

### Community (Gather)
Browse and join groups, discover community events, read news, and access **Community Matching** — an algorithm that connects users with similar backgrounds (persona + time in Canada) into small circles for peer support.

### Companion
An AI chatbot powered by **RAG** (Retrieval-Augmented Generation) over Sanity CMS content. Supports conversation history, starter prompts, and source citations. Free tier: 3 messages; unlimited with premium.

### Checklist
Personalized onboarding tasks based on the user's **persona** (international student, refugee, protected person, skilled worker, immigrant, PR) and **time in Canada** (0–3 months through 3+ years). Tasks are defined in Sanity CMS. Users can also create custom tasks.

### Learn
Structured educational modules (Sanity CMS) with lessons, quizzes, practice exercises, and progress tracking. A compact resume row opens the most recent unfinished lesson. Category and module lists show progress. The versioned lesson reader supports structured content sections. See [the Learn content contract](DOCS/designs/learn-content-v2.md).

### Additional Features
- **Auth**: Email + OTP, Google OAuth, Apple Sign-In (iOS)
- **Moderation**: Content keyword filter, post/user reporting (emails moderators via Resend), user blocking
- **Push notifications**: Expo Notifications with `social` (default), `circles`, and `learn` channels — published by `send-social-push`, `matchmake-circles`, and `send-learn-reminders` respectively
- **Profile**: Avatar uploads (S3), follow/unfollow, user profiles
- **Haptics**: Configurable haptic feedback on interactions
- **Legal**: Consent modal linking to Notion-hosted documents

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Expo / React Native             │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  Screens │  │  Hooks   │  │  Components  │  │
│  │ (app/)   │  │          │  │              │  │
│  └────┬─────┘  └────┬─────┘  └──────────────┘  │
│       │              │                           │
│       └──────┬───────┘                           │
│              │                                   │
│       ┌──────▼──────┐                            │
│       │  Services   │                            │
│       └──────┬──────┘                            │
└──────────────┼───────────────────────────────────┘
               │
    ┌──────────┼──────────────┐
    │          │              │
    ▼          ▼              ▼
┌────────┐ ┌────────┐  ┌──────────┐
│Supabase│ │Sanity  │  │  AWS S3  │
│  Auth  │ │  CMS   │  │ (images) │
│  DB    │ │        │  │          │
│  Edge  │ │        │  │          │
│  Funcs │ │        │  │          │
└────────┘ └────────┘  └──────────┘
```

### Key Patterns

- **Feed factory** (`hooks/feeds/useFeedFactory.ts`) — shared pagination logic across all feed types
- **Blocked user filtering** — `services/users/getBlockedUserIds.ts` with 30s in-memory cache, applied to all feeds
- **Edge function pattern** — validate auth → perform action → send notification email (see `report-post`, `block-user`)
- **Image handling** — S3 upload with signed URL retrieval; in-memory URL caches (`avatarUrlCache.ts`, `postImageUrlCache.ts`)
- **Content filter** — client-side keyword filter in `utils/contentFilter.ts`, checked before post submission

### Supabase Edge Functions

| Function | Purpose |
|----------|---------|
| `gemini-proxy` | Proxies requests to Google Gemini API |
| `rag-query` | Retrieves Sanity content for RAG context |
| `report-post` | Handles post reports, emails moderators |
| `report-user` | Handles user reports, emails moderators |
| `block-user` | Blocks user, notifies moderators |
| `request-group` | Request to join private groups |
| `matchmake-circles` | Runs community matching algorithm |
| `generate-title` | Auto-generates post titles |
| `profile-picture-*` | Profile picture upload/retrieval |

## Project Structure

```
unify-front-end/
├── app/                        # Expo Router screens
│   ├── (tabs)/                 # Tab navigation
│   │   ├── index.tsx           # Home feed (For You / Following / Groups)
│   │   ├── Gather/            # Community tab
│   │   ├── companion/         # AI chatbot
│   │   ├── Checklist/         # Onboarding tasks
│   │   └── Learn/             # Educational modules
│   ├── create-post.tsx         # Post creation
│   ├── community-matching/     # Circle matching flow
│   ├── ReportScreen.tsx        # Report post/user
│   └── _layout.tsx             # Root layout
├── components/
│   ├── AuthComponents/         # SignIn, SignUp, OTP, Legal
│   ├── ChatBot/               # Companion UI
│   ├── home/                  # Feed, PostItem, Comments
│   ├── learn/                 # Module cards, lessons
│   └── matching/              # Circle UI
├── hooks/
│   ├── feeds/                 # useFeedFactory, useForYouFeed, etc.
│   ├── posts/                 # useLikePost, useCreatePost
│   ├── companion/             # useConversationMessages, useSendMessage
│   ├── progress/              # useProgressCache, useInProgressLessons
│   ├── sanity/                # useSanityModules, useSearchModules
│   └── users/                 # useFollowUser, useUserProfile
├── services/
│   ├── feeds/                 # Feed queries
│   ├── posts/                 # Post CRUD, likes, comments
│   ├── users/                 # Profiles, followers, blocking
│   ├── companion/             # Chatbot conversations
│   ├── checklist/             # Task management
│   ├── matching/              # Circles, matchmaking
│   ├── s3/                    # Image uploads
│   └── progress/              # Learn progress tracking
├── context/                    # UserContext, HapticsContext, ToastContext
├── types/                      # TypeScript definitions
├── utils/                      # contentFilter, analytics, legalUrls
├── lib/
│   └── supabase.ts            # Supabase client
└── supabase/
    └── functions/              # Edge functions (Deno)
```

## Getting Started

### Prerequisites

- Node.js v18+
- npm
- Expo CLI (`npm install -g @expo/cli`)
- iOS Simulator (macOS) or Android Emulator

### Installation

```bash
git clone <repository-url>
cd Unify/unify-front-end
npm install
```

### Environment

The app requires a `.env` file in `unify-front-end/` with:

- `EXPO_PUBLIC_SUPABASE_URL` — Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key
- `EXPO_PUBLIC_SANITY_PROJECT_ID` — Sanity project ID
- `EXPO_PUBLIC_SANITY_DATASET` — Sanity dataset (defaults to `production`)
- `EXPO_PUBLIC_POSTHOG_API_KEY` — PostHog key
- `EXPO_PUBLIC_POSTHOG_HOST` — PostHog host URL

Edge functions require their own secrets configured via `supabase secrets set`.

### Running

```bash
npx expo start
```

- `i` — iOS Simulator
- `a` — Android Emulator
- `w` — Web browser
- Scan QR code with Expo Go on device

### Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start Expo dev server |
| `npm run ios` | Run on iOS |
| `npm run android` | Run on Android |
| `npm run web` | Run on web |
| `npm test` | Run tests |
| `npm run lint` | Run ESLint |
| `npm run format` | Run Prettier |

## Security

- Supabase Row Level Security (RLS) on all tables
- Edge functions validate JWT auth before processing
- AI API keys stored server-side only (edge function secrets)
- Secure token storage via `expo-secure-store`
- Client-side content filtering before post submission
- HTML escaping in moderation emails to prevent injection
- Moderator notifications sent to `contact@unifysocial.ca`
