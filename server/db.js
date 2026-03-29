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
            email TEXT UNIQUE,
            password_hash TEXT,
            display_name TEXT,
            created_at INTEGER
        )
    `);
    
    // Migrations for existing DBs
    db.run(`ALTER TABLE users ADD COLUMN display_name TEXT`, (err) => {
        if (!err) {
            db.run(`UPDATE users SET display_name = username WHERE display_name IS NULL`);
            console.log("Migrated: added display_name column");
        }
    });
    db.run(`ALTER TABLE users ADD COLUMN email TEXT`, (err) => {
        if (!err) {
            // Backfill: use username as email placeholder for existing users
            db.run(`UPDATE users SET email = username WHERE email IS NULL`);
}
    });

    db.run(`ALTER TABLE users ADD COLUMN is_guest INTEGER DEFAULT 0`, (err) => {
        if (!err) {
            console.log("Migrated: added is_guest column");
        }
    });
});

db.cleanupGuestAccounts = () => {
    db.run(
        `DELETE FROM users WHERE is_guest = 1 AND created_at < ?`,
        [Date.now() - 72 * 60 * 60 * 1000], // 72 hours ago
        function(err) {
            if (err) console.error("Error cleaning up guest accounts:", err);
            else if (this.changes > 0) console.log(`Cleaned up ${this.changes} expired guest accounts.`);
        }
    );
};

module.exports = db;
