import React, { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import EmergencyChat from "../components/EmergencyChat";
import GuardianResponsibilities from "../components/GuardianResponsibilities";

const formatDate = (value) => value ? new Date(value).toLocaleString() : "—";
const statuses = [["ALL","ALL"],["PENDING","PENDING"],["ASSIGNED","ASSIGNED"],["IN_PROGRESS","IN PROGRESS"],["RESOLVED","RESOLVED"]];

export default function GuardianDashboard({ user, availabilityStatus, updateAvailability, isTrackingLocation, shareLiveLocation }) {
  const [guardians, setGuardians] = useState([]);
  const [emergencies, setEmergencies] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [section, setSection] = useState("incidents");
  const [filter, setFilter] = useState("ALL");
  const [priority, setPriority] = useState("ALL");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [chatEmergencyId, setChatEmergencyId] = useState(null);
  const [internalAvailability, setInternalAvailability] = useState("AVAILABLE");

  const currentAvailability = availabilityStatus || internalAvailability;

  const handleUpdateAvailability = async (nextStatus) => {
    if (updateAvailability) {
      await updateAvailability(nextStatus);
    } else {
      setInternalAvailability(nextStatus);
    }
  };

  const load = async () => {
    try {
      const [g, e, n] = await Promise.all([api.get("guardians/mine/"), api.get("emergencies/"), api.get("notifications/")]);
      const gList = Array.isArray(g.data) ? g.data : (g.data ? [g.data] : []);
      setGuardians(gList);
      setEmergencies(Array.isArray(e.data) ? e.data : []);
      setNotifications(Array.isArray(n.data) ? n.data : []);
      setError("");
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.detail || "Unable to load guardian dashboard.");
    }
  };

  useEffect(() => { load(); }, []);

  const respond = async (id, decision) => {
    try {
      await api.patch(`emergencies/${id}/guardian-response/`, { decision });
      setMessage(`Emergency #${id}: ${decision === "ACCEPT" ? "Accepted" : decision === "DECLINE" ? "Declined" : "Cancelled"}.`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.detail || "Unable to respond.");
    }
  };

  const markAction = async (id, actionEndpoint) => {
    try {
      await api.patch(`emergencies/${id}/${actionEndpoint}/`);
      setMessage(`Emergency #${id}: ${actionEndpoint.replace("_", " ")} complete.`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.detail || `Unable to ${actionEndpoint}.`);
    }
  };

  const markRead = async (id) => { try { await api.patch(`notifications/${id}/read/`); await load(); } catch (err) { setError(err.response?.data?.error || "Unable to mark notification read."); } };
  const readAll = async () => { try { await api.patch("notifications/read_all/"); await load(); } catch (err) { setError(err.response?.data?.error || "Unable to mark notifications read."); } };

  const guardianIds = useMemo(() => guardians.map((g) => String(g.id)), [guardians]);

  const filtered = useMemo(() => emergencies.filter((e) => {
    const statusOk = filter === "ALL" || e.status === filter;
    const priorityOk = priority === "ALL" || e.priority === priority;
    const term = search.trim().toLowerCase();
    const text = `${e.id} ${e.emergency_type} ${e.location} ${e.description}`.toLowerCase();
    return statusOk && priorityOk && (!term || text.includes(term));
  }), [emergencies, filter, priority, search]);

  const waiting = emergencies.filter((e) => e.escalations?.some((x) => guardianIds.includes(String(x.guardian)) && x.response_status === "WAITING"));

  return (
    <>
      <section className="security-hero">
        <div>
          <span className="eyebrow">GUARDIAN RESPONSE CENTER</span>
          <h1>Protected Resident Board</h1>
          <p>Monitor emergency alerts and live response stages for your 2–3 protected residents.</p>
        </div>
        <div className={`security-availability-badge ${String(currentAvailability).toLowerCase()}`}>
          {currentAvailability}
        </div>
      </section>

      {message && <div className="success-message">{message}</div>}
      {error && <div className="error-message dashboard-message">{error}</div>}

      <div className="cards responder-card-row security-dashboard-cards">
        <button type="button" className={`feature-card security-dashboard-card ${section === "availability" ? "selected-card" : ""}`} onClick={() => setSection("availability")}>
          <div className="feature-icon">A</div>
          <h2>Availability</h2>
          <p>Current status: <strong>{currentAvailability}</strong></p>
          <span className="card-link">Manage readiness →</span>
        </button>

        <button type="button" className={`feature-card emergency-card security-dashboard-card ${section === "incidents" ? "selected-card" : ""}`} onClick={() => { setSection("incidents"); load(); }}>
          <div className="feature-icon">!</div>
          <h2>Protected Incident Board</h2>
          <p>{waiting.length > 0 ? `${waiting.length} alert(s) waiting for response` : "Monitor protected resident emergencies."}</p>
          <span className="card-link">Open incident board →</span>
        </button>

        <button type="button" className={`feature-card security-dashboard-card ${section === "residents" ? "selected-card" : ""}`} onClick={() => setSection("residents")}>
          <div className="feature-icon">R</div>
          <h2>My Protected Residents</h2>
          <p>{guardians.length} resident(s) protected by you.</p>
          <span className="card-link">View residents →</span>
        </button>

        <button type="button" className={`feature-card security-dashboard-card ${section === "responsibilities" ? "selected-card" : ""}`} onClick={() => setSection("responsibilities")}>
          <div className="feature-icon">🛡</div>
          <h2>Guardian Approvals</h2>
          <p>Approvals &amp; reverse requests.</p>
          <span className="card-link">Manage approvals →</span>
        </button>

        <button type="button" className={`feature-card security-dashboard-card ${section === "notifications" ? "selected-card" : ""}`} onClick={() => { setSection("notifications"); load(); }}>
          <div className="feature-icon">N</div>
          <h2>Notifications</h2>
          <p>{notifications.filter(n => !n.is_read).length} unread updates.</p>
          <span className="card-link">View notifications →</span>
        </button>
      </div>

      {section === "availability" && (
        <div className="resident-panel security-control-panel">
          <div className="panel-header">
            <div>
              <h2>Guardian Availability</h2>
              <p>Set your current readiness before responding to emergency alerts from your protected residents.</p>
            </div>
          </div>
          <div className="volunteer-buttons">
            <button className="available-button" onClick={() => handleUpdateAvailability("AVAILABLE")}>AVAILABLE</button>
            <button className="busy-button" onClick={() => handleUpdateAvailability("BUSY")}>BUSY</button>
            <button className="offline-button" onClick={() => handleUpdateAvailability("OFFLINE")}>OFFLINE</button>
            {shareLiveLocation && (
              <button className={`assistance-button ${isTrackingLocation ? "tracking-active" : ""}`} onClick={shareLiveLocation}>
                {isTrackingLocation ? "STOP LIVE LOCATION" : "SHARE LIVE LOCATION"}
              </button>
            )}
          </div>
        </div>
      )}

      {section === "residents" && (
        <div className="resident-panel">
          <div className="panel-header">
            <div>
              <h2>MY PROTECTED RESIDENTS</h2>
              <p>Residents who have assigned you as their Primary Guardian, Secondary Guardian, or Emergency Contact.</p>
            </div>
            <button className="secondary-action-button" onClick={load}>REFRESH</button>
          </div>
          {guardians.length === 0 ? (
            <p className="muted">No protected residents mapped yet.</p>
          ) : (
            <div className="grid-container" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px" }}>
              {guardians.map((g) => {
                const activeEmergency = emergencies.find((e) => String(e.user) === String(g.resident) && ["PENDING", "ASSIGNED", "IN_PROGRESS"].includes(e.status));
                const displayResident = g.resident_name || g.resident_username || `Resident #${g.resident}`;
                return (
                  <div key={g.id} className="resident-card" style={{ padding: "20px", background: "#ffffff", borderRadius: "14px", border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", color: "#1e293b" }}>
                    <h3 style={{ margin: "0 0 6px 0", fontSize: "1.15rem", color: "#0f172a" }}>{displayResident}</h3>
                    <p style={{ margin: "0 0 10px 0", color: "#64748b", fontSize: "0.9rem" }}>
                      <strong>Your Role:</strong> <span className="badge" style={{ padding: "3px 8px", background: "#0284c7", color: "#ffffff", borderRadius: "4px", fontSize: "11px", fontWeight: "700", textTransform: "uppercase", marginLeft: "4px" }}>{g.guardian_type}</span> · <strong>Relation:</strong> {g.relation}
                    </p>
                    <p style={{ fontSize: "0.88rem", margin: "4px 0", color: "#334155" }}><strong>Phone:</strong> {g.phone} · <strong>Email:</strong> {g.email || "—"}</p>
                    <p style={{ fontSize: "0.88rem", margin: "4px 0", color: "#334155" }}><strong>Verification:</strong> <span className={`verification-badge ${g.is_verified ? "verified" : "pending"}`}>{g.is_verified ? "VERIFIED" : "PENDING"}</span></p>
                    {activeEmergency ? (
                      <div style={{ marginTop: "14px", padding: "12px", background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "10px" }}>
                        <strong style={{ color: "#dc2626", display: "block", marginBottom: "4px" }}>🚨 Active Emergency #{activeEmergency.id}</strong>
                        <p style={{ margin: "2px 0 8px 0", fontSize: "0.85rem", color: "#792727" }}>{activeEmergency.emergency_type} · STATUS: {activeEmergency.status}</p>
                        <button className="accept-button" style={{ width: "100%", padding: "10px" }} onClick={() => setSection("incidents")}>VIEW EMERGENCY</button>
                      </div>
                    ) : (
                      <p style={{ fontSize: "0.85rem", marginTop: "12px", color: "#16a34a", fontWeight: "600" }}>✓ No active emergency reported</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {section === "incidents" && (
        <div className="resident-panel">
          <div className="panel-header">
            <div>
              <h2>Protected Resident Incident Board</h2>
              <p>Search, inspect and respond to emergency alerts for your protected residents.</p>
            </div>
            <button className="primary-filled-button" onClick={load}>REFRESH</button>
          </div>

          <div className="emergency-filter-row">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search emergency, location or description" />
          </div>

          <div className="priority-button-row">
            {["ALL", "LOW", "MEDIUM", "HIGH", "CRITICAL"].map((p) => (
              <button key={p} className={`priority-filter-button priority-${p.toLowerCase()} ${priority === p ? "active" : ""}`} onClick={() => setPriority(p)}>{p}</button>
            ))}
          </div>

          <div className="filter-button-row">
            {statuses.map(([key, label]) => (
              <button key={key} className={`status-filter-button ${filter === key ? "active" : ""}`} onClick={() => setFilter(key)}>
                {label} ({key === "ALL" ? emergencies.length : emergencies.filter((e) => e.status === key).length})
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <strong>No emergency incidents match these filters.</strong>
              <span>New emergency alerts from your protected residents will appear here automatically.</span>
            </div>
          ) : (
            <div className="emergency-list">
              {filtered.map((e) => {
                const waitingForMe = e.escalations?.some((x) => guardianIds.includes(String(x.guardian)) && x.response_status === "WAITING");
                const acceptedByMe = e.escalations?.some((x) => guardianIds.includes(String(x.guardian)) && x.response_status === "ACCEPTED");

                return (
                  <div className="emergency-item" key={e.id}>
                    <div className="emergency-top">
                      <h3>Emergency #{e.id}</h3>
                      <span className={`status status-${String(e.status).toLowerCase()}`}>{e.status}</span>
                    </div>

                    <p><strong>Resident:</strong> {e.requester_name || e.requester_username || `#${e.user}`}</p>
                    <p><strong>Emergency:</strong> {e.emergency_type} · <strong>Priority:</strong> {e.priority}</p>
                    <p><strong>Society:</strong> {e.society_name || e.user_society || "—"} · <strong>Location:</strong> {e.location}</p>
                    <p><strong>GPS:</strong> {e.latitude ?? "—"}, {e.longitude ?? "—"}</p>
                    <p><strong>Description:</strong> {e.description}</p>
                    <p><strong>Created:</strong> {formatDate(e.created_at)}</p>

                    {(e.assigned_security_name || e.assigned_volunteer_name) && (
                      <div className="responder-info-box" style={{ background: "rgba(56, 189, 248, 0.08)", border: "1px solid rgba(56, 189, 248, 0.25)", borderRadius: "10px", padding: "12px 14px", margin: "10px 0" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                          <strong style={{ color: "#0284c7", fontSize: "0.9rem" }}>🛡️ Assisting Responder Details</strong>
                          <span className="availability-pill available" style={{ fontSize: "10px", padding: "3px 8px" }}>
                            {e.status === "IN_PROGRESS" ? "ASSISTING" : "ASSIGNED"}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.9rem", lineHeight: "1.5" }}>
                          <p style={{ margin: "2px 0" }}><strong>Full Name:</strong> {e.assigned_security_name ? (e.assigned_security_full_name || e.assigned_security_name) : (e.assigned_volunteer_full_name || e.assigned_volunteer_name)} ({e.assigned_security_name ? "Security Person" : "Community Volunteer"})</p>
                          <p style={{ margin: "2px 0" }}><strong>Phone:</strong> {(e.assigned_security_phone || e.assigned_volunteer_phone) ? <a href={`tel:${e.assigned_security_phone || e.assigned_volunteer_phone}`} style={{ color: "#0284c7", fontWeight: "700", textDecoration: "underline" }}>{e.assigned_security_phone || e.assigned_volunteer_phone}</a> : "N/A"}</p>
                        </div>
                      </div>
                    )}

                    <div className="guardian-actions">
                      {acceptedByMe && <button className="secondary-action-button" onClick={() => setChatEmergencyId(e.id)}>OPEN CHAT</button>}
                      {e.latitude && e.longitude && <a className="secondary-action-button map-link" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${e.latitude}&mlon=${e.longitude}#map=18/${e.latitude}/${e.longitude}`}>VIEW MAP</a>}
                      {waitingForMe && (
                        <>
                          <button className="accept-button" onClick={() => respond(e.id, "ACCEPT")}>ACCEPT EMERGENCY</button>
                          <button className="cancel-button" onClick={() => respond(e.id, "DECLINE")}>DECLINE</button>
                        </>
                      )}
                      {acceptedByMe && e.status !== "RESOLVED" && (
                        <>
                          <button className="assistance-button" onClick={() => markAction(e.id, "mark_reached")}>MARK REACHED</button>
                          <button className="assistance-button" onClick={() => markAction(e.id, "start_assistance")}>START ASSISTANCE</button>
                          <button className="resolve-button" onClick={() => markAction(e.id, "resolve")}>RESOLVE</button>
                          <button className="cancel-button" onClick={() => respond(e.id, "CANCEL")}>CANCEL RESPONSE</button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {section === "responsibilities" && (
        <div className="resident-panel">
          <GuardianResponsibilities />
        </div>
      )}

      {section === "notifications" && (
        <div className="resident-panel">
          <div className="panel-header">
            <div>
              <h2>Guardian Notifications</h2>
              <p>Alerts and escalation audit logs for your protected residents.</p>
            </div>
            <button className="secondary-action-button" onClick={readAll}>MARK ALL READ</button>
          </div>
          <div className="notification-list">
            {notifications.length === 0 ? (
              <p className="muted">No notifications available.</p>
            ) : (
              notifications.map((n) => (
                <div className={`notification-item ${n.is_read ? "read" : "unread"}`} key={n.id}>
                  <h3>{n.title}</h3>
                  <p>{n.message}</p>
                  <small>{n.channel} · {formatDate(n.created_at)}</small>
                  {!n.is_read && <button className="secondary-action-button" onClick={() => markRead(n.id)}>MARK READ</button>}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {chatEmergencyId && <EmergencyChat emergencyId={chatEmergencyId} onClose={() => setChatEmergencyId(null)} emergency={emergencies.find((e) => e.id === chatEmergencyId)} />}
    </>
  );
}
