import { useMemo } from 'react';
import { usePostHog } from 'posthog-react-native';
import type {
  PartnershipType,
  ResourceLinkFailureReason,
  ResourceLinkTarget,
} from '@/types/partner';

// Event name constants for type safety and consistency
export const AnalyticsEvents = {
  // Tab navigation
  TAB_SWITCHED: 'tab_switched',

  // Posts
  POST_LIKED: 'post_liked',
  POST_UNLIKED: 'post_unliked',
  POST_SAVED: 'post_saved',
  POST_UNSAVED: 'post_unsaved',
  POST_COMMENT_OPENED: 'post_comment_opened',
  POST_CREATED: 'post_created',
  POST_DELETED: 'post_deleted',
  POST_PINNED: 'post_pinned',
  POST_UNPINNED: 'post_unpinned',
  POST_FAILED: 'post_failed',

  // Comments
  COMMENT_CREATED: 'comment_created',
  COMMENT_LIKED: 'comment_liked',
  COMMENT_UNLIKED: 'comment_unliked',
  COMMENT_DELETED: 'comment_deleted',
  REPLY_PILL_TAPPED: 'reply_pill_tapped',

  // Follow / profile
  USER_FOLLOWED: 'user_followed',
  USER_UNFOLLOWED: 'user_unfollowed',
  PROFILE_VIEWED: 'profile_viewed',
  PROFILE_PICTURE_UPDATED: 'profile_picture_updated',
  PROFILE_EDITED: 'profile_edited',

  // Block / safety
  USER_BLOCKED: 'user_blocked',
  USER_UNBLOCKED: 'user_unblocked',

  // Push permissions
  PUSH_PERMISSION_PROMPTED: 'push_permission_prompted',
  PUSH_PERMISSION_GRANTED: 'push_permission_granted',
  PUSH_PERMISSION_DENIED: 'push_permission_denied',

  // Groups
  GROUP_JOINED: 'group_joined',
  GROUP_LEFT: 'group_left',
  GROUP_VIEWED: 'group_viewed',

  // Events
  EVENT_VIEWED: 'event_viewed',
  EVENT_SHARED: 'event_shared',
  EVENT_EXTERNAL_LINK_CLICKED: 'event_external_link_clicked',

  // AI Companion
  COMPANION_MESSAGE_SENT: 'companion_message_sent',
  COMPANION_STARTER_PROMPT_USED: 'companion_starter_prompt_used',
  COMPANION_SUGGESTION_CLICKED: 'companion_suggestion_clicked',
  COMPANION_HISTORY_VIEWED: 'companion_history_viewed',

  // Learning
  MODULE_VIEWED: 'module_viewed',
  SUBMODULE_STARTED: 'submodule_started',
  LESSON_PAGE_VIEWED: 'lesson_page_viewed',
  LESSON_COMPLETED: 'lesson_completed',

  // Learn - Text Selection & Highlights
  LESSON_TEXT_SELECTED: 'lesson_text_selected',
  LESSON_HIGHLIGHT_CREATED: 'lesson_highlight_created',
  LESSON_HIGHLIGHT_REMOVED: 'lesson_highlight_removed',
  LESSON_ASK_AI_USED: 'lesson_ask_ai_used',
  LESSON_ASK_AI_RETRY: 'lesson_ask_ai_retry',

  // Auth
  SIGN_UP_STARTED: 'sign_up_started',
  SIGN_UP_COMPLETED: 'sign_up_completed',
  SIGN_UP_FAILED: 'sign_up_failed',
  SIGN_IN_COMPLETED: 'sign_in_completed',
  SIGN_IN_FAILED: 'sign_in_failed',
  GOOGLE_SIGN_IN_USED: 'google_sign_in_used',
  APPLE_SIGN_IN_USED: 'apple_sign_in_used',
  USER_SIGNED_OUT: 'user_signed_out',
  ACCOUNT_DELETED: 'account_deleted',

  // Search
  SEARCH_OPENED: 'search_opened',
  SEARCH_QUERY_SUBMITTED: 'search_query_submitted',

  // Feed
  FEED_TAB_SWITCHED: 'feed_tab_switched',

  // New Learning Events
  MODULE_CARD_CLICKED: 'module_card_clicked',
  SUBMODULE_VIEWED: 'submodule_viewed',
  LESSON_STARTED: 'lesson_started',
  QUIZ_CARD_CLICKED: 'quiz_card_clicked',
  QUIZ_COMPLETED: 'quiz_completed',
  ACTIVITY_COMPLETED: 'activity_completed',

  // Checklist
  CHECKLIST_TASK_COMPLETED: 'checklist_task_completed',
  CHECKLIST_TASK_UNCOMPLETED: 'checklist_task_uncompleted',
  CHECKLIST_CUSTOM_TASK_CREATED: 'checklist_custom_task_created',
  CHECKLIST_CUSTOM_TASK_DELETED: 'checklist_custom_task_deleted',
  DEADLINE_CREATED: 'deadline_created',
  DEADLINE_UPDATED: 'deadline_updated',
  DEADLINE_COMPLETED: 'deadline_completed',
  DEADLINE_UNCOMPLETED: 'deadline_uncompleted',
  DEADLINE_DELETED: 'deadline_deleted',
  DEADLINE_REMINDERS_SCHEDULED: 'deadline_reminders_scheduled',

  // Reports
  REPORT_SUBMITTED: 'report_submitted',

  // Onboarding
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  ONBOARDING_COMPLETED: 'onboarding_completed',

  // Notifications
  NOTIFICATION_OPENED: 'notification_opened',
  NOTIFICATIONS_MARK_ALL_READ: 'notifications_mark_all_read',

  // AI Companion (extended)
  COMPANION_RESPONSE_RECEIVED: 'companion_response_received',
  COMPANION_FEEDBACK_GIVEN: 'companion_feedback_given',
  COMPANION_CHIP_REFRESHED: 'companion_chip_refreshed',

  // Daily Tips
  TIP_VIEWED: 'tip_viewed',
  TIP_TAPPED: 'tip_tapped',

  // Resources (trusted-services directory)
  RESOURCES_VIEWED: 'resources_viewed',
  RESOURCES_CATEGORY_OPENED: 'resources_category_opened',
  RESOURCES_PARTNER_OPENED: 'resources_partner_opened',
  RESOURCES_PARTNER_WEBSITE_CLICKED: 'resources_partner_website_clicked',
  RESOURCES_PROGRAM_CLICKED: 'resources_program_clicked',
  RESOURCES_LINK_FAILED: 'resources_link_failed',

  // Referrals (refer-a-friend)
  INVITE_CODE_GENERATED: 'invite_code_generated',
  INVITE_SCREEN_OPENED: 'invite_screen_opened',
  INVITE_SHARE_SHEET_OPENED: 'invite_share_sheet_opened',
  INVITE_SHARE_COMPLETED: 'invite_share_completed',
  INVITE_CODE_DETECTED_FROM_CLIPBOARD: 'invite_code_detected_from_clipboard',
  INVITE_REDEEMED: 'invite_redeemed',
  INVITE_REDEEM_FAILED: 'invite_redeem_failed',
  INVITE_GROUPS_JOINED_AT_SIGNUP: 'invite_groups_joined_at_signup',
  REFERRAL_AUTO_FOLLOW_COMPLETED: 'referral_auto_follow_completed',

  // Giveaway (Loblaws $100 — May 2026)
  GIVEAWAY_BANNER_SHOWN: 'giveaway_banner_shown',
  GIVEAWAY_BANNER_DISMISSED: 'giveaway_banner_dismissed',
  GIVEAWAY_BANNER_TAPPED: 'giveaway_banner_tapped',
  GIVEAWAY_STEP_VIEWED: 'giveaway_step_viewed',
  GIVEAWAY_ENTRY_SUBMITTED: 'giveaway_entry_submitted',
  GIVEAWAY_ENTRY_FAILED: 'giveaway_entry_failed',

  // Errors
  MUTATION_FAILED: 'mutation_failed',
} as const;

