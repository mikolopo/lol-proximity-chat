interface PeerContextMenuProps {
  x: number;
  y: number;
  peerId: string;
  peerVolumes: Record<string, number>;
  updatePeerVolume: (peerId: string, vol: number) => void;
  isHost: boolean;
  handleKickPlayer: (targetId: string) => void;
  setProfilePopup: (v: { x: number; y: number; peerId: string } | null) => void;
  onClose: () => void;
}

export function PeerContextMenu({ x, y, peerId, peerVolumes, updatePeerVolume, isHost, handleKickPlayer, setProfilePopup, onClose }: PeerContextMenuProps) {
  return (
    <div
      className="fixed bg-[#18191c] border border-[#202225] rounded shadow-2xl p-3 z-[100] w-48 animate-in fade-in zoom-in duration-100"
      style={{ left: Math.min(x, window.innerWidth - 200), top: Math.min(y, window.innerHeight - 150) }}
      onMouseLeave={onClose}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-[11px] font-bold text-[#b9bbbe] uppercase mb-3 flex justify-between items-center">
        <span>Volume Control</span>
        <span className="text-accent">{Math.round((peerVolumes[peerId] ?? 1.0) * 100)}%</span>
      </div>
      <input type="range" min="0" max="2" step="0.05"
        value={peerVolumes[peerId] ?? 1.0}
        onChange={(e) => updatePeerVolume(peerId, Number(e.target.value))}
        className="w-full h-1.5 bg-[#202225] rounded-lg appearance-none cursor-pointer accent-accent mb-2"
      />
      <button onClick={() => updatePeerVolume(peerId, 1.0)}
        className="w-full py-1 text-[10px] bg-[#4f545c] text-white rounded hover:bg-[#5d6269] transition-colors mb-2"
      >
        Reset to 100%
      </button>
      <div className="h-[1px] bg-[#2b2d31] my-2" />
      <button onClick={() => { setProfilePopup({ x, y, peerId }); onClose(); }}
        className="w-full py-1.5 text-xs bg-transparent hover:bg-accent/20 text-accent rounded transition-colors"
      >
        View Profile
      </button>
      {isHost && (
        <>
          <div className="h-[1px] bg-[#2b2d31] my-2" />
          <button onClick={() => handleKickPlayer(peerId)}
            className="w-full py-1.5 text-xs bg-transparent hover:bg-[#ed4245] text-[#ed4245] hover:text-white rounded transition-colors"
            title="Only visible to room host"
          >
            Kick from Channel
          </button>
        </>
      )}
    </div>
  );
}
