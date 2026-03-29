// voice server relay
const http = require("http");
const { Server } = require("socket.io");
const { handleAuthRoutes, verifyToken } = require("./auth");
const { getRequiredVersion } = require("./version");
const crypto = require("crypto");
const db = require("./db");

// config
const HOST = process.env.HOST || "0.0.0.0";
const PORT = parseInt(process.env.PORT || "8080", 10);

const HEARTBEAT_TIMEOUT_S = 45.0;
const POSITION_BROADCAST_HZ = 10;
const POSITION_BROADCAST_INTERVAL = 1000 / POSITION_BROADCAST_HZ; // ms
const CLEANUP_INTERVAL_S = 10.0;
const STATS_INTERVAL_S = 10.0;


const ROOM_TYPE_NORMAL = "normal";
const ROOM_TYPE_PROXIMITY = "proximity";
const VALID_ROOM_TYPES = new Set([ROOM_TYPE_NORMAL, ROOM_TYPE_PROXIMITY]);

const VIS_SEEN = "seen";
const VIS_HIDDEN = "hidden";
const VIS_LAST_KNOWN = "last_known";

const PHASE_LOBBY = "lobby";
const PHASE_CHAMP_SELECT = "champ_select";
const PHASE_LOADING = "loading";
const PHASE_IN_GAME = "in_game";
const PHASE_ORDER = [PHASE_LOBBY, PHASE_CHAMP_SELECT, PHASE_LOADING, PHASE_IN_GAME];

const STALE_SEEN_THRESHOLD = 3.0;   // seconds before "last_known"
const STALE_GONE_THRESHOLD = 15.0;  // seconds before removed entirely
const NEAR_DISTANCE_THRESHOLD = 50; // grid units for stacking



/**
 * @typedef {Object} PlayerInfo
 * @property {string} sid
 * @property {string} playerName
 * @property {string} roomCode
 * @property {string} team
 * @property {string} gamePhase
 * @property {number} x
 * @property {number} y
 * @property {boolean} isDead
 * @property {number} lastHeartbeat
 */

/**
 * @typedef {Object} MergedPosition
 * @property {string} championName
 * @property {string} team
 * @property {number} x
 * @property {number} y
 * @property {boolean} isDead
 * @property {string} visibility
 * @property {number} confidence
 * @property {number} lastUpdate
 * @property {Map<string, number>} lastSeenBy  sid → timestamp
 * @property {string|null} nearbyChampion
 */

/**
 * @typedef {Object} Room
 * @property {string} roomCode
 * @property {string} roomName
 * @property {string} roomType
 * @property {boolean} teamOnly
 * @property {boolean} deadChat
 * @property {string} gamePhase
 * @property {Map<string, PlayerInfo>} players  sid → PlayerInfo
 * @property {Map<string, MergedPosition>} mergedPositions  championName → MergedPosition
 * @property {Object} teamRosters  "blue" → [...], "red" → [...]
 * @property {number} createdAt
 * @property {number} packetsIn
 * @property {number} packetsOut
 */

function createPlayer(sid, userId, playerName, roomCode, team = "", gamePhase = PHASE_IN_GAME, championName = "") {
    return {
        sid,
        userId,
        playerName,
        roomCode,
        team,
        gamePhase,
        championName,
        x: 500,
        y: 500,
        isDead: false,
        lastHeartbeat: Date.now() / 1000,
    };
}

function createMergedPosition(championName, team = "", x = -1, y = -1, isDead = false) {
    return {
        championName,
        team,
        x,
        y,
        isDead,
        visibility: VIS_SEEN,
        confidence: 1.0,
        lastUpdate: Date.now() / 1000,
        reports: new Map(), // sid -> { x, y, isDead, confidence, team, timestamp }
        seenBy: { blue: false, red: false },
        nearbyChampion: null,
    };
}

function createRoom(roomCode, hostId, roomType = ROOM_TYPE_PROXIMITY, teamOnly = false, deadChat = true) {
    return {
        roomCode,
        hostId,
        password: null, // For future password setup
        isLocked: false,
        isHidden: false,
        roomName: "",
        roomType,
        teamOnly,
        deadChat,
        gamePhase: PHASE_IN_GAME,
        players: new Map(),
        mergedPositions: new Map(),
        teamRosters: {},
        playerRosters: new Map(), // sid -> { blue: [], red: [] }
        createdAt: Date.now() / 1000,
        emptySince: Date.now() / 1000, // Tracks how long room has been empty
        packetsIn: 0,
        packetsOut: 0,
    };
}


