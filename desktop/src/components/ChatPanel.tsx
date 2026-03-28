import { Send } from "lucide-react";
import type { ChatMessage } from "../types";

interface ChatPanelProps {
  chatMessages: ChatMessage[];
  chatInput: string;
  setChatInput: (v: string) => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  playerName: string;
  activeRoomId: string;
  sendChatMessage: () => void;
}

export function ChatPanel({ chatMessages, chatInput, setChatInput, chatEndRef, playerName, activeRoomId, sendChatMessage }: ChatPanelProps) {
  return (
    <div className="w-full h-64 shrink-0 bg-[#2f3136] rounded shadow-md flex flex-col border border-[#202225]">
      <div className="flex-1 overflow-y-auto p-3 min-h-0">
        {chatMessages.length === 0 && (
          <div className="text-[#8e9297] text-sm italic text-center py-4">No messages yet — say something!</div>
        )}
        {chatMessages.map((msg, i) => {
          const isMe = msg.sender === playerName;
          const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const showHeader = i === 0 || chatMessages[i - 1].sender !== msg.sender;
          return (
            <div key={i} className={`${showHeader ? 'mt-3 first:mt-0' : 'mt-0.5'}`}>
              {showHeader && (
                <div className="flex items-center gap-2 mb-0.5">
                  <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold uppercase text-white flex-shrink-0 ${isMe ? 'bg-accent' : 'bg-[#5865f2]'}`}>
                    {msg.sender.substring(0, 2)}
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
          type="text" value={chatInput} onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') sendChatMessage(); }}
          placeholder={`Message #${activeRoomId.toLowerCase()}`}
          className="flex-1 bg-[#40444b] text-[#dcddde] text-sm px-3 py-2 rounded outline-none placeholder-[#72767d]"
        />
        <button onClick={sendChatMessage} disabled={!chatInput.trim()} className="px-3 py-2 bg-accent hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed text-white rounded transition-colors">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
