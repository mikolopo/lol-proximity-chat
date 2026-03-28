import { useEffect, useRef, useState } from "react";
import { Command } from "@tauri-apps/plugin-shell";
import type { VoiceManager } from "../voice/VoiceManager";

interface UseSidecarOptions {
  voiceManagerRef: React.MutableRefObject<VoiceManager | null>;
  watchedStreamRef: React.MutableRefObject<string | null>;
  playerName: string;
  setLocalChampion: (champ: string) => void;
  setCurrentStream: React.Dispatch<React.SetStateAction<{ name: string; frame: string; width: number; height: number } | null>>;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
}

/** Python sidecar lifecycle, IPC event routing, detection & streaming commands. */
export function useSidecar({
  voiceManagerRef,
  watchedStreamRef,
  playerName,
  setLocalChampion,
  setCurrentStream,
  setIsStreaming,
}: UseSidecarOptions) {
  const sidecarChildRef = useRef<any>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isCV2DebugEnabled, setIsCV2DebugEnabled] = useState(false);
  const [captureSources, setCaptureSources] = useState<{ id: string; name: string }[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Sidecar spawn lifecycle
  useEffect(() => {
    let unmounted = false;

    async function initSidecar() {
      try {
        const command = Command.sidecar("python-worker");

        command.on('close', data => {
          if (!unmounted) setLogs(l => [...l, `[SYSTEM] Process exited with code ${data.code}`]);
        });

        command.on('error', error => {
          if (!unmounted) setLogs(l => [...l, `[ERROR] ${error}`]);
        });

        command.stdout.on('data', line => {
          if (unmounted) return;
          try {
            const event = JSON.parse(line);

            if (event.type === 'positions') {
              voiceManagerRef.current?.updatePositions(event.data);
              const names = Object.keys(event.data || {});
              if (names.length > 0) {
                setLogs(l => [...l.slice(-50), `[POSITIONS] ${names.length} champs: ${names.join(', ')}`]);
              }
            } else if (event.type === 'phase_change') {
              const phase = event.data?.phase || 'unknown';
              const team = event.data?.team || '';
              const champName = event.data?.player_name;
              const roster = event.data?.roster;

              if (phase === 'lobby') {
                setLocalChampion("");
                if (voiceManagerRef.current) voiceManagerRef.current.setChampionName("");
              }
              if (champName !== undefined && champName !== "") {
                setLocalChampion(champName);
                voiceManagerRef.current?.setChampionName(champName);
              }
              voiceManagerRef.current?.updateGamePhase(phase, team, roster);
              setLogs(l => [...l.slice(-50), `[PHASE] ${phase}${team ? ' (team: ' + team + ')' : ''}${champName ? ' (champ: ' + champName + ')' : ''}`]);
            } else if (event.type === 'stream_frame') {
              voiceManagerRef.current?.sendStreamFrame(event.data.frame, event.data.width, event.data.height);
              setCurrentStream(prev => {
                if (watchedStreamRef.current === playerName) {
                  return { name: playerName, frame: event.data.frame, width: event.data.width, height: event.data.height };
                }
                return prev;
              });
            } else if (event.type === 'stream_stopped') {
              setIsStreaming(false);
              voiceManagerRef.current?.setStreaming(false);
              setLogs(l => [...l.slice(-50), `[UI] Stream auto-stopped (source closed)`]);
            } else if (event.type === 'capture_sources') {
              setCaptureSources(event.data || []);
            } else if (event.type === 'log') {
              setLogs(l => [...l.slice(-50), `[PYTHON LOG] ${event.data.message}`]);
            } else {
              setLogs(l => [...l.slice(-50), `[PYTHON] ${event.type}`]);
            }
          } catch (_) {
            setLogs(l => [...l.slice(-50), `[PYTHON STDOUT] ${line}`]);
          }
        });

        command.stderr.on('data', line => {
          if (!unmounted) setLogs(l => [...l.slice(-50), `[PYTHON ERROR] ${line}`]);
        });

        const child = await command.spawn();
        sidecarChildRef.current = child;
        setLogs(l => [...l, '[SYSTEM] Python Sidecar spawned']);
      } catch (err) {
        console.error("Failed to start sidecar", err);
        setLogs(l => [...l, `[ERROR] Sidecar failed: ${err}`]);
      }
    }

    initSidecar();

    return () => {
      unmounted = true;
      if (sidecarChildRef.current) sidecarChildRef.current.kill();
    };
  }, []);

  const toggleCV2Debug = async () => {
    if (!sidecarChildRef.current) return;
    const nextState = !isCV2DebugEnabled;
    setIsCV2DebugEnabled(nextState);
    await sidecarChildRef.current.write(JSON.stringify({ type: "toggle_debug", data: { enabled: nextState } }) + "\n");
    setLogs(l => [...l.slice(-50), `[UI] Toggled YOLO Debug Mode: ${nextState}`]);
  };

  const triggerManualRescan = async () => {
    if (!sidecarChildRef.current) return;
    await sidecarChildRef.current.write(JSON.stringify({ type: "rescan", data: {} }) + "\n");
    setLogs(l => [...l.slice(-50), "[UI] Triggered Manual YOLO Rescan."]);
  };

  const startStreamWithSource = async (
    sourceId: string,
    voiceMgr: VoiceManager | null,
  ) => {
    if (!voiceMgr || !sidecarChildRef.current) return;
    setIsStreaming(true);
    voiceMgr.setStreaming(true);
    await sidecarChildRef.current.write(JSON.stringify({ type: "start_stream", data: { source_id: sourceId } }) + "\n");
    setLogs(l => [...l.slice(-50), "[UI] Started Streaming Mode."]);
  };

  const stopStreaming = async (voiceMgr: VoiceManager | null) => {
    if (!voiceMgr || !sidecarChildRef.current) return;
    setIsStreaming(false);
    voiceMgr.setStreaming(false);
    await sidecarChildRef.current.write(JSON.stringify({ type: "stop_stream", data: {} }) + "\n");
    setLogs(l => [...l.slice(-50), "[UI] Stopped Streaming Mode."]);
  };

  /** Request capture sources list from the sidecar */
  const refreshCaptureSources = () => {
    if (sidecarChildRef.current) {
      try {
        sidecarChildRef.current.write(JSON.stringify({ type: "get_capture_sources", data: {} }) + "\n");
      } catch (_) {}
    }
  };

  return {
    sidecarChildRef, logs, setLogs, logEndRef,
    isDetecting, setIsDetecting,
    isCV2DebugEnabled, toggleCV2Debug, triggerManualRescan,
    captureSources, refreshCaptureSources,
    startStreamWithSource, stopStreaming,
  };
}
