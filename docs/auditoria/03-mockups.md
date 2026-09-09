# 03 · Auditoría de mockups y derivación del sistema de diseño

**Insumo auditado:** `docs/insumos/NexResidential_Mockups.png` — 6879 × 7293 px, RGBA.
**Autoridad:** vinculante en **estructura y flujo**; flexible en píxeles.
**Contenido:** **18 pantallas** — 10 de consola web y 8 de aplicación móvil.

> **Método.** La imagen se recortó por pantalla y cada recorte se inspeccionó individualmente a resolución nativa. La paleta se extrajo por análisis de frecuencia sobre los píxeles saturados (H/S/V), no a ojo.

---

## 1. Correspondencia con la §12 del documento de requisitos

La tabla §12 «Mockups y wireframes» del documento de requisitos lista 14 pantallas, todas con la columna de enlace en `[pendiente]` (hallazgo L-06). Esta es la correspondencia real:

| Fila de §12                                  | Pantalla en el mockup | Estado                                           |
| -------------------------------------------- | --------------------- | ------------------------------------------------ |
| Login y selección de copropiedad             | W-01 Login            | ⚠️ **Sin selector de copropiedad ni MFA**        |
| Dashboard operativo                          | W-02                  | ✅                                               |
| Viviendas y residentes                       | W-03                  | ⚠️ Sin vista de detalle de residentes            |
| Vehículos y placas                           | W-04                  | ✅                                               |
| Visitantes y autorizaciones                  | W-05                  | ⚠️ Introduce flujo de aprobación no especificado |
| Zonas comunes y aforo                        | W-06                  | ⚠️ Introduce reservas no especificadas           |
| Dispositivos y sincronización                | W-07                  | ✅                                               |
| Eventos, alertas y auditoría                 | W-08 + W-10           | ✅                                               |
| Consola de portería                          | W-09 (fusionada)      | ⚠️ **Fusionada con guardia virtual**             |
| Consola de guardia virtual                   | W-09 (fusionada)      | ⚠️ **Faltan intercom, multiproyecto y cola**     |
| App — inicio / mi vivienda                   | M-1                   | ✅                                               |
| App — crear visitante y capturar rostro      | M-4                   | ⚠️ **Sin captura de rostro**                     |
| App — historial y notificaciones             | M-6, M-7              | ✅                                               |
| **Pantalla de consentimiento del visitante** | —                     | ❌ **No existe**                                 |

**Pantallas del mockup sin fila en §12:** M-2 Mi Familia, M-3 Mis Vehículos, M-5 Zonas Comunes (móvil), M-8 Mi Perfil. Las cuatro tienen HU que las respaldan; la tabla §12 estaba incompleta.

---

## 2. Inventario de la consola web (10 pantallas)

### W-01 · Login

|               |                                                                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rol**       | Todos (previo a autenticación)                                                                                                                                    |
| **HU**        | HU-36, HU-37                                                                                                                                                      |
| **Entidades** | `Usuario`                                                                                                                                                         |
| **Campos**    | Tipo de usuario (chips: **Administrador · Portero · Residente**) · Correo electrónico · Contraseña (con revelar) · «Recordar sesión en este equipo» (interruptor) |
| **Acciones**  | Iniciar Sesión · ¿Olvidó su contraseña? · Contacto de soporte                                                                                                     |
| **Marca**     | Panel izquierdo negro con logotipo, «NextResidential — Seguridad Inteligente Residencial», «© 2025 Next Control», «Versión 4.2.1-Prod»                           |

**Estados ausentes:** credenciales inválidas · cuenta bloqueada por rate limiting (429 con `Retry-After`) · **paso de segundo factor TOTP** · **selección de copropiedad** cuando el usuario pertenece a varias · usuario inactivo · sesión expirada · carga del botón.

**Hallazgo M-01 · `[CONTRADICCIÓN]` C-05 — el selector «TIPO DE USUARIO» es un antipatrón de seguridad y está incompleto**
El mockup ofrece tres roles elegibles por el usuario. Dos problemas independientes:

1. **El rol no se elige, se deriva.** El rol y la `copropiedad_id` provienen de los _custom claims_ del JWT (ETAPA 03). Un selector en el cliente sugiere que la elección influye en los permisos —no lo hace, o no debe hacerlo— y expone superficie de confusión.
2. **Faltan tres de los seis roles**: Superadministrador, Operador de central y Servicio/Integración.
   **Resolución:** el selector **se elimina**. Login único por correo y contraseña; el sistema enruta a la superficie que corresponde al rol del token. Se añade **paso MFA obligatorio** para roles administrativos (RN-20, CA-25) y **selector de copropiedad** posterior a la autenticación cuando el token habilita más de una (caso del Operador de central, HU-25). Registrado como C-05.

---

### W-02 · Dashboard operativo

|                                    |                                                                                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rol**                            | Administrador                                                                                                                                               |
| **HU**                             | HU-32, HU-38                                                                                                                                                |
| **Entidades**                      | `Acceso`, `Dispositivo`, `Residente`, `Vehiculo`, `Alerta`                                                                                                  |
| **Tarjetas KPI**                   | Residentes activos (247, «+4 nuevo») · Vehículos registrados (183, «+12 hoy») · Visitantes hoy (34, «8 activos») · Alertas pendientes (3, «Alta prioridad») |
| **Últimos eventos en tiempo real** | Miniatura de evidencia · título («Entrada – Placa ABC-1234») · subtítulo (`Condómino: Casa 45A`) · hora · distintivo Autorizado/Rechazado                   |
| **Accesos por hora**               | Barras 08:00–14:00, «Historial de ingresos del día de hoy»                                                                                                  |
| **Estado dispositivos**            | «3 Activos · 1 Alerta» · nombre, tipo, distintivo EN LÍNEA / FALLA                                                                                          |
| **Acciones**                       | Ver historial completo · buscador global «Buscar casa, placa, residente…» · campana con contador                                                            |

