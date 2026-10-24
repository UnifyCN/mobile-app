import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { View, StyleSheet } from 'react-native';
import RichTextRenderer from '@/components/sanity/RichTextRenderer';
import DropdownAccordion from '@/components/learn/DropdownAccordion';
jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/components/sanity/ImageViewerModal', () => () => null);
jest.mock('@/components/learn/SelectableText', () => {
  const { Text } = jest.requireActual('react-native');
  return function MockSelectableText({ style, spans, blockKey }: any) {
    return (
      <Text style={style} testID={blockKey}>
        {spans.map((s: any) => s.text).join('')}
      </Text>
    );
  };
});
const block = (text: string, key?: string) => ({
  _type: 'block',
  _key: key,
  style: 'normal',
  children: [{ _type: 'span', text, marks: [] }],
  markDefs: [],
});
const spacers = (screen: ReturnType<typeof render>) =>
  screen
    .UNSAFE_getAllByType(View)
    .filter(v => StyleSheet.flatten(v.props.style)?.height === 25);
it('trims only trailing blank paragraphs without changing source indices or interior spacing', () => {
  const blocks = [
    block('First', 'first'),
    block(' '),
    block('Last'),
    block(' '),
    block(''),
  ];
  const before = JSON.stringify(blocks);
  const screen = render(<RichTextRenderer blocks={blocks} trimEndSpacing />);
  expect(spacers(screen)).toHaveLength(1);
  expect(
    StyleSheet.flatten(screen.getByText('First').props.style).marginBottom
  ).toBe(10);
  expect(
    StyleSheet.flatten(screen.getByText('Last').props.style).marginBottom
  ).toBe(0);
  expect(screen.getByText('Last').props.testID).toBe('block-2');
  expect(JSON.stringify(blocks)).toBe(before);
});
it('retains legacy trailing paragraphs and margins by default', () => {
  const screen = render(
    <RichTextRenderer blocks={[block('Last'), block(' ')]} />
  );
  expect(spacers(screen)).toHaveLength(1);
  expect(
    StyleSheet.flatten(screen.getByText('Last').props.style).marginBottom
  ).toBe(10);
});
it('does not trim a block that contains an inline object', () => {
  const screen = render(
    <RichTextRenderer
      trimEndSpacing
      blocks={[
        block('First'),
        { _type: 'block', children: [{ _type: 'inlineObject' }] },
      ]}
    />
  );
  expect(
    StyleSheet.flatten(screen.getByText('First').props.style).marginBottom
  ).toBe(10);
});
it('removes only the final dropdown outer margin in both states', () => {
  const screen = render(
    <DropdownAccordion
      trimEndSpacing
      items={[
        { id: 'a', title: 'First', body: 'First body' },
        { id: 'b', title: 'Last', body: 'Last body' },
      ]}
    />
  );
  expect(
    StyleSheet.flatten(
      screen.getByRole('button', { name: 'First' }).props.style
    ).marginBottom
  ).toBe(8);
  expect(
    StyleSheet.flatten(screen.getByRole('button', { name: 'Last' }).props.style)
      .marginBottom
  ).toBe(0);
  fireEvent.press(screen.getByText('Last'));
  expect(
    StyleSheet.flatten(screen.getByRole('button', { name: 'Last' }).props.style)
      .marginBottom
  ).toBe(8);
  const body = screen
    .UNSAFE_getAllByType(View)
    .find(v => StyleSheet.flatten(v.props.style)?.paddingVertical === 16);
  expect(StyleSheet.flatten(body!.props.style).marginBottom).toBe(0);
});

it('keeps interior bullet spacing and trims only the last bullet', () => {
  const screen = render(
    <RichTextRenderer
      trimEndSpacing
      blocks={[
        { ...block('First bullet', 'first'), listItem: 'bullet' },
        { ...block('Last bullet', 'last'), listItem: 'bullet' },
        block(' '),
      ]}
    />
  );
  const rows = screen
    .UNSAFE_getAllByType(View)
    .filter(v => StyleSheet.flatten(v.props.style)?.marginLeft === 0);
  expect(rows.map(v => StyleSheet.flatten(v.props.style).marginBottom)).toEqual(
    [10, 0]
  );
});

it('passes terminal spacing through the real dropdown renderer', () => {
  const screen = render(
    <RichTextRenderer
      trimEndSpacing
      blocks={[
        {
          _type: 'dropdown',
          _key: 'dropdown',
          label: 'Final dropdown',
          content: [block('Body')],
        },
        block(' '),
      ]}
    />
  );
  expect(spacers(screen)).toHaveLength(0);
  expect(
    StyleSheet.flatten(
      screen.getByRole('button', { name: 'Final dropdown' }).props.style
    ).marginBottom
  ).toBe(0);
});
