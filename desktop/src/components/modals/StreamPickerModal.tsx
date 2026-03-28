import { X } from "lucide-react";

interface StreamPickerModalProps {
  captureSources: { id: string; name: string }[];
  onClose: () => void;
  onSelect: (sourceId: string) => void;
}

export function StreamPickerModal({ captureSources, onClose, onSelect }: StreamPickerModalProps) {
  return (
    <div className="absolute inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-[#36393f] w-full max-w-sm rounded-lg shadow-2xl flex flex-col pt-6 pb-4 px-4 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-text-muted hover:text-white"><X size={20} /></button>
        <h2 className="text-xl font-bold text-white mb-1">Share Your Screen</h2>
        <p className="text-sm text-text-muted mb-4">Pick a source to stream to the room.</p>
        <div className="flex flex-col gap-2">
          <button onClick={() => onSelect("window_lol")}
            className="w-full py-2.5 px-3 text-left rounded text-[14px] font-medium bg-[#4f545c] text-white hover:bg-accent transition-colors"
          >
            League of Legends Window
          </button>
          {captureSources.map(s => (
            <button key={s.id} onClick={() => onSelect(s.id)}
              className="w-full py-2.5 px-3 text-left rounded text-[14px] font-medium bg-[#4f545c] text-white hover:bg-accent transition-colors truncate"
            >
              {s.name || s.id}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