**Navegación lateral (9 elementos, idéntica en W-02…W-08 y W-10):** Dashboard · Viviendas · Vehículos · Visitantes · Zonas Comunes · Dispositivos · Eventos · Informes · Configuración. Pie con usuario de soporte.

**Estados ausentes:** copropiedad recién creada sin datos · error de carga por tarjeta (una tarjeta caída no debe tumbar el tablero) · **pérdida del canal de tiempo real** (indicador de reconexión, exigido por el riesgo de latencia de Realtime de §13.4) · sin permiso sobre una tarjeta concreta · esqueleto de carga · sin dispositivos registrados.

**Observación.** El evento «Intento Acceso – Placa XYZ-9999 · Sin Registro / Lista Negra» expone dos motivos distintos en una sola línea. En el dominio son `PLACA_DESCONOCIDA` y `LISTA_NEGRA`, excluyentes y con precedencia definida. La consola debe mostrar **un** motivo tipado, el que determinó la decisión.

---

### W-03 · Gestión de Viviendas

|                |                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Rol**        | Administrador                                                                                                                       |
| **HU**         | HU-01, HU-02, HU-04                                                                                                                 |
| **Entidades**  | `Vivienda`, `Residente`, `Vehiculo`                                                                                                 |
| **Encabezado** | «Total: 120 viviendas · 89 Activas · 31 Inactivas»                                                                                  |
| **Filtros**    | Buscar por número de casa · Estado: Todos                                                                                           |
| **Columnas**   | # CASA · PROPIETARIO · RESIDENTES (n personas) · VEHÍCULOS REGISTRADOS (placas) · ESTADO (Activa/Inactiva) · ACCIONES (ver, editar) |
| **Acciones**   | + Nueva Vivienda · ver · editar · paginación «Mostrando 1-7 de 120»                                                                 |

**Estados ausentes:** padrón vacío · **HU-03 «cargar padrón desde archivo» no tiene punto de entrada** · sin resultados de búsqueda · fila en proceso de desactivación · **confirmación de desactivación explicando que no se borra** (CA-02) · error de validación · sin permiso de edición (rol Portero) · vista de detalle con residentes y vehículos.

**Hallazgo M-04.** HU-03 (Must) —cargar el padrón inicial desde archivo— no aparece en ninguna pantalla. Se añade en la ETAPA 09 como acción secundaria en esta vista, con reporte de errores fila a fila y carga transaccional.

---

### W-04 · Gestión de Vehículos y Placas

|                |                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rol**        | Administrador (y Residente en su alcance, vía M-3)                                                                                                  |
| **HU**         | HU-05, HU-06                                                                                                                                        |
| **Entidades**  | `Vehiculo`, `Placa`, `Vivienda`, `Residente`                                                                                                        |
| **Encabezado** | «Sistema LPR de reconocimiento y control de acceso vehicular automático» · «Total: 183 vehículos · 156 activos · 27 inactivos»                      |
| **Filtros**    | Buscar por placa/modelo · Tipo: Todos · Estado: Todos                                                                                               |
| **Columnas**   | PLACA (distintivo monoespaciado) · MARCA/MODELO · COLOR · PROPIETARIO · VIVIENDA · ESTADO · **TIPO** (Residente / Visitante / Proveedor) · ACCIONES |
| **Acciones**   | + Registrar Vehículo · ver · editar · paginación                                                                                                    |

**Estados ausentes:** **rechazo por placa duplicada activa con indicación del conflicto** (CA-03, es el criterio de aceptación central de esta pantalla y el mockup no lo muestra) · normalización de la placa al escribir · sin vehículos · error de carga.

**Observación de dominio.** La columna TIPO mezcla dos ejes: la relación de la persona con la copropiedad (residente, proveedor) y la naturaleza del vínculo (visitante). En el dominio, `Vehiculo` pertenece a una `Vivienda` o a una `Autorizacion`; el «tipo» es una **proyección de lectura**, no un campo del agregado.

---

### W-05 · Control de Visitantes

|               |                                                                                                                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rol**       | Administrador                                                                                                                                                                                             |
| **HU**        | HU-07, HU-08, HU-09, HU-10                                                                                                                                                                                |
| **Entidades** | `Autorizacion`, `Visitante`, `Vivienda`, `Placa`, `Vigencia`                                                                                                                                              |
| **Pestañas**  | **Activas (12)** · Historial                                                                                                                                                                              |
| **Filtros**   | Buscar visitante · Tipo: Todos · Fecha: Hoy                                                                                                                                                               |
| **Tarjeta**   | Foto · nombre · CI · distintivo de estado (Pendiente / Aprobada / Denegada) · distintivo de tipo (**Único / Recurrente / Contratista**) · CASA DESTINO · AUTORIZA · VEHÍCULO/PLACA · VIGENCIA Desde/Hasta |
| **Acciones**  | + Nueva Autorización · **Rechazar** · **Aprobar**                                                                                                                                                         |

**Hallazgo M-05 · `[CONTRADICCIÓN]` C-03 — la aprobación administrativa no está especificada y choca con OE-02**
El mockup introduce un ciclo de vida `Pendiente → Aprobada / Denegada` decidido por el administrador. **Ninguna HU, RN, CU ni CA lo menciona.** Y colisiona de frente con OE-02, que exige que la autorización del residente _«se propague al motor de reglas **sin intervención de portería**»_, y con KPI-06, que exige ≥ 95 % de ingresos autónomos: una compuerta de aprobación humana hace inalcanzable ese indicador si el administrador no está disponible —que es exactamente PB-01, el problema que el proyecto viene a eliminar—.
**Resolución** (jerarquía Requisitos > Mockups): **no se construye compuerta de aprobación.** La autorización creada por el residente nace vigente. Los distintivos se reinterpretan como el ciclo de vida real de `Autorizacion`: **Vigente · Programada · Expirada · Revocada**. Los botones se sustituyen por **Revocar** (RN-10) y **Ver detalle**. Queda `PENDIENTE DE DEFINICIÓN` **P-09**: si Grupo Control quiere una compuerta administrativa opcional por copropiedad, debe declararse como HU nueva con su CA; hasta entonces no se implementa.

