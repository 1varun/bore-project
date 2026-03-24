import React, { useEffect, useState, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const HistoryChart = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const chartRef = useRef(null);

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                // Fetch last 60 minutes
                const response = await fetch('http://localhost:3000/api/history?minutes=60');
                const json = await response.json();
                if (json.success) {
                    setData(json.data);
                }
            } catch (error) {
                console.error("Failed to fetch history data", error);
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
        
        // Polling history every 30 seconds to keep chart updated
        const interval = setInterval(fetchHistory, 30000);
        return () => clearInterval(interval);
    }, []);

    const handlePrint = async () => {
        if (!chartRef.current) return;
        
        const canvas = await html2canvas(chartRef.current, { backgroundColor: '#0d1117' });
        const imgData = canvas.toDataURL('image/png');
        
        const pdf = new jsPDF('landscape', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save('drilling-history-graph.pdf');
    };

    if (loading) return <div className="glass-card"><p>Loading history...</p></div>;

    const times = data.map(d => new Date(d.time).toLocaleTimeString());
    const depths = data.map(d => d.depth);
    const rops = data.map(d => d.rpm); // Just mapping RPM to graph
    const wobs = data.map(d => d.wob);

    const option = {
        backgroundColor: 'transparent',
        tooltip: { trigger: 'axis' },
        legend: {
            data: ['Depth', 'RPM', 'WOB'],
            textStyle: { color: '#f0f6fc' }
        },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: {
            type: 'category',
            boundaryGap: false,
            data: times,
            axisLabel: { color: '#8b949e' }
        },
        yAxis: [
            { type: 'value', name: 'Depth/RPM', axisLabel: { color: '#8b949e' }, splitLine: { lineStyle: { color: '#161b22' } } },
            { type: 'value', name: 'WOB', axisLabel: { color: '#8b949e' } }
        ],
        series: [
            { name: 'Depth', type: 'line', data: depths, smooth: true, lineStyle: { color: '#00d2ff' } },
            { name: 'RPM', type: 'line', data: rops, smooth: true, lineStyle: { color: '#00ff88' } },
            { name: 'WOB', type: 'line', data: wobs, yAxisIndex: 1, smooth: true, lineStyle: { color: '#ff007f' } }
        ]
    };

    return (
        <div className="glass-card" style={{ marginTop: '2rem' }}>
            <div className="chart-header">
                <div className="chart-title">Historical Trends (Last 60 Minutes)</div>
                <button className="btn-print" onClick={handlePrint}>🖨️ Export PDF</button>
            </div>
            <div ref={chartRef} style={{ padding: '10px', background: '#0d1117', borderRadius: '8px' }}>
                <ReactECharts option={option} style={{ height: '400px', width: '100%' }} />
            </div>
        </div>
    );
};

export default HistoryChart;
