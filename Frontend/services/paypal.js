import { api } from "./api";

export function createPaypalOrder({ course_payment_id, student_id, installment = 1 }) {
  return api.post("/paypal/create-order", {
    course_payment_id,
    student_id,
    installment,
  });
}

export function capturePaypalOrder({
  paypal_order_id,
  course_payment_id,
  student_id,
  installment = 1,
}) {
  return api.post("/paypal/capture-order", {
    paypal_order_id,
    course_payment_id,
    student_id,
    installment,
  });
}

export function refundPaypalTransaction(transaction_id) {
  return api.post(`/paypal/refund/${transaction_id}`);
}

export function getStudentPaypalHistory(student_id) {
  return api.get(`/paypal/history/${student_id}`);
}

export function getTutorPaypalTransactions(teacher_id) {
  return api.get(`/paypal/teacher/${teacher_id}`);
}

export function getAllPaypalTransactions({ limit = 100, offset = 0 } = {}) {
  return api.get(`/paypal/admin/all?limit=${limit}&offset=${offset}`);
}
