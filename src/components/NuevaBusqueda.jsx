import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Row,
  Col,
  Button,
  Table,
  Alert,
  Form,
  FormControl,
  ListGroup,
  Spinner
} from 'react-bootstrap';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import { doc, collection, deleteDoc, setDoc, getDocs, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import Cookies from 'js-cookie';
import L from 'leaflet';

// Captura la instancia del mapa
const SetMapInstance = ({ setMapInstance }) => {
  const map = useMap();
  useEffect(() => {
    setMapInstance(map);
  }, [map, setMapInstance]);
  return null;
};

// Íconos
const alertaIcon = L.icon({ iconUrl: '/iconos/alerta.png', iconSize: [25,25], iconAnchor: [12,12] });
const puntoRecogidaIcon = L.icon({ iconUrl: '/iconos/recogida.png', iconSize: [25,25], iconAnchor: [12,12] });
const hotelIcon = L.icon({ iconUrl: '/iconos/hotel.png', iconSize: [25,25], iconAnchor: [12,12] });
const conductorIcon = L.icon({ iconUrl: '/iconos/bus.png', iconSize: [35,35], iconAnchor: [17,17] });

const getColor = tipo => {
  switch(tipo) {
    case 'segura': return 'green';
    case 'advertencia': return 'yellow';
    case 'prohibida': return 'red';
    default: return 'blue';
  }
};

// Claves para caché
const DATA_VERSION_KEY   = 'dataVersion';
const HOTELS_CACHE_KEY   = 'hotelesCache';

const MapaConductor = () => {
  const navigate = useNavigate();

  // Estados principales
  const [rutas, setRutas]                   = useState([]);
  const [alertas, setAlertas]               = useState([]);
  const [hoteles, setHoteles]               = useState([]);
  const [allHotels, setAllHotels]           = useState([]); // Catálogo global
  const [selectedHotelId, setSelectedHotelId] = useState(null);
  const [searchResults, setSearchResults]     = useState([]);
  const [searchQuery, setSearchQuery]         = useState('');
  const [loadingSearch, setLoadingSearch]     = useState(false);
  const [center]                              = useState([39.6908, 2.9271]);
  const [mapInstance, setMapInstance]         = useState(null);
  const [conductorPos, setConductorPos]       = useState(null);
  const [tracking, setTracking]               = useState(false);
  const [conductor, setConductor]             = useState(null);
  const [tempLine, setTempLine]               = useState(null);

  const watchIdRef      = useRef(null);

  // 1. Validación de sesión
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
      setConductor({ id: snap.id, ...data });
    }, err => {
      console.error(err);
      navigate('/');
    });
    return () => unsub();
  }, [navigate]);

  // 2. Carga global de hoteles para búsqueda (solo una vez)
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'hoteles'));
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAllHotels(list);
      } catch (err) {
        console.error('Error cargando catálogo de hoteles:', err);
      }
    })();
  }, []);

  // 3. Versionado y carga de appData (rutas, alertas y hoteles)
  useEffect(() => {
    if (!conductor) return;
    const loadAppData = async () => {
      try {
        // Obtener versión remota
        const versionRef = doc(db, 'config', 'appData');
        const versionSnap = await getDoc(versionRef);
        if (!versionSnap.exists()) return;
        const remoteVer = versionSnap.data().version;
        const localVer = localStorage.getItem(DATA_VERSION_KEY);

        if (localVer !== remoteVer) {
          // Nueva versión: limpiar cachés
          localStorage.setItem(DATA_VERSION_KEY, remoteVer);
          localStorage.removeItem('rutasCache');
          localStorage.removeItem('alertasCache');
          localStorage.removeItem(HOTELS_CACHE_KEY);

          // Cargar rutas y alertas desde API
          const raRes = await fetch('/api/rutasAlertas', { cache: 'force-cache' });
          const { rutas: newRutas, alertas: newAlertas } = await raRes.json();
          setRutas(newRutas);
          setAlertas(newAlertas);
          localStorage.setItem('rutasCache', JSON.stringify(newRutas));
          localStorage.setItem('alertasCache', JSON.stringify(newAlertas));

          // Cargar hoteles desde API
          const hRes = await fetch(`/api/hoteles?userId=${conductor.id}`, { cache: 'force-cache' });
          const { hoteles: newHoteles } = await hRes.json();
          setHoteles(newHoteles);
          localStorage.setItem(HOTELS_CACHE_KEY, JSON.stringify(newHoteles));
        } else {
          // Misma versión: cargar desde caché
          setRutas(JSON.parse(localStorage.getItem('rutasCache') || '[]'));
          setAlertas(JSON.parse(localStorage.getItem('alertasCache') || '[]'));
          setHoteles(JSON.parse(localStorage.getItem(HOTELS_CACHE_KEY) || '[]'));
        }
      } catch (err) {
        console.error('Error cargando appData:', err);
      }
    };
    loadAppData();
  }, [conductor]);

  // CRUD de hoteles en Firestore & actualización de caché
  const handleAddHotel = async hotel => {
    if (!conductor) return;
    const ordenes = hoteles.map(h => h.orden || 0);
    const next = ordenes.length ? Math.max(...ordenes) + 1 : 1;
    const ref = doc(collection(db, `usuarios/${conductor.id}/hoteles`));
    await setDoc(ref, { nombre: hotel.displayName, lat: hotel.lat, lng: hotel.lng, orden: next });
    const updated = [...hoteles, { id: ref.id, nombre: hotel.displayName, lat: hotel.lat, lng: hotel.lng, orden: next }];
    setHoteles(updated);
    localStorage.setItem(HOTELS_CACHE_KEY, JSON.stringify(updated));
  };

  const handleDeleteHotel = async id => {
    if (!conductor) return;
    await deleteDoc(doc(db, `usuarios/${conductor.id}/hoteles`, id));
    const updated = hoteles.filter(h => h.id !== id);
    setHoteles(updated);
    localStorage.setItem(HOTELS_CACHE_KEY, JSON.stringify(updated));
  };

  const handleMoveUp = async hotel => {
    if (!conductor) return;
    const sorted = [...hoteles].sort((a,b)=>(a.orden||0)-(b.orden||0));
    const idx = sorted.findIndex(h=>h.id===hotel.id);
    if (idx<=0) return;
    const prev = sorted[idx-1];
    await Promise.all([
      setDoc(doc(db, `usuarios/${conductor.id}/hoteles`, hotel.id), { ...hotel, orden: prev.orden }),
      setDoc(doc(db, `usuarios/${conductor.id}/hoteles`, prev.id), { ...prev, orden: hotel.orden })
    ]);
    const updated = hoteles.map(h =>
      h.id===hotel.id?{...h,orden:prev.orden}:
      h.id===prev.id?{...h,orden:hotel.orden}:h
    );
    setHoteles(updated);
    localStorage.setItem(HOTELS_CACHE_KEY, JSON.stringify(updated));
  };

  const handleMoveDown = async hotel => {
    if (!conductor) return;
    const sorted = [...hoteles].sort((a,b)=>(a.orden||0)-(b.orden||0));
    const idx = sorted.findIndex(h=>h.id===hotel.id);
    if (idx===-1||idx>=sorted.length-1) return;
    const nextH = sorted[idx+1];
    await Promise.all([
      setDoc(doc(db, `usuarios/${conductor.id}/hoteles`, hotel.id), { ...hotel, orden: nextH.orden }),
      setDoc(doc(db, `usuarios/${conductor.id}/hoteles`, nextH.id), { ...nextH, orden: hotel.orden })
    ]);
    const updated = hoteles.map(h =>
      h.id===hotel.id?{...h,orden:nextH.orden}:
      h.id===nextH.id?{...h,orden:hotel.orden}:h
    );
    setHoteles(updated);
    localStorage.setItem(HOTELS_CACHE_KEY, JSON.stringify(updated));
  };

  // Geolocalización y mapa
  const handleCenterMap = () => {
    if (mapInstance && conductorPos) {
      mapInstance.panTo(conductorPos, { animate: true });
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
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    }
  };
  useEffect(() => {
    if (conductorPos && mapInstance) {
      mapInstance.panTo(conductorPos, { animate: true });
    }
  }, [conductorPos, mapInstance]);

  // Búsqueda de hoteles (client-side)
  const handleSearchHotels = e => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoadingSearch(true);
    const lower = searchQuery.toLowerCase();
    const results = allHotels
      .filter(h => h.nombre.toLowerCase().includes(lower))
      .slice(0, 10)
      .map(h => ({ displayName: h.nombre, lat: h.lat, lng: h.lng }));
    setSearchResults(results);
    setLoadingSearch(false);
  };

  // Renderizado final
  const sortedHoteles = [...hoteles].sort((a,b)=>(a.orden||0)-(b.orden||0));
  const displayed     = selectedHotelId
                        ? sortedHoteles.filter(h=>h.id===selectedHotelId)
                        : sortedHoteles;

  return (
    <Container fluid style={{ padding: '2rem' }}>
      <Row className="mt-3">
        <Col>
          <h2>Mapa del Conductor</h2>
          <Button variant={tracking?'danger':'success'} onClick={handleToggleTracking}>
            {tracking?'Detener Ruta':'Iniciar Ruta'}
          </Button>{' '}
          <Button variant="info" onClick={handleCenterMap}>
            Centrar en mi ubicación
          </Button>
        </Col>
      </Row>
      <Row>
        {/* Mapa */}
        <Col md={9}>
          <MapContainer center={center} zoom={10} style={{ height: '80vh' }}>
            <SetMapInstance setMapInstance={setMapInstance}/>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="© OpenStreetMap contributors"
            />
            {conductorPos && (
              <Marker position={conductorPos} icon={conductorIcon}>
                <Popup>Tu ubicación actual</Popup>
              </Marker>
            )}
            {rutas.map(r=>Array.isArray(r.coordenadas)&&(
              <Polyline
                key={r.id}
                positions={r.coordenadas.map(c=>[c.lat,c.lng])}
                color={getColor(r.tipo)}
              />
            ))}
            {alertas.map(a=>a.coordenadas&&(
              <Marker
                key={a.id}
                position={[a.coordenadas.lat,a.coordenadas.lng]}
                icon={a.tipo==='puntoRecogida'? puntoRecogidaIcon: alertaIcon}
              >
                <Popup>
                  <h5>{a.title||'Sin título'}</h5>
                  <p>{a.description||'Sin descripción'}</p>
                </Popup>
              </Marker>
            ))}
            {displayed.map(h=>(
              <Marker
                key={h.id}
                position={[h.lat,h.lng]}
                icon={hotelIcon}
                eventHandlers={{ click: ()=>setSelectedHotelId(h.id) }}
              >
                <Popup>
                  <h5>{h.nombre}</h5>
                  <Button variant="danger" size="sm" onClick={()=>handleDeleteHotel(h.id)}>
                    Eliminar
                  </Button>
                </Popup>
              </Marker>
            ))}
            {tempLine && <Polyline positions={tempLine} color="purple" dashArray="5,10"/>}
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
              onChange={e=>setSearchQuery(e.target.value)}
            />
            <Button variant="primary" type="submit" className="mt-2">Buscar</Button>
          </Form>
          {loadingSearch && <Spinner animation="border" className="my-2"/>}
          {searchResults.length>0 && (
            <ListGroup className="mt-2">
              {searchResults.map((res,i)=>(
                <ListGroup.Item key={i} className="d-flex justify-content-between">
                  {res.displayName}
                  <Button variant="success" size="sm" onClick={()=>handleAddHotel(res)}>+</Button>
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}
          <h4 className="mt-4">Mis Hoteles</h4>
          {displayed.length===0
            ? <Alert variant="info">No hay hoteles agregados.</Alert>
            : (
              <Table striped bordered hover size="sm">
                <thead>
                  <tr><th>Nombre</th><th>Orden</th><th>Acciones</th></tr>
                </thead>
                <tbody>
                  {sortedHoteles.map(h=>(
                    <tr
                      key={h.id}
                      onClick={()=>setSelectedHotelId(h.id)}
                      style={{ cursor:'pointer', backgroundColor:selectedHotelId===h.id?'#e0e0e0':'inherit' }}
                    >
                      <td>{h.nombre}</td>
                      <td>{h.orden}</td>
                      <td>
                        <Button size="sm" onClick={e=>{e.stopPropagation();handleMoveUp(h);}}>↑</Button>{' '}
                        <Button size="sm" onClick={e=>{e.stopPropagation();handleMoveDown(h);}}>↓</Button>{' '}
                        <Button variant="danger" size="sm" onClick={e=>{e.stopPropagation();handleDeleteHotel(h.id);}}>
                          Eliminar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )
          }
        </Col>
      </Row>
    </Container>
  );
};

export default MapaConductor;
