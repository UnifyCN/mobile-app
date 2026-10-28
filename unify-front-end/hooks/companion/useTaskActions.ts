import {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import { AppState } from 'react-native';
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { CHECKLIST_TASKS_QUERY_ROOT } from '@/hooks/checklist/checklistQueryKeys';
import {
  useAccountSnapshot,
  useSessionAccountId,
} from '@/hooks/auth/useSessionAccountId';
import {
  ownAccountWork,
  type AccountSnapshot,
} from '@/services/account/accountSession';
import { clearOtherAccountsChecklistCache } from '@/utils/checklistTaskCache';
import {
  CONVERSATIONS_ROOT,
  CONVERSATION_MESSAGES_ROOT,
} from '@/hooks/companion/conversationKeys';
import { useAnalytics } from '@/utils/analytics';
import {
  buildTaskActionResultProperties,
  type TaskActionSurface,
} from '@/services/companionActions/analytics';
import type {
  ReadResult,
  TaskActionClient,
} from '@/services/companionActions/client';
import type {
  StepProposal,
  TaskProgress,
  TaskProposal,
  TaskStep,
} from '@/services/companionActions/contract';
import {
  clearTaskActionStores,
  taskActionStoreFor,
  type TaskActionPhase,
  type TaskActionStore,
} from '@/services/companionActions/taskActionStore';
import { newOperationId } from '@/services/companionActions/operationId';
import { createMobileTaskActionClient } from '@/services/companionActions/transport';
import {
  PLANS_ROOT,
  PLAN_PROPOSAL_ROOT,
  CONVERSATION_PLANS_ROOT,
} from './planQueryKeys';

/** Root of every task-progress query. Each key carries the account id. */
export const TASK_PROGRESS_ROOT = 'companion-task-actions' as const;
export const taskProgressKey = (userId: string | null) =>
  [TASK_PROGRESS_ROOT, userId] as const;

/** A task draft (#363), per account. */
export const TASK_PROPOSAL_ROOT = 'companion-task-proposal' as const;
export const taskProposalKey = (
  userId: string | null,
  proposalId: string | null
) => [TASK_PROPOSAL_ROOT, userId, proposalId] as const;

/** The drafts and command results of one conversation (#363), per account. */
export const CONVERSATION_ACTIONS_ROOT =
  'companion-conversation-actions' as const;
export const conversationActionsKey = (
  userId: string | null | undefined,
  conversationId: string | null
) => [CONVERSATION_ACTIONS_ROOT, userId ?? null, conversationId] as const;

/**
 * The signed-in account. Undefined until the session is read. Task progress is
 * held in memory only, per account.
 */
export const useTaskActionAccount = useSessionAccountId;

export type TaskProgressStatus =
  | 'loading'
  | 'ready'
  | 'unavailable'
  | 'offline'
  | 'signed_out';

export interface TaskProgressView {
  status: TaskProgressStatus;
  /** Saved progress by task_ref. A content-backed task never written has no entry. */
  byRef: ReadonlyMap<string, TaskProgress>;
  /** #366: live steps by task_ref, in order. */
  stepsByRef: ReadonlyMap<string, readonly TaskStep[]>;
  /** True when the shown progress may be out of date (the last read failed). */
  stale: boolean;
  /** Writes are allowed only right after a successful read. */
  canWrite: boolean;
  /** When the last successful read finished (ms since epoch), 0 before any. */
  readAt: number;
  refetch: () => void;
}

class ReadFailed extends Error {}

/**
 * Saved task progress of the signed-in account, read from the shared action
 * service. There is no OS network-state signal in this app, so a failed read is
 * the offline signal: progress is marked stale, writes are turned off, and the
 * read is retried every 5 s and when the app returns to the foreground.
 */
export function useTaskProgress(): TaskProgressView {
  const userId = useTaskActionAccount();
  const queryClient = useQueryClient();
  useTaskActionAccountScope(userId, queryClient);

  const query = useQuery({
    queryKey: taskProgressKey(userId ?? null),
    enabled: Boolean(userId),
    queryFn: async (): Promise<Exclude<ReadResult, { kind: 'unknown' }>> => {
      // The read is made only as the account its entry belongs to.
      const owner = ownAccountWork();
      if (owner.accountId !== userId) throw new ReadFailed('account changed');
      const result = await createMobileTaskActionClient(owner).read();
      if (result.kind === 'unknown') throw new ReadFailed('unreachable');
      return result;
    },
    staleTime: 0,
    retry: false,
    refetchInterval: q => (q.state.status === 'error' ? 5_000 : false),
  });

  const refetch = query.refetch;
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active' && userId) void refetch();
    });
    return () => sub.remove();
  }, [refetch, userId]);

  const result = query.data;
  const byRef = useMemo(() => {
    const map = new Map<string, TaskProgress>();
    if (result?.kind === 'ok')
      for (const t of result.tasks) map.set(t.taskRef, t);
    return map;
  }, [result]);
  const stepsByRef = useMemo(() => {
    const map = new Map<string, TaskStep[]>();
    if (result?.kind === 'ok')
      for (const step of result.steps) {
        const list = map.get(step.taskRef) ?? [];
        list.push(step);
        map.set(step.taskRef, list);
      }
    return map;
  }, [result]);

  let status: TaskProgressStatus;
  if (userId === null || result?.kind === 'unauthorized') status = 'signed_out';
  else if (result?.kind === 'unavailable' || result?.kind === 'refused')
    status = 'unavailable';
  else if (query.isError) status = result?.kind === 'ok' ? 'ready' : 'offline';
  else if (result?.kind === 'ok') status = 'ready';
  else status = 'loading';

  const stale = query.isError;
  return {
    status,
    byRef,
    stepsByRef,
    stale,
    // A refetch after a save may still carry the old revision: wait for it.
    canWrite: status === 'ready' && !stale && !query.isFetching,
    readAt: query.dataUpdatedAt,
    refetch: useCallback(() => void refetch(), [refetch]),
  };
}

