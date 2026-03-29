import { X, Lock } from "lucide-react";

interface PasswordJoinModalProps {
  roomCode: string;
  passwordInput: string;
  setPasswordInput: (v: string) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function PasswordJoinModal({
  roomCode, passwordInput, setPasswordInput, onClose, onSubmit
}: PasswordJoinModalProps) {
  return (
    <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[#36393f] w-full max-w-sm rounded-lg shadow-2xl flex flex-col pt-6 pb-6 px-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-text-muted hover:text-white"><X size={20} /></button>
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 rounded-full bg-[#ed4245]/20 flex items-center justify-center text-[#ed4245]">
            <Lock size={24} />
          </div>
        </div>
        <h2 className="text-xl font-bold text-center text-white mb-2">Protected Server</h2>
        <p className="text-center text-text-muted mb-6 text-sm flex flex-col">
          <span>Server <strong>{roomCode}</strong> requires a password.</span>
          <span>Please enter it below to join.</span>
        </p>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block">Password</label>
            <input 
              autoFocus 
              type="password" 
              value={passwordInput} 
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Enter server password"
              className="w-full bg-[#202225] border-none text-text-normal px-3 py-2.5 rounded text-[15px] outline-none focus:ring-1 focus:ring-accent"
              required
            />
          </div>
          <button type="submit" disabled={!passwordInput.trim()}
            className="mt-2 w-full bg-accent hover:bg-accent-hover disabled:bg-accent/50 disabled:cursor-not-allowed text-white text-[15px] font-bold py-2.5 rounded transition-colors shadow-lg"
          >
            Connect
          </button>
        </form>
      </div>
    </div>
  );
}
