import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import cors from "cors";
import helmet from "helmet";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import fs from "fs";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import OpenAI from "openai";
import { randomUUID } from "node:crypto";

// Load Firebase Config safely
let firebaseConfig: any = {};
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {
  console.error("[Firebase] Error reading config file:", e);
}

// Initialize Firebase Admin
let db: any = null;
let messaging: any = null;
let sqliteDb: any = null;

async function initFirebase() {
  try {
    const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');
    let serviceAccount: any = null;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        
        // Fix for private_key formatting issues common in some environments
        if (serviceAccount && serviceAccount.private_key) {
          serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        
        console.log(`[Firebase] Initializing from environment variable...`);
      } catch (e) {
        console.error("[Firebase] Error parsing FIREBASE_SERVICE_ACCOUNT env var. Trying file fallback...");
      }
    }
    
    if (!serviceAccount && fs.existsSync(serviceAccountPath)) {
      try {
        console.log(`[Firebase] Service account file found at ${serviceAccountPath}. Reading...`);
        const content = fs.readFileSync(serviceAccountPath, 'utf8');
        serviceAccount = JSON.parse(content);
        
        // Advanced Fix for private_key formatting issues common in some Node/OpenSSL versions
        if (serviceAccount && serviceAccount.private_key) {
          try {
            // Remove backslash+n literals and normalize newlines
            let key = serviceAccount.private_key.replace(/\\n/g, '\n');
            
            // If it's a single line with spaces instead of newlines (common in some env deployments), fix it
            if (!key.includes('\n') && key.includes(' ')) {
               key = key.replace(/ /g, '\n').replace(/BEGIN\nPRIVATE\nKEY/g, 'BEGIN PRIVATE KEY').replace(/END\nPRIVATE\nKEY/g, 'END PRIVATE KEY');
            }

            const lines = key.split('\n').filter(l => l.trim().length > 0);
            const bodyLines = lines.filter(l => !l.includes('-----'));
            const body = bodyLines.join('').replace(/[^A-Za-z0-9+/=]/g, '');
            
            // Re-wrap to PEM standard (64 chars per line)
            // This ensures gRPC / OpenSSL 3.x can parse it without "UNSUPPORTED DECODER" error
            const wrapped = `-----BEGIN PRIVATE KEY-----\n${(body.match(/.{1,64}/g) || []).join('\n')}\n-----END PRIVATE KEY-----\n`;
            serviceAccount.private_key = wrapped;
            console.log("[Firebase] Private key standardized for OpenSSL 3 decoding.");
          } catch (keyErr: any) {
            console.warn("[Firebase] Key cleaning failed, using raw key:", keyErr.message);
          }
        }
        
        console.log(`[Firebase] Initializing with project ${serviceAccount.project_id}...`);
      } catch (e: any) {
        console.error("[Firebase] Error parsing service account file:", e.message);
      }
    }
    
    if (!serviceAccount) {
      console.warn(`[Firebase] Service account not found in ENV or at ${serviceAccountPath}`);
    }

    let app;
    if (serviceAccount) {
      try {
        app = initializeApp({
          credential: cert(serviceAccount)
        });
        console.log("[Firebase] Admin SDK initialized successfully with credentials.");
      } catch (e: any) {
        if (e.code === 'app/duplicate-app') {
          const { getApp } = await import("firebase-admin/app");
          app = getApp();
        } else {
          console.error("[Firebase] Initialization crash:", e.message);
          throw e;
        }
      }
    } else {
      console.warn("[Firebase] Initializing without credentials (fallback).");
      app = initializeApp({
        projectId: firebaseConfig.projectId
      });
    }
    
    const configDbId = firebaseConfig.firestoreDatabaseId;
    db = getFirestore(app, configDbId || undefined);
    messaging = getMessaging(app);
    
    // Verificação de conexão imediata
    db.collection('health_check').limit(1).get().catch((err: any) => {
      console.warn("[Firebase] Health check failed:", err.message);
      if (err.message.includes('UNAUTHENTICATED') || err.message.includes('PERMISSION_DENIED')) {
        console.warn("[Firebase] Disabling Firebase due to invalid credentials.");
        db = null;
        messaging = null;
      }
    });
  } catch (error) {
    console.error("Error initializing Firebase Admin:", error);
  }
}

initFirebase();