export type AnalyticsEventName =
  (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];

// Event property types for type safety
export interface TabSwitchProperties {
  from_tab: string;
  to_tab: string;
}

export interface PostEventProperties {
  post_id: string;
}

export interface GroupEventProperties {
  group_id: string;
  group_name?: string;
}

export interface EventEventProperties {
  event_id: string;
  event_title?: string;
}

export interface CompanionMessageProperties {
  message_length: number;
}

export interface CompanionPromptProperties {
  prompt: string;
  mode?: string;
}

export interface LessonProperties {
  module_id: string;
  submodule_id?: string;
  lesson_id?: string;
  page_number?: number;
  total_pages?: number;
}

export interface AuthErrorProperties {
  error_type: string;
}

export interface GoogleSignInProperties {
  auth_type: 'sign_up' | 'sign_in';
}

export interface AppleSignInProperties {
  auth_type: 'sign_up' | 'sign_in';
}

export interface FeedTabProperties {
  tab_name: 'For You' | 'Following' | 'Groups';
}

export interface ChecklistTaskProperties {
  task_title: string;
  task_priority: string;
  source: 'sanity' | 'custom';
}

export interface ReportProperties {
  report_type: 'post' | 'user';
}

export interface OnboardingStepProperties {
  step_number: number;
  step_name: string;
}

