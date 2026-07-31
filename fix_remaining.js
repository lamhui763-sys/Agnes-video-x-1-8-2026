import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf-8');

content = content.replace(/const { scene: generatedData } = await res\.json\(\);/g, `const textRes = await res.text();
      let generatedData;
      try {
        generatedData = JSON.parse(textRes).scene;
      } catch(e) {
        throw new Error("伺服器回傳格式錯誤，請稍後再試。");
      }`);

content = content.replace(/const data = await res\.json\(\);/g, `const textRes = await res.text();
      let data: any;
      try {
        data = JSON.parse(textRes);
      } catch(e) {
        throw new Error("伺服器回傳格式錯誤，請稍後再試。");
      }`);

fs.writeFileSync('src/App.tsx', content);
