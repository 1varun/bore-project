import React from 'react';

const TopBar = ({ rigInfo = "ONGC ANK | Rig NG1500-4", mode = "DRILLER MODE" }) => {
  return (
    <div className="top-bar">
      <div className="top-bar-left">
        <div className="logo-text">BORE Project</div>
        <div className="pulse-indicator"></div>
      </div>
      
      <div className="top-bar-center">
        <div className="rig-info">
          <span className="value" style={{ fontWeight: 600, fontSize: '1.2rem', color: '#fff' }}>{rigInfo}</span>
        </div>
      </div>

      <div className="top-bar-right" style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
        <div className="mode-badge">{mode}</div>
        <div className="timestamp-box">
          {new Date().toLocaleTimeString()}
        </div>
        <div className="icons" style={{ fontSize: '1.2rem', cursor: 'pointer', display: 'flex', gap: '15px' }}>
          <span title="Settings">⚙️</span>
          <span title="User Login">👤</span>
        </div>
      </div>
    </div>
  );
};

export default TopBar;
