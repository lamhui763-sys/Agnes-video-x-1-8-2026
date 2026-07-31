export const STYLE_PRESETS = [
  {
    name: "🎬 電影感 (Cinematic)",
    value: "cinematic",
    prompt: "A high-quality 8k resolution cinematic movie shot, dramatic moody lighting, deep shadows, rich color grading, shallow depth of field, anamorphic lens flare, photorealistic, film grain texture, Kodak Portra color palette, shot on 35mm lens."
  },
  {
    name: "🌧️ 雨夜愛情電影感 (Romance Cinematic - 墨香書屋 style)",
    value: "romance-cinematic",
    prompt: "Cinematic romance short film aesthetic inspired by rainy night bookstore. Warm amber interior light contrasted with cool blue rain and neon exterior. Soft rim-light on characters, shallow depth of field, film grain, Kodak Portra palette, 35mm lens, intimate emotional atmosphere, completely clean video no subtitles no text no watermark."
  },
  {
    name: "🌿 童話故事書風 (Fairy Tale Storybook)",
    value: "fairy-tale",
    prompt: "Storybook style, Watercolor and ink textures, Whimsical, Soft pastel color palette, Golden hour lighting, ethereal mood, highly detailed environment, cinematic depth of field, soft volumetric lighting, masterpiece quality, dreamy atmosphere"
  },
  {
    name: "🌸 動漫風 (Anime)",
    value: "anime",
    prompt: "Stunning high-quality anime key visual style, vibrant colors, beautifully detailed cel-shading, Kyoto Animation style, soft fantasy lighting, emotional atmosphere, 4k."
  },
  {
    name: "📸 寫實風 (Photorealistic)",
    value: "photorealistic",
    prompt: "An ultra-detailed 35mm photorealistic film portrait, natural soft studio lighting, sharp focus, rich organic textures, masterpiece, award-winning photography."
  },
  {
    name: "👾 美式寫實漫畫 (Cyberpunk Comic)",
    value: "comic",
    prompt: "Detailed gritty American cyberpunk comic book illustration style, bold ink lines, neon color palette, high contrast, atmospheric shadows."
  },
  {
    name: "🎨 水彩插畫 (Watercolor)",
    value: "watercolor",
    prompt: "Vibrant custom watercolor illustration style, soft textured paint splatters, delicate washes of hand-painted pigment, beautiful ink outlines, whimsical artistic details."
  },
  {
    name: "🏮 中國古風水墨 (Ink Wash)",
    value: "ink",
    prompt: "Beautiful traditional Chinese ink wash painting, masterfully rendered brushstrokes, soft watercolor bleeding, atmospheric mist, elegant and poetic composition."
  },
  {
    name: "🧸 可愛3D黏土風 (Claymation)",
    value: "clay",
    prompt: "Adorable 3D claymation stop-motion style, rich hand-sculpted clay textures, soft warm studio illumination, miniature bento-box scale, cute character proportions."
  },
  {
    name: "🚀 科幻未來 (Sci-Fi Future)",
    value: "scifi",
    prompt: "Sleek high-tech futuristic sci-fi scene, glowing blue holographic interfaces, chrome and carbon fiber textures, sterile cool-toned lighting, cinematic masterpiece."
  }
];

export const NEGATIVE_PRESETS = [
  {
    name: "🤖 AI 智慧分析生成",
    value: "ai-auto"
  },
  {
    name: "🚫 基礎畫質提升 (通用)",
    value: "general",
    prompt: "blurry, low resolution, low quality, worst quality, jpeg artifacts, noise, grain, compression artifacts, cropped, out of frame"
  },
  {
    name: "🎬 寫實防異變 (寫實/電影)",
    value: "realistic",
    prompt: "blurry, low quality, worst quality, deformed hands, extra fingers, fused fingers, missing fingers, mutated hands, bad anatomy, bad proportions, extra limbs, missing limbs, distorted face, asymmetrical eyes, cartoon, illustration, drawing, painting, 3d render, cg"
  },
  {
    name: "🌸 二次元極淨化 (動漫)",
    value: "anime",
    prompt: "blurry, low quality, worst quality, realistic, photorealistic, 3d, gritty, sketch, monochrome, deformed hands, extra fingers, text, watermark, logo"
  },
  {
    name: "🎨 藝術手繪去雜 (水彩/古風)",
    value: "artistic",
    prompt: "photorealistic, photograph, 3d render, cg, blurry, low resolution, low quality, deformed, text, watermark, signature"
  },
  {
    name: "🧸 3D 黏土極平滑 (3D/黏土)",
    value: "clay",
    prompt: "blurry, low resolution, low quality, photorealistic, realistic, flat color, sketch, lineart, text, watermark"
  },
  {
    name: "🔇 去字去水印 (純淨版)",
    value: "pure",
    prompt: "text, watermark, signature, username, logo, title, subtitles, border, frame, timestamp"
  }
];
