import React, { useEffect } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { normalizeLearnOrigin } from '@/utils/learnOriginNavigation';

export default function QuizIndex() {
  const {
    moduleId,
    submoduleId,
    lessonId,
    quizId,
    origin: originParam,
  } = useLocalSearchParams<{
    moduleId: string;
    submoduleId: string;
    lessonId: string;
    quizId: string;
    origin?: string | string[];
  }>();
  const origin = normalizeLearnOrigin(originParam);

  useEffect(() => {
    // Redirect to first question
    router.replace({
      pathname:
        '/(tabs)/Learn/modules/[moduleId]/[submoduleId]/lessons/[lessonId]/quizzes/[quizId]/pages/[questionNum]' as any,
      params: {
        moduleId,
        submoduleId,
        lessonId,
        quizId,
        questionNum: '1',
        ...(origin ? { origin } : {}),
      },
    });
  }, [moduleId, submoduleId, lessonId, quizId, origin]);

  return null;
}
