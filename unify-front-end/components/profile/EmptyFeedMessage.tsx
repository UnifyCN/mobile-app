import { typography } from '@/constants/Typography';
import { View, Text, StyleSheet } from 'react-native';

interface EmptyFeedMessageProps {
  message: string;
  submessage?: React.ReactNode;
  icon?: React.ReactNode;
}

const EmptyFeedMessage = ({
  message,
  submessage,
  icon,
}: EmptyFeedMessageProps) => {
  return (
    <View style={styles.container}>
      {icon && <View style={styles.iconContainer}>{icon}</View>}
      <Text style={styles.message}>{message}</Text>
      {submessage}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: 20,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 10,
  },
  message: { ...typography.cardTitle, color: '#333', marginBottom: 10 },
});

export default EmptyFeedMessage;
