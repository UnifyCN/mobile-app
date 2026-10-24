import React, { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { canSubmitLessonActivity, requiredResponseKeys } from '@/utils/lessonActivity';
import RichTextRenderer from '@/components/sanity/RichTextRenderer';
import type { SanityActivityPage } from '@/types/sanity';
import {
  ACTIVITY_QUESTION_PREFIX,
  getActivityInputsByPage,
  saveActivityInput,
} from '@/services/progress/progressService';

type Props = {
  activity: Omit<SanityActivityPage, 'order'>;
  lessonId: string;
  submoduleId: string;
  moduleId: string;
  onReady: (ready: boolean) => void;
};

export default function LessonBlockActivity({
  activity, lessonId, submoduleId, moduleId, onReady,
}: Props) {
  const { t } = useTranslation();
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const edits = useRef(0);
  const writes = useRef<Record<string, Promise<boolean>>>({});

  const persist = (fieldKey: string, value: string, isSubmitted = false) => {
    // Serialize writes per answer so a slow draft cannot overwrite a later submit.
    // Writes run in order, so a draft clears the field's submitted state: an
    // answer changed after Submit must be submitted again.
    const previous = writes.current[fieldKey] ?? Promise.resolve(true);
    const next = previous.then(() => saveActivityInput(
      lessonId, submoduleId, moduleId, activity._key, fieldKey, value, isSubmitted, !isSubmitted
    ));
    writes.current[fieldKey] = next;
    return next;
  };

  useEffect(() => {
    let cancelled = false;
    onReady(false);
    getActivityInputsByPage(lessonId).then(byPage => {
      if (cancelled) return;
      const saved = byPage[activity._key];
      if (saved) {
        setInputs(current => ({ ...saved.inputValues, ...current }));
        setAnswers(current => ({ ...saved.questionAnswers, ...current }));
        // A returning learner keeps a completed submission; Next stays open.
        // Every required response must be submitted: a partly failed submit
        // can leave some rows submitted and others not.
        const required = requiredResponseKeys(activity.instructions, ACTIVITY_QUESTION_PREFIX);
        if (
          required.every(key => saved.submittedFields[key]) &&
          saved.isSubmitted &&
          canSubmitLessonActivity(activity.instructions, saved.inputValues, saved.questionAnswers)
        ) {
          setSubmitted(true);
          onReady(true);
        }
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [lessonId, activity._key, activity.instructions, onReady]);

  const invalidateSubmission = () => {
    edits.current += 1;
    setSubmitted(false);
    onReady(false);
  };

  const handleInput = (key: string, value: string) => {
    setInputs(current => ({ ...current, [key]: value }));
    invalidateSubmission();
    if (timers.current[key]) clearTimeout(timers.current[key]);
    // Do not cancel on unmount: this final write must survive Next/Back/exit.
    timers.current[key] = setTimeout(() => {
      void persist(key, value);
      delete timers.current[key];
    }, 600);
  };

  const handleAnswer = (key: string, value: string | string[]) => {
    setAnswers(current => ({ ...current, [key]: value }));
    invalidateSubmission();
    void persist(ACTIVITY_QUESTION_PREFIX + key, JSON.stringify(value));
  };

  const canSubmit = canSubmitLessonActivity(activity.instructions, inputs, answers);

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    const editsAtSubmit = edits.current;
    Object.values(timers.current).forEach(clearTimeout);
    timers.current = {};
    try {
      const results = await Promise.all([
        ...Object.entries(inputs).map(([key, value]) => persist(key, value, true)),
        ...Object.entries(answers).map(([key, value]) =>
          persist(ACTIVITY_QUESTION_PREFIX + key, JSON.stringify(value), true)
        ),
      ]);
      if (results.some(result => !result)) {
        Alert.alert(t('common.somethingWentWrong'), t('common.tryAgain'));
        return;
      }
      // An edit during the save was not validated; the learner submits again.
      if (edits.current !== editsAtSubmit) return;
      setSubmitted(true);
      onReady(true);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Text>{t('learn.lesson.loadingActivity')}</Text>;

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{activity.title}</Text>
      <RichTextRenderer
        blocks={activity.instructions}
        markDefs={activity.instructionsMarkDefs}
        inputValues={inputs}
        onInputChange={handleInput}
        questionAnswers={answers}
        onQuestionAnswer={handleAnswer}
        showQuestionFeedback={submitted}
      />
      {activity.answer_box && (!activity.answer_box.showAfterSubmit || submitted) && (
        <>
          {!!activity.answer_box.title && <Text style={styles.feedbackTitle}>{activity.answer_box.title}</Text>}
          <RichTextRenderer blocks={activity.answer_box.content} markDefs={activity.answer_box.markDefs} />
        </>
      )}
      <TouchableOpacity
        accessibilityRole="button"
        disabled={saving || submitted || !canSubmit}
        onPress={handleSubmit}
        style={[styles.submit, (saving || submitted || !canSubmit) && styles.disabled]}
      >
        <Text style={styles.submitText}>{t('common.submit')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 23, paddingBottom: 120 },
  title: { fontSize: 32, fontWeight: '700', color: '#000', marginVertical: 20, textAlign: 'center' },
  feedbackTitle: { fontSize: 18, fontWeight: '600', marginVertical: 12 },
  submit: { backgroundColor: '#575757', padding: 14, borderRadius: 12, alignItems: 'center', marginVertical: 16 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.6 },
});
