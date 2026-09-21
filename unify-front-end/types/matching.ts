import type { Persona } from './onboardingProfile';
import type { MatchingTimeInCanada as TimeInCanada } from '@/matching/pools';

export type CommunityWaitlistStatus = 'waiting' | 'matched' | 'paused';
export type CommunityCircleStatus = 'active' | 'ended';
export type CommunityMessageType = 'user' | 'system_notice' | 'daily_prompt';
export type CommunityMatchingPersona = Persona | string | null;

export interface CommunityWaitlistEntry {
  id: string;
  user_id: string;
  persona: CommunityMatchingPersona;
  time_in_canada: TimeInCanada;
  pool_key: string;
  goal: string | null;
  topics: string[];
  placement_deadline_at: string;
  status: CommunityWaitlistStatus;
  created_at: string;
}

export interface CommunityCircle {
  id: string;
  pool_key: string;
  persona: CommunityMatchingPersona;
  time_in_canada: TimeInCanada;
  goal: string | null;
  topics: string[];
  match_metadata: Record<string, unknown> | null;
  created_at: string;
  ends_at: string;
  status: CommunityCircleStatus;
}

export interface CommunityCircleMembership {
  id: string;
  circle_id: string;
  user_id: string;
  joined_at: string | null;
  left_at: string | null;
  circle: CommunityCircle;
}

export interface CommunityCircleMemberProfile {
  id: string;
  circle_id: string;
  user_id: string;
  joined_at: string | null;
  left_at: string | null;
  user: {
    id: string;
    username: string;
    profile_picture_url: string | null;
  };
}

export interface CommunityMessage {
  id: string;
  circle_id: string;
  sender_user_id: string | null;
  content: string;
  created_at: string;
  message_type: CommunityMessageType;
  metadata: Record<string, unknown> | null;
  dedupe_key?: string | null;
  sender?: {
    id: string;
    username: string;
    profile_picture_url: string | null;
  } | null;
}

export type CommunityNotificationType =
  | 'circle_matched'
  | 'circle_ended'
  | 'circle_ending_soon'
  | 'new_message'
  | 'followed'
  | 'liked'
  | 'commented'
  | 'comment_liked'
  | 'comment_reply'
  | 'invite_redeemed';

/** Navigation target: profile = actor_user_id, post = post_id */
export type CommunityNotificationData = {
  circle_id?: string;
  /** User who performed the action (for profile nav or display). */
  actor_user_id?: string;
  /** Post id for liked/commented → navigate to post. */
  post_id?: number;
  comment_id?: number;
  parent_comment_id?: number;
  /**
   * Structured copy for localized rendering. `title`/`body` stay English for
   * older builds; readers that understand this render
   * `notifications.templates.<key>` instead. See `utils/notificationText.ts`.
   */
  i18n?: {
    key: string;
    params?: Record<string, string | number>;
  };
};

export interface CommunityNotification {
  id: string;
  user_id: string;
  type: CommunityNotificationType;
  title: string;
  body: string;
  data: CommunityNotificationData | null;
  read_at: string | null;
  created_at: string;
}
