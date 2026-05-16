import { api } from "./api";

// All admin endpoints use the auth-protected /api/v1/admin namespace.

export function getDashboard() {
  return api.get("/admin/dashboard");
}

export function listAdminUsers(role, { limit = 50, offset = 0 } = {}) {
  return api.get(`/admin/users?role=${encodeURIComponent(role)}&limit=${limit}&offset=${offset}`);
}

export function listPendingTutors() {
  return api.get("/admin/tutors/pending");
}

export function approveTutor(teacher_id) {
  return api.post(`/admin/tutors/${teacher_id}/approve`);
}

export function rejectTutor(teacher_id) {
  return api.post(`/admin/tutors/${teacher_id}/reject`);
}

export function listAdminTransactions({ limit = 50, offset = 0 } = {}) {
  return api.get(`/admin/transactions?limit=${limit}&offset=${offset}`);
}

export function getAdminTransaction(transactionId) {
  return api.get(`/admin/transactions/${encodeURIComponent(transactionId)}`);
}

export function suspendUser({ user_id, reason, notes = "", no_refund = false }) {
  return api.post("/admin/suspend", { user_id, reason, notes, no_refund });
}

export function unsuspendUser(user_id) {
  return api.post(`/admin/unsuspend/${user_id}`);
}

export function listOverdue() {
  return api.get("/admin/sessions/overdue");
}

export function manualAutoRelease() {
  return api.post("/admin/sessions/auto-release");
}

export function deleteUser(user_id) {
  return api.delete(`/admin/users/${user_id}`);
}
