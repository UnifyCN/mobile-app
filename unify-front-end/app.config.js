const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

module.exports = {
  expo: {
    name: 'Unify',
    slug: 'unify-front-end',
    owner: 'unifysocial',
    version: '1.6.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'myapp',
    userInterfaceStyle: 'automatic',
    runtimeVersion: 'exposdk:55.0.0',
    updates: {
      url: 'https://u.expo.dev/3772d4d9-79dd-4848-9691-bae1b19eefb8',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.anonymous.unifyfrontend',
      googleServicesFile: './GoogleService_ios.plist',
      infoPlist: {
        NSCameraUsageDescription:
          'Unify needs camera access to let you take a photo for your post.',
        NSPhotoLibraryUsageDescription:
          'Unify needs access to your photo library to attach an existing photo to your post.',
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      permissions: ['CAMERA', 'READ_MEDIA_IMAGES', 'READ_EXTERNAL_STORAGE'],
      // expo-image-picker adds RECORD_AUDIO (video capture) and
      // expo-tracking-transparency adds AD_ID. Unify uses neither on Android,
      // and each one triggers an extra Play Console declaration.
      blockedPermissions: [
        'android.permission.RECORD_AUDIO',
        'com.google.android.gms.permission.AD_ID',
      ],
      package: 'com.anonymous.unifyfrontend',
      // Firebase (FCM) config for expo-notifications. Not committed: EAS supplies
      // it through the GOOGLE_SERVICES_JSON file env var; locally it is the
      // gitignored ./google-services.json.
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
      softwareKeyboardLayoutMode: 'resize',
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-font',
      'expo-image',
      'expo-apple-authentication',
      [
        'expo-image-picker',
        {
          photosPermission:
            'Unify needs access to your photo library to attach an existing photo to your post.',
          cameraPermission:
            'Unify needs camera access to let you take a photo for your post.',
        },
      ],
      'expo-localization',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#ffffff',
          image: './assets/images/splash-icon-light.png',
          dark: {
            image: './assets/images/splash-icon-dark.png',
            backgroundColor: '#000000',
          },
          imageWidth: 200,
        },
      ],
      [
        'expo-notifications',
        {
          color: '#ff9d40',
          defaultChannel: 'social',
        },
      ],
      '@react-native-google-signin/google-signin',
      'expo-secure-store',
      'expo-tracking-transparency',
      'expo-web-browser',
      [
        'expo-build-properties',
        {
          ios: {
            // GoogleSignIn pulls AppCheckCore, a Swift pod, which depends on
            // GoogleUtilities and RecaptchaInterop. Those two are non-modular
            // Objective-C, so CocoaPods refuses to integrate AppCheckCore as a
            // static library. The google-signin plugin only enables modular
            // headers for GoogleSignIn itself, not for its transitive deps.
            //
            // ios/ is gitignored, so there is no committed Podfile.lock and
            // every build re-resolves pods. That is why this appeared without
            // a matching change on our side.
            extraPods: [
              { name: 'GoogleUtilities', modular_headers: true },
              { name: 'RecaptchaInterop', modular_headers: true },
            ],
          },
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      router: {
        origin: false,
      },
      eas: {
        projectId: '3772d4d9-79dd-4848-9691-bae1b19eefb8',
      },
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
    },
  },
};
