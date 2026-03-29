

##  How It Works - or doesn't 

1.  **Minimap Capture:** The app captures *only* the bottom-right corner of your screen (where the minimap lives) using high-speed screen capture (`mss`).
2.  **AI Detection:** A Python-based sidecar runs a YOLOv8 model on the capture to identify champion positions.
3.  **Game State:** It queries the League Client (LCU) and Live Game API to identify team rosters and game status.
4.  **Audio Processing:** Your voice is captured, suppressed of noise, and sent to a Node.js relay server.
5.  **Spatial Mix:** The app calculates the distance between you and other players. Their audio is then mixed in real-time using the Web Audio API, adjusting volume and panning (if enabled) based on minimap coordinates.

---

##  Quick Start 
### I just want to play with my friends! (Players)

1.  **Download & Install:** Download the latest `.msi` installer from the [Releases](https://github.com/mikolopo/lol-proximity-chat/releases) page.
2.  **Open the App:** Launch "LoL Proximity Chat" from your Start menu.
3.  **Log In:** Create an account or use the **"Guest"** button to jump straight in.
4.  **Join a Room:** Enter the **Room Name** your host gave you (and the password if they set one).
5.  **Start League:** Just leave the app running. Once your game starts, your friends' voices will automatically move around based on the minimap!

---

### I want to host a game for my friends! (Hosts)

To host, you just need to run the relay server on your computer. Choose the method that works best for you:

#### Method 1: Windows 
1.  **Download project:** Download and extract the repository folder to your desktop.
2.  **Open Server Folder:** Navigate into the `server/` directory.
3.  **Run Server:** Double-click the **`start_server.bat`** file. A black window will open.
4.  **Stay Running:** Keep that window open while you and your friends play.

#### Method 2: Linux or VPS
1.  **Prepare Script:** Open your terminal in the `server/` folder.
2.  **Set Permissions:** Run `chmod +x start_server.sh`.
3.  **Run Server:** Execute `./start_server.sh`.
4.  **Background (Optional):** Use `screen` or `pm2` to keep the server running if you close your terminal.

#### Method 3: Docker 
1.  **Install Docker:** Ensure you have Docker installed on your Linux system.
2.  **Launch:** In the `server/` folder, run the following commands:
    ```bash
    chmod +x start_docker.sh
    ./start_docker.sh
    ```
3.  **Check Status:** Your server is now building and running in the background. You can view logs with `docker logs -f voice-server`.

#### Important for all Hosts:
- **IP Address:** Share your **Public IP Address** (search "what is my IP" on Google) with your friends.
- **Port Forwarding:** For friends outside your home to connect, you must "Port Forward" **Port 8080** on your router. 
- **Firewall:** Ensure Windows/Linux Firewall is not blocking Node.js or Port 8080.

---

##  How it Works 

*   **Minimap Vision:** The app "looks" at your minimap (just like you do!) to see where champions are.
*   **Proximity Magic:** If a teammate is near you on the map, their voice is loud. If they walk away, they get quieter.
*   **Team Aware:** It automatically knows who is on your team so you only hear the right people.
*   **Privacy First:** It never reads your chat, your passwords, or your screen outside of the minimap corner.

---

##  Pro Tips for a Smooth Game

*   **Use Borderless Mode:** Run League in **"Borderless"** window mode (Settings > Video). This helps the app see the minimap much better than "Full Screen".
*   **Stuck Icons?** If someone's voice seems "stuck" in the wrong place, click the **"Manual Rescan"** button in the app.
*   **Silence the Keyboard:** Turn on **RNNoise** in the audio settings to block out your mechanical keyboard clicks automatically!
*   **Room Security:** If you don't want random people joining, make sure to set a **Password** when creating your room.

---

##  I'm having trouble!

**"I can't hear my friends!"**
- Make sure you are in the same **Room** on the server.
- Check that your **Microphone** and **Speakers** are selected correctly in the app settings.

**"My friends can't connect to my server!"**
- This is usually a **Firewall** issue. Make sure windows allows "Node.js" through the firewall, or look up a quick guide on **"Port Forwarding 8080"** for your specific router.

---

##  Tech Stack (For Nerds)

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Lucide Icons.
- **Desktop Wrapper:** Tauri 2 (Rust).
- **Detection Engine:** Python 3.10, OpenCV, Ultralytics YOLOv8.
- **Audio Pipeline:** Web Audio API, Opus, RNNoise (WASM).
- **Backend:** Node.js, Socket.IO, SQLite3, JWT.

---


```bash
├── client/      # Python Sidecar (Screen capture, YOLO detection, API)
├── desktop/     # Tauri + React application (UI and Audio Pipeline)
├── server/      # Node.js Socket.IO Relay & Auth Server
└── build.bat    # One-click build script for the entire project
```

---

##  Disclaimer

**LoL Proximity Chat** is a third-party tool. While it only reads the minimap pixels and official Riot APIs (LCU/Live Game API), use it at your own risk. We are not responsible for any actions taken by Riot Games (Vanguard/Account Bans). We strive to stay within the bounds of "fair play" by only using information visible to the player.
