import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { safeBack } from "@/hooks/use-safe-back";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function ExamResults() {
  // Real values flow in from /language-exam via the router params after the
  // submit response. If they're missing (e.g. user lands here directly), the
  // screen falls back to a neutral message instead of the four hard-coded
  // section scores that used to live here.
  const params = useLocalSearchParams();
  const passed = String(params.passed || "") === "1";
  const score = Number(params.score) || 0;
  const total = Number(params.total) || 0;
  const percentage = params.percentage
    ? String(params.percentage)
    : total > 0
    ? `${Math.round((score / total) * 100)}%`
    : "—";
  // Backend sends the tutor's *granted* level — present on pass, empty on
  // fail. On fail there is NO teaching level: the tutor must retake the
  // exam before any level is granted.
  const rawLevel = params.newLevel ? String(params.newLevel) : "";
  const level = rawLevel || (passed ? "A2" : null);
  const message =
    params.message ||
    (passed
      ? `Huge congrats! You can now teach up to ${level || "the granted level"}.`
      : `You didn't pass. You can't teach yet — try the exam again to unlock teaching.`);

  const subjectRows = [
    { id: "score", subject: "Score", value: `${score} / ${total}` },
    { id: "percent", subject: "Percentage", value: percentage },
    {
      id: "status",
      subject: "Result",
      value: passed ? "Passed" : "Did not pass",
    },
  ];

  return (
    <View style={styles.wrapper}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
          <Ionicons name="chevron-back" size={20} color="#FFFBFA" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Language Exam Results</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.content}>
        {/* Congrats text */}
        <Text style={styles.congratsText}>{message}</Text>

        {/* Results */}
        {subjectRows.map((row) => (
          <View key={row.id} style={styles.resultRow}>
            <Text style={styles.resultSubject}>{row.subject}</Text>
            <Text style={styles.resultScore}>{row.value}</Text>
          </View>
        ))}

        {/* Level — only when the tutor passed and a level was actually
            granted. On failure we show a locked state instead so the
            screen never advertises an A1/A2 that the user can't use. */}
        {passed && level ? (
          <Text style={styles.levelText}>
            Language level you can teach:{"\n"}{level}
          </Text>
        ) : (
          <Text style={styles.levelText}>
            Language level you can teach:{"\n"}Locked — retake the exam
          </Text>
        )}
      </View>

      {/* Bottom Button — Continue forward on pass, route back to the exam
          itself on fail so the tutor can immediately retry. */}
      <View style={styles.bottomBtn}>
        {passed && level ? (
          <TouchableOpacity
            style={styles.continueBtn}
            onPress={() =>
              router.push({
                pathname: "/availability",
                params: { level },
              })
            }
          >
            <Text style={styles.continueBtnText}>Continue with account</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.continueBtn}
            onPress={() => router.replace("/language-examination")}
          >
            <Text style={styles.continueBtnText}>Try the exam again</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#FFFBFA",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 55,
    paddingBottom: 14,
    paddingHorizontal: 20,
    backgroundColor: "#FFFBFA",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FF9E6D",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#28221B",
  },

  // Content
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  congratsText: {
    fontSize: 14,
    color: "#7E6D66",
    lineHeight: 22,
    marginBottom: 32,
  },

  // Results
  resultRow: {
    marginBottom: 20,
  },
  resultSubject: {
    fontSize: 18,
    fontWeight: "700",
    color: "#28221B",
    marginBottom: 2,
  },
  resultScore: {
    fontSize: 14,
    color: "#7E6D66",
  },

  // Level
  levelText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#28221B",
    textAlign: "center",
    marginTop: 16,
    lineHeight: 28,
  },

  // Bottom button
  bottomBtn: {
    position: "absolute",
    bottom: 34,
    left: 24,
    right: 24,
  },
  continueBtn: {
    backgroundColor: "#FF9E6D",
    borderRadius: 25,
    paddingVertical: 16,
    alignItems: "center",
  },
  continueBtnText: {
    color: "#FFFBFA",
    fontSize: 16,
    fontWeight: "600",
  },
});
