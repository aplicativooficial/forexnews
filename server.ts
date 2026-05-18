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

// Load Firebase Config
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));

// Initialize Firebase Admin
let db: ReturnType<typeof getFirestore>;
let messaging: ReturnType<typeof getMessaging>;

try {
  const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');
  if (fs.existsSync(serviceAccountPath)) {
    // Set environment variable for ADC fallback if needed
    process.env.GOOGLE_APPLICATION_CREDENTIALS = serviceAccountPath;
    
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    console.log(`[Firebase] Initializing with service account: ${serviceAccount.client_email}`);
    
    // Explicitly provide credential and projectId
    const app = initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
    
    const databaseId = firebaseConfig.firestoreDatabaseId || undefined;
    console.log(`[Firebase] Project: ${serviceAccount.project_id}, Database: ${databaseId || '(default)'}`);
    
    db = getFirestore(app, databaseId);
    messaging = getMessaging(app);
    
    // Verificação de conexão imediata
    db.collection('health_check').limit(1).get().then(() => {
      console.log("[Firebase] Connection test: OK");
    }).catch(err => {
      console.error("[Firebase] Connection test FAILED:", err.message);
      if (err.message.includes('UNAUTHENTICATED')) {
         console.warn("[Firebase] Auth error detected. This usually means the service account key is invalid or revoked.");
      }
    });
  } else {
    console.warn("[Firebase] No service account file found. Falling back to default.");
    const app = initializeApp({
      projectId: firebaseConfig.projectId
    });
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId || undefined);
    messaging = getMessaging(app);
  }
} catch (error) {
  console.error("Error initializing Firebase Admin:", error);
}

