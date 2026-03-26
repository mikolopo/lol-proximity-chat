import { io, Socket } from "socket.io-client";

export class VoiceManager {
  public socket: Socket | null = null;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;

  constructor(private url: string = "http://localhost:8080") {}

  private scriptProcessor: ScriptProcessorNode | null = null;
  
  // Audio Config
  private micVolume: number = 0.3;
  private headphoneVolume: number = 1.0;
  private noiseGateThreshold: number = 0.01;
  
  private masterGainNode: GainNode | null = null;
  private micGainNode: GainNode | null = null;
  
  // Proximity State Tracker
  public localPlayerName: string = "";
  public localChampionName: string = "";  // Champion name for map position lookup
  private playerGainNodes: Map<string, GainNode> = new Map();
  private playerFilterNodes: Map<string, BiquadFilterNode> = new Map(); // New: Distance-based filtering
  private peerVolumeOverrides: Map<string, number> = new Map(); // peerId -> volume scalar (0-2)
  private knownChampions: Map<string, string> = new Map();
  private positions: Record<string, any> = {};
  private teamRosters: Record<string, string[]> = {};
  private isProximityMode: boolean = true;
  private roomTeamOnly: boolean = false;
  private roomDeadChat: boolean = true;
  private currentGamePhase: string = "lobby"; // lobby | champ_select | loading | in_game
  private lastRoomJoinedTs: number = 0;
  private currentRoomCode: string = "";
  private isStreaming: boolean = false;

  // Playback buffer queue per player
  private playbackQueues: Map<string, Float32Array[]> = new Map();
  private playbackScheduled: Map<string, number> = new Map();

  // Heartbeat & Watchdog
  private lastPositionsReceivedTs: number = 0;
  private syncCheckInterval: any = null;

  /** Recalculate ALL gain nodes immediately with current state */
  private recalcAllVolumes() {
      if (!this.audioContext) return;
      const myId = this.localChampionName || this.localPlayerName;
      for (const [pName, gainNode] of this.playerGainNodes.entries()) {
          const { volume, filterFreq } = this.computeAudioParams(myId, pName);
          
          if (isFinite(volume)) {
              gainNode.gain.setTargetAtTime(volume, this.audioContext.currentTime, 0.1);
          }
          
          const filterNode = this.playerFilterNodes.get(pName);
          if (filterNode && isFinite(filterFreq)) {
              filterNode.frequency.setTargetAtTime(filterFreq, this.audioContext.currentTime, 0.1);
          }
      }
  }

  private computeAudioParams(myId: string, theirId: string): { volume: number, filterFreq: number } {
      const defaultFreq = 20000;
      
      // During champ_select and loading, everyone hears everyone regardless of mode
      if (["champ_select", "loading", "lobby"].includes(this.currentGamePhase)) {
          return { volume: 1.2, filterFreq: defaultFreq };
      }
      
      // 1. Resolve teams from Server Roster directly
      if (this.roomTeamOnly) {
          let myTeam = "";
          let theirTeam = "";
          for (const [t, champs] of Object.entries(this.teamRosters)) {
              if (Array.isArray(champs)) {
                  if (champs.includes(myId)) myTeam = t;
                  if (champs.includes(theirId)) theirTeam = t;
              }
          }
          if (myTeam && theirTeam && myTeam !== theirTeam) return { volume: 0.0, filterFreq: defaultFreq };
          if (!this.isProximityMode) return { volume: 1.2, filterFreq: defaultFreq };
      }
      
      if (!this.isProximityMode) {
          return { volume: 1.2, filterFreq: defaultFreq };
      }
      
      // 2. Spatial Proximity Logic
      const me = this.positions[myId];
      const them = this.positions[theirId];
      
      if (!me || !them) return { volume: 0.0, filterFreq: defaultFreq };
      if (me.is_dead || them.is_dead) {
          const bothDead = me.is_dead && them.is_dead;
          return { volume: (this.roomDeadChat && bothDead) ? 1.2 : 0.0, filterFreq: defaultFreq };
      }
      if (me.x < 0 || them.x < 0) return { volume: 0.0, filterFreq: defaultFreq };
      
      const dist = Math.sqrt(Math.pow(me.x - them.x, 2) + Math.pow(me.y - them.y, 2));

      // Thresholds
      let startDropDist = 70;
      let maxDist = 120;
      
      let myTeam = "";
      for (const [t, champs] of Object.entries(this.teamRosters)) {
          if (Array.isArray(champs) && champs.includes(myId)) {
              myTeam = t;
              break;
          }
      }
      const enemyTeam = myTeam === "blue" ? "red" : (myTeam === "red" ? "blue" : "");
      const iSeeThem = them.seen_by?.[myTeam] === true;
      const theySeeMe = enemyTeam ? (me.seen_by?.[enemyTeam] === true) : true;

      if (iSeeThem && !theySeeMe) {
          startDropDist = 30; // Stealth hearing starts dropping at 30 units
          maxDist = 80;
      }

      if (dist <= startDropDist) return { volume: 1.2, filterFreq: defaultFreq };
      if (dist >= maxDist) return { volume: 0.0, filterFreq: defaultFreq };

      // Simple Linear Fade
      const range = maxDist - startDropDist;
      const normalizedDist = (dist - startDropDist) / range; // 0 to 1
      let vol = (1.0 - normalizedDist) * 1.2; 
      
      let freq = defaultFreq; // No fancy filters
      
      if (them.visibility === "hidden") vol *= 0.4;
      if (them.visibility === "last_known") vol *= Math.max(0, them.confidence || 0);
      
      const override = this.peerVolumeOverrides.get(theirId);
      if (override !== undefined) vol *= override;

      return { volume: vol, filterFreq: freq };
  }