export interface NotificationProperties {
  notification_type: string;
}

export interface CompanionResponseProperties {
  query_type: string;
  has_sources: boolean;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  estimated_cost_usd?: number;
  response_time_ms?: number;
}

export interface TipViewedProperties {
  tip_id: string;
  category: string;
  persona: string;
  stage: string;
  date: string;
}

export interface IdentifyUserProperties {
  email?: string | null;
  username?: string | null;
  persona?: string | null;
  is_premium?: boolean;
  city?: string | null;
  province?: string | null;
  arrival_date?: string | null;
  stage?: number | null;
}

export type AuthMethod = 'email' | 'google' | 'apple';

export interface AuthCompletedProperties {
  method: AuthMethod;
}

export interface CommentCreatedProperties {
  post_id: string;
  comment_id?: string;
  is_reply: boolean;
  parent_comment_id?: string;
  body_length: number;
}

export interface CommentInteractionProperties {
  comment_id: string;
  post_id?: string;
  is_reply?: boolean;
}

export type FollowSource =
  | 'profile'
  | 'feed'
  | 'invite_auto_follow'
  | 'search'
  | 'followers_list'
  | 'following_list'
  | 'community';

export interface FollowProperties {
  target_user_id: string;
  source: FollowSource;
}

export interface ProfileViewedProperties {
  profile_user_id: string;
  is_self: boolean;
}

export interface PushPermissionProperties {
  prompted_in?: 'onboarding' | 'in_app' | 'system';
}

export interface PostFailedProperties {
  surface: 'create' | 'delete' | 'pin' | 'unpin';
  reason?: string;
  group_id?: string;
}

export interface MutationFailedProperties {
  surface: string;
  error_message?: string;
  error_code?: string;
}

export interface CompanionFeedbackProperties {
  message_id?: string;
  rating: 'up' | 'down';
}

export interface InviteShareCompletedProperties {
  result: 'sent' | 'dismissed' | 'unknown';
  activity_type?: string | null;
}

