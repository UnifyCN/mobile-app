import React, { forwardRef } from 'react';
import { Text, type TextProps, useWindowDimensions } from 'react-native';
import { textScaleKey } from '@/utils/textScale';

/** Refresh native text measurements while retaining its stateful callers and controls. */
export const LiveText = forwardRef<Text, TextProps>(function LiveText(props, ref) {
  const { fontScale } = useWindowDimensions();
  return <Text key={textScaleKey(fontScale)} ref={ref} {...props} />;
});
