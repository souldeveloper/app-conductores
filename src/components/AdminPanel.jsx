// src/components/AdminPanel.jsx
import React, { useEffect, useState, useRef } from 'react';
import { Container, Button, Row, Col, Table, Alert, Form } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, FeatureGroup, Polyline, Marker, Popup } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import { collection, getDocs, updateDoc, deleteDoc, doc, addDoc,onSnapshot } from 'firebase/firestore';
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


  // Datos del mapa: rutas y alertas
  const [rutas, setRutas] = useState([]);
  const [alertas, setAlertas] = useState([]);
  
  const [center, setCenter] = useState([39.70241114681138, 2.9437189174222302]); // Centro por defecto (Madrid)
  const mapRef = useRef(null);
  const featureGroupRef = useRef(null);

  // Estados para selectores
  const [selectedLineColor, setSelectedLineColor] = useState('green');
  const [selectedMarkerType, setSelectedMarkerType] = useState('alerta');

  // Validación de sesión: se utiliza la cookie "currentUser" y "deviceUid".
  // Además, se permite el acceso solo a los usuarios "admimanuel", "adminjose" o "admindani".
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
    // Lista de usuarios admin permitidos
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

  // Cargar usuarios (para el listado en el panel)
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

    if (layerType === 'marker') {
      const tipo = selectedMarkerType;
      const title = prompt('Ingrese un título para la marca', 'Título');
      const description = prompt('Ingrese una descripción para la marca', 'Descripción');
      const { lat, lng } = layer.getLatLng();
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
  };

  const onEdited = async (e) => {
    const { layers } = e;
    layers.eachLayer((layer) => {
      console.log('Edited layer:', layer);
      // Update in Firestore if needed.
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
    });
  };

  // Función para desactivar un usuario
  const handleDeactivateUser = async (userId) => {
    try {
      await updateDoc(doc(db, 'usuarios', userId), { activo: false });
      setUsuarios((prev) =>
        prev.map((user) => (user.id === userId ? { ...user, activo: false } : user))
      );
    } catch (err) {
      console.error('Error deactivating user:', err);
    }
  };

  // Cerrar sesión: se elimina la cookie "currentUser" y se redirige
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
    <Container fluid>
      
      <Row className="mb-3">
        <Col md={6}>
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
        <Col md={6}>
          <Form.Group controlId="markerType">
            <Form.Label>Tipo de punto:</Form.Label>
            <Form.Control
              as="select"
              value={selectedMarkerType}
              onChange={(e) => setSelectedMarkerType(e.target.value)}
            >
              <option value="alerta">Alerta (Triángulo)</option>
              <option value="puntoRecogida">Punto de Recogida (Casita)</option>
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
          </MapContainer>
        </Col>
        
      </Row>
      
    </Container>
  );
};

export default AdminPanel;
