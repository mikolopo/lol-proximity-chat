# Voice Relay Server

Node.js + Socket.IO server that routes voice data between players in the same room.

## Running it

**Windows:**
```
start_server.bat
```

**Linux / VPS:**
```bash
chmod +x start_server.sh
./start_server.sh
```

**Docker:**
```bash
docker compose up -d
```

## Config

| Variable | Default | What it does |
|----------|---------|--------------|
| `PORT` | `8080` | Port to listen on |
| `HOST` | `0.0.0.0` | Bind address |

## Endpoints

- `GET /` — health check
- `GET /rooms` — list active rooms and players
