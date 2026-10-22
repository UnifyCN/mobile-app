import { act, renderHook } from '@testing-library/react-native';
import { usePostHog } from 'posthog-react-native';

import { AnalyticsEvents } from '@/utils/analytics';
import { useLearnEvents } from '@/hooks/learn/useLearnEvents';
import { createLearnEventGate } from '@/utils/learnEventGate';

jest.mock('posthog-react-native', () => ({
  usePostHog: jest.fn(),
}));

const mockUsePostHog = jest.mocked(usePostHog);

function setup() {
  const capture = jest.fn();
  mockUsePostHog.mockReturnValue({ capture } as never);
  const gate = createLearnEventGate();
  const { result } = renderHook(() => useLearnEvents(gate));
  const calls = (event: string) =>
    capture.mock.calls.filter(([name]) => name === event);
  return { capture, events: result, calls };
}

describe('submodule_viewed', () => {
  it('fires once when the submodule screen opens, with ids and title', () => {
    const { events, calls } = setup();

    act(() => {
      events.current.onLearnHubFocused();
      events.current.onSubmoduleFocused('mod-1', 'sub-1', 'Banking basics');
    });

    expect(calls(AnalyticsEvents.SUBMODULE_VIEWED)).toEqual([
      [
        AnalyticsEvents.SUBMODULE_VIEWED,
        {
          module_id: 'mod-1',
          submodule_id: 'sub-1',
          submodule_title: 'Banking basics',
        },
      ],
    ]);
  });

  it('does not fire again on re-focus or on back navigation from a lesson', () => {
    const { events, calls } = setup();

    act(() => {
      events.current.onSubmoduleFocused('mod-1', 'sub-1', 'Banking basics');
      // re-render / tab switch re-focus
      events.current.onSubmoduleFocused('mod-1', 'sub-1', 'Banking basics');
      // user goes into a lesson, then comes back
      events.current.onLessonPageFocused('mod-1', 'sub-1', 'les-1', 1, 'L1');
      events.current.onSubmoduleFocused('mod-1', 'sub-1', 'Banking basics');
    });

    expect(calls(AnalyticsEvents.SUBMODULE_VIEWED)).toHaveLength(1);
  });

  it('fires again when the user leaves to a Learn hub and opens it again', () => {
    const { events, calls } = setup();

    act(() => {
      events.current.onSubmoduleFocused('mod-1', 'sub-1', 'Banking basics');
      events.current.onLearnHubFocused(); // back to the module screen
      events.current.onSubmoduleFocused('mod-1', 'sub-1', 'Banking basics');
      events.current.onSubmoduleFocused('mod-1', 'sub-2', 'Credit');
    });

    expect(calls(AnalyticsEvents.SUBMODULE_VIEWED)).toHaveLength(3);
  });
});

describe('lesson_started', () => {
  it('fires once when the first page of a lesson opens, with ids and title', () => {
    const { events, calls } = setup();

    act(() => {
      events.current.onSubmoduleFocused('mod-1', 'sub-1', 'Banking basics');
      events.current.onLessonPageFocused(
        'mod-1',
        'sub-1',
        'les-1',
        1,
        'Open an account'
      );
    });

    expect(calls(AnalyticsEvents.LESSON_STARTED)).toEqual([
      [
        AnalyticsEvents.LESSON_STARTED,
        {
          module_id: 'mod-1',
          submodule_id: 'sub-1',
          lesson_id: 'les-1',
          lesson_title: 'Open an account',
        },
      ],
    ]);
  });

  it('does not fire again on re-render or Back to page 1 in the same visit', () => {
    const { events, calls } = setup();

    act(() => {
      events.current.onLessonPageFocused('mod-1', 'sub-1', 'les-1', 1, 'L1');
      events.current.onLessonPageFocused('mod-1', 'sub-1', 'les-1', 1, 'L1');
      events.current.onLessonPageFocused('mod-1', 'sub-1', 'les-1', 2, 'L1');
      // Back pushes a new page-1 screen
      events.current.onLessonPageFocused('mod-1', 'sub-1', 'les-1', 1, 'L1');
    });

    expect(calls(AnalyticsEvents.LESSON_STARTED)).toHaveLength(1);
  });

  it('does not fire when the user resumes mid-lesson and then goes back to page 1', () => {
    const { events, calls } = setup();

    act(() => {
      events.current.onLessonPageFocused('mod-1', 'sub-1', 'les-1', 3, 'L1');
      events.current.onLessonPageFocused('mod-1', 'sub-1', 'les-1', 2, 'L1');
      events.current.onLessonPageFocused('mod-1', 'sub-1', 'les-1', 1, 'L1');
    });

    expect(calls(AnalyticsEvents.LESSON_STARTED)).toHaveLength(0);
  });

  it('fires for the next lesson, and again after the user leaves and re-opens a lesson', () => {
    const { events, calls } = setup();

    act(() => {
      events.current.onSubmoduleFocused('mod-1', 'sub-1', 'S1');
      events.current.onLessonPageFocused('mod-1', 'sub-1', 'les-1', 1, 'L1');
      events.current.onLessonPageFocused('mod-1', 'sub-1', 'les-2', 1, 'L2');
      // "Save and leave" returns to the submodule screen
      events.current.onSubmoduleFocused('mod-1', 'sub-1', 'S1');
      events.current.onLessonPageFocused('mod-1', 'sub-1', 'les-2', 1, 'L2');
      // Learn home, then straight into the lesson from a "continue" card
      events.current.onLearnHubFocused();
      events.current.onLessonPageFocused('mod-1', 'sub-1', 'les-2', 1, 'L2');
    });

    expect(
      calls(AnalyticsEvents.LESSON_STARTED).map(([, p]) => p.lesson_id)
    ).toEqual(['les-1', 'les-2', 'les-2', 'les-2']);
  });
});

