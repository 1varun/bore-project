import React, { useEffect, useState } from 'react';

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
            .catch(console.error);
    }, []);

    const handleToggle = (service_name, currentStatus) => {
        updateConfig(service_name, !currentStatus);
    };

    const handleTextChange = (service_name, field, value) => {
        setConfigs(prev => prev.map(c => {
            if (c.service_name === service_name) {
                return { ...c, settings: { ...c.settings, [field]: value } };
            }
            return c;
        }));
    };

    const saveChanges = (service_name) => {
        const item = configs.find(c => c.service_name === service_name);
        updateConfig(service_name, item.is_enabled, item.settings);
    };

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
                alert(`${service_name.toUpperCase()} configuration saved and applied dynamically!`);
            }
        })
        .catch(console.error);
    };

    if (loading) return <div className="glass-card"><p>Loading settings...</p></div>;

    const witsml = configs.find(c => c.service_name === 'witsml') || { is_enabled: false, settings: {} };
    const modbus = configs.find(c => c.service_name === 'modbus') || { is_enabled: false, settings: {} };

    return (
        <div style={{ marginTop: '2rem' }}>
            <div className="chart-header">
                <h2>Transmission Settings</h2>
                <button className="btn-print" onClick={onClose} style={{ marginLeft: '1rem', background: '#3a7bd5' }}>Back to Dashboard</button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                {/* WITSML Settings */}
                <div className="glass-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3>WITSML Gateway</h3>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <span style={{ color: witsml.is_enabled ? 'var(--accent)' : 'red', fontWeight: 'bold' }}>
                                {witsml.is_enabled ? 'ENABLED' : 'DISABLED'}
                            </span>
                            <button 
                                onClick={() => handleToggle('witsml', witsml.is_enabled)}
                                style={{ padding: '5px 10px', cursor: 'pointer', borderRadius: '4px', background: witsml.is_enabled ? 'red' : 'green', color: 'white', border: 'none' }}
                            >
                                {witsml.is_enabled ? 'Disable' : 'Enable'}
                            </button>
                        </div>
                    </div>
                    <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <label>Well Name:</label>
                        <input 
                            type="text" 
                            className="input-field"
                            value={witsml.settings.wellName || ''} 
                            onChange={(e) => handleTextChange('witsml', 'wellName', e.target.value)}
                        />
                        <label>Wellbore ID:</label>
                        <input 
                            type="text" 
                            className="input-field"
                            value={witsml.settings.wellId || ''} 
                            onChange={(e) => handleTextChange('witsml', 'wellId', e.target.value)}
                        />
                        <button className="btn-print" style={{ marginTop: '1rem', float: 'left' }} onClick={() => saveChanges('witsml')}>
                            Save & Sync WITSML
                        </button>
                    </div>
                </div>

                {/* Modbus Settings */}
                <div className="glass-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3>Modbus TCP</h3>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <span style={{ color: modbus.is_enabled ? 'var(--accent)' : 'red', fontWeight: 'bold' }}>
                                {modbus.is_enabled ? 'ENABLED' : 'DISABLED'}
                            </span>
                            <button 
                                onClick={() => handleToggle('modbus', modbus.is_enabled)}
                                style={{ padding: '5px 10px', cursor: 'pointer', borderRadius: '4px', background: modbus.is_enabled ? 'red' : 'green', color: 'white', border: 'none' }}
                            >
                                {modbus.is_enabled ? 'Disable' : 'Enable'}
                            </button>
                        </div>
                    </div>
                    <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <label>TCP Port:</label>
                        <input 
                            type="text" 
                            className="input-field"
                            readOnly
                            value={modbus.settings.port || '5020'} 
                        />
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Note: Modbus port is fixed by container mapping.</p>
                        <button className="btn-print" style={{ marginTop: '1rem', float: 'left' }} onClick={() => saveChanges('modbus')}>
                            Save & Sync Modbus
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Settings;
