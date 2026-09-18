import { Alert } from 'react-native';
import * as Updates from 'expo-updates';
import i18n from './index';

/**
 * After a LTR ⇄ RTL switch the native layout only updates on reload. Tell the
 * user and reload the JS bundle. `reloadAsync` is unavailable in some dev
 * setups (e.g. Expo Go without updates); then the new direction simply
 * applies on the next cold start.
 */
export function promptRestartForLayoutDirection(): void {
  Alert.alert(
    i18n.t('language.restart.title'),
    i18n.t('language.restart.message'),
    [
      {
        text: i18n.t('language.restart.button'),
        onPress: () => {
          Updates.reloadAsync().catch(e =>
            console.warn('Updates.reloadAsync failed; direction applies on next launch', e)
          );
        },
      },
    ],
    { cancelable: false }
  );
}
