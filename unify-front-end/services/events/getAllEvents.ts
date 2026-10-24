import { supabase } from '@/lib/supabase';
import { Event } from '@/types/events';
import {
  EVENT_COLUMNS,
  EventRow,
  mapEventRow,
} from '@/services/events/eventContract';

export const getAllEvents = async (): Promise<Event[]> => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    const { data, error } = await supabase
      .from('events')
      .select(EVENT_COLUMNS)
      .order('event_datetime', { ascending: false });

    if (error) {
      throw new Error('Failed to fetch events');
    }

    return ((data ?? []) as unknown as EventRow[]).map(mapEventRow);
  } catch (error) {
    console.error('Error fetching events:', error);
    throw error;
  }
};
