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
    const [rutasSnap, alertasSnap] = await Promise.all([
      db.collection('rutas').get(),
      db.collection('alertas').get()
    ]);
    const rutas   = rutasSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const alertas = alertasSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.status(200).json({ rutas, alertas });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error cargando datos' });
  }
}
