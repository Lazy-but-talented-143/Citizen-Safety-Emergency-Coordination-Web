import { useEffect, useState } from "react";
import api from "../../api/axios";
import RelationInput from "../RelationInput";

function EmergencyContact() {
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

  // ==================================================
  // LOAD EMERGENCY GUARDIAN
  // ==================================================

  const loadEmergencyContact = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get("guardians/");

      const guardians = Array.isArray(response.data)
        ? response.data
        : response.data.results || [];

      const primary = guardians.find(
        (item) =>
          item.guardian_type === "EMERGENCY" &&
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
          "Unable to load emergency contact."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmergencyContact();
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
  // SAVE EMERGENCY GUARDIAN
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
        guardian_type: "EMERGENCY",
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
          ? "Emergency contact updated successfully."
          : "Emergency contact added successfully."
      );

      await loadEmergencyContact();
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
        setError(messages.length > 0 ? messages.join(" | ") : "Unable to save emergency contact.");
      } else if (typeof data === "string") {
        setError(data);
      } else {
        setError("Unable to save emergency contact.");
      }
    } finally {
      setSaving(false);
    }
  };

  // ==================================================
  // DELETE EMERGENCY GUARDIAN
  // ==================================================

  const deleteGuardian = async () => {
    if (!guardian) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete the emergency contact?"
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
        "Emergency contact deleted successfully."
      );
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.detail ||
          err.response?.data?.error ||
          "Unable to delete emergency contact."
      );
    }
  };

  // ==================================================
  // LOADING
  // ==================================================

  if (loading) {
    return (
      <div className="resident-panel">
        <h2>Emergency Contact</h2>
        <p>Loading emergency contact...</p>
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
          <h2>Emergency Contact</h2>
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
            ADD EMERGENCY GUARDIAN
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
              <span className="status status-assigned">EMERGENCY</span>
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

          <p>
            <strong>Relationship Status:</strong>{" "}
            <strong style={{ color: guardian.relationship_status === "ACCEPTED" ? "#22c55e" : guardian.relationship_status === "PENDING" ? "#eab308" : "#f43f5e" }}>
              {guardian.relationship_status || (guardian.is_active ? "ACCEPTED" : "PENDING")}
            </strong>
          </p>

          <div className="guardian-actions">

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
          <h3>No Emergency Contact Added</h3>

          <p>
            Add a emergency contact so emergency
            escalation can contact them first.
          </p>

          <button
            type="button"
            className="accept-button"
            onClick={startAdd}
          >
            ADD EMERGENCY GUARDIAN
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
                ? "UPDATE EMERGENCY GUARDIAN"
                : "SAVE EMERGENCY GUARDIAN"}
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

export default EmergencyContact;