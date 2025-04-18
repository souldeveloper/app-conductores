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
import Cookies from 'js-cookie';
import L from 'leaflet';

// importamos los JSON desde la carpeta datos
import rutasData   from '../datos/rutas.json';
import alertasData from '../datos/alertas.json';
import hotelesData from '../datos/hoteles.json';

// iconos
const alertaIcon        = L.icon({ iconUrl: '/iconos/alerta.png',      iconSize: [25,25], iconAnchor: [12,12] });
const puntoRecogidaIcon = L.icon({ iconUrl: '/iconos/recogida.png',   iconSize: [25,25], iconAnchor: [12,12] });
const hotelIcon         = L.icon({ iconUrl: '/iconos/hotel.png',       iconSize: [25,25], iconAnchor: [12,12] });
const conductorIcon     = L.icon({ iconUrl: '/iconos/bus.png',         iconSize: [35,35], iconAnchor: [17,17] });

// para capturar la instancia del mapa
const SetMapInstance = ({ setMapInstance }) => {
  const map = useMap();
  useEffect(() => setMapInstance(map), [map, setMapInstance]);
  return null;
};

// función para elegir color de ruta
const getColor = tipo => {
  switch (tipo) {
    case 'segura':      return 'green';
    case 'advertencia': return 'yellow';
    case 'prohibida':   return 'red';
    default:            return 'blue';
  }
};

const MY_HOTELS_KEY = 'myHotels';

const MapaConductor = () => {
  const navigate = useNavigate();

  // estados de datos
  const [rutas, setRutas]           = useState([]);
  const [alertas, setAlertas]       = useState([]);
  const [allHotels, setAllHotels]   = useState([]);

  // lista personal (persistida en localStorage)
  const [myHotels, setMyHotels] = useState(() => {
    try { return JSON.parse(localStorage.getItem(MY_HOTELS_KEY)) || []; }
    catch { return []; }
  });

  // estados para búsqueda
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  // mapa y geolocalización
  const [center]            = useState([39.6908, 2.9271]);
  const [mapInstance, setMapInstance] = useState(null);
  const [conductorPos, setConductorPos] = useState(null);
  const [tracking, setTracking]         = useState(false);
  const watchIdRef = useRef(null);

  // sincronizar myHotels con localStorage
  useEffect(() => {
    localStorage.setItem(MY_HOTELS_KEY, JSON.stringify(myHotels));
  }, [myHotels]);

  // validar sesión solo con cookies
  useEffect(() => {
    const cur   = Cookies.get('currentUser');
    const devUid = Cookies.get('deviceUid');
    if (!cur || !devUid) navigate('/');
  }, [navigate]);

  // cargar y transformar datos de JSON
  useEffect(() => {
    // rutasData es un objeto { id: { tipo, coordenadas }, ... }
    const rutasArray = Object.entries(rutasData).map(([id, val]) => ({
      id,
      tipo: val.tipo,
      coordenadas: Array.isArray(val.coordenadas)
        ? val.coordenadas.map(c => [c.lat, c.lng])
        : []
    }));
    setRutas(rutasArray);

    // alertasData es { id: { tipo, title, description, coordenadas:{lat,lng} }, ... }
    const alertasArray = Object.entries(alertasData).map(([id, val]) => ({
      id,
      tipo: val.tipo,
      title: val.title,
      description: val.description,
      coordenadas: [val.coordenadas.lat, val.coordenadas.lng]
    }));
    setAlertas(alertasArray);

    // hotelesData es { id: { lat, lng, nombre }, ... }
    const hotelesArray = Object.entries(hotelesData).map(([id, val]) => ({
      id,
      nombre: val.nombre,
      lat: val.lat,
      lng: val.lng
    }));
    setAllHotels(hotelesArray);
  }, []);

  // centrar mapa en conductor
  const handleCenterMap = () => {
    if (mapInstance && conductorPos) mapInstance.panTo(conductorPos);
  };

  // toggle tracking
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

  // búsqueda client-side de hoteles
  const handleSearchHotels = e => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoadingSearch(true);
    const q = searchQuery.toLowerCase();
    const results = allHotels
      .filter(h => h.nombre.toLowerCase().includes(q))
      .slice(0, 1000);
    setSearchResults(results);
    setLoadingSearch(false);
  };

  // añadir/quitar de mi lista
  const handleAddToMyHotels = hotel => {
    if (!myHotels.some(h => h.id === hotel.id)) {
      setMyHotels(prev => [...prev, hotel]);
    }
  };
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
          <Button variant="info" onClick={handleCenterMap}>
            Centrar en mi ubicación
          </Button>
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

            {conductorPos && (
              <Marker position={conductorPos} icon={conductorIcon}>
                <Popup>Tu ubicación actual</Popup>
              </Marker>
            )}

            {rutas.map(r => (
              <Polyline key={r.id} positions={r.coordenadas} color={getColor(r.tipo)} />
            ))}

            {alertas.map(a => (
              <Marker key={a.id} position={a.coordenadas} icon={a.tipo === 'puntoRecogida' ? puntoRecogidaIcon : alertaIcon}>
                <Popup>
                  <h5>{a.title}</h5>
                  <p>{a.description}</p>
                </Popup>
              </Marker>
            ))}

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
            <Button variant="primary" type="submit" className="mt-2">
              Buscar
            </Button>
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
