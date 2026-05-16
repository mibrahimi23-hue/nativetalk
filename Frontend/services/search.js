import { api } from "./api";

// The backend exposes browse via /tutors/ (v1) and a richer match-by-language
// endpoint at /search/teachers (root). Use the v1 endpoint for filters that
// the tutor list already supports.
export function searchTutors({ language_id, level, max_price, limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams();
  if (language_id) params.set("language_id", language_id);
  if (level) params.set("level", level);
  if (max_price !== undefined && max_price !== null) params.set("max_price", max_price);
  params.set("limit", limit);
  params.set("offset", offset);
  return api.get(`/tutors/?${params.toString()}`);
}

// Detailed "find a teacher for this language + level" search with availability
// and avg rating bundled in the response. Required params per the backend.
export function searchTeachers({ language_id, level }) {
  const params = new URLSearchParams();
  params.set("language_id", language_id);
  params.set("level", level);
  return api.get(`/search/teachers?${params.toString()}`);
}

export function getTeacherProfile(teacher_id) {
  return api.get(`/search/teacher/${teacher_id}/profile`);
}

export function listSearchLanguages() {
  return api.get("/search/languages");
}

export function listSearchLevels() {
  return api.get("/search/levels");
}
