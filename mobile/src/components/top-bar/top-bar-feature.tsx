import { StyleSheet } from "react-native";
import { Appbar } from "react-native-paper";
import { TopBarWalletMenu } from "./top-bar-ui";
import { useNavigation } from "@react-navigation/core";

export function TopBar() {
  const navigation = useNavigation();

  return (
    <Appbar.Header mode="small" style={styles.topBar}>
      <Appbar.Content title="Playseek" titleStyle={styles.title} />
      <TopBarWalletMenu />
      <Appbar.Action
        icon="cog"
        mode="contained-tonal"
        onPress={() => {
          navigation.navigate("Settings" as never);
        }}
      />
    </Appbar.Header>
  );
}

const styles = StyleSheet.create({
  topBar: {
    justifyContent: "flex-end",
    alignItems: "center",
  },
  title: {
    fontWeight: "800",
  },
});
