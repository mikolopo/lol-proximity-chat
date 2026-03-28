import { Lock, Unlock, Trash2 } from "lucide-react";
import type { RoomContextMenuState } from "../types";

interface RoomContextMenuProps {
  menu: RoomContextMenuState;
  activeRoomId: string | undefined;
  onToggleLock: (roomCode: string, isLocked: boolean) => void;
  onRemovePassword: (roomCode: string) => void;
  onSetPassword: (roomCode: string) => void;
  onDeleteRoom: (roomCode: string) => void;
  onClose: () => void;
}

export function RoomContextMenu({ menu, activeRoomId, onToggleLock, onRemovePassword, onSetPassword, onDeleteRoom, onClose }: RoomContextMenuProps) {
  const isActive = activeRoomId === menu.roomCode;

  return (
    <div
      className="fixed bg-[#18191c] border border-[#202225] rounded shadow-2xl p-2 z-[100] w-48 custom-context-menu"
      style={{ left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - 150) }}
      onMouseLeave={onClose}
    >
      <div className="px-3 py-1 font-bold text-white border-b border-[#202225] mb-1 truncate">{menu.roomCode} Admin</div>

      {isActive ? (
        <>
          <div onClick={() => onToggleLock(menu.roomCode, menu.isLocked)}
            className="px-3 py-1.5 text-sm text-[#dcddde] hover:bg-accent hover:text-white cursor-pointer rounded transition-colors flex justify-between items-center"
          >
            <span>{menu.isLocked ? 'Unlock Channel' : 'Lock Channel'}</span>
            {menu.isLocked ? <Unlock size={14} /> : <Lock size={14} />}
          </div>
          <div onClick={() => menu.hasPassword ? onRemovePassword(menu.roomCode) : onSetPassword(menu.roomCode)}
            className="px-3 py-1.5 text-sm text-[#dcddde] hover:bg-accent hover:text-white cursor-pointer rounded transition-colors"
          >
            <span>{menu.hasPassword ? 'Remove Password' : 'Set Password'}</span>
          </div>
        </>
      ) : (
        <div className="px-3 py-1.5 text-xs text-[#8e9297] italic">Connect to this channel to change security settings.</div>
      )}

      <div className="h-[1px] bg-[#2b2d31] my-1 mx-2" />
      <div onClick={() => onDeleteRoom(menu.roomCode)}
        className="px-3 py-1.5 text-sm text-[#ed4245] hover:bg-[#ed4245] hover:text-white cursor-pointer rounded transition-colors flex justify-between items-center"
      >
        <span>Delete Channel</span>
        <Trash2 size={14} />
      </div>
    </div>
  );
}
