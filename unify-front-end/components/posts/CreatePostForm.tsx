import { typography } from '@/constants/Typography';
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  Image,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import KeyboardAvoidingView from '@/components/common/KeyboardAvoidingView';
import { useMutateCreatePost } from '@/hooks/posts/useCreatePost';
import GroupSelectionSheet from './GroupSelectionSheet';
import DestinationToggle from './DestinationToggle';
import { Theme } from '@/constants/Theme';
import BackHeader from '@/components/BackHeader';
import { useToast } from '@/context/ToastContext';
import { Group } from '@/types/groups';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { uploadPostImage } from '@/services/s3/uploadPostImage';
import { Feather } from '@expo/vector-icons';
import { isContentAllowed } from '@/utils/contentFilter';
import { useAnalytics } from '@/utils/analytics';

type DestinationType = '4u' | 'group';

interface CreatePostFormProps {
  preselectedGroup?: Group | null;
  onCancel: () => void;
  onSuccessNavigate: (payload: {
    postedToGroup: boolean;
    group?: Group | null;
  }) => void;
}

const TITLE_MAX_LENGTH = 100;
const CONTENT_MAX_LENGTH = 2000;

interface ToolbarButtonProps {
  icon: string;
  isActive?: boolean;
  isBlocked?: boolean;
  onPress: () => void;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  icon,
  isActive,
  isBlocked,
  onPress,
}) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={isBlocked}
    style={[
      styles.toolbarButton,
      isActive && styles.toolbarButtonActive,
      isBlocked && styles.toolbarButtonBlocked,
    ]}
  >
    <Text
      style={[
        styles.toolbarButtonText,
        isActive && styles.toolbarButtonTextActive,
        isBlocked && styles.toolbarButtonTextBlocked,
      ]}
    >
      {icon}
    </Text>
  </TouchableOpacity>
);

