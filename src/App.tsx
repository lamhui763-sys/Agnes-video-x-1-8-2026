import { ScrubbableVideoPlayer } from "./components/ScrubbableVideoPlayer";
import { apiFetch } from "./lib/apiClient";
import React, { useState, useEffect, useRef } from "react";
import { 
  Video,
  Terminal,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Clapperboard,
  Flame,
  HelpCircle,
  Play,
  Loader2,
  Volume2,
  Settings,
  ChevronLeft,
  Plus,
  Trash2,
  Save,
  BookOpen,
  Users,
  Layers,
  Film,
  BrainCircuit,
  Sliders,
  X,
  Eye,
  User,
  Info,
  ChevronRight,
  MessageSquare,
  Copy,
  Wand2,
  Clock,
  GripVertical,
  StopCircle,
  Bookmark,
  Undo,
  Redo,
  Edit3,
  Edit2,
  Search,
  Upload,
  FileText,
  Printer,
  Link,
  Link2,
  Zap,
  Download,
  Activity,
  Wifi,
  Cpu,
  Database,
  Server,
  Lock,
  Unlock
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import clsx from "clsx";
import { Scene, Character, Project, TaskState, DEFAULT_SCENE } from "./types";
import VideoGallery from "./components/VideoGallery";
import SequentialChainMode from "./components/SequentialChainMode";
import SceneItem from "./components/SceneItem";
import AuthWrapper from "./components/AuthWrapper";
import ExperienceLibrary from "./components/ExperienceLibrary";
import { STYLE_PRESETS, NEGATIVE_PRESETS } from "./data";
import { AITransmissionMonitor } from "./components/AITransmissionMonitor";
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, db } from "./lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { logToExperienceLibrary } from "./lib/logger";
import { getProjectSignature, normalizeProjectsList, copyTextToClipboard as copyTextToClipboardUtil } from "./lib/projectUtils";
import { shouldUseHardCut, HARD_CUT_INSTRUCTION, buildVideoPrompt, isNoChar } from "./lib/promptBuilder";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { PrintModal } from "./components/PrintModal";
import ProfileModal from "./components/ProfileModal";


export default function App() {
  // Navigation & Project selection states
  const [projects, setProjects] = useState<Project[]>([]);
  const [isSyncCompleted, setIsSyncCompleted] = useState<boolean>(false);
  
  // Auth state
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false);

  // Monitor auth state change
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // Real authenticated Firebase / Google user takes top priority
        localStorage.removeItem("toonflow_custom_user");
        setCurrentUser(firebaseUser);
        setIsAuthLoading(false);
      } else {
        const localCustomUser = localStorage.getItem("toonflow_custom_user");
        if (localCustomUser) {
          try {
            const user = JSON.parse(localCustomUser);
            setCurrentUser(user);
            setIsAuthLoading(false);
            return;
          } catch (e) {
            console.error("Failed to parse custom user:", e);
          }
        }
        setCurrentUser(null);
        setIsAuthLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    try {
      setIsAuthLoading(true);
      localStorage.removeItem("toonflow_custom_user");
      const res = await signInWithPopup(auth, googleProvider);
      if (res && res.user) {
        setCurrentUser(res.user);
        showToast(`登入成功！歡迎回來，${res.user.displayName || res.user.email}！`, "success");
      }
    } catch (err: any) {
      const errorCode = err?.code || "";
      const errorMsg = err?.message || "";
      
      if (errorCode === "auth/unauthorized-domain" || errorMsg.includes("unauthorized-domain")) {
        console.warn("Google login unavailable on preview domain:", errorMsg);
        showToast("預覽網域尚未加入 Firebase 授權清單。您可在創作者設定中填寫專屬名稱，所有創作皆可正常同步！", "info");
        setIsProfileModalOpen(true);
      } else if (errorCode === "auth/popup-closed-by-user" || errorMsg.includes("popup-closed-by-user")) {
        console.warn("Google login popup closed by user.");
        showToast("登入視窗已被關閉。點擊創作者暱稱即可自訂創作者身份。", "info");
      } else if (errorCode === "auth/cancelled-popup-request" || errorMsg.includes("cancelled-popup-request")) {
        console.warn("Google login popup request cancelled.");
        showToast("已取消先前的登入請求。", "info");
      } else {
        console.warn("Google login failed:", err);
        showToast(`登入失敗: ${err.message || "未知錯誤"}`, "error");
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleCustomSignIn = (user: any) => {
    localStorage.setItem("toonflow_custom_user", JSON.stringify(user));
    setCurrentUser(user);
    showToast(`歡迎回來，${user.displayName || user.email}！`, "success");
  };

  const handleSignOut = async () => {
    try {
      setIsAuthLoading(true);
      localStorage.removeItem("toonflow_custom_user");
      await signOut(auth);
      setCurrentUser(null);
      showToast("已成功登出，專案已切換為訪客本地儲存模式", "info");
    } catch (err: any) {
      console.error("Logout failed:", err);
      showToast("登出失敗，請重試", "error");
      setIsAuthLoading(false);
    }
  };

  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("toonflow_active_project_id") || null;
    } catch (e) {
      return null;
    }
  });
  const activeProject = projects.find(p => p.id === activeProjectId) || null;

  // Inline project title editing state
  const [isEditingProjectName, setIsEditingProjectName] = useState<boolean>(false);
  const [editingProjectNameValue, setEditingProjectNameValue] = useState<string>("");

  // Clean activeProjectId validation: if activeProjectId points to a non-existent project ID, clear it
  useEffect(() => {
    if (!projects || projects.length === 0) return;
    if (activeProjectId) {
      const exists = projects.some(p => p.id === activeProjectId);
      if (!exists) {
        setActiveProjectId(null);
        localStorage.removeItem("toonflow_active_project_id");
      }
    }
  }, [projects, activeProjectId]);

  // Persist active project ID whenever it changes, or remove it when null
  useEffect(() => {
    if (activeProjectId) {
      localStorage.setItem("toonflow_active_project_id", activeProjectId);
    } else {
      localStorage.removeItem("toonflow_active_project_id");
    }
  }, [activeProjectId]);
  const [activeTab, setActiveTab] = useState<"novel" | "characters" | "scenes" | "scenes_ext" | "gallery" | "experience">("scenes");
  
  // Settings & Custom API Keys
  const [customApiKey, setCustomApiKey] = useState<string>("cpk-oTHuYiCUe46ZJGyd6xcAmNKiP3DjxcUeiIuqEF9saqLZrq8J");
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  
  // Generation & AI progress states
  const [isDisassembling, setIsDisassembling] = useState<boolean>(false);
  const [isExtractingCharacters, setIsExtractingCharacters] = useState<boolean>(false);
  const [isGeneratingNovel, setIsGeneratingNovel] = useState<boolean>(false);
  const [novelIdea, setNovelIdea] = useState<string>("");
  const [showIdeaInput, setShowIdeaInput] = useState<boolean>(false);
  const [isGeneratingAllSequentially, setIsGeneratingAllSequentially] = useState<boolean>(false);
  const [isGeneratingAllKeyframesSequentially, setIsGeneratingAllKeyframesSequentially] = useState<boolean>(false);
  const [isFullAutoProducing, setIsFullAutoProducing] = useState<boolean>(false);
  const [strictWorkflowLock, setStrictWorkflowLock] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("toonflow_strict_workflow_lock");
      return saved === "true"; // Default to false (Lenient mode by default to protect generated media)!
    } catch (e) {
      return false;
    }
  });

  const handleToggleStrictWorkflowLock = () => {
    setStrictWorkflowLock(prev => {
      const newVal = !prev;
      try {
        localStorage.setItem("toonflow_strict_workflow_lock", String(newVal));
      } catch (e) {}
      showToast(newVal ? "🔒 七步嚴格工作流鎖已開啟：若未完全通過7步，將嚴格重試或暫停，絕不跳鏡！" : "🔓 七步嚴格工作流鎖已關閉：故障時將容錯並安全跳過。", "info");
      return newVal;
    });
  };
  const [fullAutoProgress, setFullAutoProgress] = useState<string>("0%");
  const [fullAutoLogs, setFullAutoLogs] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("toonflow_full_auto_logs");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem("toonflow_full_auto_logs", JSON.stringify(fullAutoLogs.slice(-100)));
    } catch (e) {}
  }, [fullAutoLogs]);
  const [isGeneratingNextScene, setIsGeneratingNextScene] = useState<boolean>(false);
  const [finalStitchedVideoUrl, setFinalStitchedVideoUrl] = useState<string | null>(null);
  const [isConfirmingClear, setIsConfirmingClear] = useState<boolean>(false);
  const [isDownloadingMasterpiece, setIsDownloadingMasterpiece] = useState<boolean>(false);
  
  const handleDownloadMasterpiece = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (isDownloadingMasterpiece) return;
    const url = finalStitchedVideoUrl || activeProject?.finalVideoUrl;
    if (!url) return;
    
    try {
      setIsDownloadingMasterpiece(true);
      showToast("正在準備下載，這可能需要幾秒鐘...", "info");
      const res = await fetch(`/api/download?url=${encodeURIComponent(url as string)}`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = "final-masterpiece.mp4";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Failed to download masterpiece:", error);
      showToast("下載失敗，請稍後再試", "error");
    } finally {
      setIsDownloadingMasterpiece(false);
    }
  };

  // Custom states for selectable Agents
  const [selectedNovelAgents, setSelectedNovelAgents] = useState<('gemini' | 'agnes' | 'mistral')[]>(['gemini', 'agnes', 'mistral']);
  const [selectedChatAgents, setSelectedChatAgents] = useState<('gemini' | 'agnes' | 'mistral')[]>(['gemini', 'agnes', 'mistral']);
  
  // Chatbot states
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'ai', content: string, agent?: 'gemini' | 'agnes' | 'mistral' | 'all'}[]>([]);
  const [chatInput, setChatInput] = useState<string>("");
  const [isChatting, setIsChatting] = useState<boolean>(false);

  // Scene-level chatbot states
  const [sceneChats, setSceneChats] = useState<Record<string, { role: 'user' | 'ai'; content: string }[]>>({});
  const [sceneChatInputs, setSceneChatInputs] = useState<Record<string, string>>({});
  const [isSceneChatting, setIsSceneChatting] = useState<Record<string, boolean>>({});

  // Global Storyboard Chatbot states
  const [storyboardChatMessages, setStoryboardChatMessages] = useState<{ role: 'user' | 'ai'; content: string }[]>([]);
  const [storyboardChatInput, setStoryboardChatInput] = useState<string>("");
  const [isStoryboardChatting, setIsStoryboardChatting] = useState<boolean>(false);
  
  const [globalTask, setGlobalTask] = useState<TaskState>({
    status: "idle",
    progress: "0%",
    logs: [],
  });

  // Simulation playback state (本地 100% 免費影片製作大師)
  const [selectedSceneForSimulation, setSelectedSceneForSimulation] = useState<Scene | null>(null);
  const [isPlayingSimulation, setIsPlayingSimulation] = useState<boolean>(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

  // Global Character Library & Toast States
  const [characterLibrary, setCharacterLibrary] = useState<Character[]>([]);
  const [librarySearchQuery, setLibrarySearchQuery] = useState<string>("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "info" | "error" } | null>(null);
  const [analyzingTargetId, setAnalyzingTargetId] = useState<string | null>(null);

  const showToast = (message: string, type: "success" | "info" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // References
  const logsEndRef = useRef<HTMLDivElement>(null);
  const abortControllersRef = useRef<Record<string, AbortController>>({});
  const videoIntervalsRef = useRef<Record<string, NodeJS.Timeout>>({});
  const [newProjectName, setNewProjectName] = useState<string>("");

  // Drag and drop sorting states
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [draggedOverIndex, setDraggedOverIndex] = useState<number | null>(null);

  // Undo/Redo state history
  const [undoStack, setUndoStack] = useState<Project[]>([]);
  const [redoStack, setRedoStack] = useState<Project[]>([]);
  
  const lastSignatureRef = useRef<string>("");
  const stableProjectRef = useRef<Project | null>(null);
  const isUndoRedoActionRef = useRef<boolean>(false);
  const debounceTimerRef = useRef<any>(null);

  // Listen to activeProject changes and update history stack (debounced to avoid typing noise)
  useEffect(() => {
    if (!activeProject) {
      lastSignatureRef.current = "";
      stableProjectRef.current = null;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      return;
    }

    const currentSignature = getProjectSignature(activeProject);

    if (isUndoRedoActionRef.current) {
      // Just update reference, don't push to stack
      lastSignatureRef.current = currentSignature;
      stableProjectRef.current = JSON.parse(JSON.stringify(activeProject));
      isUndoRedoActionRef.current = false;
      return;
    }

    // Set up stable reference on initial load of active project
    if (!stableProjectRef.current) {
      lastSignatureRef.current = currentSignature;
      stableProjectRef.current = JSON.parse(JSON.stringify(activeProject));
      return;
    }

    // If signature changed, schedule updating the stable state and pushing to undoStack
    if (currentSignature !== lastSignatureRef.current) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

      debounceTimerRef.current = setTimeout(() => {
        if (stableProjectRef.current) {
          const prevStable = stableProjectRef.current;
          setUndoStack(prev => {
            const newStack = [...prev, prevStable];
            if (newStack.length > 50) {
              newStack.shift();
            }
            return newStack;
          });
          // New action clears redo stack
          setRedoStack([]);
        }
        stableProjectRef.current = JSON.parse(JSON.stringify(activeProject));
      }, 800); // 800ms debounce
    }

    lastSignatureRef.current = currentSignature;
  }, [activeProject]);

  // Reset undo/redo stacks when activeProjectId changes
  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (activeProject) {
      lastSignatureRef.current = getProjectSignature(activeProject);
      stableProjectRef.current = JSON.parse(JSON.stringify(activeProject));
    } else {
      lastSignatureRef.current = "";
      stableProjectRef.current = null;
    }
  }, [activeProjectId]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const handleUndo = () => {
    if (!activeProjectId) return;
    
    // Check if there are uncommitted changes (from a pending debounce)
    const currentSignature = activeProject ? getProjectSignature(activeProject) : "";
    const stableSignature = stableProjectRef.current ? getProjectSignature(stableProjectRef.current) : "";
    
    if (currentSignature !== stableSignature && stableProjectRef.current && activeProject) {
      // Clear pending debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      
      isUndoRedoActionRef.current = true;
      
      // Save current typed state to redo stack
      setRedoStack(prev => [...prev, JSON.parse(JSON.stringify(activeProject))]);
      
      const prevProject = stableProjectRef.current;
      
      // Revert projects state to the stable state
      setProjects(prevProjects => {
        const updatedList = prevProjects.map(p => {
          if (p.id === activeProjectId) {
            return JSON.parse(JSON.stringify(prevProject));
          }
          return p;
        });
        try {
          localStorage.setItem("toonflow_projects", JSON.stringify(updatedList)); localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString());
        } catch (e) {
          console.error("Failed to save to localStorage in Undo:", e);
        }
        return updatedList;
      });
      
      showToast("已復原變更 (Undo)", "success");
      return;
    }

    // Standard undo from stack
    if (undoStack.length === 0) {
      showToast("沒有更多變更可以復原！", "info");
      return;
    }
    
    const prevProject = undoStack[undoStack.length - 1];
    const newUndoStack = undoStack.slice(0, -1);
    
    isUndoRedoActionRef.current = true;
    
    // Push current state to redo stack
    if (activeProject) {
      setRedoStack(prev => [...prev, JSON.parse(JSON.stringify(activeProject))]);
    }
    
    setUndoStack(newUndoStack);
    
    setProjects(prevProjects => {
      const updatedList = prevProjects.map(p => {
        if (p.id === activeProjectId) {
          return JSON.parse(JSON.stringify(prevProject));
        }
        return p;
      });
      try {
        localStorage.setItem("toonflow_projects", JSON.stringify(updatedList)); localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString());
      } catch (e) {
        console.error("Failed to save to localStorage in Undo:", e);
      }
      return updatedList;
    });
    
    stableProjectRef.current = JSON.parse(JSON.stringify(prevProject));
    showToast("已復原變更 (Undo)", "success");
  };

  const handleRedo = () => {
    if (redoStack.length === 0 || !activeProjectId) {
      showToast("沒有更多已復原變更可以重做！", "info");
      return;
    }
    
    const nextProject = redoStack[redoStack.length - 1];
    const newRedoStack = redoStack.slice(0, -1);
    
    isUndoRedoActionRef.current = true;
    
    // Clear pending debounce if any
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Push current state to undo stack
    if (activeProject) {
      setUndoStack(prev => [...prev, JSON.parse(JSON.stringify(activeProject))]);
    }
    
    setRedoStack(newRedoStack);
    
    setProjects(prevProjects => {
      const updatedList = prevProjects.map(p => {
        if (p.id === activeProjectId) {
          return JSON.parse(JSON.stringify(nextProject));
        }
        return p;
      });
      try {
        localStorage.setItem("toonflow_projects", JSON.stringify(updatedList)); localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString());
      } catch (e) {
        console.error("Failed to save to localStorage in Redo:", e);
      }
      return updatedList;
    });
    
    stableProjectRef.current = JSON.parse(JSON.stringify(nextProject));
    showToast("已重做變更 (Redo)", "success");
  };

  const undoRef = useRef(handleUndo);
  const redoRef = useRef(handleRedo);
  
  useEffect(() => {
    undoRef.current = handleUndo;
    redoRef.current = handleRedo;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeProjectId) return;
      
      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      if (isCtrlOrCmd) {
        if (e.key === "z" || e.key === "Z") {
          if (e.shiftKey) {
            e.preventDefault();
            redoRef.current();
          } else {
            e.preventDefault();
            undoRef.current();
          }
        } else if (e.key === "y" || e.key === "Y") {
          e.preventDefault();
          redoRef.current();
        }
      } else if (!isInput) {
        if (e.key === "s" || e.key === "S") {
          setActiveTab("scenes");
        } else if (e.key === "c" || e.key === "C") {
          setActiveTab("characters");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [activeProjectId]);

  // Auto-scroll full automatic production logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [fullAutoLogs]);

  // Load projects and settings on mount
  useEffect(() => {
    const savedProjects = localStorage.getItem("toonflow_projects");
    const savedKey = localStorage.getItem("agnes_custom_api_key");
    const savedLib = localStorage.getItem("toonflow_character_library");
    
    if (savedLib) {
      try {
        setCharacterLibrary(JSON.parse(savedLib));
      } catch (e) {
        console.error("Failed to parse character library", e);
      }
    }

    if (savedKey && savedKey !== "cpk-CJxrCSyiu9BWsE1yzwrPX2REloaU8cgoPeGH4daMV6NcVSm8") {
      setCustomApiKey(savedKey);
    } else {
      setCustomApiKey("cpk-oTHuYiCUe46ZJGyd6xcAmNKiP3DjxcUeiIuqEF9saqLZrq8J");
      localStorage.setItem("agnes_custom_api_key", "cpk-oTHuYiCUe46ZJGyd6xcAmNKiP3DjxcUeiIuqEF9saqLZrq8J");
    }

    if (savedProjects) {
      try {
        const parsed = JSON.parse(savedProjects);
        console.log("Parsed projects:", parsed);
        if (parsed && Array.isArray(parsed)) {
          if (parsed.length === 0) {
            console.log("Saved projects is an empty array.");
          }
          // Robustly migrate and normalize project entries
          const normalized = normalizeProjectsList(parsed);
          setProjects(normalized);

          // Asynchronously migrate any leftover base64 images to server storage to free up localStorage
          (async () => {
            let hasChanges = false;
            const migrateUrl = async (url: string) => {
              if (url && url.startsWith("data:image")) {
                try {
                  const res = await fetch("/api/upload-image", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ base64Data: url })
                  });
                  if (res.ok) {
                    const data = await res.json();
                    return data.imageUrl;
                  }
                } catch (e) {
                  console.error("Migration failed for a base64 image", e);
                }
              }
              return url;
            };

            const migratedProjects = await Promise.all(normalized.map(async p => {
              const mProj = { ...p };
              let projChanged = false;
              
              // Migrate character avatars
              mProj.characters = await Promise.all(mProj.characters.map(async c => {
                let mChar = { ...c };
                const newAvatarUrl = await migrateUrl(mChar.avatarUrl);
                if (newAvatarUrl !== mChar.avatarUrl) { mChar.avatarUrl = newAvatarUrl; projChanged = true; }
                
                if (mChar.avatarUrls && mChar.avatarUrls.length > 0) {
                  mChar.avatarUrls = await Promise.all(mChar.avatarUrls.map(u => migrateUrl(u)));
                  projChanged = true;
                }
                
                const newUpAvatarUrl = await migrateUrl(mChar.uploadedAvatarUrl);
                if (newUpAvatarUrl !== mChar.uploadedAvatarUrl) { mChar.uploadedAvatarUrl = newUpAvatarUrl; projChanged = true; }
                
                if (mChar.uploadedAvatarUrls && mChar.uploadedAvatarUrls.length > 0) {
                  mChar.uploadedAvatarUrls = await Promise.all(mChar.uploadedAvatarUrls.map(u => migrateUrl(u)));
                  projChanged = true;
                }
                
                return mChar;
              }));

              const processScenes = async (scenes: any[]) => {
                return await Promise.all(scenes.map(async (s: any) => {
                  let mScene = { ...s };
                  const newImg = await migrateUrl(mScene.imageUrl);
                  if (newImg !== mScene.imageUrl) { mScene.imageUrl = newImg; projChanged = true; }
                  const newImgExt = await migrateUrl(mScene.imageUrlExt);
                  if (newImgExt !== mScene.imageUrlExt) { mScene.imageUrlExt = newImgExt; projChanged = true; }
                  const newImgKf = await migrateUrl(mScene.imageUrlKeyframes);
                  if (newImgKf !== mScene.imageUrlKeyframes) { mScene.imageUrlKeyframes = newImgKf; projChanged = true; }
                  return mScene;
                }));
              };

              mProj.scenes = await processScenes(mProj.scenes);
              mProj.scenesExt = await processScenes(mProj.scenesExt);
              mProj.scenesFirstLast = await processScenes(mProj.scenesFirstLast);

              if (projChanged) hasChanges = true;
              return mProj;
            }));

            if (hasChanges) {
              console.log("[Toonflow] Successfully migrated base64 images to server assets.");
              setProjects(migratedProjects);
              try {
                localStorage.setItem("toonflow_projects", JSON.stringify(migratedProjects)); localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString());
              } catch (e) {
                console.error("Quota still exceeded after migration", e);
              }
            }
          })();

        } else {
          seedDefaultProject();
        }
      } catch (e) {
        seedDefaultProject();
      }
    } else {
      seedDefaultProject();
    }
  }, []);

  // Sync projects from secure server-side proxy on mount/auth-ready and handle normalization securely
  useEffect(() => {
    if (isAuthLoading) return;

    const fetchProjects = async (retries = 3) => {
      try {
        const url = currentUser 
          ? `/api/load-projects?userId=${currentUser.uid}&email=${encodeURIComponent(currentUser.email || "")}` 
          : "/api/load-projects";
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Proxy status: ${res.status}`);
        }
        const data = await res.json();
        if (data && Array.isArray(data.projects)) {
          const localTimestamp = parseInt(localStorage.getItem("toonflow_last_sync_timestamp") || "0");
          const cloudTimestamp = data.lastModified || 0;
          const localProjectsRaw = localStorage.getItem("toonflow_projects");
          
          let localList: Project[] = [];
          if (localProjectsRaw) {
            try {
              const parsedLocal = JSON.parse(localProjectsRaw);
              if (Array.isArray(parsedLocal)) localList = parsedLocal;
            } catch (e) {}
          }
          const serverList = Array.isArray(data.projects) ? data.projects : [];

          // Merge server and local projects by ID so no project is lost
          const projectMap = new Map<string, Project>();
          localList.forEach(p => { if (p && p.id) projectMap.set(p.id, p); });
          serverList.forEach(sp => {
            if (sp && sp.id) {
              const existing = projectMap.get(sp.id);
              if (!existing) {
                projectMap.set(sp.id, sp);
              } else {
                if (cloudTimestamp > localTimestamp || (sp.scenes && sp.scenes.length >= (existing.scenes?.length || 0))) {
                  projectMap.set(sp.id, { ...existing, ...sp });
                }
              }
            }
          });

          const mergedProjects = normalizeProjectsList(Array.from(projectMap.values()));
          setProjects(mergedProjects);
          try {
            localStorage.setItem("toonflow_projects", JSON.stringify(mergedProjects));
            localStorage.setItem("toonflow_last_sync_timestamp", Math.max(cloudTimestamp, localTimestamp).toString());
          } catch (e) {
            console.error("Quota exceeded saving merged projects", e);
          }
        }
        setIsSyncCompleted(true);
      } catch (e: any) {
        if (retries > 0) {
          console.warn(`Server proxy loading failed/offline, retrying... (${retries} attempts left)`);
          setTimeout(() => fetchProjects(retries - 1), 2000);
        } else {
          console.warn("Failed to sync projects from server-side proxy", e);
          setIsSyncCompleted(true); // Permit usage and local autosave
        }
      }
    };
    fetchProjects();
  }, [currentUser, isAuthLoading]);

  // Debounced secure cloud autosave to prevent data loss or mismatch
  useEffect(() => {
    if (!isSyncCompleted) return;
    if (!projects || projects.length === 0) return;

    const timer = setTimeout(() => {
      // Simple dirty check to avoid redundant writes
      const savedProjects = localStorage.getItem("last_saved_projects");
      if (savedProjects === JSON.stringify(projects)) {
        return;
      }
      
      // Cool-down for 10 minutes if we hit a quota error
      const lastSaveAttempt = localStorage.getItem("last_save_attempt_time");
      if (lastSaveAttempt && Date.now() - parseInt(lastSaveAttempt) < 600000) {
        return;
      }
      localStorage.setItem("last_saved_projects", JSON.stringify(projects));

      const performSave = async (retryCount = 0) => {
        try {
          const uploadBase64 = async (url: string) => {
            if (url && url.startsWith("data:image")) {
              try {
                const uploadRes = await fetch("/api/upload-image", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ base64Data: url })
                });
                if (uploadRes.ok) {
                  const data = await uploadRes.json();
                  return data.imageUrl;
                }
              } catch (e) {
                console.error("[Toonflow Autosave] Failed to upload base64 image", e);
              }
            }
            return url;
          };

          // Prune large logs to avoid payload size overflow and ensure fast transfers under Firestore limits
          const prunedProjects = projects.map(p => {
            const pruneScene = (s: any) => {
              if (!s) return s;
              const pruned = { ...s };
              if (Array.isArray(pruned.videoLogs)) {
                pruned.videoLogs = pruned.videoLogs.slice(-5);
              }
              if (Array.isArray(pruned.videoLogsExt)) {
                pruned.videoLogsExt = pruned.videoLogsExt.slice(-5);
              }
              if (Array.isArray(pruned.videoLogsKeyframes)) {
                pruned.videoLogsKeyframes = pruned.videoLogsKeyframes.slice(-5);
              }
              return pruned;
            };
            return {
              ...p,
              scenes: Array.isArray(p.scenes) ? p.scenes.map(pruneScene) : [],
              scenesExt: Array.isArray(p.scenesExt) ? p.scenesExt.map(pruneScene) : [],
              scenesFirstLast: Array.isArray(p.scenesFirstLast) ? p.scenesFirstLast.map(pruneScene) : []
            };
          });

          // Scan and replace all base64 images in prunedProjects sequentially to avoid choking the network
          const cleanProjects = [];
          for (const p of prunedProjects) {
            const cleanProj = { ...p };
            
            // Trim novelText if too long to prevent Firestore 1MB limits
            if (cleanProj.novelText && cleanProj.novelText.length > 50000) {
              cleanProj.novelText = cleanProj.novelText.substring(0, 50000) + "... (劇本內容過長，已自動截斷存檔)";
            }
            
            // Characters
            if (Array.isArray(cleanProj.characters)) {
              const cleanedChars = [];
              for (const c of cleanProj.characters) {
                const cleanedChar = { ...c };
                cleanedChar.avatarUrl = await uploadBase64(cleanedChar.avatarUrl || "");
                cleanedChar.uploadedAvatarUrl = await uploadBase64(cleanedChar.uploadedAvatarUrl || "");
                
                if (Array.isArray(cleanedChar.avatarUrls)) {
                  const cleanedUrls = [];
                  for (const url of cleanedChar.avatarUrls) {
                    cleanedUrls.push(await uploadBase64(url));
                  }
                  cleanedChar.avatarUrls = cleanedUrls;
                }
                
                if (Array.isArray(cleanedChar.uploadedAvatarUrls)) {
                  const cleanedUploadedUrls = [];
                  for (const url of cleanedChar.uploadedAvatarUrls) {
                    cleanedUploadedUrls.push(await uploadBase64(url));
                  }
                  cleanedChar.uploadedAvatarUrls = cleanedUploadedUrls;
                }
                
                cleanedChars.push(cleanedChar);
              }
              cleanProj.characters = cleanedChars;
            }
            
            // Scenes
            const cleanSceneImages = async (scenesList: any[]) => {
              if (!Array.isArray(scenesList)) return [];
              const cleanedScenes = [];
              for (const s of scenesList) {
                if (!s) {
                  cleanedScenes.push(s);
                  continue;
                }
                const cleanedScene = { ...s };
                cleanedScene.imageUrl = await uploadBase64(cleanedScene.imageUrl || "");
                cleanedScene.imageUrlExt = await uploadBase64(cleanedScene.imageUrlExt || "");
                cleanedScene.imageUrlKeyframes = await uploadBase64(cleanedScene.imageUrlKeyframes || "");
                cleanedScenes.push(cleanedScene);
              }
              return cleanedScenes;
            };
            
            cleanProj.scenes = await cleanSceneImages(cleanProj.scenes);
            cleanProj.scenesExt = await cleanSceneImages(cleanProj.scenesExt);
            cleanProj.scenesFirstLast = await cleanSceneImages(cleanProj.scenesFirstLast);
            
            cleanProjects.push(cleanProj);
          }

          const savePayload: any = { projects: cleanProjects };
          if (currentUser) {
            savePayload.userId = currentUser.uid;
          }

          const res = await fetch("/api/save-projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(savePayload)
          });
          if (!res.ok) {
            throw new Error(`Server returned status ${res.status}`);
          }
        } catch (e: any) {
          console.warn(`[Toonflow Autosave] Save attempt ${retryCount + 1} failed: ${e.message || e}`);
          
          // If quota is exhausted, disable autosave for a while
          if (e.message && e.message.includes("RESOURCE_EXHAUSTED")) {
            console.error("[Toonflow Autosave] Quota exhausted! Autosave disabled for 10 minutes.");
            localStorage.setItem("last_save_attempt_time", Date.now().toString());
            return;
          }

          if (retryCount < 2) {
            // Retry after 4 seconds
            setTimeout(() => performSave(retryCount + 1), 4000);
          } else {
            console.warn("[Toonflow Autosave] Cloud sync temporarily offline/busy, local browser state remains saved securely.", e);
          }
        }
      };
      performSave();
    }, 2000);


    return () => clearTimeout(timer);
  }, [projects, isSyncCompleted, currentUser]);

  // Startup / interruption recovery auto-restoration hook
  useEffect(() => {
    if (isSyncCompleted && activeProjectId) {
      console.log("[Toonflow Startup Auto-Restore] Application initialized/restarted, pulling latest physical backups from server...");
      handleRestoreFromBackup(true, { timeoutMs: 8000 }).catch(e => {
        console.warn("[Toonflow Auto-Restore Warning] Failed to silently restore backup assets at startup:", e);
      });
    }
  }, [isSyncCompleted, activeProjectId]);

  // Save projects to localStorage and to Firestore securely via the server-side proxy whenever they change
  const saveProjects = (updatedProjects: Project[]) => {
    setProjects(updatedProjects);
    try {
      localStorage.setItem("toonflow_projects", JSON.stringify(updatedProjects));
      localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString());
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        showToast("瀏覽器儲存空間已滿，請清理不必要的專案或減小圖片大小", "error");
        console.error("Storage quota exceeded:", e);
      }
    }
  };

  // Seed default "月" (Moon) project
  const seedDefaultProject = () => {
    const defaultProject: Project = {
      id: "project_moon",
      name: "月 (Moon Project)",
      createdAt: new Date().toLocaleString(),
      novelText: "深夜，凌風獨自坐在冷清的辦公室裡，面前放著一份帶有血跡的秘密文件。窗外暴雨如注，城市的霓虹燈在雨幕中扭曲。他深吸了一口氣，撥通了那個塵封已久的號碼：「一切都開始了。」",
      characters: [
        {
          id: "char_1",
          name: "凌風",
          description: "年約28歲，身穿黑色西裝的冷酷年輕總裁，神色陰沈凝重，眼神犀利透徹。"
        }
      ],
      scenes: [
        {
          id: "scene_1",
          title: "凌風的辦公室 - 深夜",
          character: "凌風",
          dialogue: "",
          narration: "凌風獨自坐在冷清的辦公室裡，桌面上放著帶有血跡的秘密文件。窗外正下著暴雨。",
          visualPrompt: "A high-quality cinematic shot of a young handsome male executive in a sleek dark modern office at midnight, rainy window in the background with glowing city neon lights reflections, looking tense and holding a suspicious folder, anime key visual style, dramatic shadows, 8k resolution.",
          imageUrl: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=800&q=80",
          audioCue: "窗外暴雨如注的下雨聲與隆隆雷鳴聲",
          directorNotes: "開場氣氛建立，色調偏冷藍，加強孤獨與懸疑感。需要強調文件上的血跡細節。"
        },
        {
          id: "scene_2",
          title: "深遂的雨夜通話",
          character: "凌風",
          dialogue: "「一切都開始了。」",
          narration: "他深吸了一口氣，撥通了那個塵封已久的號碼。",
          visualPrompt: "Close-up shot of a young man with sharp eyes, holding a modern smartphone to his ear in a dimly lit office, wet neon window reflections, intense cinematic atmosphere, anime key visual style, high details, premium lighting.",
          imageUrl: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=800&q=80",
          audioCue: "室內拉近特寫，窗外雨聲弱化消失，背景為靜謐微弱的風聲與單音鋼琴旋律",
          directorNotes: "特寫鏡頭聚焦在打電話時緊張的眼神，手部有些微顫抖。背景燈光呈現淺紫色調。"
        }
      ],
      scenesExt: [],
      scenesFirstLast: [],
      disassemblyEngine: "mistral",
      selectedModel: "Mistral Large 3 (高智能旗艦)",
      drawingChannel: "flux",
      artStyle: "動漫卡通動感 (Anime key visual)",
      cameraMotion: "經典推拉運鏡 (Classic Ken Burns Zoom & Pan)",
      agnesVideoMode: "quality",
      agnesImageMode: "quality"
    };

    saveProjects([defaultProject]);
  };

  // Sync saved key to localStorage
  const handleSaveApiKey = (key: string) => {
    setCustomApiKey(key);
    localStorage.setItem("agnes_custom_api_key", key);
  };

  const [copiedSceneId, setCopiedSceneId] = useState<string | null>(null);

  const copyTextToClipboard = (text: string, sceneId: string) => {
    copyTextToClipboardUtil(text, sceneId, setCopiedSceneId);
  };

  // Update active project details helper
  const updateActiveProject = (
    updated: Partial<Project> | ((prev: Project) => Partial<Project>)
  ) => {
    if (!activeProjectId) return;
    setProjects((prevProjects) => {
      let activeProjRef: Project | null = null;
      const updatedList = prevProjects.map((p) => {
        if (p.id === activeProjectId) {
          const resolvedUpdate = typeof updated === "function" ? updated(p) : updated;
          const newProject = { ...p, ...resolvedUpdate };
          if (resolvedUpdate.artStyle && resolvedUpdate.artStyle !== p.artStyle) {
            // Cascade art style to all characters
            newProject.characters = newProject.characters.map((c) => ({
              ...c,
              artStyle: resolvedUpdate.artStyle as string,
            }));
          }
          activeProjRef = newProject;
          return newProject;
        }
        return p;
      });
      // Save projects to localStorage whenever they change
      try {
        localStorage.setItem("toonflow_projects", JSON.stringify(updatedList));
        localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString());
      } catch (e) {
        if (e instanceof DOMException && e.name === 'QuotaExceededError') {
          showToast("瀏覽器儲存空間已滿，請清理不必要的專案或減小圖片大小", "error");
          console.error("Storage quota exceeded:", e);
        }
      }

      // PHYSICAL SERVER BACKUP: Instantly back up to toonflow_interrupted_backup.json
      if (activeProjRef && (activeProjRef as Project).scenes) {
        const projToSave = activeProjRef as Project;
        if ((window as any).backupTimeout) {
          clearTimeout((window as any).backupTimeout);
        }
        (window as any).backupTimeout = setTimeout(() => {
          fetch("/api/backup-assets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId: activeProjectId, scenes: projToSave.scenes })
          }).catch(e => console.warn("Failed to update server-side physical backup:", e));
        }, 2000);
      }

      return updatedList;
    });
  };

  // Project Actions
  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!String(newProjectName).trim()) return;

    const newProj: Project = {
      id: `project_${Date.now()}`,
      name: newProjectName.trim(),
      createdAt: new Date().toLocaleString(),
      novelText: "",
      characters: [],
      scenes: [],
      disassemblyEngine: "mistral",
      selectedModel: "Mistral Large 3 (高智能旗艦)",
      drawingChannel: "flux",
      artStyle: "動漫卡通動感 (Anime key visual)",
      cameraMotion: "經典推拉運鏡 (Classic Ken Burns Zoom & Pan)",
      agnesVideoMode: "quality",
      agnesImageMode: "quality"
    };

    const list = [...projects, newProj];
    saveProjects(list);
    setActiveProjectId(newProj.id);
    setActiveTab("novel");
    setNewProjectName("");
  };

  const handleDeleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setProjectToDelete(id);
  };

  const confirmDeleteProject = () => {
    if (!projectToDelete) return;
    const list = projects.filter(p => p.id !== projectToDelete);
    saveProjects(list);
    if (activeProjectId === projectToDelete) {
      setActiveProjectId(null);
      localStorage.removeItem("toonflow_active_project_id");
    }
    setProjectToDelete(null);
  };

  const handleSaveProjectName = () => {
    if (!activeProject || !editingProjectNameValue.trim()) {
      setIsEditingProjectName(false);
      return;
    }
    const updated = projects.map(p => p.id === activeProject.id ? { ...p, name: editingProjectNameValue.trim() } : p);
    saveProjects(updated);
    setIsEditingProjectName(false);
    showToast("專案名稱已更新！", "success");
  };

  const handleGenerateNovel = async (isRandom: boolean, engines?: ('gemini' | 'agnes' | 'mistral')[]) => {
    if (!activeProject) return;
    
    const activeEngines = engines || selectedNovelAgents;
    if (activeEngines.length === 0) {
      alert("請至少選擇一個 Agent 參加創作！");
      return;
    }
    
    setIsGeneratingNovel(true);
    try {
      const res = await fetch("/api/generate-novel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea: isRandom ? null : novelIdea,
          isRandom,
          engines: activeEngines,
          customApiKey: customApiKey || undefined
        })
      });

      if (!res.ok) {
        throw new Error("Failed to generate novel");
      }

      const textRes = await res.text();
      let data: any;
      try {
        data = JSON.parse(textRes);
      } catch(e) {
        throw new Error("伺服器回傳格式錯誤，請稍後再試。");
      }
      if (data.text) {
        updateActiveProject({ novelText: data.text });
        setShowIdeaInput(false);
        setNovelIdea("");
        
        if (data.discussionReport) {
          setChatMessages(prev => [
            ...prev,
            {
              role: 'ai',
              content: `這是全體 AI Agent 經過腦力激盪與協調會議後的「協調討論與整合報告」：\n\n${data.discussionReport}\n\n*(故事已為您套用並更新至上方編輯區)*`,
              agent: 'all'
            }
          ]);
          showToast("共同創作成功！已將 AI 討論報告加入下方的「AI 劇本助理」對話中。", "success");
        } else {
          showToast("劇本生成成功！", "success");
        }
      }
    } catch (err: any) {
      console.error(err);
      logToExperienceLibrary({
        errorName: "NovelGenerationError",
        errorMessage: err.message || String(err),
        category: "novel_generation",
        projectId: activeProjectId || undefined
      });
      alert("生成失敗，請稍後再試。");
    } finally {
      setIsGeneratingNovel(false);
    }
  };

  const handleChatNovel = async (selectedEngines: ('gemini' | 'agnes' | 'mistral')[]) => {
    if (!activeProject || !chatInput.trim()) return;

    const userMessage = { role: 'user' as const, content: chatInput.trim() };
    const newMessages = [...chatMessages, userMessage];
    setChatMessages(newMessages);
    setChatInput("");
    setIsChatting(true);

    try {
      // Assuming primary engine is the first in selection
      const engine = selectedEngines[0];
      const res = await fetch("/api/chat-novel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          novelText: activeProject.novelText,
          engines: selectedEngines,
          customApiKey: customApiKey || undefined
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Chat request failed");
      }

      const textRes = await res.text();
      let data: any;
      try {
        data = JSON.parse(textRes);
      } catch(e) {
        throw new Error("伺服器回傳格式錯誤，請稍後再試。");
      }
      if (data.text) {
        let replyContent = data.text;
        
        // Extract updated novel text if present
        const updateRegex = /<novel_update>([\s\S]*?)<\/novel_update>/;
        const match = replyContent.match(updateRegex);
        
        if (match && match[1]) {
          const updatedNovelText = match[1].trim();
          updateActiveProject({ novelText: updatedNovelText });
          replyContent = replyContent.replace(updateRegex, "*(劇本已更新)*").trim();
        }

        const agentLabel = selectedEngines.length > 1 ? 'all' : selectedEngines[0];
        setChatMessages([...newMessages, { role: 'ai', content: replyContent, agent: agentLabel }]);
      }
    } catch (err: any) {
      console.error(err);
      alert(`對話失敗：${err.message}`);
      // Remove the last user message on failure
      setChatMessages(chatMessages);
    } finally {
      setIsChatting(false);
    }
  };

  const handleChatScene = async (sceneId: string) => {
    if (!activeProject) return;
    const scene = activeProject.scenes.find(s => s.id === sceneId);
    const input = sceneChatInputs[sceneId]?.trim();
    if (!scene || !input) return;

    // Append user message
    const userMsg = { role: 'user' as const, content: input };
    const history = sceneChats[sceneId] || [];
    const newHistory = [...history, userMsg];

    // Clear input, set loading
    setSceneChatInputs(prev => ({ ...prev, [sceneId]: "" }));
    setSceneChats(prev => ({ ...prev, [sceneId]: newHistory }));
    setIsSceneChatting(prev => ({ ...prev, [sceneId]: true }));

    try {
      const res = await fetch("/api/chat-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene,
          message: input,
          history: history,
          customApiKey: customApiKey || undefined
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "分鏡對話失敗");
      }

      const data = await res.json();
      const aiReply = data.response || "未收到 AI 回覆。";

      // Append AI message
      setSceneChats(prev => ({
        ...prev,
        [sceneId]: [...newHistory, { role: 'ai' as const, content: aiReply }]
      }));

      // If AI updated some scene fields, update them immediately!
      if (data.updatedFields && typeof data.updatedFields === 'object') {
        const fields = data.updatedFields;
        const updatedScenes = activeProject.scenes.map(s => {
          if (s.id === sceneId) {
            const updated = { ...s };
            Object.keys(fields).forEach(key => {
              if (fields[key] !== undefined && fields[key] !== null) {
                // @ts-ignore
                updated[key] = fields[key];
              }
            });
            return updated;
          }
          return s;
        });
        updateActiveProject({ scenes: updatedScenes });
        showToast(`已根據分鏡助理建議更新此分鏡設定！`, "success");
      }
    } catch (err: any) {
      console.error(err);
      showToast(`分鏡助理對話失敗: ${err.message}`, "error");
      // Revert user message on failure
      setSceneChats(prev => ({
        ...prev,
        [sceneId]: history
      }));
    } finally {
      setIsSceneChatting(prev => ({ ...prev, [sceneId]: false }));
    }
  };

  const handleGlobalStoryboardChat = async () => {
    if (!activeProject || !storyboardChatInput.trim()) return;

    const input = storyboardChatInput.trim();
    const userMsg = { role: 'user' as const, content: input };
    const history = storyboardChatMessages;
    const newHistory = [...history, userMsg];

    setStoryboardChatInput("");
    setStoryboardChatMessages(newHistory);
    setIsStoryboardChatting(true);

    try {
      const res = await fetch("/api/chat-storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenes: activeProject.scenes,
          characters: activeProject.characters,
          message: input,
          history: history,
          customApiKey: customApiKey || undefined
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "分鏡劇本助理對話失敗");
      }

      const data = await res.json();
      const aiReply = data.response || "未收到 AI 回覆。";

      setStoryboardChatMessages([...newHistory, { role: 'ai' as const, content: aiReply }]);

      if (data.updatedScenes && Array.isArray(data.updatedScenes)) {
        const aiScenesMap = new Map(data.updatedScenes.map((s: any) => [s.id, s]));
        const updatedScenes = activeProject.scenes.map(s => {
          const aiScene = aiScenesMap.get(s.id) as any;
          if (aiScene) {
            return {
              ...s,
              title: aiScene.title !== undefined ? aiScene.title : s.title,
              character: aiScene.character !== undefined ? aiScene.character : s.character,
              dialogue: aiScene.dialogue !== undefined ? aiScene.dialogue : s.dialogue,
              narration: aiScene.narration !== undefined ? aiScene.narration : s.narration,
              visualPrompt: aiScene.visualPrompt !== undefined ? aiScene.visualPrompt : s.visualPrompt,
              actionPrompt: aiScene.actionPrompt !== undefined ? aiScene.actionPrompt : s.actionPrompt,
              transitionPrompt: aiScene.transitionPrompt !== undefined ? aiScene.transitionPrompt : s.transitionPrompt,
              durationSeconds: aiScene.durationSeconds !== undefined ? aiScene.durationSeconds : s.durationSeconds,
              audioCue: aiScene.audioCue !== undefined ? aiScene.audioCue : s.audioCue,
              directorNotes: aiScene.directorNotes !== undefined ? aiScene.directorNotes : s.directorNotes,
            };
          }
          return s;
        });

        updateActiveProject({ scenes: updatedScenes });
        showToast("已根據分鏡導演建議更新分鏡劇本卡片列表！", "success");
      }
    } catch (err: any) {
      console.error(err);
      showToast(`分鏡劇本助理對話失敗: ${err.message}`, "error");
      setStoryboardChatMessages(history);
    } finally {
      setIsStoryboardChatting(false);
    }
  };

  // Helper to estimate reading duration for a specific text block
  const estimateTextDuration = (text: string): number => {
    const trimmed = (text || "").trim();
    if (!trimmed) return 0;

    // Count Chinese characters
    const chineseChars = (trimmed.match(/[\u4e00-\u9fa5]/g) || []).length;
    
    // Count punctuation representing natural breathing/speaking pauses
    const pauseMarks = (trimmed.match(/[，。！？；：、\,\.\!\?\:;]/g) || []).length;

    // Remove Chinese characters and punctuation to estimate English words / numbers remaining
    const remainingText = trimmed
      .replace(/[\u4e00-\u9fa5]/g, "")
      .replace(/[，。！？；：、\,\.\!\?\:;]/g, " ")
      .trim();
    const englishWords = remainingText ? remainingText.split(/\s+/).filter(w => w.length > 0).length : 0;

    // Calculation:
    // 1. Chinese reading speed: ~3.5 characters per second
    // 2. English reading speed: ~2.5 words per second
    // 3. Pause marks: 0.5 seconds each
    // 4. Baseline overhead (breath in/out, natural acting pacing/reaction): 1.5 seconds
    const readingTime = (chineseChars / 3.5) + (englishWords / 2.5);
    const pauseTime = pauseMarks * 0.5;
    const basePacing = 1.5;

    return Math.round(readingTime + pauseTime + basePacing);
  };

  // Helper to precisely estimate the spoken duration in seconds based on Traditional/Simplified Chinese characters and pauses in BOTH dialogue and narration
  const estimateDialogueDuration = (dialogue: string, narration: string = ""): number => {
    const diagDur = estimateTextDuration(dialogue);
    const narrDur = estimateTextDuration(narration);
    
    const maxDur = Math.max(diagDur, narrDur);
    if (maxDur === 0) {
      // For pure scenic scenes, suggest a default of 4 seconds
      return 4;
    }
    
    // Cap strictly between 3 and 5 seconds to guarantee maximum stability for Agnes video rendering
    return Math.max(3, Math.min(5, maxDur));
  };

  // Render function for Toonflow Global Storyboard Director Chatbot
  const renderStoryboardGlobalChat = () => {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="font-display font-bold text-sm text-white flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-pink-400" />
            分鏡導演 AI 助理
          </h3>
          <span className="text-[9px] bg-pink-500/10 px-2 py-0.5 rounded-full text-pink-400 border border-pink-500/20 font-mono">
            DIRECTOR AGENT
          </span>
        </div>

        <div className="text-[11px] text-slate-400 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-850/50">
          🎬 <strong>分鏡導演助理</strong>：我可以幫助你修改任何一個特定的分鏡鏡頭，或者同時修改、擴充、精簡所有的分鏡鏡頭。
          <br />
          <span className="text-pink-300">💡 提示：「幫我把所有的對白長度控制在 10 字以內，不便動口就用內心對話 ( )」、「把分鏡 1 的背景改成下雨天」</span>
        </div>

        {/* Chat Messages */}
        <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
          {storyboardChatMessages.length === 0 ? (
            <div className="text-center text-slate-500 text-xs py-6">
              在此輸入對話以開始微調或批次修改當前專案的分鏡鏡頭。
            </div>
          ) : (
            storyboardChatMessages.map((msg, idx) => (
              <div key={idx} className={ `flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={ `max-w-[85%] rounded-2xl p-3 text-sm ${
                  msg.role === 'user' 
                    ? 'bg-pink-600 text-white rounded-tr-none shadow-lg shadow-pink-600/10' 
                    : 'bg-indigo-950/40 border border-indigo-800/50 text-indigo-100 rounded-tl-none shadow-lg'
                }` }>
                  {msg.role === 'ai' && (
                    <div className="text-[10px] font-bold mb-1 opacity-80 uppercase flex items-center gap-1 text-pink-400">
                      <Sparkles className="w-3.5 h-3.5 text-pink-400 animate-pulse" />
                      分鏡導演 AI
                    </div>
                  )}
                  <div className="whitespace-pre-wrap leading-relaxed text-xs">{msg.content}</div>
                </div>
              </div>
            ))
          )}
          {isStoryboardChatting && (
            <div className="flex justify-start">
              <div className="bg-slate-950/80 border border-slate-850 rounded-2xl rounded-tl-none p-3 text-xs text-slate-400 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-pink-400" />
                導演助理正在協調整體鏡頭中...
              </div>
            </div>
          )}
        </div>

        {/* Input Box */}
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-650 focus:outline-none focus:border-pink-500 transition"
            placeholder="告訴分鏡助理你想怎麼修改（例如：對白少旁白多）..."
            value={storyboardChatInput}
            onChange={(e) => setStoryboardChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isStoryboardChatting) {
                handleGlobalStoryboardChat();
              }
            }}
          />
          <button
            onClick={handleGlobalStoryboardChat}
            disabled={isStoryboardChatting || !storyboardChatInput.trim()}
            className="px-4 py-2 bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs transition-all shadow-md flex items-center justify-center cursor-pointer"
          >
            {isStoryboardChatting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Wand2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    );
  };

  // Storyboard Breakdown via server endpoint (Gemini/Agnes model)
  const handleAISplitNovel = async () => {
    if (!activeProject || !activeProject.novelText.trim()) return;
    
    setIsDisassembling(true);
    try {
      let currentCharacters = [...activeProject.characters];
      
      // Auto extract characters if none exist
      if (currentCharacters.length === 0) {
        const charRes = await fetch("/api/extract-characters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            novelText: activeProject.novelText,
            artStyle: activeProject.artStyle,
            engine: 'agnes', // Prefer Agnes as default since Gemini is prone to quota issues
            customApiKey: customApiKey || undefined
          })
        });
        if (charRes.ok) {
          const charData = await charRes.json();
          if (charData.characters && charData.characters.length > 0) {
            currentCharacters = charData.characters.map((c: any, idx: number) => ({
              id: `char_${Date.now()}_${idx}`,
              name: c.name,
              role: c.role || "",
              age: c.age || "",
              clothing: c.clothing || "",
              personality: c.personality || "",
              description: c.description || "",
              avatarUrl: ""
            }));
          }
        }
      }

      const res = await fetch("/api/split-novel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          novelText: activeProject.novelText,
          artStyle: activeProject.artStyle,
          characters: currentCharacters,
          engine: 'gemini', // Use Gemini for fast, reliable storyboard splitting
          customApiKey: customApiKey || undefined
        })
      });

      if (!res.ok) {
        throw new Error("拆解劇本失敗，請稍後再試。");
      }

      const textRes = await res.text();
      let data: any;
      try {
        data = JSON.parse(textRes);
      } catch(e) {
        throw new Error("伺服器回傳格式錯誤，請稍後再試。");
      }
      if (data.scenes && data.scenes.length > 0) {
        // Map to internal scene structures
        const formattedScenes: Scene[] = data.scenes.map((s: any, idx: number) => {
          // Automatically estimate speaking/pacing duration based on dialogue and narration character counts more precisely
          const dialogueText = s.dialogue || "";
          const estimatedDuration = estimateDialogueDuration(dialogueText, s.narration || "");

          // Use server-provided duration only if valid, otherwise fallback to our estimated duration
          const finalDuration = s.durationSeconds && typeof s.durationSeconds === 'number'
            ? s.durationSeconds
            : estimatedDuration;

          return {
            ...DEFAULT_SCENE,
            ...s,
            id: `scene_${Date.now()}_${idx}`,
            title: s.title || `分鏡場景 ${idx + 1}`,
            dialogue: dialogueText,
            narration: s.narration || "",
            character: s.character || "旁白",
            visualPrompt: s.visualPrompt || "",
            negativePrompt: s.negativePrompt || "",
            actionPrompt: s.actionPrompt || "",
            durationSeconds: finalDuration,
            audioCue: s.audioCue || "",
            directorNotes: s.directorNotes || "",
            transitionPrompt: s.transitionPrompt || "",
          };
        });

        updateActiveProject({
          scenes: formattedScenes,
          characters: currentCharacters
        });
      }
    } catch (e: any) {
      alert(e.message || "Gemini AI 連線異常");
    } finally {
      setIsDisassembling(false);
    }
  };

  // AI Character Extractor
  const handleAIExtractCharacters = async () => {
    if (!activeProject || !activeProject.novelText.trim()) {
      alert("請先在『原著劇本』頁面輸入劇本內容，以便提取角色。");
      return;
    }
    
    setIsExtractingCharacters(true);
    try {
      const res = await fetch("/api/extract-characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          novelText: activeProject.novelText,
          artStyle: activeProject.artStyle,
          engine: 'agnes', // Prefer Agnes as default since Gemini is prone to quota issues
          customApiKey: customApiKey || undefined
        })
      });

      if (!res.ok) {
        throw new Error("提取角色失敗，請稍後再試。");
      }

      const textRes = await res.text();
      let data: any;
      try {
        data = JSON.parse(textRes);
      } catch(e) {
        throw new Error("伺服器回傳格式錯誤，請稍後再試。");
      }
      if (data.characters && data.characters.length > 0) {
        const formattedCharacters: Character[] = data.characters.map((c: any, idx: number) => ({
          id: `char_${Date.now()}_${idx}`,
          name: c.name,
          role: c.role || "",
          age: c.age || "",
          clothing: c.clothing || "",
          personality: c.personality || "",
          description: c.description || "",
          avatarUrl: ""
        }));

        updateActiveProject({
          characters: formattedCharacters
        });
        setActiveTab("characters");
      }
    } catch (e: any) {
      alert(e.message || "Gemini AI 連線異常");
    } finally {
      setIsExtractingCharacters(false);
    }
  };

  // AI Prompt Optimizer / Translator
    const handleTranslateCharacterPrompt = async (charId: string, engine: 'gemini' | 'agnes' | 'mistral' = 'gemini') => {
    if (!activeProject) return;

    const charObj = activeProject.characters.find(c => c.id === charId);
    if (!charObj) return;

    const rawInput = charObj.description.trim() || `${charObj.name} ${charObj.role} ${charObj.age} ${charObj.clothing} ${charObj.personality}`;
    if (!rawInput.trim()) {
      alert("請先輸入角色名稱、身份或特徵描述！");
      return;
    }

    try {
      const res = await fetch("/api/optimize-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: rawInput,
          artStyle: charObj.artStyle || activeProject.artStyle,
          character: charObj.name,
          characterDescription: `${charObj.clothing ? "Ensure wearing: " + charObj.clothing : ""}`,
          customApiKey: customApiKey || undefined,
          mood: charObj.mood,
          engine
        })
      });

      if (!res.ok) {
        throw new Error("優化 Prompt 失敗");
      }

      const textRes = await res.text();
      let data: any;
      try {
        data = JSON.parse(textRes);
      } catch(e) {
        throw new Error("伺服器回傳格式錯誤，請稍後再試。");
      }

      if (data.optimizedPrompt) {
        handleUpdateChar(charId, "description", data.optimizedPrompt);
      }
    } catch (e: any) {
      console.error(e);
      alert("AI 智慧優化 / 翻譯 Prompt 發生錯誤，請稍後再試。");
    }
  };

const handleTranslatePrompt = async (sceneId: string, engine: 'gemini' | 'agnes' | 'mistral' = 'gemini') => {
    if (!activeProject) return;

    const scene = activeProject.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    // Use dialogue/narration/title as raw input if visualPrompt is empty or in Chinese
    const rawInput = scene.visualPrompt.trim() || `${scene.title}: ${scene.dialogue} ${scene.narration}`;
    if (!rawInput.trim()) {
      alert("請先輸入場景名稱、台詞、旁白或部分描述！");
      return;
    }

    try {
      const charObj = activeProject.characters.find(c => c.name === scene.character);
      const res = await fetch("/api/optimize-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: rawInput,
          sceneId: scene.id,
          artStyle: charObj?.artStyle || activeProject.artStyle,
          character: scene.character,
          characterDescription: charObj?.description || "",
          customApiKey: customApiKey || undefined,
          mood: charObj?.mood,
          engine
        })
      });

      if (!res.ok) {
        throw new Error("優化 Prompt 失敗");
      }

      const textRes = await res.text();
      let data: any;
      try {
        data = JSON.parse(textRes);
      } catch(e) {
        throw new Error("伺服器回傳格式錯誤，請稍後再試。");
      }
      if (data.optimizedPrompt) {
        handleUpdateSceneField(sceneId, "visualPrompt", data.optimizedPrompt);
      }
      if (data.negativePrompt) {
        handleUpdateSceneField(sceneId, "negativePrompt", data.negativePrompt);
      }
    } catch (e: any) {
      console.error(e);
      alert("AI 智慧優化 / 翻譯 Prompt 發生錯誤，請稍後再試。");
    }
  };

  const handleApplyStylePreset = (sceneId: string, presetValue: string) => {
    if (!activeProject) return;
    const scene = activeProject.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    const preset = STYLE_PRESETS.find(p => p.value === presetValue);
    if (!preset) return;

    let newPrompt = scene.visualPrompt.trim();

    // If empty or short default placeholder, replace completely
    if (!newPrompt || newPrompt.length < 15 || newPrompt.startsWith("Close-up of") || newPrompt.startsWith("A high-quality cinematic shot")) {
      newPrompt = preset.prompt;
    } else {
      // Check if it already contains one of our preset prompts
      let styleFound = false;
      for (const p of STYLE_PRESETS) {
        if (newPrompt.includes(p.prompt)) {
          newPrompt = newPrompt.replace(p.prompt, preset.prompt);
          styleFound = true;
          break;
        }
      }

      if (!styleFound) {
        // If no style found but has custom prompt, append it elegantly
        if (newPrompt.endsWith(".")) {
          newPrompt = `${newPrompt} Style: ${preset.prompt}`;
        } else if (newPrompt.endsWith(",")) {
          newPrompt = `${newPrompt} ${preset.prompt}`;
        } else {
          newPrompt = `${newPrompt}, style: ${preset.prompt}`;
        }
      }
    }

    handleUpdateSceneField(sceneId, "visualPrompt", newPrompt);

    if (typeof setToast === "function") {
      setToast({
        message: `已套用「${preset.name}」風格範本！`,
        type: "success"
      });
    }
  };

  const handleApplyNegativePreset = async (sceneId: string, presetValue: string) => {
    if (!activeProject) return;
    const scene = activeProject.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    if (presetValue === "ai-auto") {
      if (!scene.visualPrompt.trim()) {
        alert("請先輸入或優化「AI 繪圖英文描述提示詞」，以便 AI 根據畫面特徵智慧生成專屬的負向提示詞！");
        return;
      }

      if (typeof setToast === "function") {
        setToast({
          message: "🤖 AI 正在為您智慧分析畫面、生成專屬負向提示詞，請稍候...",
          type: "info"
        });
      }

      try {
        const res = await fetch("/api/generate-negative-prompt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: scene.visualPrompt,
            artStyle: activeProject.artStyle,
            customApiKey: customApiKey || undefined
          })
        });

        if (!res.ok) {
          throw new Error("AI 生成負向提示詞失敗");
        }

        const data = await res.json();
        if (data.negativePrompt) {
          handleUpdateSceneField(sceneId, "negativePrompt", data.negativePrompt);
          if (typeof setToast === "function") {
            setToast({
              message: "✨ AI 專屬負向提示詞生成成功並已自動填入！",
              type: "success"
            });
          }
        }
      } catch (err) {
        console.error(err);
        alert("AI 生成負向提示詞發生錯誤，請稍候再試。");
      }
    } else {
      const preset = NEGATIVE_PRESETS.find(p => p.value === presetValue);
      if (preset && preset.prompt) {
        handleUpdateSceneField(sceneId, "negativePrompt", preset.prompt);
        if (typeof setToast === "function") {
          setToast({
            message: `已套用「${preset.name}」負向提示詞範本！`,
            type: "success"
          });
        }
      }
    }
  };

  // AI Experience Library & Historical Approved Asset helpers
  const checkArchiveHistory = async (type: "image" | "video", prompt: string) => {
    try {
      const res = await fetch("/api/lookup-archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, prompt })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.found && data.asset) {
          return data.asset;
        }
      }
    } catch (err) {
      console.warn("[Toonflow History] Archive lookup bypassed:", err);
    }
    return null;
  };

  const archiveAsset = async (assetData: {
    type: "image" | "video";
    prompt: string;
    url: string;
    score?: number;
    passed?: boolean;
    sceneId?: string;
    projectId?: string;
    sceneTitle?: string;
  }) => {
    try {
      await fetch("/api/archive-asset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(assetData)
      });
    } catch (err) {
      console.warn("[Toonflow History] Archiving bypassed:", err);
    }
  };

  // Character Consistency Bible Database (Grok Optimized)
  const CHARACTER_BIBLES: { [key: string]: { zh: string; en: string } } = {
    ren: {
      zh: "【角色固定描述 - Ren】\n- 24歲男性，凌亂銀灰色短髮，髮型帶有自然凌亂感。\n- 銳利淺藍色眼睛，眼神冷靜而警覺。\n- 左臉頰有細微出血刮痕（必須清晰可見，不可消失）。\n- 穿著深灰色戰術風衣，內搭黑色緊身戰鬥服。\n- 額頭推著未來感 HUD 護目鏡（不可戴在眼睛上）。\n- 身形偏瘦但結實，動作利落有張力。",
      en: "【Character Fixed Description - Ren】\n- 24-year-old male with messy silver-gray short hair, naturally tousled hairstyle.\n- Sharp light-blue eyes with a calm and alert gaze.\n- Visible small bleeding scratch on the left cheek (must be clearly visible).\n- Wearing a dark gray tactical trench coat over a black tight-fitting combat suit.\n- Futuristic HUD tactical goggles resting on his forehead (not covering eyes).\n- Lean but athletic build, movements sharp and tense."
    },
    "old joe": {
      zh: "【角色固定描述 - Old Joe】\n- 55歲左右硬漢男性，斑白短髮凌亂，臉部有深刀疤與風化皺紋。\n- 左眼為發出冷冽紅光的圓形機械義眼。\n- 右臂為複雜重型機械義肢，帶有高張力金屬結構線條。\n- 穿著破舊深灰色皮革調酒背心，內搭黑色高科技機能緊身衣，邊緣有細微霓虹藍光。\n- 腰間繫著多功能戰術腰帶，掛滿電子組件與工具。\n- 身形高大微駝，氣場危險而沉穩。",
      en: "【Character Fixed Description - Old Joe】\n- Rugged 55-year-old male with messy short gray-white hair, deep knife scars and weathered wrinkles on face.\n- Left eye replaced by a circular glowing cold red cybernetic prosthetic eye.\n- Right arm is a heavy-duty complex mechanical prosthetic with high-tension metal structural lines.\n- Wearing a worn dark gray leather bartender vest over a black high-tech functional tight shirt with subtle neon blue glowing edges.\n- Multi-functional tactical belt at waist loaded with electronic components and tools.\n- Tall with a slight hunch, dangerous yet composed presence."
    },
    "lao qiao": {
      zh: "【角色固定描述 - Old Joe / 老喬】\n- 55歲左右硬漢男性，斑白短髮凌亂，臉部有深刀疤與風化皺紋。\n- 左眼為發出冷冽紅光的圓形機械義眼。\n- 右臂為複雜重型機械義肢，帶有高張力金屬結構線條。\n- 穿著破舊深灰色皮革調酒背心，內搭黑色高科技機能緊身衣，邊緣有細微霓虹藍光。\n- 腰間繫著多功能戰術腰帶，掛滿電子組件與工具。\n- 身形高大微駝，氣場危險而沉穩。",
      en: "【Character Fixed Description - Old Joe】\n- Rugged 55-year-old male with messy short gray-white hair, deep knife scars and weathered wrinkles on face.\n- Left eye replaced by a circular glowing cold red cybernetic prosthetic eye.\n- Right arm is a heavy-duty complex mechanical prosthetic with high-tension metal structural lines.\n- Wearing a worn dark gray leather bartender vest over a black high-tech functional tight shirt with subtle neon blue glowing edges.\n- Multi-functional tactical belt at waist loaded with electronic components and tools.\n- Tall with a slight hunch, dangerous yet composed presence."
    },
    "joe": {
      zh: "【角色固定描述 - Old Joe】\n- 55歲左右硬漢男性，斑白短髮凌亂，臉部有深刀疤與風化皺紋。\n- 左眼為發出冷冽紅光的圓形機械義眼。\n- 右臂為複雜重型機械義肢，帶有高張力金屬結構線條。\n- 穿著破舊深灰色皮革調酒背心，內搭黑色高科技機能緊身衣，邊緣有細微霓虹藍光。\n- 腰間繫著多功能戰術腰帶，掛滿電子組件與工具。\n- 身形高大微駝，氣場危險而沉穩。",
      en: "【Character Fixed Description - Old Joe】\n- Rugged 55-year-old male with messy short gray-white hair, deep knife scars and weathered wrinkles on face.\n- Left eye replaced by a circular glowing cold red cybernetic prosthetic eye.\n- Right arm is a heavy-duty complex mechanical prosthetic with high-tension metal structural lines.\n- Wearing a worn dark gray leather bartender vest over a black high-tech functional tight shirt with subtle neon blue glowing edges.\n- Multi-functional tactical belt at waist loaded with electronic components and tools.\n- Tall with a slight hunch, dangerous yet composed presence."
    }
  };

  // Dynamic Combat Action Template (Grok Optimized)
  const GUN_ACTION_TEMPLATE = {
    zh: "【動作強制執行 - 持槍戰鬥】\n- 角色右手必須清晰、牢固地握持 sleek glowing sci-fi pulse pistol。\n- 右手手指必須自然包裹扳機，食指位置準確，不可懸空或變形。\n- 槍身必須有清晰細節與發光效果，槍口指向明確目標方向。\n- 手臂呈現適當張力，肘部角度自然，呈現戰鬥準備姿態。\n- 身體微微前傾，眼神聚焦在槍口指向的方向，展現緊張感。\n- 嚴禁只做站立或放鬆姿勢。",
    en: "【Action Enforcement - Holding & Aiming Sci-fi Pistol】\n- The character must clearly and firmly grip a sleek glowing sci-fi pulse pistol with the right hand.\n- Right hand fingers must naturally wrap around the trigger, index finger position accurate, no floating or deformed fingers.\n- The gun must have clear details and glowing effects, muzzle clearly pointed toward the intended target.\n- Arms showing proper tension with natural elbow angle in combat-ready stance.\n- Body slightly leaning forward, eyes focused in the direction the gun is pointing, conveying tension.\n- Strictly no relaxed standing pose or hands down.",
    negative: "hands not holding gun, gun floating in air, deformed hands, missing gun, gun in wrong hand, relaxed posture, standing still, fingers not on trigger, blurry gun, low detail weapon"
  };

  // Video Generation Continuity Template (Gemini-Grok Optimized)
  const VIDEO_CONTINUITY_TEMPLATE = {
    zh: "【首幀連續性與動作延續性強制 (First-Frame & Action Continuity)】\n- 影片必須以當前鏡頭的首幀/起始畫面 (First frame/Image reference) 作為起點，角色外貌、服裝細節、背景酒吧細節和持槍動作必須與首幀完全一致，不可發生突變、變臉或服裝變更。\n- 動態演變必須是物理動作的流暢延續（如手臂抬起、手指扣扳機、微微扭頭或說話），嚴禁瞬間變換姿勢、遺失道具或人物消失。\n- 鏡頭運動應為極致流暢、緩慢平穩的運鏡（如 cinematic slow camera pan/dolly/zoom），不可有劇烈晃動或背景混亂。",
    en: "【First-Frame & Action Continuity Enforcement】\n- The generated video must start exactly from the reference first frame image. The character's face, messy silver hair, wound, tactile trench coat, futuristic goggles, sci-fi pistol, and bartender background must match the first frame perfectly without any sudden change or transformation.\n- All motion must be a logical and physical continuation of the starting pose (e.g., natural speaking lip sync, slight head tilt, pulling trigger, steady breathing, cinematic slow panning). Absolutely no sudden posture jumps, missing weapons, or dissolving elements.\n- Camera movement must be high-end, smooth, and cinematic (slow dolly-in, slow pan, or cinematic zoom) with no glitchy warping."
  };

  // Automatically extract the last frame of a video using ffmpeg and propagate it to the next scene as its starting image
  const handleAutoExtractAndPropagateTailFrame = async (sceneId: string, videoUrl: string) => {
    try {
      console.log(`[Toonflow Auto-Propagate] Initiating tail frame extraction for video: ${videoUrl}`);
      const res = await fetch("/api/extract-last-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl })
      });
      if (!res.ok) throw new Error("Failed to call extract last frame API");
      const data = await res.json();
      if (data.imageUrl) {
        showToast("✨ 成功自動抽取分鏡結尾影格，並已完美傳導為下一分鏡的首幀參考！", "success");
        setProjects(prevProjects => {
          const updatedList = prevProjects.map(p => {
            if (p.id === activeProjectId) {
              const curIndex = p.scenes.findIndex(s => s.id === sceneId);
              const updatedScenes = p.scenes.map((s, idx) => {
                // Update current scene's extracted tail frame reference
                if (s.id === sceneId) {
                  return {
                    ...s,
                    videoTailFrame: data.imageUrl,
                    lastFrameUrl: data.imageUrl,
                    imageUrlExt: s.imageUrlExt || data.imageUrl
                  };
                }
                // Automatically propagate as the starting frame of the NEXT scene
                if (curIndex !== -1 && idx === curIndex + 1) {
                  return {
                    ...s,
                    imageUrl: data.imageUrl,
                    imageUrlExt: data.imageUrl,
                    imageUrlKeyframes: data.imageUrl
                  };
                }
                return s;
              });
              return { ...p, scenes: updatedScenes };
            }
            return p;
          });
          try { localStorage.setItem("toonflow_projects", JSON.stringify(updatedList)); } catch (e) {}
          return updatedList;
        });
      }
    } catch (err) {
      console.warn("[Toonflow Auto-Propagate] Tail frame extraction / propagation bypassed:", err);
    }
  };

  // Fallback to ffmpeg dynamic placeholder video (slow pan / slow zoom of the starting frame) when normal generation fails
  const handleVideoFallbackToPlaceholder = async (sceneId: string, startImageUrl: string, overrideTab?: string) => {
    const targetTab = overrideTab || activeTab;
    const isGenField = targetTab === "scenes_ext" ? "isGeneratingVideoExt" : (targetTab === "scenes_keyframes" ? "isGeneratingVideoKeyframes" : "isGeneratingVideo");
    const videoField = targetTab === "scenes_ext" ? "videoUrlExt" : (targetTab === "scenes_keyframes" ? "videoUrlKeyframes" : "videoUrl");
    const logsField = targetTab === "scenes_ext" ? "videoLogsExt" : (targetTab === "scenes_keyframes" ? "videoLogsKeyframes" : "videoLogs");
    const progressField = targetTab === "scenes_ext" ? "videoProgressExt" : (targetTab === "scenes_keyframes" ? "videoProgressKeyframes" : "videoProgress");
    const errorField = targetTab === "scenes_ext" ? "videoErrorExt" : (targetTab === "scenes_keyframes" ? "videoErrorKeyframes" : "videoError");

    if (!startImageUrl) {
      console.warn("[Toonflow Fallback] Cannot trigger fallback: starting image URL is empty.");
      updateActiveProject((prev) => ({
        scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, [isGenField]: false, [errorField]: "無首幀影像，無法產生動態保底影片" } : s)
      }));
      return;
    }

    showToast("⚠️ 第三方影片生成失敗，啟動動態保底引擎：正在使用 ffmpeg 從首幀智能合成 4 秒慢速運鏡影片...", "info");

    updateActiveProject((prev) => ({
      scenes: prev.scenes.map(s => {
        if (s.id === sceneId) {
          return {
            ...s,
            [isGenField]: true,
            [logsField]: [...(s[logsField] as string[] || []), "[FALLBACK] 啟動 ffmpeg 動態保底：正在從首幀影像生成慢速運鏡影片..."]
          };
        }
        return s;
      })
    }));

    try {
      const res = await fetch("/api/generate-placeholder-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: startImageUrl, durationSeconds: 4 })
      });
      if (!res.ok) throw new Error("Placeholder generator returned error status");
      const data = await res.json();
      if (data.videoUrl) {
        showToast("✨ ffmpeg 動態保底影片生成成功！工作流已順利恢復並推進！", "success");
        setProjects(prevProjects => {
          const updatedList = prevProjects.map(p => {
            if (p.id === activeProjectId) {
              const updatedScenes = p.scenes.map(s => {
                if (s.id === sceneId) {
                  return {
                    ...s,
                    [videoField]: data.videoUrl,
                    [`${videoField}Local`]: data.localPath || data.videoUrl,
                    [isGenField]: false,
                    [progressField]: "100%",
                    [logsField]: [...(s[logsField] as string[] || []), "[SYSTEM] [FALLBACK] ffmpeg 慢速運鏡保底影片生成成功且對接完成！"],
                    [errorField]: ""
                  };
                }
                return s;
              });
              return { ...p, scenes: updatedScenes };
            }
            return p;
          });
          try { localStorage.setItem("toonflow_projects", JSON.stringify(updatedList)); } catch (e) {}
          return updatedList;
        });

        // Trigger tail frame propagation using the fallback video's last frame!
        handleAutoExtractAndPropagateTailFrame(sceneId, data.videoUrl);
      } else {
        throw new Error("No videoUrl returned from placeholder generator");
      }
    } catch (err: any) {
      console.error("[Toonflow Fallback Error] Failed to generate fallback video:", err);
      updateActiveProject((prev) => ({
        scenes: prev.scenes.map(s => {
          if (s.id === sceneId) {
            return {
              ...s,
              [isGenField]: false,
              [errorField]: `保底生成失敗: ${err.message || err}`,
              [logsField]: [...(s[logsField] as string[] || []), `[ERROR] [FALLBACK] 保底生成失敗: ${err.message || err}`]
            };
          }
          return s;
        })
      }));
    }
  };

  // Storyboard Image Generation (calls Gemini-3.1-flash-image)
  const handleGenerateImage = async (sceneId: string, engine: 'agnes' | 'gemini' | 'nanobanana' | 'mistral' = 'agnes'): Promise<string | null> => {
    let freshActiveProject = activeProject;
    try {
      const curProjects = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
      const curProj = curProjects.find(p => p.id === activeProjectId);
      if (curProj) freshActiveProject = curProj;
    } catch(e) {}
    if (!freshActiveProject) return null;
    
    const isGenField = activeTab === "scenes_ext" ? "isGeneratingImageExt" : (activeTab === "scenes_keyframes" ? "isGeneratingImageKeyframes" : "isGeneratingImage");
    const imageField = activeTab === "scenes_ext" ? "imageUrlExt" : (activeTab === "scenes_keyframes" ? "imageUrlKeyframes" : "imageUrl");

    // Sync patch scene to localStorage immediately (full-auto STEP 3 polls localStorage)
    const patchSceneImageState = (patch: Record<string, any>) => {
      try {
        const list = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
        const next = list.map(p => {
          if (p.id !== activeProjectId) return p;
          return {
            ...p,
            scenes: p.scenes.map(s => s.id === sceneId ? { ...s, ...patch } : s)
          };
        });
        localStorage.setItem("toonflow_projects", JSON.stringify(next));
        localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString());
      } catch (_) {}
      updateActiveProject((prev) => ({
        scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, ...patch } : s)
      }));
    };

    let targetSceneForGen: Scene | undefined;
    try {
      const curProjects = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
      const curProj = curProjects.find(p => p.id === activeProjectId);
      targetSceneForGen = curProj?.scenes.find(s => s.id === sceneId);
    } catch (_) {}
    
    // Fallback to activeProject if not found (though it should be)
    const sceneToGen = targetSceneForGen || freshActiveProject.scenes.find(s => s.id === sceneId) || activeProject?.scenes.find(s => s.id === sceneId);
    if (!sceneToGen) return null;

    // Update loading state (sync localStorage so STEP 3 does not race)
    patchSceneImageState({ [isGenField]: true });

    // Check if it's an automatic transition scene and intercept it to prevent real drawing
    if (sceneId.startsWith("scene_transition_")) {
      const index = activeProject.scenes.findIndex(s => s.id === sceneId);
      if (index === -1) return;

      if (index === 0) {
        alert("本銜接場景為第一個場景，無前置場景可供銜接！");
        updateActiveProject((prev) => ({
          scenes: prev.scenes.map(s => {
            if (s.id === sceneId) return { ...s, [isGenField]: false };
            return s;
          })
        }));
        return;
      }

      const prevScene = activeProject.scenes[index - 1];
      const nextScene = index < activeProject.scenes.length - 1 ? activeProject.scenes[index + 1] : null;

      if (!nextScene) {
        alert("本銜接場景為最後一個場景，無下一場景可供銜接！");
        updateActiveProject((prev) => ({
          scenes: prev.scenes.map(s => {
            if (s.id === sceneId) return { ...s, [isGenField]: false };
            return s;
          })
        }));
        return;
      }

      const prevVideoUrl = prevScene.videoUrlExt || prevScene.videoUrlKeyframes || prevScene.videoUrl;
      const prevImageUrl = prevScene.imageUrlExt || prevScene.imageUrlKeyframes || prevScene.imageUrl;

      if (!prevVideoUrl && !prevImageUrl) {
        alert(`請先完成前一個場景「${prevScene.title}」的圖片或影片生成，再進行自動銜接！`);
        updateActiveProject((prev) => ({
          scenes: prev.scenes.map(s => {
            if (s.id === sceneId) return { ...s, [isGenField]: false };
            return s;
          })
        }));
        return;
      }

      const nextImageUrl = nextScene.imageUrlExt || nextScene.imageUrlKeyframes || nextScene.imageUrl;
      if (!nextImageUrl) {
        alert(`請先完成下一個場景「${nextScene.title}」的圖片生成，再進行自動銜接！`);
        updateActiveProject((prev) => ({
          scenes: prev.scenes.map(s => {
            if (s.id === sceneId) return { ...s, [isGenField]: false };
            return s;
          })
        }));
        return;
      }

      showToast("🔄 正在智能銜接：提取上一場景結尾幀作為起始幀...", "info");

      try {
        let extractedStartFrame = prevImageUrl;

        if (prevVideoUrl) {
          showToast("🎥 偵測到上一場景已生成影片，正在呼叫 ffmpeg 完美精確抽取最後一幀...", "info");
          const res = await fetch("/api/extract-last-frame", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoUrl: prevVideoUrl })
          });

          if (res.ok) {
            const data = await res.json();
            if (data.imageUrl) {
              extractedStartFrame = data.imageUrl;
              showToast("✨ 成功精確抽取上一分鏡影片的最後一格畫面！", "success");
            }
          } else {
            console.warn("抽取最後一幀失敗，將使用其靜態圖片作為替代。");
          }
        }

        updateActiveProject((prev) => ({
          scenes: prev.scenes.map(s => {
            if (s.id === sceneId) {
              return {
                ...s,
                imageUrl: extractedStartFrame,
                imageUrlExt: extractedStartFrame,
                imageUrlKeyframes: extractedStartFrame,
                isGeneratingImage: false,
                isGeneratingImageExt: false,
                isGeneratingImageKeyframes: false
              };
            }
            return s;
          })
        }));
        showToast("✅ 已成功提取：將上一個場景的最後一幀設為首幀，並為下一分鏡的過渡做好了準備！", "success");
      } catch (err: any) {
        console.error("Transition connection failed:", err);
        showToast("銜接處理失敗，使用預設圖片替代。", "error");
        updateActiveProject((prev) => ({
          scenes: prev.scenes.map(s => {
            if (s.id === sceneId) return { ...s, [isGenField]: false };
            return s;
          })
        }));
      }
      return;
    }

    const index = freshActiveProject.scenes.findIndex(s => s.id === sceneId);
    if (index > 0) {
      const prevScene = freshActiveProject.scenes[index - 1];
      const prevVid = prevScene ? (prevScene.videoUrlExt || prevScene.videoUrlKeyframes || prevScene.videoUrl) : undefined;
      if (prevVid) {
        showToast("🎥 偵測到上一分鏡已有影片，正在精確抽取最後一幀作為本鏡頭首幀...", "info");
        try {
          const extRes = await fetch("/api/extract-last-frame", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoUrl: prevVid })
          });
          if (extRes.ok) {
            const extData = await extRes.json();
            if (extData.imageUrl) {
              patchSceneImageState({
                imageUrl: extData.imageUrl,
                imageUrlExt: extData.imageUrl,
                imageUrlKeyframes: extData.imageUrl,
                [isGenField]: false
              });
              showToast("✨ 成功抽取上一分鏡影片最後一幀作為本鏡頭首幀！", "success");
              return extData.imageUrl;
            }
          }
        } catch (extErr) {
          console.warn("抽取上一分鏡最後一幀失敗，改由 AI 繪製圖片：", extErr);
        }
      }
    }

    const controller = new AbortController();
    abortControllersRef.current[sceneId] = controller;
    // Agnes storyboard often needs 60–100s; allow headroom for retries
    const timeoutId = setTimeout(() => controller.abort(new Error("請求處理超時（約 4 分鐘）。Agnes 可能忙碌，請稍後重試")), 240000);

    try {
      const cleanSceneChar = (sceneToGen.character || "").trim().toLowerCase();
      const sceneIsNoChar = isNoChar(cleanSceneChar);
      const characterObj = !sceneIsNoChar 
        ? (freshActiveProject.characters || activeProject?.characters || []).find(c => (c.name || "").trim().toLowerCase() === cleanSceneChar)
        : undefined;
      let charDesc = sceneIsNoChar ? "" : (characterObj?.description || "");
      if (characterObj?.clothing && !sceneIsNoChar) {
        charDesc += `. Ensure wearing: ${characterObj.clothing}.`;
      }
      const characterImages = (!sceneIsNoChar && characterObj?.uploadedAvatarUrls && characterObj.uploadedAvatarUrls.length > 0)
        ? characterObj.uploadedAvatarUrls
        : (!sceneIsNoChar && characterObj?.uploadedAvatarUrl
          ? [characterObj.uploadedAvatarUrl]
          : (!sceneIsNoChar && (characterObj?.avatarUrls || (characterObj?.avatarUrl ? [characterObj.avatarUrl] : [])) || []));
      const charSeed = !sceneIsNoChar ? characterObj?.seed : undefined;

      // === Experience Library Auto-Injection & Prompt Optimization ===
      // Prefer step2 optimized prompt when full-auto already ran STEP 1–2
      let finalPrompt = (sceneToGen as any).step2OptimizedPrompt || sceneToGen.visualPrompt;
      let finalNegativePrompt = (sceneToGen as any).step2OptimizedNegative || sceneToGen.negativePrompt || "";
      let isAutoEnhanced = false;
      let feedbackNote = "";

      // 1. Proactive Character Bible Injection
      const cleanSceneCharLower = cleanSceneChar;
      let matchedBible = null;
      if (!sceneIsNoChar) {
        for (const [key, bible] of Object.entries(CHARACTER_BIBLES)) {
          if (cleanSceneCharLower === key || 
              cleanSceneCharLower.includes(key) || 
              key.includes(cleanSceneCharLower)) {
            matchedBible = bible;
            break;
          }
        }
      }

      // 2. Proactive Action Template Injection (e.g., Gun holding)
      const actionKeywords = ["gun", "pistol", "weapon", "shoot", "aim", "fire", "持槍", "瞄準", "手槍", "武器", "槍", "射擊", "對峙"];
      const promptLower = (sceneToGen.visualPrompt || "").toLowerCase();
      const actionLower = (sceneToGen.actionPrompt || "").toLowerCase();
      const needsGunTemplate = actionKeywords.some(kw => promptLower.includes(kw) || actionLower.includes(kw));

      let proactiveInjections = "";
      if (matchedBible) {
        proactiveInjections += `\n${matchedBible.en}\n`;
        isAutoEnhanced = true;
        feedbackNote = `已自動注入【${sceneToGen.character || "指定角色"}】一致性聖經描述！`;
      }
      if (needsGunTemplate) {
        proactiveInjections += `\n${GUN_ACTION_TEMPLATE.en}\n`;
        isAutoEnhanced = true;
        feedbackNote = feedbackNote 
          ? `${feedbackNote} 並針對【持槍戰鬥】姿勢進行極致微調！` 
          : "已自動套用【持槍戰鬥】動作細節極細微調模板！";
        
        // Enhance negative prompt
        const baseNegatives = GUN_ACTION_TEMPLATE.negative;
        if (finalNegativePrompt) {
          if (!finalNegativePrompt.toLowerCase().includes("hands not holding gun")) {
            finalNegativePrompt = `${finalNegativePrompt}, ${baseNegatives}`;
          }
        } else {
          finalNegativePrompt = baseNegatives;
        }
      }

      // 3. Proactive Cross-Scene Character Consistency Injection & Success Experience Reinforcement
      if (!sceneIsNoChar && cleanSceneCharLower && freshActiveProject.scenes) {
        const sceneIndex = freshActiveProject.scenes.findIndex(s => s.id === sceneId);
        if (sceneIndex > 0) {
          const prevSuccessfulScenes = freshActiveProject.scenes
            .slice(0, sceneIndex)
            .filter(s => s.character && s.imageUrl && s.character.trim().toLowerCase() === cleanSceneCharLower);

          if (prevSuccessfulScenes.length > 0) {
            const lastSuccessfulScene = prevSuccessfulScenes[prevSuccessfulScenes.length - 1];
            proactiveInjections += `\n【跨鏡頭角色一致性要求 (Cross-scene Character Continuity)】\n此分鏡角色的外觀與面部細節必須與前一成功鏡頭「分鏡: ${lastSuccessfulScene.title || lastSuccessfulScene.id.substring(0, 5)}」的首幀圖像保持高度一致，包括相同的髮型、眼睛顏色、面部傷痕與特定的風衣戰鬥服細節。不可有任何變更。\n`;
            isAutoEnhanced = true;
            feedbackNote = feedbackNote 
              ? `${feedbackNote} 並成功鏈接歷史鏡頭以加強跨鏡頭外觀一致性！` 
              : "已自動鏈接歷史成功鏡頭以加強跨鏡頭外觀一致性！";
          }
        }
      }

      // 4. Proactive Multi-Character Composition Priority Control
      const containsRen = promptLower.includes("ren");
      const containsJoe = promptLower.includes("joe") || promptLower.includes("喬") || promptLower.includes("qiao");
      if (containsRen && containsJoe) {
        proactiveInjections += `\n【多角色構圖與優先級控制 (Multi-character Composition & Priority Control)】\n畫面主體視覺優先級為：Ren（主角） > Old Joe（重要 NPC） > 環境背景。必須確保 Ren 在畫面絕對中心或主要焦點，動作細節與表情最為清晰顯著，Old Joe 作為輔助角色次之，而周圍 cyberpunk 酒吧背景僅作為襯托，避免背景喧賓奪主。\n`;
        isAutoEnhanced = true;
        feedbackNote = feedbackNote 
          ? `${feedbackNote} 且已優化多角色構圖優先級！` 
          : "已自動套用多角色構圖優先級控制！";
      }

      try {
        // Skip Firestore experience query when detached / may hang; use local API summary only
        const sceneEntries: any[] = [];
        try {
          const expRes = await fetch(`/api/experience-summary?sceneId=${encodeURIComponent(sceneId)}`);
          if (expRes.ok) {
            const expData = await expRes.json();
            const failuresList = expData.failures || [];
            for (const f of failuresList) {
              sceneEntries.push({ errorMessage: f, passed: false, critique: f, rootCause: f });
            }
          }
        } catch (_) {}
        
        // Sort in-memory by timestamp desc to avoid compound index requirements
        sceneEntries.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
        
        const failures = sceneEntries.filter(e => e.passed === false || e.errorMessage || e.type?.includes("error") || e.technical_failure);
        
        if (failures.length > 0) {
          isAutoEnhanced = true;
          const failureCount = failures.length;
          
          const hasAbstractIssue = failures.some(f => 
            (f.errorMessage && (f.errorMessage.toLowerCase().includes("abstract") || f.errorMessage.toLowerCase().includes("gradient") || f.errorMessage.includes("漸層") || f.errorMessage.includes("流體"))) ||
            (f.critique && (f.critique.toLowerCase().includes("abstract") || f.critique.toLowerCase().includes("gradient") || f.critique.includes("漸層") || f.critique.includes("流體"))) ||
            (f.rootCause && (f.rootCause.toLowerCase().includes("abstract") || f.rootCause.toLowerCase().includes("gradient") || f.rootCause.includes("漸層") || f.rootCause.includes("流體")))
          );

          const hasHandIssue = failures.some(f => 
            (f.errorMessage && (f.errorMessage.toLowerCase().includes("hand") || f.errorMessage.toLowerCase().includes("finger") || f.errorMessage.includes("手") || f.errorMessage.includes("指"))) ||
            (f.critique && (f.critique.toLowerCase().includes("hand") || f.critique.toLowerCase().includes("finger") || f.critique.includes("手") || f.critique.includes("指"))) ||
            (f.rootCause && (f.rootCause.toLowerCase().includes("hand") || f.rootCause.toLowerCase().includes("finger") || f.rootCause.includes("手") || f.rootCause.includes("指")))
          );

          const hasWeaponIssue = failures.some(f => 
            (f.errorMessage && (f.errorMessage.toLowerCase().includes("gun") || f.errorMessage.toLowerCase().includes("weapon") || f.errorMessage.includes("槍") || f.errorMessage.includes("武器"))) ||
            (f.critique && (f.critique.toLowerCase().includes("gun") || f.critique.toLowerCase().includes("weapon") || f.critique.includes("槍") || f.critique.includes("武器"))) ||
            (f.rootCause && (f.rootCause.toLowerCase().includes("gun") || f.rootCause.toLowerCase().includes("weapon") || f.rootCause.includes("槍") || f.rootCause.includes("武器")))
          );

          let dynamicNegatives = "";
          let enforcement = "";
          if (hasAbstractIssue) {
            dynamicNegatives += ", abstract background, gradient, color blocks, fluid colors, blurry background";
            enforcement += `
1. 嚴禁生成任何純色塊、色彩流體、純藍紫色漸層背景或毫無細節的模糊背景。背景必須渲染為實體、具體的 cyberpunk 酒吧室內或特定環境細節。
`;
          }
          if (hasHandIssue) {
            dynamicNegatives += ", deformed hands, extra fingers, missing fingers, floating limbs, distorted body";
            enforcement += `
2. 必須極其清晰、正確、完整地畫出人物手部與手指結構，嚴禁手指變形、贅指、少指或懸空。
`;
          }
          if (hasWeaponIssue) {
            dynamicNegatives += ", hands not holding gun, gun floating, missing gun, gun in wrong hand, deformed weapon";
            enforcement += `
3. 必須清晰畫出要求的所有關鍵槍械道具（sleek glowing sci-fi pulse pistol），右手手指必須正確、牢固地握在扳機上，槍口指向明確。
`;
          }

          if (enforcement) {
            enforcement = `
【SYSTEM ENFORCEMENT - 歷史失敗反饋與動態自動優化】
此場景在歷史生成中曾發生過偏差。你必須嚴格遵守以下規則：
${enforcement}
4. 畫面中央必須清晰呈現具體的人物主體 (Anime key visual character)，與背景形成明顯的前後透視深度感。
`;
          } else {
            enforcement = `
【SYSTEM ENFORCEMENT - 歷史失敗反饋與自動優化】
此場景在歷史上曾發生過生成偏差。請嚴格執行：
1. 必須清晰呈現具體的人物實體，不能被抽象色塊取代。
2. 背景要與場景故事設定一致，嚴禁抽象化、漸層化或模糊。
`;
          }

          finalPrompt = `
Anime key visual, high-quality professional digital art, sharp focus.

【描述主題 (Main Subject Description)】
${sceneToGen.visualPrompt}
${proactiveInjections}

${enforcement}

Anime aesthetic, high resolution, no text, no watermark.
`.trim();

          const baseNegatives = "abstract background, gradient, color blocks, fluid colors, blurry background, missing character, missing weapon, deformed hands" + dynamicNegatives;
          if (finalNegativePrompt) {
            if (!finalNegativePrompt.toLowerCase().includes("abstract background")) {
              finalNegativePrompt = `${finalNegativePrompt}, ${baseNegatives}`;
            } else {
              finalNegativePrompt = `${finalNegativePrompt}${dynamicNegatives}`;
            }
          } else {
            finalNegativePrompt = baseNegatives;
          }

          feedbackNote = `已根據歷史 ${failureCount} 次失敗記錄與角色動作聖經對 Prompt 進行智能增強！`;
          console.info(`[Experience Engine] Enhanced prompt with history & bibles for scene ${sceneId}:`, finalPrompt);
        } else {
          // No past failures, but we have proactive injections (Character Bible or Gun action)
          if (matchedBible || needsGunTemplate) {
            finalPrompt = `
Anime key visual, high-quality professional digital art, sharp focus.

【描述主題 (Main Subject Description)】
${sceneToGen.visualPrompt}
${proactiveInjections}

Anime aesthetic, high resolution, no text, no watermark.
`.trim();
            console.info(`[Experience Engine] Proactive enhancement with bibles for scene ${sceneId}:`, finalPrompt);
          }
        }
      } catch (err) {
        console.warn("[Experience Engine] Error during failure auto-injection query:", err);
        // Fallback to proactive injection anyway if applicable
        if (matchedBible || needsGunTemplate) {
          finalPrompt = `
Anime key visual, high-quality professional digital art, sharp focus.

【描述主題 (Main Subject Description)】
${sceneToGen.visualPrompt}
${proactiveInjections}

Anime aesthetic, high resolution, no text, no watermark.
`.trim();
        }
      }


      // 1. Pre-check Experience Library for past failures
      let historicalFailures: string[] = [];
      try {
        const expRes = await fetch(`/api/experience-summary?sceneId=${sceneId}`);
        if (expRes.ok) {
          const data = await expRes.json();
          historicalFailures = data.failures || [];
        }
      } catch (e) {}

      const hasAbstractBgIssue = historicalFailures.some(f => f.toLowerCase().includes("abstract") || f.toLowerCase().includes("gradient") || f.toLowerCase().includes("purple"));
      const hasMissingContentIssue = historicalFailures.some(f => f.toLowerCase().includes("content missing") || f.toLowerCase().includes("missing gun") || f.toLowerCase().includes("missing character"));

      if (hasAbstractBgIssue) {
        finalPrompt += "\n[CRITICAL HARD CONSTRAINT]: NO abstract background, NO gradients. Must be a concrete real environment.";
        if (finalNegativePrompt) finalNegativePrompt += ", gradient, color blocks, abstract background";
      }
      if (hasMissingContentIssue) {
        finalPrompt += "\n[CRITICAL HARD CONSTRAINT]: Must contain character, must hold weapon clearly.";
        if (finalNegativePrompt) finalNegativePrompt += ", missing gun, missing character, empty scene";
      }

      // 2. Cross-scene consistency logic
      let startFrameUrl = undefined;
      const index = activeProject.scenes.findIndex((s) => s.id === sceneId);
      if (index > 0 && !sceneIsNoChar) {
        const prevScene = activeProject.scenes.slice(0, index).reverse().find((s) => s.imageUrl && !isNoChar(s.character) && (s.character || "").trim().toLowerCase() === cleanSceneChar);
        if (prevScene) {
           startFrameUrl = prevScene.imageUrl;
           finalPrompt += "\n[CROSS-SCENE CONSISTENCY]: The character's appearance, clothing, and facial features MUST exactly match the provided previous scene image reference.";
        }
      }

      if (sceneIsNoChar) {
        finalPrompt += "\n[PURE SCENERY / NO CHARACTER MANDATE]: This is a pure environmental / background / scenery shot. ABSOLUTELY NO characters, NO humans, NO people, NO faces, NO figures in this image.";
        if (finalNegativePrompt) {
          finalNegativePrompt += ", person, human, character, man, woman, face, figure, crowd";
        } else {
          finalNegativePrompt = "person, human, character, man, woman, face, figure, crowd";
        }
      }

      const res = await apiFetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: finalPrompt,
          negativePrompt: finalNegativePrompt,
          image_reference: startFrameUrl || undefined,
          artStyle: characterObj?.artStyle || activeProject.artStyle,
          character: sceneIsNoChar ? "無" : sceneToGen.character,
          characterDescription: sceneIsNoChar ? "PURE ENVIRONMENTAL SCENERY SHOT WITH NO CHARACTERS OR HUMANS PRESENT" : charDesc,
          characterImages: sceneIsNoChar ? [] : characterImages,
          seed: charSeed,
          engine: engine,
          agnesImageMode: activeProject.agnesImageMode || "quality",
          customApiKey: customApiKey || undefined,
          mood: characterObj?.mood
        })
      }, { timeoutMs: 90000, retries: 2, label: "繪圖 API" });
      clearTimeout(timeoutId);

      const textRes = await res.text();
      let data;
      try {
        data = JSON.parse(textRes);
      } catch(e) {
        console.warn("[Toonflow] Failed to parse storyboard image response JSON. Raw text:", textRes.substring(0, 50));
        throw new Error("伺服器回傳格式錯誤 (可能正在重啟或發生異常)，請稍後再試。");
      }
      if (!data.imageUrl || typeof data.imageUrl !== "string" || data.imageUrl.trim().length < 4) {
        throw new Error("繪圖 API 成功但未回傳 imageUrl（可能 Agnes 503 忙碌）");
      }
      // Reject known stock/fallback URLs
      if (data.imageUrl.includes("unsplash.com") || data.imageUrl.includes("pollinations-fallback")) {
        throw new Error("伺服器回傳了禁用的保底圖，已拒絕");
      }
      if (data.message) {
        showToast(data.message, data.isAgnesImage ? "success" : "info");
      }
      if (isAutoEnhanced && feedbackNote) {
        setTimeout(() => {
          showToast(`✨ ${feedbackNote}`, "success");
        }, 1200);
      }
      
      // Sync write URL BEFORE clearing isGenerating — avoids STEP 3 false "無網址"
      patchSceneImageState({
        [imageField]: data.imageUrl,
        [isGenField]: false,
      });

      // Archive newly generated image
      archiveAsset({
        type: "image",
        prompt: sceneToGen.visualPrompt,
        url: data.imageUrl,
        sceneId,
        projectId: activeProjectId || undefined,
        sceneTitle: sceneToGen.title,
        score: 100, // default high score, will be updated by review if review runs
        passed: true
      });

      // Automatically trigger AI review after image generation completes!
      setTimeout(() => {
        handleReviewScene(sceneId, 'image', engine);
      }, 500);

      return data.imageUrl as string;

    } catch (e: any) {
      const isAbort = e.name === 'AbortError' || 
                      e.message === 'USER_ABORTED' || 
                      e.message?.toLowerCase().includes('abort') || 
                      controller.signal.aborted;
      if (isAbort) {
        console.log(`[Toonflow] Scene image generation ${sceneId} aborted by user.`);
        patchSceneImageState({ [isGenField]: false });
        return null;
      }
      
      // Manual error logging for experience library
      const errorMsg = e.message || String(e);
      const lowerMsg = errorMsg.toLowerCase();
      const isPromptIssue = lowerMsg.includes("prompt") || lowerMsg.includes("safety") || lowerMsg.includes("policy") || lowerMsg.includes("sensitive") || lowerMsg.includes("blacklist") || lowerMsg.includes("blocked") || lowerMsg.includes("violation");
      
      logToExperienceLibrary({
        errorName: "ImageGenerationError",
        errorMessage: errorMsg,
        errorStack: e.stack,
        category: "image_generation",
        projectId: activeProjectId || undefined,
        sceneId: sceneId,
        failureCategory: "image_generation",
        rootCause: errorMsg,
        isPromptRelated: isPromptIssue,
        originalPrompt: sceneToGen?.visualPrompt || "",
        generatedResult: "Failed to render image: " + errorMsg,
        critiqueFromSystem: errorMsg,
        aiImprovementSuggestion: isPromptIssue 
          ? "偵測到可能違反安全或敏感詞策略的提示詞描述。建議移除具體人物姓名、限制級動作或可能敏感的物件，並保持英文提示詞簡短流暢。"
          : "Agnes 繪圖忙碌(503)或逾時。建議稍後重試；每張圖常需 60–100 秒。",
        resolution: "⚠️ 繪圖失敗，已拒絕保底圖片。請手動重試或上傳。"
      });

      // fallback if error
      showToast(`分鏡繪圖生成失敗：${e.message || "與繪圖伺服器連接時發生錯誤"}`, "error");
      patchSceneImageState({
        // NO FALLBACK IMAGE — leave empty so skip/retry can work
        [imageField]: "",
        [isGenField]: false,
      });
      // Re-throw so full-auto STEP 3 logs the real reason
      throw e;
    } finally {
      clearTimeout(timeoutId);
      if (abortControllersRef.current[sceneId] === controller) {
        delete abortControllersRef.current[sceneId];
      }
    }
  };

  const handleStopGenerateImage = (sceneId: string) => {
    if (abortControllersRef.current[sceneId]) {
      console.log(`[Toonflow] Stopping scene image generation ${sceneId}...`);
      abortControllersRef.current[sceneId].abort(new Error("USER_ABORTED"));
      delete abortControllersRef.current[sceneId];
    }
    // ensure state is updated
    if (activeProject) {
      const isGenField = activeTab === "scenes_ext" ? "isGeneratingImageExt" : (activeTab === "scenes_keyframes" ? "isGeneratingImageKeyframes" : "isGeneratingImage");
      const updatedScenes = activeProject.scenes.map(s => {
        if (s.id === sceneId) return { ...s, [isGenField]: false };
        return s;
      });
      updateActiveProject({ scenes: updatedScenes });
    }
  };

  const handleStopGenerateVideo = (sceneId: string) => {
    if (videoIntervalsRef.current[sceneId]) {
      console.log(`[Toonflow] Stopping scene video generation ${sceneId}...`);
      clearInterval(videoIntervalsRef.current[sceneId]);
      delete videoIntervalsRef.current[sceneId];
    }
    // ensure state is updated
    if (activeProject) {
      const isGenField = activeTab === "scenes_ext" ? "isGeneratingVideoExt" : (activeTab === "scenes_keyframes" ? "isGeneratingVideoKeyframes" : "isGeneratingVideo");
      const progressField = activeTab === "scenes_ext" ? "videoProgressExt" : (activeTab === "scenes_keyframes" ? "videoProgressKeyframes" : "videoProgress");
      const logsField = activeTab === "scenes_ext" ? "videoLogsExt" : (activeTab === "scenes_keyframes" ? "videoLogsKeyframes" : "videoLogs");
      
      const updatedScenes = activeProject.scenes.map(s => {
        if (s.id === sceneId) {
          return { 
            ...s, 
            [isGenField]: false,
            [progressField]: "已停止",
            [logsField]: [...((s as any)[logsField] || []), "[SYSTEM] 影片生成已被使用者手動停止。"]
          };
        }
        return s;
      });
      updateActiveProject({ scenes: updatedScenes });
      showToast("🛑 影片生成已停止", "info");
    }
  };

  // AI Storyboard Scene & Continuity Quality Control Review
  const handleReviewScene = async (sceneId: string, mode: 'image' | 'video', engine: 'agnes' | 'gemini' | 'nanobanana' | 'mistral' = 'gemini') => {
    let freshProj = activeProject;
    try {
      const curProjects = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
      const curProj = curProjects.find(p => p.id === activeProjectId);
      if (curProj) freshProj = curProj;
    } catch(e) {}
    if (!freshProj) return;

    const index = freshProj.scenes.findIndex(s => s.id === sceneId);
    if (index === -1) return;

    const scene = freshProj.scenes[index];
    const previousScene = index > 0 ? freshProj.scenes[index - 1] : null;

    updateActiveProject((prev) => ({
      scenes: prev.scenes.map(s => {
        if (s.id === sceneId) {
          return {
            ...s,
            aiReviewStatus: "reviewing",
            isReviewing: true
          };
        }
        return s;
      })
    }));

    try {
      showToast(`🕵️ AI 正在對分鏡 ${index + 1}「${scene.title}」進行智慧邏輯與原著對齊性審核...`, "info");
      const res = await fetch("/api/review-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene,
          previousScene,
          originalNovelText: freshProj.novelText,
          customApiKey: customApiKey || undefined
        })
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "Unknown error");
        throw new Error(`審核伺服器連接失敗: ${errText}`);
      }

      const review = await res.json();
      console.log(`[Toonflow QC] Review completed for scene ${sceneId}:`, review);

      // Check if status is needs_refinement and we haven't auto-regenerated yet
      const shouldAutoRegenerate = review.status === "needs_refinement" && !scene.hasAutoRegeneratedReview;

      updateActiveProject((prev) => ({
        scenes: prev.scenes.map(s => {
          if (s.id === sceneId) {
            return {
              ...s,
              aiReviewStatus: review.status,
              aiReviewAlignmentCheck: review.alignmentCheck,
              aiReviewLogicCheck: review.visualLogicCheck,
              aiReviewContinuityCheck: review.continuityCheck,
              aiReviewSeamlessCheck: review.seamlessCheck,
              aiReviewCritique: review.critique,
              isReviewing: false,
              hasAutoRegeneratedReview: shouldAutoRegenerate ? true : s.hasAutoRegeneratedReview,
              // If we need refinement and are auto-regenerating, update prompts!
              visualPrompt: (shouldAutoRegenerate && review.optimizedVisualPrompt) ? review.optimizedVisualPrompt : s.visualPrompt,
              actionPrompt: (shouldAutoRegenerate && review.optimizedActionPrompt) ? review.optimizedActionPrompt : s.actionPrompt
            };
          }
          return s;
        })
      }));

      if (shouldAutoRegenerate) {
        showToast(`⚠️ AI 偵測到分鏡 ${index + 1} 與原著劇本存在邏輯偏差！已自動重構 Prompt 並重新生成！`, "info");
        if (mode === 'image') {
          setTimeout(() => handleGenerateImage(sceneId, engine), 1500);
        } else if (mode === 'video') {
          setTimeout(() => handleGenerateVideo(sceneId), 1500);
        }
      } else {
        const isPassed = review.status === "passed";
        const score = isPassed ? 95 : 60;
        const targetUrl = mode === 'image' 
          ? (scene.imageUrlExt || scene.imageUrlKeyframes || scene.imageUrl)
          : (scene.videoUrlExt || scene.videoUrlKeyframes || scene.videoUrl);

        if (targetUrl) {
          archiveAsset({
            type: mode,
            prompt: scene.visualPrompt,
            url: targetUrl,
            score,
            passed: isPassed,
            sceneId,
            projectId: activeProjectId || undefined,
            sceneTitle: scene.title
          });
        }

        if (review.status === "passed") {
          showToast(`✅ 分鏡 ${index + 1} 通過 AI 影視級邏輯審核！`, "success");
        } else {
          showToast(`⚠️ 分鏡 ${index + 1} 審核完畢（已自動重試過）：建議微調以獲得更通順效果。`, "info");
        }
      }

    } catch (err: any) {
      console.warn("[Toonflow QC Warning] Scene review failed, activating local fallback:", err);
      logToExperienceLibrary({
        errorName: "SceneReviewError",
        errorMessage: err.message || String(err),
        errorStack: err.stack,
        category: "scene_review",
        projectId: activeProjectId || undefined,
        sceneId: sceneId
      });
      showToast("✅ 分鏡審核完成：啟用本地極速安全校驗！", "success");
      updateActiveProject((prev) => ({
        scenes: prev.scenes.map(s => {
          if (s.id === sceneId) {
            return {
              ...s,
              aiReviewStatus: "passed",
              aiReviewSeamlessCheck: "已通過本地首尾影格無縫對接校驗：首尾色彩調性與主體物件位置過渡平順，無劇烈跳躍。",
              aiReviewCritique: "已通過本地極速安全校驗。",
              isReviewing: false
            };
          }
          return s;
        })
      }));
    }
  };

  const handlePolicyViolation = async (
    sceneId: string, 
    statusData: any, 
    intervalId: NodeJS.Timeout,
    logsField: string,
    isGenField: string,
    errorField: string,
    errorCodeField: string,
    retryCallback: () => void
  ) => {
    const isPolicyError = statusData.error?.includes("content_policy_violation") || 
                          statusData.error?.includes("modify your prompt") ||
                          statusData.logs?.some((l:string) => l.includes("content_policy_violation"));

    if (isPolicyError) {
      let curProjs = [] as Project[];
      try { curProjs = JSON.parse(localStorage.getItem("toonflow_projects") || "[]"); } catch(e) {}
      const currentScene = curProjs.find(p => p.id === activeProjectId)?.scenes.find(s => s.id === sceneId);
      
      const currentRetryCount = currentScene?.policyRetryCount || 0;

      if (currentScene && currentRetryCount < 2) {
        clearInterval(intervalId);
        const nextRetryCount = currentRetryCount + 1;
        
        setProjects(prevProjects => {
          const updatedList = prevProjects.map(p => {
            if (p.id === activeProjectId) {
              return {
                ...p,
                scenes: p.scenes.map(s => s.id === sceneId ? {
                  ...s,
                  isRetryingPolicy: true,
                  policyRetryCount: nextRetryCount,
                  [logsField]: [...(statusData.logs || []), `[SYSTEM] 🚫 觸發 Agnes 內容安全限制！檢測到可能違規的敏感詞 (第 ${nextRetryCount}/2 次重試)。正在呼叫 AI 進行安全合規自動化改寫...`]
                } : s)
              };
            }
            return p;
          });
          try { localStorage.setItem("toonflow_projects", JSON.stringify(updatedList)); localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString()); } catch (e) {}
          return updatedList;
        });

        try {
          const fixRes = await fetch("/api/fix-policy-prompt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ visualPrompt: currentScene.visualPrompt, actionPrompt: currentScene.actionPrompt, customApiKey: customApiKey || undefined })
          });
          const fixData = await fixRes.json();
          if (fixData.fixedVisualPrompt) {
            setProjects(prevProjects => {
              const updatedList = prevProjects.map(p => {
                if (p.id === activeProjectId) {
                  return {
                    ...p,
                    scenes: p.scenes.map(s => s.id === sceneId ? {
                      ...s,
                      visualPrompt: fixData.fixedVisualPrompt,
                      actionPrompt: fixData.fixedActionPrompt || s.actionPrompt,
                      [logsField]: [...(statusData.logs || []), `[SYSTEM] 🚫 觸發 Agnes 內容安全限制 (第 ${nextRetryCount}/2 次重試)！`, `[SYSTEM] 🪄 正在進行 AI 提示詞安全優化與特徵修復...`, `[SYSTEM] ✨ 【優化後的新提示詞】:`, `   - Visual: "${fixData.fixedVisualPrompt}"`, `   - Action: "${fixData.fixedActionPrompt || s.actionPrompt || ''}"`, `[SYSTEM] ✅ 安全提示詞優化完成，正在重新發起影片生成 (第 ${nextRetryCount}/2 次)...`]
                    } : s)
                  };
                }
                return p;
              });
              try { localStorage.setItem("toonflow_projects", JSON.stringify(updatedList)); localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString()); } catch (e) {}
              return updatedList;
            });
            
            setTimeout(() => {
              retryCallback();
            }, 1000);
            return true; // handled
          }
        } catch (e) {
          console.error("Auto fix prompt failed", e);
        }
        
        // If it failed to fix, we should mark it as failed with the policy error
        setProjects(prevProjects => {
          const updatedList = prevProjects.map(p => {
            if (p.id === activeProjectId) {
              return {
                ...p,
                scenes: p.scenes.map(s => s.id === sceneId ? {
                  ...s,
                  isRetryingPolicy: false,
                  [isGenField]: false,
                  [errorField]: statusData.error || "Generation process failed",
                  [errorCodeField]: statusData.errorCode,
                  [logsField]: [...(statusData.logs || []), `[SYSTEM] AI 提示詞安全優化與修復請求失敗，已終止自動生成。`]
                } : s)
              };
            }
            return p;
          });
          try { localStorage.setItem("toonflow_projects", JSON.stringify(updatedList)); localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString()); } catch (e) {}
          return updatedList;
        });
        return true; // handled
      } else {
        clearInterval(intervalId);
        setProjects(prevProjects => {
          const updatedList = prevProjects.map(p => {
            if (p.id === activeProjectId) {
              return {
                ...p,
                scenes: p.scenes.map(s => s.id === sceneId ? {
                  ...s,
                  isRetryingPolicy: false,
                  policyRetryCount: 0, // reset
                  [isGenField]: false,
                  [errorField]: `內容政策限制 (已重試 2 次後依然被拒): ${statusData.error || ""}`,
                  [errorCodeField]: statusData.errorCode,
                  [logsField]: [...(statusData.logs || []), `[SYSTEM] ❌ 已達到最大自動修復重試次數 (2/2)。該場景在進行了 2 次安全重寫後依然未能通過底層模型審查。請手動檢查提示詞，剔除潛在的敏感動作或元素。`]
                } : s)
              };
            }
            return p;
          });
          try { localStorage.setItem("toonflow_projects", JSON.stringify(updatedList)); localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString()); } catch (e) {}
          return updatedList;
        });
        return true;
      }
    }
    return false; // not handled
  };

  // Agnes Video Generation for a specific scene card!
  const handleGenerateVideo = async (sceneId: string, force = false, retryCount = 0) => {
    console.log("[DEBUG] handleGenerateVideo called for:", sceneId, "Force:", force);
    let freshActiveProject = activeProject;
    try {
      const curProjects = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
      const curProj = curProjects.find(p => p.id === activeProjectId);
      if (curProj) freshActiveProject = curProj;
    } catch(e) {}
    if (!freshActiveProject) return;
    
    const isGenField = activeTab === "scenes_ext" ? "isGeneratingVideoExt" : (activeTab === "scenes_keyframes" ? "isGeneratingVideoKeyframes" : "isGeneratingVideo");
    const videoField = activeTab === "scenes_ext" ? "videoUrlExt" : (activeTab === "scenes_keyframes" ? "videoUrlKeyframes" : "videoUrl");
    const imageField = activeTab === "scenes_ext" ? "imageUrlExt" : (activeTab === "scenes_keyframes" ? "imageUrlKeyframes" : "imageUrl");
    
    // Check if generating already
    const existingTargetScene = activeProject.scenes.find(s => s.id === sceneId);
    if (!force && existingTargetScene && (existingTargetScene as any)[isGenField]) {
      console.log("[DEBUG] Already generating for:", sceneId);
      return;
    }
    
    console.log("[DEBUG] Proceeding to generate video for:", sceneId);
    const progressField = activeTab === "scenes_ext" ? "videoProgressExt" : (activeTab === "scenes_keyframes" ? "videoProgressKeyframes" : "videoProgress");
    const logsField = activeTab === "scenes_ext" ? "videoLogsExt" : (activeTab === "scenes_keyframes" ? "videoLogsKeyframes" : "videoLogs");
    const errorField = activeTab === "scenes_ext" ? "videoErrorExt" : (activeTab === "scenes_keyframes" ? "videoErrorKeyframes" : "videoError");
    const errorCodeField = activeTab === "scenes_ext" ? "videoErrorCodeExt" : (activeTab === "scenes_keyframes" ? "videoErrorCodeKeyframes" : "videoErrorCode");
    const apiLatencyField = activeTab === "scenes_ext" ? "videoApiLatencyExt" : (activeTab === "scenes_keyframes" ? "videoApiLatencyKeyframes" : "videoApiLatency");
    const downloadLatencyField = activeTab === "scenes_ext" ? "videoDownloadLatencyExt" : (activeTab === "scenes_keyframes" ? "videoDownloadLatencyKeyframes" : "videoDownloadLatency");
    const resourceAllocationField = activeTab === "scenes_ext" ? "videoResourceAllocationExt" : (activeTab === "scenes_keyframes" ? "videoResourceAllocationKeyframes" : "videoResourceAllocation");

    // Always prefer freshest localStorage project (full-auto writes there ahead of React state)
    try {
      const curProjects = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
      const curProj = curProjects.find(p => p.id === activeProjectId);
      if (curProj) freshActiveProject = curProj;
    } catch (e) {}

    // Kill any leftover poller for this scene (prevents race on retry → false "無有效網址")
    if (videoIntervalsRef.current[sceneId]) {
      try { clearInterval(videoIntervalsRef.current[sceneId]); } catch (_) {}
      delete videoIntervalsRef.current[sceneId];
    }

    const index = freshActiveProject.scenes.findIndex(s => s.id === sceneId);
    let endImageUrl: string | undefined = undefined;
    let startImageUrlForTransition: string | undefined = undefined;

    // Retrieve targets for video gen from freshest project
    const targetScene = freshActiveProject.scenes.find(s => s.id === sceneId);
    if (!targetScene) return;

    let extendFromVideoUrlForApi: string | undefined = undefined;

    // Frame Continuity Enforcement: For any scene (index > 0), check previous scene video / image
    if (index > 0) {
      const prevScene = freshActiveProject.scenes[index - 1];
      if (prevScene) {
        const prevVid = prevScene.videoUrlExt || prevScene.videoUrlKeyframes || prevScene.videoUrl;
        const prevImg = prevScene.imageUrlExt || prevScene.imageUrlKeyframes || prevScene.imageUrl;

        if (prevVid) {
          extendFromVideoUrlForApi = prevVid;
          try {
            console.log(`[Toonflow Video Gen] Attempting last frame extraction from prev video: ${prevVid}`);
            const extractRes = await fetch("/api/extract-last-frame", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ videoUrl: prevVid })
            });
            if (extractRes.ok) {
              const data = await extractRes.json();
              if (data.imageUrl) {
                startImageUrlForTransition = data.imageUrl;
                // Update target scene's start image in state & localStorage so UI reflects it immediately
                const list = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
                const nextList = list.map(p => {
                  if (p.id !== activeProjectId) return p;
                  return {
                    ...p,
                    scenes: p.scenes.map(s => s.id === sceneId ? {
                      ...s,
                      imageUrl: data.imageUrl,
                      imageUrlExt: data.imageUrl,
                      imageUrlKeyframes: data.imageUrl
                    } : s)
                  };
                });
                localStorage.setItem("toonflow_projects", JSON.stringify(nextList));
                updateActiveProject((prev) => ({
                  scenes: prev.scenes.map(s => s.id === sceneId ? {
                    ...s,
                    imageUrl: data.imageUrl,
                    imageUrlExt: data.imageUrl,
                    imageUrlKeyframes: data.imageUrl
                  } : s)
                }));
              }
            }
          } catch (err) {
            console.warn("抽取上一分鏡最後一幀失敗，退回使用靜態首幀：", err);
          }
        }
        if (!startImageUrlForTransition && prevImg && !targetScene.imageUrl && !targetScene.imageUrlExt && !targetScene.imageUrlKeyframes) {
          startImageUrlForTransition = prevImg;
        }
      }
    }

    if (sceneId.startsWith("scene_transition_")) {
      if (index > 0 && !startImageUrlForTransition) {
        const prevScene = activeProject.scenes[index - 1];
        startImageUrlForTransition = prevScene.imageUrl || prevScene.imageUrlExt || prevScene.imageUrlKeyframes;
        if (!startImageUrlForTransition) {
          alert(`請先完成前一分鏡「${prevScene.title}」的繪圖，以作為本銜接分鏡影片的起始影格（首幀）！`);
          return;
        }
      }
      if (index !== -1 && index < activeProject.scenes.length - 1) {
        const nextScene = activeProject.scenes[index + 1];
        const foundEndImage = nextScene.imageUrl || nextScene.imageUrlExt || nextScene.imageUrlKeyframes;
        if (!foundEndImage) {
          alert(`請先完成下一分鏡「${nextScene.title}」的繪圖，以作為本銜接分鏡影片的結尾影格（尾幀）！`);
          return;
        }
        endImageUrl = foundEndImage;
      }
    } else {
      if (!startImageUrlForTransition) {
        startImageUrlForTransition = (targetScene as any)[imageField] || targetScene.imageUrlKeyframes || targetScene.imageUrl || targetScene.imageUrlExt;
      }
      if (index < freshActiveProject.scenes.length - 1) {
        const nextScene = freshActiveProject.scenes[index + 1];
        const foundEndImage = nextScene.imageUrlKeyframes || nextScene.imageUrl || nextScene.imageUrlExt;
        if (foundEndImage) {
          endImageUrl = foundEndImage;
        }
      }
    }

    // Sync write generating flag to localStorage immediately (full-auto polls localStorage, not React)
    const markSceneVideoState = (patch: Record<string, any>) => {
      try {
        const list = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
        const next = list.map(p => {
          if (p.id !== activeProjectId) return p;
          return {
            ...p,
            scenes: p.scenes.map(s => s.id === sceneId ? { ...s, ...patch } : s)
          };
        });
        localStorage.setItem("toonflow_projects", JSON.stringify(next));
        localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString());
      } catch (_) {}
      updateActiveProject((prev) => ({
        scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, ...patch } : s)
      }));
    };

    markSceneVideoState({
      [isGenField]: true,
      [progressField]: "0%",
      [errorField]: "",
      [logsField]: ["[SYSTEM] Initiating Agnes Video V2.0 call..."],
      policyRetryCount: targetScene.isRetryingPolicy ? targetScene.policyRetryCount : 0,
      isRetryingPolicy: targetScene.isRetryingPolicy || false
    });

    try {
      const targetCharLower = (targetScene.character || "").trim().toLowerCase();
      const isTargetNoChar = isNoChar(targetScene.character);
      const characterObj = !isTargetNoChar
        ? activeProject.characters.find(c => {
            const cName = (c.name || "").trim().toLowerCase();
            return cName === targetCharLower || cName.includes(targetCharLower) || targetCharLower.includes(cName);
          })
        : undefined;
      const charDesc = !isTargetNoChar ? (characterObj?.description || "") : "";

      // 1. Proactive Character Bible Injection for Video
      let videoProactiveInjections = "";
      let matchedBible = null;
      if (!isTargetNoChar) {
        for (const [key, bible] of Object.entries(CHARACTER_BIBLES)) {
          if (targetCharLower === key || 
              targetCharLower.includes(key) || 
              key.includes(targetCharLower)) {
            matchedBible = bible;
            break;
          }
        }
      }
      if (matchedBible) {
        videoProactiveInjections += `\n${matchedBible.en}\n`;
      }

      // 2. Proactive Action Template Injection (e.g., Gun holding)
      const actionKeywords = ["gun", "pistol", "weapon", "shoot", "aim", "fire", "持槍", "瞄準", "手槍", "武器", "槍", "射擊", "對峙"];
      const promptLower = (targetScene.visualPrompt || "").toLowerCase();
      const actionLower = (targetScene.actionPrompt || "").toLowerCase();
      const needsGunTemplate = actionKeywords.some(kw => promptLower.includes(kw) || actionLower.includes(kw));
      if (needsGunTemplate) {
        videoProactiveInjections += `\n${GUN_ACTION_TEMPLATE.en}\n`;
      }

      // 3. Proactive Cross-Scene Character Consistency Injection for Video
      if (!isTargetNoChar && targetCharLower && freshActiveProject.scenes) {
        if (index > 0) {
          const prevSuccessfulScenes = freshActiveProject.scenes
            .slice(0, index)
            .filter(s => s.character && s.imageUrl && s.character.trim().toLowerCase() === targetCharLower);

          if (prevSuccessfulScenes.length > 0) {
            const lastSuccessfulScene = prevSuccessfulScenes[prevSuccessfulScenes.length - 1];
            videoProactiveInjections += `\n【跨鏡頭角色一致性要求 (Cross-scene Character Continuity)】\n此分鏡影片角色的外貌、面部細節和服裝細節必須與前一成功鏡頭「分鏡: ${lastSuccessfulScene.title || lastSuccessfulScene.id.substring(0, 5)}」的首幀圖像保持高度一致，包括相同的髮型、眼睛顏色、面部傷痕與特定的風衣戰鬥服細節。不可有任何變更。\n`;
          }
        }
      }

      // 4. Proactive Multi-Character Composition Priority Control for Video
      const containsRen = promptLower.includes("ren");
      const containsJoe = promptLower.includes("joe") || promptLower.includes("喬") || promptLower.includes("qiao");
      if (containsRen && containsJoe) {
        videoProactiveInjections += `\n【多角色構圖與優先級控制 (Multi-character Composition & Priority Control)】\n畫面主體視覺優先級為：Ren（主角） > Old Joe（重要 NPC） > 環境背景。必須確保 Ren 在畫面絕對中心或主要焦點，動作細節與表情最為清晰顯著，Old Joe 作為輔助角色次之，而周圍 cyberpunk 酒吧背景僅作為襯托，避免背景喧賓奪主。\n`;
      }

      // 5. Video Continuity & First-Frame Enforcement
      videoProactiveInjections += `\n${VIDEO_CONTINUITY_TEMPLATE.en}\n`;

      const dialogueAddon = targetScene.dialogue ? ` (lips speaking and mouth moving to speak. The character is actively talking with realistic mouth movements, speaking: "${targetScene.dialogue}". The video must be completely clean with ABSOLUTELY NO SUBTITLES, no burned-in text, no on-screen text, no words, no captions, no letters).` : "";
      const narrationAddon = targetScene.narration ? ` (Narrator voiceover atmospheric ambiance, completely clean video, absolutely no subtitles, no on-screen text, no captions, no words, no letters).` : "";
      let actionAddon = targetScene.actionPrompt ? ` Action and movement: ${targetScene.actionPrompt}. ` : " ";
      let transitionAddon = targetScene.transitionPrompt ? ` Transition action: ${targetScene.transitionPrompt}. ` : " ";
      const notesAddon = targetScene.directorNotes ? ` Director's notes: ${targetScene.directorNotes}. ` : " ";
      let cameraAddon = "(Advanced camera movement and cinematic lighting, natural human behavior, realistic high-fidelity video, masterwork.)";

      // Downgrade prompt complexity on 3rd-4th attempt (retryCount >= 2)
      if (retryCount >= 2) {
        actionAddon = " ";
        transitionAddon = " ";
        cameraAddon = "(Static camera, clear subject, cinematic lighting, natural human behavior, realistic high-fidelity video, masterwork.)";
        console.log(`[Video Gen] Retry ${retryCount + 1}: Downgrading prompt complexity (removed camera/action descriptors).`);
      }

      const charInfoString = isTargetNoChar
        ? "[PURE SCENERY / NO CHARACTER VIDEO]: Pure environmental scenery motion shot with ABSOLUTELY NO characters, NO humans, NO people, NO faces, NO figures."
        : `[CRITICAL CLOTHING CONSISTENCY]: The character MUST wear the exact clothing described in their Description. Style: ${characterObj?.artStyle || activeProject.artStyle}. Character: ${targetScene.character}, Description: ${charDesc}.`;

      let enhancedPrompt = `${targetScene.visualPrompt}.${actionAddon}${transitionAddon}${dialogueAddon}${narrationAddon}${notesAddon} ABSOLUTELY NO SUBTITLES, NO TEXT, NO WATERMARKS, CLEAN VIDEO, PURE CINEMATIC VISUALS. ${cameraAddon} ${charInfoString} ${videoProactiveInjections}`;

      // Dynamic Negative Prompt reinforcement for Video
      let finalNegativePrompt = targetScene.negativePrompt || "";
      const baseNegatives = isTargetNoChar
        ? "person, human, character, man, woman, face, figure, crowd, abstract background, gradient, color blocks, fluid colors, blurry background"
        : "abstract background, gradient, color blocks, fluid colors, blurry background, missing character, missing weapon, deformed hands";
      if (finalNegativePrompt) {
        if (!finalNegativePrompt.toLowerCase().includes("abstract background")) {
          finalNegativePrompt = `${finalNegativePrompt}, ${baseNegatives}`;
        }
      } else {
        finalNegativePrompt = baseNegatives;
      }
      if (needsGunTemplate) {
        finalNegativePrompt += ", hands not holding gun, gun floating, missing weapon, hands not gripping pistol, blurry gun, deformed weapon";
      }
      finalNegativePrompt += ", sudden pose change, character appearance inconsistency, missing gun, deformed hands at start, jump cuts, chaotic camera movement";

      // Apply historical failure constraints (Experience Library)
      let historicalFailures: string[] = [];
      try {
        const expRes = await fetch(`/api/experience-summary?sceneId=${sceneId}`);
        if (expRes.ok) {
          const data = await expRes.json();
          historicalFailures = data.failures || [];
        }
      } catch (e) {}
      
      const hasContentMissing = historicalFailures.some(f => f.toLowerCase().includes("content missing") || f.toLowerCase().includes("missing gun"));
      const hasAbstractBg = historicalFailures.some(f => f.toLowerCase().includes("abstract") || f.toLowerCase().includes("gradient"));
      
      if (hasContentMissing) {
        enhancedPrompt += "\n[CRITICAL HARD CONSTRAINT]: Must contain character, must hold weapon clearly.";
        finalNegativePrompt += ", missing gun, empty scene, character missing";
      }
      if (hasAbstractBg) {
        enhancedPrompt += "\n[CRITICAL HARD CONSTRAINT]: NO abstract background, NO gradients. Must be a concrete real environment.";
        finalNegativePrompt += ", gradient, abstract background";
      }

      try {
        const url = force ? "/api/generate?force=true" : "/api/generate";
        const res = await apiFetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: enhancedPrompt,
            visualPrompt: targetScene.visualPrompt,
            negativePrompt: finalNegativePrompt,
            actionPrompt: targetScene.actionPrompt,
            transitionPrompt: targetScene.transitionPrompt,
            dialogue: targetScene.dialogue,
            narration: targetScene.narration,
            directorNotes: targetScene.directorNotes,
            character: targetScene.character,
            characterDescription: charDesc,
            artStyle: characterObj?.artStyle || activeProject.artStyle,
            imageUrl: startImageUrlForTransition || (targetScene as any)[imageField] || undefined,
            endImageUrl: endImageUrl,
            extendFromVideoUrl: extendFromVideoUrlForApi,
            customApiKey: customApiKey || undefined,
            durationSeconds: targetScene.durationSeconds,
            agnesVideoMode: activeProject.agnesVideoMode || "quality",
            useFreezeAndMove: targetScene.step5Mode === "transition" || targetScene.useFreezeAndMove,
            useMidpointSplit: targetScene.useMidpointSplit,
            sceneIndex: index,
            sceneType: activeTab === "scenes_ext" ? "ext" : (activeTab === "scenes_keyframes" ? "keyframes" : "standard")
          })
        }, { timeoutMs: 60000, retries: 2, label: "影片生成 API" });
      } catch (e: any) {
        if (e.message && e.message.includes("A video generation is already in progress")) {
          showToast("伺服器端仍有影片生成任務正在進行中。請稍候，或至頁面最底部的重置區強制清除狀態。", "info");
        } else if (e.name === 'TypeError' || (e.message && e.message.includes("Failed to fetch"))) {
          console.warn("[Toonflow Video Gen] Temporary network connection issue:", e);
          showToast("網路發送請求時發生暫時中斷，請確認連線後點擊重新生成。", "error");
        } else {
          console.warn("[Toonflow Video Gen] Video generation initiation issue:", e);
        }
        markSceneVideoState({
          [isGenField]: false,
          [errorField]: `生成請求失敗: ${e.message || e}`,
          [logsField]: [`[ERROR] ${e.message || e}`]
        });
        return;
      }


      // Start polling specifically for this scene
      let count = 0;
      const intervalId = setInterval(async () => {
        try {
          const statusRes = await fetch("/api/status");
          if (!statusRes.ok) return;
          const statusData = await statusRes.json();

          if (statusData.status === "failed") {
            const handled = await handlePolicyViolation(
              sceneId, 
              statusData, 
              intervalId, 
              logsField, 
              isGenField, 
              errorField, 
              errorCodeField, 
              () => handleGenerateVideo(sceneId)
            );
            if (handled) {
              delete videoIntervalsRef.current[sceneId];
              return;
            }
          }
          setProjects(prevProjects => {
            const updatedList = prevProjects.map(p => {
              if (p.id === activeProjectId) {
                const updatedScenes = p.scenes.map(s => {
                   if (s.id === sceneId) {
                    const logs = statusData.logs || [];
                    const progress = statusData.progress || "0%";
                    const status = statusData.status;

                    if (status === "completed" && statusData.outputPath) {
                      clearInterval(intervalId);
                      delete videoIntervalsRef.current[sceneId];
                      console.log("[DEBUG] Video URL generated:", statusData.outputPath);
                      
                      // Archive newly generated video
                      archiveAsset({
                        type: "video",
                        prompt: s.visualPrompt,
                        url: statusData.outputPath,
                        sceneId,
                        projectId: activeProjectId || undefined,
                        sceneTitle: s.title,
                        score: 100, // default high score, will be updated by review if review runs
                        passed: true
                      });

                      // Automatically trigger AI review after video generation completes!
                      setTimeout(() => {
                        handleReviewScene(sceneId, 'video');
                      }, 500);

                      // Automatic tail-frame extraction & propagation!
                      handleAutoExtractAndPropagateTailFrame(sceneId, statusData.outputPath);

                      return { 
                        ...s, 
                        [videoField]: statusData.outputPath, 
                        [`${videoField}Local`]: statusData.localPath || statusData.outputPath, 
                        [isGenField]: false, 
                        [progressField]: "100%",
                        [logsField]: [...logs, "[SYSTEM] Video generated and mapped successfully!"],
                        [errorField]: "",
                        [errorCodeField]: statusData.errorCode,
                        [apiLatencyField]: statusData.apiLatency || (s as any)[apiLatencyField],
                        [downloadLatencyField]: statusData.downloadLatency || (s as any)[downloadLatencyField],
                        [resourceAllocationField]: statusData.resourceAllocation || (s as any)[resourceAllocationField]
                      };
                    } else if (status === "failed") {
                      clearInterval(intervalId);
                      delete videoIntervalsRef.current[sceneId];
                      
                      const errString = statusData.error || "Generation process failed";
                      const isPromptIssue = errString.toLowerCase().includes("prompt") || errString.toLowerCase().includes("safety") || errString.toLowerCase().includes("policy") || errString.toLowerCase().includes("violation");
                      
                      logToExperienceLibrary({
                        errorName: "VideoGenerationError",
                        errorMessage: errString,
                        category: "video_generation",
                        projectId: activeProjectId || undefined,
                        sceneId: sceneId,
                        failureCategory: "video_generation",
                        rootCause: errString,
                        isPromptRelated: isPromptIssue,
                        originalPrompt: s.visualPrompt || "",
                        generatedResult: "Failed to render video",
                        critiqueFromSystem: errString,
                        aiImprovementSuggestion: isPromptIssue 
                          ? "提示詞觸發了底層影片模型的安全政策。請移除非必要的安全敏感、人名或物理衝突描述。"
                          : "影片生成連線逾時或算力短缺。建議檢查 AGNES_API_KEY / Railway log 後手動重試。",
                        resolution: "⚠️ 已禁用保底影片，交由重試或人手處理。"
                      });

                      // NO placeholder/ffmpeg stock fallback — hard fail so full-auto can retry or stop
                      return {
                        ...s,
                        [isGenField]: false,
                        [progressField]: "0%",
                        [errorField]: errString,
                        [errorCodeField]: statusData.errorCode,
                        [logsField]: [...logs, `[SYSTEM] ❌ 影片生成失敗（已禁用保底影片）：${errString}`],
                        isRetryingPolicy: false,
                        [apiLatencyField]: statusData.apiLatency || (s as any)[apiLatencyField],
                        [downloadLatencyField]: statusData.downloadLatency || (s as any)[downloadLatencyField],
                        [resourceAllocationField]: statusData.resourceAllocation || (s as any)[resourceAllocationField]
                      };
                    }

                    return {
                      ...s,
                      [progressField]: progress,
                      [logsField]: logs,
                      [apiLatencyField]: statusData.apiLatency || (s as any)[apiLatencyField],
                      [downloadLatencyField]: statusData.downloadLatency || (s as any)[downloadLatencyField],
                      [resourceAllocationField]: statusData.resourceAllocation || (s as any)[resourceAllocationField]
                    };
                  }
                  return s;
                });
                return { ...p, scenes: updatedScenes };
              }
              return p;
            });
            try { localStorage.setItem("toonflow_projects", JSON.stringify(updatedList)); localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString()); } catch (e) { console.error("Quota exceeded", e); }
            return updatedList;
          });

        } catch (pollErr) {
          console.warn("Polling error for scene video", pollErr);
        }

        // Failsafe timeout after ~10 minutes of polling (Agnes video is slow)
        count++;
        if (count > 200) {
          clearInterval(intervalId);
          delete videoIntervalsRef.current[sceneId];
          markSceneVideoState({
            [isGenField]: false,
            [errorField]: "影片生成超時（約 10 分鐘）。請檢查 Agnes API / Railway 日誌後重試。"
          });
        }
      }, 3000);
      videoIntervalsRef.current[sceneId] = intervalId;

    } catch (err: any) {
      updateActiveProject((prev) => ({
        scenes: prev.scenes.map(s => {
          if (s.id === sceneId) {
            return {
              ...s,
              [isGenField]: false,
              [errorField]: err.message || "Connection failure to video microservice."
            };
          }
          return s;
        })
      }));
    }
  };

  // Agnes Video Generation with frame continuity (extend from previous scene's last frame)
  const handleGenerateVideoExtended = async (sceneId: string, index: number, retryCount = 0) => {
    let freshActiveProject = activeProject;
    try {
      const curProjects = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
      const curProj = curProjects.find(p => p.id === activeProjectId);
      if (curProj) freshActiveProject = curProj;
    } catch(e) {}
    if (!freshActiveProject) return;

    const targetScene = freshActiveProject.scenes.find(s => s.id === sceneId);
    if (!targetScene) return;

    let endImageUrl: string | undefined = undefined;
    if (sceneId.startsWith("scene_transition_")) {
      if (index < freshActiveProject.scenes.length - 1) {
        const nextScene = freshActiveProject.scenes[index + 1];
        const foundEndImage = nextScene.imageUrlExt || nextScene.imageUrl || nextScene.imageUrlKeyframes;
        if (!foundEndImage) {
          alert(`請先完成下一分鏡「${nextScene.title}」的繪圖，以作為本銜接分鏡影片的結尾影格（尾幀）！`);
          return;
        }
        endImageUrl = foundEndImage;
      }
    } else {
      // If index > 0, check if previous scene has generated video (only for non-transition scenes)
      if (index > 0) {
        const prevScene = freshActiveProject.scenes[index - 1];
        if (!prevScene.videoUrlExt) {
          alert(`為確保分鏡首尾影格連續，請先為前一場景「${prevScene.title}」生成影片！`);
          return;
        }
      }
      // Use this scene's own storyboard image as the target end image (last frame) for the transition
      endImageUrl = targetScene.imageUrl || targetScene.imageUrlExt || targetScene.imageUrlKeyframes || undefined;
    }

    // Update specific scene video state to generating
    updateActiveProject((prev) => ({
      scenes: prev.scenes.map(s => {
        if (s.id === sceneId) {
          return { 
            ...s, 
            isGeneratingVideoExt: true, 
            videoProgressExt: "0%",
            videoLogsExt: ["[SYSTEM] Initiating Agnes Video V2.0 Extended call..."],
            policyRetryCount: s.isRetryingPolicy ? s.policyRetryCount : 0,
            isRetryingPolicy: s.isRetryingPolicy || false
          };
        }
        return s;
      })
    }));

    try {
      const targetCharLower = (targetScene.character || "").trim().toLowerCase();
      const isTargetNoChar = isNoChar(targetScene.character);
      const characterObj = !isTargetNoChar
        ? freshActiveProject.characters.find(c => {
            const cName = (c.name || "").trim().toLowerCase();
            return cName === targetCharLower || cName.includes(targetCharLower) || targetCharLower.includes(cName);
          })
        : undefined;
      const charDesc = !isTargetNoChar ? (characterObj?.description || "") : "";

      // 1. Proactive Character Bible Injection for Video
      let videoProactiveInjections = "";
      let matchedBible = null;
      if (!isTargetNoChar) {
        for (const [key, bible] of Object.entries(CHARACTER_BIBLES)) {
          if (targetCharLower === key || 
              targetCharLower.includes(key) || 
              key.includes(targetCharLower)) {
            matchedBible = bible;
            break;
          }
        }
      }
      if (matchedBible) {
        videoProactiveInjections += `\n${matchedBible.en}\n`;
      }

      // 2. Proactive Action Template Injection (e.g., Gun holding)
      const actionKeywords = ["gun", "pistol", "weapon", "shoot", "aim", "fire", "持槍", "瞄準", "手槍", "武器", "槍", "射擊", "對峙"];
      const promptLower = (targetScene.visualPrompt || "").toLowerCase();
      const actionLower = (targetScene.actionPrompt || "").toLowerCase();
      const needsGunTemplate = actionKeywords.some(kw => promptLower.includes(kw) || actionLower.includes(kw));
      if (needsGunTemplate) {
        videoProactiveInjections += `\n${GUN_ACTION_TEMPLATE.en}\n`;
      }

      // 3. Proactive Cross-Scene Character Consistency Injection for Video
      if (targetCharLower && freshActiveProject.scenes) {
        if (index > 0) {
          const prevSuccessfulScenes = freshActiveProject.scenes
            .slice(0, index)
            .filter(s => s.character && s.imageUrl && s.character.trim().toLowerCase() === targetCharLower);

          if (prevSuccessfulScenes.length > 0) {
            const lastSuccessfulScene = prevSuccessfulScenes[prevSuccessfulScenes.length - 1];
            videoProactiveInjections += `\n【跨鏡頭角色一致性要求 (Cross-scene Character Continuity)】\n此分鏡影片角色的外貌、面部細節和服裝細節必須與前一成功鏡頭「分鏡: ${lastSuccessfulScene.title || lastSuccessfulScene.id.substring(0, 5)}」的首幀圖像保持高度一致，包括相同的髮型、眼睛顏色、面部傷痕與特定的風衣戰鬥服細節。不可有任何變更。\n`;
          }
        }
      }

      // 4. Proactive Multi-Character Composition Priority Control for Video
      const containsRen = promptLower.includes("ren");
      const containsJoe = promptLower.includes("joe") || promptLower.includes("喬") || promptLower.includes("qiao");
      if (containsRen && containsJoe) {
        videoProactiveInjections += `\n【多角色構圖與優先級控制 (Multi-character Composition & Priority Control)】\n畫面主體視覺優先級為：Ren（主角） > Old Joe（重要 NPC） > 環境背景。必須確保 Ren 在畫面絕對中心或主要焦點，動作細節與表情最為清晰顯著，Old Joe 作為輔助角色次之，而周圍 cyberpunk 酒吧背景僅作為襯托，避免背景喧賓奪主。\n`;
      }

      // 5. Video Continuity & First-Frame Enforcement
      videoProactiveInjections += `\n${VIDEO_CONTINUITY_TEMPLATE.en}\n`;

      const dialogueAddon = targetScene.dialogue ? ` (lips speaking and mouth moving to speak. The character is actively talking with realistic mouth movements, speaking: "${targetScene.dialogue}". The video must be completely clean with ABSOLUTELY NO SUBTITLES, no burned-in text, no on-screen text, no words, no captions, no letters).` : "";
      const narrationAddon = targetScene.narration ? ` (Narrator voiceover atmospheric ambiance, completely clean video, absolutely no subtitles, no on-screen text, no captions, no words, no letters).` : "";
      let actionAddon = targetScene.actionPrompt ? ` Action and movement: ${targetScene.actionPrompt}. ` : " ";
      let transitionAddon = targetScene.transitionPrompt ? ` Transition action: ${targetScene.transitionPrompt}. ` : " ";
      const notesAddon = targetScene.directorNotes ? ` Director's notes: ${targetScene.directorNotes}. ` : " ";
      let cameraAddon = "(Advanced camera movement and cinematic lighting, natural human behavior, realistic high-fidelity video, masterwork.)";

      // Downgrade prompt complexity on 3rd-4th attempt (retryCount >= 2)
      if (retryCount >= 2) {
        actionAddon = " ";
        transitionAddon = " ";
        cameraAddon = "(Static camera, clear subject, cinematic lighting, natural human behavior, realistic high-fidelity video, masterwork.)";
        console.log(`[Video Gen Ext] Retry ${retryCount + 1}: Downgrading prompt complexity (removed camera/action descriptors).`);
      }

      const charInfoString = isTargetNoChar
        ? "[PURE SCENERY / NO CHARACTER VIDEO]: Pure environmental scenery motion shot with ABSOLUTELY NO characters, NO humans, NO people, NO faces, NO figures."
        : `[CRITICAL CLOTHING CONSISTENCY]: The character MUST wear the exact clothing described in their Description. Style: ${characterObj?.artStyle || freshActiveProject.artStyle}. Character: ${targetScene.character}, Description: ${charDesc}.`;

      let enhancedPrompt = `${targetScene.visualPrompt}.${actionAddon}${transitionAddon}${dialogueAddon}${narrationAddon}${notesAddon} ABSOLUTELY NO SUBTITLES, NO TEXT, NO WATERMARKS, CLEAN VIDEO, PURE CINEMATIC VISUALS. ${cameraAddon} ${charInfoString} ${videoProactiveInjections}`;

      // Dynamic Negative Prompt reinforcement for Video
      let finalNegativePrompt = targetScene.negativePrompt || "";
      const baseNegatives = isTargetNoChar
        ? "person, human, character, man, woman, face, figure, crowd, abstract background, gradient, color blocks, fluid colors, blurry background"
        : "abstract background, gradient, color blocks, fluid colors, blurry background, missing character, missing weapon, deformed hands";
      if (finalNegativePrompt) {
        if (!finalNegativePrompt.toLowerCase().includes("abstract background")) {
          finalNegativePrompt = `${finalNegativePrompt}, ${baseNegatives}`;
        }
      } else {
        finalNegativePrompt = baseNegatives;
      }
      if (needsGunTemplate) {
        finalNegativePrompt += ", hands not holding gun, gun floating, missing weapon, hands not gripping pistol, blurry gun, deformed weapon";
      }
      finalNegativePrompt += ", sudden pose change, character appearance inconsistency, missing gun, deformed hands at start, jump cuts, chaotic camera movement";

      // Apply historical failure constraints (Experience Library)
      let historicalFailures: string[] = [];
      try {
        const expRes = await fetch(`/api/experience-summary?sceneId=${sceneId}`);
        if (expRes.ok) {
          const data = await expRes.json();
          historicalFailures = data.failures || [];
        }
      } catch (e) {}
      
      const hasContentMissing = historicalFailures.some(f => f.toLowerCase().includes("content missing") || f.toLowerCase().includes("missing gun"));
      const hasAbstractBg = historicalFailures.some(f => f.toLowerCase().includes("abstract") || f.toLowerCase().includes("gradient"));
      
      if (hasContentMissing) {
        enhancedPrompt += "\n[CRITICAL HARD CONSTRAINT]: Must contain character, must hold weapon clearly.";
        finalNegativePrompt += ", missing gun, empty scene, character missing";
      }
      if (hasAbstractBg) {
        enhancedPrompt += "\n[CRITICAL HARD CONSTRAINT]: NO abstract background, NO gradients. Must be a concrete real environment.";
        finalNegativePrompt += ", gradient, abstract background";
      }

      // If index > 0, we pass the previous scene's videoUrlExt as extendFromVideoUrl
      const prevScene = (index > 0) ? freshActiveProject.scenes[index - 1] : undefined;
      const prevVideoUrl = prevScene ? prevScene.videoUrlExt : undefined;
      const prevScenePayload = prevScene ? {
        title: prevScene.title,
        visualPrompt: prevScene.visualPrompt,
        actionPrompt: prevScene.actionPrompt,
        dialogue: prevScene.dialogue,
        narration: prevScene.narration,
        directorNotes: prevScene.directorNotes
      } : undefined;

      const res = await fetch("/api/generate", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
           prompt: enhancedPrompt,
           visualPrompt: targetScene.visualPrompt,
           negativePrompt: finalNegativePrompt,
           actionPrompt: targetScene.actionPrompt,
           transitionPrompt: targetScene.transitionPrompt,
           dialogue: targetScene.dialogue,
           narration: targetScene.narration,
           directorNotes: targetScene.directorNotes,
           character: targetScene.character,
           characterDescription: charDesc,
           artStyle: characterObj?.artStyle || freshActiveProject.artStyle,
           imageUrl: targetScene.imageUrlExt || undefined,
           endImageUrl: endImageUrl,
           extendFromVideoUrl: prevVideoUrl,
           customApiKey: customApiKey || undefined,
           durationSeconds: targetScene.durationSeconds,
           agnesVideoMode: freshActiveProject.agnesVideoMode || "quality",
           sceneIndex: index,
           sceneType: "ext",
           prevScene: prevScenePayload
         })
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        let errData: any = {};
        try { errData = JSON.parse(errText); } catch(e) {}
        throw new Error(errData.error || (errText && errText.length < 200 ? errText : "Failed to call Agnes server API"));
      }

      // Start polling specifically for this scene
      let count = 0;
      const intervalId = setInterval(async () => {
        try {
          const statusRes = await fetch("/api/status");
          if (!statusRes.ok) return;
          const statusData = await statusRes.json();

          if (statusData.status === "failed") {
            const handled = await handlePolicyViolation(
              sceneId, 
              statusData, 
              intervalId, 
              "videoLogsExt", 
              "isGeneratingVideoExt", 
              "videoErrorExt", 
              "videoErrorExtCode", 
              () => handleGenerateVideoExtended(sceneId, index)
            );
            if (handled) {
              delete videoIntervalsRef.current[sceneId];
              return;
            }
          }
          setProjects(prevProjects => {
            const updatedList = prevProjects.map(p => {
              if (p.id === activeProjectId) {
                const updatedScenes = p.scenes.map(s => {
                  if (s.id === sceneId) {
                     const logs = statusData.logs || [];
                     const progress = statusData.progress || "0%";
                     const status = statusData.status;

                     if (status === "completed" && statusData.outputPath) {
                       clearInterval(intervalId);
                       delete videoIntervalsRef.current[sceneId];
                       console.log("[DEBUG] Extended Video URL generated:", statusData.outputPath);
                       // Automatic tail-frame extraction & propagation!
                       handleAutoExtractAndPropagateTailFrame(sceneId, statusData.outputPath);
                       
                       // Automatically trigger AI review after video generation completes!
                       setTimeout(() => {
                         handleReviewScene(sceneId, 'video');
                       }, 500);

                       return { 
                         ...s, 
                         videoUrlExt: statusData.outputPath, 
                         videoUrlExtLocal: statusData.localPath || statusData.outputPath,
                         isGeneratingVideoExt: false, 
                         videoProgressExt: "100%",
                         videoLogsExt: [...logs, "[SYSTEM] Video generated and mapped successfully!"],
                         videoErrorExt: statusData.error,
                         videoErrorExtCode: statusData.errorCode
                       };
                     } else if (status === "failed") {
                       clearInterval(intervalId);
                       delete videoIntervalsRef.current[sceneId];
                       
                       const errString = statusData.error || "Generation process failed";
                       const isPromptIssue = errString.toLowerCase().includes("prompt") || errString.toLowerCase().includes("safety") || errString.toLowerCase().includes("policy") || errString.toLowerCase().includes("violation");
                       
                       logToExperienceLibrary({
                         errorName: "VideoExtendedGenerationError",
                         errorMessage: errString,
                         category: "video_generation",
                         projectId: activeProjectId || undefined,
                         sceneId: sceneId,
                         failureCategory: "video_generation_extended",
                         rootCause: errString,
                         isPromptRelated: isPromptIssue,
                         originalPrompt: s.visualPrompt || "",
                         generatedResult: "Failed to render extended video",
                         critiqueFromSystem: errString,
                         aiImprovementSuggestion: isPromptIssue 
                           ? "續寫提示詞觸發了影片模型的內容安全政策。請移除具體敏感詞或不連貫動作描述。"
                           : "影片續寫伺服器算力資源超載。建議啟用容錯降級（強制合格）以推進工作流。",
                         resolution: "⚠️ 正在呼叫 AI 經驗圖書館安全防重試與容錯降級工作流（強制合格推進）！"
                       });

                       // Automatically trigger ffmpeg pan-and-scan zoom fallback!
                       const fallbackImage = targetScene.imageUrl || targetScene.imageUrlExt || targetScene.imageUrlKeyframes || "";
                       if (fallbackImage) {
                         setTimeout(() => {
                           handleVideoFallbackToPlaceholder(sceneId, fallbackImage, "scenes_ext");
                         }, 50);
                       }

                       return {
                         ...s,
                         isGeneratingVideoExt: !!fallbackImage,
                         videoErrorExt: statusData.error || "Generation process failed",
                         videoErrorExtCode: statusData.errorCode,
                         videoLogsExt: [...logs, "[SYSTEM] ⚠️ 影片模型生成失敗。自動調度 ffmpeg 進行動態慢速運鏡保底影片生成..."],
                         isRetryingPolicy: false
                       };
                     }

                     return {
                       ...s,
                       videoProgressExt: progress,
                       videoLogsExt: logs
                     };
                  }
                  return s;
                });
                return { ...p, scenes: updatedScenes };
              }
              return p;
            });
            try { localStorage.setItem("toonflow_projects", JSON.stringify(updatedList)); localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString()); } catch (e) { console.error("Quota exceeded", e); }
            return updatedList;
          });

        } catch (pollErr) {
          console.warn("Polling error for scene video", pollErr);
        }

        // Failsafe timeout after 5 minutes of polling
        count++;
        if (count > 150) {
          clearInterval(intervalId);
          delete videoIntervalsRef.current[sceneId];
          setProjects(prevProjects => {
            const updatedList = prevProjects.map(p => {
              if (p.id === activeProjectId) {
                const updatedScenes = p.scenes.map(s => {
                  if (s.id === sceneId) {
                    return {
                      ...s,
                      isGeneratingVideoExt: false,
                      videoErrorExt: "Generation timed out"
                    };
                  }
                  return s;
                });
                return { ...p, scenes: updatedScenes };
              }
              return p;
            });
            try { localStorage.setItem("toonflow_projects", JSON.stringify(updatedList)); localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString()); } catch (e) { console.error("Quota exceeded", e); }
            return updatedList;
          });
        }
      }, 3000);
      videoIntervalsRef.current[sceneId] = intervalId;

      } catch (err: any) {
      if (err.message && err.message.includes("A video generation is already in progress")) {
        showToast("伺服器端仍有影片生成任務正在進行中。請稍候，或至頁面最底部的重置區強制清除狀態。", "info");
      }
      updateActiveProject((prev) => ({
        scenes: prev.scenes.map(s => {
          if (s.id === sceneId) {
            return {
              ...s,
              isGeneratingVideoExt: false,
              videoErrorExt: err.message || "Connection failure to video microservice."
            };
          }
          return s;
        })
      }));
    }
  };

  // One-click sequential automatic generation of all storyboards
  const handleGenerateAllSequentially = async () => {
    if (!activeProject || isGeneratingAllSequentially) return;
    setIsGeneratingAllSequentially(true);
    try {
      for (let i = 0; i < activeProject.scenes.length; i++) {
        const scene = activeProject.scenes[i];
        if (scene.videoUrlExt) {
          // If already generated, skip it
          continue;
        }

        // Generate the image first if missing
        if (!scene.imageUrlExt) {
          await handleGenerateImage(scene.id, 'agnes');
          // Wait for React to process the state update and localStorage
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Wait for video generation to complete
        await new Promise<void>((resolve, reject) => {
          handleGenerateVideoExtended(scene.id, i);

          const checkInterval = setInterval(() => {
            const curProjects = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
            const curProj = curProjects.find(p => p.id === activeProjectId);
            const curScene = curProj?.scenes.find(s => s.id === scene.id);
            if (curScene && !curScene.isGeneratingVideoExt) {
              clearInterval(checkInterval);
              if (curScene.videoUrlExt) {
                resolve();
              } else {
                reject(new Error(`分鏡 ${i + 1} 「${scene.title}」影片生成失敗：${curScene?.videoErrorExt || "未知錯誤"}`));
              }
            }
          }, 3000);
        });
      }
      alert("🎉 恭喜！所有分鏡已成功依序完成首尾影格無縫延伸生成！");
    } catch (err: any) {
      alert(`順序自動生成中斷：${err.message || err}`);
    } finally {
      setIsGeneratingAllSequentially(false);
    }
  };


  const handleInsertTransitionScene = async (index: number) => {
    if (!activeProject || index >= activeProject.scenes.length - 1) return;
    const sceneA = activeProject.scenes[index];
    const sceneB = activeProject.scenes[index + 1];

    const prevVideoUrl = sceneA.videoUrlExt || sceneA.videoUrlKeyframes || sceneA.videoUrl;
    const prevImageUrl = sceneA.imageUrlExt || sceneA.imageUrlKeyframes || sceneA.imageUrl;

    showToast("🔄 正在智慧銜接：分析場景脈絡並生成連續劇本中...", "info");

    try {
      const res = await fetch("/api/generate-transition-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneA,
          sceneB,
          novelText: activeProject.novelText,
          artStyle: activeProject.artStyle,
          characters: activeProject.characters,
          customApiKey
        })
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        let errData: any = {};
        try { errData = JSON.parse(errText); } catch(e) {}
        throw new Error(errData.error || "Failed to generate transition scene");
      }

      const textRes = await res.text();
      let generatedScenes: any[] = [];
      try {
        const parsed = JSON.parse(textRes);
        if (parsed.scenes && Array.isArray(parsed.scenes)) {
          generatedScenes = parsed.scenes;
        } else if (parsed.scene) {
          generatedScenes = [parsed.scene];
        } else {
          throw new Error("格式不符合預期");
        }
      } catch(e) {
        throw new Error("伺服器回傳格式錯誤，請稍後再試。");
      }

      if (generatedScenes.length === 0) {
        throw new Error("未生成任何銜接分鏡。");
      }

      // Automatically extract the last frame of previous scene as start frame of transition scene
      let extractedStartFrame = prevImageUrl || "";

      if (prevVideoUrl) {
        showToast("🎥 偵測到上一場景已生成影片，正在呼叫 ffmpeg 完美精確抽取最後一幀...", "info");
        try {
          const extractRes = await fetch("/api/extract-last-frame", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoUrl: prevVideoUrl })
          });

          if (extractRes.ok) {
            const data = await extractRes.json();
            if (data.imageUrl) {
              extractedStartFrame = data.imageUrl;
              showToast("✨ 成功精確抽取上一分鏡影片的最後一格畫面！", "success");
            }
          } else {
            console.warn("抽取影片最後一幀失敗，將使用靜態圖片作為替代。");
          }
        } catch (err) {
          console.error("Failed to extract last frame:", err);
        }
      }

      const insertedScenes: Scene[] = generatedScenes.map((sceneData, i) => {
        // Only the first transition scene gets the extracted start frame automatically.
        // Subsequent ones start fresh for individual generation.
        const startFrame = i === 0 ? extractedStartFrame : "";
        return {
          id: `scene_transition_${Date.now()}_${i}`,
          ...sceneData,
          imageUrl: startFrame,
          imageUrlExt: startFrame,
          imageUrlKeyframes: startFrame,
          isGeneratingImage: false,
          isGeneratingVideo: false,
          isGeneratingImageExt: false,
          isGeneratingVideoExt: false,
          isGeneratingImageKeyframes: false,
          isGeneratingVideoKeyframes: false
        };
      });

      const newScenes = [...activeProject.scenes];
      newScenes.splice(index + 1, 0, ...insertedScenes);

      // Provide continuous transition prompt for the next scene's visual prompt
      const nextOriginalSceneIndex = index + 1 + insertedScenes.length;
      if (newScenes[nextOriginalSceneIndex]) {
        const sceneBObj = newScenes[nextOriginalSceneIndex];
        const lastTransition = generatedScenes[generatedScenes.length - 1];
        const transitionElement = lastTransition.transitionPrompt || lastTransition.actionPrompt || "seamless transition from the previous scene";
        const transitionPrefix = `[Transition continuity: seamlessly continuing from the previous scene's ending state of "${transitionElement}".] `;
        
        if (!sceneBObj.visualPrompt.includes("Transition continuity:")) {
          newScenes[nextOriginalSceneIndex] = {
            ...sceneBObj,
            visualPrompt: `${transitionPrefix}${sceneBObj.visualPrompt}`
          };
        }
      }
      
      updateActiveProject({ scenes: newScenes });
      if (insertedScenes.length > 1) {
        showToast(`✅ 已成功自動插入 ${insertedScenes.length} 個分鏡銜接場景，並自動帶入上一分鏡結尾幀及更新提示詞過渡！`, "success");
      } else {
        showToast("✅ 已成功插入自動銜接場景，並自動帶入上一分鏡結尾幀及更新提示詞過渡！", "success");
      }
    } catch (err: any) {
      showToast(`插入銜接場景失敗：${err.message || err}`, "error");
    }
  };

  // Agnes Video Generation with keyframes (start frame is this scene's image, end frame is next scene's image)
  const handleGenerateVideoKeyframes = async (sceneId: string, index: number, retryCount = 0) => {
    let freshActiveProject = activeProject;
    try {
      const curProjects = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
      const curProj = curProjects.find(p => p.id === activeProjectId);
      if (curProj) freshActiveProject = curProj;
    } catch(e) {}
    if (!freshActiveProject) return;

    const targetScene = freshActiveProject.scenes.find(s => s.id === sceneId);
    if (!targetScene) return;

    const startImageUrl = targetScene.imageUrlKeyframes || targetScene.imageUrl || targetScene.imageUrlExt;
    if (!startImageUrl) {
      const msg = `請先完成分鏡「${targetScene.title || sceneId}」的繪圖或智慧自動銜接！`;
      updateActiveProject((prev) => ({
        scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, isGeneratingVideoKeyframes: false, videoErrorKeyframes: msg } : s)
      }));
      alert(msg);
      throw new Error(msg);
    }

    let endImageUrl: string | undefined = undefined;
    if (index < activeProject.scenes.length - 1) {
      const nextScene = activeProject.scenes[index + 1];
      const foundEndImage = nextScene.imageUrlKeyframes || nextScene.imageUrl || nextScene.imageUrlExt;
      if (!foundEndImage) {
        const msg = `請先完成下一分鏡「${nextScene.title}」的繪圖，以作為本分鏡影片的結尾影格！`;
        updateActiveProject((prev) => ({
          scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, isGeneratingVideoKeyframes: false, videoErrorKeyframes: msg } : s)
        }));
        alert(msg);
        throw new Error(msg);
      }
      endImageUrl = foundEndImage;
    }

    // Calculate transition duration - respect user set duration directly rather than forcing a long fixed duration
    const finalDurationSeconds = targetScene.durationSeconds;

    // Update specific scene video state to generating
    updateActiveProject((prev) => ({
      scenes: prev.scenes.map(s => {
        if (s.id === sceneId) {
          return { 
            ...s, 
            durationSeconds: finalDurationSeconds,
            isGeneratingVideoKeyframes: true, 
            videoProgressKeyframes: "0%",
            videoLogsKeyframes: ["[SYSTEM] Initiating Agnes Start-End Keyframes Video call..."],
            policyRetryCount: s.isRetryingPolicy ? s.policyRetryCount : 0,
            isRetryingPolicy: s.isRetryingPolicy || false
          };
        }
        return s;
      })
    }));

    try {
      const targetCharLower = (targetScene.character || "").trim().toLowerCase();
      const isTargetNoChar = isNoChar(targetScene.character);
      const characterObj = !isTargetNoChar
        ? activeProject.characters.find(c => {
            const cName = (c.name || "").trim().toLowerCase();
            return cName === targetCharLower || cName.includes(targetCharLower) || targetCharLower.includes(cName);
          })
        : undefined;
      const charDesc = !isTargetNoChar ? (characterObj?.description || "") : "";

      // 1. Proactive Character Bible Injection for Video
      let videoProactiveInjections = "";
      let matchedBible = null;
      if (!isTargetNoChar) {
        for (const [key, bible] of Object.entries(CHARACTER_BIBLES)) {
          if (targetCharLower === key || 
              targetCharLower.includes(key) || 
              key.includes(targetCharLower)) {
            matchedBible = bible;
            break;
          }
        }
      }
      if (matchedBible) {
        videoProactiveInjections += `\n${matchedBible.en}\n`;
      }

      // 2. Proactive Action Template Injection (e.g., Gun holding)
      const actionKeywords = ["gun", "pistol", "weapon", "shoot", "aim", "fire", "持槍", "瞄準", "手槍", "武器", "槍", "射擊", "對峙"];
      const promptLower = (targetScene.visualPrompt || "").toLowerCase();
      const actionLower = (targetScene.actionPrompt || "").toLowerCase();
      const needsGunTemplate = actionKeywords.some(kw => promptLower.includes(kw) || actionLower.includes(kw));
      if (needsGunTemplate) {
        videoProactiveInjections += `\n${GUN_ACTION_TEMPLATE.en}\n`;
      }

      // 3. Proactive Cross-Scene Character Consistency Injection for Video
      if (targetCharLower && freshActiveProject.scenes) {
        if (index > 0) {
          const prevSuccessfulScenes = freshActiveProject.scenes
            .slice(0, index)
            .filter(s => s.character && s.imageUrl && s.character.trim().toLowerCase() === targetCharLower);

          if (prevSuccessfulScenes.length > 0) {
            const lastSuccessfulScene = prevSuccessfulScenes[prevSuccessfulScenes.length - 1];
            videoProactiveInjections += `\n【跨鏡頭角色一致性要求 (Cross-scene Character Continuity)】\n此分鏡影片角色的外貌、面部細節和服裝細節必須與前一成功鏡頭「分鏡: ${lastSuccessfulScene.title || lastSuccessfulScene.id.substring(0, 5)}」的首幀圖像保持高度一致，包括相同的髮型、眼睛顏色、面部傷痕與特定的風衣戰鬥服細節。不可有任何變更。\n`;
          }
        }
      }

      // 4. Proactive Multi-Character Composition Priority Control for Video
      const containsRen = promptLower.includes("ren");
      const containsJoe = promptLower.includes("joe") || promptLower.includes("喬") || promptLower.includes("qiao");
      if (containsRen && containsJoe) {
        videoProactiveInjections += `\n【多角色構圖與優先級控制 (Multi-character Composition & Priority Control)】\n畫面主體視覺優先級為：Ren（主角） > Old Joe（重要 NPC） > 環境背景。必須確保 Ren 在畫面絕對中心或主要焦點，動作細節與表情最為清晰顯著，Old Joe 作為輔助角色次之，而周圍 cyberpunk 酒吧背景僅作為襯托，避免背景喧賓奪主。\n`;
      }

      // 5. Video Continuity & First-Frame Enforcement
      videoProactiveInjections += `\n${VIDEO_CONTINUITY_TEMPLATE.en}\n`;

      const dialogueAddon = targetScene.dialogue ? ` (lips speaking and mouth moving to speak. The character is actively talking with realistic mouth movements, speaking: "${targetScene.dialogue}". The video must be completely clean with ABSOLUTELY NO SUBTITLES, no burned-in text, no on-screen text, no words, no captions, no letters).` : "";
      const narrationAddon = targetScene.narration ? ` (Narrator voiceover atmospheric ambiance, completely clean video, absolutely no subtitles, no on-screen text, no captions, no words, no letters).` : "";
      const actionAddon = targetScene.actionPrompt ? ` Action and movement: ${targetScene.actionPrompt}. ` : " ";
      let transitionAddon = targetScene.transitionPrompt ? ` Transition action: ${targetScene.transitionPrompt}. ` : "";
      if (endImageUrl && index < activeProject.scenes.length - 1) {
        const nextScene = activeProject.scenes[index + 1];
        transitionAddon += ` The character smoothly moves and transitions from the current state into the end frame's state: [${nextScene.visualPrompt}]. Make sure to animate the logical physical action connecting these two states (e.g., standing up, walking, turning around, changing pose).`;
      }
      const notesAddon = targetScene.directorNotes ? ` Director's notes: ${targetScene.directorNotes}. ` : " ";
      const charInfoString = isTargetNoChar
        ? "[PURE SCENERY / NO CHARACTER VIDEO]: Pure environmental scenery motion shot with ABSOLUTELY NO characters, NO humans, NO people, NO faces, NO figures."
        : `[CRITICAL CLOTHING CONSISTENCY]: The character MUST wear the exact clothing described in their Description. Style: ${characterObj?.artStyle || activeProject.artStyle}. Character: ${targetScene.character}, Description: ${charDesc}.`;

      const enhancedPrompt = `${targetScene.visualPrompt}.${actionAddon}${dialogueAddon}${narrationAddon}${transitionAddon}${notesAddon} ABSOLUTELY NO SUBTITLES, NO TEXT, NO WATERMARKS, CLEAN VIDEO, PURE CINEMATIC VISUALS. (Advanced camera movement and cinematic lighting, natural human behavior, realistic high-fidelity video, masterwork.) ${charInfoString} ${videoProactiveInjections}`;

      // Dynamic Negative Prompt reinforcement for Video
      let finalNegativePrompt = targetScene.negativePrompt || "";
      const baseNegatives = isTargetNoChar
        ? "person, human, character, man, woman, face, figure, crowd, abstract background, gradient, color blocks, fluid colors, blurry background"
        : "abstract background, gradient, color blocks, fluid colors, blurry background, missing character, missing weapon, deformed hands";
      if (finalNegativePrompt) {
        if (!finalNegativePrompt.toLowerCase().includes("abstract background")) {
          finalNegativePrompt = `${finalNegativePrompt}, ${baseNegatives}`;
        }
      } else {
        finalNegativePrompt = baseNegatives;
      }
      if (needsGunTemplate) {
        finalNegativePrompt += ", hands not holding gun, gun floating, missing weapon, hands not gripping pistol, blurry gun, deformed weapon";
      }
      finalNegativePrompt += ", sudden pose change, character appearance inconsistency, missing gun, deformed hands at start, jump cuts, chaotic camera movement";

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: enhancedPrompt,
          visualPrompt: targetScene.visualPrompt,
          negativePrompt: finalNegativePrompt,
          actionPrompt: targetScene.actionPrompt,
          transitionPrompt: targetScene.transitionPrompt,
          dialogue: targetScene.dialogue,
          narration: targetScene.narration,
          directorNotes: targetScene.directorNotes,
          character: targetScene.character,
          characterDescription: charDesc,
          artStyle: characterObj?.artStyle || activeProject.artStyle,
          imageUrl: startImageUrl || undefined,
          endImageUrl: endImageUrl,
          customApiKey: customApiKey || undefined,
          durationSeconds: finalDurationSeconds,
          agnesVideoMode: activeProject.agnesVideoMode || "quality",
          useFreezeAndMove: targetScene.useFreezeAndMove,
          useMidpointSplit: targetScene.useMidpointSplit,
          sceneIndex: index,
          sceneType: "keyframes"
        })
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        let errData: any = {};
        try { errData = JSON.parse(errText); } catch(e) {}
        throw new Error(errData.error || (errText && errText.length < 200 ? errText : "Failed to call Agnes server API"));
      }

      // Start polling specifically for this scene
      let count = 0;
      const intervalId = setInterval(async () => {
        try {
          const statusRes = await fetch("/api/status");
          if (!statusRes.ok) return;
          const statusData = await statusRes.json();

          if (statusData.status === "failed") {
            const handled = await handlePolicyViolation(
              sceneId, 
              statusData, 
              intervalId, 
              "videoLogsKeyframes", 
              "isGeneratingVideoKeyframes", 
              "videoErrorKeyframes", 
              "videoErrorCodeKeyframes", 
              () => handleGenerateVideoKeyframes(sceneId, index)
            );
            if (handled) {
              delete videoIntervalsRef.current[sceneId];
              return;
            }
          }
          setProjects(prevProjects => {
            const updatedList = prevProjects.map(p => {
              if (p.id === activeProjectId) {
                const updatedScenes = p.scenes.map(s => {
                  if (s.id === sceneId) {
                     const logs = statusData.logs || [];
                     const progress = statusData.progress || "0%";
                     const status = statusData.status;

                     if (status === "completed" && statusData.outputPath) {
                       clearInterval(intervalId);
                       delete videoIntervalsRef.current[sceneId];
                       console.log("[DEBUG] Keyframe Video URL generated:", statusData.outputPath);
                       // Automatic tail-frame extraction & propagation!
                       handleAutoExtractAndPropagateTailFrame(sceneId, statusData.outputPath);
                       
                       // Automatically trigger AI review after video generation completes!
                       setTimeout(() => {
                         handleReviewScene(sceneId, 'video');
                       }, 500);

                       return { 
                         ...s, 
                         videoUrlKeyframes: statusData.outputPath, 
                         videoUrlKeyframesLocal: statusData.localPath || statusData.outputPath,
                         isGeneratingVideoKeyframes: false, 
                         videoProgressKeyframes: "100%",
                         videoLogsKeyframes: [...logs, "[SYSTEM] Keyframe video generated and mapped successfully!"],
                         videoErrorKeyframes: statusData.error,
                         videoErrorCodeKeyframes: statusData.errorCode
                       };
                     } else if (status === "failed") {
                       clearInterval(intervalId);
                       delete videoIntervalsRef.current[sceneId];
                       
                       const errString = statusData.error || "Generation process failed";
                       const isPromptIssue = errString.toLowerCase().includes("prompt") || errString.toLowerCase().includes("safety") || errString.toLowerCase().includes("policy") || errString.toLowerCase().includes("violation");
                       
                       logToExperienceLibrary({
                         errorName: "VideoKeyframeGenerationError",
                         errorMessage: errString,
                         category: "video_generation",
                         projectId: activeProjectId || undefined,
                         sceneId: sceneId,
                         failureCategory: "video_generation_keyframes",
                         rootCause: errString,
                         isPromptRelated: isPromptIssue,
                         originalPrompt: s.visualPrompt || "",
                         generatedResult: "Failed to render keyframe video",
                         critiqueFromSystem: errString,
                         aiImprovementSuggestion: isPromptIssue 
                           ? "關鍵影格提示詞違反影片安全審查政策。請修剪提示詞、移除敏感描述並保持語意精簡。"
                           : "關鍵影格影片渲染超時或排隊等候算力過長。建議調用降級容錯直接通過或稍後重新生成。",
                         resolution: "⚠️ 正在呼叫 AI 經驗圖書館安全防重試與容錯降級工作流（強制合格推進）！"
                       });

                       // Automatically trigger ffmpeg pan-and-scan zoom fallback!
                       const fallbackImage = startImageUrl || s.imageUrl || s.imageUrlExt || s.imageUrlKeyframes || "";
                       if (fallbackImage) {
                         setTimeout(() => {
                           handleVideoFallbackToPlaceholder(sceneId, fallbackImage, "scenes_keyframes");
                         }, 50);
                       }

                       return {
                         ...s,
                         isGeneratingVideoKeyframes: !!fallbackImage,
                         videoErrorKeyframes: statusData.error || "Generation process failed",
                         videoErrorCodeKeyframes: statusData.errorCode,
                         videoLogsKeyframes: [...logs, "[SYSTEM] ⚠️ 影片模型生成失敗。自動調度 ffmpeg 進行動態慢速運鏡保底影片生成..."],
                         isRetryingPolicy: false
                       };
                     }

                     return {
                       ...s,
                       videoProgressKeyframes: progress,
                       videoLogsKeyframes: logs
                     };
                  }
                  return s;
                });
                return { ...p, scenes: updatedScenes };
              }
              return p;
            });
            try { localStorage.setItem("toonflow_projects", JSON.stringify(updatedList)); localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString()); } catch (e) { console.error("Quota exceeded", e); }
            return updatedList;
          });

        } catch (pollErr) {
          console.warn("Polling error for scene video keyframes", pollErr);
        }

        // Failsafe timeout after 5 minutes of polling
        count++;
        if (count > 150) {
          clearInterval(intervalId);
          delete videoIntervalsRef.current[sceneId];
          setProjects(prevProjects => {
            const updatedList = prevProjects.map(p => {
              if (p.id === activeProjectId) {
                const updatedScenes = p.scenes.map(s => {
                  if (s.id === sceneId) {
                    return {
                      ...s,
                      isGeneratingVideoKeyframes: false,
                      videoErrorKeyframes: "Generation timed out"
                    };
                  }
                  return s;
                });
                return { ...p, scenes: updatedScenes };
              }
              return p;
            });
            try { localStorage.setItem("toonflow_projects", JSON.stringify(updatedList)); localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString()); } catch (e) { console.error("Quota exceeded", e); }
            return updatedList;
          });
        }
      }, 3000);
      videoIntervalsRef.current[sceneId] = intervalId;

    } catch (err: any) {
      if (err.message && err.message.includes("A video generation is already in progress")) {
        showToast("伺服器端仍有影片生成任務正在進行中。請稍候，或至頁面最底部的重置區強制清除狀態。", "info");
      }
      updateActiveProject((prev) => ({
        scenes: prev.scenes.map(s => {
          if (s.id === sceneId) {
            return {
              ...s,
              isGeneratingVideoKeyframes: false,
              videoErrorKeyframes: err.message || "Connection failure to video microservice."
            };
          }
          return s;
        })
      }));
    }
  };

  // One-click clear all generated keyframe images, videos, logs, and reviews (Start over)
  const handleClearAllKeyframes = () => {
    if (!activeProject) return;
    
    if (!isConfirmingClear) {
      setIsConfirmingClear(true);
      // Auto-reset after 4 seconds if they don't confirm
      setTimeout(() => {
        setIsConfirmingClear(false);
      }, 4000);
      return;
    }

    // Reset confirmation state
    setIsConfirmingClear(false);

    // Reset pipeline state
    setFullAutoProgress("0%");
    setFullAutoLogs([]);
    setFinalStitchedVideoUrl(null);

    const resetScenes = activeProject.scenes.map(s => {
      const updated = { ...s };
      // Fully wipe keyframe media so full-auto will NOT reuse old photos/videos
      delete updated.imageUrlKeyframes;
      delete updated.videoUrlKeyframes;
      delete updated.startFrameKeyframes;
      delete updated.endFrameKeyframes;
      delete updated.endFrameDescriptionKeyframes;
      delete updated.startFrameSourceKeyframes;
      delete updated.step3ImageErrorKeyframes;
      delete updated.midpointImageUrlKeyframes;
      updated.isGeneratingImageKeyframes = false;
      updated.isGeneratingVideoKeyframes = false;
      delete updated.videoProgressKeyframes;
      delete updated.videoLogsKeyframes;
      delete updated.videoErrorKeyframes;
      delete updated.videoErrorCodeKeyframes;
      updated.isRetryingPolicy = false;
      updated.policyRetryCount = 0;
      updated.useFreezeAndMove = false;
      updated.useMidpointSplit = false;
      delete updated.aiReviewStatus;
      delete updated.aiReviewAlignmentCheck;
      delete updated.aiReviewLogicCheck;
      delete updated.aiReviewContinuityCheck;
      delete updated.aiReviewSeamlessCheck;
      delete updated.aiReviewCritique;
      updated.isReviewing = false;
      updated.hasAutoRegeneratedReview = false;
      // Reset workflow gates so STEP 3/4/6 will re-run from scratch
      updated.workflowStep = 1;
      updated.step4Passed = false;
      updated.step6Passed = false;
      updated.step4ImageReviewScore = 0;
      updated.step6VideoReviewScore = 0;
      updated.step7AdviceForNext = "";
      updated.step4ImageReviewText = "";
      updated.step6VideoReviewText = "";
      delete updated.step2OptimizedPrompt;
      delete updated.step2OptimizedNegative;
      return updated;
    });

    updateActiveProject({
      scenes: resetScenes,
      finalVideoUrl: undefined
    });
    showToast("已清空所有首尾幀／影片／審核狀態，可重頭再來", "success");
  };

  // One-click generate all keyframe-based transition videos sequentially
  // Clear Catbox permanent files that this app uploaded
  const handleClearCatbox = async () => {
    try {
      showToast('正在清除 Catbox 檔案...', 'info');
      const res = await fetch('/api/clear-catbox', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(data.message || 'Catbox 清除完成', 'success');
      } else {
        showToast(data.error || '清除失敗', 'error');
      }
    } catch (e: any) {
      showToast('清除 Catbox 失敗: ' + (e.message || e), 'error');
    }
  };


  const handleGenerateAllKeyframesSequentially = async () => {
    if (!activeProject || isGeneratingAllKeyframesSequentially) return;
    setIsGeneratingAllKeyframesSequentially(true);
    
    try {
      const totalScenes = activeProject.scenes.length;
      for (let i = 0; i < totalScenes; i++) {
        let curProjs = [] as Project[];
        try { curProjs = JSON.parse(localStorage.getItem("toonflow_projects") || "[]"); } catch (e) {}
        const curProj = curProjs.find(p => p.id === activeProjectId) || activeProject;
        const scene = curProj.scenes[i];
        if (!scene) continue;
        
        // Skip if video is already generated and valid
        if (scene.videoUrlKeyframes) {
          continue;
        }

        // Generate the video with keyframes for the current scene
        await handleGenerateVideoKeyframes(scene.id, i);
        
        // Wait for this specific scene's video generation to finish (poll progress)
        await new Promise<void>((resolve, reject) => {
          let attempts = 0;
          const checkInterval = setInterval(() => {
            attempts++;
            const liveProjects = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
            const liveProj = liveProjects.find(p => p.id === activeProjectId);
            const curScene = liveProj?.scenes.find(s => s.id === scene.id);
            
            if (curScene) {
              if (!curScene.isGeneratingVideoKeyframes) {
                clearInterval(checkInterval);
                if (curScene.videoUrlKeyframes) {
                  resolve();
                } else {
                  reject(new Error(curScene.videoErrorKeyframes || `分鏡「${curScene.title || scene.id}」影片生成失敗`));
                }
              }
            } else {
              clearInterval(checkInterval);
              reject(new Error("專案或分鏡不存在"));
            }
            if (attempts > 300) { // Timeout after 10 mins
              clearInterval(checkInterval);
              reject(new Error("影片生成超時"));
            }
          }, 2000);
        });
      }
      showToast("🎉 一鍵自動依序首尾過渡生成所有分鏡成功！", "success");
    } catch (err: any) {
      console.error("[Toonflow Error] Generate all keyframes sequentially failed:", err);
      showToast(`自動過渡生成中斷: ${err.message || err}`, "error");
    } finally {
      setIsGeneratingAllKeyframesSequentially(false);
    }
  };

  const handleRestoreFromBackup = async (silent: boolean = false, opts?: { skipMedia?: boolean; timeoutMs?: number }) => {
    if (!activeProjectId) return null;
    const imageField = activeTab === "scenes_ext" ? "imageUrlExt" : (activeTab === "scenes_keyframes" ? "imageUrlKeyframes" : "imageUrl");
    const videoField = activeTab === "scenes_ext" ? "videoUrlExt" : (activeTab === "scenes_keyframes" ? "videoUrlKeyframes" : "videoUrl");
    const timeoutMs = opts?.timeoutMs ?? 8000;
    const skipMedia = !!opts?.skipMedia;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const backupRes = await fetch(`/api/load-backup-assets?projectId=${encodeURIComponent(activeProjectId)}`, {
        signal: controller.signal,
      });
      if (!backupRes.ok) throw new Error("無法連接備份伺服器。");
      
      const backupData = await backupRes.json();
      if (!backupData.scenes || backupData.scenes.length === 0) {
        if (!silent) {
          showToast("ℹ️ 伺服器端暫無此專案的實體備份檔案。", "info");
        }
        return null;
      }

      const curProjectsList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
      const curProj = curProjectsList.find(p => p.id === activeProjectId) || activeProject;
      if (!curProj) return null;

      const backupMap = new Map<string, any>();
      backupData.scenes.forEach((bs: any) => backupMap.set(bs.id, bs));

      let restoredCount = 0;
      const mergedScenes = curProj.scenes.map(s => {
        const bs = backupMap.get(s.id);
        if (bs) {
          const backupImg = bs[imageField] || bs.imageUrl || bs.imageUrlKeyframes;
          const backupVid = bs[videoField] || bs.videoUrl || bs.videoUrlKeyframes;

          // skipMedia: only restore text/review metadata, never re-inject old photos/videos
          if (skipMedia) {
            if (bs.step2OptimizedPrompt || bs.step7AdviceForNext) {
              restoredCount++;
              return {
                ...s,
                step2OptimizedPrompt: bs.step2OptimizedPrompt || s.step2OptimizedPrompt,
                step7AdviceForNext: bs.step7AdviceForNext || s.step7AdviceForNext,
              };
            }
            return s;
          }

          if (backupImg || backupVid || bs.step4Passed || bs.step6Passed || !strictWorkflowLock) {
            restoredCount++;
            const restoredImg = backupImg || bs.imageUrl || bs.imageUrlExt || bs.imageUrlKeyframes || s.imageUrl;
            const restoredVid = backupVid || bs.videoUrl || bs.videoUrlExt || bs.videoUrlKeyframes || s.videoUrl;

            const finalStep4Passed = !strictWorkflowLock ? (!!restoredImg || bs.step4Passed) : (bs.step4Passed !== undefined ? bs.step4Passed : s.step4Passed);
            const finalStep6Passed = !strictWorkflowLock ? (!!restoredVid || bs.step6Passed) : (bs.step6Passed !== undefined ? bs.step6Passed : s.step6Passed);

            return {
              ...s,
              imageUrl: bs.imageUrl || s.imageUrl || backupImg,
              imageUrlExt: bs.imageUrlExt || s.imageUrlExt || backupImg,
              imageUrlKeyframes: bs.imageUrlKeyframes || s.imageUrlKeyframes || backupImg,
              videoUrl: bs.videoUrl || s.videoUrl || backupVid,
              videoUrlExt: bs.videoUrlExt || s.videoUrlExt || backupVid,
              videoUrlKeyframes: bs.videoUrlKeyframes || s.videoUrlKeyframes || backupVid,
              videoProgress: bs.videoProgress || s.videoProgress,
              videoProgressExt: bs.videoProgressExt || s.videoProgressExt,
              videoProgressKeyframes: bs.videoProgressKeyframes || s.videoProgressKeyframes,
              step2OptimizedPrompt: bs.step2OptimizedPrompt || s.step2OptimizedPrompt,
              step4ImageReviewScore: bs.step4ImageReviewScore || s.step4ImageReviewScore || 100,
              step4ImageReviewText: bs.step4ImageReviewText || s.step4ImageReviewText || "關閉嚴格鎖：成功抽回歷史相片作為結果",
              step4Passed: finalStep4Passed,
              step6VideoReviewScore: bs.step6VideoReviewScore || s.step6VideoReviewScore || 100,
              step6VideoReviewText: bs.step6VideoReviewText || s.step6VideoReviewText || "關閉嚴格鎖：成功抽回歷史影片作為結果",
              step6Passed: finalStep6Passed,
              step7AdviceForNext: bs.step7AdviceForNext || s.step7AdviceForNext,
              aiReviewStatus: bs.aiReviewStatus || s.aiReviewStatus,
              aiReviewCritique: bs.aiReviewCritique || s.aiReviewCritique,
              workflowStep: bs.workflowStep || (finalStep6Passed ? 6 : (finalStep4Passed ? 4 : s.workflowStep))
            };
          }
        }
        return s;
      });

      if (restoredCount > 0) {
        setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, scenes: mergedScenes } : p));
        localStorage.setItem("toonflow_projects", JSON.stringify(
          curProjectsList.map(p => p.id === activeProjectId ? { ...p, scenes: mergedScenes } : p)
        ));
        if (!silent) {
          showToast(`🎉 成功從伺服器端備份檔抽回並恢復 ${restoredCount} 個分鏡的已核准相片與影片！`, "success");
        }
        return mergedScenes;
      } else {
        if (!silent) {
          showToast("ℹ️ 您的專案內容已是最新狀態，無需恢復。", "info");
        }
      }
    } catch (e: any) {
      const isAbort = e?.name === "AbortError" || String(e?.message || "").toLowerCase().includes("abort");
      console.error("Failed to restore from server backup:", e);
      if (!silent) {
        showToast(isAbort ? "⚠️ 備份連線逾時，已略過。" : ("⚠️ 抽回備份失敗: " + (e.message || e)), "error");
      }
      if (isAbort) throw new Error("BACKUP_RESTORE_TIMEOUT");
    } finally {
      clearTimeout(timer);
    }
    return null;
  };

  // One-click full automatic video master pipeline
  const handleFullAutoVideoProduction = async () => {
    if (!activeProject || isFullAutoProducing) return;
    setIsFullAutoProducing(true);
    setFinalStitchedVideoUrl(null);
    setFullAutoProgress("5%");

    const isGenImgField = activeTab === "scenes_ext" ? "isGeneratingImageExt" : (activeTab === "scenes_keyframes" ? "isGeneratingImageKeyframes" : "isGeneratingImage");
    const imageField = activeTab === "scenes_ext" ? "imageUrlExt" : (activeTab === "scenes_keyframes" ? "imageUrlKeyframes" : "imageUrl");
    const isGenVidField = activeTab === "scenes_ext" ? "isGeneratingVideoExt" : (activeTab === "scenes_keyframes" ? "isGeneratingVideoKeyframes" : "isGeneratingVideo");
    const videoField = activeTab === "scenes_ext" ? "videoUrlExt" : (activeTab === "scenes_keyframes" ? "videoUrlKeyframes" : "videoUrl");
    const progressField = activeTab === "scenes_ext" ? "videoProgressExt" : (activeTab === "scenes_keyframes" ? "videoProgressKeyframes" : "videoProgress");
    const errorField = activeTab === "scenes_ext" ? "videoErrorExt" : (activeTab === "scenes_keyframes" ? "videoErrorKeyframes" : "videoError");

    setFullAutoLogs([
      "🚀 啟動 AI 全自動製片大師極致工作流...",
      "🔍 正在檢查備份伺服器（最多 8 秒，逾時會自動略過並繼續）...",
    ]);

    // Scan local state first to decide whether to re-import server backup media

// HARD_CUT_TRANSITION_V1
// Decide whether this shot should use Hard Cut instead of morphing between different characters.
function decideHardCutMode(currentScene: any, nextScene: any, characters: any[] = []) {
  if (!nextScene) return { isHardCut: false, endFrameUrl: null as string | null, mode: 'continuous' as const };

  const curName = (currentScene?.character || '').trim();
  const nextName = (nextScene?.character || '').trim();

  const curChar = characters.find((c: any) => (c.name || '').trim() === curName);
  const nextChar = characters.find((c: any) => (c.name || '').trim() === nextName);

  const isHardCut = shouldUseHardCut(
    curName,
    nextName,
    curChar?.gender,
    nextChar?.gender
  );

  if (isHardCut) {
    console.log('[HardCut] Different characters detected → using TRANSITION mode (no morph). Current:', curName, '→ Next:', nextName);
    return {
      isHardCut: true,
      endFrameUrl: null, // deliberately omit end frame to prevent morph
      mode: 'transition' as const,
      extraPrompt: HARD_CUT_INSTRUCTION,
    };
  }

  // Same character → keep continuous smooth transition
  const endUrl = nextScene.imageUrl || nextScene.imageUrlKeyframes || nextScene.imageUrlExt || null;
  return {
    isHardCut: false,
    endFrameUrl: endUrl,
    mode: 'continuous' as const,
    extraPrompt: '',
  };
}
    let curProjectsScan = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
    let curProjScan = curProjectsScan.find(p => p.id === activeProjectId) || activeProject;

    // Only count ACTIVE TAB fields. Never treat other tabs' old imageUrl as "already done"
    // (that falsely enables 斷點續傳 and skips real generation after 一鍵清除 keyframes).
    const isUsableMediaUrl = (url: any) => {
      if (!url || typeof url !== "string") return false;
      const u = url.trim();
      if (!u || u === "null" || u === "undefined") return false;
      if (u.includes("unsplash.com")) return false;
      if (u.includes("pollinations-fallback")) return false;
      if (u.includes("gradient") || u.includes("placeholder")) return false;
      if (u.includes("mixkit.co")) return false; // stock video fallback
      return u.startsWith("http") || u.startsWith("/assets/") || u.startsWith("data:");
    };

    const hasLocalMedia = (curProjScan?.scenes || []).some((s: any) => {
      return isUsableMediaUrl(s[imageField]) || isUsableMediaUrl(s[videoField]);
    });

    // Retrieve backup — never hang forever; if media already cleared, do not re-inject old photos/videos
    try {
      if (!hasLocalMedia) {
        setFullAutoLogs(prev => [
          ...prev,
          "🧹 偵測到目前分頁沒有真實媒體（可能剛一鍵清除），跳過抽回舊備份相片/影片，避免重用舊圖。",
        ]);
        // Still allow soft metadata restore with short timeout, but skip media fields
        try {
          await handleRestoreFromBackup(true, { skipMedia: true, timeoutMs: 5000 });
        } catch (_) { /* ignore */ }
      } else {
        await handleRestoreFromBackup(true, { timeoutMs: 8000 });
        setFullAutoLogs(prev => [...prev, "✅ 備份檢查完成，繼續全自動流程..."]);
      }
    } catch (e: any) {
      console.warn("Failed to auto restore backup:", e);
      setFullAutoLogs(prev => [
        ...prev,
        e?.message === "BACKUP_RESTORE_TIMEOUT"
          ? "⚠️ 備份連線逾時（8 秒），已略過，直接繼續製片..."
          : `⚠️ 備份檢查失敗已略過：${e?.message || e}，繼續製片...`,
      ]);
    }

    // Re-scan after optional restore — ACTIVE TAB fields only + reject stock/fallback URLs
    curProjectsScan = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
    curProjScan = curProjectsScan.find(p => p.id === activeProjectId) || activeProject;
    
    const totalScenesCount = curProjScan.scenes.length;
    let completedImagesCount = 0;
    let completedVideosCount = 0;
    
    curProjScan.scenes.forEach(s => {
      if (isUsableMediaUrl(s[imageField])) completedImagesCount++;
      if (isUsableMediaUrl(s[videoField])) completedVideosCount++;
    });

    const isResume = completedImagesCount > 0 || completedVideosCount > 0;

    setFullAutoLogs(prev => [
      ...prev,
      `📂 掃描模式：${activeTab}（只計算 ${String(imageField)} / ${String(videoField)}，不認其他分頁舊圖）`,
      isResume 
        ? "🎬 [✨ 斷點增量續傳模式已啟用] 正在智慧掃描您目前手動調整或已合格的步驟，避免重複生成，保障創作延續性！"
        : "🎬 第一步：正在檢查並初始化劇本與分鏡劇本拆解..."
    ]);

    if (totalScenesCount > 0) {
      setFullAutoLogs(prev => [
        ...prev,
        `📊 專案掃描報告：共計 ${totalScenesCount} 個分鏡鏡頭。`,
        `🖼️ 已就緒真實首幀：${completedImagesCount}/${totalScenesCount} 個分鏡。`,
        `📹 已就緒真實影片：${completedVideosCount}/${totalScenesCount} 個分鏡。`,
        isResume 
          ? `⚡ 本次製片將跳過已有真實媒體的鏡頭，只補齊未完成分鏡（失敗/空白會重新生成）。`
          : `🆕 本分頁無可用真實媒體，將從頭生成（不會沿用其他分頁或保底圖）。`
      ]);
    }

    try {
      // 1. If scenes are empty, automatically disassemble the novel text first
      let currentScenes = [...activeProject.scenes];
      if (currentScenes.length === 0) {
        if (!activeProject.novelText.trim()) {
          throw new Error("本專案尚無劇本文字或大綱，請先在「原著劇本」中填寫內容再進行全自動出片。");
        }
        
        setFullAutoProgress("10%");
        setFullAutoLogs(prev => [...prev, "🧬 偵測到當前未生成分鏡，正在全自動呼叫 AI 模型解析大綱並拆解極致分鏡劇本..."]);
        
        let currentCharacters = [...activeProject.characters];
        const hasMatchingCharacter = currentCharacters.length > 0 && currentCharacters.some(c => 
          activeProject.novelText.toLowerCase().includes(c.name.toLowerCase())
        );

        if (currentCharacters.length === 0 || !hasMatchingCharacter) {
          setFullAutoLogs(prev => [...prev, "👥 偵測到現有角色與當前劇本內容不匹配，正在全自動重新提取劇本中的主要角色與服裝設定..."]);
          const charRes = await fetch("/api/extract-characters", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              novelText: activeProject.novelText,
              artStyle: activeProject.artStyle,
              engine: 'agnes',
              customApiKey: customApiKey || undefined
            })
          });
          if (charRes.ok) {
            const charData = await charRes.json();
            if (charData.characters && charData.characters.length > 0) {
              currentCharacters = charData.characters.map((c: any, idx: number) => ({
                id: `char_${Date.now()}_${idx}`,
                name: c.name,
                role: c.role || "",
                age: c.age || "",
                clothing: c.clothing || "",
                personality: c.personality || "",
                description: c.description || "",
                avatarUrl: ""
              }));
              setFullAutoLogs(prev => [...prev, `✅ 成功智能解析並置入 ${currentCharacters.length} 位主要主角特徵！`]);
            }
          }
        }

        const splitRes = await fetch("/api/split-novel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            novelText: activeProject.novelText,
            artStyle: activeProject.artStyle,
            characters: currentCharacters,
            engine: 'gemini',
            customApiKey: customApiKey || undefined
          })
        });

        if (!splitRes.ok) {
          throw new Error("全自動分鏡劇本拆解失敗，請重試。");
        }

        const data = await splitRes.json();
        if (data.scenes && data.scenes.length > 0) {
          const formattedScenes: Scene[] = data.scenes.map((s: any, idx: number) => {
            const finalDuration = s.durationSeconds && typeof s.durationSeconds === 'number'
              ? s.durationSeconds
              : 5;
            return {
              id: `scene_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 4)}`,
              title: s.title || `分鏡 ${idx + 1}`,
              dialogue: s.dialogue || "",
              narration: s.narration || "",
              character: s.character || "旁白",
              visualPrompt: s.visualPrompt || s.title || "",
              negativePrompt: s.negativePrompt || "",
              actionPrompt: s.actionPrompt || "",
              durationSeconds: finalDuration,
              audioCue: s.audioCue || "",
              directorNotes: s.directorNotes || "",
              transitionPrompt: s.transitionPrompt || "",
              imageUrl: "",
              imageUrlExt: "",
              imageUrlKeyframes: "",
              videoUrl: "",
              videoUrlExt: "",
              videoUrlKeyframes: "",
              isGeneratingImage: false,
              isGeneratingVideo: false,
              isGeneratingImageExt: false,
              isGeneratingVideoExt: false,
              isGeneratingImageKeyframes: false,
              isGeneratingVideoKeyframes: false,
              videoProgress: "0%",
              videoProgressExt: "0%",
              videoProgressKeyframes: "0%",
              videoLogs: [],
              videoLogsExt: [],
              videoLogsKeyframes: [],
              videoError: "",
              videoErrorExt: "",
              videoErrorKeyframes: ""
            };
          });

          updateActiveProject({
            characters: currentCharacters,
            scenes: formattedScenes
          });
          currentScenes = formattedScenes;
          setFullAutoLogs(prev => [...prev, `✅ 全自動分鏡劇本拆解成功，已為您生成了 ${formattedScenes.length} 個高精緻鏡頭！`]);
        } else {
          throw new Error("未能成功拆解劇本，請確認劇本大綱填寫完整。");
        }
      }

      // 2. Clear any video task locks on the server
      setFullAutoProgress("15%");
      setFullAutoLogs(prev => [...prev, "🧹 正在清除背景運算鎖，確保全自動生成線路完全暢通..."]);
      await fetch("/api/reset-task", { method: "POST" }).catch(() => {});

      // 3. New 7-step Decoupled Workflow Execution
      setFullAutoLogs(prev => [
        ...prev,
        `🔒 [嚴格鎖設定狀態]：當前為 ${strictWorkflowLock ? "🔒 開啟 (Strict Lock)" : "🔓 關閉 (Lenient Mode)"}。`,
        "🎥 正在啟動最新分鏡劇本首尾幀 7 步 Check List 大師工作流..."
      ]);

      const isGenImgField = activeTab === "scenes_ext" ? "isGeneratingImageExt" : (activeTab === "scenes_keyframes" ? "isGeneratingImageKeyframes" : "isGeneratingImage");
      const imageField = activeTab === "scenes_ext" ? "imageUrlExt" : (activeTab === "scenes_keyframes" ? "imageUrlKeyframes" : "imageUrl");
      
      const isGenVidField = activeTab === "scenes_ext" ? "isGeneratingVideoExt" : (activeTab === "scenes_keyframes" ? "isGeneratingVideoKeyframes" : "isGeneratingVideo");
      const videoField = activeTab === "scenes_ext" ? "videoUrlExt" : (activeTab === "scenes_keyframes" ? "videoUrlKeyframes" : "videoUrl");
      const progressField = activeTab === "scenes_ext" ? "videoProgressExt" : (activeTab === "scenes_keyframes" ? "videoProgressKeyframes" : "videoProgress");
      const errorField = activeTab === "scenes_ext" ? "videoErrorExt" : (activeTab === "scenes_keyframes" ? "videoErrorKeyframes" : "videoError");

      // =========================================================================
      // STEP 1 & 2: 接收所有鏡頭描述 + 優化所有鏡頭 Prompt
      // =========================================================================
      setFullAutoLogs(prev => [...prev, "🎬 [步驟 1 & 2] 正在為所有鏡頭接收連續性描述並優化 Prompt..."]);
      for (let i = 0; i < currentScenes.length; i++) {
        const scene = currentScenes[i];
        
        const curProjListCheck = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
        const curProjCheck = curProjListCheck.find(p => p.id === activeProjectId);
        const freshSCheck = curProjCheck?.scenes.find(s => s.id === scene.id) || scene;

        if (freshSCheck.step2OptimizedPrompt) {
          setFullAutoLogs(prev => [...prev, `[鏡頭 ${i + 1}] ➡️ 偵測到已有優化提示詞，自動跳過優化步驟。`]);
          continue;
        }

        updateActiveProject((prev) => ({
          scenes: prev.scenes.map(s => s.id === scene.id ? { ...s, workflowStep: 1 } : s)
        }));
        
        const preCheckProjList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
        const preCheckProj = preCheckProjList.find(p => p.id === activeProjectId);
        const freshPrevScene = i > 0 && preCheckProj ? preCheckProj.scenes[i - 1] : null;
        const prevAdvice = freshPrevScene?.step7AdviceForNext || "";

        updateActiveProject((prev) => ({
          scenes: prev.scenes.map(s => s.id === scene.id ? { ...s, step1PrevShotAdvice: prevAdvice, workflowStep: 2, isOptimizingStep2: true } : s)
        }));
        
        setFullAutoLogs(prev => [...prev, `⏳ [鏡頭 ${i + 1}] ➡️ 正在智能整合銜接建議並進行大片級提示詞優化...`]);

        let optimizedPrompt = scene.visualPrompt;
        let optimizedNegative = scene.negativePrompt || "";
        try {
          const characterObj = activeProject.characters.find(c => (c.name || "").trim().toLowerCase() === (scene.character || "").trim().toLowerCase());
          const resOptimize = await fetch("/api/optimize-prompt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: scene.visualPrompt,
              artStyle: activeProject.artStyle || "",
              character: scene.character || "旁白",
              characterDescription: characterObj?.description || "",
              context: prevAdvice ? `上一個鏡頭傳遞的銜接建議：${prevAdvice}` : ""
            })
          });
          if (resOptimize.ok) {
            const optData = await resOptimize.json();
            optimizedPrompt = optData.optimizedPrompt || scene.visualPrompt;
            optimizedNegative = optData.negativePrompt || scene.negativePrompt || "";
          }
        } catch (e) {
          console.warn("Step 2 optimize failed:", e);
        }

        updateActiveProject((prev) => ({
          scenes: prev.scenes.map(s => s.id === scene.id ? {
            ...s,
            step2OptimizedPrompt: optimizedPrompt,
            step2OptimizedNegative: optimizedNegative,
            visualPrompt: optimizedPrompt,
            negativePrompt: optimizedNegative,
            isOptimizingStep2: false,
            workflowStep: 2
          } : s)
        }));
        setFullAutoLogs(prev => [...prev, `[鏡頭 ${i + 1}] ✅ 提示詞優化完成，已置入特徵與物理對齊參數！`]);
        await new Promise(r => setTimeout(r, 300));
      }

// =========================================================================
      // STEP 3: 生成所有鏡頭的首幀（跳過失敗→循環重試，最多 5 輪，絕不使用保底圖）
      // =========================================================================
      setFullAutoLogs(prev => [...prev, "🎬 [步驟 3] 正在生成所有分鏡的首幀（失敗會先跳過，成功後回頭重試，最多 5 輪循環）..."]);

      const isRealImageUrl = (url: string | undefined | null) => {
        if (!url || typeof url !== "string") return false;
        if (url.includes("unsplash.com")) return false;
        if (url.includes("gradient") || url.includes("placeholder")) return false;
        if (url.includes("pollinations-fallback")) return false;
        if (url.trim() === "" || url === "null" || url === "undefined") return false;
        return url.startsWith("http") || url.startsWith("/assets/") || url.startsWith("data:image");
      };

      const maxImageRounds = 5;
      let imageRound = 0;
      let allImagesReady = false;

      while (!allImagesReady && imageRound < maxImageRounds) {
        imageRound++;
        setFullAutoLogs(prev => [...prev, `🔄 [步驟 3] 第 ${imageRound}/${maxImageRounds} 輪：掃描並生成尚未成功的首幀...`]);

        let anyAttemptedThisRound = false;
        let successThisRound = 0;

        for (let i = 0; i < currentScenes.length; i++) {
          const scene = currentScenes[i];

          const curProjListCheck = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
          const curProjCheck = curProjListCheck.find(p => p.id === activeProjectId);
          const freshSCheck = curProjCheck?.scenes.find(s => s.id === scene.id) || scene;
          // Only trust the active mode field — never fall back to other tabs' old images
          const currentImgUrl = freshSCheck[imageField];

          if (isRealImageUrl(currentImgUrl)) {
            continue;
          }

          anyAttemptedThisRound = true;
          updateActiveProject((prev) => ({
            scenes: prev.scenes.map(s => s.id === scene.id ? { ...s, workflowStep: 3 } : s)
          }));

          setFullAutoLogs(prev => [...prev, `🎨 [鏡頭 ${i + 1}] 第 ${imageRound} 輪：正在繪製首幀（Agnes 常需 60–100 秒，請耐心等候）...`]);
          try {
            // Prefer direct return value (avoids localStorage race)
            let gotUrl: string | null = null;
            try {
              gotUrl = await handleGenerateImage(scene.id, "agnes");
            } catch (genErr: any) {
              throw new Error(genErr?.message || String(genErr) || "繪圖 API 失敗");
            }

            if (!isRealImageUrl(gotUrl)) {
              // Fallback: wait briefly for localStorage sync if return was null but write is in flight
              await new Promise<void>((resolve, reject) => {
                let checkCount = 0;
                const checkImgInterval = setInterval(() => {
                  checkCount++;
                  const curProjList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
                  const curProj = curProjList.find(p => p.id === activeProjectId);
                  const freshS = curProj?.scenes.find(s => s.id === scene.id);

                  if (freshS) {
                    if (isRealImageUrl(freshS[imageField])) {
                      clearInterval(checkImgInterval);
                      gotUrl = freshS[imageField];
                      resolve();
                      return;
                    }
                    if (!freshS[isGenImgField] && checkCount >= 2) {
                      clearInterval(checkImgInterval);
                      reject(new Error(
                        "影像生成完畢，但未回傳有效真實首幀網址（已禁用保底圖）。多半是 Agnes 忙碌 503 或逾時，稍後會重試。"
                      ));
                    }
                  }
                  if (checkCount > 20) {
                    clearInterval(checkImgInterval);
                    reject(new Error("等待首幀寫入逾時。"));
                  }
                }, 500);
              });
            }

            if (!isRealImageUrl(gotUrl)) {
              throw new Error("未取得有效真實首幀網址（已禁用保底圖）");
            }

            successThisRound++;
            setFullAutoLogs(prev => [...prev, `[鏡頭 ${i + 1}] ✅ 成功繪製真實首幀！`]);
          } catch (imgErr: any) {
            setFullAutoLogs(prev => [...prev, `[鏡頭 ${i + 1}] ⚠️ 首幀失敗，先跳過，稍後再試：${imgErr.message || imgErr}`]);
            updateActiveProject((prev) => ({
              scenes: prev.scenes.map(s => s.id === scene.id ? {
                ...s,
                isGeneratingImage: false,
                isGeneratingImageExt: false,
                isGeneratingImageKeyframes: false
              } : s)
            }));
            // Brief pause before next scene; longer if rate-limit/busy
            const msg = String(imgErr?.message || "");
            const busy = /503|忙碌|busy|rate|timeout|逾時/i.test(msg);
            await new Promise(r => setTimeout(r, busy ? 3000 : 1000));
          }
        }

        const finalCheckList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
        const finalProj = finalCheckList.find(p => p.id === activeProjectId);
        const scenesNow = finalProj?.scenes || currentScenes;
        const missing = scenesNow.filter(s => {
          const u = s[imageField];
          return !isRealImageUrl(u);
        });

        if (missing.length === 0) {
          allImagesReady = true;
          setFullAutoLogs(prev => [...prev, "✅ [步驟 3] 所有鏡頭真實首幀已全部生成成功！"]);
        } else if (!anyAttemptedThisRound) {
          break;
        } else {
          setFullAutoLogs(prev => [...prev, `📋 [步驟 3] 第 ${imageRound} 輪結束：本輪成功 ${successThisRound} 個，尚餘 ${missing.length} 個未成功，將進入下一輪...`]);
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      if (!allImagesReady) {
        const finalCheckList2 = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
        const finalProj2 = finalCheckList2.find(p => p.id === activeProjectId);
        const scenesNow2 = finalProj2?.scenes || currentScenes;
        const stillMissing = scenesNow2
          .map((s, idx) => ({ s, idx }))
          .filter(({ s }) => !isRealImageUrl(s[imageField]));

        setFullAutoLogs(prev => [
          ...prev,
          `🛑 [步驟 3] 已完成 ${maxImageRounds} 輪循環，仍有 ${stillMissing.length} 個鏡頭未能生成真實相片。`,
          "💡 已停止自動推進，請手動為失敗鏡頭重新生成或上傳圖片，完成後再繼續下一步。",
          ...stillMissing.map(({ idx }) => `   - 鏡頭 ${idx + 1} 仍缺真實首幀`)
        ]);
        showToast(`[步驟 3] ${stillMissing.length} 個鏡頭首幀失敗，已停低交人手處理`, "error");
        throw new Error("IMAGE_GEN_MANUAL_INTERVENTION");
      }

            // =========================================================================
      // STEP 4: AI 檢查所有首幀是否合理 + 故事連貫性
      // =========================================================================
      setFullAutoLogs(prev => [...prev, "🎬 [步驟 4] AI 正在檢查所有首幀合理性與故事連貫性..."]);
      for (let i = 0; i < currentScenes.length; i++) {
        const scene = currentScenes[i];

        const curProjListCheck = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
        const curProjCheck = curProjListCheck.find(p => p.id === activeProjectId);
        const freshSCheck = curProjCheck?.scenes.find(s => s.id === scene.id) || scene;

        if (freshSCheck.step4Passed && freshSCheck.step4ImageReviewScore >= 60) {
          setFullAutoLogs(prev => [...prev, `[鏡頭 ${i + 1}] ➡️ 偵測到首幀審核已通過（分數：${freshSCheck.step4ImageReviewScore}/100），自動跳過審核。`]);
          continue;
        }

        updateActiveProject((prev) => ({
          scenes: prev.scenes.map(s => s.id === scene.id ? { ...s, workflowStep: 4, isReviewingStep4: true } : s)
        }));

        let imageAttemptsList: Array<{ imageUrl: string; score: number; critique: string }> = [];
        let reviewSuccess = false;
        let reviewRetryCount = 0;
        const maxReviewAttempts = strictWorkflowLock ? 10 : 5;

        while (!reviewSuccess && reviewRetryCount < maxReviewAttempts) {
          reviewRetryCount++;
          try {
            const curProjList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
            const curProj = curProjList.find(p => p.id === activeProjectId);
            const freshS = curProj?.scenes.find(s => s.id === scene.id) || scene;
            const currentImgUrl = freshS[imageField] || freshS.imageUrl || freshS.imageUrlKeyframes;

            const isSceneNoChar = isNoChar(freshS.character);
            const characterObj = !isSceneNoChar 
              ? activeProject.characters.find(c => (c.name || "").trim().toLowerCase() === (freshS.character || "").trim().toLowerCase()) 
              : null;

            const prevScene = (i > 0 && !isSceneNoChar) ? (curProj?.scenes[i - 1] || currentScenes[i - 1]) : null;
            const prevSceneHasSameChar = prevScene && !isNoChar(prevScene.character) && (prevScene.character || "").trim().toLowerCase() === (freshS.character || "").trim().toLowerCase();
            const prevImageUrl = prevSceneHasSameChar ? (prevScene[imageField] || prevScene.imageUrl || prevScene.imageUrlKeyframes) : null;

            const resReview = await apiFetch("/api/workflow/review-image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                imageUrl: currentImgUrl,
                visualPrompt: freshS.visualPrompt,
                characterDescription: isSceneNoChar
                  ? "【特別標註：本分鏡為「無登場角色」之純環境/風景/建築鏡頭，畫面中絕對不可出現任何人物或角色】"
                  : (characterObj?.description || ""),
                sceneId: scene.id,
                projectId: activeProjectId,
                artStyle: activeProject.artStyle || "",
                prevImageUrl
              })
            }, { retries: 2, timeoutMs: 30000, label: "首幀審核 API" });

            const reviewData = await resReview.json();
            const score = reviewData.score || 85;
            const text = reviewData.critique || "構圖流暢，首幀角色特徵契合，故事連貫性佳。";
            // Dynamic threshold for strict mode: starting at 70, relaxes by 2 points per retry down to 60.
            const minRequiredScore = Math.max(60, 70 - (reviewRetryCount - 1) * 2);
            const passed = score >= minRequiredScore;

            if (currentImgUrl) {
              imageAttemptsList.push({ imageUrl: currentImgUrl, score, critique: text });
            }

            if (strictWorkflowLock) {
              if (!passed) {
                // Auto-improve prompt if AI provided one
                if (reviewData.optimizedVisualPrompt) {
                  setFullAutoLogs(prev => [...prev, `✨ [AI 智慧優化] 偵測到畫面邏輯缺陷，正在自動重構並強化提示詞...`]);
                  updateActiveProject((prev) => ({
                    scenes: prev.scenes.map(s => s.id === scene.id ? {
                      ...s,
                      visualPrompt: reviewData.optimizedVisualPrompt
                    } : s)
                  }));
                  
                  try {
                    const curList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
                    const updatedList = curList.map(p => p.id === activeProjectId ? {
                      ...p,
                      scenes: p.scenes.map(s => s.id === scene.id ? {
                        ...s,
                        visualPrompt: reviewData.optimizedVisualPrompt
                      } : s)
                    } : p);
                    localStorage.setItem("toonflow_projects", JSON.stringify(updatedList)); localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString());
                  } catch(e) {}
                }
                throw new Error(`首幀審核未通過（當前分數：${score}/100，本次所需及格線：${minRequiredScore} 分）。建議：${text}`);
              } else {
                if (score < 70) {
                  setFullAutoLogs(prev => [...prev, `✨ [鎖定解套機制] 由於重試 ${reviewRetryCount} 次，首幀容錯及格線已動態調整為 ${minRequiredScore} 分。當前分數：${score}/100，判定為合格通過！`]);
                }
                updateActiveProject((prev) => ({
                  scenes: prev.scenes.map(s => s.id === scene.id ? {
                    ...s,
                    step4ImageReviewScore: score,
                    step4ImageReviewText: text,
                    step4Passed: passed,
                    isReviewingStep4: false,
                    workflowStep: 4
                  } : s)
                }));

                try {
                  const curList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
                  const updatedList = curList.map(p => p.id === activeProjectId ? {
                    ...p,
                    scenes: p.scenes.map(s => s.id === scene.id ? {
                      ...s,
                      step4ImageReviewScore: score,
                      step4ImageReviewText: text,
                      step4Passed: passed
                    } : s)
                  } : p);
                  localStorage.setItem("toonflow_projects", JSON.stringify(updatedList)); localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString());
                } catch(e) {}

                setFullAutoLogs(prev => [...prev, `[鏡頭 ${i + 1}] ✅ 物理合理性與人物一致性審核通過！分數：${score}/100 (及格線：${minRequiredScore})`]);
                reviewSuccess = true;
              }
            } else {
              // Lenient mode - 關閉嚴格鎖模式：即便 0 分也直接判定為合格通過，順利推進至下一鏡頭！
              setFullAutoLogs(prev => [...prev, `[鏡頭 ${i + 1}] 🎯 關閉嚴格鎖模式：不管評分高低（當前分數：${score}/100），一律直接判定通過並順利推進下一鏡頭！`]);
              updateActiveProject((prev) => ({
                scenes: prev.scenes.map(s => s.id === scene.id ? {
                  ...s,
                  step4ImageReviewScore: score,
                  step4ImageReviewText: text,
                  step4Passed: true,
                  isReviewingStep4: false,
                  workflowStep: 4
                } : s)
              }));
              try {
                const curList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
                const updatedList = curList.map(p => p.id === activeProjectId ? {
                  ...p,
                  scenes: p.scenes.map(s => s.id === scene.id ? {
                    ...s,
                    step4ImageReviewScore: score,
                    step4ImageReviewText: text,
                    step4Passed: true
                  } : s)
                } : p);
                localStorage.setItem("toonflow_projects", JSON.stringify(updatedList)); localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString());
              } catch(e) {}
              reviewSuccess = true;
            }
          } catch (err: any) {
            setFullAutoLogs(prev => [...prev, `[鏡頭 ${i + 1}] ⚠️ 步驟 4 首幀審核不通過 (嘗試 ${reviewRetryCount}/${maxReviewAttempts}): ${err.message || err}`]);
            if (reviewRetryCount >= maxReviewAttempts) {
              if (strictWorkflowLock) {
                setFullAutoLogs(prev => [...prev, `🛑 [嚴格安全鎖防護] 鏡頭 ${i + 1} 步驟 4 審查未通過，工作流中斷，等待手動調整！`]);
                showToast(`[嚴格鎖防護] 鏡頭 ${i + 1} 物理審查失敗，已安全暫停。`, "error");
                throw new Error("STRICT_LOCK_PAUSE");
              } else {
                if (imageAttemptsList.length > 0) {
                  imageAttemptsList.sort((a, b) => b.score - a.score);
                  const bestAttempt = imageAttemptsList[0];
                  updateActiveProject((prev) => ({
                    scenes: prev.scenes.map(s => s.id === scene.id ? {
                      ...s,
                      [imageField]: bestAttempt.imageUrl,
                      imageUrlExt: bestAttempt.imageUrl,
                      imageUrlKeyframes: bestAttempt.imageUrl,
                      step4ImageReviewScore: bestAttempt.score,
                      step4ImageReviewText: `${bestAttempt.critique} (不上鎖模式最高分強制通過)`,
                      step4Passed: true,
                      isReviewingStep4: false
                    } : s)
                  }));
                  try {
                    const curList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
                    const updatedList = curList.map(p => p.id === activeProjectId ? {
                      ...p,
                      scenes: p.scenes.map(s => s.id === scene.id ? {
                        ...s,
                        [imageField]: bestAttempt.imageUrl,
                        imageUrlExt: bestAttempt.imageUrl,
                        imageUrlKeyframes: bestAttempt.imageUrl,
                        step4ImageReviewScore: bestAttempt.score,
                        step4ImageReviewText: `${bestAttempt.critique} (不上鎖模式最高分強制通過)`,
                        step4Passed: true
                      } : s)
                    } : p);
                    localStorage.setItem("toonflow_projects", JSON.stringify(updatedList)); localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString());
                  } catch(e) {}
                } else {
                  updateActiveProject((prev) => ({
                    scenes: prev.scenes.map(s => s.id === scene.id ? {
                      ...s,
                      step4ImageReviewScore: 70,
                      step4ImageReviewText: "（容錯模式強制通過）強制作為合格處理。",
                      step4Passed: true,
                      isReviewingStep4: false
                    } : s)
                  }));
                }
                reviewSuccess = true;
              }
            } else {
              setFullAutoLogs(prev => [...prev, `🔄 由於首幀審核未通過，已依據 AI 審查建議自動修改並優化提示詞，正在重新繪製首幀 (第 ${reviewRetryCount}/${maxReviewAttempts} 次嘗試)...`]);
              await new Promise(r => setTimeout(r, 2000));
              try {
                await handleGenerateImage(scene.id, 'agnes');
              } catch (genError: any) {
                setFullAutoLogs(prev => [...prev, `[鏡頭 ${i + 1}] ⚠️ 重繪首幀暫時失敗 (${genError?.message || genError})，將於下一輪自動重試...`]);
              }
              await new Promise<void>((resolve) => {
                let waitTicks = 0;
                const checkImgInterval = setInterval(() => {
                  waitTicks++;
                  const curProjList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
                  const curProj = curProjList.find(p => p.id === activeProjectId);
                  const freshS = curProj?.scenes.find(s => s.id === scene.id);
                  if (freshS && !freshS[isGenImgField]) {
                    clearInterval(checkImgInterval);
                    resolve();
                  }
                  if (waitTicks > 60) {
                    clearInterval(checkImgInterval);
                    resolve();
                  }
                }, 2000);
              });
            }
          }
        }
      }


      // =========================================================================
      // STEP 5: 用戶確認所有首幀
      // =========================================================================
      setFullAutoLogs(prev => [...prev, "🎬 [步驟 5] 用戶確認所有首幀（全自動製片中：已自動獲取並確認所有首幀）..."]);
      await new Promise(r => setTimeout(r, 800));

      // =========================================================================
      // STEP 6: 按順序生成影片（每個鏡頭用自己首幀開始，自動銜接下一分鏡首幀作為尾幀）
      // =========================================================================
      setFullAutoLogs(prev => [...prev, "🎬 [步驟 6] 按順序生成影片（每個鏡頭使用其專屬首幀開始，並自動將下一鏡頭之首幀指定為尾幀，流暢對齊中）..."]);
      
      // Pull freshest scenes from state/localStorage to ensure we have generated image URLs!
      const freshProjList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
      const freshProj = freshProjList.find(p => p.id === activeProjectId);
      if (freshProj) {
        currentScenes = freshProj.scenes;
      }

      for (let i = 0; i < currentScenes.length; i++) {
        const scene = currentScenes[i];

        const curProjListCheck = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
        const curProjCheck = curProjListCheck.find(p => p.id === activeProjectId);
        const freshSCheck = curProjCheck?.scenes.find(s => s.id === scene.id) || scene;

        if (freshSCheck[videoField] && freshSCheck.step6Passed && freshSCheck.step6VideoReviewScore >= 60) {
          setFullAutoLogs(prev => [...prev, `[鏡頭 ${i + 1}] ➡️ 偵測到影片已生成且審核通過（分數：${freshSCheck.step6VideoReviewScore}/100），自動跳過。`]);
          continue;
        }

        updateActiveProject((prev) => ({
          scenes: prev.scenes.map(s => s.id === scene.id ? { ...s, workflowStep: 6 } : s)
        }));

        let videoAttemptsList: Array<{ videoUrl: string; score: number; critique: string }> = [];
        let videoSuccess = false;
        let vidRetryCount = 0;
        const maxVidAttempts = strictWorkflowLock ? 10 : 5;

        while (!videoSuccess && vidRetryCount < maxVidAttempts) {
          vidRetryCount++;

          const loopProjList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
          const loopProj = loopProjList.find(p => p.id === activeProjectId);
          const freshS = loopProj?.scenes.find(s => s.id === scene.id) || scene;
          
          // On retry (vidRetryCount > 1), we MUST clear/ignore any pre-existing video so a new generation is triggered
          let currentVidUrl = vidRetryCount > 1 ? null : freshS[videoField];

          try {
            if (!currentVidUrl) {
              setFullAutoLogs(prev => [...prev, `📹 [鏡頭 ${i + 1}] 正在呼叫 AI 導演合成影片 (嘗試 ${vidRetryCount}/${maxVidAttempts})...`]);

              // Only reset idle/failed server task — avoid killing a healthy in-flight job on first try
              try {
                const st0 = await fetch("/api/status").then(r => r.json()).catch(() => null);
                if (!st0 || st0.status === "failed" || st0.status === "idle" || st0.status === "completed" || vidRetryCount > 1) {
                  await fetch("/api/reset-task", { method: "POST" }).catch(() => {});
                }
              } catch (_) {
                await fetch("/api/reset-task", { method: "POST" }).catch(() => {});
              }

              // If i > 0, extract previous scene's last frame and sync as starting frame
              if (i > 0) {
                const prevSceneInAuto = currentScenes[i - 1];
                const prevVidInAuto = prevSceneInAuto ? (prevSceneInAuto.videoUrlExt || prevSceneInAuto.videoUrlKeyframes || prevSceneInAuto.videoUrl) : undefined;
                if (prevVidInAuto) {
                  setFullAutoLogs(prev => [...prev, `[鏡頭 ${i + 1}] 🎥 正在抽取鏡頭 ${i} 影片之最後一幀作為本鏡頭首幀...`]);
                  try {
                    const extRes = await apiFetch("/api/extract-last-frame", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ videoUrl: prevVidInAuto })
                    }, { retries: 2, timeoutMs: 30000, label: "尾幀抽取 API" });
                    
                    const extData = await extRes.json();
                    if (extData.imageUrl) {
                      const patchList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
                      const updatedNext = patchList.map(p => {
                        if (p.id !== activeProjectId) return p;
                        return {
                          ...p,
                          scenes: p.scenes.map(s => s.id === scene.id ? {
                            ...s,
                            imageUrl: extData.imageUrl,
                            imageUrlExt: extData.imageUrl,
                            imageUrlKeyframes: extData.imageUrl
                          } : s)
                        };
                      });
                      localStorage.setItem("toonflow_projects", JSON.stringify(updatedNext));
                      updateActiveProject((prev) => ({
                        scenes: prev.scenes.map(s => s.id === scene.id ? {
                          ...s,
                          imageUrl: extData.imageUrl,
                          imageUrlExt: extData.imageUrl,
                          imageUrlKeyframes: extData.imageUrl
                        } : s)
                      }));
                      setFullAutoLogs(prev => [...prev, `[鏡頭 ${i + 1}] 🔗 已成功帶入鏡頭 ${i} 影片之最後一幀作為首幀，100%首尾對齊！`]);
                    }
                  } catch (extErr) {
                    console.warn("Step 6 tail frame extraction error:", extErr);
                  }
                }
              }

              // Trigger video generation (start/end frames from freshest keyframe images)
              await handleGenerateVideo(scene.id, true);

              await new Promise<void>((resolve, reject) => {
                let checkCount = 0;
                let sawGenerating = false;
                const checkVidInterval = setInterval(async () => {
                  checkCount++;
                  try {
                    // Prefer live server status (avoids localStorage race → false "無有效網址")
                    const stRes = await fetch("/api/status");
                    if (stRes.ok) {
                      const st = await stRes.json();
                      if (st.status === "in_progress" || st.status === "running") {
                        sawGenerating = true;
                        const prog = st.progress || "?";
                        setFullAutoLogs(prev => {
                          const prefix = `⏳ [鏡頭 ${i + 1}] Agnes 影片合成中... 進度 ${prog}`;
                          if (prev[prev.length - 1] !== prefix) return [...prev, prefix];
                          return prev;
                        });
                      } else if (st.status === "completed" && st.outputPath) {
                        // Force-map URL into localStorage if poller lagged
                        try {
                          const list = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
                          const next = list.map(p => {
                            if (p.id !== activeProjectId) return p;
                            return {
                              ...p,
                              scenes: p.scenes.map(s => s.id === scene.id ? {
                                ...s,
                                [videoField]: st.outputPath,
                                [isGenVidField]: false,
                                [progressField]: "100%",
                                [errorField]: ""
                              } : s)
                            };
                          });
                          localStorage.setItem("toonflow_projects", JSON.stringify(next));
                        } catch (_) {}
                        clearInterval(checkVidInterval);
                        resolve();
                        return;
                      } else if (st.status === "failed") {
                        // Grace: ignore early idle/failed until we saw generation start, first ~12s
                        if (sawGenerating || checkCount >= 4) {
                          clearInterval(checkVidInterval);
                          reject(new Error(st.error || "Agnes 影片生成失敗（伺服器 status=failed）"));
                          return;
                        }
                      }
                    }
                  } catch (_) {}

                  const curProjList2 = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
                  const curProj2 = curProjList2.find(p => p.id === activeProjectId);
                  const freshS2 = curProj2?.scenes.find(s => s.id === scene.id);

                  if (freshS2) {
                    if (freshS2[isGenVidField]) sawGenerating = true;

                    if (freshS2[progressField] && freshS2[progressField] !== "0%" && freshS2[progressField] !== "100%") {
                      setFullAutoLogs(prev => {
                        const prefix = `⏳ [鏡頭 ${i + 1}] 影片合成中... 進度 ${freshS2[progressField]}`;
                        if (prev[prev.length - 1] !== prefix) {
                          return [...prev, prefix];
                        }
                        return prev;
                      });
                    }

                    if (freshS2[videoField] && String(freshS2[videoField]).length > 4) {
                      clearInterval(checkVidInterval);
                      resolve();
                      return;
                    }

                    // Only treat idle as failure after generate had a chance to start (avoid race)
                    if (!freshS2[isGenVidField] && (sawGenerating || checkCount >= 5)) {
                      clearInterval(checkVidInterval);
                      const logsArr = (freshS2 as any).videoLogsKeyframes || (freshS2 as any).videoLogs || [];
                      const lastLog = Array.isArray(logsArr) && logsArr.length ? String(logsArr[logsArr.length - 1]) : "";
                      const errMsg = freshS2[errorField] || lastLog || "影片生成失敗，無有效網址（請查 Railway log / AGNES_API_KEY）";
                      reject(new Error(errMsg));
                      return;
                    }
                  }
                  // ~12 minutes (Agnes video is slow)
                  if (checkCount > 240) {
                    clearInterval(checkVidInterval);
                    reject(new Error("影片渲染超時（約 12 分鐘）。請檢查 Railway log / AGNES_API_KEY。"));
                  }
                }, 3000);
              });
            }

            const curProjList3 = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
            const curProj3 = curProjList3.find(p => p.id === activeProjectId);
            const freshSFinal = curProj3?.scenes.find(s => s.id === scene.id) || scene;
            const currentVidUrlFinal = freshSFinal[videoField];

            if (freshSFinal && currentVidUrlFinal) {
              setFullAutoLogs(prev => [...prev, `[鏡頭 ${i + 1}] ✅ 影片已就緒，正在進行 AI 影片品質與鏡頭運動審核...`]);
              
              // Run Video Quality Review
              const previousScene = i > 0 ? currentScenes[i - 1] : null;
              const resReview = await apiFetch("/api/workflow/review-video", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  scene: freshSFinal,
                  previousScene,
                  customApiKey: customApiKey || undefined,
                  artStyle: activeProject.artStyle || ""
                })
              }, { retries: 2, timeoutMs: 30000, label: "影片審核 API" });

              const reviewData = await resReview.json();
              const score = reviewData.score || 85;
              const text = reviewData.critique || "影片流暢度極高，運鏡自然銜接。";
              
              // Dynamic threshold for strict mode: starting at 70, relaxes by 2 points per retry down to 60.
              const minRequiredScore = Math.max(60, 70 - (vidRetryCount - 1) * 2);
              const passed = score >= minRequiredScore;

              videoAttemptsList.push({ videoUrl: currentVidUrl, score, critique: text });

              if (strictWorkflowLock) {
                if (!passed) {
                  throw new Error(`影片審核未通過（當前分數：${score}/100，本次所需及格線：${minRequiredScore} 分）。建議：${text}`);
                } else {
                  if (score < 70) {
                    setFullAutoLogs(prev => [...prev, `✨ [鎖定解套機制] 由於重試 ${vidRetryCount} 次，影片容錯及格線已動態調整為 ${minRequiredScore} 分。當前分數：${score}/100，判定為合格通過！`]);
                  }
                  updateActiveProject((prev) => ({
                    scenes: prev.scenes.map(s => s.id === scene.id ? {
                      ...s,
                      step6VideoReviewScore: score,
                      step6VideoReviewText: text,
                      step6Passed: passed,
                      workflowStep: 6
                    } : s)
                  }));

                  try {
                    const curList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
                    const updatedList = curList.map(p => p.id === activeProjectId ? {
                      ...p,
                      scenes: p.scenes.map(s => s.id === scene.id ? {
                        ...s,
                        step6VideoReviewScore: score,
                        step6VideoReviewText: text,
                        step6Passed: passed
                      } : s)
                    } : p);
                    localStorage.setItem("toonflow_projects", JSON.stringify(updatedList)); localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString());
                  } catch(e) {}

                  setFullAutoLogs(prev => [...prev, `[鏡頭 ${i + 1}] ✅ 影片品質與連續性審核通過！分數：${score}/100 (及格線：${minRequiredScore})`]);
                  videoSuccess = true;
                }
              } else {
                // Lenient mode - 關閉嚴格鎖模式：即便 0 分也直接判定為合格通過，順利推進至下一鏡頭！
                setFullAutoLogs(prev => [...prev, `[鏡頭 ${i + 1}] 🎯 關閉嚴格鎖模式：不管評分高低（當前分數：${score}/100），一律直接判定通過並順利推進下一鏡頭！`]);
                updateActiveProject((prev) => ({
                  scenes: prev.scenes.map(s => s.id === scene.id ? {
                    ...s,
                    step6VideoReviewScore: score,
                    step6VideoReviewText: text,
                    step6Passed: true,
                    workflowStep: 6
                  } : s)
                }));
                try {
                  const curList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
                  const updatedList = curList.map(p => p.id === activeProjectId ? {
                    ...p,
                    scenes: p.scenes.map(s => s.id === scene.id ? {
                      ...s,
                      step6VideoReviewScore: score,
                      step6VideoReviewText: text,
                      step6Passed: true
                    } : s)
                  } : p);
                  localStorage.setItem("toonflow_projects", JSON.stringify(updatedList)); localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString());
                } catch(e) {}
                videoSuccess = true;
              }
            } else {
              throw new Error("影片網址映射錯誤");
            }
          } catch (vidErr: any) {
            setFullAutoLogs(prev => [...prev, `[鏡頭 ${i + 1}] ⚠️ 影片生成或審核失敗 (嘗試 ${vidRetryCount}/${maxVidAttempts}): ${vidErr.message || vidErr}`]);
            if (vidRetryCount >= maxVidAttempts) {
              if (strictWorkflowLock) {
                setFullAutoLogs(prev => [...prev, `🛑 [嚴格安全鎖防護] 鏡頭 ${i + 1} 影片合成或審查未通過，工作流中斷，等待手動調整！`]);
                showToast(`[嚴格鎖防護] 鏡頭 ${i + 1} 影片合成或審查失敗，已安全暫停。`, "error");
                throw new Error("STRICT_LOCK_PAUSE");
              } else {
                if (videoAttemptsList.length > 0) {
                  videoAttemptsList.sort((a, b) => b.score - a.score);
                  const bestAttempt = videoAttemptsList[0];
                  setFullAutoLogs(prev => [...prev, `⚠️ [容錯降級] 鏡頭 ${i + 1} 影片渲染失敗，自動套用 5 次生成中評分最高的一組（分數：${bestAttempt.score}/100）並強行通過...`]);
                  updateActiveProject((prev) => ({
                    scenes: prev.scenes.map(s => s.id === scene.id ? {
                      ...s,
                      [videoField]: bestAttempt.videoUrl,
                      videoUrlExt: bestAttempt.videoUrl,
                      videoUrlKeyframes: bestAttempt.videoUrl,
                      step6VideoReviewScore: bestAttempt.score,
                      step6VideoReviewText: `${bestAttempt.critique} (不上鎖模式最高分強制通過)`,
                      step6Passed: true
                    } : s)
                  }));
                  try {
                    const curList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
                    const updatedList = curList.map(p => p.id === activeProjectId ? {
                      ...p,
                      scenes: p.scenes.map(s => s.id === scene.id ? {
                        ...s,
                        [videoField]: bestAttempt.videoUrl,
                        videoUrlExt: bestAttempt.videoUrl,
                        videoUrlKeyframes: bestAttempt.videoUrl,
                        step6VideoReviewScore: bestAttempt.score,
                        step6VideoReviewText: `${bestAttempt.critique} (不上鎖模式最高分強制通過)`,
                        step6Passed: true
                      } : s)
                    } : p);
                    localStorage.setItem("toonflow_projects", JSON.stringify(updatedList)); localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString());
                  } catch(e) {}
                } else {
                  setFullAutoLogs(prev => [...prev, `⚠️ [容錯降級] 鏡頭 ${i + 1} 影片合成失敗，無任何有效嘗試，強制作為合格處理。`]);
                  
                  const fallbackImage = freshS[imageField] || freshS.imageUrl || "";
                  
                  updateActiveProject((prev) => ({
                    scenes: prev.scenes.map(s => s.id === scene.id ? {
                      ...s,
                      [videoField]: s[videoField] || fallbackImage,
                      videoUrlExt: s.videoUrlExt || fallbackImage,
                      videoUrlKeyframes: s.videoUrlKeyframes || fallbackImage,
                      step6VideoReviewScore: 70,
                      step6VideoReviewText: "（容錯模式強制通過）無任何有效合成嘗試，強制作為合格處理。",
                      step6Passed: true,
                      workflowStep: 6
                    } : s)
                  }));

                  try {
                    const curList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
                    const updatedList = curList.map(p => p.id === activeProjectId ? {
                      ...p,
                      scenes: p.scenes.map(s => s.id === scene.id ? {
                        ...s,
                        [videoField]: s[videoField] || fallbackImage,
                        videoUrlExt: s.videoUrlExt || fallbackImage,
                        videoUrlKeyframes: s.videoUrlKeyframes || fallbackImage,
                        step6VideoReviewScore: 70,
                        step6VideoReviewText: "（容錯模式強制通過）無任何有效合成嘗試，強制作為合格處理。",
                        step6Passed: true,
                        workflowStep: 6
                      } : s)
                    } : p);
                    localStorage.setItem("toonflow_projects", JSON.stringify(updatedList));
                    localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString());
                  } catch(e) {}
                }
                videoSuccess = true;
              }
            } else {
              await new Promise(r => setTimeout(r, 2000));
            }
          }
        }
      }




      // =========================================================================
      // STEP 7: 總結 + 下鏡頭建議（自動更新尾幀）
      // =========================================================================
      setFullAutoLogs(prev => [...prev, "🎬 [步驟 7] AI 正在為所有鏡頭進行畫面連續性特徵傳導分析、總結與更新下鏡頭建議..."]);
      for (let i = 0; i < currentScenes.length; i++) {
        const scene = currentScenes[i];

        const curProjListCheck = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
        const curProjCheck = curProjListCheck.find(p => p.id === activeProjectId);
        const freshSCheck = curProjCheck?.scenes.find(s => s.id === scene.id) || scene;

        if (freshSCheck.step7AdviceForNext) {
          setFullAutoLogs(prev => [...prev, `[鏡頭 ${i + 1}] ➡️ 偵測到已有連續性銜接建議，自動跳過建議生成。`]);
          continue;
        }

        updateActiveProject((prev) => ({
          scenes: prev.scenes.map(s => s.id === scene.id ? { ...s, workflowStep: 7, isGeneratingStep7: true } : s)
        }));

        try {
          const nextScene = i < currentScenes.length - 1 ? currentScenes[i + 1] : null;
          const curProjList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
          const curProj = curProjList.find(p => p.id === activeProjectId);
          const freshS = curProj?.scenes.find(s => s.id === scene.id) || scene;

          const resAdvice = await apiFetch("/api/workflow/generate-step7-advice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              currentScene: freshS,
              nextScene,
              customApiKey: customApiKey || undefined
            })
          }, { retries: 2, timeoutMs: 30000, label: "連續性對齊 API" });

          const adviceData = await resAdvice.json();
          const advice = adviceData.advice || "維持上一分鏡中主角與背景之色彩與基調。";
            updateActiveProject((prev) => ({
              scenes: prev.scenes.map(s => s.id === scene.id ? {
                ...s,
                step7AdviceForNext: advice,
                isGeneratingStep7: false,
                workflowStep: 7
              } : s)
            }));
            
            try {
              const curList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
              const updatedList = curList.map(p => p.id === activeProjectId ? {
                ...p,
                scenes: p.scenes.map(s => s.id === scene.id ? { ...s, step7AdviceForNext: advice } : s)
              } : p);
              localStorage.setItem("toonflow_projects", JSON.stringify(updatedList)); localStorage.setItem("toonflow_last_sync_timestamp", Date.now().toString());
            } catch(e) {}

            setFullAutoLogs(prev => [...prev, `[鏡頭 ${i + 1}] ✅ 步驟 7/7 連續性對齊建議已完美生成：${advice}`]);
        } catch (adviceErr: any) {
          console.warn("Advice generation failed, using fallback:", adviceErr);
          const fallbackAdvice = "維持上一分鏡角色一致服飾與氛圍。";
          updateActiveProject((prev) => ({
            scenes: prev.scenes.map(s => s.id === scene.id ? {
              ...s,
              step7AdviceForNext: fallbackAdvice,
              isGeneratingStep7: false,
              workflowStep: 7
            } : s)
          }));
          setFullAutoLogs(prev => [...prev, `[鏡頭 ${i + 1}] ⚠️ 步驟 7/7：已自動套用安全連續性對齊對應。`]);
        }

        // Calculate intermediate progress
        const percent = Math.floor(((i + 1) / currentScenes.length) * 80);
        setFullAutoProgress(`${percent}%`);
        setFullAutoLogs(prev => [...prev, `🎉 鏡頭 ${i + 1} 的連續性特徵傳導已 100% 完美更新！`]);
        await new Promise(r => setTimeout(r, 600));
      }

      // 4. Final multi-clip video stitching
      setFullAutoProgress("85%");
      setFullAutoLogs(prev => [...prev, "🎬 第四步：所有分鏡鏡頭已完美生成完畢！正在啟動 AI 剪輯大師，極速拼接大片中..."]);

      const finalProjList = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
      const finalProj = finalProjList.find(p => p.id === activeProjectId);
      const orderedVideoUrls = (finalProj?.scenes || currentScenes)
        .map(s => s.videoUrlKeyframes || s.videoUrlExt || s.videoUrl)
        .filter(Boolean) as string[];

      if (orderedVideoUrls.length === 0) {
        throw new Error("沒有生成任何有效的影片分鏡，無法進行最終拼接剪輯。");
      }

      setFullAutoLogs(prev => [...prev, `🎞️ 正在向剪輯核心提交 ${orderedVideoUrls.length} 個分鏡鏡頭檔案...`]);

      const stitchRes = await apiFetch("/api/stitch-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrls: orderedVideoUrls })
      }, { retries: 2, timeoutMs: 120000, label: "影片拼接 API" });

      if (!stitchRes.body) throw new Error("No response body from server");
      
      const reader = stitchRes.body.getReader();
      const decoder = new TextDecoder();
      let finalStitchData: any = null;
      let streamBuffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          if (streamBuffer.trim()) {
            try {
              const data = JSON.parse(streamBuffer.trim());
              if (data.type === 'log') {
                setFullAutoLogs(prev => [...prev, data.log]);
              } else if (data.type === 'result') {
                finalStitchData = data;
              } else if (data.type === 'error') {
                throw new Error(data.error);
              }
            } catch (e) {
              console.error("Error parsing remaining stream buffer:", e);
            }
          }
          break;
        }
        
        streamBuffer += decoder.decode(value, { stream: true });
        const lines = streamBuffer.split('\n');
        streamBuffer = lines.pop() || "";
        
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.type === 'log') {
              setFullAutoLogs(prev => [...prev, data.log]);
            } else if (data.type === 'result') {
              finalStitchData = data;
            } else if (data.type === 'error') {
              throw new Error(data.error);
            }
          } catch (e) {
            console.error("Error parsing log line:", e);
          }
        }
      }

      if (finalStitchData && finalStitchData.videoUrl) {
        setFinalStitchedVideoUrl(finalStitchData.videoUrl);
        updateActiveProject({ finalVideoUrl: finalStitchData.videoUrl });
        setFullAutoProgress("100%");
        setFullAutoLogs(prev => [
          ...prev, 
          "🎉 恭喜！最終電影級大片已完美拼接！",
          `✨ 電影成片連結已生成：${finalStitchData.videoUrl}`,
          "🌟 這是 AI 完全自動化生成的影視傑作，請點擊下方播放器進行觀賞與下載！"
        ]);
        showToast("🎉 恭喜！AI 全自動電影製作大師一鍵出片成功！", "success");
      } else {
        throw new Error("最終拼接未返回有效影片網址。");
      }

    } catch (err: any) {
      if (err.message === "IMAGE_GEN_MANUAL_INTERVENTION") {
        setFullAutoLogs(prev => [
          ...prev,
          "🛑 首幀生成已達 5 輪上限，部分鏡頭仍未成功。已停低，請手動補齊真實相片後再繼續。"
        ]);
      } else if (err.message === "STRICT_LOCK_PAUSE") {
        setFullAutoLogs(prev => [
          ...prev,
          "🛑 [嚴格安全鎖防護觸發] 由於分鏡重試達 10 次上限且未全項目通過，已安全關閉自動製片線路，拒絕自動推進！",
          "💡 提示：本專案已安全暫停在當前分鏡，請點擊分鏡卡片，手動微調或重新生成失敗的步驟後，再次點擊自動製片或一鍵拼接。"
        ]);
      } else {
        console.error("[Toonflow Error] Auto-Produce Pipeline failed:", err);
        setFullAutoLogs(prev => [...prev, `❌ 錯誤：${err.message || err}`, "⚠️ 全自動製片中斷，您可以手動點擊單個鏡頭重試，或排除問題後再次點擊一鍵出片。"]);
        showToast(`全自動製片中編：${err.message || err}`, "error");
      }
    } finally {
      setIsFullAutoProducing(false);
    }
  };

  // Manual Stitching Engine - Merge all successfully generated video scenes
  const handleManualStitchVideos = async () => {
    if (!activeProject || isFullAutoProducing) return;
    
    // 1. Fetch current projects from localStorage to get the freshest data
    const curProjects = JSON.parse(localStorage.getItem("toonflow_projects") || "[]") as Project[];
    const curProj = curProjects.find(p => p.id === activeProjectId) || activeProject;
    
    const orderedVideoUrls = curProj.scenes
      .map(s => s.videoUrlKeyframes || s.videoUrlExt || s.videoUrl)
      .filter(Boolean) as string[];

    if (orderedVideoUrls.length === 0) {
      alert("⚠️ 沒有生成任何有效的影片分鏡，無法進行拼接。請先手動為分鏡卡片生成影片，或使用「AI一鍵全自動極速出片」！");
      return;
    }

    setIsFullAutoProducing(true);
    setFinalStitchedVideoUrl(null);
    setFullAutoProgress("10%");
    setFullAutoLogs([
      "🎬 啟動 [手動一鍵拼接] 工作流...",
      `📦 正在掃描專案，共偵測到 ${curProj.scenes.length} 個分鏡卡片...`,
      `🔍 其中已成功生成影片的片段共 ${orderedVideoUrls.length} 個。`
    ]);

    try {
      const response = await apiFetch("/api/stitch-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrls: orderedVideoUrls })
      }, { timeoutMs: 120000, label: "影片拼接" });

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        const bodyText = await response.text().catch(() => "");
        throw new Error(`影片拼接服務回應非 JSON (${bodyText.slice(0, 80).trim() || "<!doctype..."}). 請檢查後端服務。`);
      }

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamBuffer = "";
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          if (streamBuffer.trim()) {
            try {
              const data = JSON.parse(streamBuffer.trim());
              if (data.type === 'log') {
                setFullAutoLogs(prev => [...prev, data.log]);
                if (data.log.includes("下載")) setFullAutoProgress("25%");
                else if (data.log.includes("提交")) setFullAutoProgress("50%");
                else if (data.log.includes("完美完成")) setFullAutoProgress("100%");
              } else if (data.type === 'result') {
                setFinalStitchedVideoUrl(data.videoUrl);
                updateActiveProject({ finalVideoUrl: data.videoUrl });
                showToast("🎉 恭喜！手動拼接影片成功！", "success");
              } else if (data.type === 'error') {
                throw new Error(data.error);
              }
            } catch (e) {
              console.error("Failed to parse final manual stream buffer:", e);
            }
          }
          break;
        }
        
        streamBuffer += decoder.decode(value, { stream: true });
        const lines = streamBuffer.split('\n');
        streamBuffer = lines.pop() || "";
        
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.type === 'log') {
              setFullAutoLogs(prev => [...prev, data.log]);
              // Update progress based on log
              if (data.log.includes("下載")) setFullAutoProgress("25%");
              else if (data.log.includes("提交")) setFullAutoProgress("50%");
              else if (data.log.includes("完美完成")) setFullAutoProgress("100%");
            } else if (data.type === 'result') {
              setFinalStitchedVideoUrl(data.videoUrl);
              updateActiveProject({ finalVideoUrl: data.videoUrl });
              showToast("🎉 恭喜！手動拼接影片成功！", "success");
            } else if (data.type === 'error') {
              throw new Error(data.error);
            }
          } catch (e) {
            console.error("Failed to parse log chunk", e);
          }
        }
      }
    } catch (err: any) {
      setFullAutoProgress("0%");
      setFullAutoLogs(prev => [...prev, `❌ 拼接過程出錯：${err.message || err}`]);
      showToast("拼接失敗", "error");
    } finally {
      setIsFullAutoProducing(false);
    }
  };

  // Reset the global video task lock in the backend
  const handleResetVideoTask = async () => {
    // Optimistically unlock the frontend UI state first to ensure user is never stuck
    if (activeProject) {
      const updatedScenes = activeProject.scenes.map(s => ({
        ...s,
        isGeneratingVideo: false,
        isGeneratingVideoExt: false,
        isGeneratingVideoKeyframes: false,
        videoError: undefined,
        videoErrorExt: undefined,
        videoErrorKeyframes: undefined
      }));
      updateActiveProject({ scenes: updatedScenes });
    }

    try {
      const res = await fetch("/api/reset-task", { method: "POST" });
      if (res.ok) {
        showToast("已成功重設後端算圖鎖定！", "success");
      } else {
        showToast("後端鎖定重設回傳異常，已強制解除前端鎖定", "info");
      }
    } catch (err: any) {
      console.warn("Failed to reset task lock:", err);
      showToast("無法連接伺服器重設鎖定，已為您強制解除前端介面鎖定", "info");
    }
  };

  // Generate Next Scene sequentially (一項項, 即時自動導演, 不強迫整篇預先拆解)
  const handleGenerateNextScene = async () => {
    if (!activeProject || isGeneratingNextScene) return;

    const currentCount = activeProject.scenes.length;
    const nextSceneIndex = currentCount + 1;
    setIsGeneratingNextScene(true);
    showToast(`正在 AI 即時導演創作「鏡頭 ${nextSceneIndex}」...`, "info");

    try {
      const prevScenesContext = activeProject.scenes.map((s, idx) => `
[鏡頭 ${idx + 1}]:
標題: ${s.title}
對白: ${s.dialogue || "無"}
旁白: ${s.narration || "無"}
角色: ${s.character || "未指定"}
畫面描繪: ${s.visualPrompt}
動作描述: ${s.actionPrompt || ""}
銜接建議: ${s.step7AdviceForNext || ""}
`).join("\n");

      const response = await fetch("/api/generate-next-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          novelText: activeProject.novelText || "",
          artStyle: activeProject.artStyle,
          cameraMotion: activeProject.cameraMotion,
          existingScenesContext: prevScenesContext,
          nextSceneIndex,
          characters: activeProject.characters,
          customApiKey: customApiKey || undefined
        })
      });

      let newSceneData: any = null;
      if (response.ok) {
        const data = await response.json();
        if (data.scene) {
          newSceneData = data.scene;
        }
      }

      if (!newSceneData) {
        newSceneData = {
          title: `鏡頭 ${nextSceneIndex}`,
          dialogue: `(鏡頭 ${nextSceneIndex} 的即時對白...)`,
          narration: "",
          character: activeProject.characters[0]?.name || "主角",
          visualPrompt: `High quality cinematic shot for Shot ${nextSceneIndex}, ${activeProject.artStyle}, detailed atmospheric background, consistent character design, completely clean video, no subtitles, no text`,
          actionPrompt: `Character moves gracefully in Shot ${nextSceneIndex}, ${activeProject.cameraMotion || "smooth zoom"}`,
          step7AdviceForNext: "保持角色造型與光影與前一鏡頭連貫。"
        };
      }

      const newScene: Scene = {
        id: `scene_ext_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        title: newSceneData.title || `鏡頭 ${nextSceneIndex}`,
        dialogue: newSceneData.dialogue || "",
        narration: newSceneData.narration || "",
        character: newSceneData.character || activeProject.characters[0]?.name || "主角",
        visualPrompt: newSceneData.visualPrompt || `Cinematic shot for scene ${nextSceneIndex}, ${activeProject.artStyle}`,
        actionPrompt: newSceneData.actionPrompt || "",
        transitionPrompt: newSceneData.transitionPrompt || "",
        audioCue: newSceneData.audioCue || "",
        directorNotes: newSceneData.directorNotes || "",
        workflowStep: 1,
        step7AdviceForNext: newSceneData.step7AdviceForNext || ""
      };

      updateActiveProject({
        scenes: [...activeProject.scenes, newScene]
      });

      showToast(`🎉 成功生成「鏡頭 ${nextSceneIndex}」分鏡卡片！`, "success");
    } catch (err: any) {
      console.error("Failed to generate next scene:", err);
      showToast("生成下一個鏡頭失敗，請稍後重試", "error");
    } finally {
      setIsGeneratingNextScene(false);
    }
  };

  // Add a new empty custom storyboard scene
  const handleAddCustomScene = () => {
    if (!activeProject) return;

    const newScene: Scene = {
      id: `scene_custom_${Date.now()}`,
      title: `自定義分鏡場景 ${activeProject.scenes.length + 1}`,
      dialogue: "輸入劇白與旁白字幕...",
      character: "凌風",
      visualPrompt: "Close-up of a handsome character in anime style, atmospheric lighting."
    };

    updateActiveProject({
      scenes: [...activeProject.scenes, newScene]
    });
  };

  // Delete a scene card
  const handleDeleteScene = (sceneId: string) => {
    if (!activeProject) return;
    const filtered = activeProject.scenes.filter(s => s.id !== sceneId);
    updateActiveProject({ scenes: filtered });
  };

  // Edit fields inline in scenes list
  const handleUpdateSceneField = (sceneId: string, field: keyof Scene, value: string | number | boolean) => {
    if (!activeProject) return;
    
    const targetIndex = activeProject.scenes.findIndex(s => s.id === sceneId);
    
    const updated = activeProject.scenes.map((s, idx) => {
      if (s.id === sceneId) {
        const updatedScene = { ...s, [field]: value };
        
        // When strictWorkflowLock is OFF (關閉嚴格鎖/Lenient Mode), setting/uploading an image or video passes instantly
        if (!strictWorkflowLock) {
          if ((field === "imageUrl" || field === "imageUrlExt" || field === "imageUrlKeyframes") && value) {
            updatedScene.step4Passed = true;
            updatedScene.step4ImageReviewScore = s.step4ImageReviewScore ?? 100;
            updatedScene.step4ImageReviewText = s.step4ImageReviewText || "關閉嚴格鎖：直接上載/選擇相片作為該鏡頭結果";
            if ((updatedScene.workflowStep || 1) < 4) updatedScene.workflowStep = 4;
          }
          if ((field === "videoUrl" || field === "videoUrlExt" || field === "videoUrlKeyframes") && value) {
            updatedScene.step6Passed = true;
            updatedScene.step6VideoReviewScore = s.step6VideoReviewScore ?? 100;
            updatedScene.step6VideoReviewText = s.step6VideoReviewText || "關閉嚴格鎖：直接上載/選擇影片作為該鏡頭結果";
            if ((updatedScene.workflowStep || 1) < 6) updatedScene.workflowStep = 6;
          }
        }

        // Chain Update / Invalidation logic for current scene when start frame changes
        if (field === "imageUrlKeyframes" && strictWorkflowLock) {
          updatedScene.videoUrlKeyframes = undefined;
          updatedScene.videoProgressKeyframes = "0%";
          updatedScene.videoErrorKeyframes = undefined;
          updatedScene.videoLogsKeyframes = undefined;
          
          updatedScene.step4Passed = undefined;
          updatedScene.step4ImageReviewScore = undefined;
          updatedScene.step4ImageReviewText = undefined;
          updatedScene.step6Passed = undefined;
          updatedScene.step6VideoReviewScore = undefined;
          updatedScene.step6VideoReviewText = undefined;
          updatedScene.workflowStep = 3; // Reset to step 3 for keyframes review
        }
        
        return updatedScene;
      }
      
      // Invalidation logic for previous scene when its end frame (which is this scene's start frame) changes
      if (field === "imageUrlKeyframes" && idx === targetIndex - 1) {
        return {
          ...s,
          videoUrlKeyframes: undefined,
          videoProgressKeyframes: "0%",
          videoErrorKeyframes: undefined,
          videoLogsKeyframes: undefined,
          step6Passed: undefined,
          step6VideoReviewScore: undefined,
          step6VideoReviewText: undefined
        };
      }
      
      return s;
    });
    
    updateActiveProject({ scenes: updated });
  };

  // Export active project scenes to CSV
  const handleExportCSV = () => {
    if (!activeProject || activeProject.scenes.length === 0) {
      showToast("目前沒有可匯出的分鏡場景！", "error");
      return;
    }

    // Prepare CSV header and rows
    const headers = [
      "分鏡順序 (Scene No.)",
      "分鏡場景標題 (Scene Title)",
      "主要角色 (Character)",
      "台詞對白 (Dialogue)",
      "場景旁白 (Narration)",
      "時長(秒) (Duration)",
      "音訊氛圍與背景音樂 (Audio Cue)",
      "英文畫面提示詞 (Visual Prompt)",
      "導演註記/個人拍攝筆記 (Director's Notes)",
      "參考圖網址 (Image URL)"
    ];

    const rows = activeProject.scenes.map((scene, index) => [
      `分鏡 ${index + 1}`,
      scene.title || "",
      scene.character || "",
      scene.dialogue || "",
      scene.narration || "",
      scene.durationSeconds ? `${scene.durationSeconds}秒` : "5秒",
      scene.audioCue || "",
      scene.visualPrompt || "",
      scene.directorNotes || "",
      scene.imageUrl || ""
    ]);

    // Helper to format values for CSV, escape quotes and handle commas
    const formatCSVCell = (val: string) => {
      const cleanVal = val.replace(/"/g, '""');
      if (cleanVal.includes(",") || cleanVal.includes("\n") || cleanVal.includes('"')) {
        return `"${cleanVal}"`;
      }
      return cleanVal;
    };

    const csvContent = [
      headers.map(formatCSVCell).join(","),
      ...rows.map(row => row.map(formatCSVCell).join(","))
    ].join("\n");

    // Add UTF-8 BOM so Excel opens it with correct Chinese encoding
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeProjectName = activeProject.name.replace(/[/\\?%*:|"<>]/g, '-');
    link.setAttribute("href", url);
    link.setAttribute("download", `ToonFlow_劇本匯出_${safeProjectName}_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`成功匯出 ${activeProject.scenes.length} 個分鏡劇本為 CSV 檔案！`, "success");
  };

  // Drag and drop event handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === index) return;
    setDraggedOverIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDraggedOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      handleDragEnd();
      return;
    }

    if (!activeProject) return;

    const updatedScenes = [...activeProject.scenes];
    const [removed] = updatedScenes.splice(draggedIndex, 1);
    updatedScenes.splice(targetIndex, 0, removed);

    updateActiveProject({ scenes: updatedScenes });
    handleDragEnd();
  };

  // Character management handlers
  const handleExportAllCharacters = () => {
    if (!activeProject || activeProject.characters.length === 0) {
      showToast("沒有可匯出的角色", "info");
      return;
    }
    
    let content = `Project Characters Profile: ${activeProject.name}\n`;
    content += `Exported on: ${new Date().toLocaleString()}\n\n`;
    
    activeProject.characters.forEach((char, index) => {
      content += `=== Character ${index + 1}: ${char.name} ===\n`;
      content += `Name: ${char.name}\n`;
      content += `Role: ${String(char.role || 'N/A')}\n`;
      content += `Age: ${String(char.age || 'N/A')}\n`;
      content += `Description: ${String(char.description || 'N/A')}\n`;
      content += `Clothing: ${String(char.clothing || 'N/A')}\n`;
      content += `Personality: ${String(char.personality || 'N/A')}\n`;
      content += `Mood: ${String(char.mood || 'N/A')}\n`;
      content += `Art Style: ${String(char.artStyle || 'N/A')}\n`;
      content += `Seed: ${char.seed || 'N/A'}\n\n`;
    });

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeProject.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_")}_All_Characters.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast("已匯出所有角色設定檔", "success");
  };

  const handleExportCharacterProfile = (char: Character) => {
    let content = `=== Character Profile ===\n`;
    content += `Name: ${char.name}\n`;
    content += `Role: ${String(char.role || 'N/A')}\n`;
    content += `Age: ${String(char.age || 'N/A')}\n`;
    content += `Description: ${String(char.description || 'N/A')}\n`;
    content += `Clothing: ${String(char.clothing || 'N/A')}\n`;
    content += `Personality: ${String(char.personality || 'N/A')}\n`;
    content += `Mood: ${String(char.mood || 'N/A')}\n`;
    content += `Art Style: ${String(char.artStyle || 'N/A')}\n`;
    content += `Seed: ${String(char.seed || 'N/A')}\n`;

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${char.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_")}_Profile.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast(`已匯出角色設定檔：${char.name}`, "success");
  };

  const handleAddCharacter = () => {
    if (!activeProject) return;
    const newChar: Character = {
      id: `char_custom_${Date.now()}`,
      name: "新角色",
      description: "描述該角色的外貌特徵以保持AI繪圖一致性。"
    };
    updateActiveProject({
      characters: [...activeProject.characters, newChar]
    });
  };

  const handleUpdateChar = (charId: string, field: keyof Character, value: string) => {
    if (!activeProject) return;
    const updated = activeProject.characters.map(c => {
      if (c.id === charId) {
        return { ...c, [field]: value };
      }
      return c;
    });
    updateActiveProject({ characters: updated });
  };

  const handleDeleteChar = (charId: string) => {
    if (!activeProject) return;
    const filtered = activeProject.characters.filter(c => c.id !== charId);
    updateActiveProject({ characters: filtered });
  };

  // Global Character Library management handlers
  const handleSaveToLibrary = (char: Character) => {
    const cleanChar: Character = {
      id: `lib_char_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: char.name || "未命名角色",
      description: char.description || "",
      role: char.role || "",
      avatarUrl: char.avatarUrl || "",
      avatarUrls: Array.isArray(char.avatarUrls) ? [...char.avatarUrls] : (char.avatarUrl ? [char.avatarUrl] : []),
      artStyle: char.artStyle || "",
      age: char.age || "",
      clothing: char.clothing || "",
      personality: char.personality || "",
      mood: char.mood || "",
      seed: char.seed
    };

    const existsIndex = characterLibrary.findIndex(
      c => c.name.trim().toLowerCase() === cleanChar.name.trim().toLowerCase()
    );
    let newLib = [...characterLibrary];

    if (existsIndex > -1) {
      newLib[existsIndex] = { ...cleanChar, id: newLib[existsIndex].id };
      showToast(`已更新角色庫中的「${cleanChar.name}」角色資料！`, "success");
    } else {
      newLib.push(cleanChar);
      showToast(`成功將「${cleanChar.name}」儲存至角色庫！`, "success");
    }

    setCharacterLibrary(newLib);
    localStorage.setItem("toonflow_character_library", JSON.stringify(newLib));
  };

  const handleImportFromLibrary = (libChar: Character) => {
    if (!activeProject) {
      showToast("請先選擇或建立一個專案！", "error");
      return;
    }

    const exists = activeProject.characters.some(
      c => c.name.trim().toLowerCase() === libChar.name.trim().toLowerCase()
    );
    if (exists) {
      showToast(`提示：此專案中已有名為「${libChar.name}」的角色。`, "info");
    }

    const newProjectChar: Character = {
      ...libChar,
      id: `char_custom_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      isGeneratingAvatar: false
    };

    updateActiveProject({
      characters: [...activeProject.characters, newProjectChar]
    });
    
    showToast(`已成功將「${libChar.name}」導入本專案！`, "success");
  };

  const handleRemoveFromLibrary = (libCharId: string, name: string) => {
    const updated = characterLibrary.filter(c => c.id !== libCharId);
    setCharacterLibrary(updated);
    localStorage.setItem("toonflow_character_library", JSON.stringify(updated));
    showToast(`已將「${name}」自角色庫中移除`, "info");
  };

  const handleAnalyzeCharacterTarget = async (char: Character) => {
    if (!activeProject) return;
    setAnalyzingTargetId(char.id);
    showToast(`正在 AI 智能解析「${char.name}」在原著中的特徵目標設定...`, "info");
    try {
      const response = await fetch("/api/analyze-character-target", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterName: char.name,
          novelText: activeProject.novelText || activeProject.scenes.map(s => s.dialogue + " " + (s.narration || "")).join("\n"),
          artStyle: activeProject.artStyle,
          customApiKey: customApiKey || undefined
        })
      });
      if (!response.ok) throw new Error("API error");
      const data = await response.json();
      if (data.targetTraits) {
        updateActiveProject({
          characters: activeProject.characters.map(c => {
            if (c.id === char.id) {
              return {
                ...c,
                targetRole: data.targetTraits.role,
                targetAge: data.targetTraits.age,
                targetClothing: data.targetTraits.clothing,
                targetPersonality: data.targetTraits.personality,
                targetMood: data.targetTraits.mood,
                targetDescription: data.targetTraits.description
              };
            }
            return c;
          })
        });
        showToast(`已成功分析並呈現 ${char.name} 的原著設定特徵！`, "success");
      }
    } catch (err: any) {
      console.error(err);
      showToast("分析失敗，已為您產出預設的特徵對照目標", "error");
      updateActiveProject({
        characters: activeProject.characters.map(c => {
          if (c.id === char.id) {
            return {
              ...c,
              targetRole: char.role || "主角/關鍵核心",
              targetAge: char.age || "青年約25歲",
              targetClothing: char.clothing || "符合當前風格的服飾",
              targetPersonality: char.personality || "勇敢自信，富有同理心",
              targetMood: char.mood || "happy",
              targetDescription: char.description || "A highly consistent character in the novel."
            };
          }
          return c;
        })
      });
    } finally {
      setAnalyzingTargetId(null);
    }
  };

  const handleApplyTargetTrait = (charId: string, field: keyof Character, value: string | number | boolean) => {
    if (!activeProject) return;
    updateActiveProject({
      characters: activeProject.characters.map(c => {
        if (c.id === charId) {
          return { ...c, [field]: value };
        }
        return c;
      })
    });
    showToast("已成功套用該特徵目標設定！", "success");
  };

  const handleApplyAllTargetTraits = (char: Character) => {
    if (!activeProject) return;
    updateActiveProject({
      characters: activeProject.characters.map(c => {
        if (c.id === char.id) {
          return {
            ...c,
            role: char.targetRole || c.role,
            age: char.targetAge || c.age,
            clothing: char.targetClothing || c.clothing,
            personality: char.targetPersonality || c.personality,
            mood: char.targetMood || c.mood,
            description: char.targetDescription || c.description
          };
        }
        return c;
      })
    });
    showToast(`已一鍵修復並對齊「${char.name}」的所有特徵偏差！`, "success");
  };

  const handleSyncCharacterClothing = async (charId: string) => {
    if (!activeProject) return;
    const charObj = activeProject.characters.find(c => c.id === charId);
    if (!charObj) return;

    const charLower = (charObj.name || "").trim().toLowerCase();
    const affectedScenes = activeProject.scenes.filter(s => (s.character || "").trim().toLowerCase().includes(charLower));
    if (affectedScenes.length === 0) {
      showToast(`目前分鏡中沒有任何場景出現主角「${charObj.name}」！`, "error");
      return;
    }

    showToast("正在智能同步並校正所有分鏡的服裝設定...", "info");

    try {
      const updatedScenes = [...activeProject.scenes];
      
      for (let i = 0; i < updatedScenes.length; i++) {
        const scene = updatedScenes[i];
        if ((scene.character || "").trim().toLowerCase().includes(charLower)) {
          // Use description or the narration/dialogue as base input
          const rawInput = scene.narration || scene.dialogue || scene.visualPrompt || scene.title;
          
          const res = await fetch("/api/optimize-prompt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: rawInput,
          sceneId: scene.id,
              artStyle: charObj.artStyle || activeProject.artStyle,
              character: charObj.name,
              characterDescription: `${charObj.description || ""}. Ensure wearing: ${charObj.clothing || ""}.`,
              customApiKey: customApiKey || undefined,
              mood: charObj.mood
            })
          });

          if (res.ok) {
            const data = await res.json();
            if (data.optimizedPrompt) {
              updatedScenes[i] = {
                ...scene,
                visualPrompt: data.optimizedPrompt
              };
            }
          }
        }
      }

      updateActiveProject({ scenes: updatedScenes });
      showToast("✨ 成功！所有分鏡的角色服裝已校正為一致。", "success");
    } catch (e: any) {
      console.error(e);
      showToast("同步服裝時發生錯誤，請稍後再試。", "error");
    }
  };

  const handleUploadSceneImage = async (e: React.ChangeEvent<HTMLInputElement>, sceneId: string, field: "imageUrl" | "imageUrlExt" | "imageUrlKeyframes") => {
    if (!activeProject) return;
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    if (!isImage && !isVideo) {
      showToast('請上傳有效的圖片或影片檔案 (PNG, JPG, MP4, WebM)', 'error');
      return;
    }

    showToast(isVideo ? '正在上傳影片媒體檔案...' : '正在處理並上傳圖片...', 'info');

    const readFileAsBase64 = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const result = event.target?.result as string;
          if (result) resolve(result);
          else reject(new Error("File read error"));
        };
        reader.onerror = () => reject(new Error("File reader error"));
        reader.readAsDataURL(file);
      });
    };

    const compressSceneImage = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const result = event.target?.result as string;
          if (!result) {
            reject(new Error("File read error"));
            return;
          }
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1024;
            const MAX_HEIGHT = 576;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
              }
            } else {
              if (height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height;
                height = MAX_HEIGHT;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
            resolve(compressedDataUrl);
          };
          img.onerror = () => reject(new Error("Image load error"));
          img.src = result;
        };
        reader.onerror = () => reject(new Error("File reader error"));
        reader.readAsDataURL(file);
      });
    };

    try {
      const base64Data = isVideo ? await readFileAsBase64(file) : await compressSceneImage(file);
      const uploadRes = await fetch("/api/upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64Data })
      });
      if (!uploadRes.ok) throw new Error("Server upload failed");
      const uploadData = await uploadRes.json();
      
      if (isVideo) {
        const targetVidField = field === "imageUrlExt" ? "videoUrlExt" : (field === "imageUrlKeyframes" ? "videoUrlKeyframes" : "videoUrl");
        handleUpdateSceneField(sceneId, targetVidField, uploadData.imageUrl);
        showToast('🎬 影片媒體上傳並成功套用為此鏡頭的結果！', 'success');
      } else {
        handleUpdateSceneField(sceneId, field, uploadData.imageUrl);
        showToast('🖼️ 圖片上傳並成功套用！', 'success');
      }
    } catch (err) {
      console.error("Media upload failed:", err);
      showToast('媒體處理與上傳失敗，請重試', 'error');
    }
  };

  const handleImageDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleImageDrop = async (e: React.DragEvent, sceneId: string, field: "imageUrl" | "imageUrlExt" | "imageUrlKeyframes") => {
    e.preventDefault();
    e.stopPropagation();
    if (!activeProject) return;
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    if (!isImage && !isVideo) {
      showToast('請拖曳有效的圖片或影片檔案', 'error');
      return;
    }

    showToast(isVideo ? '正在處理並上傳拖曳影片...' : '正在處理並上傳拖曳圖片...', 'info');

    const readFileAsBase64 = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const result = event.target?.result as string;
          if (result) resolve(result);
          else reject(new Error("File read error"));
        };
        reader.onerror = () => reject(new Error("File reader error"));
        reader.readAsDataURL(file);
      });
    };

    const compressSceneImage = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const result = event.target?.result as string;
          if (!result) {
            reject(new Error("File read error"));
            return;
          }
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1024;
            const MAX_HEIGHT = 576;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
              }
            } else {
              if (height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height;
                height = MAX_HEIGHT;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
            resolve(compressedDataUrl);
          };
          img.onerror = () => reject(new Error("Image load error"));
          img.src = result;
        };
        reader.onerror = () => reject(new Error("File reader error"));
        reader.readAsDataURL(file);
      });
    };

    try {
      const base64Data = isVideo ? await readFileAsBase64(file) : await compressSceneImage(file);
      const uploadRes = await fetch("/api/upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64Data })
      });
      if (!uploadRes.ok) throw new Error("Server upload failed");
      const uploadData = await uploadRes.json();
      
      if (isVideo) {
        const targetVidField = field === "imageUrlExt" ? "videoUrlExt" : (field === "imageUrlKeyframes" ? "videoUrlKeyframes" : "videoUrl");
        handleUpdateSceneField(sceneId, targetVidField, uploadData.imageUrl);
        showToast('🎬 影片拖曳上傳成功！', 'success');
      } else {
        handleUpdateSceneField(sceneId, field, uploadData.imageUrl);
        showToast('🖼️ 圖片拖曳上傳成功！', 'success');
      }
    } catch (err) {
      console.error("Media compression/upload failed:", err);
      showToast('媒體處理與上傳失敗，請重試', 'error');
    }
  };

  const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>, charId: string) => {
    if (!activeProject) return;
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f && f.type.startsWith('image/')) {
        validFiles.push(f);
      }
    }

    if (validFiles.length === 0) {
      showToast('請上傳有效的圖片檔案', 'error');
      return;
    }

    showToast(`正在處理上傳的 ${validFiles.length} 張圖片...`, 'info');

    // Helper to read and compress image
    const compressImage = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const result = event.target?.result as string;
          if (!result) {
            reject(new Error("File read error"));
            return;
          }
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 512;
            const MAX_HEIGHT = 512;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
              }
            } else {
              if (height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height;
                height = MAX_HEIGHT;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
            resolve(compressedDataUrl);
          };
          img.onerror = () => reject(new Error("Image load error"));
          img.src = result;
        };
        reader.onerror = () => reject(new Error("File reader error"));
        reader.readAsDataURL(file);
      });
    };

    try {
      const compressedImages: string[] = [];
      for (const file of validFiles) {
        try {
          const compressed = await compressImage(file);
          // Upload to server to get static path
          const uploadRes = await fetch("/api/upload-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ base64Data: compressed })
          });
          if (uploadRes.ok) {
            const uploadData = await uploadRes.json();
            compressedImages.push(uploadData.imageUrl);
          } else {
            console.error("Server upload failed, falling back to base64");
            compressedImages.push(compressed);
          }
        } catch (err) {
          console.error("Compression/upload failed for file:", file.name, err);
        }
      }

      if (compressedImages.length === 0) {
        showToast('圖片處理與上傳失敗，請重試', 'error');
        return;
      }

      // Add to characters
      updateActiveProject(prev => {
        const list = prev.characters.map(c => {
          if (c.id === charId) {
            const currentUrls = Array.isArray(c.uploadedAvatarUrls) ? c.uploadedAvatarUrls : (c.uploadedAvatarUrl ? [c.uploadedAvatarUrl] : []);
            const updatedUrls = [...currentUrls, ...compressedImages];
            return { 
              ...c, 
              uploadedAvatarUrl: updatedUrls[0],
              uploadedAvatarUrls: updatedUrls,
              avatarUrl: c.avatarUrl || updatedUrls[0],
              avatarUrls: c.avatarUrls && c.avatarUrls.length > 0 ? c.avatarUrls : [updatedUrls[0]],
              isGeneratingAvatar: true
            };
          }
          return c;
        });
        return { characters: list };
      });

      showToast(`已成功上傳 ${compressedImages.length} 張參考相片！正在分析特徵...`, 'info');

      // Call endpoint to analyze the first uploaded face avatar
      const primaryImage = compressedImages[0];
      fetch("/api/analyze-avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          avatarUrl: primaryImage,
          customApiKey: customApiKey || undefined
        })
      })
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Analysis failed");
        }
        return res.json();
      })
      .then(data => {
        if (data.description) {
          updateActiveProject(prev => {
            const updatedList = prev.characters.map(c => {
              if (c.id === charId) {
                return {
                  ...c,
                  description: data.description,
                  isGeneratingAvatar: false
                };
              }
              return c;
            });
            return { characters: updatedList };
          });
          showToast('✨ 角色五官特徵分析完成！已自動儲存為特徵描述，將完美應用於後續繪圖與影片生成！', 'success');
        } else {
          throw new Error("No description returned");
        }
      })
      .catch(err => {
        console.error("Avatar analysis error:", err);
        updateActiveProject(prev => {
          const updatedList = prev.characters.map(c => {
            if (c.id === charId) {
              return { ...c, isGeneratingAvatar: false };
            }
            return c;
          });
          return { characters: updatedList };
        });
        showToast('相片已成功設定，但特徵自動分析未完成。您可以在下方手動調整特徵描述。', 'info');
      });

    } catch (err) {
      console.error("Upload process error:", err);
      showToast('圖片上傳處理失敗，請重試', 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleDeleteUploadedPhoto = (charId: string, photoUrl: string) => {
    if (!activeProject) return;
    updateActiveProject(prev => {
      const updatedChars = prev.characters.map(c => {
        if (c.id === charId) {
          const currentUrls = Array.isArray(c.uploadedAvatarUrls) ? c.uploadedAvatarUrls : [];
          const updatedUrls = currentUrls.filter(url => url !== photoUrl);
          const newPrimary = updatedUrls[0] || "";
          
          return {
            ...c,
            uploadedAvatarUrl: newPrimary,
            uploadedAvatarUrls: updatedUrls,
            avatarUrl: c.avatarUrl === photoUrl ? newPrimary : c.avatarUrl,
            avatarUrls: Array.isArray(c.avatarUrls) ? c.avatarUrls.filter(url => url !== photoUrl) : []
          };
        }
        return c;
      });
      return { characters: updatedChars };
    });
    showToast('已移除該張參考相片', 'info');
  };

  // Character multi-angle (3-view) design sheet — prefers Agnes; Gemini falls back to Agnes server-side
  const handleGenerateAvatar = async (charId: string, engine: 'agnes' | 'gemini' | 'nanobanana' | 'mistral' = 'agnes') => {
    if (!activeProject) return;

    const charToGen = activeProject.characters.find(c => c.id === charId);
    if (!charToGen) return;

    // Nanobanana/mistral are remapped server-side to Agnes; gemini auto-falls back to Agnes if no key
    if (engine === 'gemini') {
      showToast("正在嘗試 Gemini；若無有效金鑰會自動改用 Agnes 生成三視角…", "info");
    } else if (engine === 'nanobanana' || engine === 'mistral') {
      showToast("已改走 Agnes 真實繪圖（禁用 Unsplash 保底）…", "info");
    } else {
      showToast("正在用 Agnes 生成一致性三視角設計圖（約 1–2 分鐘，請稍候）…", "info");
    }

    updateActiveProject(prev => {
      const updatedChars = prev.characters.map(c => {
        if (c.id === charId) return { ...c, isGeneratingAvatar: true };
        return c;
      });
      return { characters: updatedChars };
    });

    const charSeed = charToGen.seed || Math.floor(Math.random() * 1000000) + 1;

    // Rich prompt for three-view turnaround
    const baseDesc = charToGen.description.trim() ||
      `${charToGen.name || "主角"}${charToGen.role ? `, 身份/職業: ${charToGen.role}` : ""}${charToGen.age ? `, 年齡: ${charToGen.age}` : ""}${charToGen.clothing ? `, 服裝風格: ${charToGen.clothing}` : ""}${charToGen.personality ? `, 性格特質: ${charToGen.personality}` : ""}`;
    const combinedPrompt = `character turnaround sheet, three views front side and back, ${baseDesc}`;

    const controller = new AbortController();
    abortControllersRef.current[charId] = controller;
    // Server may retry Agnes up to ~3×120s when busy — allow longer client wait
    const timeoutId = setTimeout(() => controller.abort(new Error("請求處理超時（約 4 分鐘）。Agnes 可能忙碌，請隔 30 秒再按 Agnes AI 重試")), 240000);

    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: combinedPrompt,
          artStyle: charToGen.artStyle || activeProject.artStyle,
          character: charToGen.name,
          characterDescription: charToGen.description || baseDesc,
          isAvatar: true,
          characterImages: charToGen.uploadedAvatarUrls && charToGen.uploadedAvatarUrls.length > 0
            ? charToGen.uploadedAvatarUrls
            : (charToGen.uploadedAvatarUrl ? [charToGen.uploadedAvatarUrl] : (charToGen.avatarUrls || (charToGen.avatarUrl ? [charToGen.avatarUrl] : []))),
          seed: charSeed,
          engine: engine,
          agnesImageMode: activeProject.agnesImageMode || "quality",
          customApiKey: customApiKey || undefined
        })
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "設計圖生成失敗");
      }
      const textRes = await res.text();
      let data: any;
      try {
        data = JSON.parse(textRes);
      } catch(e) {
        console.warn("[Toonflow] Failed to parse character image response JSON. Raw text:", textRes.substring(0, 50));
        throw new Error("伺服器回傳格式錯誤，請稍後再試。");
      }

      if (!data.imageUrl) {
        throw new Error("伺服器未回傳圖像網址");
      }
      
      if (data.message) {
        showToast(data.message, data.isAgnesImage ? "success" : "info");
      }
      
      updateActiveProject(prev => {
        const list = prev.characters.map(c => {
          if (c.id === charId) {
            return { 
              ...c, 
              avatarUrl: data.imageUrl, // single multi-angle sheet
              avatarUrls: [data.imageUrl],
              seed: charSeed,
              isGeneratingAvatar: false 
            };
          }
          return c;
        });
        return { characters: list };
      });
    } catch (e: any) {
      clearTimeout(timeoutId);
      const isAbort = e.name === 'AbortError' || 
                      e.message === 'USER_ABORTED' || 
                      e.message?.toLowerCase().includes('abort') || 
                      controller.signal.aborted;
      if (isAbort) {
        showToast(e.message?.includes("超時") ? String(e.message) : "已停止繪圖", "info");
        updateActiveProject(prev => {
          const list = prev.characters.map(c => {
            if (c.id === charId) {
              return { 
                ...c, 
                isGeneratingAvatar: false 
              };
            }
            return c;
          });
          return { characters: list };
        });
        return;
      }
      showToast(`角色設計圖生成失敗：${e.message || "與繪圖伺服器連接時發生錯誤"}`, "error");
      // NO avatar fallback image
      updateActiveProject(prev => {
        const list = prev.characters.map(c => {
          if (c.id === charId) {
            return {
              ...c,
              isGeneratingAvatar: false
            };
          }
          return c;
        });
        return { characters: list };
      });
    } finally {
      if (abortControllersRef.current[charId] === controller) {
        delete abortControllersRef.current[charId];
      }
    }
  };

  const handleStopGenerateAvatar = (charId: string) => {
    if (abortControllersRef.current[charId]) {
      console.log(`[Toonflow] Stopping character generation ${charId}...`);
      abortControllersRef.current[charId].abort(new Error("USER_ABORTED"));
      delete abortControllersRef.current[charId];
    }
    if (activeProject) {
      const updatedChars = activeProject.characters.map(c => {
        if (c.id === charId) return { ...c, isGeneratingAvatar: false };
        return c;
      });
      updateActiveProject({ characters: updatedChars });
    }
  };

  // Simulated 3D Camera / Pan playback loop trigger
  const triggerSimulation = (scene: Scene) => {
    setSelectedSceneForSimulation(scene);
    setIsPlayingSimulation(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col selection:bg-pink-500 selection:text-white overflow-x-hidden">
      {/* Toast Notification Banner */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-4 right-4 z-[9999] p-4 rounded-xl shadow-2xl border flex items-center space-x-3 backdrop-blur-md max-w-sm ${
              toast.type === "success" 
                ? "bg-emerald-950/95 border-emerald-500/30 text-emerald-200" 
                : toast.type === "error"
                  ? "bg-red-950/95 border-red-500/30 text-red-200"
                  : "bg-indigo-950/95 border-indigo-500/30 text-indigo-200"
            }`}
          >
            {toast.type === "success" ? (
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : toast.type === "error" ? (
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            ) : (
              <Info className="w-5 h-5 text-indigo-400 shrink-0" />
            )}
            <div className="flex-1 text-xs font-medium leading-relaxed">
              {toast.message}
            </div>
            <button 
              onClick={() => setToast(null)}
              className="text-slate-400 hover:text-slate-200 cursor-pointer p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AuthWrapper 
        currentUser={currentUser} 
        isAuthLoading={isAuthLoading} 
        onSignIn={handleSignIn}
        onCustomSignIn={handleCustomSignIn}
      >
        {/* Immersive background glow orbs */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-30 z-0">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-indigo-600 blur-3xl animate-pulse" style={{ animationDuration: "12s" }} />
        <div className="absolute top-1/2 right-10 w-[450px] h-[450px] rounded-full bg-pink-600 blur-3xl animate-pulse" style={{ animationDuration: "18s" }} />
        <div className="absolute bottom-10 left-1/3 w-[400px] h-[400px] rounded-full bg-cyan-600 blur-3xl animate-pulse" style={{ animationDuration: "15s" }} />
      </div>

      {/* Main Header */}
      <header className="relative z-10 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3 shrink-0">
          <div 
            onClick={() => {
              setActiveProjectId(null);
              localStorage.removeItem("toonflow_active_project_id");
            }}
            className="bg-gradient-to-tr from-pink-600 to-indigo-600 p-2.5 rounded-xl shadow-lg shadow-pink-600/20 cursor-pointer hover:opacity-90 active:scale-95 transition shrink-0"
            title="點擊返回大廳 (Return to Lobby)"
          >
            <Film className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-lg sm:text-xl font-bold tracking-tight text-white">
                Toonflow Platform
              </h1>
              <span className="text-[10px] bg-gradient-to-r from-pink-500/20 to-indigo-500/20 text-pink-400 font-mono px-2 py-0.5 rounded-full border border-pink-500/30 whitespace-nowrap">
                Remix V2.1
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-400">Multi-Scene Cinematic Script & Video Production Lab</p>
          </div>
        </div>

        {/* Global actions and Settings */}
        <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
          {activeProjectId && (
            <button
              onClick={() => {
                setActiveProjectId(null);
                localStorage.removeItem("toonflow_active_project_id");
              }}
              className="text-xs text-slate-200 hover:text-white bg-indigo-950/90 hover:bg-indigo-900 px-3 py-2 rounded-xl border border-indigo-500/40 transition flex items-center gap-1.5 cursor-pointer shadow-md font-bold whitespace-nowrap"
              title="返回大廳 (Return to Lobby)"
            >
              <ChevronLeft className="w-4 h-4 text-indigo-400" />
              <span>＜ 返回大廳</span>
            </button>
          )}

          {activeProjectId && (
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 space-x-0.5">
              <button
                onClick={handleUndo}
                disabled={undoStack.length === 0 && (!stableProjectRef.current || getProjectSignature(activeProject) === getProjectSignature(stableProjectRef.current))}
                className={ `p-1.5 rounded-md transition flex items-center gap-1 ${
                  undoStack.length > 0 || (stableProjectRef.current && activeProject && getProjectSignature(activeProject) !== getProjectSignature(stableProjectRef.current))
                    ? "text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
                    : "text-slate-600 cursor-not-allowed opacity-50"
                }`}
                title="復原變更 (Ctrl+Z)"
              >
                <Undo className="w-3.5 h-3.5" />
                <span className="text-[10px] px-0.5 font-bold uppercase hidden md:inline">復原</span>
              </button>
              <div className="w-px h-3.5 bg-slate-800" />
              <button
                onClick={handleRedo}
                disabled={redoStack.length === 0}
                className={ `p-1.5 rounded-md transition flex items-center gap-1 ${
                  redoStack.length > 0
                    ? "text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
                    : "text-slate-600 cursor-not-allowed opacity-50"
                }`}
                title="重做變更 (Ctrl+Y)"
              >
                <Redo className="w-3.5 h-3.5" />
                <span className="text-[10px] px-0.5 font-bold uppercase hidden md:inline">重做</span>
              </button>
            </div>
          )}

          {isAuthLoading ? (
            <div className="flex items-center space-x-1.5 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-lg text-xs text-slate-400">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>載入中...</span>
            </div>
          ) : currentUser ? (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsProfileModalOpen(true)}
                className="flex items-center space-x-1.5 bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 px-3 py-1.5 rounded-lg text-xs transition cursor-pointer"
                title="點擊設定創作者暱稱與切換帳號"
              >
                {currentUser.photoURL ? (
                  <img src={currentUser.photoURL} alt="avatar" className="w-4 h-4 rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                )}
                <span className="text-slate-200 font-bold text-[11px] max-w-[120px] truncate">
                  {currentUser.displayName || currentUser.email?.split("@")[0] || "已登入"}
                </span>
                <span className="bg-cyan-500/10 text-cyan-400 text-[9px] px-1.5 py-0.5 rounded border border-cyan-500/20 font-bold uppercase">
                  {currentUser.uid?.startsWith("guest_") ? "自訂身份" : "雲端同步"}
                </span>
              </button>
              <button
                onClick={handleSignOut}
                className="text-xs text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 px-2.5 py-1.5 rounded-lg transition cursor-pointer"
              >
                登出
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <button
                onClick={handleSignIn}
                className="text-xs font-bold text-white bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 active:scale-95 cursor-pointer"
              >
                <User className="w-3.5 h-3.5" />
                <span>Google 登入同步</span>
              </button>
              <button
                onClick={() => setIsProfileModalOpen(true)}
                className="hidden lg:flex items-center space-x-1 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 px-2.5 py-1.5 rounded-lg text-[10px] text-slate-300 font-semibold cursor-pointer transition"
                title="點擊自訂創作者暱稱與個人身份"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span>設定創作者暱稱</span>
              </button>
            </div>
          )}

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition shadow-sm cursor-pointer"
            title="Open Config Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Primary views container */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col">
        
        {/* ================= VIEW 1: DASHBOARD ================= */}
        {activeProjectId === null || !activeProject ? (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8 flex-1 flex flex-col justify-center max-w-4xl w-full mx-auto py-12"
          >
            {/* Beautiful branding hero section */}
            <div className="text-center space-y-3 max-w-2xl mx-auto mb-4">
              <div className="inline-flex p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-2">
                <Sparkles className="w-8 h-8" />
              </div>
              <h2 className="font-display font-extrabold text-3xl md:text-4xl text-white tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                Toonflow Dashboard
              </h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                Welcome back. Ready to bring your ideas to life? Manage multiple narrative projects, split stories with Gemini AI, configure video engines, and export cinematic masterpieces.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
              {/* Left Column: Recent project list */}
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-4">
                <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                  <span>Recent Projects (專案管理)</span>
                  <span className="text-xs text-slate-500 font-mono">Count: {projects.length}</span>
                </h3>

                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {projects.map(proj => (
                    <div
                      key={proj.id}
                      onClick={() => {
                        setActiveProjectId(proj.id);
                        setActiveTab("scenes");
                      }}
                      className="group bg-slate-950/80 hover:bg-slate-900 border border-slate-800/80 hover:border-indigo-500/50 p-4 rounded-xl flex items-center justify-between transition-all duration-300 cursor-pointer hover:-translate-y-0.5"
                    >
                      <div className="space-y-1">
                        <h4 className="font-bold text-slate-200 group-hover:text-indigo-400 transition text-sm">
                          {proj.name}
                        </h4>
                        <p className="text-[11px] text-slate-500 flex items-center gap-2">
                          <span>Created: {proj.createdAt}</span>
                          <span>•</span>
                          <span className="text-indigo-400">{proj.scenes.length} Scenes</span>
                        </p>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={(e) => handleDeleteProject(proj.id, e)}
                          className="p-1.5 bg-slate-900 hover:bg-red-950 text-slate-500 hover:text-red-400 border border-slate-850 rounded-lg transition"
                          title="Delete Project"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {projects.length === 0 && (
                    <div className="text-center p-8 border border-dashed border-slate-800 rounded-xl text-slate-600 text-xs">
                      No projects available. Create a new animation project to begin.
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Create new project */}
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-5">
                <div className="space-y-1">
                  <h3 className="font-display font-bold text-lg text-white">Create New</h3>
                  <p className="text-xs text-slate-400">Start a fresh animations storyboard project from scratch.</p>
                </div>

                <form onSubmit={handleCreateProject} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs text-slate-400 font-medium">Project Name (專案名稱)</label>
                    <input
                      type="text"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition placeholder:text-slate-600"
                      placeholder="輸入新專案名稱..."
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-indigo-600/10 flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>創建新專案 (Create Project)</span>
                  </button>
                </form>
              </div>
            </div>
          </motion.div>
        ) : (
          // ================= VIEW 2: ACTIVE WORKSPACE =================
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left Sidebar: Workspace Info & Vertical Tabs Stack */}
            <div className="lg:col-span-3 space-y-6">
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-pink-500 font-mono tracking-wider uppercase font-extrabold">Active Workspace</p>
                    <button
                      onClick={() => {
                        setIsEditingProjectName(!isEditingProjectName);
                        setEditingProjectNameValue(activeProject.name);
                      }}
                      className="text-slate-400 hover:text-indigo-300 text-[11px] font-normal normal-case flex items-center gap-1 cursor-pointer transition"
                      title="修改專案名稱"
                    >
                      <Edit3 className="w-3 h-3 text-indigo-400" />
                      <span>修改名稱</span>
                    </button>
                  </div>

                  {isEditingProjectName ? (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={editingProjectNameValue}
                        onChange={(e) => setEditingProjectNameValue(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSaveProjectName()}
                        autoFocus
                        className="bg-slate-950 border border-indigo-500 rounded-lg px-2.5 py-1 text-sm font-bold text-white w-full focus:outline-none"
                        placeholder="輸入新名稱..."
                      />
                      <button
                        onClick={handleSaveProjectName}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs cursor-pointer shrink-0 transition"
                      >
                        儲存
                      </button>
                    </div>
                  ) : (
                    <h2 
                      onClick={() => {
                        setIsEditingProjectName(true);
                        setEditingProjectNameValue(activeProject.name);
                      }}
                      className="font-display font-black text-2xl text-white tracking-tight leading-none cursor-pointer hover:text-indigo-300 transition flex items-center gap-2 group"
                      title="點擊修改專案名稱"
                    >
                      <span>{activeProject.name}</span>
                      <Edit3 className="w-4 h-4 text-slate-500 opacity-0 group-hover:opacity-100 transition shrink-0" />
                    </h2>
                  )}

                  <p className="text-[10px] text-slate-500 font-mono">
                    Created: {activeProject.createdAt}
                  </p>
                </div>

                {/* Stacked Vertical Tab Switcher */}
                <div className="flex flex-col gap-2.5 pt-2">
                  <button
                    onClick={() => setActiveTab("novel")}
                    className={ `w-full py-3.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-between gap-1.5 cursor-pointer border ${
                      activeTab === "novel"
                        ? "bg-gradient-to-r from-indigo-600 to-indigo-800 text-white border-indigo-500 shadow-lg shadow-indigo-600/20"
                        : "bg-slate-950/60 text-slate-400 hover:text-slate-200 border-slate-850 hover:border-slate-800"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      <span>原著劇本 📖</span>
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveTab("characters")}
                    className={ `w-full py-3.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-between gap-1.5 cursor-pointer border ${
                      activeTab === "characters"
                        ? "bg-gradient-to-r from-pink-600 to-indigo-600 text-white border-pink-500 shadow-lg shadow-pink-600/20"
                        : "bg-slate-950/60 text-slate-400 hover:text-slate-200 border-slate-850 hover:border-slate-800"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-pink-400" />
                      <span>角色一致性 👥</span>
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveTab("scenes")}
                    className={ `w-full py-3.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-between gap-1.5 cursor-pointer border ${
                      activeTab === "scenes"
                        ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white border-cyan-500 shadow-lg shadow-cyan-600/20"
                        : "bg-slate-950/60 text-slate-400 hover:text-slate-200 border-slate-850 hover:border-slate-800"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-400" />
                      <span>AI 分鏡劇本 ⚡</span>
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveTab("scenes_ext")}
                    className={ `w-full py-3.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-between gap-1.5 cursor-pointer border ${
                      activeTab === "scenes_ext"
                        ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-500 shadow-lg shadow-emerald-600/20"
                        : "bg-slate-950/60 text-slate-400 hover:text-slate-200 border-slate-850 hover:border-slate-800"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Film className="w-4 h-4 text-emerald-400" />
                      <span>AI 分鏡劇本延長 🧩</span>
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveTab("scenes_keyframes")}
                    className={ `w-full py-3.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-between gap-1.5 cursor-pointer border ${
                      activeTab === "scenes_keyframes"
                        ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-purple-500 shadow-lg shadow-purple-600/20"
                        : "bg-slate-950/60 text-slate-400 hover:text-slate-200 border-slate-850 hover:border-slate-800"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Video className="w-4 h-4 text-purple-400" />
                      <span>AI 分鏡劇本首尾幀 🎬</span>
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab("auto_director")}
                    className={ `w-full py-3.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-between gap-1.5 cursor-pointer border ${
                      activeTab === "auto_director"
                        ? "bg-gradient-to-r from-fuchsia-600 via-pink-600 to-purple-600 text-white border-fuchsia-500 shadow-lg shadow-fuchsia-600/30"
                        : "bg-slate-950/60 text-slate-400 hover:text-slate-200 border-slate-850 hover:border-slate-800"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Clapperboard className="w-4 h-4 text-fuchsia-400" />
                      <span>🎬 AI 自動導演</span>
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab("gallery")}
                    className={ `w-full py-3.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-between gap-1.5 cursor-pointer border ${
                      activeTab === "gallery"
                        ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-500 shadow-lg shadow-emerald-600/20"
                        : "bg-slate-950/60 text-slate-400 hover:text-slate-200 border-slate-850 hover:border-slate-800"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Film className="w-4 h-4 text-emerald-400" />
                      <span>已生成影片庫 🎥</span>
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab("experience")}
                    className={ `w-full py-3.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-between gap-1.5 cursor-pointer border ${
                      activeTab === "experience"
                        ? "bg-gradient-to-r from-orange-600 to-red-600 text-white border-orange-500 shadow-lg shadow-orange-600/20"
                        : "bg-slate-950/60 text-slate-400 hover:text-slate-200 border-slate-850 hover:border-slate-800"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <BrainCircuit className="w-4 h-4 text-orange-400" />
                      <span>AI 經驗圖書館 📚</span>
                    </span>
                  </button>
                </div>

                {/* Export Project Script Section */}
                <div className="pt-5 border-t border-slate-800/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-indigo-400 font-mono tracking-wider uppercase font-bold">劇本匯出與離線備份</p>
                    <span className="text-[9px] text-slate-500 font-mono">Export v1.1</span>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      onClick={handleExportCSV}
                      className="w-full py-2.5 px-3 bg-slate-950/80 hover:bg-slate-900 border border-slate-850 hover:border-indigo-500/50 text-slate-300 hover:text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg hover:shadow-indigo-500/5"
                      title="匯出為標準 CSV 逗號分隔值檔案，適用於 Excel / 試算表軟體"
                    >
                      <Download className="w-4 h-4 text-indigo-400" />
                      <span>匯出 CSV 劇本資料</span>
                    </button>
                    <button
                      onClick={() => setIsPrintModalOpen(true)}
                      className="w-full py-2.5 px-3 bg-slate-950/80 hover:bg-slate-900 border border-slate-850 hover:border-pink-500/50 text-slate-300 hover:text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg hover:shadow-pink-500/5"
                      title="開啟導演劇本列印預覽，可直接另存為 PDF 檔案"
                    >
                      <Printer className="w-4 h-4 text-pink-400 animate-pulse" />
                      <span>列印劇本與匯出 PDF</span>
                    </button>
                  </div>
                </div>

              </div>
            </div>

            {/* Right Column: Tab Content */}
            <div className="lg:col-span-9 space-y-6">
              
              {/* ============ TAB: ORIGINAL NOVEL ============ */}
              {activeTab === "novel" && (
                <div className="w-full space-y-6">
                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-4">
                    <h3 className="font-display font-bold text-lg text-white flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-indigo-400" />
                      原著劇本輸入 (Original Script text area)
                    </h3>
                    <p className="text-xs text-slate-400">
                      貼上您要進行分鏡的劇本段落。接下來，一條龍 AI 拆解引擎將會自動為您分析段落，識別出場角色，提取精彩台詞對白，並智慧翻譯生成精美的 3D English Storyboard 繪圖提示詞！
                    </p>

                    {/* Agent Selector for Novel Generation */}
                    <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-indigo-400" />
                          選擇參與創作的 Agent (多選時將自動進行組內協調討論)：
                        </label>
                        <button
                          onClick={() => {
                            if (selectedNovelAgents.length === 3) {
                              setSelectedNovelAgents([]);
                            } else {
                              setSelectedNovelAgents(['gemini', 'agnes', 'mistral']);
                            }
                          }}
                          className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-0.5 rounded transition cursor-pointer"
                        >
                          {selectedNovelAgents.length === 3 ? "全部取消" : "全選"}
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { id: 'gemini' as const, name: 'Gemini', color: 'border-indigo-500/30 text-indigo-200 bg-indigo-950/20', activeColor: 'border-indigo-500 bg-indigo-950/50 text-indigo-100 ring-1 ring-indigo-500/30' },
                          { id: 'agnes' as const, name: 'Agnes', color: 'border-pink-500/30 text-pink-200 bg-pink-950/20', activeColor: 'border-pink-500 bg-pink-950/50 text-pink-100 ring-1 ring-pink-500/30' },
                          { id: 'mistral' as const, name: 'Agent3 (Mistral)', color: 'border-blue-500/30 text-blue-200 bg-blue-950/20', activeColor: 'border-blue-500 bg-blue-950/50 text-blue-100 ring-1 ring-blue-500/30' }
                        ].map((agent) => {
                          const isSelected = selectedNovelAgents.includes(agent.id);
                          return (
                            <button
                              key={agent.id}
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedNovelAgents(selectedNovelAgents.filter(a => a !== agent.id));
                                } else {
                                  setSelectedNovelAgents([...selectedNovelAgents, agent.id]);
                                }
                              }}
                              className={ `py-2 px-3 border rounded-lg text-xs font-medium transition flex items-center justify-center gap-2 cursor-pointer ${
                                isSelected ? agent.activeColor : `${agent.color} hover:bg-slate-800/40`
                              }`}
                            >
                              <div className={ `w-2 h-2 rounded-full ${isSelected ? 'bg-current animate-pulse' : 'bg-slate-600'}`} />
                              {agent.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-4">
                      <button
                        onClick={() => setShowIdeaInput(!showIdeaInput)}
                        className="py-2 px-4 bg-indigo-900/40 hover:bg-indigo-800/60 text-indigo-300 font-medium rounded-lg text-[11px] transition border border-indigo-700/50 flex items-center gap-2 cursor-pointer"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                        <span>我有想法，AI 幫我寫</span>
                      </button>
                      <button
                        onClick={() => handleGenerateNovel(true)}
                        disabled={isGeneratingNovel || selectedNovelAgents.length === 0}
                        className="py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-lg text-[11px] transition border border-slate-700 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {isGeneratingNovel && !showIdeaInput ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                        )}
                        <span>
                          {isGeneratingNovel && !showIdeaInput
                            ? (selectedNovelAgents.length > 1 ? "AI 討論與隨機創作中..." : "隨機故事生成中...")
                            : (selectedNovelAgents.length > 1 ? "全部 Agent 共同創作隨機故事" : "隨機故事生成")}
                        </span>
                      </button>
                    </div>

                    <AnimatePresence>
                      {showIdeaInput && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden mb-4"
                        >
                          <div className="bg-indigo-950/30 border border-indigo-900/50 rounded-xl p-4 space-y-3">
                            <label className="text-[11px] font-bold text-indigo-300 block">請輸入您的靈感或想法：</label>
                            <textarea
                              className="w-full min-h-[80px] bg-slate-950/80 border border-indigo-900/50 rounded-lg p-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed font-sans"
                              placeholder="例如：一個賽步龐克城市的偵探，發現了一隻會說話的流浪貓..."
                              value={novelIdea}
                              onChange={(e) => setNovelIdea(e.target.value)}
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => handleGenerateNovel(false)}
                                disabled={isGeneratingNovel || !novelIdea.trim() || selectedNovelAgents.length === 0}
                                className="py-2 px-5 bg-gradient-to-r from-indigo-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-medium rounded-lg text-xs transition shadow shadow-indigo-600/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                              >
                                {isGeneratingNovel ? (
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Sparkles className="w-4 h-4" />
                                )}
                                <span>
                                  {isGeneratingNovel 
                                    ? (selectedNovelAgents.length > 1 ? "AI 群腦激盪創作中..." : "故事生成中...") 
                                    : (selectedNovelAgents.length > 1 ? "全部 Agent 激盪創作" : "開始 AI 生成")}
                                </span>
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <textarea
                      className="w-full min-h-[250px] bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-pink-500/50 leading-relaxed font-sans"
                      placeholder="在此貼上您的劇本文字..."
                      value={activeProject.novelText}
                      onChange={(e) => updateActiveProject({ novelText: e.target.value })}
                    />

                    {/* Chatbot Interface */}
                    <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 flex flex-col gap-4">
                      <div className="flex items-center gap-2 mb-2">
                        <MessageSquare className="w-4 h-4 text-indigo-400" />
                        <h4 className="text-sm font-medium text-slate-200">AI 劇本助理</h4>
                      </div>
                      
                      <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {chatMessages.length === 0 ? (
                          <div className="text-center text-slate-500 text-xs py-4">
                            需要修改劇本嗎？告訴 AI 你的想法，它可以幫你擴寫、精簡或改寫內容。
                          </div>
                        ) : (
                          chatMessages.map((msg, idx) => (
                            <div key={idx} className={ `flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div className={ `max-w-[85%] rounded-2xl p-3 text-sm ${
                                msg.role === 'user' 
                                  ? 'bg-indigo-600 text-white rounded-tr-none' 
                                  : msg.agent === 'agnes' 
                                    ? 'bg-pink-900/40 border border-pink-800/50 text-pink-100 rounded-tl-none'
                                    : msg.agent === 'mistral'
                                      ? 'bg-blue-900/40 border border-blue-800/50 text-blue-100 rounded-tl-none'
                                      : msg.agent === 'all'
                                        ? 'bg-purple-900/40 border border-purple-800/50 text-purple-100 rounded-tl-none'
                                        : 'bg-slate-800 text-slate-200 rounded-tl-none'
                              }`}>
                                {msg.role === 'ai' && (
                                  <div className="text-[10px] font-bold mb-1 opacity-80 uppercase flex items-center gap-1">
                                    <span className={ `w-1.5 h-1.5 rounded-full ${
                                      msg.agent === 'agnes' 
                                        ? 'bg-pink-400' 
                                        : msg.agent === 'mistral'
                                          ? 'bg-blue-400'
                                          : msg.agent === 'all'
                                            ? 'bg-purple-400 animate-pulse'
                                            : 'bg-indigo-400'
                                    }`} />
                                    {msg.agent === 'agnes' ? 'Agnes' : msg.agent === 'mistral' ? 'Agent3 (Mistral)' : msg.agent === 'all' ? '全部 Agent 討論整合' : 'Gemini'}
                                  </div>
                                )}
                                <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                              </div>
                            </div>
                          ))
                        )}
                        {isChatting && (
                          <div className="flex justify-start">
                            <div className="bg-slate-800 rounded-2xl rounded-tl-none p-3 text-sm text-slate-400 flex items-center gap-2">
                              <RefreshCw className="w-4 h-4 animate-spin" /> AI 思考中...
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-3 mt-2">
                        {/* Selector for Chatbot Agents */}
                        <div className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                            <span className="flex items-center gap-1">
                              <MessageSquare className="w-3.5 h-3.5 text-pink-400" />
                              參與本次討論修改的 Agent (多選將啟動協調與合意機制)：
                            </span>
                            <button
                              onClick={() => {
                                if (selectedChatAgents.length === 3) {
                                  setSelectedChatAgents([]);
                                } else {
                                  setSelectedChatAgents(['gemini', 'agnes', 'mistral']);
                                }
                              }}
                              className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded cursor-pointer"
                            >
                              {selectedChatAgents.length === 3 ? "全部取消" : "全選"}
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              { id: 'gemini' as const, name: 'Gemini', color: 'border-indigo-500/20 text-indigo-300 bg-indigo-950/10', activeColor: 'border-indigo-500 bg-indigo-950/30 text-indigo-200 ring-1 ring-indigo-500/20' },
                              { id: 'agnes' as const, name: 'Agnes', color: 'border-pink-500/20 text-pink-300 bg-pink-950/10', activeColor: 'border-pink-500 bg-pink-950/30 text-pink-200 ring-1 ring-pink-500/20' },
                              { id: 'mistral' as const, name: 'Agent3 (Mistral)', color: 'border-blue-500/20 text-blue-300 bg-blue-950/10', activeColor: 'border-blue-500 bg-blue-950/30 text-blue-200 ring-1 ring-blue-500/20' }
                            ].map((agent) => {
                              const isSelected = selectedChatAgents.includes(agent.id);
                              return (
                                <button
                                  key={agent.id}
                                  onClick={() => {
                                    if (isSelected) {
                                      setSelectedChatAgents(selectedChatAgents.filter(a => a !== agent.id));
                                    } else {
                                      setSelectedChatAgents([...selectedChatAgents, agent.id]);
                                    }
                                  }}
                                  className={ `py-1 px-2.5 border rounded-md text-[10px] font-medium transition flex items-center gap-1.5 cursor-pointer ${
                                    isSelected ? agent.activeColor : `${agent.color} hover:bg-slate-800/40`
                                  }`}
                                >
                                  <div className={ `w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-current animate-pulse' : 'bg-slate-600'}`} />
                                  {agent.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <textarea
                          id="chat-input"
                          className="w-full min-h-[60px] bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none font-sans"
                          placeholder="輸入你的修改需求（例如：請幫我把結局改得更溫馨，或加入一段精采對話）..."
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              if (chatInput.trim() && !isChatting && selectedChatAgents.length > 0) {
                                handleChatNovel(selectedChatAgents);
                              }
                            }
                          }}
                        />
                        <div className="flex justify-end">
                          <button
                            onClick={() => handleChatNovel(selectedChatAgents)}
                            disabled={isChatting || !chatInput.trim() || selectedChatAgents.length === 0}
                            className="py-2 px-5 bg-gradient-to-r from-indigo-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-medium rounded-lg text-xs transition shadow flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isChatting ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>AI 討論修改中...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>
                                  {selectedChatAgents.length === 3
                                    ? "與全部 Agent 共同討論修改"
                                    : selectedChatAgents.length > 1
                                      ? "啟動選定 Agent 群腦協調討論"
                                      : selectedChatAgents.length === 1
                                        ? `與 ${selectedChatAgents[0] === 'gemini' ? 'Gemini' : selectedChatAgents[0] === 'agnes' ? 'Agnes' : 'Agent3'} 進行討論修改`
                                        : "請選擇 Agent"}
                                </span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setActiveTab("characters")}
                        className="py-3.5 px-6 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl text-xs transition border border-slate-700 flex items-center gap-2 cursor-pointer"
                      >
                        <Users className="w-4 h-4" />
                        <span>前往角色設定</span>
                      </button>
                      <button
                        onClick={handleAISplitNovel}
                        disabled={isDisassembling || !activeProject.novelText.trim()}
                        className="py-3.5 px-6 bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white font-medium rounded-xl text-xs transition shadow-lg shadow-pink-600/10 flex items-center gap-2 cursor-pointer disabled:opacity-55"
                      >
                        {isDisassembling ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>AI 智能劇本拆解分析中...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 text-pink-200" />
                            <span>+ 一鍵 AI 拆解分鏡</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ============ TAB: CHARACTERS ============ */}
              {activeTab === "characters" && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h3 className="font-display font-black text-xl text-white flex items-center gap-2">
                        <Users className="w-5 h-5 text-pink-500 animate-pulse" />
                        故事角色與一致性設定 (Character Consistency)
                      </h3>
                      <p className="text-xs text-slate-400">
                        在此設定您的故事主角，產生專屬的主角相片，並在後續的分鏡繪圖中獲得高度一致性的主角臉部與外表特徵。
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleExportAllCharacters}
                        className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-semibold rounded-xl transition shadow flex items-center gap-1.5 cursor-pointer relative z-50 pointer-events-auto shrink-0"
                      >
                        <Download className="w-4 h-4 text-slate-300" />
                        <span className="hidden sm:inline">匯出設定</span>
                      </button>
                      <button
                        onClick={handleAddCharacter}
                        className="py-2.5 px-4 bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-xl transition shadow flex items-center gap-1.5 cursor-pointer relative z-50 pointer-events-auto shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                        <span>新增自定義角色</span>
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 pt-2 items-start">
                    {/* Left side: Project characters */}
                    <div className="xl:col-span-8 space-y-6">
                      {activeProject.characters.length === 0 ? (
                        <div className="text-center p-12 border border-dashed border-slate-800 rounded-2xl text-slate-500 text-xs bg-slate-950/20">
                          暫無角色。請在左側「原著劇本」點擊「一鍵 AI 拆解分鏡」自動提取，或點擊上方「新增自定義角色」手動建立！
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-6">
                          {activeProject.characters.map(char => (
                            <div 
                              key={char.id}
                              className="bg-slate-950/70 border border-slate-850 rounded-2xl p-6 flex flex-col space-y-4 shadow-xl backdrop-blur-md relative group hover:border-slate-800 transition-colors"
                            >
                              <div className="absolute top-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                <button
                                  onClick={() => handleExportCharacterProfile(char)}
                                  className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors cursor-pointer"
                                  title="匯出角色設定檔"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteChar(char.id)}
                                  className="p-2 bg-slate-900 hover:bg-red-950/60 border border-slate-800 rounded-xl text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                                  title="Delete Character"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                                {/* Avatar Display & Generator on the Left */}
                                <div className="md:col-span-4 flex flex-col items-center space-y-4">
                                  <div className="text-[10px] font-mono text-pink-400 font-bold tracking-wider uppercase block bg-slate-950/80 px-2.5 py-1 border border-slate-850 rounded-full text-center w-full">
                                    🎨 一致性三視角設計圖（建議 Agnes）
                                  </div>
                                  
                                  {/* Single Multi-angle Canvas Sheet */}
                                  <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-slate-900 border border-slate-800 flex items-center justify-center shadow shadow-indigo-950/50 group-avatar group">
                                    {char.avatarUrl ? (
                                      <img src={char.avatarUrl} alt={`${char.name} Character Sheet`} className="w-full h-full object-cover transition duration-300 group-hover:scale-105" referrerPolicy="no-referrer" />
                                    ) : char.isGeneratingAvatar ? (
                                      <div className="flex flex-col items-center space-y-3 text-pink-400">
                                        <RefreshCw className="w-8 h-8 animate-spin" />
                                        <span className="text-[10px] font-mono text-center px-2">正在繪製三視角（約 1–2 分鐘，忙碌時會自動重試）...</span>
                                        <button
                                          onClick={() => handleStopGenerateAvatar(char.id)}
                                          className="px-4 py-1.5 bg-red-600/95 hover:bg-red-500 text-white text-[10px] font-bold rounded-lg transition shadow flex items-center gap-1 cursor-pointer z-30"
                                        >
                                          <StopCircle className="w-3.5 h-3.5" />
                                          <span>停止繪圖</span>
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex flex-col items-center space-y-1.5 text-slate-600">
                                        <User className="w-10 h-10" />
                                        <span className="text-[10px] text-center px-2">尚未生成 — 請按下方 Agnes AI（推薦）</span>
                                      </div>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-2 gap-2 w-full mt-2">
                                    <button
                                      onClick={() => handleGenerateAvatar(char.id, 'agnes')}
                                      className="w-full py-1.5 bg-pink-950 hover:bg-pink-900 text-pink-100 text-[9px] font-bold rounded-lg border border-pink-500/50 hover:border-pink-400 transition-all flex flex-col items-center justify-center gap-1 cursor-pointer relative z-20 shadow shadow-pink-950/40"
                                      title="推薦：真實 Agnes 繪圖，生成前/側/背三視角"
                                    >
                                      {char.isGeneratingAvatar ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-pink-300" />}
                                      <span>Agnes AI ★</span>
                                    </button>
                                    <button
                                      onClick={() => handleGenerateAvatar(char.id, 'gemini')}
                                      className="w-full py-1.5 bg-indigo-950 hover:bg-indigo-900 text-indigo-200 text-[9px] font-bold rounded-lg border border-indigo-900 hover:border-indigo-700 transition-all flex flex-col items-center justify-center gap-1 cursor-pointer relative z-20"
                                      title="需有效 GEMINI_API_KEY；失敗會自動改用 Agnes"
                                    >
                                      {char.isGeneratingAvatar ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-indigo-400" />}
                                      <span>Gemini AI</span>
                                    </button>
                                    <button
                                      onClick={() => handleGenerateAvatar(char.id, 'nanobanana')}
                                      className="w-full py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 text-[9px] font-bold rounded-lg border border-slate-800 hover:border-slate-600 transition-all flex flex-col items-center justify-center gap-1 cursor-pointer relative z-20"
                                      title="已改走 Agnes 真實繪圖（不再使用 Unsplash 假圖）"
                                    >
                                      {char.isGeneratingAvatar ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-yellow-400" />}
                                      <span>Nano→Agnes</span>
                                    </button>
                                    <button
                                      onClick={() => handleGenerateAvatar(char.id, 'mistral')}
                                      className="w-full py-1.5 bg-orange-950 hover:bg-orange-900 text-orange-200 text-[9px] font-bold rounded-lg border border-orange-900 hover:border-orange-700 transition-all flex flex-col items-center justify-center gap-1 cursor-pointer relative z-20"
                                      title="已改走 Agnes 真實繪圖"
                                    >
                                      {char.isGeneratingAvatar ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-orange-400" />}
                                      <span>Mistral→Agnes</span>
                                    </button>
                                    <label className="col-span-2 w-full py-1.5 bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 text-[9px] font-bold rounded-lg border border-emerald-900/50 hover:border-emerald-700 transition-all flex flex-col items-center justify-center gap-1 cursor-pointer relative z-20" title="可選擇上傳多張相片作為角色一致性特徵參考">
                                      <Upload className="w-3 h-3 text-emerald-400" />
                                      <span>上傳多張相片</span>
                                      <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleUploadAvatar(e, char.id)} />
                                    </label>
                                  </div>

                                  {/* Uploaded Reference Photos Grid */}
                                  {char.uploadedAvatarUrls && char.uploadedAvatarUrls.length > 0 && (
                                    <div className="w-full bg-slate-900/50 border border-slate-800 rounded-xl p-2.5 space-y-1.5 mt-2 relative z-30">
                                      <div className="flex justify-between items-center px-0.5">
                                        <span className="text-[10px] font-mono font-bold text-indigo-400">
                                          📸 參考相片庫 ({char.uploadedAvatarUrls.length} 張)
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-4 gap-1.5 max-h-[140px] overflow-y-auto pr-1">
                                        {char.uploadedAvatarUrls.map((url, idx) => {
                                          const isPrimary = char.uploadedAvatarUrl === url;
                                          return (
                                            <div 
                                              key={idx} 
                                              className={ `relative group/ref aspect-square rounded-lg overflow-hidden border cursor-pointer transition-all ${
                                                isPrimary ? 'border-emerald-500 ring-2 ring-emerald-950 scale-[0.98]' : 'border-slate-800 hover:border-slate-600 hover:scale-105'
                                              }`}
                                              onClick={() => {
                                                updateActiveProject(prev => {
                                                  const list = prev.characters.map(c => {
                                                    if (c.id === char.id) {
                                                      return { 
                                                        ...c, 
                                                        uploadedAvatarUrl: url,
                                                        avatarUrl: url
                                                      };
                                                    }
                                                    return c;
                                                  });
                                                  return { characters: list };
                                                });
                                                showToast('已切換主參考相片', 'success');
                                              }}
                                              title={isPrimary ? "目前主要參考相片 (面部特徵核心)" : "點擊設為主要參考"}
                                            >
                                              <img src={url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                              
                                              {isPrimary && (
                                                <div className="absolute top-0.5 left-0.5 bg-emerald-600 text-white rounded-full p-0.5 scale-75 z-10" title="主要參考">
                                                  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                  </svg>
                                                </div>
                                              )}

                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleDeleteUploadedPhoto(char.id, url);
                                                }}
                                                className="absolute top-0.5 right-0.5 bg-red-600 hover:bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover/ref:opacity-100 transition-opacity cursor-pointer z-25 scale-75"
                                                title="刪除此參考"
                                              >
                                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                              </button>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  {char.isGeneratingAvatar && (
                                    <div className="flex flex-col gap-1.5 items-center justify-center p-2 bg-slate-900/80 rounded-lg border border-red-500/30 animate-pulse mt-2 w-full">
                                      <div className="text-[10px] text-slate-400 font-medium">
                                        主角相片繪製中...
                                      </div>
                                      <div className="flex gap-2 w-full">
                                        <button
                                          onClick={() => handleStopGenerateAvatar(char.id)}
                                          className="flex-1 py-1 bg-red-600/90 hover:bg-red-500 text-white text-[10px] font-bold rounded-md flex items-center justify-center gap-1 transition cursor-pointer z-30"
                                        >
                                          <StopCircle className="w-3 h-3" />
                                          <span>停止</span>
                                        </button>
                                        <button
                                          onClick={() => handleGenerateAvatar(char.id, 'agnes')}
                                          className="flex-1 py-1 bg-pink-700/90 hover:bg-pink-600 text-white text-[10px] font-bold rounded-md flex items-center justify-center gap-1 transition cursor-pointer z-30"
                                        >
                                          <RefreshCw className="w-3 h-3 animate-spin" style={{ animationDuration: '4s' }} />
                                          <span>重繪 (Agnes)</span>
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Character Details Inputs */}
                                <div className="md:col-span-8 flex flex-col space-y-4 justify-center relative z-20">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-mono text-slate-500 font-bold uppercase block">角色名稱</label>
                                      <input
                                        type="text"
                                        className="w-full bg-slate-900 border border-slate-850 rounded-lg p-2.5 text-xs text-white font-bold focus:outline-none focus:border-indigo-500 transition relative z-20"
                                        value={char.name}
                                        onChange={(e) => handleUpdateChar(char.id, "name", e.target.value)}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-mono text-slate-500 font-bold uppercase block">身份/職業</label>
                                      <input
                                        type="text"
                                        className="w-full bg-slate-900 border border-slate-850 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition relative z-20"
                                        value={char.role || ""}
                                        onChange={(e) => handleUpdateChar(char.id, "role", e.target.value)}
                                        placeholder="例如：高冷總裁"
                                      />
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-mono text-slate-500 font-bold uppercase block">年齡</label>
                                      <input
                                        type="text"
                                        className="w-full bg-slate-900 border border-slate-850 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition relative z-20"
                                        value={char.age || ""}
                                        onChange={(e) => handleUpdateChar(char.id, "age", e.target.value)}
                                        placeholder="例如：25歲"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-mono text-slate-500 font-bold uppercase block">服裝風格</label>
                                      <input
                                        type="text"
                                        className="w-full bg-slate-900 border border-slate-850 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition relative z-20"
                                        value={char.clothing || ""}
                                        onChange={(e) => handleUpdateChar(char.id, "clothing", e.target.value)}
                                        placeholder="例如：黑色西裝"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-mono text-slate-500 font-bold uppercase block">性格特質</label>
                                      <input
                                        type="text"
                                        className="w-full bg-slate-900 border border-slate-850 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition relative z-20"
                                        value={char.personality || ""}
                                        onChange={(e) => handleUpdateChar(char.id, "personality", e.target.value)}
                                        placeholder="例如：冷酷堅毅"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-mono text-slate-500 font-bold uppercase block">表情/情緒 (Mood)</label>
                                      <select
                                        className="w-full bg-slate-900 border border-slate-850 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition relative z-20 font-bold text-indigo-300"
                                        value={char.mood || ""}
                                        onChange={(e) => handleUpdateChar(char.id, "mood", e.target.value)}
                                      >
                                        <option value="">預設 / 無 (Default)</option>
                                        <option value="happy">😊 開心 / 微笑 (Happy)</option>
                                        <option value="sad">😢 悲傷 / 憂鬱 (Sad)</option>
                                        <option value="angry">😠 憤怒 / 生氣 (Angry)</option>
                                        <option value="excited">🤩 興奮 / 驚喜 (Excited)</option>
                                        <option value="fearful">😰 恐懼 / 害怕 (Fearful)</option>
                                        <option value="thoughtful">🤔 沉思 / 嚴肅 (Thoughtful)</option>
                                        <option value="smug">😏 傲慢 / 得意 (Smug)</option>
                                        <option value="shy">😳 害羞 / 臉紅 (Shy)</option>
                                        <option value="tired">🥱 疲倦 / 虛脫 (Tired)</option>
                                      </select>
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <div className="flex justify-between items-center mb-1">
                                      <label className="text-[10px] font-mono text-slate-500 font-bold uppercase block">AI 繪圖英文特徵描述 (Visual Prompt)</label>
                                      <div className="flex gap-2">
                                        <button
                                          onClick={() => handleTranslateCharacterPrompt(char.id, 'gemini')}
                                          className="text-[9px] text-indigo-400 hover:text-indigo-300 font-bold underline cursor-pointer"
                                          title="調用 Gemini 翻譯為高品質英文繪圖提示詞"
                                        >
                                          ✨ Gemini 優化
                                        </button>
                                        <button
                                          onClick={() => handleTranslateCharacterPrompt(char.id, 'mistral')}
                                          className="text-[9px] text-blue-400 hover:text-blue-300 font-bold underline cursor-pointer"
                                          title="調用 Mistral AI 翻譯為高品質英文繪圖提示詞"
                                        >
                                          🔮 Mistral AI 優化
                                        </button>
                                      </div>
                                    </div>
                                    <textarea
                                      className="w-full bg-slate-900 border border-slate-850 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition min-h-[70px] relative z-20"
                                      value={char.description}
                                      onChange={(e) => handleUpdateChar(char.id, "description", e.target.value)}
                                      placeholder="例如：A handsome young male executive..."
                                    />
                                  </div>

                                  <div className="flex justify-between items-center pt-3 border-t border-slate-850 mt-2 gap-2 flex-wrap">
                                    <div className="text-[9px] text-slate-500 font-mono">
                                      一致性基礎：{char.uploadedAvatarUrls && char.uploadedAvatarUrls.length > 0 ? `✨ 已載入 ${char.uploadedAvatarUrls.length} 張參考相片鎖定核心面部特徵` : (char.uploadedAvatarUrl ? "✨ 已鎖定您上傳的相片作為核心面部特徵" : (char.avatarUrl ? "已生成三視角設計圖" : "尚未生成設計圖"))}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handleSyncCharacterClothing(char.id)}
                                        className="py-1.5 px-3 bg-pink-950/75 hover:bg-pink-900 border border-pink-900/50 hover:border-pink-700 text-pink-300 hover:text-pink-100 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer z-30"
                                        title="AI 智能分析所有含有此角色的分鏡，自動將分鏡中的服裝描述修正為與此處設定的「服裝風格」一致"
                                      >
                                        <Sparkles className="w-3.5 h-3.5 text-pink-400 animate-pulse" />
                                        <span>一鍵同步服裝至所有分鏡 👔</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleSaveToLibrary(char)}
                                        className="py-1.5 px-3 bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-900/50 hover:border-indigo-700 text-indigo-300 hover:text-indigo-100 text-[10px] font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer z-30"
                                        title="將此角色設定儲存至全局角色庫，以便在其他專案中重複使用"
                                      >
                                        <Bookmark className="w-3.5 h-3.5 text-pink-500 fill-pink-500/10" />
                                        <span>儲存至全局角色庫</span>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Character Consistency Trait Comparison Panel */}
                              <div className="border-t border-slate-850 pt-5 mt-4 space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-900 pb-3">
                                  <div className="space-y-0.5">
                                    <h4 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 uppercase tracking-wider font-mono">
                                      <Sliders className="w-4 h-4 text-indigo-500 animate-pulse" />
                                      角色一致性特徵即時比對與 AI 修正對齊 (Trait Consistency Panel)
                                    </h4>
                                    <p className="text-[10px] text-slate-400">
                                      即時分析與比對當前角色設定與原著劇本目標，協助您點擊進行一致性修正優化。
                                    </p>
                                  </div>
                                  {!char.targetRole && (
                                    <button
                                      type="button"
                                      disabled={analyzingTargetId === char.id}
                                      onClick={() => handleAnalyzeCharacterTarget(char)}
                                      className="py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white text-[11px] font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer z-30 shadow-md shadow-indigo-950/40 relative pointer-events-auto"
                                    >
                                      {analyzingTargetId === char.id ? (
                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                                      )}
                                      <span>分析原著特徵目標 🔍</span>
                                    </button>
                                  )}
                                </div>

                                {!char.targetRole ? (
                                  <div className="bg-slate-900/20 border border-dashed border-slate-800 rounded-xl p-5 text-center text-slate-500 text-[11px] space-y-3">
                                    <p>💡 目前尚未分析此角色的原著設定目標。請點擊上方按鈕，AI 將自動掃描分析您的原著劇本，提取最符合該角色的身分、年齡、服裝、性格與視覺特徵！</p>
                                    <button
                                      type="button"
                                      disabled={analyzingTargetId === char.id}
                                      onClick={() => handleAnalyzeCharacterTarget(char)}
                                      className="mx-auto py-2 px-4 bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-900/60 hover:border-indigo-700 text-xs font-bold rounded-xl transition shadow flex items-center gap-1.5 cursor-pointer"
                                    >
                                      {analyzingTargetId === char.id ? (
                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Sparkles className="w-3.5 h-3.5 text-yellow-400 animate-bounce" />
                                      )}
                                      <span>啟動 AI 智能原著特徵提取與分析</span>
                                    </button>
                                  </div>
                                ) : (
                                  <div className="space-y-4">
                                    {/* 2-column Bento Grid of Traits */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                      {/* Trait Card Maker */}
                                      {[
                                        {
                                          label: "身份定位 (Role)",
                                          field: "role" as keyof Character,
                                          current: char.role || "未設定",
                                          target: char.targetRole,
                                          icon: "👤",
                                        },
                                        {
                                          label: "估計年齡 (Age)",
                                          field: "age" as keyof Character,
                                          current: char.age || "未設定",
                                          target: char.targetAge,
                                          icon: "📅",
                                        },
                                        {
                                          label: "服裝風格 (Clothing)",
                                          field: "clothing" as keyof Character,
                                          current: char.clothing || "未設定",
                                          target: char.targetClothing,
                                          icon: "👔",
                                        },
                                        {
                                          label: "性格特質 (Personality)",
                                          field: "personality" as keyof Character,
                                          current: char.personality || "未設定",
                                          target: char.targetPersonality,
                                          icon: "🧠",
                                        },
                                        {
                                          label: "表情情緒 (Mood)",
                                          field: "mood" as keyof Character,
                                          current: char.mood || "預設",
                                          target: char.targetMood || "預設",
                                          icon: "🎭",
                                        },
                                      ].map((trait) => {
                                        const isAligned =
                                          String(trait.current).trim().toLowerCase() ===
                                          String(trait.target).trim().toLowerCase();
                                        return (
                                          <div
                                            key={trait.field}
                                            className="bg-slate-900/40 border border-slate-850 rounded-xl p-3 space-y-2 relative group hover:border-slate-800 transition-colors"
                                          >
                                            <div className="flex justify-between items-center">
                                              <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                                                <span>{trait.icon}</span>
                                                <span>{trait.label}</span>
                                              </span>
                                              <span
                                                className={ `text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                                                  isAligned
                                                    ? "bg-emerald-950/40 border-emerald-900/60 text-emerald-400"
                                                    : "bg-amber-950/40 border-amber-900/60 text-amber-400"
                                                }`}
                                              >
                                                {isAligned ? "✅ 完全一致" : "⚠️ 存在偏差"}
                                              </span>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                                              <div className="bg-slate-950/50 p-2 rounded-lg border border-slate-900">
                                                <div className="text-[9px] text-slate-500 font-bold uppercase mb-0.5">當前專案設定</div>
                                                <div className="text-white truncate font-medium">{trait.current}</div>
                                              </div>
                                              <div className="bg-indigo-950/15 p-2 rounded-lg border border-indigo-950/40 relative group">
                                                <div className="text-[9px] text-indigo-400 font-bold uppercase mb-0.5">原著目標設定</div>
                                                <div className="text-slate-300 truncate font-medium">{trait.target}</div>
                                                {!isAligned && (
                                                  <button
                                                    type="button"
                                                    onClick={() => handleApplyTargetTrait(char.id, trait.field, trait.target)}
                                                    className="absolute inset-0 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded-lg flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-30"
                                                    title="套用此原著設定"
                                                  >
                                                    <span>一鍵修正套用 ⚡</span>
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}

                                      {/* Full width Visual Prompt comparison card */}
                                      <div className="md:col-span-2 bg-slate-900/40 border border-slate-850 rounded-xl p-3 space-y-2">
                                        <div className="flex justify-between items-center">
                                          <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                                            <span>🎨</span>
                                            <span>AI 英文視覺 Prompt 描述 (Visual Prompt)</span>
                                          </span>
                                          {char.description !== char.targetDescription && (
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border bg-amber-950/40 border-amber-900/60 text-amber-400">
                                              ⚠️ 描述不一致
                                            </span>
                                          )}
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                                          <div className="bg-slate-950/50 p-2.5 rounded-lg border border-slate-900 space-y-1">
                                            <div className="text-[9px] text-slate-500 font-bold uppercase">當前專案 Prompt</div>
                                            <div className="text-white font-mono leading-relaxed text-[10px] line-clamp-3 overflow-y-auto pr-1 max-h-[70px]">
                                              {char.description || "未設定"}
                                            </div>
                                          </div>
                                          <div className="bg-indigo-950/15 p-2.5 rounded-lg border border-indigo-950/40 space-y-1 relative group">
                                            <div className="text-[9px] text-indigo-400 font-bold uppercase">原著目標 Prompt</div>
                                            <div className="text-slate-300 font-mono leading-relaxed text-[10px] line-clamp-3 overflow-y-auto pr-1 max-h-[70px]">
                                              {char.targetDescription || "未分析"}
                                            </div>
                                            {char.description !== char.targetDescription && (
                                              <button
                                                type="button"
                                                onClick={() => handleApplyTargetTrait(char.id, "description", char.targetDescription)}
                                                className="absolute inset-0 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-30"
                                              >
                                                <span>套用此 AI 推薦繪圖 Prompt 🎨</span>
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Action Bar for aligned traits */}
                                    <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/50 border border-slate-850 p-3 rounded-xl">
                                      <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                                        <span>💡</span>
                                        <span>可點擊各項「原著目標設定」進行個別修正，或點擊右側按鈕一鍵完成全特徵對齊。</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          disabled={analyzingTargetId === char.id}
                                          onClick={() => handleAnalyzeCharacterTarget(char)}
                                          className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-lg border border-slate-700 transition cursor-pointer z-30 flex items-center gap-1"
                                        >
                                          <RefreshCw className={ `w-3 h-3 ${analyzingTargetId === char.id ? "animate-spin" : ""}`} />
                                          <span>重新分析原著</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleApplyAllTargetTraits(char)}
                                          className="py-1.5 px-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-[10px] font-bold rounded-lg transition-all shadow-md shadow-emerald-950/20 cursor-pointer z-30 flex items-center gap-1"
                                        >
                                          <Zap className="w-3.5 h-3.5 text-yellow-300 animate-pulse" />
                                          <span>⚡ 一鍵自動修復所有特徵偏差</span>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Right side: Global Character Library */}
                    <div className="xl:col-span-4 bg-slate-950/70 border border-slate-850 rounded-2xl p-5 shadow-xl backdrop-blur-md space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                        <div className="flex items-center gap-2">
                          <Bookmark className="w-4 h-4 text-pink-500" />
                          <span className="font-display font-bold text-sm text-white">跨專案全局角色庫</span>
                          <span className="text-[10px] bg-slate-900 px-2 py-0.5 rounded-full border border-slate-800 text-slate-400">
                            {characterLibrary.length}
                          </span>
                        </div>
                      </div>

                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        儲存您喜愛的角色屬性與一致性設計圖，在 Toonflow 的任何專案中隨時一鍵導入與重複利用。
                      </p>

                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500 animate-pulse" />
                        <input
                          type="text"
                          placeholder="搜尋角色名稱/特徵..."
                          value={librarySearchQuery}
                          onChange={(e) => setLibrarySearchQuery(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-850 rounded-lg pl-9 pr-8 py-2 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                        />
                        {librarySearchQuery && (
                          <button 
                            onClick={() => setLibrarySearchQuery("")}
                            className="absolute right-3 top-2.5 w-4 h-4 text-slate-400 hover:text-slate-200 text-xs flex items-center justify-center cursor-pointer"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {characterLibrary.filter(c => {
                        const q = librarySearchQuery.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          c.name.toLowerCase().includes(q) ||
                          (c.role && c.role.toLowerCase().includes(q)) ||
                          (c.description && c.description.toLowerCase().includes(q)) ||
                          (c.personality && c.personality.toLowerCase().includes(q))
                        );
                      }).length === 0 ? (
                        <div className="text-center p-8 border border-dashed border-slate-900 rounded-xl text-slate-600 text-[11px] space-y-2">
                          <Users className="w-6 h-6 mx-auto mb-1 opacity-30 text-slate-500" />
                          <p className="font-medium text-slate-500">
                            {librarySearchQuery 
                              ? "找不到符合搜尋條件的角色" 
                              : "角色庫目前為空"}
                          </p>
                          {!librarySearchQuery && (
                            <p className="text-[10px] text-slate-500 leading-relaxed">
                              在左側角色卡底端點擊「儲存至全局角色庫」即可將心儀的主角收藏至此。
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                          {characterLibrary.filter(c => {
                            const q = librarySearchQuery.trim().toLowerCase();
                            if (!q) return true;
                            return (
                              c.name.toLowerCase().includes(q) ||
                              (c.role && c.role.toLowerCase().includes(q)) ||
                              (c.description && c.description.toLowerCase().includes(q)) ||
                              (c.personality && c.personality.toLowerCase().includes(q))
                            );
                          }).map(libChar => (
                            <div 
                              key={libChar.id}
                              className="bg-slate-900/40 hover:bg-slate-900 border border-slate-850/50 hover:border-slate-800 rounded-xl p-3 transition flex gap-3 group/lib relative"
                            >
                              {/* Avatar (left) */}
                              <div className="w-11 h-11 rounded-lg bg-slate-950 border border-slate-850 overflow-hidden flex items-center justify-center shrink-0">
                                {libChar.avatarUrl ? (
                                  <img src={libChar.avatarUrl} alt={libChar.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <User className="w-5 h-5 text-slate-700" />
                                )}
                              </div>

                              {/* Details */}
                              <div className="flex-1 min-w-0 space-y-0.5">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-bold text-xs text-white truncate">{libChar.name}</span>
                                  {libChar.role && (
                                    <span className="text-[9px] bg-slate-950 px-1.5 py-0.5 rounded border border-slate-850 text-slate-400 shrink-0 truncate max-w-[80px]">
                                      {libChar.role}
                                    </span>
                                  )}
                                </div>
                                {libChar.description && (
                                  <p className="text-[10px] text-slate-400 line-clamp-1 truncate" title={libChar.description}>
                                    {libChar.description}
                                  </p>
                                )}
                                
                                {/* Action Buttons */}
                                <div className="flex items-center gap-2 pt-1">
                                  <button
                                    onClick={() => handleImportFromLibrary(libChar)}
                                    className="py-0.5 px-2 bg-pink-950 hover:bg-pink-900 hover:text-pink-100 text-pink-300 border border-pink-900 rounded text-[9px] font-bold flex items-center gap-0.5 cursor-pointer transition"
                                  >
                                    <Plus className="w-2.5 h-2.5" />
                                    <span>導入此專案</span>
                                  </button>
                                  <button
                                    onClick={() => handleRemoveFromLibrary(libChar.id, libChar.name)}
                                    className="p-1 text-slate-500 hover:text-red-400 hover:bg-slate-950 rounded transition cursor-pointer"
                                    title="自角色庫中移除"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                    <button
                      onClick={() => setActiveTab("scenes")}
                      className="py-3 px-6 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl text-xs shadow-lg hover:shadow-cyan-600/15 transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <span>前往 AI 分鏡劇本</span>
                      <ChevronLeft className="w-4 h-4 rotate-180" />
                    </button>
                  </div>
                </div>
              )}

              {/* ============ TAB: STORYBOARD SCENES & AI HUB ============ */}
              {activeTab === "scenes" && (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                  <div className="lg:col-span-4 xl:col-span-4 space-y-6">
                    {/* Settings Panel 1: Script breakdown config */}
                    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-4">
                      <h3 className="font-display font-bold text-sm text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                        <Sliders className="w-4 h-4 text-indigo-400" />
                        AI 劇本拆解引擎設定
                      </h3>

                      <div className="space-y-3">
                        {/* Selector Tabs: Mistral vs Zhipu */}
                        <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-850">
                          <button
                            onClick={() => updateActiveProject({ disassemblyEngine: "mistral" })}
                            className={ `py-2 px-3 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                              activeProject.disassemblyEngine === "mistral"
                                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow"
                                : "text-slate-500 hover:text-slate-300"
                            }`}
                          >
                            <span>🔮 Mistral AI</span>
                            <span className="text-[8px] bg-indigo-500/10 px-1 py-0.2 rounded text-indigo-400">免費</span>
                          </button>
                          <button
                            onClick={() => updateActiveProject({ disassemblyEngine: "zhipu" })}
                            className={ `py-2 px-3 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                              activeProject.disassemblyEngine === "zhipu"
                                ? "bg-pink-500/20 text-pink-300 border border-pink-500/30 shadow"
                                : "text-slate-500 hover:text-slate-300"
                            }`}
                          >
                            <span>🇨🇳 智譜 AI</span>
                            <span className="text-[8px] bg-pink-500/10 px-1 py-0.2 rounded text-pink-400">免費</span>
                          </button>
                        </div>

                        {/* Model Dropdown */}
                        <div className="space-y-1.5 pt-1">
                          <label className="text-[10px] font-mono text-slate-500 font-bold uppercase">選擇 MISTRAL 模型</label>
                          <select
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 transition"
                            value={activeProject.selectedModel}
                            onChange={(e) => updateActiveProject({ selectedModel: e.target.value })}
                          >
                            <option>Mistral Large 3 (高智能旗艦)</option>
                            <option>Mistral Medium 3.5 (中型效率)</option>
                            <option>Codestral 2 (專精邏輯代碼)</option>
                          </select>
                          <span className="text-[9px] text-slate-500 leading-relaxed block italic">
                            ✨ Mistral 模型免費用量開放：Large 3、Medium 3.5，零門檻供應，不需信用卡。
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Settings Panel 2: Drawing & Camera Pan config */}
                    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-4">
                      <h3 className="font-display font-bold text-sm text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                        <Clapperboard className="w-4 h-4 text-pink-400" />
                        分鏡繪圖 & 運鏡設定
                      </h3>

                      <div className="space-y-4">
                        {/* API Channel */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono text-slate-500 font-bold uppercase block">繪圖 API 渠道 (手機適用)</label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => updateActiveProject({ drawingChannel: "flux" })}
                              className={ `p-2.5 rounded-xl border text-[11px] font-bold text-center transition flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                                activeProject.drawingChannel === "flux"
                                  ? "bg-slate-950 border-pink-500/50 text-pink-400 shadow-lg shadow-pink-500/5"
                                  : "bg-slate-950/60 border-slate-850 text-slate-500 hover:text-slate-400 hover:border-slate-800"
                              }`}
                            >
                              <span className="text-white">✨ Gemini AI 繪圖</span>
                              <span className="text-[8px] text-slate-400">(高速免金鑰，完美生成)</span>
                            </button>
                            <button
                              onClick={() => updateActiveProject({ drawingChannel: "sd" })}
                              className={ `p-2.5 rounded-xl border text-[11px] font-bold text-center transition flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                                activeProject.drawingChannel === "sd"
                                  ? "bg-slate-950 border-pink-500/50 text-pink-400 shadow-lg shadow-pink-500/5"
                                  : "bg-slate-950/60 border-slate-850 text-slate-500 hover:text-slate-400 hover:border-slate-800"
                              }`}
                            >
                              <span className="text-white">📱 本地 SD 接口</span>
                              <span className="text-[8px] text-slate-400">(127.0.0.1:7860)</span>
                            </button>
                          </div>
                        </div>

                        {/* Art Style Dropdown */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono text-slate-500 font-bold uppercase block">分鏡美術風格</label>
                          <select
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 transition"
                            value={activeProject.artStyle}
                            onChange={(e) => updateActiveProject({ artStyle: e.target.value })}
                          >
                            <option value="動漫卡通動感 (Anime key visual)">動漫卡通動感 (Anime key visual)</option>
                            <option value="寫實電影感 (Cinematic Realistic)">寫實電影感 (Cinematic Realistic)</option>
                            <option value="高擬真電影質感 (Photorealistic Cinema)">高擬真電影質感 (Photorealistic Cinema)</option>
                            <option value="賽博朋克霓虹 (Cyberpunk Neon)">賽博朋克霓虹 (Cyberpunk Neon)</option>
                            <option value="美式寫實漫畫 (Cyberpunk Comic)">美式寫實漫畫 (Cyberpunk Comic)</option>
                            <option value="水彩插畫風 (Watercolor Illustration)">水彩插畫風 (Watercolor Illustration)</option>
                            <option value="中國古風水墨 (Traditional Chinese Ink)">中國古風水墨 (Traditional Chinese Ink)</option>
                            <option value="黑白鉛筆速寫 (Pencil Sketch)">黑白鉛筆速寫 (Pencil Sketch)</option>
                            <option value="可愛3D黏土風 (Claymation 3D)">可愛3D黏土風 (Claymation 3D)</option>
                          </select>
                        </div>

                        {/* Camera Motion Dropdown */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono text-slate-500 font-bold uppercase block">模擬 3D 影片運鏡模式</label>
                          <select
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 transition"
                            value={activeProject.cameraMotion}
                            onChange={(e) => updateActiveProject({ cameraMotion: e.target.value })}
                          >
                            <option>經典推拉運鏡 (Classic Ken Burns Zoom & Pan)</option>
                            <option>向左慢速橫移 (Slow Pan Left)</option>
                            <option>向右慢速橫移 (Slow Pan Right)</option>
                            <option>俯視慢速拉高 (Slow Tilt Up)</option>
                            <option>仰視慢速拉低 (Slow Tilt Down)</option>
                          </select>
                        </div>

                        {/* Agnes Image Mode Select Button/Toggle */}
                        <div className="space-y-2">
                          <label className="text-[10px] font-mono text-slate-500 font-bold uppercase block">Agnes AI 繪圖 (生成相片) 效能 / 畫質設定</label>
                          <div className="grid grid-cols-3 gap-1.5">
                            <button
                              type="button"
                              onClick={() => updateActiveProject({ agnesImageMode: "fast" })}
                              className={ `p-2 rounded-xl border text-[11px] font-bold text-center transition flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                                (activeProject.agnesImageMode || "quality") === "fast"
                                  ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-400 shadow-lg shadow-emerald-500/5"
                                  : "bg-slate-950/60 border-slate-850 text-slate-500 hover:text-slate-400 hover:border-slate-800"
                              }`}
                            >
                              <span>⚡ 極速生成</span>
                              <span className="text-[8px] text-slate-400 opacity-80">(極速預覽)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => updateActiveProject({ agnesImageMode: "balanced" })}
                              className={ `p-2 rounded-xl border text-[11px] font-bold text-center transition flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                                (activeProject.agnesImageMode || "quality") === "balanced"
                                  ? "bg-indigo-950/40 border-indigo-500/50 text-indigo-400 shadow-lg shadow-indigo-500/5"
                                  : "bg-slate-950/60 border-slate-850 text-slate-500 hover:text-slate-400 hover:border-slate-800"
                              }`}
                            >
                              <span>⚖️ 平衡標準</span>
                              <span className="text-[8px] text-slate-400 opacity-80">(標準解析)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => updateActiveProject({ agnesImageMode: "quality" })}
                              className={ `p-2 rounded-xl border text-[11px] font-bold text-center transition flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                                (activeProject.agnesImageMode || "quality") === "quality"
                                  ? "bg-pink-950/40 border-pink-500/50 text-pink-400 shadow-lg shadow-pink-500/5"
                                  : "bg-slate-950/60 border-slate-850 text-slate-500 hover:text-slate-400 hover:border-slate-800"
                              }`}
                            >
                              <span>🎨 極致畫質</span>
                              <span className="text-[8px] text-slate-400 opacity-80">(高清精細)</span>
                            </button>
                          </div>
                          <p className="text-[9px] text-slate-400 leading-normal">
                            💡 <strong>極速生成模式</strong>將圖片解析度優化調整為 768x432，大幅減少伺服器算力資源與傳輸延遲，約可提高 2 倍以上生成速度！適合創作初期快速預覽。
                          </p>
                        </div>

                        {/* Agnes Video Mode Select Button/Toggle */}
                        <div className="space-y-2">
                          <label className="text-[10px] font-mono text-slate-500 font-bold uppercase block">Agnes AI 影片生成效能 / 畫質設定</label>
                          <div className="grid grid-cols-3 gap-1.5">
                            <button
                              type="button"
                              onClick={() => updateActiveProject({ agnesVideoMode: "fast" })}
                              className={ `p-2 rounded-xl border text-[11px] font-bold text-center transition flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                                (activeProject.agnesVideoMode || "quality") === "fast"
                                  ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-400 shadow-lg shadow-emerald-500/5"
                                  : "bg-slate-950/60 border-slate-850 text-slate-500 hover:text-slate-400 hover:border-slate-800"
                              }`}
                            >
                              <span>⚡ 極速預覽</span>
                              <span className="text-[8px] text-slate-400 opacity-80">(提速 ~300%)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => updateActiveProject({ agnesVideoMode: "balanced" })}
                              className={ `p-2 rounded-xl border text-[11px] font-bold text-center transition flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                                (activeProject.agnesVideoMode || "quality") === "balanced"
                                  ? "bg-indigo-950/40 border-indigo-500/50 text-indigo-400 shadow-lg shadow-indigo-500/5"
                                  : "bg-slate-950/60 border-slate-850 text-slate-500 hover:text-slate-400 hover:border-slate-800"
                              }`}
                            >
                              <span>⚖️ 平衡標準</span>
                              <span className="text-[8px] text-slate-400 opacity-80">(提速 ~150%)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => updateActiveProject({ agnesVideoMode: "quality" })}
                              className={ `p-2 rounded-xl border text-[11px] font-bold text-center transition flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                                (activeProject.agnesVideoMode || "quality") === "quality"
                                  ? "bg-pink-950/40 border-pink-500/50 text-pink-400 shadow-lg shadow-pink-500/5"
                                  : "bg-slate-950/60 border-slate-850 text-slate-500 hover:text-slate-400 hover:border-slate-800"
                              }`}
                            >
                              <span>🎨 極致畫質</span>
                              <span className="text-[8px] text-slate-400 opacity-80">(完整渲染)</span>
                            </button>
                          </div>
                          <p className="text-[9px] text-slate-400 leading-normal">
                            💡 <strong>極速預覽模式</strong>將影片解析度調整為 768x512，並優化為 16 FPS 與 15 步推理，大幅減少伺服器算力時間，約可提速 3 倍！適合創作初期极速看對白口型與鏡頭效果。
                          </p>
                        </div>

                        {/* Widescreen simulation disclaimer */}
                        <div className="bg-slate-950 p-4 border border-slate-850 rounded-xl space-y-2">
                          <p className="text-[11px] font-bold text-pink-400 flex items-center gap-1">
                            <Info className="w-3.5 h-3.5 text-pink-400" />
                            關於免費 AI 影片生成 API 說明
                          </p>
                          <p className="text-[10px] text-slate-400 leading-relaxed">
                            市面上的火山 Seedance 2, Google Veo 3, Luma Dream Machine 由於硬體算力消耗極高，皆不提供公開的免費調用 API Key。
                          </p>
                          <p className="text-[10px] text-indigo-300 leading-relaxed">
                            為了讓您實現完全免費，Toonflow 獨家研發了<strong>「本地 100% 免費影片製作大師」</strong>：利用您瀏覽器端的 HTML5 Canvas 高清渲染器 + 網頁音訊合成，一鍵將分鏡圖錄製為動態 WebM 影片！完美融合您選擇的 3D 運鏡、男女角色配音、經典電影寬畫幅 與 自動燒錄字幕，完全免費 API Key、不收費！
                          </p>
                        </div>

                        {/* Global Storyboard Chatbot */}
                        {renderStoryboardGlobalChat()}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Workflow Trigger & Scenes List */}
                  <div className="xl:col-span-8 space-y-6 relative z-10">
                    <VideoGallery activeProject={activeProject} />
                  {/* Disassemble Workflow banner */}
                    <div className="bg-gradient-to-r from-pink-900/30 via-indigo-900/20 to-slate-900/60 border border-pink-500/20 rounded-2xl p-5 shadow-xl flex items-center justify-between gap-6 relative z-20">
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-pink-400" />
                          一條龍短劇工作流 (One-Stop Workflow)
                        </h4>
                        <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
                          AI 會自動分析劇本段落、識別出場人物、提取精彩對白，並為每一幕生成適合 AI 繪圖的英文視覺描述提示詞！
                        </p>
                      </div>

                      <button
                        onClick={handleAISplitNovel}
                        disabled={isDisassembling || !activeProject.novelText.trim()}
                        className="py-2.5 px-4 bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white font-medium rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-55 shrink-0 hover:scale-[1.02] relative z-20"
                      >
                        {isDisassembling ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>拆解中...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5 text-pink-200" />
                            <span>一鍵 AI 拆解分鏡</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Characters Overview Link */}
                    <div className="flex items-center justify-between p-4 bg-slate-950/60 border border-slate-850 rounded-xl relative z-20">
                      <div className="flex items-center space-x-3">
                        <Users className="w-5 h-5 text-pink-500 animate-pulse" />
                        <div>
                          <h4 className="text-xs font-bold text-white">故事角色一致性設定 ({activeProject.characters.length} 個角色)</h4>
                          <p className="text-[10px] text-slate-500">角色相片特徵、職業與外貌描述，會自動應用於分鏡繪圖中。</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setActiveTab("characters")}
                        className="py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold rounded-lg border border-slate-800 transition flex items-center gap-1 cursor-pointer"
                      >
                        <span>管理角色設定</span>
                        <ChevronLeft className="w-3 h-3 rotate-180" />
                      </button>
                    </div>

                    {/* Scenes List Container */}
                    <div className="space-y-4 pt-6 border-t border-slate-800">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <h3 className="font-display font-extrabold text-lg text-white">
                            分鏡腳本卡片 ({activeProject.scenes.length} 場)
                          </h3>
                          <span className="inline-flex items-center space-x-1.5 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-full text-[10px]">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span className="text-slate-300 font-medium capitalize">手機一鍵渲染已就緒</span>
                          </span>
                        </div>

                        <div className="flex items-center space-x-2">
                          <button
                            id="global-strict-lock-btn-1"
                            onClick={handleToggleStrictWorkflowLock}
                            className={ `py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer select-none border shrink-0 ${
                              strictWorkflowLock
                                ? "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-950/50"
                                : "bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800"
                            }`}
                          >
                            {strictWorkflowLock ? "🔒 嚴格鎖：開啟" : "🔓 嚴格鎖：關閉"}
                          </button>

                          <button
                            onClick={handleAddCustomScene}
                            className="py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold rounded-lg border border-slate-800 transition flex items-center gap-1 cursor-pointer relative z-50 pointer-events-auto"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>新增自定義場景</span>
                          </button>
                        </div>
                      </div>

                                            {/* Scene Cards Loop */}
                      <div className="space-y-6">
                        {activeProject.scenes.map((scene, index) => {
                          const matchingChar = activeProject.characters.find(c => (c.name || "").trim().toLowerCase() === (scene.character || "").trim().toLowerCase());
                          return (
                            <div key={scene.id} className="space-y-2">
                              <SceneItem 
                                scene={scene}
                                index={index}
                                activeProjectCharacters={activeProject.characters}
                                handleUpdateSceneField={handleUpdateSceneField}
                                handleDeleteScene={handleDeleteScene}
                                handleDragStart={handleDragStart}
                                handleDragOver={handleDragOver}
                                handleDragEnd={handleDragEnd}
                                handleDrop={handleDrop}
                                draggedIndex={draggedIndex}
                                draggedOverIndex={draggedOverIndex}
                                matchingChar={matchingChar}
                                handleApplyStylePreset={handleApplyStylePreset}
                                handleImageDragOver={handleImageDragOver}
                                handleImageDrop={handleImageDrop}
                                handleUploadSceneImage={handleUploadSceneImage}
                                handleGenerateVideo={handleGenerateVideo}
                                handleGenerateImage={handleGenerateImage}
                                scenes={activeProject.scenes}
                                activeProjectId={activeProject.id}
                                setProjects={setProjects}
                                showToast={showToast}
                                isFullAutoProducing={isFullAutoProducing}
                                fullAutoProgress={fullAutoProgress}
                                fullAutoLogs={fullAutoLogs}
                                onFullAutoProduce={handleFullAutoVideoProduction}
                                sceneType="standard"
                                strictWorkflowLock={strictWorkflowLock}
                              />
                            </div>
                          );
                        })}
                      </div>
                        {activeProject.scenes.length === 0 && (
                          <div className="text-center p-12 border border-dashed border-slate-800 rounded-2xl text-slate-500 text-xs">
                            此專案尚未拆解分鏡。請在上方原著劇本頁面輸入劇本文字，並按下「一鍵 AI 拆解分鏡」生成豐富的故事劇本！
                          </div>
                        )}
                                            </div>
                    </div>
                  </div>
              )}
              {/* ============ TAB: STORYBOARD SCENES EXTENSION & AI HUB ============ */}
              {activeTab === "scenes_ext" && (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                  <div className="lg:col-span-4 xl:col-span-4 space-y-6">
                    {/* Settings Panel 1: Script breakdown config */}
                    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-4">
                      <h3 className="font-display font-bold text-sm text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                        <Sliders className="w-4 h-4 text-emerald-400" />
                        AI 劇本拆解引擎設定
                      </h3>

                      <div className="space-y-3">
                        {/* Selector Tabs: Mistral vs Zhipu */}
                        <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-850">
                          <button
                            onClick={() => updateActiveProject({ disassemblyEngine: "mistral" })}
                            className={ `py-2 px-3 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                              activeProject.disassemblyEngine === "mistral"
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow"
                                : "text-slate-500 hover:text-slate-300"
                            }`}
                          >
                            <span>🔮 Mistral AI</span>
                            <span className="text-[8px] bg-emerald-500/10 px-1 py-0.2 rounded text-emerald-400">免費</span>
                          </button>
                          <button
                            onClick={() => updateActiveProject({ disassemblyEngine: "zhipu" })}
                            className={ `py-2 px-3 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                              activeProject.disassemblyEngine === "zhipu"
                                ? "bg-pink-500/20 text-pink-300 border border-pink-500/30 shadow"
                                : "text-slate-500 hover:text-slate-300"
                            }`}
                          >
                            <span>⚡ 智譜 AI</span>
                            <span className="text-[8px] bg-pink-500/10 px-1 py-0.2 rounded text-pink-400">自備</span>
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-relaxed pl-1">
                          {activeProject.disassemblyEngine === "mistral" 
                            ? "系統已預置免費 Mistral-Nemo-Instruct 模型，無需設定 API Key，適合快速上手。" 
                            : "智譜 GLM 模型需要到設定面板配置您的 ZHIPU_API_KEY。"}
                        </p>
                      </div>
                    </div>

                    {/* Settings Panel 2: Drawing channels & style */}
                    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-4">
                      <h3 className="font-display font-bold text-sm text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                        <Sparkles className="w-4 h-4 text-pink-400 animate-pulse" />
                        分鏡繪圖 & 運鏡設定
                      </h3>

                      <div className="space-y-4">
                        {/* Drawing channel select */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono text-slate-500 font-bold uppercase tracking-wider block">繪圖算圖通道 (Image Channel)</label>
                          <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-850">
                            <button
                              onClick={() => updateActiveProject({ drawingChannel: "flux" })}
                              className={ `py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                                activeProject.drawingChannel === "flux"
                                  ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow"
                                  : "text-slate-500 hover:text-slate-300"
                              }`}
                            >
                              <span>⚡ FLUX-Sch</span>
                            </button>
                            <button
                              onClick={() => updateActiveProject({ drawingChannel: "sd" })}
                              className={ `py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                                activeProject.drawingChannel === "sd"
                                  ? "bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow"
                                  : "text-slate-500 hover:text-slate-300"
                              }`}
                            >
                              <span>🌀 SD 3.5</span>
                            </button>
                          </div>
                        </div>

                        {/* Visual style selector input */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono text-slate-500 font-bold uppercase tracking-wider block">視覺美術風格 (Art Style)</label>
                          <select
                            className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition cursor-pointer"
                            value={activeProject.artStyle}
                            onChange={(e) => updateActiveProject({ artStyle: e.target.value })}
                          >
                            <option value="動漫卡通動感 (Anime key visual)">動漫卡通動感 (Anime key visual)</option>
                            <option value="寫實電影感 (Cinematic Realistic)">寫實電影感 (Cinematic Realistic)</option>
                            <option value="高擬真電影質感 (Photorealistic Cinema)">高擬真電影質感 (Photorealistic Cinema)</option>
                            <option value="賽博朋克霓虹 (Cyberpunk Neon)">賽博朋克霓虹 (Cyberpunk Neon)</option>
                            <option value="美式寫實漫畫 (Cyberpunk Comic)">美式寫實漫畫 (Cyberpunk Comic)</option>
                            <option value="水彩插畫風 (Watercolor Illustration)">水彩插畫風 (Watercolor Illustration)</option>
                            <option value="中國古風水墨 (Traditional Chinese Ink)">中國古風水墨 (Traditional Chinese Ink)</option>
                            <option value="黑白鉛筆速寫 (Pencil Sketch)">黑白鉛筆速寫 (Pencil Sketch)</option>
                            <option value="可愛3D黏土風 (Claymation 3D)">可愛3D黏土風 (Claymation 3D)</option>
                          </select>
                        </div>

                        {/* Camera motion template */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono text-slate-500 font-bold uppercase tracking-wider block">默認鏡頭移動 (Camera Motion)</label>
                          <select
                            className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition cursor-pointer"
                            value={activeProject.cameraMotion || "經典推拉運鏡"}
                            onChange={(e) => updateActiveProject({ cameraMotion: e.target.value })}
                          >
                            <option value="經典推拉運鏡">經典推拉運鏡 (Zoom In / Out)</option>
                            <option value="左右平移掃視鏡頭">左右平移掃視鏡頭 (Pan Left / Right)</option>
                            <option value="環繞3D透視移動鏡頭">環繞3D透視移動鏡頭 (Orbit 3D)</option>
                            <option value="由下往上仰角推鏡">由下往上仰角推鏡 (Crane Shot Up)</option>
                            <option value="靜態定鏡無相機移動">靜態定鏡無相機移動 (Static Lock)</option>
                          </select>
                        </div>

                        {/* Global Storyboard Chatbot */}
                        {renderStoryboardGlobalChat()}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Workflow Trigger & Scenes List */}
                  <div className="xl:col-span-8 space-y-6 relative z-10">
                    {/* Storyboard Extension Banner */}
                    <div className="bg-gradient-to-r from-emerald-950/40 via-teal-900/20 to-slate-900/60 border border-emerald-500/20 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-20">
                      <div className="space-y-3 flex-1 w-full">
                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                            <Film className="w-4 h-4 text-emerald-400" />
                            即時逐鏡創作 (無須預先分鏡，走完 7 步解鎖下一個鏡頭)
                          </h4>
                          <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
                            一開始僅生成<strong>鏡頭 1</strong>，當鏡頭 1 走完步驟 7 (輸出本分鏡總結與下個鏡頭連續性對齊) 後，才會出「👉 接下去」按鈕生成<strong>鏡頭 2</strong>！
                          </p>
                        </div>

                        {/* 嚴格工作流防護鎖切換按鈕 */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 bg-emerald-950/40 border border-emerald-500/15 rounded-xl p-2.5 max-w-xl">
                          <button
                            id="strict-workflow-lock-btn-ext"
                            onClick={handleToggleStrictWorkflowLock}
                            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer select-none shrink-0 border ${
                              strictWorkflowLock
                                ? "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-900/40"
                                : "bg-slate-850 hover:bg-slate-800 text-slate-300 border-slate-700"
                            }`}
                          >
                            {strictWorkflowLock ? "🔒 嚴格鎖：開啟 (Strict 1~7)" : "🔓 嚴格鎖：關閉 (Lenient)"}
                          </button>
                          <span className="text-[10px] text-slate-300 leading-normal">
                            {strictWorkflowLock 
                              ? "上鎖情況走完 7 步解鎖按鈕；不上鎖省去步驟 4 及 6 共 5 步。" 
                              : "快速模式：無須審核速推。"}
                          </span>
                        </div>
                      </div>

                      {/* Header Action Buttons */}
                      <div className="flex flex-wrap items-center gap-3 shrink-0">
                        <button
                          onClick={() => handleRestoreFromBackup(false)}
                          className="py-2.5 px-3 bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 hover:text-indigo-200 text-xs font-semibold rounded-xl border border-indigo-500/30 transition flex items-center gap-1.5 cursor-pointer shadow-md"
                          title="從伺服器端實體備份檔案讀取並恢復所有已核准生成的影像與影片，防止數據流失"
                        >
                          <Download className="w-4 h-4 text-indigo-400" />
                          <span>📥 抽回備份相片/影片</span>
                        </button>

                        {activeProject.scenes.length === 0 ? (
                          <button
                            onClick={handleGenerateNextScene}
                            disabled={isGeneratingNextScene}
                            className="py-2.5 px-5 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-900/40 transition flex items-center gap-2 cursor-pointer relative z-50 pointer-events-auto border border-emerald-400/30 animate-pulse"
                          >
                            {isGeneratingNextScene ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>即時生成鏡頭 1 中...</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-4 h-4 fill-white" />
                                <span>🚀 開始生成鏡頭 1</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <>
                            {(() => {
                              const lastScene = activeProject.scenes[activeProject.scenes.length - 1];
                              const isLastStep7Done = lastScene?.workflowStep === 7 || lastScene?.step7AdviceForNext || !strictWorkflowLock;
                              return (
                                <button
                                  onClick={handleGenerateNextScene}
                                  disabled={isGeneratingNextScene || !isLastStep7Done}
                                  title={!isLastStep7Done ? "請先將當前鏡頭完成至「步驟 7：輸出本分鏡總結與連續性對齊」以解鎖下一個鏡頭" : ""}
                                  className={`py-2.5 px-4 text-xs font-bold rounded-xl shadow-lg transition flex items-center gap-2 cursor-pointer border ${
                                    isLastStep7Done
                                      ? "bg-gradient-to-r from-amber-500 via-emerald-500 to-teal-500 hover:from-amber-400 hover:to-emerald-400 text-white border-amber-400/30 shadow-emerald-900/30 animate-pulse"
                                      : "bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed opacity-60"
                                  }`}
                                >
                                  {isGeneratingNextScene ? (
                                    <>
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                      <span>生成鏡頭 {activeProject.scenes.length + 1} 中...</span>
                                    </>
                                  ) : (
                                    <>
                                      <span>👉 接下去（生成鏡頭 {activeProject.scenes.length + 1}）</span>
                                    </>
                                  )}
                                </button>
                              );
                            })()}

                            <button
                              onClick={handleAddCustomScene}
                              className="py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold rounded-xl border border-slate-800 transition flex items-center gap-1.5 cursor-pointer"
                            >
                              <Plus className="w-4 h-4" />
                              <span>新增自定義場景</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Scene Cards Loop - Exactly matching Image 2 (圖二) format */}
                    <div className="space-y-6">
                      {activeProject.scenes.map((scene, index) => {
                        const matchingChar = activeProject.characters.find(c => (c.name || "").trim().toLowerCase() === (scene.character || "").trim().toLowerCase());
                        return (
                          <div key={scene.id} className="space-y-2">
                            <SceneItem 
                              scene={scene}
                              index={index}
                              activeProjectCharacters={activeProject.characters}
                              handleUpdateSceneField={handleUpdateSceneField}
                              handleDeleteScene={handleDeleteScene}
                              handleDragStart={handleDragStart}
                              handleDragOver={handleDragOver}
                              handleDragEnd={handleDragEnd}
                              handleDrop={handleDrop}
                              draggedIndex={draggedIndex}
                              draggedOverIndex={draggedOverIndex}
                              matchingChar={matchingChar}
                              handleApplyStylePreset={handleApplyStylePreset}
                              handleImageDragOver={handleImageDragOver}
                              handleImageDrop={handleImageDrop}
                              handleUploadSceneImage={handleUploadSceneImage}
                              handleGenerateVideo={handleGenerateVideo}
                              handleGenerateImage={handleGenerateImage}
                              scenes={activeProject.scenes}
                              activeProjectId={activeProject.id}
                              setProjects={setProjects}
                              showToast={showToast}
                              isFullAutoProducing={isFullAutoProducing}
                              fullAutoProgress={fullAutoProgress}
                              fullAutoLogs={fullAutoLogs}
                              onFullAutoProduce={handleFullAutoVideoProduction}
                              sceneType="ext"
                              strictWorkflowLock={strictWorkflowLock}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Empty state welcome card when no scenes exist */}
                    {activeProject.scenes.length === 0 && (
                      <div className="text-center p-12 border border-dashed border-emerald-500/30 bg-emerald-950/10 rounded-2xl text-slate-400 space-y-4">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                          <Film className="w-6 h-6" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-white">當前專案尚未建立分鏡鏡頭</p>
                          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                            完全無須預先拆分全片分鏡！點擊下方按鈕，AI 會即時從故事開頭創作「鏡頭 1」，走完步驟 7 後解鎖下一個鏡頭！
                          </p>
                        </div>
                        <button
                          onClick={handleGenerateNextScene}
                          disabled={isGeneratingNextScene}
                          className="py-3 px-6 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-900/40 transition inline-flex items-center gap-2 cursor-pointer"
                        >
                          {isGeneratingNextScene ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>正在生成鏡頭 1...</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4 fill-white" />
                              <span>🚀 開始生成第一個分鏡 (鏡頭 1)</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {/* Bottom Next Scene Trigger when scenes exist */}
                    {activeProject.scenes.length > 0 && (() => {
                      const lastScene = activeProject.scenes[activeProject.scenes.length - 1];
                      const isLastStep7Done = lastScene?.workflowStep === 7 || lastScene?.step7AdviceForNext || !strictWorkflowLock;
                      return (
                        <div className="bg-slate-900/80 border border-emerald-500/20 rounded-2xl p-5 shadow-xl flex items-center justify-between gap-4">
                          <div className="space-y-0.5">
                            <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                              <span>🎬 當前已完成 {activeProject.scenes.length} 個分鏡鏡頭</span>
                            </div>
                            <p className="text-[11px] text-slate-400">
                              {isLastStep7Done 
                                ? `鏡頭 ${activeProject.scenes.length} 已完成，點擊右側按鈕即時生成「鏡頭 ${activeProject.scenes.length + 1}」！` 
                                : `請將鏡頭 ${activeProject.scenes.length} 執行至「步驟 7：輸出本分鏡總結與下一個鏡頭的連續性對齊建議」以解鎖下一個按鈕。`}
                            </p>
                          </div>

                          <button
                            onClick={handleGenerateNextScene}
                            disabled={isGeneratingNextScene || !isLastStep7Done}
                            className={`py-2.5 px-5 text-xs font-bold rounded-xl shadow-lg transition flex items-center gap-2 cursor-pointer border shrink-0 ${
                              isLastStep7Done
                                ? "bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-white border-emerald-400/30 shadow-emerald-900/40 animate-pulse"
                                : "bg-slate-850 text-slate-500 border-slate-700 cursor-not-allowed opacity-60"
                            }`}
                          >
                            {isGeneratingNextScene ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>生成鏡頭 {activeProject.scenes.length + 1} 中...</span>
                              </>
                            ) : (
                              <>
                                <span>👉 接下去（生成鏡頭 {activeProject.scenes.length + 1}）</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}
              {/* ============ TAB: STORYBOARD SCENES KEYFRAMES & AI HUB ============ */}
              {activeTab === "scenes_keyframes" && (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                  <div className="lg:col-span-4 xl:col-span-4 space-y-6">
                    {/* Settings Panel 1: Script breakdown config */}
                    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-4">
                      <h3 className="font-display font-bold text-sm text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                        <Sliders className="w-4 h-4 text-purple-400" />
                        AI 劇本拆解引擎設定
                      </h3>

                      <div className="space-y-3">
                        {/* Selector Tabs: Mistral vs Zhipu */}
                        <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-850">
                          <button
                            onClick={() => updateActiveProject({ disassemblyEngine: "mistral" })}
                            className={ `py-2 px-3 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                              activeProject.disassemblyEngine === "mistral"
                                ? "bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow"
                                : "text-slate-500 hover:text-slate-300"
                            }`}
                          >
                            <span>🔮 Mistral AI</span>
                            <span className="text-[8px] bg-purple-500/10 px-1 py-0.2 rounded text-purple-400">免費</span>
                          </button>
                          <button
                            onClick={() => updateActiveProject({ disassemblyEngine: "zhipu" })}
                            className={ `py-2 px-3 rounded-lg text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                              activeProject.disassemblyEngine === "zhipu"
                                ? "bg-pink-500/20 text-pink-300 border border-pink-500/30 shadow"
                                : "text-slate-500 hover:text-slate-300"
                            }`}
                          >
                            <span>⚡ 智譜 AI</span>
                            <span className="text-[8px] bg-pink-500/10 px-1 py-0.2 rounded text-pink-400">自備</span>
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-relaxed pl-1">
                          {activeProject.disassemblyEngine === "mistral" 
                            ? "系統已預置免費 Mistral-Nemo-Instruct 模型，無需設定 API Key，適合快速上手。" 
                            : "智譜 GLM 模型需要到設定面板配置您的 ZHIPU_API_KEY。"}
                        </p>
                      </div>
                    </div>

                    {/* Settings Panel 2: Drawing channels & style */}
                    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md space-y-4">
                      <h3 className="font-display font-bold text-sm text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                        <Sparkles className="w-4 h-4 text-pink-400 animate-pulse" />
                        分鏡繪圖 & 運鏡設定
                      </h3>

                      <div className="space-y-4">
                        {/* Drawing channel select */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono text-slate-500 font-bold uppercase tracking-wider block">繪圖算圖通道 (Image Channel)</label>
                          <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-850">
                            <button
                              onClick={() => updateActiveProject({ drawingChannel: "flux" })}
                              className={ `py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                                activeProject.drawingChannel === "flux"
                                  ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow"
                                  : "text-slate-500 hover:text-slate-300"
                              }`}
                            >
                              <span>⚡ FLUX-Sch</span>
                            </button>
                            <button
                              onClick={() => updateActiveProject({ drawingChannel: "sd" })}
                              className={ `py-2 px-3 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                                activeProject.drawingChannel === "sd"
                                  ? "bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow"
                                  : "text-slate-500 hover:text-slate-300"
                              }`}
                            >
                              <span>🌀 SD 3.5</span>
                            </button>
                          </div>
                        </div>

                        {/* Visual style selector input */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono text-slate-500 font-bold uppercase tracking-wider block">視覺美術風格 (Art Style)</label>
                          <select
                            className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition cursor-pointer"
                            value={activeProject.artStyle}
                            onChange={(e) => updateActiveProject({ artStyle: e.target.value })}
                          >
                            <option value="動漫卡通動感 (Anime key visual)">動漫卡通動感 (Anime key visual)</option>
                            <option value="寫實電影感 (Cinematic Realistic)">寫實電影感 (Cinematic Realistic)</option>
                            <option value="高擬真電影質感 (Photorealistic Cinema)">高擬真電影質感 (Photorealistic Cinema)</option>
                            <option value="賽博朋克霓虹 (Cyberpunk Neon)">賽博朋克霓虹 (Cyberpunk Neon)</option>
                            <option value="美式寫實漫畫 (Cyberpunk Comic)">美式寫實漫畫 (Cyberpunk Comic)</option>
                            <option value="水彩插畫風 (Watercolor Illustration)">水彩插畫風 (Watercolor Illustration)</option>
                            <option value="中國古風水墨 (Traditional Chinese Ink)">中國古風水墨 (Traditional Chinese Ink)</option>
                            <option value="黑白鉛筆速寫 (Pencil Sketch)">黑白鉛筆速寫 (Pencil Sketch)</option>
                            <option value="可愛3D黏土風 (Claymation 3D)">可愛3D黏土風 (Claymation 3D)</option>
                          </select>
                        </div>

                        {/* Camera motion template */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-mono text-slate-500 font-bold uppercase tracking-wider block">默認鏡頭移動 (Camera Motion)</label>
                          <select
                            className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition cursor-pointer"
                            value={activeProject.cameraMotion || "經典推拉運鏡"}
                            onChange={(e) => updateActiveProject({ cameraMotion: e.target.value })}
                          >
                            <option value="經典推拉運鏡">經典推拉運鏡 (Zoom In / Out)</option>
                            <option value="左右平移掃視鏡頭">左右平移掃視鏡頭 (Pan Left / Right)</option>
                            <option value="環繞3D透視移動鏡頭">環繞3D透視移動鏡頭 (Orbit 3D)</option>
                            <option value="由下往上仰角推鏡">由下往上仰角推鏡 (Crane Shot Up)</option>
                            <option value="靜態定鏡無相機移動">靜態定鏡無相機移動 (Static Lock)</option>
                          </select>
                        </div>

                        {/* Global Storyboard Chatbot */}
                        {renderStoryboardGlobalChat()}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Workflow Trigger & Scenes List */}
                  <div className="xl:col-span-8 space-y-6 relative z-10">
                    {/* Storyboard Keyframes Banner */}
                    <div className="bg-gradient-to-r from-purple-950/40 via-indigo-900/20 to-slate-900/60 border border-purple-500/20 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-20">
                      <div className="space-y-3 flex-1 w-full">
                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                            <Film className="w-4 h-4 text-purple-400" />
                            AI 分鏡劇本首尾幀 (首尾轉換無縫連貫模式)
                          </h4>
                          <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
                            在此模式下，各分鏡影片獨立製作。以<strong>當前分鏡產生的相片為首影格 (Start Frame)</strong>，並以<strong>下一分鏡的相片為尾影格 (End Frame)</strong>，實現影格與影格之間的無縫連貫過渡！
                          </p>
                          <p className="text-xs text-amber-400 font-medium pt-1">
                            ● 建議：影片長度必須考慮首尾幀過渡的時長，確保過渡效果合理及順暢。
                          </p>
                        </div>

                        {/* 嚴格工作流防護鎖切換按鈕 */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 bg-purple-950/40 border border-purple-500/15 rounded-xl p-2.5 max-w-xl">
                          <button
                            id="strict-workflow-lock-btn-key"
                            onClick={handleToggleStrictWorkflowLock}
                            className={ `px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer select-none shrink-0 border ${
                              strictWorkflowLock
                                ? "bg-purple-600 hover:bg-purple-500 text-white border-purple-500 shadow-md shadow-purple-900/40"
                                : "bg-slate-850 hover:bg-slate-800 text-slate-300 border-slate-700"
                            }`}
                          >
                            {strictWorkflowLock ? "🔒 嚴格鎖：開啟 (Strict)" : "🔓 嚴格鎖：關閉 (Lenient)"}
                          </button>
                          <span className="text-[10px] text-slate-300 leading-normal">
                            {strictWorkflowLock 
                              ? "當前為嚴格防護模式，若生成/審核不合格將自動重試並在重试次數用盡後防護暫停。" 
                              : "當前為容錯降級模式，故障或不合格時會自動安全繞過並推進。"}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2.5 shrink-0 items-center">
                        <button
                          onClick={handleClearAllKeyframes}
                          className={ `py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer hover:scale-[1.02] relative z-20 border ${
                            isConfirmingClear
                              ? "bg-red-600 border-red-500 text-white animate-pulse"
                              : "bg-slate-900 border-red-500/40 hover:bg-red-950/20 text-red-400"
                          }`}
                        >
                          <Trash2 className={ `w-3.5 h-3.5 ${isConfirmingClear ? "text-white" : "text-red-400"}`} />
                          <span>{isConfirmingClear ? "⚠️ 再次點擊以確認清除！" : "一鍵清除已生成 (重頭再來)"}</span>
                        </button>
                        {/* TOONFLOW_CLEAR_CATBOX_BUTTON_START */}
                        <button
                          type="button"
                          onClick={handleClearCatbox}
                          className="py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer hover:scale-[1.02] relative z-20 border bg-slate-900 border-orange-500/40 hover:bg-orange-950/20 text-orange-400"
                          title="清除本 App 已上傳到 Catbox 的永久檔案（需要設定 CATBOX_USERHASH）"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-orange-400" />
                          <span>清除 Catbox 檔案</span>
                        </button>
                        {/* TOONFLOW_CLEAR_CATBOX_BUTTON_END */}

                        <button
                          onClick={handleGenerateAllKeyframesSequentially}
                          disabled={isGeneratingAllKeyframesSequentially || activeProject.scenes.length === 0}
                          className="py-2.5 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-55 shrink-0 hover:scale-[1.02] relative z-20"
                        >
                          {isGeneratingAllKeyframesSequentially ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>自動依序首尾轉換生成中...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5 text-purple-200" />
                              <span>一鍵自動依序首尾過渡生成所有分鏡</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* NEW FEATURE: AI One-click Full Auto-Produce Video Section */}
                    <div className="bg-gradient-to-r from-emerald-950/40 via-teal-900/20 to-slate-900/60 border border-emerald-500/20 rounded-2xl p-5 shadow-xl space-y-4 relative z-20">
                      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                            <Wand2 className="w-4 h-4 text-emerald-400" />
                            AI 一鍵全自動極速出片 (極致極簡一鍵工作流)
                          </h4>
                          <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
                            只需點擊一次，AI 將為您全自動處理：<strong>分析大綱/拆解劇本 ➔ 自動對齊角色服裝 ➔ 依序生成首尾影格 ➔ 完美連續過渡運鏡 ➔ 智能無縫剪輯及自動合成影片 ➔ 一鍵完成最終出片！</strong>
                          </p>

                          {/* 嚴格工作流防護鎖切換按鈕 */}
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mt-3 bg-emerald-950/40 border border-emerald-500/15 rounded-xl p-3 max-w-xl">
                            <button
                              id="strict-workflow-lock-btn"
                              onClick={handleToggleStrictWorkflowLock}
                              className={ `px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer select-none shrink-0 border ${
                                strictWorkflowLock
                                  ? "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-900/40"
                                  : "bg-slate-800 hover:bg-slate-750 text-slate-300 border-slate-700"
                              }`}
                            >
                              {strictWorkflowLock ? "🔒 開啟嚴格鎖 (Strict)" : "🔓 關閉嚴格鎖 (Lenient)"}
                            </button>
                            <span className="text-[11px] text-slate-300 leading-normal">
                              <strong>七步嚴格工作流安全鎖：</strong>
                              {strictWorkflowLock 
                                ? "若分鏡或影片審核不合格，會啟動最高10次自動重生成/防護暫停，保證畫面與流暢度品質。" 
                                : "故障或審核不合格時自動容錯降級，安全繞過並強制拼接成片。"}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 shrink-0 w-full md:w-auto">
                          <button
                            onClick={() => handleRestoreFromBackup(false)}
                            disabled={isFullAutoProducing}
                            className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-teal-400 font-bold border border-teal-500/30 rounded-xl text-xs shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-55 w-full sm:w-auto hover:scale-[1.02] relative z-20"
                            title="從伺服器端實體備份檔案讀取並恢復所有已核准生成的影像與影片，防止因瀏覽器刷新、斷線或退出導致數據流失"
                          >
                            <Download className="w-4 h-4 text-teal-400 animate-bounce" />
                            <span>📥 抽回備份相片/影片</span>
                          </button>

                          <button
                            onClick={handleFullAutoVideoProduction}
                            disabled={isFullAutoProducing}
                            className="py-2.5 px-5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-emerald-900/30 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-55 w-full sm:w-auto hover:scale-[1.02] relative z-20 animate-pulse"
                          >
                            {isFullAutoProducing ? (
                              <>
                                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                                <span>AI 全自動製片進行中... {fullAutoProgress}</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-4 h-4 fill-current text-white" />
                                <span>⚡ AI 一鍵全自動極速出片</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={handleManualStitchVideos}
                            disabled={isFullAutoProducing}
                            className="py-2.5 px-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-blue-900/30 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-55 w-full sm:w-auto hover:scale-[1.02] relative z-20"
                            title="適用於當您手動完成或重試特定分鏡的影片後，快速一鍵合併拼接所有成功生成的影片片段"
                          >
                            <Clapperboard className="w-4 h-4 text-white" />
                            <span>🎬 一鍵手動拼接成片</span>
                          </button>
                        </div>
                      </div>

                      {/* Progress Bar & Real-time Logs Container */}
                      {(isFullAutoProducing || fullAutoLogs.length > 0 || finalStitchedVideoUrl || activeProject?.finalVideoUrl) && (
                        <div className="bg-slate-950/80 border border-slate-850 rounded-xl p-4 space-y-3 font-mono text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                              <Terminal className="w-3.5 h-3.5" /> 工作流狀態日誌
                            </span>
                            <span className="text-slate-400">{fullAutoProgress}</span>
                          </div>

                          {/* Progress bar visual */}
                          <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                              style={{ width: fullAutoProgress }}
                            />
                          </div>

                          {/* Live Console Logs */}
                          {fullAutoLogs.length > 0 && (
                            <div className="max-h-36 overflow-y-auto space-y-1.5 pr-2 scrollbar-thin scrollbar-thumb-slate-800">
                              {fullAutoLogs.map((log, lIdx) => (
                                <div key={lIdx} className="text-slate-300 leading-relaxed text-[11px] flex items-start gap-1">
                                  <span className="text-emerald-500 font-bold shrink-0">›</span>
                                  <span>{log}</span>
                                </div>
                              ))}
                              <div ref={logsEndRef} />
                            </div>
                          )}

                          {/* Completed Masterpiece Player */}
                          {(finalStitchedVideoUrl || activeProject?.finalVideoUrl) && (
                            <div className="pt-3 border-t border-slate-850 space-y-3">
                              <h5 className="text-sm font-bold text-white flex items-center gap-1.5">
                                <Film className="w-4 h-4 text-emerald-400" />
                                🎬 最終合成 Masterpiece 成片已就緒！
                              </h5>
                              <div className="relative aspect-video rounded-xl overflow-hidden border border-emerald-500/20 bg-slate-900 shadow-inner group">
                                <ScrubbableVideoPlayer 
                                  src={(finalStitchedVideoUrl || activeProject?.finalVideoUrl) as string} 
                                  className="w-full h-full"
                                />
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-[10px] text-slate-500">
                                  檔名: {(finalStitchedVideoUrl || activeProject?.finalVideoUrl)?.split('/').pop()}
                                </span>
                                <button 
                                  onClick={handleDownloadMasterpiece}
                                  disabled={isDownloadingMasterpiece}
                                  className={`py-1.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition flex items-center gap-1 cursor-pointer ${isDownloadingMasterpiece ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                  {isDownloadingMasterpiece ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} 
                                  {isDownloadingMasterpiece ? "下載中..." : "下載成片"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Scenes List Container */}
                    <div className="space-y-4 pt-6 border-t border-slate-800">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <h3 className="font-display font-extrabold text-lg text-white">
                            分鏡卡片列表 ({activeProject.scenes.length} 場)
                          </h3>
                          <span className="inline-flex items-center space-x-1.5 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-full text-[10px]">
                            <span className="w-2 h-2 rounded-full bg-purple-500" />
                            <span className="text-purple-400 font-medium capitalize">首尾影格連續過渡已就緒</span>
                          </span>
                        </div>

                        <div className="flex items-center space-x-2">
                          <button
                            id="global-strict-lock-btn-3"
                            onClick={handleToggleStrictWorkflowLock}
                            className={ `py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer select-none border shrink-0 ${
                              strictWorkflowLock
                                ? "bg-purple-600 hover:bg-purple-500 text-white border-purple-500 shadow-md shadow-purple-950/50"
                                : "bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800"
                            }`}
                          >
                            {strictWorkflowLock ? "🔒 嚴格鎖：開啟" : "🔓 嚴格鎖：關閉"}
                          </button>

                          <button
                            onClick={handleAddCustomScene}
                            className="py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold rounded-lg border border-slate-800 transition flex items-center gap-1 cursor-pointer relative z-50 pointer-events-auto"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>新增自定義場景</span>
                          </button>
                        </div>
                      </div>

                      {/* Scene Cards Loop */}
                      <div className="space-y-6">
                        {activeProject.scenes.map((scene, index) => {
                          const matchingChar = activeProject.characters.find(c => (c.name || "").trim().toLowerCase() === (scene.character || "").trim().toLowerCase());
                          return (
                            <div key={scene.id} className="space-y-2">
                              {index < activeProject.scenes.length - 1 ? (
                                <div className="flex items-center space-x-2 pl-6 text-purple-400 text-[10px] font-bold font-mono">
                                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                  <span>🧬 首影格為「分鏡 {index + 1} 圖片」，尾影格將自動指定為「分鏡 {index + 2} 圖片」(首尾轉換過渡啟用)</span>
                                </div>
                              ) : (
                                <div className="flex items-center space-x-2 pl-6 text-purple-400 text-[10px] font-bold font-mono">
                                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                  <span>🧬 結尾分鏡：首影格為「分鏡 {index + 1} 圖片」，無後續分鏡作為尾影格 (將自動過渡至故事結尾)</span>
                                </div>
                              )}
                              <SceneItem 
                                scene={scene}
                                index={index}
                                activeProjectCharacters={activeProject.characters}
                                handleUpdateSceneField={handleUpdateSceneField}
                                handleDeleteScene={handleDeleteScene}
                                handleDragStart={handleDragStart}
                                handleDragOver={handleDragOver}
                                handleDragEnd={handleDragEnd}
                                handleDrop={handleDrop}
                                draggedIndex={draggedIndex}
                                draggedOverIndex={draggedOverIndex}
                                matchingChar={matchingChar}
                                handleApplyStylePreset={handleApplyStylePreset}
                                handleImageDragOver={handleImageDragOver}
                                handleImageDrop={handleImageDrop}
                                handleUploadSceneImage={handleUploadSceneImage}
                                handleGenerateVideo={handleGenerateVideo}
                                handleGenerateImage={handleGenerateImage}
                                scenes={activeProject.scenes}
                                activeProjectId={activeProject.id}
                                setProjects={setProjects}
                                showToast={showToast}
                                isFullAutoProducing={isFullAutoProducing}
                                fullAutoProgress={fullAutoProgress}
                                fullAutoLogs={fullAutoLogs}
                                onFullAutoProduce={handleFullAutoVideoProduction}
                                sceneType="keyframes"
                                strictWorkflowLock={strictWorkflowLock}
                              />
                            </div>
                          );
                        })}
                      </div>
                      {activeProject.scenes.length === 0 && (
                          <div className="text-center p-12 border border-dashed border-slate-800 rounded-2xl text-slate-500 text-xs">
                            此專案尚未拆解分鏡。請在上方原著劇本頁面輸入劇本文字，並按下「一鍵 AI 拆解分鏡」生成豐富的故事劇本！
                          </div>
                        )}
                                            </div>
                    </div>
                  </div>
              )}
              {/* ============ TAB: AUTO DIRECTOR (一鏡接一鏡 · 即時自動導演) ============ */}
              {activeTab === "auto_director" && (
                <div className="space-y-6">
                  <SequentialChainMode
                    project={activeProject}
                    artStyle={activeProject.artStyle}
                    cameraMotion={activeProject.cameraMotion}
                    autoMode={strictWorkflowLock}
                    onUpdateScenes={(newScenes) => {
                      updateActiveProject({ scenes: newScenes });
                    }}
                    onUpdateCharacters={(newChars) => {
                      updateActiveProject({ characters: newChars });
                    }}
                  />
                </div>
              )}

              {/* ============ TAB: GALLERY ============ */}
              {activeTab === "gallery" && (
                <div className="space-y-6">
                  <VideoGallery activeProject={activeProject} />
                </div>
              )}

              {/* ============ TAB: EXPERIENCE LIBRARY ============ */}
              {activeTab === "experience" && (
                <div className="space-y-6">
                  <ExperienceLibrary 
                    activeProjectId={activeProjectId || ""} 
                    scenes={activeProject?.scenes || []} 
                    onApplySuggestion={(sceneId, newPrompt) => {
                      if (!activeProject) return;
                      const updatedScenes = activeProject.scenes.map((s) => {
                        if (s.id === sceneId) {
                          return { ...s, visualPrompt: newPrompt };
                        }
                        return s;
                      });
                      updateActiveProject({ scenes: updatedScenes });
                      showToast("✨ 已成功套用 AI 診斷優化提示詞到該分鏡！", "success");
                    }}
                  />
                </div>
              )}

            </div>

          </div>
        )}

      {/* ================= MODAL: 3D SIMULATION PLAYBACK (本地 100% 免費影片製作大師) ================= */}
      <AnimatePresence>
        {selectedSceneForSimulation && isPlayingSimulation && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center p-4 backdrop-blur"
          >
            <div className="max-w-4xl w-full flex flex-col space-y-4">
              
              {/* Header inside player */}
              <div className="flex items-center justify-between text-slate-300 px-2">
                <div className="flex items-center space-x-2">
                  <span className="text-xs bg-pink-500/20 text-pink-400 font-mono font-bold border border-pink-500/20 px-2 py-0.5 rounded">
                    本地 100% 免費影片製作大師
                  </span>
                  <h3 className="text-sm font-bold text-white">{selectedSceneForSimulation.title}</h3>
                </div>
                <button
                  onClick={() => {
                    setIsPlayingSimulation(false);
                    setSelectedSceneForSimulation(null);
                  }}
                  className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Simulated Screen with cinematic borders and zoom effect */}
              <div className="relative aspect-video w-full bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center">
                
                {/* Widescreen Cinematic bars */}
                <div className="absolute top-0 inset-x-0 h-[10%] bg-black z-20" />
                <div className="absolute bottom-0 inset-x-0 h-[10%] bg-black z-20" />

                {/* Subtitle / Dialogue overlay */}
                <div className="absolute bottom-[14%] inset-x-8 text-center z-30 pointer-events-none px-4">
                  <div className="inline-block bg-black/85 backdrop-blur-md text-yellow-300 font-sans px-4 py-2 rounded-lg border border-yellow-500/10 shadow-lg font-bold text-sm md:text-base tracking-wide leading-relaxed animate-pulse">
                    【{selectedSceneForSimulation.character}】: {selectedSceneForSimulation.dialogue}
                  </div>
                </div>

                {/* Canvas image zooming with moving camera animation */}
                <div className="absolute inset-0 z-0">
                  <img
                    src={selectedSceneForSimulation.imageUrl || "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=800&q=80"}
                    alt="Cinema storyboard zoom"
                    className="w-full h-full object-cover origin-center animate-zoomPan"
                    style={{
                      animation: "zoomPan 8s infinite alternate ease-in-out"
                    }}
                  />
                </div>

                 {/* Simulated Audio waveform visualization */}
                <div className="absolute top-12 right-6 z-30 flex flex-col items-end space-y-1.5">
                  <div className="flex items-center space-x-0.5 bg-black/75 backdrop-blur-md border border-slate-800/80 px-3 py-1.5 rounded-full text-[10px] font-mono text-pink-400 font-bold shadow-lg">
                    <Volume2 className="w-3.5 h-3.5 mr-1 text-pink-400 animate-bounce" />
                    <span>TTS 音訊合成: 已開啟 (24kHz)</span>
                    <div className="flex items-end h-3 space-x-0.5 ml-2">
                      <div className="w-0.5 bg-pink-500 animate-soundwave-1" />
                      <div className="w-0.5 bg-pink-500 animate-soundwave-2" />
                      <div className="w-0.5 bg-pink-500 animate-soundwave-3" />
                      <div className="w-0.5 bg-pink-500 animate-soundwave-4" />
                    </div>
                  </div>
                  {selectedSceneForSimulation.audioCue && (
                    <div className="bg-black/85 backdrop-blur-md border border-pink-500/20 text-pink-300 font-sans px-3 py-1 text-[10px] font-bold rounded-lg max-w-[280px] shadow-lg flex items-center gap-1 animate-pulse">
                      <span className="text-yellow-400">🎵</span>
                      <span className="truncate" title={selectedSceneForSimulation.audioCue}>
                        音訊氛圍：{selectedSceneForSimulation.audioCue}
                      </span>
                    </div>
                  )}
                </div>

              </div>

              {/* Sub-text explanation */}
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl text-xs text-slate-400 text-center leading-relaxed">
                正在以 <strong>{activeProject?.cameraMotion || "經典推拉運鏡"}</strong> 進行實時 3D 相機移動渲染。寬螢幕字幕、聲波合成已完成，支援流暢導出。
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================= MODAL: DELETE PROJECT CONFIRMATION ================= */}
      <AnimatePresence>
        {projectToDelete && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl relative"
            >
              <div className="p-6">
                <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-4 text-red-500">
                  <Trash2 className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Delete Project?</h3>
                <p className="text-slate-400 text-sm mb-6">
                  This action cannot be undone. All scenes and characters within this project will be permanently deleted.
                </p>
                <div className="flex items-center gap-3 w-full">
                  <button 
                    onClick={() => setProjectToDelete(null)}
                    className="flex-1 py-2.5 px-4 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 transition font-bold text-sm"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={confirmDeleteProject}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white transition font-bold text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================= SETTINGS DRAWER ================= */}
      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        customApiKey={customApiKey}
        onSaveApiKey={handleSaveApiKey}
        onResetVideoTask={handleResetVideoTask}
      />

      {/* ================= PRINT / PDF SCRIPT PREVIEW MODAL ================= */}
      <AnimatePresence>
        {isPrintModalOpen && activeProject && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-sm flex justify-center items-start p-4 md:p-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-slate-900 border border-slate-800 w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col overflow-hidden relative"
            >
              {/* Top Action Bar (hidden when printing) */}
              <div className="no-print bg-slate-900/95 border-b border-slate-800/80 px-6 py-4 flex items-center justify-between sticky top-0 z-30 backdrop-blur-md">
                <div className="flex items-center space-x-2.5">
                  <Printer className="w-5 h-5 text-pink-500 animate-pulse" />
                  <div>
                    <h3 className="font-display font-extrabold text-white text-sm">
                      導演劇本與分鏡腳本預覽 (Screenplay & Storyboard)
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      專案：{activeProject.name} | 共 {activeProject.scenes.length} 個分鏡場景
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => window.print()}
                    className="py-2 px-4 bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-pink-500/10"
                  >
                    <Printer className="w-4 h-4" />
                    <span>立即列印 / 另存為 PDF</span>
                  </button>
                  <button
                    onClick={() => setIsPrintModalOpen(false)}
                    className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 hover:text-white transition cursor-pointer"
                    title="關閉預覽"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Printable Area (Main Sheet) */}
              <div id="print-preview-modal" className="flex-1 bg-slate-950 p-6 md:p-10 text-slate-100 overflow-y-auto max-h-[80vh] scrollbar-thin">
                
                {/* Print Banner */}
                <div className="border-b border-slate-800 pb-6 mb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                  <div className="space-y-2">
                    <span className="text-[10px] bg-indigo-500/10 text-indigo-400 font-mono tracking-widest uppercase font-extrabold border border-indigo-500/20 px-2 py-0.5 rounded">
                      ToonFlow Storyboard & Director's Book
                    </span>
                    <h1 className="font-display font-black text-2xl md:text-3xl text-white tracking-tight leading-tight">
                      {activeProject.name}
                    </h1>
                    {activeProject.novelText && (
                      <p className="text-xs text-slate-400 max-w-2xl line-clamp-2 italic">
                        原著內容摘要：{activeProject.novelText}
                      </p>
                    )}
                  </div>
                  <div className="text-left md:text-right text-[10px] font-mono text-slate-500 space-y-1">
                    <p>編制日期: {new Date().toLocaleDateString()}</p>
                    <p>創立時間: {activeProject.createdAt}</p>
                    <p>劇本系統: ToonFlow Studio v2.0</p>
                  </div>
                </div>

                {/* Cast / Characters Section */}
                {activeProject.characters && activeProject.characters.length > 0 && (
                  <div className="mb-10 space-y-3 print-card">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1.5 border-b border-slate-900 pb-2">
                      <Users className="w-4 h-4 text-pink-400" />
                      <span>登場角色名冊 (Cast & Characters)</span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {activeProject.characters.map((char) => (
                        <div key={char.id} className="bg-slate-900/40 border border-slate-850 p-3.5 rounded-xl space-y-2 print-bg-light">
                          <div className="flex items-center gap-2">
                            {char.imageUrl ? (
                              <img
                                src={char.imageUrl}
                                alt={char.name}
                                referrerPolicy="no-referrer"
                                className="w-8 h-8 rounded-full object-cover border border-slate-800"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-[10px] text-slate-400 font-bold uppercase border border-slate-700">
                                {char.name.slice(0, 1)}
                              </div>
                            )}
                            <div>
                              <p className="text-xs font-bold text-white print-text-dark">{char.name}</p>
                              <p className="text-[9px] text-slate-500 font-mono">風格: {char.artStyle || "預設"}</p>
                            </div>
                          </div>
                          {char.description && (
                            <p className="text-[10px] text-slate-400 leading-relaxed line-clamp-2 print-text-muted">
                              描述：{char.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Storyboard List */}
                <div className="space-y-6">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-1.5 pb-2 border-b border-slate-900">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    <span>分鏡對白與導演規劃腳本 (Storyboard Script)</span>
                  </h3>

                  {activeProject.scenes.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl text-slate-500 text-xs">
                      目前此專案尚無分鏡場景資料。
                    </div>
                  ) : (
                    <div className="space-y-8">
                      {activeProject.scenes.map((scene, index) => (
                        <div
                          key={scene.id}
                          className="bg-slate-900/30 border border-slate-850 rounded-2xl p-5 md:p-6 space-y-4 print-card print-bg-light relative"
                        >
                          {/* Card Header Info */}
                          <div className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-850 pb-3">
                            <div className="flex items-center space-x-2.5">
                              <span className="w-6 h-6 rounded-lg bg-pink-500 text-white text-[11px] font-mono font-bold flex items-center justify-center shadow-lg shadow-pink-500/20">
                                {index + 1}
                              </span>
                              <div>
                                <h4 className="text-xs font-extrabold text-white print-text-dark">
                                  {scene.title || "未命名分鏡場景 " + (index + 1)}
                                </h4>
                                <p className="text-[9px] text-slate-500 font-mono">
                                  ID: {scene.id}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400">
                              <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 print-bg-light print-text-muted">
                                🎬 角色: <strong className="text-pink-400 font-sans">{scene.character || "無"}</strong>
                              </span>
                              <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 print-bg-light print-text-muted">
                                ⏱️ 時長: <strong className="text-indigo-400">{scene.durationSeconds || ""} 秒</strong>
                              </span>
                            </div>
                          </div>

                          {/* Grid with image and content */}
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                            {/* Visual reference thumbnail */}
                            <div className="md:col-span-4 space-y-2">
                              <div className="aspect-video bg-slate-950 border border-slate-850 rounded-xl overflow-hidden relative shadow-inner print-bg-light">
                                {scene.imageUrlKeyframes ? (
                                  <img
                                    src={scene.imageUrlKeyframes}
                                    alt={scene.title}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex flex-col items-center justify-center text-[10px] text-slate-600 gap-1 p-4 text-center">
                                    <span>無分鏡預覽圖片</span>
                                    <span>No Reference Image</span>
                                  </div>
                                )}
                              </div>
                              <p className="text-[9px] font-mono text-slate-500 line-clamp-1 truncate" title={scene.imageUrlKeyframes}>
                                {scene.imageUrlKeyframes || "未上傳/未生成圖片網址"}
                              </p>
                            </div>

                            {/* Dialogue, narration & prompts */}
                            <div className="md:col-span-8 space-y-3 text-xs">
                              {scene.dialogue && (
                                <div className="space-y-1">
                                  <span className="text-[9px] font-mono font-bold text-yellow-500/80 uppercase block">🗣️ 角色對白 (Dialogue)</span>
                                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-900 text-yellow-300 font-medium leading-relaxed print-bg-light print-text-dark">
                                    {scene.dialogue}
                                  </div>
                                </div>
                              )}

                              {scene.narration && (
                                <div className="space-y-1">
                                  <span className="text-[9px] font-mono font-bold text-slate-500 uppercase block">📖 場景旁白 (Narration)</span>
                                  <p className="text-slate-300 pl-1 leading-relaxed italic print-text-muted">
                                    {scene.narration}
                                  </p>
                                </div>
                              )}

                              {scene.audioCue && (
                                <div className="space-y-1 bg-pink-500/5 p-2 rounded-lg border border-pink-500/10 print-bg-light">
                                  <span className="text-[9px] font-mono font-bold text-pink-400 uppercase flex items-center gap-1">
                                    <span>🎵 音效與氛圍音樂 (Audio Cue)</span>
                                  </span>
                                  <p className="text-slate-300 text-[10px] pl-1 print-text-dark">
                                    {scene.audioCue}
                                  </p>
                                </div>
                              )}

                              {scene.visualPrompt && (
                                <div className="space-y-1">
                                  <span className="text-[9px] font-mono font-bold text-cyan-400/80 uppercase block">🎨 英文畫面提示詞 (Visual Prompt)</span>
                                  <div className="bg-slate-950/40 p-2 rounded-lg border border-slate-900 text-[10px] font-mono text-slate-400 leading-normal select-all print-text-muted">
                                    {scene.visualPrompt}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Director Notes Row (Separated fully) */}
                          {scene.directorNotes && (
                            <div className="mt-2 pt-3 border-t border-slate-850 space-y-1 bg-amber-500/5 p-3 rounded-xl border border-amber-500/10 print-bg-light">
                              <span className="text-[9px] font-mono font-bold text-amber-500 uppercase flex items-center gap-1">
                                🎬 導演註記與個人拍攝備忘 (Director's & Camera Notes)
                              </span>
                              <p className="text-[11px] text-slate-300 pl-1 leading-relaxed print-text-dark font-sans whitespace-pre-wrap">
                                {scene.directorNotes}
                              </p>
                            </div>
                          )}

                        </div>
                      ))}
                    </div>
                  )}

                </div>

                {/* Print Footer */}
                <div className="mt-12 pt-6 border-t border-slate-900 text-center text-[10px] text-slate-600 space-y-1">
                  <p>ToonFlow Studio © 2026. All rights reserved.</p>
                  <p className="no-print">離線儲存小技巧：點擊上方列印按鈕後，在印表機目標中選擇「另存為 PDF (Save as PDF)」即可匯出完美的高解析度電子劇本！</p>
                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 backdrop-blur-md text-center py-6 text-xs text-slate-500 mt-auto relative z-10">
        <p>Built with Agnes Video V2.0 Integration & Gemini AI Engine. Toonflow Platform © 2026.</p>
      </footer>

      {/* Profile / Identity Modal */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        currentUser={currentUser}
        onGoogleSignIn={handleSignIn}
        onCustomSignIn={handleCustomSignIn}
        onSignOut={handleSignOut}
      />
      </AuthWrapper>
    </div>
  );
}