/** @type {Map<string, Room>} */
const rooms = new Map();
/** @type {Map<string, string>} sid → roomCode */
const sidToRoom = new Map();

function getRoomsList() {
    const spaceList = [];
    for (const [code, room] of rooms) {
        if (room.isHidden) continue;
        spaceList.push({
            code,
            name: room.roomName,
            type: room.roomType,
            team_only: room.teamOnly,
            dead_chat: room.deadChat,
            is_locked: room.isLocked,
            has_password: !!room.password,
            host_id: room.hostId,
            players: room.players.size,
            player_names: [...room.players.values()].map((p) => p.playerName),
            players_data: [...room.players.values()].map((p) => ({ 
                name: p.playerName, 
                champ: p.championName,
                user_id: p.userId
            })),
        });
    }
    return spaceList;
}

function broadcastGlobalLobby() {
    io.to("global_lobby").emit("available_rooms_updated", { rooms: getRoomsList() });
}


const httpServer = http.createServer((req, res) => {
    // CORS headers for all HTTP endpoints
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    // Intercept Auth routes
    if (handleAuthRoutes(req, res)) return;

    // Simple HTTP routing for health/debug endpoints
    if (req.url === "/health" || req.url === "/") {
        const roomInfo = {};
        for (const [code, room] of rooms) {
            roomInfo[code] = {
                type: room.roomType,
                team_only: room.teamOnly,
                dead_chat: room.deadChat,
                players: room.players.size,
                player_names: [...room.players.values()].map((p) => p.playerName),
            };
        }
        let totalPlayers = 0;
        for (const room of rooms.values()) totalPlayers += room.players.size;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            status: "ok",
            rooms: rooms.size,
            total_players: totalPlayers,
            room_details: roomInfo,
        }));
        return;
    }

    if (req.url === "/rooms") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ rooms: getRoomsList() }));
        return;
    }

    if (req.url === "/debug") {
        const appRooms = {};
        for (const [code, room] of rooms) {
            appRooms[code] = [...room.players.values()].map((p) => p.playerName);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            app_rooms: appRooms,
            sid_to_room: Object.fromEntries(sidToRoom),
        }));
        return;
    }

    res.writeHead(404);
    res.end("Not found");
});

const io = new Server(httpServer, {
    cors: { origin: "*" },
    pingInterval: 10000,
    pingTimeout: 20000,
    maxHttpBufferSize: 1e6, // 1MB max packet
});

const socketJoinAttempts = new Map();

function generateRoomCode() {
    return crypto.randomBytes(3).toString("hex").toUpperCase();
}

// Authentication Middleware for Socket.io
io.use((socket, next) => {
    const clientVersion = socket.handshake.auth.version;
    if (clientVersion !== getRequiredVersion()) {
        return next(new Error("outdated_client"));
    }

    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Authentication error: No token provided"));
    
    const decoded = verifyToken(token);
    if (!decoded) return next(new Error("Authentication error: Invalid or expired JWT token"));

    socket.userId = decoded.userId;
    socket.username = decoded.username; // Trust verified JWT username
    next();
});



function now() {
    return Date.now() / 1000;
}

function log(msg) {
    const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
    console.log(`${ts} [INFO] ${msg}`);
}

async function removePlayer(sid) {
    const roomCode = sidToRoom.get(sid);
    if (!roomCode) return;
    sidToRoom.delete(sid);

    const room = rooms.get(roomCode);
    if (!room) return;

    const player = room.players.get(sid);
    if (player) {
        room.players.delete(sid);
        
        // Force the socket to leave the Socket.IO room (very important for audio isolation)
        const socket = io.sockets.sockets.get(sid);
        if (socket) {
            socket.leave(roomCode);
        }

        // Notify remaining players using native room broadcast
        io.to(roomCode).emit("player_left", {
            player_name: player.playerName,
            user_id: player.userId
        });
        log(`${player.playerName} left room '${roomCode}' (${room.players.size} remaining)`);
    }

    // Cleanup empty rooms logic
    if (room.players.size === 0) {
        room.emptySince = Date.now() / 1000;
        log(`Room '${roomCode}' is now empty (waiting 10 mins before deletion)`);
        broadcastGlobalLobby();
    } else {
        // Reassign host if the host left
        if (room.hostId === player.userId) {
            const nextPlayer = Array.from(room.players.values())[0];
            if (nextPlayer) {
                room.hostId = nextPlayer.userId;
                log(`Host for room '${roomCode}' transferred to ${nextPlayer.playerName}`);
            }
        }
        broadcastRoomState(roomCode);
        broadcastGlobalLobby(); // Update player counts globally
    }
}

