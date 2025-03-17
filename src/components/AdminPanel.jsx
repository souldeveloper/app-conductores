// src/components/AdminPanel.jsx
import React, { useEffect, useState, useRef } from 'react';
import { Container, Button, Row, Col, Table, Alert, Form } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, FeatureGroup, Polyline, Marker, Popup } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import { collection, getDocs, updateDoc, deleteDoc, doc, addDoc, onSnapshot } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../firebaseConfig';
import Cookies from 'js-cookie';
import L from 'leaflet';
import { useMap } from 'react-leaflet';

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

// Íconos existentes
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

// Ícono para hoteles (asegúrate de tener la imagen en /iconos/hotel.png)
const hotelIcon = L.icon({
  iconUrl: '/iconos/hotel.png',
  iconSize: [25, 25],
  iconAnchor: [12, 12],
});

// Componente auxiliar para capturar la instancia del mapa usando useMap
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

  // Estados de datos del mapa
  const [rutas, setRutas] = useState([]);
  const [alertas, setAlertas] = useState([]);
  // Nuevo estado para hoteles
  const [hoteles, setHoteles] = useState([]);
  
  const [center, setCenter] = useState([39.70241114681138, 2.9437189174222302]); // Centro por defecto
  const mapRef = useRef(null);
  const featureGroupRef = useRef(null);

  // Estados para selectores
  const [selectedLineColor, setSelectedLineColor] = useState('green');
  const [selectedMarkerType, setSelectedMarkerType] = useState('alerta');

  // Validación de sesión y acceso de admin (sin cambios)
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

  // Cargar rutas y alertas
  useEffect(() => {
    const fetchData = async () => {
      try {
        const rutasRef = collection(db, 'rutas');
        const rutasSnap = await getDocs(rutasRef);
        const loadedRutas = [];
        rutasSnap.forEach((docSnap) => {
          loadedRutas.push({ id: docSnap.id, ...docSnap.data() });
        });
        setRutas(loadedRutas);

        const alertasRef = collection(db, 'alertas');
        const alertasSnap = await getDocs(alertasRef);
        const loadedAlertas = [];
        alertasSnap.forEach((docSnap) => {
          loadedAlertas.push({ id: docSnap.id, ...docSnap.data() });
        });
        setAlertas(loadedAlertas);
      } catch (err) {
        console.error('Error loading rutas/alertas:', err);
        setError('Error loading map data.');
      }
    };

    fetchData();
  }, []);

  // Cargar hoteles desde Firestore
  useEffect(() => {
    const fetchHoteles = async () => {
      try {
        const hotelesRef = collection(db, 'hoteles');
        const hotelesSnap = await getDocs(hotelesRef);
        const loadedHoteles = [];
        hotelesSnap.forEach((docSnap) => {
          loadedHoteles.push({ id: docSnap.id, ...docSnap.data() });
        });
        setHoteles(loadedHoteles);
      } catch (err) {
        console.error('Error loading hoteles:', err);
      }
    };

    fetchHoteles();
  }, []);

  // Cargar usuarios para el listado en el panel
  useEffect(() => {
    const fetchUsuarios = async () => {
      try {
        const usuariosRef = collection(db, 'usuarios');
        const querySnapshot = await getDocs(usuariosRef);
        const users = [];
        querySnapshot.forEach((docSnap) => {
          users.push({ id: docSnap.id, ...docSnap.data() });
        });
        setUsuarios(users);
      } catch (err) {
        console.error('Error loading users:', err);
        setError('Error loading users.');
      }
    };

    fetchUsuarios();
  }, []);

  // Manejo de figuras con react-leaflet-draw
  const onCreated = async (e) => {
    const { layerType, layer } = e;

    // Si se dibuja una polilínea (ruta)
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
        setRutas((prev) => [
          ...prev,
          { id: docRef.id, tipo, coordenadas: latlngs.map((ll) => ({ lat: ll.lat, lng: ll.lng })) },
        ]);
      } catch (err) {
        console.error('Error saving route:', err);
      }
    }

    // Si se crea un marcador (alerta, punto de recogida o hotel)
    if (layerType === 'marker') {
      const { lat, lng } = layer.getLatLng();

      // Caso de hotel
      if (selectedMarkerType === 'hotel') {
        const nombre = prompt('Ingrese el nombre del hotel', 'Hotel');
        if (!nombre) return; // Si no se ingresa nombre, no se guarda
        try {
          const docRef = await addDoc(collection(db, 'hoteles'), { nombre, lat, lng });
          layer.options.docIdHotel = docRef.id;
          setHoteles((prev) => [...prev, { id: docRef.id, nombre, lat, lng }]);
        } catch (err) {
          console.error('Error saving hotel:', err);
        }
      } else {
        // Casos existentes: alerta y punto de recogida
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
          setAlertas((prev) => [
            ...prev,
            { id: docRef.id, tipo, coordenadas: { lat, lng }, title, description },
          ]);
        } catch (err) {
          console.error('Error saving marker:', err);
        }
      }
    }
  };

  const onEdited = async (e) => {
    const { layers } = e;
    layers.eachLayer((layer) => {
      console.log('Edited layer:', layer);
      // Aquí se podría actualizar la información en Firestore si se detecta un cambio
    });
  };

  const onDeleted = async (e) => {
    const { layers } = e;
    layers.eachLayer(async (layer) => {
      if (layer.options && layer.options.docId) {
        try {
          await deleteDoc(doc(db, 'rutas', layer.options.docId));
          setRutas((prev) => prev.filter((ruta) => ruta.id !== layer.options.docId));
        } catch (err) {
          console.error('Error deleting route:', err);
        }
      }
      if (layer.options && layer.options.docIdMarker) {
        try {
          await deleteDoc(doc(db, 'alertas', layer.options.docIdMarker));
          setAlertas((prev) =>
            prev.filter((alerta) => alerta.id !== layer.options.docIdMarker)
          );
        } catch (err) {
          console.error('Error deleting marker:', err);
        }
      }
      // Si se elimina un marcador de hotel
      if (layer.options && layer.options.docIdHotel) {
        try {
          await deleteDoc(doc(db, 'hoteles', layer.options.docIdHotel));
          setHoteles((prev) =>
            prev.filter((hotel) => hotel.id !== layer.options.docIdHotel)
          );
        } catch (err) {
          console.error('Error deleting hotel:', err);
        }
      }
    });
  };

  // Función para actualizar la posición de un hotel al arrastrarlo
  const handleHotelDragEnd = async (e, hotelId) => {
    const { lat, lng } = e.target.getLatLng();
    try {
      await updateDoc(doc(db, 'hoteles', hotelId), { lat, lng });
      setHoteles((prev) =>
        prev.map((hotel) =>
          hotel.id === hotelId ? { ...hotel, lat, lng } : hotel
        )
      );
    } catch (err) {
      console.error('Error updating hotel position:', err);
    }
  };

  // Función para desactivar un usuario
