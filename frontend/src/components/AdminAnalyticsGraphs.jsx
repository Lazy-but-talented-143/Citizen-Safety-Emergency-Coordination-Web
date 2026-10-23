import React, { useState } from "react";

/**
 * Light Theme SVG Point Graph & Area Trend Chart for Daily Emergency Trend
 */
export function PointTrendGraph({ items = [] }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);

  if (!items || items.length === 0) {
    return <div className="graph-empty-state">No daily trend data recorded yet</div>;
  }

  const svgWidth = 640;
  const svgHeight = 220;
  const padLeft = 45;
  const padRight = 30;
  const padTop = 35;
  const padBottom = 40;

  const width = svgWidth - padLeft - padRight;
  const height = svgHeight - padTop - padBottom;

  const counts = items.map((i) => i.count || 0);
  const maxCount = Math.max(5, ...counts);

  const points = items.map((item, idx) => {
    const x = padLeft + (items.length > 1 ? (idx / (items.length - 1)) * width : width / 2);
    const y = padTop + height - (item.count / maxCount) * height;
    return { x, y, label: item.label, count: item.count };
  });

  // Create smooth Bezier curve line path
  let pathD = "";
  if (points.length === 1) {
    pathD = `M ${padLeft} ${points[0].y} L ${padLeft + width} ${points[0].y}`;
  } else {
    pathD = points.reduce((acc, point, i, arr) => {
      if (i === 0) return `M ${point.x} ${point.y}`;
      const prev = arr[i - 1];
      const cx = (prev.x + point.x) / 2;
      return `${acc} C ${cx} ${prev.y}, ${cx} ${point.y}, ${point.x} ${point.y}`;
    }, "");
  }

  const areaD = `${pathD} L ${points[points.length - 1].x} ${padTop + height} L ${points[0].x} ${padTop + height} Z`;

  // Grid lines
  const gridY = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    val: Math.round(maxCount * ratio),
    y: padTop + height - ratio * height,
  }));

  return (
    <div className="point-graph-container">
      <div className="graph-header-meta">
        <span className="graph-badge">
          <span className="live-dot animate-pulse"></span> Point-Line Dynamic Plot
        </span>
        <span className="graph-peak">Peak Volume: {maxCount} Incidents</span>
      </div>

      <div className="svg-wrapper">
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="point-trend-svg">
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d5bd0" stopOpacity="0.22" />
              <stop offset="60%" stopColor="#176b87" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>

            <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#0d5bd0" />
              <stop offset="50%" stopColor="#176b87" />
              <stop offset="100%" stopColor="#6d28d9" />
            </linearGradient>

            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Grid lines */}
          {gridY.map((g, i) => (
            <g key={i}>
              <line
                x1={padLeft}
                y1={g.y}
                x2={padLeft + width}
                y2={g.y}
                stroke="#e2e8f0"
                strokeDasharray="4 4"
              />
              <text x={padLeft - 10} y={g.y + 4} textAnchor="end" fill="#64748b" fontSize="10" fontWeight="600">
                {g.val}
              </text>
            </g>
          ))}

          {/* Area Fill under curve */}
          <path d={areaD} fill="url(#areaGradient)" />

          {/* Connected Line */}
          <path d={pathD} fill="none" stroke="url(#lineGradient)" strokeWidth="3.5" filter="url(#glow)" strokeLinecap="round" />

          {/* Data Points */}
          {points.map((pt, i) => {
            const isHovered = hoveredPoint === i;
            const shortDate = String(pt.label || "").slice(5) || `Day ${i + 1}`;
            return (
              <g
                key={i}
                className="graph-point-node"
                onMouseEnter={() => setHoveredPoint(i)}
                onMouseLeave={() => setHoveredPoint(null)}
                style={{ cursor: "pointer" }}
              >
                {/* Glow Ring */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? "12" : "7"}
                  fill="rgba(13, 91, 208, 0.2)"
                  className="point-pulse-ring"
                />

                {/* Point Solid Circle */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? "6" : "4.5"}
                  fill={isHovered ? "#ffffff" : "#0d5bd0"}
                  stroke={isHovered ? "#0d5bd0" : "#ffffff"}
                  strokeWidth="2.5"
                  filter="url(#glow)"
                />

                {/* Number Callout above point */}
                <text
                  x={pt.x}
                  y={pt.y - 12}
                  textAnchor="middle"
                  fill={isHovered ? "#0d5bd0" : "#1e293b"}
                  fontSize={isHovered ? "12" : "10"}
                  fontWeight="bold"
                >
                  {pt.count}
                </text>

                {/* X-axis Date label */}
                <text
                  x={pt.x}
                  y={padTop + height + 20}
                  textAnchor="middle"
                  fill={isHovered ? "#0a397d" : "#64748b"}
                  fontSize="10"
                  fontWeight={isHovered ? "bold" : "500"}
                >
                  {shortDate}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {hoveredPoint !== null && (
        <div className="graph-tooltip-banner">
          <strong>Date: {points[hoveredPoint].label}</strong>
          <span>Recorded Emergencies: <mark>{points[hoveredPoint].count}</mark></span>
        </div>
      )}
    </div>
  );
}

/**
 * Light Theme Donut/Radial Point Chart for Incident Status Breakdown
 */
export function StatusDonutGraph({ stats = {} }) {
  const pending = Number(stats.pending_emergencies || 0);
  const assigned = Number(stats.assigned_emergencies || 0);
  const inProgress = Number(stats.in_progress_emergencies || 0);
  const resolved = Number(stats.resolved_emergencies || 0);

  const total = pending + assigned + inProgress + resolved;

  const data = [
    { label: "PENDING", count: pending, color: "#d97706", glow: "rgba(217, 119, 6, 0.3)" },
    { label: "ASSIGNED", count: assigned, color: "#0284c7", glow: "rgba(2, 132, 199, 0.3)" },
    { label: "IN PROGRESS", count: inProgress, color: "#6d28d9", glow: "rgba(109, 40, 217, 0.3)" },
    { label: "RESOLVED", count: resolved, color: "#16a34a", glow: "rgba(22, 163, 74, 0.3)" },
  ];

  const size = 180;
  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;

  return (
    <div className="donut-graph-wrapper">
      <div className="donut-chart-svg-box">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="donut-svg">
          {/* Base track circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#f1f5f9"
            strokeWidth={strokeWidth}
          />

          {total > 0 &&
            data.map((item, idx) => {
              const percent = item.count / total;
              const strokeDasharray = `${percent * circumference} ${circumference}`;
              const strokeDashoffset = -accumulatedPercent * circumference;
              accumulatedPercent += percent;

              if (item.count === 0) return null;

              return (
                <circle
                  key={idx}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  style={{
                    transform: "rotate(-90deg)",
                    transformOrigin: "50% 50%",
                    transition: "stroke-dasharray 0.8s ease-in-out",
                    filter: `drop-shadow(0 2px 4px ${item.glow})`,
                  }}
                />
              );
            })}
        </svg>
        <div className="donut-center-info">
          <span className="donut-total-num">{total}</span>
          <span className="donut-total-label">Incidents</span>
        </div>
      </div>

      <div className="donut-legend-list">
        {data.map((item) => {
          const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
          return (
            <div key={item.label} className="legend-item-row">
              <div className="legend-item-head">
                <span className="legend-point-dot" style={{ backgroundColor: item.color, boxShadow: `0 0 6px ${item.color}` }}></span>
                <span className="legend-item-name">{item.label}</span>
              </div>
              <div className="legend-item-values">
                <strong>{item.count}</strong>
                <small>({pct}%)</small>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Light Theme Scatter Point Graph for Emergency Priority Severity
 */
export function PriorityPointGraph({ items = [] }) {
  const priorityConfig = {
    CRITICAL: { color: "#dc2626", bg: "#fef2f2", icon: "🚨" },
    HIGH: { color: "#ea580c", bg: "#fff7ed", icon: "⚠️" },
    MEDIUM: { color: "#ca8a04", bg: "#fefce8", icon: "⚡" },
    LOW: { color: "#16a34a", bg: "#f0fdf4", icon: "ℹ️" },
  };

  if (!items || items.length === 0) {
    return <p className="muted">No priority analytics available.</p>;
  }

  const maxVal = Math.max(1, ...items.map((i) => i.count || 0));

  return (
    <div className="priority-point-graph">
      {items.map((item) => {
        const key = String(item.label || "LOW").toUpperCase();
        const conf = priorityConfig[key] || priorityConfig.LOW;
        const pct = Math.min(100, Math.max(12, (item.count / maxVal) * 100));

        return (
          <div key={item.label} className="priority-track-row">
            <div className="priority-label-box">
              <span className="priority-icon-badge">{conf.icon}</span>
              <strong>{item.label}</strong>
            </div>

            <div className="priority-point-bar-track">
              {/* Point connection axis */}
              <div className="priority-axis-line"></div>
              
              {/* Filled progress zone */}
              <div
                className="priority-fill-zone"
                style={{ width: `${pct}%`, backgroundColor: conf.color }}
              ></div>

              {/* Point Node Circle */}
              <div
                className="priority-point-node"
                style={{
                  left: `${pct}%`,
                  borderColor: conf.color,
                  boxShadow: `0 2px 8px ${conf.color}44`,
                }}
              >
                <div className="priority-inner-dot" style={{ backgroundColor: conf.color }}></div>
              </div>
            </div>

            <div className="priority-count-badge" style={{ color: conf.color, backgroundColor: conf.bg, border: `1px solid ${conf.color}33` }}>
              {item.count}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Light Theme Point Bar / Dot Plot Chart for Emergency Types
 */
export function TypePointGraph({ items = [] }) {
  if (!items || items.length === 0) {
    return <p className="muted">No emergency type data recorded.</p>;
  }

  const maxVal = Math.max(1, ...items.map((i) => i.count || 0));

  const getTypeIcon = (name) => {
    const n = String(name).toLowerCase();
    if (n.includes("medical")) return "🚑";
    if (n.includes("fire")) return "🔥";
    if (n.includes("security") || n.includes("theft")) return "🛡️";
    if (n.includes("lift") || n.includes("elevator")) return "🛗";
    if (n.includes("water") || n.includes("flood")) return "💧";
    return "🚨";
  };

  return (
    <div className="type-point-chart">
      {items.map((item) => {
        const pct = Math.min(100, Math.max(10, (item.count / maxVal) * 100));
        const formattedLabel = String(item.label || "General").replaceAll("_", " ");
        const icon = getTypeIcon(formattedLabel);

        return (
          <div key={item.label} className="type-point-row">
            <div className="type-label-meta">
              <span className="type-icon">{icon}</span>
              <span className="type-title">{formattedLabel}</span>
            </div>

            <div className="type-track-container">
              <div className="type-track-bg"></div>
              <div className="type-track-fill" style={{ width: `${pct}%` }}></div>
              <div className="type-point-head" style={{ left: `${pct}%` }}>
                <span className="type-point-dot"></span>
              </div>
            </div>

            <div className="type-count-pill">{item.count}</div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Light Theme Block Scatter Point Graph
 */
export function BlockPointGraph({ items = [] }) {
  if (!items || items.length === 0) {
    return <p className="muted">No block incident data recorded.</p>;
  }

  const maxVal = Math.max(1, ...items.map((i) => i.count || 0));

  return (
    <div className="block-point-grid">
      {items.map((item) => {
        const pct = Math.min(100, Math.max(15, (item.count / maxVal) * 100));
        return (
          <div key={item.label} className="block-point-card">
            <div className="block-card-header">
              <strong>{item.label || "Unmapped"}</strong>
              <span className="block-node-dot animate-pulse"></span>
            </div>
            <div className="block-count-display">{item.count} <small>Incidents</small></div>
            <div className="block-mini-track">
              <div className="block-mini-fill" style={{ width: `${pct}%` }}></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
