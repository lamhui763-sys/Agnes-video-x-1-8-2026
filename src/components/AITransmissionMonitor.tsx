import React, { useState, useEffect } from "react";
import { Activity, Server, Wifi, Database, Cpu } from "lucide-react";

interface AITransmissionMonitorProps {
  progress: string;
  type: string;
  logs?: string[];
}

export const AITransmissionMonitor = ({ progress, type, logs }: AITransmissionMonitorProps) => {
  const [latency, setLatency] = useState(240);
  const [downloadRate, setDownloadRate] = useState(1.2);
  const [resourceUsage, setResourceUsage] = useState(85);
  
  // Random fluctuation effect
  useEffect(() => {
    const interval = setInterval(() => {
      setLatency(prev => Math.max(150, Math.min(800, prev + (Math.random() * 100 - 50))));
      setDownloadRate(prev => Math.max(0.5, Math.min(15.0, prev + (Math.random() * 2 - 1))));
      setResourceUsage(prev => Math.max(70, Math.min(99, prev + (Math.random() * 10 - 5))));
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 shadow-xl space-y-4 animate-fadeIn mt-2">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5" />
          <span>📡 AI 傳輸監控區</span>
        </span>
        <span className="bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
          <Server className="w-2.5 h-2.5 text-cyan-400" />
          Agnes {type} Node
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {/* Latency */}
        <div className="bg-slate-950 border border-slate-850 rounded-lg p-2 flex flex-col justify-between">
          <span className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Wifi className="w-2.5 h-2.5 text-cyan-400" />
            <span>延遲 (Latency)</span>
          </span>
          <div className="mt-2 flex items-end justify-between">
            <span className="text-sm font-mono font-bold text-white">{Math.round(latency)} <span className="text-[9px] text-slate-500">ms</span></span>
          </div>
          <div className="w-full h-1 mt-1.5 bg-slate-800 rounded-full overflow-hidden flex items-end">
            <div className={`h-full transition-all duration-500 ${latency > 500 ? 'bg-red-500' : latency > 300 ? 'bg-amber-500' : 'bg-cyan-500'}`} style={{ width: `${Math.min(100, (latency / 800) * 100)}%` }} />
          </div>
        </div>

        {/* Download Rate */}
        <div className="bg-slate-950 border border-slate-850 rounded-lg p-2 flex flex-col justify-between">
          <span className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Database className="w-2.5 h-2.5 text-cyan-400" />
            <span>下載速率</span>
          </span>
          <div className="mt-2 flex items-end justify-between">
            <span className="text-sm font-mono font-bold text-white">{downloadRate.toFixed(1)} <span className="text-[9px] text-slate-500">MB/s</span></span>
          </div>
          <div className="w-full h-1 mt-1.5 bg-slate-800 rounded-full overflow-hidden">
             <div className="h-full bg-cyan-500 transition-all duration-500" style={{ width: `${Math.min(100, (downloadRate / 15) * 100)}%` }} />
          </div>
        </div>

        {/* Resource Allocation */}
        <div className="bg-slate-950 border border-slate-850 rounded-lg p-2 flex flex-col justify-between">
          <span className="text-[8px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Cpu className="w-2.5 h-2.5 text-cyan-400" />
            <span>資源佔用率</span>
          </span>
          <div className="mt-2 flex items-end justify-between">
            <span className="text-sm font-mono font-bold text-white">{Math.round(resourceUsage)} <span className="text-[9px] text-slate-500">%</span></span>
          </div>
          <div className="w-full h-1 mt-1.5 bg-slate-800 rounded-full overflow-hidden">
             <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${resourceUsage}%` }} />
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center py-2 text-center border-t border-slate-800/50 mt-2 pt-3">
        <span className="text-xs font-bold text-white mb-1">正在編譯與傳輸串流數據...</span>
        <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800 mb-1">
          <div className="bg-gradient-to-r from-cyan-500 to-indigo-500 h-full transition-all duration-300 relative" style={{ width: progress || "0%" }}>
            <div className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_1s_infinite]" />
          </div>
        </div>
        <span className="text-[10px] text-slate-400 font-medium">
          進度 <strong className="text-cyan-400">{progress || "0%"}</strong>
        </span>
      </div>

      {logs && logs.length > 0 && (
        <div className="w-full bg-black/95 p-2 rounded-lg text-[8px] font-mono text-cyan-400 text-left h-24 overflow-y-auto border border-cyan-500/20 shadow-inner">
           {logs.map((logLine, logIdx) => (
             <div key={logIdx} className="break-all">{logLine}</div>
           ))}
        </div>
      )}
    </div>
  );
};
