import { api } from "./api";

export function bookSession(payload) {
  return api.post("/sessions/", payload);
}

export function listMyCredits() {
  return api.get("/sessions/credits");
}

export function listMySessions(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return api.get(`/sessions/mine${query}`);
}

export function listMyStudents() {
  return api.get("/sessions/my-students");
}

export function getSession(session_id) {
  return api.get(`/sessions/${session_id}`);
}

export function confirmSession(session_id) {
  return api.patch(`/sessions/${session_id}/confirm`);
}

export function completeSession(session_id) {
  return api.patch(`/sessions/${session_id}/complete`);
}

export function cancelSession(session_id) {
  return api.patch(`/sessions/${session_id}/cancel`);
}

export function getDailyRoom(session_id) {
  return api.post(`/sessions/${session_id}/daily/room`);
}

export function getDailyToken(session_id) {
  return api.post(`/sessions/${session_id}/daily/token`);
}

export function endDailyRoom(session_id) {
  return api.post(`/sessions/${session_id}/daily/end`);
}
