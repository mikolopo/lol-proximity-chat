# LoL Proximity Chat - Future To-Do List

## 🧹 Code Cleanup & Organization (De-Vibing)
- [ ] Refactor `desktop/src/App.tsx`: Split the massive 1,500-line monolith into smaller, manageable components (e.g., `ChatPanel`, `StreamViewer`, `LobbyControls`).
- [ ] Create custom React hooks for WebRTC, WebSocket, and Tauri IPC listeners to clean up `App.tsx` state.
- [ ] Replace `any` types with strict TypeScript interfaces for network packets and UI state.
- [ ] Remove unused/redundant Python scripts from the `client/` folder to clean up the backend sidecar.

## 🔊 Voice Chat Improvements
- [ ] Fix voice chat volume issues: Provide better default volume normalization or refine proximity scaling calculations.
- [ ] Add individual volume sliders for peers in the UI.

## 👁️ Computer Vision / Detection Logic
- [ ] **Gnar**: Handle dynamic form changes between Mini Gnar and Mega Gnar minimap icons.
- [ ] **Neeko**: Add logic to distinguish real Neeko from her passive transformations/clones.
- [ ] **Shaco**: Distinguish between the real Shaco and his ultimate clone on the minimap.
- [ ] **YOLO Maintenance**: Establish a pipeline/workflow for easily collecting screenshots and retraining the `best.onnx` model when new champions are released.
