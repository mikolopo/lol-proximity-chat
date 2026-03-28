interface LogsTerminalProps {
  logs: string[];
  setLogs: React.Dispatch<React.SetStateAction<string[]>>;
  logEndRef: React.RefObject<HTMLDivElement | null>;
}

export function LogsTerminal({ logs, setLogs, logEndRef }: LogsTerminalProps) {
  return (
    <div className="w-full shrink-0 bg-[#2f3136] rounded p-3 font-mono text-[11px] text-[#b9bbbe] h-32 overflow-y-auto border border-[#202225] shadow-inner mb-2 hide-scrollbar">
      <div className="mb-2 text-white font-bold flex justify-between">
        <span>IPC Diagnostics</span>
        <span className="text-[10px] text-[#b9bbbe] font-normal px-2 py-0.5 rounded cursor-pointer hover:bg-white/10" onClick={() => setLogs([])}>Clear</span>
      </div>
      {logs.map((log, i) => {
        const colorClass = log.includes("[ERROR]") || log.includes("[UI ERROR]") ? "text-[#ed4245]"
          : log.includes("[SYSTEM]") || log.includes("[UI]") ? "text-[#3ba55c]"
          : "";
        return (
          <div key={i} className={`py-0.5 border-b border-[#202225] last:border-0 ${colorClass}`}>{log}</div>
        );
      })}
      {logs.length === 0 && <div className="italic opacity-50">Awaiting events...</div>}
      <div ref={logEndRef} />
    </div>
  );
}
