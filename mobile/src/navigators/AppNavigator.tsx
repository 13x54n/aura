/**
 * Root stack: store shell tabs + Ludo / escrow flows.
 */
import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
  NavigationContainer,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { useColorScheme } from "react-native";
import * as Screens from "../screens";
import { HomeNavigator } from "./HomeNavigator";
import { StatusBar } from "expo-status-bar";
import {
  MD3DarkTheme,
  MD3LightTheme,
  adaptNavigationTheme,
} from "react-native-paper";

type RootStackParamList = {
  HomeStack: undefined;
  Settings: undefined;
  LudoHub: undefined;
  LudoCreateRoom: undefined;
  LudoJoinRoom: undefined;
  LudoRandomMatch: undefined;
  Escrow: { mode: "create" | "join" | "random"; roomCode: string };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

const Stack = createNativeStackNavigator();

const AppStack = () => {
  return (
    <Stack.Navigator initialRouteName="HomeStack">
      <Stack.Screen
        name="HomeStack"
        component={HomeNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Settings"
        component={Screens.SettingsScreen}
        options={{ title: "Settings" }}
      />
      <Stack.Screen
        name="LudoHub"
        component={Screens.LudoHubScreen}
        options={{ title: "Ludo" }}
      />
      <Stack.Screen
        name="LudoCreateRoom"
        component={Screens.CreateRoomScreen}
        options={{ title: "Create room" }}
      />
      <Stack.Screen
        name="LudoJoinRoom"
        component={Screens.JoinRoomScreen}
        options={{ title: "Join room" }}
      />
      <Stack.Screen
        name="LudoRandomMatch"
        component={Screens.RandomMatchScreen}
        options={{ title: "Random match" }}
      />
      <Stack.Screen
        name="Escrow"
        component={Screens.EscrowScreen}
        options={{ title: "Skill match escrow" }}
      />
    </Stack.Navigator>
  );
};

export interface NavigationProps
  extends Partial<React.ComponentProps<typeof NavigationContainer>> {}

export const AppNavigator = (props: NavigationProps) => {
  const colorScheme = useColorScheme();
  const { LightTheme, DarkTheme } = adaptNavigationTheme({
    reactNavigationLight: NavigationDefaultTheme,
    reactNavigationDark: NavigationDarkTheme,
  });

  const CombinedDefaultTheme = {
    ...MD3LightTheme,
    ...LightTheme,
    colors: {
      ...MD3LightTheme.colors,
      ...LightTheme.colors,
    },
  };
  const CombinedDarkTheme = {
    ...MD3DarkTheme,
    ...DarkTheme,
    colors: {
      ...MD3DarkTheme.colors,
      ...DarkTheme.colors,
    },
  };

  return (
    <NavigationContainer
      theme={colorScheme === "dark" ? CombinedDarkTheme : CombinedDefaultTheme}
      {...props}
    >
      <StatusBar />
      <AppStack />
    </NavigationContainer>
  );
};
