// src/components/Login.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Form, Button, Alert } from 'react-bootstrap';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import Cookies from 'js-cookie';
import { getDeviceUid } from '../utils/deviceUid';

const Login = () => {
  const [usuario, setUsuario] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (usuario.trim() === '' || pass.trim() === '') {
      setError('Por favor, complete todos los campos.');
      return;
    }

    try {
      // Consulta en la colección "usuarios" por usuario y contraseña
      const usuariosRef = collection(db, "usuarios");
      const q = query(usuariosRef, where("usuario", "==", usuario), where("pass", "==", pass));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setError("Usuario no dado de alta o contraseña incorrecta.");
        return;
      }

      // Se asume que el usuario es único, se toma el primer documento
      const usuarioDoc = querySnapshot.docs[0];
      const userData = usuarioDoc.data();

      // Obtiene (o genera) el deviceUid a través de la cookie
      const deviceUid = getDeviceUid();

      // Si el usuario ya tiene asignado un deviceUid en Firestore, se compara con la cookie
      // if (userData.deviceUid) {
      //   if (userData.deviceUid !== deviceUid) {
      //     setError("Este usuario ya se ha registrado en otro dispositivo.");
      //     return;
      //   }
      // } else {
      //   // Si es el primer login, se actualiza Firestore con el nuevo deviceUid
      //   await updateDoc(doc(db, "usuarios", usuarioDoc.id), { deviceUid });
      // }
      // lista de usuarios exentos:
const exempt = ['adminjose','admimanuel'];

if (!exempt.includes(userData.usuario)) {
  // sólo para usuarios NO exentos hacemos esta comprobación
  if (userData.deviceUid) {
    if (userData.deviceUid !== deviceUid) {
      setError("Este usuario ya se ha registrado en otro dispositivo.");
      return;
    }
  } else {
    await updateDoc(doc(db, "usuarios", usuarioDoc.id), { deviceUid });
  }
} else {
  // para adminjose/admimanuel, siempre actualizamos el deviceUid
  if (!userData.deviceUid) {
    await updateDoc(doc(db, "usuarios", usuarioDoc.id), { deviceUid });
  }
}


      // Guarda la información del usuario en una cookie "currentUser"

      const currentUser = {
       id: usuarioDoc.id,
        usuario: userData.usuario,
        deviceUid,
      };
      Cookies.set("currentUser", JSON.stringify(currentUser), { expires: 365 });

      navigate('/mapa');
    } catch (err) {
      console.error("Error al iniciar sesión:", err);
      setError("Error al iniciar sesión.");
    }
  };

  return (
    <Container className="d-flex flex-column justify-content-center align-items-center vh-100">
      <h2>Iniciar Sesión</h2>
      {error && <Alert variant="danger">{error}</Alert>}
      <Form onSubmit={handleSubmit} className="w-50">
        <Form.Group controlId="usuario">
          <Form.Label>Usuario</Form.Label>
          <Form.Control
            type="text"
            placeholder="Ingrese su usuario"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
          />
        </Form.Group>
        <Form.Group controlId="pass" className="mt-3">
          <Form.Label>Contraseña</Form.Label>
          <Form.Control
            type="password"
            placeholder="Ingrese su contraseña"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
        </Form.Group>
        <Button variant="primary" type="submit" className="mt-3">
          Ingresar
        </Button>
      </Form>
    </Container>
  );
};

export default Login;
