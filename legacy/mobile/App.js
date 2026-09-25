import React from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { AppProvider } from './src/context/AppContext';
import { colors } from './src/theme/colors';

import {
  SplashScreen,
  LanguageScreen,
  RoleSelectScreen,
  RegisterScreen,
  OtpScreen,
  SuccessBonusScreen
} from './src/screens/OnboardingScreens';

import {
  HomeScreen,
  ProfileScreen
} from './src/screens/MarketplaceScreens';

const Stack = createStackNavigator();

export default function App() {
  return (
    <AppProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
        <NavigationContainer>
          <Stack.Navigator initialRouteName="Splash" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Splash" component={SplashScreen} />
            <Stack.Screen name="Language" component={LanguageScreen} />
            <Stack.Screen name="RoleSelect" component={RoleSelectScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="Otp" component={OtpScreen} />
            <Stack.Screen name="SuccessBonus" component={SuccessBonusScreen} />
            <Stack.Screen name="MainApp" component={HomeScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaView>
    </AppProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primaryDark }
});
