import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { safeBack } from "@/hooks/use-safe-back";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useUser } from "@/contexts/user-context";
import { getChatPeer, getConversation, sendMessage } from "@/services/chat";

function dayLabel(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dDay = new Date(d);
  dDay.setHours(0, 0, 0, 0);
  const diff = Math.round((today - dDay) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString();
}

export default function Chat() {
  const params = useLocalSearchParams();
  const name = params.name;
  const color = params.color || "#6B8F71";
  const otherUserId = params.userId;
  const { user } = useUser();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [peer, setPeer] = useState(null);
  const scrollRef = useRef(null);

  const load = useCallback(async () => {
    if (!otherUserId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [data, peerInfo] = await Promise.all([
        getConversation(otherUserId).catch(() => []),
        getChatPeer(otherUserId).catch(() => null),
      ]);
      setMessages(Array.isArray(data) ? data : []);
      setPeer(peerInfo);
    } finally {
      setLoading(false);
    }
  }, [otherUserId]);

  useEffect(() => {
    load();
  }, [load]);

  const onSend = async () => {
    const text = input.trim();
    if (!text || !otherUserId || sending) return;
    setSending(true);
    const optimistic = {
      id: `temp-${Date.now()}`,
      sender_id: user?.id,
      receiver_id: otherUserId,
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    try {
      const sent = await sendMessage(otherUserId, text);
      setMessages((prev) =>
        prev.map((m) => (m.id === optimistic.id ? { ...sent } : m))
      );
    } catch (e) {
      Alert.alert("Send failed", e.message || "Please try again.");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  };

  let lastDay = null;

  const isPeerSuspended = Boolean(peer?.is_suspended);
  // Pick a label that matches the suspended party's role so the warning reads
  // naturally for the viewer ("this tutor / this student").
  const suspendedLabel = (() => {
    const role = (peer?.role || "").toLowerCase();
    if (role === "teacher") return "tutor";
    if (role === "student") return "student";
    return "user";
  })();
  const suspendedMessage =
    suspendedLabel === "tutor"
      ? "You cannot contact this tutor because their account is suspended. Please choose another tutor."
      : suspendedLabel === "student"
      ? "You cannot contact this student because their account is suspended."
      : "You cannot contact this user because their account is suspended.";

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack("/messages")}>
          <Ionicons name="chevron-back" size={20} color="#FFFBFA" />
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          <View style={[styles.avatar, { backgroundColor: color }]}>
            <Text style={styles.avatarInitial}>
              {name ? String(name).charAt(0) : "?"}
            </Text>
          </View>

          <Text style={styles.headerName}>{name || "Chat"}</Text>
        </View>

        <TouchableOpacity
          onPress={() =>
            router.push({
              pathname: "/videocall",
              params: otherUserId ? { peerUserId: String(otherUserId) } : {},
            })
          }
        >
          <Ionicons name="videocam-outline" size={22} color="#28221B" />
        </TouchableOpacity>
      </View>

      {isPeerSuspended && (
        <View style={styles.suspendedBanner}>
          <Ionicons name="alert-circle" size={18} color="#DD8153" />
          <Text style={styles.suspendedText}>{suspendedMessage}</Text>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {loading ? (
          <ActivityIndicator color="#FF9E6D" style={{ marginTop: 30 }} />
        ) : messages.length === 0 ? (
          <Text style={styles.empty}>Say hello!</Text>
        ) : (
          messages.map((msg) => {
            const day = dayLabel(msg.created_at);
            const showDay = day !== lastDay;
            lastDay = day;
            // "Sent by me" is anything not sent by the chat partner. Comparing
            // against otherUserId is more reliable than user?.id, because
            // user.id can be momentarily empty (auth state still loading) on
            // first render, and that would make every message render as
            // "received" — which is exactly the bug the tutor was hitting
            // (all bubbles on the left in grey, including their own replies).
            const sent =
              !!otherUserId && String(msg.sender_id) !== String(otherUserId);
            return (
              <View key={msg.id}>
                {showDay && <Text style={styles.dateSeparator}>{day}</Text>}
                <View
                  style={[
                    styles.messageRow,
                    sent ? styles.sentRow : styles.receivedRow,
                  ]}
                >
                  <View style={sent ? styles.sentBubble : styles.receivedBubble}>
                    <Text style={sent ? styles.sentText : styles.receivedText}>
                      {msg.content}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {isPeerSuspended ? (
        <View style={styles.suspendedFooter}>
          <Text style={styles.suspendedFooterText}>
            Messaging is disabled for suspended accounts.
          </Text>
        </View>
      ) : (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Type your message here..."
            placeholderTextColor="#aaa"
            value={input}
            onChangeText={setInput}
            editable={!sending}
            onSubmitEditing={onSend}
          />
          <TouchableOpacity
            style={styles.sendBtn}
            onPress={onSend}
            disabled={sending || !input.trim()}
          >
            <Ionicons name="send" size={18} color="#FFFBFA" />
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#FFFBFA",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 55,
    paddingBottom: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#EFE6E1",
  },

  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FF9E6D",
    justifyContent: "center",
    alignItems: "center",
  },

  headerInfo: {
    flexDirection: "row",
    alignItems: "center",
  },

  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },

  avatarInitial: {
    color: "#FFFBFA",
    fontSize: 16,
    fontWeight: "700",
  },

  headerName: {
    fontFamily: "Outfit",
    fontSize: 15,
    color: "#28221B",
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },

  dateSeparator: {
    textAlign: "center",
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#aaa",
    marginBottom: 16,
    marginTop: 8,
  },

  messageRow: {
    marginBottom: 10,
  },

  sentRow: {
    alignItems: "flex-end",
  },

  receivedRow: {
    alignItems: "flex-start",
  },

  sentBubble: {
    maxWidth: "75%",
    backgroundColor: "#FF9E6D",
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },

  receivedBubble: {
    maxWidth: "75%",
    backgroundColor: "#F0EDEA",
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },

  sentText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#FFFBFA",
  },

  receivedText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#28221B",
  },

  empty: {
    textAlign: "center",
    color: "#A89080",
    fontFamily: "Outfit",
    fontSize: 13,
    marginTop: 40,
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderTopColor: "#EFE6E1",
  },

  input: {
    flex: 1,
    backgroundColor: "#F0EDEA",
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#28221B",
  },

  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FF9E6D",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },

  suspendedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFF1E8",
    borderLeftWidth: 3,
    borderLeftColor: "#DD8153",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 10,
  },

  suspendedText: {
    flex: 1,
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    lineHeight: 18,
  },

  suspendedFooter: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderTopColor: "#EFE6E1",
    alignItems: "center",
  },

  suspendedFooterText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
    fontStyle: "italic",
  },
});
