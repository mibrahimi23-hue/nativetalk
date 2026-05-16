import { api } from "./api";

export function createReview({ session_id, role, rating, comment }) {
  return api.post("/reviews/", { session_id, role, rating, comment });
}

export function getSessionReviews(session_id) {
  return api.get(`/reviews/session/${session_id}`);
}

export function getTeacherReviews(teacher_id) {
  return api.get(`/reviews/teacher/${teacher_id}`);
}

export function getStudentReviews(student_id) {
  return api.get(`/reviews/student/${student_id}`);
}
