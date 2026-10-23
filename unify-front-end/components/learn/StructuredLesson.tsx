import { lessonPresentation } from '@/utils/lessonPresentation';
import React, { useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import RichTextRenderer from '@/components/sanity/RichTextRenderer';
import type { LessonSection, LessonRichContent } from '@/types/lessonSections';
import { learnStyles as s } from './LearnPrimitives';

const EXAMPLE_TABS = ['theory', 'practice'] as const;

function readingWordCount(value: unknown): number {
  if (Array.isArray(value))
    return value.reduce((sum, item) => sum + readingWordCount(item), 0);
  if (!value || typeof value !== 'object') return 0;
  return Object.entries(value).reduce(
    (sum, [field, item]) =>
      sum +
      (['text', 'question', 'explanation', 'caption'].includes(field) &&
      typeof item === 'string'
        ? item.trim().split(/\s+/).filter(Boolean).length
        : readingWordCount(item)),
    0
  );
}

const sectionKeys = {
  lessonConcept: 'concept',
  lessonExample: 'example',
  lessonVisual: 'visual',
  lessonQuickCheck: 'quickCheck',
  lessonFaq: 'faq',
  lessonCitations: 'citations',
} as const;

export default function StructuredLesson({
  sections: storedSections,
  title,
  readingMinutes,
  lessonNumber,
  highlights,
  markDefs,
  onScrollBeginDrag,
}: {
  sections: LessonSection[];
  title: string;
  readingMinutes?: number;
  lessonNumber?: number;
  highlights: React.ComponentProps<typeof RichTextRenderer>['highlights'];
  markDefs?: React.ComponentProps<typeof RichTextRenderer>['markDefs'];
  onScrollBeginDrag: () => void;
}) {
  const { sections, citationContent } = lessonPresentation(storedSections);
  const { t } = useTranslation();
  const estimatedMinutes =
    readingMinutes ?? Math.max(1, Math.ceil(readingWordCount(sections) / 200));
  const scroll = useRef<ScrollView>(null);
  const positions = useRef<Record<string, number>>({});
  const navigatingToSection = useRef(false);
  const [selected, setSelected] = useState(sections[0]?._key);
  const label = (section: LessonSection) =>
    section.title || t(`learn.structured.${sectionKeys[section._type]}`);
  const navigationSections = sections.filter(
    section => section._type !== 'lessonQuickCheck'
  );
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          gap: 8,
          paddingBottom: 8,
        }}
      >
        {navigationSections.map(section => (
          <Pressable
            key={section._key}
            accessibilityRole='button'
            hitSlop={{ top: 7, bottom: 7 }}
            accessibilityState={{ selected: selected === section._key }}
            onPress={() => {
              navigatingToSection.current = true;
              setSelected(section._key);
              scroll.current?.scrollTo({
                y: positions.current[section._key] ?? 0,
                animated: true,
              });
            }}
            style={({ pressed }) => [
              {
                minHeight: 30,
                paddingVertical: 5,
                paddingHorizontal: 12,
                marginVertical: 7,
                borderRadius: 18,
                justifyContent: 'center',
                backgroundColor:
                  selected === section._key ? '#33312D' : '#EEEEEC',
              },
              pressed && s.pressed,
            ]}
          >
            <Text
              style={{
                fontSize: 14,
                lineHeight: 20,
                fontWeight: '600',
                color: selected === section._key ? '#FFFFFF' : '#33312D',
              }}
            >
              {label(section)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView
        ref={scroll}
        onScrollBeginDrag={() => {
          navigatingToSection.current = false;
          onScrollBeginDrag();
        }}
        onScroll={event => {
          if (navigatingToSection.current) return;
          const { contentOffset, layoutMeasurement, contentSize } =
            event.nativeEvent;
          const y = contentOffset.y + 24;
          if (
            contentSize.height > layoutMeasurement.height &&
            contentOffset.y + layoutMeasurement.height >= contentSize.height - 2
          ) {
            setSelected(
              navigationSections[navigationSections.length - 1]?._key
            );
            return;
          }
          const current = [...navigationSections]
            .reverse()
            .find(
              section => (positions.current[section._key] ?? Infinity) <= y
            );
          if (current) setSelected(current._key);
        }}
        scrollEventThrottle={100}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 28,
          paddingBottom: 24,
          gap: 32,
        }}
      >
        <View style={{ gap: 8 }}>
          {lessonNumber || estimatedMinutes > 0 ? (
            <Text style={s.meta}>
              {[
                lessonNumber
                  ? t('learn.structured.lessonNumber', {
                      number: String(lessonNumber).padStart(2, '0'),
                    })
                  : null,
                estimatedMinutes
                  ? t('learn.structured.readingMinutes', {
                      count: estimatedMinutes,
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')
                .toLocaleUpperCase()}
            </Text>
          ) : null}
          <Text style={[s.title, { fontSize: 34, lineHeight: 40 }]}>
            {title}
          </Text>
        </View>
        {sections.map(section => (
          <View
            key={section._key}
            onLayout={event => {
              positions.current[section._key] = event.nativeEvent.layout.y;
            }}
            style={{ gap: 12 }}
          >
            {section._type !== 'lessonQuickCheck' ? (
              <View style={s.row}>
                <View
                  style={{
                    minWidth: 24,
                    minHeight: 24,
                    paddingHorizontal: 5,
                    paddingVertical: 3,
                    borderRadius: 7,
                    backgroundColor: '#33312D',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 12 }}>
                    {navigationSections.findIndex(
                      item => item._key === section._key
                    ) + 1}
                  </Text>
                </View>
                <Text
                  accessibilityRole='header'
                  style={{
                    fontSize: 20,
                    lineHeight: 26,
                    fontWeight: '600',
                    color: '#191919',
                    flex: 1,
                  }}
                >
                  {label(section)}
                </Text>
              </View>
            ) : null}
            <SectionBody
              section={section}
              citationContent={citationContent}
              highlights={highlights}
              markDefs={markDefs}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function SectionBody({
  section,
  citationContent,
  highlights,
  markDefs,
}: {
  section: LessonSection;
  citationContent: LessonRichContent;
  markDefs?: React.ComponentProps<typeof RichTextRenderer>['markDefs'];
  highlights: React.ComponentProps<typeof RichTextRenderer>['highlights'];
}) {
  const { t } = useTranslation();
  const [exampleTab, setExampleTab] = useState<'theory' | 'practice'>('theory');
  const [answer, setAnswer] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const rich = (content: LessonRichContent, compact = false) => (
    <RichTextRenderer
      compactContainer={compact}
      blocks={content}
      markDefs={markDefs}
      highlights={highlights}
      styles={{
        h1: { fontSize: 19, lineHeight: 26, marginTop: 12, marginBottom: 10 },
        h2: { fontSize: 19, lineHeight: 26, marginTop: 12, marginBottom: 10 },
        h3: { fontSize: 18, lineHeight: 25, marginTop: 10, marginBottom: 10 },
        normal: {
          fontSize: 18,
          lineHeight: 27,
          marginBottom: 10,
          ...(compact ? { marginTop: 0 } : {}),
          color: '#191919',
        },
        exampleBox: {
          backgroundColor: '#F5F5F5',
          borderRadius: 14,
          padding: 14,
          marginVertical: 10,
          gap: 8,
          borderWidth: 0,
          shadowOpacity: 0,
          elevation: 0,
        },
        tipBoxContainer: {
          backgroundColor: '#F5F5F5',
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 10,
          marginBottom: 10,
          alignSelf: 'stretch',
        },
        tipBodyText: {
          fontSize: 18,
          lineHeight: 27,
          fontWeight: '400',
          color: '#191919',
          marginTop: 0,
          marginBottom: 0,
        },
        tipTitleText: {
          fontSize: 18,
          lineHeight: 27,
          fontWeight: '600',
          color: '#191919',
        },
      }}
    />
  );
  switch (section._type) {
    case 'lessonConcept':
      return rich(section.content);
    case 'lessonExample':
      return (
        <View style={{ gap: 12 }}>
          <View
            style={[
              s.row,
              {
                backgroundColor: '#F2F2F7',
                padding: 3,
                borderRadius: 12,
                gap: 3,
              },
            ]}
          >
            {EXAMPLE_TABS.map(tab => (
              <Pressable
                key={tab}
                accessibilityRole='button'
                accessibilityState={{ selected: exampleTab === tab }}
                onPress={() => setExampleTab(tab)}
                style={{
                  flex: 1,
                  minHeight: 44,
                  justifyContent: 'center',
                  alignItems: 'center',
                  borderRadius: 10,
                  backgroundColor:
                    exampleTab === tab ? '#FFFFFF' : 'transparent',
                }}
              >
                <Text
                  style={[
                    s.meta,
                    {
                      fontSize: 15,
                      lineHeight: 20,
                      fontWeight: '500',
                      color: '#191919',
                      textAlign: 'center',
                      paddingHorizontal: 6,
                      paddingVertical: 6,
                    },
                  ]}
                >
                  {t(`learn.structured.${tab}`)}
                </Text>
              </Pressable>
            ))}
          </View>
          <View
            style={{
              backgroundColor: '#F5F5F5',
              borderRadius: 14,
              padding: 14,
            }}
          >
            {rich(section[exampleTab])}
          </View>
        </View>
      );
    case 'lessonVisual':
      return (
        <View
          style={{
            backgroundColor: '#F5F5F5',
            borderRadius: 14,
            padding: 14,
            gap: 10,
          }}
        >
          {section.content?.length ? rich(section.content) : null}
          <RichTextRenderer blocks={[section.image]} highlights={highlights} />
          {section.caption ? (
            <Text
              style={[
                s.meta,
                {
                  fontFamily: 'Inter',
                  fontSize: 16,
                  lineHeight: 24,
                  color: '#191919',
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1,
                  borderColor: '#E3E3E3',
                  borderRadius: 12,
                  padding: 12,
                },
              ]}
            >
              {section.caption}
            </Text>
          ) : null}
        </View>
      );
    case 'lessonQuickCheck':
      return (
        <View style={[s.card, { borderColor: '#A7A7A7', padding: 14 }]}>
          <Text
            accessibilityRole='header'
            style={[
              s.meta,
              {
                fontSize: 17,
                lineHeight: 23,
                fontWeight: '600',
                color: '#191919',
              },
            ]}
          >
            {t('learn.structured.quickCheck')}
          </Text>
          <Text
            style={[
              s.rowTitle,
              { fontFamily: 'Inter', fontSize: 18, lineHeight: 27 },
            ]}
          >
            {section.question}
          </Text>
          {section.options.map(option => (
            <Pressable
              key={option._key}
              accessibilityRole='button'
              accessibilityLabel={option.text}
              accessibilityState={{ selected: answer === option._key }}
              onPress={() => setAnswer(option._key)}
              style={({ pressed }) => [
                {
                  minHeight: 44,
                  padding: 12,
                  borderWidth: 1,
                  borderRadius: 10,
                  borderColor: answer === option._key ? '#2C4976' : '#E3E3E3',
                  backgroundColor:
                    answer === option._key ? '#EEF1F6' : '#FFFFFF',
                },
                pressed && s.pressed,
              ]}
            >
              <Text
                style={{
                  fontFamily: 'Inter',
                  fontSize: 18,
                  lineHeight: 27,
                  color: '#191919',
                }}
              >
                {option.text}
              </Text>
            </Pressable>
          ))}
          {answer ? (
            <View accessibilityLiveRegion='polite' style={{ gap: 8 }}>
              <Text
                style={[
                  s.rowTitle,
                  { fontFamily: 'Inter', fontSize: 18, lineHeight: 27 },
                ]}
              >
                {t(
                  section.options.find(option => option._key === answer)
                    ?.correct
                    ? 'learn.structured.correct'
                    : 'learn.structured.tryAgain'
                )}
              </Text>
              <Text
                style={[
                  s.subtitle,
                  { fontFamily: 'Inter', fontSize: 18, lineHeight: 27 },
                ]}
              >
                {section.explanation}
              </Text>
            </View>
          ) : null}
        </View>
      );
    case 'lessonFaq':
      return (
        <View style={{ gap: 10 }}>
          {section.items.map(item => (
            <View
              key={item._key}
              style={[
                s.card,
                {
                  borderColor: openFaq === item._key ? '#191919' : '#E3E3E3',
                  borderWidth: openFaq === item._key ? 1.5 : 1,
                  gap: 0,
                },
              ]}
            >
              <Pressable
                accessibilityRole='button'
                accessibilityLabel={item.question}
                accessibilityState={{ expanded: openFaq === item._key }}
                onPress={() =>
                  setOpenFaq(openFaq === item._key ? null : item._key)
                }
                style={[s.row, { minHeight: 44 }]}
              >
                <Text
                  style={[
                    s.rowTitle,
                    {
                      flex: 1,
                      fontFamily: 'Inter',
                      fontSize: 18,
                      lineHeight: 25,
                    },
                  ]}
                >
                  {item.question}
                </Text>
                <Feather
                  name={openFaq === item._key ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color='#686464'
                />
              </Pressable>
              {openFaq === item._key ? rich(item.answer, true) : null}
            </View>
          ))}
        </View>
      );
    case 'lessonCitations':
      return (
        <View style={{ gap: 12 }}>
          {citationContent.length > 0 ? rich(citationContent, true) : null}
          {section.sources.map((source, index) => (
            <Pressable
              key={source._key}
              accessibilityRole='link'
              accessibilityLabel={source.title}
              onPress={async () => {
                if (!/^https?:\/\//i.test(source.url)) return;
                try {
                  await Linking.openURL(source.url);
                } catch {
                  Alert.alert(
                    t('common.somethingWentWrong'),
                    t('common.tryAgain')
                  );
                }
              }}
              style={[s.row, { minHeight: 44, alignItems: 'flex-start' }]}
            >
              <Text style={s.meta}>[{index + 1}]</Text>
              <View style={s.grow}>
                <Text style={[s.meta, { fontSize: 13, lineHeight: 18 }]}>
                  {[source.publisher, source.year].filter(Boolean).join(' · ')}
                </Text>
                <Text
                  style={{
                    fontFamily: 'Inter',
                    fontSize: 16,
                    lineHeight: 24,
                    color: '#2C4976',
                  }}
                >
                  {source.title}
                </Text>
              </View>
              <Feather name='external-link' size={14} color='#2C4976' />
            </Pressable>
          ))}
        </View>
      );
  }
}
