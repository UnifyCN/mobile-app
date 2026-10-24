import { typography } from '@/constants/Typography';
import React, { useRef, useState } from 'react';
import {
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Theme } from '@/constants/Theme';

interface InviteCodeFieldProps {
  value: string;
  onChange: (code: string) => void;
  /** When true, indicates code came from clipboard auto-detect — render dimmed but editable. */
  autoFilled?: boolean;
}

const CODE_LEN = 6;
const BOX_W = 44;
const BOX_H = 54;
const BOX_GAP = 8;
const ROW_W = BOX_W * CODE_LEN + BOX_GAP * (CODE_LEN - 1);

/**
 * Onboarding step 3 — "Their invite code" input. Shown only when the user
 * selected `friends_family` as their referral source. Renders as a card with
 * six character boxes (OTP-style). A real TextInput occupies the row layout
 * so KeyboardAwareScrollView can measure it; the visible boxes are absolutely
 * positioned on top with pointerEvents=none so taps pass through to the input.
 */
export function InviteCodeField({
  value,
  onChange,
  autoFilled,
}: InviteCodeFieldProps) {
  const { t } = useTranslation();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  const handleChange = (next: string) => {
    const cleaned = next
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .replace(/[01IO]/g, '')
      .slice(0, CODE_LEN);
    onChange(cleaned);
    if (cleaned.length === CODE_LEN) {
      Keyboard.dismiss();
    }
  };

  const focusInput = () => inputRef.current?.focus();

  const chars = Array.from({ length: CODE_LEN }, (_, i) => value[i] ?? '');
  const activeIndex = Math.min(value.length, CODE_LEN - 1);

  return (
    <View style={styles.wrapper}>
      <View style={styles.card}>
        <TouchableWithoutFeedback onPress={focusInput} accessible={false}>
          <View style={styles.headerArea}>
            <Text style={styles.heading}>
              {t('referrals.theirInviteCodeHeading')}
            </Text>
            <Text style={styles.hint}>
              {autoFilled
                ? t('referrals.theirInviteCodeAutoFilled')
                : t('referrals.theirInviteCodeHint')}
            </Text>
          </View>
        </TouchableWithoutFeedback>

        <View style={styles.boxesContainer}>
          <TextInput
            ref={inputRef}
            style={styles.realInput}
            value={value}
            onChangeText={handleChange}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoCapitalize='characters'
            autoCorrect={false}
            spellCheck={false}
            maxLength={CODE_LEN}
            caretHidden
            selectTextOnFocus={false}
            textContentType='oneTimeCode'
            keyboardType='default'
            accessibilityLabel={t('referrals.theirInviteCode')}
          />
          <View style={styles.boxesOverlay} pointerEvents='none'>
            {chars.map((char, i) => {
              const isActive = focused && i === activeIndex && !char;
              return (
                <View
                  key={i}
                  style={[
                    styles.box,
                    char ? styles.boxFilled : null,
                    isActive ? styles.boxActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.boxChar,
                      autoFilled ? styles.boxCharAutoFilled : null,
                    ]}
                  >
                    {char}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 24,
    marginTop: 20,
  },
  card: {
    paddingVertical: 22,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: '#FFF5F3',
    alignItems: 'center',
  },
  headerArea: {
    alignItems: 'center',
  },
  heading: {
    ...typography.cardTitle,
    color: Theme.black,
    marginBottom: 4,
    textAlign: 'center',
  },
  hint: {
    ...typography.caption,
    color: Theme.textAlternateGray,
    marginBottom: 18,
    textAlign: 'center',
  },
  boxesContainer: {
    width: ROW_W,
    height: BOX_H,
    justifyContent: 'center',
  },
  realInput: {
    ...typography.section,
    width: ROW_W,
    height: BOX_H,
    color: 'transparent',
    backgroundColor: 'transparent',
    textAlign: 'center',
    padding: 0,
  },
  boxesOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: BOX_GAP,
  },
  box: {
    width: BOX_W,
    height: BOX_H,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Theme.borderInfoText,
    backgroundColor: Theme.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxFilled: {
    borderColor: Theme.primaryGatherRed,
  },
  boxActive: {
    borderColor: Theme.primaryGatherRed,
    shadowColor: Theme.primaryGatherRed,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  boxChar: {
    fontSize: 22,
    fontWeight: '700',
    color: Theme.black,
    fontFamily: 'monospace',
  },
  boxCharAutoFilled: {
    color: Theme.textInput,
  },
});
