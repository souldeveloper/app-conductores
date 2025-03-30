# Documentación de Funciones y Parámetros

Este documento detalla, para cada componente, las funciones principales, los parámetros que reciben y una explicación de su funcionamiento. Este nivel de detalle facilita futuras modificaciones y mejora la legibilidad del código para otros desarrolladores.

---

## 1. AdminPanel.jsx

### Funciones y Componentes

#### getColor(tipo)
- **Parámetro:**  
  - `tipo` (String): Puede ser `'segura'`, `'advertencia'`, `'prohibida'` o cualquier otro valor.
- **Descripción:**  
  Función auxiliar que asigna un color específico en función del tipo de ruta.  
  - `'segura'` → `"green"`  
  - `'advertencia'` → `"yellow"`  
  - `'prohibida'` → `"red"`  
  - Valor por defecto → `"blue"`

---

#### SetMapInstance({ setMapInstance })
- **Parámetro:**  
  - `setMapInstance` (Function): Callback que recibe la instancia del mapa.
- **Descripción:**  
  Componente que utiliza el hook `useMap` de React Leaflet para capturar la instancia del mapa y enviarla al componente padre mediante el callback `setMapInstance`. Esto permite manipular el mapa (por ejemplo, centrarlo o actualizar la vista) desde otras partes del componente.

---

#### onCreated(e)
- **Parámetro:**  
  - `e` (Object): Evento emitido al crear una figura en el mapa. Contiene:  
    - `layerType` (String): Tipo de figura creada (por ejemplo, `"polyline"` o `"marker"`).
    - `layer` (Object): Instancia de la figura creada, con métodos para obtener sus coordenadas.
- **Descripción:**  
  Maneja la creación de nuevas figuras en el mapa:
  - **Si es una polilínea:**  
    - Obtiene las coordenadas usando `layer.getLatLngs()`.
    - Determina el tipo de ruta en función del color seleccionado (`selectedLineColor`).
    - Añade un documento a la colección `rutas` en Firestore, asignando un identificador (`docId`) a la figura.
  - **Si es un marcador:**  
    - Obtiene la ubicación (latitud y longitud) del marcador.
    - Según el tipo de marcador seleccionado (`selectedMarkerType`), solicita al usuario información adicional (nombre, título, descripción) y guarda los datos en la colección `hoteles` o `alertas` en Firestore.

---

#### onEdited(e)
- **Parámetro:**  
  - `e` (Object): Evento emitido al editar figuras en el mapa. Contiene un objeto `layers` que agrupa todas las figuras modificadas.
- **Descripción:**  
  Itera sobre cada figura editada y, si la figura tiene un `docId` (identificador asignado previamente), actualiza en Firestore la lista de coordenadas con los nuevos valores obtenidos mediante `layer.getLatLngs()`.

---

#### onDeleted(e)
- **Parámetro:**  
  - `e` (Object): Evento emitido al eliminar figuras del mapa. Contiene un objeto `layers` con las figuras eliminadas.
- **Descripción:**  
  Recorre las figuras eliminadas:
  - Si la figura es una ruta (posee `docId`), elimina el documento correspondiente de la colección `rutas` en Firestore.
  - Si es un marcador de alerta o hotel (posee `docIdMarker` o `docIdHotel`), elimina el documento de la colección `alertas` o `hoteles` respectivamente.

---

#### handleHotelDragEnd(e, hotelId)
- **Parámetros:**  
  - `e` (Object): Evento del arrastre que permite obtener la nueva posición.
  - `hotelId` (String): Identificador del hotel que se está actualizando.
- **Descripción:**  
  Actualiza la posición de un hotel en Firestore cuando el marcador es arrastrado a una nueva ubicación. Extrae las nuevas coordenadas y llama a `updateDoc` para reflejar el cambio en la base de datos.

---

#### handleDeactivateUser(userId)
- **Parámetro:**  
  - `userId` (String): Identificador del usuario a desactivar.
- **Descripción:**  
  Actualiza el documento del usuario en Firestore estableciendo el campo `activo` a `false`, desactivando así la cuenta del usuario.

---

#### handleEditHotel(hotelId, currentHotel)
- **Parámetros:**  
  - `hotelId` (String): Identificador del hotel.
  - `currentHotel` (Object): Datos actuales del hotel.
- **Descripción:**  
  Solicita al usuario un nuevo nombre para el hotel mediante un `prompt`. Si se proporciona un nuevo nombre, actualiza el documento del hotel en la colección `hoteles` de Firestore.

---

#### handleDeleteHotel(hotelId)
- **Parámetro:**  
  - `hotelId` (String): Identificador del hotel a eliminar.
