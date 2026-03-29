# LoL Proximity Chat — Technical Overview

**LoL Proximity Chat** is a distributed real-time voice communication system for League of Legends that utilizes computer vision to achieve spatial audio immersion.

---

## System Architecture

The application is split into three decoupled components that interact via a high-performance IPC and network layer:

1.  **Detection Sidecar (client/)**: A Python-based engine responsible for screen capture, YOLO inference, and League API integration.
2.  **Desktop Client (desktop/)**: A Tauri + React application that manages the UI, voice processing pipeline, and sidecar lifecycle.
3.  **Relay Server (server/)**: A Node.js Socket.IO server that handles real-time signaling, voice relay, and user authentication.

---

## Detection Pipeline (client/)

The detection engine runs as a sidecar process to the main desktop application, communicating via JSON-formatted events over stdout.

### 1. High-Speed Capture
- **Technology**: mss (Multiple Screen Shot) library.
- **Workflow**: The engine captures specifically the bottom-right coordinate region of the screen (default minimap location).
- **Optimization**: Capturing only a sub-region significantly reduces CPU/GPU overhead and PCI-E bandwidth compared to full-frame capture.

### 2. AI Inference (YOLOv8)
- **Model**: A custom-trained YOLOv8 model exported to ONNX for low-latency CPU inference.
- **Workflow**: The captured minimap is processed via OpenCV and passed to the YOLO model to detect champion icons.
- **Output**: Returns normalized coordinates (0-1000 grid) for each detected champion.

### 3. Game State Integration
- **LCU API**: Queries the League Client for team rosters and game phase during lobby/champ-select.
- **Live Game API**: Periodically polls 127.0.0.1:2999 for real-time player data (e.g., Death status) to supplement the visual detection.

---

## Desktop Voice Engine (desktop/)

The desktop client implements a custom Web Audio pipeline designed for low latency and high clarity.

### 1. Voice Capture & Suppression
- **Codec**: Audio is captured as Float32 PCM at 48kHz.
- **Noise Suppression**: The engine utilizes RNNoise (AI-based suppression) compiled to WASM. It filters out non-voice noise (mechanical clicks, fans) before the audio is chunked for transmission.
- **Noise Gate**: A linear threshold gate (with a 150ms hold-timer) prevents "choppy" audio cut-offs.

### 2. Spatial Audio Processing
- **Logic**: Volume is recalculated for every received voice packet based on the distance between the local player and the remote speaker on the minimap grid.
- **Scaling**:
    - **Full Volume**: 0 - 80 units.
    - **Linear Fade**: 80 - 150 units.
    - **Muted**: > 150 units.
- **Dynamics Compression**: A global compressor on the output prevents volume spikes (clipping) when multiple players speak simultaneously.

---

## Networking & Persistence (server/)

The relay server ensures that all clients are synchronized and secure.

### 1. Real-Time Relay (Socket.IO)
- **Voice Relay**: Receives Base64-encoded PCM chunks from clients and broadcasts them to everyone in the same room.
- **State Sync**: Aggregates position updates from all players to create a "Shared Map View," handling Fog of War by using the reporter's team-context.

### 2. Authentication & Identity
- **Persistence**: SQLite3 database stores user credentials (bcrypt-hashed) and immutable userId UUIDs.
- **Authorization**: All Socket.IO connections require a JSON Web Token (JWT).
- **Room Management**: The creator of a room is assigned as the Host, granting permissions to kick players or lock the room.

---

## Data Protocols

### Voice Data Packet
```json
{
  "user_id": "uuid-v4",
  "player_name": "SummonerName",
  "champion_name": "Aatrox",
  "audio": "base64-pcm-float32",
  "position": { "x": 450, "y": 510 },
  "is_dead": false
}
```

### Detection Event (Sidecar -> UI)
```json
{
  "type": "positions",
  "data": {
    "Aatrox": { "x": 450, "y": 510, "confidence": 0.92 },
    "Jinx": { "x": 120, "y": 800, "confidence": 0.88, "is_dead": true }
  }
}
```

---

## Tech Stack Summary

| Layer | Key Technologies |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Tailwind CSS v4, Tauri 2 |
| **Audio** | Web Audio API, RNNoise (WASM), Opus |
| **Vision** | Python 3.10, OpenCV, Ultralytics YOLOv8 |
| **Server** | Node.js, Socket.IO, SQLite3, JWT |

---

**LoL Proximity Chat — Precision Immersion Layer**
