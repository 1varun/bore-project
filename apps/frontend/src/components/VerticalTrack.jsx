import React, { useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * VerticalTrack - A single drilling log track (Vertical Oriented)
 * Displays up to 3 selected parameters in a single chart.
 * Latest time at BOTTOM (drilling convention).
 */
const VerticalTrack = ({ id, activeTags = [], data = [], title = "Track", onSelectTag, timeWindow }) => {
  const colors = ['#00ff88', '#00a2ff', '#ffaa00'];
  const chartContainerRef = useRef(null);

  // Filter out "none" tags from series rendering
  const visibleTags = activeTags.filter(tag => tag && tag !== '__none__');

  const series = visibleTags.map((tag, idx) => {
    const originalIdx = activeTags.indexOf(tag);
    const trackData = data
      .filter(d => d.tag_name === tag)
      .sort((a, b) => new Date(a.time) - new Date(b.time));
    
    return {
      name: tag,
      type: 'line',
      smooth: true,
      showSymbol: false,
      data: trackData.map(d => [d.value, new Date(d.time).getTime()]),
      itemStyle: { color: colors[originalIdx % colors.length] },
      lineStyle: { width: 2 },
      xAxisIndex: idx,
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
          colorStops: [
            { offset: 0, color: `${colors[originalIdx % colors.length]}33` },
            { offset: 1, color: 'transparent' }
          ]
        }
      }
    };
  });

  const xAxes = visibleTags.map((tag, idx) => {
    const originalIdx = activeTags.indexOf(tag);
    return {
      type: 'value',
      position: 'top',
      axisLine: { show: true, lineStyle: { color: colors[originalIdx % colors.length] } },
      axisLabel: { color: colors[originalIdx % colors.length], fontSize: 9, show: true },
      splitLine: { show: idx === 0, lineStyle: { color: 'rgba(255,255,255,0.05)' } },
      offset: idx * 25,
    };
  });

  const option = {
    animation: false, // Performance boost for big logs
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', lineStyle: { color: 'rgba(255,255,255,0.3)' } },
      backgroundColor: 'rgba(10,14,20,0.95)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#fff', fontSize: 11 },
    },
    grid: {
      left: 8,
      right: 8,
      top: 10 + (visibleTags.length * 25),
      bottom: 8,
      containLabel: false
    },
    xAxis: xAxes.length > 0 ? xAxes : [{ type: 'value', show: false }],
    yAxis: {
      type: 'time',
      inverse: true,
      show: false,
      // 🚀 CRITICAL: Force the axis limits to match the global time window
      min: timeWindow?.start || undefined,
      max: timeWindow?.end || undefined,
      splitLine: { show: false }
    },
    series: series,
  };

  // PDF Export
  const handleExportPDF = async () => {
    if (!chartContainerRef.current) return;
    try {
      const canvas = await html2canvas(chartContainerRef.current, {
        backgroundColor: '#0d1117',
        scale: 2,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = (canvas.height * pdfW) / canvas.width;
      pdf.setFillColor(13, 17, 23);
      pdf.rect(0, 0, pdfW, pdf.internal.pageSize.getHeight(), 'F');
      pdf.setTextColor(0, 255, 136);
      pdf.setFontSize(14);
      pdf.text(`BORE Project — ${title}`, 10, 14);
      pdf.setTextColor(150, 160, 180);
      pdf.setFontSize(9);
      pdf.text(`Exported: ${new Date().toLocaleString()}`, 10, 21);
      pdf.addImage(imgData, 'PNG', 0, 28, pdfW, pdfH);
      pdf.save(`bore_${title.replace(/\s+/g, '_')}_${Date.now()}.pdf`);
    } catch (e) {
      console.error('[PDF] Export failed:', e);
    }
  };

  return (
    <div className="vertical-track-container" ref={chartContainerRef}>
      <div className="track-chart">
        {visibleTags.length > 0 ? (
          <ReactECharts 
            option={option} 
            style={{ height: '100%', width: '100%' }} 
            notMerge={true} // Forces e-charts to respect the new window immediately
          />
        ) : (
          <div className="track-empty">
            <span>No parameters selected</span>
          </div>
        )}
      </div>

      <div className="track-selection-container">
        {activeTags.map((tag, idx) => (
          <div
            key={idx}
            className="track-selection-box"
            style={{ borderLeftColor: tag && tag !== '__none__' ? colors[idx] : 'rgba(255,255,255,0.2)' }}
            onClick={() => onSelectTag(idx)}
            title={tag === '__none__' ? 'None (click to change)' : tag}
          >
            {tag === '__none__' || !tag ? '— None —' : tag}
          </div>
        ))}
        <button
          className="track-selection-box"
          style={{ 
            borderLeftColor: 'hsl(var(--accent-primary))',
            marginTop: '4px',
            textAlign: 'center',
            background: 'hsla(var(--accent-primary), 0.1)',
            fontWeight: 700,
            textTransform: 'uppercase'
          }}
          onClick={handleExportPDF}
        >
          📄 SAVE AS PDF
        </button>
      </div>
    </div>
  );
};

export default VerticalTrack;
