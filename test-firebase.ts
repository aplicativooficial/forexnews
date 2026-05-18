
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

async function test() {
  const serviceAccount = JSON.parse(fs.readFileSync('firebase-service-account.json', 'utf8'));
  const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
  
  console.log("Database ID from config:", config.firestoreDatabaseId);

  async function tryDb(dbId?: string) {
    console.log(`\n--- Testing Database: ${dbId || '(default)'} ---`);
    const app = initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id
    }, "app-" + (dbId || "default"));

    const db = getFirestore(app, dbId);
    
    try {
      console.log("Attempting to read ai_results...");
      const snapshot = await db.collection('ai_results').limit(1).get();
      console.log("Success! Found", snapshot.size, "documents");
      return true;
    } catch (err) {
      console.error("Failed:", err.message);
      return false;
    }
  }

  await tryDb();
  await tryDb(config.firestoreDatabaseId);
}

test();
