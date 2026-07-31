import fs from 'fs';
let code = fs.readFileSync('src/App.tsx', 'utf8');

const additionalPrompt = " (Dynamic cinematic camera movements: fast cuts, slow-motion replays, zoom in/out, panning. First-person fan perspective POV. Live celebratory atmosphere.)";

code = code.replace(
  /PURE CINEMATIC VISUALS\. Style:/g,
  `PURE CINEMATIC VISUALS.${additionalPrompt} Style:`
);

fs.writeFileSync('src/App.tsx', code);
