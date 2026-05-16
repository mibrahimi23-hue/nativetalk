import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  ImageBackground,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useUser } from "@/contexts/user-context";
import {
  completeSession,
  endDailyRoom,
  getDailyRoom,
  getDailyToken,
  listMySessions,
} from "@/services/sessions";
import { sendMessage } from "@/services/chat";

export default function VideoCall() {
  const { role, user } = useUser();
  const params = useLocalSearchParams();
  const explicitSessionId = params.sessionId ? String(params.sessionId) : null;
  const peerUserId = params.peerUserId ? String(params.peerUserId) : null;

  const isStudent = role === "Learner";
  const [cameraOff, setCameraOff] = useState(false);
  const [micOff, setMicOff] = useState(true);
  const [showEndOptions, setShowEndOptions] = useState(false);
  const [resolvedSessionId, setResolvedSessionId] = useState(explicitSessionId);
  const [roomUrl, setRoomUrl] = useState(null);
  const [meetingToken, setMeetingToken] = useState(null);
  const [tokenError, setTokenError] = useState(null);
  const [callError, setCallError] = useState(null);
  const [endingAction, setEndingAction] = useState(null);

  // Resolve a session if none was passed: pick the soonest confirmed OR
  // pending session (we auto-confirm on book now, but older bookings may
  // still be pending). Optionally filter by the chat peer we came from.
  useEffect(() => {
    if (resolvedSessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const [confirmedList, pendingList] = await Promise.all([
          listMySessions("confirmed").catch(() => []),
          listMySessions("pending").catch(() => []),
        ]);
        const sessions = [
          ...(Array.isArray(confirmedList) ? confirmedList : []),
          ...(Array.isArray(pendingList) ? pendingList : []),
        ].sort(
          (a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at),
        );
        if (cancelled || sessions.length === 0) return;
        const candidate =
          (peerUserId
            ? sessions.find(
                (s) =>
                  String(s.teacher_id) === peerUserId ||
                  String(s.student_id) === peerUserId,
              )
            : null) || sessions[0];
        if (candidate?.id) setResolvedSessionId(String(candidate.id));
      } catch {
        // ignore — screen still renders with the placeholder UI
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedSessionId, peerUserId]);

  // Once we know which session to join, ask the backend for the Daily room +
  // meeting token. /daily/room also sends a chat invitation server-side to
  // the other participant, so the student sees it even if they didn't follow
  // a peerUserId link.
  useEffect(() => {
    if (!resolvedSessionId) return;
    let cancelled = false;
    (async () => {
      try {
        const room = await getDailyRoom(resolvedSessionId);
        if (cancelled) return;
        if (room?.url) setRoomUrl(room.url);
        try {
          const tokenResp = await getDailyToken(resolvedSessionId);
          if (!cancelled && tokenResp?.token) {
            setMeetingToken(tokenResp.token);
            if (tokenResp.room_url && !room?.url) setRoomUrl(tokenResp.room_url);
          }
        } catch (te) {
          // Token endpoint 400s if the join window isn't open yet. Surface a
          // friendly hint so the user knows why the video area is empty.
          if (!cancelled) {
            setTokenError(
              te?.message ||
                "The call window isn't open yet. Try again closer to the scheduled time.",
            );
          }
        }
      } catch (e) {
        if (!cancelled) {
          setCallError(e?.message || "Video call is not available right now.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedSessionId]);

  void user;

  const callUrl = roomUrl
    ? meetingToken
      ? `${roomUrl}?t=${encodeURIComponent(meetingToken)}`
      : roomUrl
    : null;
  const showLiveCall = Platform.OS === "web" && !!callUrl && !!meetingToken;

  // On native we can't embed the Daily.co Prebuilt UI as an <iframe>, so the
  // student would otherwise be stuck on the "Waiting for your tutor to join…"
  // placeholder forever — even when the tutor is already in the room. Open
  // the same tokened URL via Linking so the student joins the same room.
  // The autoLaunchedRef ensures we only auto-open once per session.
  const autoLaunchedRef = useRef(false);
  const launchNativeCall = async () => {
    if (!callUrl) return;
    try {
      await Linking.openURL(callUrl);
    } catch (e) {
      Alert.alert(
        "Could not open the call",
        e?.message || "Try tapping the join button again.",
      );
    }
  };
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!callUrl || !meetingToken) return;
    if (autoLaunchedRef.current) return;
    autoLaunchedRef.current = true;
    launchNativeCall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callUrl, meetingToken]);

  // Fire an invitation chat message as soon as the videocall screen opens.
  // This is in addition to the backend-side invitation that /daily/room sends,
  // so the peer is notified even when:
  //   - the tutor opens videocall from the chat header (no session id),
  //   - the session is still pending, or
  //   - the Daily room creation hasn't completed yet.
  // The message goes to peerUserId if provided, otherwise to the partner
  // resolved from the session record once we know it.
  const [invitedPeers, setInvitedPeers] = useState({});
  useEffect(() => {
    const tryInvite = async (recipient) => {
      if (!recipient || invitedPeers[recipient]) return;
      try {
        await sendMessage(
          recipient,
          "I'm in the video call now — open /videocall on your side to join.",
        );
        setInvitedPeers((prev) => ({ ...prev, [recipient]: true }));
      } catch {
        // best-effort — the room itself opens regardless
      }
    };

    if (peerUserId) {
      tryInvite(peerUserId);
    }
  }, [peerUserId, invitedPeers]);

  const handleEndCall = () => setShowEndOptions(true);

  const goTo = (path) => {
    setShowEndOptions(false);
    if (resolvedSessionId) {
      router.push({
        pathname: path,
        params: { sessionId: String(resolvedSessionId) },
      });
      return;
    }
    router.push(path);
  };

  const goToEndOption = async (option) => {
    if (endingAction) return;

    if (option.key !== "finished") {
      goTo(option.route);
      return;
    }

    if (!resolvedSessionId) {
      Alert.alert(
        "No session found",
        "Open the video call from a scheduled lesson so we can attach the review to that lesson.",
      );
      return;
    }

    setEndingAction(option.key);
    try {
      if (isStudent) {
        await completeSession(resolvedSessionId);
      } else {
        await endDailyRoom(resolvedSessionId);
      }
    } catch (e) {
      const alreadyCompleted =
        e?.status === 409 && /status 'completed'/i.test(e?.message || "");
      // Backend refuses to complete a session where the tutor never opened
      // the room — the right outcome there is "treat it as a tutor no-show"
      // so the student lands on the reschedule / refund flow instead of
      // being shown a cryptic error.
      const tutorNeverOpened =
        e?.status === 409 && /never opened/i.test(e?.message || "");
      if (tutorNeverOpened) {
        setShowEndOptions(false);
        setEndingAction(null);
        const fallbackRoute = isStudent ? "/tutor-didnt-join" : "/student-didnt-join";
        router.push({
          pathname: fallbackRoute,
          params: { sessionId: String(resolvedSessionId) },
        });
        return;
      }
      if (!alreadyCompleted) {
        Alert.alert("Could not finish lesson", e?.message || "Please try again.");
        setEndingAction(null);
        return;
      }
    }

    setShowEndOptions(false);
    setEndingAction(null);
    router.push({
      pathname: option.route,
      params: { sessionId: String(resolvedSessionId) },
    });
  };

  // Tutor-side options
  const tutorOptions = [
    {
      key: "finished",
      title: "Lesson finished",
      desc: "Grade and write a review for the student",
      icon: "checkmark-done",
      bg: "#FFE8DC",
      iconColor: "#FF9E6D",
      route: "/write-review",
    },
    {
      key: "noshow",
      title: "Student didn't join",
      desc: "Reschedule or mark the student absent",
      icon: "person-remove-outline",
      bg: "#F3EDEA",
      iconColor: "#DD8153",
      route: "/student-didnt-join",
    },
    {
      key: "cancel",
      title: "Cancel session",
      desc: "Reschedule or cancel the lesson outright",
      icon: "close-circle-outline",
      bg: "#FDE3D6",
      iconColor: "#DD8153",
      route: "/cancel-session",
    },
  ];

  // Student-side options
  const studentOptions = [
    {
      key: "finished",
      title: "Lesson finished",
      desc: "Rate the tutor and leave a review",
      icon: "star",
      bg: "#FFE8DC",
      iconColor: "#FF9E6D",
      route: "/student-write-review",
    },
    {
      key: "noshow",
      title: "Tutor didn't join",
      desc: "Reschedule the session or get a refund",
      icon: "person-remove-outline",
      bg: "#F3EDEA",
      iconColor: "#DD8153",
      route: "/tutor-didnt-join",
    },
    {
      key: "cancel",
      title: "Cancel session",
      desc: "Reschedule or cancel without refund",
      icon: "close-circle-outline",
      bg: "#FDE3D6",
      iconColor: "#DD8153",
      route: "/cancel-session",
    },
  ];

  const options = isStudent ? studentOptions : tutorOptions;

  const peerLabel = isStudent ? "tutor" : "student";

  const bottomBar = (
    <View style={styles.bottomBar}>
      <TouchableOpacity
        style={[styles.smallBtn, isStudent && { backgroundColor: "#FFFBFA" }]}
        onPress={() => setCameraOff(!cameraOff)}
      >
        <Ionicons
          name={cameraOff ? "videocam" : "videocam-off"}
          size={24}
          color="#000"
        />
      </TouchableOpacity>

      <TouchableOpacity style={styles.endBtn} onPress={handleEndCall}>
        <Ionicons name="call" size={30} color="#000" />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.smallBtn, isStudent && { backgroundColor: "#FFFBFA" }]}
        onPress={() => setMicOff(!micOff)}
      >
        <Ionicons
          name={micOff ? "mic-off" : "mic"}
          size={24}
          color="#000"
        />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {showLiveCall ? (
        <View style={[styles.video, { justifyContent: "flex-start", paddingTop: 0 }]}>
          {/* Daily.co Prebuilt UI embedded with a tokened URL — only the
              authorised user can join, the camera/mic controls live inside
              the iframe and we keep our overlay bottom bar for end-call. */}
          <View style={{ flex: 1 }}>
            <iframe
              src={callUrl}
              allow="camera; microphone; fullscreen; speaker; display-capture; autoplay"
              style={{
                width: "100%",
                height: "100%",
                border: 0,
              }}
              title="NativeTalk video call"
            />
          </View>
          {bottomBar}
        </View>
      ) : (
        <ImageBackground
          source={{
            uri: isStudent
              ? "https://images.unsplash.com/photo-1517841905240-472988babdf9"
              : "https://images.unsplash.com/photo-1494790108377-be9c29b29330",
          }}
          style={styles.video}
          resizeMode="cover"
        >
          <Text style={styles.waitingText}>
            {tokenError
              ? tokenError
              : callError
              ? callError
              : `Waiting for your ${peerLabel} to join...`}
          </Text>

          {/* Native fallback: the Daily Prebuilt iframe only renders on web,
              so on iOS/Android we surface a clear "Join the call" button that
              opens the same tokened room URL in the system browser. Both the
              tutor and the student end up in the same Daily room that way. */}
          {Platform.OS !== "web" && callUrl ? (
            <View style={styles.joinNativeWrap}>
              <TouchableOpacity
                style={styles.joinNativeBtn}
                onPress={launchNativeCall}
              >
                <Ionicons name="videocam" size={18} color="#FFFBFA" />
                <Text style={styles.joinNativeText}>Join the video room</Text>
              </TouchableOpacity>
              <Text style={styles.joinNativeHint}>
                The same room your {peerLabel} is in. Opens in your browser.
              </Text>
            </View>
          ) : null}

          {cameraOff && (
            <View style={styles.cameraOffBox}>
              <Text style={styles.cameraOffText}>Camera Off</Text>
            </View>
          )}

          {bottomBar}
        </ImageBackground>
      )}

      <Modal
        visible={showEndOptions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowEndOptions(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowEndOptions(false)}
        >
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <Text style={styles.modalTitle}>End of session</Text>
            <Text style={styles.modalSubtitle}>
              Pick what happened with this session.
            </Text>

            {options.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={styles.optionRow}
                disabled={!!endingAction}
                onPress={() => goToEndOption(opt)}
              >
                <View style={[styles.optionIcon, { backgroundColor: opt.bg }]}>
                  <Ionicons name={opt.icon} size={20} color={opt.iconColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>{opt.title}</Text>
                  <Text style={styles.optionDesc}>{opt.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#28221B" />
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setShowEndOptions(false)}
            >
              <Text style={styles.cancelBtnText}>Keep call open</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111",
  },

  video: {
    flex: 1,
    justifyContent: "space-between",
    paddingTop: 58,
  },

  waitingText: {
    alignSelf: "flex-start",
    marginLeft: 8,
    backgroundColor: "#FFFBFA",
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    fontFamily: "Outfit",
    fontSize: 9,
    color: "#28221B",
  },

  joinNativeWrap: {
    alignSelf: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 251, 250, 0.92)",
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 18,
    marginHorizontal: 28,
    gap: 8,
  },
  joinNativeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FF9E6D",
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 22,
  },
  joinNativeText: {
    fontFamily: "Outfit",
    fontSize: 14,
    color: "#FFFBFA",
    fontWeight: "700",
  },
  joinNativeHint: {
    fontFamily: "Outfit",
    fontSize: 11,
    color: "#28221B",
    textAlign: "center",
  },

  cameraOffBox: {
    position: "absolute",
    top: 140,
    left: 40,
    right: 40,
    height: 120,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },

  cameraOffText: {
    fontFamily: "Outfit",
    fontSize: 18,
    color: "#FFFBFA",
  },

  bottomBar: {
    height: 95,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 22,
  },

  smallBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#DD8153",
    justifyContent: "center",
    alignItems: "center",
  },

  endBtn: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: "red",
    justifyContent: "center",
    alignItems: "center",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "flex-end",
  },

  modalSheet: {
    backgroundColor: "#FFFBFA",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 22,
    paddingHorizontal: 22,
    paddingBottom: 32,
  },

  modalTitle: {
    fontFamily: "Domine",
    fontSize: 18,
    color: "#28221B",
    textAlign: "center",
  },

  modalSubtitle: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 18,
  },

  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFBFA",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 12,
    shadowColor: "#28221B",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  optionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },

  optionTitle: {
    fontFamily: "Outfit",
    fontSize: 14,
    fontWeight: "600",
    color: "#28221B",
  },

  optionDesc: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#7E6D66",
    marginTop: 2,
  },

  cancelBtn: {
    marginTop: 8,
    height: 42,
    borderRadius: 22,
    backgroundColor: "#F3EDEA",
    alignItems: "center",
    justifyContent: "center",
  },

  cancelBtnText: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#28221B",
    fontWeight: "600",
  },
});
