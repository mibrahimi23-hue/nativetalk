import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { configureApi, setAccessToken, setRefreshToken } from "@/services/api";
import {
  loginRequest,
  registerRequest,
  logoutRequest,
  getMe,
  updateMe,
} from "@/services/auth";
import { findLanguageById, findLanguageByName } from "@/constants/languages";

const UserContext = createContext(null);
const SAVED_TUTORS_KEY_PREFIX = "nativetalk:saved-tutors";

const DEFAULT_PROFILE = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  bio: "",
  level: "",
  language: "",
  languageId: null,
  avatar: null,
  timezone: "",
  location: "",
  hourlyRate: null,
};

function backendRoleToFrontend(role) {
  if (!role) return null;
  const r = String(role).toLowerCase();
  if (r === "student") return "Learner";
  if (r === "teacher") return "Tutor";
  if (r === "admin") return "Admin";
  return null;
}

function frontendRoleToBackend(role) {
  if (!role) return null;
  if (role === "Tutor") return "teacher";
  if (role === "Learner") return "student";
  if (role === "Admin") return "admin";
  return null;
}

function splitName(fullName = "") {
  const parts = String(fullName).trim().split(/\s+/);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  };
}

function userToProfile(user, prev = {}) {
  if (!user) return prev;
  const { firstName, lastName } = splitName(user.full_name || "");
  return {
    ...prev,
    firstName: firstName || prev.firstName || "",
    lastName: lastName || prev.lastName || "",
    email: user.email || prev.email || "",
    phone: user.phone || prev.phone || "",
    timezone: user.timezone || prev.timezone || "",
    location: user.location || prev.location || "",
    avatar: user.profile_photo || prev.avatar || null,
    language: user.language_name || prev.language || "",
    languageId: user.language_id ?? prev.languageId ?? null,
    level: user.level || prev.level || "",
    bio: user.bio ?? prev.bio ?? "",
    hourlyRate:
      user.hourly_rate != null && Number.isFinite(Number(user.hourly_rate))
        ? Number(user.hourly_rate)
        : prev.hourlyRate ?? null,
  };
}

function savedTutorsStorageKey(userId) {
  return `${SAVED_TUTORS_KEY_PREFIX}:${userId}`;
}

function parseSavedTutorIds(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

// Load the tutor's lesson notes from the backend and shape them into the
// in-memory representation used by language-lessons.jsx so they survive
// a logout/login cycle.
async function fetchTutorLessons() {
  try {
    const { listMyLessons } = await import("@/services/lessons");
    const rows = await listMyLessons();
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r) => r.kind === "lesson_note")
      .map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description || "",
        level: r.level,
        materialIds: [],
        // Lesson notes are tutor-authored upcoming lessons that don't have
        // a scheduled date yet. We render them with the same "upcoming"
        // status that add-lesson.jsx uses so the UI is identical pre/post
        // logout.
        status: "upcoming",
        date: "TBD",
        time: "",
      }));
  } catch {
    return [];
  }
}

// Merge the Teacher / Student row's language onto the profile so screens like
// /add-lesson and "Add Material" know which language the tutor teaches
// (or the student learns). The /users/me payload doesn't carry the language,
// only the Teacher / Student id, so we resolve it from the linked row here.
async function fetchTeacherProfileLanguage(teacherId) {
  try {
    const { getTutor } = await import("@/services/tutors");
    const t = await getTutor(teacherId);
    return {
      languageId: t?.language_id || null,
      language: t?.language_name || null,
      level: t?.max_level || null,
      payment_plan: t?.payment_plan || null,
      teacherBio: t?.bio || null,
    };
  } catch {
    return {};
  }
}

