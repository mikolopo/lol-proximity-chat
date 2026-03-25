# LoL Proximity Chat — Technical Documentation & Architecture

## 1. Overview
The "LoL Proximity Chat" is a standalone desktop application that provides proximity-based voice communications for League of Legends. It integrates real-time computer vision, the official League API, and low-latency audio transmission to mute players who are far away on the map and amplify those who are close.

## 2. Core Systems & Technical Implementation

### A. Game Phase & State Management
**Technologies:** LCU API (League Client Update) & Live Client Data API (In-game)
- **Polling System:** The app starts by polling for the `lockfile` of the League Client. Once found, it establishes an authenticated connection via the `LCUConnector`.
- **Pre-Game (Lobby/Champ Select):** During Champ Select, the LCU API is queried to extract the player roster and team assignments. This prepares the app before the loading screen even begins.
- **In-Game (Live Client API):** Once the match launches, the app automatically transitions by connecting to `127.0.0.1:2999`. It continuously updates the game time, verifying live champion rosters and resolving exact team IDs.
- **Phase Syncing:** The `update_game_phase()` function ensures the UI and Voice Server know if the user is in `WAITING_FOR_CHAMP_SEL`, `CHAMP_SELECT`, `LOADING`, or `IN_GAME`. During `LOBBY`/`CHAMP_SELECT`, voice chat functions as normal global comms. Proximity rules only activate during `IN_GAME`.

### B. Map Detection & Vision Pipeline (YOLOv8)
**Technologies:** OpenCV (`cv2`), `mss` (Screen Capture), PyTorch + Ultralytics (YOLO)
- **Zero-Hook Capture:** To maintain compliance with anti-cheat tools, the app uses passive screen capture (`mss`) targeting only the bottom-right corner of the screen where the minimap sits.
- **ROI Calibration:** The user configures their Minimap Region of Interest (ROI) using an interactive PyQt6 overlay. This saves coordinates to `minimap_config.json`.
- **YOLO Deep Learning:** Small minimap champion icons are analyzed by a bundled YOLOv8 model (`best.pt`). This runs continuously on a background thread (`DetectionWorker`).
- **Confidence & Merging:** Detected bounding boxes are matched against the loaded Live Client API roster. Because multiple teammates might see the same champion slightly differently, the app employs a **Visibility & Merging** algorithm (in `MergedPosition`) to fuse detections across clients and fade out "ghosts" when champions walk into the Fog of War.

### C. Voice Transmission & Proximity Processing
**Technologies:** Socket.IO, `sounddevice`, `opuslib_next`, NumPy, SciPy
- **Audio Capture Pipeline:** The `AudioCapture` thread grabs raw microphone data in 20ms frames at 48000Hz.
- **Compression:** Frames are encoded into highly compressed, low-latency packets using the Opus codec (`opuslib_next`), which is the industry standard for voice (used by Discord).
- **Relay Server:** Encoded audio packets are routed via a lightweight Socket.IO server running externally. The server associates packets with the user's current spatial coordinates.
- **Spatial Audio Math:** When audio is received by other clients, the `ProximityCalculator` computes the precise 2D Euclidean distance between the speaker and the listener on the map coordinate grid (0-1000 domain).
- **Volume & Visibility Decay:** If a player enters Fog of War, their volume is mathematically decayed based on the time since they were last seen (`last_known` logic), dropping to a base muffled volume (e.g., 40%) until re-detected.

### D. Graphical User Interface
**Technologies:** PyQt6
- **Real-Time Minimap Overlay:** A PyQt6 canvas (`QGraphicsView`) renders a real-time recreation of the minimap. Red and blue dots correspond to dynamically detected positions from YOLO and the server.
- **Dark Mode UI:** Designed with modern aesthetics in mind, featuring custom stylesheets, rounded borders, and dynamic status bars that update as the Game Phase shifts.
- **Device Selection:** Interactive combo boxes dynamically enumerate input/output audio devices using `sounddevice.query_devices()`.

### E. Portable Build System (DLL Hell Solution)
**Technologies:** Standalone Embedded Python, Windows Batch 
- **The Problem:** Standard compilers like PyInstaller notoriously fail when bundling massive C++ intensive libraries (PyTorch, OpenCV, SciPy, Numpy) due to overlapping DLL variants (e.g., duplicate `libiomp5md.dll` or `c10.dll` clashes causing WinError 1114).
- **The Portable Fix:** The build system was fully migrated to use an official, isolated "Embedded Python" environment via `build_portable.py`. 
- **Execution:** The script automatically downloads a clean Python 3.10.11 runtime, locally installs all constrained dependencies via `pip`, injects the `app/` path namespace, and generates a simple `LoLProximityChat.bat` launcher. This guarantees 100% stable library loading, faster startup times, and significantly easier debugging.

## 3. Architecture Flow
1. **User runs `LoLProximityChat.bat`** -> Launches embedded python environment.
2. `main.py` -> PyTorch preloads successfully in isolation.
3. `AppWindow` (PyQt6) -> Spawns UI and triggers the `DetectionWorker`.
4. `DetectionWorker` -> Uses `LCUConnector` to sense game start -> transitions to `LiveClientAPI` -> feeds roster into `YoloMatcher`.
5. `VoiceClient` -> Connects to Node/Socket.IO server -> begins streaming Opus compressed mic data.
6. `MinimapCapture` -> Captures ROI -> YOLO detects icons -> sends `(X, Y)` to `VoiceClient`.
7. `AudioPlayback` -> Receives (Opus Audio + `(X, Y)`) -> decodes -> calculates volume scale -> plays via `sounddevice`.
