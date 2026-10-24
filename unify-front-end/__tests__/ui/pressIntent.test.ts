import { createTapOnlyPressHandlers } from '@/utils/pressIntent';

describe('createTapOnlyPressHandlers', () => {
  it('submits a normal tap', () => {
    const onTap = jest.fn();
    const handlers = createTapOnlyPressHandlers(onTap);

    handlers.onPressIn();
    handlers.onPress();

    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('does not submit when a long press is released', () => {
    const onTap = jest.fn();
    const handlers = createTapOnlyPressHandlers(onTap);

    handlers.onPressIn();
    handlers.onLongPress();
    handlers.onPress();

    expect(onTap).not.toHaveBeenCalled();
  });

  it('allows the next ordinary tap after a long press', () => {
    const onTap = jest.fn();
    const handlers = createTapOnlyPressHandlers(onTap);

    handlers.onPressIn();
    handlers.onLongPress();
    handlers.onPress();
    handlers.onPressIn();
    handlers.onPress();

    expect(onTap).toHaveBeenCalledTimes(1);
  });
});
