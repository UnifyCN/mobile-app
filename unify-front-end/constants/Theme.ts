/**
 * Theme configuration for the app
 * Contains color definitions following the naming convention: theme.primaryactiondefault
 */

export const Theme = {
  primaryGatherRed: '#f68b26',
  disabledGatherRed: 'rgba(246, 139, 38, 0.6)',

  black: '#000000',
  white: '#FFFFFF',
  secondaryBlack: '#171616',

  textInput: '#686464',
  textInactiveTab: '#62605B',
  textAlternateGray: '#575757',
  textPostTime: '#62605B',

  surfaceTextInput: '#E6E6E6',
  surfaceGray: '#F0F0F0',
  surfaceBlue: '#5182C7',
  surfaceEventCard: '#F9F9F9',

  mentionBlue: '#007AFF',

  backgroundChatbot: '#F3F2F2',

  imagePlaceholder: '#D3D3D3',

  borderInfoText: '#C1C1C1',
  borderCard: '#CDCBCB',

  destructive: '#FF3B30',

  // Learn tab highlight colors
  highlightYellow: '#FEF3C7', // Light amber background for highlighted text
  highlightYellowActive: '#FDE68A', // Slightly stronger amber for active selection
} as const;
