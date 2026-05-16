import { api } from "./api";

// /profile is a MyProject route — gets/updates the role-specific profile (teacher or student).
// Note: For self updates of `User` fields use auth.updateMe (PATCH /users/me).

export function getStudentProfile(student_id) {
  return api.get(`/profile/student/${student_id}`);
}

export function updateStudentProfile(student_id, patch) {
  return api.patch(`/profile/student/${student_id}`, patch);
}

export function getTeacherProfile(teacher_id) {
  return api.get(`/profile/teacher/${teacher_id}`);
}

export function updateTeacherProfile(teacher_id, patch) {
  return api.patch(`/profile/teacher/${teacher_id}`, patch);
}
