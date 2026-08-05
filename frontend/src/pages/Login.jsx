import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";

function Login() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await api.post("login/", {
        username,
        password,
      });

      localStorage.setItem("access", response.data.access);
      localStorage.setItem("refresh", response.data.refresh);

      const profile = await api.get("profile/");

      localStorage.setItem(
        "user",
        JSON.stringify(profile.data)
      );

      navigate("/dashboard");
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.detail ||
          "Unable to login. Check username and password."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="logo">CS</div>

        <h1>Citizen Safety</h1>

        <p className="subtitle">
          Emergency Coordination Platform
        </p>

        <form onSubmit={handleLogin}>
          <label>Username</label>

          <input
            type="text"
            value={username}
            onChange={(e) =>
              setUsername(e.target.value)
            }
            placeholder="Enter username"
            required
          />

          <label>Password</label>

          <input
            type="password"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            placeholder="Enter password"
            required
          />

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button
            className="primary-button"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;