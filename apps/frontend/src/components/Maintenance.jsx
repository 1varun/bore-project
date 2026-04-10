import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';

/**
 * Maintenance Dashboard - Maintenance & Power Hub
 * Shows power trends and overall rig power health.
 */
const Maintenance = () => {
    const navigate = useNavigate();
    const [history, setHistory] = useState([]);
    const generators = ['GS1_ActPowerAvailable', 'GS2_ActPowerAvailable', 'GS3_ActPowerAvailable', 'GS4_ActPowerAvailable'];

    useEffect(() => {
        const fetchPowerTrend = async () => {
            const url = `http://localhost:3000/api/history?tags=${generators.join(',')}&minutes=30&limit=50000`;
            try {
                const res = await fetch(url);
                const json = await res.json();
                if (json.success) setHistory(json.data);
            } catch (err) {
                console.error('[API] Power History error:', err);
            }
        };
        fetchPowerTrend();
        const interval = setInterval(fetchPowerTrend, 60000);
        return () => clearInterval(interval);
    }, []);

    const colors = ['#00ff88', '#00a2ff', '#ffaa00', '#ff0088'];
    const series = generators.map((tag, idx) => {
        const data = history.filter(d => d.tag_name === tag).sort((a, b) => new Date(a.time) - new Date(b.time));
        return {
            name: tag.replace('_ActPowerAvailable', ' GEN'),
            type: 'line',
            smooth: true,
            showSymbol: false,
            data: data.map(d => [new Date(d.time).getTime(), d.value]),
            itemStyle: { color: colors[idx] },
            areaStyle: {
                color: {
                    type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [{ offset: 0, color: `${colors[idx]}33` }, { offset: 1, color: 'transparent' }]
                }
            }
        };
    });

    const option = {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
        legend: { textStyle: { color: '#999' }, top: 10 },
        grid: { left: 40, right: 10, top: 40, bottom: 30 },
        xAxis: { type: 'time', splitLine: { show: false }, axisLabel: { color: '#666' } },
        yAxis: { type: 'value', name: 'Power (kW)', splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }, axisLabel: { color: '#666' } },
        series: series
    };

    return (
        <div className="settings-page">
            <div className="settings-page-inner content-fade-in" style={{ maxWidth: '1000px' }}>
                <header className="header" style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 className="secondary-title">🛠️ Maintenance Hub</h2>
                        <p style={{ fontSize: '0.8rem', color: 'hsl(var(--text-secondary))' }}>Predictive maintenance and global power consumption trends</p>
                    </div>
                    <button className="btn-primary" onClick={() => navigate('/')}>← DASHBOARD</button>
                </header>

                <div className="metric-card" style={{ height: '400px', marginBottom: '25px' }}>
                    <div className="track-header" style={{ background: 'transparent', borderBottom: 'none', textAlign: 'left', padding: '0px', marginBottom: '20px' }}>
                        <span>Global Active Power Loading (GEN 1-4)</span>
                    </div>
                    <ReactECharts option={option} style={{ height: '320px', width: '100%' }} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
                    <div className="metric-card" style={{ textAlign: 'center' }}>
                        <div className="stat-label">Power Stability</div>
                        <div className="stat-value" style={{ color: 'hsl(var(--accent-primary))' }}>98.2%</div>
                        <div className="unit">Optimal Load</div>
                    </div>
                    <div className="metric-card" style={{ textAlign: 'center' }}>
                        <div className="stat-label">Maintenance Health</div>
                        <div className="stat-value" style={{ color: 'hsl(var(--accent-secondary))' }}>Good</div>
                        <div className="unit">0 Overdue Tasks</div>
                    </div>
                    <div className="metric-card" style={{ textAlign: 'center' }}>
                        <div className="stat-label">Next Service</div>
                        <div className="stat-value" style={{ color: 'hsl(var(--accent-warn))' }}>48h</div>
                        <div className="unit">Drawworks Lube</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Maintenance;
