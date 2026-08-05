import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";

function Dashboard() {
  const navigate = useNavigate();

  const user = JSON.parse(localStorage.getItem("user") || "{}");

  // ==================================================
  // COMMON STATE
  // ==================================================

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // ==================================================
  // RESIDENT STATE
  // ==================================================

  const [location, setLocation] = useState("");
  const [emergencies, setEmergencies] = useState([]);
  const [notifications, setNotifications] = useState([]);

  const [showSOS, setShowSOS] = useState(false);
  const [showEmergencies, setShowEmergencies] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const [loadingSOS, setLoadingSOS] = useState(false);

  // ==================================================
  // VOLUNTEER STATE
  // ==================================================

  const [volunteerStatus, setVolunteerStatus] = useState(
    user.volunteer_status || "OFFLINE"
  );

  const [volunteerEmergencies, setVolunteerEmergencies] = useState([]);
  const [volunteerNotifications, setVolunteerNotifications] = useState([]);

  const [showAvailability, setShowAvailability] = useState(false);
  const [showVolunteerIncidents, setShowVolunteerIncidents] =
    useState(false);
  const [showVolunteerNotifications, setShowVolunteerNotifications] =
    useState(false);

  // ==================================================
  // SECURITY STATE
  // ==================================================

  const [securityEmergencies, setSecurityEmergencies] = useState([]);
  const [showSecurityEmergencies, setShowSecurityEmergencies] = useState(false);

  // ==================================================
  // ADMIN STATE
  // ==================================================

  const [adminEmergencies, setAdminEmergencies] = useState([]);
  const [adminSocieties, setAdminSocieties] = useState([]);

  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  const [showAdminSocieties, setShowAdminSocieties] = useState(false);
  const [showAdminEmergencies, setShowAdminEmergencies] = useState(false);

  const [adminStats, setAdminStats] = useState({
    total: 0,
    pending: 0,
    assigned: 0,
    inProgress: 0,
    resolved: 0,
  });

  // ==================================================
  // LOGOUT
  // ==================================================

  const logout = () => {
    localStorage.clear();
    navigate("/login");
  };
  

  // ==================================================
  // RESIDENT - LOAD EMERGENCIES
  // ==================================================

  const loadEmergencies = async () => {
    try {
      const response = await api.get("emergencies/");
      setEmergencies(response.data);
      setError("");
    } catch (err) {
      console.error(err);
      setError("Unable to load emergencies.");
    }
  };

  // ==================================================
  // RESIDENT - LOAD NOTIFICATIONS
  // ==================================================

  const loadNotifications = async () => {
    try {
      const response = await api.get("notifications/");
      setNotifications(response.data);
      setError("");
    } catch (err) {
      console.error(err);
      setError("Unable to load notifications.");
    }
  };

  // ==================================================
  // RESIDENT - SEND SOS
  // ==================================================

  const sendSOS = async () => {
    if (!location.trim()) {
      setError("Please enter your emergency location.");
      return;
    }

    try {
      setLoadingSOS(true);
      setError("");
      setMessage("");

      const response = await api.post("sos/", {
        location: location,
      });

      setMessage(
        `SOS sent successfully. Emergency ID: ${response.data.emergency_id}`
      );

      setLocation("");

      await loadEmergencies();
      await loadNotifications();
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.error ||
          err.response?.data?.detail ||
          "Unable to send SOS."
      );
    } finally {
      setLoadingSOS(false);
    }
  };

  // ==================================================
  // VOLUNTEER - UPDATE STATUS
  // ==================================================

  const updateVolunteerStatus = async (newStatus) => {
    try {
      setError("");
      setMessage("");

      const response = await api.patch(
        "profile/volunteer-status/",
        {
          volunteer_status: newStatus,
        }
      );

      setVolunteerStatus(response.data.volunteer_status);

      setMessage(
        `Volunteer status changed to ${response.data.volunteer_status}.`
      );

      const updatedUser = {
        ...user,
        volunteer_status: response.data.volunteer_status,
      };

      localStorage.setItem(
        "user",
        JSON.stringify(updatedUser)
      );
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.error ||
          err.response?.data?.detail ||
          "Unable to update volunteer status."
      );
    }
  };

  // ==================================================
  // VOLUNTEER - LOAD INCIDENTS
  // ==================================================

  const loadVolunteerEmergencies = async () => {
    try {
      setError("");

      const response = await api.get("emergencies/");
      setVolunteerEmergencies(response.data);
    } catch (err) {
      console.error(err);

      setError("Unable to load volunteer incidents.");
    }
  };

  // ==================================================
  // VOLUNTEER - LOAD NOTIFICATIONS
  // ==================================================

  const loadVolunteerNotifications = async () => {
    try {
      setError("");

      const response = await api.get("notifications/");
      setVolunteerNotifications(response.data);
    } catch (err) {
      console.error(err);

      setError("Unable to load volunteer notifications.");
    }
  };

  // ==================================================
  // VOLUNTEER - ACCEPT EMERGENCY
  // ==================================================

  const acceptEmergency = async (emergencyId) => {
    try {
      setError("");
      setMessage("");

      const response = await api.patch(
        `emergencies/${emergencyId}/accept/`
      );

      setMessage(
        `Emergency #${response.data.emergency_id} accepted successfully.`
      );

      setVolunteerStatus("BUSY");

      const updatedUser = {
        ...user,
        volunteer_status: "BUSY",
      };

      localStorage.setItem(
        "user",
        JSON.stringify(updatedUser)
      );

      await loadVolunteerEmergencies();
      await loadVolunteerNotifications();
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.error ||
          err.response?.data?.detail ||
          "Unable to accept emergency."
      );
    }
  };

  // ==================================================
  // VOLUNTEER - START ASSISTANCE
  // ==================================================

  const startAssistance = async (emergencyId) => {
    try {
      setError("");
      setMessage("");

      const response = await api.patch(
        `emergencies/${emergencyId}/start-assistance/`
      );

      setMessage(
        `Assistance started for Emergency #${response.data.emergency_id}.`
      );

      await loadVolunteerEmergencies();
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.error ||
          err.response?.data?.detail ||
          "Unable to start assistance."
      );
    }
  };

  // ==================================================
  // SECURITY - LOAD EMERGENCIES
  // ==================================================

  const loadSecurityEmergencies = async () => {
    try {
      setError("");

      const response = await api.get("emergencies/");
      setSecurityEmergencies(response.data);
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.detail ||
          "Unable to load security emergencies."
      );
    }
  };

  // ==================================================
  // SECURITY - RESOLVE EMERGENCY
  // ==================================================

  const resolveEmergency = async (emergencyId) => {
    try {
      setError("");
      setMessage("");

      await api.patch(
        `emergencies/${emergencyId}/resolve/`
      );

      setMessage(
        `Emergency #${emergencyId} resolved successfully.`
      );

      await loadSecurityEmergencies();
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.error ||
          err.response?.data?.detail ||
          "Unable to resolve emergency."
      );
    }
  };

  // ==================================================
  // ADMIN - LOAD EMERGENCIES
  // ==================================================

  const loadAdminEmergencies = async () => {
    try {
      setError("");

      const response = await api.get("emergencies/");

      const data = response.data;

      setAdminEmergencies(data);

      setAdminStats({
        total: data.length,
        pending: data.filter(
          (item) => item.status === "PENDING"
        ).length,
        assigned: data.filter(
          (item) => item.status === "ASSIGNED"
        ).length,
        inProgress: data.filter(
          (item) => item.status === "IN_PROGRESS"
        ).length,
        resolved: data.filter(
          (item) => item.status === "RESOLVED"
        ).length,
      });
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.detail ||
          "Unable to load admin emergencies."
      );
    }
  };

  // ==================================================
  // ADMIN - LOAD SOCIETIES
  // ==================================================

  const loadAdminSocieties = async () => {
    try {
      setError("");

      const response = await api.get("societies/");

      setAdminSocieties(response.data);
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.detail ||
          "Unable to load societies."
      );
    }
  };

  // ==================================================
  // ADMIN - RESOLVE EMERGENCY
  // ==================================================

  const adminResolveEmergency = async (emergencyId) => {
    try {
      setError("");
      setMessage("");

      await api.patch(
        `emergencies/${emergencyId}/resolve/`
      );

      setMessage(
        `Emergency #${emergencyId} resolved successfully.`
      );

      await loadAdminEmergencies();
    } catch (err) {
      console.error(err);

      setError(
        err.response?.data?.error ||
          err.response?.data?.detail ||
          "Unable to resolve emergency."
      );
    }
  };

  // ==================================================
  // INITIAL DATA
  // ==================================================

  useEffect(() => {
    if (user.role === "RESIDENT") {
      loadEmergencies();
      loadNotifications();
    }

    if (user.role === "VOLUNTEER") {
      loadVolunteerEmergencies();
      loadVolunteerNotifications();
    }

    if (user.role === "SECURITY") {
      loadSecurityEmergencies();
    }

    if (user.role === "ADMIN") {
      loadAdminEmergencies();
      loadAdminSocieties();
    }
  }, []);

  // ==================================================
  // ROLE MESSAGE
  // ==================================================

  const getRoleMessage = () => {
    switch (user.role) {
      case "ADMIN":
        return "Manage societies, residents and emergencies.";

      case "RESIDENT":
        return "Report emergencies and track your requests.";

      case "SECURITY":
        return "Monitor and coordinate emergency incidents.";

      case "VOLUNTEER":
        return "Respond to incidents and provide assistance.";

      default:
        return "Citizen Safety Platform";
    }
  };

  return (
    <div className="dashboard">

      {/* NAVBAR */}

      <header className="navbar">
        <div>
          <h2>Citizen Safety</h2>
          <span>Emergency Coordination Platform</span>
        </div>

        <button
          className="logout-button"
          onClick={logout}
        >
          Logout
        </button>
      </header>

      <main className="dashboard-content">

        {/* WELCOME */}

        <div className="welcome-card">
          <p>WELCOME</p>

          <h1>
            {user.first_name || user.username}
          </h1>

          <span className="role-badge">
            {user.role}
          </span>

          <h3>{getRoleMessage()}</h3>
        </div>

        {/* MESSAGES */}

        {message && (
          <div className="success-message">
            {message}
          </div>
        )}

        {error && (
          <div className="error-message dashboard-message">
            {error}
          </div>
        )}

        {/* ==================================================
            RESIDENT
        ================================================== */}

        {user.role === "RESIDENT" && (
          <>
            <div className="cards">

              <div
                className="feature-card emergency-card"
                onClick={() => {
                  setShowSOS(true);
                  setShowEmergencies(false);
                  setShowNotifications(false);
                  setMessage("");
                  setError("");
                }}
              >
                <div className="feature-icon">
                  SOS
                </div>

                <h2>Emergency SOS</h2>

                <p>
                  Send an immediate emergency alert.
                </p>
              </div>

              <div
                className="feature-card"
                onClick={() => {
                  setShowSOS(false);
                  setShowEmergencies(true);
                  setShowNotifications(false);

                  loadEmergencies();
                }}
              >
                <div className="feature-icon">
                  !
                </div>

                <h2>My Emergencies</h2>

                <p>
                  Track your emergency requests.
                </p>
              </div>

              <div
                className="feature-card"
                onClick={() => {
                  setShowSOS(false);
                  setShowEmergencies(false);
                  setShowNotifications(true);

                  loadNotifications();
                }}
              >
                <div className="feature-icon">
                  N
                </div>

                <h2>Notifications</h2>

                <p>
                  View emergency updates.
                </p>
              </div>

            </div>

            {/* SOS PANEL */}

            {showSOS && (
              <div className="resident-panel">

                <h2>Emergency SOS</h2>

                <p>
                  Enter your current location and send an
                  emergency alert.
                </p>

                <input
                  type="text"
                  value={location}
                  onChange={(e) =>
                    setLocation(e.target.value)
                  }
                  placeholder="Example: Block A, Flat 101"
                  className="location-input"
                />

                <button
                  className="sos-button"
                  onClick={sendSOS}
                  disabled={loadingSOS}
                >
                  {loadingSOS
                    ? "Sending..."
                    : "SEND SOS"}
                </button>

              </div>
            )}

            {/* RESIDENT EMERGENCIES */}

            {showEmergencies && (
              <div className="resident-panel">

                <h2>My Emergencies</h2>

                {emergencies.length === 0 ? (
                  <p>No emergencies found.</p>
                ) : (
                  <div className="emergency-list">

                    {emergencies.map((emergency) => (
                      <div
                        className="emergency-item"
                        key={emergency.id}
                      >

                        <div className="emergency-top">

                          <h3>
                            Emergency #{emergency.id}
                          </h3>

                          <span
                            className={`status status-${emergency.status.toLowerCase()}`}
                          >
                            {emergency.status}
                          </span>

                        </div>

                        <p>
                          <strong>Type:</strong>{" "}
                          {emergency.emergency_type}
                        </p>

                        <p>
                          <strong>Location:</strong>{" "}
                          {emergency.location}
                        </p>

                        <p>
                          <strong>Description:</strong>{" "}
                          {emergency.description}
                        </p>

                        <p>
                          <strong>Created:</strong>{" "}
                          {new Date(
                            emergency.created_at
                          ).toLocaleString()}
                        </p>

                        {emergency.assistance_started_at && (
                          <p>
                            <strong>
                              Assistance Started:
                            </strong>{" "}
                            {new Date(
                              emergency.assistance_started_at
                            ).toLocaleString()}
                          </p>
                        )}

                        {emergency.resolved_at && (
                          <p>
                            <strong>Resolved:</strong>{" "}
                            {new Date(
                              emergency.resolved_at
                            ).toLocaleString()}
                          </p>
                        )}

                      </div>
                    ))}

                  </div>
                )}

              </div>
            )}

            {/* RESIDENT NOTIFICATIONS */}

            {showNotifications && (
              <div className="resident-panel">

                <h2>Notifications</h2>

                {notifications.length === 0 ? (
                  <p>No notifications found.</p>
                ) : (
                  <div className="notification-list">

                    {notifications.map((notification) => (
                      <div
                        className="notification-item"
                        key={notification.id}
                      >

                        <h3>
                          {notification.title}
                        </h3>

                        <p>
                          {notification.message}
                        </p>

                        <small>
                          {new Date(
                            notification.created_at
                          ).toLocaleString()}
                        </small>

                      </div>
                    ))}

                  </div>
                )}

              </div>
            )}
          </>
        )}

        {/* ==================================================
            VOLUNTEER
        ================================================== */}

        {user.role === "VOLUNTEER" && (
          <>
            <div className="cards">

              <div
                className="feature-card"
                onClick={() => {
                  setShowAvailability(true);
                  setShowVolunteerIncidents(false);
                  setShowVolunteerNotifications(false);
                  setMessage("");
                  setError("");
                }}
              >
                <div className="feature-icon">
                  A
                </div>

                <h2>Availability</h2>

                <p>
                  Current Status:{" "}
                  <strong>{volunteerStatus}</strong>
                </p>
              </div>

              <div
                className="feature-card emergency-card"
                onClick={() => {
                  setShowAvailability(false);
                  setShowVolunteerIncidents(true);
                  setShowVolunteerNotifications(false);

                  loadVolunteerEmergencies();
                }}
              >
                <div className="feature-icon">
                  !
                </div>

                <h2>Incidents</h2>

                <p>
                  Accept and respond to emergencies.
                </p>
              </div>

              <div
                className="feature-card"
                onClick={() => {
                  setShowAvailability(false);
                  setShowVolunteerIncidents(false);
                  setShowVolunteerNotifications(true);

                  loadVolunteerNotifications();
                }}
              >
                <div className="feature-icon">
                  N
                </div>

                <h2>Notifications</h2>

                <p>
                  View new incident alerts.
                </p>
              </div>

            </div>

            {/* VOLUNTEER AVAILABILITY */}

            {showAvailability && (
              <div className="resident-panel">

                <h2>Volunteer Availability</h2>

                <p>
                  Current Status:{" "}
                  <strong>{volunteerStatus}</strong>
                </p>

                <div className="volunteer-buttons">

                  <button
                    className="available-button"
                    onClick={() =>
                      updateVolunteerStatus("AVAILABLE")
                    }
                  >
                    AVAILABLE
                  </button>

                  <button
                    className="busy-button"
                    onClick={() =>
                      updateVolunteerStatus("BUSY")
                    }
                  >
                    BUSY
                  </button>

                  <button
                    className="offline-button"
                    onClick={() =>
                      updateVolunteerStatus("OFFLINE")
                    }
                  >
                    OFFLINE
                  </button>

                </div>

              </div>
            )}

            {/* VOLUNTEER INCIDENTS */}

            {showVolunteerIncidents && (
              <div className="resident-panel">

                <h2>Emergency Incidents</h2>

                {volunteerEmergencies.length === 0 ? (
                  <p>No incidents available.</p>
                ) : (
                  <div className="emergency-list">

                    {volunteerEmergencies.map(
                      (emergency) => (
                        <div
                          className="emergency-item"
                          key={emergency.id}
                        >

                          <div className="emergency-top">

                            <h3>
                              Emergency #{emergency.id}
                            </h3>

                            <span
                              className={`status status-${emergency.status.toLowerCase()}`}
                            >
                              {emergency.status}
                            </span>

                          </div>

                          <p>
                            <strong>Type:</strong>{" "}
                            {emergency.emergency_type}
                          </p>

                          <p>
                            <strong>Location:</strong>{" "}
                            {emergency.location}
                          </p>

                          <p>
                            <strong>Description:</strong>{" "}
                            {emergency.description}
                          </p>

                          <p>
                            <strong>Created:</strong>{" "}
                            {new Date(
                              emergency.created_at
                            ).toLocaleString()}
                          </p>

                          {emergency.status === "PENDING" && (
                            <button
                              className="accept-button"
                              onClick={() =>
                                acceptEmergency(
                                  emergency.id
                                )
                              }
                            >
                              ACCEPT EMERGENCY
                            </button>
                          )}

                          {emergency.status === "ASSIGNED" &&
                            emergency.assigned_volunteer ===
                              user.id && (
                              <button
                                className="assistance-button"
                                onClick={() =>
                                  startAssistance(
                                    emergency.id
                                  )
                                }
                              >
                                START ASSISTANCE
                              </button>
                            )}

                          {emergency.assistance_started_at && (
                            <p>
                              <strong>
                                Assistance Started:
                              </strong>{" "}
                              {new Date(
                                emergency.assistance_started_at
                              ).toLocaleString()}
                            </p>
                          )}

                        </div>
                      )
                    )}

                  </div>
                )}

              </div>
            )}

            {/* VOLUNTEER NOTIFICATIONS */}

            {showVolunteerNotifications && (
              <div className="resident-panel">

                <h2>Volunteer Notifications</h2>

                {volunteerNotifications.length === 0 ? (
                  <p>No notifications available.</p>
                ) : (
                  <div className="notification-list">

                    {volunteerNotifications.map(
                      (notification) => (
                        <div
                          className="notification-item"
                          key={notification.id}
                        >

                          <h3>
                            {notification.title}
                          </h3>

                          <p>
                            {notification.message}
                          </p>

                          <small>
                            {new Date(
                              notification.created_at
                            ).toLocaleString()}
                          </small>

                        </div>
                      )
                    )}

                  </div>
                )}

              </div>
            )}

          </>
        )}

        {/* ==================================================
            SECURITY
        ================================================== */}

        {user.role === "SECURITY" && (
          <>
            <div className="cards">

              {/* SECURITY INCIDENTS */}

              <div
                className="feature-card emergency-card"
                onClick={() => {
                  setShowSecurityEmergencies(true);
                  setMessage("");
                  setError("");
                  loadSecurityEmergencies();
                }}
              >
                <div className="feature-icon">
                  !
                </div>

                <h2>Emergency Incidents</h2>

                <p>
                  Monitor incidents in your society.
                </p>
              </div>

              {/* RESPONDER ASSIGNMENT */}

              <div className="feature-card">
                <div className="feature-icon">
                  A
                </div>

                <h2>Responder Assignment</h2>

                <p>
                  Assign emergency responders.
                </p>
              </div>

            </div>

            {/* SECURITY EMERGENCY PANEL */}

            {showSecurityEmergencies && (
              <div className="resident-panel">

                <h2>Emergency Incidents</h2>

                {securityEmergencies.length === 0 ? (
                  <p>No emergencies found.</p>
                ) : (
                  <div className="emergency-list">

                    {securityEmergencies.map(
                      (emergency) => (
                        <div
                          className="emergency-item"
                          key={emergency.id}
                        >

                          <div className="emergency-top">

                            <h3>
                              Emergency #{emergency.id}
                            </h3>

                            <span
                              className={`status status-${emergency.status.toLowerCase()}`}
                            >
                              {emergency.status}
                            </span>

                          </div>

                          <p>
                            <strong>Type:</strong>{" "}
                            {emergency.emergency_type}
                          </p>

                          <p>
                            <strong>Location:</strong>{" "}
                            {emergency.location}
                          </p>

                          <p>
                            <strong>Description:</strong>{" "}
                            {emergency.description}
                          </p>

                          <p>
                            <strong>Created:</strong>{" "}
                            {new Date(
                              emergency.created_at
                            ).toLocaleString()}
                          </p>

                          {emergency.assigned_volunteer && (
                            <p>
                              <strong>
                                Assigned Volunteer ID:
                              </strong>{" "}
                              {emergency.assigned_volunteer}
                            </p>
                          )}

                          {emergency.assistance_started_at && (
                            <p>
                              <strong>
                                Assistance Started:
                              </strong>{" "}
                              {new Date(
                                emergency.assistance_started_at
                              ).toLocaleString()}
                            </p>
                          )}

                          {emergency.resolved_at && (
                            <p>
                              <strong>
                                Resolved:
                              </strong>{" "}
                              {new Date(
                                emergency.resolved_at
                              ).toLocaleString()}
                            </p>
                          )}

                          {/* SECURITY CAN RESOLVE
                              ONLY IN-PROGRESS INCIDENTS */}

                          {emergency.status === "IN_PROGRESS" && (
                            <button
                              className="resolve-button"
                              onClick={() =>
                                resolveEmergency(
                                  emergency.id
                                )
                              }
                            >
                              RESOLVE EMERGENCY
                            </button>
                          )}

                        </div>
                      )
                    )}

                  </div>
                )}

              </div>
            )}

          </>
        )}

{/* ==================================================
    ADMIN
================================================== */}

{user.role === "ADMIN" && (
  <>
    {/* ADMIN CARDS */}

    <div className="cards">

      {/* ADMIN DASHBOARD */}

      <div
        className="feature-card"
        onClick={() => {
          setShowAdminDashboard(true);
          setShowAdminSocieties(false);
          setShowAdminEmergencies(false);

          setMessage("");
          setError("");

          loadAdminEmergencies();
        }}
      >
        <div className="feature-icon">
          D
        </div>

        <h2>Admin Dashboard</h2>

        <p>
          View platform statistics.
        </p>
      </div>

      {/* SOCIETIES */}

      <div
        className="feature-card"
        onClick={() => {
          setShowAdminDashboard(false);
          setShowAdminSocieties(true);
          setShowAdminEmergencies(false);

          setMessage("");
          setError("");

          loadAdminSocieties();
        }}
      >
        <div className="feature-icon">
          S
        </div>

        <h2>Societies</h2>

        <p>
          View registered societies.
        </p>
      </div>

      {/* EMERGENCIES */}

      <div
        className="feature-card emergency-card"
        onClick={() => {
          setShowAdminDashboard(false);
          setShowAdminSocieties(false);
          setShowAdminEmergencies(true);

          setMessage("");
          setError("");

          loadAdminEmergencies();
        }}
      >
        <div className="feature-icon">
          !
        </div>

        <h2>Emergencies</h2>

        <p>
          Monitor all emergency incidents.
        </p>
      </div>

    </div>

    {/* ==================================================
        ADMIN DASHBOARD
    ================================================== */}

    {showAdminDashboard && (
      <div className="resident-panel">

        <h2>Platform Statistics</h2>

        <div className="admin-stats">

          <div className="stat-card">
            <h3>Total Emergencies</h3>
            <h1>{adminStats.total}</h1>
          </div>

          <div className="stat-card">
            <h3>Pending</h3>
            <h1>{adminStats.pending}</h1>
          </div>

          <div className="stat-card">
            <h3>Assigned</h3>
            <h1>{adminStats.assigned}</h1>
          </div>

          <div className="stat-card">
            <h3>In Progress</h3>
            <h1>{adminStats.inProgress}</h1>
          </div>

          <div className="stat-card">
            <h3>Resolved</h3>
            <h1>{adminStats.resolved}</h1>
          </div>

        </div>

      </div>
    )}

    {/* ==================================================
        ADMIN SOCIETIES
    ================================================== */}

    {showAdminSocieties && (
      <div className="resident-panel">

        <h2>Registered Societies</h2>

        {adminSocieties.length === 0 ? (
          <p>No societies found.</p>
        ) : (
          <div className="emergency-list">

            {adminSocieties.map((society) => (
              <div
                className="emergency-item"
                key={society.id}
              >
                <h3>
                  {society.name || `Society #${society.id}`}
                </h3>

                {society.address && (
                  <p>
                    <strong>Address:</strong>{" "}
                    {society.address}
                  </p>
                )}

                {society.city && (
                  <p>
                    <strong>City:</strong>{" "}
                    {society.city}
                  </p>
                )}

                <p>
                  <strong>Society ID:</strong>{" "}
                  {society.id}
                </p>
              </div>
            ))}

          </div>
        )}

      </div>
    )}

    {/* ==================================================
        ADMIN EMERGENCIES
    ================================================== */}

    {showAdminEmergencies && (
      <div className="resident-panel">

        <h2>All Emergencies</h2>

        {adminEmergencies.length === 0 ? (
          <p>No emergencies found.</p>
        ) : (
          <div className="emergency-list">

            {adminEmergencies.map((emergency) => (
              <div
                className="emergency-item"
                key={emergency.id}
              >

                <div className="emergency-top">

                  <h3>
                    Emergency #{emergency.id}
                  </h3>

                  <span
                    className={`status status-${emergency.status.toLowerCase()}`}
                  >
                    {emergency.status}
                  </span>

                </div>

                <p>
                  <strong>Type:</strong>{" "}
                  {emergency.emergency_type}
                </p>

                <p>
                  <strong>Location:</strong>{" "}
                  {emergency.location}
                </p>

                <p>
                  <strong>Description:</strong>{" "}
                  {emergency.description}
                </p>

                <p>
                  <strong>Resident ID:</strong>{" "}
                  {emergency.user}
                </p>

                {emergency.assigned_volunteer && (
                  <p>
                    <strong>Volunteer ID:</strong>{" "}
                    {emergency.assigned_volunteer}
                  </p>
                )}

                {emergency.assigned_security && (
                  <p>
                    <strong>Security ID:</strong>{" "}
                    {emergency.assigned_security}
                  </p>
                )}

                <p>
                  <strong>Created:</strong>{" "}
                  {new Date(
                    emergency.created_at
                  ).toLocaleString()}
                </p>

                {emergency.assistance_started_at && (
                  <p>
                    <strong>
                      Assistance Started:
                    </strong>{" "}
                    {new Date(
                      emergency.assistance_started_at
                    ).toLocaleString()}
                  </p>
                )}

                {emergency.resolved_at && (
                  <p>
                    <strong>Resolved:</strong>{" "}
                    {new Date(
                      emergency.resolved_at
                    ).toLocaleString()}
                  </p>
                )}

                {emergency.status === "IN_PROGRESS" && (
                  <button
                    className="resolve-button"
                    onClick={() =>
                      adminResolveEmergency(
                        emergency.id
                      )
                    }
                  >
                    RESOLVE EMERGENCY
                  </button>
                )}

              </div>
            ))}

          </div>
        )}

      </div>
    )}

  </>
)}

      </main>
    </div>
  );
}

export default Dashboard;