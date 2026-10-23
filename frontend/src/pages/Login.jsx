import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/axios";

function Login() {
  const navigate = useNavigate();
  const [loginMode, setLoginMode] = useState("PASSWORD"); // 'PASSWORD' | 'OTP'
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  
  // OTP States
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpMessage, setOtpMessage] = useState("");

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      localStorage.removeItem("access");
      localStorage.removeItem("refresh");
      localStorage.removeItem("user");

      let response;
      if (loginMode === "PASSWORD") {
        response = await api.post("login/", {
          username: username.trim(),
          password,
        });
      } else {
        response = await api.post("otp/login/", {
          phone: phone.trim(),
          otp_code: otpCode.trim(),
        });
      }

      if (!response.data?.access || !response.data?.refresh) {
        throw new Error("Login succeeded but tokens were not returned.");
      }

      localStorage.setItem("access", response.data.access);
      localStorage.setItem("refresh", response.data.refresh);

      const profile = await api.get("profile/");
      localStorage.setItem("user", JSON.stringify(profile.data));

      navigate("/dashboard");
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        err.response?.data?.error ||
        err.message ||
        "Unable to login. Please check your credentials."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async () => {
    if (!phone.trim()) {
      setError("Please enter phone number.");
      return;
    }
    setError(""); setOtpMessage(""); setLoading(true);
    try {
      const res = await api.post("otp/send/", { phone, purpose: "LOGIN" });
      setOtpSent(true);
      if (res.data.otp_code) {
        setOtpMessage(`OTP sent! (Test OTP: ${res.data.otp_code})`);
        setOtpCode(res.data.otp_code);
      } else {
        setOtpMessage("OTP sent to your registered phone number.");
      }
    } catch (err) {
      setError(err.response?.data?.error || "Failed to send OTP.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="logo">CS</div>
        <h1>Citizen Safety</h1>
        <p className="subtitle">Emergency Coordination Platform</p>

        {/* Login Method Toggle */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px", background: "#f1f5f9", padding: "4px", borderRadius: "8px" }}>
          <button
            type="button"
            onClick={() => { setLoginMode("PASSWORD"); setError(""); setOtpMessage(""); }}
            style={{
              flex: 1,
              padding: "8px",
              border: "none",
              borderRadius: "6px",
              background: loginMode === "PASSWORD" ? "#176b87" : "transparent",
              color: loginMode === "PASSWORD" ? "#fff" : "#64748b",
              fontWeight: "600",
              cursor: "pointer",
              fontSize: "0.85rem"
            }}
          >
            Password Login
          </button>
          <button
            type="button"
            onClick={() => { setLoginMode("OTP"); setError(""); setOtpMessage(""); }}
            style={{
              flex: 1,
              padding: "8px",
              border: "none",
              borderRadius: "6px",
              background: loginMode === "OTP" ? "#176b87" : "transparent",
              color: loginMode === "OTP" ? "#fff" : "#64748b",
              fontWeight: "600",
              cursor: "pointer",
              fontSize: "0.85rem"
            }}
          >
            Phone OTP Login
          </button>
        </div>

        <form onSubmit={handleLogin}>
          {loginMode === "PASSWORD" ? (
            <>
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                required
              />

              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
              />
            </>
          ) : (
            <>
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
                    style={{ letterSpacing: "2px", fontWeight: "bold" }}
                  />
                </>
              )}
            </>
          )}

          {error && <div className="error-message">{error}</div>}
          {otpMessage && <div className="success-message" style={{ marginBottom: "12px", fontSize: "0.85rem" }}>{otpMessage}</div>}

          <button type="submit" className="primary-button" disabled={loading || (loginMode === "OTP" && !otpSent)}>
            {loading ? "Processing..." : loginMode === "PASSWORD" ? "Login" : "Login with OTP"}
          </button>

          <div className="login-links">
            <Link to="/register">Register new user</Link>
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Login;

