import { api } from "./api";

export function requestReschedule({ session_id, new_time, reason, requested_by, user_timezone }) {
  const tz =
    user_timezone ||
    (typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC");
  return api.post("/reschedule/", {
    session_id,
    new_time,
    reason,
    requested_by,
    user_timezone: tz,
  });
}

export function listReschedulesForSession(session_id) {
  return api.get(`/reschedule/session/${session_id}`);
}

export function acceptReschedule(reschedule_id) {
  return api.put(`/reschedule/${reschedule_id}/accept`);
}

export function rejectReschedule(reschedule_id) {
  return api.put(`/reschedule/${reschedule_id}/reject`);
}