// Function to handle one-time migration from SQLite to Firestore
async function migrateIfNeeded() {
  if (!db || !sqliteDb) return;

  console.log("Checking migration to Firestore...");
  
  try {
    // Migration: AI Results
    try {
      const results = sqliteDb.prepare("SELECT * FROM ai_results").all();
      for (const r of results as any[]) {
        try {
          await db.collection('ai_results').doc(r.id).set({
            ...r,
            equityData: JSON.parse(r.equityData || '[]'),
            isLive: Boolean(r.isLive)
          }, { merge: true });
        } catch (innerErr) {
          // Silent skip
        }
      }
    } catch (e) {}

    // Migration: Community Updates
    try {
      const community = sqliteDb.prepare("SELECT * FROM community_updates").all();
      for (const u of community as any[]) {
        try {
          await db.collection('updates').doc(u.id).set({
            ...u,
            isImportant: Boolean(u.isImportant)
          }, { merge: true });
        } catch (innerErr) {}
      }
    } catch (e) {}
    
    console.log("Migration task ended.");
  } catch (err) {
    console.error("Migration fatal error:", err);
  }
}

async function startServer() {
  const app = express();
  // Force 3000 as per AI Studio instructions, but honor PORT for external deployments like Railway
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // Global error handlers to prevent silent crashes
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('[Process] Uncaught Exception:', err);
  });

  try {
    // Initialize SQLite for persistence fallback
    const sqlitePath = path.join(process.cwd(), 'database.sqlite');
    function createDb() {
      try {
        return new Database(sqlitePath);
      } catch (err: any) {
        console.error("[SQLite] Failed to open database:", err.message);
        if (err.message.includes('malformed') || err.message.includes('corrupt')) {
          console.warn("[SQLite] Database is corrupt. Deleting and starting fresh...");
          try {
            if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
            return new Database(sqlitePath);
          } catch (e: any) {
            console.error("[SQLite] Hard failure, using in-memory DB:", e.message);
            return new Database(':memory:');
          }
        } else {
          console.warn("[SQLite] Falling back to in-memory DB.");
          return new Database(':memory:');
        }
      }
    }

    sqliteDb = createDb();

  // Create tables if they don't exist
  try {
    const initSql = `
      CREATE TABLE IF NOT EXISTS community_updates (
        id TEXT PRIMARY KEY,
        title TEXT,
        description TEXT,
        date TEXT,
        isImportant INTEGER,
        createdAt TEXT
      );
      CREATE TABLE IF NOT EXISTS ai_results (
        id TEXT PRIMARY KEY,
        name TEXT,
        source TEXT,
        logo TEXT,
        dailyReturn REAL,
        weeklyReturn REAL,
        currentMonthReturn REAL,
        yearCumulativeReturn REAL,
        winRate REAL,
        totalTradesMonth INTEGER,
        maxDrawdown REAL,
        equityData TEXT,
        status TEXT,
        lastSync TEXT,
        isLive INTEGER,
        trackingUrl TEXT
      );
      CREATE TABLE IF NOT EXISTS daily_analysis (
        id TEXT PRIMARY KEY,
        text TEXT,
        date TEXT
      );
      CREATE TABLE IF NOT EXISTS banners (
        id TEXT PRIMARY KEY,
        title TEXT,
        content TEXT,
        type TEXT,
        isActive INTEGER
      );
      CREATE TABLE IF NOT EXISTS config (
        id TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE IF NOT EXISTS news_ai_cache (
        id TEXT PRIMARY KEY,
        title TEXT,
        content TEXT,
        keyPoints TEXT,
        impact TEXT,
        sentiment TEXT,
        createdAt TEXT
      );
      CREATE TABLE IF NOT EXISTS fcm_tokens (
        token TEXT PRIMARY KEY,
        userId TEXT,
        updatedAt TEXT
      );
    `;
    
    try {
      sqliteDb.exec(initSql);
    } catch (e: any) {
      if (e.message.includes('malformed')) {
        console.warn("[SQLite] Exec failed due to malformation. Forcing reset.");
        sqliteDb.close();
        if (fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
        sqliteDb = new Database(sqlitePath);
        sqliteDb.exec(initSql);
      } else {
        throw e;
      }
    }

    // Clean up duplicates if any
    try {
      sqliteDb.prepare("DELETE FROM ai_results WHERE id NOT IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER(PARTITION BY name, source ORDER BY id) as rn FROM ai_results) WHERE rn = 1)").run();
    } catch (e: any) {}
  } catch (err: any) {
    console.error("[SQLite] Error during table creation:", err.message);
  }

  // Run migration if snapshot exists - non-blocking
  if (db) {
    migrateIfNeeded().catch(e => console.error("[Migration] Non-blocking migration failed:", e));
  }

  app.use(helmet({
    contentSecurityPolicy: false, 
  }));
  app.use(cors());
  app.use(express.json());

  // Middleware to ensure database is ready
  app.use((req, res, next) => {
    if (req.path.startsWith('/api') && !sqliteDb && req.path !== '/api/health') {
      return res.status(503).json({ error: "System starting up..." });
    }
    next();
  });

  // Health Check
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      firebase: db ? "connected" : "unavailable",
      sqlite: sqliteDb ? "connected" : "failed"
    });
  });

  // AI Results
  app.get("/api/ai-results", async (req, res) => {
    try {
      let finalResults: any[] = [];
      
      if (db) {
        try {
          const snapshot = await db.collection('ai_results').get();
          if (!snapshot.empty) {
            finalResults = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          }
        } catch (fErr) {
          console.warn("[Firestore] Results fetch failed, using SQLite.");
        }
      }
      
      if (finalResults.length === 0) {
        const results = sqliteDb.prepare("SELECT * FROM ai_results").all();
        finalResults = results.map((r: any) => ({
          ...r,
          equityData: JSON.parse(r.equityData || '[]'),
          isLive: Boolean(r.isLive)
        }));
      }

      // Final safety de-duplication by Name + Source
      const seen = new Set();
      const uniqueResults = finalResults.filter(r => {
        const key = `${r.name}-${r.source}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      res.json(uniqueResults);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post("/api/ai-results", async (req, res) => {
    try {
      const data = req.body;
      // Save local
      sqliteDb.prepare("REPLACE INTO ai_results (id, name, source, logo, dailyReturn, weeklyReturn, currentMonthReturn, yearCumulativeReturn, winRate, totalTradesMonth, maxDrawdown, equityData, status, lastSync, isLive, trackingUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(data.id, data.name, data.source, data.logo, data.dailyReturn, data.weeklyReturn, data.currentMonthReturn, data.yearCumulativeReturn, data.winRate, data.totalTradesMonth, data.maxDrawdown, JSON.stringify(data.equityData), data.status, data.lastSync, data.isLive ? 1 : 0, data.trackingUrl);
      
      if (db) {
        try {
          await db.collection('ai_results').doc(data.id).set(data);
        } catch (fErr) {
          console.warn("[Firestore] AI Result write failed:", fErr.message);
        }
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.delete("/api/ai-results/:id", async (req, res) => {
    try {
      sqliteDb.prepare("DELETE FROM ai_results WHERE id = ?").run(req.params.id);
      if (db) {
        try {
          await db.collection('ai_results').doc(req.params.id).delete();
        } catch (fErr) {
          console.warn("[Firestore] AI Result delete failed:", fErr.message);
        }
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Community Updates
  app.get("/api/community", async (req, res) => {
    try {
      if (db) {
        const snapshot = await db.collection('updates').orderBy('createdAt', 'desc').get();
        const updates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return res.json(updates);
      }
      throw new Error("No DB");
    } catch (err) {
      const updates = sqliteDb.prepare("SELECT * FROM community_updates ORDER BY createdAt DESC").all();
      res.json(updates.map((u: any) => ({ ...u, isImportant: Boolean(u.isImportant) })));
    }
  });

  app.post("/api/community", async (req, res) => {
    try {
      const id = randomUUID();
      const updateData = {
        ...req.body,
        id,
        createdAt: new Date().toISOString()
      };

      // Save to SQLite
      sqliteDb.prepare("INSERT INTO community_updates (id, title, description, date, isImportant, createdAt) VALUES (?, ?, ?, ?, ?, ?)")
        .run(id, updateData.title, updateData.description, updateData.date, updateData.isImportant ? 1 : 0, updateData.createdAt);

      if (db) {
        try {
          await db.collection('updates').doc(id).set(updateData);
        } catch (fErr) {
          console.warn("[Firestore] Write failed:", fErr.message);
        }
      }
      res.json({ success: true, id });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.delete("/api/community/:id", async (req, res) => {
    try {
      sqliteDb.prepare("DELETE FROM community_updates WHERE id = ?").run(req.params.id);
      if (db) {
        try {
          await db.collection('updates').doc(req.params.id).delete();
        } catch (fErr) {
          console.warn("[Firestore] Update delete failed:", fErr.message);
        }
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Daily Analysis
  app.get("/api/analysis", async (req, res) => {
    try {
      if (db) {
        const doc = await db.collection('analysis').doc('current').get();
        if (doc.exists) return res.json(doc.data());
      }
      throw new Error("No Firestore analysis");
    } catch (err) {
      const row = sqliteDb.prepare("SELECT * FROM daily_analysis WHERE id = 'current'").get();
      res.json(row || null);
    }
  });

  app.post("/api/analysis", async (req, res) => {
    try {
      const { text, date } = req.body;
      sqliteDb.prepare("REPLACE INTO daily_analysis (id, text, date) VALUES ('current', ?, ?)")
        .run(text, date);
        
      if (db) {
        try {
          await db.collection('analysis').doc('current').set({ text, date });
        } catch (fErr) {
          console.warn("[Firestore] Analysis write failed:", fErr.message);
        }
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Config
  app.get('/api/config/:id', async (req, res) => {
    try {
      if (db) {
        const doc = await db.collection('config').doc(req.params.id).get();
        if (doc.exists) return res.json(doc.data());
      }
      throw new Error("No Firestore config");
    } catch (err) {
      const row = sqliteDb.prepare("SELECT value FROM config WHERE id = ?").get(req.params.id);
      res.json(row ? JSON.parse(row.value) : null);
    }
  });

  app.post('/api/config/:id', async (req, res) => {
    try {
      sqliteDb.prepare("REPLACE INTO config (id, value) VALUES (?, ?)").run(req.params.id, JSON.stringify(req.body));
      if (db) {
        try {
          await db.collection('config').doc(req.params.id).set(req.body);
        } catch (fErr) {
          console.warn("[Firestore] Config write failed:", fErr.message);
        }
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // News AI Cache
  app.get('/api/news-cache', async (req, res) => {
    try {
      const id = req.query.id as string;
      if (!id) return res.status(400).json({ error: "Missing id" });
      
      if (db) {
        const doc = await db.collection('news_ai_cache').doc(id).get();
        if (doc.exists) return res.json(doc.data());
      }
      throw new Error("No Firestore cache");
    } catch (err) {
      const row = sqliteDb.prepare("SELECT * FROM news_ai_cache WHERE id = ?").get(req.query.id);
      if (row) {
        return res.json({
          ...row,
          keyPoints: JSON.parse(row.keyPoints || '[]')
        });
      }
      res.json(null);
    }
  });

  app.post('/api/news-cache', async (req, res) => {
    try {
      const cache = req.body;
      if (!cache.createdAt) cache.createdAt = new Date().toISOString();
      
      sqliteDb.prepare("REPLACE INTO news_ai_cache (id, title, content, keyPoints, impact, sentiment, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(cache.id, cache.title, cache.content, JSON.stringify(cache.keyPoints || []), cache.impact, cache.sentiment, cache.createdAt);
      
      if (db) {
        try {
          await db.collection('news_ai_cache').doc(cache.id).set(cache);
        } catch (fErr) {
          console.warn("[Firestore] Cache write failed:", fErr.message);
        }
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // FCM Notification Routes
  app.post('/api/fcm-token', async (req, res) => {
    const { token, userId } = req.body;
    if (!token) return res.status(400).json({ error: "Token is required" });
    try {
      const updatedAt = new Date().toISOString();
      sqliteDb.prepare("REPLACE INTO fcm_tokens (token, userId, updatedAt) VALUES (?, ?, ?)")
        .run(token, userId || null, updatedAt);

      if (db) {
        try {
          await db.collection('fcm_tokens').doc(token).set({
            token,
            userId: userId || null,
            updatedAt
          }, { merge: true });
        } catch (fErr) {
          console.warn("[Firestore] FCM Token save failed:", fErr.message);
        }
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error saving FCM token:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post('/api/send-notification', async (req, res) => {
    const { title, body, url, subtitle, notificationId } = req.body;
    try {
      let registrationTokens: string[] = [];
      
      if (db) {
        try {
          const snapshot = await db.collection('fcm_tokens').get();
          registrationTokens = snapshot.docs.map(doc => doc.id);
        } catch (fErr) {
          console.warn("[Firestore] FCM Token fetch failed, falling back to SQLite:", fErr.message);
        }
      }
      
      if (registrationTokens.length === 0) {
        const rows = sqliteDb.prepare("SELECT token FROM fcm_tokens").all();
        registrationTokens = rows.map((r: any) => r.token);
      }

      if (registrationTokens.length === 0) {
        return res.json({ success: true, tokensTried: 0, successCount: 0, failureCount: 0 });
      }

      const message = {
        data: {
          title: title || '',
          body: body || '',
          url: url || '/community',
          subtitle: subtitle || 'Forex News',
          notificationId: notificationId || Date.now().toString(),
          tag: notificationId || 'community-update'
        },
        tokens: registrationTokens,
      };

      if (!messaging) {
        return res.status(503).json({ error: "Messaging service not initialized" });
      }

      const response = await messaging.sendEachForMulticast(message);
      
      // Clean up failed tokens
      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errorCode = resp.error?.code;
            if (errorCode === 'messaging/registration-token-not-registered' || 
                errorCode === 'messaging/invalid-registration-token') {
              const token = registrationTokens[idx];
              sqliteDb.prepare("DELETE FROM fcm_tokens WHERE token = ?").run(token);
              if (db) {
                db.collection('fcm_tokens').doc(token).delete().catch(() => {});
              }
            }
          }
        });
      }

      res.json({
        success: true,
        tokensTried: registrationTokens.length,
        successCount: response.successCount,
        failureCount: response.failureCount
      });
    } catch (error) {
      console.error("Error sending multicast notification:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/test-notification', async (req, res) => {
    try {
      let registrationTokens: string[] = [];
      if (db) {
        try {
          const snapshot = await db.collection('fcm_tokens').get();
          registrationTokens = snapshot.docs.map(doc => doc.id);
        } catch (fErr) {}
      }
      if (registrationTokens.length === 0) {
        registrationTokens = sqliteDb.prepare("SELECT token FROM fcm_tokens").all().map((r: any) => r.token);
      }

      if (registrationTokens.length === 0) {
        return res.status(404).json({ error: "Nenhum usuário inscrito para notificações (FCM tokens)." });
      }

      if (!messaging) {
        return res.status(503).json({ 
          error: "Serviço de Mensagens não disponível.", 
          details: "O Firebase Admin não foi inicializado corretamente ou as credenciais são inválidas (UNAUTHENTICATED)." 
        });
      }

      const message = {
        data: {
          title: "🔔 Teste de Notificação",
          body: "Esta é uma mensagem de teste do seu terminal de trading.",
          url: '/community',
          subtitle: 'Teste de Sistema',
          notificationId: 'test-' + Date.now(),
          tag: 'test-notification'
        },
        tokens: registrationTokens,
      };

      const response = await messaging.sendEachForMulticast(message);
      res.json({ 
        success: true, 
        count: response.successCount, 
        failures: response.failureCount 
      });
    } catch (error) {
      console.error("Error sending test notification:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  app.get('/api/notification-status', async (req, res) => {
    try {
      const row = sqliteDb.prepare("SELECT count(*) as count FROM fcm_tokens").get();
      res.json({ tokenCount: row.count });
    } catch (error) {
      res.json({ tokenCount: 0 });
    }
  });

  // AI Service Factory
  const sanitizeApiKey = (key: string) => {
    if (!key) return "";
    const s = key.trim().replace(/^["']|["']$/g, '');
    if (s === "MY_GEMINI_API_KEY" || s === "YOUR_GEMINI_API_KEY" || s.toLowerCase().includes("your_secret")) return "";
    return s;
  };

  const getAIProvider = (): any => {
    const provider = process.env.PREFERRED_AI_PROVIDER || 'gemini';
    
    if (provider === 'grok' && process.env.GROK_API_KEY) {
      return new OpenAI({ apiKey: sanitizeApiKey(process.env.GROK_API_KEY), baseURL: 'https://api.x.ai/v1' });
    }
    
    if (provider === 'deepseek' && process.env.DEEPSEEK_API_KEY) {
      return new OpenAI({ apiKey: sanitizeApiKey(process.env.DEEPSEEK_API_KEY), baseURL: 'https://api.deepseek.com' });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    const googleAiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const syncKey = process.env.SYNC_API_KEY;
    
    let rawKey = geminiKey || googleAiKey || "";
    if (syncKey && syncKey.startsWith('AIza') && !rawKey.startsWith('AIza')) {
       rawKey = syncKey;
    }

    const apiKey = sanitizeApiKey(rawKey);
    return new GoogleGenAI({ 
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  };

  app.post("/api/ai-process", async (req, res) => {
    const { prompt, type, stream = false } = req.body;
    
    const envGeminiKey = process.env.GEMINI_API_KEY || "";
    const envGoogleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
    
    let rawKey = envGeminiKey || envGoogleKey;
    const apiKey = sanitizeApiKey(rawKey);

    if (!apiKey) {
      return res.status(400).json({ 
        error: "GEMINI_API_KEY não configurada.",
        details: "A variável de ambiente GEMINI_API_KEY está ausente."
      });
    }

    try {
    const ai = getAIProvider();
      
    if (ai && (typeof ai.models !== 'undefined' || typeof ai.getGenerativeModel === 'function')) {
        let modelName = "gemini-1.5-flash";
        
        const runAI = async (model: string) => {
          try {
            // Support both @google/genai (new) and @google/generative-ai (legacy)
            if (typeof ai.models !== 'undefined') {
              if (stream) {
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                
                const result = await ai.models.generateContentStream({
                  model,
                  contents: prompt
                });
                for await (const chunk of result) {
                  const text = chunk.text || "";
                  res.write(`data: ${JSON.stringify({ text })}\n\n`);
                }
                res.write('data: [DONE]\n\n');
                return res.end();
              } else {
                const result = await ai.models.generateContent({
                  model,
                  contents: prompt,
                  config: type === 'json' ? { responseMimeType: "application/json" } : {}
                });
                return res.json({ text: result.text || "" });
              }
            } else {
              // Legacy SDK style
              const genModel = ai.getGenerativeModel({ model });
              if (stream) {
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                
                const result = await genModel.generateContentStream(prompt);
                for await (const chunk of result.stream) {
                  const text = chunk.text() || "";
                  res.write(`data: ${JSON.stringify({ text })}\n\n`);
                }
                res.write('data: [DONE]\n\n');
                return res.end();
              } else {
                const result = await genModel.generateContent({
                  contents: [{ role: 'user', parts: [{ text: prompt }] }],
                  generationConfig: type === 'json' ? { responseMimeType: "application/json" } : {}
                });
                return res.json({ text: result.response.text() || "" });
              }
            }
          } catch (e: any) {
             console.error(`[AI runAI] Error with model ${model}:`, e.message);
             throw e;
          }
        };

        try {
          return await runAI(modelName);
        } catch (e: any) {
          console.warn(`[AI Process] Model ${modelName} failed, trying fallback:`, e.message);
          if (e.message.includes('not found') || e.message.includes('404')) {
            // Try with latest alias as fallback
            return await runAI("gemini-flash-latest");
          }
          throw e;
        }
      } else {
        if (stream) {
          res.setHeader('Content-Type', 'text/event-stream');
          const completion = await ai.chat.completions.create({
            model: process.env.PREFERRED_AI_PROVIDER === 'grok' ? "grok-beta" : "deepseek-chat",
            messages: [{ role: 'user', content: prompt }],
            stream: true,
          });
          for await (const chunk of completion) {
            const text = chunk.choices[0]?.delta?.content || "";
            res.write(`data: ${JSON.stringify({ text })}\n\n`);
          }
          res.write('data: [DONE]\n\n');
          return res.end();
        } else {
          const completion = await ai.chat.completions.create({
            model: process.env.PREFERRED_AI_PROVIDER === 'grok' ? "grok-beta" : "deepseek-chat",
            messages: [{ role: 'user', content: prompt }],
            response_format: type === 'json' ? { type: "json_object" } : { type: "text" }
          });
          return res.json({ text: completion.choices[0].message.content });
        }
      }
    } catch (error) {
      console.error("AI Proxy Error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

// Global in-memory cache for AI results (fallback for spreadsheet sync)
let inMemoryAIResults: any[] = [];

// Function to update results from data array (used by spreadsheet and manual push)
async function updateAIResultsFromData(data: any[]) {
  const syncedResults: any[] = [];
  
  console.log(`[Sync] Processing ${data.length} results from source...`);
  
  // Try to get existing from Firestore or SQLite for merging
  let existingResults: any[] = [];
  if (db) {
    try {
      const snapshot = await db.collection('ai_results').get();
      existingResults = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
    } catch (e) {
      console.warn("[Sync] Firestore fetch failed, falling back to SQLite for merge info.");
    }
  }
  
  if (existingResults.length === 0 && sqliteDb) {
    try {
      const rows = sqliteDb.prepare("SELECT * FROM ai_results").all();
      existingResults = rows.map((r: any) => ({
        ...r,
        equityData: JSON.parse(r.equityData || '[]'),
        isLive: Boolean(r.isLive)
      }));
    } catch (err: any) {
      console.error("[Sync] SQLite fetch failed:", err.message);
    }
  }

  for (const item of data) {
    try {
      const traderName = item.trader || '';
      const sourceName = item.source || '';
      const dailyReturn = Number(item.daily) || 0;
      const weeklyReturn = Number(item.weekly) || 0;
      const monthlyReturn = Number(item.monthly) || 0;
      const lastUpdateVal = item.lastUpdate || '';
      const statusStr = String(item.status || '');
      const maxDrawdown = Number(item.drawdown) || 0;
      const externalUrl = String(item.url || '');

      if (!traderName) continue;

      // Improved matching: try exact match first, then fuzzy
      let targetIA = existingResults.find(r => 
        r.name === traderName && r.source === sourceName
      );

      if (!targetIA) {
        targetIA = existingResults.find(r => {
           const dbName = `${r.name} ${r.source || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');
           const searchName = `${traderName} ${sourceName}`.toLowerCase().replace(/[^a-z0-9]/g, '');
           return dbName === searchName || dbName.includes(searchName) || searchName.includes(dbName);
        });
      }

      // If still no match, generate a deterministic stable ID based on Name + Source to avoid duplicates across syncs
      const normName = traderName.trim().toLowerCase();
      const normSource = sourceName.trim().toLowerCase();
      const stableId = Buffer.from(`${normName}-${normSource}`).toString('base64').replace(/=/g, '').substring(0, 20);
      const id = targetIA?.id || stableId;

      const aiData = {
        id,
        name: traderName,
        source: sourceName,
        logo: targetIA?.logo || `https://api.dicebear.com/7.x/bottts/svg?seed=${traderName.toLowerCase().replace(/[^a-z0-9]/g, '')}&backgroundColor=D4AF37`,
        dailyReturn: Number(dailyReturn.toFixed(2)),
        weeklyReturn: Number(weeklyReturn.toFixed(2)),
        currentMonthReturn: Number(monthlyReturn.toFixed(2)),
        yearCumulativeReturn: targetIA?.yearCumulativeReturn || 0,
        winRate: targetIA?.winRate || item.winRate || 0,
        totalTradesMonth: targetIA?.totalTradesMonth || item.trades || 0,
        maxDrawdown: Number(maxDrawdown.toFixed(2)),
        equityData: targetIA?.equityData || [100, 100 + monthlyReturn],
        status: (statusStr.includes('Ativo') || statusStr === 'Active' || statusStr.includes('✅')) ? 'Active' : statusStr.includes('🛠') ? 'Maintenance' : 'Beta',
        lastSync: lastUpdateVal || new Date().toLocaleTimeString('pt-BR'),
        isLive: true,
        trackingUrl: externalUrl && externalUrl.startsWith('http') ? externalUrl : targetIA?.trackingUrl || ''
      };

      // De-duplicate within the same sync batch
      const existingInBatchIdx = syncedResults.findIndex(r => r.id === aiData.id);
      if (existingInBatchIdx !== -1) {
        syncedResults[existingInBatchIdx] = aiData;
      } else {
        syncedResults.push(aiData);
      }

      // Try to save to Firestore but don't block if it fails
      if (db) {
        db.collection('ai_results').doc(aiData.id).set(aiData, { merge: true }).catch(err => {
          console.error(`[Firestore] Error saving ${traderName}:`, err.message);
        });
      }
    } catch (err: any) {
      console.error(`[Sync] Error processing item ${item.trader}:`, err.message);
    }
  }
  
  if (syncedResults.length > 0) {
    inMemoryAIResults = syncedResults;
    
    // Also persist to SQLite
    if (sqliteDb) {
      try {
        const stmt = sqliteDb.prepare("REPLACE INTO ai_results (id, name, source, logo, dailyReturn, weeklyReturn, currentMonthReturn, yearCumulativeReturn, winRate, totalTradesMonth, maxDrawdown, equityData, status, lastSync, isLive, trackingUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        for (const data of syncedResults) {
          stmt.run(data.id, data.name, data.source, data.logo, data.dailyReturn, data.weeklyReturn, data.currentMonthReturn, data.yearCumulativeReturn, data.winRate, data.totalTradesMonth, data.maxDrawdown, JSON.stringify(data.equityData), data.status, data.lastSync, data.isLive ? 1 : 0, data.trackingUrl);
        }
        console.log(`[SQLite] Persisted ${syncedResults.length} synced results.`);
      } catch (err: any) {
        console.error("[SQLite] Error persisting synced results:", err.message);
      }
    }
  }
}

