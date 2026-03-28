import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import type { RoomInfo } from "../types";

/** Global Socket.IO connection for real-time room discovery. */
export function useWebSocket(
  backendUrl: string,
  authToken: string | null,
  appVersion: string,
  setRooms: React.Dispatch<React.SetStateAction<RoomInfo[]>>,
  setRoomMembers: React.Dispatch<React.SetStateAction<Record<string, string[]>>>,
  setPeerChampions: React.Dispatch<React.SetStateAction<Record<string, string>>>,
) {
  const globalSocketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!authToken) return;
    const normalizedUrl = backendUrl.startsWith('http') ? backendUrl : `http://${backendUrl}`;
    const socket = io(normalizedUrl, {
      reconnection: true,
      auth: { token: authToken, version: appVersion || "1.1.2" },
    });
    globalSocketRef.current = socket;

    socket.on("connect", () => socket.emit("join_global_lobby"));

    socket.on("available_rooms_updated", (data: any) => {
      const serverRooms: RoomInfo[] = (data.rooms || []).map((r: any) => ({
        id: r.code,
        mode: r.type === 'proximity' ? 'proximity' : (r.team_only ? 'team' : 'global'),
        host_id: r.host_id?.toString(),
        is_locked: r.is_locked,
        has_password: r.has_password,
        players_data: (r.players_data || []).map((p: any) => ({
          ...p,
          user_id: p.user_id?.toString(),
        })),
      }));

      setRooms(serverRooms);

      const members: Record<string, string[]> = {};
      const newChamps: Record<string, string> = {};
      for (const r of (data.rooms || [])) {
        members[r.code] = r.player_names || [];
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
    });

    return () => {
      socket.disconnect();
      globalSocketRef.current = null;
    };
  }, [backendUrl, authToken, appVersion]);

  return { globalSocketRef };
}
