import { router } from "expo-router";
import { useUser } from "../contexts/user-context";

export function safeBack(fallback) {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  if (fallback) {
    router.replace(fallback);
  } else {
    router.replace("/login");
  }
}

export function useSafeBack() {
  const { role } = useUser();
  return (fallback) => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (fallback) {
      router.replace(fallback);
      return;
    }
    if (role === "Tutor") {
      router.replace("/tutor-dashboard");
    } else if (role === "Learner") {
      router.replace("/student-dashboard");
    } else if (role === "Admin") {
      router.replace("/admin-dashboard");
    } else {
      router.replace("/login");
    }
  };
}
