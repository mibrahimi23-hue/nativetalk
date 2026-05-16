import { api } from "./api";

export function getStudentSuspensionStatus(student_id) {
  return api.get(`/suspension/student/${student_id}`);
}

export function getTeacherSuspensionStatus(teacher_id) {
  return api.get(`/suspension/teacher/${teacher_id}`);
}

export function markAttendance({ session_id, student_id, was_present }) {
  const params = new URLSearchParams({
    session_id,
    student_id,
    was_present: String(was_present),
  });
  return api.post(`/suspension/attendance?${params.toString()}`);
}

export function markTeacherNoShow({ teacher_id, session_id, notified }) {
  return api.post("/suspension/noshow", { teacher_id, session_id, notified });
}

export function liftSuspension(suspension_id) {
  return api.put(`/suspension/${suspension_id}/lift`);
}