**Estados ausentes:** sin autorizaciones activas · autorización revocada · **acompañantes** (el mockup no los muestra pese a HU-09) · **zonas autorizadas** (HU-19) · error de carga · sin permiso.

---

### W-06 · Zonas Comunes

|                       |                                                                                                                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rol**               | Administrador                                                                                                                                                                                                           |
| **HU**                | HU-18, HU-20                                                                                                                                                                                                            |
| **Entidades**         | `Zona`, `Aforo`, `FranjaHoraria`                                                                                                                                                                                        |
| **Tarjeta de zona**   | Icono y color por tipo · nombre · **interruptor ABIERTA/CERRADA** · «Ocupación actual n / máx personas» con barra (verde bajo el máximo, roja cerca) · Horario «Lun-Dom 08:00 – 21:00» · NORMAS Y RESTRICCIONES (lista) |
| **Zonas del ejemplo** | Piscina 12/30 · Gimnasio 22/25 · Salón Social 0/100 (cerrada) · Coworking 8/20                                                                                                                                          |
| **Panel lateral**     | **Reservas de Hoy** — hora, zona, residente y casa, distintivo Confirmada/Pendiente                                                                                                                                     |
| **Acciones**          | + Nueva Zona · abrir/cerrar zona                                                                                                                                                                                        |

**Hallazgo M-06 · `[CONTRADICCIÓN]` C-04 — reservas fuera de alcance**
«Reservas de Hoy» (aquí) y «Mis Reservas Activas» (M-5) describen un sistema de agenda con confirmación. El alcance excluido prohíbe _«reservas de zonas comunes con cobro o pago en línea»_; el alcance **incluido** menciona _«zonas comunes con horario, aforo y reglas configurables»_ — **sin reservas**. No hay HU de reserva. HU-19 habla de _autorizar acceso_, no de agendar.
**Resolución:** las reservas **no se construyen** en la ETAPA 07. Se implementa **solicitud de acceso a zona** (HU-19), que es lo que el móvil llama «Solicitar Acceso». `PENDIENTE DE DEFINICIÓN` **P-10**: si se quieren reservas con franja horaria y sin cobro, requieren HU, CA y etapa propias.

**Estado ausente crítico:** **el mockup no muestra la denegación por aforo lleno ni por fuera de horario**, que son CA-14 y CA-15 —los dos criterios de aceptación de esta funcionalidad—. El interruptor ABIERTA/CERRADA sí cubre PB-04 (bloqueo remoto de zonas). Faltan además: sin zonas configuradas · error de lectura del contador · **contador reiniciado por política horaria** (CU-05 6a, `PENDIENTE` P-04) · controlador de zona caído.

---

### W-07 · Gestión de Dispositivos

|                              |                                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Rol**                      | Administrador                                                                                                                                                            |
| **HU**                       | HU-38                                                                                                                                                                    |
| **Entidades**                | `Dispositivo`, `Zona`                                                                                                                                                    |
| **Encabezado**               | «Total: 12 dispositivos · 9 en línea · 2 fuera de línea · 1 sincronizando»                                                                                               |
| **Tarjeta**                  | Nombre · subtítulo funcional · distintivo En línea / Fuera de línea / Sincronizando · **Dirección IP** · Última sincronización · Firmware                                |
| **Dispositivos del ejemplo** | Cámara LPR Entrada Principal · Terminal Facial Gimnasio · Talanquera Acceso Vehicular · Cámara LPR Salida Auxiliar · Intercomunicador Bloque A · Terminal Facial Piscina |
| **Acciones**                 | Sincronizar Todo · + Agregar Dispositivo · Configurar · Sincronizar · **Reiniciar**                                                                                      |

**Hallazgo M-07 · `[CONTRADICCIÓN]` C-11 — direcciones IP visibles en el navegador**
La tarjeta muestra `192.168.1.101` y similares. RN-21 prohíbe exponer _credenciales y secretos_ de dispositivos al frontend; KPI-11 exige cero referencias a IP de dispositivo **fuera de la capa de proveedor**.
**Resolución matizada, en tres partes:**

1. **KPI-11 no se incumple.** Se refiere a referencias _en el código_. Una IP leída de la base y renderizada no es una referencia en código fuente. El análisis estático de CI seguirá dando cero.
2. **RN-21 no se incumple por mostrar la IP**, que no es una credencial. La credencial (`credencialRef`) **nunca** viaja al navegador, ni siquiera enmascarada.
3. **Pero es endurecimiento razonable:** la IP se muestra **solo a Administrador y Superadministrador**, nunca a Portero ni Operador de central, y nunca en logs ni en respuestas de error. Se registra en el checklist de la ETAPA 13.

**Estados ausentes:** sincronización en curso con progreso · fallo de sincronización con causa · **dispositivo caído más allá del umbral, con la alerta generada** (CA-26) · sabotaje reportado (KPI-26) · sin dispositivos · sin permiso · confirmación antes de reiniciar (acción disruptiva sobre hardware en producción).

---

### W-08 · Historial de Eventos

|                      |                                                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Rol**              | Administrador                                                                                                                             |
| **HU**               | HU-32, HU-24                                                                                                                              |
| **Entidades**        | `Acceso`, `Dispositivo`, `Alerta`                                                                                                         |
| **Banda de alerta**  | «Hay 3 alertas críticas sin resolver en el sistema» + «Ver Alertas»                                                                       |
| **Panel de filtros** | Buscar (nombre, placa, lote) · **Tipo de Evento**: Ingreso, Salida, Denegado, Alerta, Manual · Dispositivo: Todos · botón Aplicar Filtros |
| **Log de accesos**   | Hora · icono direccional/estado · descripción · **distintivo de placa** · dispositivo · resultado (Permitido / Denegado / Alerta Activa)  |
| **Acciones**         | Exportar XLS · paginación «Mostrando 1-5 de 2,401 eventos»                                                                                |

