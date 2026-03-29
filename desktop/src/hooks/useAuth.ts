import { useState } from "react";
import { getVersion } from "@tauri-apps/api/app";

/** Auth state, login/register/logout, display name, password change. */
export function useAuth(backendUrl: string) {
  const [authToken, setAuthToken] = useState<string | null>(() => localStorage.getItem("token"));
  const [userId, setUserId] = useState<string | null>(() => localStorage.getItem("userId") ?? null);
  const [playerName, setPlayerName] = useState(() =>
    localStorage.getItem("lpc_playerName") || "Player" + Math.floor(Math.random() * 1000)
  );
  const [isGuest, setIsGuest] = useState<boolean>(() => localStorage.getItem("isGuest") === "true");
  const [appVersion, setAppVersion] = useState("");

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Display name update
  const [displayNameStatus, setDisplayNameStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [displayNameError, setDisplayNameError] = useState('');

  // Password change
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pwdOld, setPwdOld] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdStatus, setPwdStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Fetch version on mount (called once by App)
  const initVersion = () => {
    getVersion().then(setAppVersion).catch(() => setAppVersion("Unknown"));
  };

  const apiBase = `http://${backendUrl.replace('http://', '').replace(/:\d+$/, '')}:8080`;

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");

    if (authMode === 'register' && authPassword !== authConfirmPassword) {
      setAuthError("Passwords do not match");
      return;
    }

    const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register';
    const payload = authMode === 'login'
      ? { email: authEmail, password: authPassword, version: appVersion }
      : { email: authEmail, displayName: authDisplayName, password: authPassword, version: appVersion };

    try {
      const res = await fetch(`${apiBase}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');

      localStorage.setItem("token", data.token);
      if (data.userId) localStorage.setItem("userId", data.userId.toString());
      localStorage.setItem("lpc_playerName", data.displayName);
      localStorage.setItem("isGuest", data.isGuest ? "true" : "false");
      setAuthToken(data.token);
      setUserId(data.userId);
      setPlayerName(data.displayName);
      setIsGuest(!!data.isGuest);
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleGuestLogin = async () => {
    setAuthError("");
    try {
      const res = await fetch(`${apiBase}/auth/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Guest login failed');

      localStorage.setItem("token", data.token);
      if (data.userId) localStorage.setItem("userId", data.userId.toString());
      localStorage.setItem("lpc_playerName", data.displayName);
      localStorage.setItem("isGuest", "true");
      setAuthToken(data.token);
      setUserId(data.userId);
      setPlayerName(data.displayName);
      setIsGuest(true);
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleLogout = (onLogout?: () => void) => {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    localStorage.removeItem("lpc_playerName");
    localStorage.removeItem("isGuest");
    setAuthToken(null);
    setUserId(null);
    setPlayerName("Player" + Math.floor(Math.random() * 1000));
    setIsGuest(false);
    onLogout?.();
  };

  const updateDisplayName = async () => {
    setDisplayNameStatus('saving');
    setDisplayNameError('');
    try {
      const res = await fetch(`${apiBase}/auth/update-display-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ displayName: playerName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update display name');
      setDisplayNameStatus('saved');
      localStorage.setItem('lpc_playerName', data.displayName);
      setPlayerName(data.displayName);
      setTimeout(() => setDisplayNameStatus('idle'), 3000);
    } catch (err: any) {
      setDisplayNameStatus('error');
      setDisplayNameError(err.message);
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    if (pwdNew !== pwdConfirm) { setPwdError("New passwords do not match."); return; }
    if (pwdNew.length < 5) { setPwdError("New password must be at least 5 characters."); return; }

    setPwdStatus('saving');
    try {
      const res = await fetch(`${apiBase}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ oldPassword: pwdOld, newPassword: pwdNew }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to change password');
      setPwdStatus('saved');
      setTimeout(() => {
        setPwdStatus('idle');
        setShowPasswordModal(false);
        setPwdOld(''); setPwdNew(''); setPwdConfirm('');
      }, 1500);
    } catch (err: any) {
      setPwdStatus('error');
      setPwdError(err.message);
    }
  };

  const openPasswordModal = () => {
    setShowPasswordModal(true);
    setPwdOld(''); setPwdNew(''); setPwdConfirm(''); setPwdError(''); setPwdStatus('idle');
  };

  return {
    // Core identity
    authToken, userId, playerName, setPlayerName, isGuest, appVersion, initVersion,
    // Auth form
    authMode, setAuthMode, authEmail, setAuthEmail, authDisplayName, setAuthDisplayName,
    authPassword, setAuthPassword, authConfirmPassword, setAuthConfirmPassword, authError, setAuthError,
    handleAuthSubmit, handleGuestLogin, handleLogout,
    // Display name
    displayNameStatus, setDisplayNameStatus, displayNameError, setDisplayNameError, updateDisplayName,
    // Password change
    showPasswordModal, setShowPasswordModal, openPasswordModal,
    pwdOld, setPwdOld, pwdNew, setPwdNew, pwdConfirm, setPwdConfirm,
    pwdError, pwdStatus, handleChangePasswordSubmit,
  };
}
