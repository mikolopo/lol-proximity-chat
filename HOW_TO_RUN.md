# LoL Proximity Chat — Quick Start Guide

This project consists of two main parts: the **Voice Relay Server** (Node.js) and the **Client Application** (Tauri + React + Python YOLO).

## 1. How to run the Node.js Server (Required for Voice)
The server handles routing voice data between players in the same room.
You need to have this running (locally, or on a VPS) for people to connect.

1. Open a terminal and navigate to the `server` folder:
   ```bash
   cd server
   ```
2. Start the server (it will automatically install dependencies if it's the first time):
   ```bash
   start_server.bat
   ```
3. You should see `Voice Relay Server listening on port 8080`.

---

## 2. How to Open the App for Yourself (Development Mode)
If you want to test the app visually and make changes to the code:

1. Open a new terminal in the main project folder.
2. Navigate to the desktop app folder:
   ```bash
   cd desktop
   ```
3. Run the Tauri development command:
   ```bash
   npm run tauri dev
   ```
*This will pop open the React window and automatically spawn the Python background worker. The app will hot-reload if you save changes to the code.*

---

## 3. How to Build the `.exe` for Others
If you want to share the app with your friends so they can just double-click and play:

1. Ensure you are in the main project folder.
2. Double-click the **`build.bat`** file.
3. Wait a few minutes. The script will:
   - Compile your Python computer vision code into a hidden sidecar.
   - Bundle your React website into a native Windows application.
4. When the black window says "Build Complete", go to this folder:
   ```text
   desktop\src-tauri\target\release\bundle\msi\
   ```
5. You will find your installer file there (e.g., `desktop_0.1.0_x64_en-US.msi` or `.exe`). Send this file to your friends!
