import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { safeBack } from "@/hooks/use-safe-back";
import { listAdminTransactions } from "@/services/admin";

function formatDate(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate(),
  ).padStart(2, "0")}/${d.getFullYear()}`;
}

function planLabel(plan) {
  if (plan === "hour_by_hour") return "Hourly payment";
  if (plan === "50_50") return "50% payment";
  if (plan === "80_20") return "80% payment";
  return "Payment";
}

export default function AdminTutorTransactionHistory() {
  // The admin transaction details page pushes us here with the tutor's
  // email and display name. We filter the platform-wide transaction feed
  // down to rows that belong to this tutor.
  const { teacherEmail, teacherName } = useLocalSearchParams();
  const targetEmail = (
    Array.isArray(teacherEmail) ? teacherEmail[0] : teacherEmail || ""
  )
    .toString()
    .toLowerCase();
  const targetName = (
    Array.isArray(teacherName) ? teacherName[0] : teacherName || ""
  )
    .toString()
    .toLowerCase();

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAdminTransactions({ limit: 200 });
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

  // Filter and summarise this tutor's earnings. The admin transactions feed
  // includes both `paypal_payment` rows (incoming student money) and
  // `tutor_payout` rows (released to the tutor). For the balance/earnings
  // header we count the tutor_payout rows; for the list we show everything
  // touching this tutor.
  const tutorRows = useMemo(() => {
    if (!targetEmail && !targetName) return transactions;
    return transactions.filter((t) => {
      const email = (t.teacher_email || "").toString().toLowerCase();
      const name = (t.teacher_name || "").toString().toLowerCase();
      if (targetEmail && email) return email === targetEmail;
      if (targetName) return name === targetName;
      return false;
    });
  }, [transactions, targetEmail, targetName]);

  const earnings = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfToday.getDate() - 7);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let total = 0;
    let today = 0;
    let week = 0;
    let month = 0;
    tutorRows.forEach((t) => {
      if (t.kind !== "tutor_payout") return;
      const amount = Number(t.teacher_payout ?? t.amount ?? 0) || 0;
      total += amount;
      const ts = new Date(t.paid_at || t.created_at || 0);
      if (Number.isNaN(ts.getTime())) return;
      if (ts >= startOfToday) today += amount;
      if (ts >= startOfWeek) week += amount;
      if (ts >= startOfMonth) month += amount;
    });
    return {
      total: total.toFixed(2),
      today: today.toFixed(2),
      week: week.toFixed(2),
      month: month.toFixed(2),
    };
  }, [tutorRows]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
          <Ionicons name="chevron-back" size={22} color="#FFFBFA" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Tutor Transaction History</Text>
        <View style={{ width: 30 }} />
      </View>

      {(targetName || targetEmail) && (
        <Text style={styles.studentLine}>
          {targetName ? targetName : ""}
          {targetName && targetEmail ? " · " : ""}
          {targetEmail ? targetEmail : ""}
        </Text>
      )}

      {/* Balance Card */}
      <View style={styles.balanceCard}>
        <View>
          <Text style={styles.small}>Total Balance</Text>
          <Text style={styles.balance}>€{earnings.total}</Text>
        </View>
        <View>
          <Text style={styles.small}>Available Funds</Text>
        </View>
      </View>

      {/* Earnings */}
      <View style={styles.earningsRow}>
        <Text style={styles.earningText}>
          Today's Earnings{"\n"}€{earnings.today}
        </Text>
      </View>

      <View style={styles.earningsRow2}>
        <Text style={styles.earningText}>
          Last 7 Days{"\n"}€{earnings.week}
        </Text>
        <Text style={styles.earningText}>
          This Month{"\n"}€{earnings.month}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Recent Transactions</Text>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 80 }}
      >
        {loading ? (
          <ActivityIndicator color="#FF9E6D" style={{ marginTop: 30 }} />
        ) : tutorRows.length === 0 ? (
          <Text style={styles.empty}>No transactions yet for this tutor.</Text>
        ) : (
          tutorRows.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.transactionRow}
              onPress={() =>
                router.push({
                  pathname: "/admin-transaction-details",
                  params: { transactionId: item.id },
                })
              }
            >
              <Text style={styles.transactionTitle}>
                {item.level ? `${item.level} Lesson` : "Lesson"} ·{" "}
                €{Number(
                  item.kind === "tutor_payout"
                    ? item.teacher_payout ?? item.amount
                    : item.amount,
                ).toFixed(2)}
              </Text>
              <Text style={styles.transactionInfo}>
                {planLabel(item.payment_plan)} -{" "}
                {formatDate(item.paid_at || item.created_at)}
              </Text>
              <Text style={styles.received}>
                {item.kind === "tutor_payout"
                  ? "Received"
                  : item.student_name
                    ? `From ${item.student_name}`
                    : "Payment"}
              </Text>
            </TouchableOpacity>
          ))
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
    paddingTop: 48,
    paddingHorizontal: 22,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
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

  studentLine: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
    marginBottom: 14,
    textAlign: "center",
  },

  balanceCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#F8EFEC",
    padding: 14,
    borderRadius: 14,
    marginBottom: 18,
  },

  small: {
    fontFamily: "Outfit",
    fontSize: 10,
    color: "#7E6D66",
  },

  balance: {
    fontFamily: "Domine",
    fontSize: 26,
    color: "#28221B",
  },

  earningsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },

  earningsRow2: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },

  earningText: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#28221B",
  },

  sectionTitle: {
    fontFamily: "Domine",
    fontSize: 18,
    marginBottom: 10,
    color: "#28221B",
  },

  transactionRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#EFE6E1",
  },

  transactionTitle: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    marginBottom: 4,
  },

  transactionInfo: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#7E6D66",
  },

  received: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#7E6D66",
  },

  empty: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
    textAlign: "center",
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
