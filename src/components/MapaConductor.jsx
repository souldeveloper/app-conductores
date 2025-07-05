import React, { useEffect, useState, useRef, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import Cookies from 'js-cookie';

import {
  Container,
  Row,
  Col,
  Button,
  Form,
  FormControl,
  ListGroup,
  Spinner,
  Alert,
  Dropdown
} from 'react-bootstrap';
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  useMap
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-polylinedecorator';

// Firebase imports
import { db } from '../firebaseConfig';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';

// Datos estáticos
import rutasData from '../datos/rutas.json';
import alertasData from '../datos/alertas.json';
import hotelesData from '../datos/hoteles.json';
import direccionesData from '../datos/direcciones.json';

// Íconos
const alertaIcon = L.icon({ iconUrl: '/iconos/alerta.png', iconSize: [25, 25], iconAnchor: [12, 12] });
const puntoRecogidaIcon = L.icon({ iconUrl: '/iconos/guia.png', iconSize: [25, 25], iconAnchor: [12, 12] });
const hotelIcon = L.icon({ iconUrl: '/iconos/hotel.png', iconSize: [25, 25], iconAnchor: [12, 12] });
const conductorIcon = L.icon({ iconUrl: '/iconos/bus.png', iconSize: [35, 35], iconAnchor: [17, 17] });
const zoomLevels = [14, 15, 16, 17, 18];

// Flechas en la ruta
const ArrowedLine = ({ positions }) => {
  const map = useMap();
  const decoratorRef = useRef(null);
  const polyRef = useRef(null);

  useEffect(() => {
    const updateArrows = () => {
      if (decoratorRef.current) map.removeLayer(decoratorRef.current);
      if (polyRef.current) map.removeLayer(polyRef.current);
      const poly = L.polyline(positions, { opacity: 0 }).addTo(map);
      const decorator = L.polylineDecorator(poly, {
        patterns: [{
          offset: '100%',
          repeat: 0,
          symbol: L.Symbol.arrowHead({ pixelSize: map.getZoom() * 0.8, polygon: false, pathOptions: { stroke: true } })
        }]
      }).addTo(map);
      polyRef.current = poly;
      decoratorRef.current = decorator;
    };
    map.on('zoomend', updateArrows);
    updateArrows();
    return () => {
      map.off('zoomend', updateArrows);
      if (decoratorRef.current) map.removeLayer(decoratorRef.current);
      if (polyRef.current) map.removeLayer(polyRef.current);
    };
  }, [map, positions]);

  return null;
};

// Capturar instancia del mapa
const SetMapInstance = ({ setMapInstance }) => {
  const map = useMap();
  useEffect(() => { setMapInstance(map); }, [map, setMapInstance]);
  return null;
};

const MapaConductorAdminFirebase = () => {
  const navigate = useNavigate();
  const currentUser = Cookies.get('currentUser');
  const isAdmin = currentUser === 'admimanuel' || currentUser === 'adminjose';



  // Estados comunes
  const [rutas, setRutas] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [allHotels, setAllHotels] = useState([]);
  const [direcciones, setDirecciones] = useState([]);

  // Firestore: listas y hoteles
  const [hotelLists, setHotelLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState(null);

  // Búsqueda y reordenamiento
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [positionInputs, setPositionInputs] = useState({});

  // Mapa y tracking
  const [mapInstance, setMapInstance] = useState(null);
  const [conductorPos, setConductorPos] = useState(null);
  const [tracking, setTracking] = useState(false);
  const [showZoomButtons, setShowZoomButtons] = useState(true);
  const watchIdRef = useRef(null);

  // Cargar datos estáticos
  useEffect(() => {
    setRutas(Object.entries(rutasData).map(([id, val]) => ({ id, tipo: val.tipo, coordenadas: val.coordenadas.map(c => [c.lat, c.lng]) })));
    setAlertas(Object.entries(alertasData).map(([id, val]) => ({ id, tipo: val.tipo, title: val.title, description: val.description, coordenadas: [val.coordenadas.lat, val.coordenadas.lng] })));
    setAllHotels(Object.entries(hotelesData).map(([id, val]) => ({ id, nombre: val.nombre, lat: val.lat, lng: val.lng, tipo: val.tipo })));
    setDirecciones(Object.entries(direccionesData).map(([id, val]) => ({ id, coords: val.coords.map(c => [c.lat, c.lng]) })));
  }, []);

  // CRUD Firestore para listas
  useEffect(() => {
    if (!isAdmin) return;
    const listsRef = collection(db, 'hotelLists');
    const q = query(listsRef, where('owner', '==', currentUser));
    const unsubscribe = onSnapshot(q, snapshot => {
      const lists = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setHotelLists(lists);
      if (!selectedListId && lists.length) setSelectedListId(lists[0].id);
    });
    return () => unsubscribe();
  }, [isAdmin, currentUser, selectedListId]);

  const addList = async () => {
    const name = prompt('Nueva lista:');
    if (!name) return;
    await addDoc(collection(db, 'hotelLists'), { name, owner: currentUser, hotelIds: [] });
  };
  const removeList = async id => {
    await deleteDoc(doc(db, 'hotelLists', id));
    if (selectedListId === id) setSelectedListId(null);
  };
  const selectList = id => setSelectedListId(id);

  const currentList = hotelLists.find(l => l.id === selectedListId);
  const myHotels = currentList?.hotelIds
    .map(id => allHotels.find(h => h.id === id))
    .filter(Boolean) || [];

  const addHotel = async h => {
    if (!currentList.hotelIds.includes(h.id)) {
      await updateDoc(doc(db, 'hotelLists', currentList.id), { hotelIds: arrayUnion(h.id) });
    }
  };
  const removeHotel = async id => {
    await updateDoc(doc(db, 'hotelLists', currentList.id), { hotelIds: arrayRemove(id) });
  };
  const reorderHotel = async (id, newPos) => {
    const ordered = [...currentList.hotelIds];
    const idx = ordered.indexOf(id);
    ordered.splice(idx, 1);
    ordered.splice(newPos - 1, 0, id);
    await updateDoc(doc(db, 'hotelLists', currentList.id), { hotelIds: ordered });
    setPositionInputs(p => ({ ...p, [id]: '' }));
  };

  // Búsqueda local
  const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const handleSearch = e => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoadingSearch(true);
    const q = normalize(searchQuery);
    setSearchResults(allHotels.filter(h => normalize(h.nombre).includes(q)).slice(0, 1000));
    setLoadingSearch(false);
  };
  const clearSearch = () => { setSearchQuery(''); setSearchResults([]); };

  // Tracking GPS
  const toggleTracking = () => {
    if (!tracking && navigator.geolocation) {
      setTracking(true);
      watchIdRef.current = navigator.geolocation.watchPosition(
        pos => setConductorPos([pos.coords.latitude, pos.coords.longitude]),
        err => console.error(err),
        { enableHighAccuracy: true, maximumAge: 0 }
      );
    } else {
      setTracking(false);
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    }
  };
  useEffect(() => { if (conductorPos && mapInstance) mapInstance.panTo(conductorPos); }, [conductorPos, mapInstance]);

  const logout = () => {
    Cookies.remove('currentUser');
    Cookies.remove('deviceUid');
    navigate('/');
  };

  const getColor = tipo => {
    switch (tipo) {
      case 'segura': return 'green';
      case 'advertencia': return 'yellow';
      case 'prohibida': return 'red';
      case 'informativa': return 'blue';
      default: return 'blue';
    }
  };

  return (
    <Container fluid className="p-3">
      <Row className="mb-3">
        <Col>
          <Button variant={tracking ? 'danger' : 'success'} onClick={toggleTracking}>
            {tracking ? 'Detener Ruta' : 'Iniciar Ruta'}
          </Button>{' '}
          <Button variant="info" onClick={() => setShowZoomButtons(v => !v)}>Zooms</Button>{' '}
        </Col>
        <Col>
          <Dropdown className="d-inline me-2">
            <Dropdown.Toggle variant="secondary">
              {currentList?.name || 'Lista'}
            </Dropdown.Toggle>
            <Dropdown.Menu style={{ minWidth: 200 }}>
              {hotelLists.map(l => (
                <div key={l.id} className="d-flex justify-content-between align-items-center px-2">
                  <span onClick={() => selectList(l.id)} style={{ cursor: 'pointer', flex: 1 }}>{l.name}</span>
                  <Button variant="link" size="sm" onClick={() => removeList(l.id)}>🗑</Button>
                </div>
              ))}
            </Dropdown.Menu>
          </Dropdown>
          <Button size="sm" onClick={addList}>+ Añadir Lista</Button>
        </Col>
      </Row>

      <Row className="mb-3">
        
      </Row>

      <Row>
        <Col style={{ position: 'relative', width: '80vw', height: '80vh' }}>
          <MapContainer center={[39.6908, 2.9271]} zoom={10} style={{ width: '95%', height: '100%' }} scrollWheelZoom zoomControl={false} maxZoom={18}>
            <SetMapInstance setMapInstance={setMapInstance} />
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap contributors" />
            {showZoomButtons && mapInstance && (
              <div style={{ position: 'absolute', top: 200, left: 10, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {zoomLevels.map((z, i) => (
                  <Button key={i} size="sm" onClick={() => mapInstance.setZoom(z)} style={{ borderRadius: '50%', width: 32, height: 32, padding: 0 }} title={`Zoom ${z}`}>{i + 1}</Button>
                ))}
              </div>
            )}
            {conductorPos && <Marker position={conductorPos} icon={conductorIcon}><Popup>Tu ubicación</Popup></Marker>}
            {rutas.map(r => <Polyline key={r.id} positions={r.coordenadas} color={getColor(r.tipo)} />)}
            {alertas.map(a => (
              <Marker key={a.id} position={a.coordenadas} icon={a.tipo === 'puntoRecogida' ? puntoRecogidaIcon : alertaIcon}>
                <Popup>
                  <h5>{a.title}</h5>
                  <p>{a.description}</p>
                </Popup>
              </Marker>
            ))}
            {myHotels.map((h, idx) => (
              <Marker key={h.id} position={[h.lat, h.lng]} icon={L.divIcon({ html: `<div style="position:relative;display:inline-block;"><img src="/iconos/${h.tipo === 'hotel_vial' ? 'hotel_azul' : 'hotel'}.png" style="width:32px;height:32px;"/><span style="position:absolute;top:-6px;right:-6px;font-size:14px;background:white;border:1px solid rgba(0,0,0,0.3);border-radius:50%;padding:1px 3px;">${idx + 1}</span></div>`, iconSize: [25, 25], iconAnchor: [12, 12] })}>
                <Popup>
                  <div>
                    <h5>{h.nombre}</h5>
                    <Form onSubmit={e => e.preventDefault()} className="d-flex">
                      <FormControl type="number" min="1" max={myHotels.length} placeholder="Posición" value={positionInputs[h.id] || ''} onChange={e => setPositionInputs(p => ({ ...p, [h.id]: e.target.value }))} style={{ width: 80, marginRight: '0.5rem' }} />
                      <Button size="sm" onClick={() => { const p = parseInt(positionInputs[h.id], 10); if (!p || p < 1 || p > myHotels.length) alert(`1–${myHotels.length}`); else reorderHotel(h.id, p); }}>Asignar</Button>
                    </Form>
                  </div>
                </Popup>
              </Marker>
            ))}
            {direcciones.map(d => (
              <Fragment key={d.id}>
                <Polyline positions={d.coords} pathOptions={{ color: 'black', dashArray: '5,10' }} />
                <ArrowedLine positions={d.coords} />
              </Fragment>
            ))}
          </MapContainer>
        </Col>
        <Col md={3} className="mt-3 mt-md-0 px-2">
          <h4>Buscar Hoteles</h4>
          <Form onSubmit={handleSearch} className="d-flex mb-3">
            <FormControl type="text" placeholder="Nombre del hotel" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            <Button variant="primary" type="submit" className="ms-2">Buscar</Button>
            <Button variant="secondary" type="button" className="ms-2" onClick={clearSearch}>Limpiar</Button>
          </Form>
          {loadingSearch && <Spinner animation="border" className="d-block mx-auto mb-3" />}
          {searchResults.length > 0 && (
            <ListGroup className="mb-4">
              {searchResults.map(h => (
                <ListGroup.Item key={h.id} className="d-flex justify-content-between align-items-center">{h.nombre}<Button size="sm" onClick={() => addHotel(h)}>Agregar</Button></ListGroup.Item>
              ))}
            </ListGroup>
          )}

          <h4>Mis Hoteles — {currentList?.name}</h4>
          {myHotels.length === 0 ? (
            <Alert variant="info">No has agregado ningún hotel aún.</Alert>
          ) : (
            <ListGroup>
              {myHotels.map((h, idx) => (
                <ListGroup.Item key={h.id} className="mb-2 p-0 border-0 d-flex">
                  <div onClick={() => { }} style={{ flex: 1, padding: '1rem', cursor: 'default' }}>
                    {idx + 1}. {h.nombre}
                  </div>
                  <Button variant="danger" size="sm" onClick={() => removeHotel(h.id)} className="ms-2">Quitar</Button>
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}
        </Col>
      </Row>
    </Container>
  );
};

export default MapaConductorAdminFirebase;
