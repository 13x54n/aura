// Polyfills
import "./src/polyfills";

import { useEffect } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ConnectionProvider } from "./src/utils/ConnectionProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme as NavigationDarkTheme } from "@react-navigation/native";
import { PaperProvider, adaptNavigationTheme } from "react-native-paper";
import { AppNavigator } from "./src/navigators/AppNavigator";
import { ClusterProvider } from "./src/components/cluster/cluster-data-access";
import { attachPhantomLinkListener } from "./src/utils/phantomDeeplink";
import { AuraPaperTheme } from "./src/theme/paperTheme";
import { aura } from "./src/theme/tokens";

const queryClient = new QueryClient();

export default function App() {
  useEffect(() => attachPhantomLinkListener(), []);
  const { DarkTheme } = adaptNavigationTheme({
    reactNavigationDark: NavigationDarkTheme,
  });

  const theme = {
    ...AuraPaperTheme,
    ...DarkTheme,
    colors: {
      ...AuraPaperTheme.colors,
      ...DarkTheme.colors,
      primary: aura.purple,
      background: aura.bg,
      card: aura.bgElevated,
      text: aura.text,
      border: aura.glassBorder,
    },
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ClusterProvider>
        <ConnectionProvider config={{ commitment: "processed" }}>
          <SafeAreaView style={[styles.shell, { backgroundColor: aura.bg }]}>
            <PaperProvider theme={theme}>
              <AppNavigator />
            </PaperProvider>
          </SafeAreaView>
        </ConnectionProvider>
      </ClusterProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
});
