import { X } from "lucide-react";

interface SettingsModalProps {
  onClose: () => void;
  settingsTab: 'profile' | 'audio' | 'debug';
  setSettingsTab: (tab: 'profile' | 'audio' | 'debug') => void;
  handleLogout: () => void;
  // Profile tab
  playerName: string;
  setPlayerName: (v: string) => void;
  userId: string | null;
  displayNameStatus: 'idle' | 'saving' | 'saved' | 'error';
  setDisplayNameStatus: (v: 'idle' | 'saving' | 'saved' | 'error') => void;
  displayNameError: string;
  setDisplayNameError: (v: string) => void;
  updateDisplayName: () => void;
  openPasswordModal: () => void;
  // Audio tab
  audioDevices: { inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] };
  selectedMic: string;
  setSelectedMic: (v: string) => void;
  selectedSpeaker: string;
  setSelectedSpeaker: (v: string) => void;
  micVolume: number;
  updateMicVolume: (v: number) => void;
  headphoneVolume: number;
  updateHeadphoneVolume: (v: number) => void;
  noiseGate: number;
  updateNoiseGate: (v: number) => void;
  noiseSuppression: boolean;
  toggleNoiseSuppression: () => void;
  micLevelDisplay: number;
  isMicTesting: boolean;
  toggleMicTest: () => void;
  restartMicTestIfActive: () => void;
  // Debug tab
  appVersion: string;
  isCheckingUpdate: boolean;
  updateStatus: string;
  checkForUpdates: () => void;
  isCV2DebugEnabled: boolean;
  toggleCV2Debug: () => void;
  triggerManualRescan: () => void;
}