- **Descripción:**  
  Elimina el documento del hotel de la colección `hoteles` en Firestore mediante `deleteDoc`.

---

#### handleEditUser(userId, currentUserData)
- **Parámetros:**  
  - `userId` (String): Identificador del usuario.
  - `currentUserData` (Object): Datos actuales del usuario (por ejemplo, nombre de usuario).
- **Descripción:**  
  Permite editar el nombre de usuario:
  - Solicita un nuevo nombre mediante `prompt`.
  - Actualiza el documento del usuario en Firestore con el nuevo valor.

---

#### handleLogout()
- **Parámetro:**  
  - Ninguno.
- **Descripción:**  
  Cierra la sesión del usuario utilizando `signOut` de Firebase Auth, elimina la cookie `currentUser` y redirige al usuario a la página de inicio.

---

#### handleVertexDrag(e, index)
- **Parámetros:**  
  - `e` (Object): Evento de arrastre del marcador de un vértice de una ruta.
  - `index` (Number): Índice del vértice que se está arrastrando dentro del array de coordenadas.
- **Descripción:**  
  Durante la edición de una ruta, actualiza la posición de un vértice específico modificando el estado `editingRoute` con las nuevas coordenadas.

---

#### saveEditedRoute()
- **Parámetro:**  
  - Ninguno.
- **Descripción:**  
  Guarda los cambios realizados en una ruta editada. Actualiza el documento correspondiente en la colección `rutas` en Firestore con las nuevas coordenadas y limpia el estado `editingRoute` para finalizar la edición.

---

## 2. LogPrueba.jsx (Login)

### Función Principal

#### handleSubmit(e)
- **Parámetro:**  
  - `e` (Event): Evento de envío del formulario.
- **Descripción:**  
  Función que se ejecuta al enviar el formulario de inicio de sesión:
  - Previene el comportamiento por defecto del formulario.
  - Valida que los campos de usuario y contraseña no estén vacíos.
  - Realiza una consulta en la colección `usuarios` de Firestore para verificar las credenciales.
  - Si se encuentra un usuario, verifica el `deviceUid` mediante la función `getDeviceUid`:
    - Si el usuario ya tiene un `deviceUid` asignado y es diferente al del dispositivo actual, se muestra un error.
    - Si es el primer inicio de sesión, se actualiza el documento con el nuevo `deviceUid`.
  - Guarda la información del usuario en una cookie (`currentUser`) y redirige a la ruta `/mapa`.

---

## 3. NuevaBusqueda.jsx (MapaConductor)

### Funciones y Componentes

#### SetMapInstance({ setMapInstance })
- **Parámetro:**  
  - `setMapInstance` (Function): Callback para almacenar la instancia del mapa.
- **Descripción:**  
  Igual que en el componente AdminPanel, captura la instancia del mapa usando el hook `useMap` de React Leaflet.

---

#### getColor(tipo)
- **Parámetro:**  
  - `tipo` (String): Determina el tipo de ruta.
- **Descripción:**  
  Asigna un color basado en el tipo de ruta:
  - `'segura'` → `"green"`
  - `'advertencia'` → `"yellow"`
  - `'prohibida'` → `"red"`
  - Valor por defecto → `"blue"`

---

#### handleCenterMap()
- **Parámetro:**  
  - Ninguno.
- **Descripción:**  
  Centra el mapa en la ubicación actual del conductor (`conductorPos`) utilizando el método `panTo` de la instancia del mapa (`mapInstance`).

---

#### handleToggleTracking()
- **Parámetro:**  
  - Ninguno.
- **Descripción:**  
  Activa o desactiva el seguimiento de la ubicación del conductor:
  - Si el seguimiento se activa, utiliza `navigator.geolocation.watchPosition` para actualizar la posición (`conductorPos`) en tiempo real.
  - Si se desactiva, limpia el observador de geolocalización.

---

#### handleSearchHotels(e)
- **Parámetro:**  
  - `e` (Event): Evento del formulario de búsqueda.
- **Descripción:**  
  Realiza una búsqueda en la colección `hoteles` de Firestore basada en el nombre:
  - Previene el comportamiento por defecto del formulario.
  - Filtra los hoteles que contengan en su nombre el término de búsqueda (`searchQuery`).
  - Actualiza el estado `searchResults` con los resultados obtenidos.

---

#### handleAddHotel(hotelItem)
- **Parámetro:**  
  - `hotelItem` (Object): Objeto que contiene los datos del hotel a agregar (por ejemplo, `displayName`, `lat`, `lng`).
- **Descripción:**  
  Agrega un hotel a la subcolección de hoteles asignados al conductor en Firestore:
  - Determina el siguiente orden (`orden`) para el hotel.
  - Usa `setDoc` para guardar el hotel bajo el usuario actual (`conductor`).

