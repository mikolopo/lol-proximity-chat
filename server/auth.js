const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("./db");
const { getRequiredVersion } = require("./version");

const JWT_SECRET = process.env.JWT_SECRET || "local-dev-secret-super-safe";

// Helpers
function generateUserId() {
    return crypto.randomBytes(8).toString("hex");
}

function handleAuthRoutes(req, res) {
    if (req.method === "POST" && req.url === "/auth/register") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", async () => {
            try {
                const { username, password, version } = JSON.parse(body);
                
                const currentRequiredVersion = getRequiredVersion();
                if (version !== currentRequiredVersion) {
                    res.writeHead(403, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: `Update Required! Please download version ${currentRequiredVersion} of LoL Proximity Chat.` }));
                    return;
                }

                if (!username || !password || username.length < 4 || password.length < 5) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Invalid credentials (min 4 chars username, 5 chars password)" })); 
                    return;
                }
                const hash = await bcrypt.hash(password, 10);
                const userId = generateUserId();
                const now = Math.floor(Date.now() / 1000);

                db.run("INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)", [userId, username, hash, now], (err) => {
                    if (err) {
                        res.writeHead(400, { "Content-Type": "application/json" }); 
                        res.end(JSON.stringify({ error: "Username already taken" })); 
                        return;
                    }
                    const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: "7d" });
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ token, userId, username }));
                });
            } catch (e) {
                res.writeHead(500, { "Content-Type": "application/json" }); 
                res.end(JSON.stringify({ error: "Server Error" }));
            }
        });
        return true;
    }

    if (req.method === "POST" && req.url === "/auth/login") {
        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", () => {
            try {
                const { username, password, version } = JSON.parse(body);

                const currentRequiredVersion = getRequiredVersion();
                if (version !== currentRequiredVersion) {
                    res.writeHead(403, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: `Update Required! Please download version ${currentRequiredVersion} of LoL Proximity Chat.` }));
                    return;
                }

                db.get("SELECT * FROM users WHERE username = ?", [username], async (err, row) => {
                    if (err || !row) {
                        res.writeHead(401, { "Content-Type": "application/json" }); 
                        res.end(JSON.stringify({ error: "Invalid username or password" })); 
                        return;
                    }
                    const match = await bcrypt.compare(password, row.password_hash);
                    if (!match) {
                        res.writeHead(401, { "Content-Type": "application/json" }); 
                        res.end(JSON.stringify({ error: "Invalid username or password" })); 
                        return;
                    }
                    const token = jwt.sign({ userId: row.id, username: row.username }, JWT_SECRET, { expiresIn: "7d" });
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ token, userId: row.id, username: row.username }));
                });
            } catch (e) {
                res.writeHead(500, { "Content-Type": "application/json" }); 
                res.end(JSON.stringify({ error: "Server Error" }));
            }
        });
        return true;
    }
    
    // Auth Check Route (useful for frontend to verify cached token)
    if (req.method === "GET" && req.url === "/auth/me") {
        const authHeader = req.headers["authorization"] || "";
        const token = authHeader.replace("Bearer ", "");
        const decoded = verifyToken(token);
        if (decoded) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ userId: decoded.userId, username: decoded.username }));
        } else {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unauthorized" }));
        }
        return true;
    }
    
    return false;
}

function verifyToken(token) {
    try {
        if (!token) return null;
        return jwt.verify(token, JWT_SECRET);
    } catch {
        return null;
    }
}

module.exports = { handleAuthRoutes, verifyToken };
