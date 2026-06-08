const API = "/api/v1";

async function extractErrorText(res, fallback = "Ошибка запроса") {
  try {
    const data = await res.json();
    const msg = data?.detail;
    if (typeof msg === "string" && msg.trim()) {
      if (msg === "Email already registered") return "Этот email уже зарегистрирован";
      return msg;
    }
    if (Array.isArray(msg)) {
      const parts = msg
        .map((item) => {
          if (typeof item === "string") return item;
          if (item?.msg) {
            const loc = Array.isArray(item.loc) ? item.loc.filter((x) => x !== "body").join(".") : "";
            return loc ? `${loc}: ${item.msg}` : item.msg;
          }
          return null;
        })
        .filter(Boolean);
      if (parts.length) return parts.join("; ");
    }
    if (msg) return JSON.stringify(msg);
  } catch {
    /* empty */
  }
  return fallback || res.statusText || "Ошибка запроса";
}

export function getToken() {
  return localStorage.getItem("gf_token") || "";
}

export function getRole() {
  return localStorage.getItem("gf_role") || "";
}

export function setAuth(token, role) {
  if (token) {
    localStorage.setItem("gf_token", token);
    localStorage.setItem("gf_role", role || "user");
  } else {
    localStorage.removeItem("gf_token");
    localStorage.removeItem("gf_role");
  }
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const t = getToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  if (options.body && typeof options.body === "object" && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(API + path, { ...options, headers });
  if (!res.ok) {
    throw new Error(await extractErrorText(res));
  }
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export function buildQuery(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && String(v).trim() !== "") p.append(k, String(v).trim());
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export async function downloadBlob(path, filename, fallbackError = "Не удалось сформировать файл") {
  const q = buildQuery(path.params || {});
  const base = typeof path === "string" ? path : path.url;
  const t = getToken();
  const headers = {};
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(`${API}${base}${q}`, { headers });
  if (!res.ok) {
    throw new Error(await extractErrorText(res, fallbackError));
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadAnalyticsReport(params) {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  await downloadBlob(
    { url: "/analytics/report.pdf", params },
    `grifind_analytics_${stamp}.pdf`,
    "Не удалось сформировать PDF-отчёт",
  );
}

export async function downloadApplicationsExport(params) {
  await downloadBlob(
    { url: "/applications/export", params },
    "applications_export.csv",
    "Не удалось сформировать файл",
  );
}
