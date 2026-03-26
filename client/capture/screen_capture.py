
import time
import threading
from typing import Optional, Tuple

import mss
import base64
import numpy as np
import win32con
import win32gui
import cv2
import os



def find_lol_window() -> Optional[int]:
    # Search specifically for the in-game client ONLY
    targets = [
        ("RiotWindowClass", "League of Legends (TM) Client"),    # Actual Game
    ]

    found_hwnd = None

    def _enum_callback(hwnd, _):
        nonlocal found_hwnd
        if not win32gui.IsWindowVisible(hwnd):
            return
        title = win32gui.GetWindowText(hwnd)
        cls = win32gui.GetClassName(hwnd)
        for target_cls, target_title in targets:
            if target_title.lower() in title.lower() and cls == target_cls:
                found_hwnd = hwnd
                return # Stop at first exact match

    win32gui.EnumWindows(_enum_callback, None)
    return found_hwnd


def get_window_rect(hwnd: int) -> Tuple[int, int, int, int]:
    return win32gui.GetWindowRect(hwnd)


def compute_minimap_roi(
    win_left: int, win_top: int, win_right: int, win_bottom: int,
    anchor_dir: str = None
) -> Tuple[dict, bool]:
    win_w = win_right - win_left
    win_h = win_bottom - win_top
    
    fallback_width = int(win_w * 0.25)
    fallback_height = int(win_h * 0.35)
    fallback_roi = {
        "left": win_right - fallback_width,
        "top": win_bottom - fallback_height,
        "width": fallback_width,
        "height": fallback_height,
    }

    if anchor_dir and os.path.exists(anchor_dir):
        # Find all png files in the anchor directory that we can try matching
        anchor_files = [os.path.join(anchor_dir, f) for f in os.listdir(anchor_dir) if f.endswith(".png")]
        
        if anchor_files:
            try:
                # Grab the bottom half of the screen
                with mss.mss() as sct:
                    # Search a bit more of the bottom (50% instead of 45%)
                    half_rect = {
                        "left": win_left,
                        "top": win_bottom - int(win_h * 0.5),
                        "width": win_w,
                        "height": int(win_h * 0.5)
                    }
                    raw = sct.grab(half_rect)
                    frame_bgr = np.array(raw)[:, :, :3]
                    
                    best_overall_val = -1
                    best_overall_loc = None
                    best_overall_scale = 1.0
                    best_anchor_shape = None
                    
                    for a_file in anchor_files:
                        anchor_img_bgra = cv2.imread(a_file, cv2.IMREAD_UNCHANGED)
                        if anchor_img_bgra is None:
                            continue
                            
                        # Extract BGR and Mask
                        # We will treat "almost black" pixels (0-5, 0-5, 0-5) as transparent
                        a_img = anchor_img_bgra[:, :, :3]
                        
                        # Create a mask where black/near-black pixels are 0
                        # Using 5 as tolerance for slight compression/scaling artifacts
                        black_mask = cv2.inRange(a_img, np.array([0, 0, 0]), np.array([5, 5, 5]))
                        a_mask = cv2.bitwise_not(black_mask) 
                        
                        if anchor_img_bgra.shape[2] == 4:
                            # Also combine with the actual alpha channel
                            alpha = anchor_img_bgra[:, :, 3]
                            a_mask = cv2.bitwise_and(a_mask, alpha)
                            
                        for scale in np.linspace(0.4, 1.6, 13):
                            scaled_w = int(a_img.shape[1] * scale)
                            scaled_h = int(a_img.shape[0] * scale)
                            if scaled_w < 50 or scaled_h < 50:
                                continue
                                
                            if scaled_w > frame_bgr.shape[1] or scaled_h > frame_bgr.shape[0]:
                                continue
                                
                            scaled_anchor = cv2.resize(a_img, (scaled_w, scaled_h))
                            scaled_mask = cv2.resize(a_mask, (scaled_w, scaled_h))
                            
                            # CCOEFF_NORMED is much better for shapes with varying brightness/transparency than CCORR
                            result = cv2.matchTemplate(frame_bgr, scaled_anchor, cv2.TM_CCOEFF_NORMED, mask=scaled_mask)
                            _, max_val, _, max_loc = cv2.minMaxLoc(result)
                            
                            if max_val > best_overall_val:
                                best_overall_val = max_val
                                best_overall_loc = max_loc
                                best_overall_scale = scale
                                best_anchor_shape = a_img.shape
                        
                    if best_overall_val > 0.60:  # 0.60 is plenty safe for CCOEFF_NORMED with a good mask
                        ax, ay = best_overall_loc
                        abs_left = half_rect["left"] + ax
                        abs_top  = half_rect["top"] + ay
                        
                        print(f"[MinimapROI] Anchor matched (score={best_overall_val:.3f}, scale={best_overall_scale:.2f})")
                        return {
                            "left": abs_left,
                            "top": abs_top,
                            "width": int(best_anchor_shape[1] * best_overall_scale),
                            "height": int(best_anchor_shape[0] * best_overall_scale),
                        }, True
                    else:
                        print(f"[MinimapROI] Best anchor match too low: {best_overall_val:.3f}")
            except Exception as e:
                print(f"[MinimapROI] Error during anchor matching: {e}")

    # Fallback
    print(f"[MinimapROI] Using fallback ROI (no anchor match)")
    return fallback_roi, False


