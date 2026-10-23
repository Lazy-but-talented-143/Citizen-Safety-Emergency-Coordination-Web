import { useEffect, useState } from "react";

const PRESET_RELATIONS = [
  "Father",
  "Mother",
  "Brother",
  "Sister",
  "Spouse",
  "Son",
  "Daughter",
  "Friend",
  "Neighbour",
  "Trusted Person",
  "Other",
];

export default function RelationInput({ value = "", onChange }) {
  const [selectedOption, setSelectedOption] = useState(() => {
    if (!value) return "Father";
    if (PRESET_RELATIONS.includes(value) && value !== "Other") return value;
    return "Other";
  });

  const [customRelation, setCustomRelation] = useState(() => {
    if (!value) return "";
    if (PRESET_RELATIONS.includes(value) && value !== "Other") return "";
    return value;
  });

  useEffect(() => {
    if (!value) {
      return;
    }
    if (PRESET_RELATIONS.includes(value) && value !== "Other") {
      setSelectedOption(value);
    } else {
      setSelectedOption("Other");
      setCustomRelation(value);
    }
  }, [value]);

  const handleSelectChange = (e) => {
    const opt = e.target.value;
    setSelectedOption(opt);
    if (opt !== "Other") {
      onChange(opt);
    } else {
      onChange(customRelation.trim());
    }
  };

  const handleCustomChange = (e) => {
    const text = e.target.value;
    setCustomRelation(text);
    onChange(text);
  };

  return (
    <div className="relation-input-group" style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <select
        value={selectedOption}
        onChange={handleSelectChange}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: "6px",
          border: "1px solid #cfd9e8",
          background: "#ffffff",
          color: "#0f172a",
          fontSize: "0.95rem"
        }}
      >
        {PRESET_RELATIONS.map((opt) => (
          <option key={opt} value={opt} style={{ background: "#ffffff", color: "#0f172a" }}>
            {opt}
          </option>
        ))}
      </select>

      {selectedOption === "Other" && (
        <input
          type="text"
          value={customRelation}
          onChange={handleCustomChange}
          placeholder="Enter custom relation (e.g. Uncle, Cousin...)"
          required
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: "6px",
            border: "1px solid #0d5bd0",
            background: "#ffffff",
            color: "#0f172a",
            fontSize: "0.95rem"
          }}
        />
      )}
    </div>
  );
}
