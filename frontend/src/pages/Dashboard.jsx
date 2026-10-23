import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import ResidentDashboard from "./ResidentDashboard";
import VolunteerDashboard from "./VolunteerDashboard";
import SecurityDashboard from "./SecurityDashboard";
import GuardianDashboard from "./GuardianDashboard";
import { PointTrendGraph, StatusDonutGraph, PriorityPointGraph, TypePointGraph, BlockPointGraph } from "../components/AdminAnalyticsGraphs";
import LiveEmergencyBoard from "../components/LiveEmergencyBoard";

const statusLabels = [
  ["ALL", "ALL"],
  ["PENDING", "PENDING"],
  ["ASSIGNED", "ASSIGNED"],
  ["IN_PROGRESS", "IN PROGRESS"],
  ["RESOLVED", "RESOLVED"],
  ["CANCELLED", "CANCELLED"],
  ["AUTO_CLOSED", "AUTO-CLOSED"],
];

const dateText = (value) => value ? new Date(value).toLocaleString() : "—";

function Dashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [availability, setAvailability] = useState(user.volunteer_status || "OFFLINE");

  const [volunteerEmergencies, setVolunteerEmergencies] = useState([]);
  const [volunteerNotifications, setVolunteerNotifications] = useState([]);
  const [securityEmergencies, setSecurityEmergencies] = useState([]);
  const [securityNotifications, setSecurityNotifications] = useState([]);
  const [activeSection, setActiveSection] = useState("incidents");
  const [volunteerFilter, setVolunteerFilter] = useState("ALL");
  const [securityFilter, setSecurityFilter] = useState("ALL");
  const [pendingQueue, setPendingQueue] = useState([]);
  const [responderMemberships, setResponderMemberships] = useState([]);

  const [adminSection, setAdminSection] = useState("dashboard");
  const [adminStats, setAdminStats] = useState({});
  const [adminAnalytics, setAdminAnalytics] = useState({ by_type: [], by_priority: [], by_block: [], daily_trend: [] });
  const [adminEmergencies, setAdminEmergencies] = useState([]);
  const [adminSocieties, setAdminSocieties] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminGuardians, setAdminGuardians] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [flats, setFlats] = useState([]);
  const [adminFilter, setAdminFilter] = useState("ALL");
  const [adminSearch, setAdminSearch] = useState("");
  const [editingSociety, setEditingSociety] = useState(null);
  const [newUser, setNewUser] = useState({ username: "", first_name: "", last_name: "", email: "", phone: "", role: "RESIDENT", password: "", society: "", block: "", flat: "" });
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showInviteResponder, setShowInviteResponder] = useState(false);
  const [inviteData, setInviteData] = useState({ responder: "", society: "" });
  const [showProvisionSociety, setShowProvisionSociety] = useState(false);
  const [newSociety, setNewSociety] = useState({ name: "", address: "", city: "", state: "", pincode: "", admin_username: "", admin_first_name: "", admin_last_name: "", admin_email: "", admin_phone: "", admin_password: "" });
  const [newBlock, setNewBlock] = useState({ society: "", name: "" });
  const [newFlat, setNewFlat] = useState({ block: "", flat_number: "", floor: "" });
  const [cancelTarget, setCancelTarget] = useState(null);

  const inviteResponder = async (e) => {
    e.preventDefault();
    if (!inviteData.responder || !inviteData.society) return;
    try {
      await api.post("responder-requests/invite/", { responder: inviteData.responder, society: inviteData.society });
      setFlash("Responder invitation sent successfully.");
      setShowInviteResponder(false);
      setInviteData({ responder: "", society: "" });
      await loadResponderMemberships();
    } catch (err) {
      setFlash("", err.response?.data?.error || err.response?.data?.detail || "Unable to send responder invitation.");
    }
  };

  const setFlash = (msg, err = "") => { setMessage(msg); setError(err); };

  const logout = () => { localStorage.clear(); navigate("/login"); };

  const updateAvailability = async (value) => {
    try {
      const response = await api.patch("profile/volunteer-status/", { volunteer_status: value });
      const next = response.data.volunteer_status || value;
      setAvailability(next);
      localStorage.setItem("user", JSON.stringify({ ...user, volunteer_status: next }));
      setFlash(`Availability changed to ${next}.`);
    } catch (err) { setFlash("", err.response?.data?.error || "Unable to update availability."); }
  };

  const [isTrackingLocation, setIsTrackingLocation] = useState(false);
  const watcherIdRef = useRef(null);

  const shareLiveLocation = () => {
    if (!navigator.geolocation) { setFlash("", "Geolocation is not available in this browser."); return; }
    if (isTrackingLocation && watcherIdRef.current !== null) {
      navigator.geolocation.clearWatch(watcherIdRef.current);
      watcherIdRef.current = null;
      setIsTrackingLocation(false);
      setFlash("Live location tracking stopped.");
      return;
    }
    const id = navigator.geolocation.watchPosition(async (position) => {
      try { await api.post("profile/location/", { latitude: position.coords.latitude, longitude: position.coords.longitude }); }
      catch (err) { console.error(err); }
    }, () => setFlash("", "Unable to access live location."), { enableHighAccuracy: true, maximumAge: 5000 });
    watcherIdRef.current = id;
    setIsTrackingLocation(true);
    setFlash("Live responder location sharing started for this browser session.");
  };

  useEffect(() => {
    return () => {
      if (watcherIdRef.current !== null) {
        navigator.geolocation.clearWatch(watcherIdRef.current);
      }
    };
  }, []);



  const loadPendingQueue = async () => {
    try { const response = await api.get("emergencies/pending-queue/"); setPendingQueue(Array.isArray(response.data) ? response.data : []); }
    catch (err) { console.error("Unable to load pending queue", err); }
  };

  const loadResponderMemberships = async () => {
    try { const response = await api.get("responder-requests/"); setResponderMemberships(Array.isArray(response.data) ? response.data : []); }
    catch (err) { console.error("Unable to load responder membership requests", err); }
  };

  const respondResponderMembership = async (id, action) => {
    try { await api.post(`responder-requests/${id}/${action}/`); await loadResponderMemberships(); setFlash(action === "accept" ? "Responder society membership accepted." : "Responder membership declined."); if (user.role === "SECURITY") await loadSecurity(); if (user.role === "VOLUNTEER") await loadVolunteer(); }
    catch (err) { setFlash("", err.response?.data?.error || "Unable to update responder membership."); }
  };

  const deleteResponderInvitation = async (id, name) => {
    if (!window.confirm(`Delete invitation sent to ${name}?`)) return;
    try {
      await api.delete(`responder-requests/${id}/`);
      await loadResponderMemberships();
      setFlash("Invitation deleted successfully.");
    } catch (err) {
      setFlash("", err.response?.data?.error || err.response?.data?.detail || "Unable to delete invitation.");
    }
  };

  const loadVolunteer = async () => {
    const [e, n] = await Promise.allSettled([api.get("emergencies/"), api.get("notifications/")]);
    const failures = [];
    if (e.status === "fulfilled") {
      const items = Array.isArray(e.value.data) ? e.value.data : (e.value.data?.results || []);
      setVolunteerEmergencies(items);
    } else failures.push(`incidents: ${e.reason?.response?.data?.detail || e.reason?.response?.data?.error || "request failed"}`);
    if (n.status === "fulfilled") setVolunteerNotifications(Array.isArray(n.value.data) ? n.value.data : (n.value.data?.results || []));
    else failures.push(`notifications: ${n.reason?.response?.data?.detail || n.reason?.response?.data?.error || "request failed"}`);
    if (failures.length) setFlash("", `Some volunteer data could not be loaded. ${failures.join(" · ")}`);
  };


  const loadSecurity = async () => {
    const [e, n] = await Promise.allSettled([api.get("emergencies/"), api.get("notifications/")]);
    const failures = [];
    if (e.status === "fulfilled") {
      const items = Array.isArray(e.value.data) ? e.value.data : (e.value.data?.results || []);
      setSecurityEmergencies(items);
    } else failures.push(`incidents: ${e.reason?.response?.data?.detail || e.reason?.response?.data?.error || "request failed"}`);
    if (n.status === "fulfilled") setSecurityNotifications(Array.isArray(n.value.data) ? n.value.data : (n.value.data?.results || []));
    else failures.push(`notifications: ${n.reason?.response?.data?.detail || n.reason?.response?.data?.error || "request failed"}`);
    if (failures.length) setFlash("", `Some security data could not be loaded. ${failures.join(" · ")}`);
  };

  const loadAdmin = async () => {
    setError("");
    const requests = [
      ["dashboard", api.get("dashboard/")],
      ["analytics", api.get("emergencies/analytics/")],
      ["emergencies", api.get("emergencies/")],
      ["societies", api.get("societies/")],
      ["users", api.get("users/")],
      ["guardians", api.get("guardians/")],
      ["blocks", api.get("blocks/")],
      ["flats", api.get("flats/")],
    ];
    const results = await Promise.allSettled(requests.map(([, promise]) => promise));
    const failures = [];
    results.forEach((result, index) => {
      const key = requests[index][0];
      if (result.status === "fulfilled") {
        const data = result.value.data;
        if (key === "dashboard") setAdminStats(data || {});
        if (key === "analytics") setAdminAnalytics(data || { by_type: [], by_priority: [], by_block: [], daily_trend: [] });
        if (key === "emergencies") setAdminEmergencies(Array.isArray(data) ? data : (data?.results || []));
        if (key === "societies") setAdminSocieties(Array.isArray(data) ? data : (data?.results || []));
        if (key === "users") setAdminUsers(Array.isArray(data) ? data : (data?.results || []));
        if (key === "guardians") setAdminGuardians(Array.isArray(data) ? data : (data?.results || []));
        if (key === "blocks") setBlocks(Array.isArray(data) ? data : (data?.results || []));
        if (key === "flats") setFlats(Array.isArray(data) ? data : (data?.results || []));
      } else {
        const detail = result.reason?.response?.data?.detail || result.reason?.response?.data?.error || result.reason?.message || "request failed";
        failures.push(`${key}: ${detail}`);
      }
    });
    if (failures.length) setError(`Some admin data could not be loaded. ${failures.join(" · ")}`);
  };

  const acceptVolunteer = async (id) => {
    try { await api.patch(`emergencies/${id}/accept/`); setAvailability("BUSY"); await loadVolunteer(); setFlash(`Emergency #${id} accepted.`); }
    catch (err) { setFlash("", err.response?.data?.error || "Unable to accept emergency."); }
  };

  const acceptSecurity = async (id) => {
    try { await api.patch(`emergencies/${id}/security-accept/`); setAvailability("BUSY"); await loadSecurity(); setFlash(`Emergency #${id} accepted by security.`); }
    catch (err) { setFlash("", err.response?.data?.error || "Unable to accept emergency."); }
  };


  const acceptPending = async (id, reload) => {
    try { await api.patch(`emergencies/${id}/pending-accept/`); await reload(); setFlash(`Emergency #${id} accepted from the pending community queue.`); }
    catch (err) { setFlash("", err.response?.data?.error || "Unable to accept pending emergency."); }
  };

  const markReached = async (id) => {
    try { await api.patch(`emergencies/${id}/mark-reached/`); if (user.role === "VOLUNTEER") await loadVolunteer(); else await loadSecurity(); setFlash(`Emergency #${id}: location marked as reached.`); }
    catch (err) { setFlash("", err.response?.data?.error || "Unable to mark location as reached."); }
  };

  const requestHandover = async (id) => {
    if (!window.confirm("Request a handover? You remain responsible until another responder accepts.")) return;
    try { await api.post(`emergencies/${id}/request-handover/`); setFlash(`Handover requested for Emergency #${id}. You remain responsible until accepted.`); }
    catch (err) { setFlash("", err.response?.data?.error || "Unable to request handover."); }
  };

  const requestAdditionalHelp = async (id) => {
    if (!window.confirm("Request additional help? You will remain the primary responder.")) return;
    try { await api.post(`emergencies/${id}/request-additional-help/`); setFlash(`Additional help requested for Emergency #${id}.`); }
    catch (err) { setFlash("", err.response?.data?.error || "Unable to request additional help."); }
  };

  const startAssistance = async (id) => {
    try { await api.patch(`emergencies/${id}/start-assistance/`); if (user.role === "VOLUNTEER") await loadVolunteer(); else await loadSecurity(); setFlash(`Assistance started for Emergency #${id}.`); }
    catch (err) { setFlash("", err.response?.data?.error || "Unable to start assistance."); }
  };

  const cancelEmergency = async (id) => { setCancelTarget({ id, reason: "UNAVAILABLE", comment: "" }); };
  const confirmCancelEmergency = async () => {
    if (!cancelTarget) return;
    try {
      await api.patch(`emergencies/${cancelTarget.id}/cancel/`, { reason: cancelTarget.reason, comment: cancelTarget.comment });
      if (user.role === "VOLUNTEER") await loadVolunteer(); else await loadSecurity();
      setAvailability("AVAILABLE");
      setCancelTarget(null);
      setFlash(`Emergency #${cancelTarget.id} cancelled and returned to the assignment queue.`);
    } catch (err) { setFlash("", err.response?.data?.error || "Unable to cancel emergency."); }
  };

  const resolveEmergency = async (id) => {
    try { await api.patch(`emergencies/${id}/resolve/`, { closure_note: "Resolved by responder." }); await loadSecurity(); setAvailability("AVAILABLE"); setFlash(`Emergency #${id} resolved successfully.`); }
    catch (err) { setFlash("", err.response?.data?.error || "Unable to resolve emergency."); }
  };

  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [newAdmin, setNewAdmin] = useState({ username: "", first_name: "", last_name: "", email: "", phone: "", society: "", temporary_password: "" });
  const [credentialsModal, setCredentialsModal] = useState(null);

  const verifyUser = async (id, value) => { try { await api.patch(`users/${id}/verify/`, { is_verified: value }); await loadAdmin(); setFlash(`User verification ${value ? "enabled" : "removed"}.`); } catch (err) { setFlash("", err.response?.data?.error || "Unable to update user."); } };
  const verifyGuardian = async (id, value) => { try { await api.patch(`guardians/${id}/verify/`, { is_verified: value }); await loadAdmin(); setFlash(`Guardian verification ${value ? "enabled" : "removed"}.`); } catch (err) { setFlash("", err.response?.data?.error || "Unable to update guardian."); } };
  
  const createGuardianLogin = async (id) => {
    try {
      const r = await api.post(`guardians/${id}/create_login/`);
      setCredentialsModal({
        title: "GUARDIAN LOGIN CREATED",
        username: r.data.username,
        password: r.data.temporary_password,
        extra: "Share these temporary credentials securely with the guardian contact.",
      });
      await loadAdmin();
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || "Unable to create guardian login.";
      setFlash("", msg);
    }
  };

  const saveSociety = async (event) => {
    event.preventDefault();
    try { await api.patch(`societies/${editingSociety.id}/`, editingSociety); setEditingSociety(null); await loadAdmin(); setFlash("Society updated successfully."); }
    catch (err) { setFlash("", err.response?.data?.detail || "Unable to update society."); }
  };
  const deleteSociety = async (id) => {
    if (!window.confirm("Delete this society? This also removes its blocks and flats.")) return;
    try { await api.delete(`societies/${id}/`); await loadAdmin(); setFlash("Society deleted successfully."); }
    catch (err) { setFlash("", err.response?.data?.detail || err.response?.data?.error || "Unable to delete society."); }
  };
  const deleteBlock = async (id, name) => {
    if (!window.confirm(`Delete Block "${name}"? This also removes all flats inside it.`)) return;
    try { await api.delete(`blocks/${id}/`); await loadAdmin(); setFlash(`Block "${name}" deleted successfully.`); }
    catch (err) { setFlash("", err.response?.data?.detail || err.response?.data?.error || "Unable to delete block."); }
  };
  const deleteFlat = async (id, number) => {
    if (!window.confirm(`Delete Flat ${number}?`)) return;
    try { await api.delete(`flats/${id}/`); await loadAdmin(); setFlash(`Flat ${number} deleted successfully.`); }
    catch (err) { setFlash("", err.response?.data?.detail || err.response?.data?.error || "Unable to delete flat."); }
  };

  const provisionSociety = async (event) => {
    event.preventDefault();
    try {
      const response = await api.post("societies/provision/", newSociety);
      setShowProvisionSociety(false);
      setNewSociety({ name: "", address: "", city: "", state: "", pincode: "", admin_username: "", admin_first_name: "", admin_last_name: "", admin_email: "", admin_phone: "", admin_password: "" });
      await loadAdmin();
      setCredentialsModal({
        title: "SOCIETY CREATED",
        username: response.data.admin.username,
        password: response.data.temporary_password,
        extra: `Society "${response.data.society.name}" and Society Admin provisioned.`,
      });
    } catch (err) { setFlash("", err.response?.data?.error || err.response?.data?.detail || "Unable to provision society."); }
  };

  const createAdmin = async (event) => {
    event.preventDefault();
    try {
      const response = await api.post("admins/", newAdmin);
      setShowCreateAdmin(false);
      setNewAdmin({ username: "", first_name: "", last_name: "", email: "", phone: "", society: "", temporary_password: "" });
      await loadAdmin();
      setCredentialsModal({
        title: "ADMIN CREATED",
        username: response.data.username || response.data.admin?.username,
        password: response.data.temporary_password,
        extra: "Standalone Society Administrator provisioned successfully.",
      });
    } catch (err) { setFlash("", err.response?.data?.error || err.response?.data?.detail || "Unable to create admin."); }
  };

  const formatApiError = (data, fallback) => {
    if (!data) return fallback;
    if (typeof data === "string") return data;
    if (Array.isArray(data)) return data.join(" ");
    if (data.error) return Array.isArray(data.error) ? data.error.join(" ") : String(data.error);
    if (data.detail) return Array.isArray(data.detail) ? data.detail.join(" ") : String(data.detail);
    if (typeof data === "object") {
      const parts = [];
      for (const [key, val] of Object.entries(data)) {
        const msg = Array.isArray(val) ? val.join(" ") : String(val);
        const prefix = ["error", "detail", "non_field_errors"].includes(key) ? "" : `${key.replace(/_/g, " ")}: `;
        parts.push(`${prefix}${msg}`);
      }
      if (parts.length > 0) return parts.join(" ");
    }
    return fallback;
  };

  const createBlock = async (event) => {
    event.preventDefault();
    const societyId = newBlock.society || (adminSocieties.length === 1 ? adminSocieties[0].id : user.society_id);
    if (!societyId) { setFlash("", "Please select a society for this block."); return; }
    try {
      await api.post("blocks/", { society: societyId, name: newBlock.name });
      setNewBlock({ society: "", name: "" });
      await loadAdmin();
      setFlash("Block/Tower created successfully.");
    } catch (err) {
      setFlash("", formatApiError(err.response?.data, "Unable to create block."));
    }
  };

  const createFlat = async (event) => {
    event.preventDefault();
    if (!newFlat.block) { setFlash("", "Please select a block for this flat."); return; }
    const parsedFloor = parseInt(newFlat.floor, 10);
    const floorValue = isNaN(parsedFloor) ? 1 : parsedFloor;
    try {
      await api.post("flats/", { block: parseInt(newFlat.block, 10), flat_number: String(newFlat.flat_number).trim(), floor: floorValue });
      setNewFlat({ block: "", flat_number: "", floor: "" });
      await loadAdmin();
      setFlash("Flat created successfully.");
    } catch (err) {
      setFlash("", formatApiError(err.response?.data, "Unable to create flat."));
    }
  };

  const setUserActive = async (id, active) => {
    try { await api.patch(`users/${id}/${active ? "activate" : "disable"}/`); await loadAdmin(); setFlash(`User ${active ? "activated" : "disabled"} successfully.`); }
    catch (err) { setFlash("", err.response?.data?.error || err.response?.data?.detail || "Unable to update user status."); }
  };

  const createUser = async (event) => {
    event.preventDefault();
    try {
      const payload = { ...newUser, society: newUser.society || null, block: newUser.block || null, flat: newUser.flat || null };
      await api.post("users/", payload);
      setShowCreateUser(false);
      setNewUser({ username: "", first_name: "", last_name: "", email: "", phone: "", role: "RESIDENT", password: "", society: "", block: "", flat: "" });
      await loadAdmin();
      setFlash("User created successfully.");
    } catch (err) { setFlash("", err.response?.data?.detail || err.response?.data?.error || "Unable to create user."); }
  };

  useEffect(() => {
    if (window.Notification && Notification.permission === "default") Notification.requestPermission().catch(() => {});
    if (user.role === "VOLUNTEER") loadVolunteer();
    if (user.role === "SECURITY") loadSecurity();
    if (user.role === "ADMIN") loadAdmin();
    if (user.role === "VOLUNTEER" || user.role === "SECURITY") loadPendingQueue();
    if (["VOLUNTEER","SECURITY","ADMIN"].includes(user.role)) loadResponderMemberships();
  }, [user.role]);

  // Optional realtime channel. Polling remains the fallback because browser WebSocket auth can be unavailable in some deployments.
  useEffect(() => {
    const token = localStorage.getItem("access");
    if (!token || user.role === "RESIDENT") return undefined;
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsBase = import.meta.env.VITE_WS_BASE_URL || `${protocol}://${window.location.hostname || "127.0.0.1"}:8000`;
    const socket = new WebSocket(`${wsBase}/ws/notifications/?token=${encodeURIComponent(token)}`);
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (window.Notification && Notification.permission === "granted" && payload.title) new Notification(payload.title, { body: payload.message || "Emergency update" });
      } catch (err) { console.error(err); }
      if (user.role === "VOLUNTEER") loadVolunteer();
      if (user.role === "SECURITY") loadSecurity();
      if (user.role === "ADMIN") loadAdmin();
    };
    const timer = window.setInterval(() => {
      if (user.role === "VOLUNTEER") loadVolunteer();
      if (user.role === "SECURITY") loadSecurity();
      if (user.role === "ADMIN") loadAdmin();
    }, 15000);
    return () => { socket.close(); window.clearInterval(timer); };
  }, [user.role]);

  const filteredAdminEmergencies = useMemo(() => adminEmergencies.filter((e) => {
    const statusOk = adminFilter === "ALL" || e.status === adminFilter;
    const term = adminSearch.trim().toLowerCase();
    const text = `${e.id} ${e.emergency_type} ${e.location} ${e.requester_name || e.requester_username || ""}`.toLowerCase();
    return statusOk && (!term || text.includes(term));
  }), [adminEmergencies, adminFilter, adminSearch]);

  const chartItems = (items, labelKey) => (items || []).map((item) => ({
    label: item[labelKey] || "Unknown",
    count: Number(item.count || 0),
  }));
  const typeChart = chartItems(adminAnalytics.by_type, "emergency_type");
  const priorityChart = chartItems(adminAnalytics.by_priority, "priority");
  const blockChart = chartItems(adminAnalytics.by_block, "user__block__name");
  const trendChart = chartItems(adminAnalytics.daily_trend, "created_at__date");
  const maxCount = (items) => Math.max(1, ...(items || []).map((item) => item.count));

  const roleMessage = {
    ADMIN: "Manage societies, residents and emergencies.",
    RESIDENT: "Report emergencies and track your requests.",
    SECURITY: "Monitor and coordinate emergency incidents.",
    VOLUNTEER: "Respond to incidents and provide assistance.",
    GUARDIAN: "Receive and respond to emergency escalation alerts.",
  }[user.role] || "Citizen Safety Platform";

  return (
    <div className="dashboard">
      <header className="navbar">
        <div><h2>Citizen Safety</h2><span>{user.role === "ADMIN" ? `${user.society_name || "Platform"} · Society Administration` : "Emergency Coordination Platform"}</span></div>
        <div className="navbar-actions"><button className="profile-button" onClick={() => navigate("/profile")}>Profile</button><button className="logout-button" onClick={logout}>Logout</button></div>
      </header>

      <main className={`dashboard-content dashboard-content-${String(user.role || "guest").toLowerCase()}`}>
        <div className="welcome-card"><p>WELCOME</p><h1>{user.first_name || user.username}</h1><span className="role-badge">{user.role}</span><h3>{roleMessage}</h3></div>
        {message && <div className="success-message">{message}</div>}
        {error && <div className="error-message dashboard-message">{error}</div>}

        {(user.role === "VOLUNTEER" || user.role === "SECURITY") && pendingQueue.length > 0 && <div className="resident-panel pending-community-panel"><div className="panel-header"><div><h2>Open Community Emergency Queue</h2><p>No responder accepted these incidents during the primary escalation chain. A verified Security or Volunteer responder can accept an open incident.</p></div><button className="secondary-action-button" onClick={loadPendingQueue}>REFRESH</button></div><div className="emergency-list">{pendingQueue.map((item)=><div className="emergency-item" key={item.id}><div className="emergency-top"><h3>Emergency #{item.id}</h3><span className="status status-pending">PENDING</span></div><p><strong>Type:</strong> {item.emergency_type} · <strong>Priority:</strong> {item.priority}</p><p><strong>Location:</strong> {item.location}</p><p><strong>Area:</strong> {item.block || "—"} {item.flat ? `· Flat ${item.flat}` : ""}</p><p><strong>Created:</strong> {dateText(item.created_at)}</p><div className="guardian-actions">{item.latitude && item.longitude && <a className="secondary-action-button map-link" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${item.latitude}&mlon=${item.longitude}#map=18/${item.latitude}/${item.longitude}`}>VIEW MAP</a>}<button className="accept-button" onClick={async()=>{ await acceptPending(item.id, loadPendingQueue); }}>ACCEPT EMERGENCY</button></div></div>)}</div></div>}

        {user.role === "RESIDENT" && <ResidentDashboard user={user} />}
        {user.role === "GUARDIAN" && (
          <GuardianDashboard
            user={user}
            availabilityStatus={availability}
            updateAvailability={updateAvailability}
            isTrackingLocation={isTrackingLocation}
            shareLiveLocation={shareLiveLocation}
          />
        )}

        {(user.role === "VOLUNTEER" || user.role === "SECURITY") && responderMemberships.some(r => r.responder === user.id && r.direction === "INVITE" && r.status === "PENDING") && (
          <div className="resident-panel responder-membership-panel"><div className="panel-header"><div><h2>Society Membership Approval</h2><p>Accept your society invitation before responding to emergencies.</p></div></div>{responderMemberships.filter(r => r.responder === user.id && r.direction === "INVITE" && r.status === "PENDING").map(r => <div className="user-row" key={r.id}><div><strong>{r.society_name}</strong><span>{r.role} · Admin invitation</span></div><div className="guardian-actions"><button className="accept-button" onClick={()=>respondResponderMembership(r.id,"accept")}>ACCEPT INVITATION</button><button className="cancel-button" onClick={()=>respondResponderMembership(r.id,"decline")}>DECLINE</button></div></div>)}</div>
        )}

        {(user.role === "VOLUNTEER" || user.role === "SECURITY") && (
          <div className="responder-layout">
            <div className="responder-topbar"><div><strong>{user.role === "VOLUNTEER" ? "Volunteer" : "Security"} availability</strong><span className={`availability-pill ${availability.toLowerCase()}`}>{availability}</span></div><div className="responder-top-actions"><button className="available-button" onClick={() => updateAvailability("AVAILABLE")}>AVAILABLE</button><button className="busy-button" onClick={() => updateAvailability("BUSY")}>BUSY</button><button className="offline-button" onClick={() => updateAvailability("OFFLINE")}>OFFLINE</button><button className={`assistance-button ${isTrackingLocation ? "tracking-active" : ""}`} onClick={shareLiveLocation}>{isTrackingLocation ? "STOP LIVE LOCATION" : "SHARE LIVE LOCATION"}</button></div></div>
            {user.role === "VOLUNTEER" ? <VolunteerDashboard user={user} volunteerStatus={availability} updateVolunteerStatus={updateAvailability} volunteerEmergencies={volunteerEmergencies} volunteerNotifications={volunteerNotifications} volunteerFilter={volunteerFilter} setVolunteerFilter={setVolunteerFilter} loadVolunteerEmergencies={loadVolunteer} loadVolunteerNotifications={loadVolunteer} acceptEmergency={acceptVolunteer} acceptPendingEmergency={(id)=>acceptPending(id, loadVolunteer)} cancelEmergency={cancelEmergency} markReached={markReached} startAssistance={startAssistance} requestHandover={requestHandover} requestAdditionalHelp={requestAdditionalHelp} resolveEmergency={resolveEmergency} activeSection={activeSection} setActiveSection={setActiveSection} /> : <SecurityDashboard user={user} availabilityStatus={availability} updateAvailability={updateAvailability} securityEmergencies={securityEmergencies} securityNotifications={securityNotifications} securityFilter={securityFilter} setSecurityFilter={setSecurityFilter} loadSecurityEmergencies={loadSecurity} loadSecurityNotifications={loadSecurity} securityAcceptEmergency={acceptSecurity} acceptPendingEmergency={(id)=>acceptPending(id, loadSecurity)} cancelEmergency={cancelEmergency} markReached={markReached} startAssistance={startAssistance} requestHandover={requestHandover} requestAdditionalHelp={requestAdditionalHelp} resolveEmergency={resolveEmergency} />}
          </div>
        )}

        {user.role === "ADMIN" && (
          <>
            <div className="cards admin-card-grid">
              {[['dashboard','D','Admin Dashboard','Platform overview, counts and response analytics.'],['societies','S','Society Management','Societies grouped by blocks, floors and flats.'],['emergencies','!','Emergency Monitoring','Search, filter and inspect live incidents.'],['users','U','User Management','Create, verify and manage website users.'],['guardians','G','Guardian Verification','Verify guardians and create guardian logins.'],['availability','A','Availability Board','See responder availability controls.']].map(([key,icon,title,desc]) => <div key={key} className={`feature-card ${key === 'emergencies' ? 'emergency-card' : ''} ${adminSection === key ? 'selected-card' : ''}`} onClick={() => { setAdminSection(key); setFlash(""); if (key === 'dashboard' || key === 'societies' || key === 'emergencies' || key === 'users' || key === 'guardians') loadAdmin(); }}><div className="feature-icon">{icon}</div><h2>{title}</h2><p>{desc}</p></div>)}
            </div>

            {adminSection === "dashboard" && <div className="admin-control-center">
              <div className="admin-dashboard-hero">
                <div><span className="eyebrow">OPERATIONS CONTROL CENTER</span><h2>{adminStats.society?.name || user.society_name || "Citizen Safety Platform"}</h2><p>{adminStats.scope === "PLATFORM" ? "Platform-level overview across isolated societies." : "Society-level emergency monitoring and response analytics."}</p></div>
                <div className="admin-hero-actions"><div className="admin-scope-badge">{adminStats.scope === "PLATFORM" ? "PLATFORM ADMIN" : "SOCIETY ADMIN"}</div>{user.is_platform_admin && <button type="button" className="accept-button admin-create-society-hero" onClick={() => { setAdminSection("societies"); setShowProvisionSociety(true); }}>+ CREATE SOCIETY + ADMIN</button>}</div>
              </div>

              <div className="stats-grid admin-kpi-grid">
                {[
                  ["Total Residents", adminStats.total_residents],
                  ["Active Emergencies", (adminStats.pending_emergencies || 0) + (adminStats.assigned_emergencies || 0) + (adminStats.in_progress_emergencies || 0)],
                  ["Pending", adminStats.pending_emergencies],
                  ["Resolved Today", adminStats.resolved_emergencies],
                  ["Volunteers Available", adminStats.available_volunteers],
                  ["Security Available", adminStats.available_security],
                  ["Guardians Available", adminStats.available_guardians],
                  ["Avg Response", `${adminStats.average_response_minutes || 0} min`],
                ].map(([label,value]) => <div className="stat-card admin-kpi-card" key={label}><strong>{value ?? 0}</strong><span>{label}</span></div>)}
              </div>

              <div className="analytics-grid">
                <div className="analytics-card trend-card">
                  <div className="panel-header">
                    <div>
                      <h3>Incident Volume &amp; Daily Trend</h3>
                      <p>14-day interactive point-line trajectory analytics.</p>
                    </div>
                  </div>
                  <PointTrendGraph items={trendChart} />
                </div>

                <div className="analytics-card status-donut-card">
                  <div className="panel-header">
                    <div>
                      <h3>Status Breakdown</h3>
                      <p>Current incident lifecycle distribution.</p>
                    </div>
                  </div>
                  <StatusDonutGraph stats={adminStats} />
                </div>

                <div className="analytics-card">
                  <div className="panel-header">
                    <div>
                      <h3>Emergency Types</h3>
                      <p>Category volume with point-dot plot indicators.</p>
                    </div>
                  </div>
                  <TypePointGraph items={typeChart} />
                </div>

                <div className="analytics-card">
                  <div className="panel-header">
                    <div>
                      <h3>Priority Severity Distribution</h3>
                      <p>Radar scatter-point incident severity.</p>
                    </div>
                  </div>
                  <PriorityPointGraph items={priorityChart} />
                </div>

                <div className="analytics-card">
                  <div className="panel-header">
                    <div>
                      <h3>Block &amp; Tower Distribution</h3>
                      <p>Geographic incident density by block.</p>
                    </div>
                  </div>
                  <BlockPointGraph items={blockChart} />
                </div>

                <div className="analytics-card workflow-card">
                  <div className="panel-header">
                    <div>
                      <h3>Emergency Response Workflow</h3>
                      <p>Operational flow from alert trigger to resolution.</p>
                    </div>
                  </div>
                  <div className="workflow-steps">
                    {["SOS Triggered", "Emergency Created", "Guardian Notified", "Security / Volunteer", "Responder Assigned", "Assistance Provided", "Incident Resolved"].map((step, index) => (
                      <div className="workflow-step" key={step}>
                        <span>{index + 1}</span>
                        <strong>{step}</strong>
                        {index < 6 && <i>→</i>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="resident-panel live-board-panel">
                <LiveEmergencyBoard
                  emergencies={adminEmergencies}
                  loadAdmin={loadAdmin}
                  dateText={dateText}
                  cancelEmergency={cancelEmergency}
                  resolveEmergency={resolveEmergency}
                />
              </div>
            </div>}

            {adminSection === "availability" && <div className="resident-panel"><h2>Responder Availability Board</h2><p>Availability is controlled by each responder and used during assignment.</p><div className="availability-board">{adminUsers.filter((u) => ["SECURITY","VOLUNTEER"].includes(u.role)).map((u) => <div className="availability-row" key={u.id}><div><strong>{u.first_name || u.username}</strong><span>{u.role} · {u.society_name || "Unassigned society"} {u.block_name ? `· ${u.block_name}` : ""}</span></div><span className={`availability-pill ${(u.volunteer_status || "OFFLINE").toLowerCase()}`}>{u.volunteer_status || "OFFLINE"}</span></div>)}</div></div>}

            {adminSection === "societies" && <div className="resident-panel"><div className="panel-header"><div><h2>Society Management</h2><p>Manage your society hierarchy. Only the Platform Administrator can create a brand-new society and its dedicated Society Admin login.</p></div><div className="guardian-actions"><button className="secondary-action-button" onClick={loadAdmin}>REFRESH</button></div></div>{user.is_platform_admin && <div className="platform-admin-callout"><div><h3>Platform Administration</h3><p>Create an isolated society and provision its first Society Admin in one controlled step.</p></div><button className="accept-button" onClick={() => setShowProvisionSociety(true)}>+ CREATE SOCIETY &amp; ADMIN</button></div>}<div className="admin-inline-management"><form onSubmit={createBlock} className="admin-inline-form"><strong>Add Block / Tower</strong><select value={newBlock.society} onChange={(e)=>setNewBlock({...newBlock,society:e.target.value})} required><option value="">Select society</option>{adminSocieties.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><input value={newBlock.name} onChange={(e)=>setNewBlock({...newBlock,name:e.target.value})} placeholder="Block / Tower name" required/><button className="accept-button">ADD BLOCK</button></form><form onSubmit={createFlat} className="admin-inline-form"><strong>Add Flat</strong><select value={newFlat.block} onChange={(e)=>setNewFlat({...newFlat,block:e.target.value})} required><option value="">Select block</option>{blocks.map(b=><option key={b.id} value={b.id}>{b.name} · Society #{b.society}</option>)}</select><input value={newFlat.flat_number} onChange={(e)=>setNewFlat({...newFlat,flat_number:e.target.value})} placeholder="Flat number (e.g. 101)" required/><input type="number" min="0" value={newFlat.floor} onChange={(e)=>setNewFlat({...newFlat,floor:e.target.value})} placeholder="Floor (e.g. 1)" required/><button className="accept-button">ADD FLAT</button></form></div>{adminSocieties.length === 0 ? <p>No societies found.</p> : adminSocieties.map((society) => { const societyBlocks = blocks.filter((b) => String(b.society) === String(society.id)); const residents = adminUsers.filter((u) => String(u.society) === String(society.id) && u.role === "RESIDENT"); return <div className="society-group" key={society.id}><div className="society-heading"><div><h3>{society.name}</h3><p><strong>Address:</strong> {society.address} · <strong>City:</strong> {society.city} · <strong>Society ID:</strong> {society.id}</p></div><div className="guardian-actions"><button className="assistance-button" onClick={() => setEditingSociety({...society})}>EDIT</button>{user.is_platform_admin && <button className="delete-button" onClick={() => deleteSociety(society.id)}>DELETE</button>}</div></div>{societyBlocks.length === 0 ? <p className="muted">No blocks configured.</p> : societyBlocks.map((block) => { const blockFlats = flats.filter((f) => String(f.block) === String(block.id)); return <div className="block-group" key={block.id}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h4>{block.name}</h4><button type="button" className="cancel-button" style={{ padding: "4px 8px", fontSize: "11px", margin: 0 }} onClick={() => deleteBlock(block.id, block.name)}>✕ Delete Block</button></div>{blockFlats.length === 0 ? <p className="muted">No flats configured.</p> : <div className="flat-grid">{blockFlats.map((flat) => { const people = residents.filter((r) => String(r.flat) === String(flat.id)); return <div className="flat-card" key={flat.id} style={{ position: "relative" }}><button type="button" style={{ position: "absolute", top: "6px", right: "6px", background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "14px", fontWeight: "bold" }} title="Delete Flat" onClick={() => deleteFlat(flat.id, flat.flat_number)}>✕</button><strong>Flat {flat.flat_number}</strong><span>Floor {flat.floor}</span>{people.length ? people.map((p) => <small key={p.id}>👤 {p.first_name || p.username}</small>) : <small className="muted">No resident mapped</small>}</div>; })}</div>}</div>; })}<div className="society-members"><strong>Residents:</strong> {residents.length} · <strong>Security:</strong> {adminUsers.filter((u) => u.society === society.id && u.role === "SECURITY").length} · <strong>Volunteers:</strong> {adminUsers.filter((u) => u.society === society.id && u.role === "VOLUNTEER").length}</div></div>; })}</div>}

            {showProvisionSociety && <div className="modal-backdrop" onClick={() => setShowProvisionSociety(false)}><form className="modal-card form-card provision-modal" onSubmit={provisionSociety} onClick={(e) => e.stopPropagation()}><div className="panel-header"><div><h2>Create Society + Admin</h2><p>Platform-level provisioning creates an isolated society and its dedicated administrator.</p></div><button type="button" className="cancel-button" onClick={() => setShowProvisionSociety(false)}>CLOSE</button></div><div className="form-grid-two">{[["name","Society Name"],["address","Address"],["city","City"],["state","State"],["pincode","Pincode"],["admin_username","Admin Username"],["admin_first_name","Admin First Name"],["admin_last_name","Admin Last Name"],["admin_email","Admin Email"],["admin_phone","Admin Phone"],["admin_password","Temporary Password"]].map(([field,label]) => <label key={field}>{label}<input type={field === "admin_email" ? "email" : field === "admin_password" ? "password" : "text"} value={newSociety[field]} onChange={(e) => setNewSociety({...newSociety,[field]:e.target.value})} required={field !== "admin_last_name" && field !== "admin_password"}/></label>)}</div><button className="accept-button">CREATE SOCIETY + ADMIN LOGIN</button></form></div>}

            {showCreateAdmin && <div className="modal-backdrop" onClick={() => setShowCreateAdmin(false)}><form className="modal-card form-card provision-modal" onSubmit={createAdmin} onClick={(e) => e.stopPropagation()}><div className="panel-header"><div><h2>Create Standalone Society Admin</h2><p>Provision a new administrator for an existing society.</p></div><button type="button" className="cancel-button" onClick={() => setShowCreateAdmin(false)}>CLOSE</button></div><div className="form-grid-two"><label>Username<input type="text" value={newAdmin.username} onChange={(e) => setNewAdmin({...newAdmin, username: e.target.value})} required /></label><label>First Name<input type="text" value={newAdmin.first_name} onChange={(e) => setNewAdmin({...newAdmin, first_name: e.target.value})} required /></label><label>Last Name<input type="text" value={newAdmin.last_name} onChange={(e) => setNewAdmin({...newAdmin, last_name: e.target.value})} /></label><label>Email<input type="email" value={newAdmin.email} onChange={(e) => setNewAdmin({...newAdmin, email: e.target.value})} required /></label><label>Phone<input type="text" value={newAdmin.phone} onChange={(e) => setNewAdmin({...newAdmin, phone: e.target.value})} required /></label><label>Society<select value={newAdmin.society} onChange={(e) => setNewAdmin({...newAdmin, society: e.target.value})} required><option value="">Select Society</option>{adminSocieties.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Temporary Password<input type="password" value={newAdmin.temporary_password} onChange={(e) => setNewAdmin({...newAdmin, temporary_password: e.target.value})} placeholder="Leave blank to auto-generate" /></label></div><button className="accept-button">CREATE ADMIN LOGIN</button></form></div>}

            {editingSociety && <div className="modal-backdrop" onClick={() => setEditingSociety(null)}><form className="modal-card form-card" onSubmit={saveSociety} onClick={(e) => e.stopPropagation()}><div className="panel-header"><h2>Edit Society</h2><button type="button" className="cancel-button" onClick={() => setEditingSociety(null)}>CLOSE</button></div>{["name","address","city","state","pincode"].map((field) => <label key={field}>{field.toUpperCase()}<input value={editingSociety[field] || ""} onChange={(e) => setEditingSociety({...editingSociety,[field]:e.target.value})} required={field !== "state" && field !== "pincode"}/></label>)}<button className="accept-button">SAVE SOCIETY</button></form></div>}

            {adminSection === "users" && (
              <div className="resident-panel">
                <div className="panel-header">
                  <div>
                    <h2>Admin User &amp; Responder Management</h2>
                    <p>Controlled website user registration, responder invitations and society approvals.</p>
                  </div>
                  <div className="guardian-actions">
                    {user.is_platform_admin && <button className="accept-button" onClick={() => setShowCreateAdmin(!showCreateAdmin)}>+ CREATE ADMIN</button>}
                    <button className="accept-button" onClick={() => setShowInviteResponder(!showInviteResponder)}>{showInviteResponder ? "CLOSE INVITE" : "+ INVITE RESPONDER"}</button>
                    <button className="accept-button" onClick={() => setShowCreateUser(!showCreateUser)}>{showCreateUser ? "CLOSE FORM" : "ADD USER"}</button>
                  </div>
                </div>

                {/* 1. SECURITY & VOLUNTEER MEMBERSHIP REQUESTS */}
                <div className="membership-request-panel">
                  <h3>SECURITY &amp; VOLUNTEER MEMBERSHIP REQUESTS</h3>
                  {responderMemberships.filter(r => r.direction === "REQUEST" && r.status === "PENDING").length === 0 ? (
                    <p className="muted">No pending responder membership requests for your society.</p>
                  ) : (
                    responderMemberships.filter(r => r.direction === "REQUEST" && r.status === "PENDING").map(r => (
                      <div className="user-row pending-request-row" key={r.id}>
                        <div>
                          <strong>{r.responder_name}</strong>
                          <span>Role: {r.role} · Society: {r.society_name}</span>
                          <small>Requested: {dateText(r.created_at)}</small>
                        </div>
                        <div className="guardian-actions">
                          <span className="verification-badge pending">PENDING</span>
                          <button className="accept-button" onClick={() => respondResponderMembership(r.id, "accept")}>APPROVE</button>
                          <button className="cancel-button" onClick={() => respondResponderMembership(r.id, "decline")}>REJECT</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* 2. OUTGOING ADMIN INVITATIONS */}
                {responderMemberships.filter(r => r.direction === "INVITE").length > 0 && (
                  <div className="membership-invite-panel">
                    <h3>OUTGOING RESPONDER INVITATIONS SENT</h3>
                    {responderMemberships.filter(r => r.direction === "INVITE").map(r => (
                      <div className="user-row" key={r.id}>
                        <div>
                          <strong>{r.responder_name}</strong>
                          <span>Invited for role: {r.role} · Society: {r.society_name}</span>
                          <small>Date: {dateText(r.created_at)}</small>
                        </div>
                        <div className="guardian-actions">
                          <span className={`verification-badge ${r.status.toLowerCase()}`}>{r.status}</span>
                          <button className="delete-button" onClick={() => deleteResponderInvitation(r.id, r.responder_name)}>DELETE</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 3. INVITE RESPONDER FORM */}
                {showInviteResponder && (
                  <form className="admin-user-form invite-responder-card" onSubmit={inviteResponder}>
                    <h3>Invite Existing Security / Volunteer Person</h3>
                    <div className="form-grid-two">
                      <label>
                        SELECT RESPONDER (SECURITY / VOLUNTEER)
                        <select value={inviteData.responder} onChange={(e) => setInviteData({ ...inviteData, responder: e.target.value })} required>
                          <option value="">-- Choose Responder --</option>
                          {adminUsers.filter(u => ["SECURITY", "VOLUNTEER"].includes(u.role)).map(u => (
                            <option key={u.id} value={u.id}>{u.first_name || u.username} ({u.role} · Phone: {u.phone})</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        SELECT SOCIETY
                        <select value={inviteData.society} onChange={(e) => setInviteData({ ...inviteData, society: e.target.value })} required>
                          <option value="">-- Choose Society --</option>
                          {adminSocieties.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <button className="accept-button">SEND RESPONDER INVITATION</button>
                  </form>
                )}

                {/* 4. CREATE USER FORM */}
                {showCreateUser && (
                  <form className="admin-user-form" onSubmit={createUser}>
                    {["username", "first_name", "last_name", "email", "phone", "password"].map((field) => (
                      <label key={field}>
                        {field.replace("_", " ").toUpperCase()}
                        <input
                          type={field === "password" ? "password" : field === "email" ? "email" : "text"}
                          value={newUser[field]}
                          onChange={(e) => setNewUser({ ...newUser, [field]: e.target.value })}
                          required={field === "username" || field === "phone" || field === "password"}
                        />
                      </label>
                    ))}
                    <label>
                      ROLE
                      <select value={newUser.role} onChange={(e) => {
                        const newRole = e.target.value;
                        if (newRole === "VOLUNTEER" || newRole === "SECURITY") {
                          setNewUser({ ...newUser, role: newRole, block: "", flat: "" });
                        } else {
                          setNewUser({ ...newUser, role: newRole });
                        }
                      }}>
                        {["RESIDENT", "VOLUNTEER", "SECURITY"].map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      SOCIETY
                      <select value={newUser.society} onChange={(e) => setNewUser({ ...newUser, society: e.target.value, block: "", flat: "" })}>
                        <option value="">Unassigned</option>
                        {adminSocieties.map((s) => (
                          <option value={s.id} key={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </label>
                    {newUser.role === "RESIDENT" && (
                      <>
                        <label>
                          BLOCK
                          <select value={newUser.block} onChange={(e) => setNewUser({ ...newUser, block: e.target.value, flat: "" })}>
                            <option value="">Unassigned</option>
                            {blocks.filter((b) => String(b.society) === String(newUser.society)).map((b) => (
                              <option value={b.id} key={b.id}>{b.name}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          FLAT
                          <select value={newUser.flat} onChange={(e) => setNewUser({ ...newUser, flat: e.target.value })}>
                            <option value="">Unassigned</option>
                            {flats.filter((f) => String(f.block) === String(newUser.block)).map((f) => (
                              <option value={f.id} key={f.id}>{f.flat_number}</option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}
                    <button className="accept-button">CREATE USER</button>
                  </form>
                )}

                <div className="user-management-list">
                  {adminUsers.map((item) => (
                    <div className="user-row" key={item.id}>
                      <div>
                        <strong>{item.first_name || item.username}</strong>
                        <span>{item.username} · {item.role}</span>
                        <small>{item.society_name || "No society"}{item.block_name ? ` · ${item.block_name}` : ""}{item.flat_number ? ` · Flat ${item.flat_number}` : ""}</small>
                      </div>
                      <div className="guardian-actions">
                        <span className={`availability-pill ${(item.volunteer_status || "OFFLINE").toLowerCase()}`}>{item.volunteer_status || "OFFLINE"}</span>
                        <button className={item.is_verified ? "cancel-button" : "accept-button"} onClick={() => verifyUser(item.id, !item.is_verified)}>{item.is_verified ? "UNVERIFY" : "VERIFY"}</button>
                        {item.is_active === false ? (
                          <button className="accept-button" onClick={() => setUserActive(item.id, true)}>ENABLE</button>
                        ) : (
                          <button className="cancel-button" onClick={() => setUserActive(item.id, false)}>DISABLE</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {adminSection === "guardians" && <div className="resident-panel"><div className="panel-header"><div><h2>Guardian Verification</h2><p>Verify primary, secondary and emergency contacts before escalation.</p></div><button className="secondary-action-button" onClick={loadAdmin}>REFRESH</button></div><div className="user-management-list">{adminGuardians.length === 0 ? <p>No guardians found.</p> : adminGuardians.map((g)=><div className="user-row" key={g.id}><div><strong>{g.name}</strong><span>{g.guardian_type} · {g.relation}</span><small>Resident #{g.resident} · {g.phone} · {g.email || "No email"}</small></div><div className="guardian-actions"><span className={`verification-badge ${g.is_verified ? "verified" : "pending"}`}>{g.is_verified ? "VERIFIED" : "PENDING"}</span><button className={g.is_verified ? "cancel-button" : "accept-button"} onClick={() => verifyGuardian(g.id, !g.is_verified)}>{g.is_verified ? "UNVERIFY" : "VERIFY"}</button><button className="assistance-button" onClick={() => createGuardianLogin(g.id)}>CREATE LOGIN</button></div></div>)}</div></div>}

            {adminSection === "emergencies" && <div className="resident-panel"><div className="panel-header"><div><h2>Emergency Monitoring</h2><p>Search and inspect emergencies within your authorized society scope.</p></div><button className="secondary-action-button" onClick={loadAdmin}>REFRESH</button></div><div className="emergency-filter-row"><input value={adminSearch} onChange={(e)=>setAdminSearch(e.target.value)} placeholder="Search emergency, resident or location"/><div className="filter-button-row">{statusLabels.map(([key,label])=><button key={key} className={`status-filter-button ${adminFilter===key?'active':''}`} onClick={()=>setAdminFilter(key)}>{label} ({key==='ALL'?adminEmergencies.length:adminEmergencies.filter(e=>e.status===key).length})</button>)}</div></div>{filteredAdminEmergencies.length===0?<p>No emergencies found.</p>:<div className="emergency-list">{filteredAdminEmergencies.map((e)=><div className="emergency-item" key={e.id}><div className="emergency-top"><h3>Emergency #{e.id}</h3><span className={`status status-${String(e.status).toLowerCase()}`}>{e.status}</span></div><p><strong>Resident:</strong> {e.requester_name || e.requester_username || `#${e.user}`}</p><p><strong>Type:</strong> {e.emergency_type} · <strong>Priority:</strong> {e.priority}</p><p><strong>Society:</strong> {e.user_society ? adminSocieties.find(s=>String(s.id)===String(e.user_society))?.name || `#${e.user_society}` : "—"}</p><p><strong>Location:</strong> {e.location}</p><p><strong>GPS:</strong> {e.latitude ?? "—"}, {e.longitude ?? "—"}</p><p><strong>Created:</strong> {dateText(e.created_at)}{e.accepted_at ? ` · Accepted: ${dateText(e.accepted_at)}` : ""}{e.resolved_at ? ` · Resolved: ${dateText(e.resolved_at)}` : ""}</p><div className="guardian-actions">{e.latitude && e.longitude && <a className="secondary-action-button map-link" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${e.latitude}&mlon=${e.longitude}#map=18/${e.latitude}/${e.longitude}`}>VIEW MAP</a>}{e.status === "IN_PROGRESS" && <button className="resolve-button" onClick={()=>api.patch(`emergencies/${e.id}/resolve/`).then(loadAdmin)}>RESOLVE</button>}</div></div>)}</div>}</div>}
          </>
        )}

        {credentialsModal && (
          <div className="modal-backdrop" onClick={() => setCredentialsModal(null)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ background: "#ffffff", padding: "24px", borderRadius: "12px", maxWidth: "450px", width: "90%", color: "#172033", border: "1px solid #e2e8f0", boxShadow: "0 20px 40px rgba(0,0,0,0.12)" }}>
              <h3 style={{ marginTop: 0, color: "#176b87", fontSize: "1.25rem" }}>{credentialsModal.title}</h3>
              {credentialsModal.extra && <p style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: "12px" }}>{credentialsModal.extra}</p>}
              <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", margin: "16px 0", border: "1px solid #e2e8f0" }}>
                <div style={{ marginBottom: "12px" }}>
                  <span style={{ fontSize: "0.75rem", color: "#64748b", display: "block", letterSpacing: "0.5px" }}>USERNAME</span>
                  <strong style={{ fontSize: "1.1rem", color: "#0f172a" }}>{credentialsModal.username}</strong>
                </div>
                <div>
                  <span style={{ fontSize: "0.75rem", color: "#64748b", display: "block", letterSpacing: "0.5px" }}>TEMPORARY PASSWORD</span>
                  <strong style={{ fontSize: "1.15rem", color: "#d97706", letterSpacing: "1px", fontFamily: "monospace" }}>{credentialsModal.password}</strong>
                </div>
              </div>
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    navigator.clipboard.writeText(`Username: ${credentialsModal.username}\nPassword: ${credentialsModal.password}`);
                    setFlash("Credentials copied to clipboard!");
                  }}
                  style={{ padding: "8px 16px" }}
                >
                  COPY CREDENTIALS
                </button>
                <button
                  type="button"
                  className="secondary-action-button"
                  onClick={() => setCredentialsModal(null)}
                  style={{ padding: "8px 16px" }}
                >
                  DONE
                </button>
              </div>
            </div>
          </div>
        )}

        {cancelTarget && <div className="modal-backdrop" onClick={() => setCancelTarget(null)}><div className="modal-card cancel-modal" onClick={(e) => e.stopPropagation()}><div className="guardian-header"><div><h2>Cancel Response?</h2><p>You are currently responding to Emergency #{cancelTarget.id}. This will release the emergency to another eligible responder.</p></div><button className="cancel-button" onClick={() => setCancelTarget(null)}>CLOSE</button></div><p className="modal-warning">Cancellation requires two confirmations. The reason is optional and is used only for incident history.</p><div className="reason-grid">{[["TRAFFIC","Traffic / unable to reach"],["PERSONAL","Personal emergency"],["CONTINUE","Unable to continue"],["CLOSER","Someone else is closer"],["UNAVAILABLE","No longer available"],["LOCATION","Location issue"],["OTHER","Other"]].map(([v,l])=><button key={v} type="button" className={`reason-option ${cancelTarget.reason===v?"selected": ""}`} onClick={()=>setCancelTarget({...cancelTarget,reason:v})}>{l}</button>)}</div>{cancelTarget.reason==="OTHER"&&<textarea value={cancelTarget.comment} onChange={e=>setCancelTarget({...cancelTarget,comment:e.target.value})} placeholder="Optional: type your reason here…" rows="3"/>}<div className="guardian-actions"><button className="secondary-action-button" onClick={()=>setCancelTarget(null)}>KEEP RESPONDING</button><button className="cancel-button" onClick={()=>{ if(window.confirm("Final confirmation: cancel your response and make this emergency available to other responders?")) confirmCancelEmergency(); }}>CONTINUE TO FINAL CONFIRMATION</button></div></div></div>}

      </main>
    </div>
  );
}

export default Dashboard;
