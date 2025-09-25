import { db } from '../firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';
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

// --- FUNCIONES UTILITARIAS ---
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function getTurnAngle(p1, p2, p3) {
  const toRad = deg => deg * Math.PI / 180;
  const toDeg = rad => rad * 180 / Math.PI;
  const v1 = [p2[0]-p1[0], p2[1]-p1[1]];
  const v2 = [p3[0]-p2[0], p3[1]-p2[1]];
  const angle = Math.atan2(v2[1], v2[0]) - Math.atan2(v1[1], v1[0]);
  return ((toDeg(angle) + 540) % 360) - 180;
}

// Hook para detectar long press en el mapa
function useMapLongPress(map, onLongPress, ms = 600) {
  React.useEffect(() => {
    if (!map) return;
    let timer = null;
    let downLatLng = null;
    function onMouseDown(e) {
      downLatLng = e.latlng;
      timer = setTimeout(() => {
        onLongPress(downLatLng);
        timer = null;
      }, ms);
    }
    function onMouseUp() {
      if (timer) clearTimeout(timer);
      timer = null;
    }
    map.on('mousedown', onMouseDown);
    map.on('mouseup', onMouseUp);
    map.on('mouseout', onMouseUp);
    return () => {
      map.off('mousedown', onMouseDown);
      map.off('mouseup', onMouseUp);
      map.off('mouseout', onMouseUp);
    };
  }, [map, onLongPress, ms]);
}

// Iconos grandes para resaltar
const getHotelIcon = (tipo, large = false) => L.divIcon({
  html:`<div style="position:relative;display:inline-block;">
          <img src="/iconos/${tipo==='hotel_vial'?'hotel_azul':'hotel'}.png" style="width:${large?"48px":"32px"};height:${large?"48px":"32px"};transition:width 0.2s,height 0.2s;"/>
        </div>`,
  iconSize: large ? [40,40] : [25,25],
  iconAnchor: large ? [20,20] : [12,12]
});

const alertaIcon        = L.icon({ iconUrl: '/iconos/alerta.png',      iconSize: [25,25], iconAnchor: [12,12] });
const puntoRecogidaIcon = L.icon({ iconUrl: '/iconos/guia.png',        iconSize: [25,25], iconAnchor: [12,12] });
const conductorIcon     = L.icon({ iconUrl: '/iconos/bus.png',         iconSize: [35,35], iconAnchor: [17,17] });

const zoomLevels = [14, 15, 16, 17, 18];

const ArrowedLine = ({ positions }) => {
  const map = useMap();
  const decoratorRef = useRef(null);
  const polyRef = useRef(null);

  useEffect(() => {
    const updateArrows = () => {
      if (decoratorRef.current) map.removeLayer(decoratorRef.current);
      if (polyRef.current)      map.removeLayer(polyRef.current);
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
      if (polyRef.current)      map.removeLayer(polyRef.current);
    };
  }, [map, positions]);

  return null;
};

