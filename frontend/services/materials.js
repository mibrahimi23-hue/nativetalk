import { Platform } from "react-native";
import { api } from "./api";

export function listMaterials({ teacher_id, language_id, level } = {}) {
  const params = new URLSearchParams();
  if (teacher_id) params.set("teacher_id", teacher_id);
  if (language_id) params.set("language_id", language_id);
  if (level) params.set("level", level);
  const qs = params.toString();
  return api.get(`/materials/${qs ? `?${qs}` : ""}`);
}

function guessMime(filename = "", explicit) {
  if (explicit) return explicit;
  const m = /\.(\w+)$/.exec(filename);
  if (!m) return "application/octet-stream";
  const ext = m[1].toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "mp3" || ext === "m4a") return "audio/mpeg";
  return `application/${ext}`;
}

// On web FormData needs a real File/Blob; on native React Native handles
// `{ uri, name, type }`. Mirrors the helper in services/certificates.js.
async function appendUpload(form, field, asset) {
  if (!asset) return;
  const filename = asset.name || asset.fileName || "file.pdf";
  const type = guessMime(filename, asset.mimeType || asset.type);

  if (Platform.OS === "web") {
    if (asset.file instanceof File || asset.file instanceof Blob) {
      form.append(field, asset.file, filename);
      return;
    }
    if (asset.uri) {
      const res = await fetch(asset.uri);
      const blob = await res.blob();
      form.append(field, blob, filename);
      return;
    }
    throw new Error("Could not resolve picked file to a Blob.");
  }
  form.append(field, { uri: asset.uri, name: filename, type });
}

export async function uploadMaterial({
  title,
  type,
  description,
  language_id,
  level,
  asset,
  // Backwards-compat
  fileUri,
}) {
  const form = new FormData();
  form.append("title", title);
  form.append("type", type);
  if (description) form.append("description", description);
  if (language_id !== undefined && language_id !== null) {
    form.append("language_id", String(language_id));
  }
  if (level) form.append("level", level);

  const resolved =
    asset || (fileUri ? { uri: fileUri, name: fileUri.split("/").pop() } : null);
  if (resolved) await appendUpload(form, "file", resolved);
  return api.post("/materials/", form);
}

export function deleteMaterial(material_id) {
  return api.delete(`/materials/${material_id}`);
}
