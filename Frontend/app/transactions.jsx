import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { TutorBottomNav } from "@/components/tutor-bottom-nav";
import { safeBack } from "@/hooks/use-safe-back";
import { useUser } from "@/contexts/user-context";
import { getTeacherEarnings } from "@/services/payments";
import { getTutorPaypalTransactions } from "@/services/paypal";
import { listMySessions } from "@/services/sessions";

function formatDate(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

export default function Transactions() {
  const { user, profile } = useUser();
  const teacherId = user?.teacher_id;
  const [earnings, setEarnings] = useState({ today: 0, this_week: 0, this_month: 0, total: 0 });
  const [completed, setCompleted] = useState([]);
  const [paypalRows, setPaypalRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!teacherId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Two parallel sources:
      //   - /paypal/teacher/{id} → today/this_week/this_month/total + PayPal rows
      //     (incoming money — populated as soon as the student pays).
      //   - /payments/teacher/{id} → post-release tutor payouts (after reviews).
      //   - /sessions/mine (no filter) → fetch everything and split client-side
      //     so absent / cancelled rows also appear in the history list,
      //     not just `completed`.
      const [paypal, payouts, allSessions] = await Promise.all([
        getTutorPaypalTransactions(teacherId).catch(() => null),
        getTeacherEarnings(teacherId).catch(() => null),
        listMySessions().catch(() => []),
      ]);
      // Surface anything that's no longer upcoming. The label per status is
      // applied in the render below.
      const HISTORY_STATUSES = new Set([
        "completed",
        "absent",
        "no_show",
        "cancelled",
      ]);
      const sessions = (Array.isArray(allSessions) ? allSessions : [])
        .filter((s) => HISTORY_STATUSES.has(s.status))
        .sort((a, b) => new Date(b.scheduled_at) - new Date(a.scheduled_at));

      const totalEarned = payouts ? Number(payouts.total_earned || 0) : 0;
      setEarnings({
        today: paypal ? Number(paypal.today || 0) : 0,
        this_week: paypal ? Number(paypal.this_week || 0) : 0,
        this_month: paypal ? Number(paypal.this_month || 0) : 0,
        // "Total Balance" combines released payouts with completed-but-unreleased
        // PayPal payments so the tutor sees their gross balance.
        total: paypal ? Number(paypal.total || 0) + totalEarned : totalEarned,
      });
      setPaypalRows(
        paypal && Array.isArray(paypal.transactions) ? paypal.transactions : [],
      );
      setCompleted(Array.isArray(sessions) ? sessions : []);
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack("/tutor-dashboard")}>
          <Ionicons name="chevron-back" size={22} color="#FFFBFA" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Transactions</Text>

        <View style={{ width: 30 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 90 }} showsVerticalScrollIndicator={false}>
        <View style={styles.balanceCard}>
          <View>
            <Text style={styles.smallText}>Total Balance</Text>
            <Text style={styles.balance}>€{Number(earnings.total || 0).toFixed(2)}</Text>
          </View>

          <Text style={styles.smallText}>Available Funds</Text>
        </View>

        <View style={styles.earningsRow}>
          <View>
            <Text style={styles.smallText}>Today's Earnings</Text>
            <Text style={styles.boldText}>€{Number(earnings.today || 0).toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View>
            <Text style={styles.smallText}>This Week's Earnings</Text>
            <Text style={styles.boldText}>€{Number(earnings.this_week || 0).toFixed(2)}</Text>
          </View>

          <View>
            <Text style={styles.smallText}>This Month's Earnings</Text>
            <Text style={styles.boldText}>€{Number(earnings.this_month || 0).toFixed(2)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Transaction history</Text>

        {loading ? (
          <ActivityIndicator color="#FF9E6D" style={{ marginTop: 20 }} />
        ) : paypalRows.length === 0 ? (
          <Text style={styles.empty}>No payments received yet.</Text>
        ) : (
          paypalRows.map((row) => (
            <TouchableOpacity key={row.id} style={styles.transactionCard}>
              <Text style={styles.transactionTitle}>
                {row.student_name || "Student"} · €{Number(row.amount || 0).toFixed(2)}
              </Text>
              <Text style={styles.transactionSubtitle}>
                {profile.language || "Language"} ·{" "}
                {formatDate(row.completed_at || row.created_at)}
              </Text>
              <Text style={styles.transactionAmount}>
                {row.status === "completed" ? "Paid" : row.status}
              </Text>
            </TouchableOpacity>
          ))
        )}

        {completed.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
              Completed Sessions
            </Text>
            {completed.map((session) => {
              // Render label per status so absent / cancelled history rows
              // don't pretend they need a review.
              const isCompleted = session.status === "completed";
              const needsTutorReview =
                isCompleted && !session.teacher_review_done;
              let statusLabel = "";
              if (session.status === "absent") {
                statusLabel = "Completed with absent";
              } else if (session.status === "no_show") {
                statusLabel = "Tutor no-show";
              } else if (session.status === "cancelled") {
                statusLabel = "Cancelled";
              } else if (session.payment_released) {
                statusLabel = "Released";
              } else if (needsTutorReview) {
                statusLabel = "Pending review";
              } else {
                statusLabel = "Awaiting student review";
              }
              return (
                <TouchableOpacity
                  key={session.id}
                  style={styles.transactionCard}
                  activeOpacity={needsTutorReview ? 0.7 : 1}
                  onPress={() => {
                    if (!needsTutorReview) return;
                    router.push({
                      pathname: "/write-review",
                      params: { sessionId: String(session.id) },
                    });
                  }}
                >
                  <Text style={styles.transactionTitle}>
                    {session.level} session
                  </Text>
                  <Text style={styles.transactionSubtitle}>
                    {profile.language || "Language"} ·{" "}
                    {formatDate(session.scheduled_at)}
                  </Text>
                  <Text style={styles.transactionAmount}>{statusLabel}</Text>
                </TouchableOpacity>
              );
            })}
          </>
        ) : null}
      </ScrollView>

      <TutorBottomNav />
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
    marginBottom: 22,
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
    fontSize: 14,
    color: "#28221B",
  },

  balanceCard: {
    backgroundColor: "#F3EDEA",
    borderRadius: 14,
    padding: 16,
    marginBottom: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },

  earningsRow: {
    marginBottom: 14,
  },

  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },

  smallText: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#7E6D66",
  },

  balance: {
    fontFamily: "Domine",
    fontSize: 32,
    color: "#28221B",
    fontWeight: "700",
    marginTop: 4,
  },

  boldText: {
    fontFamily: "Outfit",
    fontSize: 16,
    color: "#28221B",
    fontWeight: "700",
    marginTop: 4,
  },

  sectionTitle: {
    fontFamily: "Domine",
    fontSize: 17,
    color: "#28221B",
    marginBottom: 10,
  },

  transactionCard: {
    backgroundColor: "#FFFBFA",
    borderWidth: 1,
    borderColor: "#F0EDEA",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },

  transactionTitle: {
    fontFamily: "Outfit",
    fontSize: 14,
    fontWeight: "700",
    color: "#28221B",
  },

  transactionSubtitle: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
    marginTop: 2,
  },

  transactionAmount: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#FF9E6D",
    fontWeight: "700",
    marginTop: 4,
  },

  empty: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#A89080",
    textAlign: "center",
    marginTop: 20,
  },
});
