import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import RichTextRenderer from '@/components/sanity/RichTextRenderer';
import { getLesson } from '@/services/sanity/lessons';

const mockFetch = jest.fn();
jest.mock('@/sanity-custom', () => ({
  sanityClient: { fetch: (...args: unknown[]) => mockFetch(...args) },
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/components/sanity/ImageViewerModal', () => () => null);
jest.mock('@/components/sanity/DropdownBlock', () => () => null);
jest.mock('@/components/sanity/ChecklistCheckboxBlock', () => () => null);
jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));
jest.mock('lucide-react-native', () => ({
  AlignJustify: () => null,
  AlignVerticalJustifyCenter: () => null,
}));
jest.mock('@/context/SelectionContext', () => ({
  useSelectionOptional: () => null,
}));

const baseLink = {
  _key: 'same',
  _type: 'link',
  href: 'https://www.canada.ca/en.html',
};
const localizedLink = { ...baseLink, href: 'https://www.canada.ca/fr.html' };
const base = {
  _key: 'paragraph',
  _type: 'block',
  style: 'normal',
  children: [
    { _key: 'en-span', _type: 'span', text: 'English', marks: ['same'] },
  ],
  markDefs: [baseLink],
};

afterEach(() => jest.restoreAllMocks());

it.each([
  { definitions: [], text: 'English', href: baseLink.href },
  { definitions: undefined, text: 'Texto', href: baseLink.href },
  { definitions: [localizedLink], text: 'Texto', href: localizedLink.href },
])(
  'returns and opens a coherent source link for %j',
  async ({ definitions, text, href }) => {
    const localized = {
      ...base,
      children: [
        { _key: 'es-span', _type: 'span', text: 'Texto', marks: ['same'] },
      ],
      markDefs: definitions,
    };
    mockFetch.mockResolvedValueOnce({
      _id: 'lesson',
      _type: 'lesson',
      content_blocks: [
        { _key: 'reading', _type: 'lesson_content', content: [base] },
      ],
      i18n: {
        content_blocks: [
          { _key: 'reading', _type: 'lesson_content', content: [localized] },
        ],
      },
    });
    const lesson = await getLesson('lesson', 'es');
    const page = lesson?.pages?.[0];
    expect(page).toBeDefined();
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(
      <RichTextRenderer
        blocks={page?.content || []}
        markDefs={page?.markDefs}
      />
    );
    const link = screen.getByText(text);
    expect(link.props.onPress).toEqual(expect.any(Function));
    fireEvent.press(link);
    expect(openURL).toHaveBeenCalledWith(href);
  }
);
