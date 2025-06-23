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
import Cookies from 'js-cookie';
import L from 'leaflet';
import 'leaflet-polylinedecorator';

import rutasData       from '../datos/rutas.json';
import alertasData     from '../datos/alertas.json';
import hotelesData     from '../datos/hoteles.json';
import direccionesData from '../datos/direcciones.json';

const alertaIcon        = L.icon({ iconUrl: '/iconos/alerta.png',      iconSize: [25,25], iconAnchor: [12,12] });
const puntoRecogidaIcon = L.icon({ iconUrl: '/iconos/recogida.png',   iconSize: [25,25], iconAnchor: [12,12] });
const conductorIcon     = L.icon({ iconUrl: '/iconos/bus.png',         iconSize: [35,35], iconAnchor: [17,17] });

const ArrowedLine = ({ positions }) => {
  const map = useMap();
  const decoratorRef = useRef(null);
  const polyRef = useRef(null);

  useEffect(() => {
    const updateArrows = () => {
      if (decoratorRef.current) map.removeLayer(decoratorRef.current);
      if (polyRef.current)     map.removeLayer(polyRef.current);

      const poly = L.polyline(positions, { opacity: 0 }).addTo(map);
      const zoom = map.getZoom();
      const pixelSize = zoom * 0.8;
      const decorator = L.polylineDecorator(poly, {
        patterns: [{
          offset: '100%',
          repeat: 0,
          symbol: L.Symbol.arrowHead({
            pixelSize,
            polygon: false,
            pathOptions: { stroke: true }
          })
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
      if (polyRef.current)      map.removeLayer(polyRef.current);
    };
  }, [map, positions]);

  return null;
};

const SetMapInstance = ({ setMapInstance }) => {
  const map = useMap();
  useEffect(() => setMapInstance(map), [map, setMapInstance]);
  return null;
};

const getColor = tipo => {
  switch (tipo) {
    case 'segura':      return 'green';
    case 'advertencia': return 'yellow';
    case 'prohibida':   return 'red';
    case 'informativa': return 'blue';
    default:            return 'blue';
  }
};

const STORAGE_KEY = 'hotelLists';
const zoomLevels = [14, 15, 16, 17, 18];

const MapaConductor = () => {
  const navigate = useNavigate();

  // datos estáticos
  const [rutas, setRutas]             = useState([]);
  const [alertas, setAlertas]         = useState([]);
  const [allHotels, setAllHotels]     = useState([]);
  const [direcciones, setDirecciones] = useState([]);

  // listas de hoteles
  const [hotelLists, setHotelLists]         = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  });
  const [selectedListId, setSelectedListId] = useState(hotelLists[0]?.id || null);

  // UI y búsqueda
  const [positionInputs, setPositionInputs]   = useState({});
  const [showZoomButtons, setShowZoomButtons] = useState(true);
  const [autoCenter, setAutoCenter]           = useState(true);
  const [searchQuery, setSearchQuery]         = useState('');
  const [searchResults, setSearchResults]     = useState([]);
  const [loadingSearch, setLoadingSearch]     = useState(false);

  // mapa & tracking
  const [mapInstance, setMapInstance]    = useState(null);
  const [conductorPos, setConductorPos]  = useState(null);
  const [tracking, setTracking]          = useState(false);
  const watchIdRef = useRef(null);

  // carga sesión y JSON
  useEffect(() => {
    if (!Cookies.get('currentUser') || !Cookies.get('deviceUid')) navigate('/');
    // rutas
    const r = Object.entries(rutasData).map(([id,val]) => ({
      id,
      tipo: val.tipo,
      coordenadas: val.coordenadas.map(c => [c.lat, c.lng])
    }));
    setRutas(r);
    // alertas
    const a = Object.entries(alertasData).map(([id,val]) => ({
      id,
      tipo: val.tipo,
      title: val.title,
      description: val.description,
      coordenadas: [val.coordenadas.lat, val.coordenadas.lng]
    }));
    setAlertas(a);
    // hoteles
    const h = Object.entries(hotelesData).map(([id,val]) => ({
      id,
      nombre: val.nombre,
      lat: val.lat,
      lng: val.lng,
      tipo: val.tipo
    }));
    setAllHotels(h);
    // direcciones
    const d = Object.entries(direccionesData).map(([id,val]) => ({
      id,
      coords: val.coords.map(c => [c.lat, c.lng])
    }));
    setDirecciones(d);
  }, [navigate]);

  // persisto listas
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hotelLists));
  }, [hotelLists]);

  const currentList = hotelLists.find(l => l.id === selectedListId);
  const myHotels    = currentList?.hotels || [];

  // controles
  const handleCenterMap = () => {
    if (mapInstance && conductorPos) mapInstance.panTo(conductorPos);
    setShowZoomButtons(v => !v);
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
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    }
  };
  useEffect(() => {
    if (autoCenter && conductorPos && mapInstance) {
      mapInstance.panTo(conductorPos);
    }
  }, [autoCenter, conductorPos, mapInstance]);

  // búsqueda
  const normalizeString = str =>
    str.normalize('NFD')
       .replace(/[\u0300-\u036f]/g, '')
       .toLowerCase();

  const handleSearchHotels = e => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoadingSearch(true);
    const q = normalizeString(searchQuery);
    setSearchResults(
      allHotels
        .filter(h => normalizeString(h.nombre).includes(q))
        .slice(0, 1000)
    );
    setLoadingSearch(false);
  };
  const handleClearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
  };

  // gestión de listas
  const createNewList     = () => {
    const name = prompt('Nombre de la nueva lista:');
    if (!name) return;
    const id = Date.now().toString();
    setHotelLists(prev => [...prev, { id, name, hotels: [] }]);
    setSelectedListId(id);
  };
  const selectList       = id => setSelectedListId(id);
  // eliminar lista concreta
  const handleRemoveList = listId => {
    setHotelLists(prev => {
      const updated = prev.filter(l => l.id !== listId);
      if (selectedListId === listId) {
        setSelectedListId(updated[0]?.id || null);
      }
      return updated;
    });
  };

  // hoteles en lista
  const handleAddToMyHotels     = hotel => {
    if (!currentList.hotels.some(h => h.id === hotel.id)) {
      setHotelLists(prev =>
        prev.map(l =>
          l.id === currentList.id
            ? { ...l, hotels: [...l.hotels, { ...hotel, loadedSides: { left: false, right: false } }] }
            : l
        )
      );
    }
  };
  const handleRemoveFromMyHotels = id => {
    setHotelLists(prev =>
      prev.map(l =>
        l.id === currentList.id
          ? { ...l, hotels: l.hotels.filter(h => h.id !== id) }
          : l
      )
    );
    setPositionInputs(inp => {
      const c = { ...inp };
      delete c[id];
      return c;
    });
  };
  const handleSetPosition = id => {
    const pos = parseInt(positionInputs[id], 10);
    if (isNaN(pos) || pos < 1 || pos > myHotels.length) {
      alert(`Introduce nº válido 1–${myHotels.length}`);
      return;
    }
    const copy = [...myHotels];
    const idx = copy.findIndex(h => h.id === id);
    const [hotel] = copy.splice(idx, 1);
    copy.splice(pos - 1, 0, hotel);
    setHotelLists(prev =>
      prev.map(l =>
        l.id === currentList.id ? { ...l, hotels: copy } : l
      )
    );
    setPositionInputs(inp => ({ ...inp, [id]: '' }));
  };
  const toggleSide = (id, side) => {
    setHotelLists(prev =>
      prev.map(l =>
        l.id === currentList.id
          ? {
              ...l,
              hotels: l.hotels.map(h =>
                h.id === id
                  ? { ...h, loadedSides: { ...h.loadedSides, [side]: !h.loadedSides[side] } }
                  : h
              )
            }
          : l
      )
    );
  };

  // logout
  const handleLogout = () => {
    Cookies.remove('currentUser');
    Cookies.remove('deviceUid');
    navigate('/');
  };

  return (
    <Container fluid style={{ padding: '2rem' }}>
      {/* controles generales */}
      <Row className="mt-3">
        <Col>
          <h2>Mapa del Conductor</h2>
          <Button variant={tracking ? 'danger' : 'success'} onClick={handleToggleTracking}>
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

      {/* selector de listas con borrar */}
      <Row className="my-3">
        <Col>
          <Dropdown className="d-inline me-2">
            <Dropdown.Toggle variant="secondary">
              {currentList?.name || 'Lista'}
            </Dropdown.Toggle>
            <Dropdown.Menu style={{ minWidth: '200px' }}>
              {hotelLists.map(l => (
                <div
                  key={l.id}
                  className="d-flex align-items-center justify-content-between px-2"
                >
                  <span
                    onClick={() => selectList(l.id)}
                    style={{ flex: 1, cursor: 'pointer', padding: '0.5rem 0' }}
                  >
                    {l.name}
                  </span>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => handleRemoveList(l.id)}
                    title="Eliminar lista"
                  >
                    🗑
                  </Button>
                </div>
              ))}
            </Dropdown.Menu>
          </Dropdown>
          <Button size="sm" onClick={createNewList}>+ Añadir Lista</Button>
        </Col>
      </Row>

      <Row>
        {/* mapa */}
        <Col md={9} style={{ position: 'relative' }}>
          <MapContainer
            center={[39.6908, 2.9271]}
            zoom={10}
            style={{ height: '80vh' }}
            scrollWheelZoom
            zoomControl={false}
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
                      width: 36,
                      height: 36,
                      padding: 0
                    }}
                    title={`Zoom nivel ${z}`}
                  >
                    {i + 1}
                  </Button>
                ))}
              </div>
            )}

            {conductorPos && (
              <Marker position={conductorPos} icon={conductorIcon}>
                <Popup>Tu ubicación actual</Popup>
              </Marker>
            )}

            {rutas.map(r => (
              <Polyline
                key={r.id}
                positions={r.coordenadas}
                color={getColor(r.tipo)}
              />
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
              const num = idx + 1;
              const imgName = h.tipo === 'hotel_vial' ? 'hotel_azul' : 'hotel';
              const iconHtml = `
                <div style="position:relative;display:inline-block;">
                  <img src="/iconos/${imgName}.png" style="width:32px;height:32px;" />
                  <span style="
                    position:absolute;
                    top:-6px;
                    right:-6px;
                    font-size:14px;
                    background:white;
                    border:1px solid rgba(0,0,0,0.3);
                    border-radius:50%;
                    padding:2px 5px;
                  ">${num}</span>
                </div>
              `;
              return (
                <Marker
                  key={h.id}
                  position={[h.lat, h.lng]}
                  icon={L.divIcon({ html: iconHtml, iconSize: [25,25], iconAnchor: [12,12] })}
                >
                  <Popup>
                    <div>
                      <h5>{h.nombre}</h5>
                      <Form
                        onSubmit={e => { e.preventDefault(); handleSetPosition(h.id); }}
                        className="d-flex align-items-center"
                      >
                        <FormControl
                          type="number"
                          min="1"
                          max={myHotels.length}
                          placeholder="Posición"
                          value={positionInputs[h.id] || ''}
                          onChange={e => setPositionInputs(p => ({ ...p, [h.id]: e.target.value }))}
                          style={{ width: 80, marginRight: '1rem' }}
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

            {direcciones.map(d => (
              <Fragment key={d.id}>
                <Polyline positions={d.coords} pathOptions={{ color: 'black', dashArray: '5,10' }} />
                <ArrowedLine positions={d.coords} />
              </Fragment>
            ))}
          </MapContainer>
        </Col>

        {/* panel lateral */}
        <Col md={3}>
          <h4>Buscar Hoteles</h4>
          <Form onSubmit={handleSearchHotels} className="d-flex">
            <FormControl
              type="text"
              placeholder="Nombre del hotel"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <Button variant="primary" type="submit" className="ms-2">Buscar</Button>
            <Button variant="secondary" type="button" className="ms-2" onClick={handleClearSearch}>Limpiar</Button>
          </Form>
          {loadingSearch && <Spinner animation="border" className="my-2" />}
          {searchResults.length > 0 && (
            <ListGroup className="mt-2">
              {searchResults.map(h => (
                <ListGroup.Item key={h.id} className="d-flex justify-content-between mb-2">
                  {h.nombre}
                  <Button size="sm" onClick={() => handleAddToMyHotels(h)}>Agregar</Button>
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}

          <h4 className="mt-4">Mis Hoteles — {currentList?.name}</h4>
          {myHotels.length === 0 ? (
            <Alert variant="info">No has agregado ningún hotel aún.</Alert>
          ) : (
            <ListGroup>
              {myHotels.map((h, idx) => (
                <ListGroup.Item key={h.id} className="d-flex align-items-center" style={{ border: '2px solid transparent', padding: 0, marginBottom: '0.5rem' }}>
                  <div
                    onClick={() => toggleSide(h.id, 'left')}
                    style={{
                      flex: 1,
                      padding: '1rem',
                      minHeight: '2.5rem',
                      borderLeft: h.loadedSides.left ? '4px solid green' : '4px solid transparent',
                      backgroundColor: h.loadedSides.left ? '#eaffea' : 'transparent',
                      transition: 'background-color 0.2s',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f7f7f7'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = h.loadedSides.left ? '#eaffea' : 'transparent'}
                  >
                    {idx + 1}. {h.nombre}
                  </div>
                  <div
                    onClick={() => toggleSide(h.id, 'right')}
                    style={{
                      flex: 1,
                      padding: '1rem',
                      minHeight: '2.5rem',
                      borderRight: h.loadedSides.right ? '4px solid green' : '4px solid transparent',
                      backgroundColor: h.loadedSides.right ? '#eaffea' : 'transparent',
                      transition: 'background-color 0.2s',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f7f7f7'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = h.loadedSides.right ? '#eaffea' : 'transparent'}
                  />
                  <Button variant="danger" size="sm" onClick={() => handleRemoveFromMyHotels(h.id)}>Quitar</Button>
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