export function SettingsModal(props: SettingsModalProps) {
  const {
    onClose, settingsTab, setSettingsTab, handleLogout,
    playerName, setPlayerName, userId, displayNameStatus, setDisplayNameStatus,
    displayNameError, setDisplayNameError, updateDisplayName, openPasswordModal,
    audioDevices, selectedMic, setSelectedMic, selectedSpeaker, setSelectedSpeaker,
    micVolume, updateMicVolume, headphoneVolume, updateHeadphoneVolume,
    noiseGate, updateNoiseGate, noiseSuppression, toggleNoiseSuppression,
    micLevelDisplay, isMicTesting, toggleMicTest, restartMicTestIfActive,
    appVersion, isCheckingUpdate, updateStatus, checkForUpdates,
    isCV2DebugEnabled, toggleCV2Debug, triggerManualRescan,
  } = props;

  return (
    <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[#36393f] w-full max-w-[500px] h-auto max-h-[90vh] overflow-y-auto rounded-lg shadow-2xl flex flex-col pt-6 pb-4 px-6 relative hide-scrollbar">
        <button onClick={onClose} className="absolute top-4 right-4 text-text-muted hover:text-white"><X size={20} /></button>
        <h2 className="text-2xl font-bold text-white mb-4">User Settings</h2>

        {/* Tab bar */}
        <div className="flex gap-6 mb-6 border-b border-[#202225]">
          <button onClick={() => setSettingsTab('profile')} className={`pb-2 font-semibold text-sm transition-colors ${settingsTab === 'profile' ? 'text-white border-b-2 border-accent' : 'text-[#8e9297] hover:text-[#dcddde]'}`}>Profile</button>
          <button onClick={() => setSettingsTab('audio')} className={`pb-2 font-semibold text-sm transition-colors ${settingsTab === 'audio' ? 'text-white border-b-2 border-accent' : 'text-[#8e9297] hover:text-[#dcddde]'}`}>Voice & Audio</button>
          <button onClick={() => setSettingsTab('debug')} className={`pb-2 font-semibold text-sm transition-colors ${settingsTab === 'debug' ? 'text-white border-b-2 border-accent' : 'text-[#8e9297] hover:text-[#dcddde]'}`}>System & Debug</button>
        </div>

        <div className="flex flex-col gap-6 flex-1">
          {settingsTab === 'profile' && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block">Display Name</label>
                <div className="flex gap-2">
                  <input type="text" value={playerName}
                    onChange={(e) => { setPlayerName(e.target.value); setDisplayNameStatus('idle'); setDisplayNameError(''); }}
                    className="flex-1 bg-[#202225] border-none text-text-normal px-3 py-2.5 rounded text-[15px] outline-none focus:ring-1 focus:ring-accent"
                  />
                  <button onClick={updateDisplayName} disabled={displayNameStatus === 'saving' || !playerName.trim()}
                    className={`px-4 py-2 font-medium rounded text-sm transition-colors ${displayNameStatus === 'saved' ? 'bg-[#3ba55c] text-white' : 'bg-accent hover:bg-accent-hover disabled:bg-accent/50 text-white'}`}
                  >
                    {displayNameStatus === 'saving' ? 'Saving...' : displayNameStatus === 'saved' ? 'Saved!' : 'Save'}
                  </button>
                </div>
                <p className="text-xs text-text-muted mt-1">This is how others will see you in LPC channels.</p>
                {displayNameError && <p className="text-xs text-red-400 mt-1">{displayNameError}</p>}
              </div>
              <div>
                <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block">Account ID</label>
                <div className="w-full bg-[#202225]/50 border-none text-[#dcddde] px-3 py-2.5 rounded text-[15px] select-all cursor-text font-mono text-sm">
                  {userId || 'Not Logged In'}
                </div>
                <p className="text-xs text-text-muted mt-1">Your unique LPC identifier. Used for system routing and admin verification.</p>
              </div>
              <div className="pt-4 border-t border-[#202225]">
                <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block">Password & Authentication</label>
                <button onClick={openPasswordModal} className="px-4 py-2 bg-[#4f545c] hover:bg-[#5d6269] text-white text-sm font-medium rounded transition-colors">
                  Change Password
                </button>
              </div>
            </div>
          )}

          {settingsTab === 'audio' && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block flex justify-between">
                  <span>Input Device (Microphone)</span>
                  <span className="text-accent">{Math.round(micVolume * 100)}%</span>
                </label>
                <input type="range" min="0" max="2" step="0.05" value={micVolume}
                  onChange={(e) => updateMicVolume(Number(e.target.value))}
                  className="w-full h-1.5 bg-[#202225] rounded-lg appearance-none cursor-pointer accent-accent mb-2"
                />
                <select value={selectedMic} onChange={e => setSelectedMic(e.target.value)}
                  className="w-full bg-[#202225] text-text-normal px-3 py-2.5 rounded text-[14px] outline-none focus:ring-1 focus:ring-accent appearance-none cursor-pointer"
                >
                  <option value="default">System Default</option>
                  {audioDevices.inputs.map(d => (
                    d.deviceId !== 'default' && d.deviceId !== 'communications' &&
                    <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone (${d.deviceId.slice(0, 5)}...)`}</option>
                  ))}
                </select>
              </div>

              {/* Noise Suppression Toggle */}
              <div className="flex items-center justify-between py-2 border-t border-[#202225]">
                <div>
                  <span className="text-sm font-medium text-[#dcddde]">Noise Suppression (RNNoise)</span>
                  <p className="text-xs text-text-muted mt-0.5">AI-powered filter that removes keyboard, fan, and background noise.</p>
                </div>
                <button onClick={toggleNoiseSuppression}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${noiseSuppression ? 'bg-accent' : 'bg-[#4f545c]'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${noiseSuppression ? 'translate-x-5' : ''}`} />
                </button>
              </div>

              {/* Noise Gate */}
              <div className="py-2 border-top border-[#202225]">
                <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block flex justify-between">
                  <span>Voice Activity Threshold</span>
                  <span className="text-accent">{Math.round(noiseGate * 100)}%</span>
                </label>
                <input type="range" min="0" max="1" step="0.01" value={noiseGate}
                  onChange={(e) => updateNoiseGate(Number(e.target.value))}
                  onMouseUp={restartMicTestIfActive}
                  className="w-full h-1.5 bg-[#202225] rounded-lg appearance-none cursor-pointer accent-accent"
                />
                <div className="mt-2 relative h-2 bg-[#202225] rounded-full overflow-hidden">
                  <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-75"
                    style={{ width: `${Math.min(micLevelDisplay * 100 * 10, 100)}%`, background: micLevelDisplay * 10 > noiseGate ? '#3ba55d' : '#4f545c' }}
                  />
                  <div className="absolute inset-y-0 w-0.5 bg-[#ed4245]" style={{ left: `${Math.min(noiseGate * 100, 100)}%` }} />
                </div>
                <p className="text-xs text-text-muted mt-2 mb-2">Filters out background noise when you stop talking. Red line = threshold, green bar = your mic level.</p>
              </div>

              <div className="flex gap-2">
                <button onClick={toggleMicTest}
                  className={`px-4 py-2 w-full text-sm font-medium rounded opacity-90 hover:opacity-100 transition-colors ${isMicTesting ? 'bg-[#ed4245] text-white' : 'bg-[#4f545c] text-white'}`}
                >
                  {isMicTesting ? "Stop Testing" : "Test Microphone Loopback"}
                </button>
              </div>

              <div className="pt-4 border-t border-[#202225]">
                <label className="text-xs font-bold text-[#8e9297] uppercase mb-2 block flex justify-between">
                  <span>Output Device (Headphones)</span>
                  <span className="text-accent">{Math.round(headphoneVolume * 100)}%</span>
                </label>
                <input type="range" min="0" max="2" step="0.05" value={headphoneVolume}
                  onChange={(e) => updateHeadphoneVolume(Number(e.target.value))}
                  className="w-full h-1.5 bg-[#202225] rounded-lg appearance-none cursor-pointer accent-accent mb-2"
                />
                <select value={selectedSpeaker} onChange={e => setSelectedSpeaker(e.target.value)}
                  className="w-full bg-[#202225] text-text-normal px-3 py-2.5 rounded text-[14px] outline-none focus:ring-1 focus:ring-accent appearance-none cursor-pointer"
                >
                  <option value="default">System Default</option>
                  {audioDevices.outputs.map(d => (
                    d.deviceId !== 'default' && d.deviceId !== 'communications' &&
                    <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker (${d.deviceId.slice(0, 5)}...)`}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {settingsTab === 'debug' && (
            <>
              <div>
                <h3 className="text-[#dcddde] font-semibold mb-4">App Updates</h3>
                <div>
                  <button onClick={checkForUpdates} disabled={isCheckingUpdate}
                    className="w-full py-2.5 rounded text-[14px] font-medium bg-[#4f545c] text-white hover:bg-[#5d6269] transition-colors disabled:opacity-50"
                  >
                    {isCheckingUpdate ? "Checking..." : "Check for Updates"}
                  </button>
                  {updateStatus && <p className="text-xs text-text-muted mt-2">{updateStatus}</p>}
                  <p className="text-xs text-[#8e9297] mt-3">Version {appVersion || "Loading..."}</p>
                </div>
              </div>
              <div className="pt-4 border-t border-[#202225]">
                <h3 className="text-[#dcddde] font-semibold mb-4">Diagnostics</h3>
                <div className="flex flex-col gap-2">
                  <button onClick={toggleCV2Debug}
                    className={`w-full py-2.5 rounded text-[14px] font-medium transition-colors ${isCV2DebugEnabled ? "bg-[#ed4245] text-white" : "bg-[#4f545c] text-white hover:bg-[#5d6269]"}`}
                  >
                    {isCV2DebugEnabled ? "Hide YOLO Debug Video" : "Show YOLO Debug Video"}
                  </button>
                  <button onClick={triggerManualRescan}
                    className="w-full py-2.5 rounded text-[14px] font-medium bg-[#4f545c] text-white hover:bg-[#5d6269] transition-colors"
                  >
                    Manual YOLO Rescan
                  </button>
                  <p className="text-xs text-text-muted mt-2">Force the sidecar to re-check the live game roster and mini-map anchor points immediately.</p>
                </div>
              </div>
            </>
          )}

          {/* Footer */}
          <div className="pt-6 mt-auto border-t border-[#202225] flex justify-between items-center">
            <button onClick={handleLogout} className="mt-4 px-6 py-2 bg-transparent text-[#ed4245] hover:bg-[#ed4245] hover:text-white rounded font-medium block transition-colors border border-[#ed4245]">
              Log Out
            </button>
            <button onClick={onClose} className="mt-4 w-auto px-6 py-2 bg-accent hover:bg-accent-hover text-white rounded font-medium block">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
