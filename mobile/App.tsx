// Polyfills
import "./src/polyfills";

// Initialize game registry (register all games)
import "./src/data/games";

import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ConnectionProvider } from "./src/utils/ConnectionProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme as NavigationDarkTheme } from "@react-navigation/native";
import { PaperProvider, adaptNavigationTheme } from "react-native-paper";
import { AppNavigator } from "./src/navigators/AppNavigator";
import { ClusterProvider } from "./src/components/cluster/cluster-data-access";
import { attachPhantomLinkListener } from "./src/utils/phantomDeeplink";
import { AuraPaperTheme } from "./src/theme/paperTheme";
import { aura } from "./src/theme/tokens";

// Devnet RPC is rate-limited: no focus refetch, short cache, one quiet retry.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
});

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
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ClusterProvider>
          <ConnectionProvider config={CONNECTION_CONFIG}>
            <View style={[styles.shell, { backgroundColor: aura.bg }]}>
              <PaperProvider theme={theme}>
                <AppNavigator />
              </PaperProvider>
            </View>
          </ConnectionProvider>
        </ClusterProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/** Stable object: a new one per render rebuilt the Connection and refetched balances (429s). */
const CONNECTION_CONFIG = { commitment: "processed" as const, disableRetryOnRateLimit: true };

const styles = StyleSheet.create({
  shell: { flex: 1 },
});
