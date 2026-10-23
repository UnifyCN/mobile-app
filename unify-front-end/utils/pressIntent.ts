export interface TapOnlyPressHandlers {
  onPressIn: () => void;
  onLongPress: () => void;
  onPress: () => void;
}

/**
 * Keeps a long press from falling through to the normal tap action when the
 * finger is released. Starting a new press always resets the gesture state.
 */
export function createTapOnlyPressHandlers(
  onTap: () => void
): TapOnlyPressHandlers {
  let wasLongPress = false;

  return {
    onPressIn: () => {
      wasLongPress = false;
    },
    onLongPress: () => {
      wasLongPress = true;
    },
    onPress: () => {
      if (wasLongPress) {
        wasLongPress = false;
        return;
      }
      onTap();
    },
  };
}
