import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Row,
  Col,
  Button,
  Form,
  FormControl,
  ListGroup,
  Spinner
} from 'react-bootstrap';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import {
  doc,
  collection,
  getDocs,
  getDoc,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import Cookies from 'js-cookie';
import L from 'leaflet';

// Captura instancia del mapa
const SetMapInstance = ({ setMapInstance }) => {
  const map = useMap();
  useEffect(() => setMapInstance(map), [map, setMapInstance]);
  return null;
};

// Íconos para marcadores
const alertaIcon = L.icon({ iconUrl: '/iconos/alerta.png', iconSize: [25,25], iconAnchor: [12,12] });
const puntoRecogidaIcon = L.icon({ iconUrl: '/iconos/recogida.png', iconSize: [25,25], iconAnchor: [12,12] });
const hotelIcon = L.icon({ iconUrl: '/iconos/hotel.png', iconSize: [25,25], iconAnchor: [12,12] });
const conductorIcon = L.icon({ iconUrl: '/iconos/bus.png', iconSize: [35,35], iconAnchor: [17,17] });

// Color de rutas según tipo
const getColor = tipo => {
  switch (tipo) {
    case 'segura': return 'green';
    case 'advertencia': return 'yellow';
    case 'prohibida': return 'red';
    default: return 'blue';
  }
};

// Clave de versión en localStorage
const DATA_VERSION_KEY = 'dataVersion';

const MapaConductor = () => {
  const navigate = useNavigate();

  // Datos cacheados
  const [alertas, setAlertas]     = useState([]);
  const [rutas, setRutas]         = useState([]);
  const [allHotels, setAllHotels] = useState([]);

  // UI
  const [searchQuery, setSearchQuery]       = useState('');
  const [searchResults, setSearchResults]   = useState([]);
  const [loadingSearch, setLoadingSearch]   = useState(false);
  const [selectedHotelId, setSelectedHotelId] = useState(null);

  // Mapa / geolocalización
  const [center]            = useState([39.6908, 2.9271]);
  const [mapInstance, setMapInstance] = useState(null);
  const [conductorPos, setConductorPos] = useState(null);
  const [tracking, setTracking]         = useState(false);

  const watchIdRef = useRef(null);

  // 1. Validar sesión
  useEffect(() => {
    const cur = Cookies.get('currentUser');
    const devUid = Cookies.get('deviceUid');
    if (!cur || !devUid) return navigate('/');
    let user;
    try { user = JSON.parse(cur); } catch { return navigate('/'); }
    if (!user.id) return navigate('/');
    const ref = doc(db, 'usuarios', user.id);
    const unsub = onSnapshot(ref, snap => {
      if (!snap.exists()) {
        Cookies.remove('currentUser');
        return navigate('/');
      }
      const data = snap.data();
      if (data.deviceUid !== devUid) {
        Cookies.remove('currentUser');
        return navigate('/');
      }
      // usuario validado
    }, () => navigate('/'));
    return () => unsub();
  }, [navigate]);

  // 2. Cache inicial: alertas, rutas y hoteles
  useEffect(() => {
    const loadCache = async () => {
      try {
        // Leer versión en Firestore
        const cfgRef = doc(db, 'config', 'appData');
        const cfgSnap = await getDoc(cfgRef);
        if (!cfgSnap.exists()) return;
        const remoteVer = cfgSnap.data().dataVersion;
        const localVer = localStorage.getItem(DATA_VERSION_KEY);

        if (localVer !== remoteVer) {
          // Nueva versión: limpiar y recargar
          localStorage.setItem(DATA_VERSION_KEY, remoteVer);
          localStorage.removeItem('alertas');
          localStorage.removeItem('rutas');
          localStorage.removeItem('hoteles');

          const [aSnap, rSnap, hSnap] = await Promise.all([
            getDocs(collection(db, 'alertas')),
            getDocs(collection(db, 'rutas')),
            getDocs(collection(db, 'hoteles'))
          ]);

          const newAlertas = aSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const newRutas   = rSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          const newHotels  = hSnap.docs.map(d => ({ id: d.id, ...d.data() }));

          setAlertas(newAlertas);
          setRutas(newRutas);
          setAllHotels(newHotels);

          localStorage.setItem('alertas', JSON.stringify(newAlertas));
          localStorage.setItem('rutas', JSON.stringify(newRutas));
          localStorage.setItem('hoteles', JSON.stringify(newHotels));
        } else {
          // Misma versión: cargar de localStorage
          setAlertas(JSON.parse(localStorage.getItem('alertas') || '[]'));
          setRutas(JSON.parse(localStorage.getItem('rutas') || '[]'));
          setAllHotels(JSON.parse(localStorage.getItem('hoteles') || '[]'));
        }
      } catch (err) {
        console.error('Error cargando caché inicial:', err);
      }
    };
    loadCache();
  }, []);

  // 3. Geolocalización / mapa
  const handleCenterMap = () => {
    if (mapInstance && conductorPos) {
      mapInstance.panTo(conductorPos);
    }
  };
  const handleToggleTracking = () => {
    if (!tracking && navigator.geolocation) {
      setTracking(true);
      watchIdRef.current = navigator.geolocation.watchPosition(
        pos => setConductorPos([pos.coords.latitude, pos.coords.longitude]),
        err => console.error(err),
        { enableHighAccuracy: true, maximumAge: 0 }
      );
    } else {
      setTracking(false);
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    }
  };
  useEffect(() => {
    if (conductorPos && mapInstance) {
      mapInstance.panTo(conductorPos);
    }
  }, [conductorPos, mapInstance]);

  // 4. Búsqueda client-side de hoteles
  const handleSearchHotels = e => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoadingSearch(true);
    const q = searchQuery.toLowerCase();
    const results = allHotels
      .filter(h => h.nombre.toLowerCase().includes(q))
      .slice(0, 10)
      .map(h => ({ displayName: h.nombre, lat: h.lat, lng: h.lng }));
    setSearchResults(results);
    setLoadingSearch(false);
  };

  return (
    <Container fluid style={{ padding: '2rem' }}>
      <Row className="mt-3">
        <Col>
          <h2>Mapa del Conductor</h2>
          <Button variant={tracking ? 'danger' : 'success'} onClick={handleToggleTracking}>
            {tracking ? 'Detener Ruta' : 'Iniciar Ruta'}
          </Button>{' '}
          <Button variant="info" onClick={handleCenterMap}>
            Centrar en mi ubicación
          </Button>
        </Col>
      </Row>
      <Row>
        <Col md={9}>
          <MapContainer center={center} zoom={10} style={{ height: '80vh' }}>
            <SetMapInstance setMapInstance={setMapInstance} />
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="© OpenStreetMap contributors"
            />
            {conductorPos && (
              <Marker position={conductorPos} icon={conductorIcon}>
                <Popup>Tu ubicación actual</Popup>
              </Marker>
            )}
            {rutas.map(r =>
              Array.isArray(r.coordenadas) ? (
                <Polyline
                  key={r.id}
                  positions={r.coordenadas.map(c => [c.lat, c.lng])}
                  color={getColor(r.tipo)}
                />
              ) : null
            )}
            {alertas.map(a =>
              a.coordenadas ? (
                <Marker
                  key={a.id}
                  position={[a.coordenadas.lat, a.coordenadas.lng]}
                  icon={a.tipo === 'puntoRecogida' ? puntoRecogidaIcon : alertaIcon}
                >
                  <Popup>
                    <h5>{a.title || 'Sin título'}</h5>
                    <p>{a.description || 'Sin descripción'}</p>
                  </Popup>
                </Marker>
              ) : null
            )}
            {searchResults.map((h, i) => (
              <Marker key={i} position={[h.lat, h.lng]} icon={hotelIcon}>
                <Popup>{h.displayName}</Popup>
              </Marker>
            ))}
          </MapContainer>
        </Col>
        <Col md={3}>
          <h4>Buscar Hoteles</h4>
          <Form onSubmit={handleSearchHotels}>
            <FormControl
              type="text"
              placeholder="Nombre del hotel"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <Button variant="primary" type="submit" className="mt-2">
              Buscar
            </Button>
          </Form>
          {loadingSearch && <Spinner animation="border" className="my-2" />}
          {searchResults.length > 0 && (
            <ListGroup className="mt-2">
              {searchResults.map((res, i) => (
                <ListGroup.Item key={i} className="d-flex justify-content-between">
                  {res.displayName}
                  <Button size="sm" onClick={() => setSelectedHotelId(res.displayName)}>
                    Ver
                  </Button>
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}
        </Col>
      </Row>
    </Container>
  );
};

export default MapaConductor;
