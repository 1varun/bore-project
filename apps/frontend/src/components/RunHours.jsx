import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';

/**
 * RunHours - Equipment Management Hub
 * Shows all run-hour related tags grouped by Equipment (prefix).
 */
const RunHours = () => {
    const navigate = useNavigate();
    const { data } = useSocket();
    const [tagList, setTagList] = useState([]);

    useEffect(() => {
        // Fetch only tags that contain 'hours' in name or desc
        fetch('http://localhost:3000/api/tags')
            .then(res => res.json())
            .then(json => {
                if (json.success) {
                    const filtered = json.data.filter(t => 
                        t.tag_name.toLowerCase().includes('hours') || 
                        (t.description || '').toLowerCase().includes('hours')
                    );
                    setTagList(filtered);
                }
            })
            .catch(err => console.error("[API] Load Running Hours Error:", err));
    }, []);

    // Grouping logic: Get equipment (e.g., GS1, DWW) from the prefix
    const groupedTags = tagList.reduce((acc, tag) => {
        const prefix = tag.tag_name.split('_')[0] || 'GENERAL';
        if (!acc[prefix]) acc[prefix] = [];
        acc[prefix].push(tag);
        return acc;
    }, {});

    return (
        <div className="settings-page">
            <div className="settings-page-inner content-fade-in" style={{ maxWidth: '1200px' }}>
                <header className="header" style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 className="secondary-title">⏳ Equipment Run-Hours</h2>
                        <p style={{ fontSize: '0.8rem', color: 'hsl(var(--text-secondary))' }}>Monitoring operational duration across all rig modules</p>
                    </div>
                    <button className="btn-primary" onClick={() => navigate('/')}>← DASHBOARD</button>
                </header>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
                    {Object.keys(groupedTags).sort().map(equipment => (
                        <div key={equipment} className="metric-card" style={{ padding: '0px', overflow: 'hidden' }}>
                            <div style={{ 
                                background: 'rgba(255,255,255,0.03)', 
                                padding: '12px 20px', 
                                borderBottom: '1px solid var(--glass-border)',
                                fontSize: '0.9rem',
                                fontWeight: 800,
                                color: 'hsl(var(--accent-primary))',
                                letterSpacing: '1px'
                            }}>
                                {equipment}
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <tbody>
                                    {groupedTags[equipment].map(tag => (
                                        <tr key={tag.tag_name} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <td style={{ padding: '12px 20px', color: 'hsl(var(--text-secondary))' }}>
                                                {tag.tag_name.replace(`${equipment}_`, '').replace('_RunHours', '').replace(/_/g, ' ')}
                                            </td>
                                            <td style={{ padding: '12px 20px', textAlign: 'right', fontWeight: 600, fontFamily: 'JetBrains Mono' }}>
                                                {data[tag.tag_name] ? Math.floor(data[tag.tag_name]) : '---'} <span style={{ fontSize: '0.6rem', color: '#666' }}>HRS</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default RunHours;
