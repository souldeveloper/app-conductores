# Documentación de Componentes

Este documento ofrece una visión general de los componentes clave de la aplicación, explicando sus funcionalidades, dependencias, estados y funciones principales. Se recomienda que los desarrolladores lo consulten al momento de realizar modificaciones o ampliar funcionalidades.

---

## 1. AdminPanel.jsx

### Descripción
El componente **AdminPanel** funciona como panel de administración y permite a los administradores gestionar rutas, alertas, hoteles y usuarios. Integra un mapa interactivo usando **React Leaflet** y **react-leaflet-draw**, además de utilizar **Firebase Firestore** para la obtención de datos en tiempo real. La autenticación y validación del usuario se realizan mediante cookies y comprobaciones en Firestore.

### Dependencias
- **React** (hooks: useState, useEffect, useRef)
- **react-bootstrap** (Container, Button, Row, Col, Table, Form)
- **react-router-dom** (useNavigate)
- **react-leaflet** y **react-leaflet-draw** (MapContainer, TileLayer, FeatureGroup, Polyline, Marker, Popup, EditControl, useMap)
- **Firebase Firestore** y **Firebase Auth**
- **js-cookie** para el manejo de cookies
- **Leaflet** para la gestión de íconos y mapas

### Estados y Hooks Principales
- `currentUser`: Almacena la información del usuario actual validado.
- `usuarios`: Lista de usuarios cargados en tiempo real desde Firestore.
- `rutas`, `alertas`, `hoteles`: Datos del mapa obtenidos en tiempo real.
- `editingRoute`: Estado que indica si se está editando una ruta.
- `selectedLineColor` y `selectedMarkerType`: Permiten seleccionar opciones para el dibujo (colores de línea y tipos de marcadores).

### Funciones y Eventos Clave
- **Validación de sesión y permisos:**  
  Se realiza mediante la verificación de cookies y comparaciones con una lista de administradores permitidos.
- **Gestión de Figuras en el Mapa:**  
  - `onCreated`: Maneja la creación de polilíneas y marcadores. Asigna el tipo de ruta o marca (alerta, punto de recogida, hotel) y guarda los datos en Firestore.
  - `onEdited` y `onDeleted`: Gestionan la actualización y eliminación de rutas, alertas y hoteles.
- **Funciones adicionales:**  
  - `handleHotelDragEnd`: Actualiza la posición de un hotel cuando se arrastra.
  - `handleDeactivateUser` y `handleEditUser`: Permiten modificar datos de usuarios.
  - `handleLogout`: Cierra la sesión y elimina la cookie correspondiente.
  - Funcionalidad de edición personalizada de rutas: `handleVertexDrag` y `saveEditedRoute`.

### Consideraciones para Modificaciones
- **Mapas y Dibujo:**  
  Si se requiere extender la funcionalidad de dibujo (por ejemplo, permitir nuevos tipos de figuras), se deben revisar y modificar las funciones `onCreated`, `onEdited` y `onDeleted`.
- **Gestión de Usuarios:**  
  Para agregar nuevas acciones o validaciones sobre los usuarios, se pueden actualizar las funciones `handleEditUser` y `handleDeactivateUser`.
- **Validación de Acceso:**  
  La lógica de validación se basa en cookies y en una lista fija de administradores; evaluar si es necesario centralizar esta verificación en un componente o servicio reutilizable.

---

## 2. LogPrueba.jsx (Login)

### Descripción
El componente **Login** se encarga de la autenticación de usuarios. Verifica que las credenciales ingresadas coincidan con las almacenadas en la colección "usuarios" de Firestore y gestiona el inicio de sesión mediante cookies y el identificador único del dispositivo.

### Dependencias
- **React** (useState)
- **react-router-dom** (useNavigate)
- **react-bootstrap** (Container, Form, Button, Alert)
- **Firebase Firestore** (collection, query, where, getDocs, updateDoc, doc)
- **js-cookie** para la gestión de cookies
- Función `getDeviceUid` para obtener o generar el identificador del dispositivo

### Funcionamiento
- **Validación de Campos:**  
  Verifica que el usuario y la contraseña no estén vacíos.
- **Consulta a Firestore:**  
  Se realiza una consulta filtrada en la colección "usuarios" para comprobar las credenciales.
- **Gestión del Device UID:**  
  Se compara o asigna el `deviceUid` para evitar el inicio de sesión desde dispositivos no autorizados.
- **Manejo de la Sesión:**  
  Si la autenticación es exitosa, se guarda la información del usuario en una cookie y se redirige a la ruta `/mapa`.

### Consideraciones para Modificaciones
- **Validación de Entrada:**  
  Se puede ampliar la validación para incluir comprobaciones de formato o integridad de datos.
- **Seguridad:**  
  Considerar la encriptación de contraseñas y la integración con otros métodos de autenticación si se requiere mayor seguridad.

---

## 3. NuevaBusqueda.jsx (MapaConductor)

### Descripción
El componente **MapaConductor** ofrece una interfaz para conductores. Muestra un mapa interactivo que integra rutas, alertas y hoteles, y permite realizar búsquedas y gestionar la geolocalización. Además, ofrece funcionalidades para agregar y reordenar hoteles asignados al conductor.

