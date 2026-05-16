import { api } from "./api";

export function getStudentProgress(student_id) {
  return api.get(`/progress/student/${student_id}`);
}
