import React from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { aura } from "../theme/tokens";

const MAIN = ["Home", "Arcade", "Friends", "Library"] as const;
const ICONS: Record<string, { focused: string; idle: string }> = {
  Home: { focused: "home", idle: "home-outline" },
  Arcade: { focused: "gamepad-variant", idle: "gamepad-variant-outline" },
  Friends: { focused: "account-group", idle: "account-group-outline" },
  Library: { focused: "view-grid", idle: "view-grid-outline" },
  Search: { focused: "magnify", idle: "magnify" },
};

function GlassFill() {
  if (Platform.OS === "web") {
    return <View style={[StyleSheet.absoluteFill, styles.fallback]} />;
  }
  return (
    <BlurView intensity={75} tint="dark" style={[StyleSheet.absoluteFill, styles.blur]} />
  );
}

/** Arcade-style floating frosted capsule + round Search. */
export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;

  const go = (name: string) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return;
    const event = navigation.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    });
    if (!event.defaultPrevented) {
      navigation.navigate(name);
    }
  };

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]} pointerEvents="box-none">
      <View style={styles.row}>
        <View style={styles.capsule}>
          <GlassFill />
          {MAIN.map((name) => {
            const focused = current === name;
            const icons = ICONS[name];
            return (
              <Pressable
                key={name}
                onPress={() => go(name)}
                style={styles.tab}
                accessibilityRole="button"
                accessibilityState={{ selected: focused }}
              >
                <Icon
                  name={(focused ? icons.focused : icons.idle) as any}
                  size={22}
                  color={focused ? aura.purpleBright : aura.textDim}
                />
                <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
                  {name === "Friends" ? "Friends" : name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => go("Search")}
          style={[styles.searchBtn, current === "Search" && styles.searchActive]}
          accessibilityRole="button"
          accessibilityLabel="Search"
        >
          <GlassFill />
          <Icon
            name="magnify"
            size={22}
            color={current === "Search" ? aura.purpleBright : aura.text}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  capsule: {
    flex: 1,
    flexDirection: "row",
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: aura.glassBorder,
    paddingVertical: 8,
    paddingHorizontal: 4,
    minHeight: 58,
  },
  blur: { backgroundColor: "rgba(18, 14, 32, 0.55)" },
  fallback: { backgroundColor: aura.glassStrong },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  label: {
    fontSize: 10,
    color: aura.textDim,
    fontWeight: "600",
  },
  labelActive: { color: aura.purpleBright },
  searchBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: aura.glassBorder,
  },
  searchActive: {
    borderColor: aura.purpleBright,
  },
});
