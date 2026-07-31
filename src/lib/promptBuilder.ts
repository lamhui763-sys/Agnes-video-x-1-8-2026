// src/lib/promptBuilder.ts
// High-quality Prompt builder based on Agnes official best practices
// - Character description forced to the front 30% (Visual Anchors)
// - Separate templates for Image vs Video generation
// - Style-aware enhancement (fairy-tale / romance / cyberpunk)
// - Hard-cut / transition mode when consecutive scenes have different characters

export interface CharacterBible {
  name: string;
  description: string; // Full appearance description (English preferred for model adherence)
}

/**
 * Check if the scene character field indicates no character/person present (e.g., "無", "冇", "無角色", "none", etc.)
 */
export function isNoChar(charStr?: string): boolean {
  if (!charStr) return true;
  const c = charStr.trim().toLowerCase();
  return (
    c === "" ||
    c === "無" ||
    c === "冇" ||
    c === "無角色" ||
    c === "無人" ||
    c === "none" ||
    c === "no character" ||
    c === "nobody" ||
    c === "旁白" ||
    c === "narrator" ||
    c === "n/a" ||
    c === "無人物"
  );
}

export const CHARACTER_BIBLES: Record<string, CharacterBible> = {
  Ren: {
    name: 'Ren',
    description:
      'Ren, a young man with messy silver-gray short hair, light blue eyes, a bleeding scrape on his left cheek, wearing a dark gray tactical trench coat with forehead HUD goggles',
  },
  'Old Joe': {
    name: 'Old Joe',
    description:
      'Old Joe, a tough cyberpunk man with graying short hair, a glowing red mechanical right eye, heavy stubble, deep facial scars, wearing a worn leather jacket and a heavy mechanical right arm',
  },
  // Future fairy-tale characters can be added here
};

export type PromptStyle = 'fairy-tale' | 'romance' | 'cyberpunk' | 'default';

/**
 * Force character descriptions to the very front of the prompt
 * (Agnes recommended Visual Anchors - first ~30% of the prompt)
 */
export function prependCharacterDescription(
  basePrompt: string,
  characterNames: string[] = []
): string {
  const descriptions = characterNames
    .map((name) => CHARACTER_BIBLES[name]?.description)
    .filter(Boolean);

  if (descriptions.length === 0) return basePrompt;

  const characterBlock = descriptions.join('. ');
  return `${characterBlock}. ${basePrompt}`;
}

/**
 * Decide whether two consecutive scenes should use a HARD CUT (transition)
 * instead of smooth morph (continuous).
 *
 * Returns true when characters are different people → must avoid morphing.
 */
export function shouldUseHardCut(
  currentCharacter?: string,
  nextCharacter?: string,
  currentGender?: string,
  nextGender?: string
): boolean {
  const cur = (currentCharacter || '').trim().toLowerCase();
  const next = (nextCharacter || '').trim().toLowerCase();

  // No next scene → no need for cut
  if (!next) return false;

  // Different character names → hard cut
  if (cur && next && cur !== next) return true;

  // Same name but different gender → still hard cut (prevents woman→man morph)
  if (
    currentGender &&
    nextGender &&
    currentGender !== nextGender &&
    (currentGender === 'male' || currentGender === 'female') &&
    (nextGender === 'male' || nextGender === 'female')
  ) {
    return true;
  }

  return false;
}

/**
 * Strong anti-morph instruction used when start-frame and end-frame are different people.
 * Prevents the classic "woman slowly turns into man" artifact.
 */
export const HARD_CUT_INSTRUCTION =
  'Hard cut transition. Abrupt camera change. Keep the exact same character identity, face, hair, gender and clothing from the START FRAME throughout the entire clip. Do NOT morph, do NOT transform, do NOT change gender, do NOT blend faces. No face morphing, no body morphing, no gender change. Sudden cut only.';

/**
 * Build high-quality Image Prompt
 * Focus: details, composition, lighting, art style
 */
export function buildImagePrompt(options: {
  sceneDescription: string;
  characters?: string[];
  style?: PromptStyle;
  extra?: string;
}): string {
  let prompt = (options.sceneDescription || '').trim();

  // 1. Character descriptions forced to the front
  if (options.characters && options.characters.length > 0) {
    prompt = prependCharacterDescription(prompt, options.characters);
  }

  // 2. Style enhancement
  switch (options.style) {
    case 'fairy-tale':
      prompt +=
        ', Storybook style, Watercolor and ink textures, Whimsical, Soft pastel color palette, Golden hour lighting, ethereal mood, highly detailed environment, cinematic depth of field, soft volumetric lighting, masterpiece quality';
      break;
    case 'romance':
      prompt +=
        ', Cinematic romance style inspired by rainy night bookstore, warm tungsten lighting mixed with cool rim light, shallow depth of field, film grain, Kodak Portra color palette, emotional atmosphere, highly detailed, masterpiece';
      break;
    case 'cyberpunk':
      prompt +=
        ', Cyberpunk aesthetic, neon lights, rainy night, high contrast, detailed mechanical elements, cinematic lighting, highly detailed';
      break;
    default:
      prompt += ', highly detailed, cinematic lighting, masterpiece quality';
  }

  // 3. Common clean ending
  prompt +=
    ', clean composition, no text, no subtitles, no watermark, no logo, no signature';

  if (options.extra) {
    prompt += `, ${options.extra}`;
  }

  return prompt;
}

/**
 * Build high-quality Video Prompt
 * Focus: camera movement, micro-actions, motion smoothness
 *
 * When isHardCut = true (different characters between start/end frames),
 * injects strong anti-morph instructions so Agnes does not blend people.
 */
export function buildVideoPrompt(options: {
  sceneDescription: string;
  characters?: string[];
  cameraMotion?: string;
  style?: PromptStyle;
  extra?: string;
  isHardCut?: boolean;
}): string {
  let prompt = (options.sceneDescription || '').trim();

  // 1. Character descriptions forced to the front
  if (options.characters && options.characters.length > 0) {
    prompt = prependCharacterDescription(prompt, options.characters);
  }

  // 2. Camera motion
  if (options.cameraMotion) {
    prompt += `. ${options.cameraMotion}`;
  }

  // 3. Style + motion related
  switch (options.style) {
    case 'fairy-tale':
      prompt +=
        ', dreamy motion, gentle movement, Storybook style, Whimsical atmosphere, soft lighting';
      break;
    case 'romance':
      prompt +=
        ', slow emotional camera movement, cinematic romance, subtle film grain, warm and cool lighting contrast';
      break;
    case 'cyberpunk':
      prompt +=
        ', dynamic cyberpunk motion, neon reflections, rainy atmosphere, cinematic';
      break;
    default:
      prompt += ', smooth cinematic motion';
  }

  // 4. Hard-cut protection (prevents woman→man morph when start/end frames differ)
  if (options.isHardCut) {
    prompt += `. ${HARD_CUT_INSTRUCTION}`;
  }

  // 5. Video-specific ending
  prompt +=
    ', smooth rendering, high-fidelity character details, no sudden jumps, no morphing, clean video, no text, no subtitles, no watermark';

  if (options.extra) {
    prompt += `, ${options.extra}`;
  }

  return prompt;
}
