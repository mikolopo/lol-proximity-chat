"""
roi_calibrator.py
-----------------
A simple interactive tool that lets the user manually draw the minimap
region on their screen instead of relying on auto-detection.

Usage:
    python roi_calibrator.py

Instructions shown on screen. The resulting ROI is saved to roi_config.json.
"""

import json
import os
import time
from pathlib import Path
from typing import Optional, Tuple

import cv2
import mss
import numpy as np

CONFIG_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "roi_config.json")

# ─────────────────────────────────────────
#  Save / Load
# ─────────────────────────────────────────

def save_roi(roi: dict):
    with open(CONFIG_FILE, "w") as f:
        json.dump(roi, f, indent=2)
    print(f"[ROI Calibrator] Saved ROI to {CONFIG_FILE}: {roi}")


def load_roi() -> Optional[dict]:
    path = Path(CONFIG_FILE)
    if not path.exists():
        return None
    with open(path) as f:
        return json.load(f)


# ─────────────────────────────────────────
#  Interactive calibration
# ─────────────────────────────────────────

_drawing = False
_start_pt: Optional[Tuple[int, int]] = None
_end_pt:   Optional[Tuple[int, int]] = None


def _mouse_callback(event, x, y, flags, param):
    global _drawing, _start_pt, _end_pt
    if event == cv2.EVENT_LBUTTONDOWN:
        _drawing = True
        _start_pt = (x, y)
        _end_pt   = (x, y)
    elif event == cv2.EVENT_MOUSEMOVE and _drawing:
        _end_pt = (x, y)
    elif event == cv2.EVENT_LBUTTONUP:
        _drawing = False
        _end_pt  = (x, y)


def calibrate():
    """
    Take a full-screen screenshot and display it.
    User draws a rectangle around the minimap.
    Press ENTER to confirm, R to reset, Q to quit without saving.
    """
    global _start_pt, _end_pt

    print("[ROI Calibrator] Taking screenshot in 2 seconds — switch to LoL now!")
    time.sleep(2)

    with mss.mss() as sct:
        raw = sct.grab(sct.monitors[0])   # Grab primary monitor
        screenshot = np.array(raw)[:, :, :3].copy()  # BGR

    win_name = "ROI Calibrator — Draw minimap area, then press ENTER"
    cv2.namedWindow(win_name, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(win_name, 1280, 720)
    cv2.setMouseCallback(win_name, _mouse_callback)

    instructions = [
        "Draw a box around the MINIMAP (bottom-right corner of LoL)",
        "ENTER = confirm | R = reset | Q = quit",
    ]

    while True:
        display = screenshot.copy()

        # Draw guide text
        for i, line in enumerate(instructions):
            cv2.putText(display, line, (20, 40 + i * 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

        # Draw current rectangle
        if _start_pt and _end_pt:
            cv2.rectangle(display, _start_pt, _end_pt, (0, 255, 255), 2)

        cv2.imshow(win_name, display)
        key = cv2.waitKey(20) & 0xFF

        if key == 13 or key == ord("\r"):  # ENTER
            if _start_pt and _end_pt and _start_pt != _end_pt:
                x1, y1 = _start_pt
                x2, y2 = _end_pt
                roi = {
                    "left":   min(x1, x2),
                    "top":    min(y1, y2),
                    "width":  abs(x2 - x1),
                    "height": abs(y2 - y1),
                }
                cv2.destroyAllWindows()
                save_roi(roi)
                return roi
            else:
                print("[ROI Calibrator] No area drawn yet — draw a rectangle first.")

        elif key == ord("r"):
            _start_pt = None
            _end_pt   = None
            print("[ROI Calibrator] Reset.")

        elif key == ord("q"):
            print("[ROI Calibrator] Cancelled.")
            cv2.destroyAllWindows()
            return None


if __name__ == "__main__":
    result = calibrate()
    if result:
        print(f"Calibration complete: {result}")
    else:
        print("Calibration cancelled.")
