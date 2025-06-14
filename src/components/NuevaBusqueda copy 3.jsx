// src/components/MapaConductor.jsx
import React, { useEffect, useState, useRef, Fragment } from 'react';
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
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  useMap
} from 'react-leaflet';
import Cookies from 'js-cookie';
import L from 'leaflet';

// importamos los JSON estáticos
import rutasData       from '../datos/rutas.json';
import alertasData     from '../datos/alertas.json';
import hotelesData     from '../datos/hoteles.json';
import direccionesData from '../datos/direcciones.json';

import 'leaflet-polylinedecorator';

// íconos
const alertaIcon        = L.icon({ iconUrl: '/iconos/alerta.png',      iconSize: [25,25], iconAnchor: [12,12] });
const puntoRecogidaIcon = L.icon({ iconUrl: '/iconos/recogida.png',   iconSize: [25,25], iconAnchor: [12,12] });
const conductorIcon     = L.icon({ iconUrl: '/iconos/bus.png',         iconSize: [35,35], iconAnchor: [17,17] });
const hotelIcon         = L.icon({ iconUrl: '/iconos/hotel.png',       iconSize: [25,25], iconAnchor: [12,12] });

// componente que dibuja una flecha al final de una polyline
const ArrowedLine = ({ positions }) => {
  const map = useMap();
  useEffect(() => {
    const poly = L.polyline(positions, { opacity: 0 }).addTo(map);
    const decorator = L.polylineDecorator(poly, {
      patterns: [{
        offset: '100%',
        repeat: 0,
        symbol: L.Symbol.arrowHead({
          pixelSize: 15,
          polygon: false,
          pathOptions: { stroke: true }
        })
      }]
    }).addTo(map);
    return () => {
      map.removeLayer(decorator);
      map.removeLayer(poly);
    };
  }, [map, positions]);
  return null;
};

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
    case 'informativa': return 'blue'; 
    default:            return 'blue';
  }
};

const MY_HOTELS_KEY = 'myHotels';

// niveles de zoom para los botones (ajústalos aquí)
const zoomLevels = [13, 15, 17, 19, 20];

