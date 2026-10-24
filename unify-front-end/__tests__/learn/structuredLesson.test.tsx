import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import StructuredLesson from '@/components/learn/StructuredLesson';
import type {LessonSection} from '@/types/lessonSections';

jest.mock('@expo/vector-icons', () => ({Feather: () => null}));
jest.mock('react-i18next', () => ({useTranslation: () => ({t: (key: string) => key})}));
jest.mock('@/components/sanity/RichTextRenderer', () => { const {Text} = jest.requireActual('react-native'); return {__esModule: true, default: ({blocks}: {blocks: {_key: string}[]}) => <Text>{blocks.map(block => block._key).join(',')}</Text>}; });
const rich = (key: string) => [{_type: 'block' as const, _key: key, style:'normal', children: [], markDefs: []}];
const sections: LessonSection[] = [
  {_type:'lessonExample',_key:'example',theory:rich('theory-content'),practice:rich('practice-content')},
  {_type:'lessonQuickCheck',_key:'check',question:'Which answer?',options:[{_key:'wrong',text:'First',correct:false},{_key:'right',text:'Second',correct:true}],explanation:'The second answer fits.'},
  {_type:'lessonFaq',_key:'faq',items:[{_key:'one',question:'First question?',answer:rich('first-answer')},{_key:'two',question:'Second question?',answer:rich('second-answer')}]},
];

it('switches example content, permits answer retry, and opens the requested FAQ', () => {
  const screen=render(<StructuredLesson sections={sections} title='Sample' highlights={[]} onScrollBeginDrag={()=>{}} />);
  expect(screen.getByText('theory-content')).toBeTruthy();
  expect(screen.queryByText('first-answer')).toBeNull();
  expect(screen.queryByText('second-answer')).toBeNull();
  fireEvent.press(screen.getByText('learn.structured.practice'));
  expect(screen.queryByText('theory-content')).toBeNull();
  expect(screen.getByText('practice-content')).toBeTruthy();
  fireEvent.press(screen.getByText('First'));
  expect(screen.getByText('learn.structured.tryAgain')).toBeTruthy();
  fireEvent.press(screen.getByText('Second'));
  expect(screen.getByText('learn.structured.correct')).toBeTruthy();
  fireEvent.press(screen.getByText('Second question?'));
  expect(screen.getByText('second-answer')).toBeTruthy();
  expect(screen.queryByText('first-answer')).toBeNull();
  fireEvent.press(screen.getByText('Second question?'));
  expect(screen.queryByText('second-answer')).toBeNull();
});

it('keeps the requested chip selected when a jump reaches the scroll limit', () => {
  const {ScrollView} = jest.requireActual('react-native');
  const withCitations: LessonSection[] = [...sections, {_type: 'lessonCitations', _key: 'sources', sources: [{_key:'source', title:'Source', url:'https://example.com'}]}];
  const screen = render(<StructuredLesson sections={withCitations} title='Sample' highlights={[]} onScrollBeginDrag={() => {}} />);
  const faq = screen.getByRole('button', {name:'learn.structured.faq'});
  const citations = screen.getByRole('button', {name:'learn.structured.citations'});
  const contentScroll = screen.UNSAFE_getAllByType(ScrollView)[1];
  const bottom = {nativeEvent:{contentOffset:{y:500},layoutMeasurement:{height:500},contentSize:{height:1000}}};
  fireEvent.press(faq);
  fireEvent.scroll(contentScroll, bottom);
  expect(faq.props.accessibilityState.selected).toBe(true);
  expect(citations.props.accessibilityState.selected).toBe(false);
  fireEvent(contentScroll, 'scrollBeginDrag');
  fireEvent.scroll(contentScroll, bottom);
  expect(citations.props.accessibilityState.selected).toBe(true);
});