**Hallazgo M-08 · el filtro no cubre HU-32.** HU-32 exige filtrar _«por vivienda, persona y fecha»_. El panel no tiene **rango de fechas** ni **filtro por vivienda**; «lote» aparece solo como sugerencia dentro del buscador libre. Y ofrece únicamente **XLS**, cuando la ETAPA 06 exige PDF/Excel/CSV —que W-10 sí tiene—.
**Resolución:** en la ETAPA 09 el panel incorpora rango de fechas, vivienda y persona como filtros de primer nivel, y los tres formatos de exportación.

**Estados ausentes:** sin resultados · exportación en curso y descarga lista · **evento decidido por el Edge con caché potencialmente obsoleto** (KPI-31, marca visible) · evidencia no disponible o URL firmada expirada · error de carga · sin permiso.

---

### W-09 · Consola operativa (portería + guardia virtual, fusionadas)

|                            |                                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rol**                    | Portero / Seguridad · Operador de central                                                                                                      |
| **HU**                     | HU-21, HU-22, HU-23, HU-24, HU-27, HU-28                                                                                                       |
| **Encabezado**             | Marca «GUARDIA VIRTUAL» · Estación: Portería Norte · Guardia: Carlos Mendoza · Cerrar Sesión                                                   |
| **Vídeo**                  | «CÁMARA LPR ENTRADA – EN VIVO» · FPS: 30 · Resolución 1080P · reproductor                                                                      |
| **Ficha del evento**       | Foto · distintivo «ACCESO AUTORIZADO» · origen «Pre-Registro Digital» · nombre · C.I. · Empresa · **Destino: Casa 14B (Condómino: G. Castro)** |
| **Accesos recientes**      | Evento · hora · modalidad (Vehículo/Peatonal) · placa                                                                                          |
| **Acciones de emergencia** | Registrar Novedad / Bitácora · Contactar Residente · **ALERTA DE EMERGENCIA**                                                                  |
| **Acciones principales**   | **ABRIR** · **DENEGAR**                                                                                                                        |
| **Pie**                    | Turno: Noche · Portero: Carlos M. · Accesos hoy: 47 · Alertas activas: 2                                                                       |

**Hallazgo M-09 · `[CONTRADICCIÓN]` C-12 — la consola omite cuatro exigencias verificables**

| Ausencia                                                                            | Exige                | Consecuencia si no se añade                                                                                                                                 |
| ----------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Campo de motivo obligatorio en ABRIR/DENEGAR**                                    | RN-08, CA-16, CA-17  | CA-16 dice literalmente que sin motivo escrito **el sistema no ejecuta la apertura**. Tal como está dibujada, la consola incumple un criterio de aceptación |
| **Conmutador de copropiedad**                                                       | HU-25, KPI-35        | Sin él no hay guardia virtual multiproyecto ni forma de demostrar KPI-35                                                                                    |
| **Controles de intercom (audio bidireccional, turno de palabra, estado del canal)** | HU-26, CA-19, ADR-01 | El vídeo está, el audio no. CA-19 exige audio **y** vídeo con retardo < 2 s                                                                                 |
| **Cola de eventos con indicador de tiempo de espera**                               | CU-03 alterno 3a     | Sin cola, «el operador está atendiendo otra copropiedad» no tiene representación                                                                            |

**Resolución:** el mockup se toma como base visual, no como especificación completa. La ETAPA 10 construye **dos superficies diferenciadas** —Portería (presencial, sin conmutador ni intercom remoto) y Guardia Virtual (multiproyecto, con intercom, cola y exclusividad de canal)— y añade los cuatro elementos. Registrado como C-12.

**Estados ausentes:** sin evento en curso (reposo) · vídeo no disponible o cámara caída · **canal de audio ocupado por otro operador** (consecuencia de ADR-01) · semiduplex con turno de palabra · residente que no contesta (CU-03 5a) · apertura fallida tras reintentos (CU-03 6a) · sin operador disponible (CU-03 2a) · offline.

---

### W-10 · Informes / Auditoría

|                      |                                                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rol**              | Administrador                                                                                                                                  |
| **HU**               | HU-32                                                                                                                                          |
| **Tipos de informe** | **Accesos por Periodo** (seleccionado) · Visitantes Frecuentes · Uso de Zonas · **Auditoría de Sistema** («Bitácora de acciones del personal») |
| **Filtros**          | Rango de fechas («Últimos 30 días (01 Sep – 30 Sep)») · Vivienda · Tipo de Acceso (Residentes/Visitas) · Dispositivo                           |
| **Vista previa**     | FECHA/HORA · PROPIETARIO/VISITANTE · CASA · DISPOSITIVO · **MÉTODO** (Placa / Rostro)                                                          |
| **Gráfico**          | Frecuencia de accesos por semana + nota comparativa                                                                                            |
| **Acciones**         | **PDF · Excel · CSV** · Generar Informe                                                                                                        |

Esta pantalla **sí** cubre HU-32 completo. Es la que fija el contrato de exportación de la ETAPA 06.

**Estados ausentes:** informe sin datos en el rango · generación en curso · informe demasiado grande (generación asíncrona con aviso) · error de exportación · sin permiso sobre «Auditoría de Sistema» (debería ser exclusivo de Administrador y Superadministrador).

---

## 3. Inventario de la aplicación móvil (8 pantallas)

**Navegación inferior, 5 pestañas:** Inicio · Visitantes · Vehículos · Zonas · Perfil.
Mi Familia, Historial y Notificaciones se alcanzan desde Inicio y Perfil, no desde la barra.

### M-1 · Inicio / Mi Vivienda

|                         |                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| **HU**                  | HU-33                                                                                         |
| **Encabezado**          | Avatar · «Bienvenido / Hola, María» · campana con contador (3)                                |
| **Tarjeta de vivienda** | «Casa 42 · Manzana B» · «Urbanización Mira» · distintivo **«Al día»**                         |
| **Accesos rápidos**     | Registrar Visita · Mis Vehículos · Zonas Comunes · Historial Acceso                           |
| **Actividad reciente**  | Visita Ingresada · Vehículo Detectado · Zona Reservada · marca temporal relativa · «Ver todo» |