async function syncSpreadsheet() {
  console.log("Starting spreadsheet sync...");
  try {
    const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1hJDvBcirXgkd1RqwIRXFgkn0fIkm2rjSeAh28GxAnJM/gviz/tq?tqx=out:json&sheet=Resultados';
    const response = await fetch(SPREADSHEET_URL);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const text = await response.text();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('Invalid spreadsheet response format');
    
    const json = JSON.parse(text.substring(start, end + 1));
    const rows = json.table.rows;

    const parseVal = (v: any, f?: any) => {
      if (typeof f === 'string' && f.includes('%')) {
        const parsed = parseFloat(f.replace(',', '.').replace('%', ''));
        if (!isNaN(parsed)) return parsed;
      }
      if (typeof v === 'number') return v;
      if (typeof v === 'string') return parseFloat(v.replace(',', '.').replace('%', ''));
      return 0;
    };

    const dataToSync = rows.map((row: any) => ({
      trader: row.c[0]?.v || '',
      source: row.c[1]?.v || '',
      daily: parseVal(row.c[2]?.v, row.c[2]?.f),
      weekly: parseVal(row.c[3]?.v, row.c[3]?.f),
      monthly: parseVal(row.c[4]?.v, row.c[4]?.f),
      lastUpdate: row.c[5]?.f || row.c[5]?.v || '',
      status: row.c[6]?.v || '',
      drawdown: parseVal(row.c[7]?.v, row.c[7]?.f),
      url: row.c[8]?.v || ''
    }));

    await updateAIResultsFromData(dataToSync);
    console.log(`[Sync] Successfully processed ${dataToSync.length} results from spreadsheet.`);
  } catch (err: any) {
    console.error("[Sync] Spreadsheet sync error:", err.message);
    // Don't throw here to avoid crashing startup, but it will be logged.
  }
}