  // Called by React when Python IPC streams new coordinates
   public updatePositions(newPositions: Record<string, any>) {
      if (this.socket && this.socket.connected) {
         this.socket.emit("detected_positions", {
             positions: newPositions
         });
      }
  }

  public sendStreamFrame(frame: string, width: number, height: number) {
      if (this.socket && this.socket.connected && this.isStreaming) {
          this.socket.emit("stream_frame", {
              frame,
              width,
              height
          });
      }
  }

  public setStreaming(isStreaming: boolean) {
      this.isStreaming = isStreaming;
      if (this.socket && this.socket.connected) {
          this.socket.emit("stream_status", { is_streaming: isStreaming });
      }
  }
  
  public setMicVolume(vol: number) {
      this.micVolume = vol;
      if (this.micGainNode) this.micGainNode.gain.value = vol;
  }

  public setPeerVolume(peerId: string, vol: number) {
      this.peerVolumeOverrides.set(peerId, vol);
      this.recalcAllVolumes();
  }

  public setHeadphoneVolume(vol: number) {
      this.headphoneVolume = vol;
      if (this.masterGainNode) this.masterGainNode.gain.value = vol;
  }

  public setNoiseGate(threshold: number) {
      // Use squared scaling to give more sensitive control at lower end
      // 70% slider = ~0.05 threshold (what 5% used to be - much less brutal)
      this.noiseGateThreshold = Math.pow(threshold, 2) * 0.1;
  }

  public setPlayerName(name: string) {
      if (name) this.localPlayerName = name;
  }

  public setChampionName(name: string) {
      if (name) this.localChampionName = name;
  }
  
  private onSpeakerActive?: (speakerName: string) => void;
  private onRoomEvent?: (event: string, data: any) => void;

