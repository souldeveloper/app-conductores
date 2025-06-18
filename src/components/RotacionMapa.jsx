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
import 'leaflet-polylinedecorator';

// importamos los JSON estáticos
import rutasData       from '../datos/rutas.json';
import alertasData     from '../datos/alertas.json';
import hotelesData     from '../datos/hoteles.json';
import direccionesData from '../datos/direcciones.json';

// íconos
const alertaIcon        = L.icon({ iconUrl: '/iconos/alerta.png',      iconSize: [25,25], iconAnchor: [12,12] });
const puntoRecogidaIcon = L.icon({ iconUrl: '/iconos/recogida.png',   iconSize: [25,25], iconAnchor: [12,12] });
const conductorIcon     = L.icon({ iconUrl: '/iconos/bus.png',         iconSize: [35,35], iconAnchor: [17,17] });
const hotelIcon         = L.icon({ iconUrl: '/iconos/hotel_negro.png', iconSize: [25,25], iconAnchor: [12,12] });
const hotelAzulIcon     = L.icon({ iconUrl: '/iconos/hotel_azul.png',  iconSize: [25,25], iconAnchor: [12,12] });

// utilidad para normalizar texto
const normalizeString = str =>
  str
    .replace(/['´`’]/g, '')
    .toLowerCase();

// componente que dibuja flechas al final de polylines
const ArrowedLine = ({ positions }) => {
  const map = useMap();
  const decoratorRef = useRef(null);
  const polyRef = useRef(null);

  useEffect(() => {
    const updateArrows = () => {
      if (decoratorRef.current) map.removeLayer(decoratorRef.current);
      if (polyRef.current) map.removeLayer(polyRef.current);

      const poly = L.polyline(positions, { opacity: 0 }).addTo(map);
      const zoom = map.getZoom();
      const pixelSize = zoom * 0.8;
      const decorator = L.polylineDecorator(poly, {
        patterns: [{
          offset: '100%',
          repeat: 0,
          symbol: L.Symbol.arrowHead({ pixelSize, polygon: false, pathOptions: { stroke: true } })
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

// hook para obtener instancia de mapa
const SetMapInstance = ({ setMapInstance }) => {
  const map = useMap();
  useEffect(() => setMapInstance(map), [map, setMapInstance]);
  return null;
};

// color según tipo de ruta
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
const zoomLevels = [14, 15, 16, 17, 18];

const MapaConductor = () => {
  const navigate = useNavigate();

  // estados de datos
  const [rutas, setRutas]             = useState([]);
  const [alertas, setAlertas]         = useState([]);
  const [allHotels, setAllHotels]     = useState([]);
  const [direcciones, setDirecciones] = useState([]);

  // lista personal (persistida)
  const [myHotels, setMyHotels] = useState(() => {
    try { return JSON.parse(localStorage.getItem(MY_HOTELS_KEY)) || []; }
    catch { return []; }
  });
  const [positionInputs, setPositionInputs] = useState({});

  // búsqueda
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  // mapa y geolocalización
  const center = [39.6908, 2.9271];
  const [mapInstance, setMapInstance]   = useState(null);
  const [conductorPos, setConductorPos] = useState(null);
  const [prevPos, setPrevPos]           = useState(null);
  const [heading, setHeading]           = useState(0);
  const [tracking, setTracking]         = useState(false);
  const watchIdRef = useRef(null);
  const [autoCenter, setAutoCenter] = useState(true);
  const [showZoomButtons, setShowZoomButtons] = useState(true);

  // validar sesión
  useEffect(() => {
    const cur    = Cookies.get('currentUser');
    const devUid = Cookies.get('deviceUid');
    if (!cur || !devUid) navigate('/');
  }, [navigate]);

  // cargar datos JSON
  useEffect(() => {
    setRutas(
      Object.entries(rutasData).map(([id, v]) => ({
        id,
        tipo: v.tipo,
        coordenadas: v.coordenadas.map(c => [c.lat, c.lng])
      }))
    );
    setAlertas(
      Object.entries(alertasData).map(([id, v]) => ({
        id,
        tipo: v.tipo,
        title: v.title,
        description: v.description,
        coordenadas: [v.coordenadas.lat, v.coordenadas.lng]
      }))
    );
    setAllHotels(
      Object.entries(hotelesData).map(([id, v]) => ({
        id,
        nombre: v.nombre,
        lat: v.lat,
        lng: v.lng,
        tipo: v.tipo
      }))
    );
    setDirecciones(
      Object.entries(direccionesData).map(([id, v]) => ({
        id,
        coords: v.coords.map(c => [c.lat, c.lng])
      }))
    );
  }, []);

  // persistir hoteles
  useEffect(() => {
    localStorage.setItem(MY_HOTELS_KEY, JSON.stringify(myHotels));
  }, [myHotels]);

  // toggle tracking y cálculo de heading
  const handleToggleTracking = () => {
    if (!tracking && navigator.geolocation) {
      setTracking(true);
      watchIdRef.current = navigator.geolocation.watchPosition(
        pos => {
          const newPos = [pos.coords.latitude, pos.coords.longitude];
          setConductorPos(newPos);
          if (prevPos) {
            const dy = newPos[0] - prevPos[0];
            const dx = newPos[1] - prevPos[1];
            setHeading(Math.atan2(dy, dx) * 180 / Math.PI);
          }
          setPrevPos(newPos);
        },
        err => console.error(err),
        { enableHighAccuracy: true, maximumAge: 0 }
      );
    } else {
      setTracking(false);
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    }
  };

  // auto-centrado
  useEffect(() => {
    if (autoCenter && conductorPos && mapInstance) {
      mapInstance.panTo(conductorPos);
    }
  }, [conductorPos, mapInstance, autoCenter]);

  // centro y toggle zoom buttons
  const handleCenterMap = () => {
    if (mapInstance && conductorPos) mapInstance.panTo(conductorPos);
    setShowZoomButtons(prev => !prev);
  };

  // icono triángulo rotado
 const createArrowIcon = () => L.divIcon({
  html: `
    <svg width="35" height="45" viewBox="0 0 40 45">
      <polygon
        points="20,0 30,45 10,45"
        fill="#007bff"
        transform="rotate(${heading},20,22.5)"
      />
    </svg>
  `,
  iconSize: [35, 45],
  iconAnchor: [17, 22],
  className: ''
});

  // búsqueda de hoteles
  const handleSearchHotels = e => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoadingSearch(true);
    const q = normalizeString(searchQuery);
    const results = allHotels
      .filter(h => normalizeString(h.nombre).includes(q))
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
      const upd = { ...prev };
      delete upd[id];
      return upd;
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

  // logout
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
            Zooms
          </Button>{' '}
          <Button
            variant={autoCenter ? 'primary' : 'secondary'}
            onClick={() => setAutoCenter(prev => !prev)}
          >
            Centrado: {autoCenter ? 'On' : 'Off'}
          </Button>
        </Col>
      </Row>
      <br />
      <Row>
        {/* Mapa */}
        <Col md={9} style={{ position: 'relative' }}>
          <MapContainer
            center={center}
            zoom={10}
            style={{ height: '80vh' }}
            scrollWheelZoom
            zoomControl
            maxZoom={18}
            zoomDelta={0.5}
            zoomSnap={0}
          >
            <SetMapInstance setMapInstance={setMapInstance} />
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="© OpenStreetMap contributors"
            />

            {/* Zoom Rápido */}
            {showZoomButtons && (
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
            )}

            {/* marcador conductor: triángulo si ruta iniciada */}
            {conductorPos && (
              <Marker
                position={conductorPos}
                icon={tracking ? createArrowIcon() : conductorIcon}
              >
                <Popup>Tu ubicación actual</Popup>
              </Marker>
            )}

            {rutas.map(r => (
              <Fragment key={r.id}>
                <Polyline positions={r.coordenadas} color={getColor(r.tipo)} />
              </Fragment>
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

            {/* Hoteles numerados */}
            {myHotels.map((h, idx) => {
              const number = idx + 1;
              const imgName = h.tipo === 'hotel_vial' ? 'hotel_azul' : 'hotel';
              const hotelWithNumberIcon = L.divIcon({
                html: `
                  <div style="position: relative; display: inline-block;">
                    <img src="/iconos/${imgName}.png" style="width:32px; height:32px;" />
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

            {/* Flechas de direcciones */}
            {direcciones.map(d => (
              <Fragment key={d.id}>
                <Polyline
                  positions={d.coords}
                  pathOptions={{ color: 'black', dashArray: '5,10' }}
                />
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

      <Row className="mt-3">
        <Col>
          <Button variant="outline-secondary" onClick={handleLogout}>
            Cerrar Sesión
          </Button>
        </Col>
      </Row>
    </Container>
  );
};

export default MapaConductor;
