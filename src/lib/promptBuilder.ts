// src/lib/promptBuilder.ts
// High-quality Prompt builder based on Agnes official best practices
// - Character description forced to the front 30% (Visual Anchors)
// - Separate templates for Image vs Video generation
// - Style-aware enhancement (fairy-tale / romance / cyberpunk)
// - Hard-cut / transition mode when consecutive scenes have different characters
// - Pure scenery / No character mandate templates & Negative Prompts

export interface CharacterBible {
  name: string;
  description: string; // Full appearance description (English preferred for model adherence)
}

/**
 * Standardized negative prompt for No-Character / Pure Scenery shots.
 * Strictly forbids any human, student, face, or crowd elements to ensure QC review passes.
 */
export const NO_CHARACTER_NEGATIVE_PROMPT =
  'person, human, female, male, girl, boy, student, students, female student, male student, schoolgirl, schoolboy, teenager, children, character, people, woman, man, face, crowd, figure, silhouette, anime girl, anime boy, standing person, walking person, body, avatar, pedestrians, passersby, crowd in background, group of students, humanoid, hands, limbs';

/**
 * Standard anti-defect negative prompt terms that prevent common AI image review failures
 * (such as abstract gradient backgrounds, blurry focus, compression artifacts, and poor anatomy).
 */
export const QUALITY_DEFECTS_NEGATIVE_PROMPT =
  'abstract background, gradient, blurry, out of focus, depth of field blur, plain background, solid color background, featureless background, low quality, worst quality, low resolution, bad anatomy, deformed, distorted, jpeg artifacts, compression artifacts, noisy, watermark, text, signature, username, logo, cropped, out of frame';

/**
 * Mandatory positive prompt instruction for No-Character / Pure Scenery scenes.
 */
export const NO_CHARACTER_MANDATE_PROMPT =
  '[CRITICAL PURE SCENERY / NO CHARACTER MANDATE]: 100% empty environmental scenery, architectural landscape, or object shot with ABSOLUTELY ZERO humans, ZERO students, ZERO people, ZERO characters, ZERO girls, ZERO boys, ZERO figures, completely vacant and deserted environment.';

/**
 * Check if the scene character field indicates no character/person present (e.g., "無", "冇", "無角色", "空鏡頭", "none", etc.)
 */
export function isNoChar(charStr?: string, promptStr?: string): boolean {
  if (!charStr && !promptStr) return true;
  const c = (charStr || "").trim().toLowerCase();
  const p = (promptStr || "").trim().toLowerCase();
  
  const noCharKeywords = [
    "", "無", "冇", "無角色", "無人", "空鏡", "空鏡頭", "空景", "無登場", "無登場角色",
    "none", "no character", "nobody", "no person", "no human", "no students", "no student",
    "null", "旁白", "narrator", "n/a", "na", "無人物", "風景", "純風景", "環境", "純環境",
    "純景", "景物", "靜物", "純景物", "純背景", "背景", "空無一人", "無人場景", "空鏡頭特寫",
    "no_character", "scenery", "pure scenery", "pure environment", "empty", "background",
    "environment", "landscape", "architecture", "vacant", "deserted"
  ];

  if (noCharKeywords.includes(c)) {
    return true;
  }

  if (
    c.includes("無角色") ||
    c.includes("no character") ||
    c.includes("no-character") ||
    c.includes("無登場") ||
    c.includes("純風景") ||
    c.includes("純背景") ||
    c.includes("無人物") ||
    c.includes("環境風景") ||
    c.includes("空鏡") ||
    c.includes("空景") ||
    c.includes("靜物") ||
    c.includes("無人") ||
    c.includes("zero people") ||
    c.includes("nobody")
  ) {
    return true;
  }

  if (
    p.includes("[pure scenery") ||
    p.includes("pure scenery") ||
    p.includes("no character") ||
    p.includes("no-character") ||
    p.includes("zero people") ||
    p.includes("absolutely no humans") ||
    p.includes("空無一人") ||
    p.includes("無登場角色") ||
    p.includes("純風景特寫")
  ) {
    return true;
  }

  return false;
}

