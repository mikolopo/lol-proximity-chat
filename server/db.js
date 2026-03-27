const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

const db = new sqlite3.Database(path.join(dataDir, "database.sqlite"), (err) => {
    if (err) console.error("Database connection error:", err);
    else console.log("Connected to SQLite database inside data/database.sqlite");
});

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE,
            password_hash TEXT,
            created_at INTEGER
        )
    `);
    
    // We could store rooms here later, but for now Rooms remain transient
    // as per typical voice server behavior, except we will attach hostId.
});

module.exports = db;
