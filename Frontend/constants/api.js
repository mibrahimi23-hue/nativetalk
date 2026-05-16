import Constants from "expo-constants";
import { Platform } from "react-native";

function resolveBaseUrl() {
  const fromEnv =
    process.env.EXPO_PUBLIC_API_URL ||
    Constants.expoConfig?.extra?.apiUrl ||
    Constants.manifest?.extra?.apiUrl;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest?.hostUri ||
    Constants.manifest2?.extra?.expoGo?.developer?.hostUri;
  if (hostUri) {
    const host = hostUri.split(":")[0];
    return `http://${host}:8000`;
  }

  if (Platform.OS === "android") return "http://10.0.2.2:8000";
  if (Platform.OS === "ios") return "http://127.0.0.1:8000";
  return "http://localhost:8000";
}

export const API_BASE_URL = resolveBaseUrl();
export const API_V1 = `${API_BASE_URL}/api/v1`;
