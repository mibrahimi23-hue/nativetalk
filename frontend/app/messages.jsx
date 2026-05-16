import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { StudentBottomNav } from "@/components/student-bottom-nav";
import { TutorBottomNav } from "@/components/tutor-bottom-nav";
import { useUser } from "@/contexts/user-context";
import { useSafeBack } from "@/hooks/use-safe-back";
import { listChatContacts, listConversations } from "@/services/chat";

const COLORS = ["#C4956A", "#A0785A", "#7AA088", "#8AA0C4", "#B6CFD2", "#D9A4A4"];

function relativeTime(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export default function Messages() {
  const { role } = useUser();
  const safeBack = useSafeBack();
  const isTutor = role === "Tutor";

  const [conversations, setConversations] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Two parallel sources:
      //   - /chat/conversations → people with chat history (with last_message)
      //   - /chat/contacts → everyone the user has a paid lesson with (even
      //     if no chat yet). The tutor needs this so they can find any
      //     student who paid for a lesson, not just ones who messaged first.
      const [c, ct] = await Promise.all([
        listConversations().catch(() => []),
        listChatContacts().catch(() => []),
      ]);
      setConversations(Array.isArray(c) ? c : []);
      setContacts(Array.isArray(ct) ? ct : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Build the visible list. The active conversations are always shown at the
  // top; contacts without chat history only surface when the user is searching
  // — that way the inbox stays focused on real threads by default but a tutor
  // looking for a specific student can find them.
  const allEntries = useMemo(() => {
    const haveChatIds = new Set(conversations.map((c) => String(c.user_id)));
    const fromConvos = conversations.map((c) => ({
      user_id: c.user_id,
      full_name: c.full_name,
      last_message: c.last_message,
      created_at: c.created_at,
      relation: null,
      role: c.role,
      is_suspended: Boolean(c.is_suspended),
    }));
    const fromContacts = contacts
      .filter((c) => !haveChatIds.has(String(c.user_id)))
      .map((c) => ({
        user_id: c.user_id,
        full_name: c.full_name,
        last_message: c.relation === "student"
          ? "Tap to start the conversation"
          : "Tap to start the conversation",
        created_at: null,
        relation: c.relation,
        role: c.role,
        is_suspended: Boolean(c.is_suspended),
      }));
    return [...fromConvos, ...fromContacts];
  }, [conversations, contacts]);

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      // Without a search query, only show real conversations (the inbox view).
      return allEntries.filter((c) => c.created_at);
    }
    return allEntries.filter((c) =>
      (c.full_name || "").toLowerCase().includes(q),
    );
  }, [allEntries, search]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
          <Ionicons name="chevron-back" size={20} color="#FFFBFA" />
        </TouchableOpacity>
        <Text style={styles.topHeader}>Native Talk</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Chats</Text>

        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color="#7E6D66" />
          <TextInput
            style={styles.searchInput}
            placeholder={isTutor ? "Search your students" : "Search your tutors"}
            placeholderTextColor="#7E6D66"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Ionicons name="close" size={16} color="#28221B" />
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <ActivityIndicator color="#FF9E6D" style={{ marginTop: 30 }} />
        ) : filteredConversations.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={32} color="#A89080" />
            <Text style={styles.emptyTitle}>
              {conversations.length === 0
                ? "No conversations yet"
                : "No matches"}
            </Text>
            <Text style={styles.emptyText}>
              {conversations.length === 0
                ? "When you message someone, they'll appear here."
                : "Try a different name."}
            </Text>
          </View>
        ) : (
          filteredConversations.map((convo, idx) => {
            const color = COLORS[idx % COLORS.length];
            const name = convo.full_name || "Unknown user";
            const unread = Number(convo.unread_count || 0);
            const hasUnread = unread > 0;
            const suspended = Boolean(convo.is_suspended);
            return (
              <TouchableOpacity
                key={convo.user_id}
                style={styles.convoRow}
                onPress={() => {
                  // Optimistic: drop this conversation's unread count to 0
                  // immediately so the badge disappears as soon as the user
                  // taps. The next /chat/conversations fetch will agree
                  // (the thread GET marks messages as read server-side).
                  setConversations((prev) =>
                    prev.map((c) =>
                      String(c.user_id) === String(convo.user_id)
                        ? { ...c, unread_count: 0, last_message_unread: false }
                        : c,
                    ),
                  );
                  router.push({
                    pathname: "/chat",
                    params: { userId: convo.user_id, name, color },
                  });
                }}
              >
                <View style={[styles.avatar, { backgroundColor: color }]}>
                  <Text style={styles.avatarInitial}>{name[0]?.toUpperCase()}</Text>
                </View>

                <View style={styles.convoInfo}>
                  <View style={styles.convoTop}>
                    <View style={styles.convoNameRow}>
                      <Text
                        style={[
                          styles.convoName,
                          hasUnread && styles.convoNameUnread,
                          suspended && styles.convoNameSuspended,
                        ]}
                        numberOfLines={1}
                      >
                        {name}
                      </Text>
                      {suspended && (
                        <View style={styles.suspendedTag}>
                          <Text style={styles.suspendedTagText}>Suspended</Text>
                        </View>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.convoTime,
                        hasUnread && styles.convoTimeUnread,
                      ]}
                    >
                      {relativeTime(convo.created_at)}
                    </Text>
                  </View>

                  <View style={styles.convoBottom}>
                    <Text
                      style={[
                        styles.convoMessage,
                        hasUnread && styles.convoMessageUnread,
                        suspended && styles.convoMessageSuspended,
                      ]}
                      numberOfLines={1}
                    >
                      {suspended
                        ? "Account suspended — cannot be contacted"
                        : convo.last_message}
                    </Text>
                    {!suspended && hasUnread ? (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>
                          {unread > 99 ? "99+" : unread}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: 90 }} />
      </ScrollView>

      {isTutor ? <TutorBottomNav /> : <StudentBottomNav />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: "#FFFBFA" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 50,
    paddingBottom: 8,
    paddingHorizontal: 20,
  },

  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FF9E6D",
    justifyContent: "center",
    alignItems: "center",
  },

  topHeader: {
    fontFamily: "Domine",
    fontSize: 16,
    color: "#28221B",
  },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },

  title: {
    fontFamily: "Domine",
    fontSize: 24,
    marginBottom: 14,
    color: "#28221B",
  },

  searchBox: {
    height: 38,
    backgroundColor: "#F1E5E1",
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    marginBottom: 14,
  },

  searchInput: {
    flex: 1,
    fontFamily: "Outfit",
    fontSize: 12,
    marginLeft: 8,
    color: "#28221B",
  },

  convoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EFE6E1",
  },

  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  avatarInitial: {
    color: "#FFFBFA",
    fontSize: 18,
    fontWeight: "700",
  },

  convoInfo: { flex: 1 },

  convoTop: {
    flexDirection: "row",
    justifyContent: "space-between",
  },

  convoNameRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginRight: 8,
  },

  convoName: {
    fontFamily: "Outfit",
    fontSize: 15,
    color: "#28221B",
    flexShrink: 1,
  },

  // When the conversation has unread messages, render the partner's name in
  // brand orange + bold so the inbox makes it obvious there's something new.
  convoNameUnread: {
    fontWeight: "700",
    color: "#FF9E6D",
  },

  convoNameSuspended: {
    color: "#A89080",
  },

  suspendedTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: "#FFF1E8",
  },

  suspendedTagText: {
    fontFamily: "Outfit",
    fontSize: 10,
    fontWeight: "700",
    color: "#DD8153",
  },

  convoMessageSuspended: {
    color: "#A89080",
    fontStyle: "italic",
  },

  convoTime: {
    fontSize: 12,
    color: "#aaa",
  },

  convoTimeUnread: {
    color: "#FF9E6D",
    fontWeight: "700",
  },

  convoBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  convoMessage: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#7E6D66",
    flex: 1,
  },

  convoMessageUnread: {
    color: "#28221B",
    fontWeight: "600",
  },

  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 7,
    backgroundColor: "#FF9E6D",
    alignItems: "center",
    justifyContent: "center",
  },

  unreadBadgeText: {
    fontFamily: "Outfit",
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFBFA",
  },

  empty: {
    alignItems: "center",
    paddingVertical: 50,
    paddingHorizontal: 24,
  },

  emptyTitle: {
    fontFamily: "Domine",
    fontSize: 16,
    color: "#28221B",
    marginTop: 10,
  },

  emptyText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#7E6D66",
    textAlign: "center",
    marginTop: 4,
  },
});
