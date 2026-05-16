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
import { getDashboard, listPendingTutors } from "@/services/admin";

function StatCard({ label, value }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, pending] = await Promise.all([
        getDashboard(),
        listPendingTutors().catch(() => []),
      ]);
      setStats(data);
      setPendingCount(Array.isArray(pending) ? pending.length : 0);
    } catch {
      setStats(null);
      setPendingCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Admin Dashboard</Text>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color="#FF9E6D" style={{ marginTop: 8 }} />
        ) : stats ? (
          <View style={styles.statsGrid}>
            <StatCard label="Tutors" value={stats.users?.total_teachers ?? 0} />
            <StatCard label="Students" value={stats.users?.total_students ?? 0} />
            <StatCard
              label="Total sessions"
              value={stats.sessions?.total ?? 0}
            />
            <StatCard label="Pending tutors" value={pendingCount} />
            <StatCard
              label="Pending flags"
              value={stats.alerts?.pending_flags ?? 0}
            />
            <StatCard
              label="Active suspensions"
              value={stats.alerts?.active_suspensions ?? 0}
            />
            <StatCard
              label="Revenue (€)"
              value={`€${Number(stats.financials?.total_revenue || 0).toFixed(2)}`}
            />
          </View>
        ) : null}

        <Text style={styles.title}>Actions</Text>

        <ActionItem
          icon="shield-checkmark"
          text="Approve/Reject Tutor Accounts"
          route="/admin-approvals"
          badge={pendingCount}
        />

        <ActionItem
          icon="people"
          text="Manage Students"
          route="/admin-students"
        />

        <ActionItem icon="school" text="Manage Tutors" route="/admin-tutors" />

        <ActionItem
          icon="construct"
          text="Create Language Exam"
          route="/admin-exam-builder"
        />

        <ActionItem
          icon="document-text"
          text="View Published Exams"
          route="/admin-exams"
        />

        <ActionItem
          icon="swap-horizontal"
          text="Transactions"
          route="/admin-transactions"
        />

        <ActionItem
          icon="person-circle"
          text="Profile Settings"
          route="/admin-profile"
        />
      </ScrollView>

      <View style={styles.bottomNav}>
        <TouchableOpacity onPress={() => router.push("/admin-dashboard")}>
          <Ionicons name="home" size={22} color="#28221B" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/admin-approvals")}>
          <Ionicons name="shield-checkmark" size={22} color="#28221B" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/admin-transactions")}>
          <Ionicons name="swap-horizontal" size={22} color="#28221B" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push("/admin-profile")}>
          <Ionicons name="person-circle" size={22} color="#28221B" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ActionItem({ icon, text, route, badge = 0 }) {
  return (
    <TouchableOpacity
      style={styles.actionRow}
      onPress={() => router.push(route)}
    >
      <Ionicons name={icon} size={22} color="#28221B" />
      <Text style={styles.actionText}>{text}</Text>
      {badge > 0 && (
        <View style={styles.actionBadge}>
          <Text style={styles.actionBadgeText}>
            {badge > 99 ? "99+" : badge}
          </Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={22} color="#28221B" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFBFA",
    paddingTop: 55,
    paddingHorizontal: 24,
  },

  header: {
    fontFamily: "Domine",
    fontSize: 15,
    textAlign: "center",
    color: "#28221B",
    marginBottom: 18,
  },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 18,
  },

  statCard: {
    minWidth: "30%",
    flexGrow: 1,
    backgroundColor: "#F3EDEA",
    borderRadius: 12,
    padding: 12,
  },

  statLabel: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#7E6D66",
  },

  statValue: {
    fontFamily: "Domine",
    fontSize: 18,
    fontWeight: "700",
    color: "#28221B",
    marginTop: 4,
  },

  title: {
    fontFamily: "Domine",
    fontSize: 20,
    color: "#28221B",
    marginBottom: 14,
    marginTop: 6,
  },

  actionRow: {
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },

  actionText: {
    flex: 1,
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#28221B",
    marginLeft: 12,
  },

  actionBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 7,
    backgroundColor: "#FF9E6D",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },

  actionBadgeText: {
    fontFamily: "Outfit",
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFBFA",
  },

  bottomNav: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 46,
    backgroundColor: "#FDF0EC",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
});
