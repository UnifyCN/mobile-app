import { supabase } from '@/lib/supabase';
import { Event } from '@/types/events';
import { getEventsWindowEnd } from '@/helpers/eventHelpers';
import {
  EVENT_COLUMNS,
  EventRow,
  mapEventRow,
} from '@/services/events/eventContract';

export const getAllEvents = async (options?: {
  upcomingLimit: number;
  from?: Date;
}): Promise<Event[]> => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    let query = supabase.from('events').select(EVENT_COLUMNS);
    if (options) {
      const from = options.from ?? new Date();
      query = query
        .gt('event_datetime', from.toISOString())
        .lt('event_datetime', getEventsWindowEnd(from).toISOString())
        .order('event_datetime', { ascending: true })
        .order('id', { ascending: true })
        .limit(options.upcomingLimit);
    } else {
      query = query.order('event_datetime', { ascending: false });
    }
    const { data, error } = await query;

    if (error) {
      throw new Error('Failed to fetch events');
    }

    return ((data ?? []) as unknown as EventRow[]).map(mapEventRow);
  } catch (error) {
    console.error('Error fetching events:', error);
    throw error;
  }
};
