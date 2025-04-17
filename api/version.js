// api/version.js
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let db;  // Mantiene la instancia entre invocaciones

export default async function handler(req, res) {
  try {
    // 1) Comprueba que tengas configurada la credencial
    const cred = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!cred) {
      return res.status(500).json({ error: 'FIREBASE_SERVICE_ACCOUNT no definida' });
    }

    // 2) Parsea el JSON de credenciales
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(cred);
    } catch (e) {
      return res.status(500).json({ error: 'JSON de credenciales inválido' });
    }

    // 3) Inicializa Admin SDK sólo una vez
    if (!db) {
      initializeApp({ credential: cert(serviceAccount) });
      db = getFirestore();
    }

    // 4) Lee la versión desde Firestore
    const snap = await db.doc('config/appData').get();
    const dataVersion = snap.exists ? snap.data().dataVersion : null;

    // 5) Devuelve JSON directamente
    return res.status(200).json({ dataVersion });
  } catch (e) {
    console.error('Error en /api/version:', e);
    return res.status(500).json({ error: e.message });
  }
}
