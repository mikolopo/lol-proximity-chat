#!/bin/bash
echo "==================================================="
echo "  LoL Proximity Chat — Voice Relay Server (Linux)"
echo "==================================================="
echo ""

cd "$(dirname "$0")"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed!"
    echo ""
    echo "Install it with:"
    echo "  Ubuntu/Debian:  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs"
    echo "  Or via nvm:     curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash && nvm install 22"
    exit 1
fi

echo "Node.js version: $(node --version)"

# Install dependencies if not present
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    echo ""
fi

# Start server
echo "Starting server on port ${PORT:-8080}..."
echo "Press Ctrl+C to stop."
echo ""
node voice_server.js
