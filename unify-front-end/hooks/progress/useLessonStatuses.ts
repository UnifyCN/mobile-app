import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { progressClient } from '@/services/progress/progressClient';
import type { ResumeProgress } from '@/utils/lessonResume';

export function useLessonStatuses(submoduleId: string) {
  const [rows, setRows] = useState<ResumeProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      setError(false);
      setRows([]);
      async function load() {
        try {
          const {
            data: { user },
            error: authError,
          } = await progressClient.auth.getUser();
          if (authError) throw authError;
          if (!user) return;
          const result = await progressClient
            .from('user_lesson_progress')
            .select(
              'sanity_lesson_id,is_completed,is_in_progress,completed_pages,current_page_type,current_page_number,current_quiz_id,current_question_number'
            )
            .eq('user_id', user.id)
            .eq('sanity_submodule_id', submoduleId);
          if (result.error) throw result.error;
          if (!cancelled) setRows(result.data ?? []);
        } catch {
          if (!cancelled) setError(true);
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
      void load();
      return () => {
        cancelled = true;
      };
      // Retry replaces this focus callback and repeats the read.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [submoduleId, reload])
  );
  return { rows, loading, error, refresh: () => setReload(value => value + 1) };
}
