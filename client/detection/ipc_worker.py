import sys
import json
import logging
import threading
import time
from client.detection.worker import DetectionWorker
from client.capture.screen_capture import WindowCapture, get_all_capture_sources

# Configure logging to write to stderr so stdout is strictly for JSON IPC
logging.basicConfig(level=logging.INFO, stream=sys.stderr, format='%(asctime)s [%(levelname)s] %(message)s')

try:
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
except Exception as e:
    logging.warning(f"Could not reconfigure stdout encoding: {e}")

def send_event(event_type: str, data: dict):
    """Send a JSON event to the Tauri host via stdout"""
    try:
        msg = json.dumps({"type": event_type, "data": data}, separators=(',', ':'))
        print(msg, flush=True)
    except Exception as e:
        logging.error(f"Failed to send event {event_type}: {e}")

class IPC_VoiceClientStub:
    """Mocks the interface of VoiceClient for DetectionWorker to report state downstream."""
    def __init__(self):
        self.player_name = None

    def update_game_phase(self, phase, team=None, roster=None):
        send_event("phase_change", {"phase": phase, "team": team, "roster": roster, "player_name": self.player_name})

    def reset_game_state(self):
        send_event("phase_change", {"phase": "standby", "player_name": None})

    def update_all_positions(self, positions_dict, dead_players):
        send_event("positions", positions_dict)

    def send_stream_frame(self, frame, width, height):
        send_event("stream_frame", {"frame": frame, "width": width, "height": height})

detection_thread = None
stream_worker = None
voice_stub = IPC_VoiceClientStub()

def handle_command(cmd: dict):
    global detection_thread
    cmd_type = cmd.get("type")
    data = cmd.get("data", {})
    
    if cmd_type == "start_detection":
        logging.info("Tauri sent: start_detection")
        if not detection_thread or not detection_thread.is_alive():
            detection_thread = DetectionWorker(voice_stub)
            detection_thread.start()
            send_event("log", {"message": "Detection loop started natively"})
        else:
            send_event("log", {"message": "Detection loop already running"})
            
    elif cmd_type == "stop_detection":
        logging.info("Tauri sent: stop_detection")
        if detection_thread and detection_thread.is_alive():
            detection_thread.running = False
            detection_thread = None
        send_event("log", {"message": "Detection loop stopped"})
        
    elif cmd_type == "toggle_debug":
        if detection_thread and detection_thread.is_alive():
            enable_debug = data.get("enabled", False)
            detection_thread.debug_mode_enabled = enable_debug
            send_event("log", {"message": f"CV2 Debug mode: {enable_debug}"})
            
    elif cmd_type == "rescan":
        if detection_thread and detection_thread.is_alive():
            detection_thread.trigger_rescan()
            send_event("log", {"message": "Manual rescan triggered"})

    elif cmd_type == "get_capture_sources":
        sources = get_all_capture_sources()
        send_event("capture_sources", sources)

    elif cmd_type == "start_stream":
        global stream_worker
        logging.info("Tauri sent: start_stream")
        if not stream_worker:
            source_id = data.get("source_id", "window_lol")
            stream_worker = WindowCapture(source_id=source_id, target_fps=30, quality=60)
            
            def on_stream_stopped():
                global stream_worker
                stream_worker = None
                send_event("stream_stopped", {})

            success = stream_worker.start(voice_stub.send_stream_frame, on_stopped_callback=on_stream_stopped)
            if success:
                send_event("log", {"message": f"Streaming started ({source_id})"})
            else:
                stream_worker = None
                send_event("log", {"message": "Failed to start streaming (Target not found?)"})
        else:
            send_event("log", {"message": "Streaming already running"})

    elif cmd_type == "stop_stream":
        logging.info("Tauri sent: stop_stream")
        if stream_worker:
            stream_worker.stop()
            stream_worker = None
        send_event("log", {"message": "Streaming stopped"})

def command_listener():
    """Read JSON commands from Tauri via stdin"""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
            handle_command(cmd)
        except json.JSONDecodeError:
            logging.error(f"Invalid JSON received: {line}")
        except Exception as e:
            logging.exception(f"Error handling command: {e}")

def main():
    logging.info("Python IPC Worker started")
    send_event("ready", {"status": "ok", "message": "Worker initialized"})
    command_listener()
    logging.info("Python IPC Worker shutting down")

if __name__ == "__main__":
    main()
