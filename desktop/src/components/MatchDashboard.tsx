import { Monitor, Crown } from "lucide-react";
import type { RoomInfo } from "../types";
import { champImgUrl } from "../utils/audio";

interface MatchDashboardProps {
  activeRoom: RoomInfo;
  localChampion: string;
  serverMapData: any;
  knownPeers: Set<string>;
  peerChampions: Record<string, string>;
  playerName: string;
  userId: string | null;
  isStreaming: boolean;
  streamingPlayers: Set<string>;
  watchedStream: string | null;
  setWatchedStream: (s: string | null) => void;
  setProfilePopup: (v: { x: number; y: number; peerId: string } | null) => void;
  handleContextMenu: (e: React.MouseEvent, peerId: string) => void;
  toggleLiveMap?: (enabled: boolean) => void;
}

export function MatchDashboard({
  activeRoom, localChampion, serverMapData, knownPeers, peerChampions,
  playerName, userId, isStreaming, streamingPlayers, watchedStream,
  setWatchedStream, setProfilePopup, handleContextMenu, toggleLiveMap,
}: MatchDashboardProps) {
  const hasRoster = activeRoom.mode === 'proximity' && serverMapData?.team_rosters &&
    (serverMapData.team_rosters.blue?.length > 0 || serverMapData.team_rosters.red?.length > 0);

  return (
    <div className="w-72 bg-[#2f3136] flex flex-col border-l border-[#202225] flex-shrink-0">
      <div className="h-12 border-b border-[#202225] flex items-center justify-between px-4 flex-shrink-0">
        <h3 className="font-semibold text-white">Live Match Dashboard</h3>
        {activeRoom.host_id === userId && toggleLiveMap && (
          <button
            onClick={() => toggleLiveMap(activeRoom.live_map_enabled === false ? true : false)}
            className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${activeRoom.live_map_enabled !== false ? 'bg-[#ed4245] hover:bg-red-600 text-white' : 'bg-[#3ba55c] hover:bg-green-600 text-white'}`}
          >
            {activeRoom.live_map_enabled !== false ? 'DISABLE MAP' : 'ENABLE MAP'}
          </button>
        )}
      </div>
      <div className="flex-1 p-4 overflow-y-auto">
        {/* Your champion identity */}
        {localChampion && (
          <div className="mb-4 p-3 bg-[#202225] rounded-lg">
            <div className="text-[10px] text-[#72767d] uppercase font-bold mb-1">You are playing</div>
            <div className="text-white font-semibold">{localChampion}</div>
          </div>
        )}

        {hasRoster ? (
          <>
            {/* Live Minimap */}
            {activeRoom.live_map_enabled !== false ? (
              <div className="mb-4 aspect-square bg-[#1a1b1e] rounded-lg border border-[#202225] shadow-inner relative overflow-hidden">
                  <div className="absolute top-2 left-2 text-[10px] font-bold text-[#72767d] uppercase z-10 bg-black/60 px-1.5 py-0.5 rounded shadow">Live Map</div>
                {/* Visual labels: Blue (0,0) is Bottom-Left, Red (1000,1000) is Top-Right */}
                <div className="absolute bottom-1 left-1 text-[8px] font-bold text-[#5865f2]/40 uppercase z-10">Blue</div>
                <div className="absolute top-1 right-1 text-[8px] font-bold text-[#ed4245]/40 uppercase z-10">Red</div>
                {/* River line (Top-Left to Bottom-Right) */}
                <div className="absolute w-[150%] h-[1px] bg-white/5 rotate-45 origin-left top-0 left-0" />

                {Object.entries(serverMapData.positions || {}).map(([champ, pos]: [string, any]) => {
                  if (pos.x < 0 || pos.y < 0) return null;
                  const isBlue = pos.team === 'blue' || serverMapData.team_rosters.blue?.includes(champ);
                  const colorClass = isBlue ? 'bg-[#5865f2]' : 'bg-[#ed4245]';
                  const isActive = knownPeers.has(champ) || champ === localChampion;
                  const isDead = pos.is_dead;
                  // Inverted orientation: If YOLO sends 1000,1000 for Blue (which we expect at Bottom-Left)
                  // we do 100 - percent so that Blue renders at left:0, bottom:0.
                  const leftPercent = 100 - (pos.x / 10);
                  const bottomPercent = 100 - (pos.y / 10);

                  return (
                    <div
                      key={champ}
                      className={`absolute w-3 h-3 -mt-1.5 -ml-1.5 rounded-full ${colorClass} ${isDead ? 'opacity-30 grayscale' : ''} ${isActive ? 'ring-2 ring-[#3ba55c] shadow-[0_0_8px_rgba(59,165,92,0.8)]' : 'shadow-sm'} group`}
                      style={{ left: `${leftPercent}%`, bottom: `${bottomPercent}%`, transition: 'all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)' }}
                      title={`${champ} (${Math.round(pos.x)}, ${Math.round(pos.y)}) - ${pos.visibility} - ${(pos.confidence * 100).toFixed(0)}%`}
                    >
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-bold text-white whitespace-nowrap bg-black/80 px-1 py-0.5 rounded shadow-xl border border-white/10 z-20">
                        {champ.substring(0, 3)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mb-4 aspect-square bg-[#1a1b1e] rounded-lg border border-[#202225] shadow-inner flex flex-col items-center justify-center p-4 text-center">
                <Monitor className="text-[#72767d] mb-2 opacity-50" size={32} />
                <p className="text-xs text-[#b9bbbe] font-medium">Live Map is disabled</p>
                <p className="text-[10px] text-[#72767d] mt-1">The Room Host has hidden the map to prevent stream sniping or visual clutter.</p>
              </div>
            )}

            {/* Team Rosters */}
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
                              {champ.substring(0, 2)}
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
                          <div className="flex items-center gap-2">
                            {streamingPlayers.has(champ) && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setWatchedStream(watchedStream === champ ? null : champ); }}
                                className={`p-1 px-1.5 text-[8px] font-bold rounded flex items-center gap-1 transition-colors ${watchedStream === champ ? 'bg-[#3ba55c] text-white shadow-[0_0_8px_rgba(59,165,92,0.5)]' : 'bg-[#ed4245] text-white hover:bg-red-600 animate-pulse'}`}
                                title={watchedStream === champ ? "Stop watching" : "Watch stream"}
                              >
                                <Monitor size={10} /> {watchedStream === champ ? 'WATCH' : 'LIVE'}
                              </button>
                            )}
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
            {/* Fallback: connected voice peers by nickname */}
            <div className="mb-4">
              <h4 className="text-xs font-bold uppercase mb-2 text-[#b9bbbe]">Connected Players</h4>
              <div className="flex flex-col gap-2">
                {/* Local player */}
                <div
                  className="flex items-center gap-3 bg-[#36393f] p-2 rounded shadow-sm cursor-pointer hover:bg-white/5 transition-colors select-none"
                  onClick={(e) => { e.stopPropagation(); if (userId) setProfilePopup({ x: e.clientX, y: e.clientY, peerId: userId }); }}
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs uppercase text-white flex-shrink-0 bg-accent">
                    {playerName.substring(0, 2)}
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="text-sm font-medium text-white flex items-center gap-1 truncate">
                      <span className="truncate">{playerName}</span>
                      {activeRoom?.host_id === userId && <Crown size={12} className="text-[#faa61a] flex-shrink-0" />}
                    </div>
                    <span className="text-[10px] text-[#3ba55c] font-semibold truncate">You{localChampion ? ` (${localChampion})` : ''}</span>
                  </div>
                  {isStreaming && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setWatchedStream(watchedStream === playerName ? null : playerName); }}
                      className={`p-1 px-2 text-[9px] font-bold rounded flex items-center gap-1 transition-colors ${watchedStream === playerName ? 'bg-[#3ba55c] text-white shadow-[0_0_8px_rgba(59,165,92,0.8)]' : 'bg-[#ed4245] text-white hover:bg-red-600 animate-pulse'}`}
                      title={watchedStream === playerName ? "Stop watching preview" : "Preview stream"}
                    >
                      <Monitor size={10} /> {watchedStream === playerName ? 'PREVIEW' : 'LIVE'}
                    </button>
                  )}
                </div>

                {/* Remote peers */}
                {[...knownPeers].filter(p => p !== userId && p !== playerName).map(peer => {
                  const uiName = activeRoom?.players_data?.find(pd => pd.user_id?.toString() === peer || pd.name === peer)?.name || peer;
                  const crownIcon = activeRoom?.host_id?.toString() === peer ? <Crown size={12} className="text-[#faa61a]" /> : null;
                  return (
                    <div
                      key={peer}
                      className="flex items-center gap-3 bg-[#36393f] p-2 rounded shadow-sm cursor-pointer hover:bg-white/5 transition-colors select-none"
                      onClick={(e) => { e.stopPropagation(); setProfilePopup({ x: e.clientX, y: e.clientY, peerId: peer }); }}
                      onContextMenu={(e) => handleContextMenu(e, peer)}
                    >
                      <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs uppercase text-white flex-shrink-0 bg-bg-secondary overflow-hidden">
                        {peerChampions[peer] ? <img src={champImgUrl(peerChampions[peer])} className="w-full h-full object-cover" /> : uiName.substring(0, 2)}
                      </div>
                      <span className="text-sm font-medium text-white flex-1 truncate flex items-center gap-1">
                        {uiName} {crownIcon}
                      </span>
                      {streamingPlayers.has(peer) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setWatchedStream(watchedStream === peer ? null : peer); }}
                          className={`p-1 px-2 text-[9px] font-bold rounded flex items-center gap-1 transition-colors ${watchedStream === peer ? 'bg-[#3ba55c] text-white shadow-[0_0_8px_rgba(59,165,92,0.8)]' : 'bg-[#ed4245] text-white hover:bg-red-600 animate-pulse'}`}
                          title={watchedStream === peer ? "Stop watching" : "Watch stream"}
                        >
                          <Monitor size={10} /> {watchedStream === peer ? 'WATCHING' : 'LIVE'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="text-xs text-[#72767d] italic text-center mt-2">Waiting for game detection...</div>
          </>
        )}
      </div>
    </div>
  );
}
