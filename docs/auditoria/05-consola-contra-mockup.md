# 05 · Auditoría de la consola contra el mockup

**Fecha:** 2026-09-11 · **Etapa:** 09-B · **Método:** recorrido pantalla por
pantalla, contrastando `docs/auditoria/03-mockups.md` con el código servido.

> **Qué manda en cada cosa, según el encargo del cliente.** El mockup fija
> **estructura y jerarquía**; las skills de diseño mandan en el **acabado**
> —tipografía, espaciado, transiciones, microinteracciones—. Donde el mockup
> contradice una decisión de producto ya tomada, manda el producto.

---

## 0 · Lo transversal, que es donde estaba el grueso del problema

| Hallazgo                                             | Estado antes                                                                                         | Corrección                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **La barra lateral no acompañaba el desplazamiento** | Se quedaba arriba y en Eventos o Viviendas el operador perdía la navegación entera                   | `sticky top-0 h-dvh self-start`, con la lista desplazándose por dentro. `self-start` es lo que lo hace funcionar: en un contenedor flex, `align-items: stretch` estiraba la barra hasta la altura del contenedor, y un elemento tan alto como su contenedor no tiene margen por el que pegarse |
| **La cabecera tampoco**                              | Igual                                                                                                | `sticky top-0 z-20`. El indicador del canal en vivo avisa de que la lista dejó de actualizarse; un aviso al que hay que subir a buscar no avisa                                                                                                                                                |
| **Sin iconografía**                                  | Menú y tarjetas solo con texto; los pocos iconos, dibujados a mano y con grosores distintos entre sí | **Lucide**, licencia ISC (ADR-013). Nueve iconos en el menú, declarados en la tabla de navegación con tipo enumerado: un nombre mal escrito no compila                                                                                                                                         |
| **Curvas de aceleración por defecto**                | `ease-out` de CSS, deliberadamente suave                                                             | Curvas propias `ease-salida` y `ease-entradaSalida`. La diferencia se nota en los primeros milisegundos, que es cuando el usuario mira                                                                                                                                                         |
| **Los botones no respondían a la pulsación**         | Solo cambio de color                                                                                 | `active:scale-[0.97]`, 150 ms. Es el detalle que más separa una interfaz que se siente de una que solo funciona: entre pulsar y que ocurra algo había cero señal de que el sistema oyó                                                                                                         |
| **`hover` sin acotar al puntero fino**               | En tableta, tocar una fila la dejaba resaltada como si estuviera seleccionada                        | `@media (hover: hover) and (pointer: fine)`. La portería usa tabletas                                                                                                                                                                                                                          |

Se respetó en todo: **solo se animan `transform` y `opacity`** —las dos que la
GPU resuelve sin recalcular disposición ni repintar—, ninguna transición usa
`all`, ninguna dura más de 300 ms, y `prefers-reduced-motion` las desactiva
globalmente en `globals.css`.

---

## 1 · Los cinco estados, pantalla por pantalla

El hallazgo más voluminoso de `03-mockups.md` §4 era que **ninguna de las 18
pantallas dibuja los cinco estados**. Este es su estado real hoy:

| Pantalla          | Vacío          | Cargando | Error          | Sin permiso | Sin conexión |
| ----------------- | -------------- | -------- | -------------- | ----------- | ------------ |
| W-02 Dashboard    | ✅ por tarjeta | ✅       | ✅ por tarjeta | ✅          | ✅           |
| W-03 Viviendas    | ✅             | ✅       | ✅             | ✅          | ✅           |
| W-04 Vehículos    | ✅             | ✅       | ✅             | ✅          | ✅           |
| W-05 Visitantes   | ✅             | ✅       | ✅             | ✅          | ✅           |
| W-06 Zonas        | ✅             | ✅       | ✅             | ✅          | ✅           |
| W-07 Dispositivos | ✅             | ✅       | ✅             | ✅          | ✅           |
| W-08 Eventos      | ✅             | ✅       | ✅             | ✅          | ✅           |
| W-10 Informes     | ✅             | ✅       | ✅             | ✅          | ✅           |
| Configuración     | n/a            | n/a      | n/a            | ✅          | n/a          |

> **Cómo leer los «n/a» de Configuración.** Es una pantalla de lectura sobre
> datos que el servidor ya resolvió al renderizar: no hay consulta asíncrona, así
> que no hay carga, ni error de red, ni vacío posible. Marcarla ✅ sería
> presumir controles que no existen porque no hacen falta.

> **Y cómo leer los ✅.** Vacío y cargando los aporta `TablaDatos`; error,
> `estadoSegunCodigo`, que distingue 403 (sin permiso), 404 (**no encontrado**,
> que es lo que devuelve un recurso de otra copropiedad) y 503 (sin conexión).
> Que estén delegados es la razón de que no se hayan separado entre pantallas.

---

## 2 · Pantalla por pantalla

### W-01 · Acceso

