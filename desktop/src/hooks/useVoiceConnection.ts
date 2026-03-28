import { useState, useRef, useCallback } from "react";
import { VoiceManager } from "../voice/VoiceManager";
import type { RoomInfo } from "../types";
import { playNotificationSound } from "../utils/audio";

/** Voice connection lifecycle, mic/deafen toggles, peer tracking. */
export function useVoiceConnection(
  backendUrl: string,
  playerName: string,
  userId: string | null,
  authToken: string | null,
  appVersion: string,
) {
  const voiceManagerRef = useRef<VoiceManager | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);

  // Peer tracking
  const [knownPeers, setKnownPeers] = useState<Set<string>>(new Set());
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());
  const speakerTimeouts = useRef<Record<string, any>>({});

  // Champion / map data
  const [peerChampions, setPeerChampions] = useState<Record<string, string>>({});
  const [localChampion, setLocalChampion] = useState("");
  const [serverMapData, setServerMapData] = useState<any>(null);

  // Per-peer volume overrides
  const [peerVolumes, setPeerVolumes] = useState<Record<string, number>>(
    () => JSON.parse(localStorage.getItem('lpc_peerVols') || '{}')
  );

  // Streaming
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStream, setCurrentStream] = useState<{ name: string; frame: string; width: number; height: number } | null>(null);
  const [streamingPlayers, setStreamingPlayers] = useState<Set<string>>(new Set());
  const watchedStreamRef = useRef<string | null>(null);
  const [watchedStream, _setWatchedStream] = useState<string | null>(null);

  const setWatchedStream = useCallback((s: string | null) => {
    watchedStreamRef.current = s;
    _setWatchedStream(s);
    setCurrentStream(null);
  }, []);

  const handleSpeakerActive = useCallback((speakerId: string | number) => {
    const id = speakerId.toString();
    setKnownPeers(prev => new Set(prev).add(id));
    setActiveSpeakers(prev => new Set(prev).add(id));

    if (speakerTimeouts.current[id]) clearTimeout(speakerTimeouts.current[id]);
    speakerTimeouts.current[id] = setTimeout(() => {
      setActiveSpeakers(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 300);
  }, []);

  const toggleMic = useCallback(() => {
    const nextState = !isMicMuted;
    setIsMicMuted(nextState);
    if (voiceManagerRef.current) {
      voiceManagerRef.current.setMicMuted(nextState);
      voiceManagerRef.current.playSoundEffect(nextState ? 'mute' : 'unmute');
    }
    if (!nextState && isDeafened) {
      setIsDeafened(false);
      voiceManagerRef.current?.setDeafened(false);
    }
  }, [isMicMuted, isDeafened]);

  const toggleDeafen = useCallback(() => {
    const nextState = !isDeafened;
    setIsDeafened(nextState);
    if (voiceManagerRef.current) {
      if (nextState) voiceManagerRef.current.playSoundEffect('deafen');
      voiceManagerRef.current.setDeafened(nextState);
      if (!nextState) setTimeout(() => voiceManagerRef.current?.playSoundEffect('undeafen'), 50);
    }
    if (nextState) {
      setIsMicMuted(true);
      voiceManagerRef.current?.setMicMuted(true);
    }
  }, [isDeafened]);

  const updatePeerVolume = useCallback((peerId: string, vol: number) => {
    setPeerVolumes(prev => ({ ...prev, [peerId]: vol }));
    voiceManagerRef.current?.setPeerVolume(peerId, vol);
  }, []);

  /** Connect to a voice room. Returns void; sets isConnected on success. */
  const handleConnect = async (
    targetRoom: RoomInfo,
    selectedMic: string,
    selectedSpeaker: string,
    micVolume: number,
    headphoneVolume: number,
    noiseGate: number,
    sidecarChildRef: React.MutableRefObject<any>,
    isDetecting: boolean,
    setIsDetecting: (v: boolean) => void,
    setActiveRoom: React.Dispatch<React.SetStateAction<RoomInfo | null>>,
    setPreviewRoom: (r: RoomInfo | null) => void,
    setLogs: React.Dispatch<React.SetStateAction<string[]>>,
    onChatMessage: (msg: { sender: string; message: string; timestamp: number }) => void,
  ) => {
    if (!targetRoom.id.trim()) return;

    // Disconnect existing connection
    if (isConnected && voiceManagerRef.current) {
      if (isStreaming) {
        setIsStreaming(false);
        voiceManagerRef.current.setStreaming(false);
        if (sidecarChildRef.current) {
          sidecarChildRef.current.write(JSON.stringify({ type: "stop_stream", data: {} }) + "\n");
        }
      }
      voiceManagerRef.current.disconnect();
      setIsConnected(false);
      setKnownPeers(new Set());
      setActiveSpeakers(new Set());
    }

    voiceManagerRef.current?.disconnect();
    const normalizedUrl = backendUrl.startsWith('http') ? backendUrl : `http://${backendUrl}`;
    voiceManagerRef.current = new VoiceManager(normalizedUrl);

    if (localChampion) voiceManagerRef.current.setChampionName(localChampion);
    if (userId) voiceManagerRef.current.setUserId(userId);

    try {
      const isProximity = targetRoom.mode === 'proximity';
      const teamOnly = targetRoom.mode === 'team';
      const deadChat = targetRoom.mode === 'proximity';

      await voiceManagerRef.current.connect(
        playerName, targetRoom.id, selectedMic, selectedSpeaker,
        isProximity, teamOnly, deadChat,
        (base64Chunk: string) => {
          if (voiceManagerRef.current?.socket?.connected) {
            voiceManagerRef.current.socket.emit("voice_data", {
              audio: base64Chunk,
              player_name: voiceManagerRef.current.localPlayerName,
              champion_name: voiceManagerRef.current.localChampionName,
            });
          }
        },
        handleSpeakerActive,
        (event: string, data: any) => {
          if (event === 'room_joined') {
            const names = (data.players || []).map((p: any) => typeof p === 'string' ? p : p.name);
            setLogs(l => [...l.slice(-50), `[SERVER] Joined room ${data.room_code} — Players: ${names.join(', ')}`]);
            playNotificationSound('join');
            setActiveRoom((prev: any) => prev ? { ...prev, host_id: data.host_id, players_data: data.players } : null);
            if (data.players) {
              const newChamps: Record<string, string> = {};
              data.players.forEach((p: any) => {
                const pName = typeof p === 'string' ? p : p.name;
                const pUserId = typeof p === 'object' ? p.user_id?.toString() : undefined;
                const pChamp = typeof p === 'object' ? p.champ : '';
                const idToUse = pUserId || pName;
                if (idToUse !== userId) setKnownPeers(prev => new Set(prev).add(idToUse));
                if (pChamp) newChamps[idToUse] = pChamp;
              });
              setPeerChampions(prev => ({ ...prev, ...newChamps }));
            }
          } else if (event === 'player_joined') {
            setLogs(l => [...l.slice(-50), `[SERVER] ${data.player_name} joined the room`]);
            playNotificationSound('join');
            const idToUse = data.user_id ? data.user_id.toString() : data.player_name;
            setKnownPeers(prev => new Set(prev).add(idToUse));
            if (data.champion_name) setPeerChampions(prev => ({ ...prev, [idToUse]: data.champion_name }));
          } else if (event === 'player_left') {
            setLogs(l => [...l.slice(-50), `[SERVER] ${data.player_name} left the room`]);
            playNotificationSound('leave');
            const idToUse = data.user_id ? data.user_id.toString() : data.player_name;
            setKnownPeers(prev => { const n = new Set(prev); n.delete(idToUse); return n; });
          } else if (event === 'player_renamed') {
            setLogs(l => [...l.slice(-50), `[SERVER] ${data.old_name} renamed to ${data.new_name}`]);
          } else if (event === 'player_champion') {
            const abstractId = data.user_id ? data.user_id.toString() : data.player_name;
            setPeerChampions(prev => ({ ...prev, [abstractId]: data.champion_name }));
          } else if (event === 'player_positions') {
            setServerMapData(data);
          } else if (event === 'room_state') {
            setActiveRoom((prev: any) => prev ? { ...prev, host_id: data.host_id, players_data: data.players } : null);
            const players = data.players || [];
            const ids = players.map((p: any) => p.user_id?.toString() || p.name);
            setKnownPeers(new Set(ids.filter((id: string) => id !== userId)));
            const newChamps: Record<string, string> = {};
            const streamingSids = new Set<string>();
            players.forEach((p: any) => {
              const idToUse = p.user_id?.toString() || p.name;
              if (p.champ) newChamps[idToUse] = p.champ;
              if (p.is_streaming) streamingSids.add(idToUse);
            });
            setPeerChampions(prev => ({ ...prev, ...newChamps }));
            setStreamingPlayers(streamingSids);
            setLogs(l => [...l.slice(-50), `[SERVER] Sync: ${players.length} players in room`]);
          } else if (event === 'stream_frame') {
            const idToUse = data.user_id ? data.user_id.toString() : data.player_name;
            setCurrentStream(prev => {
              if (watchedStreamRef.current === idToUse) {
                return { name: data.player_name, frame: data.frame, width: data.width, height: data.height };
              }
              return prev;
            });
          } else if (event === 'stream_status_changed') {
            const idToUse = data.user_id ? data.user_id.toString() : data.player_name;
            if (data.is_streaming) {
              setStreamingPlayers(prev => new Set(prev).add(idToUse));
            } else {
              setStreamingPlayers(prev => { const next = new Set(prev); next.delete(idToUse); return next; });
              setCurrentStream(prev => prev?.name === data.player_name ? null : prev);
              if (watchedStreamRef.current === idToUse) setWatchedStream(null);
            }
          }
        },
        onChatMessage,
        authToken || undefined,
        targetRoom.password || undefined,
        appVersion || "1.1.2",
      );

      // Apply current UI states to the fresh connection
      voiceManagerRef.current.setMicMuted(isMicMuted);
      voiceManagerRef.current.setDeafened(isDeafened);
      voiceManagerRef.current.setMicVolume(micVolume);
      voiceManagerRef.current.setHeadphoneVolume(headphoneVolume);
      voiceManagerRef.current.setNoiseGate(noiseGate);

      setActiveRoom(targetRoom);
      setPreviewRoom(targetRoom);
      setIsConnected(true);
      setLogs(l => [...l.slice(-50), `[UI] Connected to Voice Room: ${targetRoom.id}`]);

      // Auto-start detection
      if (sidecarChildRef.current && !isDetecting) {
        sidecarChildRef.current.write(JSON.stringify({ type: "start_detection", data: {} }) + "\n");
        setIsDetecting(true);
        setLogs(l => [...l.slice(-50), "[UI] Auto-started Detection."]);
      }
    } catch (err: any) {
      let errorMsg = err.message || err.toString();
      if (errorMsg.includes('Permission denied') || err.name === 'NotAllowedError') {
        errorMsg = "Microphone access denied. Please check Windows Settings -> Privacy & security -> Microphone -> 'Allow desktop apps to access your microphone'.";
      }
      setLogs(l => [...l.slice(-50), `[UI] Microphone connection failed: ${errorMsg}`]);
      setIsConnected(false);
    }
  };

  const handleDisconnect = useCallback((
    sidecarChildRef: React.MutableRefObject<any>,
    isDetecting: boolean,
    setIsDetecting: (v: boolean) => void,
    setActiveRoom: React.Dispatch<React.SetStateAction<RoomInfo | null>>,
    setLogs: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    if (isStreaming && voiceManagerRef.current && sidecarChildRef.current) {
      setIsStreaming(false);
      voiceManagerRef.current.setStreaming(false);
      sidecarChildRef.current.write(JSON.stringify({ type: "stop_stream", data: {} }) + "\n");
    }

    if (voiceManagerRef.current) {
      voiceManagerRef.current.disconnect();
      voiceManagerRef.current = null;
    }

    if (isDetecting && sidecarChildRef.current) {
      sidecarChildRef.current.write(JSON.stringify({ type: "stop_detection" }) + "\n");
      setIsDetecting(false);
      setLogs(l => [...l.slice(-50), "[UI] Auto-stopped Detection due to disconnect."]);
    }

    setIsConnected(false);
    setActiveRoom(null);
    setKnownPeers(new Set());
    setActiveSpeakers(new Set());
    setCurrentStream(null);
    setWatchedStream(null);
    setLogs(l => [...l.slice(-50), "[UI] Disconnected from Voice Room."]);
  }, [isStreaming, setWatchedStream]);

  return {
    voiceManagerRef, isConnected, setIsConnected,
    isMicMuted, isDeafened, toggleMic, toggleDeafen,
    knownPeers, setKnownPeers, activeSpeakers,
    peerChampions, setPeerChampions, localChampion, setLocalChampion,
    serverMapData, peerVolumes, updatePeerVolume,
    isStreaming, setIsStreaming, currentStream, setCurrentStream,
    streamingPlayers, watchedStream, watchedStreamRef, setWatchedStream,
    handleSpeakerActive, handleConnect, handleDisconnect,
    speakerTimeouts,
  };
}
