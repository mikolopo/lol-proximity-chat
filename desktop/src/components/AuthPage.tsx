import { Headphones, LogIn, Plus } from "lucide-react";

interface AuthPageProps {
  appVersion: string;
  backendUrl: string;
  setBackendUrl: (v: string) => void;
  authMode: 'login' | 'register';
  setAuthMode: (m: 'login' | 'register') => void;
  authEmail: string;
  setAuthEmail: (v: string) => void;
  authDisplayName: string;
  setAuthDisplayName: (v: string) => void;
  authPassword: string;
  setAuthPassword: (v: string) => void;
  authConfirmPassword: string;
  setAuthConfirmPassword: (v: string) => void;
  authError: string;
  setAuthError: (v: string) => void;
  handleAuthSubmit: (e: React.FormEvent) => void;
}

export function AuthPage({
  appVersion, backendUrl, setBackendUrl,
  authMode, setAuthMode, authEmail, setAuthEmail,
  authDisplayName, setAuthDisplayName,
  authPassword, setAuthPassword, authConfirmPassword, setAuthConfirmPassword,
  authError, setAuthError, handleAuthSubmit,
}: AuthPageProps) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#36393f] relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 pt-12 text-[#4f545c] select-none opacity-20 transform rotate-12 -z-0">
        <svg width="600" height="600" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" />
        </svg>
      </div>
      <div className="bg-[#2f3136] p-8 rounded-lg shadow-xl w-full max-w-md relative z-10 border border-[#202225]">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-accent rounded-[24px] flex items-center justify-center mb-4 shadow-lg">
            <Headphones size={32} className="text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-wide">Welcome to LPC</h2>
          <p className="text-sm text-[#8e9297] mt-1 font-medium">Log in or create a new proxy identity</p>
        </div>

        <form onSubmit={handleAuthSubmit} className="flex flex-col gap-5">
          {authError && <div className="p-3 bg-red-500/10 border border-red-500/50 rounded text-red-400 text-sm">{authError}</div>}
          <div>
            <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block tracking-wider">Server IP Address</label>
            <input
              type="text" name="backendUrl" value={backendUrl}
              onChange={(e) => { setBackendUrl(e.target.value); localStorage.setItem('lpc_backendUrl', e.target.value); }}
              className="w-full bg-[#1e1f22] border-none text-white px-3 py-2.5 rounded text-[15px] outline-none focus:ring-1 focus:ring-accent"
              placeholder="http://localhost:8080" required
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block tracking-wider">Email (or Legacy Username)</label>
            <input
              autoFocus type="text" name="email" autoComplete="username"
              value={authEmail} onChange={(e) => setAuthEmail(e.target.value)}
              className="w-full bg-[#1e1f22] border-none text-white px-3 py-2.5 rounded text-[15px] outline-none focus:ring-1 focus:ring-accent"
              placeholder="you@example.com or Username" required
            />
          </div>
          {authMode === 'register' && (
            <div>
              <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block tracking-wider">Display Name</label>
              <input
                type="text" name="displayName" value={authDisplayName}
                onChange={(e) => setAuthDisplayName(e.target.value)}
                className="w-full bg-[#1e1f22] border-none text-white px-3 py-2.5 rounded text-[15px] outline-none focus:ring-1 focus:ring-accent"
                placeholder="How others will see you" required minLength={3} maxLength={20}
              />
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 flex justify-between tracking-wider">
              <span>Password</span>
            </label>
            <input
              type="password" name="password"
              autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
              value={authPassword} onChange={(e) => setAuthPassword(e.target.value)}
              className="w-full bg-[#1e1f22] border-none text-white px-3 py-2.5 rounded text-[15px] outline-none focus:ring-1 focus:ring-accent"
              required minLength={5}
            />
          </div>
          {authMode === 'register' && (
            <div>
              <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block tracking-wider">Confirm Password</label>
              <input
                type="password" name="confirmPassword" autoComplete="new-password"
                value={authConfirmPassword} onChange={(e) => setAuthConfirmPassword(e.target.value)}
                className="w-full bg-[#1e1f22] border-none text-white px-3 py-2.5 rounded text-[15px] outline-none focus:ring-1 focus:ring-accent"
                required minLength={5}
              />
            </div>
          )}
          <button
            type="submit"
            disabled={!authEmail.trim() || !authPassword || (authMode === 'register' && (!authDisplayName.trim() || !authConfirmPassword))}
            className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white rounded font-medium mt-2 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {authMode === 'login' ? <LogIn size={18} /> : <Plus size={18} />}
            {authMode === 'login' ? 'Login' : 'Register'}
          </button>

          <div
            className="text-sm text-[#8e9297] mt-2 group cursor-pointer text-center select-none"
            onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); setAuthError(''); }}
          >
            {authMode === 'login' ? 'Need an account? ' : 'Already have an account? '}
            <span className="text-accent group-hover:underline">
              {authMode === 'login' ? 'Register' : 'Login'}
            </span>
          </div>
        </form>

        <div className="mt-8 text-center text-xs text-[#4f545c]">
          LoL Proximity Chat version {appVersion || "dev"}
        </div>
      </div>
    </div>
  );
}
