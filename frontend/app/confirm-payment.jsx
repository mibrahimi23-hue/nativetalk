import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useUser } from "@/contexts/user-context";
import { safeBack } from "@/hooks/use-safe-back";
import { bookSession } from "@/services/sessions";
import { capturePaypalOrder, createPaypalOrder } from "@/services/paypal";
import { getCoursePayment } from "@/services/payments";
import { getTutor } from "@/services/tutors";
import { LANGUAGES, findLanguageByName } from "@/constants/languages";

// Both directions of the mapping — the radio-id form (from the tutor's
// onboarding screen) and the canonical backend value (from the tutor row).
const PLAN_BY_KEY = {
  hourly: "hour_by_hour",
  fifty: "50_50",
  eighty: "80_20",
};
const PLAN_LABEL = {
  hour_by_hour: "Hour-by-hour Payment",
  "50_50": "50% / 50% Payment",
  "80_20": "80% / 20% Payment",
};

export default function ConfirmPayment() {
  const params = useLocalSearchParams();
  const { profile, user } = useUser();
  const accountEmail =
    (profile.email && profile.email.trim()) || user?.email || "you@example.com";

  const [resultStatus, setResultStatus] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [tutorPlan, setTutorPlan] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const askResolverRef = useRef(null);

  // Load the tutor's stored payment_plan so the booking uses what the tutor
  // chose, not what the student picked. If the tutor isn't found or the column
  // isn't populated yet, fall back to the radio selection from /pricing-plans.
  useEffect(() => {
    if (!params.tutorId) return;
    let cancelled = false;
    getTutor(String(params.tutorId))
      .then((t) => {
        if (!cancelled && t?.payment_plan) setTutorPlan(String(t.payment_plan));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [params.tutorId]);

  // Effective payment plan: tutor's preference wins over student's radio choice.
  const effectivePlan = useMemo(() => {
    if (tutorPlan && Object.values(PLAN_BY_KEY).includes(tutorPlan)) return tutorPlan;
    if (Object.values(PLAN_BY_KEY).includes(String(params.plan))) return String(params.plan);
    return PLAN_BY_KEY[params.plan] || "hour_by_hour";
  }, [tutorPlan, params.plan]);

  // The total the student pays *now* depends on the tutor's payment plan:
  //   hour_by_hour → just the upcoming hour (1 × rate)
  //   50_50        → 50% of (hours × rate)
  //   80_20        → 80% of (hours × rate)
  // If the screen received an explicit `total` param (e.g. from a credit
  // rebook), prefer that.
  const total = useMemo(() => {
    const explicit = parseFloat(params.total);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    if (params.coursePaymentId) return 0;
    const hours = Number(params.hours) || 30;
    const price = Number(params.price) || 0;
    if (!Number.isFinite(price) || price <= 0) return 0;
    const courseAmount = hours * price;
    if (effectivePlan === "50_50") return Math.round(courseAmount * 0.5 * 100) / 100;
    if (effectivePlan === "80_20") return Math.round(courseAmount * 0.8 * 100) / 100;
    return Math.round(price * 100) / 100; // hour_by_hour: one hour upfront
  }, [params.total, params.hours, params.price, params.coursePaymentId, effectivePlan]);

  const planLabel = PLAN_LABEL[effectivePlan] || "Course Payment";

  // Open the styled in-app confirmation modal (no native window.confirm)
  // and resolve with true/false when the user picks an option.
  const askYesNo = () =>
    new Promise((resolve) => {
      askResolverRef.current = resolve;
      setConfirmOpen(true);
    });

  const respondToConfirm = (answer) => {
    setConfirmOpen(false);
    if (askResolverRef.current) {
      askResolverRef.current(answer);
      askResolverRef.current = null;
    }
  };

  const confirmPayment = async () => {
    if (processing) return;

    // Quick Yes/No confirm so demo testing doesn't need a real PayPal login.
    // The styled in-app modal replaces the browser's native confirm dialog
    // so the experience stays inside the design system.
    const proceed = await askYesNo();
    if (!proceed) return;

    setProcessing(true);
    setErrorMessage("");

    if (params.payCoursePaymentId) {
      try {
        const coursePaymentId = String(params.payCoursePaymentId);
        const studentId = String(params.studentId || user?.student_id || "");
        if (!studentId) throw new Error("Student profile not found.");

        const paymentDetails = await getCoursePayment(coursePaymentId);
        const installment = Number(paymentDetails?.next_installment || 2);
        if (paymentDetails?.payment_due_now === false) {
          setProcessing(false);
          router.replace("/student-dashboard");
          return;
        }

        const order = await createPaypalOrder({
          course_payment_id: coursePaymentId,
          student_id: studentId,
          installment,
        });
        if (order?.no_payment_required || Number(order?.amount || 0) <= 0) {
          setProcessing(false);
          router.replace("/student-dashboard");
          return;
        }
        if (order?.live && order?.approval_url) {
          if (Platform.OS === "web") {
            window.open(order.approval_url, "_blank", "noopener,noreferrer");
          } else {
            await Linking.openURL(order.approval_url);
          }
          setErrorMessage(
            "Opened PayPal in a new tab. After approving, tap 'Confirm Payment' again to finalise.",
          );
          setResultStatus(null);
          setProcessing(false);
          return;
        }
        await capturePaypalOrder({
          paypal_order_id:
            order?.paypal_order_id ||
            order?.transaction_id ||
            `SIMULATED_${Date.now()}`,
          course_payment_id: coursePaymentId,
          student_id: studentId,
          installment,
        });
        setProcessing(false);
        router.replace("/student-dashboard");
        return;
      } catch (e) {
        setErrorMessage(e.message || "We couldn't process your payment.");
        setResultStatus("failed");
        setProcessing(false);
        return;
      }
    }

    if (!params.tutorId) {
      // Demo flow: no booking context, simulate success.
      setResultStatus("success");
      setProcessing(false);
      return;
    }

    try {
      const lang =
        findLanguageByName(profile.language) ||
        (profile.languageId
          ? LANGUAGES.find((l) => l.id === Number(profile.languageId))
          : LANGUAGES[0]);
      const tz =
        (params.studentTz ? String(params.studentTz) : null) ||
        profile.timezone ||
        user?.timezone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
        "UTC";
      const level = String(params.level || profile.level || "A1");
      const hours = Number(params.hours) || 30;
      const pricePerHour = Number(params.price) || 5;
      // Use the slot picked on the tutor profile screen if present, otherwise
      // fall back to "tomorrow 10am" for backwards compat with screens that
      // bypass the slot picker.
      const scheduledAt = (() => {
        if (params.scheduledAt) {
          const d = new Date(String(params.scheduledAt));
          if (!Number.isNaN(d.getTime())) return d;
        }
        const fallback = new Date();
        fallback.setDate(fallback.getDate() + 1);
        fallback.setHours(10, 0, 0, 0);
        return fallback;
      })();

      // 1. Book the session and create a CoursePayment row using the tutor's
      //    preferred payment_plan (falls back to the student's radio choice).
      //    If we have an existing credit (CoursePayment from a tutor-cancelled
      //    lesson), pass its id and skip creating a new one.
      const usingCredit = !!params.coursePaymentId;
      const booked = await bookSession({
        teacher_id: String(params.tutorId),
        language_id: lang?.id || 1,
        level,
        scheduled_at: scheduledAt.toISOString(),
        student_timezone: tz,
        total_hours: hours,
        price_per_hour: pricePerHour,
        payment_plan: effectivePlan,
        ...(usingCredit ? { course_payment_id: String(params.coursePaymentId) } : {}),
      });

      // 2. Record the PayPal transaction so it shows on tutor/admin
      //    dashboards. Skipped entirely when the student is rebooking with a
      //    credit — they've already paid for that lesson.
      const coursePaymentId = booked?.course_payment_id;
      const studentId = booked?.student_id || user?.student_id || null;
      if (!usingCredit && coursePaymentId && studentId) {
        try {
          const paymentDetails = await getCoursePayment(coursePaymentId).catch(() => null);
          const paymentDueNow = paymentDetails?.payment_due_now !== false;
          const installment = Number(paymentDetails?.next_installment || 1);

          if (!paymentDueNow) {
            setProcessing(false);
            router.replace("/student-dashboard");
            return;
          }

          const order = await createPaypalOrder({
            course_payment_id: coursePaymentId,
            student_id: studentId,
            installment,
          });

          if (order?.no_payment_required || Number(order?.amount || 0) <= 0) {
            setProcessing(false);
            router.replace("/student-dashboard");
            return;
          }

          // When real PayPal creds are configured the backend returns
          // `live: true` and an `approval_url` pointing to PayPal's hosted
          // checkout. Send the student over there and *do not* capture yet —
          // the capture happens when they come back via the PayPal return URL.
          // In demo mode (no creds) the backend simulates a completed
          // transaction and we just flip the local row to completed.
          if (order?.live && order?.approval_url) {
            if (Platform.OS === "web") {
              window.open(order.approval_url, "_blank", "noopener,noreferrer");
            } else {
              await Linking.openURL(order.approval_url);
            }
            setErrorMessage(
              "Opened PayPal in a new tab. After approving, tap 'Confirm Payment' again to finalise.",
            );
            setResultStatus(null);
            setProcessing(false);
            return;
          }

          await capturePaypalOrder({
            paypal_order_id:
              order?.paypal_order_id ||
              order?.transaction_id ||
              `SIMULATED_${Date.now()}`,
            course_payment_id: coursePaymentId,
            student_id: studentId,
            installment,
          });
        } catch {
          // PayPal recording failed (e.g. hour_by_hour plan with no upfront).
          // The booking itself succeeded — proceed to the success modal.
        }
      }

      // Payment captured — head straight back to the student dashboard
      // instead of stopping on a success modal.
      setProcessing(false);
      router.replace("/student-dashboard");
      return;
    } catch (e) {
      setErrorMessage(e.message || "We couldn't process your booking.");
      setResultStatus("failed");
    } finally {
      setProcessing(false);
    }
  };

  const handleSuccessDone = () => {
    setResultStatus(null);
    router.replace("/student-dashboard");
  };

  const handleFailedRetry = () => {
    setResultStatus(null);
    confirmPayment();
  };

  const handleFailedClose = () => {
    setResultStatus(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => safeBack()}>
          <Ionicons name="chevron-back" size={20} color="#FFFBFA" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Confirm & Pay</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.line} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Order Summary</Text>

        <View style={styles.row}>
          <Text style={styles.text}>Plan</Text>
          <Text style={styles.text}>{planLabel}</Text>
        </View>

        <View style={styles.divider} />

        {params.level ? (
          <>
            <View style={[styles.row, { marginTop: 10 }]}>
              <Text style={styles.text}>Level</Text>
              <Text style={styles.text}>{params.level}</Text>
            </View>
            <View style={styles.divider} />
          </>
        ) : null}

        {params.hours ? (
          <>
            <View style={[styles.row, { marginTop: 10 }]}>
              <Text style={styles.text}>Hours</Text>
              <Text style={styles.text}>{params.hours}</Text>
            </View>
            <View style={styles.divider} />
          </>
        ) : null}

        <View style={[styles.row, { marginTop: 14 }]}>
          <Text style={styles.bold}>Estimated Total</Text>
          <Text style={styles.bold}>€{total.toFixed(2)}</Text>
        </View>

        {/* Payment method block.
            When the student is rebooking against a `course_payment_id` from
            a tutor-cancelled lesson, the platform reuses the credit they
            already paid — PayPal is skipped server-side. Show that clearly
            so the student doesn't think a second charge is happening. */}
        {params.coursePaymentId ? (
          <View style={[styles.paymentCard, styles.balanceCard]}>
            <View style={styles.paymentTopRow}>
              <Text style={styles.text}>Payment</Text>
              <View style={styles.balanceTag}>
                <Ionicons name="gift-outline" size={12} color="#FFFBFA" />
                <Text style={styles.balanceTagText}>Using balance</Text>
              </View>
            </View>
            <Text style={styles.balanceHint}>
              This lesson will be deducted from your existing credit — no
              new PayPal charge.
            </Text>
          </View>
        ) : (
          <View style={styles.paymentCard}>
            <View style={styles.paymentTopRow}>
              <Text style={styles.text}>Payment</Text>
              <TouchableOpacity onPress={() => router.push("/payment")}>
                <Text style={styles.edit}>Edit</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.cardRow}>
              <View style={styles.payPalLogo}>
                <Text style={styles.payPalLogoText}>P</Text>
              </View>
              <Text style={styles.cardEmail}>{accountEmail}</Text>
            </View>
          </View>
        )}

        <Text style={styles.confirmHeader}>Please confirm and submit your payment</Text>
        <Text style={styles.small}>
          By clicking confirm payment, you agree to{"\n"}
          Terms of use and Privacy Policy
        </Text>
      </ScrollView>

      <TouchableOpacity
        style={[styles.btn, processing && styles.btnDisabled]}
        onPress={confirmPayment}
        disabled={processing}
      >
        <Text style={styles.btnText}>
          {processing ? "Processing..." : "Confirm Payment"}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={confirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => respondToConfirm(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => respondToConfirm(false)}
        >
          <Pressable style={styles.confirmCard} onPress={() => {}}>
            <View style={[styles.modalIcon, { backgroundColor: "#FFF1E8" }]}>
              <Ionicons
                name={params.coursePaymentId ? "gift-outline" : "card-outline"}
                size={32}
                color="#FF9E6D"
              />
            </View>
            <Text style={styles.modalTitle}>
              {params.coursePaymentId ? "Use balance?" : "Confirm payment"}
            </Text>
            <Text style={styles.modalText}>
              {params.coursePaymentId
                ? "This lesson will be deducted from your existing credit — no new PayPal charge."
                : `You're about to pay €${Number(total || 0).toFixed(2)}.`}
            </Text>
            <TouchableOpacity
              style={styles.modalPrimary}
              onPress={() => respondToConfirm(true)}
            >
              <Text style={styles.modalPrimaryText}>Confirm</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalGhost}
              onPress={() => respondToConfirm(false)}
            >
              <Text style={styles.modalGhostText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={resultStatus !== null}
        transparent
        animationType="fade"
        onRequestClose={
          resultStatus === "success" ? handleSuccessDone : handleFailedClose
        }
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={
            resultStatus === "success" ? handleSuccessDone : handleFailedClose
          }
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            {resultStatus === "success" ? (
              <>
                <View style={[styles.modalIcon, { backgroundColor: "#FFF1E8" }]}>
                  <Ionicons name="checkmark" size={40} color="#FF9E6D" />
                </View>
                <Text style={styles.modalTitle}>Payment Successful</Text>
                <Text style={styles.modalText}>
                  Your session is booked. We've sent a receipt to your email.
                </Text>
                <TouchableOpacity
                  style={styles.modalPrimary}
                  onPress={handleSuccessDone}
                >
                  <Text style={styles.modalPrimaryText}>Go to dashboard</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={[styles.modalIcon, { backgroundColor: "#F3EDEA" }]}>
                  <Ionicons name="close" size={40} color="#DD8153" />
                </View>
                <Text style={styles.modalTitle}>Payment Failed</Text>
                <Text style={styles.modalText}>
                  {errorMessage ||
                    "We couldn't process your payment. Please check your account and try again."}
                </Text>
                <TouchableOpacity
                  style={styles.modalPrimary}
                  onPress={handleFailedRetry}
                >
                  <Text style={styles.modalPrimaryText}>Try again</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalGhost}
                  onPress={handleFailedClose}
                >
                  <Text style={styles.modalGhostText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
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
    marginBottom: 16,
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
    fontSize: 16,
    color: "#28221B",
  },
  line: {
    height: 1,
    backgroundColor: "#EADDD8",
    marginBottom: 16,
  },
  title: {
    fontFamily: "Domine",
    fontSize: 20,
    color: "#28221B",
    marginBottom: 14,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: "#EADDD8",
    marginVertical: 6,
  },
  text: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
  },
  bold: {
    fontFamily: "Outfit",
    fontSize: 14,
    fontWeight: "700",
    color: "#28221B",
  },
  paymentCard: {
    borderWidth: 1,
    borderColor: "#FF9E6D",
    borderRadius: 14,
    padding: 14,
    marginTop: 18,
    marginBottom: 20,
  },
  balanceCard: {
    backgroundColor: "#FFF1E8",
  },
  balanceTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FF9E6D",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  balanceTagText: {
    fontFamily: "Outfit",
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFBFA",
  },
  balanceHint: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#28221B",
    lineHeight: 17,
    marginTop: 8,
  },
  paymentTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  edit: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#DD8153",
    fontWeight: "600",
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  payPalLogo: {
    width: 22,
    height: 22,
    borderRadius: 11,
    // Was PayPal brand blue (#003087) — swapped to the project's primary
    // orange so the payment card sticks to the design palette.
    backgroundColor: "#FF9E6D",
    alignItems: "center",
    justifyContent: "center",
  },
  payPalLogoText: {
    fontFamily: "Domine",
    fontSize: 13,
    color: "#FFFBFA",
    fontWeight: "700",
    fontStyle: "italic",
  },
  cardEmail: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    fontWeight: "600",
  },
  confirmHeader: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    fontWeight: "700",
    marginBottom: 6,
  },
  small: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
    lineHeight: 17,
  },
  btn: {
    position: "absolute",
    bottom: 24,
    left: 22,
    right: 22,
    height: 44,
    backgroundColor: "#FF9E6D",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#FFFBFA",
    fontWeight: "600",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(40, 34, 27, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "#FFFBFA",
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: "center",
  },
  confirmCard: {
    width: "100%",
    backgroundColor: "#FFFBFA",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#FF9E6D",
    paddingHorizontal: 24,
    paddingVertical: 26,
    alignItems: "center",
  },
  modalIcon: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: "Domine",
    fontSize: 20,
    color: "#28221B",
    marginBottom: 8,
    textAlign: "center",
  },
  modalText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#7E6D66",
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 22,
  },
  modalPrimary: {
    width: "100%",
    height: 44,
    backgroundColor: "#FF9E6D",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  modalPrimaryText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#FFFBFA",
    fontWeight: "600",
  },
  modalGhost: {
    marginTop: 10,
    width: "100%",
    height: 44,
    backgroundColor: "#F3EDEA",
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  modalGhostText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    fontWeight: "600",
  },
});