/**
 * Sanitize prompt for No-Character scenes to eliminate or reduce confusing semantic weight (e.g. students, people).
 */
export function sanitizeNoCharPrompt(prompt: string): string {
  if (!prompt) return "";
  let clean = prompt;
  
  // Replace references to crowded or populated school areas with vacant equivalents
  clean = clean
    .replace(/學生們?/g, "空無一人的校園角落")
    .replace(/人群/g, "空曠環境")
    .replace(/同學/g, "課桌椅")
    .replace(/人物/g, "景物")
    .replace(/students?/gi, "empty desks")
    .replace(/people|crowd|person|pedestrians?/gi, "vacant space")
    .replace(/boy|girl|man|woman/gi, "scenery element");

  return clean;
}

/**
 * Build negative prompt based on whether scene is a No-Character scene.
 * Incorporates quality defect blockers (abstract background, gradient, blurry) by default.
 */
export function buildNegativePrompt(isNoCharacter: boolean = false, extraNegative?: string): string {
  let negative = QUALITY_DEFECTS_NEGATIVE_PROMPT;
  if (isNoCharacter) {
    negative = `${NO_CHARACTER_NEGATIVE_PROMPT}, ${negative}`;
  }
  if (extraNegative && extraNegative.trim()) {
    const extraTokens = extraNegative.split(',').map((t) => t.trim()).filter(Boolean);
    const existingTokens = negative.split(',').map((t) => t.trim().toLowerCase());
    const uniqueExtras = extraTokens.filter((t) => !existingTokens.includes(t.toLowerCase()));
    if (uniqueExtras.length > 0) {
      negative = `${negative}, ${uniqueExtras.join(', ')}`;
    }
  }
  return negative;
}

/**
 * Intelligent Scene-Specific Negative Prompt Generator.
 * Examines the selected scene's character, visual prompt, art style, and defect preventers
 * to automatically generate and return a comprehensive, customized negative prompt.
 */
