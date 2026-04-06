import React from 'react';

/**
 * TimeAxis - The vertical timeline labels.
 * We add padding to the top and bottom containers to ensure
 * the labels align exactly with the chart data boundaries in ECharts.
 */
const TimeAxis = ({ times, topPadding = 10, bottomPadding = 8 }) => {
  return (
    <div className="time-axis">
      {/* Spacer matching the chart's upper legend/x-axis area */}
      <div style={{ height: topPadding }} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        {times.map((time, idx) => (
          <div key={idx} className="time-label">
            {time}
          </div>
        ))}
      </div>

      {/* Spacer matching the chart's bottom boundary */}
      <div style={{ height: bottomPadding }} />
    </div>
  );
};

export default TimeAxis;