function broadcastRoomState(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    const playersData = [...room.players.values()].map((p) => ({
        sid: p.sid,
        name: p.playerName,
        user_id: p.userId,
        champ: p.championName,
        team: p.team,
        is_streaming: p.isStreaming || false,
        game_phase: p.gamePhase
    }));

    io.to(roomCode).emit("room_state", {
        room_code: roomCode,
        room_type: room.roomType,
        team_only: room.teamOnly,
        dead_chat: room.deadChat,
        game_phase: room.gamePhase,
        host_id: room.hostId,
        is_locked: room.isLocked,
        has_password: !!room.password,
        players: playersData,
        team_rosters: room.teamRosters
    });
}



io.on("connection", (socket) => {
    log(`Client connected: ${socket.id}`);

    socket.on("disconnect", async () => {
        log(`Client disconnected: ${socket.id}`);
        await removePlayer(socket.id);
    });

    socket.on("join_global_lobby", () => {
        socket.join("global_lobby");
        socket.emit("available_rooms_updated", { rooms: getRoomsList() });
        log(`Client subscribed to global_lobby: ${socket.id}`);
    });

    socket.on("create_room", (data) => {
        let roomCode = generateRoomCode();
        while (rooms.has(roomCode)) {
            roomCode = generateRoomCode();
        }

        let roomType = (data.room_type || ROOM_TYPE_PROXIMITY).toLowerCase();
        if (!VALID_ROOM_TYPES.has(roomType)) roomType = ROOM_TYPE_PROXIMITY;

        const teamOnly = data.team_only || false;
        const deadChat = data.dead_chat !== undefined ? data.dead_chat : true;
        
        const newRoom = createRoom(roomCode, socket.userId, roomType, teamOnly, deadChat);
        newRoom.roomName = String(data.room_name || "New Room").slice(0, 32);
        newRoom.isHidden = Boolean(data.is_hidden);
        newRoom.password = data.password ? String(data.password) : null;
        
        rooms.set(roomCode, newRoom);
        log(`Room '${roomCode}' explicitly created by ${socket.username} (${socket.userId})`);
        broadcastGlobalLobby();
        socket.emit("room_created_success", { room_code: roomCode, room_name: newRoom.roomName });
    });

    socket.on("join_room", async (data) => {
        let roomCode = (data.room_code || "").trim().toUpperCase();
        const playerName = data.player_name || "Unknown";
        const championName = data.champion_name || "";
        let roomType = (data.room_type || ROOM_TYPE_PROXIMITY).toLowerCase();
        const team = data.team || "";
        const gamePhase = data.game_phase || PHASE_IN_GAME;

        if (!roomCode) {
            socket.emit("room_error", { message: "Room code cannot be empty" });
            return;
        }
        if (!VALID_ROOM_TYPES.has(roomType)) {
            roomType = ROOM_TYPE_PROXIMITY;
        }

        // Remove from any existing room
        if (sidToRoom.has(socket.id)) {
            await removePlayer(socket.id);
        }

        // Create room if needed
        if (!rooms.has(roomCode)) {
            const teamOnly = data.team_only || false;
            const deadChat = data.dead_chat !== undefined ? data.dead_chat : true;
            rooms.set(roomCode, createRoom(roomCode, socket.userId, roomType, teamOnly, deadChat));
            log(`Room '${roomCode}' created implicitly by ${socket.username}`);
        }

        const room = rooms.get(roomCode);
        
        const nowMs = Date.now();
        const limitRecord = socketJoinAttempts.get(socket.id) || { count: 0, lockedUntil: 0 };
        if (limitRecord.lockedUntil > nowMs) {
            const timeLeft = Math.ceil((limitRecord.lockedUntil - nowMs) / 1000);
            socket.emit("room_error", { message: `Too many failed joins. Try again in ${timeLeft}s.` });
            return;
        }

        // Security checks (if not creator)
        if (room.hostId !== socket.userId) {
            if (room.isLocked) {
                socket.emit("room_error", { message: "Room is locked to new players." });
                return;
            }
            if (room.password && room.password !== data.password) {
                limitRecord.count++;
                if (limitRecord.count >= 5) {
                    limitRecord.lockedUntil = nowMs + 5 * 60 * 1000;
                }
                socketJoinAttempts.set(socket.id, limitRecord);
                socket.emit("room_error", { message: "Incorrect password." });
                return;
            } else if (room.password) {
                socketJoinAttempts.delete(socket.id);
            }
        }

        // Clear empty timer
        room.emptySince = null;

        const player = createPlayer(socket.id, socket.userId, socket.username, roomCode, team, gamePhase, championName);
        room.players.set(socket.id, player);
        sidToRoom.set(socket.id, roomCode);

        // Join Socket.IO room (native)
        socket.join(roomCode);

        // Notify the joining player
        socket.emit("room_joined", {
            room_code: roomCode,
            room_type: room.roomType,
            team_only: room.teamOnly,
            dead_chat: room.deadChat,
            game_phase: room.gamePhase,
            host_id: room.hostId,
            team_rosters: room.teamRosters,
            players: [...room.players.values()].map((p) => ({ 
                name: p.playerName, 
                champ: p.championName,
                user_id: p.userId 
            })),
        });

        // Notify others using native room broadcast (excludes sender automatically)
        socket.to(roomCode).emit("player_joined", {
            player_name: socket.username,
            champion_name: player.championName || "",
            user_id: socket.userId
        });

        log(`${socket.username} (${socket.userId}) joined room '${roomCode}' (type: ${room.roomType}, ${room.players.size} players)`);
        broadcastRoomState(roomCode);
        broadcastGlobalLobby(); // Update global lobby player counts
    });

    socket.on("kick_player", async (data) => {
        const roomCode = sidToRoom.get(socket.id);
        if (!roomCode || !data.target_user_id) return;
        const room = rooms.get(roomCode);
        if (!room || room.hostId !== socket.userId) return; // Must be host
        
        let targetSid = null;
        let targetPlayer = null;
        for (const [sid, p] of room.players.entries()) {
            if (p.userId === data.target_user_id) {
                targetSid = sid;
                targetPlayer = p;
                break;
            }
        }
        
        if (targetPlayer && targetSid) {
            const targetSocket = io.sockets.sockets.get(targetSid);
            if (targetSocket) {
                targetSocket.emit("kicked_from_room");
            }
            await removePlayer(targetSid);
            log(`${socket.username} kicked ${targetPlayer.playerName} from room '${roomCode}'`);
        }
    });

    socket.on("leave_room", async () => {
        await removePlayer(socket.id);
    });

    socket.on("delete_room", async (data) => {
        const roomCode = (data.room_code || "").trim().toUpperCase();
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room) return;
        if (room.hostId !== socket.userId) {
            socket.emit("room_error", { message: "Only the room host can delete a room." });
            return;
        }

        // Kick all players from the room
        for (const [sid, player] of room.players) {
            const playerSocket = io.sockets.sockets.get(sid);
            if (playerSocket) {
                playerSocket.emit("kicked_from_room");
                playerSocket.leave(roomCode);
            }
            sidToRoom.delete(sid);
        }
        room.players.clear();

        // Destroy the room
        rooms.delete(roomCode);
        log(`Room '${roomCode}' permanently deleted by host ${socket.username}`);
        broadcastGlobalLobby();
    });

    socket.on("update_room_security", (data) => {
        const roomCode = sidToRoom.get(socket.id);
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room || room.hostId !== socket.userId) return; // Must be host

        if (data.password !== undefined) {
            room.password = data.password ? String(data.password) : null;
        }
        if (data.is_locked !== undefined) {
            room.isLocked = Boolean(data.is_locked);
        }
        if (data.is_hidden !== undefined) {
            room.isHidden = Boolean(data.is_hidden);
        }
        log(`Room '${roomCode}' security updated (locked: ${room.isLocked}, hidden: ${room.isHidden}, password: ${!!room.password})`);
        broadcastRoomState(roomCode);
        broadcastGlobalLobby();
    });

    // Player display name rename
    socket.on("rename", (data) => {
        const newName = data.new_name;
        if (!newName || typeof newName !== 'string') return;
        const trimmed = String(newName).trim().slice(0, 32);
        if (!trimmed) return;

        const roomCode = sidToRoom.get(socket.id);
        if (roomCode) {
            const room = rooms.get(roomCode);
            if (room) {
                const player = room.players.get(socket.id);
                if (player) {
                    const oldName = player.playerName;
                    player.playerName = trimmed;
                    io.to(roomCode).emit("player_renamed", { 
                        old_name: oldName, 
                        new_name: trimmed, 
                        user_id: socket.userId 
                    });
                    log(`${oldName} renamed to ${trimmed} (${socket.userId})`);
                    broadcastRoomState(roomCode);
                    broadcastGlobalLobby();
                }
            }
        }
    });

    socket.on("update_room_settings", (data) => {
        const roomCode = sidToRoom.get(socket.id);
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room || room.hostId !== socket.userId) return; // Must be host

        if (data.room_type) {
            const rt = data.room_type.toLowerCase();
            if (VALID_ROOM_TYPES.has(rt)) room.roomType = rt;
        }
        if (data.team_only !== undefined) room.teamOnly = Boolean(data.team_only);
        if (data.dead_chat !== undefined) room.deadChat = Boolean(data.dead_chat);
        if (data.room_name !== undefined) room.roomName = String(data.room_name).slice(0, 32);

        log(`Room '${roomCode}' settings updated by Host`);

        // Broadcast new settings using native room broadcast
        io.to(roomCode).emit("room_settings_updated", {
            room_name: room.roomName,
            room_type: room.roomType,
            team_only: room.teamOnly,
            dead_chat: room.deadChat,
        });
        broadcastGlobalLobby(); // Update room list for global observers
    });

    socket.on("detected_positions", (data) => {
        const roomCode = sidToRoom.get(socket.id);
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room) return;
        const player = room.players.get(socket.id);
        if (!player) return;

        const reporterTeam = player.team || data.team || "";
        if (reporterTeam && !player.team) player.team = reporterTeam;

        const t = now();

        // Update roster if provided
        const roster = data.roster;
        if (roster && typeof roster === "object") {
            for (const teamName of ["blue", "red"]) {
                if (roster[teamName]) room.teamRosters[teamName] = roster[teamName];
            }
        }

        const positions = data.positions || {};
        for (const [champName, pos] of Object.entries(positions)) {
            let existing = room.mergedPositions.get(champName);
            const newX = pos.x !== undefined ? pos.x : -1;
            const newY = pos.y !== undefined ? pos.y : -1;
            const newIsDead = pos.is_dead || false;

            // Determine champion team
            let champTeam = "";
            for (const tn of ["blue", "red"]) {
                if ((room.teamRosters[tn] || []).includes(champName)) {
                    champTeam = tn;
                    break;
                }
            }

            if (!existing) {
                existing = createMergedPosition(champName, champTeam, newX, newY, newIsDead);
                room.mergedPositions.set(champName, existing);
            } else {
                if (!existing.team && champTeam) existing.team = champTeam;
                existing.isDead = newIsDead;
                existing.lastUpdate = t;
            }

            // Store this client's report
            existing.reports.set(socket.id, {
                x: newX,
                y: newY,
                is_dead: newIsDead,
                confidence: pos.confidence || 1.0,
                team: reporterTeam,
                timestamp: t
            });
        }

        // Handle dead players
        const deadPlayers = data.dead_players || [];
        for (const champName of deadPlayers) {
            let existing = room.mergedPositions.get(champName);
            if (existing) {
                existing.isDead = true;
                existing.lastUpdate = t;
            } else {
                let champTeam = "";
                for (const tn of ["blue", "red"]) {
                    if ((room.teamRosters[tn] || []).includes(champName)) {
                        champTeam = tn;
                        break;
                    }
                }
                const mp = createMergedPosition(champName, champTeam);
                mp.isDead = true;
                mp.lastUpdate = t;
                room.mergedPositions.set(champName, mp);
            }
        }
        player.lastHeartbeat = t;
    });

    // ── stream_frame ──
    socket.on("stream_frame", (data) => {
        const roomCode = sidToRoom.get(socket.id);
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room) return;
        const player = room.players.get(socket.id);
        if (!player) return;

        player.lastHeartbeat = now();

        // Relay to all others in the room
        socket.to(roomCode).emit("stream_frame", {
            player_name: player.playerName,
            champion_name: player.championName,
            frame: data.frame, // Base64 JPEG
            width: data.width,
            height: data.height
        });
    });

    // ── stream_status ──
    socket.on("stream_status", (data) => {
        const roomCode = sidToRoom.get(socket.id);
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room) return;
        const player = room.players.get(socket.id);
        if (!player) return;

        player.isStreaming = Boolean(data.is_streaming);
        player.lastHeartbeat = now();

        // Broadcast status change to everyone in the room
        broadcastRoomState(roomCode);
    });

    // ── update_game_phase ──
    socket.on("update_game_phase", (data) => {
        const roomCode = sidToRoom.get(socket.id);
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room) return;
        const player = room.players.get(socket.id);
        if (!player) return;

        const newPhase = data.game_phase || PHASE_IN_GAME;
        player.gamePhase = newPhase;

        // Room-level phase = most advanced among players
        let maxPhaseIdx = 0;
        for (const p of room.players.values()) {
            const idx = PHASE_ORDER.indexOf(p.gamePhase);
            if (idx > maxPhaseIdx) maxPhaseIdx = idx;
        }
        const oldPhase = room.gamePhase;
        room.gamePhase = PHASE_ORDER[maxPhaseIdx] || PHASE_LOBBY;

        // If transitioning back to lobby from a game/loading/select, flush stale data
        if (oldPhase !== PHASE_LOBBY && room.gamePhase === PHASE_LOBBY) {
            log(`Room '${roomCode}' transitioning to LOBBY - flushing stale data.`);
            room.mergedPositions.clear();
            room.playerRosters.clear();
        }

        if (data.team) player.team = data.team;

        const roster = data.roster;
        if (roster && typeof roster === "object") {
            // Store this player's view of the roster
            room.playerRosters.set(socket.id, {
                blue: Array.isArray(roster.blue) ? roster.blue : [],
                red: Array.isArray(roster.red) ? roster.red : []
            });
        }

        player.lastHeartbeat = now();
        log(`${player.playerName} game_phase=${newPhase}, team=${player.team}`);
    });

    // ── voice_data ──
    socket.on("voice_data", (data) => {
        const roomCode = sidToRoom.get(socket.id);
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room) return;
        const player = room.players.get(socket.id);
        if (!player) return;

        // Dynamically rename
        const newName = data.player_name;
        if (newName && newName !== player.playerName) {
            const oldName = player.playerName;
            player.playerName = String(newName).slice(0, 32);
            io.to(roomCode).emit("player_renamed", { old_name: oldName, new_name: player.playerName });
        }
        
        if (data.champion_name) {
            player.championName = String(data.champion_name).slice(0, 32);
        }

        player.lastHeartbeat = now();

        // Update position if included
        const position = data.position || {};
        if (position.x !== undefined) player.x = position.x;
        if (position.y !== undefined) player.y = position.y;
        if (data.is_dead !== undefined) player.isDead = data.is_dead;

        room.packetsIn++;
        room.packetsOut += Math.max(0, room.players.size - 1);

        // Relay to all others using native Socket.IO room broadcast (excludes sender)
        const relayPayload = {
            user_id: player.userId,
            player_name: player.playerName,
            champion_name: player.championName,
            audio: data.audio,
            position: { x: player.x, y: player.y },
            is_dead: player.isDead,
        };
        socket.to(roomCode).emit("voice_data", relayPayload);
    });

    // ── position_update ──
    socket.on("position_update", (data) => {
        const roomCode = sidToRoom.get(socket.id);
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room) return;
        const player = room.players.get(socket.id);
        if (!player) return;

        const newName = data.player_name;
        if (newName && newName !== player.playerName) {
            const oldName = player.playerName;
            player.playerName = String(newName).slice(0, 32);
            io.to(roomCode).emit("player_renamed", { old_name: oldName, new_name: player.playerName });
        }

        player.lastHeartbeat = now();
        const position = data.position || {};
        if (position.x !== undefined) player.x = position.x;
        if (position.y !== undefined) player.y = position.y;
        if (data.is_dead !== undefined) player.isDead = data.is_dead;
    });

    // ── chat_message ──
    socket.on("chat_message", (data) => {
        const roomCode = sidToRoom.get(socket.id);
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room) return;
        const player = room.players.get(socket.id);
        if (!player) return;

        const message = (data.message || "").slice(0, 500); // Max 500 chars
        if (!message.trim()) return;

        const payload = {
            sender_id: player.userId,
            sender: player.playerName,
            message,
            timestamp: Date.now(),
        };

        // Broadcast to ALL in the room (including sender so they see their own message)
        io.to(roomCode).emit("chat_message", payload);
    });

    // ── heartbeat ──
    socket.on("heartbeat", () => {
        const roomCode = sidToRoom.get(socket.id);
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room) return;
        const player = room.players.get(socket.id);
        if (!player) return;

        player.lastHeartbeat = now();
    });
});