**Nota.** El distintivo «Al día» es la manifestación visible de `estadoAdministrativo` (`[SUPUESTO]` S-01 de `00-solicitud.md`). Se conserva como campo alimentado externamente; Next Control no calcula cartera.

**Estados ausentes:** residente sin vivienda asignada · sin actividad reciente · **modo sin conexión** (la app debe funcionar degradada) · error de carga · sesión expirada · residente de vivienda **inactiva** (RN-13: no puede crear autorizaciones, pero sí ver las vigentes).

### M-2 · Mi Familia

|               |                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HU**        | HU-02 (lectura), HU-04                                                                                                                                  |
| **Contenido** | Tarjetas por miembro: avatar, nombre, parentesco (Propietario / Esposo / Hija), nivel de acceso («Acceso Completo», «Solo Ingreso») · editar · eliminar |
| **Acciones**  | + Agregar Miembro                                                                                                                                       |

**Hallazgo M-10.** Aparece un concepto de **nivel de acceso por residente** («Acceso Completo» / «Solo Ingreso») que **no existe en el modelo de requisitos**: ni RN, ni HU, ni glosario lo mencionan, y el agregado `Vivienda` del diagrama solo tiene `residentes: Residente[]`.
**Resolución:** `PENDIENTE DE DEFINICIÓN` **P-11**. Comportamiento conservador: en la ETAPA 04 `Residente` lleva un campo `nivelAcceso` con valor por defecto **el más restrictivo** que permita cumplir las HU (`SoloIngreso`), y solo el titular de la vivienda puede crear autorizaciones (RN-05). Si Grupo Control quiere granularidad mayor, requiere HU propia.
**Estados ausentes:** vivienda con un solo residente · miembro desactivado con historial (CA-02) · sin permiso para agregar · error de guardado.

### M-3 · Mis Vehículos

|                |                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| **HU**         | HU-05, HU-06                                                                                                       |
| **Encabezado** | «3 vehículos registrados en su propiedad»                                                                          |
| **Tarjeta**    | Distintivo de placa · marca y modelo · color · distintivos **Principal / Activo / Secundario** · editar · eliminar |
| **Acciones**   | + Registrar Vehículo                                                                                               |

**Estados ausentes:** **placa duplicada rechazada con el conflicto explicado** (CA-03) · normalización visible de la placa al escribir · sin vehículos · vehículo desactivado con historial (RN-19) · error de guardado · sin conexión con reintento.

### M-4 · Nuevo Visitante — **la pantalla más crítica de la app**

|            |                                                                                                                                                                                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HU**     | HU-07, HU-08, HU-09                                                                                                                                                                                                                                              |
| **Tipo**   | Chips: **Visita Única · Recurrente · Contratista**                                                                                                                                                                                                               |
| **Campos** | Nombre completo · Documento de identidad · **Placa del vehículo (Opcional)** · Fecha y hora ingreso · Fecha y hora salida · **Número de acompañantes** (contador −/+, «Sin incluir al visitante») · Observaciones · **Autorizar acceso vehicular** (interruptor) |

**Hallazgo M-02 · falta la captura de rostro.** El PDF del reto lista _«Tomar foto / registrar rostro»_ como **pantalla mínima obligatoria** y HU-11 es Must. No hay ningún control de cámara en este formulario ni en ninguna de las 8 pantallas móviles.
**Resolución:** la ETAPA 08 diseña el flujo de captura con validación de calidad **en el dispositivo antes del envío** (HU-13, KPI-16) y la ETAPA 11 lo implementa como paso posterior al guardado de la autorización.

**Hallazgo M-03 · falta la pantalla de consentimiento del visitante.** La §12 del documento de requisitos la lista; HU-12 es Must; RN-10 exige que el consentimiento lo otorgue **el visitante, no el residente**. No existe en el mockup.
**Resolución:** la ETAPA 08 la diseña como **superficie propia para el titular del dato**, alcanzable por enlace de un solo uso enviado al canal registrado del visitante (CU-02 paso 3). No es una pantalla del residente.

**Hallazgo M-11 · `[CONTRADICCIÓN]` C-06 — acompañantes: contador frente a lista nominal.**
El mockup pide un **número**. HU-09 dice _«registrar acompañantes»_ y el diagrama declara `acompanantes: Acompanante[]` — una colección de entidades con identidad. Un contador no permite auditar quién entró, y RN-02 exige que el evento registre el actor.
**Resolución:** se implementa **lista nominal**. El contador se conserva como atajo de interfaz que despliega N filas de nombre y documento. Coherente con CU-01, donde los acompañantes ingresan en el mismo vehículo pero cada persona genera su propio registro.

**Hallazgo M-12 · faltan dos controles obligatorios.**

- **Patrón de recurrencia:** al elegir «Recurrente» no hay selector de días ni de franjas horarias. HU-08 es Must y CA-06 lo verifica («lunes a viernes de 7:00 a 12:00»). Sin este control, HU-08 no es realizable.
- **Autorización de zonas comunes:** HU-19 y el PDF del reto («Autorizar zonas comunes») exigen elegir a qué zonas accede el visitante. No hay control.
  **Resolución:** ambos se añaden en la ETAPA 11, con el modelo definido en las ETAPAS 05 y 07.

**Estados ausentes:** validación por campo · vigencia inválida (hasta ≤ desde) · **visitante o placa en lista negra rechazado al crear** (RN-06) · vivienda inactiva que no puede generar autorizaciones (RN-13) · placa ya asociada a otra vivienda activa · guardado en curso · **creado sin conexión, pendiente de sincronizar** · error del servidor.

### M-5 · Zonas Comunes (móvil)