const SetMapInstance = ({ setMapInstance }) => {
  const map = useMap();
  useEffect(() => { setMapInstance(map); }, [map, setMapInstance]);
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

// Utilidad para obtener el usuario actual desde la cookie
function getCurrentUser() {
  try {
    const user = JSON.parse(Cookies.get('currentUser'));
    return user?.usuario || null;
  } catch {
    return null;
  }
}

// Import React y useState

// Función para guardar listas en localStorage
const guardarListasEnLocalStorage = (listas) => {
    localStorage.setItem("listasHoteles", JSON.stringify(listas));
};

// Función para cargar listas desde localStorage
const cargarListasDesdeLocalStorage = () => {
    const listasGuardadas = localStorage.getItem("listasHoteles");
    return listasGuardadas ? JSON.parse(listasGuardadas) : [];
};

// Función para eliminar listas de localStorage
const borrarListasDeLocalStorage = () => {
    localStorage.removeItem("listasHoteles");
};

const MapaConductor = () => {
  // Detectar usuario actual
  const currentUser = getCurrentUser();
  const isAdminManuel = currentUser === 'admimanuel';

  // mapa y controles (declaración única, debe ir primero)
  const [mapInstance, setMapInstance]   = useState(null);
  // Notas personalizadas
  const [customNotes, setCustomNotes] = useState([]);
  // datos y listas
  const [rutas, setRutas] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [allHotels, setAllHotels] = useState([]);
  const [direcciones, setDirecciones] = useState([]);
  const [hotelLists, setHotelLists] = useState(() => cargarListasDesdeLocalStorage());
  const [isLoaded, setIsLoaded] = useState(!isAdminManuel);
  const [selectedListId, setSelectedListId] = useState(null);
  // búsqueda y reordenar
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [positionInputs, setPositionInputs] = useState({});
  // mapa y controles
  const [conductorPos, setConductorPos] = useState(null);
  const [conductorHeading, setConductorHeading] = useState(0); // heading en grados
  const [tracking, setTracking] = useState(false);
  const [showZoomButtons, setShowZoomButtons] = useState(true);
  const watchIdRef = useRef(null);

  // --- NAVIGATION INSTRUCTION LOGIC ---
  // Calcula la instrucción de giro y distancia hasta el siguiente punto de la ruta activa
  const activeRoute = rutas[0]?.coordenadas || [];
  let navInstruction = null;
  if (conductorPos && activeRoute.length > 1) {
    let minDist = Infinity, closestIdx = 0;
    for (let i = 0; i < activeRoute.length; i++) {
      const d = haversine(conductorPos[0], conductorPos[1], activeRoute[i][0], activeRoute[i][1]);
      if (d < minDist) { minDist = d; closestIdx = i; }
    }
    const nextIdx = Math.min(closestIdx + 1, activeRoute.length - 1);
    const nextPoint = activeRoute[nextIdx];
    const distToNext = haversine(conductorPos[0], conductorPos[1], nextPoint[0], nextPoint[1]);
    let turn = null;
    if (nextIdx < activeRoute.length - 1) {
      const angle = getTurnAngle(activeRoute[closestIdx], nextPoint, activeRoute[nextIdx + 1]);
      if (angle > 30) turn = 'Gira a la izquierda';
      else if (angle < -30) turn = 'Gira a la derecha';
      else turn = 'Sigue recto';
    } else {
      turn = 'Fin de la ruta';
    }
    navInstruction = { dist: distToNext, turn };
  }

  // Cargar notas personalizadas desde Firestore al iniciar (solo admimanuel)
  useEffect(() => {
    if (!isAdminManuel) return;
    async function fetchNotes() {
      const ref = doc(db, 'listasConductores', 'admimanuel');
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        if (data && Array.isArray(data.customNotes)) {
          setCustomNotes(data.customNotes);
        }
      }
    }
    fetchNotes();
  }, [isAdminManuel]);

  // Handler para añadir nota en el mapa
  const handleLongPress = React.useCallback((latlng) => {
    const note = window.prompt('Escribe una nota para esta ubicación:');
    if (note && note.trim()) {
      setCustomNotes(notes => [...notes, { lat: latlng.lat, lng: latlng.lng, note }]);
    }
  }, []);

  // Hook para detectar long press en el mapa (debe ir después de mapInstance)
  useMapLongPress(mapInstance, handleLongPress, 700);
  const navigate = useNavigate();

  // Estado para hotel resaltado
  const [highlightedHotelId, setHighlightedHotelId] = useState(null);

  // carga inicial
  useEffect(() => {
    if (!Cookies.get('currentUser') || !Cookies.get('deviceUid')) navigate('/');
    setRutas(Object.entries(rutasData).map(([id,val]) => ({
      id, tipo: val.tipo, coordenadas: val.coordenadas.map(c=>[c.lat,c.lng])
    })));
    setAlertas(Object.entries(alertasData).map(([id,val]) => ({
      id, tipo: val.tipo, title: val.title, description: val.description,
      coordenadas: [val.coordenadas.lat,val.coordenadas.lng]
    })));
    setAllHotels(Object.entries(hotelesData).map(([id,val]) => ({
      id, nombre: val.nombre, lat: val.lat, lng: val.lng, tipo: val.tipo
    })));
    setDirecciones(Object.entries(direccionesData).map(([id,val]) => ({
      id, coords: val.coords.map(c=>[c.lat,c.lng])
    })));
  }, [navigate]);

  // Función para limpiar undefined de objetos/arrays recursivamente
  function sanitizeForFirestore(obj) {
    if (Array.isArray(obj)) {
      return obj.map(sanitizeForFirestore);
    } else if (obj && typeof obj === 'object') {
      const clean = {};
      for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined) {
          clean[k] = sanitizeForFirestore(v);
        } else {
          clean[k] = null; // Firestore allows null, not undefined
        }
      }
      return clean;
    }
    return obj;
  }

  // persiste listas y notas
  useEffect(() => {
    if (isAdminManuel) {
      // Guardar en Firestore solo si los datos ya están cargados
      if (isLoaded && Array.isArray(hotelLists)) {
        const ref = doc(db, 'listasConductores', 'admimanuel');
        const sanitizedLists = sanitizeForFirestore(hotelLists);
        setDoc(ref, { lists: sanitizedLists, customNotes: sanitizeForFirestore(customNotes) }, { merge: true });
      }
    } else {
      // Para otros usuarios, guardar en localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(hotelLists));
    }
  }, [hotelLists, customNotes, isAdminManuel, isLoaded]);

  // Actualizar el estado de hotelLists y guardar en localStorage
  useEffect(() => {
    guardarListasEnLocalStorage(hotelLists);
  }, [hotelLists]);

  // Evitar renderizar dependencias de listas hasta que estén cargadas
  const currentList = hotelLists.find(l => l.id === selectedListId);
  const myHotels    = currentList?.hotels || [];

  // tracking
  // Calcula heading a partir del GPS (si está disponible) o de la diferencia de posiciones
  const prevPosRef = useRef(null);
  // ...existing code...

  const toggleTracking = () => {
    if (!tracking && navigator.geolocation) {
      setTracking(true);
      watchIdRef.current = navigator.geolocation.watchPosition(
        pos => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setConductorPos([lat, lng]);
          // Usar heading del GPS solo si la velocidad es suficiente
          if (typeof pos.coords.heading === 'number' && !isNaN(pos.coords.heading) && pos.coords.speed > 1) {
            setConductorHeading(pos.coords.heading);
          } else {
            // Calcular heading a partir de la posición anterior solo si el movimiento es suficiente
            const prev = prevPosRef.current;
            if (prev) {
              const dist = haversine(lat, lng, prev[0], prev[1]);
              if (dist > 2) { // solo si se movió más de 2 metros
                const dLat = lat - prev[0];
                const dLng = lng - prev[1];
                if (dLat !== 0 || dLng !== 0) {
                  const angle = Math.atan2(dLng, dLat) * 180 / Math.PI;
                  setConductorHeading((angle + 360) % 360);
                }
                prevPosRef.current = [lat, lng];
              }
            } else {
              prevPosRef.current = [lat, lng];
            }
          }
        },
        err => console.error(err),
        { enableHighAccuracy: true, maximumAge: 0 }
      );
    } else {
      setTracking(false);
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    }
  };
  useEffect(() => {
    if (conductorPos && mapInstance) mapInstance.panTo(conductorPos);
  }, [conductorPos, mapInstance]);

  // búsqueda
  const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const handleSearch = e => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoadingSearch(true);
    const q = normalize(searchQuery);
    setSearchResults(allHotels.filter(h=>normalize(h.nombre).includes(q)).slice(0,1000));
    setLoadingSearch(false);
  };
  const clearSearch = () => { setSearchQuery(''); setSearchResults([]); };

  // listas
  const addList    = () => { const name = prompt('Nueva lista:'); if (!name) return; const id = Date.now().toString(); setHotelLists(prev=>[...prev,{id,name,hotels:[]}]); setSelectedListId(id); };
  const selectList = id => setSelectedListId(id);
  const removeList = id => { setHotelLists(prev=>prev.filter(l=>l.id!==id)); if (selectedListId===id) setSelectedListId(hotelLists[0]?.id||null); };

  // hoteles en lista
  const addHotel    = h => {
    if (!currentList) return;
    if (!currentList.hotels.some(x=>x.id===h.id)) {
      setHotelLists(prev=>prev.map(l=>
        l.id===currentList.id
          ? {...l,hotels:[...l.hotels,{...h,loadedSides:{left:false,right:false}}]}
          : l
      ));
    }
  };
  const removeHotel = id => {
    setHotelLists(prev=>prev.map(l=>
      l.id===currentList.id
        ? {...l,hotels:l.hotels.filter(h=>h.id!==id)}
        : l
    ));
  };
  const toggleSide = (id,side) => {
    setHotelLists(prev=>prev.map(l=>
      l.id===currentList.id
        ? {...l,hotels:l.hotels.map(h=>
            h.id===id
              ? {...h,loadedSides:{...h.loadedSides,[side]:!h.loadedSides[side]}}
              : h
          )}
        : l
    ));
  };
  const reorderHotel = (id,pos) => {
    const idx = myHotels.findIndex(h=>h.id===id);
    if (idx<0) return;
    const copy = [...myHotels];
    const [itm] = copy.splice(idx,1);
    copy.splice(pos-1,0,itm);
    setHotelLists(prev=>prev.map(l=>
      l.id===currentList.id
        ? {...l,hotels:copy}
        : l
    ));
  };

  // logout
  const logout = () => {
    Cookies.remove('currentUser');
    Cookies.remove('deviceUid');
    navigate('/');
  };

  return (
    <Container fluid className="p-3">
      {/* Instrucciones de navegación */}
      {navInstruction && (
        <div style={{position:'fixed',top:10,left:'50%',transform:'translateX(-50%)',zIndex:2000,background:'#fff',borderRadius:8,padding:'10px 20px',boxShadow:'0 2px 8px #0002',fontSize:20,fontWeight:600}}>
          {navInstruction.turn} {navInstruction.turn!=='Fin de la ruta' && (
            <span style={{fontWeight:400}}>
              &nbsp;en {Math.round(navInstruction.dist)} m
            </span>
          )}
        </div>
      )}
      <Row className="mb-3">
        <Col>
          <h2>Mapa del Conductor</h2>{' '}
          <Button variant={tracking?'danger':'success'} onClick={toggleTracking}>
            {tracking?'Detener Ruta':'Iniciar Ruta'}
          </Button>{' '}
          <Button variant="info" onClick={()=>setShowZoomButtons(v=>!v)}>
            Zooms
          </Button>{' '}
          
        </Col>
      </Row>

      <Row className="mb-3">
        <Col>
          <Dropdown className="d-inline me-2">
            <Dropdown.Toggle variant="secondary">
              {currentList?.name||'Lista'}
            </Dropdown.Toggle>
            <Dropdown.Menu style={{ minWidth:200 }}>
              {hotelLists.map(l=>(
                <div key={l.id} className="d-flex justify-content-between align-items-center px-2">
                  <span onClick={()=>selectList(l.id)} style={{ cursor:'pointer', flex:1 }}>{l.name}</span>
                  <Button variant="link" size="sm" onClick={()=>removeList(l.id)}>🗑</Button>
                </div>
              ))}
            </Dropdown.Menu>
          </Dropdown>
          <Button size="sm" onClick={addList}>+ Añadir Lista</Button>
        </Col>
      </Row>

      <Row>
        {/* Mapa con ancho 80vw */}
        <Col style={{ position:'relative', width:'80vw', height:'80vh' }}>
          <MapContainer
            center={[39.6908,2.9271]}
            zoom={10}
            style={{ width:'95%', height:'100%' }}
            scrollWheelZoom
            zoomControl={false}
            maxZoom={18}
          >
            <SetMapInstance setMapInstance={setMapInstance}/>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap contributors"/>

            {showZoomButtons && mapInstance && (
              <div style={{
                position:'absolute',
                top:'200px',
                left:'10px',
                zIndex:1000,
                display:'flex',
                flexDirection:'column',
                gap:'4px'
              }}>
                {zoomLevels.map((z,i)=>
                  <Button
                    key={i}
                    size="sm"
                    onClick={()=>mapInstance.setZoom(z)}
                    style={{ borderRadius:'50%', width:32, height:32, padding:0 }}
                    title={`Zoom ${z}`}
                  >
                    {i+1}
                  </Button>
                )}
              </div>
            )}

            {conductorPos && (
              <Marker position={conductorPos} icon={L.divIcon({
                className: '',
                html: `<img src="/iconos/flecha_gps.svg" style="width:48px;height:48px;transform:rotate(${conductorHeading}deg);transition:transform 0.2s;" alt="Flecha dirección"/>`,
                iconSize: [48,48],
                iconAnchor: [24,24]
              })}>
                <Popup>Tu ubicación</Popup>
              </Marker>
            )}

            {/* Marcas de notas personalizadas */}
            {customNotes.map((n, i) => (
              <Marker key={i} position={[n.lat, n.lng]} icon={L.divIcon({
                html: `<div style='background:#fffbe6;border:2px solid #e6c200;border-radius:8px;padding:2px 6px;font-size:16px;'>📝</div>`,
                iconSize: [32,32], iconAnchor: [16,32]
              })}>
                <Popup>
                  <div>
                    <div style={{marginBottom:'0.5rem'}}>{n.note}</div>
                    <Button size="sm" variant="danger" onClick={() => {
                      setCustomNotes(notes => notes.filter((_, idx) => idx !== i));
                    }}>Eliminar</Button>
                  </div>
                </Popup>
              </Marker>
            ))}
            {rutas.map(r=><Polyline key={r.id} positions={r.coordenadas} color={getColor(r.tipo)}/>)}
            {alertas.map(a=>(
              <Marker key={a.id} position={a.coordenadas} icon={a.tipo==='puntoRecogida'?puntoRecogidaIcon:alertaIcon}>
                <Popup><h5>{a.title}</h5><p>{a.description}</p></Popup>
              </Marker>
            ))}
            {myHotels.map((h,idx)=>(
              <Marker
                key={h.id}
                position={[h.lat,h.lng]}
                icon={getHotelIcon(h.tipo, h.id === highlightedHotelId)}
              >
                <Popup>
                  <div>
                    <h5>{h.nombre}</h5>
                    <Form onSubmit={e=>{e.preventDefault();}}>
                      <FormControl
                        type="number"
                        min="1" max={myHotels.length}
                        placeholder="Posición"
                        value={positionInputs[h.id]||''}
                        onChange={e=>setPositionInputs(p=>({...p,[h.id]:e.target.value}))}
                        style={{ width:80, marginRight:'0.5rem' }}
                      />
                      <Button size="sm" onClick={()=>{
                        const p = parseInt(positionInputs[h.id],10);
                        if (!p||p<1||p>myHotels.length) alert(`1–${myHotels.length}`);
                        else { reorderHotel(h.id,p); setPositionInputs(p=>({...p,[h.id]:''})); }
                      }}>
                        Asignar
                      </Button>
                    </Form>
                  </div>
                </Popup>
              </Marker>
            ))}
            {direcciones.map(d=>(
              <Fragment key={d.id}>
                <Polyline positions={d.coords} pathOptions={{ color:'black', dashArray:'5,10' }}/>
                <ArrowedLine positions={d.coords}/>
              </Fragment>
            ))}
          </MapContainer>
        </Col>

        {/* Panel lateral */}
        <Col md={3} className="mt-3 mt-md-0 px-2">
          <h4>Buscar Hoteles</h4>
          <Form onSubmit={handleSearch} className="d-flex mb-3">
            <FormControl
              type="text"
              placeholder="Nombre del hotel"
              value={searchQuery}
              onChange={e=>setSearchQuery(e.target.value)}
            />
            <Button variant="primary" type="submit" className="ms-2">Buscar</Button>
            <Button variant="secondary" type="button" className="ms-2" onClick={clearSearch}>Limpiar</Button>
          </Form>
          {loadingSearch && <Spinner animation="border" className="d-block mx-auto mb-3"/>}
          {searchResults.length>0 && (
            <ListGroup className="mb-4">
              {searchResults.map(h=>(
                <ListGroup.Item key={h.id} className="d-flex justify-content-between align-items-center">
                  {h.nombre}
                  <Button size="sm" onClick={()=>addHotel(h)}>Agregar</Button>
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}

          <h4>Mis Hoteles — {currentList?.name}</h4>
          {myHotels.length===0 ? (
            <Alert variant="info">No has agregado ningún hotel aún.</Alert>
          ) : (
            <ListGroup>
              {myHotels.map((h,idx)=>(
                <ListGroup.Item key={h.id} className="mb-2 p-0 border-0 d-flex">
                  <div
                    onClick={() => {
                      toggleSide(h.id, 'left');
                      setHighlightedHotelId(h.id);
                      setTimeout(() => setHighlightedHotelId(null), 2000);
                    }}
                    style={{
                      flex:1, padding:'1rem',
                      borderLeft: h.loadedSides.left?'4px solid green':'4px solid transparent',
                      backgroundColor: h.loadedSides.left?'#eaffea':'transparent',
                      cursor:'pointer'
                    }}
                  >
                    {idx+1}. {h.nombre}
                  </div>
                  <div
                    onClick={() => {
                      toggleSide(h.id, 'right');
                      setHighlightedHotelId(h.id);
                      setTimeout(() => setHighlightedHotelId(null), 2000);
                    }}
                    style={{
                      flex:1, padding:'1rem',
                      borderRight: h.loadedSides.right?'4px solid green':'4px solid transparent',
                      backgroundColor: h.loadedSides.right?'#eaffea':'transparent',
                      cursor:'pointer'
                    }}
                  />
                  <Button
                    variant="danger" size="sm"
                    onClick={()=>removeHotel(h.id)}
                    className="ms-2"
                  >
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
