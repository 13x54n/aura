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
import { WebGameScreen } from "../runtime/WebGameScreen";
import { HomeNavigator } from "./HomeNavigator";
import { StatusBar } from "expo-status-bar";
import {
  MD3DarkTheme,
  MD3LightTheme,
  adaptNavigationTheme,
} from "react-native-paper";

type RootStackParamList = {
  HomeStack: undefined | { screen: "Home" | "Arcade" | "Friends" | "Wallet" | "Search" };
  Settings: undefined;
  LudoHub: undefined;
  LudoCreateRoom: undefined;
  LudoJoinRoom: undefined;
  LudoRandomMatch: undefined;
  LudoLobby: { mode: "create" | "join" | "random"; roomCode: string; players: number; stake: number; visibility?: string };
  LudoResult: { mode?: "create" | "join" | "random"; won: boolean; winnerName?: string; roomCode?: string; stake?: number; players?: number; standings?: string[] };
  ChessHub: undefined;
  SnakesHub: undefined;
  WebGame: {
    gameId: string;
    title: string;
    matchId?: string;
    roomCode?: string;
    mode?: "create" | "join" | "random";
    stake?: string;
    players?: number;
    escrowLocked?: boolean;
  };
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
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="LudoCreateRoom"
        component={Screens.CreateRoomScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="LudoJoinRoom"
        component={Screens.JoinRoomScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="LudoRandomMatch"
        component={Screens.RandomMatchScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="LudoLobby"
        component={Screens.LudoLobbyScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="LudoResult"
        component={Screens.LudoResultScreen}
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="ChessHub"
        component={Screens.ChessHubScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SnakesHub"
        component={Screens.SnakesHubScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="WebGame"
        component={WebGameScreen}
        options={{
          headerShown: false,
          animation: "fade",
          // Android back (button + edge swipe) is handled in WebGameScreen so a live
          // room board always asks "Leave match?" before forfeiting.
          gestureEnabled: false,
        }}
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
