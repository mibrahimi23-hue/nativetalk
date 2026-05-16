import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform, useColorScheme as useSystemColorScheme } from "react-native";

const STORAGE_KEY = "nativetalk:dark_mode";
const STYLE_TAG_ID = "nativetalk-dark-mode-overrides";

// Maps every cream shade used across the StyleSheets to a dark equivalent.
// React Native Web flattens StyleSheet entries to inline `style="...rgb()..."`
// declarations, so we target them with attribute selectors with `!important`.
//
// Important: we only override *backgrounds* and *borders* here — never the
// `color` property. Ionicons on web render the glyph as a Text node and its
// glyph color is set the same way body text is, so catching it with an
// attribute selector would break the icons. Components that want dark-aware
// text colors opt in via `useThemeColors()`.
const DARK_OVERRIDES_CSS = `
  /* ── Page chrome ─────────────────────────────────────────────────────── */
  body,
  html,
  #root,
  #__next {
    background-color: #1B1714 !important;
    color-scheme: dark;
  }

  /* ── Backgrounds ─────────────────────────────────────────────────────── */
  [style*="background-color: rgb(255, 251, 250)"],
  [style*="background-color:#FFFBFA"],
  [style*="background-color: #FFFBFA"] {
    background-color: #1B1714 !important;
  }
  [style*="background-color: rgb(255, 255, 255)"],
  [style*="background-color:#FFFFFF"],
  [style*="background-color: #FFFFFF"] {
    background-color: #26201C !important;
  }
  [style*="background-color: rgb(241, 229, 225)"],
  [style*="background-color:#F1E5E1"] {
    background-color: #332B26 !important;
  }
  [style*="background-color: rgb(243, 237, 234)"],
  [style*="background-color:#F3EDEA"] {
    background-color: #332B26 !important;
  }
  [style*="background-color: rgb(255, 241, 232)"],
  [style*="background-color:#FFF1E8"] {
    background-color: #3A2E26 !important;
  }
  /* Bottom nav (#FDF0EC) is intentionally NOT recoloured so its icons stay
     legible in both modes — recolouring it dark while the icons remain
     brown made the inactive tabs almost invisible against the new dark
     surface. Leaving it cream keeps the wireframe look. */
  [style*="background-color: rgb(248, 239, 236)"],
  [style*="background-color:#F8EFEC"] {
    background-color: #2B2420 !important;
  }
  [style*="background-color: rgb(232, 212, 207)"],
  [style*="background-color:#E8D4CF"],
  [style*="background-color: rgb(231, 212, 207)"],
  [style*="background-color:#E7D4CF"] {
    background-color: #3A322D !important;
  }

  /* ── Borders — soften light tan dividers in dark mode ────────────────── */
  [style*="border-color: rgb(239, 230, 225)"],
  [style*="border-color:#EFE6E1"] {
    border-color: #332B26 !important;
  }
  [style*="border-color: rgb(240, 237, 234)"],
  [style*="border-color:#F0EDEA"] {
    border-color: #332B26 !important;
  }
  [style*="border-bottom-color: rgb(240, 237, 234)"],
  [style*="border-bottom-color:#F0EDEA"] {
    border-bottom-color: #332B26 !important;
  }
  [style*="border-bottom-color: rgb(238, 238, 238)"],
  [style*="border-bottom-color:#eee"] {
    border-bottom-color: #332B26 !important;
  }
  [style*="border-top-color: rgb(239, 230, 225)"],
  [style*="border-top-color:#EFE6E1"] {
    border-top-color: #332B26 !important;
  }

  /* Placeholder text in inputs */
  input::placeholder,
  textarea::placeholder {
    color: #8E7E73 !important;
  }
`;

const ThemeContext = createContext({
  darkMode: false,
  followSystem: true,
  setDarkMode: () => {},
  toggleDarkMode: () => {},
  followSystemPreference: () => {},
});