// Position broadcast loop (4 Hz)
setInterval(() => {
    const t = now();

    for (const [roomCode, room] of rooms) {
        if (room.players.size < 1) continue;

        // Skip position processing during lobby/champ_select
        if (room.gamePhase === PHASE_LOBBY || room.gamePhase === PHASE_CHAMP_SELECT) {
            // Still calculate roster consensus even in champ select
            const champVotes = {}; // champName -> { blue: 0, red: 0 }
            for (const roster of room.playerRosters.values()) {
                roster.blue.forEach(c => {
                    champVotes[c] = champVotes[c] || { blue: 0, red: 0 };
                    champVotes[c].blue++;
                });
                roster.red.forEach(c => {
                    champVotes[c] = champVotes[c] || { blue: 0, red: 0 };
                    champVotes[c].red++;
                });
            }
            const consensus = { blue: [], red: [] };
            for (const [c, votes] of Object.entries(champVotes)) {
                if (votes.blue > votes.red) consensus.blue.push(c);
                else if (votes.red > votes.blue) consensus.red.push(c);
                // If tied and > 0, we could pick one, but if 0, definitely skip
            }
            room.teamRosters = consensus;

            io.to(roomCode).emit("player_positions", {
                positions: {},
                game_phase: room.gamePhase,
                team_rosters: room.teamRosters,
                metrics: {
                    connected_count: room.players.size,
                    providing_count: 0,
                },
            });
            continue;
        }

        // --- Roster Consensus Logic ---
        const champVotes = {};
        for (const roster of room.playerRosters.values()) {
            roster.blue.forEach(c => {
                champVotes[c] = champVotes[c] || { blue: 0, red: 0 };
                champVotes[c].blue++;
            });
            roster.red.forEach(c => {
                champVotes[c] = champVotes[c] || { blue: 0, red: 0 };
                champVotes[c].red++;
            });
        }
        const consensus = { blue: [], red: [] };
        for (const [c, votes] of Object.entries(champVotes)) {
            if (votes.blue > votes.red) consensus.blue.push(c);
            else if (votes.red > votes.blue) consensus.red.push(c);
        }
        room.teamRosters = consensus;

        const positionsToRemove = [];

        // Compute visibility and confidence for each merged position
        for (const [champName, mp] of room.mergedPositions) {
            // Reconcile team if missing
            if (!mp.team || mp.team === "") {
                for (const tn of ["blue", "red"]) {
                    if (room.teamRosters[tn] && room.teamRosters[tn].includes(champName)) {
                        mp.team = tn;
                        break;
                    }
                }
            }

            // --- Aggregation Logic ---
            const validReports = [];
            for (const [sid, r] of mp.reports) {
                if (t - r.timestamp > 1.5) {
                    mp.reports.delete(sid);
                    continue;
                }
                validReports.push(r);
            }

            if (validReports.length > 0) {
                // Priority 1: Teammate reports (they have true vision)
                const teammateReports = validReports.filter(r => r.team === mp.team);
                const reportsToUse = teammateReports.length > 0 ? teammateReports : validReports;

                // Sort by confidence, then by freshness
                reportsToUse.sort((a, b) => b.confidence - a.confidence || b.timestamp - a.timestamp);

                const best = reportsToUse[0];
                
                // Average clustered reports within 50 units of the "best" one to reduce jitter
                let sumX = 0, sumY = 0, count = 0;
                for (const r of reportsToUse) {
                    if (r.x < 0 || r.y < 0) continue;
                    const d = Math.sqrt((r.x - best.x) ** 2 + (r.y - best.y) ** 2);
                    if (d < 50) {
                        sumX += r.x;
                        sumY += r.y;
                        count++;
                    }
                }

                if (count > 0) {
                    mp.x = Math.round(sumX / count);
                    mp.y = Math.round(sumY / count);
                } else {
                    mp.x = best.x;
                    mp.y = best.y;
                }
                
                mp.isDead = best.is_dead;
                mp.confidence = best.confidence;
                mp.lastUpdate = best.timestamp;
                mp.visibility = VIS_SEEN;

                // Seen vs Hidden logic:
                const reporterTeams = new Set(validReports.map(r => r.team));
                mp.seenBy = {
                    blue: reporterTeams.has("blue"),
                    red: reporterTeams.has("red")
                };

                const enemyTeam = mp.team === "blue" ? "red" : "blue";
                if (mp.team && reporterTeams.has(enemyTeam) && !reporterTeams.has(mp.team)) {
                    mp.visibility = VIS_HIDDEN;
                }
            } else {
                // When stale, they aren't being "seen" by anyone new
                mp.seenBy = { blue: false, red: false };
                
                // Handle staleness
                const age = t - mp.lastUpdate;
                if (age <= STALE_GONE_THRESHOLD) {
                    // Stale — last known position with decaying confidence
                    if (!mp.isDead) {
                        mp.visibility = VIS_LAST_KNOWN;
                        const decayProgress = (age - STALE_SEEN_THRESHOLD) / (STALE_GONE_THRESHOLD - STALE_SEEN_THRESHOLD);
                        mp.confidence = Math.max(0.0, 1.0 - decayProgress);

                        // Stacking: find nearest champion when going stale
                        if (mp.nearbyChampion === null) {
                            for (const [otherName, otherMp] of room.mergedPositions) {
                                if (otherName === champName) continue;
                                if (otherMp.visibility === VIS_SEEN && otherMp.x >= 0 && otherMp.y >= 0) {
                                    const d = Math.sqrt((mp.x - otherMp.x) ** 2 + (mp.y - otherMp.y) ** 2);
                                    if (d < NEAR_DISTANCE_THRESHOLD) {
                                        mp.nearbyChampion = otherName;
                                        break;
                                    }
                                }
                            }
                        }

                        if (mp.nearbyChampion && room.mergedPositions.has(mp.nearbyChampion)) {
                            const tracker = room.mergedPositions.get(mp.nearbyChampion);
                            if (tracker.visibility === VIS_SEEN) {
                                mp.x = tracker.x;
                                mp.y = tracker.y;
                            }
                        }
                    } else {
                        // Dead - stays at death location with full confidence
                        mp.visibility = VIS_SEEN;
                        mp.confidence = 1.0;
                    }
                } else {
                    positionsToRemove.push(champName);
                }
            }
        }

        for (const name of positionsToRemove) {
            room.mergedPositions.delete(name);
        }

        // Build broadcast payload
        const positions = {};
        for (const [champName, mp] of room.mergedPositions) {
            positions[champName] = {
                x: mp.x,
                y: mp.y,
                is_dead: mp.isDead,
                visibility: mp.visibility,
                confidence: Math.round(mp.confidence * 100) / 100,
                team: mp.team,
                timestamp: mp.lastUpdate,
                seen_by: mp.seenBy,
                // Status Flags
                is_vc_connected: Array.from(room.players.values()).some(p => p.championName === champName || p.playerName === champName),
                is_providing_data: Array.from(mp.reports.values()).some(r => t - r.timestamp < 2.0)
            };
        }

        // Count providers
        const providers = new Set();
        for (const mp of room.mergedPositions.values()) {
            for (const [sid, r] of mp.reports) {
                if (t - r.timestamp < 5.0) providers.add(sid);
            }
        }

        // Broadcast using native Socket.IO room broadcast (single call for ALL players)
        io.to(roomCode).emit("player_positions", {
            positions,
            game_phase: room.gamePhase,
            team_rosters: room.teamRosters,
            metrics: {
                connected_count: room.players.size,
                providing_count: providers.size,
            },
        });
    }
}, POSITION_BROADCAST_INTERVAL);

