import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/axios";

export default function Register() {
  const navigate = useNavigate();
  const [options, setOptions] = useState({ societies: [], blocks: [], flats: [] });
  const [blocks, setBlocks] = useState([]);
  const [flats, setFlats] = useState([]);
  
  const [form, setForm] = useState({
    username: "", first_name: "", last_name: "", email: "", phone: "", address: "",
    role: "RESIDENT", password: "", society: "", block: "", flat: ""
  });
  
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Phone OTP States
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpMessage, setOtpMessage] = useState("");
  const [otpError, setOtpError] = useState("");

  const sendOtp = async () => {
    if (!form.phone.trim()) {
      setOtpError("Please enter phone number first.");
      return;
    }
    setOtpError(""); setOtpMessage(""); setOtpLoading(true);
    try {
      const res = await api.post("otp/send/", { phone: form.phone, purpose: "REGISTER" });
      setOtpSent(true);
      if (res.data.otp_code) {
        setOtpMessage(`OTP sent! (Test OTP: ${res.data.otp_code})`);
        setOtpCode(res.data.otp_code);
      } else {
        setOtpMessage("OTP sent to your phone number.");
      }
    } catch (err) {
      setOtpError(err.response?.data?.error || "Failed to send OTP.");
    } finally { setOtpLoading(false); }
  };

  const verifyOtp = async () => {
    if (!otpCode.trim()) {
      setOtpError("Please enter the 6-digit OTP code.");
      return;
    }
    setOtpError(""); setOtpMessage(""); setOtpLoading(true);
    try {
      await api.post("otp/verify/", { phone: form.phone, otp_code: otpCode, purpose: "REGISTER" });
      setIsPhoneVerified(true);
      setOtpMessage("Phone number verified successfully! ✓");
    } catch (err) {
      setOtpError(err.response?.data?.error || "Invalid OTP code.");
    } finally { setOtpLoading(false); }
  };

  // Administration Modal States
  const [activeModal, setActiveModal] = useState(null); // 'ADMIN_LOGIN' | 'REGISTER_ADMIN' | 'REGISTER_SOCIETY' | 'ADMIN_SUCCESS' | 'SOCIETY_SUCCESS'
  const [targetModalAfterLogin, setTargetModalAfterLogin] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");

  const [adminLoginForm, setAdminLoginForm] = useState({ username: "", password: "" });

  const [newAdminForm, setNewAdminForm] = useState({
    username: "", first_name: "", last_name: "", email: "", phone: "", society: "", temporary_password: ""
  });

  const [newSocietyForm, setNewSocietyForm] = useState({
    name: "", address: "", city: "", state: "", pincode: "",
    admin_username: "", admin_first_name: "", admin_last_name: "", admin_email: "", admin_phone: "", admin_password: ""
  });

  const [createdCredentials, setCreatedCredentials] = useState({ title: "", society: "", username: "", password: "" });

  useEffect(() => {
    api.get("registration-options/")
      .then((response) => setOptions(response.data || {}))
      .catch(() => setError("Unable to load society registration options."));
  }, []);

  useEffect(() => {
    if (form.society) {
      api.get(`registration-options/?society=${form.society}`)
        .then((res) => setBlocks(res.data?.blocks || []))
        .catch(() => setBlocks([]));
    } else {
      setBlocks([]);
    }
  }, [form.society]);

  useEffect(() => {
    if (form.block) {
      api.get(`registration-options/?block=${form.block}`)
        .then((res) => setFlats(res.data?.flats || []))
        .catch(() => setFlats([]));
    } else {
      setFlats([]);
    }
  }, [form.block]);

  const update = (e) => {
    const { name, value } = e.target;
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (name === "role" && value !== "ADMIN") {
        setCreateNewSociety(false);
      }
      if (name === "society") { next.block = ""; next.flat = ""; }
      if (name === "block") next.flat = "";
      return next;
    });
  };

  const [createNewSociety, setCreateNewSociety] = useState(false);
  const [newSocietyDetails, setNewSocietyDetails] = useState({
    name: "", address: "", city: "", state: "", pincode: "", block_name: "", flat_number: "", floor: "1"
  });

  const handleAdminActionClick = (targetForm) => {
    setModalError("");
    setActiveModal(targetForm);
  };

  const submit = async (e) => {
    e.preventDefault(); setError(""); setMessage(""); setLoading(true);
    try {
      const payload = {
        ...form,
        society: form.society || null,
        block: form.role === "RESIDENT" ? (form.block || null) : null,
        flat: form.role === "RESIDENT" ? (form.flat || null) : null,
      };

      if (createNewSociety || (form.role === "ADMIN" && !form.society)) {
        if (!newSocietyDetails.name) {
          setError("Please enter a name for the new society.");
          setLoading(false);
          return;
        }
        if (!newSocietyDetails.block_name || !newSocietyDetails.flat_number) {
          setError("Please enter initial Block/Tower and Flat number.");
          setLoading(false);
          return;
        }
        payload.create_new_society = true;
        payload.new_society_name = newSocietyDetails.name;
        payload.society_address = newSocietyDetails.address;
        payload.society_city = newSocietyDetails.city;
        payload.society_state = newSocietyDetails.state;
        payload.society_pincode = newSocietyDetails.pincode;
        payload.block_name = newSocietyDetails.block_name;
        payload.flat_number = newSocietyDetails.flat_number;
        payload.floor = newSocietyDetails.floor;
      }

      await api.post("register/", payload);
      setMessage("Registration successful. You can now login.");
      setTimeout(() => navigate("/login"), 800);
    } catch (err) {
      setError(err.response?.data?.error || JSON.stringify(err.response?.data) || "Registration failed.");
    } finally { setLoading(false); }
  };

  const handleCreateAdminSubmit = async (e) => {
    e.preventDefault();
    setModalError("");
    setModalLoading(true);
    try {
      let socId = newAdminForm.society;
      if (newAdminForm.create_new_society) {
        if (!newAdminForm.new_society_name) {
          setModalError("Please enter society name.");
          setModalLoading(false);
          return;
        }
        const socRes = await api.post("register/", {
          username: newAdminForm.username,
          first_name: newAdminForm.first_name,
          last_name: newAdminForm.last_name,
          email: newAdminForm.email,
          phone: newAdminForm.phone,
          password: newAdminForm.temporary_password || "Admin@123456",
          role: "ADMIN",
          create_new_society: true,
          new_society_name: newAdminForm.new_society_name
        });
        setCreatedCredentials({
          title: "ADMIN & SOCIETY CREATED",
          society: newAdminForm.new_society_name,
          username: newAdminForm.username,
          password: newAdminForm.temporary_password || "Admin@123456",
        });
        setActiveModal("ADMIN_SUCCESS");
        api.get("registration-options/").then((res) => setOptions(res.data || {}));
        setModalLoading(false);
        return;
      }

      const payload = {
        username: newAdminForm.username,
        first_name: newAdminForm.first_name,
        last_name: newAdminForm.last_name,
        email: newAdminForm.email,
        phone: newAdminForm.phone,
        society: socId,
        password: newAdminForm.temporary_password || "Admin@123456",
        role: "ADMIN"
      };
      const response = await api.post("register/", payload);
      setCreatedCredentials({
        title: "ADMIN CREATED SUCCESSFULLY",
        society: "",
        username: response.data.username || newAdminForm.username,
        password: newAdminForm.temporary_password || "Admin@123456",
      });
      setActiveModal("ADMIN_SUCCESS");
      api.get("registration-options/").then((res) => setOptions(res.data || {}));
    } catch (err) {
      setModalError(err.response?.data?.error || JSON.stringify(err.response?.data) || "Admin creation failed.");
    } finally {
      setModalLoading(false);
    }
  };

  const handleCreateSocietySubmit = async (e) => {
    e.preventDefault();
    setModalError("");
    setModalLoading(true);
    try {
      if (newSocietyForm.admin_username && newSocietyForm.admin_phone) {
        const payload = {
          username: newSocietyForm.admin_username,
          first_name: newSocietyForm.admin_first_name,
          last_name: newSocietyForm.admin_last_name,
          email: newSocietyForm.admin_email,
          phone: newSocietyForm.admin_phone,
          password: newSocietyForm.admin_password || "Admin@123456",
          role: "ADMIN",
          create_new_society: true,
          new_society_name: newSocietyForm.name,
          society_address: newSocietyForm.address,
          society_city: newSocietyForm.city,
          society_state: newSocietyForm.state,
          society_pincode: newSocietyForm.pincode
        };
        const response = await api.post("register/", payload);
        setCreatedCredentials({
          title: "SOCIETY & ADMIN CREATED SUCCESSFULLY",
          society: newSocietyForm.name,
          username: response.data.username || newSocietyForm.admin_username,
          password: newSocietyForm.admin_password || "Admin@123456",
        });
      } else {
        setError("Admin details required to provision society administrator.");
        setModalLoading(false);
        return;
      }
      setActiveModal("SOCIETY_SUCCESS");
      api.get("registration-options/").then((res) => setOptions(res.data || {}));
    } catch (err) {
      setModalError(err.response?.data?.error || JSON.stringify(err.response?.data) || "Society creation failed.");
    } finally {
      setModalLoading(false);
    }
  };

  const copyCredentials = () => {
    const textToCopy = `Username: ${createdCredentials.username}\nTemporary Password: ${createdCredentials.password}`;
    navigator.clipboard.writeText(textToCopy);
    setCopyFeedback("Credentials Copied!");
    setTimeout(() => setCopyFeedback(""), 2000);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="logo">CS</div>
        <h1>Create Account</h1>
        <p className="subtitle">Citizen Safety Emergency Coordination Platform</p>

        <form onSubmit={submit}>
          <label>Username</label>
          <input name="username" value={form.username} onChange={update} placeholder="Enter username" required />

          <label>First Name</label>
          <input name="first_name" value={form.first_name} onChange={update} placeholder="Enter first name" required />

          <label>Last Name</label>
          <input name="last_name" value={form.last_name} onChange={update} placeholder="Enter last name" />

          <label>Email</label>
          <input type="email" name="email" value={form.email} onChange={update} placeholder="Enter email" required />

          <label>Phone Number *</label>
          <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
            <input
              name="phone"
              value={form.phone}
              onChange={(e) => {
                update(e);
                setIsPhoneVerified(false);
                setOtpSent(false);
              }}
              placeholder="Enter phone number"
              required
              disabled={isPhoneVerified}
              style={{ flex: 1 }}
            />
            {!isPhoneVerified ? (
              <button
                type="button"
                onClick={sendOtp}
                disabled={otpLoading || !form.phone}
                style={{
                  background: "#176b87",
                  color: "#fff",
                  border: "none",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  fontWeight: "600",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  whiteSpace: "nowrap"
                }}
              >
                {otpLoading ? "Sending..." : otpSent ? "Resend OTP" : "Send OTP"}
              </button>
            ) : (
              <div
                style={{
                  background: "#dcfce7",
                  color: "#166534",
                  border: "1px solid #bbf7d0",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  fontWeight: "700",
                  fontSize: "0.85rem",
                  display: "flex",
                  alignItems: "center"
                }}
              >
                ✓ Verified
              </div>
            )}
          </div>

          {otpSent && !isPhoneVerified && (
            <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1", marginBottom: "12px" }}>
              <label style={{ fontSize: "0.82rem", color: "#475569", fontWeight: "600", margin: "0 0 4px 0", display: "block" }}>Enter 6-Digit Verification Code</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="e.g. 123456"
                  style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.95rem", letterSpacing: "2px", fontWeight: "bold" }}
                />
                <button
                  type="button"
                  onClick={verifyOtp}
                  disabled={otpLoading || !otpCode}
                  style={{
                    background: "#16a34a",
                    color: "#fff",
                    border: "none",
                    padding: "8px 16px",
                    borderRadius: "6px",
                    fontWeight: "600",
                    cursor: "pointer",
                    fontSize: "0.85rem"
                  }}
                >
                  {otpLoading ? "Verifying..." : "Verify OTP"}
                </button>
              </div>
            </div>
          )}

          {otpError && <div className="error-message" style={{ marginBottom: "10px", fontSize: "0.82rem" }}>{otpError}</div>}
          {otpMessage && <div className="success-message" style={{ marginBottom: "10px", fontSize: "0.82rem" }}>{otpMessage}</div>}


          <label>Address</label>
          <input name="address" value={form.address} onChange={update} placeholder="Enter address" />

          <label>Role</label>
          <select name="role" value={form.role} onChange={update} className="login-select">
            <option value="RESIDENT">Resident</option>
            <option value="VOLUNTEER">Volunteer</option>
            <option value="SECURITY">Security</option>
            <option value="ADMIN">Society Admin</option>
          </select>

          {/* Society selection or creation */}
          {!createNewSociety ? (
            <>
              <label>Society</label>
              <select
                name="society"
                value={form.society}
                onChange={(e) => {
                  if (e.target.value === "CREATE_NEW_SOCIETY") {
                    setCreateNewSociety(true);
                  } else {
                    update(e);
                  }
                }}
                className="login-select"
                required={!createNewSociety}
              >
                <option value="">Select your society</option>
                {options.societies.map((society) => (
                  <option value={society.id} key={society.id}>{society.name}</option>
                ))}
                {form.role === "ADMIN" && (
                  <option value="CREATE_NEW_SOCIETY" style={{ fontWeight: "bold", color: "#176b87" }}>
                    + Create New Society
                  </option>
                )}
              </select>
            </>
          ) : (
            <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "12px", border: "1px solid #176b87", marginTop: "16px", marginBottom: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <label style={{ margin: 0, color: "#176b87", fontWeight: "700", fontSize: "0.95rem" }}>Create New Society</label>
                <button
                  type="button"
                  onClick={() => setCreateNewSociety(false)}
                  style={{
                    background: "#e0f2fe",
                    color: "#0369a1",
                    border: "1px solid #bae6fd",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    fontSize: "0.78rem",
                    fontWeight: "600",
                    cursor: "pointer",
                    textDecoration: "none",
                    transition: "0.2s"
                  }}
                >
                  Select Existing
                </button>
              </div>

              <label style={{ margin: "8px 0 4px", fontSize: "0.85rem", fontWeight: 600 }}>Society Name *</label>
              <input
                placeholder="Enter society name"
                value={newSocietyDetails.name}
                onChange={(e) => setNewSocietyDetails({ ...newSocietyDetails, name: e.target.value })}
                required
                style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #d8dee8", background: "#fff", outline: "none", fontSize: "0.9rem" }}
              />

              <label style={{ margin: "8px 0 4px", fontSize: "0.85rem", fontWeight: 600 }}>Address</label>
              <input
                placeholder="Enter society address"
                value={newSocietyDetails.address}
                onChange={(e) => setNewSocietyDetails({ ...newSocietyDetails, address: e.target.value })}
                style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #d8dee8", background: "#fff", outline: "none", fontSize: "0.9rem" }}
              />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "4px" }}>
                <div>
                  <label style={{ margin: "8px 0 4px", fontSize: "0.85rem", fontWeight: 600 }}>City</label>
                  <input
                    placeholder="City"
                    value={newSocietyDetails.city}
                    onChange={(e) => setNewSocietyDetails({ ...newSocietyDetails, city: e.target.value })}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #d8dee8", background: "#fff", outline: "none", fontSize: "0.9rem" }}
                  />
                </div>
                <div>
                  <label style={{ margin: "8px 0 4px", fontSize: "0.85rem", fontWeight: 600 }}>State</label>
                  <input
                    placeholder="State"
                    value={newSocietyDetails.state}
                    onChange={(e) => setNewSocietyDetails({ ...newSocietyDetails, state: e.target.value })}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #d8dee8", background: "#fff", outline: "none", fontSize: "0.9rem" }}
                  />
                </div>
              </div>

              <div style={{ borderTop: "1px dashed #cbd5e1", marginTop: "12px", paddingTop: "10px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <label style={{ margin: "8px 0 4px", fontSize: "0.85rem", fontWeight: 600 }}>Block / Tower *</label>
                    <input
                      placeholder="e.g. Block A"
                      value={newSocietyDetails.block_name}
                      onChange={(e) => setNewSocietyDetails({ ...newSocietyDetails, block_name: e.target.value })}
                      required
                      style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #d8dee8", background: "#fff", outline: "none", fontSize: "0.9rem" }}
                    />
                  </div>
                  <div>
                    <label style={{ margin: "8px 0 4px", fontSize: "0.85rem", fontWeight: 600 }}>Flat Number *</label>
                    <input
                      placeholder="e.g. 101"
                      value={newSocietyDetails.flat_number}
                      onChange={(e) => setNewSocietyDetails({ ...newSocietyDetails, flat_number: e.target.value })}
                      required
                      style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #d8dee8", background: "#fff", outline: "none", fontSize: "0.9rem" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {form.role === "RESIDENT" && !createNewSociety && (
            <>
              <label>Block / Tower</label>
              <select name="block" value={form.block} onChange={update} className="login-select" required>
                <option value="">Select block / tower</option>
                {blocks.map((block) => (
                  <option value={block.id} key={block.id}>{block.name}</option>
                ))}
              </select>

              <label>Flat</label>
              <select name="flat" value={form.flat} onChange={update} className="login-select" required>
                <option value="">Select flat</option>
                {flats.map((flat) => (
                  <option value={flat.id} key={flat.id}>Flat {flat.flat_number} · Floor {flat.floor}</option>
                ))}
              </select>
            </>
          )}

          <label>Password</label>
          <input type="password" name="password" value={form.password} onChange={update} placeholder="Choose a secure password" required />

          {error && <div className="error-message">{error}</div>}
          {message && <div className="success-message">{message}</div>}

          <button className="primary-button" disabled={loading}>{loading ? "Creating..." : "Register"}</button>

          <div className="login-links">
            <Link to="/login">Back to Login</Link>
            <Link to="/forgot-password">Forgot password?</Link>
          </div>


        </form>
      </div>

      {/* REGISTER NEW ADMIN FORM MODAL */}
      {activeModal === "REGISTER_ADMIN" && (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyCenter: "center" }}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "min(500px, 90vw)", background: "#0F172A", border: "1px solid #1E293B", padding: "24px", borderRadius: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, color: "#F8FAFC", fontSize: "1.1rem" }}>REGISTER NEW ADMIN</h3>
              <button type="button" onClick={() => setActiveModal(null)} style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", fontSize: "1.2rem" }}>✕</button>
            </div>
            {modalError && <div className="error-message" style={{ marginBottom: "12px", fontSize: "0.85rem" }}>{modalError}</div>}
            <form onSubmit={handleCreateAdminSubmit}>
              <label style={{ fontSize: "0.85rem", color: "#94A3B8" }}>Username *</label>
              <input value={newAdminForm.username} onChange={(e) => setNewAdminForm({ ...newAdminForm, username: e.target.value })} required style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #334155", background: "#020617", color: "#FFF", marginBottom: "10px" }} />
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "0.85rem", color: "#94A3B8" }}>First Name</label>
                  <input value={newAdminForm.first_name} onChange={(e) => setNewAdminForm({ ...newAdminForm, first_name: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #334155", background: "#020617", color: "#FFF", marginBottom: "10px" }} />
                </div>
                <div>
                  <label style={{ fontSize: "0.85rem", color: "#94A3B8" }}>Last Name</label>
                  <input value={newAdminForm.last_name} onChange={(e) => setNewAdminForm({ ...newAdminForm, last_name: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #334155", background: "#020617", color: "#FFF", marginBottom: "10px" }} />
                </div>
              </div>

              <label style={{ fontSize: "0.85rem", color: "#94A3B8" }}>Email</label>
              <input type="email" value={newAdminForm.email} onChange={(e) => setNewAdminForm({ ...newAdminForm, email: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #334155", background: "#020617", color: "#FFF", marginBottom: "10px" }} />

              <label style={{ fontSize: "0.85rem", color: "#94A3B8" }}>Phone *</label>
              <input value={newAdminForm.phone} onChange={(e) => setNewAdminForm({ ...newAdminForm, phone: e.target.value })} required style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #334155", background: "#020617", color: "#FFF", marginBottom: "10px" }} />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <label style={{ fontSize: "0.85rem", color: "#94A3B8" }}>Society *</label>
                <button
                  type="button"
                  onClick={() => setNewAdminForm({ ...newAdminForm, create_new_society: !newAdminForm.create_new_society })}
                  style={{ background: "none", border: "none", color: "#38BDF8", fontSize: "0.8rem", cursor: "pointer", textDecoration: "underline" }}
                >
                  {newAdminForm.create_new_society ? "Select Existing" : "+ Create New Society"}
                </button>
              </div>

              {newAdminForm.create_new_society ? (
                <input
                  placeholder="Enter New Society Name *"
                  value={newAdminForm.new_society_name || ""}
                  onChange={(e) => setNewAdminForm({ ...newAdminForm, new_society_name: e.target.value })}
                  required
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #38BDF8", background: "#020617", color: "#FFF", marginBottom: "10px" }}
                />
              ) : (
                <select value={newAdminForm.society} onChange={(e) => setNewAdminForm({ ...newAdminForm, society: e.target.value })} required style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #334155", background: "#020617", color: "#FFF", marginBottom: "10px" }}>
                  <option value="">Select society</option>
                  {options.societies.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}

              <label style={{ fontSize: "0.85rem", color: "#94A3B8" }}>Password (Optional)</label>
              <input type="password" value={newAdminForm.temporary_password} onChange={(e) => setNewAdminForm({ ...newAdminForm, temporary_password: e.target.value })} placeholder="Default: Admin@123456" style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #334155", background: "#020617", color: "#FFF", marginBottom: "16px" }} />

              <div style={{ display: "flex", gap: "10px" }}>
                <button type="button" onClick={() => setActiveModal(null)} style={{ flex: 1, padding: "10px", background: "#334155", color: "#FFF", border: "none", borderRadius: "6px", cursor: "pointer" }}>CANCEL</button>
                <button type="submit" disabled={modalLoading} className="primary-button" style={{ flex: 1, padding: "10px" }}>
                  {modalLoading ? "Creating..." : "CREATE ADMIN"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REGISTER NEW SOCIETY FORM MODAL */}
      {activeModal === "REGISTER_SOCIETY" && (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyCenter: "center" }}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "min(520px, 90vw)", background: "#0F172A", border: "1px solid #1E293B", padding: "24px", borderRadius: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, color: "#F8FAFC", fontSize: "1.1rem" }}>REGISTER NEW SOCIETY</h3>
              <button type="button" onClick={() => setActiveModal(null)} style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", fontSize: "1.2rem" }}>✕</button>
            </div>
            {modalError && <div className="error-message" style={{ marginBottom: "12px", fontSize: "0.85rem" }}>{modalError}</div>}
            <form onSubmit={handleCreateSocietySubmit}>
              <h4 style={{ margin: "0 0 8px 0", color: "#38BDF8", fontSize: "0.9rem" }}>Society Details</h4>
              <label style={{ fontSize: "0.85rem", color: "#94A3B8" }}>Society Name *</label>
              <input value={newSocietyForm.name} onChange={(e) => setNewSocietyForm({ ...newSocietyForm, name: e.target.value })} required style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #334155", background: "#020617", color: "#FFF", marginBottom: "8px" }} />

              <label style={{ fontSize: "0.85rem", color: "#94A3B8" }}>Address</label>
              <input value={newSocietyForm.address} onChange={(e) => setNewSocietyForm({ ...newSocietyForm, address: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid #334155", background: "#020617", color: "#FFF", marginBottom: "8px" }} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "14px" }}>
                <div>
                  <label style={{ fontSize: "0.8rem", color: "#94A3B8" }}>City</label>
                  <input value={newSocietyForm.city} onChange={(e) => setNewSocietyForm({ ...newSocietyForm, city: e.target.value })} style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #334155", background: "#020617", color: "#FFF" }} />
                </div>
                <div>
                  <label style={{ fontSize: "0.8rem", color: "#94A3B8" }}>State</label>
                  <input value={newSocietyForm.state} onChange={(e) => setNewSocietyForm({ ...newSocietyForm, state: e.target.value })} style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #334155", background: "#020617", color: "#FFF" }} />
                </div>
                <div>
                  <label style={{ fontSize: "0.8rem", color: "#94A3B8" }}>Pincode</label>
                  <input value={newSocietyForm.pincode} onChange={(e) => setNewSocietyForm({ ...newSocietyForm, pincode: e.target.value })} style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #334155", background: "#020617", color: "#FFF" }} />
                </div>
              </div>

              <h4 style={{ margin: "12px 0 8px 0", color: "#38BDF8", fontSize: "0.9rem" }}>Initial Society Admin Details *</h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                <div>
                  <label style={{ fontSize: "0.8rem", color: "#94A3B8" }}>Admin Username *</label>
                  <input value={newSocietyForm.admin_username} onChange={(e) => setNewSocietyForm({ ...newSocietyForm, admin_username: e.target.value })} required style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #334155", background: "#020617", color: "#FFF" }} />
                </div>
                <div>
                  <label style={{ fontSize: "0.8rem", color: "#94A3B8" }}>Admin Phone *</label>
                  <input value={newSocietyForm.admin_phone} onChange={(e) => setNewSocietyForm({ ...newSocietyForm, admin_phone: e.target.value })} required style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #334155", background: "#020617", color: "#FFF" }} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                <div>
                  <label style={{ fontSize: "0.8rem", color: "#94A3B8" }}>First Name</label>
                  <input value={newSocietyForm.admin_first_name} onChange={(e) => setNewSocietyForm({ ...newSocietyForm, admin_first_name: e.target.value })} style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #334155", background: "#020617", color: "#FFF" }} />
                </div>
                <div>
                  <label style={{ fontSize: "0.8rem", color: "#94A3B8" }}>Last Name</label>
                  <input value={newSocietyForm.admin_last_name} onChange={(e) => setNewSocietyForm({ ...newSocietyForm, admin_last_name: e.target.value })} style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #334155", background: "#020617", color: "#FFF" }} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                <div>
                  <label style={{ fontSize: "0.8rem", color: "#94A3B8" }}>Email</label>
                  <input type="email" value={newSocietyForm.admin_email} onChange={(e) => setNewSocietyForm({ ...newSocietyForm, admin_email: e.target.value })} style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #334155", background: "#020617", color: "#FFF" }} />
                </div>
                <div>
                  <label style={{ fontSize: "0.8rem", color: "#94A3B8" }}>Password</label>
                  <input type="password" value={newSocietyForm.admin_password} onChange={(e) => setNewSocietyForm({ ...newSocietyForm, admin_password: e.target.value })} placeholder="Default: Admin@123456" style={{ width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid #334155", background: "#020617", color: "#FFF" }} />
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                <button type="button" onClick={() => setActiveModal(null)} style={{ flex: 1, padding: "10px", background: "#334155", color: "#FFF", border: "none", borderRadius: "6px", cursor: "pointer" }}>CANCEL</button>
                <button type="submit" disabled={modalLoading} className="primary-button" style={{ flex: 1, padding: "10px" }}>
                  {modalLoading ? "Creating..." : "CREATE SOCIETY"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADMIN & SOCIETY SUCCESS MODAL */}
      {(activeModal === "ADMIN_SUCCESS" || activeModal === "SOCIETY_SUCCESS") && (
        <div className="modal-backdrop" onClick={() => setActiveModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyCenter: "center" }}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: "min(440px, 90vw)", background: "#0F172A", border: "1px solid #10B981", padding: "24px", borderRadius: "12px", textAlign: "center" }}>
            <div style={{ color: "#10B981", fontSize: "2rem", marginBottom: "8px" }}>✓</div>
            <h3 style={{ margin: "0 0 12px 0", color: "#F8FAFC", fontSize: "1.1rem" }}>{createdCredentials.title}</h3>
            
            {createdCredentials.society && (
              <p style={{ color: "#94A3B8", fontSize: "0.9rem", margin: "0 0 8px 0" }}>
                Society: <strong style={{ color: "#F8FAFC" }}>{createdCredentials.society}</strong>
              </p>
            )}

            {createdCredentials.username ? (
              <div style={{ background: "#020617", border: "1px solid #334155", padding: "14px", borderRadius: "8px", textAlign: "left", margin: "16px 0" }}>
                <p style={{ margin: "0 0 6px 0", color: "#94A3B8", fontSize: "0.85rem" }}>
                  Username: <strong style={{ color: "#38BDF8", fontSize: "1rem" }}>{createdCredentials.username}</strong>
                </p>
                <p style={{ margin: 0, color: "#94A3B8", fontSize: "0.85rem" }}>
                  Password: <strong style={{ color: "#F59E0B", fontSize: "1rem", letterSpacing: "0.5px" }}>{createdCredentials.password}</strong>
                </p>
              </div>
            ) : (
              <p style={{ color: "#94A3B8", fontSize: "0.85rem", margin: "12px 0" }}>Society created without initial administrator.</p>
            )}

            {copyFeedback && <div style={{ color: "#10B981", fontSize: "0.85rem", marginBottom: "8px", fontWeight: "600" }}>{copyFeedback}</div>}

            <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
              {createdCredentials.username && (
                <button type="button" onClick={copyCredentials} style={{ flex: 1, padding: "10px", background: "rgba(59, 130, 246, 0.15)", color: "#60A5FA", border: "1px solid rgba(59, 130, 246, 0.3)", borderRadius: "6px", cursor: "pointer", fontWeight: "600" }}>
                  [ COPY CREDENTIALS ]
                </button>
              )}
              <button type="button" onClick={() => setActiveModal(null)} className="primary-button" style={{ flex: 1, padding: "10px" }}>
                [ DONE ]
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
