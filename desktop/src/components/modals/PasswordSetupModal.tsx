interface PasswordSetupModalProps {
  roomCode: string;
  password: string;
  setPassword: (v: string) => void;
  onCancel: () => void;
  onSubmit: (password: string) => void;
}

export function PasswordSetupModal({ roomCode, password, setPassword, onCancel, onSubmit }: PasswordSetupModalProps) {
  return (
    <div className="fixed inset-0 bg-black/70 z-[110] flex items-center justify-center p-4">
      <div className="bg-[#36393f] w-full max-w-sm rounded-lg shadow-2xl p-6 relative">
        <h2 className="text-xl font-bold text-white mb-2">Set Room Password</h2>
        <p className="text-sm text-[#dcddde] mb-4">Require a password for new users joining <strong>{roomCode}</strong>.</p>
        <input
          type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && password.trim()) onSubmit(password.trim()); }}
          className="w-full bg-[#202225] border-none text-text-normal px-3 py-2.5 rounded text-[15px] outline-none focus:ring-1 focus:ring-accent mb-4 text-white"
          placeholder="Secret Password"
        />
        <div className="flex gap-3 justify-end mt-2">
          <button onClick={onCancel} className="px-4 py-2 hover:underline text-[#dcddde]">Cancel</button>
          <button disabled={!password.trim()} onClick={() => onSubmit(password.trim())}
            className="px-6 py-2 bg-accent hover:bg-accent-hover text-white rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Set Password
          </button>
        </div>
      </div>
    </div>
  );
}
