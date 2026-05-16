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

export default function AdminStudentTransactionHistory() {
  // The Manage Students screen pushes us here with the student's email and
  // display name as URL params. We use the email to filter the platform
  // transaction feed down to only this student's rows.
  const { studentEmail, studentName } = useLocalSearchParams();
  const targetEmail = (
    Array.isArray(studentEmail) ? studentEmail[0] : studentEmail || ""
  )
    .toString()
    .toLowerCase();
  const targetName = (
    Array.isArray(studentName) ? studentName[0] : studentName || ""
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

  // Filter the platform-wide transaction feed to rows belonging to *this*
  // student. We prefer matching by email (unique) and fall back to the
  // student's display name if email isn't carried on a particular row.
  const studentTransactions = useMemo(() => {
    if (!targetEmail && !targetName) return transactions;
    return transactions.filter((t) => {
      const email = (t.student_email || "").toString().toLowerCase();
      const name = (t.student_name || "").toString().toLowerCase();
      if (targetEmail && email) return email === targetEmail;
      if (targetName) return name === targetName;
      return false;
    });
  }, [transactions, targetEmail, targetName]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
          <Ionicons name="chevron-back" size={22} color="#FFFBFA" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Student Transaction History</Text>
        <View style={{ width: 30 }} />
      </View>

      {(targetName || targetEmail) && (
        <Text style={styles.studentLine}>
          {targetName ? targetName : ""}
          {targetName && targetEmail ? " · " : ""}
          {targetEmail ? targetEmail : ""}
        </Text>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 80 }}
      >
        <Text style={styles.title}>Recent Transactions</Text>

        {loading ? (
          <ActivityIndicator color="#FF9E6D" style={{ marginTop: 30 }} />
        ) : studentTransactions.length === 0 ? (
          <Text style={styles.empty}>
            No transactions yet for this student.
          </Text>
        ) : (
          studentTransactions.map((item) => (
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
                €{Number(item.amount || 0).toFixed(2)}
              </Text>
              <Text style={styles.transactionInfo}>
                {planLabel(item.payment_plan)} -{" "}
                {formatDate(item.paid_at || item.created_at)}
              </Text>
              <Text style={styles.transfer}>
                {item.teacher_name
                  ? `To ${item.teacher_name}`
                  : item.kind === "tutor_payout"
                    ? "Payout"
                    : "Transfer"}
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FF9E6D",
    justifyContent: "center",
    alignItems: "center",
  },

  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: "Domine",
    fontSize: 15,
    color: "#28221B",
  },

  studentLine: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
    marginBottom: 14,
    textAlign: "center",
  },

  title: {
    fontFamily: "Domine",
    fontSize: 22,
    color: "#28221B",
    marginBottom: 18,
  },

  transactionRow: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#EFE6E1",
  },

  transactionTitle: {
    fontFamily: "Outfit",
    fontSize: 15,
    color: "#28221B",
    marginBottom: 6,
  },

  transactionInfo: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#7E6D66",
    marginBottom: 6,
  },

  transfer: {
    fontFamily: "Outfit",
    fontSize: 14,
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
