FROM node:22-slim

LABEL maintainer="LoL Proximity Chat Team"
LABEL description="Voice relay server for LoL Proximity Chat (Node.js)"

WORKDIR /app

# Install native build tools for sqlite3/bcrypt if needed on node:22-slim
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install dependencies first (caching layer)
COPY package.json package-lock.json* ./
RUN npm ci --production


# Copy all server code (including auth, db, version, etc)
COPY *.js .

# Expose the relay port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD node -e "const http=require('http');const r=http.get('http://localhost:8080/health',res=>{process.exit(res.statusCode===200?0:1)});r.on('error',()=>process.exit(1))" || exit 1

# Run the server
ENV HOST=0.0.0.0
ENV PORT=8080

CMD ["node", "voice_server.js"]
