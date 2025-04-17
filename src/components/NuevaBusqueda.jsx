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
  Spinner,
  Alert
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

// Iconos
const alertaIcon = L.icon({ iconUrl: '/iconos/alerta.png',      iconSize: [25,25], iconAnchor: [12,12] });
const puntoRecogidaIcon = L.icon({ iconUrl: '/iconos/recogida.png', iconSize: [25,25], iconAnchor: [12,12] });
const hotelIcon = L.icon({ iconUrl: '/iconos/hotel.png',       iconSize: [25,25], iconAnchor: [12,12] });
const conductorIcon = L.icon({ iconUrl: '/iconos/bus.png',      iconSize: [35,35], iconAnchor: [17,17] });

// Captura la instancia del mapa
const SetMapInstance = ({ setMapInstance }) => {
  const map = useMap();
  useEffect(() => setMapInstance(map), [map, setMapInstance]);
  return null;
};

// Color según tipo de ruta
const getColor = tipo => {
  switch (tipo) {
    case 'segura':       return 'green';
    case 'advertencia':  return 'yellow';
    case 'prohibida':    return 'red';
    default:             return 'blue';
  }
};

// Claves de localStorage
const DATA_VERSION_KEY = 'dataVersion';
const MY_HOTELS_KEY    = 'myHotels';

