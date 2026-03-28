import { X, Monitor, LogIn } from "lucide-react";
import type { RoomInfo, ChatMessage } from "../types";
import { champImgUrl } from "../utils/audio";
import { ChatPanel } from "./ChatPanel";
import { LogsTerminal } from "./LogsTerminal";

interface MainContentProps {
  previewRoom: RoomInfo | null;
  activeRoom: RoomInfo | null;
  isConnected: boolean;
  currentStream: { name: string; frame: string; width: number; height: number } | null;
  setCurrentStream: (s: null) => void;
  setWatchedStream: (s: string | null) => void;
  peerChampions: Record<string, string>;
  handleConnect: (room: RoomInfo) => void;
  // Chat
  chatMessages: ChatMessage[];
  chatInput: string;
  setChatInput: (v: string) => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  playerName: string;
  sendChatMessage: () => void;
  // Logs
  logs: string[];
  setLogs: React.Dispatch<React.SetStateAction<string[]>>;
  logEndRef: React.RefObject<HTMLDivElement | null>;
}

export function MainContent({
  previewRoom, activeRoom, isConnected, currentStream, setCurrentStream, setWatchedStream,
  peerChampions, handleConnect,
  chatMessages, chatInput, setChatInput, chatEndRef, playerName, sendChatMessage,
  logs, setLogs, logEndRef,
}: MainContentProps) {
  const channelName = previewRoom
    ? (previewRoom.mode === 'proximity' ? 'general-proximity' : previewRoom.mode === 'team' ? 'team-voice' : 'global-voice')
    : 'dashboard';

  return (
    <div className="flex-1 flex flex-col relative max-w-full">
      {/* Header bar */}
      <div className="h-12 border-b border-[#202225] flex items-center px-4 shadow-[0_1px_1px_rgba(0,0,0,0.1)]">
        <span className="text-[#8e9297] text-xl font-light mr-2 select-none">#</span>
        <h2 className="font-semibold text-white text-[15px]">{channelName}</h2>
        {currentStream && (
          <div className="ml-auto flex items-center gap-2 bg-[#4f545c] px-2 py-1 rounded text-[11px] text-white font-bold animate-pulse">
            <div className="w-2 h-2 bg-[#ed4245] rounded-full" />
            LIVE: {currentStream.name}
            <X size={14} className="cursor-pointer hover:text-[#ed4245]" onClick={() => setCurrentStream(null)} />
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col p-4 relative overflow-hidden bg-[#202225] gap-4">
        {/* Stream Player or CTA */}
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center relative w-full">
          {currentStream ? (
            <div className="w-full h-full bg-black rounded shadow-2xl border border-[#202225] flex items-center justify-center relative overflow-hidden group">
              <img src={`data:image/jpeg;base64,${currentStream.frame}`} className="max-w-full max-h-full object-contain" style={{ imageRendering: 'crisp-edges' }} />
              <div className="absolute bottom-4 left-4 bg-black/80 px-3 py-1.5 rounded border border-white/10 flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-bold text-white uppercase overflow-hidden">
                  {peerChampions[currentStream.name] ? <img src={champImgUrl(peerChampions[currentStream.name])} className="w-full h-full object-cover" /> : currentStream.name.substring(0, 2)}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white leading-tight">{currentStream.name}</span>
                  <span className="text-[10px] text-[#b9bbbe] leading-tight">LIVE MATCH STREAM</span>
                </div>
              </div>
              <button onClick={() => setWatchedStream(null)} className="absolute top-4 right-4 p-2 bg-black/60 hover:bg-black/80 text-white rounded transition-colors opacity-0 group-hover:opacity-100">
                <X size={16} />
              </button>
            </div>
          ) : previewRoom && activeRoom?.id !== previewRoom.id ? (
            <div className="flex flex-col items-center">
              <div className="w-24 h-24 rounded flex items-center justify-center mb-6 shadow-xl bg-[#2f3136] text-[#b9bbbe]">
                <Monitor size={48} />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Welcome to {previewRoom.id}</h1>
              <p className="text-[#b9bbbe] max-w-sm text-center mb-8">You must join the voice channel in the sidebar to talk with other players.</p>
              <button onClick={() => handleConnect(previewRoom)} className="bg-accent hover:bg-accent-hover px-8 py-3 rounded text-white font-bold flex items-center gap-2 transition-colors">
                <LogIn size={20} /> Join Voice Channel
              </button>
            </div>
          ) : previewRoom && activeRoom?.id === previewRoom.id ? (
            <div className="flex flex-col items-center">
              <div className="w-24 h-24 rounded flex items-center justify-center mb-6 shadow-xl bg-[#3ba55c] text-white">
                <Monitor size={48} />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Connected to {activeRoom.id}</h1>
              <p className="text-[#b9bbbe] max-w-md text-center mb-8">
                Your voice is connected securely. Start the YOLO detection worker in the sidebar so your teammates can hear you based on your live mini-map position!
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="w-24 h-24 rounded flex items-center justify-center mb-6 shadow-xl bg-accent text-white">
                <Monitor size={48} />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">LoL Voice Control Panel</h1>
              <p className="text-[#b9bbbe] max-w-md text-center mb-8">
                Create a new Server using the (+) button on the left, or click on a server icon to preview its voice channels line-up.
              </p>
            </div>
          )}
        </div>

        {/* Chat (only when connected) */}
        {activeRoom && previewRoom?.id === activeRoom.id && isConnected && (
          <ChatPanel
            chatMessages={chatMessages} chatInput={chatInput} setChatInput={setChatInput}
            chatEndRef={chatEndRef} playerName={playerName} activeRoomId={activeRoom.id}
            sendChatMessage={sendChatMessage}
          />
        )}

        {/* Logs */}
        <LogsTerminal logs={logs} setLogs={setLogs} logEndRef={logEndRef} />
      </div>
    </div>
  );
}