---

#### handleDeleteHotel(hotelId)
- **Parámetro:**  
  - `hotelId` (String): Identificador del hotel a eliminar.
- **Descripción:**  
  Elimina el hotel de la subcolección asignada al conductor en Firestore mediante `deleteDoc`.

---

#### handleMoveUp(hotel)
- **Parámetro:**  
  - `hotel` (Object): Objeto del hotel que se desea mover hacia arriba en el orden.
- **Descripción:**  
  Reordena la lista de hoteles:
  - Encuentra el hotel anterior en la lista ordenada.
  - Intercambia los valores de `orden` entre el hotel actual y el anterior.
  - Actualiza ambos documentos en Firestore.

---

#### handleMoveDown(hotel)
- **Parámetro:**  
  - `hotel` (Object): Objeto del hotel que se desea mover hacia abajo en el orden.
- **Descripción:**  
  Funciona de forma similar a `handleMoveUp`, pero mueve el hotel hacia abajo en la lista, intercambiando el valor de `orden` con el siguiente hotel.

---

#### handleSelectHotel(hotelId)
- **Parámetro:**  
  - `hotelId` (String): Identificador del hotel a seleccionar o deseleccionar.
- **Descripción:**  
  Alterna el estado de selección de un hotel para filtrar la visualización en la lista.

---

#### handleHotelIconClick(hotel)
- **Parámetro:**  
  - `hotel` (Object): Objeto del hotel sobre el que se hizo clic.
- **Descripción:**  
  Busca un punto de recogida asociado (en la colección `alertas`) comparando el nombre del hotel con la descripción de la alerta. Si encuentra coincidencia, dibuja una línea temporal entre el hotel y el punto de recogida utilizando el estado `tempLine` y la muestra durante 10 segundos.

---

## 4. UserAdmin.jsx

### Funciones y Componentes

#### getChangeColor(index)
- **Parámetro:**  
  - `index` (Number): Índice que representa el número de cambio de contraseña.
- **Descripción:**  
  Función auxiliar que asigna un color basado en la cantidad de cambios de contraseña:
  - 1° cambio → Verde (`#28a745`)
  - 2° cambio → Amarillo (`#ffc107`)
  - 3° cambio → Naranja (`#fd7e14`)
  - 4° cambio → Rojo (`#dc3545`)
  - Por defecto → Gris (`#6c757d`)

---

#### handleAddUser(e)
- **Parámetro:**  
  - `e` (Event): Evento del formulario de creación de usuario.
- **Descripción:**  
  Agrega un nuevo usuario a la colección `usuarios` de Firestore:
  - Previene el envío del formulario.
  - Verifica que los campos de usuario y contraseña estén completos.
  - Utiliza `addDoc` para crear el documento del nuevo usuario.

---

#### handleEditUser(user)
- **Parámetro:**  
  - `user` (Object): Objeto con los datos actuales del usuario.
- **Descripción:**  
  Permite editar la información de un usuario:
  - Solicita mediante `prompt` el nuevo nombre de usuario y una nueva contraseña.
  - Si la contraseña cambia y no se excede el máximo de 4 registros, agrega una entrada al arreglo `passwordChanges` con la marca de tiempo.
  - Actualiza el documento del usuario en Firestore usando `updateDoc`.

---

#### handleDeleteUser(userId)
- **Parámetro:**  
  - `userId` (String): Identificador del usuario a eliminar.
- **Descripción:**  
  Elimina el documento del usuario en Firestore después de una confirmación del usuario, utilizando `deleteDoc`.

---

#### handleResetDeviceUid(userId)
- **Parámetro:**  
  - `userId` (String): Identificador del usuario.
- **Descripción:**  
  Reinicia el campo `deviceUid` del usuario en Firestore (eliminándolo) mediante `updateDoc` y la función `deleteField`, permitiendo que el usuario se pueda registrar nuevamente desde otro dispositivo.

---

#### handleShowHistory(user)
- **Parámetro:**  
  - `user` (Object): Objeto que contiene los datos del usuario, incluyendo el historial de cambios de contraseña (`passwordChanges`).
- **Descripción:**  
  Muestra un modal con el historial de cambios de contraseña del usuario:
  - Establece en el estado el nombre del usuario y su historial.
  - Activa la visualización del modal para que se puedan ver los cambios registrados.

---

## Conclusión

Este archivo proporciona una descripción detallada de cada función y componente clave dentro de la aplicación. Se recomienda revisarlo y actualizarlo conforme se realicen cambios o se agreguen nuevas funcionalidades, de modo que la documentación se mantenga siempre actualizada y útil para todo el equipo de desarrollo.