/**
 * Removes every other account's private work: unresolved task actions, task
 * progress, Checklist rows (memory, disk and query cache), conversation
 * lists and threads, and task drafts and command results (#363). All of these are keyed by account, so a mounted view
 * already reads only the signed-in account's entry; this drops the rest and
 * cancels reads still in flight for another account.
 */
function useTaskActionAccountScope(
  userId: string | null | undefined,
  queryClient: QueryClient
) {
  useEffect(() => {
    if (userId === undefined) return;
    clearTaskActionStores(userId);
    const otherAccount = (index: number) => (q: { queryKey: readonly unknown[] }) =>
      q.queryKey[index] !== userId;
    for (const [root, index] of [
      [TASK_PROGRESS_ROOT, 1],
      [CHECKLIST_TASKS_QUERY_ROOT, 1],
      [CONVERSATIONS_ROOT, 1],
      [CONVERSATION_MESSAGES_ROOT, 1],
      [TASK_PROPOSAL_ROOT, 1],
      [CONVERSATION_ACTIONS_ROOT, 1],
      [STEP_PROPOSAL_ROOT, 1],
    ] as const) {
      void queryClient.cancelQueries({
        queryKey: [root],
        predicate: otherAccount(index),
      });
      queryClient.removeQueries({
        queryKey: [root],
        predicate: otherAccount(index),
      });
    }
    void clearOtherAccountsChecklistCache(userId);
  }, [userId, queryClient]);
}

/** The account's action store, wired to this screen's surface for analytics. */
export function useTaskActionStore(
  surface: TaskActionSurface
): TaskActionStore | null {
  const { accountId: userId, epoch } = useAccountSnapshot();
  const queryClient = useQueryClient();
  const { trackCompanionActionResult } = useAnalytics();
  return useMemo(() => {
    if (!userId) return null;
    return taskActionStoreFor(userId, {
      // Its requests are made only while this account is signed in.
      client: createMobileTaskActionClient({ accountId: userId, epoch }),
      newOperationId,
      onChanged: () => {
        void queryClient.invalidateQueries({
          queryKey: taskProgressKey(userId),
        });
        // Completed is also the legacy Checklist flag: refresh the Checklist too.
        void queryClient.invalidateQueries({
          queryKey: [CHECKLIST_TASKS_QUERY_ROOT],
        });
        // #363: drafts and command results shown in conversations.
        void queryClient.invalidateQueries({
          queryKey: [TASK_PROPOSAL_ROOT, userId],
        });
        void queryClient.invalidateQueries({
          queryKey: [CONVERSATION_ACTIONS_ROOT, userId],
        });
        // #366: suggested-step drafts.
        void queryClient.invalidateQueries({
          queryKey: [STEP_PROPOSAL_ROOT, userId],
        });
        // Plans join current shared progress and must refresh after a task save.
        for (const root of [PLANS_ROOT, PLAN_PROPOSAL_ROOT, CONVERSATION_PLANS_ROOT]) {
          void queryClient.invalidateQueries({ queryKey: [root, userId] });
        }
      },
      onResult: event => {
        const props = buildTaskActionResultProperties(event, surface);
        if (props) trackCompanionActionResult(props);
      },
    });
  }, [userId, epoch, queryClient, surface, trackCompanionActionResult]);
}

