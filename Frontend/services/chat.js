import { api } from "./api";

export function listConversations() {
  return api.get("/chat/conversations");
}

export function listChatContacts() {
  return api.get("/chat/contacts");
}

export function getConversation(other_user_id, limit = 50) {
  return api.get(`/chat/${other_user_id}?limit=${limit}`);
}

export function getChatPeer(other_user_id) {
  return api.get(`/chat/${other_user_id}/peer`);
}

export function sendMessage(receiver_id, content) {
  return api.post("/chat/", { receiver_id, content });
}

export function toggleMessageLike(message_id) {
  return api.post(`/chat/${message_id}/like`);
}
