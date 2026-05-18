
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');
const configPath = path.join(process.cwd(), 'firebase-applet-config.json');

async function test() {
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  console.log("Project ID:", config.projectId);
  console.log("Database ID:", config.firestoreDatabaseId);

  const app = initializeApp({
    credential: cert(serviceAccount),
    projectId: config.projectId
  }, 'test-app');

  const namedDb = getFirestore(app, config.firestoreDatabaseId);
  try {
    await namedDb.collection('health').limit(1).get();
    console.log("SUCCESS: Named Database accessible");
  } catch (err) {
    console.error("FAILED: Named Database:", err.message);
  }

  const defaultDb = getFirestore(app);
  try {
    await defaultDb.collection('health').limit(1).get();
    console.log("SUCCESS: Default Database accessible");
  } catch (err) {
    console.error("FAILED: Default Database:", err.message);
  }
}

test();
