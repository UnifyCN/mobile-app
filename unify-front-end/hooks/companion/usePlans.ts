import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CHECKLIST_TASKS_QUERY_ROOT } from '@/hooks/checklist/checklistQueryKeys';
import { useAccountSnapshot } from '@/hooks/auth/useSessionAccountId';
import {
  ownAccountWork,
  type AccountSnapshot,
} from '@/services/account/accountSession';
import { useAnalytics } from '@/utils/analytics';
import {
  buildPlanResultProperties,
  type TaskActionSurface,
} from '@/services/companionActions/analytics';
import { createPlanClient, type PlanClient } from '@/services/companionActions/planClient';
import type { PlanProposal, PlanView } from '@/services/companionActions/planContract';
import {
  clearPlanStores,
  planStoreFor,
  type PlanPhase,
  type PlanStore,
} from '@/services/companionActions/planStore';
import { newOperationId } from '@/services/companionActions/operationId';
import { mobileTransportFor } from '@/services/companionActions/transport';
import { useTaskActionAccount, TASK_PROGRESS_ROOT } from './useTaskActions';

import {
  PLANS_ROOT,
  plansKey,
  PLAN_PROPOSAL_ROOT,
  planProposalKey,
  CONVERSATION_PLANS_ROOT,
  conversationPlansKey,
} from './planQueryKeys';
export {
  PLANS_ROOT,
  plansKey,
  PLAN_PROPOSAL_ROOT,
  planProposalKey,
  CONVERSATION_PLANS_ROOT,
  conversationPlansKey,
} from './planQueryKeys';

class ReadFailed extends Error {}

/** The plan client of `owner`'s account: requests are made only as that account and session. */
export function createMobilePlanClient(owner: AccountSnapshot): PlanClient {
  return createPlanClient({
    transport: mobileTransportFor(owner),
    platform: Platform.OS === 'android' ? 'android' : 'ios',
    appVersion: Constants.expoConfig?.version ?? 'unknown',
  });
}

/**
 * Drops every other account's plans, drafts and unresolved plan writes. Every key
 * carries the account id, so a mounted view reads only the signed-in account's entry;
 * this removes the rest and cancels reads still in flight for another account.
 */
function usePlanAccountScope(userId: string | null | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (userId === undefined) return;
    clearPlanStores(userId);
    for (const root of [PLANS_ROOT, PLAN_PROPOSAL_ROOT, CONVERSATION_PLANS_ROOT]) {
      const other = (q: { queryKey: readonly unknown[] }) => q.queryKey[1] !== userId;
      void queryClient.cancelQueries({ queryKey: [root], predicate: other });
      queryClient.removeQueries({ queryKey: [root], predicate: other });
    }
  }, [userId, queryClient]);
}

export type PlansStatus = 'loading' | 'ready' | 'failed' | 'unavailable' | 'signed_out';

/**
 * The persistent plan entry's data: saved plans (newest first) and open drafts.
 * Loading and a failed read are their own states: neither reads as "no plan".
 */
export function usePlans(): {
  status: PlansStatus;
  plans: PlanView[];
  drafts: PlanProposal[];
  refetch: () => void;
} {
  const userId = useTaskActionAccount();
  usePlanAccountScope(userId);
  const query = useQuery({
    queryKey: plansKey(userId ?? null),
    enabled: Boolean(userId),
    queryFn: async () => {
      const owner = ownAccountWork();
      if (owner.accountId !== userId) throw new ReadFailed('account changed');
      const result = await createMobilePlanClient(owner).plans();
      if (result.kind === 'unknown') throw new ReadFailed('unreachable');
      return result;
    },
    staleTime: 0,
    retry: false,
    refetchInterval: q => (q.state.status === 'error' ? 5_000 : false),
  });
  const data = query.data;
  let status: PlansStatus;
  if (userId === null || data?.kind === 'unauthorized') status = 'signed_out';
  else if (data?.kind === 'unavailable' || data?.kind === 'refused') status = 'unavailable';
  else if (data?.kind === 'ok') status = 'ready';
  else if (query.isError) status = 'failed';
  else status = 'loading';
  const refetch = query.refetch;
  return {
    status,
    plans: data?.kind === 'ok' ? data.plans : [],
    drafts: data?.kind === 'ok' ? data.drafts : [],
    refetch: useMemo(() => () => void refetch(), [refetch]),
  };
}

/** One plan draft, read as the signed-in account. */
export function usePlanProposal(id: string | null) {
  const userId = useTaskActionAccount() ?? null;
  return useQuery({
    queryKey: planProposalKey(userId, id),
    enabled: Boolean(userId && id),
    queryFn: async (): Promise<PlanProposal> => {
      const owner = ownAccountWork();
      if (owner.accountId !== userId) throw new ReadFailed('account changed');
      const result = await createMobilePlanClient(owner).proposal(id as string);
      if (result.kind === 'ok' || result.kind === 'changed') return result.proposal;
      throw new ReadFailed(result.kind);
    },
    staleTime: 0,
    retry: 1,
  });
}

/** The plan drafts a conversation produced, for its cards. */
export function useConversationPlans(conversationId: string | null) {
  const userId = useTaskActionAccount() ?? null;
  return useQuery({
    queryKey: conversationPlansKey(userId, conversationId),
    enabled: Boolean(userId && conversationId),
    queryFn: async () => {
      const owner = ownAccountWork();
      if (owner.accountId !== userId) throw new ReadFailed('account changed');
      const result = await createMobilePlanClient(owner).conversationPlans(conversationId as string);
      if (result.kind !== 'ok') throw new ReadFailed(result.kind);
      return result.proposals;
    },
    staleTime: 0,
  });
}

/** The plan client of the signed-in account and the owner it is bound to. */
export function usePlanClient(): { client: PlanClient; owner: AccountSnapshot } | null {
  const { accountId: userId, epoch } = useAccountSnapshot();
  return useMemo(() => {
    if (!userId) return null;
    const owner = { accountId: userId, epoch };
    return { client: createMobilePlanClient(owner), owner };
  }, [userId, epoch]);
}

/** The account's plan store, wired to this surface for analytics. */
export function usePlanStore(surface: TaskActionSurface): PlanStore | null {
  const { accountId: userId, epoch } = useAccountSnapshot();
  const queryClient = useQueryClient();
  const { trackCompanionActionResult } = useAnalytics();
  return useMemo(() => {
    if (!userId) return null;
    return planStoreFor(userId, {
      client: createMobilePlanClient({ accountId: userId, epoch }),
      newOperationId,
      onChanged: () => {
        for (const root of [PLANS_ROOT, PLAN_PROPOSAL_ROOT, CONVERSATION_PLANS_ROOT, TASK_PROGRESS_ROOT]) {
          void queryClient.invalidateQueries({ queryKey: [root, userId] });
        }
        // Added or removed tasks are Checklist rows too.
        void queryClient.invalidateQueries({ queryKey: [CHECKLIST_TASKS_QUERY_ROOT] });
      },
      onResult: event => {
        const props = buildPlanResultProperties(event, surface);
        if (props) trackCompanionActionResult(props);
      },
    });
  }, [userId, epoch, queryClient, surface, trackCompanionActionResult]);
}

const IDLE: PlanPhase = { phase: 'idle' };
const noopSubscribe = () => () => {};

export function usePlanPhase(store: PlanStore | null, key: string | null): PlanPhase {
  return useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    () => (store && key ? store.get(key) : IDLE),
    () => IDLE
  );
}
