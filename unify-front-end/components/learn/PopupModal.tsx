import { typography } from '@/constants/Typography';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
} from 'react-native';
import { Link } from 'expo-router';

interface PopupModalProps {
  question: string;
  topResponse: string;
  bottomResponse: string;
  show: boolean;
  setShow: any;
  link?: string;
  confirm: any;
}

const PopupModal: React.FC<PopupModalProps> = ({
  question,
  topResponse,
  bottomResponse,
  show,
  setShow,
  link = '',
  confirm,
}) => {
  return (
    // Modal that fades in when next button is pressed
    <Modal transparent visible={show} animationType='fade'>
      <View style={styles.modal}>
        <View style={styles.modalContent}>
          <Image
            source={require('../../assets/images/warn.png')}
            style={styles.image}
          ></Image>
          <Text style={styles.questionText}>{question}</Text>
          {/* Proceed to quiz*/}
          {link ? ( // only navigate if link is provided
            <Link href={link as any} asChild>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => {
                  confirm();
                }}
              >
                <Text style={styles.yesText}>{topResponse}</Text>
              </TouchableOpacity>
            </Link>
          ) : (
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => {
                confirm();
              }}
            >
              <Text style={styles.yesText}>{topResponse}</Text>
            </TouchableOpacity>
          )}
          {/* Go back to key takeaways*/}
          <TouchableOpacity
            style={[styles.modalButton, styles.modalBottomButton]}
            onPress={setShow}
          >
            <Text style={styles.noText}>{bottomResponse}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modal: {
    flex: 1,
    backgroundColor: 'rgba(24, 24, 24, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    height: 325,
    backgroundColor: '#fff',
    borderRadius: 16,
    alignItems: 'center',
  },
  modalButton: {
    paddingVertical: 11,
    borderRadius: 20,
    marginVertical: 5,
    alignItems: 'center',
    width: 'auto',
    backgroundColor: '#3FADF2',
    marginTop: 22,
  },
  modalBottomButton: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#000000',
    marginTop: 10,
  },
  questionText: {
    ...typography.cardTitle,
    marginHorizontal: 50,
    textAlign: 'center',
  },
  noText: { ...typography.cardTitle, color: '#000', paddingHorizontal: 25 },
  yesText: { ...typography.cardTitle, color: '#fff', paddingHorizontal: 25 },
  image: {
    alignSelf: 'center',
    marginTop: 35,
    marginBottom: 20,
  },
});

export default PopupModal;