  async connect(
    playerName: string, 
    roomCode: string, 
    microphoneId: string,
    speakerId: string,
    isProximity: boolean,
    teamOnly: boolean,
    deadChat: boolean,
    onAudioData: (base64Chunk: string) => void,
    onSpeakerActive?: (speakerName: string) => void,
    onRoomEvent?: (event: string, data: any) => void,
    onChatMessage?: (msg: {sender: string, message: string, timestamp: number}) => void
  ) {
    this.localPlayerName = playerName;
    this.isProximityMode = isProximity;
    this.roomTeamOnly = teamOnly;
    this.roomDeadChat = deadChat;
    this.onSpeakerActive = onSpeakerActive;
    this.onRoomEvent = onRoomEvent;
    this.currentRoomCode = roomCode;
    
    this.socket = io(this.url);

    this.socket.on("connect", () => {
      console.log(`Connected to voice server: ${this.url}`);
      this.socket!.emit("join_room", {
        room_code: roomCode,
        player_name: playerName,
        champion_name: this.localChampionName,
        room_type: isProximity ? "proximity" : "normal",
        team_only: teamOnly,
        dead_chat: deadChat
      });

      // Start periodic heartbeat and sync-check once connected
      if (this.syncCheckInterval) clearInterval(this.syncCheckInterval);
      this.syncCheckInterval = setInterval(() => {
          if (!this.socket?.connected) return;
          
          // 1. Heartbeat to keep server-side player alive
          this.socket.emit("heartbeat");

          // 2. Watchdog: If we haven't received server positions for 15s, we might be desynced
          const now = Date.now();
          const timeSinceJoin = now - (this.lastRoomJoinedTs || 0);
          const timeSinceLastPositions = now - (this.lastPositionsReceivedTs || 0);
          
          // Wait at least 30s after joining before triggering watchdog
          if (timeSinceJoin > 30000 && timeSinceLastPositions > 15000) {
              console.warn("[VoiceManager] Critical desync detected (no server position broadcasts for 15s). Re-joining...");
              this.rejoinRoom(this.currentRoomCode);
          }
      }, 10000);
    });

    this.socket.on("room_joined", (data: any) => {
      this.roomTeamOnly = data.team_only !== undefined ? data.team_only : this.roomTeamOnly;
      this.roomDeadChat = data.dead_chat !== undefined ? data.dead_chat : this.roomDeadChat;
      if (data.team_rosters) this.teamRosters = data.team_rosters;
      console.log(`Joined room: ${data.room_code} (${data.room_type})`);
      
      // Heartbeat for local client synchronization
      this.lastRoomJoinedTs = Date.now();
      
      if (onRoomEvent) onRoomEvent('room_joined', data);
    });
    
    this.socket.on("room_settings_updated", (data: any) => {
      if (data.team_only !== undefined) this.roomTeamOnly = data.team_only;
      if (data.dead_chat !== undefined) this.roomDeadChat = data.dead_chat;
      this.recalcAllVolumes();
    });

    this.socket.on("player_joined", (data: any) => {
      console.log(`Player joined: ${data.player_name}`);
      if (onRoomEvent) onRoomEvent('player_joined', data);
    });

    this.socket.on("player_left", (data: any) => {
      console.log(`Player left: ${data.player_name}`);
      if (onRoomEvent) onRoomEvent('player_left', data);
    });

    this.socket.on("player_renamed", (data: any) => {
      console.log(`Player renamed: ${data.old_name} -> ${data.new_name}`);
      if (onRoomEvent) onRoomEvent('player_renamed', data);
    });

    // Dedicated team_rosters event (fires on game phase change)
    this.socket.on("team_rosters", (data: any) => {
      this.teamRosters = data || {};
      console.log(`Team rosters updated:`, this.teamRosters);
      // Immediately recalculate volumes with new roster data
      this.recalcAllVolumes();
    });

    this.socket.on("disconnect", () => {
      console.log("Disconnected from voice server");
    });

    this.socket.on("room_state", (data: any) => {
        if (data.team_rosters) this.teamRosters = data.team_rosters;
        this.recalcAllVolumes();
        if (onRoomEvent) onRoomEvent('room_state', data);
    });

    this.socket.on("chat_message", (data: any) => {
      if (onChatMessage) {
        onChatMessage({ sender: data.sender, message: data.message, timestamp: data.timestamp });
      }
    });

    this.socket.on("stream_frame", (data: any) => {
        if (onRoomEvent) onRoomEvent('stream_frame', data);
    });

    this.socket.on("stream_status_changed", (data: any) => {
        if (onRoomEvent) onRoomEvent('stream_status_changed', data);
    });

    // Receive global aggregated map data and team rosters from Server
    this.socket.on("player_positions", (data: any) => {
        if (onRoomEvent) onRoomEvent('player_positions', data);
        this.positions = data.positions || {};
        if (data.team_rosters) this.teamRosters = data.team_rosters;

        this.lastPositionsReceivedTs = Date.now();

        // Recalculate volumes whenever we get new position/roster data
        this.recalcAllVolumes();
    });

    // ──── RECEIVE: Raw PCM float32 from other players ────
    this.socket.on("voice_data", (data: any) => {
       if (!this.audioContext || this.audioContext.state !== 'running') return;
       try {
          const uiLabel = data.player_name;
          const mapNodeId = data.champion_name || data.player_name; // We place audio on the map using their Champ if known
          
          if (!mapNodeId || mapNodeId === this.localPlayerName || mapNodeId === this.localChampionName) return;
          
          // Track champion mapping and notify React (debounced — only fires on change)
          if (uiLabel && data.champion_name && this.knownChampions.get(uiLabel) !== data.champion_name) {
              this.knownChampions.set(uiLabel, data.champion_name);
              if (this.onRoomEvent) this.onRoomEvent('player_champion', { player_name: uiLabel, champion_name: data.champion_name });
          }

          if (this.onSpeakerActive && uiLabel) {
             this.onSpeakerActive(uiLabel);
          }
          
          // Decode base64 → Float32Array
          const b64 = data.audio;
          if (!b64 || typeof b64 !== 'string') return;
          
          const binaryStr = atob(b64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const pcmSamples = new Float32Array(bytes.buffer);
          
          // Create an AudioBuffer and play it immediately
          const audioBuffer = this.audioContext.createBuffer(1, pcmSamples.length, 48000);
          audioBuffer.getChannelData(0).set(pcmSamples);
          
          const source = this.audioContext.createBufferSource();
          source.buffer = audioBuffer;
          
          let gainNode = this.playerGainNodes.get(mapNodeId);
          let filterNode = this.playerFilterNodes.get(mapNodeId);

          if (!gainNode || !filterNode) {
              gainNode = this.audioContext.createGain();
              filterNode = this.audioContext.createBiquadFilter();
              filterNode.type = 'lowpass';
              filterNode.frequency.value = 20000;
              
              // Chain: Source -> Filter -> Gain -> Master
              filterNode.connect(gainNode);

              const isPreGame = ["lobby", "champ_select", "loading"].includes(this.currentGamePhase);
              gainNode.gain.value = isPreGame ? 1.0 : 0.0;
              
              if (this.masterGainNode) {
                  gainNode.connect(this.masterGainNode);
              } else {
                  gainNode.connect(this.audioContext.destination);
              }
              this.playerGainNodes.set(mapNodeId, gainNode);
              this.playerFilterNodes.set(mapNodeId, filterNode);
          }
          
          // Schedule playback seamlessly to avoid gaps
          const now = this.audioContext.currentTime;
          const lastEnd = this.playbackScheduled.get(mapNodeId) || now;
          const startTime = Math.max(now, lastEnd);
          
          source.connect(filterNode);
          source.start(startTime);
          
          this.playbackScheduled.set(mapNodeId, startTime + audioBuffer.duration);
       } catch (err) {
          console.warn("[VoiceManager] Audio playback error:", err);
       }
    });

    // Initialize Web Audio API for playback
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 48000 });
    
