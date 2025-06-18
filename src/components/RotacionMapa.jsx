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

// JSON estáticos
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

// Polyline con flecha al final
const ArrowedLine = ({ positions }) => {
  const map = useMap();
  const decoRef = useRef(null);
  const polyRef = useRef(null);

  useEffect(() => {
    const update = () => {
      if (decoRef.current) map.removeLayer(decoRef.current);
      if (polyRef.current) map.removeLayer(polyRef.current);
      const poly = L.polyline(positions, { opacity: 0 }).addTo(map);
      const size = map.getZoom() * 0.8;
      const deco = L.polylineDecorator(poly, {
        patterns: [{
          offset: '100%',
          repeat: 0,
          symbol: L.Symbol.arrowHead({ pixelSize: size, polygon: false, pathOptions: { stroke: true } })
        }]
      }).addTo(map);
      polyRef.current = poly;
      decoRef.current = deco;
    };
    map.on('zoomend', update);
    update();
    return () => {
      map.off('zoomend', update);
      if (decoRef.current) map.removeLayer(decoRef.current);
      if (polyRef.current) map.removeLayer(polyRef.current);
    };
  }, [map, positions]);

  return null;
};

// Capturar instancia de mapa
const SetMapInstance = ({ setMapInstance }) => {
  const map = useMap();
  useEffect(() => setMapInstance(map), [map, setMapInstance]);
  return null;
};

// Color de ruta
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
const SUGGESTIONS_LIMIT = 20;

