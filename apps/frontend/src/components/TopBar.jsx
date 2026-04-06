import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const TopBar = ({ rigInfo = "ONGC ANK | Rig NG1500-4", mode = "DRILLER MODE" }) => {
  const navigate = useNavigate();
  const [time, setTime] = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="top-bar">
      <div className="top-bar-left">
        <div className="logo-text">BORE<span style={{ color: 'hsl(var(--accent-primary))' }}>.</span></div>
        <div className="pulse-indicator"></div>
      </div>

      <div className="top-bar-center">
        <div className="rig-info">
          <span className="value" style={{ fontWeight: 600, fontSize: '1.1rem', color: '#fff' }}>{rigInfo}</span>
        </div>
      </div>

      <div className="top-bar-right" style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        <div className="mode-badge">{mode}</div>
        <div className="timestamp-box">{time}</div>
        <div className="icons" style={{ fontSize: '1.1rem', cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            className="icon-btn"
            title="Maintenance Dashboard"
            onClick={() => navigate('/maintenance')}
          >
            🛠️
          </button>
          <button
            className="icon-btn"
            title="Running Hours"
            onClick={() => navigate('/hours')}
          >
            ⌛
          </button>
          <button
            className="icon-btn"
            title="Transmission Settings"
            onClick={() => navigate('/settings')}
          >
            ⚙️
          </button>
          <button className="icon-btn" title="User Login">👤</button>
        </div>
      </div>
    </div>
  );
};

export default TopBar;
