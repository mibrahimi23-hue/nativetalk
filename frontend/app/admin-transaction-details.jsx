import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { safeBack } from "@/hooks/use-safe-back";
import { getAdminTransaction } from "@/services/admin";

function splitName(full) {
  if (!full) return { first: "", last: "" };
  const parts = String(full).trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export default function AdminTransactionDetails() {
  const { transactionId } = useLocalSearchParams();
  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!transactionId) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const data = await getAdminTransaction(transactionId);
        if (!cancelled) setTransaction(data);
      } catch {
        if (!cancelled) setTransaction(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [transactionId]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#FF9E6D" />
      </View>
    );
  }

  if (!transaction) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
            <Ionicons name="chevron-back" size={22} color="#FFFBFA" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Transaction Page</Text>
          <View style={{ width: 30 }} />
        </View>
        <Text style={styles.empty}>Transaction not found.</Text>
      </View>
    );
  }

  const studentEmail = transaction.student_email || "—";
  const teacherEmail = transaction.teacher_email || "—";
  const balance = `€${Number(transaction.teacher_balance || 0).toFixed(2)}`;
  const amount = `€${Number(transaction.amount || 0).toFixed(2)}`;
  const from = splitName(transaction.student_name);
  const to = splitName(transaction.teacher_name);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
          <Ionicons name="chevron-back" size={22} color="#FFFBFA" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Transaction Page</Text>
        <View style={{ width: 30 }} />
      </View>

      <Text style={styles.sectionTitle}>Student Account</Text>

      <TouchableOpacity onPress={() => Alert.alert("Email", studentEmail)}>
        <Text style={styles.info}>✉ Email: {studentEmail}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.row}
        onPress={() =>
          router.push({
            pathname: "/admin-student-transaction-history",
            params: { studentEmail, studentName: transaction.student_name || "" },
          })
        }
      >
        <Text style={styles.info}>☮ Transaction history</Text>
        <Ionicons name="chevron-forward" size={18} color="#28221B" />
      </TouchableOpacity>

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>Tutor Account</Text>

      <TouchableOpacity onPress={() => Alert.alert("Email", teacherEmail)}>
        <Text style={styles.info}>✉ Email: {teacherEmail}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => Alert.alert("Balance", balance)}>
        <Text style={styles.info}>☮ Balance: {balance}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.row}
        onPress={() =>
          router.push({
            pathname: "/admin-tutor-transaction-history",
            params: { teacherEmail, teacherName: transaction.teacher_name || "" },
          })
        }
      >
        <Text style={styles.info}>☮ Transaction history</Text>
        <Ionicons name="chevron-forward" size={18} color="#28221B" />
      </TouchableOpacity>

      <View style={styles.divider} />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Transaction details</Text>
        <Text style={styles.amount}>{amount}</Text>

        <View style={styles.pillRow}>
          <TouchableOpacity
            style={styles.pill}
            onPress={() =>
              Alert.alert("From", transaction.student_name || "—")
            }
          >
            <Text style={styles.pillText}>
              From: {from.first}
              {from.last ? `\n${from.last}` : ""}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.pill}
            onPress={() =>
              Alert.alert("To", transaction.teacher_name || "—")
            }
          >
            <Text style={styles.pillText}>
              To: {to.first}
              {to.last ? `\n${to.last}` : ""}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

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
  center: {
    justifyContent: "center",
    alignItems: "center",
  },
  empty: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#7E6D66",
    textAlign: "center",
    marginTop: 40,
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
    fontSize: 13,
    color: "#28221B",
  },
  sectionTitle: {
    fontFamily: "Domine",
    fontSize: 18,
    color: "#28221B",
    marginBottom: 18,
  },
  info: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#28221B",
    marginBottom: 18,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  divider: {
    height: 1,
    backgroundColor: "#D8C7C0",
    marginBottom: 18,
  },
  card: {
    backgroundColor: "#FFFBFA",
    borderRadius: 14,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  cardTitle: {
    fontFamily: "Domine",
    fontSize: 14,
    color: "#28221B",
    marginBottom: 12,
  },
  amount: {
    fontFamily: "Domine",
    fontSize: 28,
    color: "#28221B",
    marginBottom: 26,
  },
  pillRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  pill: {
    width: "48%",
    backgroundColor: "#F8EFEC",
    borderRadius: 18,
    paddingVertical: 10,
    alignItems: "center",
  },
  pillText: {
    fontFamily: "Outfit",
    fontSize: 11,
    textAlign: "center",
    color: "#28221B",
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
