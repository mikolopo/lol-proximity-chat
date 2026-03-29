import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";

interface PopoutMapAppProps {
  roomCode: string | null;
  token: string | null;
  backendUrl: string | null;
  appVersion: string | null;
}

/**
 * A lightweight, isolated mini-app that renders ONLY the live minimap.
 * Spawned by the Tauri WebviewWindow with alwaysOnTop for in-game overlay debug.
 * Connects silently to the voice server to receive position broadcasts.
 */
export function PopoutMapApp({ roomCode, token, backendUrl, appVersion }: PopoutMapAppProps) {
  const socketRef = useRef<Socket | null>(null);
  const [positions, setPositions] = useState<Record<string, any>>({});
  const [teamRosters, setTeamRosters] = useState<{ blue: string[]; red: string[] }>({ blue: [], red: [] });
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomCode || !token || !backendUrl) {
      setError("Missing roomCode, token, or backendUrl in URL params.");
      return;
    }

    const normalizedUrl = backendUrl.startsWith("http") ? backendUrl : `http://${backendUrl}`;

    const socket = io(normalizedUrl, {
      auth: { token, version: appVersion },
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      setError(null);
      // Join the room as a silent observer by joining the global lobby
      socket.emit("join_global_lobby");
    });

    socket.on("connect_error", (err) => {
      setError(`Connection failed: ${err.message}`);
      setConnected(false);
    });

    socket.on("disconnect", () => {
      setConnected(false);
    });

    // Listen for position broadcasts for the target room
    socket.on("player_positions", (data: any) => {
      if (data.positions) setPositions(data.positions);
      if (data.team_rosters) setTeamRosters(data.team_rosters);
    });

    socket.on("room_state", (data: any) => {
      if (data.team_rosters) setTeamRosters(data.team_rosters);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomCode, token, backendUrl]);

  if (error) {
    return (
      <div className="h-screen w-screen bg-[#1a1b1e] flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-[#ed4245] font-bold text-sm mb-2">Connection Error</p>
          <p className="text-[#72767d] text-xs">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#1a1b1e] flex flex-col overflow-hidden select-none" style={{ WebkitAppRegion: 'drag' } as any}>
      {/* Tiny header */}
      <div className="h-6 flex items-center justify-between px-2 bg-black/40 flex-shrink-0" style={{ WebkitAppRegion: 'drag' } as any}>
        <span className="text-[9px] font-bold text-[#72767d] uppercase tracking-wider">
          Live Map — {roomCode}
        </span>
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-[#3ba55c]' : 'bg-[#ed4245]'}`} />
      </div>

      {/* Map */}
      <div className="flex-1 relative overflow-hidden m-1 rounded-lg border border-[#202225]">
        {/* Diagonal river line */}
        <div className="absolute w-[150%] h-[1px] bg-white/5 rotate-45 origin-left top-0 left-0" />

        {/* Visual labels: Blue (0,0) is Bottom-Left, Red (1,1) is Top-Right */}
        <div className="absolute bottom-1 left-1 text-[8px] font-bold text-[#5865f2]/40 uppercase z-10">Blue</div>
        <div className="absolute top-1 right-1 text-[8px] font-bold text-[#ed4245]/40 uppercase z-10">Red</div>

        {Object.entries(positions).map(([champ, pos]: [string, any]) => {
          if (pos.x < 0 || pos.y < 0) return null;
          const isBlue = pos.team === 'blue' || teamRosters.blue?.includes(champ);
          const colorClass = isBlue ? 'bg-[#5865f2]' : 'bg-[#ed4245]';
          const isDead = pos.is_dead;
          // Standard orientation: Blue (0,0) is Bottom-Left, Red (1,1) is Top-Right
          const leftPercent = (pos.x / 1000) * 100;
          const bottomPercent = (pos.y / 1000) * 100;

          return (
            <div
              key={champ}
              className={`absolute w-3 h-3 -mt-1.5 -ml-1.5 rounded-full ${colorClass} ${isDead ? 'opacity-30 grayscale' : ''} shadow-sm`}
              style={{ left: `${leftPercent}%`, bottom: `${bottomPercent}%`, transition: 'all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)' }}
              title={`${champ} (${Math.round(pos.x)}, ${Math.round(pos.y)})`}
            >
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-bold text-white whitespace-nowrap bg-black/80 px-1 py-0.5 rounded shadow-xl border border-white/10 z-20">
                {champ.substring(0, 3)}
              </div>
            </div>
          );
        })}

        {Object.keys(positions).length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-[10px] text-[#72767d] italic">Waiting for position data...</p>
          </div>
        )}
      </div>
    </div>
  );
}
