import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf-8');

content = content.replace(/if \(!res\.ok\) \{\s+const errData = await res\.json\(\);\s+throw new Error\((.*?)\);\s+\}/g, (match, errorThrow) => {
    return `if (!res.ok) {
        const errText = await res.text().catch(() => "");
        let errData: any = {};
        try { errData = JSON.parse(errText); } catch(e) {}
        throw new Error(${errorThrow});
      }`;
});

fs.writeFileSync('src/App.tsx', content);
