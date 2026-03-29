import { Monitor, Plus, Lock } from "lucide-react";
import type { RoomInfo } from "../types";

interface ServerSidebarProps {
  rooms: RoomInfo[];
  previewRoom: RoomInfo | null;
  activeRoom: RoomInfo | null;
  isConnected: boolean;
  hoveredRoom: string | null;
  roomMembers: Record<string, string[]>;
  setPreviewRoom: (r: RoomInfo | null) => void;
  setHoveredRoom: (id: string | null) => void;
  setShowAddModal: (v: boolean) => void;
  handleRoomContextMenu: (e: React.MouseEvent, room: RoomInfo) => void;
}

export function ServerSidebar({
  rooms, previewRoom, activeRoom, isConnected, hoveredRoom, roomMembers,
  setPreviewRoom, setHoveredRoom, setShowAddModal, handleRoomContextMenu,
}: ServerSidebarProps) {
  return (
    <div className="w-[72px] bg-[#1e1f22] flex flex-col items-center py-3 gap-2 flex-shrink-0 hide-scrollbar overflow-y-auto">
      {/* Home icon */}
      <div
        onClick={() => setPreviewRoom(null)}
        className={`w-12 h-12 rounded-[24px] hover:rounded-[16px] transition-all duration-200 flex items-center justify-center cursor-pointer text-white
          ${previewRoom === null ? 'bg-accent rounded-[16px]' : 'bg-bg-secondary hover:bg-accent'}`}
      >
        <Monitor size={24} />
      </div>
      <div className="w-8 h-[2px] bg-bg-secondary rounded-full mt-1 mb-1" />

      {/* Room Icons */}
      {(() => {
        // Create a final list of rooms to render, ensuring previewRoom is included if not in 'rooms'
        const displayRooms = [...rooms];
        if (previewRoom && !rooms.some(r => r.id === previewRoom.id)) {
          displayRooms.push(previewRoom);
        }

        return displayRooms.map((room) => {
          const isConnectedHere = isConnected && activeRoom?.id === room.id;
          const isPreviewingHere = previewRoom?.id === room.id;

          return (
            <div
              key={room.id}
              className="relative group flex items-center justify-center w-full"
              onMouseEnter={() => setHoveredRoom(room.id)}
              onMouseLeave={() => setHoveredRoom(null)}
            >
              <div className={`absolute left-0 w-1 bg-white rounded-r-full transition-all duration-300
                ${isConnectedHere ? 'h-10' : (isPreviewingHere ? 'h-8' : 'h-0 group-hover:h-5')}`}
              />
              <div
                onClick={() => setPreviewRoom(room)}
                onContextMenu={(e) => handleRoomContextMenu(e, room)}
                className={`w-12 h-12 transition-all duration-200 flex items-center justify-center cursor-pointer text-white font-bold text-lg relative
                  ${isPreviewingHere || isConnectedHere ? 'rounded-[16px] bg-accent' : 'rounded-[24px] bg-bg-secondary hover:rounded-[16px] hover:bg-accent'}`}
              >
                {room.id.substring(0, 2)}
                {room.is_locked && <Lock size={12} className="absolute -bottom-1 -right-1 text-[#ed4245] bg-[#292b2f] rounded-full p-0.5" />}
              </div>

              {/* Tooltip */}
              {hoveredRoom === room.id && (
                <div className="absolute left-[70px] bg-black text-white px-3 py-1.5 rounded-md text-sm whitespace-nowrap z-50 shadow-lg font-semibold flex flex-col">
                  <span>{room.id} - {room.mode === 'proximity' ? 'Spatial' : room.mode === 'team' ? 'Team' : 'Global'}</span>
                  <span className="text-xs text-text-muted font-normal mt-0.5">
                    {isConnectedHere ? 'Connected' : (roomMembers[room.id]?.length ? `${roomMembers[room.id].length} online` : 'Click to preview')}
                  </span>
                </div>
              )}
            </div>
          );
        });
      })()}

      {/* Add Room Button */}
      <div
        onClick={() => setShowAddModal(true)}
        className="w-12 h-12 bg-bg-secondary rounded-[24px] hover:rounded-[16px] transition-all duration-200 flex items-center justify-center cursor-pointer text-[#3ba55c] hover:bg-[#3ba55c] hover:text-white mt-1 group relative"
      >
        <Plus size={24} />
        <div className="absolute left-[70px] bg-black text-white px-3 py-1.5 rounded-md text-sm whitespace-nowrap z-50 shadow-lg font-semibold hidden group-hover:block">
          Add a Server
        </div>
      </div>
    </div>
  );
}