function readPersistedPreference() {
  if (Platform.OS !== "web") return null;
  try {
    // eslint-disable-next-line no-undef
    const raw = window?.localStorage?.getItem(STORAGE_KEY);
    if (raw === "dark") return true;
    if (raw === "light") return false;
    return null;
  } catch {
    return null;
  }
}

function writePersistedPreference(value) {
  if (Platform.OS !== "web") return;
  try {
    // eslint-disable-next-line no-undef
    if (value === null) window?.localStorage?.removeItem(STORAGE_KEY);
    // eslint-disable-next-line no-undef
    else window?.localStorage?.setItem(STORAGE_KEY, value ? "dark" : "light");
  } catch {
    /* ignore */
  }
}

export function ThemeProvider({ children }) {
  const systemScheme = useSystemColorScheme();

  // explicit user choice. `null` means "follow the OS / browser preference".
  const [explicit, setExplicit] = useState(() => readPersistedPreference());

  // hydrate explicit pref from localStorage once on mount in case the first
  // useState lambda ran before localStorage was ready (SSR / first paint).
  useEffect(() => {
    const persisted = readPersistedPreference();
    if (persisted !== null) setExplicit(persisted);
  }, []);

  const followSystem = explicit === null;
  const darkMode = followSystem ? systemScheme === "dark" : explicit;

  // Inject (or remove) a global stylesheet on web that recolors every cream
  // background / dark-brown text token used across the app's StyleSheets to
  // dark equivalents. This applies dark mode app-wide without rewriting every
  // screen — the inline styles React Native Web emits are recoloured via
  // attribute selectors with `!important`.
  useEffect(() => {
    if (Platform.OS !== "web") return undefined;
    if (typeof document === "undefined") return undefined;

    const existing = document.getElementById(STYLE_TAG_ID);
    if (darkMode) {
      let tag = existing;
      if (!tag) {
        tag = document.createElement("style");
        tag.id = STYLE_TAG_ID;
        document.head.appendChild(tag);
      }
      tag.textContent = DARK_OVERRIDES_CSS;
    } else if (existing) {
      existing.parentNode?.removeChild(existing);
    }

    return () => {
      // Cleanup on provider unmount — keep the page in light by default.
      const tag = document.getElementById(STYLE_TAG_ID);
      if (tag) tag.parentNode?.removeChild(tag);
    };
  }, [darkMode]);

  const setDarkMode = useCallback((value) => {
    setExplicit(value);
    writePersistedPreference(value);
  }, []);

  const toggleDarkMode = useCallback(() => {
    setExplicit((prev) => {
      const next = !(prev === null ? systemScheme === "dark" : prev);
      writePersistedPreference(next);
      return next;
    });
  }, [systemScheme]);

  const followSystemPreference = useCallback(() => {
    setExplicit(null);
    writePersistedPreference(null);
  }, []);

  const value = useMemo(
    () => ({
      darkMode,
      followSystem,
      setDarkMode,
      toggleDarkMode,
      followSystemPreference,
    }),
    [darkMode, followSystem, setDarkMode, toggleDarkMode, followSystemPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

// Color palette helpers — components can opt into dark-aware styling without
// rewriting their entire StyleSheet. Light values match the existing
// `#FFFBFA` cream / `#28221B` brown palette.
const LIGHT = {
  background: "#FFFBFA",
  surface: "#FFFFFF",
  surfaceAlt: "#F1E5E1",
  border: "#F0EDEA",
  text: "#28221B",
  textSubtle: "#7E6D66",
  divider: "#EFE6E1",
};
const DARK = {
  background: "#1B1714",
  surface: "#26201C",
  surfaceAlt: "#332B26",
  border: "#3A322D",
  text: "#FFFBFA",
  textSubtle: "#B8A89F",
  divider: "#332B26",
};

export function useThemeColors() {
  const { darkMode } = useTheme();
  return darkMode ? DARK : LIGHT;
}
