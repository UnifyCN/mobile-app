import React, { useState } from 'react';
import { View, SafeAreaView, Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SelectionProvider } from '@/context/SelectionContext';
import StructuredLesson from '@/components/learn/StructuredLesson';
import { ResumeRow } from '@/components/learn/LearnPrimitives';
import type { LessonSection } from '@/types/lessonSections';
const rich = (key: string, text: string) => [
  {
    _type: 'block' as const,
    _key: key,
    style: 'normal',
    children: [
      { _type: 'span' as const, _key: `${key}-span`, text, marks: [] },
    ],
    markDefs: [],
  },
];
const sections: LessonSection[] = [
  {
    _type: 'lessonConcept',
    _key: 'concept',
    content: rich(
      'intro',
      'A short greeting can help you start a conversation at work. Use the name that your colleague asks you to use.'
    ),
  },
  {
    _type: 'lessonQuickCheck',
    _key: 'check',
    question: 'A colleague says, “Please call me Sam.” What can you say?',
    options: [
      { _key: 'one', text: 'Hello, Sam.', correct: true },
      { _key: 'two', text: 'I will choose another name.', correct: false },
    ],
    explanation: 'Use the name that the person gives you.',
  },
  {
    _type: 'lessonExample',
    _key: 'example',
    theory: rich('theory', 'Use a short greeting and listen to the reply.'),
    practice: rich(
      'practice',
      'You: “Good morning, Sam.” Sam: “Good morning. How are you?”'
    ),
  },
  {
    _type: 'lessonFaq',
    _key: 'faq',
    items: [
      {
        _key: 'faq1',
        question: 'What if I do not hear the name?',
        answer: rich('answer1', 'Ask the person to repeat it.'),
      },
      {
        _key: 'faq2',
        question: 'Can I ask how to pronounce it?',
        answer: rich('answer2', 'Yes. Ask the person how to say their name.'),
      },
    ],
  },
  {
    _type: 'lessonCitations',
    _key: 'citations',
    sources: [
      {
        _key: 'source',
        title: 'Welcome to Canada',
        publisher: 'Government of Canada',
        url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/new-immigrants.html',
      },
    ],
  },
];
export default function NativePreview() {
  const { t } = useTranslation();
  const router = useRouter();
  const [lesson, setLesson] = useState(false);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <View
        style={{
          paddingHorizontal: 17,
          paddingVertical: 8,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Pressable
          onPress={() => (lesson ? setLesson(false) : router.back())}
          style={{ padding: 12 }}
        >
          <Text>{t('common.back')}</Text>
        </Pressable>
        <Text>Native preview · sample content</Text>
      </View>
      {lesson ? (
        <SelectionProvider>
          <StructuredLesson
            sections={sections}
            title='Greetings at work'
            readingMinutes={4}
            highlights={[]}
            onScrollBeginDrag={() => {}}
          />
        </SelectionProvider>
      ) : (
        <View style={{ padding: 17, gap: 20 }}>
          <Text style={{ fontSize: 28, fontWeight: '700' }}>
            {t('learn.home.heading')}
          </Text>
          <ResumeRow
            title='Work permits and workplace rights'
            subtitle='Employment · Module 1'
            moduleId='baeece22-8ac0-48a0-b310-baab55e38f88'
            onPress={() => setLesson(true)}
          />
          <Text>
            This preview uses sample lesson content. It does not save progress.
          </Text>
          <Pressable
            accessibilityRole='button'
            onPress={() => router.push('/(tabs)/Learn')}
            style={{
              minHeight: 48,
              padding: 14,
              borderRadius: 12,
              backgroundColor: '#EEF1F6',
            }}
          >
            <Text style={{ color: '#2C4976', fontWeight: '600' }}>
              Browse updated Learn screens
            </Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