// Manual trigger endpoint
app.post('/api/admin/sync-sheet', async (req, res) => {
  try {
    await syncSpreadsheet();
    res.json({ success: true });
  } catch (err: any) {
    console.error("[API] Manual sync failed:", err.message);
    res.status(500).json({ error: String(err), details: err.message });
  }
});

// n8n / External Sync Endpoint
app.post('/api/admin/push-results', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (process.env.SYNC_API_KEY && apiKey !== process.env.SYNC_API_KEY) {
    return res.status(401).json({ error: "Invalid API Key" });
  }

  try {
    const { data } = req.body;
    if (!Array.isArray(data)) {
      return res.status(400).json({ error: "Payload must contain a 'data' array" });
    }
    await updateAIResultsFromData(data);
    res.json({ success: true, message: `${data.length} results processed` });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

  let distPath = "";
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.all('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT} (Node: ${process.version})`);
    
    if (distPath) {
      console.log(`Serving static files from ${distPath}`);
    }
    syncSpreadsheet().catch(err => {
      console.error("[Startup] Initial sync failed:", err.message);
    });
    
    // Periodic sync every 2 minutes for testing (120,000 ms)
    setInterval(() => {
      syncSpreadsheet().catch(err => {
        console.error("[Sync] Scheduled sync failed:", err.message);
      });
    }, 120000);
  });
} catch (err: any) {
  console.error("[Server] Critical startup error:", err);
  process.exit(1);
}
}

startServer();
