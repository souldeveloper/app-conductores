// src/components/AdminPanel.jsx
import React, { useEffect, useState, useRef } from 'react';
import { Container, Button, Row, Col, Table, Form } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, FeatureGroup, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import { collection, onSnapshot, updateDoc, deleteDoc, doc, addDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../firebaseConfig';
import Cookies from 'js-cookie';
import L from 'leaflet';

// Función para asignar el color de la línea según el tipo de ruta
const getColor = (tipo) => {
  switch (tipo) {
    case 'segura':
      return 'green';
    case 'advertencia':
      return 'yellow';
    case 'prohibida':
      return 'red';
    default:
      return 'blue';
  }
};

// Íconos
const alertaIcon = L.icon({
  iconUrl: '/iconos/alerta.png',
  iconSize: [25, 25],
  iconAnchor: [12, 12],
});
const puntoRecogidaIcon = L.icon({
  iconUrl: '/iconos/recogida.png',
  iconSize: [25, 25],
  iconAnchor: [12, 12],
});
const conductorIcon = L.icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/2290/2290343.png',
  iconSize: [35, 35],
  iconAnchor: [17, 17],
});
const hotelIcon = L.icon({
  iconUrl: '/iconos/hotel.png',
  iconSize: [25, 25],
  iconAnchor: [12, 12],
});

// Componente auxiliar para capturar la instancia del mapa
const SetMapInstance = ({ setMapInstance }) => {
  const map = useMap();
  useEffect(() => {
    setMapInstance(map);
    console.log("Map instance captured:", map);
  }, [map, setMapInstance]);
  return null;
};

