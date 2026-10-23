import React, { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import EmergencyChat from "../components/EmergencyChat";

const dateText = (v) => v ? new Date(v).toLocaleString() : "—";
const statuses = [["ALL","ALL"],["PENDING","PENDING"],["ASSIGNED","ASSIGNED"],["IN_PROGRESS","IN PROGRESS"],["RESOLVED","RESOLVED"],["CANCELLED","CANCELLED"],["AUTO_CLOSED","AUTO-CLOSED"]];

export default function SecurityDashboard({ user, availabilityStatus, securityEmergencies, securityNotifications, securityFilter, setSecurityFilter, loadSecurityEmergencies, loadSecurityNotifications, securityAcceptEmergency, cancelEmergency, markReached, startAssistance, requestHandover, requestAdditionalHelp, resolveEmergency }) {
  const [priority, setPriority] = useState("ALL");
  const [block, setBlock] = useState("ALL");
  const [search, setSearch] = useState("");
  const [activePanel, setActivePanel] = useState("incidents");
  const [chatEmergencyId, setChatEmergencyId] = useState(null);

  // Society membership states
  const [societies, setSocieties] = useState([]);
  const [membershipRequests, setMembershipRequests] = useState([]);
  const [selectedSociety, setSelectedSociety] = useState("");
  const [membershipMsg, setMembershipMsg] = useState("");
  const [membershipErr, setMembershipErr] = useState("");

  const loadMembershipData = async () => {
    try {
      const [sRes, rRes] = await Promise.allSettled([api.get("societies/"), api.get("responder-requests/")]);
      if (sRes.status === "fulfilled") setSocieties(Array.isArray(sRes.value.data) ? sRes.value.data : []);
      if (rRes.status === "fulfilled") setMembershipRequests(Array.isArray(rRes.value.data) ? rRes.value.data : []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadMembershipData();
  }, []);

  const requestSocietyMembership = async (e) => {
    e.preventDefault();
    setMembershipMsg(""); setMembershipErr("");
    if (!selectedSociety) return;
    try {
      await api.post("responder-requests/", { society: selectedSociety });
      setMembershipMsg("Society membership request submitted successfully. Waiting for Admin approval.");
      setSelectedSociety("");
      await loadMembershipData();
    } catch (err) {
      setMembershipErr(err.response?.data?.error || err.response?.data?.detail || "Unable to submit society membership request.");
    }
  };

  const respondToMembership = async (id, action) => {
    setMembershipMsg(""); setMembershipErr("");
    try {
      await api.post(`responder-requests/${id}/${action}/`);
      setMembershipMsg(`Invitation ${action === "accept" ? "accepted" : "declined"} successfully.`);
      await loadMembershipData();
    } catch (err) {
      setMembershipErr(err.response?.data?.error || err.response?.data?.detail || "Unable to respond to invitation.");
    }
  };

  const cancelMembershipRequest = async (id) => {
    setMembershipMsg(""); setMembershipErr("");
    try {
      await api.post(`responder-requests/${id}/cancel/`);
      setMembershipMsg("Membership request cancelled.");
      await loadMembershipData();
    } catch (err) {
      setMembershipErr(err.response?.data?.error || err.response?.data?.detail || "Unable to cancel request.");
    }
  };

  const blocks = [...new Set(securityEmergencies.map(e => e.user_block_name || e.block_name).filter(Boolean))];
  const counts = Object.fromEntries(statuses.map(([key]) => [key, key === "ALL" ? securityEmergencies.length : securityEmergencies.filter(e => e.status === key).length]));
  const activeMine = securityEmergencies.filter(e => String(e.assigned_security) === String(user.id) && !["RESOLVED","CANCELLED","AUTO_CLOSED"].includes(e.status));
  const pendingCount = securityEmergencies.filter(e => e.status === "PENDING").length;
  const unreadCount = securityNotifications.filter(n => !n.is_read).length;

  const incomingInvitations = membershipRequests.filter(r => r.direction === "INVITE" && r.status === "PENDING");
  const mySentRequests = membershipRequests.filter(r => r.direction === "REQUEST");

  const filtered = useMemo(() => securityEmergencies.filter(e => {
    const s = securityFilter === "ALL" || e.status === securityFilter;
    const p = priority === "ALL" || e.priority === priority;
    const b = block === "ALL" || (e.user_block_name || e.block_name) === block;
    const q = search.trim().toLowerCase();
    const text = `${e.id} ${e.emergency_type} ${e.location} ${e.description} ${e.requester_name || ""}`.toLowerCase();
    return s && p && b && (!q || text.includes(q));
  }), [securityEmergencies, securityFilter, priority, block, search]);

  const canAccept = (e) => e.status === "PENDING" && !e.assigned_security && !e.assigned_volunteer && (e.escalations || []).some(x => ["SECURITY", "PENDING"].includes(x.contact_type) && x.response_status === "WAITING");

  const openIncidents = () => { setActivePanel("incidents"); loadSecurityEmergencies(); };
  const openNotifications = () => { setActivePanel("notifications"); loadSecurityNotifications(); };
  const openMembership = () => { setActivePanel("membership"); loadMembershipData(); };

  return <>
    <section className="security-hero">
      <div><span className="eyebrow">SECURITY RESPONSE CENTER</span><h1>Apartment Incident Board</h1><p>Monitor residents, blocks and live response stages.</p></div>
      <div className={`security-availability-badge ${String(availabilityStatus).toLowerCase()}`}>{availabilityStatus}</div>
    </section>

    <div className="cards responder-card-row security-dashboard-cards">
      <button type="button" className={`feature-card security-dashboard-card ${activePanel === "availability" ? "selected-card" : ""}`} onClick={() => setActivePanel("availability")}>
        <div className="feature-icon">A</div><h2>Availability</h2><p>Current status: <strong>{availabilityStatus}</strong></p><span className="card-link">Manage readiness →</span>
      </button>
      <button type="button" className={`feature-card emergency-card security-dashboard-card ${activePanel === "incidents" ? "selected-card" : ""}`} onClick={openIncidents}>
        <div className="feature-icon">!</div><h2>Apartment Incident Board</h2><p>Monitor residents, blocks and live response stages.</p><span className="card-link">Open incident board →</span>
      </button>
      <button type="button" className={`feature-card security-dashboard-card ${activePanel === "notifications" ? "selected-card" : ""}`} onClick={openNotifications}>
        <div className="feature-icon">N</div><h2>Notifications</h2><p>{unreadCount} unread emergency updates.</p><span className="card-link">View notifications →</span>
      </button>
      <button type="button" className={`feature-card security-dashboard-card ${activePanel === "membership" ? "selected-card" : ""}`} onClick={openMembership}>
        <div className="feature-icon">🛡</div><h2>Society Membership</h2><p>{incomingInvitations.length ? `${incomingInvitations.length} incoming invitation(s)` : "Manage society access & requests"}</p><span className="card-link">Manage membership →</span>
      </button>
    </div>

    {activePanel === "availability" && <div className="resident-panel security-control-panel">
      <div className="panel-header"><div><h2>Security Availability</h2><p>Set your readiness before accepting an emergency.</p></div></div>
      <div className="security-availability-actions">
        <p>Your current status is <strong>{availabilityStatus}</strong>. Use the availability controls in the top response bar to change it.</p>
      </div>
    </div>}

    {activePanel === "membership" && <div className="resident-panel">
      <div className="panel-header">
        <div><h2>Society Membership &amp; Access Requests</h2><p>Request access to a society or accept incoming admin invitations.</p></div>
        <button type="button" className="secondary-action-button" onClick={loadMembershipData}>REFRESH</button>
      </div>

      {membershipMsg && <div className="success-message">{membershipMsg}</div>}
      {membershipErr && <div className="error-message dashboard-message">{membershipErr}</div>}

      <div className="society-status-banner" style={{ background: "#f8fafc", border: "1px solid #e2e8f0", padding: "16px", borderRadius: "10px", marginBottom: "20px" }}>
        <h4 style={{ margin: "0 0 6px", color: "#0f172a", fontSize: "1rem" }}>Current Assigned Society</h4>
        <p style={{ margin: 0, fontSize: "0.95rem", color: "#334155" }}>
          {user.society_name ? (
            <><strong>{user.society_name}</strong> (ID #{user.society}) · Assigned Security Person</>
          ) : (
            <span style={{ color: "#64748b" }}>Unassigned (Not currently assigned to any society)</span>
          )}
        </p>
      </div>

      {/* 1. INCOMING ADMIN INVITATIONS */}
      <div className="guardian-request-list" style={{ marginBottom: "24px" }}>
        <h3>Incoming Admin Society Invitations ({incomingInvitations.length})</h3>
        {incomingInvitations.length === 0 ? <p className="muted">No pending society invitations.</p> : incomingInvitations.map(r => (
          <div className="user-row" key={r.id} style={{ background: "rgba(56, 189, 248, 0.05)", border: "1px solid rgba(56, 189, 248, 0.2)", padding: "14px", borderRadius: "8px", marginBottom: "10px" }}>
            <div>
              <strong style={{ color: "#38BDF8" }}>SOCIETY INVITATION</strong>
              <span style={{ display: "block", color: "#F8FAFC" }}>{r.society_name} Admin invited you to join as Security Person.</span>
              <small style={{ color: "#94A3B8" }}>Date: {dateText(r.created_at)}</small>
            </div>
            <div className="guardian-actions">
              <button type="button" className="accept-button" onClick={() => respondToMembership(r.id, "accept")}>ACCEPT</button>
              <button type="button" className="cancel-button" onClick={() => respondToMembership(r.id, "decline")}>REJECT</button>
            </div>
          </div>
        ))}
      </div>

      {/* 2. REQUEST TO JOIN SOCIETY FORM */}
      <div className="guardian-request-list" style={{ marginBottom: "24px" }}>
        <h3>Request to Join a Society</h3>
        <p className="muted">Select an authorized apartment society to request Security membership.</p>
        <form className="guardian-form" onSubmit={requestSocietyMembership}>
          <div className="form-group">
            <label>Select Society</label>
            <select value={selectedSociety} onChange={(e) => setSelectedSociety(e.target.value)} required>
              <option value="">-- Choose Society --</option>
              {societies.map(s => <option key={s.id} value={s.id}>{s.name} ({s.city}, {s.state})</option>)}
            </select>
          </div>
          <div className="guardian-actions">
            <button type="submit" className="accept-button">REQUEST TO JOIN SOCIETY</button>
          </div>
        </form>
      </div>

      {/* 3. MY SENT MEMBERSHIP REQUESTS */}
      <div className="guardian-request-list">
        <h3>My Society Membership Requests</h3>
        {mySentRequests.length === 0 ? <p className="muted">No outgoing society requests.</p> : mySentRequests.map(r => (
          <div className="user-row" key={r.id} style={{ padding: "12px", marginBottom: "8px" }}>
            <div>
              <strong>{r.society_name}</strong>
              <span style={{ display: "block" }}>Role: SECURITY · Requested on {dateText(r.created_at)}</span>
            </div>
            <div className="guardian-actions" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span className={`verification-badge ${r.status.toLowerCase()}`}>{r.status}</span>
              {r.status === "PENDING" && <button type="button" className="cancel-button" onClick={() => cancelMembershipRequest(r.id)}>CANCEL REQUEST</button>}
            </div>
          </div>
        ))}
      </div>
    </div>}

    {activePanel === "notifications" && <div className="resident-panel">
      <div className="panel-header"><div><h2>Security Notifications</h2><p>Emergency alerts and response updates for your authorized society.</p></div><button className="primary-filled-button" onClick={loadSecurityNotifications}>REFRESH</button></div>
      <div className="notification-list">{securityNotifications.length === 0 ? <p className="muted">No notifications available.</p> : securityNotifications.map(n => <div className={`notification-item ${n.is_read ? "read" : "unread"}`} key={n.id}><h3>{n.title}</h3><p>{n.message}</p><small>{n.channel} · {dateText(n.created_at)}</small></div>)}</div>
    </div>}

    {activePanel === "incidents" && <>
      <div className="security-summary-grid">
        <div className="security-summary-card"><strong>{activeMine.length}</strong><span>Active response assigned to you</span></div>
        <div className="security-summary-card"><strong>{pendingCount}</strong><span>Pending incidents in your society</span></div>
        <div className="security-summary-card"><strong>{unreadCount}</strong><span>Unread notifications</span></div>
      </div>

      <div className="resident-panel">
        <div className="security-stage-banner"><div className="stage-copy"><strong>Response status</strong><span>{activeMine.length ? `You are currently responding to Emergency #${activeMine[0].id}.` : "You are available to accept an incident when the escalation reaches Security or the community queue."}</span></div><span className={`security-stage-badge ${activeMine.length ? "active" : ""}`}>{activeMine.length ? "RESPONDING" : "AVAILABLE"}</span></div>
        <div className="panel-header"><div><h2>Apartment Incident Board</h2><p>Search and filter incidents within your authorized society.</p></div><button className="primary-filled-button" onClick={loadSecurityEmergencies}>REFRESH</button></div>
        <div className="emergency-filter-row"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search resident, location or emergency"/><select value={block} onChange={e=>setBlock(e.target.value)}><option value="ALL">ALL BLOCKS</option>{blocks.map(b=><option key={b}>{b}</option>)}</select></div>
        <div className="priority-button-row">{["ALL","LOW","MEDIUM","HIGH","CRITICAL"].map(p=><button type="button" key={p} className={`priority-filter-button priority-${p.toLowerCase()} ${priority===p?'active':''}`} onClick={()=>setPriority(p)}>{p}</button>)}</div>
        <div className="filter-button-row">{statuses.map(([key,label])=><button type="button" key={key} className={`status-filter-button ${securityFilter===key?'active':''}`} onClick={()=>setSecurityFilter(key)}>{label} <span>{counts[key]}</span></button>)}</div>

        {filtered.length===0 ? <div className="empty-state"><strong>No incidents match these filters.</strong><span>New eligible emergencies will appear here automatically.</span></div> : <div className="emergency-list">{filtered.map(e => <div className="emergency-item" key={e.id}>
          <div className="emergency-top"><h3>Emergency #{e.id}</h3><span className={`status status-${String(e.status).toLowerCase()}`}>{e.status}</span></div>
          
          <p><strong>Resident:</strong> {e.requester_name || e.requester_username || `#${e.user}`} · <strong>Block:</strong> {e.user_block_name || e.block_name || "—"}</p>
          <p><strong>Emergency:</strong> {e.emergency_type} · <strong>Priority:</strong> {e.priority}</p>
          <p><strong>Society:</strong> {e.society_name || "—"} · <strong>Location:</strong> {e.location}</p>
          <p><strong>Created:</strong> {dateText(e.created_at)}</p>

          {/* Sleek Assisting Responder Box with Complete Details */}
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
                <p style={{ margin: "2px 0" }}><strong>Phone:</strong> {(e.assigned_security_phone || e.assigned_volunteer_phone) ? <a href={`tel:${e.assigned_security_phone || e.assigned_volunteer_phone}`} style={{ color: "#0284c7", fontWeight: "700", textDecoration: "underline" }}>{e.assigned_security_phone || e.assigned_volunteer_phone}</a> : "N/A"}{(e.assigned_security_email || e.assigned_volunteer_email) ? ` · Email: ${e.assigned_security_email || e.assigned_volunteer_email}` : ""}</p>
                {(e.assigned_security_address || e.assigned_volunteer_address) && <p style={{ margin: "2px 0", fontSize: "0.85rem", opacity: 0.8 }}><strong>Address:</strong> {e.assigned_security_address || e.assigned_volunteer_address}</p>}
              </div>
            </div>
          )}

          <div className="guardian-actions">
            {e.status !== "PENDING" && <button className="secondary-action-button" onClick={()=>setChatEmergencyId(e.id)}>OPEN CHAT</button>}
            {e.latitude && e.longitude && <a className="secondary-action-button map-link" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${e.latitude}&mlon=${e.longitude}#map=18/${e.latitude}/${e.longitude}`}>VIEW MAP</a>}
            {canAccept(e) && <button className="accept-button" disabled={availabilityStatus !== "AVAILABLE" || activeMine.length > 0} onClick={()=>securityAcceptEmergency(e.id)}>ACCEPT EMERGENCY</button>}
            {e.status === "ASSIGNED" && String(e.assigned_security) === String(user.id) && <><button className="cancel-button" onClick={()=>cancelEmergency(e.id)}>CANCEL RESPONSE</button>{!e.reached_at ? <button className="assistance-button" onClick={()=>markReached(e.id)}>MARK REACHED</button> : <button className="assistance-button" onClick={()=>startAssistance(e.id)}>START ASSISTANCE</button>}<button className="primary-filled-button" onClick={()=>requestAdditionalHelp(e.id)}>REQUEST ADDITIONAL HELP</button><button className="secondary-action-button" onClick={()=>requestHandover(e.id)}>REQUEST HANDOVER</button></>}
            {e.status === "IN_PROGRESS" && String(e.assigned_security) === String(user.id) && <><span className="status status-in_progress">ASSISTING</span><button className="resolve-button" onClick={()=>resolveEmergency(e.id)}>RESOLVE EMERGENCY</button></>}
          </div>
        </div>)}</div>}
      </div>
    </>}

    {chatEmergencyId && <EmergencyChat emergencyId={chatEmergencyId} onClose={()=>setChatEmergencyId(null)} emergency={securityEmergencies.find(e => e.id === chatEmergencyId)} />}
  </>;
}
