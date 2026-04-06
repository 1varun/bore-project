import React, { useEffect, useState } from 'react';

/**
 * Settings Component - Transmission Configuration
 * Manages WITSML and Modbus dynamic settings.
 */
const Settings = ({ onClose }) => {
    const [configs, setConfigs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('http://localhost:3000/api/config')
            .then(res => res.json())
            .then(json => {
                if (json.success) setConfigs(json.data);
                setLoading(false);
            })
            .catch(err => console.error("[API] Load Config Error:", err));
    }, []);

    const updateConfig = (service_name, is_enabled, settingsObj) => {
        const item = configs.find(c => c.service_name === service_name);
        const settings = settingsObj || item.settings;

        fetch('http://localhost:3000/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ service_name, is_enabled, settings })
        })
        .then(res => res.json())
        .then(json => {
            if (json.success) {
                setConfigs(prev => prev.map(c => c.service_name === service_name ? json.data : c));
            }
        })
        .catch(err => console.error("[API] Update Config Error:", err));
    };

    if (loading) return <div className="metric-card"><p>Loading system configuration...</p></div>;

    const witsml = configs.find(c => c.service_name === 'witsml') || { is_enabled: false, settings: {} };
    const modbus = configs.find(c => c.service_name === 'modbus') || { is_enabled: false, settings: {} };

    return (
        <div className="content-fade-in">
            <header className="header">
                <h2 className="secondary-title">Transmission Control Center</h2>
                <button className="btn-primary" onClick={onClose}>Back to Dashboard</button>
            </header>
            
            <div className="metrics-layout">
                {/* WITSML Controller */}
                <div className="metric-card" style={{ height: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>WITSML Gateway</h3>
                        <div className={`live-badge ${!witsml.is_enabled ? 'danger' : ''}`} style={{ 
                            background: witsml.is_enabled ? 'hsla(var(--accent-primary), 0.1)' : 'hsla(var(--accent-danger), 0.1)',
                            color: witsml.is_enabled ? 'hsl(var(--accent-primary))' : 'hsl(var(--accent-danger))',
                            borderColor: witsml.is_enabled ? 'hsla(var(--accent-primary), 0.3)' : 'hsla(var(--accent-danger), 0.3)'
                        }}>
                            {witsml.is_enabled ? 'Online' : 'Offline'}
                        </div>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label className="metric-label">Well Name</label>
                            <input 
                                type="text" 
                                className="input-field"
                                value={witsml.settings.wellName || ''} 
                                onChange={(e) => {
                                    const next = configs.map(c => c.service_name === 'witsml' ? { ...c, settings: { ...c.settings, wellName: e.target.value } } : c);
                                    setConfigs(next);
                                }}
                            />
                        </div>
                        <button className="btn-primary" style={{ marginTop: '1rem' }} onClick={() => updateConfig('witsml', witsml.is_enabled, witsml.settings)}>
                            Sync WITSML Configuration
                        </button>
                        <button 
                            className="btn-secondary" 
                            style={{ 
                                background: 'transparent', 
                                border: '1px solid hsla(var(--accent-danger), 0.4)', 
                                color: 'hsl(var(--accent-danger))',
                                padding: '10px',
                                borderRadius: '12px',
                                cursor: 'pointer'
                            }}
                            onClick={() => updateConfig('witsml', !witsml.is_enabled)}
                        >
                            {witsml.is_enabled ? 'Stop Service' : 'Start Service'}
                        </button>
                    </div>
                </div>

                {/* Modbus Controller */}
                <div className="metric-card" style={{ height: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Modbus TCP Server</h3>
                        <div className="live-badge" style={{ 
                            background: modbus.is_enabled ? 'hsla(var(--accent-primary), 0.1)' : 'hsla(var(--accent-danger), 0.1)',
                            color: modbus.is_enabled ? 'hsl(var(--accent-primary))' : 'hsl(var(--accent-danger))'
                        }}>
                            {modbus.is_enabled ? 'Broadcasting' : 'Stopped'}
                        </div>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label className="metric-label">Server Details</label>
                            <div style={{ padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', fontSize: '0.9rem', color: 'hsl(var(--text-secondary))' }}>
                                Connection: 0.0.0.0:5020 (Fixed Mapping)
                            </div>
                        </div>
                        <button 
                            className="btn-primary" 
                            style={{ 
                                marginTop: 'auto',
                                background: modbus.is_enabled ? 'hsla(var(--accent-danger), 0.2)' : 'hsla(var(--accent-primary), 0.2)',
                                border: `1px solid ${modbus.is_enabled ? 'hsl(var(--accent-danger))' : 'hsl(var(--accent-primary))'}`,
                                color: modbus.is_enabled ? 'hsl(var(--accent-danger))' : 'hsl(var(--accent-primary))',
                                boxShadow: 'none'
                             }}
                            onClick={() => updateConfig('modbus', !modbus.is_enabled)}
                        >
                            {modbus.is_enabled ? 'Shut Down Modbus Slave' : 'Initialize Modbus Slave'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Settings;
