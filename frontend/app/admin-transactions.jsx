import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { safeBack } from "@/hooks/use-safe-back";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { listAdminTransactions } from "@/services/admin";

function relativeTime(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (days <= 0) return `Today · ${time}`;
  if (days === 1) return `1 day ago · ${time}`;
  if (days < 7) return `${days} days ago · ${time}`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? `1 week ago · ${time}` : `${weeks} weeks ago · ${time}`;
}

function planLabel(plan) {
  if (plan === "hour_by_hour") return "Hourly payment";
  if (plan === "50_50") return "50% payment";
  if (plan === "80_20") return "80% payment";
  return "Payment";
}

export default function AdminTransactions() {
  const [search, setSearch] = useState("");
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAdminTransactions({ limit: 100 });
      setTransactions(Array.isArray(data) ? data : []);
    } catch {
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = transactions.filter((item) => {
    const q = search.toLowerCase();
    return (
      !q ||
      (item.teacher_name || "").toLowerCase().includes(q) ||
      (item.student_name || "").toLowerCase().includes(q) ||
      (item.level || "").toLowerCase().includes(q)
    );
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
          <Ionicons name="chevron-back" size={22} color="#FFFBFA" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Transaction Overview</Text>
        <View style={{ width: 30 }} />
      </View>

      <Text style={styles.title}>Recent Transactions</Text>
      <Text style={styles.subtitle}>
        Review all transactions made on the platform
      </Text>

      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={16} color="#7E6D66" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search for name"
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

      <ScrollView showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator color="#FF9E6D" style={{ marginTop: 30 }} />
        ) : filtered.length === 0 ? (
          <Text style={styles.empty}>No transactions found</Text>
        ) : (
          filtered.map((item) => {
            const description = [
              planLabel(item.payment_plan),
              item.student_name ? `by ${item.student_name}` : null,
              item.teacher_name ? `to ${item.teacher_name}` : null,
              `€${Number(item.amount || 0).toFixed(2)}`,
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <View key={item.id} style={styles.transactionRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.time}>
                    {relativeTime(item.paid_at || item.created_at)}
                  </Text>
                  <Text style={styles.transactionTitle}>
                    {item.level ? `${item.level} Lesson` : "Lesson"}
                  </Text>
                  <Text style={styles.description}>{description}</Text>
                </View>

                <TouchableOpacity
                  style={styles.playBtn}
                  onPress={() =>
                    router.push({
                      pathname: "/admin-transaction-details",
                      params: { transactionId: item.id },
                    })
                  }
                >
                  <Ionicons name="play" size={14} color="#28221B" />
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={styles.bottomNav}>
        <TouchableOpacity onPress={() => router.push("/admin-dashboard")}>
          <Ionicons name="home" size={20} color="#28221B" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/admin-approvals")}>
          <Ionicons name="shield-checkmark" size={20} color="#28221B" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/admin-transactions")}>
          <Ionicons name="swap-horizontal" size={20} color="#28221B" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/admin-profile")}>
          <Ionicons name="person-circle" size={20} color="#28221B" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFBFA",
    paddingHorizontal: 22,
    paddingTop: 48,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 28,
  },

  backBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FF9E6D",
    justifyContent: "center",
    alignItems: "center",
  },

  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Domine",
    fontSize: 13,
    color: "#28221B",
  },

  title: {
    fontFamily: "Domine",
    fontSize: 18,
    color: "#28221B",
  },

  subtitle: {
    fontFamily: "Outfit",
    fontSize: 9,
    color: "#28221B",
    marginBottom: 18,
  },

  searchBox: {
    height: 34,
    backgroundColor: "#F1E5E1",
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    marginBottom: 18,
  },

  searchInput: {
    flex: 1,
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#28221B",
    marginLeft: 6,
  },

  transactionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#EFE6E1",
  },

  time: {
    fontFamily: "Outfit",
    fontSize: 9,
    color: "#28221B",
    marginBottom: 4,
  },

  transactionTitle: {
    fontFamily: "Outfit",
    fontSize: 13,
    fontWeight: "700",
    color: "#28221B",
    marginBottom: 4,
  },

  description: {
    fontFamily: "Outfit",
    fontSize: 10,
    color: "#28221B",
  },

  playBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EFE6E1",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 12,
  },

  empty: {
    fontFamily: "Outfit",
    fontSize: 12,
    textAlign: "center",
    color: "#7E6D66",
    marginTop: 40,
  },

  bottomNav: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 44,
    backgroundColor: "#FDF0EC",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
});
