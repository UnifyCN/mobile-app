import { typography } from '@/constants/Typography';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  Pressable,
  Animated,
  PanResponder,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import {
  uploadProfilePicture,
  deleteProfilePicture,
} from '@/services/s3/uploadProfilePicture';
import { updateProfilePicture } from '@/services/users/updateProfilePicture';
import { clearAvatarUrlCache } from '@/services/s3/avatarUrlCache';
import { useQueryClient } from '@tanstack/react-query';
import { Theme } from '@/constants/Theme';

interface ProfilePictureUploadProps {
  currentPictureUrl?: string;
  userId: string;
  modalVisible: boolean;
  onClose: () => void;
}

export const ProfilePictureUpload = ({
  currentPictureUrl,
  userId,
  modalVisible,
  onClose,
}: ProfilePictureUploadProps) => {
  const { t } = useTranslation();
  const [isUploading, setIsUploading] = useState(false);
  const queryClient = useQueryClient();
  const slideAnim = useRef(new Animated.Value(300)).current;

  const invalidateAllQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['userInfo', userId] });
    queryClient.invalidateQueries({ queryKey: ['feed', 'forYou'] });
    queryClient.invalidateQueries({ queryKey: ['feed', 'following'] });
    queryClient.invalidateQueries({ queryKey: ['feed', 'groups'] });
    queryClient.invalidateQueries({ queryKey: ['userPosts', userId] });
    queryClient.invalidateQueries({ queryKey: ['feed', 'savedPosts'] });
  };

  useEffect(() => {
    if (modalVisible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [modalVisible, slideAnim]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to downward drags
        return gestureState.dy > 0;
      },
      onPanResponderGrant: () => {
        slideAnim.stopAnimation(value => {
          slideAnim.setOffset(value);
          slideAnim.setValue(0);
        });
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow dragging down
        if (gestureState.dy > 0) {
          slideAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        slideAnim.flattenOffset();
        const dragThreshold = 100; // Close if dragged down more than 100px

        if (gestureState.dy > dragThreshold || gestureState.vy > 0.5) {
          // Close modal
          Animated.timing(slideAnim, {
            toValue: 300,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            onClose();
          });
        } else {
          // Snap back to original position
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 65,
            friction: 11,
          }).start();
        }
      },
    })
  ).current;

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        t('profilePicture.permissionRequired'),
        t('profilePicture.permissionMessage')
      );
      return false;
    }
    return true;
  };

  const pickImage = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadImage(result.assets[0]);
    }
  };

  const uploadImage = async (asset: ImagePicker.ImagePickerAsset) => {
    setIsUploading(true);
    try {
      // For React Native, we need to read the file as base64
      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);

      // Upload to S3
      const uploadResult = await uploadProfilePicture(buffer, 'image/jpeg');

      if (uploadResult.success && uploadResult.key) {
        // Update the database
        const updateResult = await updateProfilePicture(uploadResult.key);

        if (updateResult.success) {
          if (currentPictureUrl) {
            clearAvatarUrlCache(currentPictureUrl);
          }
          clearAvatarUrlCache(uploadResult.key);

          // Delete old profile picture from S3 if it exists
          if (currentPictureUrl) {
            try {
              await deleteProfilePicture(currentPictureUrl);
            } catch (error) {
              console.warn('Failed to delete old profile picture:', error);
              // Don't show error to user, just log it
            }
          }

          // Invalidate and refetch user info and all post feeds
          invalidateAllQueries();
          Alert.alert(t('common.success'), t('profilePicture.updateSuccess'));
        } else {
          Alert.alert(
            t('common.error'),
            updateResult.error || t('profilePicture.updateFailed')
          );
        }
      } else {
        Alert.alert(
          t('common.error'),
          uploadResult.error || t('profilePicture.uploadFailed')
        );
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      Alert.alert(t('common.error'), t('profilePicture.uploadFailed'));
    } finally {
      setIsUploading(false);
    }
  };

  const removePicture = async () => {
    Alert.alert(
      t('profilePicture.removeTitle'),
      t('profilePicture.removeConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.remove'),
          style: 'destructive',
          onPress: async () => {
            setIsUploading(true);
            try {
              // Delete from S3 if there's a current picture
              if (currentPictureUrl) {
                await deleteProfilePicture(currentPictureUrl);
              }

              // Update the database
              const updateResult = await updateProfilePicture(null);

              if (updateResult.success) {
                if (currentPictureUrl) {
                  clearAvatarUrlCache(currentPictureUrl);
                }
                // Invalidate and refetch user info and all post feeds
                invalidateAllQueries();
                Alert.alert(
                  t('common.success'),
                  t('profilePicture.removeSuccess')
                );
              } else {
                Alert.alert(
                  t('common.error'),
                  updateResult.error || t('profilePicture.removeFailed')
                );
              }
            } catch (error) {
              console.error('Error removing picture:', error);
              Alert.alert(t('common.error'), t('profilePicture.removeFailed'));
            } finally {
              setIsUploading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <>
      <Modal
        animationType='fade'
        transparent={true}
        visible={modalVisible}
        onRequestClose={onClose}
      >
        <Pressable style={styles.modalOverlay} onPress={onClose}>
          <View style={styles.modalContainer}>
            <Animated.View
              style={[
                styles.modalContent,
                { transform: [{ translateY: slideAnim }] },
              ]}
              {...panResponder.panHandlers}
            >
              <View style={styles.dragHandle} />
              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => {
                  onClose();
                  pickImage();
                }}
                disabled={isUploading}
              >
                <Feather
                  name='image'
                  size={20}
                  color={Theme.black}
                  style={styles.optionIcon}
                />
                <Text style={styles.modalOptionText}>
                  {t('profilePicture.chooseFromLibrary')}
                </Text>
              </TouchableOpacity>

              {currentPictureUrl && (
                <TouchableOpacity
                  style={styles.modalOption}
                  onPress={() => {
                    onClose();
                    removePicture();
                  }}
                  disabled={isUploading}
                >
                  <Feather
                    name='trash-2'
                    size={20}
                    color={Theme.black}
                    style={styles.optionIcon}
                  />
                  <Text style={styles.modalOptionText}>
                    {t('profilePicture.removeCurrentPhoto')}
                  </Text>
                </TouchableOpacity>
              )}
            </Animated.View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Theme.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
  },
  dragHandle: {
    width: 77,
    height: 5,
    backgroundColor: Theme.textInactiveTab,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  optionIcon: {
    marginRight: 8,
  },
  modalOptionText: { ...typography.body, color: Theme.black, flex: 1 },
  avatarButton: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 46.5,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 46.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
