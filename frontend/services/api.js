import { API_BASE_URL, API_V1 } from "@/constants/api";

let accessTokenRef = null;
let refreshTokenRef = null;
let onUnauthorized = null;
let onTokensRefreshed = null;

export function configureApi({ accessToken, refreshToken, onUnauth, onRefresh } = {}) {
  if (accessToken !== undefined) accessTokenRef = accessToken;
  if (refreshToken !== undefined) refreshTokenRef = refreshToken;
  if (onUnauth !== undefined) onUnauthorized = onUnauth;
  if (onRefresh !== undefined) onTokensRefreshed = onRefresh;
}

export function setAccessToken(token) {
  accessTokenRef = token || null;
}

export function setRefreshToken(token) {
  refreshTokenRef = token || null;
}

export function getAccessToken() {
  return accessTokenRef;
}

export function getRefreshToken() {
  return refreshTokenRef;
}

const V1_PREFIXES = [
  "/auth/",
  "/users/",
  "/tutors/",
  "/sessions/",
  "/chat/",
  "/reviews/",
  "/payments/",
  "/admin/",
  "/health",
  "/languages",
];

function buildUrl(path) {
  if (/^https?:\/\//.test(path)) return path;
  if (path.startsWith("/api/")) return `${API_BASE_URL}${path}`;
  if (path.startsWith("/")) {
    if (V1_PREFIXES.some((p) => path === p.replace(/\/$/, "") || path.startsWith(p))) {
      return `${API_V1}${path}`;
    }
    return `${API_BASE_URL}${path}`;
  }
  return `${API_V1}/${path}`;
}

async function parseResponse(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function buildError(res, body) {
  const detail =
    (body && typeof body === "object" && (body.detail || body.message)) ||
    (typeof body === "string" ? body : null) ||
    `Request failed (${res.status})`;
  const message = Array.isArray(detail)
    ? detail.map((d) => d.msg || JSON.stringify(d)).join(", ")
    : String(detail);
  const error = new Error(message);
  error.status = res.status;
  error.body = body;
  return error;
}

async function tryRefresh() {
  if (!refreshTokenRef) return false;
  try {
    const res = await fetch(`${API_V1}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshTokenRef }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    accessTokenRef = data.access_token;
    refreshTokenRef = data.refresh_token;
    if (onTokensRefreshed) {
      onTokensRefreshed({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user: data.user,
      });
    }
    return true;
  } catch {
    return false;
  }
}

async function doFetch(path, options, retry = true) {
  const url = buildUrl(path);
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) {
    if (!headers["Content-Type"] && options.body) {
      headers["Content-Type"] = "application/json";
    }
  }
  if (accessTokenRef && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${accessTokenRef}`;
  }

  let res;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (e) {
    const err = new Error(
      `Network request failed (${url}): ${e?.message || e}`
    );
    err.cause = e;
    throw err;
  }

  if (res.status === 401 && retry && refreshTokenRef && !path.includes("/auth/")) {
    const refreshed = await tryRefresh();
    if (refreshed) return doFetch(path, options, false);
    if (onUnauthorized) onUnauthorized();
  }

  const body = await parseResponse(res);
  if (!res.ok) throw buildError(res, body);
  return body;
}

export const api = {
  get: (path, options = {}) => doFetch(path, { method: "GET", ...options }),
  delete: (path, options = {}) => doFetch(path, { method: "DELETE", ...options }),
  post: (path, body, options = {}) =>
    doFetch(path, {
      method: "POST",
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
      ...options,
    }),
  put: (path, body, options = {}) =>
    doFetch(path, {
      method: "PUT",
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
      ...options,
    }),
  patch: (path, body, options = {}) =>
    doFetch(path, {
      method: "PATCH",
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
      ...options,
    }),
};

export function buildMediaUrl(relativePath) {
  if (!relativePath) return null;
  if (/^https?:\/\//.test(relativePath)) return relativePath;
  const trimmed = String(relativePath).replace(/^\/+/, "");
  return `${API_BASE_URL}/${trimmed}`;
}