const AdminPanel = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [error, setError] = useState('');
  const [mapInstance, setMapInstance] = useState(null);
  const [rutas, setRutas] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [hoteles, setHoteles] = useState([]);
  const [center, setCenter] = useState([39.70241114681138, 2.9437189174222302]);
  const featureGroupRef = useRef(null);

  // Estado para saber qué ruta se está editando
  const [editingRoute, setEditingRoute] = useState(null);

  // Estados para selectores
  const [selectedLineColor, setSelectedLineColor] = useState('green');
  const [selectedMarkerType, setSelectedMarkerType] = useState('alerta');

  // Validación de sesión y acceso de admin
  useEffect(() => {
    const currentUserStr = Cookies.get('currentUser');
    const localDeviceUid = Cookies.get('deviceUid');
    if (!currentUserStr || !localDeviceUid) {
      navigate('/');
      return;
    }
    let currentUserObj;
    try {
      currentUserObj = JSON.parse(currentUserStr);
    } catch (err) {
      console.error("Error parsing currentUser:", err);
      navigate('/');
      return;
    }
    if (!currentUserObj || !currentUserObj.id) {
      navigate('/');
      return;
    }
    const allowedAdmins = ["admimanuel", "adminjose", "admindani"];
    if (!allowedAdmins.includes(currentUserObj.usuario)) {
      navigate('/');
      return;
    }
    const userDocRef = doc(db, "usuarios", currentUserObj.id);
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
          setCurrentUser({ id: docSnap.id, ...userData });
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

  // Cargar rutas y alertas con listeners en tiempo real
  useEffect(() => {
    const rutasRef = collection(db, 'rutas');
    const unsubscribeRutas = onSnapshot(rutasRef, (snapshot) => {
      const loadedRutas = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      setRutas(loadedRutas);
    }, (error) => {
      console.error('Error loading rutas:', error);
      setError('Error loading map data.');
    });

    const alertasRef = collection(db, 'alertas');
    const unsubscribeAlertas = onSnapshot(alertasRef, (snapshot) => {
      const loadedAlertas = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      setAlertas(loadedAlertas);
    }, (error) => {
      console.error('Error loading alertas:', error);
      setError('Error loading map data.');
    });

    return () => {
      unsubscribeRutas();
      unsubscribeAlertas();
    };
  }, []);

  // Cargar hoteles con listener en tiempo real
  useEffect(() => {
    const hotelesRef = collection(db, 'hoteles');
    const unsubscribeHoteles = onSnapshot(hotelesRef, (snapshot) => {
      const loadedHoteles = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      setHoteles(loadedHoteles);
    }, (error) => {
      console.error('Error loading hoteles:', error);
    });
    return () => unsubscribeHoteles();
  }, []);

  // Cargar usuarios con listener en tiempo real
  useEffect(() => {
    const usuariosRef = collection(db, 'usuarios');
    const unsubscribeUsuarios = onSnapshot(usuariosRef, (snapshot) => {
      const users = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      setUsuarios(users);
    }, (error) => {
      console.error('Error loading users:', error);
      setError('Error loading users.');
    });
    return () => unsubscribeUsuarios();
  }, []);

  // Manejo de figuras con react-leaflet-draw
  const onCreated = async (e) => {
    const { layerType, layer } = e;

    if (layerType === 'polyline') {
      const latlngs = layer.getLatLngs();
      let tipo = 'segura';
      if (selectedLineColor === 'yellow') tipo = 'advertencia';
      if (selectedLineColor === 'red') tipo = 'prohibida';

      try {
        const docRef = await addDoc(collection(db, 'rutas'), {
          tipo,
          coordenadas: latlngs.map((ll) => ({ lat: ll.lat, lng: ll.lng })),
        });
        layer.options.docId = docRef.id;
        // El listener actualizará automáticamente el estado de rutas
      } catch (err) {
        console.error('Error saving route:', err);
      }
    }

    if (layerType === 'marker') {
      const { lat, lng } = layer.getLatLng();

      if (selectedMarkerType === 'hotel') {
        const nombre = prompt('Ingrese el nombre del hotel', 'Hotel');
        if (!nombre) return;
        try {
          const docRef = await addDoc(collection(db, 'hoteles'), { nombre, lat, lng });
          layer.options.docIdHotel = docRef.id;
          // El listener actualizará automáticamente el estado de hoteles
        } catch (err) {
          console.error('Error saving hotel:', err);
        }
      } else {
        const tipo = selectedMarkerType;
        const title = prompt('Ingrese un título para la marca', 'Título');
        const description = prompt('Ingrese una descripción para la marca', 'Descripción');
        try {
          const docRef = await addDoc(collection(db, 'alertas'), {
            tipo,
            coordenadas: { lat, lng },
            title,
            description,
          });
          layer.options.docIdMarker = docRef.id;
          // El listener actualizará automáticamente el estado de alertas
        } catch (err) {
          console.error('Error saving marker:', err);
        }
      }
    }
  };

  // Actualización de rutas desde el EditControl
  const onEdited = async (e) => {
    const { layers } = e;
    layers.eachLayer(async (layer) => {
      if (layer.options && layer.options.docId) {
        const newCoordinates = layer.getLatLngs().map((ll) => ({ lat: ll.lat, lng: ll.lng }));
        try {
          await updateDoc(doc(db, 'rutas', layer.options.docId), { coordenadas: newCoordinates });
          // El listener actualizará el estado de rutas
        } catch (err) {
          console.error('Error actualizando la ruta:', err);
        }
      }
    });
  };

  // Eliminación de figuras
  const onDeleted = async (e) => {
    const { layers } = e;
    layers.eachLayer(async (layer) => {
      if (layer.options && layer.options.docId) {
        try {
          await deleteDoc(doc(db, 'rutas', layer.options.docId));
          // El listener actualizará el estado de rutas
        } catch (err) {
          console.error('Error deleting route:', err);
        }
      }
      if (layer.options && layer.options.docIdMarker) {
        try {
          await deleteDoc(doc(db, 'alertas', layer.options.docIdMarker));
          // El listener actualizará el estado de alertas
        } catch (err) {
          console.error('Error deleting marker:', err);
        }
      }
      if (layer.options && layer.options.docIdHotel) {
        try {
          await deleteDoc(doc(db, 'hoteles', layer.options.docIdHotel));
          // El listener actualizará el estado de hoteles
        } catch (err) {
          console.error('Error deleting hotel:', err);
        }
      }
    });
  };

  // Actualizar la posición de un hotel al arrastrarlo
  const handleHotelDragEnd = async (e, hotelId) => {
    const { lat, lng } = e.target.getLatLng();
    try {
      await updateDoc(doc(db, 'hoteles', hotelId), { lat, lng });
      // El listener se encargará de actualizar el estado de hoteles
    } catch (err) {
      console.error('Error updating hotel position:', err);
    }
  };

  // Función para desactivar un usuario
  const handleDeactivateUser = async (userId) => {
    try {
      await updateDoc(doc(db, 'usuarios', userId), { activo: false });
      // El listener actualizará el estado de usuarios
    } catch (err) {
      console.error('Error deactivating user:', err);
    }
  };

  // Función para editar un hotel
  const handleEditHotel = async (hotelId, currentHotel) => {
    const nuevoNombre = prompt('Ingrese el nuevo nombre del hotel', currentHotel.nombre);
    if (!nuevoNombre) return;
    try {
      await updateDoc(doc(db, 'hoteles', hotelId), { nombre: nuevoNombre });
      // El listener actualizará el estado de hoteles
    } catch (err) {
      console.error('Error editing hotel:', err);
    }
  };

  // Función para eliminar un hotel
  const handleDeleteHotel = async (hotelId) => {
    try {
      await deleteDoc(doc(db, 'hoteles', hotelId));
      // El listener actualizará el estado de hoteles
    } catch (err) {
      console.error('Error deleting hotel:', err);
    }
  };

  // Función para editar la información de un usuario
  const handleEditUser = async (userId, currentUserData) => {
    const nuevoUsuario = prompt('Ingrese el nuevo nombre de usuario', currentUserData.usuario);
    if (!nuevoUsuario) return;
    try {
      await updateDoc(doc(db, 'usuarios', userId), { usuario: nuevoUsuario });
      // El listener actualizará el estado de usuarios
    } catch (err) {
      console.error('Error editing user:', err);
    }
  };

  // Función para cerrar sesión
  const handleLogout = async () => {
    try {
      await signOut(auth);
      Cookies.remove('currentUser');
      navigate('/');
    } catch (err) {
      console.error('Error during logout:', err);
      setError('Error during logout.');
    }
  };

  // --- Funcionalidad de edición personalizada de rutas ---
  const handleVertexDrag = (e, index) => {
    const { lat, lng } = e.target.getLatLng();
    setEditingRoute((prev) => {
      const newCoords = [...prev.coordenadas];
      newCoords[index] = { lat, lng };
      return { ...prev, coordenadas: newCoords };
    });
  };

  const saveEditedRoute = async () => {
    if (!editingRoute) return;
    try {
      await updateDoc(doc(db, 'rutas', editingRoute.id), { coordenadas: editingRoute.coordenadas });
      setEditingRoute(null);
    } catch (err) {
      console.error("Error guardando la edición de la ruta:", err);
    }
  };
  // --- Fin funcionalidad de edición personalizada ---

  return (
    <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
      <Container fluid>
        <Row className="mb-3">
          <Col md={4}>
            <Form.Group controlId="lineColor">
              <Form.Label>Color de la línea:</Form.Label>
              <Form.Control
                as="select"
                value={selectedLineColor}
                onChange={(e) => setSelectedLineColor(e.target.value)}
              >
                <option value="green">Verde (Segura)</option>
                <option value="yellow">Amarilla (Advertencia)</option>
                <option value="red">Roja (Prohibida)</option>
              </Form.Control>
            </Form.Group>
          </Col>
          <Col md={4}>
            <Form.Group controlId="markerType">
              <Form.Label>Tipo de punto:</Form.Label>
              <Form.Control
                as="select"
                value={selectedMarkerType}
                onChange={(e) => setSelectedMarkerType(e.target.value)}
              >
                <option value="alerta">Alerta (Triángulo)</option>
                <option value="puntoRecogida">Punto de Recogida (Casita)</option>
                <option value="hotel">Hotel</option>
              </Form.Control>
            </Form.Group>
          </Col>
        </Row>
        <Row>
          <Col md={9} style={{ position: 'relative' }}>
            <MapContainer center={center} zoom={10} style={{ height: '80vh' }}>
              <SetMapInstance setMapInstance={setMapInstance} />
              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FeatureGroup ref={featureGroupRef}>
                <EditControl
                  position="topright"
                  onCreated={onCreated}
                  onEdited={onEdited}
                  onDeleted={onDeleted}
                  draw={{
                    rectangle: false,
                    circle: false,
                    circlemarker: false,
                    polygon: false,
                    marker: true,
                    polyline: {
                      shapeOptions: {
                        color: selectedLineColor,
                      },
                    },
                  }}
                />
              </FeatureGroup>
              {rutas.map((ruta) =>
                !editingRoute || ruta.id !== editingRoute.id ? (
                  Array.isArray(ruta.coordenadas) && (
                    <Polyline
                      key={ruta.id}
                      positions={ruta.coordenadas.map((c) => [c.lat, c.lng])}
                      color={getColor(ruta.tipo)}
                    >
                      <Popup>
                        <h5>Ruta: {ruta.tipo}</h5>
                        <Button variant="primary" size="sm" onClick={() => setEditingRoute(ruta)}>
                          Editar ruta
                        </Button>{' '}
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() =>
                            deleteDoc(doc(db, 'rutas', ruta.id))
                          }
                        >
                          Eliminar ruta
                        </Button>
                      </Popup>
                    </Polyline>
                  )
                ) : null
              )}
              {editingRoute && (
                <>
                  <Polyline
                    key={`editing-${editingRoute.id}`}
                    positions={editingRoute.coordenadas.map((c) => [c.lat, c.lng])}
                    color={getColor(editingRoute.tipo)}
                    dashArray="5,10"
                  />
                  {editingRoute.coordenadas.map((c, index) => (
                    <Marker
                      key={`editing-marker-${index}`}
                      position={[c.lat, c.lng]}
                      draggable={true}
                      eventHandlers={{
                        dragend: (e) => handleVertexDrag(e, index),
                      }}
                    >
                      <Popup>Punto {index + 1}</Popup>
                    </Marker>
                  ))}
                  <div
                    style={{
                      position: 'absolute',
                      top: 10,
                      left: 10,
                      zIndex: 1000,
                      backgroundColor: 'white',
                      padding: '10px',
                      borderRadius: '5px',
                    }}
                  >
                    <Button variant="success" onClick={saveEditedRoute}>
                      Guardar cambios
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setEditingRoute(null)}
                      style={{ marginLeft: '10px' }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </>
              )}
              {alertas.map((alerta) =>
                alerta.coordenadas ? (
                  <Marker
                    key={alerta.id}
                    position={[alerta.coordenadas.lat, alerta.coordenadas.lng]}
                    icon={
                      alerta.tipo === 'puntoRecogida'
                        ? puntoRecogidaIcon
                        : alertaIcon
                    }
                  >
                    <Popup>
                      <h5>{alerta.title || 'Sin título'}</h5>
                      <p>{alerta.description || 'Sin descripción'}</p>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() =>
                          deleteDoc(doc(db, 'alertas', alerta.id))
                        }
                      >
                        Eliminar punto
                      </Button>
                    </Popup>
                  </Marker>
                ) : null
              )}
              {hoteles.map((hotel) => (
                <Marker
                  key={hotel.id}
                  position={[hotel.lat, hotel.lng]}
                  icon={hotelIcon}
                  draggable={true}
                  eventHandlers={{
                    dragend: (e) => handleHotelDragEnd(e, hotel.id),
                  }}
                >
                  <Popup>
                    <h5>{hotel.nombre}</h5>
                    <Button variant="primary" size="sm" onClick={() => handleEditHotel(hotel.id, hotel)}>
                      Editar
                    </Button>{' '}
                    <Button variant="danger" size="sm" onClick={() => handleDeleteHotel(hotel.id)}>
                      Eliminar
                    </Button>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </Col>
        </Row>
        
      </Container>
    </div>
  );
};

export default AdminPanel;