const MapaConductor = () => {
  const navigate = useNavigate();

  // Cache inicial de alertas, rutas y hoteles completos
  const [alertas, setAlertas]     = useState([]);
  const [rutas, setRutas]         = useState([]);
  const [allHotels, setAllHotels] = useState([]);

  // Lista personal persistente en localStorage
  const [myHotels, setMyHotels] = useState(() => {
    try { return JSON.parse(localStorage.getItem(MY_HOTELS_KEY)) || []; }
    catch { return []; }
  });

  // UI para búsqueda
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  // Mapa y geolocalización
  const [center]             = useState([39.6908, 2.9271]);
  const [mapInstance, setMapInstance] = useState(null);
  const [conductorPos, setConductorPos] = useState(null);
  const [tracking, setTracking]         = useState(false);
  const watchIdRef = useRef(null);

  // Persiste cambios en myHotels
  useEffect(() => {
    localStorage.setItem(MY_HOTELS_KEY, JSON.stringify(myHotels));
  }, [myHotels]);

  // 1) Validar sesión
  useEffect(() => {
    const cur = Cookies.get('currentUser');
    const devUid = Cookies.get('deviceUid');
    if (!cur || !devUid) return navigate('/');
    let user;
    try { user = JSON.parse(cur); } catch { return navigate('/'); }
    if (!user.id) return navigate('/');
    const ref = doc(db, 'usuarios', user.id);
    const unsub = onSnapshot(ref, snap => {
      if (!snap.exists() || snap.data().deviceUid !== devUid) {
        Cookies.remove('currentUser');
        return navigate('/');
      }
    }, () => navigate('/'));
    return () => unsub();
  }, [navigate]);

  // 2) Cache inicial: alertas, rutas y hoteles
  useEffect(() => {
    const loadCache = async () => {
      try {
        const cfgSnap = await getDoc(doc(db, 'config', 'appData'));
        if (!cfgSnap.exists()) return;
        const remoteVer = cfgSnap.data().dataVersion;
        const localVer  = localStorage.getItem(DATA_VERSION_KEY);

        if (localVer !== remoteVer) {
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
          localStorage.setItem('rutas',   JSON.stringify(newRutas));
          localStorage.setItem('hoteles', JSON.stringify(newHotels));
        } else {
          setAlertas(JSON.parse(localStorage.getItem('alertas') || '[]'));
          setRutas(JSON.parse(localStorage.getItem('rutas')   || '[]'));
          setAllHotels(JSON.parse(localStorage.getItem('hoteles') || '[]'));
        }
      } catch (err) {
        console.error('Error cargando caché inicial:', err);
      }
    };
    loadCache();
  }, []);

  // 3) Geolocalización / mapa
  const handleCenterMap = () => {
    if (mapInstance && conductorPos) mapInstance.panTo(conductorPos);
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
    if (conductorPos && mapInstance) mapInstance.panTo(conductorPos);
  }, [conductorPos, mapInstance]);

  // 4) Búsqueda de hoteles
  const handleSearchHotels = e => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoadingSearch(true);
    const q = searchQuery.toLowerCase();
    const results = allHotels
      .filter(h => h.nombre.toLowerCase().includes(q))
      .slice(0, 10)
      .map(h => ({ id: h.id, nombre: h.nombre, lat: h.lat, lng: h.lng }));
    setSearchResults(results);
    setLoadingSearch(false);
  };

  // 5) Añadir a mi lista
  const handleAddToMyHotels = hotel => {
    if (!myHotels.find(h => h.id === hotel.id)) {
      setMyHotels(prev => [...prev, hotel]);
    }
  };

  // 6) Quitar de mi lista
  const handleRemoveFromMyHotels = id => {
    setMyHotels(prev => prev.filter(h => h.id !== id));
  };

  return (
    <Container fluid style={{ padding: '2rem' }}>
      <Row className="mt-3">
        <Col>
          <h2>Mapa del Conductor</h2>
          <Button variant={tracking ? 'danger' : 'success'} onClick={handleToggleTracking}>
            {tracking ? 'Detener Ruta' : 'Iniciar Ruta'}
          </Button>{' '}
          <Button variant="info" onClick={handleCenterMap}>Centrar en mi ubicación</Button>
        </Col>
      </Row>
      <Row>
        {/* Mapa */}
        <Col md={9}>
          <MapContainer center={center} zoom={10} style={{ height: '80vh' }}>
            <SetMapInstance setMapInstance={setMapInstance} />
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="© OpenStreetMap contributors"
            />

            {/* Ubicación del conductor */}
            {conductorPos && (
              <Marker position={conductorPos} icon={conductorIcon}>
                <Popup>Tu ubicación actual</Popup>
              </Marker>
            )}

            {/* Rutas */}
            {rutas.map(r =>
              Array.isArray(r.coordenadas) ? (
                <Polyline
                  key={r.id}
                  positions={r.coordenadas.map(c => [c.lat, c.lng])}
                  color={getColor(r.tipo)}
                />
              ) : null
            )}

            {/* Alertas */}
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

            {/* Mis hoteles */}
            {myHotels.map(h => (
              <Marker key={h.id} position={[h.lat, h.lng]} icon={hotelIcon}>
                <Popup>{h.nombre}</Popup>
              </Marker>
            ))}
          </MapContainer>
        </Col>

        {/* Panel lateral */}
        <Col md={3}>
          <h4>Buscar Hoteles</h4>
          <Form onSubmit={handleSearchHotels}>
            <FormControl
              type="text"
              placeholder="Nombre del hotel"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <Button variant="primary" type="submit" className="mt-2">Buscar</Button>
          </Form>
          {loadingSearch && <Spinner animation="border" className="my-2" />}
          {searchResults.length > 0 && (
            <ListGroup className="mt-2">
              {searchResults.map(h => (
                <ListGroup.Item key={h.id} className="d-flex justify-content-between">
                  {h.nombre}
                  <Button size="sm" onClick={() => handleAddToMyHotels(h)}>Agregar</Button>
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}

          <h4 className="mt-4">Mis Hoteles</h4>
          {myHotels.length === 0 ? (
            <Alert variant="info">No has agregado ningún hotel aún.</Alert>
          ) : (
            <ListGroup>
              {myHotels.map(h => (
                <ListGroup.Item key={h.id} className="d-flex justify-content-between">
                  {h.nombre}
                  <Button variant="danger" size="sm" onClick={() => handleRemoveFromMyHotels(h.id)}>
                    Quitar
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
