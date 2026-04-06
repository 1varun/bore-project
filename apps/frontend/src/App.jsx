import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useSocket } from './hooks/useSocket';
import TopBar from './components/TopBar';
import TimeAxis from './components/TimeAxis';
import VerticalTrack from './components/VerticalTrack';
import LiveStatBox from './components/LiveStatBox';
import LiveGauge from './components/LiveGauge';
import Settings from './components/Settings';
import RunHours from './components/RunHours';
import Maintenance from './components/Maintenance';

/**
 * Vertical Log Drilling Dashboard
 * Layout: TopBar | [Time | Track1 | Track2 | Track3 | Stats]
 */
function Dashboard() {
  const { data, connected, lastUpdate } = useSocket();

  // '__none__' means "no trend shown" for that slot
  const [track1Tags, setTrack1Tags] = useState(['GS1_Frequency', 'GS3_V23Voltage', 'GS4_FuelLevel']);
  const [track2Tags, setTrack2Tags] = useState(['MP2_MainMotorA_Motor_Diag_Current_A', 'MP2_MainMotorA_Motor_Diag_Current_Perc', 'DWW_MainMotorA_Motor_Diag_DeltaSpdCmdFdbk']);
  const [track3Tags, setTrack3Tags] = useState(['ETD_MainMotor_Motor_Diag_Power_Perc', 'GS4_ActPowerAvailable', 'GS1_ReactPowerAvailable']);

  const [statTags, setStatTags] = useState([
    'GS4_FuelLevel', 'GS1_Frequency', 'GS3_V23Voltage',
    'MP2_MainMotorA_Motor_Diag_Current_A', 'ETD_MainMotor_Motor_Diag_Power_Perc', 'GS4_ActPowerAvailable'
  ]);

  const [timeMode, setTimeMode] = useState('minutes');
  const [historyMinutes, setHistoryMinutes] = useState(120);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const [allTags, setAllTags] = useState([]);

  // Selection Modal State
  const [selectingModal, setSelectingModal] = useState(null);
  const [showingTimeModal, setShowingTimeModal] = useState(false);
  const [tagSearch, setTagSearch] = useState('');

  const [history, setHistory] = useState([]);

  // Fetch all tags for selection
  useEffect(() => {
    fetch('http://localhost:3000/api/tags')
      .then(r => r.json())
      .then(j => { if (j.success) setAllTags(j.data); })
      .catch(console.error);
  }, []);

  // Periodic history fetch for trackers
  useEffect(() => {
    const fetchHistory = async () => {
      // Only fetch history for visible (non-none) tags
      const activeTags = [...track1Tags, ...track2Tags, ...track3Tags].filter(t => t && t !== '__none__');
      const uniqueTags = [...new Set(activeTags)];
      if (uniqueTags.length === 0) return;

      let url = `http://localhost:3000/api/history?tags=${uniqueTags.join(',')}&limit=5000`;

      if (timeMode === 'custom' && customStart && customEnd) {
        url += `&start_time=${new Date(customStart).toISOString()}&end_time=${new Date(customEnd).toISOString()}`;
      } else {
        url += `&minutes=${historyMinutes}`;
      }

      try {
        const res = await fetch(url);
        const json = await res.json();
        if (json.success) setHistory(json.data);
      } catch (err) {
        console.error('[API] History error:', err);
      }
    };
    fetchHistory();
    const interval = setInterval(fetchHistory, 30000);
    return () => clearInterval(interval);
  }, [track1Tags, track2Tags, track3Tags, timeMode, historyMinutes, customStart, customEnd]);

  // Time labels for vertical axis
  const timeLabels = Array.from({ length: 15 }).map((_, i) => {
    if (timeMode === 'custom' && customStart && customEnd) {
      const startMs = new Date(customStart).getTime();
      const endMs = new Date(customEnd).getTime();
      if (isNaN(startMs) || isNaN(endMs)) return '--:--';
      // Index 0 = oldest (top), index 14 = newest (bottom)
      const d = new Date(startMs + (i * ((endMs - startMs) / 14)));
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      const d = new Date();
      // i=0 = oldest (top of axis), i=14 = now (bottom)
      d.setMinutes(d.getMinutes() - ((14 - i) * (historyMinutes / 14)));
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  });

  const filteredTags = allTags.filter(t =>
    t.tag_name.toLowerCase().includes(tagSearch.toLowerCase()) ||
    (t.description || '').toLowerCase().includes(tagSearch.toLowerCase())
  );

  const handleTagSelect = (tagObj) => {
    const selectedTag = tagObj === null ? '__none__' : tagObj.tag_name;
    if (selectingModal.type === 'stat') {
      const next = [...statTags];
      next[selectingModal.index] = selectedTag;
      setStatTags(next);
    } else if (selectingModal.type === 'track') {
      const setters = { 1: setTrack1Tags, 2: setTrack2Tags, 3: setTrack3Tags };
      const states = { 1: track1Tags, 2: track2Tags, 3: track3Tags };
      const next = [...states[selectingModal.trackId]];
      next[selectingModal.index] = selectedTag;
      setters[selectingModal.trackId](next);
    }
    setSelectingModal(null);
    setTagSearch('');
  };

  // 🚀 Calculate the exact time window for all charts and the time axis
  const now = new Date().getTime();
  let currentTimeWindow = { start: now - (historyMinutes * 60000), end: now };
  if (timeMode === 'custom' && customStart && customEnd) {
    currentTimeWindow = {
      start: new Date(customStart).getTime(),
      end: new Date(customEnd).getTime()
    };
  }

  return (
    <div className="dashboard-grid">
      <TopBar rigInfo="ONGC ANK | Rig NG1500-4" />

      <div style={{ gridRow: '2', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--glass-border)' }}>
        <div style={{ padding: '8px', background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid var(--glass-border)' }}>
          <select
            value={timeMode === 'custom' ? 'custom' : historyMinutes}
            onChange={(e) => {
              if (e.target.value === 'custom') {
                setShowingTimeModal(true);
              } else {
                setTimeMode('minutes');
                setHistoryMinutes(Number(e.target.value));
              }
            }}
            className="dark-select"
            style={{ fontSize: '0.6rem', padding: '4px' }}
          >
            <option value={10}>10M</option>
            <option value={60}>1H</option>
            <option value={120}>2H</option>
            <option value={360}>6H</option>
            <option value={1440}>24H</option>
            <option value="custom">CST</option>
          </select>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* We calculate topPadding based on max axes (3 tags = 3 * 25 + 10) for alignment */}
          <div style={{ flex: 1 }}>
            <TimeAxis 
              times={timeLabels} 
              topPadding={10 + (3 * 25)} 
              bottomPadding={20} 
            />
          </div>
          {/* Spacer to account for the tracking-selection-container at the bottom of tracks (~110px) */}
          <div style={{ height: '110px' }} />
        </div>
      </div>

      <VerticalTrack
        id={1}
        activeTags={track1Tags}
        onSelectTag={(idx) => setSelectingModal({ type: 'track', trackId: 1, index: idx })}
        data={history}
        title="Track 1"
        timeWindow={currentTimeWindow}
      />

      <VerticalTrack
        id={2}
        activeTags={track2Tags}
        onSelectTag={(idx) => setSelectingModal({ type: 'track', trackId: 2, index: idx })}
        data={history}
        title="Track 2"
        timeWindow={currentTimeWindow}
      />

      <VerticalTrack
        id={3}
        activeTags={track3Tags}
        onSelectTag={(idx) => setSelectingModal({ type: 'track', trackId: 3, index: idx })}
        data={history}
        title="Track 3"
        timeWindow={currentTimeWindow}
      />

      <aside className="stats-panel">
        <h4 className="metric-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Live Sync</span>
          <span style={{ fontSize: '0.65rem', color: connected ? 'hsl(var(--accent-primary))' : 'orange' }}>
            {connected ? `● ${lastUpdate?.split('T')[1]?.substring(0, 8) || 'WAIT'}` : '○ DISCONNECTED'}
          </span>
        </h4>

        {/* Single Dual Gauge (Hookload & WOB) */}
        <div style={{ marginBottom: '10px' }}>
          <LiveGauge 
            hookload={data['DRI_Weight_WeightOnHook']} 
            wob={data['DRI_Weight_WeightOnBit']} 
          />
        </div>


        {statTags.map((tag, idx) => (
          <LiveStatBox
            key={idx}
            tag={tag === '__none__' ? 'None' : tag}
            value={tag === '__none__' ? null : data[tag]}
            isConnected={connected}
            onSelect={() => setSelectingModal({ type: 'stat', index: idx })}
          />
        ))}
      </aside>

      {/* Parameter Selection Modal */}
      {selectingModal !== null && (
        <div className="modal-overlay" onClick={() => { setSelectingModal(null); setTagSearch(''); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '1rem' }}>
              {selectingModal.type === 'track'
                ? `Track ${selectingModal.trackId} — Slot ${selectingModal.index + 1}`
                : `Stat Box ${selectingModal.index + 1}`}
            </h3>

            <input
              type="text"
              placeholder="Search tags..."
              value={tagSearch}
              onChange={e => setTagSearch(e.target.value)}
              className="modal-search"
              autoFocus
            />

            <div className="tag-list">
              {/* None option */}
              <div
                className="tag-list-item none-item"
                onClick={() => handleTagSelect(null)}
              >
                <div style={{ fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>— None —</div>
                <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>Hide this trend line</div>
              </div>

              {filteredTags.map(tagObj => (
                <div
                  key={tagObj.tag_name}
                  className="tag-list-item"
                  onClick={() => handleTagSelect(tagObj)}
                >
                  <div style={{ fontWeight: 700 }}>{tagObj.tag_name}</div>
                  <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>{tagObj.description || 'No Description'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Custom Time Selection Modal */}
      {showingTimeModal && (
        <div className="modal-overlay" onClick={() => setShowingTimeModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '1rem' }}>Enter Custom Range</h3>
            
            <div style={{ marginBottom: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label className="metric-label">Start Time</label>
                <input
                  type="datetime-local"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="dark-datetime"
                  autoFocus
                />
              </div>
              <div>
                <label className="metric-label">End Time</label>
                <input
                  type="datetime-local"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="dark-datetime"
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button 
                className="btn-primary" 
                style={{ flex: 1 }}
                onClick={() => {
                  setTimeMode('custom');
                  setShowingTimeModal(false);
                }}
              >
                APPLY RANGE
              </button>
              <button 
                className="btn-secondary" 
                style={{ 
                  flex: 1, 
                  background: 'rgba(255,255,255,0.05)', 
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                  borderRadius: '10px',
                  cursor: 'pointer'
                }}
                onClick={() => setShowingTimeModal(false)}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/hours" element={<RunHours />} />
        <Route path="/maintenance" element={<Maintenance />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
