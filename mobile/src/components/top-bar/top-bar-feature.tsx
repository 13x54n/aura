import { Platform, StyleSheet, View } from "react-native";
import { Appbar } from "react-native-paper";
import { BlurView } from "expo-blur";
import { TopBarWalletMenu } from "./top-bar-ui";
import { useNavigation } from "@react-navigation/core";
import { aura } from "../../theme/tokens";

export function TopBar() {
  const navigation = useNavigation();

  return (
    <View style={styles.wrap}>
      {Platform.OS !== "web" ? (
        <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.fallback]} />
      )}
      <Appbar.Header mode="small" style={styles.topBar} statusBarHeight={0}>
        <Appbar.Content title="Aura" titleStyle={styles.title} />
        <TopBarWalletMenu />
        <Appbar.Action
          icon="cog"
          onPress={() => navigation.navigate("Settings" as never)}
          color={aura.text}
        />
      </Appbar.Header>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: aura.glassBorder,
    backgroundColor: "rgba(12, 11, 20, 0.4)",
  },
  topBar: {
    backgroundColor: "transparent",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  title: { fontWeight: "800", color: aura.text },
  fallback: { backgroundColor: aura.glassStrong },
});
