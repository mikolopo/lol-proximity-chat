const https = require('https');

let cachedVersion = process.env.REQUIRED_CLIENT_VERSION || "1.1.1";
let lastFetchTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function fetchLatestGithubVersion() {
    const options = {
        hostname: 'api.github.com',
        path: '/repos/mikolopo/lol-proximity-chat/releases/latest',
        method: 'GET',
        headers: {
            'User-Agent': 'LoL-Proximity-Chat-Server'
        }
    };

    https.get(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                if (res.statusCode === 200) {
                    const parsed = JSON.parse(data);
                    if (parsed.tag_name) {
                        let version = parsed.tag_name;
                        if (version.startsWith('v') || version.startsWith('V')) {
                            version = version.substring(1);
                        }
                        cachedVersion = version;
                        lastFetchTime = Date.now();
                        console.log(`[Version Check] Latest required client version is now ${cachedVersion}`);
                    }
                } else {
                    console.warn(`[Version Check] GitHub API returned status ${res.statusCode}`);
                }
            } catch (err) {
                console.error(`[Version Check] Failed to parse GitHub API response:`, err);
            }
        });
    }).on('error', (err) => {
        console.error(`[Version Check] HTTP request failed:`, err);
    });
}

function getRequiredVersion() {
    const now = Date.now();
    if (now - lastFetchTime > CACHE_TTL_MS) {
        // Trigger async fetch, return cached immediately
        lastFetchTime = now; // prevent spamming while fetching
        fetchLatestGithubVersion();
    }
    return cachedVersion;
}

// Initial fetch
fetchLatestGithubVersion();

module.exports = { getRequiredVersion };
