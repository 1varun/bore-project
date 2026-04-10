import React, { useRef, useState, useEffect, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

// ─────────────────────────────────────────────────────────────────────────────
// TIME RANGE CONFIG
// limit    : max raw rows fetched from API per tag
// maxPts   : target points after LTTB downsampling (controls render density)
// ─────────────────────────────────────────────────────────────────────────────
const TIME_RANGES = [
  { label: '30m', minutes: 30, tickCount: 7, format: 'time', limit: 3000, maxPts: 300 },
  { label: '1h', minutes: 60, tickCount: 7, format: 'time', limit: 3000, maxPts: 400 },
  { label: '6h', minutes: 360, tickCount: 7, format: 'time', limit: 5000, maxPts: 500 },
  { label: '12h', minutes: 720, tickCount: 7, format: 'time', limit: 5000, maxPts: 500 },
  { label: '24h', minutes: 1440, tickCount: 7, format: 'datetime', limit: 8000, maxPts: 600 },
];

const API_BASE = 'http://localhost:3000';

// ─────────────────────────────────────────────────────────────────────────────
// LTTB – Largest-Triangle-Three-Buckets downsampling
// Preserves visual shape while drastically reducing point count.
// data : [[value, timestamp], ...]  (already sorted by timestamp)
// threshold : target number of output points
// ─────────────────────────────────────────────────────────────────────────────
function lttb(data, threshold) {
  const n = data.length;
  if (threshold >= n || threshold <= 2) return data;

  const sampled = [];
  // Always include the first point
  sampled.push(data[0]);

  const bucketSize = (n - 2) / (threshold - 2);
  let a = 0; // index of previously selected point

  for (let i = 0; i < threshold - 2; i++) {
    // Calculate point average for the next bucket (look-ahead)
    const avgRangeStart = Math.floor((i + 1) * bucketSize) + 1;
    const avgRangeEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n);
    let avgX = 0, avgY = 0;
    const avgLen = avgRangeEnd - avgRangeStart;
    for (let j = avgRangeStart; j < avgRangeEnd; j++) {
      avgX += data[j][1]; // timestamp
      avgY += data[j][0]; // value
    }
    avgX /= avgLen;
    avgY /= avgLen;

    // Pick point in current bucket with the largest triangle area
    const rangeStart = Math.floor(i * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, n);
    const pointAX = data[a][1];
    const pointAY = data[a][0];

    let maxArea = -1;
    let nextA = rangeStart;
    for (let j = rangeStart; j < rangeEnd; j++) {
      const area = Math.abs(
        (pointAX - avgX) * (data[j][0] - pointAY) -
        (pointAX - data[j][1]) * (avgY - pointAY)
      ) * 0.5;
      if (area > maxArea) { maxArea = area; nextA = j; }
    }

    sampled.push(data[nextA]);
    a = nextA;
  }

  // Always include the last point
  sampled.push(data[n - 1]);
  return sampled;
}