| Elemento del mockup                         | Estado                    | Nota                                                                                                              |
| ------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Panel izquierdo negro con logotipo          | ✅ **construido en 09-B** | Escudo Lucide `shield-check`, no candado: en una pantalla de entrada un candado se lee como «estás fuera»         |
| Texto de bienvenida                         | ✅                        | «Bienvenido» + qué hace el producto. El mockup solo traía el eslogan                                              |
| «Recordar sesión en este equipo»            | ✅ y **hace algo**        | Marcado, la cookie de refresco vive 30 días; sin marcar es de sesión y muere al cerrar el navegador               |
| Pie de contacto de soporte                  | ✅                        | Es lo que necesita quien no puede entrar, y sin SMTP todavía depende de que alguien conteste                      |
| Selector «TIPO DE USUARIO»                  | ❌ **no se construye**    | C-05 · el rol se deriva del token, no se elige. Confirmado por el cliente el 2026-09-11: **se corrige el mockup** |
| Paso de segundo factor                      | ✅                        | No estaba en el mockup. RN-20, CA-25                                                                              |
| «© 2025 Next Control · Versión 4.2.1-Prod» | ⚠️ corregido              | La versión sale del `package.json`; la del mockup era ficticia (C-14)                                             |

### W-02 · Dashboard

Estructura fiel: cuatro tarjetas de KPI, eventos en vivo, accesos por hora,
estado de dispositivos. **Cada bloque falla por su cuenta** —una tarjeta caída no
tumba el tablero—, que es un estado ausente en el mockup.

Desviación deliberada: el mockup muestra «Intento Acceso · Sin Registro / Lista
Negra», dos motivos en una línea. En el dominio son excluyentes y con
precedencia; la consola muestra **uno**, el que determinó la decisión.

### W-03 · Viviendas

Totales, búsqueda, filtro por estado, alta y desactivación con motivo. Sin
borrado físico. La columna de autorizaciones vigentes refleja RN-13: **una
vivienda inactiva conserva las suyas**, que el mockup no contempla.
Carga de padrón desde archivo añadida como acción secundaria (M-04).

### W-04 · Vehículos

Placa en monoespaciada —no es decorativo: evita confundir `0`/`O` y `1`/`I` en
el dato que decide una apertura—. La normalización se muestra antes de enviar y
el rechazo por placa duplicada llega tal cual lo devuelve el backend, con el
conflicto explicado (CA-03, ausente en el mockup).

### W-05 · Visitantes

**Sin compuerta de aprobación** (M-05/C-03, reconfirmado por el cliente): los
distintivos son el ciclo de vida real —Vigente, Programada, Expirada,
Revocada— y las acciones son Revocar y Ver detalle. Pestañas Activas e
Historial como el mockup.

### W-06 · Zonas comunes

Ocupación contra aforo con barra, horarios, normas, interruptor
abierta/cerrada (PB-04). **La interfaz refleja, no calcula**: el aforo lo
garantiza el incremento atómico de la base.
**«Reservas de Hoy» no se construye** (M-06/C-04, P-10 abierta).

### W-07 · Dispositivos

Estado en línea / fuera de línea / sincronizando, IP, firmware, última
sincronización. **La IP solo se muestra a roles administrativos** (C-11) y
**ninguna credencial de dispositivo viaja al navegador** (RN-21).

### W-08 · Eventos

Filtros completados respecto al mockup: rango de fechas y vivienda como filtros
de primer nivel, no solo texto libre (M-08). Exportación en **PDF, Excel y
CSV**, no solo XLS. Banda de alertas críticas.

### W-10 · Informes

Los cuatro tipos, parámetros, vista previa y gráfico de frecuencia. Auditoría
de sistema restringida a administración.

### Configuración

**Construida en 09-B.** Era la última entrada del menú que prometía una pantalla
inexistente. Muestra lo que hasta ahora solo se sabía entrando a la base:
identidad de la copropiedad activa, zona horaria, plazos de conservación y
estado de la sesión.

Es de **lectura**, y es una decisión: los plazos tienen cota legal en el esquema
(0016 y 0022), así que ofrecer un campo editable invitaría a intentar un valor
que la base va a rechazar.

### Buscador global

**Construido en 09-B.** Estaba deshabilitado con el texto «disponible en la
ETAPA 09-B». Busca casas y placas sobre las consultas **que ya están
cargadas**: la API no tiene búsqueda transversal, ninguna HU la pide, e
inventar `GET /busqueda` habría añadido una barrera de aislamiento más que
vigilar para un atajo de navegación.

---

## 3 · Lo que sigue sin hacerse, y por qué

| Elemento                                                | Motivo                                                                  |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| Vista de detalle de vivienda con residentes y vehículos | No la pide ninguna HU de esta etapa; el mockup la insinúa sin dibujarla |
| Reservas de zonas                                       | Fuera de alcance, P-10 abierta                                          |
| Compuerta de aprobación de visitantes                   | C-03, colisiona con OE-02 y KPI-06                                      |
| Consola de portería y guardia virtual (W-09)            | ETAPA 10, y son **dos** superficies, no una (C-12)                      |
| Superficie del residente                                | ETAPA 11, con Flutter                                                   |
| Gestión de usuarios y restablecimientos                 | Bloque 4 de esta etapa: propuesta escrita antes de construir            |
