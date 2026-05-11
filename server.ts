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

// Load Firebase Config
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));

// Initialize Firebase Admin
let db: ReturnType<typeof getFirestore>;
let messaging: ReturnType<typeof getMessaging>;

try {
  const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    const app = initializeApp({
      credential: cert(serviceAccount)
    });
    // Use the specific database ID if provided in config
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId || undefined);
    messaging = getMessaging(app);
    console.log("Firebase Admin and Firestore initialized successfully");
  } else {
    console.warn("Firebase service account file not found. Trying default credentials...");
    const app = initializeApp();
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

    // Migration: Social Proofs
    const proofs = sqliteDb.prepare("SELECT * FROM social_proofs").all();
    for (const p of proofs as any[]) {
      await db.collection('social_proof').doc(p.id).set(p);
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
  const PORT = Number(process.env.PORT) || 3000;

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
      const snapshot = await db.collection('ai_results').get();
      const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(results);
    } catch (err) {
      res.status(500).json({ error: String(err) });
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

  // Social Proofs
  app.get("/api/social-proofs", async (req, res) => {
    try {
      const snapshot = await db.collection('social_proof').orderBy('createdAt', 'desc').get();
      const proofs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(proofs);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post("/api/social-proofs", async (req, res) => {
    try {
      const proof = req.body;
      if (!proof.createdAt) proof.createdAt = new Date().toISOString();
      await db.collection('social_proof').doc(proof.id).set(proof);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.delete("/api/social-proofs/:id", async (req, res) => {
    try {
      await db.collection('social_proof').doc(req.params.id).delete();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Vite middleware for development
  // Banners
  app.get('/api/banners', async (req, res) => {
    try {
      const snapshot = await db.collection('banners').orderBy('createdAt', 'desc').get();
      const banners = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(banners);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/banners', async (req, res) => {
    try {
      const banner = req.body;
      if (!banner.createdAt) banner.createdAt = new Date().toISOString();
      await db.collection('banners').doc(banner.id).set(banner);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.delete('/api/banners/:id', async (req, res) => {
    try {
      await db.collection('banners').doc(req.params.id).delete();
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

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
