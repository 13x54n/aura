import Constants, { ExecutionEnvironment } from "expo-constants";

/** True when running inside Expo Go (no custom native modules). */
export function isExpoGo(): boolean {
  return (
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    Constants.appOwnership === "expo"
  );
}