class MinimapCapture:

    def __init__(self, target_fps: int = 30, anchor_dir: str = None):
        self.target_fps = target_fps
        self.anchor_dir = anchor_dir

        self._hwnd: Optional[int] = None
        self._roi: Optional[dict] = None
        self._anchor_found: bool = False
        self._last_anchor_attempt: float = 0.0
        self._latest_frame: Optional[np.ndarray] = None
        self._lock = threading.Lock()
        self._running = False
        self._thread: Optional[threading.Thread] = None

    # ── public API ──────────────────────────────────────────────────────────

    def connect(self) -> bool:
        self._hwnd = find_lol_window()
        if self._hwnd is None:
            return False

        # Don't attempt anchor matching if LoL is minimized — mss would capture
        # the wrong thing.  But don't block other processes from continuing.
        if win32gui.IsIconic(self._hwnd):
            print("[MinimapCapture] LoL window is minimized — skipping anchor match")
            return False

        # If LoL isn't in the foreground we can still try, but warn.
        foreground = win32gui.GetForegroundWindow()
        if foreground != self._hwnd:
            print("[MinimapCapture] LoL is not in the foreground — skipping anchor match (alt-tabbed?)")
            return False

        rect = get_window_rect(self._hwnd)
        if not rect or len(rect) < 4:
            return False
        
        self._roi, self._anchor_found = compute_minimap_roi(rect[0], rect[1], rect[2], rect[3], self.anchor_dir)
        self._last_anchor_attempt = time.time()
        
        if self._anchor_found:
            print(f"[MinimapCapture] Minimap ROI locked via anchor: {self._roi}")
        return self._anchor_found

    def set_custom_roi(self, left: int, top: int, width: int, height: int):
        """Override the auto-detected ROI with a manually calibrated region."""
        self._roi = {"left": left, "top": top, "width": width, "height": height}
        self._anchor_found = True  # Treat manual override as locked
        print(f"[MinimapCapture] Custom ROI set: {self._roi}")

    def start(self):
        """Start the background capture thread."""
        if self._roi is None:
            raise RuntimeError("Call connect() or set_custom_roi() first.")
        self._running = True
        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()
        print(f"[MinimapCapture] Capture started at {self.target_fps} FPS.")

    def stop(self):
        """Stop the background capture thread."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)
        print("[MinimapCapture] Capture stopped.")

    def get_latest_frame(self) -> Optional[np.ndarray]:
        """
        Return the most recent captured minimap frame as a BGR numpy array.
        Returns None if no frame is available yet.
        """
        with self._lock:
            return self._latest_frame.copy() if self._latest_frame is not None else None

    def get_roi(self) -> Optional[dict]:
        return self._roi

    # ── internals ───────────────────────────────────────────────────────────

    def _capture_loop(self):
        interval = 1.0 / self.target_fps
        with mss.mss() as sct:
            while self._running:
                t0 = time.perf_counter()

                # If LoL is minimized or not foreground, pause capture but keep thread alive
                if self._hwnd:
                    try:
                        if win32gui.IsIconic(self._hwnd):
                            with self._lock:
                                self._latest_frame = None
                            time.sleep(0.5)
                            continue
                        fg = win32gui.GetForegroundWindow()
                        if fg != self._hwnd:
                            # Alt-tabbed — pause capture but keep thread alive
                            with self._lock:
                                self._latest_frame = None
                            time.sleep(0.25)
                            continue
                    except Exception:
                        pass

                # Re-read window position each frame to handle window moves
                if self._hwnd:
                    try:
                        rect = get_window_rect(self._hwnd)
                        now = time.time()
                        
                        if not self._anchor_found:
                            if now - self._last_anchor_attempt > 5.0:
                                if rect and len(rect) >= 4:
                                    new_roi, found = compute_minimap_roi(rect[0], rect[1], rect[2], rect[3], self.anchor_dir)
                                    self._last_anchor_attempt = now
                                    if found:
                                        self._roi = new_roi
                                        self._anchor_found = True
                            
                    except Exception:
                        pass  # Window may have closed; keep last ROI

                try:
                    raw = sct.grab(self._roi)
                    # mss returns BGRA; convert to BGR for OpenCV
                    frame_bgr = np.array(raw)[:, :, :3]
                    with self._lock:
                        self._latest_frame = frame_bgr
                except Exception as e:
                    print(f"[MinimapCapture] Capture error: {e}")

                elapsed = time.perf_counter() - t0
                sleep_time = interval - elapsed
                if sleep_time > 0:
                    time.sleep(sleep_time)


# ─────────────────────────────────────────
#  Standalone test
# ─────────────────────────────────────────

if __name__ == "__main__":
    anchor_directory = os.path.join(os.path.dirname(__file__), "assets")
    cap = MinimapCapture(target_fps=30, anchor_dir=anchor_directory)
    if not cap.connect():
        print("LoL not found. Exiting.")
        raise SystemExit(1)

    cap.start()
    print("Press Q in the preview window to quit.")

    while True:
        frame = cap.get_latest_frame()
        if frame is not None:
            cv2.imshow("Minimap Capture Test", frame)
        key = cv2.waitKey(50) & 0xFF
        if key == ord("q"):
            break

    cap.stop()
    cv2.destroyAllWindows()


def get_all_capture_sources():
    """
    Returns a list of dictionaries with 'id' and 'name' for screens and windows.
    'id' is either 'screen_X' or the hwnd as a string.
    """
    sources = []
    
    # Add screens via mss
    with mss.mss() as sct:
        for i, monitor in enumerate(sct.monitors[1:], 1):
            sources.append({"id": f"screen_{i}", "name": f"Screen {i} ({monitor['width']}x{monitor['height']})"})

    # Add windows via win32gui
    def _enum_callback(hwnd, _):
        if win32gui.IsWindowVisible(hwnd):
            title = win32gui.GetWindowText(hwnd)
            if title:
                # Filter out generic/background windows loosely
                if title not in ["Program Manager", "Settings", "Microsoft Store"] and not title.startswith("Default IME"):
                    sources.append({"id": str(hwnd), "name": title})

    win32gui.EnumWindows(_enum_callback, None)
    return sources

class WindowCapture:
    def __init__(self, source_id: str = "window_lol", target_fps: int = 30, quality: int = 60):
        self.source_id = source_id
        self.target_fps = target_fps
        self.quality = quality
        self._hwnd: Optional[int] = None
        self._screen_idx: Optional[int] = None
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._callback = None

        if self.source_id.startswith("screen_"):
            try:
                self._screen_idx = int(self.source_id.split("_")[1])
            except ValueError:
                self._screen_idx = 1
        elif self.source_id == "window_lol":
            self._hwnd = find_lol_window()
        else:
            try:
                self._hwnd = int(self.source_id)
            except ValueError:
                self._hwnd = find_lol_window()

    def start(self, callback, on_stopped_callback=None):
        """
        Start the streaming capture. 
        The callback receives (base64_frame, width, height).
        """
        if self._screen_idx is None and not self._hwnd and self.source_id != "window_lol":
            return False
            
        self._callback = callback
        self._on_stopped = on_stopped_callback
        self._running = True
        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()
        return True

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=1)

    def _capture_loop(self):
        interval = 1.0 / self.target_fps
        stopped_unexpectedly = False

        while self._running:
            try:
                with mss.mss() as sct:
                    while self._running:
                        t0 = time.perf_counter()
                        
                        monitor = None
                        
                        if self._screen_idx is not None:
                            # Capturing a full screen
                            if self._screen_idx < len(sct.monitors):
                                monitor = sct.monitors[self._screen_idx]
                            else:
                                monitor = sct.monitors[1] # fallback to primary
                        else:
                            # Capturing a window
                            if self.source_id == "window_lol":
                                if not self._hwnd or not win32gui.IsWindow(self._hwnd):
                                    self._hwnd = find_lol_window()
                                    if not self._hwnd:
                                        time.sleep(1)
                                        continue
                            else:
                                if not self._hwnd or not win32gui.IsWindow(self._hwnd):
                                    print(f"[WindowCapture] Tracked window {self.source_id} was closed. Ending stream.")
                                    stopped_unexpectedly = True
                                    self._running = False
                                    break

                            if win32gui.IsIconic(self._hwnd):
                                time.sleep(0.5)
                                continue

                            rect = win32gui.GetWindowRect(self._hwnd)
                            width = rect[2] - rect[0]
                            height = rect[3] - rect[1]
                            
                            if width <= 0 or height <= 0:
                                continue

                            monitor = {
                                "left": rect[0],
                                "top": rect[1],
                                "width": width,
                                "height": height
                            }

                        if not monitor:
                            time.sleep(0.1)
                            continue

                        try:
                            raw = sct.grab(monitor)
                            frame = np.array(raw)[:, :, :3]
                            
                            target_w = 1920
                            target_h = 1080
                            
                            if frame.shape[1] != target_w or frame.shape[0] != target_h:
                                frame = cv2.resize(frame, (target_w, target_h), interpolation=cv2.INTER_AREA)
                            
                            _, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), self.quality])
                            b64_frame = base64.b64encode(buffer).decode('utf-8')
                            
                            if self._callback:
                                self._callback(b64_frame, target_w, target_h)
                                
                        except Exception as e:
                            print(f"[WindowCapture] Error grabbing bound: {e}. Reinitializing MSS context to handle potential monitor DPI layout changes.")
                            break # Escape inner while to recreate MSS context

                        elapsed = time.perf_counter() - t0
                        sleep_time = interval - elapsed
                        if sleep_time > 0:
                            time.sleep(sleep_time)
            except Exception as e:
                print(f"[WindowCapture] Critical loop error: {e}")
                time.sleep(1)

        if stopped_unexpectedly and getattr(self, '_on_stopped', None):
            self._on_stopped()
