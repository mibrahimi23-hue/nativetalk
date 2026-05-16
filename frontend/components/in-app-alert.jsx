import { Ionicons } from "@expo/vector-icons";
import { useCallback, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// Reusable in-app replacement for window.alert / window.confirm.
// Matches the cream/orange palette used across the rest of the app so
// the user never sees the native "localhost:8081 says ..." dialog.
//
// Usage in a screen:
//
//   const { notify, confirmAction, AlertHost } = useInAppAlert();
//   ...
//   notify("Exam published", "Korean B1 exam published with 9 questions.");
//   const yes = await confirmAction("Delete?", "This can't be undone.");
//   ...
//   return (
//     <View>
//       ...screen content...
//       <AlertHost />
//     </View>
//   );

export function useInAppAlert() {
  const [notifyState, setNotifyState] = useState({
    visible: false,
    title: "",
    message: "",
    tone: "info", // "info" | "success" | "error"
  });
  const notifyResolverRef = useRef(null);

  const [confirmState, setConfirmState] = useState({
    visible: false,
    title: "",
    message: "",
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
    destructive: false,
  });
  const confirmResolverRef = useRef(null);

  const notify = useCallback((title, message, options = {}) => {
    return new Promise((resolve) => {
      notifyResolverRef.current = resolve;
      setNotifyState({
        visible: true,
        title: String(title || ""),
        message: String(message || ""),
        tone: options.tone || "info",
      });
    });
  }, []);

  const dismissNotify = useCallback(() => {
    setNotifyState((prev) => ({ ...prev, visible: false }));
    const resolver = notifyResolverRef.current;
    notifyResolverRef.current = null;
    if (resolver) resolver();
  }, []);

  const confirmAction = useCallback((title, message, options = {}) => {
    return new Promise((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmState({
        visible: true,
        title: String(title || ""),
        message: String(message || ""),
        confirmLabel: options.confirmLabel || "Confirm",
        cancelLabel: options.cancelLabel || "Cancel",
        destructive: !!options.destructive,
      });
    });
  }, []);

  const respondConfirm = useCallback((answer) => {
    setConfirmState((prev) => ({ ...prev, visible: false }));
    const resolver = confirmResolverRef.current;
    confirmResolverRef.current = null;
    if (resolver) resolver(answer);
  }, []);

  const AlertHost = useCallback(() => {
    const toneStyle =
      notifyState.tone === "success"
        ? styles.iconSuccess
        : notifyState.tone === "error"
          ? styles.iconError
          : styles.iconInfo;
    const toneIcon =
      notifyState.tone === "success"
        ? "checkmark"
        : notifyState.tone === "error"
          ? "close"
          : "information";
    const toneColor =
      notifyState.tone === "success"
        ? "#FF9E6D"
        : notifyState.tone === "error"
          ? "#DD8153"
          : "#FF9E6D";

    return (
      <>
        <Modal
          visible={notifyState.visible}
          transparent
          animationType="fade"
          onRequestClose={dismissNotify}
        >
          <Pressable style={styles.overlay} onPress={dismissNotify}>
            <Pressable style={styles.card} onPress={() => {}}>
              <View style={[styles.iconWrap, toneStyle]}>
                <Ionicons name={toneIcon} size={32} color={toneColor} />
              </View>
              {notifyState.title ? (
                <Text style={styles.title}>{notifyState.title}</Text>
              ) : null}
              {notifyState.message ? (
                <Text style={styles.message}>{notifyState.message}</Text>
              ) : null}
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={dismissNotify}
              >
                <Text style={styles.primaryBtnText}>OK</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          visible={confirmState.visible}
          transparent
          animationType="fade"
          onRequestClose={() => respondConfirm(false)}
        >
          <Pressable
            style={styles.overlay}
            onPress={() => respondConfirm(false)}
          >
            <Pressable style={styles.card} onPress={() => {}}>
              <View style={[styles.iconWrap, styles.iconInfo]}>
                <Ionicons
                  name={confirmState.destructive ? "trash" : "help"}
                  size={28}
                  color="#FF9E6D"
                />
              </View>
              {confirmState.title ? (
                <Text style={styles.title}>{confirmState.title}</Text>
              ) : null}
              {confirmState.message ? (
                <Text style={styles.message}>{confirmState.message}</Text>
              ) : null}
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  confirmState.destructive && styles.destructiveBtn,
                ]}
                onPress={() => respondConfirm(true)}
              >
                <Text style={styles.primaryBtnText}>
                  {confirmState.confirmLabel}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ghostBtn}
                onPress={() => respondConfirm(false)}
              >
                <Text style={styles.ghostBtnText}>
                  {confirmState.cancelLabel}
                </Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      </>
    );
  }, [notifyState, confirmState, dismissNotify, respondConfirm]);

  return { notify, confirmAction, AlertHost };
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(40, 34, 27, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFBFA",
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 26,
    alignItems: "center",
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  iconInfo: {
    backgroundColor: "#FFF1E8",
  },
  iconSuccess: {
    backgroundColor: "#FFF1E8",
  },
  iconError: {
    backgroundColor: "#F3EDEA",
  },
  title: {
    fontFamily: "Domine",
    fontSize: 18,
    color: "#28221B",
    textAlign: "center",
    marginBottom: 6,
  },
  message: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#7E6D66",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 18,
  },
  primaryBtn: {
    width: "100%",
    height: 44,
    backgroundColor: "#FF9E6D",
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  destructiveBtn: {
    backgroundColor: "#DD8153",
  },
  primaryBtnText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#FFFBFA",
    fontWeight: "600",
  },
  ghostBtn: {
    marginTop: 10,
    width: "100%",
    height: 44,
    backgroundColor: "#F3EDEA",
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostBtnText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    fontWeight: "600",
  },
});
