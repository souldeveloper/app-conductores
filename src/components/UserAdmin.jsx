// src/components/UserAdmin.jsx
import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Table, Button, Form, Modal } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, deleteField } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import Cookies from 'js-cookie';

const getChangeColor = (index) => {
  // 1° cambio: verde, 2°: amarillo, 3°: naranja, 4°: rojo.
  const colors = ['#28a745', '#ffc107', '#fd7e14', '#dc3545'];
  return colors[index] || '#6c757d';
};

const UserAdmin = () => {
  const navigate = useNavigate();
  const [usuarios, setUsuarios] = useState([]);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [newUser, setNewUser] = useState({ usuario: '', pass: '' });
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [currentHistory, setCurrentHistory] = useState([]);
  const [currentHistoryUser, setCurrentHistoryUser] = useState('');

  // Validación de acceso similar a AdminPanel
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
  }, [navigate]);

  // Cargar usuarios en tiempo real
  useEffect(() => {
    const usuariosRef = collection(db, 'usuarios');
    const unsubscribe = onSnapshot(
      usuariosRef,
      (snapshot) => {
        const users = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        setUsuarios(users);
      },
      (err) => {
        console.error('Error cargando usuarios:', err);
        setError('Error cargando usuarios.');
      }
    );
    return () => unsubscribe();
  }, []);

  // Agregar nuevo usuario
  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newUser.usuario || !newUser.pass) {
      alert('Por favor, complete todos los campos.');
      return;
    }
    try {
      await addDoc(collection(db, 'usuarios'), {
        usuario: newUser.usuario,
        pass: newUser.pass,
        passwordChanges: []
      });
      setNewUser({ usuario: '', pass: '' });
    } catch (err) {
      console.error('Error al agregar usuario:', err);
      setError('Error al agregar usuario.');
    }
  };

  // Editar usuario: actualizar usuario y pass, y si la contraseña cambia se añade un registro al historial
  const handleEditUser = async (user) => {
    const nuevoUsuario = prompt('Ingrese el nuevo nombre de usuario', user.usuario);
    if (nuevoUsuario === null) return; // cancelado
    const nuevaPass = prompt('Ingrese la nueva contraseña', user.pass);
    if (nuevaPass === null) return; // cancelado
    let updatedChanges = user.passwordChanges ? [...user.passwordChanges] : [];
    if (nuevaPass !== user.pass) {
      if (updatedChanges.length >= 4) {
        alert('El usuario ya tiene el máximo de 4 cambios registrados. No se registrará el cambio de contraseña.');
      } else {
        updatedChanges.push({ timestamp: new Date().toISOString() });
      }
    }
    try {
      await updateDoc(doc(db, 'usuarios', user.id), {
        usuario: nuevoUsuario,
        pass: nuevaPass,
        passwordChanges: updatedChanges
      });
    } catch (err) {
      console.error('Error editando usuario:', err);
      setError('Error editando usuario.');
    }
  };

  // Eliminar usuario
  const handleDeleteUser = async (userId) => {
    if (!window.confirm('¿Está seguro de eliminar este usuario?')) return;
    try {
      await deleteDoc(doc(db, 'usuarios', userId));
    } catch (err) {
      console.error('Error eliminando usuario:', err);
      setError('Error eliminando usuario.');
    }
  };

  // Resetear deviceUid: se muestra solo si el usuario tiene el campo deviceUid
  const handleResetDeviceUid = async (userId) => {
    if (!window.confirm('¿Está seguro de resetear el dispositivo del usuario?')) return;
    try {
      await updateDoc(doc(db, 'usuarios', userId), {
        deviceUid: deleteField()
      });
    } catch (err) {
      console.error('Error reseteando deviceUid:', err);
      setError('Error reseteando deviceUid.');
    }
  };

  // Mostrar historial de cambios de contraseña en un modal
  const handleShowHistory = (user) => {
    setCurrentHistoryUser(user.usuario);
    setCurrentHistory(user.passwordChanges || []);
    setShowHistoryModal(true);
  };

  // Filtrar usuarios por búsqueda
  const filteredUsuarios = usuarios.filter(user =>
    user.usuario.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Container fluid className="mt-4">
      <Row className="mb-3">
        <Col>
          <h2>Administración de Usuarios</h2>
        </Col>
      </Row>
      <Row className="mb-3">
        <Col md={6}>
          <Form onSubmit={handleAddUser}>
            <Row>
              <Col>
                <Form.Control
                  type="text"
                  placeholder="Usuario"
                  value={newUser.usuario}
                  onChange={(e) => setNewUser({ ...newUser, usuario: e.target.value })}
                />
              </Col>
              <Col>
                <Form.Control
                  type="password"
                  placeholder="Contraseña"
                  value={newUser.pass}
                  onChange={(e) => setNewUser({ ...newUser, pass: e.target.value })}
                />
              </Col>
              <Col>
                <Button type="submit" variant="success">
                  Agregar Usuario
                </Button>
              </Col>
            </Row>
          </Form>
        </Col>
        <Col md={6}>
          <Form.Group controlId="searchUser">
            <Form.Control
              type="text"
              placeholder="Buscar usuario..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </Form.Group>
        </Col>
      </Row>
      {error && (
        <Row>
          <Col>
            <p className="text-danger">{error}</p>
          </Col>
        </Row>
      )}
      <Row>
        <Col>
          <Table striped bordered hover responsive>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Contraseña</th>
                <th>Cambios de Contraseña</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsuarios.map(user => (
                <tr key={user.id}>
                  <td>{user.usuario}</td>
                  <td>{user.pass}</td>
                  <td>
                    {user.passwordChanges && user.passwordChanges.length > 0 ? (
                      user.passwordChanges.map((change, index) => (
                        <span
                          key={index}
                          title={new Date(change.timestamp).toLocaleString()}
                          style={{
                            backgroundColor: getChangeColor(index),
                            marginRight: '5px',
                            padding: '5px 10px',
                            borderRadius: '5px',
                            color: 'white',
                            fontSize: '0.9em'
                          }}
                        >
                          {index + 1}
                        </span>
                      ))
                    ) : (
                      <span>Sin cambios</span>
                    )}
                    {' '}
                    {user.passwordChanges && user.passwordChanges.length > 0 && (
                      <Button
                        variant="info"
                        size="sm"
                        onClick={() => handleShowHistory(user)}
                      >
                        Ver historial
                      </Button>
                    )}
                  </td>
                  <td>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleEditUser(user)}
                    >
                      Editar
                    </Button>{' '}
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDeleteUser(user.id)}
                    >
                      Eliminar
                    </Button>{' '}
                    {user.deviceUid && (
                      <Button
                        variant="warning"
                        size="sm"
                        onClick={() => handleResetDeviceUid(user.id)}
                      >
                        Resetear dispositivo
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Col>
      </Row>

      {/* Modal para mostrar el historial completo de cambios de contraseña */}
      <Modal show={showHistoryModal} onHide={() => setShowHistoryModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Historial de cambios de contraseña de {currentHistoryUser}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {currentHistory.length === 0 ? (
            <p>No hay cambios registrados.</p>
          ) : (
            <ul>
              {currentHistory.map((change, index) => (
                <li key={index}>
                  {`Cambio ${index + 1} (${getChangeColor(index)}): ${new Date(change.timestamp).toLocaleString()}`}
                </li>
              ))}
            </ul>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowHistoryModal(false)}>
            Cerrar
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default UserAdmin;
