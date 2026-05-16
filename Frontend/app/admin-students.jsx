import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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
import { safeBack } from "@/hooks/use-safe-back";
import { listAdminUsers, suspendUser } from "@/services/admin";

export default function AdminStudents() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [suspending, setSuspending] = useState(false);
  const [showDashboardButton, setShowDashboardButton] = useState(false);
  const [resultMessage, setResultMessage] = useState(null);
  const [resultTone, setResultTone] = useState("success");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listAdminUsers("student", { limit: 200 });
      setStudents(Array.isArray(data) ? data : []);
    } catch {
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = students.filter((student) =>
    (student.name || "").toLowerCase().includes(search.toLowerCase()),
  );

  const toggle = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((s) => selectedIds.includes(s.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) =>
        prev.filter((id) => !filtered.some((s) => s.id === id)),
      );
    } else {
      setSelectedIds((prev) =>
        Array.from(new Set([...prev, ...filtered.map((s) => s.id)])),
      );
    }
  };

  const reasonFor = (student) => {
    const attendanceStr = student.attendance || "100%";
    const attendanceNum = parseInt(String(attendanceStr).replace("%", ""), 10);
    const reschedules = student.reschedules ?? 0;
    if (reschedules < 5) return `${reschedules} reschedules`;
    if (attendanceNum !== 0) return `${attendanceStr} attendance`;
    return "criteria not met";
  };

  const suspendStudents = async () => {
    if (selectedIds.length === 0) {
      setResultTone("error");
      setResultMessage("Please select at least one student.");
      return;
    }

    const targets = students.filter((s) => selectedIds.includes(s.id));
    const ineligible = targets.filter((s) => s.eligible !== "Yes");

    if (ineligible.length > 0) {
      const lines = ineligible.map(
        (s) => `${s.name} can't be suspended — ${reasonFor(s)}.`,
      );
      setResultTone("error");
      setResultMessage(lines.join("\n"));
      setShowDashboardButton(true);
      return;
    }

    setSuspending(true);
    setResultMessage(null);
    try {
      const results = await Promise.all(
        selectedIds.map((id) => {
          const target = targets.find((s) => s.id === id);
          const reason =
            (target?.reschedules ?? 0) >= 5 ? "reschedule_limit" : "absence_limit";
          return suspendUser({
            user_id: id,
            reason,
            notes: "Suspended via admin manage students screen.",
          })
            .then(() => ({ ok: true, id }))
            .catch((err) => ({
              ok: false,
              id,
              message: err?.message || "Suspension failed.",
            }));
        })
      );
      const succeeded = results.filter((r) => r.ok);
      const failed = results.filter((r) => !r.ok);

      setSelectedIds([]);
      await load();

      if (failed.length === 0) {
        setResultTone("success");
        setResultMessage(
          `${succeeded.length} student${
            succeeded.length === 1 ? "" : "s"
          } suspended successfully. Their paid transactions remain visible in Transaction Overview.`,
        );
      } else {
        const lines = failed.map((r) => {
          const target = targets.find((t) => t.id === r.id);
          const name = target?.name || "This account";
          return `${name} — ${r.message}`;
        });
        setResultTone(succeeded.length === 0 ? "error" : "success");
        setResultMessage(lines.join("\n"));
      }

      setShowDashboardButton(true);
    } finally {
      setSuspending(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
          <Ionicons name="chevron-back" size={22} color="#FFFBFA" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Manage Students</Text>
        <View style={{ width: 30 }} />
      </View>

      <Text style={styles.title}>Student List</Text>
      <Text style={styles.subtitle}>Manage student information</Text>

      <View style={styles.searchBox}>
        <Ionicons name="search-outline" size={16} color="#7E6D66" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search for students"
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

      <View style={styles.toolbarRow}>
        <Text style={styles.toolbarText}>
          {selectedIds.length > 0
            ? `${selectedIds.length} selected`
            : `${filtered.length} student${filtered.length === 1 ? "" : "s"}`}
        </Text>
        <View style={styles.toolbarActions}>
          {filtered.length > 0 && (
            <TouchableOpacity onPress={toggleSelectAll}>
              <Text style={styles.linkBtn}>
                {allFilteredSelected ? "Clear all" : "Select all"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 90 }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color="#FF9E6D" style={{ marginTop: 30 }} />
        ) : filtered.length === 0 ? (
          <Text style={styles.emptyText}>No students match your search.</Text>
        ) : (
          filtered.map((student) => {
            const checked = selectedIds.includes(student.id);
            return (
              <TouchableOpacity
                key={student.id}
                style={[styles.studentRow, checked && styles.studentRowSelected]}
                onPress={() => toggle(student.id)}
              >
                <Ionicons
                  name={checked ? "checkbox" : "square-outline"}
                  size={20}
                  color={checked ? "#FF9E6D" : "#28221B"}
                />

                <View style={styles.studentInfo}>
                  <Text style={styles.name}>{student.name}</Text>
                  <Text style={styles.info}>
                    Attendance: {student.attendance || "100%"}
                  </Text>
                  <Text style={styles.info}>
                    Continuous unattended reschedules: {student.reschedules ?? 0}
                  </Text>
                  <Text style={styles.info}>
                    Eligible for Suspension: {student.eligible}
                  </Text>
                  {student.is_suspended ? (
                    <Text style={styles.suspendedTag}>Currently suspended</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {resultMessage ? (
        <View style={styles.resultBanner}>
          <Ionicons
            name={
              resultTone === "error"
                ? "alert-circle-outline"
                : "checkmark-circle-outline"
            }
            size={14}
            color="#FF9E6D"
          />
          <Text style={styles.resultText}>{resultMessage}</Text>
        </View>
      ) : null}

      <View style={styles.actionBar}>
        {showDashboardButton ? (
          <TouchableOpacity
            style={styles.dashboardBtn}
            onPress={() => router.replace("/admin-dashboard")}
          >
            <Ionicons name="home-outline" size={17} color="#FFFBFA" />
            <Text style={styles.suspendText}>Back to Dashboard</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.suspendBtn,
              (selectedIds.length === 0 || suspending) && styles.suspendBtnDisabled,
            ]}
            disabled={suspending}
            onPress={suspendStudents}
          >
            {suspending ? (
              <ActivityIndicator color="#FFFBFA" />
            ) : (
              <Text style={styles.suspendText}>
                {selectedIds.length > 1
                  ? `Suspend ${selectedIds.length} accounts`
                  : "Suspend Account"}
              </Text>
            )}
          </TouchableOpacity>
        )}
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
    marginBottom: 20,
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

  title: {
    fontFamily: "Domine",
    fontSize: 18,
    color: "#28221B",
  },

  subtitle: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
    marginBottom: 14,
  },

  searchBox: {
    height: 38,
    backgroundColor: "#F1E5E1",
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    marginBottom: 12,
  },

  searchInput: {
    flex: 1,
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#28221B",
    marginLeft: 6,
  },

  toolbarRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },

  toolbarText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
  },

  toolbarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },

  linkBtn: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#FF9E6D",
    fontWeight: "600",
  },

  studentRow: {
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0EDEA",
    borderRadius: 8,
  },

  studentRowSelected: {
    backgroundColor: "#FFF1E8",
  },

  studentInfo: {
    marginLeft: 12,
    flex: 1,
  },

  name: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    fontWeight: "600",
  },

  info: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#7E6D66",
    marginTop: 2,
  },

  suspendedTag: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#DD8153",
    marginTop: 4,
    fontWeight: "700",
  },

  emptyText: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#A89080",
    textAlign: "center",
    marginTop: 30,
  },

  resultBanner: {
    position: "absolute",
    left: 22,
    right: 22,
    bottom: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#FFF1E8",
  },

  resultBannerSuccess: {
    backgroundColor: "#FFF1E8",
  },

  resultBannerError: {
    backgroundColor: "#FFF1E8",
  },

  resultText: {
    flex: 1,
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#7E6D66",
    lineHeight: 14,
  },

  actionBar: {
    position: "absolute",
    bottom: 22,
    left: 22,
    right: 22,
    flexDirection: "row",
    gap: 10,
  },

  suspendBtn: {
    flex: 1,
    height: 44,
    backgroundColor: "#FF9E6D",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },

  dashboardBtn: {
    flex: 1,
    height: 44,
    backgroundColor: "#FF9E6D",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },

  suspendBtnDisabled: {
    opacity: 0.5,
  },

  suspendText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#FFFBFA",
    fontWeight: "600",
  },
});
