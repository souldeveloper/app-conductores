// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './components/LogPrueba';
import MapaConductor from './components/NuevaBusqueda copy 6';
import AdminPanel from './components/AdminPanel copy 3';
import UserAdmin from './components/UserAdmin';
import MapaConductorAdminFirebase from './components/MapaConductor'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/mapa" element={<MapaConductor />} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/users" element={<UserAdmin />} />
        <Route path="/nuevo" element={<MapaConductorAdminFirebase />} />
      </Routes>
    </Router>
  );
}

export default App;
