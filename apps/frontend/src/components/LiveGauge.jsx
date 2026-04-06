import React from 'react';
import ReactECharts from 'echarts-for-react';

/**
 * LiveGauge - A combined Hookload (outer) and WOB (inner) gauge.
 * Values are stacked vertically as requested.
 */
const LiveGauge = ({ hookload = 0, wob = 0 }) => {
  const option = {
    series: [
      {
        type: 'gauge',
        name: 'Hookload',
        center: ['50%', '45%'],
        startAngle: 210,
        endAngle: -30,
        min: 0,
        max: 500,
        splitNumber: 10,
        radius: '95%',
        axisLine: { lineStyle: { color: [[1, 'rgba(255,255,255,0.05)']], width: 10 } },
        progress: { show: true, width: 10, itemStyle: { color: '#00a2ff' } },
        pointer: { icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z', length: '70%', width: 8, offsetCenter: [0, '5%'], itemStyle: { color: '#00a2ff' } },
        axisTick: { distance: -15, splitNumber: 5, lineStyle: { width: 1, color: '#999' } },
        splitLine: { distance: -20, length: 14, lineStyle: { width: 3, color: '#999' } },
        axisLabel: { distance: -25, color: '#999', fontSize: 10 },
        anchor: { show: true, showAbove: true, size: 12, itemStyle: { borderWidth: 2, borderColor: '#00a2ff' } },
        title: { offsetCenter: [0, '75%'], fontSize: 10, color: '#00a2ff', fontWeight: 'bold' },
        detail: {
            valueAnimation: true,
            formatter: '{value}',
            offsetCenter: [0, '90%'], // Centered
            fontSize: 18,
            fontWeight: 'bold',
            fontFamily: 'JetBrains Mono',
            color: '#fff'
        },
        data: [{ value: Number(hookload).toFixed(1), name: 'HKLD / TONS' }]
      },
      {
        type: 'gauge',
        name: 'WOB',
        center: ['50%', '45%'],
        startAngle: 210,
        endAngle: -30,
        min: 0,
        max: 100,
        radius: '65%',
        axisLine: { lineStyle: { color: [[1, 'rgba(255,255,255,0.05)']], width: 6 } },
        progress: { show: true, width: 6, itemStyle: { color: '#00ff88' } },
        pointer: { icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z', length: '60%', width: 6, offsetCenter: [0, '5%'], itemStyle: { color: '#00ff88' } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        anchor: { show: true, size: 0 },
        title: { offsetCenter: [0, '115%'], fontSize: 10, color: '#00ff88', fontWeight: 'bold' },
        detail: {
            valueAnimation: true,
            formatter: '{value}',
            offsetCenter: [0, '133%'], // Stacked below Hookload
            fontSize: 18,
            fontWeight: 'bold',
            fontFamily: 'JetBrains Mono',
            color: '#fff'
        },
        data: [{ value: Number(wob).toFixed(1), name: 'WOB / TONS' }]
      }
    ]
  };

  return (
    <div className="stat-box" style={{ padding: '0px 14px 20px 14px', cursor: 'default' }}>
      <div style={{ height: '240px', marginTop: '10px' }}>
        <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
      </div>
    </div>
  );
};

export default LiveGauge;
