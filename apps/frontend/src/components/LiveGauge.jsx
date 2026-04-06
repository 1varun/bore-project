import React from 'react';

const LiveGauge = ({ title, value, unit }) => {
    return (
        <div className="glass-card">
            <div className="metric-title">{title}</div>
            <div className="metric-value">
                {value !== null && value !== undefined ? Number(value).toFixed(2) : '--'}
                <span className="metric-unit">{unit}</span>
            </div>
        </div>
    );
};

export default LiveGauge;
