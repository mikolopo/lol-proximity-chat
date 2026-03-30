import time
import threading
import os

from client.capture.screen_capture import MinimapCapture
from client.capture.live_client_api import LiveClientAPI
from client.capture.lcu_connector import LCUConnector
from client.detection.yolo_matcher import YoloMatcher

import sys


def _get_base_dir():
    """Return the base directory for asset resolution."""
    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        return sys._MEIPASS
    # Dev mode: project root is 3 levels up from this file
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def find_bundle_dir(filename, known_subpaths=None):
    """
    Find a bundled file. First tries known relative sub-paths (fast & reliable),
    then falls back to os.walk as a last resort.
    """
    base = _get_base_dir()

    # 1. Fast path: check known sub-directories first
    if known_subpaths:
        for subpath in known_subpaths:
            candidate = os.path.join(base, subpath)
            full = os.path.join(candidate, filename)
            if os.path.isfile(full):
                print(f"[DetectionWorker] Found {filename} at {candidate}")
                return candidate

    # 2. Fallback: walk the whole tree (slower but handles edge cases)
    search_roots = [base]
    if getattr(sys, 'frozen', False):
        exe_dir = os.path.dirname(sys.executable)
        search_roots.extend([os.path.join(exe_dir, '_internal'), exe_dir])

    for search_base in search_roots:
        if not os.path.exists(search_base):
            continue
        for root, dirs, files in os.walk(search_base):
            if filename in files:
                print(f"[DetectionWorker] Found {filename} at {root} (via walk)")
                return root

    print(f"[DetectionWorker] WARNING: {filename} not found in any bundle directory!")
    print(f"[DetectionWorker]   base_dir = {base}")
    print(f"[DetectionWorker]   frozen = {getattr(sys, 'frozen', False)}")
    return ""


# Known sub-paths match the --add-data layout in BUILD_EXE.bat / pyinstaller command
YOLO_DIR = find_bundle_dir("best.onnx", known_subpaths=[
    os.path.join("client", "detection", "assets", "yolo"),
])
ANCHOR_DIR = find_bundle_dir("anchor_whole_L.png", known_subpaths=[
    os.path.join("client", "capture", "assets"),
])


