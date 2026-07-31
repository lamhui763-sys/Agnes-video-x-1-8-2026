import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Settings, RefreshCw } from "lucide-react";

interface SettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  customApiKey: string;
  onSaveApiKey: (key: string) => void;
  onResetVideoTask: () => void;
}

export const SettingsDrawer = ({
  isOpen,
  onClose,
  customApiKey,
  onSaveApiKey,
  onResetVideoTask,
}: SettingsDrawerProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black"
          />

          <div className="absolute inset-y-0 right-0 max-w-md w-full flex pl-10">
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              className="w-screen max-w-md bg-slate-900 border-l border-slate-800 p-6 flex flex-col space-y-6 shadow-2xl relative"
            >
              {/* Close Settings */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-1.5 bg-slate-950 hover:bg-slate-850 border border-slate-800 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="space-y-1 pr-10">
                <h3 className="font-display font-extrabold text-lg text-white flex items-center gap-2">
                  <Settings className="w-5 h-5 text-pink-500" />
                  Toonflow Settings
                </h3>
                <p className="text-xs text-slate-400">Configure your professional AI video keys and integrations.</p>
              </div>

              <div className="space-y-5 flex-1 overflow-y-auto">
                {/* Custom API key parameter input */}
                <div className="space-y-2">
                  <label className="text-xs text-slate-300 font-bold uppercase block">
                    個人專屬 Agnes API Key (AGNES_API_KEY)
                  </label>
                  <input
                    type="password"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs font-mono text-slate-200 focus:outline-none focus:border-pink-500 transition placeholder:text-slate-700"
                    placeholder="cpk-oTHuYiCU..."
                    value={customApiKey}
                    onChange={(e) => onSaveApiKey(e.target.value)}
                  />
                  <div className="bg-slate-950 p-3.5 border border-slate-850 rounded-xl text-[10px] text-slate-400 leading-normal space-y-1">
                    <p className="font-bold text-slate-300">💡 提示與免費額度說明</p>
                    <p>
                      預設免費用量：我們已在伺服器後台環境中為您內置配置了目前最新可成功調用的內建有效金鑰，您無需設定即可直接成功調用。
                    </p>
                    <p className="text-indigo-400 font-bold">
                      如果您有自己註冊的 Agnes 帳號，在此貼上您的金鑰後，系統會將它儲存於您的瀏覽器本地，並在生成影片時自動以您的個人配額發起請求！
                    </p>
                  </div>
                </div>

                {/* Force Reset Task Lock Section */}
                <div className="bg-slate-950 p-4 border border-slate-850 rounded-xl space-y-2">
                  <p className="text-xs font-bold text-slate-300">⚙️ 影片生成狀態修復</p>
                  <p className="text-[10px] text-slate-400 leading-normal">
                    如果系統提示「A video generation is already in progress」或生成進度卡住，請點擊下方按鈕強制清除背景任務排程鎖。
                  </p>
                  <button
                    onClick={onResetVideoTask}
                    className="w-full py-2 bg-pink-600 hover:bg-pink-700 text-white text-xs font-semibold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer shadow"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>強制重置影片生成鎖 (Force Reset Lock)</span>
                  </button>
                </div>

                <div className="border-t border-slate-800/80 pt-4 space-y-2">
                  <p className="text-xs font-bold text-slate-400">Environment Metadata</p>
                  <div className="bg-slate-950 p-3 rounded-lg text-[11px] font-mono text-slate-500 space-y-1">
                    <div className="flex justify-between">
                      <span>PORT:</span>
                      <span>3000</span>
                    </div>
                    <div className="flex justify-between">
                      <span>NODE_ENV:</span>
                      <span>development</span>
                    </div>
                    <div className="flex justify-between">
                      <span>VITE_HMR:</span>
                      <span>disabled</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-850 pt-4">
                <button
                  onClick={onClose}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-750 text-white font-medium rounded-xl text-xs transition text-center cursor-pointer"
                >
                  關閉設定並返回
                </button>
              </div>

            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};
