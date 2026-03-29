import { X, AlertCircle } from "lucide-react";

interface AddRoomModalProps {
  isGuest?: boolean;
  addModalTab: 'create' | 'join';
  setAddModalTab: (v: 'create' | 'join') => void;

  newRoomInput: string;
  setNewRoomInput: (v: string) => void;

  newRoomName: string;
  setNewRoomName: (v: string) => void;
  newRoomMode: 'global' | 'team' | 'proximity';
  setNewRoomMode: (m: 'global' | 'team' | 'proximity') => void;
  newRoomHidden: boolean;
  setNewRoomHidden: (v: boolean) => void;
  newRoomPasswordCreate: string;
  setNewRoomPasswordCreate: (v: string) => void;

  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function AddRoomModal({
  addModalTab, setAddModalTab,
  newRoomInput, setNewRoomInput,
  newRoomName, setNewRoomName,
  newRoomMode, setNewRoomMode,
  newRoomHidden, setNewRoomHidden,
  newRoomPasswordCreate, setNewRoomPasswordCreate,
  onClose, onSubmit,
  isGuest
}: AddRoomModalProps) {
  const modes = [
    { value: 'global' as const, label: 'Global Chat', desc: 'Everyone hears everyone, regardless of team or distance.' },
    { value: 'team' as const, label: 'Team-Based', desc: 'Global audio, but strictly limited to members of your team.' },
    { value: 'proximity' as const, label: 'Spatial Proximity', desc: 'Hear nearby players based on map distance. Dead players hear each other.' },
  ];

  return (
    <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[#36393f] w-full max-w-md rounded-lg shadow-2xl flex flex-col pt-6 pb-6 px-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-text-muted hover:text-white"><X size={20} /></button>
        <h2 className="text-2xl font-bold text-center text-white mb-2">Server Management</h2>
        
        {/* Tabs */}
        <div className="flex bg-[#202225] rounded-lg p-1 mb-6">
          <button
            type="button"
            className={`flex-1 py-1.5 text-sm font-bold rounded-md transition-all ${addModalTab === 'join' ? 'bg-[#4f545c] text-white shadow' : 'text-text-muted hover:text-white'}`}
            onClick={() => setAddModalTab('join')}
          >
            Join Server
          </button>
          <button
            type="button"
            disabled={isGuest}
            className={`flex-1 py-1.5 text-sm font-bold rounded-md transition-all ${addModalTab === 'create' ? 'bg-[#4f545c] text-white shadow' : (isGuest ? 'text-[#8e9297]/50 cursor-not-allowed' : 'text-text-muted hover:text-white')}`}
            onClick={() => { if (!isGuest) setAddModalTab('create'); }}
            title={isGuest ? "You need to make an account for that!" : ""}
          >
            Create Server
          </button>
        </div>

        {isGuest && addModalTab === 'create' && (
          <div className="bg-[#ed4245]/10 border border-[#ed4245]/50 rounded p-3 mb-4 flex gap-3 text-sm text-[#ed4245] items-center font-medium">
            <AlertCircle size={20} className="flex-shrink-0" />
            <span>Guest accounts cannot create new servers. Please register an account to host your own rooms.</span>
          </div>
        )}

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {addModalTab === 'join' || isGuest ? (
            <>
              <p className="text-center text-text-muted mb-4 text-sm">Have a secret room code? Enter it here to join.</p>
              <div>
                <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block">Room Code</label>
                <input autoFocus type="text" value={newRoomInput} onChange={(e) => setNewRoomInput(e.target.value.toUpperCase())}
                  placeholder="e.g. A6B9X2" maxLength={6}
                  className="w-full bg-[#202225] border-none text-text-normal px-3 py-2.5 rounded text-[15px] outline-none focus:ring-1 focus:ring-accent tracking-widest text-center font-mono"
                />
              </div>
              <button type="submit" disabled={!newRoomInput.trim()}
                className="mt-4 w-full bg-[#3ba55c] hover:bg-[#2d8046] disabled:bg-[#3ba55c]/50 disabled:cursor-not-allowed text-white text-[15px] font-bold py-2.5 rounded transition-colors shadow-lg"
              >
                Join Server
              </button>
            </>
          ) : (
            <>
              <div>
                <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block">Server Name</label>
                <input autoFocus type="text" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="e.g. The Rift"
                  className="w-full bg-[#202225] border-none text-text-normal px-3 py-2.5 rounded text-[15px] outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              <div className="flex flex-col gap-2 mt-2">
                <label className="text-xs font-bold text-[#8e9297] uppercase mb-1 block">Voice Mode</label>
                {modes.map(m => (
                  <label key={m.value} className={`flex items-start gap-3 p-3 rounded cursor-pointer border transition-colors ${newRoomMode === m.value ? 'border-accent bg-accent/10' : 'border-[#202225] bg-[#292b2f] hover:bg-[#32353b]'}`}>
                    <input type="radio" name="roomMode" checked={newRoomMode === m.value} onChange={() => setNewRoomMode(m.value)} className="mt-1 accent-accent" />
                    <div>
                      <div className="text-sm font-medium text-[#dcddde]">{m.label}</div>
                      <div className="text-xs text-text-muted mt-0.5">{m.desc}</div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="bg-[#292b2f] border border-[#202225] p-3 rounded mt-2">
                <label className="flex items-center gap-2 cursor-pointer mb-3">
                  <input type="checkbox" checked={newRoomHidden} onChange={(e) => setNewRoomHidden(e.target.checked)} className="w-4 h-4 accent-accent rounded bg-[#202225] border-none" />
                  <span className="text-sm font-medium text-[#dcddde]">Hidden Room (Code Access Only)</span>
                </label>
                <div className="border-t border-[#36393f] pt-3">
                  <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block">Server Password (Optional)</label>
                  <input type="password" value={newRoomPasswordCreate} onChange={(e) => setNewRoomPasswordCreate(e.target.value)}
                    placeholder="Leave blank for open access"
                    className="w-full bg-[#202225] border-none text-text-normal px-3 py-2 rounded text-sm outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              </div>

              <button type="submit" disabled={!newRoomName.trim()}
                className="mt-4 w-full bg-accent hover:bg-accent-hover disabled:bg-accent/50 disabled:cursor-not-allowed text-white text-[15px] font-bold py-2.5 rounded transition-colors shadow-lg"
              >
                Launch Server
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
