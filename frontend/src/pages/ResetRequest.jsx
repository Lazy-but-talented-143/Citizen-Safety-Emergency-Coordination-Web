import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

export default function ResetRequest() {
  const [resetMethod, setResetMethod] = useState("EMAIL"); // 'EMAIL' | 'OTP'
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setMessage(""); setError(""); setLoading(true);
    try {
      const r = await api.post("password-reset/", { email, frontend_url: `${window.location.origin}/reset-password` });
      setMessage(r.data.message || "If the email exists, a reset message has been sent.");
    } catch (x) {
      setError(x.response?.data?.error || "Unable to send reset request.");
    } finally { setLoading(false); }
  };

  const handleSendOtp = async () => {
    if (!phone.trim()) {
      setError("Please enter phone number.");
      return;
    }
    setError(""); setMessage(""); setLoading(true);
    try {
      const res = await api.post("otp/send/", { phone, purpose: "RESET" });
      setOtpSent(true);
      if (res.data.otp_code) {
        setMessage(`OTP sent! (Test OTP: ${res.data.otp_code})`);
        setOtpCode(res.data.otp_code);
      } else {
        setMessage("OTP sent to your registered phone number.");
      }
    } catch (err) {
      setError(err.response?.data?.error || "Failed to send OTP.");
    } finally { setLoading(false); }
  };

  const handleOtpResetSubmit = async (e) => {
    e.preventDefault();
    setError(""); setMessage(""); setLoading(true);
    try {
      const res = await api.post("otp/reset-password/", {
        phone: phone.trim(),
        otp_code: otpCode.trim(),
        new_password: newPassword
      });
      setMessage(res.data.message || "Password reset successfully via OTP. You can now login.");
    } catch (err) {
      setError(err.response?.data?.error || "Failed to reset password using OTP.");
    } finally { setLoading(false); }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="logo">CS</div>
        <h1>Reset Password</h1>
        <p className="subtitle">Citizen Safety account recovery</p>

        {/* Mode Selector */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px", background: "#f1f5f9", padding: "4px", borderRadius: "8px" }}>
          <button
            type="button"
            onClick={() => { setResetMethod("EMAIL"); setError(""); setMessage(""); }}
            style={{
              flex: 1, padding: "8px", border: "none", borderRadius: "6px",
              background: resetMethod === "EMAIL" ? "#176b87" : "transparent",
              color: resetMethod === "EMAIL" ? "#fff" : "#64748b",
              fontWeight: "600", cursor: "pointer", fontSize: "0.85rem"
            }}
          >
            Email Link
          </button>
          <button
            type="button"
            onClick={() => { setResetMethod("OTP"); setError(""); setMessage(""); }}
            style={{
              flex: 1, padding: "8px", border: "none", borderRadius: "6px",
              background: resetMethod === "OTP" ? "#176b87" : "transparent",
              color: resetMethod === "OTP" ? "#fff" : "#64748b",
              fontWeight: "600", cursor: "pointer", fontSize: "0.85rem"
            }}
          >
            Phone OTP
          </button>
        </div>

        {resetMethod === "EMAIL" ? (
          <form onSubmit={handleEmailSubmit}>
            <label>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your registered email"
              required
            />
            {error && <div className="error-message">{error}</div>}
            {message && <div className="success-message">{message}</div>}
            <button className="primary-button" disabled={loading}>
              {loading ? "Sending..." : "SEND RESET EMAIL"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtpResetSubmit}>
            <label>Phone Number</label>
            <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Enter registered phone number"
                required
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={loading || !phone}
                style={{
                  background: "#176b87", color: "#fff", border: "none",
                  padding: "8px 14px", borderRadius: "8px", fontWeight: "600",
                  cursor: "pointer", fontSize: "0.85rem", whiteSpace: "nowrap"
                }}
              >
                {loading ? "Sending..." : otpSent ? "Resend OTP" : "Send OTP"}
              </button>
            </div>

            {otpSent && (
              <>
                <label>6-Digit OTP Code</label>
                <input
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="Enter OTP (e.g. 123456)"
                  required
                  style={{ letterSpacing: "2px", fontWeight: "bold", marginBottom: "10px" }}
                />

                <label>New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Choose new password"
                  required
                  style={{ marginBottom: "12px" }}
                />
              </>
            )}

            {error && <div className="error-message">{error}</div>}
            {message && <div className="success-message">{message}</div>}

            <button type="submit" className="primary-button" disabled={loading || !otpSent}>
              {loading ? "Resetting..." : "RESET PASSWORD VIA OTP"}
            </button>
          </form>
        )}

        <p className="auth-link" style={{ marginTop: "16px" }}>
          <Link to="/login">Back to Login</Link>
        </p>
      </div>
    </div>
  );
}

