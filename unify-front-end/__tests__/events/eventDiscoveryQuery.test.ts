import { getAllEvents } from '@/services/events/getAllEvents';
import { supabase } from '@/lib/supabase';
import {
  getUpcomingEventsSorted,
  getEventsWindowEnd,
} from '@/helpers/eventHelpers';
import { mapEventRow, type EventRow } from '@/services/events/eventContract';
import { AuthSessionMissingError } from '@supabase/supabase-js';

jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: jest.fn() }, from: jest.fn() },
}));
const auth = jest.mocked(supabase.auth.getUser);
const from = jest.mocked(supabase.from);
const now = new Date('2026-10-24T12:00:00Z');
const row = (id: number, date: string): EventRow => ({
  id,
  title: `Event ${id}`,
  description: null,
  event_datetime: date,
  event_end_datetime: null,
  location: 'Library',
  address: null,
  hosted_by: null,
  event_type: 'in-person',
  genre: 'Language',
  cover_photo_url: null,
  external_link: null,
  max_attendees: null,
  source: null,
  created_at: date,
  updated_at: date,
});
const fixture = [
  row(1, '2026-10-20T12:00:00Z'),
  row(2, now.toISOString()),
  row(4, '2026-10-25T12:00:00Z'),
  row(3, '2026-10-25T12:00:00Z'),
  row(5, '2026-10-26T12:00:00Z'),
  row(6, '2026-10-27T12:00:00Z'),
  row(7, getEventsWindowEnd(now).toISOString()),
  row(8, '2027-03-01T12:00:00Z'),
];

interface QueryBuilder {
  select: jest.Mock<QueryBuilder, []>;
  gt: jest.Mock<QueryBuilder, [string, string]>;
  lt: jest.Mock<QueryBuilder, [string, string]>;
  order: jest.Mock<
    QueryBuilder,
    ['event_datetime' | 'id', { ascending: boolean }]
  >;
  limit: jest.Mock<QueryBuilder, [number]>;
  then: (
    resolve: (value: { data: EventRow[]; error: null }) => unknown
  ) => Promise<unknown>;
}

function query() {
  let rows = [...fixture];
  const orders: { column: 'event_datetime' | 'id'; ascending: boolean }[] = [];
  let limit = Infinity;
  const builder: QueryBuilder = {
    select: jest.fn(() => builder),
    gt: jest.fn((_key: string, value: string) => {
      rows = rows.filter(r => r.event_datetime > value);
      return builder;
    }),
    lt: jest.fn((_key: string, value: string) => {
      rows = rows.filter(r => r.event_datetime < value);
      return builder;
    }),
    order: jest.fn(
      (column: 'event_datetime' | 'id', options: { ascending: boolean }) => {
        orders.push({ column, ...options });
        return builder;
      }
    ),
    limit: jest.fn((n: number) => {
      limit = n;
      return builder;
    }),
    then: (resolve: (value: { data: EventRow[]; error: null }) => unknown) =>
      Promise.resolve({
        data: rows
          .sort((a, b) => {
            for (const order of orders) {
              const delta =
                order.column === 'id'
                  ? a.id - b.id
                  : a.event_datetime.localeCompare(b.event_datetime);
              if (delta) return order.ascending ? delta : -delta;
            }
            return 0;
          })
          .slice(0, limit),
        error: null,
      }).then(resolve),
  };
  from.mockReturnValue(builder as unknown as ReturnType<typeof supabase.from>);
  return builder;
}

beforeEach(() => {
  jest.resetAllMocks();
  auth.mockResolvedValue({
    data: {
      user: {
        id: 'qa',
        aud: 'authenticated',
        app_metadata: {},
        user_metadata: {},
        created_at: '2026-10-24T00:00:00Z',
      },
    },
    error: null,
  });
});

test('fetches only the visible upcoming cards with the same date boundaries and tie order', async () => {
  const builder = query();
  const events = await getAllEvents({ upcomingLimit: 3, from: now });
  expect(events.map(e => e.id)).toEqual(
    getUpcomingEventsSorted(fixture.map(mapEventRow), now)
      .slice(0, 3)
      .map(e => e.id)
  );
  expect(events.map(e => e.id)).toEqual([3, 4, 5]);
  expect(builder.gt).toHaveBeenCalledWith('event_datetime', now.toISOString());
  expect(builder.lt).toHaveBeenCalledWith(
    'event_datetime',
    getEventsWindowEnd(now).toISOString()
  );
  expect(builder.limit).toHaveBeenCalledWith(3);
});

test('keeps the full list query for All, Past, and event detail callers', async () => {
  const builder = query();
  const events = await getAllEvents();
  expect(events).toHaveLength(fixture.length);
  expect(builder.gt).not.toHaveBeenCalled();
  expect(builder.lt).not.toHaveBeenCalled();
  expect(builder.limit).not.toHaveBeenCalled();
  expect(builder.order).toHaveBeenCalledWith('event_datetime', {
    ascending: false,
  });
});

test('does not query events when the user is not authenticated', async () => {
  auth.mockResolvedValue({
    data: { user: null },
    error: new AuthSessionMissingError(),
  });
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  await expect(getAllEvents({ upcomingLimit: 3, from: now })).rejects.toThrow(
    'User not authenticated'
  );
  expect(from).not.toHaveBeenCalled();
  log.mockRestore();
});
