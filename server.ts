import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import cors from "cors";
import helmet from "helmet";

const db = new Database('database.sqlite');

// Initialize database tables
db.exec(`
  CREATE TABLE IF NOT EXISTS ai_results (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    source TEXT,
    logo TEXT,
    currentMonthReturn REAL,
    yearCumulativeReturn REAL,
    maxDrawdown REAL,
    totalTradesMonth REAL,
    winRate REAL,
    equityData TEXT,
    status TEXT,
    trackingUrl TEXT,
    lastSync TEXT,
    isLive INTEGER
  );

  CREATE TABLE IF NOT EXISTS community_updates (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    subtitle TEXT,
    content TEXT,
    date TEXT,
    type TEXT,
    imageUrl TEXT,
    isImportant INTEGER,
    externalLink TEXT,
    externalLinkText TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS daily_analysis (
    id TEXT PRIMARY KEY,
    date TEXT,
    text TEXT
  );

  CREATE TABLE IF NOT EXISTS social_proofs (
    id TEXT PRIMARY KEY,
    memberName TEXT,
    avatar TEXT,
    result TEXT,
    testimonial TEXT,
    iaName TEXT,
    iaId TEXT,
    date TEXT,
    imageUrl TEXT,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  // Banners
  db.exec(`
    CREATE TABLE IF NOT EXISTS banners (
      id TEXT PRIMARY KEY,
      brokerName TEXT,
      offer TEXT,
      badge TEXT,
      imageUrl TEXT,
      ctaUrl TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Config (Generic settings like footer_banner)
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      id TEXT PRIMARY KEY,
      value TEXT,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // News AI Cache
  db.exec(`
    CREATE TABLE IF NOT EXISTS news_ai_cache (
      id TEXT PRIMARY KEY,
      fullContent TEXT,
      summary TEXT,
      keyPoints TEXT,
      recommendation TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(helmet({
    contentSecurityPolicy: false, // For development and iFrame compatibility
  }));
  app.use(cors());
  app.use(express.json());

  // API Routes
  
  // AI Results
  app.get("/api/ai-results", (req, res) => {
    const results = db.prepare("SELECT * FROM ai_results").all();
    res.json(results.map((r: any) => ({
      ...r,
      equityData: JSON.parse(r.equityData || '[]'),
      isLive: Boolean(r.isLive)
    })));
  });

  app.post("/api/ai-results", (req, res) => {
    const ai = req.body;
    db.prepare(`
      INSERT OR REPLACE INTO ai_results 
      (id, name, source, logo, currentMonthReturn, yearCumulativeReturn, maxDrawdown, totalTradesMonth, winRate, equityData, status, trackingUrl, lastSync, isLive)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ai.id, ai.name, ai.source, ai.logo, ai.currentMonthReturn, ai.yearCumulativeReturn, 
      ai.maxDrawdown, ai.totalTradesMonth, ai.winRate, JSON.stringify(ai.equityData || []), 
      ai.status, ai.trackingUrl, ai.lastSync, ai.isLive ? 1 : 0
    );
    res.json({ success: true });
  });

  app.delete("/api/ai-results/:id", (req, res) => {
    db.prepare("DELETE FROM ai_results WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Community Updates
  app.get("/api/community", (req, res) => {
    const updates = db.prepare("SELECT * FROM community_updates ORDER BY createdAt DESC").all();
    res.json(updates.map((u: any) => ({
      ...u,
      isImportant: Boolean(u.isImportant)
    })));
  });

  app.post("/api/community", (req, res) => {
    const update = req.body;
    db.prepare(`
      INSERT OR REPLACE INTO community_updates 
      (id, title, subtitle, content, date, type, imageUrl, isImportant, externalLink, externalLinkText)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      update.id, update.title, update.subtitle, update.content, update.date, 
      update.type, update.imageUrl, update.isImportant ? 1 : 0, 
      update.externalLink, update.externalLinkText
    );
    res.json({ success: true });
  });

  app.delete("/api/community/:id", (req, res) => {
    db.prepare("DELETE FROM community_updates WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Daily Analysis
  app.get("/api/analysis", (req, res) => {
    const analysis = db.prepare("SELECT * FROM daily_analysis WHERE id = 'current'").get();
    res.json(analysis || null);
  });

  app.post("/api/analysis", (req, res) => {
    const { text, date } = req.body;
    db.prepare("INSERT OR REPLACE INTO daily_analysis (id, date, text) VALUES ('current', ?, ?)")
      .run(date, text);
    res.json({ success: true });
  });

  // Social Proofs
  app.get("/api/social-proofs", (req, res) => {
    const proofs = db.prepare("SELECT * FROM social_proofs ORDER BY createdAt DESC").all();
    res.json(proofs);
  });

  app.post("/api/social-proofs", (req, res) => {
    const proof = req.body;
    db.prepare(`
      INSERT OR REPLACE INTO social_proofs 
      (id, memberName, avatar, result, testimonial, iaName, iaId, date, imageUrl)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      proof.id, proof.memberName, proof.avatar, proof.result, proof.testimonial, 
      proof.iaName, proof.iaId, proof.date, proof.imageUrl
    );
    res.json({ success: true });
  });

  app.delete("/api/social-proofs/:id", (req, res) => {
    db.prepare("DELETE FROM social_proofs WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // Vite middleware for development
  // Banners
app.get('/api/banners', (req, res) => {
  const banners = db.prepare('SELECT * FROM banners ORDER BY createdAt DESC').all();
  res.json(banners);
});

app.post('/api/banners', (req, res) => {
  const { id, brokerName, offer, badge, imageUrl, ctaUrl } = req.body;
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO banners (id, brokerName, offer, badge, imageUrl, ctaUrl)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, brokerName, offer, badge, imageUrl, ctaUrl);
  res.json({ success: true });
});

app.delete('/api/banners/:id', (req, res) => {
  db.prepare('DELETE FROM banners WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Config
app.get('/api/config/:id', (req, res) => {
  const config = db.prepare('SELECT value FROM config WHERE id = ?').get(req.params.id) as any;
  res.json(config ? JSON.parse(config.value) : null);
});

app.post('/api/config/:id', (req, res) => {
  const stmt = db.prepare('INSERT OR REPLACE INTO config (id, value) VALUES (?, ?)');
  stmt.run(req.params.id, JSON.stringify(req.body));
  res.json({ success: true });
});

// News AI Cache
app.get('/api/news-cache/:id', (req, res) => {
  const cache = db.prepare('SELECT * FROM news_ai_cache WHERE id = ?').get(req.params.id);
  if (cache) {
    (cache as any).keyPoints = JSON.parse((cache as any).keyPoints);
  }
  res.json(cache);
});

app.post('/api/news-cache', (req, res) => {
  const { id, fullContent, summary, keyPoints, recommendation } = req.body;
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO news_ai_cache (id, fullContent, summary, keyPoints, recommendation)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(id, fullContent, summary, JSON.stringify(keyPoints), recommendation);
  res.json({ success: true });
});

if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.all('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
