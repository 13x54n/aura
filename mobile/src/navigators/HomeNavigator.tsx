import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import React from "react";
import { TopBar } from "../components/top-bar/top-bar-feature";
import { HomeScreen } from "../screens/HomeScreen";
import { ComingSoonScreen } from "../screens/ComingSoonScreen";
import MaterialCommunityIcon from "@expo/vector-icons/MaterialCommunityIcons";

const Tab = createBottomTabNavigator();

/** Store shell tabs: Home (shelf) + Coming soon placeholder. */
export function HomeNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        header: () => <TopBar />,
        tabBarIcon: ({ focused, color, size }) => {
          switch (route.name) {
            case "Home":
              return (
                <MaterialCommunityIcon
                  name={focused ? "home" : "home-outline"}
                  size={size}
                  color={color}
                />
              );
            case "ComingSoon":
              return (
                <MaterialCommunityIcon
                  name={focused ? "clock" : "clock-outline"}
                  size={size}
                  color={color}
                />
              );
          }
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: "Playseek" }}
      />
      <Tab.Screen
        name="ComingSoon"
        component={ComingSoonScreen}
        options={{ title: "Coming soon" }}
      />
    </Tab.Navigator>
  );
}
