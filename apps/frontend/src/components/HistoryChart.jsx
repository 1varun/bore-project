import React, { useEffect, useState, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * HistoryChart - Advanced ECharts Historical Viewer
 * Queries the TimescaleDB EAV table via the Python API.
 */
const HistoryChart = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [minutes, setMinutes] = useState(60);
    const chartRef = useRef(null);

    // Default primary tags to show
    const defaultTags = ['Depth', 'RPM', 'HookLoad', 'WOB'];

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                // Fetch tiered EAV data: ?tags=...&minutes=...
                const url = `http://localhost:3000/api/history?minutes=${minutes}&tags=${defaultTags.join(',')}&limit=500000`;
                const response = await fetch(url);
                const json = await response.json();
                
                if (json.success) {
                    setData(json.data);
                }
            } catch (error) {
                console.error("[API] Failed to fetch history:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
        const interval = setInterval(fetchHistory, 30000);
        return () => clearInterval(interval);
    }, [minutes]);

    // Data Transformation: Pivot EAV (Long) to ECharts (Wide) format
    const pivotData = () => {
        const timeMap = {};
        data.forEach(row => {
            const t = new Date(row.time).getTime();
            if (!timeMap[t]) timeMap[t] = { time: t };
            timeMap[t][row.tag_name] = row.value;
        });

        // Convert map to sorted array
        return Object.values(timeMap).sort((a, b) => a.time - b.time);
    };

    const pivoted = pivotData();
    const timestamps = pivoted.map(p => new Date(p.time).toLocaleTimeString());

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(26, 29, 35, 0.9)',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            textStyle: { color: '#fff' }
        },
        legend: {
            data: defaultTags,
            textStyle: { color: '#8b949e', fontSize: 12 },
            top: 10
        },
        grid: { left: '40', right: '20', bottom: '60', top: '50', containLabel: false },
        xAxis: {
            type: 'category',
            boundaryGap: false,
            data: timestamps,
            axisLabel: { color: '#8b949e', fontSize: 10 },
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } }
        },
        yAxis: [
            { 
                type: 'value', 
                name: 'Main Units', 
                axisLabel: { color: '#8b949e' },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } }
            }
        ],
        dataZoom: [
            { type: 'inside', start: 0, end: 100 },
            { type: 'slider', start: 0, end: 100, bottom: 10, height: 20, borderColor: 'transparent', backgroundColor: 'rgba(255,255,255,0.05)' }
        ],
        series: defaultTags.map((tag, idx) => ({
            name: tag,
            type: 'line',
            symbol: 'none',
            large: true,
            largeThreshold: 2000,
            smooth: true,
            data: pivoted.map(p => p[tag] || null),
            lineStyle: { width: 3 },
            boundaryGap: false,
            // Color cycling
            itemStyle: { color: ['#00ff88', '#00a2ff', '#ffaa00', '#ff4d4d'][idx % 4] }
        }))
    };

    const handleExport = async () => {
        if (!chartRef.current) return;
        const canvas = await html2canvas(chartRef.current, { backgroundColor: '#0a0c10' });
        const pdf = new jsPDF('landscape');
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 10, 10, 280, 150);
        pdf.save('rig-telemetry-report.pdf');
    };

    if (loading) return <div className="metric-card"><p>Synchronizing history...</p></div>;

    return (
        <div style={{ position: 'relative' }}>
            <div className="chart-header">
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button className={`nav-item-small ${minutes === 60 ? 'active' : ''}`} onClick={() => setMinutes(60)}>1H</button>
                    <button className={`nav-item-small ${minutes === 360 ? 'active' : ''}`} onClick={() => setMinutes(360)}>6H</button>
                    <button className={`nav-item-small ${minutes === 1440 ? 'active' : ''}`} onClick={() => setMinutes(1440)}>24H</button>
                </div>
                <button className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.8rem' }} onClick={handleExport}>📤 Export Report</button>
            </div>
            
            <div ref={chartRef} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '16px', padding: '1rem' }}>
                <ReactECharts option={option} style={{ height: '500px', width: '100%' }} />
            </div>
        </div>
    );
};

export default HistoryChart;
