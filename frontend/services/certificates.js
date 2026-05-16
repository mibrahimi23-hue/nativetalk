import { Platform } from "react-native";
import { api } from "./api";

export function listMyCertificates() {
  return api.get("/certificates/me");
}

export function listTeacherCertificates(teacher_id) {
  return api.get(`/certificates/${teacher_id}`);
}

function guessMime(filename = "", explicit) {
  if (explicit) return explicit;
  const match = /\.(\w+)$/.exec(filename);
  if (!match) return "application/octet-stream";
  const ext = match[1].toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return `application/${ext}`;
}

// expo-document-picker shape changes across platforms:
//   native → { uri, name, mimeType, size }
//   web    → { uri (blob: or data:), name, mimeType, size, file: File }
//
// FastAPI/UploadFile only understands a real File or Blob on web. Passing the
// React Native `{ uri, name, type }` shape there silently produces a [object Object]
// and the server returns 422. So on web we always send the File, and on native
// we send the URI shape that React Native's fetch knows how to upload.
async function appendUpload(form, field, asset) {
  if (!asset) return;
  const filename = asset.name || asset.fileName || "certificate.pdf";
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

export async function uploadCertificate({
  name,
  asset,
  // Backwards-compat fields — callers that still pass individual params keep working.
  fileUri,
  fileName,
  mimeType,
  isNotarized = false,
}) {
  const form = new FormData();
  form.append("name", name);
  form.append("is_notarized", String(isNotarized));

  const resolvedAsset = asset || (fileUri ? { uri: fileUri, name: fileName, mimeType } : null);
  if (resolvedAsset) {
    await appendUpload(form, "file", resolvedAsset);
  }
  return api.post("/certificates/upload", form);
}

export function deleteCertificate(certificate_id) {
  return api.delete(`/certificates/${certificate_id}`);
}
