import { X, Crown } from "lucide-react";
import { champImgUrl } from "../utils/audio";
import type { RoomInfo } from "../types";

interface ProfilePopupProps {
  x: number;
  y: number;
  peerId: string;
  activeRoom: RoomInfo | null;
  userId: string | null;
  playerName: string;
  localChampion: string;
  peerChampions: Record<string, string>;
  onClose: () => void;
}

export function ProfilePopup({ x, y, peerId, activeRoom, userId, playerName, localChampion, peerChampions, onClose }: ProfilePopupProps) {
  const isSelf = peerId === userId;
  const profData = activeRoom?.players_data?.find(pd => pd.user_id?.toString() === peerId || pd.name === peerId);
  const profAccName = profData?.name || (isSelf ? playerName : peerId);
  const profChamp = isSelf ? (localChampion || '') : (peerChampions[peerId] || profData?.champ || '');
  const isHost = activeRoom?.host_id?.toString() === peerId;

  return (
    <div
      className="fixed bg-[#232428] border border-[#1e1f22] rounded-lg shadow-2xl z-[100] w-64 animate-in fade-in zoom-in duration-100 overflow-hidden"
      style={{ left: Math.min(x, window.innerWidth - 280), top: Math.min(y, window.innerHeight - 300) }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Banner */}
      <div className="h-16 bg-gradient-to-r from-accent/60 to-[#5865f2]/60 relative">
        <div className="absolute -bottom-6 left-4">
          <div className="w-14 h-14 rounded-full border-4 border-[#232428] bg-[#1e1f22] flex items-center justify-center font-bold text-lg uppercase text-white overflow-hidden">
            {profChamp ? <img src={champImgUrl(profChamp)} className="w-full h-full object-cover" /> : profAccName.substring(0, 2)}
          </div>
        </div>
      </div>

      <div className="pt-8 px-4 pb-4">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-white font-bold text-[15px] truncate">{profAccName}</span>
          {isHost && <Crown size={14} className="text-[#faa61a] flex-shrink-0" />}
        </div>

        {profChamp && (
          <div className="text-xs text-[#b9bbbe] mb-3">Playing <span className="text-accent font-medium">{profChamp}</span></div>
        )}

        <div className="bg-[#1e1f22] rounded p-2.5 mb-3">
          <div className="text-[10px] font-bold text-[#8e9297] uppercase mb-1">Account Name</div>
          <div className="text-xs text-[#dcddde] font-medium select-all">{profAccName}</div>
        </div>

        <div className="flex gap-2">
          <button className="flex-1 py-1.5 text-xs bg-accent/20 text-accent rounded hover:bg-accent/30 transition-colors font-medium cursor-not-allowed opacity-60" title="Coming soon" disabled>
            Message
          </button>
          <button className="flex-1 py-1.5 text-xs bg-[#4f545c]/40 text-[#dcddde] rounded hover:bg-[#4f545c]/60 transition-colors font-medium cursor-not-allowed opacity-60" title="Coming soon" disabled>
            View Profile
          </button>
        </div>
      </div>

      <button onClick={onClose} className="absolute top-2 right-2 text-white/50 hover:text-white transition-colors">
        <X size={14} />
      </button>
    </div>
  );
}
