
export interface Scene {
  id: string;
  title: string;
  dialogue: string;
  narration?: string;
  character: string;
  visualPrompt: string;
  negativePrompt?: string;
  actionPrompt?: string;
  transitionPrompt?: string;
  durationSeconds?: number;
  imageUrl?: string;
  videoUrl?: string;
  isGeneratingImage?: boolean;
  isGeneratingVideo?: boolean;
  videoProgress?: string;
  videoLogs?: string[];
  videoError?: string;
  videoErrorCode?: number;
  videoApiLatency?: string;
  videoDownloadLatency?: string;
  videoResourceAllocation?: string;
  
  imageUrlExt?: string;
  videoUrlExt?: string;
  isGeneratingImageExt?: boolean;
  isGeneratingVideoExt?: boolean;
  videoProgressExt?: string;
  videoLogsExt?: string[];
  videoErrorExt?: string;
  videoErrorCodeExt?: number;
  videoApiLatencyExt?: string;
  videoDownloadLatencyExt?: string;
  videoResourceAllocationExt?: string;

  imageUrlKeyframes?: string;
  videoUrlKeyframes?: string;
  isGeneratingImageKeyframes?: boolean;
  isGeneratingVideoKeyframes?: boolean;
  videoProgressKeyframes?: string;
  videoLogsKeyframes?: string[];
  videoErrorKeyframes?: string;
  videoErrorCodeKeyframes?: number;
  videoApiLatencyKeyframes?: string;
  videoDownloadLatencyKeyframes?: string;
  videoResourceAllocationKeyframes?: string;
  isRetryingPolicy?: boolean;
  policyRetryCount?: number;
  useFreezeAndMove?: boolean;
  useMidpointSplit?: boolean;
  audioCue?: string;
  directorNotes?: string;
  aiReviewStatus?: "passed" | "needs_refinement" | "reviewing";
  aiReviewAlignmentCheck?: string;
  aiReviewLogicCheck?: string;
  aiReviewContinuityCheck?: string;
  aiReviewSeamlessCheck?: string;
  aiReviewCritique?: string;
  isReviewing?: boolean;
  hasAutoRegeneratedReview?: boolean;

  // Grok 7-step Storyboard Workflow States
  workflowStep?: number; // 1 to 7
  currentStep?: number; // 1 to 7
  step1Passed?: boolean;
  step2Passed?: boolean;
  step3Passed?: boolean;
  step5Passed?: boolean;
  step7Passed?: boolean;
  step7Summary?: string;
  step6Score?: number;
  step6ReviewText?: string;
  step4Score?: number;
  step4ReviewText?: string;
  step1PrevShotAdvice?: string; // Carried over from previous shot's step 7 advice
  step2OptimizedPrompt?: string; // AI optimized visual prompt
  step2OptimizedNegative?: string; // AI optimized negative prompt
  isOptimizingStep2?: boolean; // Generating optimized prompt status
  step4ImageReviewScore?: number; // 0 - 100
  step4ImageReviewText?: string; // AI storyboard image evaluation text
  step4Passed?: boolean; // Whether checked passed
  isReviewingStep4?: boolean; // Reviewing step 4 status
  step5Mode?: "continuous" | "transition"; // Smart continuity mode
  step6VideoReviewScore?: number; // 0 - 100
  step6VideoReviewText?: string; // AI video review text
  step6Passed?: boolean; // Whether checked passed
  isReviewingStep6?: boolean; // Reviewing step 6 status
  step7AdviceForNext?: string; // Advice generated for the next shot
  isGeneratingStep7?: boolean; // Generating advice status
  lastFrameUrl?: string; // Extracted last frame URL for continuous video start
  stepExtractPassed?: boolean;
  isEnding?: boolean;
}

