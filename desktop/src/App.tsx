import { useState, useEffect, useRef } from "react";
import { Settings, Mic, Headphones, Monitor, X, Plus, MicOff, LogIn, Send } from "lucide-react";
import { Command } from "@tauri-apps/plugin-shell";
import { check } from "@tauri-apps/plugin-updater";
import { VoiceManager } from "./voice/VoiceManager";

// Simple oscillator beep for join/leave notifications
function playNotificationSound(type: 'join' | 'leave') {
    try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        if (type === 'join') {
            osc.frequency.setValueAtTime(400, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.1);
        } else {
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.1);
        }
        
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
    } catch (e) {
        // Audio context might be blocked by browser policy before interaction
    }
}

function App() {
  type RoomInfo = {id: string, mode: 'global' | 'team' | 'proximity'};
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [activeRoom, setActiveRoom] = useState<RoomInfo | null>(null); // The room we are connected to
  const [previewRoom, setPreviewRoom] = useState<RoomInfo | null>(null); // The room we are currently looking at
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const sidecarChildRef = useRef<any>(null);

  // Chat State — per-room message history
  const [allChatMessages, setAllChatMessages] = useState<Record<string, {sender: string, message: string, timestamp: number}[]>>({});
  const chatMessages = previewRoom ? (allChatMessages[previewRoom.id] || []) : [];
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);
  
  // Modals & UI Form
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [newRoomInput, setNewRoomInput] = useState("");
  const [newRoomMode, setNewRoomMode] = useState<'global' | 'team' | 'proximity'>('proximity');

  // Voice State
  const voiceManagerRef = useRef<VoiceManager | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('lpc_playerName') || "Player" + Math.floor(Math.random() * 1000));

  // Room members from server poll (roomCode -> playerNames[])
  const [roomMembers, setRoomMembers] = useState<Record<string, string[]>>({});

  // Proximity Map Data Dashboard
  const [serverMapData, setServerMapData] = useState<any>(null);

  // Local champion name (detected by sidecar, separate from display nickname)
  const [localChampion, setLocalChampion] = useState<string>("");

  // local audio toggles
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);

  // Active speakers
  const [knownPeers, setKnownPeers] = useState<Set<string>>(new Set());
  const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());
  const speakerTimeouts = useRef<Record<string, any>>({});

  // Streaming State
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStream, setCurrentStream] = useState<{ name: string, frame: string, width: number, height: number } | null>(null);
  const [streamingPlayers, setStreamingPlayers] = useState<Set<string>>(new Set());
  const [captureSources, setCaptureSources] = useState<{id: string, name: string}[]>([]);
  const [selectedCaptureSource, setSelectedCaptureSource] = useState<string>("window_lol");
  const [showStreamPickerModal, setShowStreamPickerModal] = useState(false);

  // Champion avatar mapping (playerName -> championName) for DDragon images
  const [peerChampions, setPeerChampions] = useState<Record<string, string>>({});
  const champImgUrl = (champ: string) => `https://ddragon.leagueoflegends.com/cdn/14.5.1/img/champion/${champ}.png`;
  
  // Hardware & Backend Config
  const [audioDevices, setAudioDevices] = useState<{ inputs: MediaDeviceInfo[], outputs: MediaDeviceInfo[] }>({ inputs: [], outputs: [] });
  const [selectedMic, setSelectedMic] = useState<string>(() => localStorage.getItem('lpc_mic') || "default");
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>(() => localStorage.getItem('lpc_speaker') || "default");
  const [backendUrl, setBackendUrl] = useState<string>(() => localStorage.getItem('lpc_backendUrl') || "http://localhost:8080");
  
  // Debug & Test states
  const [isCV2DebugEnabled, setIsCV2DebugEnabled] = useState(false);
  const [isMicTesting, setIsMicTesting] = useState(false);
  const micMediaRecorder = useRef<MediaRecorder | null>(null);
  const micAudioContext = useRef<AudioContext | null>(null);
  const micTestGainRef = useRef<GainNode | null>(null);
  const speakerTestGainRef = useRef<GainNode | null>(null);

  const [micVolume, setMicVolume] = useState<number>(() => parseFloat(localStorage.getItem('lpc_micVol') || '0.3'));
  const [headphoneVolume, setHeadphoneVolume] = useState<number>(() => parseFloat(localStorage.getItem('lpc_hpVol') || '1.0'));
  const [peerVolumes, setPeerVolumes] = useState<Record<string, number>>(() => JSON.parse(localStorage.getItem('lpc_peerVols') || '{}'));
  const [noiseGate, setNoiseGate] = useState<number>(() => parseFloat(localStorage.getItem('lpc_noiseGate') || '0.01'));

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, peerId: string } | null>(null);

  // Updater State
  const [updateStatus, setUpdateStatus] = useState<string>("");
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  // Keep VoiceManager name in sync with UI
  useEffect(() => {
     if (voiceManagerRef.current) {
         voiceManagerRef.current.setPlayerName(playerName);
     }
  }, [playerName]);

  // Keep VoiceManager champion in sync
  useEffect(() => {
     if (voiceManagerRef.current && localChampion) {
         voiceManagerRef.current.setChampionName(localChampion);
     }
  }, [localChampion]);

  // Persist settings whenever they change
  useEffect(() => { localStorage.setItem('lpc_backendUrl', backendUrl); }, [backendUrl]);
  useEffect(() => { localStorage.setItem('lpc_playerName', playerName); }, [playerName]);
  useEffect(() => { localStorage.setItem('lpc_mic', selectedMic); }, [selectedMic]);
  useEffect(() => { localStorage.setItem('lpc_speaker', selectedSpeaker); }, [selectedSpeaker]);
  useEffect(() => { localStorage.setItem('lpc_micVol', String(micVolume)); }, [micVolume]);
  useEffect(() => { localStorage.setItem('lpc_hpVol', String(headphoneVolume)); }, [headphoneVolume]);
  useEffect(() => { localStorage.setItem('lpc_peerVols', JSON.stringify(peerVolumes)); }, [peerVolumes]);
  useEffect(() => { localStorage.setItem('lpc_noiseGate', String(noiseGate)); }, [noiseGate]);

  // Auto-scroll the IPC log panel to the bottom whenever new logs arrive
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Poll the backend /rooms endpoint to discover rooms others have created
  useEffect(() => {
    let cancelled = false;
    // Ensure the URL has a protocol for fetch() calls
    const normalizedUrl = backendUrl.startsWith('http') ? backendUrl : `http://${backendUrl}`;
    async function fetchRooms() {
      try {
        const res = await fetch(`${normalizedUrl}/rooms`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const serverRooms: RoomInfo[] = (data.rooms || []).map((r: any) => ({
          id: r.code,
          mode: r.type === 'proximity' ? 'proximity' : (r.team_only ? 'team' : 'global')
        }));
        // Merge server rooms into local state (don't remove local rooms)
        setRooms(prev => {
          const existing = new Set(prev.map(r => r.id));
          const merged = [...prev];
          for (const sr of serverRooms) {
            if (!existing.has(sr.id)) {
              merged.push(sr);
            }
          }
          return merged.length !== prev.length ? merged : prev;
        });
        // Update room members map and champion data
        const members: Record<string, string[]> = {};
        const newChamps: Record<string, string> = {};
        for (const r of (data.rooms || [])) {
          members[r.code] = r.player_names || [];
          // Parse extended player data with champion info
          for (const p of (r.players_data || [])) {
            if (p.champ) newChamps[p.name] = p.champ;
          }
        }
        setRoomMembers(members);
        setPeerChampions(prev => {
          const merged = { ...prev, ...newChamps };
          if (JSON.stringify(merged) === JSON.stringify(prev)) return prev;
          return merged;
        });
      } catch (e) {
        // Server might not be up yet or URL is wrong
        console.debug('[RoomPoll] fetch failed:', e);
      }
    }
    fetchRooms();
    const interval = setInterval(fetchRooms, 1500); // Poll faster (1.5s) for responsive UI
    return () => { cancelled = true; clearInterval(interval); };
  }, [backendUrl]);

  const closeSettings = () => {
      setShowSettingsModal(false);
      if (isMicTesting) toggleMicTest();
  };

  useEffect(() => {
    if (!showSettingsModal) return;
    async function fetchDevices() {
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop())).catch(() => {});
            const devices = await navigator.mediaDevices.enumerateDevices();
            setAudioDevices({
                inputs: devices.filter(d => d.kind === 'audioinput'),
                outputs: devices.filter(d => d.kind === 'audiooutput')
            });
        } catch (err) {
            console.error("Failed to enum devices", err);
        }
    }
    fetchDevices();
    
    if (sidecarChildRef.current) {
        try {
            sidecarChildRef.current.write(JSON.stringify({ type: "get_capture_sources", data: {} }) + "\n");
        } catch (e) {}
    }
  }, [showSettingsModal]);

  useEffect(() => {
    let unmounted = false;
    
    async function initSidecar() {
      try {
        const command = Command.sidecar("python-worker");
        
        command.on('close', data => {
          if(!unmounted) setLogs(l => [...l, `[SYSTEM] Process exited with code ${data.code}`]);
        });
        
        command.on('error', error => {
          if(!unmounted) setLogs(l => [...l, `[ERROR] ${error}`]);
        });
        
        command.stdout.on('data', line => {
          if(unmounted) return;
          try {
            const event = JSON.parse(line);
            
            if (event.type === 'positions') {
               if (voiceManagerRef.current) {
                 voiceManagerRef.current.updatePositions(event.data);
               }
               // Log position updates with champion names for diagnostics
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
                   // Also tell VoiceManager immediately
                   if (voiceManagerRef.current) voiceManagerRef.current.setChampionName(champName);
               }
               if (voiceManagerRef.current) {
                   voiceManagerRef.current.updateGamePhase(phase, team, roster);
               }
               setLogs(l => [...l.slice(-50), `[PHASE] ${phase}${team ? ' (team: ' + team + ')' : ''}${champName ? ' (champ: ' + champName + ')' : ''}`]);
            } else if (event.type === 'stream_frame') {
               if (voiceManagerRef.current) {
                 voiceManagerRef.current.sendStreamFrame(event.data.frame, event.data.width, event.data.height);
               }
               // Show local preview
               setCurrentStream({ name: playerName, frame: event.data.frame, width: event.data.width, height: event.data.height });
            } else if (event.type === 'capture_sources') {
               setCaptureSources(event.data || []);
            } else if (event.type === 'log') {
               setLogs(l => [...l.slice(-50), `[PYTHON LOG] ${event.data.message}`]);
            } else {
               setLogs(l => [...l.slice(-50), `[PYTHON] ${event.type}`]);
            }
          } catch(e) {
            setLogs(l => [...l.slice(-50), `[PYTHON STDOUT] ${line}`]);
          }
        });
        
        command.stderr.on('data', line => {
           if(!unmounted) setLogs(l => [...l.slice(-50), `[PYTHON ERROR] ${line}`]);
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
      if (voiceManagerRef.current) voiceManagerRef.current.disconnect();
      Object.values(speakerTimeouts.current).forEach(t => clearTimeout(t));
    };
  }, []);

  const handleSpeakerActive = (speaker: string) => {
     setKnownPeers(prev => new Set(prev).add(speaker));
     setActiveSpeakers(prev => {
        const next = new Set(prev);
        next.add(speaker);
        return next;
     });
     
     if (speakerTimeouts.current[speaker]) {
         clearTimeout(speakerTimeouts.current[speaker]);
     }
     
     speakerTimeouts.current[speaker] = setTimeout(() => {
         setActiveSpeakers(prev => {
             const next = new Set(prev);
             next.delete(speaker);
             return next;
         });
     }, 300);
  };

  const toggleMic = () => {
     const nextState = !isMicMuted;
     setIsMicMuted(nextState);
     if (voiceManagerRef.current) {
         voiceManagerRef.current.setMicMuted(nextState);
         voiceManagerRef.current.playSoundEffect(nextState ? 'mute' : 'unmute');
     }
     
     if (!nextState && isDeafened) {
         setIsDeafened(false);
         if (voiceManagerRef.current) voiceManagerRef.current.setDeafened(false);
     }
  };

  const toggleDeafen = () => {
     const nextState = !isDeafened;
     setIsDeafened(nextState);
     if (voiceManagerRef.current) {
         if (nextState) voiceManagerRef.current.playSoundEffect('deafen');
         voiceManagerRef.current.setDeafened(nextState);
         if (!nextState) setTimeout(() => voiceManagerRef.current?.playSoundEffect('undeafen'), 50);
     }
     
     if (nextState) {
         setIsMicMuted(true);
         if (voiceManagerRef.current) voiceManagerRef.current.setMicMuted(true);
     }
  };

  const handleConnect = async (targetRoom: RoomInfo) => {
    if (!targetRoom.id.trim()) return;
    
    if (isConnected && voiceManagerRef.current) {
        voiceManagerRef.current.disconnect();
        setIsConnected(false);
        setKnownPeers(new Set());
        setActiveSpeakers(new Set());
    }
    
    if (voiceManagerRef.current) {
        voiceManagerRef.current.disconnect();
    }
    const normalizedUrl = backendUrl.startsWith('http') ? backendUrl : `http://${backendUrl}`;
    voiceManagerRef.current = new VoiceManager(normalizedUrl);
    
    // CRITICAL FIX: Ensure the new VoiceManager knows what champion we are, otherwise
    // it sends audio tagged as the nickname, which proximity checking drops because limits are exceeded.
    if (localChampion) {
        voiceManagerRef.current.setChampionName(localChampion);
    }
    
    try {
        const isProximity = targetRoom.mode === 'proximity';
        const teamOnly = targetRoom.mode === 'team';
        const deadChat = targetRoom.mode === 'proximity';
        
        await voiceManagerRef.current.connect(playerName, targetRoom.id, selectedMic, selectedSpeaker, isProximity, teamOnly, deadChat, (base64Chunk: string) => {
           if (voiceManagerRef.current?.socket?.connected) {
             voiceManagerRef.current.socket.emit("voice_data", {
                 audio: base64Chunk,
                 player_name: voiceManagerRef.current.localPlayerName,
                 champion_name: voiceManagerRef.current.localChampionName
             });
           }
        }, handleSpeakerActive, (event: string, data: any) => {
           // Room event callback from VoiceManager
           if (event === 'room_joined') {
              const names = (data.players || []).map((p: any) => typeof p === 'string' ? p : p.name);
              setLogs(l => [...l.slice(-50), `[SERVER] Joined room ${data.room_code} — Players: ${names.join(', ')}`]);
              playNotificationSound('join');
              // Add peers from server response (now objects { name, champ })
              if (data.players) {
                const newChamps: Record<string, string> = {};
                data.players.forEach((p: any) => {
                  const pName = typeof p === 'string' ? p : p.name;
                  const pChamp = typeof p === 'object' ? p.champ : '';
                  if (pName !== playerName) setKnownPeers(prev => new Set(prev).add(pName));
                  if (pChamp) newChamps[pName] = pChamp;
                });
                setPeerChampions(prev => ({ ...prev, ...newChamps }));
              }
           } else if (event === 'player_joined') {
              setLogs(l => [...l.slice(-50), `[SERVER] ${data.player_name} joined the room`]);
              playNotificationSound('join');
              setKnownPeers(prev => new Set(prev).add(data.player_name));
              if (data.champion_name) {
                  setPeerChampions(prev => ({ ...prev, [data.player_name]: data.champion_name }));
              }
           } else if (event === 'player_left') {
              setLogs(l => [...l.slice(-50), `[SERVER] ${data.player_name} left the room`]);
              playNotificationSound('leave');
              setKnownPeers(prev => { const n = new Set(prev); n.delete(data.player_name); return n; });
           } else if (event === 'player_renamed') {
              setKnownPeers(prev => {
                  const n = new Set(prev);
                  n.delete(data.old_name);
                  n.add(data.new_name);
                  return n;
              });
              setPeerChampions(prev => {
                  const n = { ...prev };
                  if (n[data.old_name]) { n[data.new_name] = n[data.old_name]; delete n[data.old_name]; }
                  return n;
              });
              setLogs(l => [...l.slice(-50), `[SERVER] ${data.old_name} renamed to ${data.new_name}`]);
           } else if (event === 'player_champion') {
              setPeerChampions(prev => ({ ...prev, [data.player_name]: data.champion_name }));
           } else if (event === 'player_positions') {
               setServerMapData(data);
           } else if (event === 'room_state') {
               // Full robust sync
               const players = data.players || [];
               const names = players.map((p: any) => p.name);
               setKnownPeers(new Set(names.filter((n: string) => n !== playerName)));
               
               const newChamps: Record<string, string> = {};
               const streamingSids = new Set<string>();
               players.forEach((p: any) => {
                   if (p.champ) newChamps[p.name] = p.champ;
                   if (p.is_streaming) streamingSids.add(p.name);
               });
               setPeerChampions(prev => ({ ...prev, ...newChamps }));
               setStreamingPlayers(streamingSids);
               
               setLogs(l => [...l.slice(-50), `[SERVER] Sync: ${players.length} players in room`]);
           } else if (event === 'stream_frame') {
               setCurrentStream({
                   name: data.player_name,
                   frame: data.frame,
                   width: data.width,
                   height: data.height
               });
           } else if (event === 'stream_status_changed') {
               // The room_state event now handles this more robustly, but we can still react to immediate changes
               if (data.is_streaming) {
                   setStreamingPlayers(prev => new Set(prev).add(data.player_name));
               } else {
                   setStreamingPlayers(prev => {
                       const next = new Set(prev);
                       next.delete(data.player_name);
                       return next;
                   });
                   setCurrentStream(prev => prev?.name === data.player_name ? null : prev);
               }
           }
        },
        // Chat message callback
        (msg: {sender: string, message: string, timestamp: number}) => {
           const roomId = targetRoom.id;
           setAllChatMessages(prev => ({
             ...prev,
             [roomId]: [...(prev[roomId] || []).slice(-200), msg]
           }));
        });
        
        // Apply current UI mute/deafen states to the fresh connection
        voiceManagerRef.current.setMicMuted(isMicMuted);
        voiceManagerRef.current.setDeafened(isDeafened);
        voiceManagerRef.current.setMicVolume(micVolume);
        voiceManagerRef.current.setHeadphoneVolume(headphoneVolume);
        voiceManagerRef.current.setNoiseGate(noiseGate);
        
        setActiveRoom(targetRoom);
        setPreviewRoom(targetRoom);
        setIsConnected(true);
        setLogs(l => [...l.slice(-50), `[UI] Connected to Voice Room: ${targetRoom.id}`]);
        
        // Auto-start YOLO detection whenever connected (needed for champion tracking, team roster, and proximity)
        if (sidecarChildRef.current && !isDetecting) {
            sidecarChildRef.current.write(JSON.stringify({ type: "start_detection", data: {} }) + "\n");
            setIsDetecting(true);
            setLogs(l => [...l.slice(-50), "[UI] Auto-started Detection."]);
        }
        
    } catch (err: any) {
        setLogs(l => [...l.slice(-50), `[UI] Microphone connection failed: ${err.message || err}`]);
    }
  };
  
  const handleDisconnect = () => {
    if (voiceManagerRef.current) {
        voiceManagerRef.current.disconnect();
        voiceManagerRef.current = null;
    }
    
    // Auto-stop detection
    if (isDetecting && sidecarChildRef.current) {
        sidecarChildRef.current.write(JSON.stringify({ type: "stop_detection" }) + "\n");
        setIsDetecting(false);
        setLogs(l => [...l.slice(-50), "[UI] Auto-stopped Detection due to disconnect."]);
    }
    
    setIsConnected(false);
    setActiveRoom(null);
    setKnownPeers(new Set());
    setActiveSpeakers(new Set());
    setLogs(l => [...l.slice(-50), "[UI] Disconnected from Voice Room."]);
  };

  const submitAddRoom = (e: React.FormEvent) => {
      e.preventDefault();
      const cleanRoom = newRoomInput.trim().toUpperCase();
      if (cleanRoom) {
         if (!rooms.find(r => r.id === cleanRoom)) {
             const createdRoom: RoomInfo = { id: cleanRoom, mode: newRoomMode };
             setRooms([...rooms, createdRoom]);
             setPreviewRoom(createdRoom);
         } else {
             setPreviewRoom(rooms.find(r => r.id === cleanRoom) || null);
         }
      }
      setNewRoomInput("");
      setNewRoomMode('proximity');
      setShowAddModal(false);
  };
  
  const toggleCV2Debug = async () => {
    if (!sidecarChildRef.current) return;
    const nextState = !isCV2DebugEnabled;
    setIsCV2DebugEnabled(nextState);
    await sidecarChildRef.current.write(JSON.stringify({ type: "toggle_debug", data: { enabled: nextState } }) + "\n");
    setLogs(l => [...l.slice(-50), `[UI] Toggled YOLO Debug Mode: ${nextState}`]);
  };
  
  const toggleStreaming = async () => {
    if (!voiceManagerRef.current || !sidecarChildRef.current) return;

    if (isStreaming) {
        setIsStreaming(false);
        voiceManagerRef.current.setStreaming(false);
        await sidecarChildRef.current.write(JSON.stringify({ type: "stop_stream", data: {} }) + "\n");
        setLogs(l => [...l.slice(-50), "[UI] Stopped Streaming Mode."]);
    } else {
        setShowStreamPickerModal(true);
    }
  };

  const startStreamWithSource = async (sourceId: string) => {
    if (!voiceManagerRef.current || !sidecarChildRef.current) return;
    setSelectedCaptureSource(sourceId);
    setShowStreamPickerModal(false);
    setIsStreaming(true);
    voiceManagerRef.current.setStreaming(true);
    await sidecarChildRef.current.write(JSON.stringify({ type: "start_stream", data: { source_id: sourceId } }) + "\n");
    setLogs(l => [...l.slice(-50), "[UI] Started Streaming Mode."]);
  };


  const sendChatMessage = () => {
    const msg = chatInput.trim();
    if (!msg || !voiceManagerRef.current?.socket?.connected) return;
    voiceManagerRef.current.socket.emit("chat_message", { message: msg });
    setChatInput("");
  };
  
  const toggleMicTest = async () => {
      if (isMicTesting) {
          setIsMicTesting(false);
          if (micAudioContext.current) { micAudioContext.current.close(); micAudioContext.current = null; }
          if (micMediaRecorder.current && micMediaRecorder.current.stream) {
              micMediaRecorder.current.stream.getTracks().forEach(t => t.stop());
              micMediaRecorder.current = null;
          }
      } else {
          try {
              setIsMicTesting(true);
              const constraints = { audio: selectedMic && selectedMic !== "default" ? { deviceId: { exact: selectedMic } } : true };
              const testStream = await navigator.mediaDevices.getUserMedia(constraints);
              const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
              micAudioContext.current = ac;
              
              if (selectedSpeaker && selectedSpeaker !== "default" && typeof (ac as any).setSinkId === 'function') {
                  try { await (ac as any).setSinkId(selectedSpeaker); } catch (e) {}
              }
              
              const source = ac.createMediaStreamSource(testStream);
              const testMicGain = ac.createGain();
              testMicGain.gain.value = micVolume; // Default
              const testSpeakerGain = ac.createGain();
              testSpeakerGain.gain.value = headphoneVolume; // Default
              
              source.connect(testMicGain);
              testMicGain.connect(testSpeakerGain);
              testSpeakerGain.connect(ac.destination);
              
              micTestGainRef.current = testMicGain;
              speakerTestGainRef.current = testSpeakerGain;
              
              micMediaRecorder.current = { stream: testStream } as any; // Store just to kill tracks later
          } catch (err) {
              console.error("Mic test fail:", err);
              setIsMicTesting(false);
          }
      }
  };

  const triggerManualRescan = async () => {
    if (!sidecarChildRef.current) return;
    await sidecarChildRef.current.write(JSON.stringify({ type: "rescan", data: {} }) + "\n");
    setLogs(l => [...l.slice(-50), "[UI] Triggered Manual YOLO Rescan."]);
  };

  const handleContextMenu = (e: React.MouseEvent, peerId: string) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, peerId });
  };

  const checkForUpdates = async () => {
      try {
          setIsCheckingUpdate(true);
          setUpdateStatus("Looking for updates...");
          const update = await check();
          if (update) {
              setUpdateStatus(`Downloading update ${update.version}...`);
              let downloaded = 0;
              let contentLength = 0;
              await update.downloadAndInstall((event) => {
                  if (event.event === 'Started') {
                      contentLength = event.data.contentLength || 0;
                      setUpdateStatus(`Downloading update ${update.version} (0%)...`);
                  } else if (event.event === 'Progress') {
                      downloaded += event.data.chunkLength;
                      const percent = contentLength ? Math.round((downloaded / contentLength) * 100) : 0;
                      setUpdateStatus(`Downloading update ${update.version} (${percent}%)...`);
                  } else if (event.event === 'Finished') {
                      setUpdateStatus('Applying update...');
                  }
              });
              setUpdateStatus("Update installed! Please restart the app.");
          } else {
              setUpdateStatus("You are on the latest version.");
          }
      } catch (err: any) {
          console.error("Update check failed:", err);
          setUpdateStatus(`Failed to check for updates: ${err.message || err}`);
      } finally {
          setIsCheckingUpdate(false);
      }
  };

  const updatePeerVolume = (peerId: string, vol: number) => {
      setPeerVolumes(prev => ({ ...prev, [peerId]: vol }));
      if (voiceManagerRef.current) {
          voiceManagerRef.current.setPeerVolume(peerId, vol);
      }
  };

  return (
    <div 
        className="flex h-screen w-full bg-bg-tertiary text-text-normal overflow-hidden font-sans relative"
        onClick={() => contextMenu && setContextMenu(null)}
    >
      
      {/* STREAM SOURCE PICKER MODAL */}
      {showStreamPickerModal && (
        <div className="absolute inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#36393f] w-full max-w-sm rounded-lg shadow-2xl flex flex-col pt-6 pb-4 px-4 relative">
            <button
              onClick={() => setShowStreamPickerModal(false)}
              className="absolute top-4 right-4 text-text-muted hover:text-white"
            ><X size={20} /></button>
            <h2 className="text-xl font-bold text-white mb-1">Share Your Screen</h2>
            <p className="text-sm text-text-muted mb-4">Pick a source to stream to the room.</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => startStreamWithSource("window_lol")}
                className="w-full py-2.5 px-3 text-left rounded text-[14px] font-medium bg-[#4f545c] text-white hover:bg-accent transition-colors"
              >
                League of Legends Window
              </button>
              {captureSources.map(s => (
                <button
                  key={s.id}
                  onClick={() => startStreamWithSource(s.id)}
                  className="w-full py-2.5 px-3 text-left rounded text-[14px] font-medium bg-[#4f545c] text-white hover:bg-accent transition-colors truncate"
                >
                  {s.name || s.id}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ADD ROOM MODAL OVERLAY */}
      {showAddModal && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
           <div className="bg-[#36393f] w-full max-w-md rounded-lg shadow-2xl flex flex-col pt-6 pb-4 px-4 relative">
              <button 
                 onClick={() => setShowAddModal(false)}
                 className="absolute top-4 right-4 text-text-muted hover:text-white"
              ><X size={20} /></button>
              
              <h2 className="text-2xl font-bold text-center text-white mb-2">Create a Server</h2>
              <p className="text-center text-text-muted mb-6 text-sm">Enter a unique Room Code to build your server. Share this code with your friends to proximity voice chat!</p>
              
              <form onSubmit={submitAddRoom} className="flex flex-col gap-4">
                 <div>
                    <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block">Server Code</label>
                    <input 
                      autoFocus
                      type="text" 
                      value={newRoomInput}
                      onChange={(e) => setNewRoomInput(e.target.value)}
                      placeholder="e.g. EUW-RANKED-77"
                      className="w-full bg-[#202225] border-none text-text-normal px-3 py-2.5 rounded text-[15px] outline-none focus:ring-1 focus:ring-accent"
                    />
                 </div>
                 
                 <div className="flex flex-col gap-2 mt-2">
                     <label className="text-xs font-bold text-[#8e9297] uppercase mb-1 block">Server Mode</label>
                     
                     <label className={`flex items-start gap-3 p-3 rounded cursor-pointer border transition-colors ${newRoomMode === 'global' ? 'border-accent bg-accent/10' : 'border-[#202225] bg-[#292b2f] hover:bg-[#32353b]'}`}>
                         <input type="radio" name="roomMode" checked={newRoomMode === 'global'} onChange={() => setNewRoomMode('global')} className="mt-1 accent-accent" />
                         <div>
                             <div className="text-sm font-medium text-[#dcddde]">Global Chat</div>
                             <div className="text-xs text-text-muted mt-0.5">Everyone hears everyone, regardless of team or distance.</div>
                         </div>
                     </label>

                     <label className={`flex items-start gap-3 p-3 rounded cursor-pointer border transition-colors ${newRoomMode === 'team' ? 'border-accent bg-accent/10' : 'border-[#202225] bg-[#292b2f] hover:bg-[#32353b]'}`}>
                         <input type="radio" name="roomMode" checked={newRoomMode === 'team'} onChange={() => setNewRoomMode('team')} className="mt-1 accent-accent" />
                         <div>
                             <div className="text-sm font-medium text-[#dcddde]">Team-Based</div>
                             <div className="text-xs text-text-muted mt-0.5">Global audio, but strictly limited to members of your team.</div>
                         </div>
                     </label>

                     <label className={`flex items-start gap-3 p-3 rounded cursor-pointer border transition-colors ${newRoomMode === 'proximity' ? 'border-accent bg-accent/10' : 'border-[#202225] bg-[#292b2f] hover:bg-[#32353b]'}`}>
                         <input type="radio" name="roomMode" checked={newRoomMode === 'proximity'} onChange={() => setNewRoomMode('proximity')} className="mt-1 accent-accent" />
                         <div>
                             <div className="text-sm font-medium text-[#dcddde]">Spatial Proximity</div>
                             <div className="text-xs text-text-muted mt-0.5">Hear nearby players based on map distance. Dead players can hear each other.</div>
                         </div>
                     </label>
                 </div>
                 
                 <button 
                    type="submit" 
                    disabled={!newRoomInput.trim()}
                    className="mt-4 w-full bg-accent hover:bg-accent-hover disabled:bg-accent/50 disabled:cursor-not-allowed text-white text-[15px] font-medium py-2.5 rounded transition-colors"
                 >
                    Create Server
                 </button>
              </form>
           </div>
        </div>
      )}

       {/* SETTINGS MODAL OVERLAY */}
      {showSettingsModal && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
           <div className="bg-[#36393f] w-full max-w-[500px] h-auto max-h-[90vh] overflow-y-auto rounded-lg shadow-2xl flex flex-col pt-6 pb-4 px-6 relative hide-scrollbar">
              <button 
                 onClick={closeSettings}
                 className="absolute top-4 right-4 text-text-muted hover:text-white"
              ><X size={20} /></button>
              
              <h2 className="text-2xl font-bold text-white mb-6">User Settings</h2>
              
              <div className="flex flex-col gap-6 flex-1">
                 <div>
                    <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block">Display Name</label>
                    <input 
                      type="text" 
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      className="w-full bg-[#202225] border-none text-text-normal px-3 py-2.5 rounded text-[15px] outline-none focus:ring-1 focus:ring-accent"
                    />
                    <p className="text-xs text-text-muted mt-1">This is how others will see you.</p>
                 </div>
                 
                 <div className="pt-4 border-t border-[#202225]">
                    <h3 className="text-[#dcddde] font-semibold mb-4">Voice & Video Setup</h3>
                    
                    <div className="flex flex-col gap-4">
                        <div>
                            <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block flex justify-between">
                               <span>Input Device (Microphone)</span>
                               <span className="text-accent">{Math.round(micVolume * 100)}%</span>
                            </label>
                            <input 
                                type="range" min="0" max="2" step="0.05" value={micVolume}
                                onChange={(e) => {
                                    const v = Number(e.target.value);
                                    setMicVolume(v);
                                    if (voiceManagerRef.current) voiceManagerRef.current.setMicVolume(v);
                                    if (micTestGainRef.current) micTestGainRef.current.gain.value = v;
                                }}
                                className="w-full h-1.5 bg-[#202225] rounded-lg appearance-none cursor-pointer accent-accent mb-2"
                            />
                            <select 
                                value={selectedMic}
                                onChange={e => setSelectedMic(e.target.value)}
                                className="w-full bg-[#202225] text-text-normal px-3 py-2.5 rounded text-[14px] outline-none focus:ring-1 focus:ring-accent appearance-none cursor-pointer"
                            >
                               <option value="default">System Default</option>
                               {audioDevices.inputs.map(d => (
                                   d.deviceId !== 'default' && d.deviceId !== 'communications' && <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone (${d.deviceId.slice(0,5)}...)`}</option>
                               ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block flex justify-between">
                               <span>Voice Activity Threshold</span>
                               <span className="text-accent">{Math.round(noiseGate * 100)}%</span>
                            </label>
                            <input 
                                type="range" min="0" max="1" step="0.01" value={noiseGate}
                                onChange={(e) => {
                                    const v = Number(e.target.value);
                                    setNoiseGate(v);
                                    if (voiceManagerRef.current) voiceManagerRef.current.setNoiseGate(v);
                                }}
                                className="w-full h-1.5 bg-[#202225] rounded-lg appearance-none cursor-pointer accent-accent"
                            />
                            <p className="text-xs text-text-muted mt-2 mb-2">Filters out background noise when you stop talking.</p>
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={toggleMicTest}
                                className={`px-4 py-2 w-full text-sm font-medium rounded opacity-90 hover:opacity-100 transition-colors ${isMicTesting ? 'bg-[#ed4245] text-white' : 'bg-[#4f545c] text-white'}`}
                            >
                                {isMicTesting ? "Stop Testing" : "Test Microphone Loopback"}
                            </button>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block flex justify-between">
                               <span>Output Device (Headphones)</span>
                               <span className="text-accent">{Math.round(headphoneVolume * 100)}%</span>
                            </label>
                            <input 
                                type="range" min="0" max="2" step="0.05" value={headphoneVolume}
                                onChange={(e) => {
                                    const v = Number(e.target.value);
                                    setHeadphoneVolume(v);
                                    if (voiceManagerRef.current) voiceManagerRef.current.setHeadphoneVolume(v);
                                    if (speakerTestGainRef.current) speakerTestGainRef.current.gain.value = v;
                                }}
                                className="w-full h-1.5 bg-[#202225] rounded-lg appearance-none cursor-pointer accent-accent mb-2"
                            />
                            <select 
                               value={selectedSpeaker}
                               onChange={e => setSelectedSpeaker(e.target.value)}
                               className="w-full bg-[#202225] text-text-normal px-3 py-2.5 rounded text-[14px] outline-none focus:ring-1 focus:ring-accent appearance-none cursor-pointer"
                            >
                               <option value="default">System Default</option>
                               {audioDevices.outputs.map(d => (
                                   d.deviceId !== 'default' && d.deviceId !== 'communications' && <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker (${d.deviceId.slice(0,5)}...)`}</option>
                               ))}
                            </select>
                        </div>

                    </div>
                 </div>

                 <div className="pt-4 border-t border-[#202225]">
                    <h3 className="text-[#dcddde] font-semibold mb-4">Server Architecture</h3>
                    <div>
                        <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block">Backend URL</label>
                        <input 
                          type="text" 
                          value={backendUrl}
                          onChange={(e) => setBackendUrl(e.target.value)}
                          placeholder="http://localhost:8080"
                          className="w-full bg-[#202225] border-none text-text-normal px-3 py-2.5 rounded text-[15px] outline-none focus:ring-1 focus:ring-accent"
                        />
                        <p className="text-xs text-[#ed4245] mt-1 font-medium">Warning: Changing this requires you to reconnect to the voice channel.</p>
                    </div>
                 </div>

                 <div className="pt-4 border-t border-[#202225]">
                    <h3 className="text-[#dcddde] font-semibold mb-4">App Updates</h3>
                    <div>
                        <button 
                            onClick={checkForUpdates}
                            disabled={isCheckingUpdate}
                            className="w-full py-2.5 rounded text-[14px] font-medium bg-[#4f545c] text-white hover:bg-[#5d6269] transition-colors disabled:opacity-50"
                        >
                            {isCheckingUpdate ? "Checking..." : "Check for Updates"}
                        </button>
                        {updateStatus && <p className="text-xs text-text-muted mt-2">{updateStatus}</p>}
                         <p className="text-xs text-[#8e9297] mt-3">Version 1.0.3</p>
                    </div>
                 </div>
                 
                  <div className="pt-4 border-t border-[#202225]">
                    <h3 className="text-[#dcddde] font-semibold mb-4">Diagnostics</h3>
                    <div className="flex flex-col gap-2">
                         <button 
                            onClick={toggleCV2Debug}
                            className={`w-full py-2.5 rounded text-[14px] font-medium transition-colors ${isCV2DebugEnabled ? "bg-[#ed4245] text-white" : "bg-[#4f545c] text-white hover:bg-[#5d6269]"}`}
                         >
                            {isCV2DebugEnabled ? "Hide YOLO Debug Video" : "Show YOLO Debug Video"}
                         </button>
                         <button 
                            onClick={triggerManualRescan}
                            className="w-full py-2.5 rounded text-[14px] font-medium bg-[#4f545c] text-white hover:bg-[#5d6269] transition-colors"
                         >
                            Manual YOLO Rescan
                         </button>
                         <p className="text-xs text-text-muted mt-2">Force the sidecar to re-check the live game roster and mini-map anchor points immediately.</p>
                    </div>
                 </div>
                 
                 <div className="pt-6 mt-auto border-t border-[#202225]">
                    <button onClick={closeSettings} className="mt-4 w-auto ml-auto px-6 py-2 bg-accent hover:bg-accent-hover text-white rounded font-medium block">
                       Done
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* 1. Server/Main Sidebar (Far Left) */}
      <div className="w-[72px] bg-[#1e1f22] flex flex-col items-center py-3 gap-2 flex-shrink-0 hide-scrollbar overflow-y-auto">
        {/* Main Icon (Deselects room preview) */}
        <div 
           onClick={() => setPreviewRoom(null)}
           className={`w-12 h-12 rounded-[24px] hover:rounded-[16px] transition-all duration-200 flex items-center justify-center cursor-pointer text-white
             ${previewRoom === null ? 'bg-accent rounded-[16px]' : 'bg-bg-secondary hover:bg-accent'}
           `}
        >
          <Monitor size={24} />
        </div>
        <div className="w-8 h-[2px] bg-bg-secondary rounded-full mt-1 mb-1" />
        
        {/* Room Icons */}
        {rooms.map((room) => {
          const isConnectedHere = isConnected && activeRoom?.id === room.id;
          const isPreviewingHere = previewRoom?.id === room.id;
          
          return (
            <div 
              key={room.id}
              className="relative group flex items-center justify-center w-full"
              onMouseEnter={() => setHoveredRoom(room.id)}
              onMouseLeave={() => setHoveredRoom(null)}
            >
              {/* Indicator pills */}
              <div className={`absolute left-0 w-1 bg-white rounded-r-full transition-all duration-300 
                 ${isConnectedHere ? 'h-10' : (isPreviewingHere ? 'h-8' : 'h-0 group-hover:h-5')}`} 
              />
              
              <div 
                onClick={() => setPreviewRoom(room)}
                className={`w-12 h-12 transition-all duration-200 flex items-center justify-center cursor-pointer text-white font-bold text-lg
                  ${isPreviewingHere || isConnectedHere ? 'rounded-[16px] bg-accent' : 'rounded-[24px] bg-bg-secondary hover:rounded-[16px] hover:bg-accent'}
                `}
              >
                {room.id.substring(0,2)}
              </div>
              
              {/* Tooltip */}
              {hoveredRoom === room.id && (
                <div className="absolute left-[70px] bg-black text-white px-3 py-1.5 rounded-md text-sm whitespace-nowrap z-50 shadow-lg font-semibold flex flex-col">
                  <span>{room.id} - {room.mode === 'proximity' ? 'Spatial' : room.mode === 'team' ? 'Team' : 'Global'}</span>
                  <span className="text-xs text-text-muted font-normal mt-0.5">{isConnectedHere ? 'Connected' : (roomMembers[room.id]?.length ? `${roomMembers[room.id].length} online` : 'Click to preview')}</span>
                </div>
              )}
            </div>
          );
        })}

        {/* Add Room Button */}
        <div 
          onClick={() => setShowAddModal(true)}
          className="w-12 h-12 bg-bg-secondary rounded-[24px] hover:rounded-[16px] transition-all duration-200 flex items-center justify-center cursor-pointer text-[#3ba55c] hover:bg-[#3ba55c] hover:text-white mt-1 group relative"
        >
          <Plus size={24} />
          <div className="absolute left-[70px] bg-black text-white px-3 py-1.5 rounded-md text-sm whitespace-nowrap z-50 shadow-lg font-semibold hidden group-hover:block">
            Add a Server
          </div>
        </div>
      </div>

      {/* 2. Channel/Room Sidebar */}
      <div className="w-60 bg-[#2f3136] flex flex-col flex-shrink-0">
        <div className="h-12 border-b border-[#202225] flex items-center px-4 shadow-[0_1px_2px_rgba(0,0,0,0.2)]">
          <h2 className="font-bold text-white truncate text-[15px]">{previewRoom?.id || "Home"}</h2>
        </div>
        
        <div className="flex-1 flex flex-col p-2 overflow-y-auto hide-scrollbar">

          {!previewRoom ? (
             <div className="p-2 mb-4 text-sm text-[#8e9297] text-center italic mt-4">
               Select or create a server from the leftmost sidebar.
             </div>
          ) : (
             <div className="p-2 mb-4">
               <h3 className="text-xs font-semibold text-[#8e9297] uppercase tracking-wider mb-2">Voice Channels</h3>
               
               {/* Channel Block -> Click to join */}
               <div 
                 onClick={() => activeRoom !== previewRoom ? handleConnect(previewRoom) : null}
                 className={`rounded p-2 flex flex-col cursor-pointer transition-colors border-2 ${activeRoom === previewRoom ? 'bg-[#393c43] border-transparent' : 'border-transparent hover:bg-[#34373c]'}`}
               >
                  <div className="flex items-center justify-between">
                     <span className={`font-semibold text-[15px] flex gap-2 items-center 
                         ${activeRoom === previewRoom ? 'text-white' : 'text-[#8e9297] hover:text-[#dcddde]'}`}
                     >
                         <Headphones size={18}/> Global Proximity
                     </span>
                     {activeRoom === previewRoom && (
                        <button onClick={(e) => { e.stopPropagation(); handleDisconnect(); }} className="text-[#8e9297] hover:text-[#ed4245]" title="Disconnect">
                           <X size={16} />
                        </button>
                     )}
                  </div>
                  
                  {activeRoom === previewRoom && isConnected && (
                      <div className="flex flex-col gap-1 mt-2">
                          {/* Local Player rendered dynamically checking activeSpeakers state */}
                          <div className="ml-6 text-sm text-[#dcddde] flex items-center gap-2 py-1">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs uppercase text-white shadow transition-colors overflow-hidden ${activeSpeakers.has(playerName) && (!isMicMuted && !isDeafened) ? 'bg-[#3ba55c] ring-2 ring-[#3ba55c] ring-offset-2 ring-offset-[#2f3136]' : 'bg-accent'}`}>
                               {localChampion ? <img src={champImgUrl(localChampion)} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; (e.target as HTMLImageElement).parentElement!.textContent = playerName.substring(0,2); }} /> : playerName.substring(0,2)}
                            </div>
                            <span className={`font-medium ${activeSpeakers.has(playerName) && (!isMicMuted && !isDeafened) ? 'text-[#3ba55c]' : ''}`}>{playerName} <span className="text-xs font-normal text-[#8e9297] opacity-60 ml-1">(You)</span></span>
                            {(isMicMuted || isDeafened) && <MicOff size={14} className="text-[#ed4245] ml-auto mr-1" />}
                          </div>
                          
                          {/* Remote Peers rendered underneath, glowing green if activeSpeakers has them */}
                          {Array.from(knownPeers).map(peer => {
                             if (peer === playerName) return null;
                             const isSpeaking = activeSpeakers.has(peer);
                             const peerChamp = peerChampions[peer];
                             return (
                                <div key={peer} 
                                    className="ml-6 text-sm text-[#dcddde] flex items-center gap-2 py-1 cursor-pointer hover:bg-white/5 rounded px-1 -ml-1 transition-colors select-none"
                                    onContextMenu={(e) => handleContextMenu(e, peer)}
                                 >
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs uppercase text-white shadow transition-colors overflow-hidden ${isSpeaking ? 'bg-[#3ba55c] ring-2 ring-[#3ba55c] ring-offset-2 ring-offset-[#2f3136]' : 'bg-[#1e1f22]'}`}>
                                        {peerChamp ? <img src={champImgUrl(peerChamp)} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; (e.target as HTMLImageElement).parentElement!.textContent = peer.substring(0,2); }} /> : peer.substring(0,2)}
                                    </div>
                                    <span className={`font-medium ${isSpeaking ? 'text-[#3ba55c]' : ''}`}>{peer}</span>
                                </div>
                             )
                          })}
                      </div>
                  )}

                   {/* Show server-reported members when NOT connected */}
                   {!(activeRoom === previewRoom && isConnected) && previewRoom && roomMembers[previewRoom.id]?.length > 0 && (
                       <div className="flex flex-col gap-1 mt-2">
                           {roomMembers[previewRoom.id].map((name: string) => {
                              const offlineChamp = peerChampions[name];
                              return (
                              <div key={name} className="ml-6 text-sm text-[#8e9297] flex items-center gap-2 py-1">
                                 <div className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs uppercase text-white bg-[#1e1f22] flex-shrink-0 overflow-hidden">
                                    {offlineChamp ? <img src={champImgUrl(offlineChamp)} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; (e.target as HTMLImageElement).parentElement!.textContent = name.substring(0,2); }} /> : name.substring(0,2)}
                                 </div>
                                 <span className="font-medium">{name}</span>
                              </div>
                              );
                           })}
                       </div>
                   )}
               </div>
             </div>
          )}

        </div>

        {/* User controls (Bottom left) */}
        <div className="h-[52px] bg-[#292b2f] flex items-center px-2 py-1.5 gap-2 mt-auto">
          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center flex-shrink-0 text-white font-bold text-xs shadow-sm uppercase overflow-hidden">
            {localChampion ? <img src={champImgUrl(localChampion)} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display='none'; (e.target as HTMLImageElement).parentElement!.textContent = playerName.substring(0,2); }} /> : playerName.substring(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white truncate leading-tight">{playerName}</div>
            <div className="text-xs text-[#8e9297] truncate leading-tight">
                {isDeafened ? 'Deafened' : (isMicMuted ? 'Muted' : (isConnected ? 'Voice Connected' : 'Online'))}
            </div>
          </div>
          <div className="flex gap-1">
            <button 
               onClick={toggleMic}
               className={`p-1.5 rounded transition-colors group relative ${isMicMuted || isDeafened ? 'text-[#ed4245]' : 'text-[#b9bbbe] hover:bg-[#34373c] hover:text-[#dcddde]'}`}
            >
              <Mic size={18} />
              {(isMicMuted || isDeafened) && <div className="absolute w-[22px] h-0.5 bg-[#ed4245] rotate-45 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded" />}
            </button>
            <button 
               onClick={toggleDeafen}
               className={`p-1.5 rounded transition-colors group relative ${isDeafened ? 'text-[#ed4245]' : 'text-[#b9bbbe] hover:bg-[#34373c] hover:text-[#dcddde]'}`}
            >
              <Headphones size={18} />
              {isDeafened && <div className="absolute w-[22px] h-0.5 bg-[#ed4245] rotate-45 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded" />}
            </button>
            <button 
               onClick={toggleStreaming}
               className={`p-1.5 rounded transition-colors group relative ${isStreaming ? 'text-accent' : 'text-[#b9bbbe] hover:bg-[#34373c] hover:text-[#dcddde]'}`}
               title={isStreaming ? "Stop Streaming" : "Stream Screen"}
            >
              <Monitor size={18} />
              {isStreaming && <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#ed4245] rounded-full border-2 border-[#2f3136]" />}
            </button>
            <button 
               onClick={() => setShowSettingsModal(true)}
               className="p-1.5 text-[#b9bbbe] hover:text-[#dcddde] hover:bg-[#34373c] rounded transition-colors"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Main Content Area */}
      <div className="flex-1 bg-[#36393f] flex overflow-hidden">
        
        {/* Main Left Area */}
        <div className="flex-1 flex flex-col relative max-w-full">
        <div className="h-12 border-b border-[#202225] flex items-center px-4 shadow-[0_1px_1px_rgba(0,0,0,0.1)]">
          <span className="text-[#8e9297] text-xl font-light mr-2 select-none">#</span>
          <h2 className="font-semibold text-white text-[15px]">{previewRoom ? (previewRoom.mode === 'proximity' ? 'general-proximity' : previewRoom.mode === 'team' ? 'team-voice' : 'global-voice') : 'dashboard'}</h2>
          {currentStream && (
             <div className="ml-auto flex items-center gap-2 bg-[#4f545c] px-2 py-1 rounded text-[11px] text-white font-bold animate-pulse">
                <div className="w-2 h-2 bg-[#ed4245] rounded-full" />
                LIVE: {currentStream.name}
                <X size={14} className="cursor-pointer hover:text-[#ed4245]" onClick={() => setCurrentStream(null)} />
             </div>
          )}
        </div>

        <div className="flex-1 flex items-center justify-center flex-col p-4 relative overflow-hidden bg-[#202225]">
          
          {/* VIDEO STREAM PLAYER */}
          {currentStream && (
             <div className="absolute inset-0 z-30 bg-black flex items-center justify-center p-2">
                <div className="relative w-full h-full flex items-center justify-center">
                   <img 
                      src={`data:image/jpeg;base64,${currentStream.frame}`} 
                      className="max-w-full max-h-full object-contain rounded shadow-2xl" 
                      style={{ imageRendering: 'crisp-edges' }}
                   />
                   <div className="absolute bottom-4 left-4 bg-black/60 px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-white uppercase overflow-hidden">
                        {peerChampions[currentStream.name] ? <img src={champImgUrl(peerChampions[currentStream.name])} className="w-full h-full object-cover" /> : currentStream.name.substring(0,2)}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-white leading-tight">{currentStream.name}</span>
                        <span className="text-[10px] text-[#b9bbbe] leading-tight">1080p @ 30 FPS</span>
                      </div>
                   </div>
                   <button 
                      onClick={() => setCurrentStream(null)}
                      className="absolute top-4 right-4 p-2 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors"
                   >
                     <X size={20} />
                   </button>
                </div>
             </div>
          )}

          {/* Main Visual Call to Action depending on state */}
          {previewRoom && activeRoom?.id !== previewRoom.id ? (
             <div className="flex flex-col items-center">
                <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-xl bg-[#2f3136] text-[#b9bbbe]">
                  <Monitor size={48} />
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">Welcome to {previewRoom.id}</h1>
                <p className="text-[#b9bbbe] max-w-sm text-center mb-8">
                  You must join the voice channel in the sidebar to talk with other players.
                </p>
                <button 
                  onClick={() => handleConnect(previewRoom)}
                  className="bg-accent hover:bg-accent-hover px-8 py-3 rounded text-white font-bold flex items-center gap-2 transition-colors"
                >
                   <LogIn size={20} /> Join Voice Channel
                </button>
             </div>
          ) : (previewRoom && activeRoom?.id === previewRoom.id) ? (
             <div className="flex flex-col items-center">
                <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-xl bg-[#3ba55c] text-white">
                  <Monitor size={48} />
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">Connected to {activeRoom.id}</h1>
                <p className="text-[#b9bbbe] max-w-md text-center mb-8">
                  Your voice is connected securely. Start the YOLO detection worker in the sidebar so your teammates can hear you based on your live mini-map position!
                </p>
             </div>
          ) : (
             <div className="flex flex-col items-center">
                <div className="w-24 h-24 rounded-[32px] flex items-center justify-center mb-6 shadow-xl bg-accent text-white">
                  <Monitor size={48} />
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">LoL Voice Control Panel</h1>
                <p className="text-[#b9bbbe] max-w-md text-center mb-8">
                  Create a new Server using the (+) button on the left, or click on a server icon to preview its voice channels line-up.
                </p>
             </div>
          )}

          {/* Chat Panel — shown when connected to a room */}
          {activeRoom && previewRoom?.id === activeRoom.id && isConnected && (
            <div className="absolute bottom-[200px] w-full px-8">
              <div className="w-full max-w-3xl mx-auto bg-[#2f3136] rounded shadow-md flex flex-col" style={{maxHeight: '280px'}}>
                <div className="flex-1 overflow-y-auto p-3" style={{minHeight: '80px', maxHeight: '220px'}}>
                  {chatMessages.length === 0 && (
                    <div className="text-[#8e9297] text-sm italic text-center py-4">No messages yet — say something!</div>
                  )}
                  {chatMessages.map((msg, i) => {
                    const isMe = msg.sender === playerName;
                    const time = new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
                    const showHeader = i === 0 || chatMessages[i-1].sender !== msg.sender;
                    return (
                      <div key={i} className={`${showHeader ? 'mt-3 first:mt-0' : 'mt-0.5'}`}>
                        {showHeader && (
                          <div className="flex items-center gap-2 mb-0.5">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold uppercase text-white flex-shrink-0 ${isMe ? 'bg-accent' : 'bg-[#5865f2]'}`}>
                              {msg.sender.substring(0,2)}
                            </div>
                            <span className={`text-sm font-semibold ${isMe ? 'text-accent' : 'text-white'}`}>{msg.sender}</span>
                            <span className="text-[10px] text-[#72767d]">{time}</span>
                          </div>
                        )}
                        <div className="text-sm text-[#dcddde] ml-8">{msg.message}</div>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>
                <div className="border-t border-[#202225] p-2 flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') sendChatMessage(); }}
                    placeholder={`Message #${activeRoom.id.toLowerCase()}`}
                    className="flex-1 bg-[#40444b] text-[#dcddde] text-sm px-3 py-2 rounded-lg outline-none placeholder-[#72767d]"
                  />
                  <button 
                    onClick={sendChatMessage}
                    disabled={!chatInput.trim()}
                    className="px-3 py-2 bg-accent hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Logs Terminal stays at the very bottom */}
          <div className="absolute bottom-6 w-full px-8">
             <div className="w-full max-w-3xl mx-auto bg-[#2f3136] rounded p-4 font-mono text-[11px] text-[#b9bbbe] h-36 overflow-y-auto shadow-md">
                <div className="mb-2 text-white font-bold flex justify-between">
                  <span>IPC Diagnostics</span>
                  <span className="text-[10px] text-[#b9bbbe] font-normal px-2 py-0.5 rounded cursor-pointer hover:text-white" onClick={() => setLogs([])}>Clear Logs</span>
                </div>
                {logs.map((log, i) => {
                  const colorClass = log.includes("[ERROR]") || log.includes("[UI ERROR]") ? "text-[#ed4245]" 
                                   : log.includes("[SYSTEM]") || log.includes("[UI]") ? "text-[#3ba55c]" 
                                   : "";
                  return (
                    <div key={i} className={`py-0.5 border-b border-[#202225] last:border-0 ${colorClass}`}>
                      {log}
                    </div>
                  );
                })}
                {logs.length === 0 && <div className="italic opacity-50">Awaiting events...</div>}
                <div ref={logEndRef} />
             </div>
          </div>
          
        </div>
      </div>

      {/* Right Sidebar (Dashboard) — always visible when connected to a proximity room */}
      {activeRoom && previewRoom?.id === activeRoom.id && isConnected && activeRoom.mode === 'proximity' && (
          <div className="w-72 bg-[#2f3136] flex flex-col border-l border-[#202225] flex-shrink-0">
              <div className="h-12 border-b border-[#202225] flex items-center px-4 flex-shrink-0">
                 <h3 className="font-semibold text-white">Live Match Dashboard</h3>
              </div>
              <div className="flex-1 p-4 overflow-y-auto">
                 {/* Your champion identity */}
                 {localChampion && (
                    <div className="mb-4 p-3 bg-[#202225] rounded-lg">
                       <div className="text-[10px] text-[#72767d] uppercase font-bold mb-1">You are playing</div>
                       <div className="text-white font-semibold">{localChampion}</div>
                    </div>
                 )}

                 {/* Team roster display (when game is detected) */}
                 {serverMapData?.team_rosters && (serverMapData.team_rosters.blue?.length > 0 || serverMapData.team_rosters.red?.length > 0) ? (
                    <>
                    {/* YOLO DEBUG MINIMAP */}
                    <div className="mb-4 aspect-square bg-[#1a1b1e] rounded-lg border border-[#202225] shadow-inner relative overflow-hidden">
                       <div className="absolute top-2 left-2 text-[10px] font-bold text-[#72767d] uppercase z-10 bg-black/60 px-1.5 py-0.5 rounded shadow">Live Map</div>
                       {/* Center line (river approximation) */}
                       <div className="absolute w-[150%] h-[1px] bg-white/5 rotate-45 origin-left top-0 left-0" />
                       
                       {/* Plot each detected position */}
                       {Object.entries(serverMapData.positions || {}).map(([champ, pos]: [string, any]) => {
                           if (pos.x < 0 || pos.y < 0) return null;
                           const isBlue = pos.team === 'blue' || serverMapData.team_rosters.blue?.includes(champ);
                           const colorClass = isBlue ? 'bg-[#5865f2]' : 'bg-[#ed4245]';
                           const isActive = knownPeers.has(champ) || champ === localChampion;
                           const isDead = pos.is_dead;
                           
                           // League coordinate system is roughly 0-1000, 
                           // (0, 0) is bottom-left, (1000, 1000) is top-right
                           const leftPercent = (pos.x / 1000) * 100;
                           const bottomPercent = (pos.y / 1000) * 100;
                           
                           return (
                             <div 
                               key={champ}
                               className={`absolute w-3 h-3 -mt-1.5 -ml-1.5 rounded-full ${colorClass} ${isDead ? 'opacity-30 grayscale' : ''} ${isActive ? 'ring-2 ring-[#3ba55c] shadow-[0_0_8px_rgba(59,165,92,0.8)]' : 'shadow-sm'}`}
                               style={{ left: `${leftPercent}%`, bottom: `${bottomPercent}%`, transition: 'all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)' }}
                               title={`${champ} (${Math.round(pos.x)}, ${Math.round(pos.y)}) - ${pos.visibility} - ${(pos.confidence * 100).toFixed(0)}%`}
                             >
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-bold text-white whitespace-nowrap bg-black/80 px-1 py-0.5 rounded shadow-xl border border-white/10 z-20">
                                   {champ.substring(0,3)}
                                </div>
                             </div>
                           );
                       })}
                    </div>

                    {['blue', 'red'].map(team => {
                       const roster = serverMapData.team_rosters[team] || [];
                       if (roster.length === 0) return null;
                       const isInGame = serverMapData?.game_phase === 'in_game';
                       
                       return (
                         <div key={team} className="mb-6">
                            <h4 className={`text-xs font-bold uppercase mb-2 ${!isInGame ? 'text-[#8e9297]' : (team === 'blue' ? 'text-[#5865f2]' : 'text-[#ed4245]')}`}>
                               {!isInGame ? 'Match Roster' : `${team.charAt(0).toUpperCase() + team.slice(1)} Team`}
                            </h4>
                            <div className="flex flex-col gap-2">
                               {roster.map((champ: string) => {
                                  const posData = serverMapData.positions?.[champ];
                                  const isConnectedToVoice = posData?.is_vc_connected !== undefined ? posData.is_vc_connected : (knownPeers.has(champ) || champ === localChampion);
                                  const isProvidingData = posData?.is_providing_data;
                                  
                                  return (
                                    <div key={champ} className="flex items-center justify-between bg-[#36393f] p-2 rounded shadow-sm">
                                       <div className="flex items-center gap-3">
                                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs uppercase text-white flex-shrink-0 ${!isInGame ? 'bg-[#4f545c]' : (team === 'blue' ? 'bg-[#5865f2]' : 'bg-[#ed4245]')}`}>
                                               {champ.substring(0,2)}
                                            </div>
                                          <div className="flex flex-col">
                                             <span className="text-sm font-medium text-white">{champ}</span>
                                             {isConnectedToVoice ? (
                                                <span className="text-[10px] text-[#3ba55c] font-semibold">Voice Connected</span>
                                             ) : (
                                                <span className="text-[10px] text-[#72767d]">Not in voice</span>
                                             )}
                                          </div>
                                       </div>
                                       <div>
                                          {isProvidingData ? (
                                             <div className="w-3 h-3 rounded-full bg-[#3ba55c] shadow-[0_0_8px_rgba(59,165,92,0.8)]" title="Providing Proximity Map Data" />
                                          ) : (
                                             <div className="w-3 h-3 rounded-full bg-[#72767d]" title="Location Unknown / Stale" />
                                          )}
                                       </div>
                                    </div>
                                  );
                               })}
                            </div>
                         </div>
                       );
                    })}
                    </>
                 ) : (
                    <>
                    {/* Fallback: show connected voice peers by nickname */}
                    <div className="mb-4">
                       <h4 className="text-xs font-bold uppercase mb-2 text-[#b9bbbe]">Connected Players</h4>
                       <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-3 bg-[#36393f] p-2 rounded shadow-sm">
                             <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs uppercase text-white flex-shrink-0 bg-accent">
                                {playerName.substring(0,2)}
                             </div>
                             <div className="flex flex-col">
                                <span className="text-sm font-medium text-white">{playerName}</span>
                                <span className="text-[10px] text-[#3ba55c] font-semibold">You{localChampion ? ` (${localChampion})` : ''}</span>
                             </div>
                          </div>
                          {[...knownPeers].filter(p => p !== playerName && p !== localChampion).map(peer => (
                             <div key={peer} 
                                 className="flex items-center gap-3 bg-[#36393f] p-2 rounded shadow-sm cursor-pointer hover:bg-white/5 transition-colors select-none"
                                 onContextMenu={(e) => handleContextMenu(e, peer)}
                              >
                                 <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs uppercase text-white flex-shrink-0 bg-bg-secondary">
                                    {peerChampions[peer] ? <img src={champImgUrl(peerChampions[peer])} className="w-full h-full object-cover" /> : peer.substring(0,2)}
                                 </div>
                                <span className="text-sm font-medium text-white flex-1 truncate">{peer}</span>
                                {streamingPlayers.has(peer) && (
                                   <div 
                                      onClick={(e) => {
                                         // If we click the monitor icon, we specifically want to watch the stream
                                         e.stopPropagation();
                                      }}
                                      className="p-1 px-2 bg-accent text-white text-[9px] font-bold rounded flex items-center gap-1 animate-pulse"
                                   >
                                      <Monitor size={10} /> LIVE
                                   </div>
                                )}
                             </div>
                          ))}
                       </div>
                    </div>
                    <div className="text-xs text-[#72767d] italic text-center mt-2">Waiting for game detection...</div>
                    </>
                 )}
              </div>
          </div>
      )}

      {/* CONTEXT MENU */}
      {contextMenu && (
        <div 
          className="fixed bg-[#18191c] border border-[#202225] rounded shadow-2xl p-3 z-[100] w-48 animate-in fade-in zoom-in duration-100"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[11px] font-bold text-[#b9bbbe] uppercase mb-3 flex justify-between items-center">
             <span>{contextMenu.peerId} Volume</span>
             <span className="text-accent">{Math.round((peerVolumes[contextMenu.peerId] ?? 1.0) * 100)}%</span>
          </div>
          <input 
             type="range" min="0" max="2" step="0.05" 
             value={peerVolumes[contextMenu.peerId] ?? 1.0}
             onChange={(e) => updatePeerVolume(contextMenu.peerId, Number(e.target.value))}
             className="w-full h-1.5 bg-[#202225] rounded-lg appearance-none cursor-pointer accent-accent mb-2"
          />
          <button 
             onClick={() => updatePeerVolume(contextMenu.peerId, 1.0)}
             className="w-full py-1 text-[10px] bg-[#4f545c] text-white rounded hover:bg-[#5d6269] transition-colors"
          >
             Reset to 100%
          </button>
        </div>
      )}

      </div>
    </div>
  );
}

export default App;