export function UserProvider({ children }) {
  const [role, setRole] = useState(null);
  const [profile, setProfileState] = useState(DEFAULT_PROFILE);
  const [user, setUser] = useState(null);
  const [tokens, setTokens] = useState({ access: null, refresh: null });
  const [bootstrapped, setBootstrapped] = useState(true);
  const [savedTutorIds, setSavedTutorIds] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [materials, setMaterials] = useState([]);

  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;

  const clearAuth = useCallback(() => {
    setUser(null);
    setRole(null);
    setProfileState(DEFAULT_PROFILE);
    setTokens({ access: null, refresh: null });
    setAccessToken(null);
    setRefreshToken(null);
    setSavedTutorIds([]);
    setLessons([]);
    setMaterials([]);
  }, []);

  useEffect(() => {
    configureApi({
      onUnauth: () => {
        clearAuth();
      },
      onRefresh: ({ access_token, refresh_token, user: refreshedUser }) => {
        setTokens({ access: access_token, refresh: refresh_token });
        if (refreshedUser) {
          setUser(refreshedUser);
          setRole(backendRoleToFrontend(refreshedUser.role));
        }
      },
    });
  }, [clearAuth]);

  useEffect(() => {
    let cancelled = false;
    const userId = user?.id;

    if (!userId) {
      setSavedTutorIds([]);
      return () => {
        cancelled = true;
      };
    }

    AsyncStorage.getItem(savedTutorsStorageKey(userId))
      .then((raw) => {
        if (!cancelled) setSavedTutorIds(parseSavedTutorIds(raw));
      })
      .catch(() => {
        if (!cancelled) setSavedTutorIds([]);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const applyAuthPayload = useCallback((payload) => {
    if (!payload) return;
    const { access_token, refresh_token, user: u } = payload;
    if (access_token) {
      setAccessToken(access_token);
      setTokens((prev) => ({ ...prev, access: access_token }));
    }
    if (refresh_token) {
      setRefreshToken(refresh_token);
      setTokens((prev) => ({ ...prev, refresh: refresh_token }));
    }
    if (u) {
      setUser(u);
      setRole(backendRoleToFrontend(u.role));
      setProfileState((prev) => userToProfile(u, prev));

      // Fire-and-forget enrichment: if the user is a tutor we pull their
      // Teacher row so subsequent screens (Add Material, Add Lesson, etc.)
      // have a real language_id. Without this the profile stays at
      // {languageId: null, language: ""} and uploads fail.
      if (u.teacher_id) {
        (async () => {
          const extra = await fetchTeacherProfileLanguage(u.teacher_id);
          if (extra && (extra.languageId || extra.language)) {
            setProfileState((prev) => ({ ...prev, ...extra }));
          }
        })();
        // Restore previously authored lessons so a tutor who logs out and
        // back in still sees the lessons they added before.
        (async () => {
          const restored = await fetchTutorLessons();
          if (restored.length > 0) setLessons(restored);
        })();
      }
    }
  }, []);

  const setProfile = useCallback((patch) => {
    setProfileState((prev) => ({ ...prev, ...patch }));
  }, []);

  const login = useCallback(
    async (email, password, expectedRole) => {
      const payload = await loginRequest(email, password);
      if (expectedRole) {
        const expected = frontendRoleToBackend(expectedRole);
        if (expected && payload.user?.role && payload.user.role !== expected) {
          const err = new Error(
            `This account is registered as ${payload.user.role}. Please use the correct sign-in.`
          );
          err.code = "WRONG_ROLE";
          throw err;
        }
      }
      applyAuthPayload(payload);
      return payload;
    },
    [applyAuthPayload]
  );

 const register = useCallback(
  async ({ email, password, full_name, role: registerRole, language_id, is_certified, has_experience, phone, location }) => {
    const payload = await registerRequest({
      email,
      password,
      full_name,
      role: registerRole,
      language_id,
      is_certified,
      has_experience,
      phone,
      location,
    });
    applyAuthPayload(payload);
    return payload;
  },
  [applyAuthPayload]
);

  const refreshMe = useCallback(async () => {
    try {
      const me = await getMe();
      setUser(me);
      setRole(backendRoleToFrontend(me.role));
      setProfileState((prev) => userToProfile(me, prev));
      if (me?.teacher_id) {
        const extra = await fetchTeacherProfileLanguage(me.teacher_id);
        if (extra && (extra.languageId || extra.language)) {
          setProfileState((prev) => ({ ...prev, ...extra }));
        }
        const restored = await fetchTutorLessons();
        if (restored.length > 0) setLessons(restored);
      }
      return me;
    } catch (e) {
      return null;
    }
  }, []);

  const saveProfile = useCallback(
    async (patch) => {
      const body = {};
      const {
        firstName,
        lastName,
        phone,
        timezone,
        location,
        bio,
        language,
        level,
        hourlyRate,
      } = patch || {};
      if (firstName !== undefined || lastName !== undefined) {
        const fn =
          firstName !== undefined ? firstName : profile.firstName;
        const ln = lastName !== undefined ? lastName : profile.lastName;
        body.full_name = `${fn || ""} ${ln || ""}`.trim();
      }
      if (phone !== undefined) body.phone = phone;
      if (timezone !== undefined) body.timezone = timezone;
      if (location !== undefined) body.location = location;
      if (bio !== undefined) body.bio = bio;
      if (level !== undefined && level !== "") body.level = level;
      if (language !== undefined && language !== "") {
        const resolved = findLanguageByName(language);
        if (resolved?.id) body.language_id = resolved.id;
      }
      if (hourlyRate !== undefined && hourlyRate !== null && hourlyRate !== "") {
        const parsed = Number(hourlyRate);
        if (Number.isFinite(parsed)) body.hourly_rate = parsed;
      }
      setProfile(patch);
      if (Object.keys(body).length > 0 && tokensRef.current.access) {
        const updated = await updateMe(body);
        if (updated) {
          setUser(updated);
          setProfileState((prev) => userToProfile(updated, { ...prev, ...patch, bio: patch?.bio ?? prev.bio }));
        }
      }
      return true;
    },
    [profile.firstName, profile.lastName, setProfile]
  );

  const logout = useCallback(async () => {
    // Snapshot the refresh token, then clear local state immediately so the UI
    // never renders authenticated screens after this point. The backend call
    // is best-effort — if it fails we still consider the user logged out.
    const refreshToken = tokensRef.current.refresh;
    clearAuth();
    try {
      // Pop any modal stacks first so the user lands cleanly on /login and the
      // back gesture can't return them to an authenticated screen.
      if (typeof router.dismissAll === "function") {
        try {
          router.dismissAll();
        } catch {
          /* no-op when no stack */
        }
      }
      router.replace("/login");
    } catch {
      /* navigation may fail during unmount — ignore */
    }
    try {
      if (refreshToken) {
        await logoutRequest(refreshToken);
      }
    } catch {
      /* ignore — local state is already cleared */
    }
  }, [clearAuth]);

  const addLesson = useCallback((lesson) => {
    setLessons((prev) => [...prev, { id: Date.now(), status: "upcoming", ...lesson }]);
  }, []);

  const updateLesson = useCallback((id, changes) => {
    setLessons((prev) =>
      prev.map((l) => (String(l.id) === String(id) ? { ...l, ...changes } : l))
    );
  }, []);

  const cancelLesson = useCallback((id) => {
    setLessons((prev) => prev.filter((l) => String(l.id) !== String(id)));
  }, []);

  const rescheduleLesson = useCallback((id, date, time) => {
    setLessons((prev) =>
      prev.map((l) => (l.id === id ? { ...l, date, time } : l))
    );
  }, []);

  const addMaterial = useCallback((material) => {
    setMaterials((prev) => [...prev, { id: Date.now(), file: null, ...material }]);
  }, []);

  const toggleSavedTutor = useCallback((id) => {
    const tutorId = String(id);
    const userId = user?.id;

    setSavedTutorIds((prev) => {
      const current = prev.map(String);
      const next = current.includes(tutorId)
        ? current.filter((x) => x !== tutorId)
        : [...current, tutorId];

      if (userId) {
        AsyncStorage.setItem(
          savedTutorsStorageKey(userId),
          JSON.stringify(next),
        ).catch(() => {});
      }

      return next;
    });
  }, [user?.id]);

  const setLanguageSelection = useCallback(
    ({ id, name }) => {
      const resolved = id ? findLanguageById(id) : findLanguageByName(name);
      setProfileState((prev) => ({
        ...prev,
        languageId: resolved?.id || id || prev.languageId,
        language: resolved?.name || name || prev.language,
      }));
    },
    []
  );

  const value = useMemo(
    () => ({
      role,
      setRole,
      profile,
      setProfile,
      saveProfile,
      user,
      tokens,
      isAuthenticated: !!tokens.access,
      bootstrapped,
      login,
      register,
      logout,
      refreshMe,
      applyAuthPayload,
      lessons,
      addLesson,
      updateLesson,
      cancelLesson,
      rescheduleLesson,
      materials,
      addMaterial,
      savedTutorIds,
      toggleSavedTutor,
      setLanguageSelection,
    }),
    [
      role,
      profile,
      setProfile,
      saveProfile,
      user,
      tokens,
      bootstrapped,
      login,
      register,
      logout,
      refreshMe,
      applyAuthPayload,
      lessons,
      addLesson,
      updateLesson,
      cancelLesson,
      rescheduleLesson,
      materials,
      addMaterial,
      savedTutorIds,
      toggleSavedTutor,
      setLanguageSelection,
    ]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useUser must be used within UserProvider");
  }
  return ctx;
}
