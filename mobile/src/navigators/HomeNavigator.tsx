import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { MaterialCommunityIcons as MaterialCommunityIcon } from "@expo/vector-icons";

import { TopBar } from "../components/top-bar/top-bar-feature";
import { HomeScreen } from "../screens/HomeScreen";
import { ArcadeScreen } from "../screens/ArcadeScreen";
import { FriendsScreen } from "../screens/FriendsScreen";
import { LibraryScreen } from "../screens/LibraryScreen";
import { SearchScreen } from "../screens/SearchScreen";
import { aura } from "../theme/tokens";

const Tab = createBottomTabNavigator();

function GlassTabBarBackground() {
  if (Platform.OS === "web") {
    return <View style={[StyleSheet.absoluteFill, styles.tabFallback]} />;
  }
  return (
    <BlurView
      intensity={80}
      tint="dark"
      style={[StyleSheet.absoluteFill, styles.tabBlur]}
    />
  );
}

const ICONS: Record<string, { focused: string; idle: string }> = {
  Home: { focused: "home", idle: "home-outline" },
  Arcade: { focused: "gamepad-variant", idle: "gamepad-variant-outline" },
  Friends: { focused: "account-group", idle: "account-group-outline" },
  Library: { focused: "view-grid", idle: "view-grid-outline" },
  Search: { focused: "magnify", idle: "magnify" },
};

export function HomeNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        header: () => <TopBar />,
        tabBarActiveTintColor: aura.purpleBright,
        tabBarInactiveTintColor: aura.textDim,
        tabBarStyle: styles.tabBar,
        tabBarBackground: () => <GlassTabBarBackground />,
        tabBarIcon: ({ focused, color, size }) => {
          const icons = ICONS[route.name] ?? ICONS.Home;
          return (
            <MaterialCommunityIcon
              name={(focused ? icons.focused : icons.idle) as any}
              size={size}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: "Home" }} />
      <Tab.Screen name="Arcade" component={ArcadeScreen} options={{ title: "Arcade" }} />
      <Tab.Screen name="Friends" component={FriendsScreen} options={{ title: "Friends" }} />
      <Tab.Screen name="Library" component={LibraryScreen} options={{ title: "Library" }} />
      <Tab.Screen name="Search" component={SearchScreen} options={{ title: "Search" }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: "absolute",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: aura.glassBorder,
    backgroundColor: "transparent",
    elevation: 0,
  },
  tabBlur: { backgroundColor: "rgba(12, 11, 20, 0.55)" },
  tabFallback: { backgroundColor: aura.glassStrong },
});
