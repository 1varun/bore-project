import React, { useEffect, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';

/**
 * LiveMetricCard - Premium Industrial Display Card
 * Displays: Label, Unit, Large Numeric Value, and a Real-time Trend Sparkline.
 */
const LiveMetricCard = ({ label, value, unit, color = '#00ff88' }) => {
  const [history, setHistory] = useState(new Array(30).fill(0));
  const numericValue = typeof value === 'number' ? value : 0;

  // Track sparkline history locally
  useEffect(() => {
    setHistory((prev) => {
      const next = [...prev, numericValue];
      return next.slice(-30); // Keep last 30 readings
    });
  }, [numericValue]);

  // High-performance ECharts sparkline config
  const option = {
    grid: { left: 0, right: 0, top: 0, bottom: 0 },
    xAxis: { type: 'category', show: false },
    yAxis: { type: 'value', show: false, min: 'dataMin', max: 'dataMax' },
    series: [
      {
        data: history,
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { color, width: 2 },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: `${color}33` },
              { offset: 1, color: 'transparent' }
            ]
          }
        }
      }
    ],
    animation: false // Disable animation for high-frequency updates
  };

  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value-container">
        <span className="metric-value">{numericValue.toFixed(1)}</span>
        <span className="metric-unit">{unit}</span>
      </div>
      <div className="metric-sparkline">
        <ReactECharts 
          option={option} 
          style={{ height: '60px', width: '100%' }} 
          opts={{ renderer: 'canvas' }}
        />
      </div>
    </div>
  );
};

export default LiveMetricCard;
