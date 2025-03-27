// src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './components/LogPrueba';
import MapaConductor from './components/NuevaBusqueda';
import AdminPanel from './components/AdminPanel';
import UserAdmin from './components/UserAdmin';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/mapa" element={<MapaConductor />} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/users" element={<UserAdmin />} />
      </Routes>
    </Router>
  );
}

export default App;
