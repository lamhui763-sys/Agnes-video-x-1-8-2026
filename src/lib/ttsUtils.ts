/**
 * Utility for Web Speech API Text-To-Speech (TTS) voice synthesis.
 * Supports Traditional Chinese, Simplified Chinese, and English narration/dialogue readout.
 */

export const speakDialogue = (text: string, onEnd?: () => void) => {
  if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }

  try {
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    // Clean up text (remove markdown symbols or quotes if needed for clean voice)
    const cleanText = text.replace(/^[「『"“]|[」』"”]$/g, '').trim();
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'zh-TW';
    utterance.rate = 0.95; // Slightly calmer, natural cinematic speaking rate
    utterance.pitch = 1.0;

    // Pick Chinese voice if available
    const voices = window.speechSynthesis.getVoices();
    const zhVoice = voices.find(v => v.lang.includes('zh-TW') || v.lang.includes('zh-HK') || v.lang.includes('zh_TW')) 
      || voices.find(v => v.lang.includes('zh') || v.lang.includes('ZH'));

    if (zhVoice) {
      utterance.voice = zhVoice;
    }

    if (onEnd) {
      utterance.onend = onEnd;
      utterance.onerror = onEnd;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn("[TTS] Speech synthesis error:", err);
  }
};

export const stopDialogueSpeech = () => {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }
};
