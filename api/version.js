import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!global._fbAdmin) {
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
  global._fbAdmin = true;
}
const db = getFirestore();

export default async function handler(req, res) {
  try {
    const snap = await db.doc('config/appData').get();
    const dataVersion = snap.exists ? snap.data().dataVersion : null;
    res.status(200).json({ dataVersion });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error leyendo versión' });
  }
}
