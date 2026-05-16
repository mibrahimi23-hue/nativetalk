import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import 'react-native-reanimated';

import { UserProvider } from '@/contexts/user-context';
import { ThemeProvider as AppThemeProvider, useTheme } from '@/contexts/theme-context';

export const unstable_settings = {
  anchor: '(tabs)',
};

const baseTextStyle = { fontFamily: 'Outfit', color: '#28221B' };

// Monkey-patch the default text & input to use the Outfit font everywhere.
// We patch both `defaultProps` (older RN) and `render` (forwardRef-based RN)
// so the override survives across versions.
applyDefaultStyle(Text);
applyDefaultStyle(TextInput);

function applyDefaultStyle(Component: any) {
  if (!Component) return;
  if (Component.__nativetalkPatched) return;
  Component.__nativetalkPatched = true;

  if (Component.defaultProps) {
    Component.defaultProps.style = [baseTextStyle, Component.defaultProps.style];
  } else {
    Component.defaultProps = { style: baseTextStyle };
  }

  const oldRender = Component.render;
  if (typeof oldRender === 'function') {
    Component.render = function (...args: any[]) {
      const result = oldRender.apply(this, args);
      if (!result) return result;
      return React.cloneElement(result, {
        style: [baseTextStyle, result.props.style],
      });
    };
  }
}

function NavigationShell() {
  // Reads the app-level theme so React Navigation's chrome (navigation bar
  // color, drawers, etc.) follows the user's dark-mode toggle in Settings.
  const { darkMode } = useTheme();
  return (
    <NavThemeProvider value={darkMode ? DarkTheme : DefaultTheme}>
      {/*
        Hide the default route-name header on every screen — each screen
        renders its own custom orange/cream header that matches the
        wireframe. The "modal" route is the only one that still wants the
        built-in header bar.
      */}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal', headerShown: true }} />
      </Stack>
      <StatusBar style={darkMode ? 'light' : 'dark'} />
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  // Load the bundled fonts in the background but DO NOT block the whole app
  // on them. The previous version returned a spinner while `fontsLoaded`
  // was false — when the font asset failed to load or stayed pending on the
  // very first request, the spinner would stick forever and users saw a
  // blank cream screen on every route. The app uses system fonts as a safe
  // fallback (the Text monkey-patch applies "Outfit" as a font family hint
  // which silently degrades to the system sans-serif when the .ttf isn't
  // resolved yet).
  useFonts({
    Domine: require('../assets/fonts/Domine-Regular.ttf'),
    Outfit: require('../assets/fonts/Outfit-Regular.ttf'),
    Epilogue: require('../assets/fonts/Epilogue-Regular.ttf'),
  });

  return (
    <AppThemeProvider>
      <UserProvider>
        <NavigationShell />
      </UserProvider>
    </AppThemeProvider>
  );
}
