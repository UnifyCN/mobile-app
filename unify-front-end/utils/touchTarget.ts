import { Platform } from 'react-native';

/**
 * Minimum touch target of a control: 48dp on Android (Material), 44pt on iOS
 * (HIG). Read at render time, so a style built from it follows the platform.
 */
export const minTarget = () => (Platform.OS === 'android' ? 48 : 44);

/** Square icon control at the platform's minimum touch target. */
export const squareTarget = () => {
  const size = minTarget();
  return { width: size, height: size, borderRadius: size / 2 };
};
