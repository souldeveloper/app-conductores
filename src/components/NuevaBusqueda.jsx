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
    console.log("Map instance captured:", map);
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

const MapaConductor = () => {
  const navigate = useNavigate();
  const [rutas, setRutas] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [hoteles, setHoteles] = useState([]);
  const [selectedHotelId, setSelectedHotelId] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [center, setCenter] = useState([39.69082068945872, 2.9271513449310866]);
  const [mapInstance, setMapInstance] = useState(null);
  const [conductorPos, setConductorPos] = useState(null);
  const [tracking, setTracking] = useState(false);
  const watchIdRef = useRef(null);
  const [conductor, setConductor] = useState(null);
  const [tempLine, setTempLine] = useState(null);

  // Validación de sesión
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
      console.error("Error parsing currentUser:", err);
      navigate('/');
      return;
    }
    if (!currentUser) {
      navigate('/');
      return;
    }
    const userDocRef = doc(db, "usuarios", currentUser.id);
    const unsubscribe = onSnapshot(
      userDocRef,
      (docSnap) => {
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
      },
      (error) => {
        console.error("Error validating user:", error);
        navigate('/');
      }
    );
    return () => unsubscribe();
  }, [navigate]);

  // Función para centrar el mapa en la ubicación actual del conductor
  const handleCenterMap = () => {
    if (!mapInstance) {
      console.warn("Map instance not yet created.");
      return;
    }
    if (conductorPos) {
      mapInstance.panTo(conductorPos, { animate: true });
    }
  };

  useEffect(() => {
    if (conductorPos && mapInstance) {
      mapInstance.panTo(conductorPos, { animate: true });
    }
  }, [conductorPos, mapInstance]);

  // Cargar rutas y alertas con listeners en tiempo real
  useEffect(() => {
    const rutasRef = collection(db, "rutas");
    const unsubscribeRutas = onSnapshot(rutasRef, (snapshot) => {
      const tempRutas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRutas(tempRutas);
    }, (error) => console.error("Error loading rutas:", error));

    const alertasRef = collection(db, "alertas");
    const unsubscribeAlertas = onSnapshot(alertasRef, (snapshot) => {
      const tempAlertas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAlertas(tempAlertas);
    }, (error) => console.error("Error loading alertas:", error));

    return () => {
      unsubscribeRutas();
      unsubscribeAlertas();
    };
  }, []);

  // Cargar los hoteles asignados al conductor con listener en tiempo real
  useEffect(() => {
    if (!conductor) return;
    const hotelesRef = collection(db, `usuarios/${conductor.id}/hoteles`);
    const unsubscribeHoteles = onSnapshot(hotelesRef, (snapshot) => {
      const tempHoteles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHoteles(tempHoteles);
    }, (error) => console.error("Error loading conductor's hoteles:", error));
    return () => unsubscribeHoteles();
  }, [conductor]);

  // Seguimiento de la ubicación del conductor
  const handleToggleTracking = () => {
    if (!tracking) {
      setTracking(true);
      if (navigator.geolocation) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            setConductorPos([latitude, longitude]);
            if (mapInstance) {
              mapInstance.panTo([latitude, longitude], { animate: true });
            }
          },
          (err) => console.error("Error obtaining location:", err),
          { enableHighAccuracy: true, maximumAge: 0 }
        );
      }
    } else {
      setTracking(false);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    }
  };

  // Búsqueda de hoteles en la colección "hoteles"
  const handleSearchHotels = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoadingSearch(true);
    setSearchResults([]);
    try {
      const hotelesRef = collection(db, "hoteles");
      const snapshot = await getDocs(hotelesRef);
      const allHotels = [];
      snapshot.forEach((doc) => {
        allHotels.push({ id: doc.id, ...doc.data() });
      });
      const filteredHotels = allHotels.filter(hotel =>
        hotel.nombre && hotel.nombre.toLowerCase().includes(searchQuery.toLowerCase())
      );
      const results = filteredHotels.map(hotel => ({
        displayName: hotel.nombre,
        lat: hotel.lat,
        lng: hotel.lng
      }));
      setSearchResults(results);
    } catch (err) {
      console.error("Error searching hotels in Firestore:", err);
    }
    setLoadingSearch(false);
  };

  // Agregar hotel a la subcolección del conductor
  const handleAddHotel = async (hotelItem) => {
    if (!conductor) return;
    if (hotelItem.lat === undefined || hotelItem.lng === undefined) {
      console.error("Faltan coordenadas en el hotel:", hotelItem);
      return;
    }
    try {
      const currentOrders = hoteles.map(h => h.orden || 0);
      const nextOrden = currentOrders.length ? Math.max(...currentOrders) + 1 : 1;
      const newHotelRef = doc(collection(db, `usuarios/${conductor.id}/hoteles`));
      await setDoc(newHotelRef, {
        nombre: hotelItem.displayName,
        lat: hotelItem.lat,
        lng: hotelItem.lng,
        orden: nextOrden
      });
      // El listener actualizará automáticamente el estado de hoteles
    } catch (err) {
      console.error("Error adding hotel:", err);
    }
  };

  // Eliminar hotel de la subcolección del conductor
  const handleDeleteHotel = async (hotelId) => {
    if (!conductor) return;
    try {
      await deleteDoc(doc(db, `usuarios/${conductor.id}/hoteles`, hotelId));
      // El listener actualizará el estado de hoteles
    } catch (err) {
      console.error("Error deleting hotel:", err);
    }
  };

  // Funciones para reordenar hoteles
  const handleMoveUp = async (hotel) => {
    const sorted = [...hoteles].sort((a, b) => (a.orden || 0) - (b.orden || 0));
    const index = sorted.findIndex(h => h.id === hotel.id);
    if (index <= 0) return;
    const previousHotel = sorted[index - 1];
    const currentOrder = hotel.orden || 0;
    const previousOrder = previousHotel.orden || 0;
    try {
      await setDoc(doc(db, `usuarios/${conductor.id}/hoteles`, hotel.id), { ...hotel, orden: previousOrder });
      await setDoc(doc(db, `usuarios/${conductor.id}/hoteles`, previousHotel.id), { ...previousHotel, orden: currentOrder });
      // El listener actualizará automáticamente el estado de hoteles
    } catch (err) {
      console.error("Error reordering hotel:", err);
    }
  };

  const handleMoveDown = async (hotel) => {
    const sorted = [...hoteles].sort((a, b) => (a.orden || 0) - (b.orden || 0));
    const index = sorted.findIndex(h => h.id === hotel.id);
    if (index === -1 || index >= sorted.length - 1) return;
    const nextHotel = sorted[index + 1];
    const currentOrder = hotel.orden || 0;
    const nextOrder = nextHotel.orden || 0;
    try {
      await setDoc(doc(db, `usuarios/${conductor.id}/hoteles`, hotel.id), { ...hotel, orden: nextOrder });
      await setDoc(doc(db, `usuarios/${conductor.id}/hoteles`, nextHotel.id), { ...nextHotel, orden: currentOrder });
    } catch (err) {
      console.error("Error reordering hotel:", err);
    }
  };

  // Seleccionar o deseleccionar hotel
  const handleSelectHotel = (hotelId) => {
    setSelectedHotelId(selectedHotelId === hotelId ? null : hotelId);
  };

  // Al hacer clic en el ícono del hotel para dibujar una línea
  const handleHotelIconClick = (hotel) => {
    const hotelName = hotel.displayName ? hotel.displayName.split(',')[0].trim() : hotel.nombre.split(',')[0].trim();
    const matchingPickup = alertas.find((alerta) => {
      if (!alerta.description) return false;
      const desc = alerta.description.trim().toLowerCase();
      const hName = hotelName.toLowerCase();
      return desc.includes(hName) || hName.includes(desc);
    });
    if (
      matchingPickup && 
      matchingPickup.coordenadas &&
      hotel.lat !== undefined &&
      hotel.lng !== undefined &&
      matchingPickup.coordenadas.lat !== undefined &&
      matchingPickup.coordenadas.lng !== undefined
    ) {
      const lineCoords = [
        [hotel.lat, hotel.lng],
        [matchingPickup.coordenadas.lat, matchingPickup.coordenadas.lng]
      ];
      setTempLine(lineCoords);
      setTimeout(() => setTempLine(null), 10000);
    } else {
      console.log("No se encontró punto de recogida válido para:", hotelName);
    }
  };

  const sortedHoteles = [...hoteles].sort((a, b) => (a.orden || 0) - (b.orden || 0));
  const displayedHoteles = selectedHotelId ? sortedHoteles.filter(h => h.id === selectedHotelId) : sortedHoteles;

  return (
    <Container fluid style={{ padding: '2rem' }}>
      <Row className="mt-3">
        <Col>
          <h2>Mapa del Conductor</h2>
          <Button variant={tracking ? 'danger' : 'success'} onClick={handleToggleTracking} className="mb-2">
            {tracking ? 'Detener Ruta' : 'Iniciar Ruta'}
          </Button>
          <Button variant="info" onClick={handleCenterMap} className="mb-2 ms-2">
            Centrar en mi ubicación
          </Button>
        </Col>
      </Row>
      <Row>
        <Col md={9}>
          <MapContainer center={center} zoom={10} style={{ height: '80vh' }}>
            <SetMapInstance setMapInstance={setMapInstance} />
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {conductorPos && (
              <Marker position={conductorPos} icon={conductorIcon}>
                <Popup>Tu ubicación actual</Popup>
              </Marker>
            )}
            {rutas.map((ruta) => {
              if (!Array.isArray(ruta.coordenadas)) return null;
              return (
                <Polyline
                  key={ruta.id}
                  positions={ruta.coordenadas.map((c) => [c.lat, c.lng])}
                  color={getColor(ruta.tipo)}
                />
              );
            })}
            {alertas.map((alerta) => {
              if (!alerta.coordenadas) return null;
              const iconUsed = alerta.tipo === 'puntoRecogida' ? puntoRecogidaIcon : alertaIcon;
              return (
                <Marker key={alerta.id} position={[alerta.coordenadas.lat, alerta.coordenadas.lng]} icon={iconUsed}>
                  <Popup>
                    <h5>{alerta.title || 'Sin título'}</h5>
                    <p>{alerta.description || 'Sin descripción'}</p>
                  </Popup>
                </Marker>
              );
            })}
            {hoteles
              .filter(h => !selectedHotelId || h.id === selectedHotelId)
              .map((hotel) => (
                <Marker
                  key={hotel.id}
                  position={[hotel.lat, hotel.lng]}
                  icon={hotelIcon}
                  eventHandlers={{ click: () => handleHotelIconClick(hotel) }}
                >
                  <Popup>
                    <h5>{hotel.nombre}</h5>
                    <Button variant="danger" size="sm" onClick={() => handleDeleteHotel(hotel.id)}>
                      Eliminar Hotel
                    </Button>
                  </Popup>
                </Marker>
            ))}
            {tempLine && <Polyline positions={tempLine} color="purple" dashArray="5, 10" />}
          </MapContainer>
        </Col>
        <Col md={3}>
          <h4>Buscar Hoteles</h4>
          <Form onSubmit={handleSearchHotels}>
            <FormControl
              type="text"
              placeholder="Nombre del hotel"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Button variant="primary" type="submit" className="mt-2">
              Buscar
            </Button>
          </Form>
          {loadingSearch && <Spinner animation="border" className="my-2" />}
          {searchResults.length > 0 && (
            <ListGroup className="mt-2">
              {searchResults.map((res, idx) => (
                <ListGroup.Item key={idx} action onClick={() => handleHotelIconClick(res)}>
                  {res.displayName}
                  <Button
                    variant="success"
                    size="sm"
                    className="float-end"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddHotel(res);
                    }}
                  >
                    +
                  </Button>
                </ListGroup.Item>
              ))}
            </ListGroup>
          )}
          <h4 className="mt-4">Mis Hoteles</h4>
          {displayedHoteles.length === 0 && <Alert variant="info">No hay hoteles agregados.</Alert>}
          {displayedHoteles.length > 0 && (
            <Table striped bordered hover size="sm">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Orden</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sortedHoteles.map((h) => (
                  <tr
                    key={h.id}
                    onClick={() => handleSelectHotel(h.id)}
                    style={{ cursor: 'pointer', backgroundColor: selectedHotelId === h.id ? '#e0e0e0' : 'inherit' }}
                  >
                    <td>{h.nombre}</td>
                    <td>{h.orden}</td>
                    <td>
                      <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); handleMoveUp(h); }}>
                        ↑
                      </Button>{' '}
                      <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); handleMoveDown(h); }}>
                        ↓
                      </Button>{' '}
                      <Button variant="danger" size="sm" onClick={(e) => { e.stopPropagation(); handleDeleteHotel(h.id); }}>
                        Eliminar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Col>
      </Row>
    </Container>
  );
};

export default MapaConductor;