    if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
    }
    
    this.masterGainNode = this.audioContext.createGain();
    this.masterGainNode.gain.value = this.headphoneVolume;
    this.masterGainNode.connect(this.audioContext.destination);
    
    if (speakerId && speakerId !== "default" && typeof (this.audioContext as any).setSinkId === 'function') {
        try {
            await (this.audioContext as any).setSinkId(speakerId);
            console.log("Routed AudioContext to specific speaker:", speakerId);
        } catch (e) {
            console.error("Failed to route to speaker ID", e);
        }
    }

    try {
      const audioConstraints: any = { 
          echoCancellation: false, 
          noiseSuppression: false, 
          autoGainControl: false,
          sampleRate: 48000,
          channelCount: 1
      };
      
      if (microphoneId && microphoneId !== "default") {
          audioConstraints.deviceId = { exact: microphoneId };
      }
      
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.micGainNode = this.audioContext.createGain();
      this.micGainNode.gain.value = this.micVolume;
      
      // ──── CAPTURE: Raw PCM float32 via ScriptProcessorNode ────
      // 4096 samples (~85ms @ 48kHz) - larger buffer is more stable and reduces CPU overhead
      this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      source.connect(this.micGainNode);
      this.micGainNode.connect(this.scriptProcessor);
      // Connect to destination so the processor fires, but zero its output to prevent local echo
      this.scriptProcessor.connect(this.audioContext.destination);
      
      this.scriptProcessor.onaudioprocess = (e) => {
        // Zero the output buffer to prevent hearing yourself through speakers
        const output = e.outputBuffer.getChannelData(0);
        for (let i = 0; i < output.length; i++) output[i] = 0;
        
        if (!this.socket?.connected) return;
        if (!this.stream?.getAudioTracks()[0].enabled) return; // Muted
        
        const input = e.inputBuffer.getChannelData(0);
        
        // Noise gate: only send if signal exceeds threshold (but don't stutter)
        let maxAmp = 0;
        for (let i = 0; i < input.length; i++) {
            const amp = Math.abs(input[i]);
            if (amp > maxAmp) maxAmp = amp;
        }
        if (maxAmp < this.noiseGateThreshold) return; // Silent — just skip, no stutter
        
        if (this.onSpeakerActive) {
            this.onSpeakerActive(this.localPlayerName);
        }
        
        // Convert Float32Array → base64
        const uint8 = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
        let binary = '';
        for (let i = 0; i < uint8.length; i++) {
            binary += String.fromCharCode(uint8[i]);
        }
        const base64Chunk = btoa(binary);
        onAudioData(base64Chunk);
      };
      
      console.log("Raw PCM capture initialized (48kHz, mono, float32, 4096 samples/chunk)");
      
    } catch (err) {
      console.error("Microphone access denied or error", err);
      throw err;
    }
  }

  public playSoundEffect(type: 'mute' | 'unmute' | 'deafen' | 'undeafen') {
     if (!this.audioContext || this.audioContext.state !== 'running') return;
     const osc = this.audioContext.createOscillator();
     const gainNode = this.audioContext.createGain();
     
     osc.connect(gainNode);
     gainNode.connect(this.audioContext.destination);
     
     const now = this.audioContext.currentTime;
     osc.type = 'sine';
     
     if (type === 'mute') {
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.1);
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
     } else if (type === 'unmute') {
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.1);
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
     } else if (type === 'deafen') {
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.25);
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
     } else {
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(660, now + 0.2);
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
     }
  }

  public setMicMuted(muted: boolean) {
    if (this.stream) {
        this.stream.getAudioTracks().forEach(track => track.enabled = !muted);
    }
  }

  public setDeafened(deafened: boolean) {
    if (this.masterGainNode && this.audioContext) {
        this.masterGainNode.gain.setTargetAtTime(deafened ? 0 : this.headphoneVolume, this.audioContext.currentTime, 0.05);
    }
  }

  disconnect() {
    if (this.syncCheckInterval) {
        clearInterval(this.syncCheckInterval);
        this.syncCheckInterval = null;
    }
    if (this.scriptProcessor) {
        this.scriptProcessor.disconnect();
        this.scriptProcessor = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    this.playerGainNodes.clear();
    this.playerFilterNodes.forEach(f => f.disconnect());
    this.playerFilterNodes.clear();
    this.playbackQueues.clear();
    this.playbackScheduled.clear();
    this.knownChampions.clear();
    if (this.socket) {
      this.socket.emit("leave_room");
      this.socket.disconnect();
      this.socket = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  public updateGamePhase(phase: string, team?: string, roster?: any) {
    const oldPhase = this.currentGamePhase;
    this.currentGamePhase = phase;
    
    // Reset local champion identity when moving to lobby to prevent stale state persistence
    if (phase === "lobby") {
        this.localChampionName = "";
    }
    
    if (this.socket && this.socket.connected) {
      this.socket.emit("update_game_phase", {
        game_phase: phase,
        team: team,
        roster: roster
      });
    }
    
    // Recalculate volumes when the phase changes (e.g. champ_select → in_game)
    if (oldPhase !== phase) {
        console.log(`[VoiceManager] Game phase changed: ${oldPhase} → ${phase}, recalculating volumes`);
        this.recalcAllVolumes();
    }
  }

  private rejoinRoom(roomCode: string) {
    if (!this.socket?.connected) return;
    console.log(`[VoiceManager] Attempting to rejoin room: ${roomCode}`);
    this.socket.emit("join_room", {
      room_code: roomCode,
      player_name: this.localPlayerName,
      champion_name: this.localChampionName,
      room_type: this.isProximityMode ? "proximity" : "normal",
      team_only: this.roomTeamOnly,
      dead_chat: this.roomDeadChat
    });
  }
}
