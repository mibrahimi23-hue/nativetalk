import { useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import { googleLoginRequest } from "./auth";

// Required by expo-auth-session on web — closes the popup once the OAuth
// redirect lands. Safe to call multiple times.
WebBrowser.maybeCompleteAuthSession();

const WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  "325878187070-dnnuldrknhhjffnr01jqb99s8d0bof2l.apps.googleusercontent.com";
// On native platforms expo-auth-session insists on a platform-specific client
// ID. When the dedicated env var isn't set, fall back to the web client ID so
// the hook initialises (Google still hands back a valid id_token in dev /
// Expo Go). Set EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID / ANDROID_CLIENT_ID in
// production for native builds.
const IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || WEB_CLIENT_ID;
const ANDROID_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || WEB_CLIENT_ID;

// Log the exact redirect URI on module load so the developer can copy/paste
// it into Google Cloud Console → OAuth client → Authorized redirect URIs.
// Without this, redirect_uri_mismatch debugging is guesswork.
try {
  const redirectUri = AuthSession.makeRedirectUri({ scheme: "myapp" });
  // eslint-disable-next-line no-console
  console.log("[google-auth] using web client id:", WEB_CLIENT_ID);
  // eslint-disable-next-line no-console
  console.log("[google-auth] redirect URI to register in Google:", redirectUri);
  if (Platform.OS !== "web" && /^exp:\/\//.test(redirectUri)) {
    // eslint-disable-next-line no-console
    console.warn(
      "[google-auth] Google sign-in won't work on Expo Go because Google only " +
        "accepts https:// redirect URIs. Sign in with email/password on the phone, " +
        "or build a dev client with platform-specific OAuth client IDs.",
    );
  }
} catch {
  /* ignore — makeRedirectUri may not work in some module-eval contexts */
}

/**
 * useGoogleAuth — kicks off Google sign-in via expo-auth-session and exchanges
 * the resulting ID token with the backend.
 *
 * Returns:
 *   request  — readiness flag from the Google provider (null while loading)
 *   signIn   — async fn to launch the OAuth flow; accepts optional { role }
 *              to forward to POST /auth/google for brand-new accounts.
 *
 * Notes:
 *   - In Expo Go / web the redirect goes through Google's web client. Native
 *     dev/preview builds use the platform-specific client IDs when provided.
 *   - The backend verifies the ID token against GOOGLE_CLIENT_ID, so it must
 *     match EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in production.
 */
export function useGoogleAuth() {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId: WEB_CLIENT_ID,
    iosClientId: IOS_CLIENT_ID,
    androidClientId: ANDROID_CLIENT_ID,
    selectAccount: true,
  });

  const [pendingResolver, setPendingResolver] = useState(null);

  useEffect(() => {
    if (!response || !pendingResolver) return;
    if (response.type === "success") {
      const idToken =
        response.params?.id_token ||
        response.authentication?.idToken ||
        response.authentication?.accessToken;
      pendingResolver.resolve(idToken || null);
    } else if (response.type === "error") {
      pendingResolver.reject(
        new Error(response.error?.message || "Google sign-in failed.")
      );
    } else {
      pendingResolver.reject(new Error("Google sign-in was cancelled."));
    }
    setPendingResolver(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  const signIn = useMemo(
    () =>
      async function signIn({ role } = {}) {
        if (!request) {
          throw new Error(
            "Google sign-in is not ready yet. Please try again in a moment."
          );
        }
        const idTokenPromise = new Promise((resolve, reject) => {
          setPendingResolver({ resolve, reject });
        });
        await promptAsync();
        const idToken = await idTokenPromise;
        if (!idToken) {
          throw new Error("No Google ID token was returned. Please try again.");
        }
        const payload = await googleLoginRequest(idToken, role);
        return payload;
      },
    [request, promptAsync]
  );

  return { request, signIn };
}

// Mostly useful for tests / non-hook code paths.
export const GOOGLE_PLATFORM = Platform.OS;
