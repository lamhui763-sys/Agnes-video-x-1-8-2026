export interface LogEntry {
  errorName: string;
  errorMessage: string;
  errorStack?: string;
  category?: string;
  projectId?: string;
  sceneId?: string;
  context?: any;
  failureCategory?: string;
  rootCause?: string;
  isPromptRelated?: boolean;
  originalPrompt?: string;
  generatedResult?: string;
  critiqueFromSystem?: string;
  aiImprovementSuggestion?: string;
  resolution?: string;
}

export async function logToExperienceLibrary(log: LogEntry) {
  // [GUARD] Firestore write disabled - fully detached from AI Studio
  console.log('[Experience Library disabled - local mode]', log.errorName);
  return;

  // Filter out benign environment errors that shouldn't clutter the Experience Library
  const benignErrors = [
    "WebSocket closed without opened",
    "failed to connect to websocket",
    "ResizeObserver loop limit exceeded",
    "Load failed",
    "Failed to fetch",
    "The fetching process for the media resource was aborted by the user agent",
    "NetworkError",
    "Aborted",
    "Script error",
    "v0.dev", // filter out internal framework errors if any
    "extension-context",
    "chrome-extension"
  ];

  const errorString = `${log.errorName} ${log.errorMessage}`.toLowerCase();
  const isBenign = benignErrors.some(msg => errorString.includes(msg.toLowerCase()));

  if (isBenign) return;

  // Enhance log with client context
  const enhancedLog = {
    ...log,
    clientContext: {
      userAgent: navigator.userAgent,
      url: window.location.href,
      screen: `${window.innerWidth}x${window.innerHeight}`,
      timestamp: new Date().toISOString()
    }
  };

  try {
    const response = await fetch("/api/log-client-error", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(enhancedLog),
    });
    if (!response.ok) {
      // Don't warn for transient fetch errors during logging itself
      const text = await response.text().catch(() => "");
      const lowerText = text.toLowerCase();
      if (!lowerText.includes("failed to fetch") && !lowerText.includes("networkerror")) {
        console.warn("Failed to log error to Experience Library", text);
      }
    }
  } catch (err: any) {
    // Silent catch for transient network errors during the logging call itself
    const msg = (err?.message || String(err)).toLowerCase();
    if (!msg.includes("failed to fetch") && !msg.includes("networkerror")) {
      console.error("Error reporting to Experience Library:", err);
    }
  }
}

// Global error handler setup
export function setupGlobalLogger() {
  window.onerror = function(message, source, lineno, colno, error) {
    logToExperienceLibrary({
      errorName: error?.name || "WindowError",
      errorMessage: String(message),
      errorStack: error?.stack,
      category: "global_window",
      context: { source, lineno, colno }
    });
    return false;
  };

  window.onunhandledrejection = function(event) {
    // Extract meaningful error info from rejection reason
    let message = "Unknown promise rejection";
    let name = "UnhandledRejection";
    let stack = undefined;

    if (event.reason instanceof Error) {
      message = event.reason.message;
      name = event.reason.name || name;
      stack = event.reason.stack;
    } else if (typeof event.reason === 'string') {
      message = event.reason;
    } else {
      try {
        message = JSON.stringify(event.reason);
      } catch (e) {}
    }

    logToExperienceLibrary({
      errorName: name,
      errorMessage: message,
      errorStack: stack,
      category: "promise_rejection"
    });
  };
}
