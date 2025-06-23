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
const puntoRecogidaIcon = L.icon({ iconUrl: '/iconos/guia.png',        iconSize: [25,25], iconAnchor: [12,12] });
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

const MapaConductor = () => {
  const navigate = useNavigate();

  // datos
  const [rutas, setRutas]             = useState([]);
  const [alertas, setAlertas]         = useState([]);
  const [allHotels, setAllHotels]     = useState([]);
  const [direcciones, setDirecciones] = useState([]);

  // listas y selección
  const [hotelLists, setHotelLists]         = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  });
  const [selectedListId, setSelectedListId] = useState(hotelLists[0]?.id || null);

  // búsqueda
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);

  // panel lateral: inputs para reordenar
  const [positionInputs, setPositionInputs] = useState({});

  // mapa y geolocalización
  const [mapInstance, setMapInstance] = useState(null);
  const [conductorPos, setConductorPos] = useState(null);
  const [tracking, setTracking] = useState(false);
  const watchIdRef = useRef(null);

  // carga datos iniciales
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

  // persiste listas
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hotelLists));
  }, [hotelLists]);

  const currentList = hotelLists.find(l => l.id === selectedListId);
  const myHotels    = currentList?.hotels || [];

  // geolocalización
  const toggleTracking = () => {
    if (!tracking && navigator.geolocation) {
      setTracking(true);
      watchIdRef.current = navigator.geolocation.watchPosition(
        pos => setConductorPos([pos.coords.latitude,pos.coords.longitude]),
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

  // búsqueda de hoteles
  const normalize = str => str.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const handleSearch = e => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoadingSearch(true);
    const q = normalize(searchQuery);
    setSearchResults(allHotels.filter(h=>normalize(h.nombre).includes(q)).slice(0,1000));
    setLoadingSearch(false);
  };
  const clearSearch = () => {
    setSearchQuery(''); setSearchResults([]);
  };

  // gestión de listas
  const addList    = () => { const name = prompt('Nombre de la nueva lista:'); if (!name) return; const id = Date.now().toString(); setHotelLists(prev=>[...prev,{id,name,hotels:[]}]); setSelectedListId(id); };
  const selectList = id => setSelectedListId(id);
  const removeList = id => { setHotelLists(prev=>prev.filter(l=>l.id!==id)); if (selectedListId===id) setSelectedListId(hotelLists[0]?.id||null); };

  // gestión de hoteles en lista
  const addHotel    = hotel => {
    if (!currentList.hotels.some(h=>h.id===hotel.id)) {
      setHotelLists(prev=>prev.map(l=>
        l.id===currentList.id
          ? {...l,hotels:[...l.hotels,{...hotel,loadedSides:{left:false,right:false}}]}
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
    const [item] = copy.splice(idx,1);
    copy.splice(pos-1,0,item);
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
      <Row className="mb-3">
        <Col>
          <h2>Mapa del Conductor</h2>
          <Button variant={tracking?'danger':'success'} onClick={toggleTracking} className="me-2">
            {tracking?'Detener Ruta':'Iniciar Ruta'}
          </Button>
          <Button variant="secondary" onClick={logout}>Cerrar Sesión</Button>
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
                  <span onClick={()=>selectList(l.id)} style={{cursor:'pointer'}}>{l.name}</span>
                  <Button variant="link" size="sm" onClick={()=>removeList(l.id)}>🗑</Button>
                </div>
              ))}
            </Dropdown.Menu>
          </Dropdown>
          <Button size="sm" onClick={addList}>+ Añadir Lista</Button>
        </Col>
      </Row>

      <Row>
        {/* Mapa */}
        <Col md={9} style={{height:'80vh'}}>
          <MapContainer center={[39.6908,2.9271]} zoom={10} style={{width:'100%',height:'100%'}} scrollWheelZoom zoomControl={false} maxZoom={18}>
            <SetMapInstance setMapInstance={setMapInstance}/>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap contributors"/>
            {conductorPos && <Marker position={conductorPos} icon={conductorIcon}><Popup>Tu ubicación actual</Popup></Marker>}
            {rutas.map(r=> <Polyline key={r.id} positions={r.coordenadas} color={getColor(r.tipo)}/>)}
            {alertas.map(a=>(
              <Marker key={a.id} position={a.coordenadas} icon={a.tipo==='puntoRecogida'?puntoRecogidaIcon:alertaIcon}>
                <Popup><h5>{a.title}</h5><p>{a.description}</p></Popup>
              </Marker>
            ))}
            {myHotels.map((h,idx)=>(
              <Marker
                key={h.id}
                position={[h.lat,h.lng]}
                icon={L.divIcon({
                  html:`<div style="position:relative;display:inline-block;">
                          <img src="/iconos/${h.tipo==='hotel_vial'?'hotel_azul':'hotel'}.png" style="width:32px;height:32px;"/>
                          <span style="position:absolute;top:-6px;right:-6px;
                                       font-size:14px;background:white;
                                       border:1px solid rgba(0,0,0,0.3);
                                       border-radius:50%;padding:2px 5px;">
                            ${idx+1}
                          </span>
                        </div>`,
                  iconSize:[25,25], iconAnchor:[12,12]
                })}
              >
                <Popup>
                  <div>
                    <h5>{h.nombre}</h5>
                    <Form onSubmit={e=>e.preventDefault()} className="d-flex align-items-center">
                      <FormControl
                        type="number"
                        min="1"
                        max={myHotels.length}
                        placeholder="Posición"
                        value={positionInputs[h.id]||''}
                        onChange={e=>setPositionInputs(p=>({...p,[h.id]:e.target.value}))}
                        style={{width:80,marginRight:'0.5rem'}}
                      />
                      <Button size="sm" onClick={()=>{
                        const pos = parseInt(positionInputs[h.id],10);
                        if (isNaN(pos)||pos<1||pos>myHotels.length) {
                          alert(`Introduce nº válido 1–${myHotels.length}`);
                        } else {
                          reorderHotel(h.id,pos);
                          setPositionInputs(p=>({...p,[h.id]:''}));
                        }
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
                <Polyline positions={d.coords} pathOptions={{color:'black',dashArray:'5,10'}}/>
                <ArrowedLine positions={d.coords}/>
              </Fragment>
            ))}
          </MapContainer>
        </Col>

        {/* Panel lateral */}
        <Col md={3} className="mt-3 mt-md-0">
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
                <ListGroup.Item key={h.id} className="mb-3 p-0">
                  <div
                    style={{
                      position:'relative',
                      cursor:'pointer',
                      userSelect:'none',
                      border:'1px solid #ddd',
                      borderRadius:'4px',
                      overflow:'hidden',
                      marginBottom:'0.5rem'
                    }}
                  >
                    {h.loadedSides.left && (
                      <div style={{
                        position:'absolute',
                        top:0,left:0,bottom:0,
                        width:'50%',backgroundColor:'#d4edda'
                      }}/>
                    )}
                    {h.loadedSides.right && (
                      <div style={{
                        position:'absolute',
                        top:0,right:0,bottom:0,
                        width:'50%',backgroundColor:'#d4edda'
                      }}/>
                    )}
                    <div
                      onClick={()=>toggleSide(h.id,'left')}
                      style={{position:'absolute',top:0,left:0,bottom:0,width:'50%',zIndex:1}}
                    />
                    <div
                      onClick={()=>toggleSide(h.id,'right')}
                      style={{position:'absolute',top:0,right:0,bottom:0,width:'50%',zIndex:1}}
                    />
                    <div style={{position:'relative',padding:'0.5rem',textAlign:'center',fontWeight:'bold'}}>
                      {idx+1}. {h.nombre}
                    </div>
                  </div>

                  

                  <Button
                    variant="danger"
                    size="sm"
                    onClick={()=>removeHotel(h.id)}
                    className="w-100"
                  >
                    Quitar hotel
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
