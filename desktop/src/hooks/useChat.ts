import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "../types";
import type { VoiceManager } from "../voice/VoiceManager";

/** Per-room chat messages, send message. */
export function useChat(voiceManagerRef: React.MutableRefObject<VoiceManager | null>, activeRoomId?: string) {
  const [allChatMessages, setAllChatMessages] = useState<Record<string, ChatMessage[]>>({});
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const chatMessages = activeRoomId ? (allChatMessages[activeRoomId] || []) : [];

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const addMessage = (roomId: string, msg: ChatMessage) => {
    setAllChatMessages(prev => ({
      ...prev,
      [roomId]: [...(prev[roomId] || []).slice(-200), msg],
    }));
  };

  const sendChatMessage = () => {
    const msg = chatInput.trim();
    if (!msg || !voiceManagerRef.current?.socket?.connected) return;
    voiceManagerRef.current.socket.emit("chat_message", { message: msg });
    setChatInput("");
  };

  return {
    chatMessages, chatInput, setChatInput, chatEndRef,
    addMessage, sendChatMessage,
  };
}