class DetectionWorker(threading.Thread):
    """
    Background thread that manages the full game lifecycle:
      1. Pre-game: LCU champ select detection (fills roster early)
      2. In-game: minimap detection + position tracking
      3. Post-game: reset state, return to standby
    """
    def __init__(self, voice_client):
        super().__init__(daemon=True)
        self.voice_client = voice_client
        self.running = False
        self.cap = MinimapCapture(anchor_dir=ANCHOR_DIR)
        self.lcu = LCUConnector()
        self.live = LiveClientAPI()
        self.matcher = None
        self.local_player_champ = None
        self.debug_mode_enabled = False
        self.rescan_triggered = False

    def run(self):
        self.running = True
        print("[DetectionWorker] Starting...")

        while self.running:
            # ── Phase 0: Standby — wait for either LCU or Live API ──
            print("[DetectionWorker] Standby — waiting for game...")
            self._wait_for_game()
            if not self.running:
                break

            # ── Phase 1: Pre-game — try LCU for champ select ──
            roster_data = self._try_champ_select()

            # ── Phase 2: In-game — Live Client API detection ──
            if not roster_data:
                roster_data = self._wait_for_live_api_roster()
            if not self.running or not roster_data:
                continue

            roster = roster_data.get("roster", {})
            local_team = roster_data.get("local_player_team", "") # No default "blue"
            self.local_player_champ = roster_data.get("local_player_champ")
            self.voice_client.player_name = self.local_player_champ

            # Transition to in_game phase
            self.voice_client.update_game_phase(
                "in_game",
                team=local_team,
                roster=roster,
            )

            print(f"[DetectionWorker] Local champ: {self.local_player_champ} ({local_team})")
            print(f"[DetectionWorker] Blue: {', '.join(roster.get('blue', []))}")
            print(f"[DetectionWorker] Red:  {', '.join(roster.get('red', []))}")

            # ── Phase 3: Initialize YOLO + minimap (with auto-retry) ──
            max_retries = 10
            for attempt in range(max_retries):
                if not self.running:
                    break
                try:
                    print(f"[DetectionWorker] Loading YOLO matcher (attempt {attempt + 1}/{max_retries})...")
                    self.matcher = YoloMatcher(YOLO_DIR, roster, ally_team=local_team)
                    print("[DetectionWorker] YOLO matcher loaded successfully!")
                    self._run_active_detection(roster)
                    break  # Detection loop finished (game ended), exit retry loop
                except Exception as e:
                    import traceback
                    print(f"[DetectionWorker] YOLO init error (attempt {attempt + 1}/{max_retries}): {e}")
                    traceback.print_exc()
                    self.matcher = None
                    if attempt < max_retries - 1:
                        print(f"[DetectionWorker] Retrying in 5 seconds...")
                        time.sleep(5)
                    else:
                        print(f"[DetectionWorker] YOLO failed after {max_retries} attempts. Giving up.")

            # ── Phase 4: Game ended — reset everything ──
            print("[DetectionWorker] Game ended. Resetting state...")
            self.voice_client.reset_game_state()
            if self.cap:
                self.cap.reset_lock() # Force re-lock for next game
            self.matcher = None
            self.local_player_champ = None

        print("[DetectionWorker] Thread exited.")

    def _wait_for_game(self):
        """Wait for either LCU (champ select) or Live Client API (in-game)."""
        lcu_connected = False
        while self.running:
            # Try LCU first (works during champ select)
            if not lcu_connected:
                lcu_connected = self.lcu.connect()

            if lcu_connected:
                phase = self.lcu.get_gameflow_phase()
                if phase in ("ChampSelect", "GameStart", "InProgress"):
                    return

            # Try Live Client API (works when game is loaded)
            if self.live.is_available():
                return

            time.sleep(2)

    def _try_champ_select(self):
        """
        Try to detect champ select via LCU and fill roster early.
        Returns roster_data if successful, None otherwise.
        """
        lcu_connected = self.lcu.connect()
        if not lcu_connected:
            return None

        phase = self.lcu.get_gameflow_phase()
        if phase != "ChampSelect":
            # Not in champ select — skip straight to Live API
            return None

        print("[DetectionWorker] Champ Select detected! Polling roster...")
        self.voice_client.update_game_phase("champ_select")

        roster_data = None
        while self.running:
            phase = self.lcu.get_gameflow_phase()
            
            # If we are no longer in champ select/ready check, break out
            if phase not in ("ChampSelect", "ReadyCheck"):
                print(f"[DetectionWorker] Left Champ Select. Current phase: {phase}.")
                # Distinguish between game launching vs dodge/disband
                if phase not in ("GameStart", "InProgress", "Reconnect"):
                    print("[DetectionWorker] Lobby was disbanded or dodge occurred.")
                    self.voice_client.reset_game_state()
                    return None
                break

            cs_info = self.lcu.get_champ_select_info()
            if cs_info:
                roster = cs_info.get("roster", {})
                local_champ = cs_info.get("local_player_champ")
                local_team = cs_info.get("local_player_team", "") # No default "blue"

                # Update voice client with roster as it fills in
                self.voice_client.update_game_phase(
                    "champ_select",
                    team=local_team,
                    roster=roster,
                )

                # If locked in, store
                if local_champ and local_champ != "Unknown" and local_champ != "None":
                    roster_data = cs_info
                    self.voice_client.player_name = local_champ

            time.sleep(2)

        if not self.running:
            return None

        # Wait for game to start (loading screen → in-game)
        if roster_data:
            print("[DetectionWorker] Champ select complete. Waiting for game to load...")
            self.voice_client.update_game_phase("loading", roster=roster_data.get("roster"))

            # Wait for Live Client API to become available
            while self.running and not self.live.is_available():
                phase = self.lcu.get_gameflow_phase()
                if phase not in ("GameStart", "InProgress", "Reconnect", "ChampSelect"):
                    print(f"[DetectionWorker] Game failed to launch or dodge occurred (phase: {phase}). Aborting.")
                    self.voice_client.reset_game_state()
                    return None
                time.sleep(2)

        return roster_data

    def _wait_for_live_api_roster(self):
        """Wait for Live Client API and get roster data."""
        while self.running and not self.live.is_available():
            time.sleep(2)

        if not self.running:
            return None

        print("[DetectionWorker] Game detected via API. Getting roster...")
        roster_data = None
        while self.running and not roster_data:
            roster_data = self.live.get_roster()
            if not roster_data:
                time.sleep(1)

        return roster_data

    def _run_active_detection(self, roster):
        """Run the active minimap detection loop until the game ends."""
        # Lock minimap
        print("[DetectionWorker] Waiting for minimap lock (LoL must be in the foreground)...")
        fail_count = 0
        while self.running:
            found, score = self.cap.connect()
            self.voice_client.report_minimap_lock(found, score)
            
            # Proceed if we have ANY ROI (even fallback), background thread will keep scanning if anchor not found
            if self.cap.get_roi():
                print("[DetectionWorker] ROI established (fallback or anchor), proceeding to active loop.")
                break
            
            fail_count += 1
            if fail_count >= 3:
                print(f"[DetectionWorker] Connection failed {fail_count} times. Forcing a full rescan...")
                self.cap.reset_lock()
                fail_count = 0
            
            time.sleep(1)
            if not self.live.is_available():
                print("[DetectionWorker] Game ended while waiting for minimap.")
                return

        if not self.running:
            return

        if not self.cap.get_roi():
            return

        print("[DetectionWorker] Minimap locked.")

        # Active detection loop
        self.cap.start()
        position_update_interval = 1.0 / 30.0
        last_update = 0
        last_roster_update = 0
        api_failures = 0
        cv2_window_open = False  # Track if debug window is currently open
        no_window_frames = 0

        try:
            while self.running:
                now = time.time()
                
                # Periodically re-check roster (every 30s) to handle late joins or weirdness
                if now - last_roster_update >= 30.0 or self.rescan_triggered:
                    last_roster_update = now
                    self.rescan_triggered = False
                    print("[DetectionWorker] Re-checking roster...")
                    new_roster_data = self.live.get_roster()
                    if new_roster_data and new_roster_data.get("roster"):
                        roster = new_roster_data["roster"]
                        self.voice_client.update_game_phase(
                            "in_game",
                            team=new_roster_data.get("local_player_team"),
                            roster=roster
                        )

                frame = self.cap.get_latest_frame()
                if frame is not None:
                    if hasattr(self.voice_client, 'latest_frame'):
                        self.voice_client.latest_frame = frame
                    detections = self.matcher.detect(frame, debug_mode=self.debug_mode_enabled)
                    
                    if self.debug_mode_enabled:
                        import cv2
                        # Draw bounding boxes
                        for det in detections:
                            x, y, w, h = det.bbox
                            cv2.rectangle(frame, (x, y), (x+w, y+h), (0, 255, 0), 2)
                            cv2.putText(frame, det.name, (x, y-10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
                        # 2. Draw 2D Proximity Map Debug (1000x1000 coords -> 400x400 display)
                        import numpy as np
                        debug_map = np.zeros((400, 400, 3), dtype=np.uint8)
                        # Draw "river" diagonal
                        cv2.line(debug_map, (0, 400), (400, 0), (40, 40, 40), 1)
                        
                        for det in detections:
                            # Map 0-1000 (League) to 0-400 (Debug Map)
                            # League (0,0) is bottom-left, OpenCV (0,0) is top-left
                            map_x = int((det.x_1000 / 1000.0) * 400)
                            map_y = 400 - int((det.y_1000 / 1000.0) * 400) # Flip Y for 2D plot
                            
                            # Determine color based on team (using roster consensus from matcher)
                            color = (128, 128, 128) # Default gray
                            matcher_roster = getattr(self.matcher, 'roster', None)
                            if matcher_roster:
                                if det.name in matcher_roster.get("blue", []):
                                    color = (255, 100, 100) # Blue (BGR)
                                elif det.name in matcher_roster.get("red", []):
                                    color = (100, 100, 255) # Red (BGR)
                            
                            cv2.circle(debug_map, (map_x, map_y), 5, color, -1)
                            cv2.putText(debug_map, det.name[:3], (map_x+5, map_y), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)

                        # Create always-on-top windows
                        cv2.namedWindow("YOLO Minimap Debug", cv2.WINDOW_NORMAL | cv2.WINDOW_KEEPRATIO)
                        cv2.setWindowProperty("YOLO Minimap Debug", cv2.WND_PROP_TOPMOST, 1)
                        cv2.imshow("YOLO Minimap Debug", frame)
                        
                        cv2.namedWindow("Proximity Map Debug", cv2.WINDOW_NORMAL | cv2.WINDOW_KEEPRATIO)
                        cv2.setWindowProperty("Proximity Map Debug", cv2.WND_PROP_TOPMOST, 1)
                        cv2.imshow("Proximity Map Debug", debug_map)
                        
                        cv2.waitKey(1)
                        cv2_window_open = True
                    else:
                        if cv2_window_open:
                            import cv2
                            try:
                                cv2.destroyWindow("YOLO Minimap Debug")
                                cv2.destroyWindow("Proximity Map Debug")
                            except Exception:
                                pass
                            cv2_window_open = False
                        time.sleep(0.01)

                    now = time.time()
                    if now - last_update >= position_update_interval:
                        last_update = now

                        alive_status = self.live.get_alive_status()

                        if alive_status is None:
                            api_failures += 1
                            if api_failures >= 10: # Faster game-end detection
                                print("[DetectionWorker] Game ended (API lost).")
                                break
                        else:
                            api_failures = 0
                            
                        # Extra safety check every 2 seconds
                        if now % 2.0 < 0.05:
                            if not self.live.is_available():
                                print("[DetectionWorker] Game ended (Client closed).")
                                break
                            
                            import ctypes
                            hwnd = ctypes.windll.user32.FindWindowW(None, "League of Legends (TM) Client")
                            if hwnd == 0:
                                no_window_frames += 1
                                if no_window_frames > 2:
                                    print("[DetectionWorker] Game ended (Window missing for >5s).")
                                    break
                            else:
                                no_window_frames = 0

                        alive_status = alive_status or {}

                        positions_dict = {}
                        dead_players = []
                        all_roster_names = roster.get('blue', []) + roster.get('red', [])

                        if alive_status:
                            for det in detections:
                                if det.name:
                                    positions_dict[det.name] = {
                                        "x": int(det.x_1000),
                                        "y": int(det.y_1000),
                                        "is_dead": not alive_status.get(det.name, True)
                                    }
                            
                            # Add unseen alive members from roster so server tracks them
                            for name in all_roster_names:
                                if name and name not in positions_dict:
                                    is_dead = not alive_status.get(name, True)
                                    if not is_dead:
                                        # Alive but not detected (Fog of War)
                                        positions_dict[name] = {"x": -1, "y": -1, "is_dead": False}

                            dead_players = [champ for champ, is_alive in alive_status.items() if not is_alive]
                        else:
                            for det in detections:
                                if det.name:
                                    positions_dict[det.name] = {
                                        "x": int(det.x_1000),
                                        "y": int(det.y_1000),
                                        "is_dead": False
                                    }
                            
                            # Add unseen alive members from roster
                            for name in all_roster_names:
                                if name and name not in positions_dict:
                                    positions_dict[name] = {"x": -1, "y": -1, "is_dead": False}

                        if positions_dict or dead_players:
                            self.voice_client.update_all_positions(positions_dict, dead_players)
                else:
                    time.sleep(0.01)
        finally:
            self.cap.stop()
            if hasattr(self.voice_client, 'latest_frame'):
                self.voice_client.latest_frame = None
            print("[DetectionWorker] Active match capture stopped.")

    def stop(self):
        self.running = False

    def trigger_rescan(self):
        """Force the detection loop to re-poll state/roster and re-lock coordinates on next tick."""
        print("[DetectionWorker] Manual rescan triggered. Unlocking minimap...")
        self.rescan_triggered = True
        if self.cap:
            # Use the new helper to clear window handle and ROI
            self.cap.reset_lock()

