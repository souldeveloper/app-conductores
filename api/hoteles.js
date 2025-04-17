// api/hoteles.js
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let db;
export default async function handler(req, res) {
  try {
    // 1) Credenciales
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
      return res.status(500).json({ error: 'FIREBASE_SERVICE_ACCOUNT no definida' });
    }
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    // 2) Init Admin SDK una vez
    if (!db) {
      initializeApp({ credential: cert(serviceAccount) });
      db = getFirestore();
    }

    // 3) Obtener userId (de la query string)
    const userId = req.query.userId;
    if (!userId) {
      return res.status(400).json({ error: 'Falta userId' });
    }

    // 4) Leer versión específica de hoteles (config/hoteles_{userId})
    const cfgRef = db.doc(`config/hoteles_${userId}`);
    const cfgSnap = await cfgRef.get();
    let version = cfgSnap.exists ? cfgSnap.data().version : null;

    // 5) Leer todos los hoteles de ese usuario
    const snap = await db.collection(`usuarios/${userId}/hoteles`).get();
    const hoteles = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // 6) Si no había versión, o quieres forzar nueva, escríbela
    if (!version) {
      version = Date.now().toString();
      await cfgRef.set({ version }, { merge: true });
    }

    // 7) Devolver { version, hoteles }
    return res.status(200).json({ version, hoteles });
  } catch (e) {
    console.error('Error en /api/hoteles:', e);
    return res.status(500).json({ error: e.message });
  }
}