const MapaConductor = () => {
  const navigate = useNavigate();

  // datos
  const [rutas, setRutas]             = useState([]);
  const [alertas, setAlertas]         = useState([]);
  const [allHotels, setAllHotels]     = useState([]);
  const [direcciones, setDirecciones] = useState([]);

  // hoteles usuario
  const [myHotels, setMyHotels] = useState(() => {
    try { return JSON.parse(localStorage.getItem(MY_HOTELS_KEY)) || []; }
    catch { return []; }
  });
  const [positionInputs, setPositionInputs] = useState({});

  // búsqueda y autocompletado
  const [searchQuery, setSearchQuery]     = useState('');
  const [suggestions, setSuggestions]     = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  // mapa & geolocalización
  const center = [39.6908, 2.9271];
  const [mapInstance, setMapInstance]   = useState(null);
  const [conductorPos, setConductorPos] = useState(null);
  const [tracking, setTracking]         = useState(false);
  const watchId = useRef(null);

  // orientación dispositivo (Chrome)
  const [heading, setHeading] = useState(0);

  // controles UI
  const [autoCenter, setAutoCenter]         = useState(true);
  const [showZoomButtons, setShowZoomButtons] = useState(true);

  // util para normalizar texto
  const normalize = s => s.replace(/['´`’]/g,'').toLowerCase();

  // cargar JSON al inicio
  useEffect(() => {
    setRutas(Object.entries(rutasData).map(([id,v]) => ({
      id, tipo: v.tipo, coordenadas: v.coordenadas.map(c=>[c.lat,c.lng])
    })));
    setAlertas(Object.entries(alertasData).map(([id,v]) => ({
      id, tipo: v.tipo, title: v.title, description: v.description,
      coordenadas: [v.coordenadas.lat, v.coordenadas.lng]
    })));
    setAllHotels(Object.entries(hotelesData).map(([id,v]) => ({
      id, nombre: v.nombre, lat: v.lat, lng: v.lng, tipo: v.tipo
    })));
    setDirecciones(Object.entries(direccionesData).map(([id,v]) => ({
      id, coords: v.coords.map(c=>[c.lat,c.lng])
    })));
  }, []);

  // persistir hoteles
  useEffect(() => {
    localStorage.setItem(MY_HOTELS_KEY, JSON.stringify(myHotels));
  }, [myHotels]);

  // validar sesión
  useEffect(() => {
    if (!Cookies.get('currentUser') || !Cookies.get('deviceUid')) {
      navigate('/');
    }
  }, [navigate]);

  // sensor orientación Chrome
  useEffect(() => {
    const onOrient = e => setHeading(360 - e.alpha);
    window.addEventListener('deviceorientation', onOrient, true);
    return () => window.removeEventListener('deviceorientation', onOrient, true);
  }, []);

  // iniciar/detener tracking
  const handleToggleTracking = () => {
    if (!tracking && navigator.geolocation) {
      setTracking(true);
      watchId.current = navigator.geolocation.watchPosition(
        pos => setConductorPos([pos.coords.latitude, pos.coords.longitude]),
        err => console.error(err),
        { enableHighAccuracy: true, maximumAge: 0 }
      );
    } else {
      setTracking(false);
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current);
    }
  };

  // auto-centrado
  useEffect(() => {
    if (autoCenter && conductorPos && mapInstance) {
      mapInstance.panTo(conductorPos);
    }
  }, [conductorPos, mapInstance, autoCenter]);

  // toggles de UI
  const handleCenterMap = () => {
    if (mapInstance && conductorPos) mapInstance.panTo(conductorPos);
    setShowZoomButtons(v => !v);
  };

  // icono flecha según orientación
  const createArrowIcon = () => L.divIcon({
    html: `
      <svg width="35" height="35" viewBox="0 0 40 40">
        <polygon points="20,0 40,40 0,40"
          fill="#007bff"
          transform="rotate(${heading},20,20)" />
      </svg>
    `,
    iconSize: [35,35],
    iconAnchor: [17,17],
    className: ''
  });

  // búsqueda de hoteles
  const handleSearchHotels = e => {
    e.preventDefault();
    const q = normalize(searchQuery);
    if (!q) return;
    setLoadingSearch(true);
    const results = allHotels
      .filter(h => normalize(h.nombre).includes(q))
      .slice(0, 1000);
    setSearchResults(results);
    setLoadingSearch(false);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSuggestions([]);
  };

  const handleAddToMyHotels = h => {
    if (!myHotels.some(x => x.id === h.id)) {
      setMyHotels(prev => [...prev, h]);
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
    const pos = parseInt(positionInputs[id],10);
    if (isNaN(pos) || pos<1 || pos>myHotels.length) {
      alert(`Introduce posición válida 1–${myHotels.length}`);
      return;
    }
    setMyHotels(prev => {
      const idx = prev.findIndex(h=>h.id===id);
      const hotel = prev[idx];
      const rest = prev.filter(h=>h.id!==id);
      rest.splice(pos-1,0,hotel);
      return rest;
    });
    setPositionInputs(prev => ({...prev, [id]: ''}));
  };

  return (
    <Container fluid style={{ padding: '2rem' }}>
      <Row className="mb-3">
        <Col>
          <Button
            variant={tracking ? 'danger' : 'success'}
            onClick={handleToggleTracking}
          >
            {tracking ? 'Detener Ruta' : 'Iniciar Ruta'}
          </Button>{' '}
          <Button variant="info" onClick={handleCenterMap}>Zooms</Button>{' '}
          <Button
            variant={autoCenter ? 'primary' : 'secondary'}
            onClick={() => setAutoCenter(v => !v)}
          >
            Centrado: {autoCenter ? 'On' : 'Off'}
          </Button>
        </Col>
      </Row>
      <Row>
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

            {showZoomButtons && (
              <div style={{
                position:'absolute',
                top:'50%',
                left:'10px',
                transform:'translateY(-50%)',
                zIndex:1000,
                display:'flex',
                flexDirection:'column',
                gap:'0.5rem'
              }}>
                {zoomLevels.map((z,i) => (
                  <Button
                    key={i}
                    onClick={()=>mapInstance&&mapInstance.setZoom(z)}
                    style={{
                      borderRadius:'50%',
                      width:'36px',
                      height:'36px',
                      padding:0,
                      textAlign:'center'
                    }}
                    title={`Zoom nivel ${z}`}
                  >
                    {i+1}
                  </Button>
                ))}
              </div>
            )}

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
                <ArrowedLine positions={r.coordenadas} />
              </Fragment>
            ))}

            {alertas.map(a => (
              <Marker
                key={a.id}
                position={a.coordenadas}
                icon={a.tipo==='puntoRecogida' ? puntoRecogidaIcon : alertaIcon}
              >
                <Popup>
                  <h5>{a.title}</h5>
                  <p>{a.description}</p>
                </Popup>
              </Marker>
            ))}

            {myHotels.map((h,idx)=> {
              const num = idx+1;
              const img = h.tipo==='hotel_vial' ? 'hotel_azul' : 'hotel';
              const icon = L.divIcon({
                html: `
                  <div style="position:relative; display:inline-block;">
                    <img src="/iconos/${img}.png" style="width:32px; height:32px;" />
                    <span style="
                      position:absolute; top:-6px; right:-6px;
                      font-size:14px; background:white;
                      border:1px solid rgba(0,0,0,0.3);
                      border-radius:50%; padding:2px 5px;
                    ">${num}</span>
                  </div>
                `,
                iconSize:[25,25], iconAnchor:[12,12], className:''
              });
              return (
                <Marker key={h.id} position={[h.lat,h.lng]} icon={icon}>
                  <Popup>
                    <h5>{h.nombre}</h5>
                    <Form onSubmit={e=>{e.preventDefault();handleSetPosition(h.id);}}>
                      <FormControl
                        type="number"
                        min="1"
                        max={myHotels.length}
                        placeholder="Posición"
                        value={positionInputs[h.id]||''}
                        onChange={e=>setPositionInputs(p=>({...p,[h.id]:e.target.value}))}
                        style={{width:'80px', marginRight:'1rem'}}
                      />
                      <Button size="sm" onClick={()=>handleSetPosition(h.id)}>Asignar</Button>
                    </Form>
                  </Popup>
                </Marker>
              );
            })}

            {direcciones.map(d=>(
              <Fragment key={d.id}>
                <Polyline positions={d.coords} pathOptions={{color:'black', dashArray:'5,10'}}/>
                <ArrowedLine positions={d.coords} />
              </Fragment>
            ))}

          </MapContainer>
        </Col>
        <Col md={3}>
          <h4>Buscar Hoteles</h4>
          {/* Autocompletado dinámico */}
          <div style={{ position: 'relative' }}>
            <Form onSubmit={handleSearchHotels} className="d-flex mb-2">
              <FormControl
                type="text"
                placeholder="Nombre del hotel"
                value={searchQuery}
                onChange={e => {
                  const q = e.target.value;
                  setSearchQuery(q);
                  if (q.trim() === '') {
                    setSuggestions([]);
                  } else {
                    const norm = normalize(q);
                    setSuggestions(
                      allHotels
                        .filter(h => normalize(h.nombre).includes(norm))
                        .slice(0, SUGGESTIONS_LIMIT)
                    );
                  }
                }}
                autoComplete="off"
              />
              <Button variant="primary" type="submit" className="ms-2">
                Buscar
              </Button>
              <Button
                variant="secondary"
                type="button"
                className="ms-2"
                onClick={() => { handleClearSearch(); setSuggestions([]); }}
              >
                Limpiar
              </Button>
            </Form>
            {suggestions.length > 0 && (
              <ListGroup style={{
                position: 'absolute',
                top: '100%',
                width: '100%',
                zIndex: 1000,
                maxHeight: '200px',
                overflowY: 'auto'
              }}>
                {suggestions.map(h => (
                  <ListGroup.Item
                    key={h.id}
                    action
                    onClick={() => {
                      setSearchQuery(h.nombre);
                      setSuggestions([]);
                      setSearchResults([h]);
                    }}
                  >
                    {h.nombre}
                  </ListGroup.Item>
                ))}
              </ListGroup>
            )}
          </div>
          {loadingSearch && <Spinner animation="border" className="my-2" />}
          {searchResults.length > 0 && (
            <ListGroup className="mb-3">
              {searchResults.map(h => (
                <ListGroup.Item
                  key={h.id}
                  className="d-flex justify-content-between"
                >
                  {h.nombre}
                  <Button size="sm" onClick={() => handleAddToMyHotels(h)}>
                    Agregar
                  </Button>
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}

          <h4>Mis Hoteles</h4>
          {myHotels.length === 0 ? (
            <Alert variant="info">No has agregado ningún hotel aún.</Alert>
          ) : (
            <ListGroup>
              {myHotels.map((h,idx)=>(
                <ListGroup.Item key={h.id} className="d-flex justify-content-between align-items-center">
                  <span>{idx+1}. {h.nombre}</span>
                  <Button variant="danger" size="sm" onClick={()=>handleRemoveFromMyHotels(h.id)}>
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
