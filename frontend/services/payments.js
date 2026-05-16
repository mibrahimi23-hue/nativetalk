import { api } from "./api";

export function getCoursePayment(course_payment_id) {
  return api.get(`/payments/course/${course_payment_id}`);
}

export function getStudentPayments(student_id) {
  return api.get(`/payments/student/${student_id}`);
}

export function getTeacherEarnings(teacher_id) {
  return api.get(`/payments/teacher/${teacher_id}`);
}

export function setCoursePlan(course_payment_id, payment_plan) {
  return api.post(`/payments/course/${course_payment_id}/plan`, { payment_plan });
}
