import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRoute } from "@react-navigation/native";
import { TopBarWalletMenu } from "./top-bar-ui";
import { aura } from "../../theme/tokens";

const TITLES: Record<string, string> = {
  Home: "Home",
  Arcade: "Arcade",
  Friends: "Friends",
  Library: "Library",
  Search: "Search",
};

/** Thin row under the notch: tab title left, Connect/profile right. */
export function TopBar() {
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const title = TITLES[route.name] ?? "Aura";

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]} pointerEvents="box-none">
      <View style={styles.row}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <TopBarWalletMenu />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "transparent",
    zIndex: 20,
  },
  row: {
    height: 44,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: aura.text,
    fontWeight: "800",
    fontSize: 28,
  },
});
