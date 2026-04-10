import React from 'react';

const LiveStatBox = ({ tag = "NONE", value = null, unit = "--", onSelect, isConnected = true }) => {
  // If disconnected or value is not yet received, display "---"
  const parsed = value != null ? parseFloat(value) : NaN;
  const displayValue = !isConnected || value == null || isNaN(parsed) ? "---" : parsed.toFixed(1);

  return (
    <div className="stat-box" onClick={onSelect}>
      <div className="stat-label" title={tag}>
        {tag}
        <span className="unit">{unit}</span>
      </div>
      <div className="stat-value">{displayValue}</div>
      <div className="click-hint">CLICK TO CHANGE</div>
    </div>
  );
};

export default LiveStatBox;