describe('lesson_completed', () => {
  it('fires once when the user reaches the end of a lesson, with ids', () => {
    const { events, calls } = setup();

    act(() => {
      events.current.onLessonPageFocused('mod-1', 'sub-1', 'les-1', 1, 'L1');
      events.current.onLessonCompleted('mod-1', 'sub-1', 'les-1');
    });

    expect(calls(AnalyticsEvents.LESSON_COMPLETED)).toEqual([
      [
        AnalyticsEvents.LESSON_COMPLETED,
        { module_id: 'mod-1', submodule_id: 'sub-1', lesson_id: 'les-1' },
      ],
    ]);
  });

  it('fires when the user resumed straight onto the last page', () => {
    const { events, calls } = setup();

    act(() => {
      events.current.onLearnHubFocused();
      events.current.onLessonCompleted('mod-1', 'sub-1', 'les-1');
    });

    expect(calls(AnalyticsEvents.LESSON_COMPLETED)).toHaveLength(1);
  });

  it('does not fire twice for a repeated finish or a swipe back from the next lesson', () => {
    const { events, calls } = setup();

    act(() => {
      events.current.onLessonPageFocused('mod-1', 'sub-1', 'les-1', 1, 'L1');
      events.current.onLessonCompleted('mod-1', 'sub-1', 'les-1');
      events.current.onLessonCompleted('mod-1', 'sub-1', 'les-1');
      // next lesson starts; user swipes back to les-1's ending, finishes again
      events.current.onLessonPageFocused('mod-1', 'sub-1', 'les-2', 1, 'L2');
      events.current.onLessonCompleted('mod-1', 'sub-1', 'les-1');
    });

    expect(calls(AnalyticsEvents.LESSON_COMPLETED)).toHaveLength(1);
  });

  it('fires again when the user re-opens and finishes the lesson in a new visit', () => {
    const { events, calls } = setup();

    act(() => {
      events.current.onSubmoduleFocused('mod-1', 'sub-1', 'S1');
      events.current.onLessonPageFocused('mod-1', 'sub-1', 'les-1', 1, 'L1');
      events.current.onLessonCompleted('mod-1', 'sub-1', 'les-1');
      events.current.onSubmoduleFocused('mod-1', 'sub-1', 'S1');
      events.current.onLessonPageFocused('mod-1', 'sub-1', 'les-1', 1, 'L1');
      events.current.onLessonCompleted('mod-1', 'sub-1', 'les-1');
    });

    expect(calls(AnalyticsEvents.LESSON_COMPLETED)).toHaveLength(2);
  });
});

describe('activity_completed', () => {
  it('fires once per finished activity, with ids and activity_id', () => {
    const { events, calls } = setup();

    act(() => {
      events.current.onLessonPageFocused('mod-1', 'sub-1', 'les-1', 1, 'L1');
      events.current.onActivitySubmitted('mod-1', 'sub-1', 'les-1', 'act-a');
      events.current.onActivitySubmitted('mod-1', 'sub-1', 'les-1', 'act-b');
    });

    expect(calls(AnalyticsEvents.ACTIVITY_COMPLETED)).toEqual([
      [
        AnalyticsEvents.ACTIVITY_COMPLETED,
        {
          module_id: 'mod-1',
          submodule_id: 'sub-1',
          lesson_id: 'les-1',
          activity_id: 'act-a',
        },
      ],
      [
        AnalyticsEvents.ACTIVITY_COMPLETED,
        {
          module_id: 'mod-1',
          submodule_id: 'sub-1',
          lesson_id: 'les-1',
          activity_id: 'act-b',
        },
      ],
    ]);
  });

  it('does not fire again when the user goes Back and submits the same activity', () => {
    const { events, calls } = setup();

    act(() => {
      events.current.onActivitySubmitted('mod-1', 'sub-1', 'les-1', 'act-a');
      events.current.onActivitySubmitted('mod-1', 'sub-1', 'les-1', 'act-a');
    });

    expect(calls(AnalyticsEvents.ACTIVITY_COMPLETED)).toHaveLength(1);
  });

  it('fires again in a new visit to the lesson', () => {
    const { events, calls } = setup();

    act(() => {
      events.current.onLessonPageFocused('mod-1', 'sub-1', 'les-1', 1, 'L1');
      events.current.onActivitySubmitted('mod-1', 'sub-1', 'les-1', 'act-a');
      events.current.onSubmoduleFocused('mod-1', 'sub-1', 'S1');
      events.current.onLessonPageFocused('mod-1', 'sub-1', 'les-1', 1, 'L1');
      events.current.onActivitySubmitted('mod-1', 'sub-1', 'les-1', 'act-a');
    });

    expect(calls(AnalyticsEvents.ACTIVITY_COMPLETED)).toHaveLength(2);
  });
});
