import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

// ─── Hooks ───
import { useAuth } from "./hooks/useAuth";
import { useVoiceConnection } from "./hooks/useVoiceConnection";
import { useWebSocket } from "./hooks/useWebSocket";
import { useSidecar } from "./hooks/useSidecar";
import { useAudioSettings } from "./hooks/useAudioSettings";
import { useChat } from "./hooks/useChat";
import { useRoomManagement } from "./hooks/useRoomManagement";
import { useAppUpdater } from "./hooks/useAppUpdater";

// ─── Components ───
import { AuthPage } from "./components/AuthPage";
import { ServerSidebar } from "./components/ServerSidebar";
import { ChannelSidebar } from "./components/ChannelSidebar";
import { MainContent } from "./components/MainContent";
import { MatchDashboard } from "./components/MatchDashboard";
import { PeerContextMenu } from "./components/PeerContextMenu";
import { ProfilePopup } from "./components/ProfilePopup";
import { RoomContextMenu } from "./components/RoomContextMenu";

// ─── Modals ───
import { SettingsModal } from "./components/modals/SettingsModal";
import { AddRoomModal } from "./components/modals/AddRoomModal";
import { StreamPickerModal } from "./components/modals/StreamPickerModal";
import { PasswordSetupModal } from "./components/modals/PasswordSetupModal";
import { ChangePasswordModal } from "./components/modals/ChangePasswordModal";

