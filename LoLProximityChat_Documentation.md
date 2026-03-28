# LoL Proximity Chat — Technical Overview

A proximity voice chat app for League of Legends. Players near you on the minimap can hear you clearly. Players far away are quiet or muted entirely.

## How It Works

### Minimap Detection
The app captures just the bottom-right corner of your screen where the minimap is — no other part of your screen is read. A YOLO model trained on champion icons figures out where each player is on the map in real time.

### Voice
Your microphone audio is compressed with Opus (the same codec Discord uses) and sent to a relay server. Other players' clients receive it and adjust the volume based on in-game distance. If someone walks into fog of war, their audio fades out gradually.

### Team Detection
Before the game starts the app talks to the League Client (LCU API) to figure out whos on your team. Once in-game it switches to the Live Client API at `127.0.0.1:2999` to keep that info up to date.

### Global Accounts & Room Moderation
To prevent abuse, users must create a persistent account (stored in an SQLite database). 
- **Authentication**: Users register using an Email, Display Name, and Password. Old accounts can log in via their legacy username.
- **Identity**: Internally, users are tracked via an immutable `userId` UUID. This prevents impersonation, ensures stable WebRTC bindings, and allows users to freely change their `display name` without breaking the system.
- **Security**: Socket connections are authorized via JSON Web Tokens (JWT). The user who creates a room is designated as the Host (`hostId` binding), giving them the ability to lock the room, require a password, or kick abusive players by their `userId`.

## Architecture

```
League Client (LCU) ──► ipc_worker.py ──► Minimap Capture (mss)
                                     └──► YOLO Detection
                                     └──► Position → Voice Server (Socket.IO + Auth)
                                                        └──► SQLite (Users & Passwords)
                                                        └──► Other players
```

The Python sidecar (`ipc_worker.py`) handles all the computer vision. The Tauri desktop app handles UI, JWT authentication, and voice. They communicate over stdin/stdout.

## Project Structure

```
client/          Python backend (capture, detection, API wrappers)
desktop/         Tauri + React frontend
server/          Node.js Socket.IO relay server
```

## Stack

- **Frontend:** React + TypeScript, bundled as a native app via Tauri (Rust)
- **Computer Vision:** Python, OpenCV, YOLO (Ultralytics), mss screen capture
- **Voice:** Opus codec, WebRTC-style audio pipeline
- **Server:** Node.js, Socket.IO, SQLite3, bcrypt, jsonwebtoken