const handleDeactivateUser = async (userId) => {
  try {
    await updateDoc(doc(db, 'usuarios', userId), { activo: false });
    setUsuarios((prev) =>
      prev.map((user) =>
        user.id === userId ? { ...user, activo: false } : user
      )
    );
  } catch (err) {
    console.error('Error deactivating user:', err);
  }
};
  // Función para editar un hotel (por ejemplo, cambiar el nombre)
  const handleEditHotel = async (hotelId, currentHotel) => {
    const nuevoNombre = prompt('Ingrese el nuevo nombre del hotel', currentHotel.nombre);
    if (!nuevoNombre) return;
    try {
      await updateDoc(doc(db, 'hoteles', hotelId), { nombre: nuevoNombre });
      setHoteles((prev) =>
        prev.map((hotel) =>
          hotel.id === hotelId ? { ...hotel, nombre: nuevoNombre } : hotel
        )
      );
    } catch (err) {
      console.error('Error editing hotel:', err);
    }
  };

  // Función para eliminar un hotel
  const handleDeleteHotel = async (hotelId) => {
    try {
      await deleteDoc(doc(db, 'hoteles', hotelId));
      setHoteles((prev) => prev.filter((hotel) => hotel.id !== hotelId));
    } catch (err) {
      console.error('Error deleting hotel:', err);
    }
  };

  // Función para editar información de usuario
  const handleEditUser = async (userId, currentUserData) => {
    // Aquí se puede elegir qué campo editar. Por ejemplo, editar el nombre de usuario:
    const nuevoUsuario = prompt('Ingrese el nuevo nombre de usuario', currentUserData.usuario);
    if (!nuevoUsuario) return;
    try {
      await updateDoc(doc(db, 'usuarios', userId), { usuario: nuevoUsuario });
      setUsuarios((prev) =>
        prev.map((user) =>
          user.id === userId ? { ...user, usuario: nuevoUsuario } : user
        )
      );
    } catch (err) {
      console.error('Error editing user:', err);
    }
  };

  // Cerrar sesión
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
        <Col md={9}>
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
              Array.isArray(ruta.coordenadas) ? (
                <Polyline
                  key={ruta.id}
                  positions={ruta.coordenadas.map((c) => [c.lat, c.lng])}
                  color={getColor(ruta.tipo)}
                >
                  <Popup>
                    <h5>Ruta: {ruta.tipo}</h5>
                    <Button
                      variant="danger"
                      onClick={() =>
                        deleteDoc(doc(db, 'rutas', ruta.id)).then(() =>
                          setRutas((prev) =>
                            prev.filter((r) => r.id !== ruta.id)
                          )
                        )
                      }
                    >
                      Eliminar esta ruta
                    </Button>
                  </Popup>
                </Polyline>
              ) : null
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
                        deleteDoc(doc(db, 'alertas', alerta.id)).then(() =>
                          setAlertas((prev) =>
                            prev.filter((a) => a.id !== alerta.id)
                          )
                        )
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
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleEditHotel(hotel.id, hotel)}
                  >
                    Editar
                  </Button>{' '}
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDeleteHotel(hotel.id)}
                  >
                    Eliminar
                  </Button>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </Col>
      </Row>
      <Row className="mt-4">
        <Col>
          <h4>Listado de Usuarios</h4>
          <Table striped bordered hover responsive>
            <thead>
              <tr>
                <th>ID</th>
                <th>Usuario</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((user) => (
                <tr key={user.id}>
                  <td>{user.id}</td>
                  <td>{user.usuario}</td>
                  <td>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleEditUser(user.id, user)}
                    >
                      Editar
                    </Button>{' '}
                    <Button
                      variant="warning"
                      size="sm"
                      onClick={() => handleDeactivateUser(user.id)}
                    >
                      Desactivar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Col>
      </Row>
    </Container>
      </div>
    
  );
};

export default AdminPanel;
