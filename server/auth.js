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
                const { email, displayName, password, version } = JSON.parse(body);
                
                const currentRequiredVersion = getRequiredVersion();
                if (version !== currentRequiredVersion) {
                    res.writeHead(403, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: `Update Required! Please download version ${currentRequiredVersion} of LoL Proximity Chat.` }));
                    return;
                }

                if (!email || !displayName || !password) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "All fields are required" })); 
                    return;
                }
                if (password.length < 5) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Password must be at least 5 characters" })); 
                    return;
                }
                if (displayName.trim().length < 3 || displayName.trim().length > 20) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Display name must be 3-20 characters" })); 
                    return;
                }
                // Basic email format check
                if (!email.includes("@") || !email.includes(".")) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Invalid email format" })); 
                    return;
                }

                const trimmedName = displayName.trim();

                // Check display name uniqueness
                db.get("SELECT id FROM users WHERE LOWER(display_name) = LOWER(?)", [trimmedName], async (err, existing) => {
                    if (existing) {
                        res.writeHead(409, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: "Display name already taken" }));
                        return;
                    }

                    const hash = await bcrypt.hash(password, 10);
                    const userId = generateUserId();
                    const now = Math.floor(Date.now() / 1000);

                    db.run(
                        "INSERT INTO users (id, username, email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                        [userId, trimmedName, email.toLowerCase().trim(), hash, trimmedName, now],
                        (err) => {
                            if (err) {
                                // Could be email or username uniqueness violation
                                const msg = err.message.includes("email") ? "Email already registered" : "Display name already taken";
                                res.writeHead(400, { "Content-Type": "application/json" }); 
                                res.end(JSON.stringify({ error: msg })); 
                                return;
                            }
                            const token = jwt.sign({ userId, username: trimmedName }, JWT_SECRET, { expiresIn: "7d" });
                            res.writeHead(200, { "Content-Type": "application/json" });
                            res.end(JSON.stringify({ token, userId, displayName: trimmedName }));
                        }
                    );
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
                const { email, password, version } = JSON.parse(body);

                const currentRequiredVersion = getRequiredVersion();
                if (version !== currentRequiredVersion) {
                    res.writeHead(403, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: `Update Required! Please download version ${currentRequiredVersion} of LoL Proximity Chat.` }));
                    return;
                }

                // Support login by email or by legacy username
                const loginValue = (email || "").toLowerCase().trim();
                const query = loginValue.includes("@") 
                    ? "SELECT * FROM users WHERE LOWER(email) = ?"
                    : "SELECT * FROM users WHERE LOWER(username) = ?";

                db.get(query, [loginValue], async (err, row) => {
                    if (err || !row) {
                        res.writeHead(401, { "Content-Type": "application/json" }); 
                        res.end(JSON.stringify({ error: "Invalid email or password" })); 
                        return;
                    }
                    const match = await bcrypt.compare(password, row.password_hash);
                    if (!match) {
                        res.writeHead(401, { "Content-Type": "application/json" }); 
                        res.end(JSON.stringify({ error: "Invalid email or password" })); 
                        return;
                    }
                    const token = jwt.sign({ userId: row.id, username: row.display_name || row.username }, JWT_SECRET, { expiresIn: "7d" });
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ token, userId: row.id, displayName: row.display_name || row.username }));
                });
            } catch (e) {
                res.writeHead(500, { "Content-Type": "application/json" }); 
                res.end(JSON.stringify({ error: "Server Error" }));
            }
        });
        return true;
    }
    
    // Auth Check Route
    if (req.method === "GET" && req.url === "/auth/me") {
        const authHeader = req.headers["authorization"] || "";
        const token = authHeader.replace("Bearer ", "");
        const decoded = verifyToken(token);
        if (decoded) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ userId: decoded.userId, displayName: decoded.username }));
        } else {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unauthorized" }));
        }
        return true;
    }

    // Update Display Name Route
    if (req.method === "POST" && req.url === "/auth/update-display-name") {
        const authHeader = req.headers["authorization"] || "";
        const token = authHeader.replace("Bearer ", "");
        const decoded = verifyToken(token);
        if (!decoded) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unauthorized" }));
            return true;
        }

        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", () => {
            try {
                const { displayName } = JSON.parse(body);
                if (!displayName || displayName.trim().length < 3 || displayName.trim().length > 20) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Display name must be 3-20 characters" }));
                    return;
                }
                const trimmed = displayName.trim();
                // Check uniqueness (case-insensitive)
                db.get("SELECT id FROM users WHERE LOWER(display_name) = LOWER(?) AND id != ?", [trimmed, decoded.userId], (err, existing) => {
                    if (existing) {
                        res.writeHead(409, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: "Display name already taken" }));
                        return;
                    }
                    db.run("UPDATE users SET display_name = ?, username = ? WHERE id = ?", [trimmed, trimmed, decoded.userId], (updateErr) => {
                        if (updateErr) {
                            res.writeHead(500, { "Content-Type": "application/json" });
                            res.end(JSON.stringify({ error: "Failed to update" }));
                            return;
                        }
                        res.writeHead(200, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ displayName: trimmed }));
                    });
                });
            } catch (e) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Server Error" }));
            }
        });
        return true;
    }

    // Change Password Route
    if (req.method === "POST" && req.url === "/auth/change-password") {
        const authHeader = req.headers["authorization"] || "";
        const token = authHeader.replace("Bearer ", "");
        const decoded = verifyToken(token);
        if (!decoded) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unauthorized" }));
            return true;
        }

        let body = "";
        req.on("data", chunk => body += chunk);
        req.on("end", () => {
            try {
                const { oldPassword, newPassword } = JSON.parse(body);
                if (!oldPassword || !newPassword || newPassword.length < 5) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Invalid password requirements" }));
                    return;
                }

                db.get("SELECT password_hash FROM users WHERE id = ?", [decoded.userId], async (err, row) => {
                    if (err || !row) {
                        res.writeHead(404, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: "User not found" }));
                        return;
                    }

                    const match = await bcrypt.compare(oldPassword, row.password_hash);
                    if (!match) {
                        res.writeHead(401, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: "Incorrect old password" }));
                        return;
                    }

                    const newHash = await bcrypt.hash(newPassword, 10);
                    db.run("UPDATE users SET password_hash = ? WHERE id = ?", [newHash, decoded.userId], (updateErr) => {
                        if (updateErr) {
                            res.writeHead(500, { "Content-Type": "application/json" });
                            res.end(JSON.stringify({ error: "Failed to update password" }));
                            return;
                        }
                        res.writeHead(200, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ success: true }));
                    });
                });
            } catch (e) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Server Error" }));
            }
        });
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
