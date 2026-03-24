# Drilling Rig Dashboard - Project Walkthrough

The architecture for the drilling rig dashboard has been successfully implemented using an **Event-Driven Microservices Architecture** completely isolated within Docker Compose. This ensures that any fault in a selected feature (like Modbus or WITSML) will never disturb the other features (Requirement 7).

## Components Deployed

### 1. Central Message Broker (MQTT)
- Uses `eclipse-mosquitto` acting as the central nervous system.
- Port: `1883`

### 2. Time-Series Database
- Uses `timescaledb:latest-pg16` for efficient time-series data storage.
- Port: `5432` 

### 3. PLC Ingestion Service 
- A Node.js container `bore_ingestion` that connects to the Siemens S7-1500 PLC (with fallback simulation built-in if disconnected).
- Publishes high-frequency rig data (Depth, RPM, WOB, etc.) to the MQTT broker.

### 4. Database Writer Service
- A Node.js container `bore_db_writer` that subscribes to the MQTT live data and executes efficient inserts into the TimescaleDB hypertable `drilling_data`.
- Because it operates independently, DB connectivity faults do not impact the live UI stream.

### 5. Backend API & WebSockets Server
- An Express API `bore_backend` handling `/api/history` queries for graph data.
- A `Socket.io` server listening to MQTT and streaming live data directly to the web UI.
- Port: `3000`

### 6. Modbus TCP Gateway
- A standalone container `bore_modbus` mapping the live MQTT data stream to continuous 16-bit Modbus holding registers (using Float32 precision).
- Port: `5020` (use Modbus Poll to connect)

### 7. WITSML XML Gateway
- A standalone container `bore_witsml` that builds WITSML 1.4.1.1 compliant XML documents on request using the latest rig data from the MQTT stream.
- Port: `8080` (Endpoint: `http://localhost:8080/witsml/logs`)

### 8. Premium Web UI (React + Vite)
- A highly responsive glassmorphism dark-mode React application `bore_frontend`.
- Connects to WebSockets for live gauge telemetry.
- Connects to REST API for mapping `ECharts` history.
- Includes a direct "Export PDF" feature that captures the interactive chart frame flawlessly using `html2canvas` and `jsPDF`.
- URL: `http://localhost:5173`

### 9. Transmission Configuration UI (Dynamic Controls)
- The dashboard now features a built-in Settings Panel.
- Using a REST API and MQTT inter-process broadcasting, you can Enable/Disable WITSML and Modbus independently and change connection properties (like Well Name) directly from the UI without restarting the containers.

## How to use:
All 7 services are running seamlessly via Docker Compose in the background. To view your premium dashboard, navigate to `http://localhost:5173` in your browser.