/**
 * The action client of the signed-in account (#363 proposal requests) and the owner
 * it is bound to: its requests are made only as that account and session, and a
 * caller checks the same owner before it uses a result.
 */
export function useTaskActionClient(): {
  client: TaskActionClient;
  owner: AccountSnapshot;
} | null {
  const { accountId: userId, epoch } = useAccountSnapshot();
  return useMemo(() => {
    if (!userId) return null;
    const owner = { accountId: userId, epoch };
    return { client: createMobileTaskActionClient(owner), owner };
  }, [userId, epoch]);
}

/** One task draft, read from the action service as the signed-in account. */
export function useTaskProposal(proposalId: string | null) {
  const userId = useTaskActionAccount() ?? null;
  return useQuery({
    queryKey: taskProposalKey(userId, proposalId),
    enabled: Boolean(userId && proposalId),
    queryFn: async (): Promise<TaskProposal> => {
      const owner = ownAccountWork();
      if (owner.accountId !== userId) throw new ReadFailed('account changed');
      const result = await createMobileTaskActionClient(owner).proposal(
        proposalId as string
      );
      if (result.kind === 'ok' || result.kind === 'changed')
        return result.proposal;
      throw new ReadFailed(result.kind);
    },
    staleTime: 0,
    retry: 1,
  });
}

/** #366: one suggested-steps draft, read from the action service as the signed-in account. */
export const STEP_PROPOSAL_ROOT = 'companion-step-proposal' as const;
export const stepProposalKey = (userId: string | null, proposalId: string | null) =>
  [STEP_PROPOSAL_ROOT, userId, proposalId] as const;

export function useStepProposal(proposalId: string | null) {
  const userId = useTaskActionAccount() ?? null;
  return useQuery({
    queryKey: stepProposalKey(userId, proposalId),
    enabled: Boolean(userId && proposalId),
    queryFn: async (): Promise<StepProposal> => {
      const owner = ownAccountWork();
      if (owner.accountId !== userId) throw new ReadFailed('account changed');
      const result = await createMobileTaskActionClient(owner).stepProposal(proposalId as string);
      if (result.kind === 'ok' || result.kind === 'changed') return result.proposal;
      throw new ReadFailed(result.kind);
    },
    staleTime: 0,
    retry: 1,
  });
}

/** The live steps of one task, in order (#366). */
export function stepsFor(taskRef: string, view: TaskProgressView): readonly TaskStep[] {
  return view.stepsByRef.get(taskRef) ?? [];
}

/** The drafts and command results of one conversation, for its cards. */
export function useConversationActions(conversationId: string | null) {
  const userId = useTaskActionAccount() ?? null;
  return useQuery({
    queryKey: conversationActionsKey(userId, conversationId),
    enabled: Boolean(userId && conversationId),
    queryFn: async () => {
      const owner = ownAccountWork();
      if (owner.accountId !== userId) throw new ReadFailed('account changed');
      const result = await createMobileTaskActionClient(
        owner
      ).conversationActions(conversationId as string);
      if (result.kind !== 'ok') throw new ReadFailed(result.kind);
      return result;
    },
    staleTime: 0,
  });
}

const IDLE: TaskActionPhase = { phase: 'idle' };
const noopSubscribe = () => () => {};

export function useTaskActionPhase(
  store: TaskActionStore | null,
  taskRef: string | null
): TaskActionPhase {
  return useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    () => (store && taskRef ? store.get(taskRef) : IDLE),
    () => IDLE
  );
}

export function useTaskActionDraft(
  store: TaskActionStore | null,
  taskRef: string
): string | undefined {
  return useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    () => store?.draft(taskRef),
    () => undefined
  );
}

/** Saved progress, or for a content-backed task never written: Not started at revision 0. */
export function progressFor(
  taskRef: string,
  view: TaskProgressView
): TaskProgress {
  return (
    view.byRef.get(taskRef) ?? {
      taskRef,
      state: 'not_started',
      waitingReason: null,
      revision: 0,
      // A custom task always has a saved row; missing means it was deleted elsewhere.
      removed: taskRef.startsWith('custom:') && view.status === 'ready',
      lastReceipt: null,
    }
  );
}