|                          |                                                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| **HU**                   | HU-19                                                                                                                |
| **Mis Reservas Activas** | Salón Social · «Sábado 18 de Oct · 15:00 – 19:00» · distintivo Aprobada                                              |
| **Espacios disponibles** | Piscina (Abierta, horario, «Aforo Actual 12/20 Personas», barra) · Gimnasio (Abierta, 8/15) · Salón Social (Cerrada) |
| **Acciones**             | Solicitar Acceso (deshabilitado cuando la zona está cerrada)                                                         |

Aplica **C-04**: «Mis Reservas Activas» queda fuera de alcance; «Solicitar Acceso» es lo que se construye (HU-19).
**Estados ausentes:** **aforo lleno con el botón bloqueado y motivo visible** (CA-14) · fuera de horario (CA-15) · solicitud enviada, aprobada o denegada · sin zonas configuradas · sin conexión.

### M-6 · Historial

|                |                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **HU**         | HU-33                                                                                                                     |
| **Encabezado** | «34 visitas este mes» con gráfico de tendencia                                                                            |
| **Filtros**    | Hoy · Esta Semana · Este Mes · Todo                                                                                       |
| **Lista**      | Avatar · nombre · relación («Familia · Casa 42», «Servicio · Casa 42») · hora · distintivo **Ingresó / Salió / Denegado** |

**Estados ausentes:** sin visitas en el periodo · evidencia fotográfica del evento · motivo de la denegación (el residente debe poder entenderlo) · **exportación** (HU-32 es de administrador, pero el PDF del reto pide «Historial e informe de visitas» al residente) · error de carga · sin conexión con caché local.

### M-7 · Notificaciones

|                      |                                                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HU**               | HU-34                                                                                                                                                      |
| **Tipos observados** | «Visitante en portería» · «Vehículo ingresó» · «Acceso piscina aprobado» · **«Alerta de seguridad»** («Intento de acceso no autorizado con placa XYZ-000») |
| **Acciones**         | Leer todo · tocar para ir al evento                                                                                                                        |

**Estados ausentes:** sin notificaciones · permiso de notificaciones denegado en el sistema operativo · **token FCM inválido o caducado** · agrupación por día · error de carga.

### M-8 · Mi Perfil

|                      |                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| **HU**               | HU-37 (parcial)                                                                                        |
| **Datos**            | Avatar · nombre · correo · teléfono · tarjeta de vivienda «Casa 42 · Manzana B»                        |
| **Preferencias**     | Notificaciones push (interruptor) · Alertas de seguridad (interruptor) · Resumen semanal (interruptor) |
| **Soporte y cuenta** | Cambiar contraseña · …                                                                                 |

**Estados ausentes:** **alta y gestión de MFA/TOTP** (RN-20 aplica a roles administrativos, pero el residente debería poder activarlo) · cerrar sesión en todos los dispositivos · **revocar mi propio consentimiento biométrico** (HU-15, RN-11: el residente también es titular de datos) · política de privacidad y versión aceptada · eliminar cuenta / solicitud de supresión (Ley 1581) · error de guardado.

---

## 4. Estados transversales que ninguna pantalla muestra

El mockup dibuja exclusivamente el **camino feliz con datos**. Los cinco estados que `CLAUDE.md` §6 (ETAPA 09) exige en **toda** vista están ausentes en las 18 pantallas:

| Estado           | Ausente en | Exigencia                                              |
| ---------------- | ---------- | ------------------------------------------------------ |
| **Vacío**        | 18/18      | Copropiedad recién creada, sin datos                   |
| **Cargando**     | 18/18      | Esqueletos, no bloqueos                                |
| **Error**        | 18/18      | Con causa y acción de recuperación                     |
| **Sin permiso**  | 18/18      | Los 6 roles ven superficies distintas; RN-15           |
| **Sin conexión** | 18/18      | Crítico en móvil (M-4) y en consola de portería (Edge) |

A ellos se añaden tres específicos de este dominio, también ausentes:

- **Degradado** — dispositivo caído, terminal en cola de sincronización, canal de audio ocupado.
- **Decidido por el Edge** — evento resuelto con caché, con marca visible de la `VersionDeReglas` y aviso si el caché excedía el margen (KPI-31, RN-16).
- **Pendiente de consentimiento** — estado explícito de `PlantillaBiometrica` que CA-09 nombra literalmente.

**Es el hallazgo más voluminoso de esta auditoría** y define buena parte del trabajo real de las ETAPAS 09, 10 y 11: por cada pantalla del mockup hay entre cinco y nueve estados que diseñar.

---

## 5. Sistema de diseño derivado

Especificación para el preset Tailwind compartido (`packages/config`) que consumen la ETAPA 09 (consola), la 10 (consolas operativas) y, traducido a `ThemeData`, la 11 (Flutter).

### 5.1 Paleta

Extraída por frecuencia sobre píxeles con saturación > 0,35 y valor > 0,25.

