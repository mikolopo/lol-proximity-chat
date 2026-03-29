import { Headphones, Mic, MicOff, Monitor, Settings, Crown, Signal, PhoneOff } from "lucide-react";
import type { RoomInfo } from "../types";
import { champImgUrl } from "../utils/audio";

interface ChannelSidebarProps {
  previewRoom: RoomInfo | null;
  activeRoom: RoomInfo | null;
  isConnected: boolean;
  playerName: string;
  userId: string | null;
  localChampion: string;
  isMicMuted: boolean;
  isDeafened: boolean;
  isStreaming: boolean;
  knownPeers: Set<string>;
  activeSpeakers: Set<string>;
  peerChampions: Record<string, string>;
  handleConnect: (room: RoomInfo) => void;
  handleDisconnect: () => void;
  toggleMic: () => void;
  toggleDeafen: () => void;
  toggleStreaming: () => void;
  setShowSettingsModal: (v: boolean) => void;
  setProfilePopup: (v: { x: number; y: number; peerId: string } | null) => void;
  handleContextMenu: (e: React.MouseEvent, peerId: string) => void;
}

export function ChannelSidebar({
  previewRoom, activeRoom, isConnected, playerName, userId, localChampion,
  isMicMuted, isDeafened, isStreaming, knownPeers, activeSpeakers, peerChampions,
  handleConnect, handleDisconnect, toggleMic, toggleDeafen, toggleStreaming,
  setShowSettingsModal, setProfilePopup, handleContextMenu,
}: ChannelSidebarProps) {
  return (
    <div className="w-60 bg-[#2f3136] flex flex-col flex-shrink-0">
      <div className="min-h-[48px] h-[48px] border-b border-[#202225] flex flex-col justify-center px-4 shadow-[0_1px_2px_rgba(0,0,0,0.2)]">
        <h2 className="font-bold text-white truncate text-[15px] leading-tight">
          {previewRoom?.name || previewRoom?.id || "Home"}
        </h2>
        {previewRoom && previewRoom.id !== previewRoom.name && (
          <div
            className="text-[10px] text-[#8e9297] font-mono cursor-pointer hover:text-white truncate leading-tight mt-[1px]"
            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(previewRoom.id); }}
            title="Click to copy Room Code"
          >
            #{previewRoom.id} (Click to copy)
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col p-2 overflow-y-auto hide-scrollbar">
        {!previewRoom ? (
          <div className="p-2 mb-4 text-sm text-[#8e9297] text-center italic mt-4">
            Select or create a server from the leftmost sidebar.
          </div>
        ) : (
          <div className="p-2 mb-4">
            <h3 className="text-xs font-semibold text-[#8e9297] uppercase tracking-wider mb-2">Voice Channels</h3>
            <div
              onClick={() => activeRoom?.id !== previewRoom.id ? handleConnect(previewRoom) : null}
              className={`rounded p-2 flex flex-col cursor-pointer transition-colors border-2 ${activeRoom?.id === previewRoom.id ? 'bg-[#393c43] border-transparent' : 'border-transparent hover:bg-[#34373c]'}`}
            >
              <div className="flex items-center justify-between">
                <span className={`font-semibold text-[15px] flex gap-2 items-center ${activeRoom?.id === previewRoom.id ? 'text-white' : 'text-[#8e9297] hover:text-[#dcddde]'}`}>
                  <Headphones size={18} /> Global Proximity
                </span>
              </div>

              {activeRoom?.id === previewRoom.id && isConnected && (
                <div className="flex flex-col gap-1 mt-2">
                  {/* Local Player */}
                  <div
                    className="ml-6 text-sm text-[#dcddde] flex items-center gap-2 py-1 cursor-pointer hover:bg-white/5 rounded px-1 -ml-1 transition-colors select-none"
                    onClick={(e) => { e.stopPropagation(); if (userId) setProfilePopup({ x: e.clientX, y: e.clientY, peerId: userId }); }}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs uppercase text-white shadow transition-colors overflow-hidden ${activeSpeakers.has(playerName) && (!isMicMuted && !isDeafened) ? 'bg-[#3ba55c] ring-2 ring-[#3ba55c] ring-offset-2 ring-offset-[#2f3136]' : 'bg-accent'}`}>
                      {localChampion ? <img src={champImgUrl(localChampion)} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.textContent = playerName.substring(0, 2); }} /> : playerName.substring(0, 2)}
                    </div>
                    <span className={`font-medium min-w-0 truncate ${activeSpeakers.has(playerName) && (!isMicMuted && !isDeafened) ? 'text-[#3ba55c]' : ''}`}>{playerName}</span>
                    {activeRoom?.host_id === userId && <Crown size={14} className="text-yellow-500/80 ml-auto flex-shrink-0" />}
                    {(isMicMuted || isDeafened) && <MicOff size={14} className="text-[#ed4245] ml-2 mr-1" />}
                  </div>

                  {/* Remote Peers */}
                  {Array.from(knownPeers).map(peer => {
                    if (peer === playerName || peer === userId) return null;
                    const isSpeaking = activeSpeakers.has(peer);
                    const peerChamp = peerChampions[peer];
                    const peerData = activeRoom?.players_data?.find((pd: any) => pd.name === peer);
                    return (
                      <div
                        key={peer}
                        className="ml-6 text-sm text-[#dcddde] flex items-center gap-2 py-1 cursor-pointer hover:bg-white/5 rounded px-1 -ml-1 transition-colors select-none"
                        onClick={(e) => { e.stopPropagation(); setProfilePopup({ x: e.clientX, y: e.clientY, peerId: peer }); }}
                        onContextMenu={(e) => handleContextMenu(e, peer)}
                      >
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs uppercase text-white shadow transition-colors overflow-hidden ${isSpeaking ? 'bg-[#3ba55c] ring-2 ring-[#3ba55c] ring-offset-2 ring-offset-[#2f3136]' : 'bg-[#1e1f22]'}`}>
                          {peerChamp ? <img src={champImgUrl(peerChamp)} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.textContent = peer.substring(0, 2); }} /> : peer.substring(0, 2)}
                        </div>
                        <span className={`font-medium min-w-0 truncate ${isSpeaking ? 'text-[#3ba55c]' : ''}`}>{peer}</span>
                        {activeRoom?.host_id === peerData?.user_id && <Crown size={14} className="text-yellow-500/80 ml-auto flex-shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Voice Connection & User controls */}
      <div className="mt-auto flex flex-col bg-[#292b2f]">
        {isConnected && activeRoom && (
           <div className="border-b border-[#202225] py-2 px-2 flex items-center shadow-[0_-1px_2px_rgba(0,0,0,0.1)]">
             <div className="flex flex-col flex-1 min-w-0 pr-2 cursor-pointer group">
               <div className="flex items-center gap-1.5 text-[#3ba55c] font-bold text-[11px] uppercase group-hover:underline">
                 <Signal size={12} strokeWidth={3} />
                 <span>Voice Connected</span>
               </div>
               <div className="text-[#8e9297] text-xs truncate group-hover:underline">
                 {activeRoom.name || activeRoom.id}
               </div>
             </div>
             <button 
               onClick={handleDisconnect} 
               className="w-8 h-8 rounded shrink-0 flex items-center justify-center text-[#b9bbbe] hover:bg-[#34373c] hover:text-[#dcddde] transition-colors"
               title="Disconnect"
             >
               <PhoneOff size={18} />
             </button>
           </div>
        )}
        
        <div className="h-[52px] flex items-center px-2 py-1.5 gap-2">
          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center flex-shrink-0 text-white font-bold text-xs shadow-sm uppercase overflow-hidden">
            {localChampion ? <img src={champImgUrl(localChampion)} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.textContent = playerName.substring(0, 2); }} /> : playerName.substring(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white truncate leading-tight">{playerName}</div>
            <div className="text-xs text-[#8e9297] truncate leading-tight">
              {isDeafened ? 'Deafened' : (isMicMuted ? 'Muted' : (isConnected ? 'Voice Connected' : 'Online'))}
            </div>
          </div>
          <div className="flex gap-1">
            <button onClick={toggleMic} className={`p-1.5 rounded transition-colors group relative ${isMicMuted || isDeafened ? 'text-[#ed4245]' : 'text-[#b9bbbe] hover:bg-[#34373c] hover:text-[#dcddde]'}`}>
              <Mic size={18} />
              {(isMicMuted || isDeafened) && <div className="absolute w-[22px] h-0.5 bg-[#ed4245] rotate-45 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded" />}
            </button>
            <button onClick={toggleDeafen} className={`p-1.5 rounded transition-colors group relative ${isDeafened ? 'text-[#ed4245]' : 'text-[#b9bbbe] hover:bg-[#34373c] hover:text-[#dcddde]'}`}>
              <Headphones size={18} />
              {isDeafened && <div className="absolute w-[22px] h-0.5 bg-[#ed4245] rotate-45 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded" />}
            </button>
            <button onClick={toggleStreaming} className={`p-1.5 rounded transition-colors group relative ${isStreaming ? 'text-accent' : 'text-[#b9bbbe] hover:bg-[#34373c] hover:text-[#dcddde]'}`} title={isStreaming ? "Stop Streaming" : "Stream Screen"}>
              <Monitor size={18} />
              {isStreaming && <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#ed4245] rounded-full border-2 border-[#2f3136]" />}
            </button>
            <button onClick={() => setShowSettingsModal(true)} className="p-1.5 text-[#b9bbbe] hover:text-[#dcddde] hover:bg-[#34373c] rounded transition-colors">
              <Settings size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
