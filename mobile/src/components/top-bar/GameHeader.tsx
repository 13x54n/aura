import React, { useMemo } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "react-native-paper";
import { StatusBar } from "expo-status-bar";
import { MaterialCommunityIcons as Icon } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { AURA_GAMES } from "../../data/catalog";

export type GameHeaderProps = {
  title?: string;
  gameId?: string;
  onClose?: () => void;
};

export function GameHeader({ title, gameId, onClose }: GameHeaderProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const game = useMemo(
    () => (gameId ? AURA_GAMES.find((g) => g.id === gameId) : undefined),
    [gameId]
  );

  const displayTitle = title ?? game?.title ?? "Game";
  const logoSource = game?.icon ?? require("../../../assets/icon.png");

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      navigation?.goBack?.();
    }
  };

  return (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <View style={styles.headerBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={handleClose}
          style={styles.closeBtn}
          hitSlop={8}
        >
          <Icon name="close" size={20} color="#FFFFFF" />
        </Pressable>

        <View style={styles.headerCenter}>
          {logoSource ? (
            <Image
              source={logoSource}
              style={styles.headerLogo}
              resizeMode="cover"
            />
          ) : null}
          <Text style={styles.headerTitle} numberOfLines={1}>
            {displayTitle}
          </Text>
        </View>

        <View style={styles.headerRightSpacer} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: "#000000",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    zIndex: 10,
  },
  headerBar: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  headerLogo: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: "#111111",
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  headerRightSpacer: {
    width: 34,
  },
});

