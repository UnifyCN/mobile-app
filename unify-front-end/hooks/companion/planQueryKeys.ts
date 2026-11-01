/** Saved plans and open plan drafts of one account (#364). */
export const PLANS_ROOT = 'companion-plans' as const;
export const plansKey = (userId: string | null) => [PLANS_ROOT, userId] as const;
/** One plan draft, per account. */
export const PLAN_PROPOSAL_ROOT = 'companion-plan-proposal' as const;
export const planProposalKey = (userId: string | null, id: string | null) =>
  [PLAN_PROPOSAL_ROOT, userId, id] as const;
/** The plan drafts of one conversation, per account. */
export const CONVERSATION_PLANS_ROOT = 'companion-conversation-plans' as const;
export const conversationPlansKey = (
  userId: string | null | undefined,
  conversationId: string | null
) => [CONVERSATION_PLANS_ROOT, userId ?? null, conversationId] as const;
