import { supabase } from '@/lib/supabase';
import { DailyTip } from '@/types/dailyTip';
import { localDateHeaders } from '@/helpers/localDateHeader';

/** The tip's stage and arrival wording use this device's calendar day. */
export const getDailyTip = async (
  now: Date = new Date()
): Promise<DailyTip | null> => {
  const { data, error } = await supabase.functions.invoke('get-daily-tip', {
    headers: localDateHeaders(now),
  });

  if (error) {
    throw new Error(`Failed to fetch daily tip: ${error.message}`);
  }

  const tip = data?.tip;
  if (!tip) {
    throw new Error('Unexpected response from get-daily-tip: missing tip');
  }

  return {
    id: tip.id,
    persona: tip.persona,
    stage: tip.stage,
    date: tip.date,
    category: tip.category,
    title: tip.title,
    description: tip.description,
    tipText: tip.tip_text,
    sourceRefs: tip.source_refs,
  };
};