const MapaConductor = () => {
  const navigate = useNavigate();

  // estados de datos
  const [rutas, setRutas]             = useState([]);
  const [alertas, setAlertas]         = useState([]);
  const [allHotels, setAllHotels]     = useState([]);
  const [direcciones, setDirecciones] = useState([]);

  // lista personal (persistida en localStorage)
  const [myHotels, setMyHotels] = useState(() => {
    try { return JSON.parse(localStorage.getItem(MY_HOTELS_KEY)) || []; }
    catch { return []; }
  });

  // inputs de posición para cada hotel
  const [positionInputs, setPositionInputs] = useState({});

  // sincronizar myHotels con localStorage
  useEffect(() => {
    localStorage.setItem(MY_HOTELS_KEY, JSON.stringify(myHotels));
  }, [myHotels]);

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

  // validar sesión solo con cookies
  useEffect(() => {
    const cur    = Cookies.get('currentUser');
    const devUid = Cookies.get('deviceUid');
    if (!cur || !devUid) navigate('/');
  }, [navigate]);

  // cargar datos de JSON estáticos
  useEffect(() => {
    // rutas
    const rutasArray = Object.entries(rutasData).map(([id, val]) => ({
      id,
      tipo: val.tipo,
      coordenadas: val.coordenadas.map(c => [c.lat, c.lng])
    }));
    setRutas(rutasArray);

    // alertas
    const alertasArray = Object.entries(alertasData).map(([id, val]) => ({
      id,
      tipo: val.tipo,
      title: val.title,
      description: val.description,
      coordenadas: [val.coordenadas.lat, val.coordenadas.lng]
    }));
    setAlertas(alertasArray);

    // hoteles estáticos
    const hotelesArray = Object.entries(hotelesData).map(([id, val]) => ({
      id,
      nombre: val.nombre,
      lat: val.lat,
      lng: val.lng
    }));
    setAllHotels(hotelesArray);

    // direcciones estáticas (flechas)
    const dirsArray = Object.entries(direccionesData).map(([id, val]) => ({
      id,
      coords: val.coords.map(c => [c.lat, c.lng])
    }));
    setDirecciones(dirsArray);
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
  const normalizeString = str =>
    str.normalize('NFD')
       .replace(/[\u0300-\u036f]/g, '')
       .replace(/['´`’]/g, '')
       .toLowerCase();

  const handleSearchHotels = e => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoadingSearch(true);
    const qNorm = normalizeString(searchQuery);
    const results = allHotels
      .filter(h => normalizeString(h.nombre).includes(qNorm))
      .slice(0, 1000);
    setSearchResults(results);
    setLoadingSearch(false);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleAddToMyHotels = hotel => {
    if (!myHotels.some(h => h.id === hotel.id)) {
      setMyHotels(prev => [...prev, hotel]);
    }
  };
  const handleRemoveFromMyHotels = id => {
    setMyHotels(prev => prev.filter(h => h.id !== id));
    setPositionInputs(prev => {
      const upd = { ...prev }; delete upd[id]; return upd;
    });
  };
  const handleSetPosition = id => {
    const input = parseInt(positionInputs[id], 10);
    if (isNaN(input) || input < 1 || input > myHotels.length) {
      alert(`Introduce un número válido entre 1 y ${myHotels.length}`);
      return;
    }
    setMyHotels(prev => {
      const idxOld = prev.findIndex(h => h.id === id);
      if (idxOld === -1) return prev;
      const hotel = prev[idxOld];
      const without = prev.filter(h => h.id !== id);
      without.splice(input - 1, 0, hotel);
      return without;
    });
    setPositionInputs(prev => ({ ...prev, [id]: '' }));
  };

  const handleLogout = () => {
    Cookies.remove('currentUser');
    Cookies.remove('deviceUid');
    navigate('/');
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
        <Col md={9} style={{ position: 'relative' }}>
          <MapContainer
            center={center}
            zoom={10}
            style={{ height: '80vh' }}
            scrollWheelZoom={true}
            zoomControl={true}
            maxZoom={24}
            zoomDelta={0.5}
            zoomSnap={0}
          >
            <SetMapInstance setMapInstance={setMapInstance} />
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="© OpenStreetMap contributors"
            />

            {/* Botones de zoom rápidos */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '10px',
              transform: 'translateY(-50%)',
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem'
            }}>
              {zoomLevels.map((z, i) => (
                <Button
                  key={i}
                  onClick={() => mapInstance && mapInstance.setZoom(z)}
                  style={{
                    borderRadius: '50%',
                    width: '36px',
                    height: '36px',
                    padding: 0,
                    textAlign: 'center'
                  }}
                  title={`Zoom nivel ${z}`}
                >
                  {i + 1}
                </Button>
              ))}
            </div>

            {conductorPos && (
              <Marker position={conductorPos} icon={conductorIcon}>
                <Popup>Tu ubicación actual</Popup>
              </Marker>
            )}

            {rutas.map(r => (
              <Polyline key={r.id} positions={r.coordenadas} color={getColor(r.tipo)} />
            ))}

            {alertas.map(a => (
              <Marker
                key={a.id}
                position={a.coordenadas}
                icon={a.tipo === 'puntoRecogida' ? puntoRecogidaIcon : alertaIcon}
              >
                <Popup>
                  <h5>{a.title}</h5>
                  <p>{a.description}</p>
                </Popup>
              </Marker>
            ))}

            {myHotels.map((h, idx) => {
              const number = idx + 1;
              const hotelWithNumberIcon = L.divIcon({
                html: `
                  <div style="position: relative; display: inline-block;">
                    <img src="/iconos/hotel.png" style="width:25px; height:25px;" />
                    <span style="
                      position: absolute;
                      top: -6px;
                      right: -6px;
                      font-size: 14px;
                      background: white;
                      border: 1px solid rgba(0,0,0,0.3);
                      border-radius: 50%;
                      padding: 2px 5px;
                    ">${number}</span>
                  </div>
                `,
                iconSize: [25, 25],
                iconAnchor: [12, 12],
                className: ''
              });

              return (
                <Marker
                  key={h.id}
                  position={[h.lat, h.lng]}
                  icon={hotelWithNumberIcon}
                >
                  <Popup>
                    <div>
                      <h5>{h.nombre}</h5>
                      <Form onSubmit={e => { e.preventDefault(); handleSetPosition(h.id); }}>
                        <FormControl
                          type="number"
                          min="1"
                          max={myHotels.length}
                          placeholder="Posición"
                          value={positionInputs[h.id] || ''}
                          onChange={e =>
                            setPositionInputs(prev => ({ ...prev, [h.id]: e.target.value }))
                          }
                          style={{ width: '80px', marginRight: '1rem' }}
                        />
                        <Button size="sm" onClick={() => handleSetPosition(h.id)}>
                          Asignar
                        </Button>
                      </Form>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {/* Flechas (cargadas desde JSON) */}
            {direcciones.map(d => (
              <Fragment key={d.id}>
                <Polyline
                  positions={d.coords}
                  pathOptions={{ color: 'black', dashArray: '5,10' }}
                >
                  <Popup>
                    <h5>Flecha ID: {d.id}</h5>
                  </Popup>
                </Polyline>
                <ArrowedLine positions={d.coords} />
              </Fragment>
            ))}

          </MapContainer>
        </Col>

        {/* Panel lateral */}
        <Col md={3}>
          <h4>Buscar Hoteles</h4>
          <Form onSubmit={handleSearchHotels} className="d-flex">
            <FormControl
              type="text"
              placeholder="Nombre del hotel"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <Button variant="primary" type="submit" className="ms-2">
              Buscar
            </Button>
            <Button variant="secondary" type="button" className="ms-2" onClick={handleClearSearch}>
              Limpiar
            </Button>
          </Form>
          {loadingSearch && <Spinner animation="border" className="my-2" />}

          {searchResults.length > 0 && (
            <ListGroup className="mt-2">
              {searchResults.map(h => (
                <ListGroup.Item key={h.id} className="d-flex justify-content-between mb-2">
                  {h.nombre}
                  <Button size="sm" onClick={() => handleAddToMyHotels(h)}>
                    Agregar
                  </Button>
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}

          <h4 className="mt-4">Mis Hoteles</h4>
          {myHotels.length === 0 ? (
            <Alert variant="info">No has agregado ningún hotel aún.</Alert>
          ) : (
            <ListGroup>
              {myHotels.map((h, idx) => (
                <ListGroup.Item key={h.id} className="d-flex justify-content-between align-items-center">
                  <span>{idx + 1}. {h.nombre}</span>
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
