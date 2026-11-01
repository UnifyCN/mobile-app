import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import en from '@/i18n/locales/en/translation.json';
import { TaskActionCards } from '@/components/companion/tasks/TaskActionCards';
import type { RemovalProposal } from '@/services/companionActions/contract';

jest.mock('@expo/vector-icons/MaterialIcons', () => () => null);
jest.mock('@/hooks/companion/useTaskActions', () => ({
  useTaskActionPhase: () => ({ phase: 'idle' }),
  useTaskProgress: () => ({ status: 'ready', byRef: new Map() }),
}));

const proposal: RemovalProposal = {
  proposalId: 'removal-review', proposalRevision: 1, status: 'draft',
  operation: { type: 'task.remove', task_ref: 'custom:1', expected_revision: 3 },
  effects: { taskRef: 'custom:1', title: 'Get a phone plan', state: 'not_started',
    revision: 3, removed: false, plans: [], stepsTotal: 2, remindersPending: 0 },
  previousEffects: null, reviewReason: null,
  source: { conversationId: 'conversation-1', messageId: 77 }, receipt: null,
};

it('opens the current task receipt from a removed-task card after reload without requesting another removal', () => {
  const view = jest.fn();
  const review = jest.fn();
  const i18n = createInstance();
  void i18n.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: en } },
    interpolation: { escapeValue: false }, initImmediate: false });
  render(<I18nextProvider i18n={i18n}>
    <TaskActionCards messageId={77} isUser proposals={[]} commands={[]} store={null}
      canWrite={false} onReview={jest.fn()} onViewTask={view}
      removalProposals={[proposal]} onReviewRemoval={review} isRemovedNow={() => true} />
  </I18nextProvider>);
  expect(screen.queryByRole('button', { name: 'Review removal of Get a phone plan' })).toBeNull();
  expect(view).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'View task' }));
  expect(view).toHaveBeenCalledWith('custom:1', 'Get a phone plan');
  expect(review).not.toHaveBeenCalled();
});