### Dependencias
- **React** (useState, useEffect, useRef)
- **react-router-dom** (useNavigate)
- **react-bootstrap** (Container, Row, Col, Button, Table, Alert, Form, FormControl, ListGroup, Spinner)
- **react-leaflet** (MapContainer, TileLayer, Polyline, Marker, Popup, useMap)
- **Firebase Firestore** (collection, onSnapshot, doc, deleteDoc, setDoc, getDocs)
- **js-cookie** para la gestión de cookies
- **Leaflet** para el manejo de íconos y mapas

### Estados y Hooks Principales
- `rutas`, `alertas`, `hoteles`: Datos en tiempo real obtenidos de Firestore.
- `searchResults`, `searchQuery`, `loadingSearch`: Estados para la funcionalidad de búsqueda de hoteles.
- `conductorPos` y `tracking`: Controlan el seguimiento de la ubicación actual del conductor.
- `tempLine`: Para visualizar temporalmente la conexión entre un hotel y un punto de recogida.
- `selectedHotelId`: Permite filtrar la lista de hoteles.

### Funciones y Eventos Clave
- **Geolocalización:**  
  - `handleToggleTracking`: Inicia o detiene el seguimiento de la ubicación del conductor usando la API de geolocalización.
  - `handleCenterMap`: Centra el mapa en la ubicación actual del conductor.
- **Búsqueda y Gestión de Hoteles:**  
  - `handleSearchHotels`: Busca hoteles en Firestore basándose en el nombre.
  - `handleAddHotel` y `handleDeleteHotel`: Permiten agregar o eliminar hoteles de la subcolección del conductor.
  - `handleMoveUp` y `handleMoveDown`: Reordenan la lista de hoteles.
  - `handleHotelIconClick`: Dibuja una línea temporal entre un hotel y un punto de recogida asociado.

### Consideraciones para Modificaciones
- **Seguimiento de Ubicación:**  
  Si se requiere modificar la precisión o la frecuencia de actualización del seguimiento, ajustar la lógica dentro de `navigator.geolocation.watchPosition`.
- **Búsqueda y Ordenamiento:**  
  Se puede ampliar la búsqueda para incluir otros criterios o implementar características como la paginación.
- **Interfaz de Usuario:**  
  La disposición y estilos de los componentes se pueden ajustar modificando los componentes de **react-bootstrap**.

---

## 4. UserAdmin.jsx

### Descripción
El componente **UserAdmin** proporciona una interfaz para la administración de usuarios. Permite visualizar, agregar, editar y eliminar usuarios, gestionar el historial de cambios de contraseña y resetear el `deviceUid` de los usuarios.

### Dependencias
- **React** (useState, useEffect)
- **react-router-dom** (useNavigate)
- **react-bootstrap** (Container, Row, Col, Table, Button, Form, Modal)
- **Firebase Firestore** (collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, deleteField)
- **js-cookie** para la gestión de cookies

### Estados y Hooks Principales
- `usuarios`: Lista de usuarios obtenida en tiempo real desde Firestore.
- `newUser`: Modelo para la creación de un nuevo usuario (campos: usuario y pass).
- `searchTerm`: Término de búsqueda para filtrar usuarios.
- `showHistoryModal`, `currentHistory` y `currentHistoryUser`: Para gestionar y mostrar el historial de cambios de contraseña.

### Funciones y Eventos Clave
- **Gestión de Usuarios:**  
  - `handleAddUser`: Agrega un nuevo usuario a la colección de Firestore.
  - `handleEditUser`: Permite editar el nombre de usuario y la contraseña. Registra un historial de cambios si la contraseña se modifica (con un máximo de 4 registros).
  - `handleDeleteUser`: Elimina un usuario después de una confirmación.
- **Administración del Dispositivo:**  
  - `handleResetDeviceUid`: Permite reiniciar el identificador del dispositivo (deviceUid) del usuario.
- **Historial de Cambios:**  
  - `handleShowHistory`: Muestra un modal con el historial de cambios de contraseña.

### Consideraciones para Modificaciones
- **Historial de Contraseñas:**  
  Para ampliar la información registrada en cada cambio de contraseña, se debe modificar la estructura del campo `passwordChanges`.
- **Interfaz y Accesibilidad:**  
  Mejorar la usabilidad agregando validaciones adicionales o personalizando los estilos de los formularios, tablas y modales según los estándares de accesibilidad.

---

## Conclusión

Esta documentación proporciona un panorama claro del funcionamiento de los componentes principales de la aplicación y sirve como guía para futuras modificaciones. Se recomienda:

- Probar todos los cambios en un entorno de desarrollo antes de desplegarlos en producción.
- Revisar la interacción entre la lógica de la interfaz y la sincronización en tiempo real con Firebase.
- Considerar la reutilización de lógica común (por ejemplo, validación de sesión) en un servicio o componente centralizado para mantener la coherencia en toda la aplicación.

---

**Nota:** Guarda este archivo en el repositorio (por ejemplo, en la raíz o en una carpeta `docs`) y enlázalo desde el `README.md` para que esté fácilmente accesible a todos los desarrolladores.
