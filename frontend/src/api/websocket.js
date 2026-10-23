/**
 * Shared WebSocket URL configuration helper.
 * Reads VITE_WS_BASE_URL from environment variables if defined.
 * Defaults to ws://127.0.0.1:8000 (or wss:// for https).
 */
export function getWebSocketBaseUrl() {
  const envWsUrl = import.meta.env.VITE_WS_BASE_URL;
  if (envWsUrl) {
    return envWsUrl.replace(/\/$/, "");
  }
  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  const defaultProto = isHttps ? "wss:" : "ws:";
  return `${defaultProto}//127.0.0.1:8000`;
}

export function buildEmergencyChatWsUrl(emergencyId) {
  const baseUrl = getWebSocketBaseUrl();
  const token = localStorage.getItem("access") || localStorage.getItem("token") || localStorage.getItem("access_token") || "";
  return `${baseUrl}/ws/emergencies/${emergencyId}/chat/?token=${encodeURIComponent(token)}`;
}
