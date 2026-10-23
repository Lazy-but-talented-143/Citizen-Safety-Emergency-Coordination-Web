import React, { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import EmergencyChat from "../components/EmergencyChat";

const dateText = (v) => v ? new Date(v).toLocaleString() : "—";
const statuses = [["ALL","ALL"],["PENDING","PENDING"],["ASSIGNED","ASSIGNED"],["IN_PROGRESS","IN PROGRESS"],["RESOLVED","RESOLVED"]];

export default function VolunteerDashboard({ user, volunteerStatus, updateVolunteerStatus, volunteerEmergencies, volunteerNotifications, volunteerFilter, setVolunteerFilter, loadVolunteerEmergencies, loadVolunteerNotifications, acceptEmergency, cancelEmergency, markReached, startAssistance, requestHandover, requestAdditionalHelp, resolveEmergency, activeSection, setActiveSection }) {
  const [priority, setPriority] = useState("ALL");
  const [block, setBlock] = useState("ALL");
  const [search, setSearch] = useState("");
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

  const incomingInvitations = membershipRequests.filter(r => r.direction === "INVITE" && r.status === "PENDING");
  const mySentRequests = membershipRequests.filter(r => r.direction === "REQUEST");

  const blocks = [...new Set(volunteerEmergencies.map(e => e.user_block_name || e.block_name).filter(Boolean))];
  const filtered = useMemo(() => volunteerEmergencies.filter(e => {
    const s = volunteerFilter === "ALL" || e.status === volunteerFilter;
    const p = priority === "ALL" || e.priority === priority;
    const b = block === "ALL" || (e.user_block_name || e.block_name) === block;
    const q = search.trim().toLowerCase();
    const text = `${e.id} ${e.emergency_type} ${e.location} ${e.description}`.toLowerCase();
    return s && p && b && (!q || text.includes(q));
  }), [volunteerEmergencies, volunteerFilter, priority, block, search]);
  const counts = Object.fromEntries(statuses.map(([key]) => [key, key === "ALL" ? volunteerEmergencies.length : volunteerEmergencies.filter(e => e.status === key).length]));

  return <>
    <div className="cards responder-card-row">
      <div className={`feature-card ${activeSection === "availability" ? "selected-card" : ""}`} onClick={()=>setActiveSection("availability")}>
        <div className="feature-icon">A</div><h2>Availability</h2><p>Current Status: <strong>{volunteerStatus}</strong></p>
      </div>
      <div className={`feature-card emergency-card ${activeSection === "incidents" ? "selected-card" : ""}`} onClick={()=>{setActiveSection("incidents");loadVolunteerEmergencies();}}>
        <div className="feature-icon">!</div><h2>Incidents</h2><p>Monitor multiple residents and blocks.</p>
      </div>
      <div className={`feature-card ${activeSection === "notifications" ? "selected-card" : ""}`} onClick={()=>{setActiveSection("notifications");loadVolunteerNotifications();}}>
        <div className="feature-icon">N</div><h2>Notifications</h2><p>{volunteerNotifications.filter(n=>!n.is_read).length} unread updates.</p>
      </div>
      <div className={`feature-card ${activeSection === "membership" ? "selected-card" : ""}`} onClick={()=>{setActiveSection("membership");loadMembershipData();}}>
        <div className="feature-icon">🛡</div><h2>Society Membership</h2><p>{incomingInvitations.length ? `${incomingInvitations.length} incoming invitation(s)` : "Manage society access & requests"}</p>
      </div>
    </div>

    {activeSection === "availability" && <div className="resident-panel"><h2>Volunteer Availability</h2><p>Set your current readiness before accepting an incident.</p><div className="volunteer-buttons"><button className="available-button" onClick={()=>updateVolunteerStatus("AVAILABLE")}>AVAILABLE</button><button className="busy-button" onClick={()=>updateVolunteerStatus("BUSY")}>BUSY</button><button className="offline-button" onClick={()=>updateVolunteerStatus("OFFLINE")}>OFFLINE</button></div></div>}

    {activeSection === "membership" && <div className="resident-panel">
      <div className="panel-header">
        <div><h2>Society Membership &amp; Access Requests</h2><p>Request Volunteer access to a society or accept incoming admin invitations.</p></div>
        <button type="button" className="secondary-action-button" onClick={loadMembershipData}>REFRESH</button>
      </div>

      {membershipMsg && <div className="success-message">{membershipMsg}</div>}
      {membershipErr && <div className="error-message dashboard-message">{membershipErr}</div>}

      {/* 1. INCOMING ADMIN INVITATIONS */}
      <div className="guardian-request-list" style={{ marginBottom: "24px" }}>
        <h3>Incoming Admin Society Invitations ({incomingInvitations.length})</h3>
        {incomingInvitations.length === 0 ? <p className="muted">No pending society invitations.</p> : incomingInvitations.map(r => (
          <div className="user-row" key={r.id} style={{ background: "rgba(56, 189, 248, 0.05)", border: "1px solid rgba(56, 189, 248, 0.2)", padding: "14px", borderRadius: "8px", marginBottom: "10px" }}>
            <div>
              <strong style={{ color: "#38BDF8" }}>SOCIETY INVITATION</strong>
              <span style={{ display: "block", color: "#F8FAFC" }}>{r.society_name} Admin invited you to join as a Volunteer.</span>
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
        <p className="muted">Select an authorized apartment society to request Volunteer membership.</p>
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
              <span style={{ display: "block" }}>Role: VOLUNTEER · Requested on {dateText(r.created_at)}</span>
            </div>
            <div className="guardian-actions" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span className={`verification-badge ${r.status.toLowerCase()}`}>{r.status}</span>
              {r.status === "PENDING" && <button type="button" className="cancel-button" onClick={() => cancelMembershipRequest(r.id)}>CANCEL REQUEST</button>}
            </div>
          </div>
        ))}
      </div>
    </div>}

    {activeSection === "incidents" && <div className="resident-panel"><div className="panel-header"><div><h2>Volunteer Incident Board</h2><p>Volunteers can see many residents; every incident shows society, block, floor and flat when mapped.</p></div><button className="secondary-action-button" onClick={loadVolunteerEmergencies}>REFRESH</button></div><div className="emergency-filter-row"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search resident, location or emergency"/><select value={block} onChange={e=>setBlock(e.target.value)}><option value="ALL">ALL BLOCKS</option>{blocks.map(b=><option key={b}>{b}</option>)}</select></div><div className="priority-button-row">{["ALL","LOW","MEDIUM","HIGH","CRITICAL"].map(p=><button key={p} className={`priority-filter-button priority-${p.toLowerCase()} ${priority===p?'active':''}`} onClick={()=>setPriority(p)}>{p}</button>)}</div><div className="filter-button-row">{statuses.map(([key,label])=><button key={key} className={`status-filter-button ${volunteerFilter===key?'active':''}`} onClick={()=>setVolunteerFilter(key)}>{label} ({counts[key]})</button>)}</div>{filtered.length===0?<p>No incidents available.</p>:<div className="emergency-list">{filtered.map(e=><div className="emergency-item" key={e.id}><div className="emergency-top"><h3>Emergency #{e.id}</h3><span className={`status status-${String(e.status).toLowerCase()}`}>{e.status}</span></div><p><strong>Resident:</strong> {e.requester_name || e.requester_username || `#${e.user}`} · <strong>Block:</strong> {e.user_block_name || e.block_name || "—"}</p><p><strong>Emergency:</strong> {e.emergency_type} · <strong>Priority:</strong> {e.priority}</p><p><strong>Society:</strong> {e.society_name || e.user_society || "—"} · <strong>Location:</strong> {e.location}</p><p><strong>Created:</strong> {dateText(e.created_at)}</p>{(e.assigned_security_name || e.assigned_volunteer_name) && (<div className="responder-info-box" style={{ background: "rgba(56, 189, 248, 0.08)", border: "1px solid rgba(56, 189, 248, 0.25)", borderRadius: "10px", padding: "12px 14px", margin: "10px 0" }}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}><strong style={{ color: "#0284c7", fontSize: "0.9rem" }}>🛡️ Assisting Responder Details</strong><span className="availability-pill available" style={{ fontSize: "10px", padding: "3px 8px" }}>{e.status === "IN_PROGRESS" ? "ASSISTING" : "ASSIGNED"}</span></div><div style={{ fontSize: "0.9rem", lineHeight: "1.5" }}><p style={{ margin: "2px 0" }}><strong>Full Name:</strong> {e.assigned_security_name ? (e.assigned_security_full_name || e.assigned_security_name) : (e.assigned_volunteer_full_name || e.assigned_volunteer_name)} ({e.assigned_security_name ? "Security Person" : "Community Volunteer"})</p><p style={{ margin: "2px 0" }}><strong>Phone:</strong> {(e.assigned_security_phone || e.assigned_volunteer_phone) ? <a href={`tel:${e.assigned_security_phone || e.assigned_volunteer_phone}`} style={{ color: "#0284c7", fontWeight: "700", textDecoration: "underline" }}>{e.assigned_security_phone || e.assigned_volunteer_phone}</a> : "N/A"}{(e.assigned_security_email || e.assigned_volunteer_email) ? ` · Email: ${e.assigned_security_email || e.assigned_volunteer_email}` : ""}</p>{(e.assigned_security_address || e.assigned_volunteer_address) && <p style={{ margin: "2px 0", fontSize: "0.85rem", opacity: 0.8 }}><strong>Address:</strong> {e.assigned_security_address || e.assigned_volunteer_address}</p>}</div></div>)}<div className="guardian-actions">{e.status !== "PENDING" && <button className="secondary-action-button" onClick={()=>setChatEmergencyId(e.id)}>OPEN CHAT</button>}{e.latitude&&e.longitude&&<a className="secondary-action-button map-link" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${e.latitude}&mlon=${e.longitude}#map=18/${e.latitude}/${e.longitude}`}>VIEW MAP</a>}{e.status==="PENDING"&&<button className="accept-button" onClick={()=>acceptEmergency(e.id)}>ACCEPT EMERGENCY</button>}{e.status==="ASSIGNED"&&String(e.assigned_volunteer)===String(user.id)&&<><button className="cancel-button" onClick={()=>cancelEmergency(e.id)}>CANCEL RESPONSE</button>{!e.reached_at?<button className="assistance-button" onClick={()=>markReached(e.id)}>MARK REACHED</button>:<button className="assistance-button" onClick={()=>startAssistance(e.id)}>START ASSISTANCE</button>}<button className="primary-filled-button" onClick={()=>requestAdditionalHelp(e.id)}>REQUEST ADDITIONAL HELP</button><button className="secondary-action-button" onClick={()=>requestHandover(e.id)}>REQUEST HANDOVER</button></>}{e.status==="IN_PROGRESS"&&String(e.assigned_volunteer)===String(user.id)&&<><span className="status status-in_progress">ASSISTING</span><button className="resolve-button" onClick={()=>resolveEmergency(e.id)}>RESOLVE EMERGENCY</button></>}</div></div>)}</div>}</div>}

    {activeSection === "notifications" && <div className="resident-panel"><div className="panel-header"><div><h2>Volunteer Notifications</h2><p>Alerts for incidents in your assigned society.</p></div><button className="secondary-action-button" onClick={loadVolunteerNotifications}>REFRESH</button></div><div className="notification-list">{volunteerNotifications.length===0?<p>No notifications available.</p>:volunteerNotifications.map(n=><div className={`notification-item ${n.is_read?'read':'unread'}`} key={n.id}><h3>{n.title}</h3><p>{n.message}</p><small>{n.channel} · {dateText(n.created_at)}</small></div>)}</div></div>}

    {chatEmergencyId && <EmergencyChat emergencyId={chatEmergencyId} onClose={()=>setChatEmergencyId(null)} emergency={volunteerEmergencies.find(e => e.id === chatEmergencyId)} />}
  </>;
}