function App() {
  // ─── Backend URL (persisted) ───
  const [backendUrl, _setBackendUrl] = useState(localStorage.getItem('lpc_backendUrl') || "http://localhost:8080");
  const setBackendUrl = (v: string) => { _setBackendUrl(v); localStorage.setItem('lpc_backendUrl', v); };

  // Stable ref that stays in sync with the WebSocket hook's socket
  const globalSocketRef = useRef<Socket | null>(null);

  // ─── Auth ───
  const auth = useAuth(backendUrl);

  // Initialize app version on mount
  useEffect(() => { auth.initVersion(); }, []);

  // ─── Voice & Room Management ───
  const voice = useVoiceConnection(backendUrl, auth.playerName, auth.userId, auth.authToken, auth.appVersion);

  const rooms = useRoomManagement(
    globalSocketRef,
    voice.voiceManagerRef,
    auth.userId,
  );

  // ─── WebSocket (room discovery) ───
  const ws = useWebSocket(
    backendUrl, auth.authToken, auth.appVersion,
    rooms.setRooms, rooms.setRoomMembers, voice.setPeerChampions,
  );

  // Keep stable globalSocketRef in sync with useWebSocket's internal socket
  useEffect(() => {
    globalSocketRef.current = ws.globalSocketRef.current;
  });

  // ─── Sidecar (Python IPC) ───
  const sidecar = useSidecar({
    voiceManagerRef: voice.voiceManagerRef,
    watchedStreamRef: voice.watchedStreamRef,
    playerName: auth.playerName,
    setLocalChampion: voice.setLocalChampion,
    setCurrentStream: voice.setCurrentStream,
    setIsStreaming: voice.setIsStreaming,
  });

  // ─── Audio Settings ───
  const audio = useAudioSettings(voice.voiceManagerRef, backendUrl);

  // ─── Chat ───
  const chat = useChat(voice.voiceManagerRef, rooms.activeRoom?.id);

  // ─── App Updater ───
  const updater = useAppUpdater();

  // ─── Sync Effects ───
  // Persist settings
  useEffect(() => { localStorage.setItem('lpc_backendUrl', backendUrl); }, [backendUrl]);
  useEffect(() => { localStorage.setItem('lpc_playerName', auth.playerName); }, [auth.playerName]);
  useEffect(() => { localStorage.setItem('lpc_peerVols', JSON.stringify(voice.peerVolumes)); }, [voice.peerVolumes]);

  // Sync playerName to VoiceManager
  const prevPlayerNameRef = useRef(auth.playerName);
  useEffect(() => {
    const oldName = prevPlayerNameRef.current;
    prevPlayerNameRef.current = auth.playerName;
    if (voice.voiceManagerRef.current) {
      voice.voiceManagerRef.current.setPlayerName(auth.playerName);
      if (oldName !== auth.playerName && voice.voiceManagerRef.current.socket?.connected) {
        voice.voiceManagerRef.current.socket.emit("rename", { new_name: auth.playerName });
        voice.setKnownPeers(prev => { const n = new Set(prev); n.delete(oldName); return n; });
      }
    }
  }, [auth.playerName]);

  // Sync localChampion to VoiceManager
  useEffect(() => {
    if (voice.voiceManagerRef.current && voice.localChampion) {
      voice.voiceManagerRef.current.setChampionName(voice.localChampion);
    }
  }, [voice.localChampion]);

  // Settings modal open/close side effects
  useEffect(() => {
    if (!rooms.showSettingsModal && !rooms.showStreamPickerModal) {
      audio.stopMicLevelPolling();
      return;
    }
    if (rooms.showSettingsModal) {
      audio.fetchDevices();
      audio.startMicLevelPolling();
    }
    sidecar.refreshCaptureSources();
    return () => audio.stopMicLevelPolling();
  }, [rooms.showSettingsModal, rooms.showStreamPickerModal]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (voice.voiceManagerRef.current) voice.voiceManagerRef.current.disconnect();
      Object.values(voice.speakerTimeouts.current).forEach(t => clearTimeout(t));
    };
  }, []);

  const closeSettings = () => {
    rooms.setShowSettingsModal(false);
    if (audio.isMicTesting) audio.toggleMicTest(voice.isConnected);
    audio.stopMicLevelPolling();
  };

  const toggleStreaming = async () => {
    if (!voice.voiceManagerRef.current || !sidecar.sidecarChildRef.current) return;
    if (voice.isStreaming) {
      await sidecar.stopStreaming(voice.voiceManagerRef.current);
    } else {
      rooms.setShowStreamPickerModal(true);
    }
  };

  // ─── Wrapped handlers that bridge hooks ───
  const wrappedConnect = (room: typeof rooms.activeRoom & {}) => {
    if (!room) return;
    voice.handleConnect(
      room, audio.selectedMic, audio.selectedSpeaker,
      audio.micVolume, audio.headphoneVolume, audio.noiseGate,
      sidecar.sidecarChildRef, sidecar.isDetecting, sidecar.setIsDetecting,
      rooms.setActiveRoom, rooms.setPreviewRoom, sidecar.setLogs,
      (msg) => chat.addMessage(room.id, msg),
    );
  };

  const wrappedDisconnect = () => {
    voice.handleDisconnect(
      sidecar.sidecarChildRef, sidecar.isDetecting, sidecar.setIsDetecting,
      rooms.setActiveRoom, sidecar.setLogs,
    );
  };

  const wrappedLogout = () => {
    auth.handleLogout(() => {
      if (ws.globalSocketRef.current) ws.globalSocketRef.current.disconnect();
      if (voice.voiceManagerRef.current) voice.voiceManagerRef.current.disconnect();
      rooms.setRooms([]);
      rooms.setActiveRoom(null);
      rooms.setPreviewRoom(null);
    });
  };

  // ─── Auth Gate ───
  if (!auth.authToken) {
    return (
      <AuthPage
        appVersion={auth.appVersion} backendUrl={backendUrl} setBackendUrl={setBackendUrl}
        authMode={auth.authMode} setAuthMode={auth.setAuthMode}
        authEmail={auth.authEmail} setAuthEmail={auth.setAuthEmail}
        authDisplayName={auth.authDisplayName} setAuthDisplayName={auth.setAuthDisplayName}
        authPassword={auth.authPassword} setAuthPassword={auth.setAuthPassword}
        authConfirmPassword={auth.authConfirmPassword} setAuthConfirmPassword={auth.setAuthConfirmPassword}
        authError={auth.authError} setAuthError={auth.setAuthError}
        handleAuthSubmit={auth.handleAuthSubmit}
      />
    );
  }

  // ─── Main Layout ───
  return (
    <div
      className="flex h-screen w-full bg-bg-tertiary text-text-normal overflow-hidden font-sans relative"
      onClick={() => { if (rooms.contextMenu) rooms.setContextMenu(null); if (rooms.profilePopup) rooms.setProfilePopup(null); }}
    >
      {/* Modals */}
      {rooms.showStreamPickerModal && (
        <StreamPickerModal
          captureSources={sidecar.captureSources}
          onClose={() => rooms.setShowStreamPickerModal(false)}
          onSelect={(id) => { rooms.setShowStreamPickerModal(false); sidecar.startStreamWithSource(id, voice.voiceManagerRef.current); }}
        />
      )}
      {rooms.showAddModal && (
        <AddRoomModal
          newRoomInput={rooms.newRoomInput} setNewRoomInput={rooms.setNewRoomInput}
          newRoomMode={rooms.newRoomMode} setNewRoomMode={rooms.setNewRoomMode}
          onClose={() => rooms.setShowAddModal(false)} onSubmit={rooms.submitAddRoom}
        />
      )}
      {rooms.showSettingsModal && (
        <SettingsModal
          onClose={closeSettings} settingsTab={rooms.settingsTab} setSettingsTab={rooms.setSettingsTab}
          handleLogout={wrappedLogout}
          playerName={auth.playerName} setPlayerName={auth.setPlayerName} userId={auth.userId}
          displayNameStatus={auth.displayNameStatus} setDisplayNameStatus={auth.setDisplayNameStatus}
          displayNameError={auth.displayNameError} setDisplayNameError={auth.setDisplayNameError}
          updateDisplayName={auth.updateDisplayName} openPasswordModal={auth.openPasswordModal}
          audioDevices={audio.audioDevices} selectedMic={audio.selectedMic} setSelectedMic={audio.setSelectedMic}
          selectedSpeaker={audio.selectedSpeaker} setSelectedSpeaker={audio.setSelectedSpeaker}
          micVolume={audio.micVolume} updateMicVolume={audio.updateMicVolume}
          headphoneVolume={audio.headphoneVolume} updateHeadphoneVolume={audio.updateHeadphoneVolume}
          noiseGate={audio.noiseGate} updateNoiseGate={audio.updateNoiseGate}
          noiseSuppression={audio.noiseSuppression} toggleNoiseSuppression={audio.toggleNoiseSuppression}
          micLevelDisplay={audio.micLevelDisplay} isMicTesting={audio.isMicTesting}
          toggleMicTest={() => audio.toggleMicTest(voice.isConnected)} restartMicTestIfActive={audio.restartMicTestIfActive}
          appVersion={auth.appVersion} isCheckingUpdate={updater.isCheckingUpdate}
          updateStatus={updater.updateStatus} checkForUpdates={updater.checkForUpdates}
          isCV2DebugEnabled={sidecar.isCV2DebugEnabled} toggleCV2Debug={sidecar.toggleCV2Debug}
          triggerManualRescan={sidecar.triggerManualRescan}
        />
      )}
      {auth.showPasswordModal && (
        <ChangePasswordModal
          onClose={() => auth.setShowPasswordModal(false)}
          pwdOld={auth.pwdOld} setPwdOld={auth.setPwdOld}
          pwdNew={auth.pwdNew} setPwdNew={auth.setPwdNew}
          pwdConfirm={auth.pwdConfirm} setPwdConfirm={auth.setPwdConfirm}
          pwdError={auth.pwdError} pwdStatus={auth.pwdStatus}
          onSubmit={auth.handleChangePasswordSubmit}
        />
      )}

      {/* Layout: Server Sidebar | Channel Sidebar | Main Content | Match Dashboard */}
      <ServerSidebar
        rooms={rooms.rooms} previewRoom={rooms.previewRoom} activeRoom={rooms.activeRoom}
        isConnected={voice.isConnected} hoveredRoom={rooms.hoveredRoom} roomMembers={rooms.roomMembers}
        setPreviewRoom={rooms.setPreviewRoom} setHoveredRoom={rooms.setHoveredRoom}
        setShowAddModal={rooms.setShowAddModal} handleRoomContextMenu={rooms.handleRoomContextMenu}
      />
      <ChannelSidebar
        previewRoom={rooms.previewRoom} activeRoom={rooms.activeRoom} isConnected={voice.isConnected}
        playerName={auth.playerName} userId={auth.userId} localChampion={voice.localChampion}
        isMicMuted={voice.isMicMuted} isDeafened={voice.isDeafened} isStreaming={voice.isStreaming}
        knownPeers={voice.knownPeers} activeSpeakers={voice.activeSpeakers} peerChampions={voice.peerChampions}
        handleConnect={wrappedConnect} handleDisconnect={wrappedDisconnect}
        toggleMic={voice.toggleMic} toggleDeafen={voice.toggleDeafen} toggleStreaming={toggleStreaming}
        setShowSettingsModal={rooms.setShowSettingsModal}
        setProfilePopup={rooms.setProfilePopup} handleContextMenu={rooms.handleContextMenu}
      />
      <div className="flex-1 bg-[#36393f] flex overflow-hidden">
        <MainContent
          previewRoom={rooms.previewRoom} activeRoom={rooms.activeRoom} isConnected={voice.isConnected}
          currentStream={voice.currentStream} setCurrentStream={() => voice.setCurrentStream(null)}
          setWatchedStream={voice.setWatchedStream} peerChampions={voice.peerChampions}
          handleConnect={wrappedConnect}
          chatMessages={chat.chatMessages} chatInput={chat.chatInput} setChatInput={chat.setChatInput}
          chatEndRef={chat.chatEndRef} playerName={auth.playerName} sendChatMessage={chat.sendChatMessage}
          logs={sidecar.logs} setLogs={sidecar.setLogs} logEndRef={sidecar.logEndRef}
        />
        {rooms.activeRoom && rooms.previewRoom?.id === rooms.activeRoom.id && voice.isConnected && (
          <MatchDashboard
            activeRoom={rooms.activeRoom} localChampion={voice.localChampion}
            serverMapData={voice.serverMapData} knownPeers={voice.knownPeers}
            peerChampions={voice.peerChampions} playerName={auth.playerName} userId={auth.userId}
            isStreaming={voice.isStreaming} streamingPlayers={voice.streamingPlayers}
            watchedStream={voice.watchedStream} setWatchedStream={voice.setWatchedStream}
            setProfilePopup={rooms.setProfilePopup} handleContextMenu={rooms.handleContextMenu}
          />
        )}
      </div>

      {/* Floating overlays */}
      {rooms.contextMenu && (
        <PeerContextMenu
          x={rooms.contextMenu.x} y={rooms.contextMenu.y} peerId={rooms.contextMenu.peerId}
          peerVolumes={voice.peerVolumes} updatePeerVolume={voice.updatePeerVolume}
          isHost={rooms.activeRoom?.host_id === auth.userId}
          handleKickPlayer={rooms.handleKickPlayer} setProfilePopup={rooms.setProfilePopup}
          onClose={() => rooms.setContextMenu(null)}
        />
      )}
      {rooms.profilePopup && (
        <ProfilePopup
          x={rooms.profilePopup.x} y={rooms.profilePopup.y} peerId={rooms.profilePopup.peerId}
          activeRoom={rooms.activeRoom} userId={auth.userId} playerName={auth.playerName}
          localChampion={voice.localChampion} peerChampions={voice.peerChampions}
          onClose={() => rooms.setProfilePopup(null)}
        />
      )}
      {rooms.roomContextMenu && (
        <RoomContextMenu
          menu={rooms.roomContextMenu} activeRoomId={rooms.activeRoom?.id}
          onToggleLock={rooms.handleToggleLock} onRemovePassword={rooms.handleRemovePassword}
          onSetPassword={(code) => rooms.setShowPasswordSetup({ roomCode: code })}
          onDeleteRoom={rooms.handleDeleteRoom} onClose={() => rooms.setRoomContextMenu(null)}
        />
      )}
      {rooms.showPasswordSetup && (
        <PasswordSetupModal
          roomCode={rooms.showPasswordSetup.roomCode}
          password={rooms.newRoomPassword} setPassword={rooms.setNewRoomPassword}
          onCancel={() => { rooms.setShowPasswordSetup(null); rooms.setNewRoomPassword(""); rooms.setRoomContextMenu(null); }}
          onSubmit={rooms.setRoomPassword}
        />
      )}
    </div>
  );
}

export default App;