export default function CreatePostForm({
  preselectedGroup,
  onCancel,
  onSuccessNavigate,
}: Readonly<CreatePostFormProps>) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [destination, setDestination] = useState<DestinationType>('4u');
  const [showGroupSelector, setShowGroupSelector] = useState(false);
  const [isEditorFocused, setIsEditorFocused] = useState(false);

  // Image state
  const [images, setImages] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);

  const contentInputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();

  const { showToast } = useToast();
  const { trackPostCreated, trackPostFailed } = useAnalytics();
  const createPostMutation = useMutateCreatePost();

  const trimmedTitle = title.trim();
  const trimmedContent = content.trim();

  useEffect(() => {
    if (preselectedGroup) {
      setSelectedGroup(preselectedGroup);
      setDestination('group');
    } else {
      setSelectedGroup(null);
      setDestination('4u');
    }
  }, [preselectedGroup]);

  const resetForm = () => {
    setTitle('');
    setContent('');
    setSelectedGroup(null);
    setDestination('4u');
    setShowGroupSelector(false);
    setImages([]);
  };

  const handleSubmit = async () => {
    if (!trimmedTitle || !trimmedContent) {
      Alert.alert(t('common.error'), t('posts.fillTitleContent'));
      return;
    }
    if (destination === 'group' && !selectedGroup) {
      Alert.alert(t('common.error'), t('posts.selectGroupToPost'));
      return;
    }

    // Check content against banned words filter
    const titleCheck = isContentAllowed(trimmedTitle);
    if (!titleCheck.allowed && titleCheck.reasonKey) {
      Alert.alert(t('posts.contentNotAllowed'), t(titleCheck.reasonKey));
      return;
    }
    const contentCheck = isContentAllowed(trimmedContent);
    if (!contentCheck.allowed && contentCheck.reasonKey) {
      Alert.alert(t('posts.contentNotAllowed'), t(contentCheck.reasonKey));
      return;
    }

    let post_image_urls: string[] = [];

    if (images.length > 0) {
      setIsUploadingImages(true);
      try {
        const results = await Promise.all(
          images.map(img => uploadPostImage(img))
        );
        post_image_urls = results
          .filter(r => r.success && r.key)
          .map(r => r.key!);
        if (post_image_urls.length !== images.length) {
          Alert.alert(t('posts.warning'), t('posts.imageUploadPartial'));
        }
      } catch (e) {
        Alert.alert(t('common.error'), t('posts.imageUploadFailed'));
        setIsUploadingImages(false);
        return;
      } finally {
        setIsUploadingImages(false);
      }
    }

    createPostMutation.mutate(
      {
        title: trimmedTitle,
        content: trimmedContent,
        group_id: destination === '4u' ? null : String(selectedGroup?.id),
        post_image_urls,
      },
      {
        onSuccess: async (data: any) => {
          trackPostCreated(data?.id ? String(data.id) : undefined);
          const postedToGroup = destination === 'group' && selectedGroup;
          const toastMessage = postedToGroup
            ? t('posts.postedTo', { name: selectedGroup.name })
            : t('posts.postedToForYou');
          const groupToNavigate = selectedGroup;
          resetForm();
          showToast(toastMessage);
          onSuccessNavigate({
            postedToGroup: Boolean(postedToGroup),
            group: groupToNavigate,
          });
        },
        onError: (err: any) => {
          trackPostFailed({
            surface: 'create',
            reason: err?.message,
            ...(destination === 'group' &&
              selectedGroup && { group_id: String(selectedGroup.id) }),
          });
          Alert.alert(t('common.error'), t('posts.createPostFailed'));
        },
      }
    );
  };

  const handleCancel = () => {
    resetForm();
    onCancel();
  };

  const handleGroupSelect = (group: Group) => {
    setSelectedGroup(group);
    setDestination('group');
    setShowGroupSelector(false);
  };

  const handleDestinationChange = (newDestination: DestinationType) => {
    setDestination(newDestination);
    if (newDestination === '4u') {
      setSelectedGroup(null);
    } else {
      setShowGroupSelector(true);
    }
  };

  const handleClearGroup = () => {
    setSelectedGroup(null);
    setDestination('4u');
  };

  const handleCameraPress = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status === 'denied') {
        Alert.alert(
          t('posts.cameraAccessDeniedTitle'),
          t('posts.cameraAccessDeniedMessage'),
          [{ text: t('common.ok') }]
        );
        return;
      }
      if (status !== 'granted') return;

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (!result.canceled) {
        setImages(prev => [...prev, ...result.assets].slice(0, 10));
      }
    } catch (error) {
      Alert.alert(t('common.error'), t('posts.cameraError'));
    }
  };

  const handleGalleryPick = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status === 'denied') {
        Alert.alert(
          t('posts.galleryAccessDeniedTitle'),
          t('posts.galleryAccessDeniedMessage'),
          [{ text: t('common.ok') }]
        );
        return;
      }
      if (status !== 'granted') return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.8,
        selectionLimit: 10 - images.length,
      });
      if (!result.canceled) {
        setImages(prev => [...prev, ...result.assets].slice(0, 10));
      }
    } catch (error) {
      Alert.alert(t('common.error'), t('posts.galleryError'));
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const isPending = createPostMutation.isPending || isUploadingImages;

  return (
    <KeyboardAvoidingView style={styles.root}>
      <BackHeader
        title=''
        backIcon='x'
        onBack={handleCancel}
        rightButton={
          <TouchableOpacity
            onPress={handleSubmit}
            style={[
              styles.postButton,
              (!trimmedTitle || !trimmedContent) && styles.disabledButton,
            ]}
            disabled={!trimmedTitle || !trimmedContent || isPending}
          >
            {isPending ? (
              <ActivityIndicator size='small' color='white' />
            ) : (
              <Text style={styles.postButtonText}>{t('posts.postButton')}</Text>
            )}
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={styles.container}
        keyboardShouldPersistTaps='handled'
        contentContainerStyle={styles.scrollContent}
      >
        <DestinationToggle
          destination={destination}
          selectedGroup={selectedGroup}
          onDestinationChange={handleDestinationChange}
          onClearGroup={handleClearGroup}
        />

        <View style={styles.titleContainer}>
          <TextInput
            style={styles.titleInput}
            placeholder={t('posts.titlePlaceholder')}
            placeholderTextColor={Theme.textAlternateGray}
            value={title}
            onChangeText={setTitle}
            multiline
            maxLength={TITLE_MAX_LENGTH}
          />
          <Text
            style={[
              styles.charCount,
              title.length > TITLE_MAX_LENGTH * 0.9 && styles.charCountWarning,
            ]}
          >
            {title.length}/{TITLE_MAX_LENGTH}
          </Text>
        </View>

        <View style={styles.separator} />

        {/* Image carousel — shown between title and content when images are selected */}
        {images.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.imageCarousel}
            contentContainerStyle={styles.imageCarouselContent}
            keyboardShouldPersistTaps='handled'
          >
            {images.map((img, index) => (
              <View key={index} style={styles.imageThumbnailContainer}>
                <Image
                  source={{ uri: img.uri }}
                  style={styles.imageThumbnail}
                />
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => handleRemoveImage(index)}
                >
                  <Feather name='x' size={12} color='white' />
                </TouchableOpacity>
              </View>
            ))}
            {images.length < 10 && (
              <TouchableOpacity
                style={styles.addMoreImagesButton}
                onPress={handleCameraPress}
              >
                <Feather name='plus' size={20} color={Theme.surfaceGray} />
              </TouchableOpacity>
            )}
          </ScrollView>
        )}

        <View
          style={[
            styles.contentContainer,
            images.length > 0 && styles.contentContainerWithImages,
          ]}
        >
          <TextInput
            ref={contentInputRef}
            style={[
              styles.contentInput,
              images.length > 0 && styles.contentInputWithImages,
            ]}
            placeholder={t('posts.contentPlaceholder')}
            placeholderTextColor={Theme.textAlternateGray}
            value={content}
            onChangeText={setContent}
            multiline
            maxLength={CONTENT_MAX_LENGTH}
            onFocus={() => setIsEditorFocused(true)}
            onBlur={() => setTimeout(() => setIsEditorFocused(false), 150)}
          />
          <Text
            style={[
              styles.charCount,
              content.length > CONTENT_MAX_LENGTH * 0.9 &&
                styles.charCountWarning,
            ]}
          >
            {content.length}/{CONTENT_MAX_LENGTH}
          </Text>
        </View>
      </ScrollView>

      {/* Toolbar sticks above keyboard — image pick only (rich text removed for Android build path limit) */}
      {isEditorFocused && (
        <View style={[styles.toolbar, { paddingBottom: insets.bottom || 8 }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.toolbarContent}
            keyboardShouldPersistTaps='handled'
          >
            <ToolbarButton
              icon='📷'
              isActive={images.length > 0}
              isBlocked={images.length >= 10}
              onPress={handleCameraPress}
            />
            <ToolbarButton
              icon='🖼️'
              isBlocked={images.length >= 10}
              onPress={handleGalleryPick}
            />
          </ScrollView>
        </View>
      )}

      <GroupSelectionSheet
        visible={showGroupSelector}
        onClose={() => setShowGroupSelector(false)}
        onGroupSelect={handleGroupSelect}
        useModal={Platform.OS !== 'ios'}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  postButton: {
    backgroundColor: Theme.primaryGatherRed,
    paddingVertical: 9,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  disabledButton: {
    backgroundColor: Theme.disabledGatherRed,
  },
  postButtonText: { ...typography.button, color: 'white' },
  titleContainer: {
    marginTop: 8,
  },
  titleInput: {
    ...typography.title,
    color: Theme.black,
    paddingTop: 24,
    paddingBottom: 4,
  },
  separator: {
    height: 1,
    backgroundColor: Theme.surfaceGray,
    marginVertical: 16,
  },
  toolbar: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: Theme.surfaceGray,
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  toolbarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  toolbarButton: {
    width: 40,
    height: 36,
    borderRadius: 8,
    backgroundColor: Theme.surfaceGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarButtonActive: {
    backgroundColor: Theme.primaryGatherRed,
  },
  toolbarButtonBlocked: {
    opacity: 0.3,
  },
  toolbarButtonText: { ...typography.button, color: Theme.black },
  toolbarButtonTextActive: {
    color: 'white',
  },
  toolbarButtonTextBlocked: {
    color: Theme.textAlternateGray,
  },
  toolbarDivider: {
    width: 1,
    height: 24,
    backgroundColor: Theme.surfaceGray,
    marginHorizontal: 8,
  },
  imageCarousel: {
    height: 130,
    marginBottom: 12,
    marginTop: 4,
  },
  imageCarouselContent: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 2,
  },
  imageThumbnailContainer: {
    width: 100,
    height: 120,
    borderRadius: 8,
    overflow: 'hidden',
  },
  imageThumbnail: {
    width: '100%',
    height: '100%',
  },
  removeImageButton: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMoreImagesButton: {
    width: 100,
    height: 120,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Theme.surfaceGray,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentContainer: {
    minHeight: 150,
  },
  contentContainerWithImages: {
    minHeight: 80,
  },
  contentInput: {
    ...typography.body,
    color: Theme.black,
    paddingTop: 8,
    paddingBottom: 4,
    minHeight: 150,
  },
  contentInputWithImages: {
    minHeight: 60,
  },
  charCount: {
    ...typography.caption,
    color: Theme.textAlternateGray,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 8,
  },
  charCountWarning: {
    color: Theme.primaryGatherRed,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: { ...typography.cardTitle, color: Theme.black, marginBottom: 20 },
  modalLabel: {
    ...typography.caption,
    color: Theme.textAlternateGray,
    marginBottom: 6,
    fontWeight: '500',
  },
  modalInput: {
    ...typography.body,
    borderWidth: 1,
    borderColor: Theme.surfaceGray,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Theme.black,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.surfaceGray,
    alignItems: 'center',
  },
  modalCancelText: {
    ...typography.secondary,
    color: Theme.textAlternateGray,
    fontWeight: '500',
  },
  modalInsertButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Theme.primaryGatherRed,
    alignItems: 'center',
  },
  modalInsertText: {
    ...typography.secondary,
    color: '#fff',
    fontWeight: '500',
  },
});
