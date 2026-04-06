import React, { useState, useEffect } from 'react';
import { useSocket } from './hooks/useSocket';
import TopBar from './components/TopBar';
import TimeAxis from './components/TimeAxis';
import VerticalTrack from './components/VerticalTrack';
import LiveStatBox from './components/LiveStatBox';

/**
 * Vertical Log Drilling Dashboard
 * Layout: TopBar | [Time | Track1 | Track2 | Track3 | Stats]
 */
function App() {
  const { data, connected, lastUpdate } = useSocket();
  
  // Track State: 3 parameters active for each track
  const [track1Tags, setTrack1Tags] = useState(['CWK_CARRIER_AutoMode_Spee', 'DSLinkExtSpdLimbve', 'ACS_AXIS_PosMin']);
  const [track2Tags, setTrack2Tags] = useState(['ACS_AXIS_Vel', 'VPH_X_Diag_RM02', 'VPH_Y_Diag_RM02']);
  const [track3Tags, setTrack3Tags] = useState(['VPH_Y_Diag_SN02SP66', 'VPH_Winch_Diag_SP70', 'VPH_Winch_Diag_SP71']);

  // Stat Boxes State: Customizable list of 6 stat boxes
  const [statTags, setStatTags] = useState([
    'CWK_CARRIER_AutoMode_Spee', 'DSLinkExtSpdLimbve', 'ACS_AXIS_PosMin', 
    'ACS_AXIS_Vel', 'VPH_X_Diag_RM02', 'VPH_Y_Diag_RM02'
  ]);

  // Global Time Range
  const [timeMode, setTimeMode] = useState('minutes'); // 'minutes' or 'custom'
  const [historyMinutes, setHistoryMinutes] = useState(120);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // All available tags for selection
  const [allTags, setAllTags] = useState([]);
  
  // Selection Modal State: { type: 'stat' | 'track', trackId?: 1|2|3, index: 0..5 }
  const [selectingModal, setSelectingModal] = useState(null); 

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
      const activeTags = [...track1Tags, ...track2Tags, ...track3Tags];
      const uniqueTags = [...new Set(activeTags)]; 
      
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

  // Generate time labels for the vertical axis based on selected range
  const timeLabels = Array.from({ length: 15 }).map((_, i) => {
    if (timeMode === 'custom' && customStart && customEnd) {
      const startMs = new Date(customStart).getTime();
      const endMs = new Date(customEnd).getTime();
      if(isNaN(startMs) || isNaN(endMs)) return '--:--';
      const d = new Date(endMs - (i * ((endMs - startMs)/14)));
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      const d = new Date();
      d.setMinutes(d.getMinutes() - (i * (historyMinutes / 14)));
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  });

  return (
    <div className="dashboard-grid">
      <TopBar rigInfo="ONGC ANK | Rig NG1500-4" />

      <TimeAxis times={timeLabels} />

      <VerticalTrack 
        id={1} 
        activeTags={track1Tags}
        onSelectTag={(idx) => setSelectingModal({ type: 'track', trackId: 1, index: idx })}
        data={history}
        title="Track 1"
      />

      <VerticalTrack 
        id={2} 
        activeTags={track2Tags}
        onSelectTag={(idx) => setSelectingModal({ type: 'track', trackId: 2, index: idx })}
        data={history}
        title="Track 2"
      />

      <VerticalTrack 
        id={3} 
        activeTags={track3Tags}
        onSelectTag={(idx) => setSelectingModal({ type: 'track', trackId: 3, index: idx })}
        data={history}
        title="Track 3"
      />

      <aside className="stats-panel">
        <h4 className="metric-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Live Sync</span>
          <span style={{ fontSize: '0.65rem', color: connected ? 'var(--accent-primary)' : 'orange' }}>
            {connected ? `OK • ${lastUpdate?.split('T')[1]?.substring(0,8) || 'WAIT'}` : 'DISCONNECTED'}
          </span>
        </h4>
        
        {/* Time scale selector inside the stats panel */}
        <div style={{ marginBottom: '10px' }}>
             <select 
                value={timeMode === 'custom' ? 'custom' : historyMinutes} 
                onChange={(e) => {
                    if (e.target.value === 'custom') {
                        setTimeMode('custom');
                        const end = new Date();
                        const start = new Date(end.getTime() - 2 * 60 * 60 * 1000);
                        const toLocalISO = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                        if (!customStart) setCustomStart(toLocalISO(start));
                        if (!customEnd) setCustomEnd(toLocalISO(end));
                    } else {
                        setTimeMode('minutes');
                        setHistoryMinutes(Number(e.target.value));
                    }
                }}
                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', padding: '8px', borderRadius: '8px', cursor: 'pointer', outline: 'none' }}
             >
                <option value={10}>Track Scale: 10 Min</option>
                <option value={60}>Track Scale: 1 Hour</option>
                <option value={120}>Track Scale: 2 Hours</option>
                <option value={360}>Track Scale: 6 Hours</option>
                <option value={1440}>Track Scale: 24 Hours</option>
                <option value="custom">Track Scale: Custom...</option>
             </select>
        </div>

        {timeMode === 'custom' && (
            <div style={{ marginBottom: '15px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Start Time</div>
                <input 
                    type="datetime-local" 
                    value={customStart}
                    onChange={e => setCustomStart(e.target.value)}
                    style={{ width: '100%', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', padding: '5px', borderRadius: '4px', outline: 'none' }}
                />
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '5px' }}>End Time</div>
                <input 
                    type="datetime-local" 
                    value={customEnd}
                    onChange={e => setCustomEnd(e.target.value)}
                    style={{ width: '100%', background: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', padding: '5px', borderRadius: '4px', outline: 'none' }}
                />
            </div>
        )}

        {statTags.map((tag, idx) => (
          <LiveStatBox 
            key={idx}
            tag={tag}
            value={data[tag]}
            isConnected={connected}
            onSelect={() => setSelectingModal({ type: 'stat', index: idx })}
          />
        ))}
      </aside>

      {/* Parameter Selection Modal */}
      {selectingModal !== null && (
        <div className="modal-overlay" onClick={() => setSelectingModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: '1.5rem' }}>
                Change Parameter for {selectingModal.type === 'track' ? `Track ${selectingModal.trackId} (Slot ${selectingModal.index + 1})` : `Stat Box`}
            </h3>
            <div className="tag-list">
              {allTags.map(tagObj => (
                <div 
                  key={tagObj.tag_name} 
                  className="tag-list-item"
                  onClick={() => {
                    if (selectingModal.type === 'stat') {
                        const next = [...statTags];
                        next[selectingModal.index] = tagObj.tag_name;
                        setStatTags(next);
                    } else if (selectingModal.type === 'track') {
                        const setters = { 1: setTrack1Tags, 2: setTrack2Tags, 3: setTrack3Tags };
                        const states = { 1: track1Tags, 2: track2Tags, 3: track3Tags };
                        const next = [...states[selectingModal.trackId]];
                        next[selectingModal.index] = tagObj.tag_name;
                        setters[selectingModal.trackId](next);
                    }
                    setSelectingModal(null);
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{tagObj.tag_name}</div>
                  <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>{tagObj.description || 'No Description'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
