
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

const configPath = path.join(process.cwd(), 'firebase-applet-config.json');

async function test() {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  console.log("Testing ADC (Default Credentials)...");
  console.log("Project ID:", config.projectId);

  try {
    const app = initializeApp({
      projectId: config.projectId
    });

    const namedDb = getFirestore(app, config.firestoreDatabaseId);
    await namedDb.collection('health').limit(1).get();
    console.log("SUCCESS: Named Database accessible via ADC");
  } catch (err) {
    console.error("FAILED: Named Database via ADC:", err.message);
  }
}

test();