| Rol                           | Valor                             | Frecuencia                         | Uso observado                                                                                 |
| ----------------------------- | --------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------- |
| **Primario / acento**         | `#E63946`                         | dominante (H 355°, S 0,75, V 0,90) | Botones primarios, elemento activo del menú, distintivos de placa, alertas críticas, logotipo |
| Primario claro                | `#EA6973`                         | alto                               | Estados _hover_ y variantes suaves                                                            |
| Primario suave (fondo)        | `#FEF3F3`                         | —                                  | Fondo de distintivos y avisos                                                                 |
| Primario oscuro               | `#A23037`                         | bajo                               | **Texto pequeño, enlaces y bordes** (6,967 : 1) y estados presionados                         |
| **Primario de relleno**       | `#DC3341`                         | derivado (ETAPA 09-A)              | Relleno sólido **con etiqueta blanca** (4,572 : 1). Ver la corrección de §5.6.1               |
| **Éxito**                     | `#10B981`                         | alto                               | Botones «Aprobar», distintivos Autorizado/Permitido, EN LÍNEA, barras de aforo con holgura    |
| Éxito suave                   | `#D1FAE5` aprox.                  | —                                  | Fondo de distintivos de éxito                                                                 |
| **Advertencia**               | `#F59E0B`                         | medio                              | Distintivos Pendiente, «Alerta Activa»                                                        |
| Advertencia suave             | `#FEF3C7` aprox. (obs. `#FACF86`) | —                                  | Fondo de distintivos de advertencia                                                           |
| **Superficie oscura**         | `#040407` → `#0B0B12`             | dominante                          | Barra lateral, cabecera de guardia virtual, panel de marca del login                          |
| **Superficie oscura elevada** | `#252542`                         | alto                               | **Elemento activo de la barra lateral** (con filete izquierdo `#E63946`)                      |
| Superficie oscura secundaria  | `#11111E`                         | medio                              | Reproductor de vídeo, tarjetas sobre fondo oscuro                                             |
| **Lienzo**                    | `#F8F9FA`                         | dominante                          | Fondo de todas las vistas de contenido                                                        |
| **Tarjeta**                   | `#FFFFFF`                         | dominante                          | Todas las tarjetas y tablas                                                                   |
| Borde                         | `#F3F4F6` / `#E5E7EB`             | alto                               | Bordes de tarjeta y separadores de tabla                                                      |
| Texto principal               | `#1E1E1E` / `#111827`             | dominante                          | Títulos y contenido                                                                           |
| Texto secundario              | `#6B7280` aprox.                  | alto                               | Etiquetas, subtítulos, marcas temporales                                                      |

**Semántica del color, vinculante:** el rojo `#E63946` es simultáneamente **color de marca** y **color de peligro**. Es una tensión real —«DENEGAR» y «+ Nueva Autorización» comparten color— que la ETAPA 09 debe resolver **sin cambiar la identidad**: acción destructiva u operativa de riesgo con relleno sólido y confirmación; acción primaria constructiva con relleno sólido pero sin confirmación; nunca dos rojos distintos compitiendo en la misma vista. El verde queda reservado a **resultado positivo** (permitido, en línea, aprobar), nunca a acción de navegación.

### 5.2 Tipografía

Familia geométrica de palo seco con dígitos tabulares —compatible con **Inter**, **Manrope** o similar—. Se recomienda **Inter** con `font-feature-settings: "tnum"` para que las horas, placas y aforos alineen en columna.

| Nivel             | Uso                              | Tamaño aprox. | Peso                               |
| ----------------- | -------------------------------- | ------------- | ---------------------------------- |
| Título de página  | «Dashboard Operativo»            | 24–28 px      | 600–700                            |
| Título de sección | «Últimos Eventos en Tiempo Real» | 18–20 px      | 600                                |
| Cifra de KPI      | «247»                            | 30–36 px      | 700                                |
| Etiqueta de KPI   | «RESIDENTES ACTIVOS»             | 11–12 px      | 600, versalitas, `tracking` amplio |
| Cuerpo            | Contenido de tabla y tarjeta     | 14–15 px      | 400–500                            |
| Secundario        | Subtítulos, horas                | 12–13 px      | 400                                |
| Distintivo        | «Autorizado», «EN LÍNEA»         | 11–12 px      | 600                                |
| **Monoespaciada** | **Placas** («ABC-1234»), IP, CI  | 12–14 px      | 500                                |

La monoespaciada para placas no es decorativa: evita la confusión entre `0`/`O` y `1`/`I` en el dato que decide una apertura.

### 5.3 Densidad, espaciado y forma

- **Rejilla base de 4 px**; espaciados dominantes 8 / 12 / 16 / 24 / 32.
- **Radios:** tarjeta 12–16 px · botón 8–10 px · distintivo 6 px (píldora en los de estado) · campo 8–10 px · avatar circular.
- **Sombras:** muy sutiles, casi planas. La jerarquía se construye con **borde y fondo**, no con elevación. El panel lateral oscuro es el único contraste fuerte.
- **Densidad:** media-alta en tablas (fila de 48–56 px), holgada en tarjetas. La consola de portería y la guardia virtual usan densidad **mayor**: el operador necesita ver más en una pantalla y decidir rápido.
- **Ancho del panel lateral:** ~240 px fijo, colapsable.

### 5.4 Navegación

| Superficie                    | Patrón                                                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Consola de administración** | Barra lateral oscura fija de 9 elementos + cabecera con buscador global, campana y menú de usuario                                                             |
| **Consola operativa (W-09)**  | **Sin barra lateral.** Cabecera oscura de identidad de estación y turno, cuerpo a dos columnas, pie de estado. Es una superficie de atención, no de navegación |
| **Móvil**                     | Barra inferior de 5 pestañas + navegación por pila con flecha atrás                                                                                            |

### 5.5 Componentes recurrentes (catálogo para shadcn/ui)

`Tarjeta de KPI` (icono en pastilla, etiqueta en versalitas, cifra, delta) · `Tarjeta de estado` con interruptor · `Barra de progreso de aforo` (color según proximidad al máximo) · `Distintivo de estado` (éxito/peligro/advertencia/neutro) · `Distintivo de placa` monoespaciado · `Fila de evento` (miniatura, título, subtítulo, hora, resultado) · `Tabla de datos` (buscador, filtros, paginación, columna de acciones) · `Tarjeta de persona` (avatar, nombre, documento, distintivos, pares etiqueta-valor, acciones al pie) · `Panel de filtros` lateral · `Par etiqueta-valor` en versalitas · `Selector de rango de fechas` · `Banda de alerta` · `Elemento de lista de dispositivo` con estado y latido · `Barra de acciones de emergencia`.

### 5.6 Accesibilidad — verificaciones obligatorias en la ETAPA 09

1. **Contraste.** Ver la tabla de medidas de más abajo. **Regla:** el rojo de marca `#E63946` no se usa como texto sobre fondo claro salvo en tamaño grande (≥ 18,66 px negrita o ≥ 24 px); para texto pequeño, enlaces y bordes se usa `#A23037`. Sobre relleno sólido con etiqueta blanca se usa `#DC3341`, no `#E63946`.

