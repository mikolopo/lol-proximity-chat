// ─── Shared Types for LoL Proximity Chat ───

export interface RoomInfo {
  id: string;
  mode: 'global' | 'team' | 'proximity';
  host_id?: string;
  is_locked?: boolean;
  has_password?: boolean;
  players_data?: PlayerData[];
  password?: string;
}

export interface PlayerData {
  name: string;
  champ: string;
  user_id: string;
}

export interface ChatMessage {
  sender: string;
  message: string;
  timestamp: number;
}

export interface ContextMenuState {
  x: number;
  y: number;
  peerId: string;
}

export interface ProfilePopupState {
  x: number;
  y: number;
  peerId: string;
}

export interface RoomContextMenuState {
  x: number;
  y: number;
  roomCode: string;
  isLocked: boolean;
  hasPassword: boolean;
}
