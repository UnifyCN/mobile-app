import { typography } from '@/constants/Typography';
import React from 'react';

import { Controller, ControllerProps } from 'react-hook-form';
import { View, ViewProps, ViewStyle, TextInput } from 'react-native';
import {
  Button,
  ButtonProps,
  Headline,
  HeadlineProps,
  Text,
  TextInputProps,
  useTheme,
} from 'react-native-paper';

const styles = {
  signOutButton: { marginVertical: 32, marginHorizontal: 16 },
  viewHeader: { marginBottom: 16 },
  viewDivider: { marginVertical: 16 },
  errorMessageBox: { ...typography.secondary, color: '#f00', marginTop: 4 },
  linksContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
  } as ViewStyle,
  errorMessage: { marginTop: 16, padding: 16 },
};

export interface TextFieldProps
  extends
    Omit<TextInputProps, 'error' | 'cursorColor' | 'selectionColor'>,
    Pick<ControllerProps, 'control' | 'name' | 'rules'> {
  control: ControllerProps['control'];
  error?: string;
  type?: 'email' | 'default' | 'password' | 'phone';
}

function TextField({
  control,
  error,
  name,
  type = 'default',
  rules,
  secureTextEntry,
  onChangeText,
  ...props
}: TextFieldProps) {
  return (
    <React.Fragment key={name}>
      <Controller
        control={control}
        name={name}
        render={({ field: { onChange, value, ...renderProps } }) => (
          <TextInput
            {...(props as TextInputProps)}
            {...renderProps}
            value={value ?? ''} // Ensure the value is never undefined
            onChangeText={text => {
              onChange(text); // Update the form state
              onChangeText?.(text); // Call the external onChangeText if provided
            }}
            secureTextEntry={secureTextEntry ?? type === 'password'}
          />
        )}
        rules={rules}
      />
      <Text style={styles.errorMessageBox}>{error || ' '}</Text>
    </React.Fragment>
  );
}

export function SimpleTextField({
  value,
  onChangeText,
  error,
  type = 'default',
  secureTextEntry,
  ...props
}: TextInputProps & {
  error?: string;
  type?: 'email' | 'default' | 'password' | 'phone';
}) {
  return (
    <React.Fragment>
      <TextInput
        {...(props as TextInputProps)}
        value={value ?? ''}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry ?? type === 'password'}
      />
      <Text style={styles.errorMessageBox}>{error || ' '}</Text>
    </React.Fragment>
  );
}

export function SubmitButton({
  children,
  disabled,
  style,
  loading,
  ...props
}: ButtonProps) {
  const theme = useTheme();
  return (
    <Button
      {...props}
      disabled={disabled}
      loading={loading}
      style={[
        {
          backgroundColor:
            disabled || loading
              ? theme.colors.surfaceDisabled
              : theme.colors.primary,
        },

        style,
      ]}
    >
      {children}
    </Button>
  );
}

export function ViewHeader({ children, style, ...props }: HeadlineProps) {
  return (
    <Headline {...props} style={[style]}>
      {children}
    </Headline>
  );
}

export function ViewSection({ children, ...props }: ViewProps) {
  return <View {...props}>{children}</View>;
}

export function LinksContainer({ children, style, ...props }: ViewProps) {
  return (
    <View {...props} style={[styles.linksContainer, style]}>
      {children}
    </View>
  );
}

export function LinkButton({ labelStyle, ...props }: ButtonProps) {
  return <Button {...props} labelStyle={labelStyle} />;
}

export function ViewContainer({ children, style, ...props }: ViewProps) {
  const theme = useTheme();
  return (
    <View
      {...props}
      style={[{ backgroundColor: theme.colors.background }, style]}
    >
      {children}
    </View>
  );
}
