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
  handleGuestLogin: () => void;
  // Updater props
  hasUpdate: boolean;
  updateStatus: string;
  isCheckingUpdate: boolean;
  checkForUpdates: () => void;
}

export function AuthPage({
  appVersion, backendUrl, setBackendUrl,
  authMode, setAuthMode, authEmail, setAuthEmail,
  authDisplayName, setAuthDisplayName,
  authPassword, setAuthPassword, authConfirmPassword, setAuthConfirmPassword,
  authError, setAuthError, handleAuthSubmit, handleGuestLogin,
  hasUpdate, updateStatus, isCheckingUpdate, checkForUpdates,
}: AuthPageProps) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#36393f] relative overflow-hidden">
      {/* Update Notification Banner */}
      {hasUpdate && (
        <div className="absolute top-0 left-0 right-0 bg-accent p-2 flex items-center justify-center gap-4 z-[100] shadow-md animate-in slide-in-from-top duration-300">
          <span className="text-white text-sm font-bold flex items-center gap-2">
            <Plus size={16} className="rotate-45" /> {updateStatus}
          </span>
          <button 
            onClick={checkForUpdates}
            disabled={isCheckingUpdate}
            className="bg-white text-accent px-3 py-1 rounded-sm text-xs font-bold hover:bg-white/90 transition-colors disabled:opacity-50"
          >
            {isCheckingUpdate ? "UPDATING..." : "UPDATE NOW"}
          </button>
        </div>
      )}

      <div className="absolute top-8 right-8 text-[#4f545c] select-none opacity-20 transform rotate-12 -z-0">
        <svg width="400" height="400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" />
        </svg>
      </div>

      <div className="bg-[#2f3136] p-8 rounded-lg shadow-xl w-full max-w-md relative z-10 border border-[#202225]">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-accent rounded-[24px] flex items-center justify-center mb-4 shadow-lg">
            <Headphones size={32} className="text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-wide uppercase">LoL Proximity Chat</h2>
          <p className="text-sm text-[#b9bbbe] mt-1 font-medium">Log in or create a new proxy identity</p>
        </div>

        <form onSubmit={handleAuthSubmit} className="flex flex-col gap-5">
          {authError && <div className="p-3 bg-red-500/10 border border-red-500/50 rounded text-red-400 text-sm font-medium">{authError}</div>}
          
          {/* Version/Update info at the top of form if small updateStatus exists but not hasUpdate (e.g. latest version check) */}
          {!hasUpdate && updateStatus && updateStatus !== "You are on the latest version." && (
            <div className="text-xs text-accent text-center font-bold mb-1">{updateStatus}</div>
          )}

          <div>
            <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block tracking-wider">Server IP Address</label>
            <input
              type="text" name="backendUrl" value={backendUrl}
              onChange={(e) => setBackendUrl(e.target.value)}
              className="w-full bg-[#1e1f22] border-none text-white px-3 py-2.5 rounded text-[15px] outline-none focus:ring-1 focus:ring-accent transition-all"
              placeholder="http://localhost:8080" required
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block tracking-wider">Email (or Legacy Username)</label>
            <input
              autoFocus type="text" name="email" autoComplete="username"
              value={authEmail} onChange={(e) => setAuthEmail(e.target.value)}
              className="w-full bg-[#1e1f22] border-none text-white px-3 py-2.5 rounded text-[15px] outline-none focus:ring-1 focus:ring-accent transition-all"
              placeholder="Email or Username" required
            />
          </div>
          {authMode === 'register' && (
            <div>
              <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block tracking-wider">Display Name</label>
              <input
                type="text" name="displayName" value={authDisplayName}
                onChange={(e) => setAuthDisplayName(e.target.value)}
                className="w-full bg-[#1e1f22] border-none text-white px-3 py-2.5 rounded text-[15px] outline-none focus:ring-1 focus:ring-accent transition-all"
                placeholder="How others will see you" required minLength={3} maxLength={20}
              />
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-[#b9bbbe] uppercase mb-2 flex justify-between tracking-wider">
              <span>Password</span>
            </label>
            <input
              type="password" name="password"
              autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
              value={authPassword} onChange={(e) => setAuthPassword(e.target.value)}
              className="w-full bg-[#1e1f22] border-none text-white px-3 py-2.5 rounded text-[15px] outline-none focus:ring-1 focus:ring-accent transition-all"
              required minLength={5}
            />
          </div>
          {authMode === 'register' && (
            <div>
              <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block tracking-wider">Confirm Password</label>
              <input
                type="password" name="confirmPassword" autoComplete="new-password"
                value={authConfirmPassword} onChange={(e) => setAuthConfirmPassword(e.target.value)}
                className="w-full bg-[#1e1f22] border-none text-white px-3 py-2.5 rounded text-[15px] outline-none focus:ring-1 focus:ring-accent transition-all"
                required minLength={5}
              />
            </div>
          )}
          <button
            type="submit"
            disabled={!authEmail.trim() || !authPassword || (authMode === 'register' && (!authDisplayName.trim() || !authConfirmPassword))}
            className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white rounded font-bold mt-2 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg active:transform active:scale-[0.98]"
          >
            {authMode === 'login' ? <LogIn size={18} /> : <Plus size={18} />}
            {authMode === 'login' ? 'LOGIN' : 'REGISTER'}
          </button>

          {authMode === 'login' && (
            <button
              type="button"
              onClick={handleGuestLogin}
              className="w-full py-2.5 bg-[#4f545c] hover:bg-[#5d6269] text-white rounded font-bold transition-all flex flex-col items-center justify-center shadow-lg active:transform active:scale-[0.98]"
            >
              <span>PLAY AS GUEST</span>
              <span className="text-[10px] opacity-60 font-medium">No password required</span>
            </button>
          )}

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
