import os

with open('server.ts', 'r', encoding='utf-8') as f:
    content = f.read()

endpoint_code = """
app.get("/api/experience-summary", (req, res) => {
  const sceneId = req.query.sceneId as string;
  if (!sceneId) return res.json({ failures: [] });
  
  const logPath = path.join(process.cwd(), "experience_library.jsonl");
  if (!fs.existsSync(logPath)) return res.json({ failures: [] });

  try {
    const lines = fs.readFileSync(logPath, "utf-8").split("\\n");
    const failures = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.sceneId === sceneId && !entry.passed) {
           failures.push(entry.failureCategory || entry.errorName || "unknown");
        }
      } catch (e) {}
    }
    res.json({ failures });
  } catch (err) {
    res.json({ failures: [] });
  }
});

// Toonflow AI Novel Generation Endpoint
"""

content = content.replace("// Toonflow AI Novel Generation Endpoint\n", endpoint_code)

with open('server.ts', 'w', encoding='utf-8') as f:
    f.write(content)
