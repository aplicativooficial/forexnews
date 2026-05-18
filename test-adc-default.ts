
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

const configPath = path.join(process.cwd(), 'firebase-applet-config.json');

async function test() {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  console.log("Testing ADC (Default Credentials) on DEFAULT Database...");
  console.log("Project ID:", config.projectId);

  try {
    const app = initializeApp({
      projectId: config.projectId
    });

    const defaultDb = getFirestore(app);
    await defaultDb.collection('health').limit(1).get();
    console.log("SUCCESS: Default Database accessible via ADC");
  } catch (err) {
    console.error("FAILED: Default Database via ADC:", err.message);
  }
}

test();
