import { Platform, StyleSheet } from 'react-native';

// Shared native text roles. Keep screen-specific layout outside these styles.
const fontFamily = Platform.select({ ios: 'System', android: 'sans-serif' });

export const typography = StyleSheet.create({
  title: { fontFamily, fontSize: 28, lineHeight: 34, fontWeight: '600' },
  section: { fontFamily, fontSize: 20, lineHeight: 26, fontWeight: '600' },
  cardTitle: { fontFamily, fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontFamily, fontSize: 17, lineHeight: 24, fontWeight: '400' },
  label: { fontFamily, fontSize: 17, lineHeight: 24, fontWeight: '500' },
  secondary: { fontFamily, fontSize: 15, lineHeight: 21, fontWeight: '400' },
  // Dense badges and system tab labels are separate from reading text.
  tab: { fontFamily, fontSize: 10, lineHeight: 14, fontWeight: '400' },
  caption: { fontFamily, fontSize: 13, lineHeight: 18, fontWeight: '400' },
  button: { fontFamily, fontSize: 17, lineHeight: 24, fontWeight: '600' },
  reading: { fontFamily, fontSize: 18, lineHeight: 27, fontWeight: '400' },
});

export const typographySpacing = {
  section: 32,
  heading: 12,
  paragraph: 10,
  rowDetail: 4,
  gutter: 20,
} as const;

// Secondary text on light surfaces.
export const typographyColors = { secondary: '#62605B' } as const;
