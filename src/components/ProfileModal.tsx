import React, { useState } from "react";
import { User, LogIn, LogOut, Check, Sparkles, X, Shield, Mail } from "lucide-react";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  onGoogleSignIn: () => Promise<void>;
  onCustomSignIn: (user: any) => void;
  onSignOut: () => Promise<void>;
}

export default function ProfileModal({
  isOpen,
  onClose,
  currentUser,
  onGoogleSignIn,
  onCustomSignIn,
  onSignOut,
}: ProfileModalProps) {
  const [displayName, setDisplayName] = useState(currentUser?.displayName || "MakAitoo");
  const [email, setEmail] = useState(currentUser?.email || "makaitoo154@gmail.com");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSaveCustomProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;
    
    const updatedUser = {
      uid: currentUser?.uid || `custom_user_${Date.now()}`,
      displayName: displayName.trim(),
      email: email.trim() || "creator@toonflow.ai",
      photoURL: currentUser?.photoURL || null,
      isCustom: true
    };
    
    onCustomSignIn(updatedUser);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fadeIn">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-6">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-pink-500 to-indigo-600 p-0.5 shadow-lg shadow-indigo-500/20">
            {currentUser?.photoURL ? (
              <img src={currentUser.photoURL} alt="avatar" className="w-full h-full rounded-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-white font-bold text-lg">
                {(currentUser?.displayName || displayName || "C")[0].toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>{currentUser?.displayName || "創作者身份設定"}</span>
              <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full border border-cyan-500/30 font-mono font-semibold">
                {currentUser?.uid?.startsWith("guest_") ? "訪客" : "已驗證"}
              </span>
            </h3>
            <p className="text-xs text-slate-400 font-mono">
              {currentUser?.email || email}
            </p>
          </div>
        </div>

        {/* Google Sign In Option */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
            1. 使用 Google 雲端帳號連動 (自動同步)
          </label>
          <button
            type="button"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await onGoogleSignIn();
              } finally {
                setLoading(false);
              }
            }}
            className="w-full py-2.5 px-4 bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl transition shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
          >
            <LogIn className="w-4 h-4" />
            <span>Google 快速登入 / 同步雲端專案</span>
          </button>
        </div>

        <div className="relative flex py-1 items-center">
          <div className="flex-grow border-t border-slate-800"></div>
          <span className="flex-shrink mx-4 text-[10px] text-slate-500 uppercase font-mono">或 自訂創作者名稱</span>
          <div className="flex-grow border-t border-slate-800"></div>
        </div>

        {/* Custom Profile Form */}
        <form onSubmit={handleSaveCustomProfile} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block">
              創作者暱稱 (Display Name)
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="例如：MakAitoo"
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 focus:border-indigo-500 text-xs font-medium text-white rounded-xl outline-none transition"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-300 block">
              創作信箱 (Email)
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="makaitoo154@gmail.com"
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 focus:border-indigo-500 text-xs font-medium text-white rounded-xl outline-none transition"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center gap-3">
            <button
              type="submit"
              className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition shadow flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>更新/儲存身份</span>
            </button>

            {currentUser && (
              <button
                type="button"
                onClick={async () => {
                  await onSignOut();
                  onClose();
                }}
                className="py-2.5 px-3 bg-red-950/60 hover:bg-red-900 border border-red-800/50 text-red-300 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
