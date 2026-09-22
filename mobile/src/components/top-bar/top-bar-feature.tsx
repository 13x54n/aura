import { Platform, StyleSheet, View } from "react-native";
import { Appbar } from "react-native-paper";
import { BlurView } from "expo-blur";
import { TopBarWalletMenu } from "./top-bar-ui";
import { useNavigation } from "@react-navigation/core";

export function TopBar() {
  const navigation = useNavigation();

  return (
    <View style={styles.wrap}>
      {Platform.OS !== "web" ? (
        <BlurView intensity={65} tint="dark" style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.fallback]} />
      )}
      <Appbar.Header mode="small" style={styles.topBar} statusBarHeight={0}>
        <Appbar.Content title="Aura" titleStyle={styles.title} />
        <TopBarWalletMenu />
        <Appbar.Action
          icon="cog"
          onPress={() => {
            navigation.navigate("Settings" as never);
          }}
          color="#fff"
        />
      </Appbar.Header>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(11, 16, 32, 0.45)",
  },
  topBar: {
    backgroundColor: "transparent",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  title: {
    fontWeight: "800",
    color: "#fff",
  },
  fallback: {
    backgroundColor: "rgba(11, 16, 32, 0.92)",
  },
});
