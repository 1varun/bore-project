import React from 'react';
import ReactECharts from 'echarts-for-react';

/**
 * VerticalTrack - A single drilling log track (Vertical Oriented)
 * Displays 3 selected parameters in a single graph.
 */
const VerticalTrack = ({ id, activeTags = [], data = [], title = "Track", onSelectTag }) => {
  const colors = ['#00ff88', '#00a2ff', '#ffaa00'];

  // Map 3 lines inside the track
  const series = activeTags.map((tag, idx) => {
    const trackData = data.filter(d => d.tag_name === tag).sort((a, b) => new Date(a.time) - new Date(b.time));
    return {
      name: tag,
      type: 'line',
      smooth: true,
      showSymbol: false,
      data: trackData.map(d => [d.value, new Date(d.time).getTime()]), // [x: value, y: time]
      itemStyle: { color: colors[idx] },
      lineStyle: { width: 2 },
      xAxisIndex: idx, // each series gets its own dynamic X-Axis for auto-scaling
      areaStyle: { 
        color: {
          type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
          colorStops: [{ offset: 0, color: `${colors[idx]}33` }, { offset: 1, color: 'transparent' }]
        }
      }
    };
  });

  // Create an X-axis for each parameter so they scale independently
  const xAxes = activeTags.map((tag, idx) => ({
      type: 'value', 
      position: 'top',
      axisLine: { show: true, lineStyle: { color: colors[idx] } },
      axisLabel: { color: colors[idx], fontSize: 9, show: true },
      splitLine: { show: idx === 0, lineStyle: { color: 'rgba(255,255,255,0.05)' } },
      offset: idx * 25 // Stack the X-axes labels at the top
  }));

  const option = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    grid: { left: 10, right: 10, top: 10 + (activeTags.length * 25), bottom: 10 },
    xAxis: xAxes.length > 0 ? xAxes : [{ type: 'value', show: false }],
    yAxis: { 
      type: 'time', 
      inverse: true, // Time goes DOWN
      show: false,
    },
    series: series
  };

  return (
    <div className="vertical-track-container">
      <div className="track-chart">
        <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
      </div>
      
      {/* Selection boxes at the bottom to swap parameters */}
      <div className="track-selection-container">
        {activeTags.map((tag, idx) => (
          <div 
            key={idx} 
            className="track-selection-box" 
            style={{ borderLeftColor: colors[idx] }}
            onClick={() => onSelectTag(idx)}
            title={tag}
          >
            {tag || "Select Parameter..."}
          </div>
        ))}
      </div>
    </div>
  );
};

export default VerticalTrack;
