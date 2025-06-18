// src/components/AdminPanel.jsx
import React, { useEffect, useState, useRef, Fragment } from 'react';
import { Container, Button, Row, Col, Form } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import {
  MapContainer,
  TileLayer,
  FeatureGroup,
  Polyline,
  Marker,
  Popup,
  useMap
} from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import 'leaflet-polylinedecorator';
import {
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  updateDoc,
  doc
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db, auth } from '../firebaseConfig';
import Cookies from 'js-cookie';
import L from 'leaflet';

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
// Nuevo icono para Hotel En Vial (ruta vacía)
const hotelVialIcon = L.icon({
  iconUrl: '/iconos/hotel_azul.png', // ← pon aquí la ruta de tu hotel_negro_vial.png
  iconSize: [32, 32],
  iconAnchor: [12, 12],
});

// Componente para flechas en polyline
const ArrowedLine = ({ positions }) => {
  const map = useMap();
  useEffect(() => {
    const poly = L.polyline(positions, { opacity: 0 }).addTo(map);
    const decorator = L.polylineDecorator(poly, {
      patterns: [{
        offset: '100%',
        repeat: 0,
        symbol: L.Symbol.arrowHead({
          pixelSize: 15,
          polygon: false,
          pathOptions: { stroke: true }
        })
      }]
    }).addTo(map);
    return () => {
      map.removeLayer(decorator);
      map.removeLayer(poly);
    };
  }, [map, positions]);
  return null;
};