export const DEFAULT_SCENE: Omit<Scene, 'id' | 'title' | 'dialogue' | 'character' | 'visualPrompt'> = {
  narration: "",
  negativePrompt: "",
  actionPrompt: "",
  transitionPrompt: "",
  durationSeconds: 5,
  imageUrl: "",
  videoUrl: "",
  isGeneratingImage: false,
  isGeneratingVideo: false,
  videoProgress: "0%",
  videoLogs: [],
  videoError: "",
  videoApiLatency: "",
  videoDownloadLatency: "",
  videoResourceAllocation: "",
  imageUrlExt: "",
  videoUrlExt: "",
  isGeneratingImageExt: false,
  isGeneratingVideoExt: false,
  videoProgressExt: "0%",
  videoLogsExt: [],
  videoErrorExt: "",
  videoApiLatencyExt: "",
  videoDownloadLatencyExt: "",
  videoResourceAllocationExt: "",
  imageUrlKeyframes: "",
  videoUrlKeyframes: "",
  isGeneratingImageKeyframes: false,
  isGeneratingVideoKeyframes: false,
  videoProgressKeyframes: "0%",
  videoLogsKeyframes: [],
  videoErrorKeyframes: "",
  videoApiLatencyKeyframes: "",
  videoDownloadLatencyKeyframes: "",
  videoResourceAllocationKeyframes: "",
  audioCue: "",
  directorNotes: "",
  aiReviewStatus: "passed",
  isReviewing: false,

  // Grok 7-step Storyboard Workflow Defaults
  workflowStep: 1,
  step1PrevShotAdvice: "",
  step2OptimizedPrompt: "",
  step2OptimizedNegative: "",
  isOptimizingStep2: false,
  step4ImageReviewScore: 0,
  step4ImageReviewText: "",
  step4Passed: false,
  isReviewingStep4: false,
  step5Mode: "continuous",
  step6VideoReviewScore: 0,
  step6VideoReviewText: "",
  step6Passed: false,
  isReviewingStep6: false,
  step7AdviceForNext: "",
  isGeneratingStep7: false,
};

export interface Character {
  id: string;
  name: string;
  description: string;
  role?: string;
  avatarUrl?: string;
  avatarUrls?: string[];
  uploadedAvatarUrl?: string;
  uploadedAvatarUrls?: string[];
  isGeneratingAvatar?: boolean;
  artStyle?: string;
  /** male | female | other — used to lock face/body gender in image prompts */
  gender?: string;
  age?: string;
  clothing?: string;
  personality?: string;
  mood?: string;
  seed?: number;
  targetRole?: string;
  targetAge?: string;
  targetClothing?: string;
  targetPersonality?: string;
  targetMood?: string;
  targetDescription?: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  novelText: string;
  scenes: Scene[];
  scenesExt?: Scene[];
  scenesFirstLast?: Scene[];
  characters: Character[];
  // Configurations
  disassemblyEngine: "mistral" | "zhipu";
  selectedModel: string;
  drawingChannel: "flux" | "sd";
  artStyle: string;
  cameraMotion: string;
  agnesVideoMode?: "fast" | "balanced" | "quality";
  agnesImageMode?: "fast" | "balanced" | "quality";
  finalVideoUrl?: string;
}

export interface TaskState {
  status: "idle" | "running" | "completed" | "failed" | "in_progress";
  progress: string;
  logs: string[];
  error?: string;
  errorCode?: number;
  outputPath?: string;
  prompt?: string;
}

export interface ExperienceEntry {
  id: string;
  type: "image_review" | "video_review" | "system_error" | "api_error" | "workflow_error";
  sceneId?: string;
  projectId?: string;
  originalPrompt?: string;
  optimizedPrompt?: string;
  critique?: string;
  score?: number;
  passed?: boolean;
  userId: string;
  timestamp: string;
  errorName?: string;
  errorMessage?: string;
  errorStack?: string;
  category?: string;
  technical_failure?: boolean;
  failureCategory?: string;
  rootCause?: string;
  isPromptRelated?: boolean;
  actualProblem?: string;
  aiImprovementSuggestion?: string;
  resolution?: string;
  permanentNote?: string;
}
