

##  How It Works - or doesn't 

1.  **Minimap Capture:** The app captures *only* the bottom-right corner of your screen (where the minimap lives) using high-speed screen capture (`mss`).
2.  **AI Detection:** A Python-based sidecar runs a YOLOv8 model on the capture to identify champion positions.
3.  **Game State:** It queries the League Client (LCU) and Live Game API to identify team rosters and game status.
4.  **Audio Processing:** Your voice is captured, suppressed of noise, and sent to a Node.js relay server.
5.  **Spatial Mix:** The app calculates the distance between you and other players. Their audio is then mixed in real-time using the Web Audio API, adjusting volume and panning (if enabled) based on minimap coordinates.

---

##  Getting Started

### Prerequisites

- **OS:** Windows 10/11
- **Game:** League of Legends (Running in Borderless or Windowed mode is recommended)
- **Runtime:** [Node.js](https://nodejs.org/) (for hosting the server)

### Hosting the Server (Relay)

The server handles voice transmission and account management.

1.  Navigate to the `server/` directory.
2.  Install dependencies: `npm install`
3.  Run the server: `start_server.bat` (or `npm start`).
4.  The server will listen on port **8080**.

### Running the App

1.  **Download the Installer:** Grab the latest `.msi` from the releases page (or build your own).
2.  **Launch the App:** Log in or create an account.
3.  **Join a Room:** Create or join a room using the sidebar.
4.  **Play:** Once League of Legends starts, the app will automatically begin tracking icons.

---

##  Usage Tips & Best Practices

- ** Borderless Mode:** For the best experience, run League in **Borderless** mode so the app can reliably capture the minimap without focus issues.
- ** Minimap Size:** Ensure your minimap is visible and not scaled down to sub-atomic levels. Standard scaling (33% or higher) works best for YOLO detection.
- ** Manual Rescan:** If a champion icon gets "stuck" or detection seems desynced, use the **Manual YOLO Rescan** button in the dashboard to recalibrate the capture.
- ** Mic Calibration:** Use the built-in Mic Test in settings to adjust your **Noise Gate**. This ensures you don't broadcast your keyboard clicking to your teammates.

---

##  Advanced Technical Details

### Server Configuration
The relay server can be configured using environment variables:
- `PORT`: The port to listen on (default: `8080`).
- `HOST`: The host interface (default: `0.0.0.0`).

### Audio Distance Calculation
The proximity logic uses the following internal constants (found in `VoiceManager.ts`):
- `startDropDist`: Volume starts to fade at **80 grid units**.
- `maxDist`: Volume hits zero at **150 grid units**.
- `lastKnownThreshold`: If a player leaves vision, they remain audible for **3 seconds** at their last known position before fading entirely.

### Voice Pipeline
`Mic -> RNNoise (WASM) -> Gain (Local) -> Opus/Socket.IO -> Server -> Peer -> Dynamics Compressor -> Output`

---

##  Troubleshooting FAQ

**Q: The app isn't detecting icons on the map.**
A: Make sure your game resolution matches your Windows display resolution and that the minimap isn't obscured by other overlays (like Blitz or OP.GG). Try clicking "Manual Rescan".

**Q: I can't connect to my friend's server.**
A: Ensure the host has port `8080` (or their custom port) open on their router's firewall (Port Forwarding).

**Q: I hear "echo" or background noise.**
A: Enable **RNNoise** in the audio settings. This AI-powered suppression is highly effective at removing constant hums and clicks.


---

##  Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Lucide Icons.
- **Desktop Wrapper:** Tauri 2 (Rust).
- **Detection Engine:** Python 3.10, OpenCV, Ultralytics YOLOv8.
- **Audio Pipeline:** Web Audio API, Opus, RNNoise (WASM).
- **Backend:** Node.js, Socket.IO, SQLite3, JWT.

---

##  Project Structure

```bash
├── client/      # Python Sidecar (Screen capture, YOLO detection, API)
├── desktop/     # Tauri + React application (UI and Audio Pipeline)
├── server/      # Node.js Socket.IO Relay & Auth Server
└── build.bat    # One-click build script for the entire project
```

---

##  Disclaimer

**LoL Proximity Chat** is a third-party tool. While it only reads the minimap pixels and official Riot APIs (LCU/Live Game API), use it at your own risk. We are not responsible for any actions taken by Riot Games (Vanguard/Account Bans). We strive to stay within the bounds of "fair play" by only using information visible to the player.





please let me out
