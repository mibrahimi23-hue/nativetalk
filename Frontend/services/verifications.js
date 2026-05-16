import { api } from "./api";

export function getPendingVerifications() {
  return api.get("/verifications/pending");
}

export function getVerifiedTeachers() {
  return api.get("/verifications/verified");
}

export function getVerificationStatus(teacher_id) {
  return api.get(`/verifications/status/${teacher_id}`);
}

export function verifyTeacher({ senior_teacher_id, junior_teacher_id, approved_level, notes = "" }) {
  return api.post("/verifications/verify", {
    senior_teacher_id,
    junior_teacher_id,
    approved_level,
    notes,
  });
}
