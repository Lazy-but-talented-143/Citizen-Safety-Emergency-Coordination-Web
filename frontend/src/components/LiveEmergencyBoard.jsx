import React, { useState, useMemo } from "react";

/**
 * Interactive Professional Live Emergency Board for Admin Operations
 */
export default function LiveEmergencyBoard({ emergencies = [], loadAdmin, dateText, cancelEmergency, resolveEmergency }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (loadAdmin) await loadAdmin();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Filtered emergency list based on search, status, and priority
  const filteredEmergencies = useMemo(() => {
    return emergencies.filter((e) => {
      const matchStatus = statusFilter === "ALL" || String(e.status).toUpperCase() === statusFilter;
      const matchPriority = priorityFilter === "ALL" || String(e.priority).toUpperCase() === priorityFilter;

      const term = searchTerm.trim().toLowerCase();
      const searchableText = `${e.id} ${e.emergency_type || ""} ${e.location || ""} ${e.requester_name || e.requester_username || ""} ${e.status || ""} ${e.priority || ""}`.toLowerCase();
      const matchSearch = !term || searchableText.includes(term);

      return matchStatus && matchPriority && matchSearch;
    });
  }, [emergencies, statusFilter, priorityFilter, searchTerm]);

  // Pagination logic
  const totalItems = filteredEmergencies.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const paginatedEmergencies = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEmergencies.slice(start, start + pageSize);
  }, [filteredEmergencies, currentPage, pageSize]);

  // Helper for priority badges
  const getPriorityBadge = (priority) => {
    const p = String(priority || "LOW").toUpperCase();
    switch (p) {
      case "CRITICAL":
        return <span className="live-priority-badge critical">🚨 CRITICAL</span>;
      case "HIGH":
        return <span className="live-priority-badge high">⚠️ HIGH</span>;
      case "MEDIUM":
        return <span className="live-priority-badge medium">⚡ MEDIUM</span>;
      default:
        return <span className="live-priority-badge low">ℹ️ LOW</span>;
    }
  };

  // Helper for status badges
  const getStatusBadge = (status) => {
    const s = String(status || "PENDING").toUpperCase();
    switch (s) {
      case "PENDING":
        return <span className="live-status-badge pending"><span className="pulse-dot"></span> PENDING</span>;
      case "ASSIGNED":
        return <span className="live-status-badge assigned">ASSIGNED</span>;
      case "IN_PROGRESS":
      case "IN PROGRESS":
        return <span className="live-status-badge in-progress"><span className="pulse-dot active"></span> IN PROGRESS</span>;
      case "RESOLVED":
        return <span className="live-status-badge resolved">✓ RESOLVED</span>;
      case "CANCELLED":
        return <span className="live-status-badge cancelled">CANCELLED</span>;
      case "AUTO_CLOSED":
        return <span className="live-status-badge auto-closed">AUTO CLOSED</span>;
      default:
        return <span className="live-status-badge">{s}</span>;
    }
  };

  // Type Icon helper
  const getTypeIcon = (typeStr) => {
    const t = String(typeStr || "").toLowerCase();
    if (t.includes("medical")) return "🚑";
    if (t.includes("fire")) return "🔥";
    if (t.includes("security") || t.includes("theft")) return "🛡️";
    if (t.includes("lift") || t.includes("elevator")) return "🛗";
    if (t.includes("water") || t.includes("flood")) return "💧";
    return "🚨";
  };

  return (
    <div className="interactive-live-board">
      {/* Header with Live Pulse Indicator & Quick Refresh */}
      <div className="live-board-header">
        <div>
          <div className="live-board-title-row">
            <h2>Live Emergency Operations Board</h2>
            <span className="live-stream-tag">
              <span className="stream-pulse-dot"></span> LIVE MONITORING
            </span>
          </div>
          <p>Real-time incident response tracking across your scope.</p>
        </div>

        <div className="live-board-actions">
          <button
            type="button"
            className={`secondary-action-button refresh-live-btn ${isRefreshing ? "spinning" : ""}`}
            onClick={handleRefresh}
          >
            <span className="refresh-icon">🔄</span> REFRESH BOARD
          </button>
        </div>
      </div>

      {/* Control Bar: Live Search & Filters */}
      <div className="live-board-controls">
        <div className="live-search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search by ID, Resident, Type, Location..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
          {searchTerm && (
            <button className="clear-search-btn" onClick={() => setSearchTerm("")}>✕</button>
          )}
        </div>

        {/* Quick Filter Group */}
        <div className="live-filter-group">
          <div className="filter-select-wrapper">
            <label>STATUS:</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All Statuses ({emergencies.length})</option>
              <option value="PENDING">PENDING</option>
              <option value="ASSIGNED">ASSIGNED</option>
              <option value="IN_PROGRESS">IN PROGRESS</option>
              <option value="RESOLVED">RESOLVED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>

          <div className="filter-select-wrapper">
            <label>PRIORITY:</label>
            <select
              value={priorityFilter}
              onChange={(e) => {
                setPriorityFilter(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="ALL">All Priorities</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>
        </div>
      </div>

      {/* Active Filter Pills Indicator */}
      {(statusFilter !== "ALL" || priorityFilter !== "ALL" || searchTerm) && (
        <div className="active-filters-bar">
          <small>Active Filters:</small>
          {statusFilter !== "ALL" && (
            <span className="filter-pill">Status: {statusFilter} <button onClick={() => setStatusFilter("ALL")}>✕</button></span>
          )}
          {priorityFilter !== "ALL" && (
            <span className="filter-pill">Priority: {priorityFilter} <button onClick={() => setPriorityFilter("ALL")}>✕</button></span>
          )}
          {searchTerm && (
            <span className="filter-pill">Query: "{searchTerm}" <button onClick={() => setSearchTerm("")}>✕</button></span>
          )}
          <button className="reset-all-btn" onClick={() => { setStatusFilter("ALL"); setPriorityFilter("ALL"); setSearchTerm(""); }}>
            Reset All
          </button>
        </div>
      )}

      {/* Interactive Emergencies Table */}
      {paginatedEmergencies.length === 0 ? (
        <div className="live-board-empty">
          <div className="empty-icon">🚨</div>
          <h3>No matching incidents found</h3>
          <p>Try adjusting your search query or filter criteria.</p>
        </div>
      ) : (
        <div className="table-scroll-container">
          <table className="interactive-emergency-table">
            <thead>
              <tr>
                <th>INCIDENT ID</th>
                <th>RESIDENT</th>
                <th>CATEGORY / TYPE</th>
                <th>LOCATION</th>
                <th>PRIORITY</th>
                <th>STATUS</th>
                <th>TIMESTAMP</th>
                <th className="text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {paginatedEmergencies.map((e) => {
                const isSelected = selectedIncident?.id === e.id;
                const formattedType = String(e.emergency_type || "SOS").replaceAll("_", " ");
                const icon = getTypeIcon(e.emergency_type);

                return (
                  <tr
                    key={e.id}
                    className={`emergency-row-item ${isSelected ? "row-selected" : ""}`}
                    onClick={() => setSelectedIncident(e)}
                  >
                    <td className="cell-id">
                      <strong>#{e.id}</strong>
                    </td>

                    <td className="cell-resident">
                      <div className="resident-user-meta">
                        <span className="avatar-icon">👤</span>
                        <div>
                          <strong>{e.requester_name || e.requester_username || `Resident #${e.user}`}</strong>
                          {e.requester_phone && <small>📞 {e.requester_phone}</small>}
                        </div>
                      </div>
                    </td>

                    <td className="cell-type">
                      <div className="type-badge-chip">
                        <span>{icon}</span>
                        <strong>{formattedType}</strong>
                      </div>
                    </td>

                    <td className="cell-location">
                      <span className="location-text">📍 {e.location || "Unspecified"}</span>
                      {e.block && <small className="block-flat-sub">{e.block} {e.flat ? `· Flat ${e.flat}` : ""}</small>}
                    </td>

                    <td className="cell-priority">
                      {getPriorityBadge(e.priority)}
                    </td>

                    <td className="cell-status">
                      {getStatusBadge(e.status)}
                    </td>

                    <td className="cell-time">
                      <span className="time-text">{dateText ? dateText(e.created_at) : new Date(e.created_at).toLocaleString()}</span>
                    </td>

                    <td className="cell-actions text-right" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        className="inspect-btn"
                        onClick={() => setSelectedIncident(e)}
                      >
                        INSPECT 🔍
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer */}
      <div className="live-board-pagination">
        <div className="pagination-info">
          Showing <strong>{Math.min(totalItems, (currentPage - 1) * pageSize + 1)}</strong> to{" "}
          <strong>{Math.min(totalItems, currentPage * pageSize)}</strong> of <strong>{totalItems}</strong> incidents
        </div>

        <div className="pagination-controls">
          <label>Rows:</label>
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>

          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="page-nav-btn"
          >
            ◄ Prev
          </button>

          <span className="page-indicator">{currentPage} / {totalPages}</span>

          <button
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="page-nav-btn"
          >
            Next ►
          </button>
        </div>
      </div>

      {/* Sleek Incident Detail Inspector Modal */}
      {selectedIncident && (
        <div className="modal-backdrop" onClick={() => setSelectedIncident(null)}>
          <div className="modal-card incident-inspector-modal" onClick={(e) => e.stopPropagation()}>
            <div className="inspector-modal-header">
              <div className="inspector-title-row">
                <span className="modal-icon">{getTypeIcon(selectedIncident.emergency_type)}</span>
                <div>
                  <h2>Emergency #{selectedIncident.id}</h2>
                  <p>{String(selectedIncident.emergency_type || "SOS").replaceAll("_", " ")} Alert</p>
                </div>
              </div>
              <button className="cancel-button close-modal-btn" onClick={() => setSelectedIncident(null)}>✕ CLOSE</button>
            </div>

            <div className="inspector-modal-body">
              {/* Top Banner Status & Priority */}
              <div className="inspector-status-banner">
                <div>
                  <small>CURRENT STATUS</small>
                  <div>{getStatusBadge(selectedIncident.status)}</div>
                </div>
                <div>
                  <small>PRIORITY LEVEL</small>
                  <div>{getPriorityBadge(selectedIncident.priority)}</div>
                </div>
                <div>
                  <small>REPORTED TIME</small>
                  <strong>{dateText ? dateText(selectedIncident.created_at) : new Date(selectedIncident.created_at).toLocaleString()}</strong>
                </div>
              </div>

              {/* Grid Information Details */}
              <div className="inspector-details-grid">
                <div className="detail-info-block">
                  <label>👤 Resident Details</label>
                  <strong>{selectedIncident.requester_name || selectedIncident.requester_username || `Resident #${selectedIncident.user}`}</strong>
                  {selectedIncident.requester_phone && <span>📞 Phone: {selectedIncident.requester_phone}</span>}
                  {selectedIncident.user_email && <span>✉️ Email: {selectedIncident.user_email}</span>}
                </div>

                <div className="detail-info-block">
                  <label>📍 Location &amp; Unit</label>
                  <strong>{selectedIncident.location || "Unspecified location"}</strong>
                  {selectedIncident.block && <span>Block/Tower: {selectedIncident.block}</span>}
                  {selectedIncident.flat && <span>Flat: {selectedIncident.flat}</span>}
                  {selectedIncident.latitude && selectedIncident.longitude && (
                    <a
                      className="map-open-link"
                      href={`https://www.openstreetmap.org/?mlat=${selectedIncident.latitude}&mlon=${selectedIncident.longitude}#map=18/${selectedIncident.latitude}/${selectedIncident.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      🗺️ View Live Coordinates on Map
                    </a>
                  )}
                </div>

                <div className="detail-info-block">
                  <label>🛡️ Responder Assignment</label>
                  <strong>{selectedIncident.responder_name || selectedIncident.responder_username || "Unassigned"}</strong>
                  {selectedIncident.responder_role && <span>Role: {selectedIncident.responder_role}</span>}
                  {selectedIncident.responder_phone && <span>Phone: {selectedIncident.responder_phone}</span>}
                </div>
              </div>

              {/* Description / Additional Notes if any */}
              {selectedIncident.description && (
                <div className="detail-notes-box">
                  <label>📝 Incident Description / Notes</label>
                  <p>{selectedIncident.description}</p>
                </div>
              )}
            </div>

            {/* Modal Actions Footer */}
            <div className="inspector-modal-footer">
              <div className="left-footer-meta">
                <small>Society Scope: {selectedIncident.society_name || "Platform Scope"}</small>
              </div>

              <div className="right-footer-actions">
                {selectedIncident.latitude && selectedIncident.longitude && (
                  <a
                    className="secondary-action-button"
                    href={`https://www.openstreetmap.org/?mlat=${selectedIncident.latitude}&mlon=${selectedIncident.longitude}#map=18/${selectedIncident.latitude}/${selectedIncident.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    OPEN MAP
                  </a>
                )}

                {resolveEmergency && ["PENDING", "ASSIGNED", "IN_PROGRESS"].includes(String(selectedIncident.status).toUpperCase()) && (
                  <button
                    className="accept-button resolve-emergency-btn"
                    onClick={async () => {
                      await resolveEmergency(selectedIncident.id);
                      setSelectedIncident(null);
                    }}
                  >
                    RESOLVE INCIDENT
                  </button>
                )}

                {cancelEmergency && ["PENDING", "ASSIGNED"].includes(String(selectedIncident.status).toUpperCase()) && (
                  <button
                    className="cancel-button"
                    onClick={() => {
                      cancelEmergency(selectedIncident.id);
                      setSelectedIncident(null);
                    }}
                  >
                    CANCEL INCIDENT
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
