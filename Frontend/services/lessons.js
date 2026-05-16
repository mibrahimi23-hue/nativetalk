import { api } from "./api";

// /lessons is a MyProject route (root-level, not /api/v1) so it must start
// with a leading slash.
export function listMyLessons({ status, level } = {}) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (level) params.set("level", level);
  const qs = params.toString();
  return api.get(`/lessons/mine${qs ? `?${qs}` : ""}`);
}

export function createLesson(payload) {
  return api.post("/lessons/", payload);
}

export function getLesson(lesson_id) {
  return api.get(`/lessons/${lesson_id}`);
}

export function updateLesson(lesson_id, payload) {
  return api.put(`/lessons/${lesson_id}`, payload);
}

export function deleteLesson(lesson_id) {
  return api.delete(`/lessons/${lesson_id}`);
}