// Heartbeat cleanup loop
setInterval(async () => {
    const t = now();
    const staleSids = [];

    for (const [, room] of rooms) {
        for (const [sid, player] of room.players) {
            if (t - player.lastHeartbeat > HEARTBEAT_TIMEOUT_S) {
                staleSids.push({ sid, name: player.playerName });
            }
        }
    }

    for (const { sid, name } of staleSids) {
        log(`Heartbeat timeout: ${name} (sid: ${sid})`);
        await removePlayer(sid);
    }

    // Process empty room 10-minute timeout
    const emptyRoomTimeoutDelete = [];
    for (const [code, room] of rooms) {
        if (room.players.size === 0 && room.emptySince && (t - room.emptySince > 600.0)) {
            emptyRoomTimeoutDelete.push(code);
        }
    }
    if (emptyRoomTimeoutDelete.length > 0) {
        for (const code of emptyRoomTimeoutDelete) {
            rooms.delete(code);
            log(`Room '${code}' deleted (inactive & empty for 10 minutes)`);
        }
        broadcastGlobalLobby();
    }
}, CLEANUP_INTERVAL_S * 1000);

// Stats loop
setInterval(() => {
    if (rooms.size > 0) {
        log("--- Server Stats ---");
        for (const [code, room] of rooms) {
            log(`Room '${code}' (${room.players.size} players): ${room.packetsIn} packets IN, ${room.packetsOut} packets OUT`);
            room.packetsIn = 0;
            room.packetsOut = 0;
        }
    }
}, STATS_INTERVAL_S * 1000);

setInterval(() => {
    try {
        if (db.cleanupGuestAccounts) db.cleanupGuestAccounts();
    } catch(e) { console.error("Guest cleanup error", e); }
}, 60 * 60 * 1000);



httpServer.listen(PORT, HOST, () => {
    console.log("=".repeat(55));
    console.log("  LoL Proximity Chat — Voice Relay Server (Node.js)");
    console.log("=".repeat(55));
    console.log(`  Host: ${HOST}`);
    console.log(`  Port: ${PORT}`);
    console.log(`  Heartbeat timeout: ${HEARTBEAT_TIMEOUT_S}s`);
    console.log(`  Position broadcast: ${POSITION_BROADCAST_HZ} Hz`);
    console.log("  Server is running!");
});
