# LoL Proximity Chat

Proximity voice chat for League of Legends. Players near you on the minimap can hear you. Players far away can't.

## Running the Server

The server relays voice between players. You need this running before anyone can connect.

1. Go into the `server` folder and run `start_server.bat`
2. You should see: `Voice Relay Server listening on port 8080`

That's it. Leave it running in the background. You can host this on a VPS if you want others to connect over the internet.

## Running the App (Dev Mode)

```bash
cd desktop
npm run tauri dev
```

The window opens, the Python worker starts in the background. Changes to the code hot-reload automatically.

## Building for Others

Double-click `build.bat` and wait a few minutes. When it's done you'll find the installer here:

```
desktop\src-tauri\target\release\bundle\msi\
```

Send that `.msi` file to your friends.

## How It Works

- The app watches the minimap using your screen (just the minimap corner, nothing else)
- YOLO detects where each champion is on the map
- Based on distance, your voice volume is scaled up or down for each player
- Champions in fog of war get faded out gradually
- Teams use the League Live Client API to figure out who's on which side

## Requirements

- Windows 10/11
- League of Legends installed
- Node.js (for the server)
- Python 3.10+ with dependencies from `requirements.txt` (only needed for dev)
