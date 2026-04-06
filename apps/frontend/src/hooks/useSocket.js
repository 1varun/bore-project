import { useState, useEffect, useRef } from 'react';

/**
 * useSocket - Enhanced High-Performance WebSocket Hook
 * Fix: Use window.location.hostname for dynamic connectivity + Better state merging.
 */
export function useSocket(defaultUrl = '/ws') {
    const [data, setData] = useState({});
    const [connected, setConnected] = useState(false);
    const [lastUpdate, setLastUpdate] = useState(null);
    
    const bufferRef = useRef({});
    const socketRef = useRef(null);
    const reconnectTimerRef = useRef(null);

    // Dynamic URL resolution: ws://[current_host]:3000/ws
    const wsUrl = `ws://${window.location.hostname}:3000/ws`;

    useEffect(() => {
        function connect() {
            const ws = new WebSocket(wsUrl);
            socketRef.current = ws;

            ws.onopen = () => {
                console.log('[WS] Connected to:', wsUrl);
                setConnected(true);
            };

            ws.onmessage = (event) => {
                try {
                    const payload = JSON.parse(event.data);
                    
                    // Python payloads are: { "data": { "TAG": val }, "timestamp": "...", "tier": 1 }
                    const incoming = payload.data || payload;
                    
                    // Merge into buffer
                    bufferRef.current = {
                        ...bufferRef.current,
                        ...incoming
                    };
                    
                    if (payload.timestamp) {
                        bufferRef.current.__last_ts = payload.timestamp;
                    }
                } catch (err) {
                    console.error('[WS] Parse Error:', err);
                }
            };

            ws.onclose = () => {
                setConnected(false);
                reconnectTimerRef.current = setTimeout(connect, 3000);
            };

            ws.onerror = (err) => {
                ws.close();
            };
        }

        connect();

        // 🚀 BATCH ENGINE: Flush buffer to React state every 100ms
        const updateInterval = setInterval(() => {
            const snapshot = { ...bufferRef.current };
            if (Object.keys(snapshot).length > 0) {
                // Functional update to avoid closure staleness
                setData(prev => ({
                    ...prev,
                    ...snapshot
                }));
                
                if (snapshot.__last_ts) {
                    setLastUpdate(snapshot.__last_ts);
                }
                
                // Clear the buffer after snapshotting
                bufferRef.current = {};
            }
        }, 100);

        return () => {
            if (socketRef.current) socketRef.current.close();
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            clearInterval(updateInterval);
        };
    }, [wsUrl]);

    return { data, connected, lastUpdate };
}
