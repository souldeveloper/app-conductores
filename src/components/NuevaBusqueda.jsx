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
import { collection, onSnapshot, doc, deleteDoc, setDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import Cookies from 'js-cookie';
import L from 'leaflet';

// Componente auxiliar para capturar la instancia del mapa
const SetMapInstance = ({ setMapInstance }) => {
  const map = useMap();
  useEffect(() => {
    setMapInstance(map);
    console.log('Map instance captured:', map);
  }, [map, setMapInstance]);
  return null;
};

// Definición de íconos
const alertaIcon = L.icon({
  iconUrl: '/iconos/alerta.png',
  iconSize: [25, 25],
  iconAnchor: [12, 12]
});
const puntoRecogidaIcon = L.icon({
  iconUrl: '/iconos/recogida.png',
  iconSize: [25, 25],
  iconAnchor: [12, 12]
});
const hotelIcon = L.icon({
  iconUrl: '/iconos/hotel.png',
  iconSize: [25, 25],
  iconAnchor: [12, 12]
});
const conductorIcon = L.icon({
  iconUrl: '/iconos/bus.png',
  iconSize: [35, 35],
  iconAnchor: [17, 17]
});

const getColor = (tipo) => {
  switch (tipo) {
    case 'segura': return 'green';
    case 'advertencia': return 'yellow';
    case 'prohibida': return 'red';
    default: return 'blue';
  }
};

const DATA_VERSION_KEY = 'appDataVersion';

const MapaConductor = () => {
  const navigate = useNavigate();

  // Estados
  const [rutas, setRutas] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [hoteles, setHoteles] = useState([]);
  const [selectedHotelId, setSelectedHotelId] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [center, setCenter] = useState([39.69082068945872, 2.9271513449310866]);
  const [mapInstance, setMapInstance] = useState(null);
  const [conductorPos, setConductorPos] = useState(null);
  const [tracking, setTracking] = useState(false);
  const [conductor, setConductor] = useState(null);
  const [tempLine, setTempLine] = useState(null);
  const watchIdRef = useRef(null);

  // --- 1. Validación de sesión ---
  useEffect(() => {
    const currentUserStr = Cookies.get('currentUser');
    const localDeviceUid = Cookies.get('deviceUid');
    if (!currentUserStr || !localDeviceUid) {
      navigate('/');
      return;
    }
    let currentUser;
    try {
      currentUser = JSON.parse(currentUserStr);
    } catch (err) {
      console.error('Error parsing currentUser:', err);
      navigate('/');
      return;
    }
    if (!currentUser) {
      navigate('/');
      return;
    }
    const userDocRef = doc(db, 'usuarios', currentUser.id);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const userData = docSnap.data();
        if (userData.deviceUid !== localDeviceUid) {
          Cookies.remove('currentUser');
          navigate('/');
          return;
        }
        setConductor({ id: docSnap.id, ...userData });
      } else {
        Cookies.remove('currentUser');
        navigate('/');
      }
    }, (error) => {
      console.error('Error validating user:', error);
      navigate('/');
    });
    return () => unsubscribe();
  }, [navigate]);

  // --- 2. Hoteles del conductor en tiempo real ---
  useEffect(() => {
    if (!conductor) return;
    const ref = collection(db, `usuarios/${conductor.id}/hoteles`);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setHoteles(data);
    }, (err) => console.error("Error loading hotels:", err));
    return () => unsub();
  }, [conductor]);

  // --- 3. Versionado + carga de rutas y alertas ---
  useEffect(() => {
    async function loadData() {
      try {
        const { dataVersion: remoteVer } = await fetch('/api/version').then(r => r.json());
        const localVer = localStorage.getItem(DATA_VERSION_KEY);
        if (!localVer || remoteVer !== localVer) {
          console.log('Datos nuevos disponibles, descargando paquete...');
          const { rutas: nuevasRutas, alertas: nuevasAlertas } = await fetch('/api/rutasAlertas').then(r => r.json());
          localStorage.setItem('rutasCache', JSON.stringify(nuevasRutas));
          localStorage.setItem('alertasCache', JSON.stringify(nuevasAlertas));
          localStorage.setItem(DATA_VERSION_KEY, remoteVer);
          setRutas(nuevasRutas);
          setAlertas(nuevasAlertas);
        } else {
          const cachedRutas = JSON.parse(localStorage.getItem('rutasCache') || '[]');
          const cachedAlertas = JSON.parse(localStorage.getItem('alertasCache') || '[]');
          setRutas(cachedRutas);
          setAlertas(cachedAlertas);
          console.log('Datos cargados desde caché, versión', localVer);
        }
      } catch (err) {
        console.error('Error cargando datos versionados:', err);
      }
    }
    loadData();
  }, []);

  // --- 4. Control del mapa y geolocalización ---
  const handleCenterMap = () => {
    if (mapInstance && conductorPos) {
      mapInstance.panTo(conductorPos, { animate: true });
    }
  };
  useEffect(() => {
    if (conductorPos && mapInstance) {
      mapInstance.panTo(conductorPos, { animate: true });
    }
  }, [conductorPos, mapInstance]);
  const handleToggleTracking = () => {
    if (!tracking && navigator.geolocation) {
      setTracking(true);
      watchIdRef.current = navigator.geolocation.watchPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        setConductorPos([latitude, longitude]);
      }, (err) => console.error('Error obtaining location:', err), { enableHighAccuracy: true, maximumAge: 0 });
    } else {
      setTracking(false);
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    }
  };

  // --- 5. Búsqueda y gestión de hoteles ---
  const handleSearchHotels = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoadingSearch(true);
    try {
      const snap = await getDocs(collection(db, 'hoteles'));
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const filt = all.filter(h => h.nombre?.toLowerCase().includes(searchQuery.toLowerCase()));
      setSearchResults(filt.map(h => ({ displayName: h.nombre, lat: h.lat, lng: h.lng })));
    } catch (err) {
      console.error('Error searching hotels:', err);
    }
    setLoadingSearch(false);
  };
  const handleAddHotel = async (hotel) => {
    if (!conductor) return;
    const ordenes = hoteles.map(h => h.orden || 0);
    const next = ordenes.length ? Math.max(...ordenes) + 1 : 1;
    try {
      await setDoc(doc(collection(db, `usuarios/${conductor.id}/hoteles`)), { nombre: hotel.displayName, lat: hotel.lat, lng: hotel.lng, orden: next });
    } catch (err) {
      console.error('Error adding hotel:', err);
    }
  };
  const handleDeleteHotel = async (id) => { await deleteDoc(doc(db, `usuarios/${conductor.id}/hoteles`, id)); };
  const handleMoveUp = async (hotel) => {
    const sorted = [...hoteles].sort((a,b)=> (a.orden||0)-(b.orden||0));
    const idx = sorted.findIndex(h=>h.id===hotel.id);
    if (idx>0) {
      const prev = sorted[idx-1];
      await setDoc(doc(db, `usuarios/${conductor.id}/hoteles`, hotel.id), {...hotel, orden: prev.orden});
      await setDoc(doc(db, `usuarios/${conductor.id}/hoteles`, prev.id), {...prev, orden: hotel.orden});
    }
  };
  const handleMoveDown = async (hotel) => {
    const sorted = [...hoteles].sort((a,b)=> (a.orden||0)-(b.orden||0));
    const idx = sorted.findIndex(h=>h.id===hotel.id);
    if (idx < sorted.length-1) {
      const next = sorted[idx+1];
      await setDoc(doc(db, `usuarios/${conductor.id}/hoteles`, hotel.id), {...hotel, orden: next.orden});
      await setDoc(doc(db, `usuarios/${conductor.id}/hoteles`, next.id), {...next, orden: hotel.orden});
    }
  };
  const handleSelectHotel = (id) => setSelectedHotelId(selectedHotelId===id?null:id);

  // Render
  const sortedHoteles = [...hoteles].sort((a,b)=> (a.orden||0)-(b.orden||0));
  const displayed = selectedHotelId ? sortedHoteles.filter(h=>h.id===selectedHotelId) : sortedHoteles;

  return (
    <Container fluid style={{ padding: '2rem'}}>
      <Row className="mt-3">
        <Col><h2>Mapa del Conductor</h2>
          <Button variant={tracking? 'danger':'success'} onClick={handleToggleTracking} className="mb-2">
            {tracking? 'Detener Ruta':'Iniciar Ruta'}
          </Button>
          <Button variant="info" onClick={handleCenterMap} className="mb-2 ms-2">Centrar en mi ubicación</Button>
        </Col>
      </Row>
      <Row>
        <Col md={9}>
          <MapContainer center={center} zoom={10} style={{ height:'80vh' }}>
            <SetMapInstance setMapInstance={setMapInstance} />
            <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            {conductorPos && <Marker position={conductorPos} icon={conductorIcon}><Popup>Tu ubicación</Popup></Marker>}
            {rutas.map(r => Array.isArray(r.coordenadas) && <Polyline key={r.id} positions={r.coordenadas.map(c=>[c.lat,c.lng])} color={getColor(r.tipo)} />)}
            {alertas.map(a => a.coordenadas && <Marker key={a.id} position={[a.coordenadas.lat,a.coordenadas.lng]} icon={a.tipo==='puntoRecogida'? puntoRecogidaIcon: alertaIcon}><Popup><h5>{a.title||'Sin título'}</h5><p>{a.description||'Sin descripción'}</p></Popup></Marker>)}
            {displayed.map(h=> <Marker key={h.id} position={[h.lat,h.lng]} icon={hotelIcon} eventHandlers={{ click: ()=> handleSelectHotel(h.id) }}><Popup><h5>{h.nombre}</h5><Button variant="danger" size="sm" onClick={()=>handleDeleteHotel(h.id)}>Eliminar</Button></Popup></Marker>)}
            {tempLine && <Polyline positions={tempLine} color="purple" dashArray="5,10" />}
          </MapContainer>
        </Col>
        <Col md={3}>
          <h4>Buscar Hoteles</h4>
          <Form onSubmit={handleSearchHotels}>
            <FormControl type="text" placeholder="Nombre del hotel" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} />
            <Button type="submit" variant="primary" className="mt-2">Buscar</Button>
          </Form>
          {loadingSearch && <Spinner animation="border" className="my-2" />}
          {searchResults.length>0 && <ListGroup className="mt-2">{searchResults.map((res,i)=><ListGroup.Item key={i} action onClick={()=>handleAddHotel(res)}>{res.displayName} <Button variant="success" size="sm" className="float-end">+</Button></ListGroup.Item>)}</ListGroup>}
          <h4 className="mt-4">Mis Hoteles</h4>
          {displayed.length===0 && <Alert variant="info">No hay hoteles agregados.</Alert>}
          {displayed.length>0 && <Table striped bordered hover size="sm"><thead><tr><th>Nombre</th><th>Orden</th><th>Acciones</th></tr></thead><tbody>{sortedHoteles.map(h=><tr key={h.id} onClick={()=>handleSelectHotel(h.id)} style={{cursor:'pointer', backgroundColor:selectedHotelId===h.id?'#e0e0e0':'inherit'}}><td>{h.nombre}</td><td>{h.orden}</td><td><Button size="sm" onClick={e=>{e.stopPropagation();handleMoveUp(h)}}>↑</Button>{' '}<Button size="sm" onClick={e=>{e.stopPropagation();handleMoveDown(h)}}>↓</Button>{' '}<Button variant="danger" size="sm" onClick={e=>{e.stopPropagation();handleDeleteHotel(h.id)}}>Eliminar</Button></td></tr>)}</tbody></Table>}
        </Col>
      </Row>
    </Container>
  );
};

export default MapaConductor;
