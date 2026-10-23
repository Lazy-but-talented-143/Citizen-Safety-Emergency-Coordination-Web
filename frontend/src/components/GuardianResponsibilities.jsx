import { useEffect, useMemo, useState } from "react";
import api from "../api/axios";
import RelationInput from "./RelationInput";

const formatDate = (value) => value ? new Date(value).toLocaleString() : "—";

export default function GuardianResponsibilities() {
  const [links, setLinks] = useState([]);
  const [emergencies, setEmergencies] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [requestForm, setRequestForm] = useState({ resident_phone: "", resident_username: "", guardian_type: "PRIMARY", relation: "Father" });

  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");

  const load = async () => {
    try {
      setLoading(true);
      const [g, e] = await Promise.allSettled([api.get("guardians/mine/"), api.get("emergencies/")]);
      if (g.status === "fulfilled") {
        setLinks(Array.isArray(g.value.data) ? g.value.data : []);
      }
      if (e.status === "fulfilled") {
        setEmergencies(Array.isArray(e.value.data) ? e.value.data : []);
      }
      setError("");
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.detail || "Unable to load guardian responsibilities.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const respondRelationship = async (id, action) => {
    try {
      await api.post(`guardians/${id}/${action}/`);
      setMessage(action === "accept" ? "Guardian relationship accepted." : "Guardian relationship declined.");
      await load();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.detail || "Unable to update guardian relationship.");
    }
  };

  const cancelRelationship = async (id) => {
    try {
      await api.delete(`guardians/${id}/`);
      setMessage("Guardian request cancelled successfully.");
      await load();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.detail || "Unable to cancel guardian request.");
    }
  };

  const sendGuardianRequest = async (event) => {
    event.preventDefault();
    try {
      setError("");
      setMessage("");
      if (!requestForm.resident_phone.trim() && !requestForm.resident_username.trim()) {
        setError("Please enter either the resident phone number or resident username.");
        return;
      }
      const payload = {
        ...requestForm,
        relation: requestForm.relation.trim() || "Father",
      };
      await api.post("guardians/request/", payload);
      setMessage("Guardian request sent successfully. The resident will receive a notification to accept or decline.");
      setRequestForm({ resident_phone: "", resident_username: "", guardian_type: "PRIMARY", relation: "Father" });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.detail || err.response?.data?.resident_phone?.[0] || err.response?.data?.resident_username?.[0] || "Unable to send guardian request.");
    }
  };

  const respondEmergency = async (id, decision) => {
    if (decision === "CANCEL") {
      if (!window.confirm(`Cancel your response to Emergency #${id}?`)) return;
      if (!window.confirm("Final confirmation: your response will be released and escalation can continue.")) return;
    }
    try {
      await api.patch(`emergencies/${id}/guardian-response/`, { decision });
      setMessage(`Emergency #${id}: ${decision === "ACCEPT" ? "accepted" : decision === "DECLINE" ? "declined" : "cancelled"}.`);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.detail || "Unable to respond to the emergency.");
    }
  };

  // Categorize links correctly:
  // Incoming requests: PENDING, where requested_by != currentUser.id AND (user == currentUser.id OR resident == currentUser.id)
  const incomingLinks = links.filter((link) => {
    if (link.relationship_status !== "PENDING") return false;
    if (link.requested_by && String(link.requested_by) === String(currentUser.id)) return false;
    return String(link.user) === String(currentUser.id) || String(link.resident) === String(currentUser.id);
  });

  // Outgoing requests: PENDING, where requested_by == currentUser.id
  const sentLinks = links.filter((link) => {
    if (link.relationship_status !== "PENDING") return false;
    return link.requested_by && String(link.requested_by) === String(currentUser.id);
  });

  // Accepted links where current user is guardian
  const acceptedLinks = links.filter((link) => link.relationship_status === "ACCEPTED" && link.is_active !== false && String(link.user) === String(currentUser.id));

  // Resolved / Declined / Cancelled / Revoked history
  const historyLinks = links.filter((link) => ["DECLINED", "CANCELLED", "REVOKED"].includes(link.relationship_status));

  const linkedResidentIds = useMemo(
    () => new Set(acceptedLinks.map((link) => String(link.resident))),
    [acceptedLinks]
  );
  const relatedEmergencies = useMemo(
    () => emergencies.filter((e) => linkedResidentIds.has(String(e.user))),
    [emergencies, linkedResidentIds]
  );

  return (
    <section className="resident-panel guardian-responsibility-panel" style={{ width: "100%", border: "none", boxShadow: "none", padding: 0 }}>
      <div className="panel-header">
        <div>
          <h2>Guardian Responsibilities & Approval Center</h2>
          <p>Manage guardian relationships, incoming request approvals, and request to protect fellow residents.</p>
        </div>
        <button type="button" className="secondary-action-button" onClick={load}>REFRESH</button>
      </div>

      {message && <div className="success-message">{message}</div>}
      {error && <div className="error-message dashboard-message">{error}</div>}
      {loading && <p className="muted">Loading guardian responsibilities…</p>}

      {/* 1. INCOMING REQUESTS (MUST BE TOP PRIORITY) */}
      <div className="guardian-request-list" style={{ marginBottom: "24px" }}>
        <h3>Incoming Guardian Requests ({incomingLinks.length})</h3>
        {incomingLinks.length === 0 ? (
          <p className="muted">No pending incoming guardian requests.</p>
        ) : (
          incomingLinks.map((link) => {
            const isReverse = link.requested_by && String(link.requested_by) === String(link.user);
            const otherName = isReverse ? (link.guardian_name || link.name || `User #${link.user}`) : (link.resident_name || `Resident #${link.resident}`);
            return (
              <div className="user-row" key={link.id} style={{ background: "rgba(56, 189, 248, 0.05)", border: "1px solid rgba(56, 189, 248, 0.2)", borderRadius: "8px", padding: "14px", marginBottom: "10px" }}>
                <div>
                  <strong style={{ color: "#38BDF8" }}>{link.guardian_type} GUARDIAN REQUEST</strong>
                  <span style={{ display: "block", color: "#F8FAFC", marginTop: "4px" }}>
                    {isReverse ? `${otherName} wants to protect you as your ${link.guardian_type} Guardian` : `${otherName} added you as their ${link.guardian_type} Guardian`}
                  </span>
                  <small style={{ color: "#94A3B8" }}>Relation: {link.relation || "Trusted Contact"} · Phone: {link.phone || "—"}</small>
                </div>
                <div className="guardian-actions" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <span className="verification-badge pending" style={{ marginRight: "8px" }}>PENDING</span>
                  <button type="button" className="accept-button" onClick={() => respondRelationship(link.id, "accept")}>ACCEPT</button>
                  <button type="button" className="cancel-button" onClick={() => respondRelationship(link.id, "decline")}>REJECT</button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 2. REVERSE REQUEST FORM ("REQUEST TO PROTECT A RESIDENT") */}
      <div className="guardian-request-list" style={{ marginBottom: "24px" }}>
        <h3>Request to Protect a Resident (Reverse Request)</h3>
        <p className="muted">You can remain a normal Resident and request to become another resident's Primary, Secondary, or Emergency Contact.</p>
        <form className="guardian-form" onSubmit={sendGuardianRequest}>
          <div className="form-group">
            <label>Resident Username / Name</label>
            <input
              type="text"
              value={requestForm.resident_username}
              onChange={(e) => setRequestForm({ ...requestForm, resident_username: e.target.value })}
              placeholder="Enter resident username (e.g. siva)"
            />
          </div>
          <div className="form-group">
            <label>Resident Phone Number</label>
            <input
              type="text"
              value={requestForm.resident_phone}
              onChange={(e) => setRequestForm({ ...requestForm, resident_phone: e.target.value })}
              placeholder="Enter resident phone number (e.g. 9900000002)"
            />
          </div>
          <div className="form-group">
            <label>Relationship Type</label>
            <select value={requestForm.guardian_type} onChange={(e) => setRequestForm({ ...requestForm, guardian_type: e.target.value })}>
              <option value="PRIMARY">Primary Guardian</option>
              <option value="SECONDARY">Secondary Guardian</option>
              <option value="EMERGENCY">Emergency Contact</option>
            </select>
          </div>
          <div className="form-group">
            <label>Relation</label>
            <RelationInput
              value={requestForm.relation}
              onChange={(rel) => setRequestForm((prev) => ({ ...prev, relation: rel }))}
            />
          </div>
          <div className="guardian-actions">
            <button type="submit" className="accept-button">SEND REQUEST</button>
          </div>
        </form>
      </div>

      {/* 3. OUTGOING / SENT REQUESTS */}
      {sentLinks.length > 0 && (
        <div className="guardian-request-list" style={{ marginBottom: "24px" }}>
          <h3>Requests You Sent ({sentLinks.length})</h3>
          {sentLinks.map((link) => (
            <div className="user-row" key={link.id} style={{ padding: "12px", marginBottom: "8px" }}>
              <div>
                <strong>{link.guardian_type} GUARDIAN</strong>
                <span>Sent to: {link.name || `Resident #${link.resident}`}</span>
                <small>{link.relation} · Phone: {link.phone}</small>
              </div>
              <div className="guardian-actions" style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span className="verification-badge pending">PENDING</span>
                <button type="button" className="cancel-button" onClick={() => cancelRelationship(link.id)}>CANCEL REQUEST</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 4. ACTIVE PEOPLE YOU PROTECT */}
      {acceptedLinks.length > 0 && (
        <div className="guardian-responsibility-list" style={{ marginBottom: "24px" }}>
          <h3>People You Protect (Active)</h3>
          <div className="guardian-link-grid">
            {acceptedLinks.map((link) => (
              <div className="guardian-profile-summary" key={link.id}>
                <strong>{link.name}</strong>
                <span>{link.guardian_type} · {link.relation}</span>
                <small>Resident #{link.resident} · Phone: {link.phone}</small>
                <span className="verification-badge verified" style={{ marginTop: "6px", display: "inline-block" }}>ACTIVE</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. HISTORY (DECLINED / CANCELLED / REVOKED) */}
      {historyLinks.length > 0 && (
        <div className="guardian-responsibility-list" style={{ marginBottom: "24px" }}>
          <h3>Relationship History</h3>
          {historyLinks.map((link) => (
            <div className="user-row" key={link.id} style={{ opacity: 0.7, padding: "10px" }}>
              <div>
                <strong>{link.guardian_type} GUARDIAN</strong>
                <span>{link.name || `User #${link.user}`}</span>
                <small>{link.relation}</small>
              </div>
              <span className={`verification-badge ${link.relationship_status.toLowerCase()}`}>{link.relationship_status}</span>
            </div>
          ))}
        </div>
      )}

      {/* 6. PROTECTED RESIDENTS' EMERGENCIES */}
      {relatedEmergencies.length > 0 && (
        <div className="guardian-responsibility-list">
          <div className="panel-header compact">
            <div>
              <h3>Protected Residents' Emergencies</h3>
              <p>Only emergencies for accepted guardian relationships appear here.</p>
            </div>
          </div>
          <div className="emergency-list">
            {relatedEmergencies.map((emergency) => {
              const waitingForMe = emergency.escalations?.some((x) => String(x.responder) === String(currentUser.id) && x.response_status === "WAITING");
              const acceptedByMe = emergency.escalations?.some((x) => String(x.responder) === String(currentUser.id) && x.response_status === "ACCEPTED");
              return (
                <div className="emergency-item" key={emergency.id}>
                  <div className="emergency-top">
                    <h3>Emergency #{emergency.id}</h3>
                    <span className={`status status-${String(emergency.status).toLowerCase()}`}>{emergency.status}</span>
                  </div>
                  <p><strong>Type:</strong> {emergency.emergency_type} · <strong>Priority:</strong> {emergency.priority}</p>
                  <p><strong>Location:</strong> {emergency.location}</p>
                  <p><strong>Created:</strong> {formatDate(emergency.created_at)}</p>
                  <div className="guardian-actions">
                    {waitingForMe && (
                      <>
                        <button type="button" className="accept-button" onClick={() => respondEmergency(emergency.id, "ACCEPT")}>ACCEPT</button>
                        <button type="button" className="cancel-button" onClick={() => respondEmergency(emergency.id, "DECLINE")}>DECLINE</button>
                      </>
                    )}
                    {acceptedByMe && emergency.status !== "RESOLVED" && (
                      <button type="button" className="cancel-button" onClick={() => respondEmergency(emergency.id, "CANCEL")}>CANCEL RESPONSE</button>
                    )}
                    {emergency.latitude && emergency.longitude && (
                      <a className="secondary-action-button map-link" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${emergency.latitude}&mlon=${emergency.longitude}#map=18/${emergency.latitude}/${emergency.longitude}`}>VIEW MAP</a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
