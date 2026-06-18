import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.simonpetersson.axelsyatzy',
  appName: 'Mr.B Yatzy',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    scrollEnabled: true,
  },
};

export default config;