const AdminPanel = () => {
  const navigate = useNavigate();

  // Estados
  const [rutas, setRutas] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [hoteles, setHoteles] = useState([]);
  const [direcciones, setDirecciones] = useState([]);

  const [selectedLineColor, setSelectedLineColor] = useState('green');
  const [selectedMarkerType, setSelectedMarkerType] = useState('alerta');

  const featureGroupRef = useRef(null);
  const center = [39.70241114681138, 2.9437189174222302];

  // Validación de sesión/admin
  useEffect(() => {
    const cu = Cookies.get('currentUser'), dv = Cookies.get('deviceUid');
    if (!cu || !dv) return navigate('/');
    let obj;
    try { obj = JSON.parse(cu); } catch { return navigate('/'); }
    const allowed = ["admimanuel", "adminjose", "admindani"];
    if (!obj.id || !allowed.includes(obj.usuario)) return navigate('/');
    const uref = doc(db, 'usuarios', obj.id);
    const unsub = onSnapshot(uref, snap => {
      if (!snap.exists() || snap.data().deviceUid !== dv) {
        Cookies.remove('currentUser');
        navigate('/');
      }
    }, () => navigate('/'));
    return () => unsub();
  }, [navigate]);

  // Listeners Firestore
  useEffect(() => {
    const unsubR = onSnapshot(collection(db, 'rutas'),
      s => setRutas(s.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubA = onSnapshot(collection(db, 'alertas'),
      s => setAlertas(s.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubH = onSnapshot(collection(db, 'hoteles'),
      s => setHoteles(s.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const unsubD = onSnapshot(collection(db, 'direcciones'),
      s => setDirecciones(s.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return () => { unsubR(); unsubA(); unsubH(); unsubD(); };
  }, []);

  // Al crear shapes
  const onCreated = async ({ layerType, layer }) => {
    // Flecha
    if (layerType === 'polyline' && selectedMarkerType === 'flecha') {
      const latlngs = layer.getLatLngs();
      if (latlngs.length < 2) {
        alert('Dibuja al menos 2 puntos para la flecha');
        return;
      }
      const coords = latlngs.map(ll => ({ lat: ll.lat, lng: ll.lng }));
      try {
        await addDoc(collection(db, 'direcciones'), { coords });
        featureGroupRef.current.removeLayer(layer);
      } catch (err) {
        console.error(err);
      }
      return;
    }

    // Rutas
    if (layerType === 'polyline') {
      const latlngs = layer.getLatLngs();
      let tipo = 'segura';
      if (selectedLineColor === 'yellow') tipo = 'advertencia';
      if (selectedLineColor === 'red') tipo = 'prohibida';
      if (selectedLineColor === 'blue') tipo = 'informativa';
      try {
        const ref = await addDoc(collection(db, 'rutas'), {
          tipo,
          coordenadas: latlngs.map(ll => ({ lat: ll.lat, lng: ll.lng }))
        });
        layer.options.docId = ref.id;
      } catch (err) {
        console.error(err);
      }
      return;
    }

    // Marcadores (alertas, punto de recogida, hotel, hotel_vial)
    if (layerType === 'marker' && selectedMarkerType !== 'flecha') {
      const { lat, lng } = layer.getLatLng();
      // Hoteles normales y Vial
      if (selectedMarkerType === 'hotel' || selectedMarkerType === 'hotel_vial') {
        const nombre = prompt('Nombre del hotel', 'Hotel');
        if (!nombre) return;
        await addDoc(collection(db, 'hoteles'), {
          nombre,
          lat,
          lng,
          tipo: selectedMarkerType  // guarda como 'hotel' o 'hotel_vial'
        });
        return;
      }
      // Alertas y puntos de recogida
      const title = prompt('Título', 'Título');
      const description = prompt('Descripción', 'Descripción');
      await addDoc(collection(db, 'alertas'), {
        tipo: selectedMarkerType,
        coordenadas: { lat, lng },
        title,
        description
      });
    }
  };

  // Eliminar flecha
  const handleDeleteFlecha = async id => {
    await deleteDoc(doc(db, 'direcciones', id));
  };

  // Logout
  const handleLogout = async () => {
    await signOut(auth);
    Cookies.remove('currentUser');
    navigate('/');
  };

  const getColor = tipo => {
    switch (tipo) {
      case 'segura': return 'green';
      case 'advertencia': return 'yellow';
      case 'prohibida': return 'red';
      case 'informativa': return 'blue';
      default: return 'blue';
    }
  };

  return (
    <Container fluid className="p-0">
      <Row className="m-2">
        <Col md={4}>
          <Form.Group controlId="lineColor">
            <Form.Label>Color de ruta</Form.Label>
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
            <Form.Label>Elemento a agregar</Form.Label>
            <Form.Control
              as="select"
              value={selectedMarkerType}
              onChange={e => setSelectedMarkerType(e.target.value)}
            >
              <option value="alerta">Alerta</option>
              <option value="puntoRecogida">Punto de Recogida</option>
              <option value="hotel">Hotel</option>
              <option value="hotel_vial">Hotel En Vial</option>
              <option value="flecha">Flecha</option>
            </Form.Control>
          </Form.Group>
        </Col>
        <Col md={4} className="text-right">
          <Button variant="outline-danger" onClick={handleLogout}>
            Cerrar sesión
          </Button>
        </Col>
      </Row>

      <MapContainer center={center} zoom={10} style={{ height: '80vh' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <FeatureGroup ref={featureGroupRef}>
          <EditControl
            position="topright"
            onCreated={onCreated}
            draw={{
              rectangle: false,
              circle: false,
              circlemarker: false,
              polygon: false,
              marker: selectedMarkerType !== 'flecha',
              polyline: {
                shapeOptions: {
                  color: selectedMarkerType === 'flecha' ? 'black' : selectedLineColor,
                  dashArray: selectedMarkerType === 'flecha' ? '5,10' : undefined,
                  weight: selectedMarkerType === 'flecha' ? 6 : 3,
                  interactive: true
                }
              }
            }}
            edit={{ remove: false, edit: false }}
          />
        </FeatureGroup>

        {/* RUTAS */}
        {rutas.map(r => (
          <Polyline
            key={r.id}
            positions={r.coordenadas.map(c => [c.lat, c.lng])}
            color={getColor(r.tipo)}
          >
            <Popup>
              <strong>Ruta:</strong> {r.tipo}<br/>
              <Button size="sm" variant="danger" onClick={() => deleteDoc(doc(db, 'rutas', r.id))}>
                Eliminar
              </Button>
            </Popup>
          </Polyline>
        ))}

        {/* ALERTAS */}
        {alertas.map(a => (
          <Marker
            key={a.id}
            position={[a.coordenadas.lat, a.coordenadas.lng]}
            icon={a.tipo === 'puntoRecogida' ? puntoRecogidaIcon : alertaIcon}
          >
            <Popup>
              <strong>{a.title}</strong><br/>
              <p>{a.description}</p>
              <Button size="sm" variant="danger" onClick={() => deleteDoc(doc(db, 'alertas', a.id))}>
                Eliminar
              </Button>
            </Popup>
          </Marker>
        ))}

        {/* HOTELES */}
        {hoteles.map(h => (
          <Marker
            key={h.id}
            position={[h.lat, h.lng]}
            icon={h.tipo === 'hotel_vial' ? hotelVialIcon : hotelIcon}
            draggable
            eventHandlers={{
              dragend: e => {
                const { lat, lng } = e.target.getLatLng();
                updateDoc(doc(db, 'hoteles', h.id), { lat, lng });
              }
            }}
          >
            <Popup>
              <strong>{h.nombre}</strong><br/>
              <Button size="sm" variant="danger" onClick={() => deleteDoc(doc(db, 'hoteles', h.id))}>
                Eliminar
              </Button>
            </Popup>
          </Marker>
        ))}

        {/* FLECHAS */}
        {direcciones.map(d => {
          const positions = d.coords.map(c => [c.lat, c.lng]);
          return (
            <Fragment key={d.id}>
              <Polyline
                positions={positions}
                pathOptions={{ color: 'black', dashArray: '5,10', weight: 6, interactive: true }}
              >
                <Popup>
                  <Button size="sm" variant="danger" onClick={() => handleDeleteFlecha(d.id)}>
                    Eliminar flecha
                  </Button>
                </Popup>
              </Polyline>
              <ArrowedLine positions={positions} />
            </Fragment>
          );
        })}

      </MapContainer>
    </Container>
  );
};

export default AdminPanel;