// ─────────────────────────────────────────────────────────────────────────────
// TICK LABELS
// ─────────────────────────────────────────────────────────────────────────────
function buildTicks(start, end, count, format) {
  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(start + step * i);
    if (format === 'datetime') {
      return (
        d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
        '\n' +
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
    }
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const VerticalTrack = ({
  id,
  activeTags = [],
  data = [],
  title = "Track",
  onSelectTag,
  timeWindow,
  showBorderRight = false
}) => {
  const colors = ['#00ff88', '#00a2ff', '#ffaa00'];
  const chartContainerRef = useRef(null);
  const abortRef = useRef(null); // cancel in-flight fetches when range changes

  const [selectedRange, setSelectedRange] = useState(TIME_RANGES[1]);
  const [timeWindow, setTimeWindow] = useState(() => {
    const end = Date.now();
    return { start: end - TIME_RANGES[1].minutes * 60_000, end };
  });
  const [seriesData, setSeriesData] = useState({}); // { tagName: [[val, ts], ...] }
  const [loading, setLoading] = useState(false);

  // ── Fetch + downsample ─────────────────────────────────────────────────────
  const fetchData = useCallback(async (range, tags) => {
    const visible = tags.filter(t => t && t !== '__none__');
    if (!visible.length) { setSeriesData({}); return; }

    // Cancel any previous in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const end = Date.now();
      const start = end - range.minutes * 60_000;

      const url = `${API_BASE}/api/history?minutes=${range.minutes}&tags=${visible.join(',')}&limit=${range.limit}`;
      const res = await fetch(url, { signal: controller.signal });
      const json = await res.json();

      if (!json.success) return;

      // Group raw EAV rows by tag, convert to [value, timestamp], sort, downsample
      const grouped = {};
      for (const row of json.data) {
        if (!grouped[row.tag_name]) grouped[row.tag_name] = [];
        grouped[row.tag_name].push([parseFloat(row.value), new Date(row.time).getTime()]);
      }
      const downsampled = {};
      for (const tag of visible) {
        const pts = (grouped[tag] || []).sort((a, b) => a[1] - b[1]);
        downsampled[tag] = lttb(pts, range.maxPts);
      }

      setTimeWindow({ start, end });
      setSeriesData(downsampled);
      onTimeWindowChange?.({ start, end, minutes: range.minutes });
    } catch (err) {
      if (err.name !== 'AbortError') console.error('[VerticalTrack] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [onTimeWindowChange]);

  // Re-fetch when range or tags change
  useEffect(() => {
    fetchData(selectedRange, activeTags);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRange, activeTags.join(',')]);

  const applyRange = (range) => {
    setSelectedRange(range);
    // fetchData fires via the effect above
  };

  // ── Tick labels ────────────────────────────────────────────────────────────
  const ticks = buildTicks(
    timeWindow.start,
    timeWindow.end,
    selectedRange.tickCount,
    selectedRange.format
  );

  // ── ECharts series + axes ──────────────────────────────────────────────────
  const visibleTags = activeTags.filter(t => t && t !== '__none__');
  const tagIndexMap = Object.fromEntries(activeTags.map((t, i) => [t, i]));

  const series = visibleTags.map((tag) => {
    const origIdx = tagIndexMap[tag] ?? 0;
    return {
      name: tag,
      type: 'line',
      smooth: true,
      showSymbol: false,
      data: seriesData[tag] || [],
      encode: { x: 0, y: 1 }, // [value, timestamp] — x is the parameter, y is time
      itemStyle: { color: colors[origIdx % colors.length] },
      lineStyle: { width: 2 },
      large: true,
      largeThreshold: 500,
      xAxisIndex: origIdx,
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
          colorStops: [
            { offset: 0, color: `${colors[origIdx % colors.length]}33` },
            { offset: 1, color: 'transparent' },
          ],
        },
      },
    };
  });

  // One x-axis per visible tag (parameter scale across top)
  const xAxes = visibleTags.map((tag, idx) => {
    const origIdx = tagIndexMap[tag] ?? idx;
    return {
      type: 'value',
      position: 'top',
      axisLine: { show: true, lineStyle: { color: colors[origIdx % colors.length] } },
      axisLabel: { color: colors[origIdx % colors.length], fontSize: 9, show: true },
      splitLine: { show: idx === 0, lineStyle: { color: 'rgba(255,255,255,0.05)' } },
      offset: idx * 25,
    };
  });

  const option = {
    animation: false,
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross', lineStyle: { color: 'rgba(255,255,255,0.3)' } },
      backgroundColor: 'rgba(10,14,20,0.95)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#fff', fontSize: 11 },
      formatter: (params) => {
        if (!params?.length) return '';
        // value is [paramValue, timestamp] from the encode mapping
        const ts = Array.isArray(params[0].value) ? params[0].value[1] : 0;
        const d = new Date(ts);
        const header = `<div style="font-size:10px;color:#8b949e;margin-bottom:4px">
          ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}
          &nbsp;${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>`;
        const rows = params.map(p => {
          const val = Array.isArray(p.value) ? p.value[0] : p.value;
          return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;
            background:${p.color};margin-right:5px;vertical-align:middle"></span>
            ${p.seriesName}: <b>${Number(val).toFixed(2)}</b>`;
        }).join('<br/>');
        return header + rows;
      },
    },
    grid: {
      left: 0, right: 0,
      top: visibleTags.length > 1 ? 90 : 40, // tighter top when only 1 tag
      bottom: 0,
      containLabel: false,
    },
    xAxis: xAxes.length > 0 ? xAxes : [{ type: 'value', show: false }],
    yAxis: {
      type: 'value',       // timestamps as plain numbers
      inverse: true,       // newest at bottom — drilling convention
      show: false,
      min: timeWindow.start,
      max: timeWindow.end,
      splitLine: { show: false },
    },
    series,
  };

  // ── PDF Export ─────────────────────────────────────────────────────────────
  const handleExportPDF = async () => {
    if (!chartContainerRef.current) return;
    try {
      const canvas = await html2canvas(chartContainerRef.current, { backgroundColor: '#0d1117', scale: 2 });
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
      pdf.text(`Exported: ${new Date().toLocaleString()} | Range: ${selectedRange.label} | Points: ${Object.values(seriesData).reduce((s, a) => s + a.length, 0)}`, 10, 21);
      pdf.addImage(imgData, 'PNG', 0, 28, pdfW, pdfH);
      pdf.save(`bore_${title.replace(/\s+/g, '_')}_${Date.now()}.pdf`);
    } catch (e) { console.error('[PDF] Export failed:', e); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="vertical-track-container"
      ref={chartContainerRef}
      style={{
        borderRight: '1px solid rgba(255,255,255,0.08)',
        borderLeft: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        position: 'relative',
      }}
    >

      {/* ── Time range selector ── */}
      <div
        className="track-time-selector"
        style={{
          display: 'flex',
          gap: '4px',
          padding: '6px 8px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.02)',
          flexShrink: 0,
        }}
      >
        {TIME_RANGES.map(range => (
          <button
            key={range.label}
            onClick={() => applyRange(range)}
            title={`Show last ${range.label}`}
            style={{
              flex: 1,
              padding: '3px 0',
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '0.5px',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s',
              background: selectedRange.label === range.label
                ? 'hsla(var(--accent-primary), 0.2)'
                : 'transparent',
              color: selectedRange.label === range.label
                ? 'hsl(var(--accent-primary))'
                : 'rgba(255,255,255,0.4)',
              outline: selectedRange.label === range.label
                ? '1px solid hsla(var(--accent-primary), 0.4)'
                : '1px solid transparent',
            }}
          >
            {range.label}
          </button>
        ))}

        {/* Loading indicator */}
        {loading && (
          <span style={{
            fontSize: '0.65rem',
            color: 'rgba(255,255,255,0.3)',
            alignSelf: 'center',
            marginLeft: '4px',
            whiteSpace: 'nowrap',
          }}>
            ···
          </span>
        )}
      </div>

      {/* ── Body: left time axis + chart ── */}
      <div
        className="track-body"
        style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}
      >
        {/* Left time axis */}
        <div
          className="track-time-axis"
          style={{
            width: '48px',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: `${option.grid.top}px 4px 4px 4px`,
            borderRight: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(0,0,0,0.15)',
          }}
        >
          {ticks.map((tick, i) => (
            <div
              key={i}
              style={{
                fontSize: '0.6rem',
                color: 'rgba(255,255,255,0.35)',
                lineHeight: 1.25,
                textAlign: 'right',
              }}
            >
              {tick.split('\n').map((line, j) => (
                <span key={j} style={{ display: 'block' }}>{line}</span>
              ))}
            </div>
          ))}
        </div>

        {/* ECharts chart */}
        <div className="track-chart" style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          {visibleTags.length > 0 ? (
            <ReactECharts
              option={option}
              style={{ height: '100%', width: '100%' }}
              notMerge={true}
            />
          ) : (
            <div
              className="track-empty"
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(255,255,255,0.2)',
                fontSize: '0.75rem',
              }}
            >
              No parameters selected
            </div>
          )}
        </div>
      </div>

      {/* ── Tag slots + PDF ── */}
      <div
        className="track-selection-container"
        style={{
          borderTop: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(0,0,0,0.15)',
          padding: '6px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          flexShrink: 0,
        }}
      >
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
            textTransform: 'uppercase',
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
