import React from 'react';
import { Text, StyleSheet, TouchableOpacity, View } from 'react-native';

interface QuizQuestionProps {
  question: string;
  answers: string[];
  // function that gets called when an answer is selected
  selectedAnswer: (answer: string) => void;
  // if an answer is currently selected (optional)
  currentAnswer?: string;
}

const QuizQuestion: React.FC<QuizQuestionProps> = ({
  question,
  answers,
  selectedAnswer,
  currentAnswer,
}) => {
  // represent the answer being pressed for that question
  const answerPressed = (answer: string) => {
    selectedAnswer(answer);
  };

  return (
    <View>
      <Text style={styles.questionText}>{question}</Text>

      {/* for each answer in the set of options, check if its correct */}
      {answers.map((answer, index) => {
        const isSelected = currentAnswer === answer;
        // change answer to dark grey if selected
        // eslint-disable-next-line i18next/no-literal-string -- style value, not copy
        const backgroundColor = isSelected ? '#d0d0d0' : 'white';

        return (
          <TouchableOpacity
            key={index}
            style={[styles.card, { backgroundColor }]}
            onPress={() => answerPressed(answer)}
          >
            <Text style={styles.answerText}>{answer}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderColor: '#000',
    borderWidth: 1,
    borderRadius: 25,
    marginVertical: 10,
  },
  answerText: {
    fontSize: 19,
    color: '#000',
    margin: 10,
    marginLeft: 25,
    fontWeight: '400',
  },
  questionText: {
    fontSize: 19,
    color: '#333',
    marginBottom: 25,
  },
  correct: {
    backgroundColor: '#c8e6c9',
    borderColor: '#fff',
  },
  wrong: {
    backgroundColor: '#ffcdd2',
    borderColor: '#fff',
  },
});

export default QuizQuestion;
