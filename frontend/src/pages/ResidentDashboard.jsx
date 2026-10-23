import { useCallback, useEffect, useRef, useState } from "react";
import api from "../api/axios";
import PrimaryGuardian from "../components/guardian/PrimaryGuardian";
import SecondaryGuardian from "../components/guardian/SecondaryGuardian";
import EmergencyContact from "../components/guardian/EmergencyContact";
import GuardianResponsibilities from "../components/GuardianResponsibilities";
import EmergencyChat from "../components/EmergencyChat";

const EMERGENCY_CATEGORIES = [
  { type: "HEART_ATTACK", icon: "❤️", label: "Heart / Chest Pain" },
  { type: "BREATHING", icon: "🫁", label: "Breathing Problem" },
  { type: "LOW_BP", icon: "🩸", label: "Low BP / Dizziness" },
  { type: "FALL", icon: "🤕", label: "Fall / Injury" },
  { type: "FIRE", icon: "🔥", label: "Fire" },
  { type: "ACCIDENT", icon: "🚗", label: "Accident" },
  { type: "SECURITY", icon: "🛡️", label: "Security Threat" },
  { type: "OTHER", icon: "•••", label: "Other Emergency" },
];

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
};

function ResidentDashboard({ user }) {
  const [location, setLocation] = useState("");
  const [emergencies, setEmergencies] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [activeSection, setActiveSection] = useState("overview");
  const [sosCountdown, setSOSCountdown] = useState(5);
  const [showSOSOptions, setShowSOSOptions] = useState(false);
  const [sosSending, setSOSSending] = useState(false);
  const [sosEmergencyId, setSOSEmergencyId] = useState(null);
  const [selectedEmergency, setSelectedEmergency] = useState(null);
  const [chatEmergencyId, setChatEmergencyId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [guardians, setGuardians] = useState([]);
  const [cancelEmergencyTarget, setCancelEmergencyTarget] = useState(null);
  const sosTimerRef = useRef(null);
  const sosSentRef = useRef(false);

  const loadEmergencies = useCallback(async () => {
    try {
      const params = {};
      if (statusFilter !== "ALL") params.status = statusFilter;
      if (priorityFilter !== "ALL") params.priority = priorityFilter;
      if (search.trim()) params.q = search.trim();
      const response = await api.get("emergencies/", { params });
      setEmergencies(Array.isArray(response.data) ? response.data : []);
      setError("");
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.detail || "Unable to load emergencies.");
    }
  }, [statusFilter, priorityFilter, search]);

  const loadGuardians = useCallback(async () => {
    try {
      const response = await api.get("guardians/");
      setGuardians(Array.isArray(response.data) ? response.data : (response.data?.results || []));
    } catch (err) {
      console.error("Unable to load guardians", err);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const response = await api.get("notifications/");
      setNotifications(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.detail || "Unable to load notifications.");
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const boot = async () => {
      try {
        await Promise.all([loadEmergencies(), loadGuardians(), loadNotifications()]);
      } catch (err) {
        if (mounted) setError(err.response?.data?.detail || err.response?.data?.error || "Unable to load resident dashboard.");
      }
    };
    boot();
    const timer = window.setInterval(async () => {
      try {
        if (mounted) {
          await loadEmergencies();
          await loadNotifications();
        }
      } catch { /* dashboard remains usable when a background poll fails */ }
    }, 5000);
    return () => { mounted = false; window.clearInterval(timer); if (sosTimerRef.current) clearInterval(sosTimerRef.current); };
  }, [loadEmergencies, loadGuardians, loadNotifications]);

  const getResidentLocation = () => new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ latitude: null, longitude: null });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => resolve({ latitude: null, longitude: null }),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  });

  const sendEmergencySOS = async (emergencyType, autoSelected = false) => {
    if (sosSentRef.current) return;
    sosSentRef.current = true;
    if (sosTimerRef.current) clearInterval(sosTimerRef.current);
    setSOSSending(true);
    setError("");
    try {
      const coordinates = await getResidentLocation();
      let residentLocation = location.trim();
      if (!residentLocation) {
        const parts = [];
        if (user.block_name) parts.push(`Block ${user.block_name}`);
        if (user.flat_number) parts.push(`Flat ${user.flat_number}`);
        residentLocation = parts.length ? parts.join(", ") : "Location unavailable";
      }
      const response = await api.post("sos/", {
        emergency_type: emergencyType,
        description: "Emergency triggered using SOS button.",
        location: residentLocation,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        category_auto_selected: autoSelected,
      });
      setSOSEmergencyId(response.data.id);
      setMessage(`SOS sent successfully. Emergency ID: ${response.data.id}`);
      setLocation("");
      setShowSOSOptions(false);
      setActiveSection("overview");
      await loadEmergencies();
      await loadNotifications();
    } catch (err) {
      sosSentRef.current = false;
      setError(err.response?.data?.error || err.response?.data?.detail || "Unable to send SOS.");
    } finally {
      setSOSSending(false);
    }
  };

  const startSOS = () => {
    if (sosSending || showSOSOptions) return;
    sosSentRef.current = false;
    setMessage("");
    setError("");
    setSOSEmergencyId(null);
    setShowSOSOptions(true);
    setSOSCountdown(5);
    if (sosTimerRef.current) clearInterval(sosTimerRef.current);
    let remaining = 5;
    sosTimerRef.current = setInterval(() => {
      remaining -= 1;
      setSOSCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(sosTimerRef.current);
        sosTimerRef.current = null;
        sendEmergencySOS("OTHER", true);
      }
    }, 1000);
  };

  const cancelSOS = () => {
    if (sosTimerRef.current) clearInterval(sosTimerRef.current);
    sosTimerRef.current = null;
    sosSentRef.current = false;
    setShowSOSOptions(false);
    setSOSCountdown(5);
  };

  const markRead = async (id) => {
    try {
      await api.patch(`notifications/${id}/read/`);
      await loadNotifications();
    } catch (err) {
      setError(err.response?.data?.error || "Unable to update notification.");
    }
  };

  const readAll = async () => {
    try {
      await api.patch("notifications/read_all/");
      await loadNotifications();
    } catch (err) {
      setError(err.response?.data?.error || "Unable to update notifications.");
    }
  };

  const openEmergencies = async () => {
    setActiveSection("emergencies");
    await loadEmergencies();
  };

  useEffect(() => {
    if (activeSection === "emergencies") loadEmergencies();
  }, [activeSection, loadEmergencies]);

  const filteredEmergencies = emergencies.filter((e) => {
    const text = `${e.id} ${e.emergency_type || ""} ${e.location || ""} ${e.description || ""}`.toLowerCase();
    return !search.trim() || text.includes(search.trim().toLowerCase());
  });

  const acceptedByMe = (emergency) => (emergency.escalations || []).some(
    (item) => String(item.responder) === String(user.id) && item.response_status === "ACCEPTED"
  );

  const startAcceptedAssistance = async (id) => {
    try {
      await api.patch(`emergencies/${id}/start-assistance/`);
      setMessage(`Assistance started for Emergency #${id}.`);
      await loadEmergencies();
    } catch (err) {
      setError(err.response?.data?.error || "Unable to start assistance.");
    }
  };

  const resolveAcceptedEmergency = async (id) => {
    try {
      await api.patch(`emergencies/${id}/resolve/`, { closure_note: "Resolved by community responder." });
      setMessage(`Emergency #${id} resolved successfully.`);
      await loadEmergencies();
    } catch (err) {
      setError(err.response?.data?.error || "Unable to resolve emergency.");
    }
  };

  const cancelResidentEmergency = async () => {
    if (!cancelEmergencyTarget) return;
    try {
      await api.patch(`emergencies/${cancelEmergencyTarget.id}/resident-cancel/`, { reason: "RESIDENT_CANCELLED" });
      setMessage(`Emergency #${cancelEmergencyTarget.id} cancelled.`);
      setCancelEmergencyTarget(null);
      setSelectedEmergency(null);
      await loadEmergencies();
      await loadNotifications();
    } catch (err) {
      setError(err.response?.data?.error || "Unable to cancel emergency.");
    }
  };

  const requestStillNeedHelp = async (id) => {
    try {
      await api.patch(`emergencies/${id}/still-need-help/`);
      setMessage(`Emergency #${id} has entered a new response cycle.`);
      await loadEmergencies();
      await loadNotifications();
    } catch (err) {
      setError(err.response?.data?.error || "Unable to start a new response cycle.");
    }
  };

  const primaryGuardian = guardians.find((g) => g.guardian_type === "PRIMARY" && g.is_active && g.is_verified) || guardians.find((g) => g.guardian_type === "PRIMARY");
  const secondaryGuardian = guardians.find((g) => g.guardian_type === "SECONDARY" && g.is_active && g.is_verified) || guardians.find((g) => g.guardian_type === "SECONDARY");

  return (
    <>
      {message && <div className="success-message">{message}</div>}
      {error && <div className="error-message dashboard-message">{error}</div>}
      {sosEmergencyId && <div className="success-message">Active SOS Emergency #{sosEmergencyId}</div>}

      {/* Centered SOS is a real interactive HTML button, not an image. */}
      <section className="resident-sos-stage" aria-label="Emergency SOS">
        <div className="resident-sos-copy centered">
          <span className="eyebrow">EMERGENCY RESPONSE</span>
          <h2>Need immediate help?</h2>
          <p>Press the central SOS button. Choose the emergency type within 5 seconds; if you do nothing, <strong>Other Emergency</strong> is sent automatically and GPS is captured.</p>
        </div>
        <button type="button" className="sos-big sos-big-centered" onClick={startSOS} disabled={sosSending} aria-label="Trigger emergency SOS">
          <span>SOS</span>
          <small>{sosSending ? "SENDING" : "EMERGENCY"}</small>
        </button>
        <p className="sos-helper">One tap starts the emergency flow. Your location is captured automatically.</p>
      </section>

      {/* ORIGINAL SOS PANEL + 5 SECOND FLOW */}
      {showSOSOptions && (
        <div className="resident-panel sos-category-panel">
          <div className="guardian-header">
            <div>
              <h2>Emergency SOS</h2>
              <p>Select the emergency type before the 5-second timer ends.</p>
            </div>
            <button type="button" className="cancel-button" onClick={cancelSOS}>CANCEL</button>
          </div>
          <div className="sos-countdown" aria-live="assertive" aria-label={`${sosCountdown} seconds remaining`}><strong>{sosCountdown}</strong><span>SEC</span></div>
          <div className="sos-category-grid">
            {EMERGENCY_CATEGORIES.map((category) => (
              <button type="button" key={category.type} className="sos-category-button" disabled={sosSending} onClick={() => sendEmergencySOS(category.type, false)}>
                <span className="category-icon">{category.icon}</span>
                <span>{category.label}</span>
              </button>
            ))}
          </div>
          <div className="sos-location-status"><strong>Automatic location capture</strong><span>GPS coordinates are requested automatically. Your registered society/block/flat is used as the human-readable fallback if GPS is unavailable.</span></div>
          <p className="sos-auto-message">If no option is selected within 5 seconds, Other Emergency will be sent automatically.</p>
        </div>
      )}


      {/* Finalized resident quick actions: five simple desktop cards under SOS. */}
      {/* Finalized resident quick actions: desktop cards under SOS. */}
      <div className="cards resident-main-cards resident-quick-actions">
        <div className={`feature-card ${activeSection === "emergencies" ? "selected-card" : ""}`} onClick={openEmergencies} role="button" tabIndex={0}><div className="feature-icon">▣</div><h2>My Emergencies</h2><p>View your reported emergencies.</p></div>
        <div className={`feature-card ${activeSection === "notifications" ? "selected-card" : ""}`} onClick={() => { setActiveSection("notifications"); loadNotifications(); }} role="button" tabIndex={0}><div className="feature-icon">●</div><h2>Notifications</h2><p>View alerts and updates.</p>{notifications.some((n) => !n.is_read) && <span className="unread-badge">{notifications.filter((n) => !n.is_read).length} unread</span>}</div>
        <div className={`feature-card ${activeSection === "responsibilities" ? "selected-card" : ""}`} onClick={() => setActiveSection("responsibilities")} role="button" tabIndex={0}><div className="feature-icon guardian-icon">🛡</div><h2>Guardian Approvals</h2><p>Approvals &amp; reverse requests.</p></div>
        <div className={`feature-card ${activeSection === "primary" ? "selected-card" : ""}`} onClick={() => setActiveSection("primary")} role="button" tabIndex={0}><div className="feature-icon guardian-icon">P</div><h2>Primary Guardian</h2><p>View primary guardian details.</p></div>
        <div className={`feature-card ${activeSection === "secondary" ? "selected-card" : ""}`} onClick={() => setActiveSection("secondary")} role="button" tabIndex={0}><div className="feature-icon guardian-icon">S</div><h2>Secondary Guardian</h2><p>View secondary guardian details.</p></div>
        <div className={`feature-card ${activeSection === "contact" ? "selected-card" : ""}`} onClick={() => setActiveSection("contact")} role="button" tabIndex={0}><div className="feature-icon">☎</div><h2>Emergency Contact</h2><p>View emergency contact details.</p></div>
      </div>

      {activeSection === "emergencies" && (
        <div className="resident-panel">
          <div className="guardian-header">
            <div><h2>My Emergencies</h2><p>Search, filter and inspect your emergency history.</p></div>
            <button className="secondary-action-button" type="button" onClick={loadEmergencies}>REFRESH</button>
          </div>
          <div className="emergency-filter-row">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search emergency, location or description" />
          </div>
          <div className="priority-button-row">
            {["ALL", "LOW", "MEDIUM", "HIGH", "CRITICAL"].map((priority) => (
              <button key={priority} type="button" className={`priority-filter-button priority-${priority.toLowerCase()} ${priorityFilter === priority ? "active" : ""}`} onClick={() => setPriorityFilter(priority)}>{priority}</button>
            ))}
          </div>
          <div className="filter-button-row">
            {["ALL", "PENDING", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CANCELLED", "AUTO_CLOSED"].map((status) => (
              <button key={status} type="button" className={`status-filter-button ${statusFilter === status ? "active" : ""}`} onClick={() => setStatusFilter(status)}>{status === "IN_PROGRESS" ? "IN PROGRESS" : status}</button>
            ))}
          </div>
          {filteredEmergencies.length === 0 ? <p>No emergencies found.</p> : <div className="emergency-list">
            {filteredEmergencies.map((emergency) => (
              <div className="emergency-item" key={emergency.id}>
                <div className="emergency-top"><h3>Emergency #{emergency.id}</h3><span className={`status status-${String(emergency.status || "").toLowerCase()}`}>{emergency.status}</span></div>
                
                <p><strong>Resident:</strong> {emergency.requester_name || emergency.requester_username || `#${emergency.user}`} · <strong>Block:</strong> {emergency.user_block_name || emergency.block_name || user.block_name || "—"}</p>
                <p><strong>Type:</strong> {emergency.emergency_type} · <strong>Priority:</strong> {emergency.priority || "HIGH"}</p>
                <p><strong>Society:</strong> {emergency.society_name || emergency.user_society || "—"} · <strong>Location:</strong> {emergency.location}</p>
                <p><strong>Created:</strong> {formatDate(emergency.created_at)}</p>

                {/* Sleek Assisting Responder Box with Complete Details */}
                {(emergency.assigned_security_name || emergency.assigned_volunteer_name) && (
                  <div className="responder-info-box" style={{ background: "rgba(56, 189, 248, 0.08)", border: "1px solid rgba(56, 189, 248, 0.25)", borderRadius: "10px", padding: "12px 14px", margin: "10px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                      <strong style={{ color: "#0284c7", fontSize: "0.9rem" }}>🛡️ Assisting Responder Details</strong>
                      <span className="availability-pill available" style={{ fontSize: "10px", padding: "3px 8px" }}>
                        {emergency.status === "IN_PROGRESS" ? "ASSISTING" : "ASSIGNED"}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.9rem", lineHeight: "1.5" }}>
                      <p style={{ margin: "2px 0" }}><strong>Full Name:</strong> {emergency.assigned_security_name ? (emergency.assigned_security_full_name || emergency.assigned_security_name) : (emergency.assigned_volunteer_full_name || emergency.assigned_volunteer_name)} ({emergency.assigned_security_name ? "Security Person" : "Community Volunteer"})</p>
                      <p style={{ margin: "2px 0" }}><strong>Phone:</strong> {(emergency.assigned_security_phone || emergency.assigned_volunteer_phone) ? <a href={`tel:${emergency.assigned_security_phone || emergency.assigned_volunteer_phone}`} style={{ color: "#0284c7", fontWeight: "700", textDecoration: "underline" }}>{emergency.assigned_security_phone || emergency.assigned_volunteer_phone}</a> : "N/A"}{(emergency.assigned_security_email || emergency.assigned_volunteer_email) ? ` · Email: ${emergency.assigned_security_email || emergency.assigned_volunteer_email}` : ""}</p>
                      {(emergency.assigned_security_address || emergency.assigned_volunteer_address) && <p style={{ margin: "2px 0", fontSize: "0.85rem", opacity: 0.8 }}><strong>Address:</strong> {emergency.assigned_security_address || emergency.assigned_volunteer_address}</p>}
                    </div>
                  </div>
                )}
                <p><strong>Society:</strong> {emergency.society_name || emergency.user_society || "—"} · <strong>Block:</strong> {emergency.user_block_name || emergency.block_name || user.block_name || "—"} · <strong>Floor:</strong> {emergency.user_floor || user.flat_floor || "—"} · <strong>Flat:</strong> {emergency.user_flat_number || emergency.flat_number || user.flat_number || "—"}</p>
                <p><strong>Location:</strong> {emergency.location}</p>
                <p><strong>GPS:</strong> {emergency.latitude ?? "—"}, {emergency.longitude ?? "—"}</p>
                <p><strong>Description:</strong> {emergency.description}</p>
                <p><strong>Created:</strong> {formatDate(emergency.created_at)}</p>
                {emergency.assistance_started_at && <p><strong>Assistance Started:</strong> {formatDate(emergency.assistance_started_at)}</p>}
                {emergency.resolved_at && <p><strong>Resolved:</strong> {formatDate(emergency.resolved_at)}</p>}
                <div className="guardian-actions">
                  <button type="button" className="assistance-button" onClick={() => setSelectedEmergency(emergency)}>VIEW DETAILS</button>{!['CANCELLED','AUTO_CLOSED'].includes(emergency.status) && <button type="button" className="secondary-action-button" onClick={() => setChatEmergencyId(emergency.id)}>OPEN CHAT</button>}{!['RESOLVED','CANCELLED','AUTO_CLOSED'].includes(emergency.status) && <button type="button" className="cancel-button" onClick={() => setCancelEmergencyTarget({id:emergency.id})}>CANCEL EMERGENCY</button>}{emergency.status === "RESOLVED" && <button type="button" className="accept-button" onClick={() => requestStillNeedHelp(emergency.id)}>I STILL NEED HELP</button>}
                  {emergency.latitude && emergency.longitude && <a className="secondary-action-button map-link" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${emergency.latitude},${emergency.longitude}`}>VIEW MAP</a>}
                  {acceptedByMe(emergency) && emergency.status === "ASSIGNED" && <button type="button" className="assistance-button" onClick={() => startAcceptedAssistance(emergency.id)}>START ASSISTANCE</button>}
                  {acceptedByMe(emergency) && emergency.status === "IN_PROGRESS" && <button type="button" className="resolve-button" onClick={() => resolveAcceptedEmergency(emergency.id)}>RESOLVE EMERGENCY</button>}
                </div>
              </div>
            ))}
          </div>}
        </div>
      )}

      {activeSection === "notifications" && (
        <div className="resident-panel">
          <div className="guardian-header"><div><h2>Notifications</h2><p>View emergency updates and escalation alerts.</p></div><button className="secondary-action-button" onClick={readAll}>MARK ALL READ</button></div>
          {notifications.length === 0 ? <p>No notifications found.</p> : <div className="notification-list">
            {notifications.map((notification, index) => <div className={`notification-item ${notification.is_read ? "read" : "unread"}`} key={notification.id || index}>
              <h3>{notification.title || "Notification"}</h3><p>{notification.message || "No notification message available."}</p><small>{formatDate(notification.created_at)}</small>
              {!notification.is_read && <button className="secondary-action-button" onClick={() => markRead(notification.id)}>MARK READ</button>}
            </div>)}
          </div>}
        </div>
      )}

      {activeSection === "responsibilities" && <div className="resident-panel"><GuardianResponsibilities /></div>}
      {activeSection === "primary" && <div className="resident-panel"><PrimaryGuardian /></div>}
      {activeSection === "secondary" && <div className="resident-panel"><SecondaryGuardian /></div>}
      {activeSection === "contact" && <div className="resident-panel"><EmergencyContact /></div>}

      {chatEmergencyId && (
        <EmergencyChat
          emergencyId={chatEmergencyId}
          onClose={() => setChatEmergencyId(null)}
          emergency={emergencies.find((e) => e.id === chatEmergencyId)}
        />
      )}

      {cancelEmergencyTarget && <div className="modal-backdrop" style={{ zIndex: 10050 }} onClick={() => setCancelEmergencyTarget(null)}><div className="modal-card cancel-modal" onClick={(e) => e.stopPropagation()}><div className="guardian-header"><div><h2>Cancel Emergency?</h2><p>This will stop the emergency response for everyone.</p></div><button className="cancel-button" onClick={() => setCancelEmergencyTarget(null)}>CLOSE</button></div><div className="modal-warning">This action is protected by two confirmations so an accidental click cannot cancel an active emergency.</div><div className="guardian-actions"><button className="secondary-action-button" onClick={() => setCancelEmergencyTarget(null)}>GO BACK</button><button className="cancel-button" onClick={() => { if (window.confirm("Final confirmation: cancel this emergency for everyone?")) cancelResidentEmergency(); }}>CONTINUE TO FINAL CONFIRMATION</button></div></div></div>}

      {(() => {
        const activeModalEmergency = selectedEmergency ? (emergencies.find((e) => e.id === selectedEmergency.id) || selectedEmergency) : null;
        if (!activeModalEmergency) return null;
        return (
          <div className="modal-backdrop" onClick={() => setSelectedEmergency(null)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="guardian-header"><div><h2>Emergency #{activeModalEmergency.id}</h2><p>Emergency details and escalation timeline</p></div><button className="cancel-button" onClick={() => setSelectedEmergency(null)}>CLOSE</button></div>
              <p><strong>Type:</strong> {activeModalEmergency.emergency_type}</p>
              <p><strong>Priority:</strong> {activeModalEmergency.priority}</p>
              <p><strong>Status:</strong> {activeModalEmergency.status}</p>
              <p><strong>Location:</strong> {activeModalEmergency.location}</p>
              {activeModalEmergency.status !== "RESOLVED" && activeModalEmergency.status !== "CANCELLED" && activeModalEmergency.status !== "AUTO_CLOSED" && <div className="important-actions-panel"><h3>Important Actions</h3><div className="important-action-list"><a className="important-action-button green" href={primaryGuardian?.phone ? `tel:${primaryGuardian.phone}` : undefined} onClick={(e)=>{ if(!primaryGuardian?.phone) e.preventDefault(); }}><strong>☎ Call Primary Guardian</strong><span>{primaryGuardian?.phone || "Primary guardian number unavailable"}</span></a><a className="important-action-button green" href={secondaryGuardian?.phone ? `tel:${secondaryGuardian.phone}` : undefined} onClick={(e)=>{ if(!secondaryGuardian?.phone) e.preventDefault(); }}><strong>☎ Call Secondary Guardian</strong><span>{secondaryGuardian?.phone || "Secondary guardian number unavailable"}</span></a><a className="important-action-button blue" href="tel:108"><strong>☎ Call Emergency Services</strong><span>Contact emergency services immediately.</span></a><button className="important-action-button red" onClick={()=>setCancelEmergencyTarget({id:activeModalEmergency.id})}><strong>✕ Cancel Emergency</strong><span>Cancel only after two confirmations.</span></button></div></div>}
              {activeModalEmergency.status === "RESOLVED" && <div className="still-help-panel"><h3>Still need help?</h3><p>If assistance is still needed, start a new response cycle without deleting this incident history.</p><button className="accept-button" onClick={()=>requestStillNeedHelp(activeModalEmergency.id)}>I STILL NEED HELP</button></div>}
              <h3>Escalation Timeline</h3>
              <div className="timeline-list">
                {(activeModalEmergency.audit_logs || []).map((log) => <div className="timeline-item" key={log.id}><strong>{log.action}</strong><span>{formatDate(log.created_at)}</span><p>{log.details}</p></div>)}
                {(!activeModalEmergency.audit_logs || activeModalEmergency.audit_logs.length === 0) && <p>No timeline entries available yet.</p>}
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}

export default ResidentDashboard;