// Function to handle one-time migration from SQLite to Firestore
async function migrateIfNeeded() {
  const sqlitePath = path.join(process.cwd(), 'database.sqlite');
  if (!fs.existsSync(sqlitePath)) return;
  if (!db) return;

  console.log("Found existing SQLite database. Starting migration to Firestore...");
  const sqliteDb = new Database(sqlitePath);
  
  try {
    // Migration: AI Results
    const aiResults = sqliteDb.prepare("SELECT * FROM ai_results").all();
    for (const r of aiResults as any[]) {
      await db.collection('ai_results').doc(r.id).set({
        ...r,
        equityData: JSON.parse(r.equityData || '[]'),
        isLive: Boolean(r.isLive)
      });
    }

    // Migration: Community Updates
    const community = sqliteDb.prepare("SELECT * FROM community_updates").all();
    for (const u of community as any[]) {
      await db.collection('updates').doc(u.id).set({
        ...u,
        isImportant: Boolean(u.isImportant)
      });
    }

    // Migration: Daily Analysis
    const analysisArr = sqliteDb.prepare("SELECT * FROM daily_analysis WHERE id = 'current'").all() as any[];
    if (analysisArr.length > 0) {
      await db.collection('analysis').doc('current').set({
        text: analysisArr[0].text,
        date: analysisArr[0].date
      });
    }

    // Migration: Banners
    const banners = sqliteDb.prepare("SELECT * FROM banners").all();
    for (const b of banners as any[]) {
      await db.collection('banners').doc(b.id).set(b);
    }

    // Migration: Config
    const configs = sqliteDb.prepare("SELECT * FROM config").all();
    for (const c of configs as any[]) {
      await db.collection('config').doc(c.id).set(JSON.parse(c.value));
    }

    // Migration: News Cache
    const cache = sqliteDb.prepare("SELECT * FROM news_ai_cache").all();
    for (const n of cache as any[]) {
      await db.collection('news_ai_cache').doc(n.id).set({
        ...n,
        keyPoints: JSON.parse(n.keyPoints || '[]')
      });
    }

    // Migration: FCM Tokens
    const tokens = sqliteDb.prepare("SELECT * FROM fcm_tokens").all();
    for (const t of tokens as any[]) {
      await db.collection('fcm_tokens').doc(t.token).set(t);
    }

    console.log("Migration completed successfully!");
    sqliteDb.close();
    fs.renameSync(sqlitePath, sqlitePath + '.migrated');
  } catch (err) {
    console.error("Migration failed:", err);
  }
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT && !process.env.K_SERVICE ? Number(process.env.PORT) : 3000; // Hardcoded to 3000 for AI Studio, but follows env PORT elsewhere

  // Run migration if snapshot exists
  await migrateIfNeeded();

  app.use(helmet({
    contentSecurityPolicy: false, // For development and iFrame compatibility
  }));
  app.use(cors());
  app.use(express.json());

  // Middleware to ensure database is ready
  app.use((req, res, next) => {
    if (req.path.startsWith('/api') && !db && req.path !== '/api/health') {
      return res.status(503).json({ error: "Database initialization failed. Check server logs." });
    }
    next();
  });

  // Log all API requests
  app.use("/api", (req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  // API Routes
  
  // AI Results
  app.get("/api/ai-results", async (req, res) => {
    try {
      if (!db) {
        return res.json(inMemoryAIResults);
      }
      const snapshot = await db.collection('ai_results').get();
      if (snapshot.empty && inMemoryAIResults.length > 0) {
        return res.json(inMemoryAIResults);
      }
      const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(results);
    } catch (err) {
      console.warn("[API] Firestore error, falling back to memory:", String(err));
      res.json(inMemoryAIResults);
    }
  });

  app.post("/api/ai-results", async (req, res) => {
    try {
      const ai = req.body;
      await db.collection('ai_results').doc(ai.id).set(ai);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.delete("/api/ai-results/:id", async (req, res) => {
    try {
      await db.collection('ai_results').doc(req.params.id).delete();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Community Updates
  app.get("/api/community", async (req, res) => {
    try {
      const snapshot = await db.collection('updates').orderBy('createdAt', 'desc').get();
      const updates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(updates);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post("/api/community", async (req, res) => {
    try {
      const update = req.body;
      if (!update.createdAt) update.createdAt = new Date().toISOString();
      await db.collection('updates').doc(update.id).set(update);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.delete("/api/community/:id", async (req, res) => {
    try {
      await db.collection('updates').doc(req.params.id).delete();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Daily Analysis
  app.get("/api/analysis", async (req, res) => {
    try {
      const doc = await db.collection('analysis').doc('current').get();
      res.json(doc.exists ? doc.data() : null);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post("/api/analysis", async (req, res) => {
    try {
      const { text, date } = req.body;
      await db.collection('analysis').doc('current').set({ text, date });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

    // AI Service Factory
  const sanitizeApiKey = (key: string) => {
    if (!key) return "";
    const s = key.trim().replace(/^["']|["']$/g, '');
    // Ignore common placeholder values
    if (s === "MY_GEMINI_API_KEY" || s === "YOUR_GEMINI_API_KEY" || s.toLowerCase().includes("your_secret")) return "";
    return s;
  };

  const getAIProvider = () => {
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
    
    // Heuristic: check if SYNC_API_KEY looks like a standard Google API key (starts with AIza)
    let rawKey = geminiKey || googleAiKey || "";
    if (syncKey && syncKey.startsWith('AIza') && !rawKey.startsWith('AIza')) {
       console.log("[AI Provider] Heuristic: SYNC_API_KEY looks like a standard Gemini key. Using it as fallback.");
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
      console.error("AI Error: GEMINI_API_KEY is missing or empty.");
      return res.status(400).json({ 
        error: "GEMINI_API_KEY não configurada. Por favor, adicione sua chave em Settings > Secrets.",
        details: "A variável de ambiente GEMINI_API_KEY está ausente ou vazia."
      });
    }

    // Masked logging for debugging
    const maskedKey = apiKey.length > 8 
      ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` 
      : "****";
    
    console.log(`[AI Process] Provider: ${process.env.PREFERRED_AI_PROVIDER || 'gemini'}`);
    console.log(`[AI Process] Key Source: ${envGeminiKey ? 'GEMINI_API_KEY' : envGoogleKey ? 'GOOGLE_GENERATIVE_AI_API_KEY' : 'NONE'}`);
    console.log(`[AI Process] Key Length: ${apiKey.length}, Masked: ${maskedKey}`);
    console.log(`[AI Process] Key starts with AIza: ${apiKey.startsWith('AIza')}`);

    if (apiKey && !apiKey.startsWith('AIza')) {
      console.warn(`[AI Process] WARNING: API Key starts with '${apiKey.substring(0, 4)}'. Standard Gemini API keys usually start with 'AIza'. This might cause authorization errors.`);
    }

    if (apiKey.length < 20) {
      console.warn("[AI Process] Warning: API Key seems too short.");
    }

    try {
      const ai = getAIProvider();
      
      if (ai instanceof GoogleGenAI) {
        // use latest model
        const model = "gemini-1.5-flash"; 

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
        // OpenAI / Grok / DeepSeek
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
      const errorMsg = String(error);
      if (errorMsg.includes("API key not valid") || errorMsg.includes("400") || errorMsg.includes("403")) {
        return res.status(error?.status || 400).json({ 
          error: "API Key inválida. Por favor, verifique sua chave Gemini no painel de Configurações > Secrets do AI Studio.",
          details: errorMsg
        });
      }
      res.status(500).json({ error: errorMsg });
    }
  });

  // Vite middleware for development
  // Config
app.get('/api/config/:id', async (req, res) => {
  try {
    const doc = await db.collection('config').doc(req.params.id).get();
    res.json(doc.exists ? doc.data() : null);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/config/:id', async (req, res) => {
  try {
    await db.collection('config').doc(req.params.id).set(req.body);
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
    const doc = await db.collection('news_ai_cache').doc(id).get();
    res.json(doc.exists ? doc.data() : null);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/news-cache', async (req, res) => {
  try {
    const cache = req.body;
    if (!cache.createdAt) cache.createdAt = new Date().toISOString();
    await db.collection('news_ai_cache').doc(cache.id).set(cache);
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
    await db.collection('fcm_tokens').doc(token).set({
      token,
      userId: userId || null,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    res.json({ success: true });
  } catch (error) {
    console.error("Error saving FCM token:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post('/api/send-notification', async (req, res) => {
  const { title, body, url, subtitle, notificationId } = req.body;
  try {
    const snapshot = await db.collection('fcm_tokens').get();
    if (snapshot.empty) {
      return res.json({ success: true, tokensTried: 0, successCount: 0, failureCount: 0 });
    }

    const registrationTokens = snapshot.docs.map(doc => doc.id);
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

    const response = await messaging.sendEachForMulticast(message);
    
    // Clean up failed tokens
    if (response.failureCount > 0) {
      const batch = db.batch();
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          if (errorCode === 'messaging/registration-token-not-registered' || 
              errorCode === 'messaging/invalid-registration-token') {
            batch.delete(db.collection('fcm_tokens').doc(registrationTokens[idx]));
          }
        }
      });
      await batch.commit();
    }

    res.json({
      success: true,
      tokensTried: registrationTokens.length,
      successCount: response.successCount,
      failureCount: response.failureCount
    });
  } catch (error) {
    console.error("Error sending multicast notification:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post('/api/test-notification', async (req, res) => {
  try {
    const snapshot = await db.collection('fcm_tokens').get();
    if (snapshot.empty) {
      return res.status(404).json({ error: "No subscribers found" });
    }

    const registrationTokens = snapshot.docs.map(doc => doc.id);
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
    const snapshot = await db.collection('fcm_tokens').count().get();
    res.json({ tokenCount: snapshot.data().count });
  } catch (error) {
    res.json({ tokenCount: 0 });
  }
});

// Global in-memory cache for AI results (fallback for spreadsheet sync)
let inMemoryAIResults: any[] = [];

// Function to update results from data array (used by spreadsheet and manual push)
async function updateAIResultsFromData(data: any[]) {
  const syncedResults: any[] = [];
  
  console.log(`[Sync] Processing ${data.length} results from source...`);
  
  // Try to get existing from Firestore if possible for merging
  let existingResults: any[] = [];
  if (db) {
    try {
      const snapshot = await db.collection('ai_results').get();
      existingResults = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));
    } catch (e) {
      console.warn("[Sync] Could not fetch existing results from Firestore, using memory only.");
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

      const targetIA = existingResults.find(r => {
         const dbName = `${r.name} ${r.source || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');
         const searchName = `${traderName} ${sourceName}`.toLowerCase().replace(/[^a-z0-9]/g, '');
         return dbName.includes(searchName) || searchName.includes(dbName);
      });

      let logoUrl = targetIA?.logo;
      if (!logoUrl || logoUrl.includes('pixabay') || logoUrl.includes('bug')) {
        const searchSlug = traderName.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (searchSlug.includes('btc')) logoUrl = 'https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/svg/color/btc.svg';
        else logoUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${searchSlug}&backgroundColor=D4AF37`;
      }

      const aiData = {
        id: targetIA?.id || randomUUID(),
        name: traderName,
        source: sourceName,
        logo: logoUrl,
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

      syncedResults.push(aiData);

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

  app.listen(PORT, "0.0.0.0", async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Initial sync on startup
    await syncSpreadsheet();
    
    // Periodic sync every 2 minutes for testing (120,000 ms)
    setInterval(syncSpreadsheet, 120000);
  });
}

startServer();
