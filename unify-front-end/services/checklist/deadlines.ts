import { supabase } from '@/lib/supabase';
import type { Deadline, DeadlineInput } from '@/types/deadlines';

const TABLE = 'user_deadlines';
const COLUMNS =
  'id, user_id, kind, title, due_date, linked_task_key, completed, completed_at, created_at, updated_at';

export async function getDeadlines(userId: string): Promise<Deadline[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('due_date', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Deadline[];
}

export async function createDeadline(
  userId: string,
  input: DeadlineInput
): Promise<Deadline> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      kind: input.kind,
      title: input.title.trim(),
      due_date: input.due_date,
      linked_task_key: input.linked_task_key ?? null,
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data as Deadline;
}

export async function updateDeadline(
  userId: string,
  id: number,
  patch: Partial<Pick<Deadline, 'kind' | 'title' | 'due_date'>>
): Promise<Deadline> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({
      ...patch,
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
    })
    .eq('user_id', userId)
    .eq('id', id)
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data as Deadline;
}

export async function setDeadlineCompletion(
  userId: string,
  id: number,
  completed: boolean
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({
      completed,
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq('user_id', userId)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteDeadline(userId: string, id: number): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('id', id);
  if (error) throw error;
}
