import { useEffect, useState } from "react";
import api from "../../api/axios";
import RelationInput from "../RelationInput";

function PrimaryGuardian() {
  const [guardian, setGuardian] = useState(null);

  const [form, setForm] = useState({
    name: "",
    relation: "",
    phone: "",
    email: "",
    address: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // OTP Verification States
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);

  const handleSendGuardianOtp = async () => {
    if (!guardian?.id) return;
    setOtpLoading(true); setError(""); setMessage("");
    try {
      const res = await api.post(`guardians/${guardian.id}/send_otp/`);
      setOtpSent(true);
      if (res.data.otp_code) {
        setMessage(`OTP sent to guardian phone! (Test OTP: ${res.data.otp_code})`);
        setOtpCode(res.data.otp_code);
      } else {
        setMessage(`OTP sent to ${guardian.phone}.`);
      }
    } catch (err) {
      setError(err.response?.data?.error || "Failed to send OTP to guardian.");
    } finally { setOtpLoading(false); }
  };

  const handleVerifyGuardianOtp = async () => {
    if (!guardian?.id || !otpCode) return;
    setOtpLoading(true); setError(""); setMessage("");
    try {
      const res = await api.post(`guardians/${guardian.id}/verify_otp/`, { otp_code: otpCode });
      setMessage("Guardian phone number verified via OTP successfully! ✓");
      setGuardian(res.data.guardian || { ...guardian, is_verified: true });
      setOtpSent(false); setOtpCode("");
    } catch (err) {
      setError(err.response?.data?.error || "Invalid OTP code for guardian.");
    } finally { setOtpLoading(false); }
  };


  // ==================================================
  // LOAD PRIMARY GUARDIAN
  // ==================================================

  const loadPrimaryGuardian = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get("guardians/");

      const guardians = Array.isArray(response.data)
        ? response.data
        : response.data.results || [];

      const primary = guardians.find(
        (item) =>
          item.guardian_type === "PRIMARY" &&
          item.is_active !== false
      );

      if (primary) {
        setGuardian(primary);

        setForm({
          name: primary.name || "",
          relation: primary.relation || "",
          phone: primary.phone || "",
          email: primary.email || "",
          address: primary.address || "",
        });
      } else {
        setGuardian(null);

        setForm({
          name: "",
          relation: "",
          phone: "",
          email: "",
          address: "",
        });
      }
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.detail ||
          err.response?.data?.error ||
          "Unable to load primary guardian."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrimaryGuardian();
  }, []);

  // ==================================================
  // FORM CHANGE
  // ==================================================

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  // ==================================================
  // START ADD
  // ==================================================

  const startAdd = () => {
    setMessage("");
    setError("");

    setForm({
      name: "",
      relation: "",
      phone: "",
      email: "",
      address: "",
    });

    setEditing(true);
  };

  // ==================================================
  // START EDIT
  // ==================================================

  const startEdit = () => {
    if (!guardian) return;

    setMessage("");
    setError("");

    setForm({
      name: guardian.name || "",
      relation: guardian.relation || "",
      phone: guardian.phone || "",
      email: guardian.email || "",
      address: guardian.address || "",
    });

    setEditing(true);
  };

  // ==================================================
  // CANCEL EDIT
  // ==================================================

  const cancelEdit = () => {
    setEditing(false);
    setMessage("");
    setError("");

    if (guardian) {
      setForm({
        name: guardian.name || "",
        relation: guardian.relation || "",
        phone: guardian.phone || "",
        email: guardian.email || "",
        address: guardian.address || "",
      });
    }
  };

  // ==================================================
  // SAVE PRIMARY GUARDIAN
  // ==================================================

  const handleSubmit = async (event) => {
    event.preventDefault();

    setMessage("");
    setError("");

    if (!form.name.trim()) {
      setError("Guardian name is required.");
      return;
    }

    if (!form.relation.trim()) {
      setError("Relation is required.");
      return;
    }

    if (!form.phone.trim()) {
      setError("Phone number is required.");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        name: form.name.trim(),
        relation: form.relation.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        guardian_type: "PRIMARY",
      };

      let response;

      if (guardian) {
        response = await api.patch(
          `guardians/${guardian.id}/`,
          payload
        );
      } else {
        response = await api.post(
          "guardians/",
          payload
        );
      }

      setGuardian(response.data);

      setForm({
        name: response.data.name || "",
        relation: response.data.relation || "",
        phone: response.data.phone || "",
        email: response.data.email || "",
        address: response.data.address || "",
      });

      setEditing(false);

      setMessage(
        guardian
          ? "Primary guardian updated successfully."
          : "Primary guardian added successfully."
      );

      await loadPrimaryGuardian();
    } catch (err) {
      console.error(err);
      const data = err.response?.data;
      if (typeof data === "object" && data !== null) {
        const messages = [];
        for (const [key, val] of Object.entries(data)) {
          const field = key === "non_field_errors" || key === "detail" || key === "error" ? "" : `${key.replace(/_/g, " ")}: `;
          const msg = Array.isArray(val) ? val.join(", ") : String(val);
          messages.push(`${field}${msg}`);
        }
        setError(messages.length > 0 ? messages.join(" | ") : "Unable to save primary guardian.");
      } else if (typeof data === "string") {
        setError(data);
      } else {
        setError("Unable to save primary guardian.");
      }
    } finally {
      setSaving(false);
    }
  };

  // ==================================================
  // DELETE PRIMARY GUARDIAN
  // ==================================================

  const deleteGuardian = async () => {
    if (!guardian) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete the primary guardian?"
    );

    if (!confirmed) return;

    try {
      setError("");
      setMessage("");

      await api.delete(
        `guardians/${guardian.id}/`
      );

      setGuardian(null);

      setForm({
        name: "",
        relation: "",
        phone: "",
        email: "",
        address: "",
      });

      setEditing(false);

      setMessage(
        "Primary guardian deleted successfully."
      );
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.detail ||
          err.response?.data?.error ||
          "Unable to delete primary guardian."
      );
    }
  };

  // ==================================================
  // LOADING
  // ==================================================

  if (loading) {
    return (
      <div className="resident-panel">
        <h2>Primary Guardian</h2>
        <p>Loading primary guardian...</p>
      </div>
    );
  }

  // ==================================================
  // VIEW
  // ==================================================

  return (
    <div className="resident-panel">

      <div className="guardian-header">
        <div>
          <h2>Primary Guardian</h2>
          <p>
            Main contact person for emergency escalation.
          </p>
        </div>

        {!editing && !guardian && (
          <button
            type="button"
            className="accept-button"
            onClick={startAdd}
          >
            ADD PRIMARY GUARDIAN
          </button>
        )}
      </div>

      {message && (
        <div className="success-message">
          {message}
        </div>
      )}

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {!editing && guardian && (
        <div className="emergency-item">

          <div className="emergency-top">
            <h3>{guardian.name}</h3>

            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <span className="status status-assigned">PRIMARY</span>
              <span className={`verification-badge ${(guardian.relationship_status || (guardian.is_active ? 'ACCEPTED' : 'PENDING')).toLowerCase()}`}>
                {guardian.relationship_status || (guardian.is_active ? 'ACCEPTED' : 'PENDING')}
              </span>
            </div>
          </div>

          <p>
            <strong>Relation:</strong>{" "}
            {guardian.relation}
          </p>

          <p>
            <strong>Phone:</strong>{" "}
            {guardian.phone}
          </p>

          {guardian.email && (
            <p>
              <strong>Email:</strong>{" "}
              {guardian.email}
            </p>
          )}

          {guardian.address && (
            <p>
              <strong>Address:</strong>{" "}
              {guardian.address}
            </p>
          )}

          <p style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <strong>Phone Verification:</strong>{" "}
            {guardian.is_verified ? (
              <span style={{ background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: "6px", fontSize: "0.8rem", fontWeight: "700" }}>✓ Phone Verified via OTP</span>
            ) : (
              <span style={{ background: "#fef3c7", color: "#92400e", padding: "2px 8px", borderRadius: "6px", fontSize: "0.8rem", fontWeight: "700" }}>Unverified Phone</span>
            )}
          </p>

          {otpSent && !guardian.is_verified && (
            <div style={{ background: "#f8fafc", padding: "10px", borderRadius: "8px", border: "1px solid #cbd5e1", marginTop: "8px", marginBottom: "8px" }}>
              <label style={{ fontSize: "0.8rem", fontWeight: "600", color: "#475569" }}>Enter OTP code sent to guardian phone:</label>
              <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                <input
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="e.g. 123456"
                  style={{ flex: 1, padding: "6px 10px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.9rem", fontWeight: "bold", letterSpacing: "1px" }}
                />
                <button
                  type="button"
                  onClick={handleVerifyGuardianOtp}
                  disabled={otpLoading || !otpCode}
                  style={{ background: "#16a34a", color: "#fff", border: "none", padding: "6px 14px", borderRadius: "6px", fontWeight: "600", cursor: "pointer", fontSize: "0.82rem" }}
                >
                  {otpLoading ? "Verifying..." : "Verify OTP"}
                </button>
              </div>
            </div>
          )}

          <div className="guardian-actions">
            {!guardian.is_verified && !otpSent && (
              <button
                type="button"
                className="accept-button"
                onClick={handleSendGuardianOtp}
                disabled={otpLoading}
                style={{ background: "#0284c7" }}
              >
                {otpLoading ? "Sending OTP..." : "SEND OTP TO VERIFY"}
              </button>
            )}

            <button
              type="button"
              className="assistance-button"
              onClick={startEdit}
            >
              EDIT
            </button>

            <button
              type="button"
              className="cancel-button delete-guardian-button"
              onClick={deleteGuardian}
              style={{ background: "#dc2626", color: "#ffffff", border: "none", borderRadius: "8px", padding: "10px 18px", fontWeight: "700", cursor: "pointer", margin: 0 }}
            >
              {guardian.relationship_status === "PENDING" ? "CANCEL REQUEST" : "REMOVE / REVOKE"}
            </button>

          </div>

        </div>
      )}

      {!editing && !guardian && (
        <div className="emergency-item">
          <h3>No Primary Guardian Added</h3>

          <p>
            Add a primary guardian so emergency
            escalation can contact them first.
          </p>

          <button
            type="button"
            className="accept-button"
            onClick={startAdd}
          >
            ADD PRIMARY GUARDIAN
          </button>
        </div>
      )}

      {editing && (
        <form
          className="guardian-form"
          onSubmit={handleSubmit}
        >

          <div className="form-group">
            <label>Name</label>

            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Enter guardian name"
              required
            />
          </div>

          <div className="form-group">
            <label>Relation</label>
            <RelationInput
              value={form.relation}
              onChange={(val) => setForm((prev) => ({ ...prev, relation: val }))}
            />
          </div>

          <div className="form-group">
            <label>Phone</label>

            <input
              type="tel"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              placeholder="Enter phone number"
              required
            />
          </div>

          <div className="form-group">
            <label>Email</label>

            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="Enter email address"
            />
          </div>

          <div className="form-group">
            <label>Address</label>

            <textarea
              name="address"
              value={form.address}
              onChange={handleChange}
              placeholder="Enter guardian address"
              rows="3"
            />
          </div>

          <div className="guardian-actions">

            <button
              type="submit"
              className="accept-button"
              disabled={saving}
            >
              {saving
                ? "SAVING..."
                : guardian
                ? "UPDATE PRIMARY GUARDIAN"
                : "SAVE PRIMARY GUARDIAN"}
            </button>

            <button
              type="button"
              className="cancel-button"
              onClick={cancelEdit}
              disabled={saving}
            >
              CANCEL
            </button>

          </div>

        </form>
      )}

    </div>
  );
}

export default PrimaryGuardian;