import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import LiveGauge from './components/LiveGauge';
import HistoryChart from './components/HistoryChart';
import Settings from './components/Settings';

function App() {
    const [liveData, setLiveData] = useState({});
    const [connected, setConnected] = useState(false);
    const [view, setView] = useState('dashboard'); // 'dashboard' or 'settings'

    useEffect(() => {
        // Connect to the backend WebSocket
        const socket = io('http://localhost:3000');

        socket.on('connect', () => {
            setConnected(true);
        });

        socket.on('disconnect', () => {
            setConnected(false);
        });

        socket.on('live_data', (data) => {
            setLiveData(data);
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    return (
        <div className="dashboard-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1>
                    Drilling Rig Dashboard
                    {connected && (
                        <span className="live-indicator">
                            <span className="live-dot"></span> LIVE
                        </span>
                    )}
                </h1>
                {view === 'dashboard' && (
                    <button className="btn-print" style={{ background: '#4b5563' }} onClick={() => setView('settings')}>⚙️ Settings</button>
                )}
            </div>

            {view === 'dashboard' ? (
                <>
                    <div className="metrics-grid">
                        <LiveGauge title="Depth" value={liveData.Depth} unit="ft" />
                        <LiveGauge title="Bit Depth" value={liveData.BitDepth} unit="ft" />
                        <LiveGauge title="Hook Load" value={liveData.HookLoad} unit="klbs" />
                        <LiveGauge title="Weight on Bit (WOB)" value={liveData.WOB} unit="klbs" />
                        <LiveGauge title="Rotary (RPM)" value={liveData.RPM} unit="rpm" />
                        <LiveGauge title="Torque" value={liveData.Torque} unit="ft-lbs" />
                        <LiveGauge title="Standpipe Press. (SPP)" value={liveData.SPP} unit="psi" />
                    </div>

                    <HistoryChart />
                </>
            ) : (
                <Settings onClose={() => setView('dashboard')} />
            )}
        </div>
    );
}

export default App;
