import React from 'react';

const TimeAxis = ({ times }) => {
  return (
    <div className="time-axis">
      {times.map((time, idx) => (
        <div key={idx} className="time-label">
          {time}
        </div>
      ))}
    </div>
  );
};

export default TimeAxis;