export function generateSceneNegativePrompt(options: {
  character?: string;
  visualPrompt?: string;
  artStyle?: string;
  currentNegative?: string;
  isNoCharacter?: boolean;
}): string {
  const isNoCharScene = options.isNoCharacter !== undefined 
    ? options.isNoCharacter 
    : isNoChar(options.character, options.visualPrompt);

  const existing = options.currentNegative ? options.currentNegative.trim() : "";
  const baseTokens: string[] = [
    "abstract background",
    "gradient",
    "blurry",
    "out of focus",
    "depth of field blur",
    "low quality",
    "worst quality",
    "low resolution",
    "bad anatomy",
    "distorted",
    "jpeg artifacts",
    "compression artifacts",
    "noisy",
    "text",
    "watermark",
    "signature",
    "cropped",
    "out of frame"
  ];

  // Pure Scenery vs Character-specific terms
  if (isNoCharScene) {
    baseTokens.unshift(
      "person", "human", "female", "male", "girl", "boy", "student", "students",
      "female student", "male student", "schoolgirl", "schoolboy", "teenager", "children",
      "character", "people", "woman", "man", "face", "crowd", "figure", "silhouette",
      "anime girl", "anime boy", "standing person", "walking person", "body", "avatar",
      "pedestrians", "passersby", "group of students", "humanoid", "hands", "limbs",
      "plain background", "solid color background"
    );
  } else {
    // Character scene: prevent extra limbs, deformed hands, extra characters, cloning
    baseTokens.push(
      "deformed hands", "extra fingers", "missing fingers", "fused fingers", "extra limbs",
      "extra arms", "extra legs", "mutated limbs", "duplicate characters", "extra people",
      "cloned face", "multiple heads", "fused bodies", "ghost figures", "wrong character count"
    );

    // Gender-specific exclusion
    const textContext = `${options.character || ""} ${options.visualPrompt || ""}`.toLowerCase();
    const hasMale = /\b(man|men|boy|boys|male|gentleman|guy)\b/i.test(textContext) || /男/.test(textContext);
    const hasFemale = /\b(woman|women|girl|girls|female|lady)\b/i.test(textContext) || /女/.test(textContext);
    if (hasMale && !hasFemale) {
      baseTokens.push("female", "woman", "girl", "lady", "feminine", "womanly");
    } else if (hasFemale && !hasMale) {
      baseTokens.push("male", "man", "boy", "gentleman", "masculine", "beard", "facial hair");
    }
  }

  // Merge with existing negative prompt without duplicates
  const existingTerms = existing ? existing.split(",").map(t => t.trim().toLowerCase()).filter(Boolean) : [];
  const mergedTerms: string[] = [...existing.split(",").map(t => t.trim()).filter(Boolean)];

  for (const token of baseTokens) {
    if (!existingTerms.includes(token.toLowerCase())) {
      mergedTerms.push(token);
      existingTerms.push(token.toLowerCase());
    }
  }

  return mergedTerms.join(", ");
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
 * Returns true when characters are different people or different genders → must avoid morphing.
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

  // Explicitly different character names → hard cut
  if (cur && next && cur !== next) return true;

  // Gender keywords detection in character names
  const maleKeywords = ["男", "male", "man", "guy", "boy", "sir"];
  const femaleKeywords = ["女", "female", "woman", "girl", "lady", "madam"];

  const curIsMale = maleKeywords.some(k => cur.includes(k)) || currentGender === "male";
  const curIsFemale = femaleKeywords.some(k => cur.includes(k)) || currentGender === "female";
  const nextIsMale = maleKeywords.some(k => next.includes(k)) || nextGender === "male";
  const nextIsFemale = femaleKeywords.some(k => next.includes(k)) || nextGender === "female";

  if ((curIsMale && nextIsFemale) || (curIsFemale && nextIsMale)) {
    return true;
  }

  // Same name but different gender specs
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
 * Strong anti-morph instruction used when start-frame and end-frame are different people or when doing camera cuts.
 * Prevents the classic "man slowly turns into woman" artifact.
 */
export const HARD_CUT_INSTRUCTION =
  'Hard cut transition. Instant camera cutaway. Keep the exact same character identity, face, hair, gender, and clothing from the START FRAME throughout the entire clip. Do NOT morph, do NOT transform, do NOT change gender, do NOT blend faces. No face morphing, no body morphing, no gender change. Sudden camera cut only, strict single character identity preservation.';

/**
 * Build high-quality Image Prompt
 * Focus: details, composition, lighting, art style
 */
export function buildImagePrompt(options: {
  sceneDescription: string;
  characters?: string[];
  style?: PromptStyle;
  extra?: string;
  isNoCharacter?: boolean;
}): string {
  let prompt = (options.sceneDescription || '').trim();

  // If No-Character scene, sanitize prompt and add strict mandate
  if (options.isNoCharacter || isNoChar(options.characters?.[0], prompt)) {
    prompt = sanitizeNoCharPrompt(prompt);
    prompt = `${NO_CHARACTER_MANDATE_PROMPT} ${prompt}`;
  } else if (options.characters && options.characters.length > 0) {
    // 1. Character descriptions forced to the front
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
  isNoCharacter?: boolean;
}): string {
  let prompt = (options.sceneDescription || '').trim();

  // If No-Character scene, sanitize and add scenery motion mandate
  if (options.isNoCharacter || isNoChar(options.characters?.[0], prompt)) {
    prompt = sanitizeNoCharPrompt(prompt);
    prompt = `[PURE SCENERY / NO CHARACTER VIDEO MANDATE]: Environmental scenery camera movement. Absolutely zero people, zero students, zero characters. ${prompt}`;
  } else if (options.characters && options.characters.length > 0) {
    // 1. Character descriptions forced to the front
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
