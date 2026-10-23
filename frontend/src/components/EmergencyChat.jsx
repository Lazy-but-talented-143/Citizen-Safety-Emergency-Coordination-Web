import { useState, useEffect, useCallback, useRef } from "react";
import api from "../api/axios";
import { buildEmergencyChatWsUrl } from "../api/websocket";

function EmergencyChat({ emergencyId, readOnly = false, onClose, emergency }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [wsStatus, setWsStatus] = useState("RECONNECTING"); // CONNECTED | RECONNECTING | OFFLINE
  const [hasUnreadBelow, setHasUnreadBelow] = useState(false);

  const [activeCount, setActiveCount] = useState(1);
  const [activeMembers, setActiveMembers] = useState([]);

  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const isUnmountedRef = useRef(false);
  const containerRef = useRef(null);

  const isClosedIncident = readOnly || ["RESOLVED", "CANCELLED", "AUTO_CLOSED"].includes(emergency?.status);

  const isNearBottom = () => {
    if (!containerRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    return scrollHeight - scrollTop - clientHeight < 80;
  };

  const scrollToBottom = (smooth = true) => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    }
    setHasUnreadBelow(false);
  };

  const load = useCallback(async () => {
    try {
      const r = await api.get(`chat-messages/?emergency=${emergencyId}`);
      const data = Array.isArray(r.data) ? r.data : [];
      setMessages(data);
      setError("");
      setTimeout(() => scrollToBottom(false), 50);
    } catch (e) {
      setError(e.response?.data?.error || "Unable to load incident chat.");
    } finally {
      setLoading(false);
    }
  }, [emergencyId]);

  const connectWs = useCallback(() => {
    if (isUnmountedRef.current) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setWsStatus("RECONNECTING");
    const wsUrl = buildEmergencyChatWsUrl(emergencyId);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isUnmountedRef.current) return;
        setWsStatus("CONNECTED");
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        if (isUnmountedRef.current) return;
        try {
          const data = JSON.parse(event.data);
          if (data && data.type === "presence") {
            setActiveCount(data.active_count || 1);
            setActiveMembers(data.active_members || []);
            return;
          }
          if (data && data.id) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === data.id)) return prev;
              return [...prev, data];
            });
            if (isNearBottom()) {
              setTimeout(() => scrollToBottom(true), 50);
            } else {
              setHasUnreadBelow(true);
            }
          }
        } catch (e) {
          console.error("Failed to parse websocket message", e);
        }
      };

      ws.onerror = () => {
        if (isUnmountedRef.current) return;
        setWsStatus("OFFLINE");
      };

      ws.onclose = () => {
        if (isUnmountedRef.current) return;
        setWsStatus("OFFLINE");
        const attempts = reconnectAttemptsRef.current + 1;
        reconnectAttemptsRef.current = attempts;
        const delay = Math.min(1000 * Math.pow(2, attempts - 1), 10000);

        reconnectTimerRef.current = setTimeout(() => {
          connectWs();
        }, delay);
      };
    } catch {
      setWsStatus("OFFLINE");
    }
  }, [emergencyId]);

  useEffect(() => {
    isUnmountedRef.current = false;
    load();
    connectWs();

    return () => {
      isUnmountedRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [emergencyId, load, connectWs]);

  useEffect(() => {
    if (wsStatus !== "CONNECTED") {
      const t = setInterval(load, 10000);
      return () => clearInterval(t);
    }
  }, [wsStatus, load]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || isClosedIncident || sending) return;
    const msgText = text.trim();
    setSending(true);
    setError("");

    try {
      // 1. Post to REST API (guarantees DB persistence & backend audit)
      const res = await api.post("chat-messages/", {
        emergency: emergencyId,
        message: msgText,
      });

      const newMsg = res.data;
      if (newMsg && newMsg.id) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      }

      setText("");
      setTimeout(() => scrollToBottom(true), 50);

      // 2. Also notify via WebSocket if open
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: "chat_message", ...newMsg }));
        } catch {
          // ignore ws send failure since REST succeeded
        }
      }
    } catch (e) {
      console.error("Failed to send chat message", e);
      setError(e.response?.data?.error || "Message could not be sent. Try again.");
    } finally {
      setSending(false);
    }
  };

  const handleScroll = () => {
    if (isNearBottom()) {
      setHasUnreadBelow(false);
    }
  };

  const formatTimestamp = (val) => {
    if (!val) return "";
    const d = new Date(val);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString([], {
      month: "numeric",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  };

  return (
    <div
      className="emergency-chat-modal-backdrop"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.4)",
        backdropFilter: "blur(2px)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        className="emergency-chat-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(680px, 92vw)",
          background: "#FFFFFF",
          borderRadius: "20px",
          padding: "24px",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.2)",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          position: "relative",
          color: "#1E293B",
        }}
      >
        {/* Top-Right CLOSE Button */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            style={{
              position: "absolute",
              top: "20px",
              right: "20px",
              background: "#DC2626",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "8px",
              padding: "8px 18px",
              fontWeight: "800",
              fontSize: "0.85rem",
              cursor: "pointer",
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              zIndex: 2,
            }}
          >
            CLOSE
          </button>
        )}

        {/* Header */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            paddingRight: onClose ? "90px" : "0px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <h2
              style={{
                margin: 0,
                fontSize: "1.35rem",
                fontWeight: "800",
                color: "#1E293B",
              }}
            >
              Emergency #{emergencyId} · Incident Chat
            </h2>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: "700",
                padding: "3px 10px",
                borderRadius: "12px",
                background: "#DCFCE7",
                color: "#15803D",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
              }}
              title={activeMembers.length ? `Active now: ${activeMembers.map(m => m.name).join(", ")}` : "Active members in chat"}
            >
              <span style={{ fontSize: "0.6rem" }}>●</span> {activeCount} Active {activeCount === 1 ? "Member" : "Members"}
            </span>
            {wsStatus !== "CONNECTED" && (
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: "600",
                  padding: "2px 8px",
                  borderRadius: "10px",
                  background: wsStatus === "RECONNECTING" ? "#FEF3C7" : "#FEE2E2",
                  color: wsStatus === "RECONNECTING" ? "#D97706" : "#DC2626",
                }}
              >
                ● {wsStatus === "RECONNECTING" ? "Reconnecting" : "Offline"}
              </span>
            )}
          </div>
          <p
            style={{
              margin: 0,
              fontSize: "0.9rem",
              color: "#64748B",
            }}
          >
            Keep communication focused on this emergency.
          </p>
        </div>

        {error && (
          <div
            style={{
              color: "#DC2626",
              background: "#FEE2E2",
              padding: "10px 14px",
              borderRadius: "8px",
              fontSize: "0.85rem",
              fontWeight: "600",
            }}
          >
            {error}
          </div>
        )}

        {/* Message Container Area */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          style={{
            background: "#F8FAFC",
            border: "1px solid #E2E8F0",
            borderRadius: "16px",
            padding: "16px",
            height: "320px",
            minHeight: "240px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            position: "relative",
          }}
        >
          {loading ? (
            <div style={{ textAlign: "center", margin: "auto", color: "#94A3B8", fontSize: "0.9rem" }}>
              Loading conversation...
            </div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: "center", margin: "auto", color: "#94A3B8", fontStyle: "italic", fontSize: "0.9rem" }}>
              No messages yet.
            </div>
          ) : (
            messages.map((m, idx) => {
              const isMe = m.sender === currentUser.id || m.sender_username === currentUser.username;
              return (
                <div
                  key={m.id || idx}
                  style={{
                    alignSelf: isMe ? "flex-end" : "flex-start",
                    width: "72%",
                    background: isMe ? "#F0F4F8" : "#FFFFFF",
                    borderRadius: "12px",
                    padding: "12px 16px",
                    border: isMe ? "1px solid #CBD5E1" : "1px solid #E2E8F0",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justify: "space-between",
                      alignItems: "center",
                      marginBottom: "4px",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: "700",
                        color: "#1E293B",
                        fontSize: "0.85rem",
                      }}
                    >
                      {m.sender_name || m.sender_username || "User"}
                    </span>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "#94A3B8",
                      }}
                    >
                      {formatTimestamp(m.created_at)}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "0.95rem",
                      color: "#0F172A",
                      wordBreak: "break-word",
                      lineHeight: "1.4",
                    }}
                  >
                    {m.message}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {hasUnreadBelow && (
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            style={{
              position: "absolute",
              bottom: "85px",
              left: "50%",
              transform: "translateX(-50%)",
              padding: "6px 14px",
              background: "#0284C7",
              color: "#FFF",
              border: "none",
              borderRadius: "16px",
              fontSize: "0.75rem",
              fontWeight: "bold",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
              zIndex: 10,
            }}
          >
            New message ↓
          </button>
        )}

        {/* Bottom Input Area */}
        {!isClosedIncident ? (
          <form
            onSubmit={send}
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "center",
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type an emergency update..."
              disabled={sending}
              maxLength={500}
              style={{
                flex: 1,
                padding: "12px 16px",
                borderRadius: "6px",
                border: "1.5px solid #334155",
                background: "#FFFFFF",
                color: "#0F172A",
                fontSize: "0.95rem",
                outline: "none",
              }}
            />
            <button
              type="submit"
              disabled={sending || !text.trim()}
              style={{
                background: "#0066FF",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "8px",
                padding: "12px 26px",
                fontWeight: "800",
                fontSize: "0.9rem",
                cursor: sending || !text.trim() ? "not-allowed" : "pointer",
                letterSpacing: "0.5px",
                textTransform: "uppercase",
                opacity: sending || !text.trim() ? 0.7 : 1,
              }}
            >
              {sending ? "SENDING..." : "SEND"}
            </button>
          </form>
        ) : (
          <div
            style={{
              textAlign: "center",
              padding: "12px",
              background: "#FEE2E2",
              borderRadius: "8px",
              border: "1px solid #FCA5A5",
              color: "#991B1B",
              fontWeight: "700",
              fontSize: "0.85rem",
              letterSpacing: "0.5px",
            }}
          >
            INCIDENT CLOSED — CHAT IS READ-ONLY
          </div>
        )}
      </div>
    </div>
  );
}

export default EmergencyChat;
