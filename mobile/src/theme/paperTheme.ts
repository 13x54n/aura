import { MD3DarkTheme } from "react-native-paper";
import { aura } from "./tokens";

export const AuraPaperTheme = {
  ...MD3DarkTheme,
  dark: true,
  colors: {
    ...MD3DarkTheme.colors,
    primary: aura.purple,
    secondary: aura.purpleBright,
    background: aura.bg,
    surface: aura.bgElevated,
    surfaceVariant: aura.glassStrong,
    onPrimary: "#fff",
    onBackground: aura.text,
    onSurface: aura.text,
    outline: aura.glassBorder,
  },
};
