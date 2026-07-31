/**
 * High-Quality Romance Cinematic Prompt Template
 * Inspired by 《墨香書屋》 2-minute short film storyboard
 * 
 * This template enforces professional film language for Agnes video generation:
 * - Precise camera movements (dolly-in, tracking, over-the-shoulder, 360 orbit)
 * - Rich lighting contrast (warm tungsten vs cool rainlight, rim-light, chiaroscuro)
 * - Emotional continuity and atmosphere
 * - Film stock / lens references (35mm, Kodak Portra, film grain, anamorphic)
 * - Clean visual rules (no subtitles, no text, no watermark)
 */

export const ROMANCE_CINEMATIC_SYSTEM_ENFORCEMENT = `
【SYSTEM ENFORCEMENT - HIGH-QUALITY ROMANCE CINEMATIC STANDARD】
You are generating prompts for a professional cinematic short film in the style of 《墨香書屋》.

MANDATORY STRUCTURE FOR EVERY PROMPT:
1. Shot type + camera movement first (e.g. "Cinematic establishing shot", "Slow dolly-in", "Over-the-shoulder", "Extreme close-up", "Slow 360-degree orbit")
2. Precise lighting description with contrast (warm amber interior vs cool blue rain exterior, rim-light, chiaroscuro, soft tungsten, neon glow)
3. Emotional / atmospheric keywords (moody, intimate, bittersweet, charged silence, unspoken tension)
4. Lens & film stock references (Shot on 35mm lens, shallow depth of field, film grain texture, Kodak Portra color palette, anamorphic lens flare)
5. Clean visual rules at the end: "completely clean video, no subtitles, no text, no captions, no words, no watermark, no logo, no signature, clean visual aesthetics"

CAMERA MOVEMENT VOCABULARY (use these exact terms):
- Slow dolly-in / Slow push-in
- Lateral tracking shot
- Over-the-shoulder shot
- Extreme close-up
- Low-angle / High-angle
- Slow 360-degree orbit
- Static locked-off shot with rain and light movement only
- Subtle handheld camera shake for realism

LIGHTING VOCABULARY (always include contrast):
- Warm amber / warm tungsten interior light
- Cool blue rainlight / neon pink-blue exterior
- Rim-light / edge light on character silhouette
- Chiaroscuro / high-contrast dramatic shadows
- Soft diffused light through rain-streaked glass
- Sudden lightning flash illuminating face for one frame

EMOTIONAL CONTINUITY RULES:
- Maintain consistent character appearance, clothing, and hair across all shots
- Rain, neon, and bookstore warm light must remain continuous visual motifs
- Emotional intensity should escalate logically (quiet contemplation → charged gaze → touch → embrace → quiet resolution)

NEGATIVE CONSTRAINTS (always append):
blurry, low quality, deformed hands, extra fingers, text, watermark, subtitles, logo, signature, cartoon, illustration, 3d render, abstract background, gradient, color blocks
`.
trim();

export const ROMANCE_SCENE_PROMPT_TEMPLATE = (params: {
  shotType: string;
  visualDescription: string;
  cameraMovement: string;
  lighting: string;
  emotion: string;
  styleNotes?: string;
}) => {
  const { shotType, visualDescription, cameraMovement, lighting, emotion, styleNotes = "" } = params;
  return `
${shotType}. ${visualDescription}. ${cameraMovement}. ${lighting}. ${emotion}. ${styleNotes}
Shot on 35mm lens, shallow depth of field, film grain texture, Kodak Portra color palette, cinematic color grading with deep blues and warm ambers.
completely clean video, no subtitles, no text, no captions, no words, no watermark, no logo, no signature, clean visual aesthetics.
`.trim();
};

export const ROMANCE_NEGATIVE_PROMPT = 
  "blurry, low quality, worst quality, deformed hands, extra fingers, fused fingers, missing fingers, bad anatomy, text, watermark, signature, logo, subtitles, captions, on-screen text, cartoon, illustration, drawing, painting, 3d render, cg, abstract background, gradient, color blocks, fluid colors, missing character";

/**
 * Detect if the current project / scene is a romance / love story
 */
export function isRomanceStory(text: string): boolean {
  const lower = (text || "").toLowerCase();
  const keywords = [
    "愛情", "戀愛", "浪漫", "romance", "love story", "情侶", "男友", "女友",
    "擁抱", "kiss", "kissing", "告白", "分開", "重逢", "等待", "想念",
    "墨香書屋", "雨夜", "書店", "bookstore", "rainy night"
  ];
  return keywords.some(k => lower.includes(k));
}
