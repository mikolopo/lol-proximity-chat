import { X } from "lucide-react";

interface AddRoomModalProps {
  newRoomInput: string;
  setNewRoomInput: (v: string) => void;
  newRoomMode: 'global' | 'team' | 'proximity';
  setNewRoomMode: (m: 'global' | 'team' | 'proximity') => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function AddRoomModal({ newRoomInput, setNewRoomInput, newRoomMode, setNewRoomMode, onClose, onSubmit }: AddRoomModalProps) {
  const modes = [
    { value: 'global' as const, label: 'Global Chat', desc: 'Everyone hears everyone, regardless of team or distance.' },
    { value: 'team' as const, label: 'Team-Based', desc: 'Global audio, but strictly limited to members of your team.' },
    { value: 'proximity' as const, label: 'Spatial Proximity', desc: 'Hear nearby players based on map distance. Dead players can hear each other.' },
  ];

  return (
    <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[#36393f] w-full max-w-md rounded-lg shadow-2xl flex flex-col pt-6 pb-4 px-4 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-text-muted hover:text-white"><X size={20} /></button>
        <h2 className="text-2xl font-bold text-center text-white mb-2">Create a Server</h2>
        <p className="text-center text-text-muted mb-6 text-sm">Enter a unique Room Code to build your server. Share this code with your friends to proximity voice chat!</p>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block">Server Code</label>
            <input autoFocus type="text" value={newRoomInput} onChange={(e) => setNewRoomInput(e.target.value)}
              placeholder="e.g. EUW-RANKED-77"
              className="w-full bg-[#202225] border-none text-text-normal px-3 py-2.5 rounded text-[15px] outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div className="flex flex-col gap-2 mt-2">
            <label className="text-xs font-bold text-[#8e9297] uppercase mb-1 block">Server Mode</label>
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
          <button type="submit" disabled={!newRoomInput.trim()}
            className="mt-4 w-full bg-accent hover:bg-accent-hover disabled:bg-accent/50 disabled:cursor-not-allowed text-white text-[15px] font-medium py-2.5 rounded transition-colors"
          >
            Create Server
          </button>
        </form>
      </div>
    </div>
  );
}
