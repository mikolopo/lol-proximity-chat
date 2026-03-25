# LoL Proximity Chat — Voice Relay Server

High-performance Node.js Socket.IO relay server for proximity-based voice chat.

## Requirements
- **Node.js 18+** (v22 recommended)

## Quick Start

### Windows
```
Double-click start_server.bat
```

### Linux / Ubuntu Server
```bash
chmod +x start_server.sh
./start_server.sh
```

### Docker
```bash
docker compose up -d
```

## Configuration (Environment Variables)
| Variable | Default | Description |
|----------|---------|-------------|
| `HOST`   | `0.0.0.0` | Bind address |
| `PORT`   | `8080`    | Listen port  |

## API Endpoints
| Endpoint   | Description |
|-----------|-------------|
| `GET /`       | Health check (JSON) |
| `GET /health` | Health check (JSON) |
| `GET /rooms`  | List active rooms |
| `GET /debug`  | Internal state debug |

## Socket.IO Events

### Client → Server
| Event | Description |
|-------|-------------|
| `join_room` | Join/create a voice room |
| `leave_room` | Leave current room |
| `voice_data` | Send encoded Opus audio + position |
| `position_update` | Lightweight position-only update |
| `detected_positions` | Report YOLO-detected minimap positions |
| `update_game_phase` | Report game phase change |
| `update_room_settings` | Modify room settings |

### Server → Client
| Event | Description |
|-------|-------------|
| `room_joined` | Confirmation of room join |
| `room_error` | Error message |
| `player_joined` | Another player joined |
| `player_left` | Another player left |
| `voice_data` | Relayed audio from another player |
| `player_positions` | Merged positions broadcast (4 Hz) |
| `room_settings_updated` | Room settings changed |
