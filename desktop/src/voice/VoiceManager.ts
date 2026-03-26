import { io, Socket } from "socket.io-client";
import { RnnoiseWorkletNode, loadRnnoise } from "@sapphi-red/web-noise-suppressor";
import rnnoiseWorkletPath from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";
import rnnoiseWasmPath from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseWasmSimdPath from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";

export class VoiceManager {
  public socket: Socket | null = null;
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;

  constructor(private url: string = "http://localhost:8080") {}

  private scriptProcessor: ScriptProcessorNode | null = null;
  
  // Audio Config
  private micVolume: number = 1.0;
  private headphoneVolume: number = 1.0;
  private noiseGateThreshold: number = 0.015; // Linear: slider 0→1 maps to 0→0.1
  private noiseGateOpen: boolean = false;
  private noiseGateHoldTimer: number = 0; // timestamp when gate should close
  private static readonly NOISE_GATE_HOLD_MS: number = 150; // ms to keep gate open after signal drops
  
  // RNNoise
  private rnnoiseNode: RnnoiseWorkletNode | null = null;
  private noiseSuppression: boolean = true;
  
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
          return { volume: 0.85, filterFreq: defaultFreq };
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
          if (!this.isProximityMode) return { volume: 0.85, filterFreq: defaultFreq };
      }
      
      if (!this.isProximityMode) {
          return { volume: 0.85, filterFreq: defaultFreq };
      }
      
      // 2. Spatial Proximity Logic
      const me = this.positions[myId];
      const them = this.positions[theirId];
      
      if (!me || !them) return { volume: 0.0, filterFreq: defaultFreq };
      if (me.is_dead || them.is_dead) {
          const bothDead = me.is_dead && them.is_dead;
          return { volume: (this.roomDeadChat && bothDead) ? 0.85 : 0.0, filterFreq: defaultFreq };
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

      if (dist <= startDropDist) return { volume: 0.85, filterFreq: defaultFreq };
      if (dist >= maxDist) return { volume: 0.0, filterFreq: defaultFreq };

      // Simple Linear Fade
      const range = maxDist - startDropDist;
      const normalizedDist = (dist - startDropDist) / range; // 0 to 1
      let vol = (1.0 - normalizedDist) * 0.85; 
      
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
      if (this.testMicGainNode) this.testMicGainNode.gain.value = vol;
  }

  public setPeerVolume(peerId: string, vol: number) {
      this.peerVolumeOverrides.set(peerId, vol);
      this.recalcAllVolumes();
  }

  public setHeadphoneVolume(vol: number) {
      this.headphoneVolume = vol;
      if (this.masterGainNode) this.masterGainNode.gain.value = vol;
      if (this.testSpeakerGainNode) this.testSpeakerGainNode.gain.value = vol;
  }

  public setNoiseGate(threshold: number) {
      // Linear mapping: slider 0→1 maps to threshold 0→0.1
      this.noiseGateThreshold = threshold * 0.1;
  }
  
  public setNoiseSuppression(enabled: boolean) {
      this.noiseSuppression = enabled;
      if (this.rnnoiseNode) {
          // Bypass by disconnecting/reconnecting
          // We'll handle this via the flag in the audio chain
          try {
              if (enabled) {
                  // Reconnect rnnoise into the chain
                  if (this.micGainNode && this.scriptProcessor) {
                      this.micGainNode.disconnect();
                      this.micGainNode.connect(this.rnnoiseNode);
                      this.rnnoiseNode.connect(this.scriptProcessor);
                  }
              } else {
                  // Bypass rnnoise: connect mic gain directly to script processor
                  if (this.micGainNode && this.scriptProcessor) {
                      this.micGainNode.disconnect();
                      this.rnnoiseNode.disconnect();
                      this.micGainNode.connect(this.scriptProcessor);
                  }
              }
          } catch (e) {
              console.warn("[VoiceManager] Failed to toggle noise suppression:", e);
          }
      }
  }
  
  /** Returns the current mic input level (0-1) for UI metering */
  private testAudioContext: AudioContext | null = null;
  private testStream: MediaStream | null = null;
  private testMicGainNode: GainNode | null = null;
  private testSpeakerGainNode: GainNode | null = null;
  private currentMicLevel: number = 0; // For mic test metering
  private isMicMuted: boolean = false; // For mic test logic
  private isDeafened: boolean = false; // For mic test logic
  
  public getMicLevel(): number {
      return this.currentMicLevel;
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
              gainNode.gain.value = isPreGame ? 0.85 : 0.0;
              
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
      
      // ──── RNNOISE: Register AudioWorklet for noise suppression ────
      try {
          const wasmBinary = await loadRnnoise({ url: rnnoiseWasmPath, simdUrl: rnnoiseWasmSimdPath });
          await this.audioContext.audioWorklet.addModule(rnnoiseWorkletPath);
          this.rnnoiseNode = new RnnoiseWorkletNode(this.audioContext, {
              maxChannels: 1,
              wasmBinary
          });
          console.log("[VoiceManager] RNNoise noise suppression loaded.");
      } catch (rnnoiseErr) {
          console.warn("[VoiceManager] Failed to load RNNoise, running without noise suppression:", rnnoiseErr);
          this.rnnoiseNode = null;
      }
      
      // Build mic chain: Source → MicGain → [RNNoise] → ScriptProcessor → Destination(silent)
      source.connect(this.micGainNode);
      if (this.rnnoiseNode && this.noiseSuppression) {
          this.micGainNode.connect(this.rnnoiseNode);
          this.rnnoiseNode.connect(this.scriptProcessor);
      } else {
          this.micGainNode.connect(this.scriptProcessor);
      }
      // Connect to destination so the processor fires, but zero its output to prevent local echo
      this.scriptProcessor.connect(this.audioContext.destination);
      
      this.scriptProcessor.onaudioprocess = (e) => {
        // Zero the output buffer to prevent hearing yourself through speakers
        const output = e.outputBuffer.getChannelData(0);
        for (let i = 0; i < output.length; i++) output[i] = 0;
        
        if (!this.socket?.connected) return;
        if (!this.stream?.getAudioTracks()[0].enabled) return; // Muted
        
        const input = e.inputBuffer.getChannelData(0);
        
        // Compute mic level for UI metering
        let maxAmp = 0;
        for (let i = 0; i < input.length; i++) {
            const amp = Math.abs(input[i]);
            if (amp > maxAmp) maxAmp = amp;
        }
        this.currentMicLevel = maxAmp; // Unified metering for actual stream
        
        // Noise gate with hold timer to prevent choppy cutoffs
        const now = performance.now();
        if (maxAmp >= this.noiseGateThreshold) {
            this.noiseGateOpen = true;
            this.noiseGateHoldTimer = now + VoiceManager.NOISE_GATE_HOLD_MS;
        } else if (this.noiseGateOpen && now >= this.noiseGateHoldTimer) {
            this.noiseGateOpen = false;
        }
        
        if (!this.noiseGateOpen) return; // Silent — skip
        
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
    this.isMicMuted = muted; // Update for mic test logic
    if (this.stream) {
        this.stream.getAudioTracks().forEach(track => track.enabled = !muted);
    }
  }

  public setDeafened(deafened: boolean) {
    this.isDeafened = deafened; // Update for mic test logic
    if (this.masterGainNode && this.audioContext) {
        this.masterGainNode.gain.setTargetAtTime(deafened ? 0 : this.headphoneVolume, this.audioContext.currentTime, 0.05);
    }
  }

  disconnect() {
    if (this.syncCheckInterval) {
        clearInterval(this.syncCheckInterval);
        this.syncCheckInterval = null;
    }
    if (this.rnnoiseNode) {
        try { this.rnnoiseNode.destroy(); } catch (e) {}
        this.rnnoiseNode = null;
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
    // Clean up mic test resources
    if (this.testAudioContext) { this.testAudioContext.close(); this.testAudioContext = null; }
    if (this.testStream) { this.testStream.getTracks().forEach(t => t.stop()); this.testStream = null; }
    this.currentMicLevel = 0;
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

  // --- LOCAL MIC TESTING WITH RNNOISE & GATE ---
  public async toggleMicTest(enable: boolean, micId: string, speakerId: string) {
      if (!enable) {
          if (this.testAudioContext) { this.testAudioContext.close(); this.testAudioContext = null; }
          if (this.testStream) { this.testStream.getTracks().forEach(t => t.stop()); this.testStream = null; }
          this.currentMicLevel = 0;
          return;
      }
      
      this.testAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 48000 });
      
      const constraints: any = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000, channelCount: 1 };
      if (micId && micId !== "default") constraints.deviceId = { exact: micId };
      this.testStream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
      
      const source = this.testAudioContext.createMediaStreamSource(this.testStream);
      this.testMicGainNode = this.testAudioContext.createGain();
      this.testMicGainNode.gain.value = this.micVolume;
      
      this.testSpeakerGainNode = this.testAudioContext.createGain();
      this.testSpeakerGainNode.gain.value = this.headphoneVolume;
      this.testSpeakerGainNode.connect(this.testAudioContext.destination);
      
      if (speakerId && speakerId !== "default" && typeof (this.testAudioContext as any).setSinkId === 'function') {
          try { await (this.testAudioContext as any).setSinkId(speakerId); } catch(e){}
      }
      
      source.connect(this.testMicGainNode);
      let processNode: AudioNode = this.testMicGainNode;
      
      if (this.noiseSuppression) {
          try {
              const { loadRnnoise, RnnoiseWorkletNode } = await import("@sapphi-red/web-noise-suppressor");
              const rnnoiseWasmUrl = (await import("@sapphi-red/web-noise-suppressor/rnnoise.wasm?url")).default;
              const rnnoiseSimdWasmUrl = (await import("@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url")).default;
              const workletUrl = (await import("@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url")).default;
              
              const wasmBinary = await loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl });
              await this.testAudioContext.audioWorklet.addModule(workletUrl);
              const node = new RnnoiseWorkletNode(this.testAudioContext, {
                  maxChannels: 1,
                  wasmBinary
              });
              this.testMicGainNode.connect(node);
              processNode = node;
          } catch(e) {}
      }
      
      const sp = this.testAudioContext.createScriptProcessor(4096, 1, 1);
      processNode.connect(sp);
      sp.connect(this.testSpeakerGainNode);
      
      let holdFrames = 0;
      sp.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0);
          const output = e.outputBuffer.getChannelData(0);
          
          let sumSquares = 0;
          for (let i = 0; i < input.length; i++) { sumSquares += input[i] * input[i]; }
          const rms = Math.sqrt(sumSquares / input.length);
          this.currentMicLevel = rms;
          
          const threshold = this.noiseGateThreshold * 0.1;
          
          if (rms > threshold || this.isMicMuted || this.isDeafened) {
              holdFrames = Math.ceil((150 / 1000) * (48000 / 4096)); 
          }
          
          if (holdFrames > 0 && !this.isMicMuted && !this.isDeafened) {
              holdFrames--;
              for (let i=0; i<input.length; i++) output[i] = input[i];
          } else {
              for(let i=0; i<input.length; i++) output[i] = 0;
          }
      };
  }
}
