import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import PrimaryGuardian from "../components/guardian/PrimaryGuardian";
import SecondaryGuardian from "../components/guardian/SecondaryGuardian";
import EmergencyContact from "../components/guardian/EmergencyContact";
import GuardianResponsibilities from "../components/GuardianResponsibilities";

const navItems = [
  ["overview", "◉", "Profile Overview"],
  ["personal", "♙", "Personal Details"],
  ["contacts", "☎", "Emergency Contacts"],
  ["guardian-responsibilities", "🛡", "Guardian Responsibilities"],
  ["address", "⌂", "Address & Residence"],
  ["account", "⚙", "Account Settings"],
];

export default function Profile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "", address: "" });
  const [passwords, setPasswords] = useState({ current_password: "", new_password: "" });
  const [photo, setPhoto] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [accountPanel, setAccountPanel] = useState("password");
  const [notificationPrefs, setNotificationPrefs] = useState(() => {
    try { return JSON.parse(localStorage.getItem("citizenSafetyNotificationPrefs")) || { inApp: true, email: true, sms: false }; }
    catch { return { inApp: true, email: true, sms: false }; }
  });

  const load = async () => {
    try {
      const response = await api.get("profile/");
      const data = response.data;
      setProfile(data);
      setForm({
        first_name: data.first_name || "",
        last_name: data.last_name || "",
        email: data.email || "",
        phone: data.phone || "",
        address: data.address || "",
      });
      localStorage.setItem("user", JSON.stringify(data));
      setError("");
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.error || "Unable to load profile.");
    }
  };

  useEffect(() => { load(); }, []);

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving(true); setMessage(""); setError("");
    try {
      const data = new FormData();
      Object.entries(form).forEach(([key, value]) => data.append(key, value));
      if (photo) data.append("profile_photo", photo);
      const response = await api.patch("profile/", data, { headers: { "Content-Type": "multipart/form-data" } });
      setProfile(response.data);
      localStorage.setItem("user", JSON.stringify(response.data));
      setPhoto(null);
      setEditing(false);
      setMessage("Profile updated successfully.");
    } catch (err) {
      setError(formatApiError(err.response?.data, "Unable to update profile."));
    } finally { setSaving(false); }
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

  const changePassword = async (event) => {
    event.preventDefault(); setMessage(""); setError("");
    try {
      await api.post("profile/change-password/", passwords);
      setPasswords({ current_password: "", new_password: "" });
      setMessage("Password changed successfully.");
    } catch (err) {
      setError(formatApiError(err.response?.data, "Unable to change password."));
    }
  };

  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.username || "User";
  const saveNotificationPrefs = (next) => { setNotificationPrefs(next); localStorage.setItem("citizenSafetyNotificationPrefs", JSON.stringify(next)); setMessage("Notification preferences saved."); };
  const initials = displayName.slice(0, 1).toUpperCase();

  const userRole = profile?.role || JSON.parse(localStorage.getItem("user") || "{}")?.role;
  const isResident = userRole === "RESIDENT";

  const visibleNavItems = navItems.filter(([key]) => {
    if (key === "contacts" && !isResident) return false;
    return true;
  });

  useEffect(() => {
    if (!isResident && activeTab === "contacts") {
      setActiveTab("overview");
    }
  }, [isResident, activeTab]);

  return (
    <div className="profile-page">
      <header className="profile-topbar">
        <div>
          <h2>Citizen Safety</h2>
          <span>Emergency Coordination Platform</span>
        </div>
        <div className="profile-top-actions">
          <button type="button" className="profile-top-button" onClick={() => navigate("/dashboard")}>♙ <span>Dashboard</span></button>
          <button type="button" className="profile-top-button" onClick={() => { localStorage.clear(); navigate("/login"); }}>⇥ <span>Logout</span></button>
        </div>
      </header>

      <main className="profile-shell">
        <aside className="profile-sidebar">
          <nav>
            {visibleNavItems.map(([key, icon, label]) => (
              <button key={key} type="button" className={`profile-nav-item ${activeTab === key ? "active" : ""}`} onClick={() => { setActiveTab(key); setMessage(""); setError(""); }}>
                <span className="profile-nav-icon">{icon}</span>{label}
              </button>
            ))}
          </nav>
          <div className="profile-sidebar-divider" />
          <button type="button" className="profile-nav-item logout-nav" onClick={() => { localStorage.clear(); navigate("/login"); }}><span className="profile-nav-icon">⇥</span>Logout</button>
        </aside>

        <section className="profile-main">
          {message && <div className="success-message profile-message">{message}</div>}
          {error && <div className="error-message profile-message">{error}</div>}

          <div className="profile-heading">
            <div><h1>{activeTab === "overview" ? "Profile Overview" : navItems.find(([key]) => key === activeTab)?.[2]}</h1><p>{activeTab === "overview" ? "View and manage your profile information." : (editing ? "Edit your Citizen Safety account information." : "Manage your Citizen Safety account information.")}</p></div>
          </div>

          {activeTab === "overview" && (
            <>
              <section className="profile-overview-card">
                <div className="profile-overview-avatar">{profile?.profile_photo_url ? <img src={profile.profile_photo_url} alt="Profile" /> : <span>{initials}</span>}</div>
                <div className="profile-overview-identity">
                  <h2>{displayName}</h2>
                  <strong>{profile?.role || "USER"}</strong>
                  <div className="profile-contact-lines">
                    {profile?.phone && <span>☎ {profile.phone}</span>}
                    {profile?.email && <span>✉ {profile.email}</span>}
                  </div>
                </div>
                <button type="button" className="profile-outline-button" onClick={() => { setEditing(true); setActiveTab("personal"); }}>✎ Edit Profile</button>
              </section>

              <div className="profile-summary-grid">
                <section className="profile-summary-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <h2 style={{ margin: 0 }}>♙ <span>Personal Details</span></h2>
                    <button type="button" className="profile-outline-button" style={{ padding: "4px 10px", fontSize: "12px" }} onClick={() => { setEditing(true); setActiveTab("personal"); }}>✎ Edit</button>
                  </div>
                  <div className="profile-detail-list">
                    <div><span>Full Name</span><strong>{displayName}</strong></div>
                    <div><span>Phone Number</span><strong>{profile?.phone || "Not provided"}</strong></div>
                    <div><span>Email</span><strong>{profile?.email || "Not provided"}</strong></div>
                    <div><span>Username</span><strong>{profile?.username || "—"}</strong></div>
                  </div>
                </section>

                <section className="profile-summary-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <h2 style={{ margin: 0 }}>⌂ <span>Address &amp; Residence</span></h2>
                    <button type="button" className="profile-outline-button" style={{ padding: "4px 10px", fontSize: "12px" }} onClick={() => { setEditing(true); setActiveTab("address"); }}>✎ Edit</button>
                  </div>
                  <div className="profile-detail-list">
                    <div><span>Society / Apartment</span><strong>{profile?.society_name || "Not assigned"}</strong></div>
                    <div><span>Block / Tower</span><strong>{profile?.block_name || "Not assigned"}</strong></div>
                    <div><span>Flat / House No.</span><strong>{profile?.flat_number || "Not assigned"}</strong></div>
                    <div><span>Address</span><strong>{profile?.address || "Not provided"}</strong></div>
                  </div>
                </section>

                {isResident && (
                  <section className="profile-summary-card">
                    <h2>☎ <span>Emergency Contacts</span></h2>
                    <div className="profile-contact-summary"><button type="button" onClick={() => setActiveTab("contacts")}>Manage Primary, Secondary &amp; Emergency Contacts →</button></div>
                  </section>
                )}

                {profile?.role === "SECURITY" && (
                  <section className="profile-summary-card">
                    <h2>🛡 <span>Security Duty &amp; Response</span></h2>
                    <div className="profile-detail-list">
                      <div><span>Security Role</span><strong>On-Duty Responder</strong></div>
                      <div><span>Availability Status</span><strong>{profile?.volunteer_status || "OFFLINE"}</strong></div>
                      <div><span>Assigned Society</span><strong>{profile?.society_name || "Assigned by Admin"}</strong></div>
                      <div><span>Scope</span><strong>On-Duty Society Security Patrol</strong></div>
                    </div>
                  </section>
                )}

                {profile?.role === "VOLUNTEER" && (
                  <section className="profile-summary-card">
                    <h2>🤝 <span>Community Volunteer Status</span></h2>
                    <div className="profile-detail-list">
                      <div><span>Volunteer Role</span><strong>Community Emergency Responder</strong></div>
                      <div><span>Volunteer Status</span><strong>{profile?.volunteer_status || "OFFLINE"}</strong></div>
                      <div><span>Assigned Society</span><strong>{profile?.society_name || "Community Member"}</strong></div>
                      <div><span>Community Scope</span><strong>Block &amp; Neighborhood Support</strong></div>
                    </div>
                  </section>
                )}

                {profile?.role === "ADMIN" && !profile?.is_platform_admin && (
                  <section className="profile-summary-card">
                    <h2>🏢 <span>Society Admin Governance</span></h2>
                    <div className="profile-detail-list">
                      <div><span>Admin Role</span><strong>Society Administrator</strong></div>
                      <div><span>Managed Society</span><strong>{profile?.society_name || "Unassigned"}</strong></div>
                      <div><span>Administrative Scope</span><strong>Residents, Responders, Emergency Coordination</strong></div>
                      <div><span>Permissions</span><strong>Full Society Management</strong></div>
                    </div>
                  </section>
                )}

                {profile?.is_platform_admin && (
                  <section className="profile-summary-card">
                    <h2>🌐 <span>Platform Admin Overview</span></h2>
                    <div className="profile-detail-list">
                      <div><span>Platform Role</span><strong>Global System Superadmin</strong></div>
                      <div><span>Platform Scope</span><strong>All Societies &amp; System Settings</strong></div>
                      <div><span>Governance</span><strong>Global Provisioning &amp; Health Probes</strong></div>
                      <div><span>Audit Access</span><strong>Full System Audit Trail</strong></div>
                    </div>
                  </section>
                )}

                <section className="profile-summary-card">
                  <h2>🛡 <span>Guardian Responsibilities</span></h2>
                  <div className="profile-contact-summary"><button type="button" onClick={() => setActiveTab("guardian-responsibilities")}>Manage trusted-person responsibilities and approvals →</button></div>
                </section>

                <section className="profile-summary-card">
                  <h2>⚙ <span>Account Settings</span></h2>
                  <div className="profile-settings-list">
                    <button type="button" onClick={() => setActiveTab("account")}>🔒 Change Password <span>›</span></button>
                    <button type="button" onClick={() => setActiveTab("account")}>🔔 Notification Preferences <span>›</span></button>
                    <button type="button" onClick={() => setActiveTab("account")}>🛡 Privacy &amp; Security <span>›</span></button>
                  </div>
                </section>
              </div>
            </>
          )}

          {activeTab === "personal" && (
            <section className="profile-edit-card">
              <div className="profile-section-head"><div><h2>Personal Details</h2><p>Keep your contact information current for emergency coordination.</p></div></div>
              <form className="profile-form-modern" onSubmit={saveProfile}>
                <div className="profile-form-grid">
                  <label>First Name<input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></label>
                  <label>Last Name<input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></label>
                  <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
                  <label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
                </div>
                <label>Profile Photo<input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] || null)} /></label>
                <div className="profile-form-actions"><button type="button" className="secondary-action-button" onClick={() => { setEditing(false); setActiveTab("overview"); }}>CANCEL</button><button className="accept-button" disabled={saving}>{saving ? "SAVING..." : "SAVE PROFILE"}</button></div>
              </form>
            </section>
          )}

          {activeTab === "address" && (
            <section className="profile-edit-card">
              <div className="profile-section-head">
                <div>
                  <h2>Address &amp; Residence</h2>
                  <p>Update your street address. Society, block and flat assignments are managed by your administrator.</p>
                </div>
              </div>

              {!editing ? (
                <>
                  <div className="profile-residence-grid">
                    <div><span>Society / Apartment</span><strong>{profile?.society_name || "Not assigned"}</strong></div>
                    <div><span>Block / Tower</span><strong>{profile?.block_name || "Not assigned"}</strong></div>
                    <div><span>Flat / House No.</span><strong>{profile?.flat_number || "Not assigned"}</strong></div>
                    <div><span>Address</span><strong>{profile?.address || "Not provided"}</strong></div>
                  </div>
                  <div style={{ marginTop: "20px" }}>
                    <button type="button" className="profile-outline-button" onClick={() => setEditing(true)}>✎ Edit Street Address</button>
                  </div>
                </>
              ) : (
                <form className="profile-form-modern" onSubmit={saveProfile}>
                  <div className="profile-residence-grid" style={{ marginBottom: "16px" }}>
                    <div><span>Society / Apartment</span><strong>{profile?.society_name || "Not assigned"}</strong></div>
                    <div><span>Block / Tower</span><strong>{profile?.block_name || "Not assigned"}</strong></div>
                    <div><span>Flat / House No.</span><strong>{profile?.flat_number || "Not assigned"}</strong></div>
                  </div>
                  <label>
                    Detailed Street / House Address
                    <textarea
                      rows={3}
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      placeholder="Enter street, landmark, or detailed address..."
                      style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#ffffff", color: "#0f172a", marginTop: "6px", fontSize: "14px", lineHeight: "1.5" }}
                    />
                  </label>
                  <div className="profile-form-actions" style={{ marginTop: "16px" }}>
                    <button type="button" className="secondary-action-button" onClick={() => setEditing(false)}>CANCEL</button>
                    <button className="accept-button" disabled={saving}>{saving ? "SAVING..." : "SAVE ADDRESS"}</button>
                  </div>
                </form>
              )}
            </section>
          )}

          {activeTab === "contacts" && isResident && (
            <div className="profile-contact-panels">
              <section className="profile-edit-card"><PrimaryGuardian /></section>
              <section className="profile-edit-card"><SecondaryGuardian /></section>
              <section className="profile-edit-card"><EmergencyContact /></section>
            </div>
          )}

          {activeTab === "guardian-responsibilities" && (
            <section className="profile-edit-card">
              <GuardianResponsibilities />
            </section>
          )}

          {activeTab === "account" && (
            <section className="profile-edit-card">
              <div className="profile-section-head"><div><h2>Account Settings</h2><p>Protect your account and manage your security settings.</p></div></div>
              <div className="profile-account-tabs">
                <button type="button" className={accountPanel === "password" ? "active" : ""} onClick={() => setAccountPanel("password")}>🔒 Change Password</button>
                <button type="button" className={accountPanel === "notifications" ? "active" : ""} onClick={() => setAccountPanel("notifications")}>🔔 Notification Preferences</button>
                <button type="button" className={accountPanel === "privacy" ? "active" : ""} onClick={() => setAccountPanel("privacy")}>🛡 Privacy &amp; Security</button>
              </div>
              {accountPanel === "password" && <form className="profile-form-modern narrow-form" onSubmit={changePassword}>
                <label>Current Password<input type="password" value={passwords.current_password} onChange={(e) => setPasswords({ ...passwords, current_password: e.target.value })} required /></label>
                <label>New Password<input type="password" value={passwords.new_password} onChange={(e) => setPasswords({ ...passwords, new_password: e.target.value })} required /></label>
                <button className="accept-button">CHANGE PASSWORD</button>
              </form>}
              {accountPanel === "notifications" && <div className="profile-preferences-panel">
                <h3>Notification Preferences</h3><p>Choose how you prefer to receive non-critical account notifications. Emergency escalation itself is never disabled by these settings.</p>
                <label className="preference-row"><span><strong>In-app notifications</strong><small>Emergency and account alerts inside Citizen Safety.</small></span><input type="checkbox" checked={notificationPrefs.inApp} onChange={(e) => saveNotificationPrefs({ ...notificationPrefs, inApp: e.target.checked })} /></label>
                <label className="preference-row"><span><strong>Email notifications</strong><small>Account and relationship updates by email.</small></span><input type="checkbox" checked={notificationPrefs.email} onChange={(e) => saveNotificationPrefs({ ...notificationPrefs, email: e.target.checked })} /></label>
                <label className="preference-row"><span><strong>SMS notifications</strong><small>Available when an SMS provider is configured.</small></span><input type="checkbox" checked={notificationPrefs.sms} onChange={(e) => saveNotificationPrefs({ ...notificationPrefs, sms: e.target.checked })} /></label>
              </div>}
              {accountPanel === "privacy" && <div className="profile-preferences-panel">
                <h3>Privacy &amp; Security</h3><p>Your society, flat and emergency data is restricted by backend authorization and society scope.</p>
                <div className="privacy-check-list"><div>✓ Society-level data isolation</div><div>✓ Role-based API authorization</div><div>✓ Emergency access limited to authorized participants</div><div>✓ Password changes require the current password</div></div>
              </div>}
              <div className="profile-security-note">🛡 Your information is secure and will only be used for emergency coordination.</div>
            </section>
          )}

          <footer className="profile-footer-note">🛡 <span>Your information is secure and will only be used for emergency coordination.</span></footer>
        </section>
      </main>
    </div>
  );
}
