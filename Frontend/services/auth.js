import { Platform } from "react-native";
import { api } from "./api";

export function loginRequest(email, password) {
  return api.post("/auth/login", { email, password });
}

// Lightweight "is this email taken?" check used by the Sign Up screen so
// it can render the inline "This account is registered. Login" hint
// without bouncing the user through the onboarding flow first.
export function checkEmailAvailable(email) {
  return api.get(`/auth/email-available?email=${encodeURIComponent(email)}`);
}

export function registerRequest({
  email,
  password,
  full_name,
  role,
  language_id,
  is_native,
  is_certified,
  has_experience,
  bio,
  timezone,
  location,
  phone,
}) {
  const body = { email, password, full_name, role };
  if (language_id !== undefined && language_id !== null) body.language_id = language_id;
  if (is_native !== undefined) body.is_native = is_native;
  if (is_certified !== undefined) body.is_certified = is_certified;
  if (has_experience !== undefined) body.has_experience = has_experience;
  if (bio) body.bio = bio;
  if (timezone) body.timezone = timezone;
  if (location) body.location = location;
  if (phone) body.phone = phone;
  return api.post("/auth/register", body);
}

export function refreshRequest(refresh_token) {
  return api.post("/auth/refresh", { refresh_token });
}

export function logoutRequest(refresh_token) {
  return api.post("/auth/logout", refresh_token ? { refresh_token } : undefined);
}

export function resetPasswordRequest({ email, new_password, confirm_password }) {
  return api.post("/auth/reset-password", {
    email,
    new_password,
    confirm_password,
  });
}

export function googleLoginRequest(id_token, role) {
  const body = { id_token };
  if (role === "student" || role === "teacher") body.role = role;
  return api.post("/auth/google", body);
}

export function getMe() {
  return api.get("/users/me");
}

export function getPricingRanges() {
  return api.get("/users/me/pricing-ranges");
}

export function updateMe(patch) {
  return api.patch("/users/me", patch);
}

// Avatar upload — must hand FastAPI a real File/Blob on web, and the RN
// `{ uri, name, type }` shape on native. Same pattern we use for materials
// and certificates. Without this, web sends `[object Object]` as the file
// field and the backend returns 422.
export async function uploadAvatar(uriOrAsset) {
  const form = new FormData();

  // Accept either a plain `uri` string (legacy) or an asset object from
  // expo-image-picker (`{ uri, fileName, mimeType, file?, ... }`).
  const asset =
    typeof uriOrAsset === "string"
      ? { uri: uriOrAsset }
      : uriOrAsset || {};

  const uri = asset.uri || "";
  const filename = asset.name || asset.fileName || uri.split("/").pop() || "photo.jpg";
  const guessMime = (name) => {
    const m = /\.(\w+)$/.exec(name || "");
    if (!m) return "image/jpeg";
    const ext = m[1].toLowerCase().replace("jpg", "jpeg");
    return `image/${ext}`;
  };
  const type = asset.mimeType || asset.type || guessMime(filename);

  if (Platform.OS === "web") {
    if (asset.file instanceof File || asset.file instanceof Blob) {
      form.append("photo", asset.file, filename);
    } else if (uri) {
      const res = await fetch(uri);
      const blob = await res.blob();
      form.append("photo", blob, filename);
    } else {
      throw new Error("Could not resolve picked image to a Blob.");
    }
  } else {
    form.append("photo", { uri, name: filename, type });
  }
  return api.post("/users/me/photo", form);
}
