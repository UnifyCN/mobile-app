import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as fs from 'fs';
import * as path from 'path';

import { TaskDetailModal } from '../../components/checklist/TaskDetailModal';
import {
  sanityChecklistItemToTaskDetails,
  type SanityChecklistItem,
  type UserTaskWithDetails,
} from '../../types/checklist';

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const identity = (value: unknown) => value;
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (value: unknown) => ({ value }),
    useAnimatedStyle: () => ({}),
    withTiming: identity,
    Easing: { out: identity, in: identity, cubic: identity },
    runOnJS: identity,
    interpolate: identity,
    Extrapolate: { CLAMP: 'clamp' },
  };
});
jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  const gesture = { onUpdate: () => gesture, onEnd: () => gesture };
  return {
    Gesture: { Pan: () => gesture },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    GestureHandlerRootView: View,
  };
});
// The sheet avoids the keyboard for the task progress form (mobile-app#361).
jest.mock('react-native-keyboard-controller', () => ({
  KeyboardAvoidingView: require('react-native').View,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons/MaterialIcons', () => () => null);
jest.mock('../../helpers/dateHelpers', () => ({
  formatRelativeTime: () => 'just now',
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const CFIA_URL =
  'https://inspection.canada.ca/en/importing-food-plants-animals/pets';

const payload = JSON.parse(
  fs.readFileSync(
    path.resolve(
      __dirname,
      '../../content/sanity/before-you-land/payload.json'
    ),
    'utf8'
  )
);
const petRecord = payload.create.find((r: { title: string }) =>
  /dog or cat/.test(r.title)
);

function taskFor(item: {
  title: string;
  description: string;
  class: string;
  link_tab?: string;
}): UserTaskWithDetails {
  const sanityItem = {
    _id: 'test-id',
    title: item.title,
    description: item.description,
    class: item.class,
    link_tab: item.link_tab,
  } as SanityChecklistItem;
  return {
    user_task_id: 1,
    user_id: 'u1',
    task_id: null,
    sanity_checklist_id: 'test-id',
    completed: false,
    completed_at: null,
    dismissed_at: null,
    task: sanityChecklistItemToTaskDetails(sanityItem),
  };
}

function renderModal(task: UserTaskWithDetails, onLearnHow = jest.fn()) {
  render(
    <TaskDetailModal
      visible
      task={task}
      onClose={jest.fn()}
      onLearnHow={onLearnHow}
      onMarkComplete={jest.fn()}
    />
  );
  return { onLearnHow };
}

describe('TaskDetailModal description links', () => {
  let openURL: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  });
  afterEach(() => jest.restoreAllMocks());

  it('opens the exact CFIA https URL when the pet task link is pressed', () => {
    const { onLearnHow } = renderModal(taskFor(petRecord));
    fireEvent.press(screen.getByText(CFIA_URL));
    expect(openURL).toHaveBeenCalledTimes(1);
    expect(openURL).toHaveBeenCalledWith(CFIA_URL);
    expect(onLearnHow).not.toHaveBeenCalled();
  });

  it('keeps the rest of the pet description as plain text', () => {
    renderModal(taskFor(petRecord));
    const link = screen.getByRole('link');
    expect(link).toHaveTextContent(CFIA_URL);
    const description: string = petRecord.description;
    expect(
      screen.getByText(description.slice(0, description.indexOf(CFIA_URL)), {
        exact: false,
      })
    ).toBeTruthy();
  });

  it('leaves an ordinary description unchanged and adds no link', () => {
    const description = 'Why: Bring your passport. See page 3.';
    renderModal(
      taskFor({ title: 'Plain task', description, class: 'do_now' })
    );
    expect(screen.getByText(description)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    expect(openURL).not.toHaveBeenCalled();
  });

  it('does not open anything for a non-web scheme in the description', () => {
    const description = 'Why: Tap javascript:alert(1) or mailto:a@b.ca now.';
    renderModal(
      taskFor({ title: 'Scheme task', description, class: 'do_now' })
    );
    expect(screen.getByText(description)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
