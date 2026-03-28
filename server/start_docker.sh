#!/bin/bash
echo "==================================================="
echo "  LoL Proximity Chat — Docker Startup (Linux)"
echo "==================================================="
echo ""

cd "$(dirname "$0")"

# Ensure data directory exists for SQLite
if [ ! -d "data" ]; then
    echo "Creating data directory..."
    mkdir -p data
fi

echo "Building Docker image..."
docker build -t lol-voice-server .

echo ""
echo "Removing old container..."
docker rm -f voice-server 2>/dev/null || true

echo ""
echo "Running Docker container (Port 8080)..."
docker run -d --name voice-server -p 8080:8080 -v $(pwd)/data:/app/data --restart unless-stopped lol-voice-server

echo ""
echo "Server is now running in the background!"
echo "To view live logs, run: docker logs -f voice-server"
echo "To stop the server, run: docker stop voice-server && docker rm voice-server"
echo "==================================================="
