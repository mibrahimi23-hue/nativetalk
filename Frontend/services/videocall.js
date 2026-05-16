import { api } from "./api";

// Two video-call APIs exist:
//   1. /api/v1/sessions/{id}/daily/room + /token  ← Daily.co (preferred, uses JWT)
//   2. /videocall/{session_id}?user_id=...        ← MyProject legacy URL
// Use the v1 one whenever possible.

export function getLegacyVideocall(session_id, user_id) {
  return api.get(`/videocall/${session_id}?user_id=${encodeURIComponent(user_id)}`);
}
