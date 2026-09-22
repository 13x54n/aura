import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import React from "react";

import { TopBar } from "../components/top-bar/top-bar-feature";
import { HomeScreen } from "../screens/HomeScreen";
import { ArcadeScreen } from "../screens/ArcadeScreen";
import { FriendsScreen } from "../screens/FriendsScreen";
import { LibraryScreen } from "../screens/LibraryScreen";
import { SearchScreen } from "../screens/SearchScreen";
import { FloatingTabBar } from "./FloatingTabBar";

const Tab = createBottomTabNavigator();

/** Tabs: Home · Arcade · Friends · Library · Search (floating glass capsule). */
export function HomeNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        header: () => <TopBar />,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: "Home" }} />
      <Tab.Screen name="Arcade" component={ArcadeScreen} options={{ title: "Arcade" }} />
      <Tab.Screen name="Friends" component={FriendsScreen} options={{ title: "Friends" }} />
      <Tab.Screen name="Library" component={LibraryScreen} options={{ title: "Library" }} />
      <Tab.Screen name="Search" component={SearchScreen} options={{ title: "Search" }} />
    </Tab.Navigator>
  );
}
