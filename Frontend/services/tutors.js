import { api } from "./api";

export function listTutors({ language_id, level, max_price, limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams();
  if (language_id !== undefined && language_id !== null) params.set("language_id", language_id);
  if (level) params.set("level", level);
  if (max_price !== undefined && max_price !== null) params.set("max_price", max_price);
  params.set("limit", limit);
  params.set("offset", offset);
  return api.get(`/tutors/?${params.toString()}`);
}

export function getTutor(teacher_id) {
  return api.get(`/tutors/${teacher_id}`);
}

export function getTutorAvailability(teacher_id) {
  return api.get(`/tutors/${teacher_id}/availability`);
}

export function addAvailability({ day_of_week, start_time, end_time, timezone }) {
  return api.post("/tutors/availability", {
    day_of_week,
    start_time,
    end_time,
    timezone,
  });
}

export function deleteAvailability(slot_id) {
  return api.delete(`/tutors/availability/${slot_id}`);
}

export function updateTutorProfile(patch) {
  return api.patch("/tutors/me", patch);
}

export function completeTutorOnboarding({
  language_id,
  is_native,
  is_certified,
  has_experience,
  bio,
}) {
  return api.post("/tutors/onboarding", {
    language_id,
    is_native,
    is_certified,
    has_experience,
    bio,
  });
}