// Hook for analytics tracking
export function useAnalytics() {
  const posthog = usePostHog();

  return useMemo(
    () => ({
      // Identity
      identify: (userId: string, properties: IdentifyUserProperties) => {
        posthog?.identify(userId, { ...properties });
      },
      reset: () => {
        posthog?.reset();
      },

      // Screen tracking
      trackScreen: (screenName: string) => {
        posthog?.screen(screenName);
      },

      // Tab navigation
      trackTabSwitch: (fromTab: string, toTab: string) => {
        posthog?.capture(AnalyticsEvents.TAB_SWITCHED, {
          from_tab: fromTab,
          to_tab: toTab,
        });
      },

      // Post interactions
      trackPostLike: (postId: string) => {
        posthog?.capture(AnalyticsEvents.POST_LIKED, { post_id: postId });
      },
      trackPostUnlike: (postId: string) => {
        posthog?.capture(AnalyticsEvents.POST_UNLIKED, { post_id: postId });
      },
      trackPostSave: (postId: string) => {
        posthog?.capture(AnalyticsEvents.POST_SAVED, { post_id: postId });
      },
      trackPostUnsave: (postId: string) => {
        posthog?.capture(AnalyticsEvents.POST_UNSAVED, { post_id: postId });
      },
      trackPostCommentOpened: (postId: string) => {
        posthog?.capture(AnalyticsEvents.POST_COMMENT_OPENED, {
          post_id: postId,
        });
      },
      trackPostCreated: (postId?: string) => {
        posthog?.capture(AnalyticsEvents.POST_CREATED, {
          ...(postId && { post_id: postId }),
          post_id_known: !!postId,
        });
      },
      trackPostDeleted: (postId: string) => {
        posthog?.capture(AnalyticsEvents.POST_DELETED, { post_id: postId });
      },
      trackPostPinned: (postId: string) => {
        posthog?.capture(AnalyticsEvents.POST_PINNED, { post_id: postId });
      },
      trackPostUnpinned: (postId: string) => {
        posthog?.capture(AnalyticsEvents.POST_UNPINNED, { post_id: postId });
      },
      trackPostFailed: (properties: PostFailedProperties) => {
        posthog?.capture(AnalyticsEvents.POST_FAILED, { ...properties });
      },

      // Comments
      trackCommentCreated: (properties: CommentCreatedProperties) => {
        posthog?.capture(AnalyticsEvents.COMMENT_CREATED, { ...properties });
      },
      trackCommentLiked: (properties: CommentInteractionProperties) => {
        posthog?.capture(AnalyticsEvents.COMMENT_LIKED, { ...properties });
      },
      trackCommentUnliked: (properties: CommentInteractionProperties) => {
        posthog?.capture(AnalyticsEvents.COMMENT_UNLIKED, { ...properties });
      },
      trackCommentDeleted: (properties: CommentInteractionProperties) => {
        posthog?.capture(AnalyticsEvents.COMMENT_DELETED, { ...properties });
      },
      trackReplyPillTapped: (parentCommentId: string) => {
        posthog?.capture(AnalyticsEvents.REPLY_PILL_TAPPED, {
          parent_comment_id: parentCommentId,
        });
      },

      // Follow / profile
      trackUserFollowed: (properties: FollowProperties) => {
        posthog?.capture(AnalyticsEvents.USER_FOLLOWED, { ...properties });
      },
      trackUserUnfollowed: (properties: FollowProperties) => {
        posthog?.capture(AnalyticsEvents.USER_UNFOLLOWED, { ...properties });
      },
      trackProfileViewed: (properties: ProfileViewedProperties) => {
        posthog?.capture(AnalyticsEvents.PROFILE_VIEWED, { ...properties });
      },
      trackProfilePictureUpdated: () => {
        posthog?.capture(AnalyticsEvents.PROFILE_PICTURE_UPDATED);
      },
      trackProfileEdited: (field: string) => {
        posthog?.capture(AnalyticsEvents.PROFILE_EDITED, { field });
      },

      // Block / safety
      trackUserBlocked: (targetUserId: string) => {
        posthog?.capture(AnalyticsEvents.USER_BLOCKED, {
          target_user_id: targetUserId,
        });
      },
      trackUserUnblocked: (targetUserId: string) => {
        posthog?.capture(AnalyticsEvents.USER_UNBLOCKED, {
          target_user_id: targetUserId,
        });
      },

      // Push permissions
      trackPushPermissionPrompted: (properties?: PushPermissionProperties) => {
        posthog?.capture(AnalyticsEvents.PUSH_PERMISSION_PROMPTED, {
          ...(properties ?? {}),
        });
      },
      trackPushPermissionGranted: (properties?: PushPermissionProperties) => {
        posthog?.capture(AnalyticsEvents.PUSH_PERMISSION_GRANTED, {
          ...(properties ?? {}),
        });
      },
      trackPushPermissionDenied: (properties?: PushPermissionProperties) => {
        posthog?.capture(AnalyticsEvents.PUSH_PERMISSION_DENIED, {
          ...(properties ?? {}),
        });
      },

      // Account lifecycle
      trackUserSignedOut: (reason?: string) => {
        posthog?.capture(
          AnalyticsEvents.USER_SIGNED_OUT,
          reason ? { reason } : {}
        );
      },
      trackAccountDeleted: () => {
        posthog?.capture(AnalyticsEvents.ACCOUNT_DELETED);
      },

      // Companion (extended)
      trackCompanionFeedbackGiven: (
        properties: CompanionFeedbackProperties
      ) => {
        posthog?.capture(AnalyticsEvents.COMPANION_FEEDBACK_GIVEN, {
          ...properties,
        });
      },
      trackCompanionChipRefreshed: () => {
        posthog?.capture(AnalyticsEvents.COMPANION_CHIP_REFRESHED);
      },

      // Referrals (extended)
      trackInviteShareCompleted: (
        properties: InviteShareCompletedProperties
      ) => {
        posthog?.capture(AnalyticsEvents.INVITE_SHARE_COMPLETED, {
          ...properties,
        });
      },
      trackReferralAutoFollowCompleted: (referrerUserId: string) => {
        posthog?.capture(AnalyticsEvents.REFERRAL_AUTO_FOLLOW_COMPLETED, {
          referrer_user_id: referrerUserId,
        });
      },

      // Errors
      trackMutationFailed: (properties: MutationFailedProperties) => {
        posthog?.capture(AnalyticsEvents.MUTATION_FAILED, { ...properties });
      },

      // Group interactions
      trackGroupViewed: (groupId: string, groupName?: string) => {
        posthog?.capture(AnalyticsEvents.GROUP_VIEWED, {
          group_id: groupId,
          ...(groupName && { group_name: groupName }),
        });
      },
      trackGroupJoined: (groupId: string, groupName?: string) => {
        posthog?.capture(AnalyticsEvents.GROUP_JOINED, {
          group_id: groupId,
          ...(groupName && { group_name: groupName }),
        });
      },
      trackGroupLeft: (groupId: string, groupName?: string) => {
        posthog?.capture(AnalyticsEvents.GROUP_LEFT, {
          group_id: groupId,
          ...(groupName && { group_name: groupName }),
        });
      },

      // Event interactions
      trackEventViewed: (eventId: string, eventTitle?: string) => {
        posthog?.capture(AnalyticsEvents.EVENT_VIEWED, {
          event_id: eventId,
          ...(eventTitle && { event_title: eventTitle }),
        });
      },
      trackEventShared: (eventId: string, eventTitle?: string) => {
        posthog?.capture(AnalyticsEvents.EVENT_SHARED, {
          event_id: eventId,
          ...(eventTitle && { event_title: eventTitle }),
        });
      },
      trackEventExternalLinkClicked: (eventId: string, eventTitle?: string) => {
        posthog?.capture(AnalyticsEvents.EVENT_EXTERNAL_LINK_CLICKED, {
          event_id: eventId,
          ...(eventTitle && { event_title: eventTitle }),
        });
      },

      // AI Companion
      trackCompanionMessageSent: (messageLength: number) => {
        posthog?.capture(AnalyticsEvents.COMPANION_MESSAGE_SENT, {
          message_length: messageLength,
        });
      },
      trackCompanionStarterPromptUsed: (
        prompt: string,
        mode?: string,
        isPersonalized?: boolean
      ) => {
        posthog?.capture(AnalyticsEvents.COMPANION_STARTER_PROMPT_USED, {
          prompt,
          ...(mode && { mode }),
          ...(isPersonalized !== undefined && { is_personalized: isPersonalized }),
        });
      },
      trackCompanionSuggestionClicked: (suggestion: string) => {
        posthog?.capture(AnalyticsEvents.COMPANION_SUGGESTION_CLICKED, {
          suggestion,
        });
      },
      trackCompanionHistoryViewed: () => {
        posthog?.capture(AnalyticsEvents.COMPANION_HISTORY_VIEWED);
      },

      // Learning
      trackModuleViewed: (
        moduleId: string,
        moduleTitle?: string,
        submoduleCount?: number
      ) => {
        posthog?.capture(AnalyticsEvents.MODULE_VIEWED, {
          module_id: moduleId,
          ...(moduleTitle && { module_title: moduleTitle }),
          ...(submoduleCount !== undefined && {
            submodule_count: submoduleCount,
          }),
        });
      },
      trackSubmoduleStarted: (moduleId: string, submoduleId: string) => {
        posthog?.capture(AnalyticsEvents.SUBMODULE_STARTED, {
          module_id: moduleId,
          submodule_id: submoduleId,
        });
      },
      trackLessonPageViewed: (
        moduleId: string,
        submoduleId: string,
        lessonId: string,
        pageNumber: number,
        totalPages: number
      ) => {
        posthog?.capture(AnalyticsEvents.LESSON_PAGE_VIEWED, {
          module_id: moduleId,
          submodule_id: submoduleId,
          lesson_id: lessonId,
          page_number: pageNumber,
          total_pages: totalPages,
        });
      },
      trackLessonCompleted: (
        moduleId: string,
        submoduleId: string,
        lessonId: string
      ) => {
        posthog?.capture(AnalyticsEvents.LESSON_COMPLETED, {
          module_id: moduleId,
          submodule_id: submoduleId,
          lesson_id: lessonId,
        });
      },

      // New Learning
      trackModuleCardClicked: (moduleId: string, moduleTitle: string) => {
        posthog?.capture(AnalyticsEvents.MODULE_CARD_CLICKED, {
          module_id: moduleId,
          module_title: moduleTitle,
        });
      },
      trackSubmoduleViewed: (
        moduleId: string,
        submoduleId: string,
        submoduleTitle?: string
      ) => {
        posthog?.capture(AnalyticsEvents.SUBMODULE_VIEWED, {
          module_id: moduleId,
          submodule_id: submoduleId,
          ...(submoduleTitle && { submodule_title: submoduleTitle }),
        });
      },
      trackLessonStarted: (
        moduleId: string,
        submoduleId: string,
        lessonId: string,
        lessonTitle?: string
      ) => {
        posthog?.capture(AnalyticsEvents.LESSON_STARTED, {
          module_id: moduleId,
          submodule_id: submoduleId,
          lesson_id: lessonId,
          ...(lessonTitle && { lesson_title: lessonTitle }),
        });
      },
      trackActivityCompleted: (
        moduleId: string,
        submoduleId: string,
        lessonId: string,
        activityId: string
      ) => {
        posthog?.capture(AnalyticsEvents.ACTIVITY_COMPLETED, {
          module_id: moduleId,
          submodule_id: submoduleId,
          lesson_id: lessonId,
          activity_id: activityId,
        });
      },

      // Auth
      trackSignUpStarted: () => {
        posthog?.capture(AnalyticsEvents.SIGN_UP_STARTED);
      },
      trackSignUpCompleted: (method: AuthMethod = 'email') => {
        posthog?.capture(AnalyticsEvents.SIGN_UP_COMPLETED, { method });
      },
      trackSignUpFailed: (errorType: string, method: AuthMethod = 'email') => {
        posthog?.capture(AnalyticsEvents.SIGN_UP_FAILED, {
          error_type: errorType,
          method,
        });
      },
      trackSignInCompleted: (method: AuthMethod = 'email') => {
        posthog?.capture(AnalyticsEvents.SIGN_IN_COMPLETED, { method });
      },
      trackSignInFailed: (errorType: string, method: AuthMethod = 'email') => {
        posthog?.capture(AnalyticsEvents.SIGN_IN_FAILED, {
          error_type: errorType,
          method,
        });
      },
      trackGoogleSignInUsed: (authType: 'sign_up' | 'sign_in') => {
        posthog?.capture(AnalyticsEvents.GOOGLE_SIGN_IN_USED, {
          auth_type: authType,
        });
      },
      trackAppleSignInUsed: (authType: 'sign_up' | 'sign_in') => {
        posthog?.capture(AnalyticsEvents.APPLE_SIGN_IN_USED, {
          auth_type: authType,
        });
      },

      // Search
      trackSearchOpened: () => {
        posthog?.capture(AnalyticsEvents.SEARCH_OPENED);
      },
      trackSearchQuerySubmitted: (query: string) => {
        posthog?.capture(AnalyticsEvents.SEARCH_QUERY_SUBMITTED, { query });
      },

      // Feed
      trackFeedTabSwitched: (tabName: 'For You' | 'Following' | 'Groups') => {
        posthog?.capture(AnalyticsEvents.FEED_TAB_SWITCHED, {
          tab_name: tabName,
        });
      },

      // Checklist
      trackChecklistTaskCompleted: (
        taskTitle: string,
        taskPriority: string,
        source: 'sanity' | 'custom'
      ) => {
        posthog?.capture(AnalyticsEvents.CHECKLIST_TASK_COMPLETED, {
          task_title: taskTitle,
          task_priority: taskPriority,
          source,
        });
      },
      trackChecklistTaskUncompleted: (
        taskTitle: string,
        taskPriority: string,
        source: 'sanity' | 'custom'
      ) => {
        posthog?.capture(AnalyticsEvents.CHECKLIST_TASK_UNCOMPLETED, {
          task_title: taskTitle,
          task_priority: taskPriority,
          source,
        });
      },
      trackChecklistCustomTaskCreated: () => {
        posthog?.capture(AnalyticsEvents.CHECKLIST_CUSTOM_TASK_CREATED);
      },
      trackChecklistCustomTaskDeleted: () => {
        posthog?.capture(AnalyticsEvents.CHECKLIST_CUSTOM_TASK_DELETED);
      },

      // Checklist 2.0 deadlines (dates only; never the title, it can hold PII)
      trackDeadlineCreated: (kind: string, daysUntilDue: number, linked: boolean) => {
        posthog?.capture(AnalyticsEvents.DEADLINE_CREATED, {
          kind,
          days_until_due: daysUntilDue,
          linked_to_task: linked,
        });
      },
      trackDeadlineUpdated: (kind: string, daysUntilDue: number) => {
        posthog?.capture(AnalyticsEvents.DEADLINE_UPDATED, {
          kind,
          days_until_due: daysUntilDue,
        });
      },
      trackDeadlineCompleted: (kind: string, daysUntilDue: number) => {
        posthog?.capture(AnalyticsEvents.DEADLINE_COMPLETED, {
          kind,
          days_until_due: daysUntilDue,
        });
      },
      trackDeadlineUncompleted: (kind: string) => {
        posthog?.capture(AnalyticsEvents.DEADLINE_UNCOMPLETED, { kind });
      },
      trackDeadlineDeleted: (kind: string) => {
        posthog?.capture(AnalyticsEvents.DEADLINE_DELETED, { kind });
      },
      trackDeadlineRemindersScheduled: (count: number, permission: string) => {
        posthog?.capture(AnalyticsEvents.DEADLINE_REMINDERS_SCHEDULED, {
          count,
          permission,
        });
      },

      // Reports
      trackReportSubmitted: (reportType: 'post' | 'user') => {
        posthog?.capture(AnalyticsEvents.REPORT_SUBMITTED, {
          report_type: reportType,
        });
      },

      // Onboarding
      trackOnboardingStepCompleted: (stepNumber: number, stepName: string) => {
        posthog?.capture(AnalyticsEvents.ONBOARDING_STEP_COMPLETED, {
          step_number: stepNumber,
          step_name: stepName,
        });
      },
      trackOnboardingCompleted: (persona: string | null) => {
        posthog?.capture(AnalyticsEvents.ONBOARDING_COMPLETED, {
          ...(persona && { persona }),
        });
      },

      // Notifications
      trackNotificationOpened: (
        notificationType: string,
        deepLinkTarget?: string | null
      ) => {
        posthog?.capture(AnalyticsEvents.NOTIFICATION_OPENED, {
          notification_type: notificationType,
          ...(deepLinkTarget && { deep_link_target: deepLinkTarget }),
        });
      },
      trackNotificationsMarkAllRead: (count: number) => {
        posthog?.capture(AnalyticsEvents.NOTIFICATIONS_MARK_ALL_READ, {
          count,
        });
      },

      // Learn - Text Selection & Highlights
      trackLessonTextSelected: (lessonId: string, selectedText: string) => {
        posthog?.capture(AnalyticsEvents.LESSON_TEXT_SELECTED, {
          lesson_id: lessonId,
          text_length: selectedText.length,
          word_count: selectedText.trim().split(/\s+/).filter(Boolean).length,
        });
      },
      trackLessonHighlightCreated: (lessonId: string, selectedText: string) => {
        posthog?.capture(AnalyticsEvents.LESSON_HIGHLIGHT_CREATED, {
          lesson_id: lessonId,
          text_length: selectedText.length,
        });
      },
      trackLessonHighlightRemoved: (lessonId: string) => {
        posthog?.capture(AnalyticsEvents.LESSON_HIGHLIGHT_REMOVED, {
          lesson_id: lessonId,
        });
      },
      trackLessonAskAiUsed: (lessonId: string, term: string) => {
        posthog?.capture(AnalyticsEvents.LESSON_ASK_AI_USED, {
          lesson_id: lessonId,
          term_length: term.length,
        });
      },
      trackLessonAskAiRetry: (lessonId: string) => {
        posthog?.capture(AnalyticsEvents.LESSON_ASK_AI_RETRY, {
          lesson_id: lessonId,
        });
      },

      // AI Companion (extended)
      trackCompanionResponseReceived: (
        properties: CompanionResponseProperties
      ) => {
        posthog?.capture(AnalyticsEvents.COMPANION_RESPONSE_RECEIVED, {
          ...properties,
        });
      },

      // Daily Tips
      trackTipViewed: (properties: TipViewedProperties) => {
        posthog?.capture(AnalyticsEvents.TIP_VIEWED, { ...properties });
      },
      trackTipTapped: (tipId: string, category: string) => {
        posthog?.capture(AnalyticsEvents.TIP_TAPPED, {
          tip_id: tipId,
          category,
        });
      },

      // Resources (trusted-services directory)
      trackResourcesViewed: () => {
        posthog?.capture(AnalyticsEvents.RESOURCES_VIEWED);
      },
      trackResourcesCategoryOpened: (category: string) => {
        posthog?.capture(AnalyticsEvents.RESOURCES_CATEGORY_OPENED, {
          category,
        });
      },
      trackResourcesPartnerOpened: (
        slug: string,
        category: string,
        partnershipType: PartnershipType
      ) => {
        posthog?.capture(AnalyticsEvents.RESOURCES_PARTNER_OPENED, {
          slug,
          category,
          partnership_type: partnershipType,
        });
      },
      trackResourcesPartnerWebsiteClicked: (
        slug: string,
        partnershipType: PartnershipType
      ) => {
        posthog?.capture(AnalyticsEvents.RESOURCES_PARTNER_WEBSITE_CLICKED, {
          slug,
          partnership_type: partnershipType,
        });
      },
      trackResourcesProgramClicked: (slug: string, programId: string) => {
        posthog?.capture(AnalyticsEvents.RESOURCES_PROGRAM_CLICKED, {
          slug,
          program_id: programId,
        });
      },
      trackResourcesLinkFailed: (
        slug: string,
        target: ResourceLinkTarget,
        reason: ResourceLinkFailureReason,
        programId?: string
      ) => {
        posthog?.capture(AnalyticsEvents.RESOURCES_LINK_FAILED, {
          slug,
          target,
          reason,
          ...(programId && { program_id: programId }),
        });
      },

      // Generic event capture
      capture: (
        eventName: AnalyticsEventName,
        properties?: Record<string, any>
      ) => {
        posthog?.capture(eventName, properties);
      },
    }),
    [posthog]
  );
}
