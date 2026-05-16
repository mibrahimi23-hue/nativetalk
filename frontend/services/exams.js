import { api } from "./api";

// Tutor-side endpoints (mounted at /exams):
//   GET    /exams/list/{language_id}/{level}   → list exams for a level
//   GET    /exams/by-language/{language_id}    → list every active exam for a language
//   GET    /exams/{exam_id}                    → get one exam (with questions)
//   POST   /exams/create                       → create exam (experienced teacher only)
//   POST   /exams/{exam_id}/submit             → submit answers
//   GET    /exams/attempts/{teacher_id}        → list a teacher's attempts
//   DELETE /exams/{exam_id}                    → deactivate own exam
//
// Admin-side endpoints (mounted at /api/v1/admin/exams):
//   POST   /admin/exams                        → admin creates exam + questions
//   GET    /admin/exams                        → admin lists every exam
//   PATCH  /admin/exams/{exam_id}/publish      → set is_active=true
//   PATCH  /admin/exams/{exam_id}/unpublish    → set is_active=false
//   DELETE /admin/exams/{exam_id}              → hard delete with cascade

export function listExams({ language_id, level }) {
  return api.get(`/exams/list/${language_id}/${level}`);
}

export function listExamsByLanguage(language_id) {
  return api.get(`/exams/by-language/${language_id}`);
}

export function getExam(exam_id) {
  return api.get(`/exams/${exam_id}`);
}

export function createExam(payload) {
  return api.post("/exams/create", payload);
}

export function submitExam(exam_id, payload) {
  return api.post(`/exams/${exam_id}/submit`, payload);
}

export function getTeacherExamAttempts(teacher_id) {
  return api.get(`/exams/attempts/${teacher_id}`);
}

export function deleteExam(exam_id) {
  return api.delete(`/exams/${exam_id}`);
}

// Admin-only — these go through /api/v1/admin/exams.

export function adminCreateExam(payload) {
  return api.post("/admin/exams", payload);
}

export function adminListExams() {
  return api.get("/admin/exams");
}

export function adminGetExam(exam_id) {
  return api.get(`/admin/exams/${exam_id}`);
}

export function adminUpdateExam(exam_id, payload) {
  return api.put(`/admin/exams/${exam_id}`, payload);
}

export function adminPublishExam(exam_id) {
  return api.patch(`/admin/exams/${exam_id}/publish`);
}

export function adminUnpublishExam(exam_id) {
  return api.patch(`/admin/exams/${exam_id}/unpublish`);
}

export function adminDeleteExam(exam_id) {
  return api.delete(`/admin/exams/${exam_id}`);
}

export function listLanguages() {
  return api.get("/languages");
}
