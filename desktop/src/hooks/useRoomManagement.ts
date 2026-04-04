import { useState, useCallback, useEffect } from "react";
import type { Socket } from "socket.io-client";
import type { RoomInfo, RoomContextMenuState, ContextMenuState, ProfilePopupState } from "../types";
import type { VoiceManager } from "../voice/VoiceManager";

/** Room CRUD, lock/password, kick, modal/context-menu visibility. */
export function useRoomManagement(
  globalSocketRef: React.MutableRefObject<Socket | null>,
  voiceManagerRef: React.MutableRefObject<VoiceManager | null>,
  userId: string | null,
) {
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [activeRoom, setActiveRoom] = useState<RoomInfo | null>(null);
  const [previewRoom, setPreviewRoom] = useState<RoomInfo | null>(null);
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);
  const [roomMembers, setRoomMembers] = useState<Record<string, string[]>>({});

  // UI modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'profile' | 'audio' | 'debug'>('profile');
  const [addModalTab, setAddModalTab] = useState<'create' | 'join'>('join');
  const [newRoomInput, setNewRoomInput] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomMode, setNewRoomMode] = useState<'global' | 'team' | 'proximity'>('proximity');
  const [newRoomHidden, setNewRoomHidden] = useState(false);
  const [newRoomPasswordCreate, setNewRoomPasswordCreate] = useState("");
  const [showStreamPickerModal, setShowStreamPickerModal] = useState(false);

  // Context menus / popups
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [profilePopup, setProfilePopup] = useState<ProfilePopupState | null>(null);
  const [roomContextMenu, setRoomContextMenu] = useState<RoomContextMenuState | null>(null);
  const [showPasswordSetup, setShowPasswordSetup] = useState<{ roomCode: string } | null>(null);
  const [newRoomPassword, setNewRoomPassword] = useState("");
  const [showPasswordJoin, setShowPasswordJoin] = useState<{ roomCode: string } | null>(null);
  const [joinRoomPassword, setJoinRoomPassword] = useState("");
  
  useEffect(() => {
    if (previewRoom) {
      const refreshed = rooms.find(r => r.id === previewRoom.id);
      if (refreshed && JSON.stringify(refreshed) !== JSON.stringify(previewRoom)) {
        setPreviewRoom(refreshed);
      }
    }
  }, [rooms, previewRoom?.id]);

  useEffect(() => {
    const socket = globalSocketRef.current;
    if (!socket) return;

    const onCreated = (data: { room_code: string; room_name: string }) => {
      setPreviewRoom({ 
        id: data.room_code, 
        name: data.room_name, 
        mode: newRoomMode // Best guess from current UI state
      });
    };

    const onMetadata = (data: any) => {
      setPreviewRoom({
        id: data.room_code,
        name: data.room_name,
        mode: data.room_type === 'proximity' ? 'proximity' : (data.team_only ? 'team' : 'global'),
        host_id: data.host_id,
        is_locked: data.is_locked,
        has_password: data.has_password,
      });
    };

    const onMetadataError = (data: any) => {
      console.error("Room metadata error:", data.message);
      alert(`Could not find room: ${data.room_code}`);
    };

    socket.on("room_created_success", onCreated);
    socket.on("room_metadata", onMetadata);
    socket.on("room_metadata_error", onMetadataError);

    return () => {
      socket.off("room_created_success", onCreated);
      socket.off("room_metadata", onMetadata);
      socket.off("room_metadata_error", onMetadataError);
    };
  }, [globalSocketRef.current, newRoomMode]);

  const submitAddRoom = useCallback((e: React.FormEvent) => {
    e.preventDefault();

    if (globalSocketRef.current?.connected) {
      if (addModalTab === 'join') {
        const cleanRoom = newRoomInput.trim().toUpperCase();
        if (!cleanRoom) return;
        
        const existing = rooms.find(r => r.id === cleanRoom);
        if (existing) {
          setPreviewRoom(existing);
        } else {
          globalSocketRef.current?.emit("get_room_metadata", { room_code: cleanRoom });
        }
      } else {
        const cleanName = newRoomName.trim();
        if (!cleanName) return;
        globalSocketRef.current.emit("create_room", {
          room_name: cleanName,
          room_type: newRoomMode === 'proximity' ? 'proximity' : 'normal',
          team_only: newRoomMode === 'team',
          dead_chat: newRoomMode === 'proximity',
          is_hidden: newRoomHidden,
          password: newRoomPasswordCreate,
        });
        // We will receive room_created_success to actually preview it.
      }
    } else {
      // Local mostly for offline UI debug/testing
      if (addModalTab === 'join') {
        const cleanRoom = newRoomInput.trim().toUpperCase();
        const existing = rooms.find(r => r.id === cleanRoom);
        if (existing) setPreviewRoom(existing);
        else setPreviewRoom({ id: cleanRoom, mode: 'proximity' });
      }
    }

    setAddModalTab('join');
    setNewRoomInput("");
    setNewRoomName("");
    setNewRoomPasswordCreate("");
    setNewRoomHidden(false);
    setNewRoomMode('proximity');
    setShowAddModal(false);
  }, [newRoomInput, newRoomName, newRoomMode, newRoomHidden, newRoomPasswordCreate, addModalTab, rooms]);

  const handleRoomContextMenu = useCallback((e: React.MouseEvent, room: RoomInfo) => {
    e.preventDefault();
    if (room.host_id === userId) {
      setRoomContextMenu({
        x: e.clientX, y: e.clientY,
        roomCode: room.id, isLocked: !!room.is_locked, hasPassword: !!room.has_password,
      });
    }
  }, [userId]);

  const handleToggleLock = useCallback((targetRoomId: string, isLocked: boolean) => {
    if (activeRoom?.id === targetRoomId && voiceManagerRef.current?.socket) {
      voiceManagerRef.current.socket.emit("update_room_security", { is_locked: !isLocked });
    }
    setRoomContextMenu(null);
  }, [activeRoom]);

  const handleRemovePassword = useCallback((targetRoomId: string) => {
    if (activeRoom?.id === targetRoomId && voiceManagerRef.current?.socket) {
      voiceManagerRef.current.socket.emit("update_room_security", { password: "" });
    }
    setRoomContextMenu(null);
  }, [activeRoom]);

  const handleDeleteRoom = useCallback((targetRoomId: string) => {
    globalSocketRef.current?.emit("delete_room", { room_code: targetRoomId });
    setRoomContextMenu(null);
  }, []);

  const handleKickPlayer = useCallback((targetId: string) => {
    if (voiceManagerRef.current?.socket) {
      voiceManagerRef.current.socket.emit("kick_player", { target_user_id: parseInt(targetId) });
    }
    setContextMenu(null);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, peerId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, peerId });
  }, []);

  const setRoomPassword = useCallback((password: string) => {
    if (voiceManagerRef.current?.socket) {
      voiceManagerRef.current.socket.emit("update_room_security", { password: password.trim() });
    }
    setShowPasswordSetup(null);
    setNewRoomPassword("");
    setRoomContextMenu(null);
  }, []);

  const toggleLiveMap = useCallback((enabled: boolean) => {
    if (voiceManagerRef.current?.socket) {
      voiceManagerRef.current.socket.emit("update_room_settings", { map_enabled: enabled });
    }
  }, []);

  return {
    rooms, setRooms, activeRoom, setActiveRoom, previewRoom, setPreviewRoom,
    hoveredRoom, setHoveredRoom, roomMembers, setRoomMembers,
    // Modals
    showAddModal, setShowAddModal, showSettingsModal, setShowSettingsModal,
    settingsTab, setSettingsTab,
    addModalTab, setAddModalTab,
    newRoomInput, setNewRoomInput,
    newRoomName, setNewRoomName,
    newRoomMode, setNewRoomMode,
    newRoomHidden, setNewRoomHidden,
    newRoomPasswordCreate, setNewRoomPasswordCreate,
    showStreamPickerModal, setShowStreamPickerModal,
    // Context menus
    contextMenu, setContextMenu, profilePopup, setProfilePopup,
    roomContextMenu, setRoomContextMenu,
    showPasswordSetup, setShowPasswordSetup, newRoomPassword, setNewRoomPassword,
    showPasswordJoin, setShowPasswordJoin, joinRoomPassword, setJoinRoomPassword,
    // Handlers
    submitAddRoom, handleRoomContextMenu, handleToggleLock, handleRemovePassword,
    handleDeleteRoom, handleKickPlayer, handleContextMenu, setRoomPassword, toggleLiveMap,
  };
}
