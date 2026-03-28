import { X } from "lucide-react";

interface ChangePasswordModalProps {
  onClose: () => void;
  pwdOld: string; setPwdOld: (v: string) => void;
  pwdNew: string; setPwdNew: (v: string) => void;
  pwdConfirm: string; setPwdConfirm: (v: string) => void;
  pwdError: string;
  pwdStatus: 'idle' | 'saving' | 'saved' | 'error';
  onSubmit: (e: React.FormEvent) => void;
}

export function ChangePasswordModal({ onClose, pwdOld, setPwdOld, pwdNew, setPwdNew, pwdConfirm, setPwdConfirm, pwdError, pwdStatus, onSubmit }: ChangePasswordModalProps) {
  return (
    <div className="absolute inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
      <div className="bg-[#36393f] w-full max-w-[400px] rounded-lg shadow-2xl p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-text-muted hover:text-white"><X size={20} /></button>
        <h2 className="text-xl font-bold text-white mb-2">Change Password</h2>
        <p className="text-sm text-[#b9bbbe] mb-6">Enter your current password and a new password.</p>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {pwdError && <div className="p-2 bg-red-500/10 border border-red-500/50 rounded text-red-400 text-xs">{pwdError}</div>}
          {pwdStatus === 'saved' && <div className="p-2 bg-green-500/10 border border-green-500/50 rounded text-green-400 text-xs">Password changed successfully!</div>}

          <div>
            <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block">Current Password</label>
            <input type="password" value={pwdOld} onChange={(e) => setPwdOld(e.target.value)}
              className="w-full bg-[#202225] border-none text-text-normal px-3 py-2.5 rounded text-[15px] outline-none focus:ring-1 focus:ring-accent" required
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block">New Password</label>
            <input type="password" value={pwdNew} onChange={(e) => setPwdNew(e.target.value)}
              className="w-full bg-[#202225] border-none text-text-normal px-3 py-2.5 rounded text-[15px] outline-none focus:ring-1 focus:ring-accent" required minLength={5}
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block">Confirm New Password</label>
            <input type="password" value={pwdConfirm} onChange={(e) => setPwdConfirm(e.target.value)}
              className="w-full bg-[#202225] border-none text-text-normal px-3 py-2.5 rounded text-[15px] outline-none focus:ring-1 focus:ring-accent" required minLength={5}
            />
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-white hover:underline">Cancel</button>
            <button type="submit" disabled={pwdStatus === 'saving'}
              className="px-6 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded transition-colors disabled:opacity-50"
            >
              {pwdStatus === 'saving' ? 'Saving...' : 'Save Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