> **CORRECCIÓN DEL 2026-09-09 · cifras medidas en la ETAPA 09-A.**
>
> Este apartado traía tres razones estimadas. La ETAPA 09-A las calculó con la fórmula de WCAG 2.1 —`packages/config/src/contraste.ts`, con 39 pruebas sobre los pares reales de la consola— y dos no coincidían. Se corrigen aquí para que nadie herede la estimación:
>
> | Par                                | Estimado aquí | **Medido** | AA texto normal (4,5:1) |
> | ---------------------------------- | ------------- | ---------- | ----------------------- |
> | `#E63946` sobre **blanco**         | ≈ 3,9 : 1     | **4,168**  | no cumple               |
> | `#E63946` sobre **lienzo**         | —             | **3,954**  | no cumple               |
> | `#A23037` sobre blanco             | ≈ 6,4 : 1     | **6,967**  | cumple                  |
> | Blanco **sobre relleno** `#E63946` | ≈ 4,4 : 1     | **4,168**  | **no cumple**           |
> | Blanco sobre relleno `#DC3341`     | —             | **4,572**  | cumple                  |
>
> **De dónde salía el ≈ 3,9.** No era un error de cálculo: es el valor de `#E63946` contra el **lienzo** `#F8F9FA` (3,954), no contra el blanco de tarjeta (4,168). La conclusión no cambia —los dos están por debajo de 4,5— pero el número sí, y conviene saber contra qué fondo se midió cada uno.
>
> **El cuarto par es el que obligaba a decidir.** «≈ 4,4» sugería estar al borde; medido da **4,168**, claramente por debajo, y es el par de la etiqueta de un botón primario. Se aplica la salida que este mismo apartado ya preveía —«oscurecer el relleno si no alcanza»—: **`marca.boton` = `#DC3341`** (4,572 : 1), el oscurecimiento más pequeño que alcanza el umbral y a **1,097 : 1** del original, es decir, el mismo tono a ojo.
>
> **La identidad no cambia.** `#E63946` se conserva intacto y sigue siendo el color dominante de la pantalla, porque va donde no hay texto pequeño encima: filete del elemento activo de la barra lateral, pastillas de icono, barras del histograma y distintivos sobre `marca.suave`. Ahí AA pide 3 : 1 como componente de interfaz, y 4,168 lo supera con margen.
>
> Aprobado por el cliente el 2026-09-09. 2. **Color nunca como único portador de significado.** Permitido/Denegado, En línea/Falla y aforo lleno llevan además icono y texto. 3. **Foco visible** en todo elemento interactivo, con el filete rojo de marca sobre fondo claro y blanco sobre fondo oscuro. 4. **Objetivos táctiles** de 44 × 44 px mínimo en móvil; los controles `−`/`+` de acompañantes del mockup están por debajo. 5. **Movimiento reducido** respetando `prefers-reduced-motion` en las barras del panel y en las actualizaciones en vivo.

### 5.7 Identidad de marca — inconsistencia detectada

**Hallazgo M-13 · `[CONTRADICCIÓN]` C-14.** Aparecen tres denominaciones: **«NextResidential»** (login), **«Next Control · RESIDENCIAL»** (barra lateral) y **«Next Control Residencial»** (documentos). El pie dice «© 2025 Next Control» y «Versión 4.2.1-Prod» —una versión de producto ficticia que no debe llegar al entregable—.
**Resolución:** el producto se denomina **Next Control Residencial**; el repositorio conserva `NextResidential`. El bloque de marca de la interfaz muestra «Next Control» con «RESIDENCIAL» como descriptor secundario, tal como hace la barra lateral. El número de versión se toma del `package.json` en tiempo de construcción, nunca escrito a mano.

---

## 6. Resumen de hallazgos

| ID       | Hallazgo                                                                     | Severidad | Resolución                                                              |
| -------- | ---------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------- |
| **M-01** | Selector «TIPO DE USUARIO» en el login; faltan MFA y selector de copropiedad | **Alta**  | C-05 · se elimina el selector; se añaden MFA y copropiedad              |
| **M-02** | Sin captura de rostro en la app                                              | **Alta**  | Pantalla mínima del reto y HU-11 · se diseña en 08, se implementa en 11 |
| **M-03** | Sin pantalla de consentimiento del visitante                                 | **Alta**  | HU-12, RN-10 · superficie propia del titular · ETAPA 08                 |
| **M-05** | Flujo de aprobación administrativa no especificado                           | **Alta**  | C-03 · no se construye · P-09                                           |
| **M-09** | Consola operativa sin motivo obligatorio, multiproyecto, intercom ni cola    | **Alta**  | C-12 · se separan las dos consolas y se añaden en la ETAPA 10           |
| **M-12** | Sin patrón de recurrencia ni autorización de zonas en «Nuevo Visitante»      | **Alta**  | HU-08, HU-19 · se añaden en la ETAPA 11                                 |
| **M-06** | Reservas de zonas fuera de alcance                                           | Media     | C-04 · se construye «Solicitar Acceso» · P-10                           |
| **M-08** | Filtro de eventos sin fecha ni vivienda; solo XLS                            | Media     | Se completa en la ETAPA 09                                              |
| **M-11** | Acompañantes como contador en vez de lista nominal                           | Media     | C-06 · lista nominal                                                    |
| **M-10** | «Nivel de acceso» por residente sin respaldo en requisitos                   | Media     | P-11 · valor por defecto restrictivo                                    |
| **M-04** | HU-03 (carga de padrón por archivo) sin punto de entrada                     | Media     | Se añade en la ETAPA 09                                                 |
| **M-07** | Direcciones IP visibles en el navegador                                      | Baja      | C-11 · visible solo para roles administrativos                          |
| **M-13** | Tres denominaciones de marca y versión ficticia                              | Baja      | C-14 · «Next Control Residencial»                                       |
| **—**    | **Los 5 estados obligatorios ausentes en las 18 pantallas**                  | **Alta**  | Definen el trabajo real de las ETAPAS 09, 10 y 11                       |
