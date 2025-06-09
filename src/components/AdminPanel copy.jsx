// src/components/AdminPanel.jsx
import React, { useEffect, useState, useRef } from 'react';
import { Container, Button, Row, Col, Form } from 'react-bootstrap';
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
    case 'informativa':
      return 'blue';
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
  const [center] = useState([39.70241114681138, 2.9437189174222302]);
  const featureGroupRef = useRef(null);

  // Estado para edición
  const [editingRoute, setEditingRoute] = useState(null);

  // Selectores
  const [selectedLineColor, setSelectedLineColor] = useState('green');
  const [selectedMarkerType, setSelectedMarkerType] = useState('alerta');

  // Validación de sesión y admin
  useEffect(() => {
    const currentUserStr = Cookies.get('currentUser');
    const localDeviceUid = Cookies.get('deviceUid');
    if (!currentUserStr || !localDeviceUid) return navigate('/');
    let currentUserObj;
    try {
      currentUserObj = JSON.parse(currentUserStr);
    } catch {
      return navigate('/');
    }
    if (!currentUserObj.id) return navigate('/');
    const allowed = ["admimanuel", "adminjose", "admindani"];
    if (!allowed.includes(currentUserObj.usuario)) return navigate('/');
    const userDocRef = doc(db, "usuarios", currentUserObj.id);
    const unsub = onSnapshot(userDocRef, snap => {
      if (!snap.exists() || snap.data().deviceUid !== localDeviceUid) {
        Cookies.remove('currentUser');
        return navigate('/');
      }
      setCurrentUser({ id: snap.id, ...snap.data() });
    }, () => navigate('/'));
    return () => unsub();
  }, [navigate]);

  // Listeners Firebase
  useEffect(() => {
    const unsubR = onSnapshot(collection(db, 'rutas'), snap =>
      setRutas(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => setError('Error loading rutas')
    );
    const unsubA = onSnapshot(collection(db, 'alertas'), snap =>
      setAlertas(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => setError('Error loading alertas')
    );
    return () => { unsubR(); unsubA(); };
  }, []);
  useEffect(() => {
    const unsubH = onSnapshot(collection(db, 'hoteles'), snap =>
      setHoteles(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error(err)
    );
    return () => unsubH();
  }, []);
  useEffect(() => {
    const unsubU = onSnapshot(collection(db, 'usuarios'), snap =>
      setUsuarios(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => setError('Error loading usuarios')
    );
    return () => unsubU();
  }, []);

  // Crear figuras
  const onCreated = async (e) => {
    const { layerType, layer } = e;
    if (layerType === 'polyline') {
      const latlngs = layer.getLatLngs();
      let tipo = 'segura';
      if (selectedLineColor === 'yellow') tipo = 'advertencia';
      if (selectedLineColor === 'red') tipo = 'prohibida';
      if (selectedLineColor === 'blue') tipo = 'informativa';
      try {
        const ref = await addDoc(collection(db, 'rutas'), {
          tipo,
          coordenadas: latlngs.map(ll => ({ lat: ll.lat, lng: ll.lng })),
        });
        layer.options.docId = ref.id;
      } catch (err) {
        console.error(err);
      }
    }
    if (layerType === 'marker') {
      const { lat, lng } = layer.getLatLng();
      if (selectedMarkerType === 'hotel') {
        const nombre = prompt('Nombre del hotel', 'Hotel');
        if (!nombre) return;
        const ref = await addDoc(collection(db, 'hoteles'), { nombre, lat, lng });
        layer.options.docIdHotel = ref.id;
      } else {
        const title = prompt('Título', 'Título');
        const description = prompt('Descripción', 'Descripción');
        const ref = await addDoc(collection(db, 'alertas'), {
          tipo: selectedMarkerType,
          coordenadas: { lat, lng },
          title, description
        });
        layer.options.docIdMarker = ref.id;
      }
    }
  };

  // Editar y borrar
  const onEdited = async ({ layers }) => {
    layers.eachLayer(async (layer) => {
      if (layer.options.docId) {
        const coords = layer.getLatLngs().map(ll => ({ lat: ll.lat, lng: ll.lng }));
        await updateDoc(doc(db, 'rutas', layer.options.docId), { coordenadas: coords });
      }
    });
  };
  const onDeleted = async ({ layers }) => {
    layers.eachLayer(async (layer) => {
      if (layer.options.docId) await deleteDoc(doc(db, 'rutas', layer.options.docId));
      if (layer.options.docIdMarker) await deleteDoc(doc(db, 'alertas', layer.options.docIdMarker));
      if (layer.options.docIdHotel) await deleteDoc(doc(db, 'hoteles', layer.options.docIdHotel));
    });
  };

  // Drag hoteles
  const handleHotelDragEnd = async (e, id) => {
    const { lat, lng } = e.target.getLatLng();
    await updateDoc(doc(db, 'hoteles', id), { lat, lng });
  };

  // Logout
  const handleLogout = async () => {
    await signOut(auth);
    Cookies.remove('currentUser');
    navigate('/');
  };

  // Edición manual de ruta
  const handleVertexDrag = (e, idx) => {
    const { lat, lng } = e.target.getLatLng();
    setEditingRoute(prev => {
      const c = [...prev.coordenadas];
      c[idx] = { lat, lng };
      return { ...prev, coordenadas: c };
    });
  };
  const saveEditedRoute = async () => {
    if (!editingRoute) return;
    await updateDoc(doc(db, 'rutas', editingRoute.id), { coordenadas: editingRoute.coordenadas });
    setEditingRoute(null);
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
                onChange={e => setSelectedLineColor(e.target.value)}
              >
                <option value="green">Verde (Segura)</option>
                <option value="yellow">Amarilla (Advertencia)</option>
                <option value="red">Roja (Prohibida)</option>
                <option value="blue">Azul (Informativa)</option>
              </Form.Control>
            </Form.Group>
          </Col>
          <Col md={4}>
            <Form.Group controlId="markerType">
              <Form.Label>Tipo de punto:</Form.Label>
              <Form.Control
                as="select"
                value={selectedMarkerType}
                onChange={e => setSelectedMarkerType(e.target.value)}
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
                      shapeOptions: { color: selectedLineColor },
                    },
                  }}
                />
              </FeatureGroup>

              {rutas.map(r => (
                <Polyline
                  key={r.id}
                  positions={r.coordenadas.map(c => [c.lat, c.lng])}
                  color={getColor(r.tipo)}
                >
                  <Popup>
                    <h5>Ruta: {r.tipo}</h5>
                    <Button size="sm" onClick={() => setEditingRoute(r)}>Editar</Button>{' '}
                    <Button size="sm" variant="danger" onClick={() => deleteDoc(doc(db,'rutas',r.id))}>
                      Eliminar
                    </Button>
                  </Popup>
                </Polyline>
              ))}

              {editingRoute && (
                <>
                  <Polyline
                    positions={editingRoute.coordenadas.map(c => [c.lat, c.lng])}
                    color={getColor(editingRoute.tipo)}
                    dashArray="5,10"
                  />
                  {editingRoute.coordenadas.map((c, i) => (
                    <Marker
                      key={i}
                      position={[c.lat, c.lng]}
                      draggable
                      eventHandlers={{ dragend: e => handleVertexDrag(e, i) }}
                    >
                      <Popup>Punto {i+1}</Popup>
                    </Marker>
                  ))}
                  <div style={{
                    position:'absolute', top:10, left:10, zIndex:1000,
                    backgroundColor:'white', padding:10, borderRadius:5
                  }}>
                    <Button onClick={saveEditedRoute}>Guardar cambios</Button>{' '}
                    <Button variant="secondary" onClick={() => setEditingRoute(null)}>
                      Cancelar
                    </Button>
                  </div>
                </>
              )}

              {alertas.map(a => (
                <Marker
                  key={a.id}
                  position={[a.coordenadas.lat, a.coordenadas.lng]}
                  icon={a.tipo==='puntoRecogida'? puntoRecogidaIcon : alertaIcon}
                >
                  <Popup>
                    <h5>{a.title}</h5>
                    <p>{a.description}</p>
                    <Button size="sm" variant="danger" onClick={() => deleteDoc(doc(db,'alertas',a.id))}>
                      Eliminar
                    </Button>
                  </Popup>
                </Marker>
              ))}

              {hoteles.map(h => (
                <Marker
                  key={h.id}
                  position={[h.lat, h.lng]}
                  icon={hotelIcon}
                  draggable
                  eventHandlers={{ dragend: e => handleHotelDragEnd(e, h.id) }}
                >
                  <Popup>
                    <h5>{h.nombre}</h5>
                    <Button size="sm" onClick={() => {
                      const nuevo = prompt('Nuevo nombre', h.nombre);
                      if (nuevo) updateDoc(doc(db,'hoteles',h.id),{ nombre:nuevo });
                    }}>Editar</Button>{' '}
                    <Button size="sm" variant="danger" onClick={() => deleteDoc(doc(db,'hoteles',h.id))}>
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
