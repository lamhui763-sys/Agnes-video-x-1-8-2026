Temporary note: server.ts was truncated by accident. Please revert main to commit 0e4e6fa7ea72250a8f840d7f956488d3d3c8100e on GitHub UI or locally, then re-apply only the PORT fix.

Critical fix needed in server.ts:

1. Change:
   const PORT = 3000;
to:
   const PORT = Number(process.env.PORT) || 3000;

2. Add after const app = express();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    time: new Date().toISOString(),
    uptime: process.uptime(),
    port: Number(process.env.PORT) || 3000,
    message: "Toonflow server is alive",
  });
});

3. Change the listen log to:
app.listen(PORT, "0.0.0.0", () => {
  console.log("[Toonflow] Listening on 0.0.0.0:" + PORT + " (Railway PORT=" + (process.env.PORT || "unset") + ")");
});
