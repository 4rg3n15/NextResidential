# Estado de las etapas

**Proyecto:** Next Control Residencial · **Contrato:** `CLAUDE.md` v3.0
**Última actualización:** 2026-10-05 · **CORRECCIÓN DE LA 15-S1: DT-15S1-03 CERRADO** (las pruebas de la API se compilan con las opciones estrictas del proyecto y `pnpm typecheck` las recoge —paso 4 del verificador y CI—; salieron 50 errores previos, no 2, y dos pruebas huecas: la verificación de H-13-02, hueca desde la 15-E, y «el motivo sin dirección» de la 15-P; y el propio control tenía un falso verde local, la caché de turbo; H-15S1-C02 a C05; [`etapas/ETAPA-15S1-tipos-de-las-pruebas.md`](etapas/ETAPA-15S1-tipos-de-las-pruebas.md)) · _Antes:_ **RONDA 15-S1 CERRADA (VÍSPERA DE SITIO)** (el turno de audio se suelta por sesión y cada conversación toma la suya: colgar y volver a llamar, o cambiar de equipo y volver, ya no pierden el turno; `pnpm sitio:ensayo` dice la víspera —0047–0054 una a una, las variables nuevas desde la 15-N y la consola de la guardia—; `ENTREGA_EN_SITIO.md` con la víspera y el orden de mañana; fuera del encargo, H-15S1-01: `RECUPERACION_POR_CORREO` vacía tumba la consola; y, con autorización expresa, las tres intermitentes que tumbaron su CI, DT-15M-C03, DT-15M-C04 y H-15S1-02; [`etapas/ETAPA-15S1.md`](etapas/ETAPA-15S1.md)) · **CORRECCIÓN DE LA 15-M: H-15M-C01 CORREGIDO** (la prueba de la alerta archivada cuenta en una copropiedad propia —0, 1, 0— en vez de restar sobre el conteo de COP*A, que otras suites mueven en paralelo; fuera del encargo, H-15M-C02; once ficheros más con riesgos del mismo origen, anotados como DT-15M-C01, y tres fallos intermitentes ajenos que tumbaron sendas corridas del verificador, DT-15M-C02 a C04; [`etapas/ETAPA-15M-alerta-archivada-aislada.md`](etapas/ETAPA-15M-alerta-archivada-aislada.md)) — **llevada a `develop` el 2026-10-04**: el PR #44 se fusionó por error en `main` · **CORRECCIÓN DE LA 15-R: DT-15R-09 CERRADO** (el Edge compone su proveedor de equipos con los ajustes de la API, el reloj incluido; [`etapas/ETAPA-15R-proveedor-del-edge.md`](etapas/ETAPA-15R-proveedor-del-edge.md)) · **RONDA 15-R CERRADA (HUECOS FUNCIONALES, DECISIONES DEL CLIENTE Y DOCUMENTACIÓN) · LA ETAPA 15 SIGUE BLOQUEADA SÓLO POR `BE-02`** · Aplica siete decisiones del cliente: avisos al residente por **Web Push estándar sin Firebase** (P-23, ADR-036), puerta **libre o bloqueada** con vuelta automática (P-25), consola en Netlify con **SSE y audio directos a la API** en Cloud Run de una instancia (P-20, P-30), **coturn** en Compute Engine sólo como configuración y guía (P-29), recuperación por correo **desactivada** en producción (AR-04) y P-26 fuera de alcance. Cierra P-31 (cuarentena en el Edge), C-37 y ocho defectos (E1–E8); persiste MFA, bloqueos y operaciones al reinicio; registra las aceptaciones de riesgo en un documento único (AR-05 nueva) y rota la llave maestra de la bóveda con recifrado. Nada desplegado ni probado contra servicios reales (DT-15R-01). Informe: [`etapas/ETAPA-15R.md`](etapas/ETAPA-15R.md) · *Antes:_ **RONDA 15-U CERRADA (VULNERABILIDADES DE DEPENDENCIAS: AR-02 NO SE ACEPTA, SE CORRIGE) · LA ETAPA 15 SIGUE BLOQUEADA SÓLO POR `BE-02`** · `pnpm audit --prod` pasa de 12 (3 bajas, 9 moderadas) a **0**: NestJS 10 → 11 con todos los `@nestjs/_`a la vez y Express 4 → 5, que traen corregidos qs, body-parser y file-type, sin ningún`override`nuevo. La subida rompía cosas que ninguna prueba nombraba —NestJS 11 deduplica los módulos dinámicos por referencia (375 rutas en vez de 174, estado repartido entre copias) y Express 5 anulaba en silencio el saneamiento de la consulta—; las dos se corrigen y dos pruebas nuevas, verdes en la base y rojas con la subida, las vigilan. AR-02 y H-13-26 CERRADOS; C-51 cerrada; el árbol de desarrollo (18, de 30) queda como DT-15U-01 · _(anterior: **RONDA 15-Q2 CERRADA (EL EDGE COMO PUENTE ENTRE LA NUBE Y LOS EQUIPOS, P-27 = A) · LA ETAPA 15 SIGUE BLOQUEADA SÓLO POR`BE-02`** · la 15-Q2 corrige el registro de P-27 (era A, no B: ADR-035) y hace del Edge el puente permanente: la API en Cloud Run no tiene ruta a la red del conjunto, así que el Edge abre un túnel WebSocket saliente autenticado con su identidad de la 15-Q, y por él la consola opera los equipos con los MISMOS puertos (contrato contra directo y vía Edge sin cambiar aserciones); la nube decide y el Edge ejecuta, y a tiempo vencido decide el Edge, nunca los dos; las credenciales de los equipos viven sólo en el Edge, cifradas, y las heredadas se mudan borrando la copia de la nube sólo tras confirmar; audio < 2 s y video por el go2rtc del Edge con STUN/TURN efímeros (TURN: P-29); la elección es por copropiedad y una sin Edge puente funciona como antes (R1). La DoD corre con la API y el Edge en procesos distintos y un guardián que prueba que la API no tocó ningún equipo. Por el camino: el túnel no volvía nunca tras una conexión rechazada (Node 22 no emite `close`), una regresión R1 del video con base, y diez defectos del código nuevo que destaparon sus pruebas, todos corregidos · _(anterior: **RONDA 15-Q CERRADA (EDGE EN SITIO: CONTINGENCIA REAL CON LOS EQUIPOS) · LA ETAPA 15 SIGUE BLOQUEADA SÓLO POR `BE-02`** · la 15-Q cierra S-24: el Edge de la ETAPA 12 no podía operar en sitio —la API no servía reglas, la descarga sólo la llamaban las pruebas, `POST /hechos`no exigía autenticación y el gateway no hablaba con ningún equipo—. Con P-27 = B (ADR-034, el Edge es contingencia) la API sirve una instantánea versionada por hash a una identidad de Edge derivada y validada en la aplicación (0049, aislamiento por los dos caminos); el Edge la descarga cada 5 min y al volver el WAN, sólo avanza y verifica el hash; escucha los equipos en paralelo con el mismo`packages/providers`de la nube, y por cada acceso pregunta a`/ready`si la nube puede decidir: si no, decide con el mismo motor, abre la barrera o contesta a la terminal, y reconcilia con clave de idempotencia; entradas locales firmadas con nonce, una interfaz, límites de cuerpo y de ritmo;`pnpm sitio:edge`y`DESPLIEGUE*EDGE.md`al día. La DoD corre de verdad contra la API con PostgreSQL: 30 min sin WAN, 20 accesos, los 20 en la nube exactamente una vez en < 5 min aun perdiendo la primera respuesta. Por el camino:`VersionesPg` ordenaba la última versión como texto ('9' > '10') y desde la v10 la instantánea daba 500 permanente; corregido con prueba que cruza el 9→10. Las regresiones de sitio siguen en verde sin tocar aserciones · *(anterior: **RONDA 15-P CERRADA (GUARDIA VIRTUAL: AUDIO BIDIRECCIONAL Y PUERTAS DEL VIDEOPORTERO) · LA ETAPA 15 SIGUE BLOQUEADA SÓLO POR `BE-02`** · la 15-P mide antes de construir y cambia el puente del audio (ADR-01, enmienda 1): el audio de la guardia nunca había funcionado en producción —micrófono negado en toda la consola, subida `chunked` que un equipo del manual no entiende, turno que caducaba hablando, 429 del límite global—; ahora va por un WebSocket ordenado navegador ↔ API ↔ `audioData` persistente, elegido frente a go2rtc con cifras contra un videoportero simulado en red (ida 37 ms, vuelta 70 ms, cero canales huérfanos), con pulsar para hablar, turno del dominio, cortes del servidor y constancia sin audio (0047), y `GUARDIA_AUDIO_TRANSPORTE=http` como vuelta atrás. La guardia abre cada salida que el videoportero declara (árbol equipo → módulo → salida, recursión acotada a 3), persistida en `puntos_de_acceso` (0048) con nombre editable, elegida por punto, con motivo y auditada; sólo `open`. Más los remanentes de la 15-O (proceso vigilado, escucha que no enmudece, sesión renovada en el middleware, WHEP abortable, canal 101 por omisión, `keepAlive`). La regresión de la cámara del 28/09, la del CRLF y los cortes de la 15-O siguen en verde sin una aserción cambiada · _(anterior: **CORRECCIÓN 15-O CERRADA (UN CORTE DE POSTGRESQL YA NO TUMBA LA API) · LA ETAPA 15 SIGUE BLOQUEADA SÓLO POR `BE-02`** · la 15-O corrige la caída de sitio del 30/09: `pg` emitía `'error'` al cortarse una conexión y nadie lo escuchaba ni en el pool ni en los 36 clientes prestados; ahora un único `conCliente` presta y descarta la conexión rota, un corte responde 503 «base de datos no disponible» (una lectura se repite una vez si se cortó una conexión ya abierta), pg-boss se reintenta solo y lo publica, `/ready` mira el pool de la API, la API no arranca si pide más conexiones de las que admite el pooler (`SUPABASE_POOLER_MAX_CLIENTES`, `PG_POOL_MAX` 10), el volcado histórico se escribe por lotes con tope por segundo y la consola dice «Base de datos no disponible». Probado con cortes reales (`pg_terminate_backend`), vistos fallar con el código anterior; la regresión de la cámara del 28/09 sigue en verde sin una aserción cambiada · _(anterior: **RONDA 15-N CERRADA (VIDEO EN VIVO Y GUARDIA QUE SE ABRE SOLA) · LA ETAPA 15 SIGUE BLOQUEADA SÓLO POR `BE-02`** · la 15-N saca el video del EOF de go2rtc (el saneamiento global le quitaba a la oferta SDP su CRLF final; prueba extremo a extremo por HTTP con go2rtc real), pide el canal que el equipo declara, hace el Digest RTSP con UN desafío y el algoritmo pedido, dice en palabras por qué no hay video, abre sola la atención con el video del equipo que necesita a una persona (P-22 decidida, una alerta por disparador), lee el reloj del equipo antes de dar de alta, reenvía las plantillas vigentes al equipo que empieza a admitirlas, cierra solas las alertas de caída y cierra DT-15M-04 a 06. La regresión de la cámara del 28/09 sigue en verde sin una aserción cambiada · _(anterior: **RONDA 15-M CERRADA (VISITA DEL 29/09)**)_ · la 15-M quita el falso «rechazó el usuario o la clave» (un 401 al nonce heredado de la escucha provoca UN intercambio limpio; sólo el 401 a ese intercambio es la credencial) y deja a la terminal y al videoportero completar en simulación sondeo, escucha, apertura, alta y baja de rostro y verificación remota sin un rechazo falso; video por go2rtc con el binario real y sin credenciales en disco; rostros en el videoportero por capacidades (persona `normal`, carga por `POST FaceDataRecord`); un solo estado por equipo en lista, ficha y tablero; alertas por condición con archivo y motivo; receptores huérfanos; N equipos de cada tipo (secreto de Alarm Server por cámara, 0045); selector de equipo en vivo; bajas con motivo de equipos y residentes; confirmación de placa; fechas DD-MM-YYYY; el residente en la consola web (D-12, E-06); 503 mientras arranca la API y cierre ordenado; y la guía `VISITA-29-09.md`. La regresión de la cámara del 28/09 sigue en verde sin una aserción cambiada · _(anterior: **RONDA 15-L CERRADA (ENTREGA FINAL EN SITIO), CON SUS DOS CORRECCIONES ANTES DE LA FUSIÓN · LA ETAPA 15 SIGUE BLOQUEADA SÓLO POR `BE-02`** · la corrección 2 deja la foto del visitante también desde la galería por el mismo camino, la casilla con el nombre del visitante como **única** constancia (ADR-032, enmienda; P-21 sin objeto), «Enviar eventos a este Mac» e interruptor de verificación remota en la ficha, releídos y auditados, la verificación remota con pool precalentado, caché del registro, duración por decisión y p50/p95 en el ensayo, el aviso de equipos simulados, pg-boss frente al host sólo IPv6, «Rostros: admite / no admite / no se pudo leer (motivo)» en terminal y videoportero, HikCentral dicho en el ensayo y en la ficha, el bucle local del portero en una sola grafía, y **omitir por falta de base es FALLO con `--con-base`** · la corrección (ADR-033) deja la app del residente en Release, abierta desde el ícono sin cable, con el servidor configurable desde la app (`.local` o la IP, probado contra `/health`), sincronizada con la consola (recarga de 20 s, situación real de cada visita con el motivo del rechazo, notificaciones de la API, bandeja sin conexión con foto), y destapa y corrige **H-15L-C01** (la lista de visitas de la app salía vacía contra PostgreSQL desde la 11-A) · la 15-L deja la plataforma lista para la entrega sin escribir código en sitio: comunicación bilateral con los tres equipos (verificación remota armada, persona con vigencia, videoportero por capacidad, credencial rechazada sin bucle), todos los eventos de equipo visibles, dispositivos editables con «Probar conexión» por capacidad y latido real, video con go2rtc desde el `.env`, porteros por número con lista blanca de IP y modo pruebas, edición de residentes, el **flujo de visitantes del cliente** (un formulario en consola y app con foto y casilla, autoaprobación, aviso y rechazo en vivo que retira la foto de los equipos, el día del portero, últimos visitantes) con **ADR-032** (la casilla como constancia, riesgo legal aceptado) y **cero códigos del proyecto en pantalla**; el recorrido de la entrega corre los ocho pasos del cierre contra API real, PostgreSQL y equipos simulados · _(anterior: **RONDA 15-K CERRADA CON SU ANEXO DE SITIO · LA ETAPA 15 SIGUE BLOQUEADA SÓLO POR `BE-02`** · el anexo (27/09) trajo la causa DEMOSTRADA de H-SITIO-13 —sin espacio de nombres ni `version="2.0"` el equipo dice «OK» y no abre— y un hallazgo nuevo, H-SITIO-15 —la terminal rechaza con 400 una escritura de cuerpo vacío antes de autenticar—. Los dos quedan CORREGIDOS, el simulado reproduce los tres comportamientos de sitio, el recorrido corre con el adaptador real y pregunta al EQUIPO si la puerta se movió (13c reintroduce 02, 03, 08, 13 y 15), el guion gana `--abrir` para la próxima visita y entra en el verificador (12e). Destapó que H-SITIO-06 seguía a medias: con `tsx` el `ValidationPipe` no validaba nada; `start:dev` compila ahora con `tsc` y la API no arranca sin metadatos · _(anterior: **RONDA 15-K CERRADA · LA ETAPA 15 SIGUE BLOQUEADA SÓLO POR `BE-02`** · la primera visita a sitio (26/09/2026) no ejecutó los 16 escenarios: la API se conectó a la terminal y al videoportero y la CONSOLA no dejó operarlos, porque nunca se había probado de punta a punta contra la API real. La 15-K corrige los catorce hallazgos de la visita (once CORREGIDOS, tres INSTRUMENTADOS con hipótesis numeradas), cierra la causa raíz con un recorrido de la consola en Chromium contra la API real, PostgreSQL y el simulado por HTTP —que se pone rojo NOMBRANDO H-SITIO-02, 03 y 08 si se reintroducen—, añade D-10 (consentimiento presencial escrito por el titular) y D-11 (atestación física del instalador, por firmware, en ámbar), `--capturar` en el guion de sitio y la guía de la visita corregida · _(anterior: **CORRECCIÓN 15-J CERRADA · LA ETAPA 15 SIGUE BLOQUEADA SÓLO POR `BE-02`** · la 15-J cierra **H-15I-05**: la franja de un patrón recurrente, guardada en hora local, se leía como UTC (en Bogotá, 14:00–18:00 abría de 09:00 a 13:00). Ahora las dos lecturas toman el desplazamiento de `copropiedades.zona_horaria` en el instante del reloj, sin migración y sin tocar dominio, motor ni cargador. La recurrente desde la app sigue fallando cerrada: su adaptador no escribe el patrón (**H-15J-01**, reportado) · _(anterior: **RONDA 15-I CERRADA · LA ETAPA 15 QUEDA BLOQUEADA SÓLO POR `BE-02`** · la 15-I ejecuta la sesión 2 del Bloque B como extensión **E-03** con las decisiones D1–D9 del cliente: acceso por código corto de la copropiedad, usuario y contraseña en app y consola; primer ingreso, alta del residente con su vivienda y ocupantes definitivos; vehículos propios con tope de 2 por vivienda en la base y de terceros por día y franja; punto de extensión de aprobación que falla cerrado; QR y «compartir» del consentimiento del visitante; cámara real del teléfono; listas negras desde la consola; y el **ensayo de los 16 escenarios por canal contra base real, en SIMULADO: 24 de 26 filas en verde, las otras 2 son procedimiento de sitio**. El ensayo destapó cuatro defectos que habrían hecho fallar escenarios en sitio (H-15I-07 a H-15I-10) y quedaron corregidos; H-15I-05 queda reportado con su parche. **Lo único que falta de la 15: registrar los tres equipos y ejecutar los 16 escenarios en sitio** · _(anterior: **RONDA 15-H CERRADA · LA ETAPA 15 SIGUE BLOQUEADA** · la 15-H ejecuta la sesión 1 del Bloque B como extensión **E-02**: el portero entra con usuario y NIT (correo sintético bajo `.invalid` que no sale de la API), el primer ingreso obliga a cambiar la contraseña en el SERVIDOR, el turno se impone en cada petición con el reloj inyectado, el patrullaje bloquea la sesión en la base, y el superadministrador tiene su panel con la bitácora append-only. Destapó **H-15H-01** (una cuenta podía editarse a sí misma por la REST; corregido en la 0037). Nada se ejecutó contra un aparato · _(anterior: **RONDA 15-E CERRADA · LA ETAPA 15 SIGUE BLOQUEADA** · la 15-E cierra lo que faltaba para PROBAR en sitio sin tocar el dominio: apertura, intercom y placas por los puertos del proveedor con el histórico en PostgreSQL (A1), verificación remota de la terminal de punta a punta (A2), CU-02 contra PostgreSQL con el enlace del VISITANTE y sincronización a todas las terminales (A3), llamada del videoportero con aviso emergente, escuchas por capacidad y audio persistente (A4), vista en vivo por WHEP a través de la API con go2rtc (A5, ADR-022), app móvil sin `localhost` por omisión (A6), umbrales técnicos fuera de la consola del superadmin (A7) y la hoja de resultados de los 16 escenarios en el guion de sitio (A8). **Nada se ejecutó contra un aparato**: todo está clasificado en el informe como documentado, simulado o probado contra mock; la hoja de resultados en sitio es lo que puede cerrar la 15 · _(anterior: **RONDA 15-D CERRADA · LA ETAPA 15 SIGUE BLOQUEADA** · la 15-D cierra D-25 (el motor decide con la base), elige el hardware por capacidades (ADR-019, con un fabricante inventado que pasa la suite de contrato y un control de CI), completa el CRUD de la consola con fotografía de visitante no biométrica (ADR-021), lleva terminal y videoportero al nivel de la cámara, saca la red del equipo del contrato (C-28) y repara el guion de sitio (D-132). Destapó **D-131**: ninguna autorización creada desde la consola existía contra base real desde la 09-B (ADR-020, S-38 por ratificar). Nada se ejecutó contra un aparato · _(anterior: **ETAPA 15-C CERRADA · LA ETAPA 15 PASA A BLOQUEADA** · la 15-C cierra todo lo que la 15 puede cerrar sin hardware: `HikvisionProvider` con los cuatro puertos, el **punto de composición que ADR-003 prometía y no existía** (ADR-018), y el puerto `PlateEventSource` —declarado desde la ETAPA 05 y con cero implementaciones— por sus dos transportes. La guía ISAPI integral obligó a cuatro correcciones en código ya fusionado, y **dos fallaban en la dirección segura**, que es la peor forma de fallar bien: el modo de control se leía con una grafía que el esquema no usa, así que una cámara BIEN configurada se rechazaba; y la confianza de una lectura del 1 % entraba como certeza total. **La 15 no se cierra y vuelve al vocabulario que le corresponde —BLOQUEADA, `BE-02`—**: sus tres hitos técnicos y nueve indicadores siguen sin ejecutarse contra un aparato, y eso no depende de escribir más código · _(anterior: **RONDA `consola-superadmin-equipos`** · alta de equipos desde la consola con la clave cifrada, seis correcciones de consola y dos hallazgos de seguridad)\_)_)_)_)_)_)_)_)_)_)_)_)_)\_

> **Regla añadida al DoD de toda etapa (usuario, 2026-09-08).** El cierre de una
> etapa actualiza **la cabecera y el mapa de etapas de este documento**, no solo
> su ficha de detalle. La cabecera se quedó congelada en el estado de la ETAPA 00
> durante seis etapas —decía «2 de 17 cerradas» con cuatro fichas más marcadas
> `CERRADA` unos párrafos más abajo— porque nadie la tenía asignada. Ahora está
> asignada: sin este apartado actualizado, la etapa no se cierra.

**Cómo se lee este documento.** Es la única fuente de verdad sobre qué está hecho. `CLAUDE.md` §2.1.2 lo hace vinculante: **una etapa no se ejecuta si la anterior no está cerrada aquí.**

**Estados posibles:** `CERRADA` · `EN CURSO` · `PENDIENTE` · `BLOQUEADA`

---

## Resumen

|                                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Etapas cerradas**            | **15 de 17** (ETAPAS 00 a 14) · **la ETAPA 15 sigue BLOQUEADA**: su DoD exige los tres hitos técnicos con equipo real y el entorno no alcanza ningún aparato · más las rondas `consola-superadmin-equipos`, **15-C** (2026-09-23), **15-D** (2026-09-24), **15-E** (2026-09-25), **15-H** (2026-09-26, Bloque B sesión 1, extensión E-02), **15-I** (2026-09-26, Bloque B sesión 2, extensión E-03) **15-K** (2026-09-26, hallazgos de la primera visita a sitio, extensión E-04; anexo de sitio el 2026-09-27) y **15-L** (2026-09-27, entrega final en sitio, extensión E-05) y **15-M** (2026-09-29, visita del 29/09, extensión E-06) y **15-N** (2026-09-30, video en vivo y guardia que se abre sola) y **15-O** (2026-09-30, un corte de PostgreSQL ya no tumba la API) , **15-P** (2026-10-01, guardia virtual: audio bidireccional y puertas del videoportero), **15-Q** (2026-10-02, Edge en sitio: contingencia real con los equipos, S-24 cerrado), **15-Q2** (2026-10-02, el Edge como puente) **15-U** (2026-10-03, dependencias: `pnpm audit --prod` = 0, AR-02 cerrado) y **15-R** (2026-10-03, huecos funcionales y decisiones del cliente: Web Push sin Firebase, puertas libre/bloqueada, flujo directo a la API, cuarentena del Edge, rotación de la bóveda) y **15-S1** (2026-10-04, víspera de sitio: el turno de audio por sesión, la víspera en el ensayo y la guía de mañana), que no son etapas: cierran lo que la 15 puede cerrar sin hardware o amplían el contrato                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Etapa siguiente habilitada** | **ETAPA 16 — Documentación técnica final y README**, ejecutable ya según §6 y de nuevo tras la 15. La 15 queda bloqueada **sólo por BE-02**: registrar los tres equipos desde la consola y ejecutar los 16 escenarios (26 filas escenario × canal) desde la consola y la app, con los tres hitos técnicos y los KPI de latencia                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Bloqueos activos**           | **BE-02 · la ETAPA 15 espera el equipo**: sin acceso físico a los aparatos no hay hitos técnicos ni KPI de latencia. La primera visita (26/09) no ejecutó los escenarios; la 15-K quita los bloqueos de software que lo impidieron · **BE-01 · SMTP y URLs de redirección** deja de bloquear: D9 descarta el SMTP y D4 pone el restablecimiento en manos de una persona (P-18 resuelto); el ciclo por correo sigue construido y sin verificar, y desde la 15-R **desactivado en producción** por decisión del cliente (AR-04 cerrada, no aceptada)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Defectos abiertos**          | **DT-15S1-03 cerrado** (las pruebas de la API se compilan en `pnpm typecheck`; H-15S1-C02 a C05, corregidos) · **DT-15S1-C02 a C04** (proveedores, dominio y Edge no compilan sus pruebas; una prueba de H-13-02 no distingue llaves; `biometria.e2e` entra en la lista privada del simulado) · **H-15S1-01 corregido en el ejemplo** · **H-15S1-02 corregido** · **DT-15S1-01, 02 y 04** (15-S1: la conversación toma la sesión al aceptarse el WebSocket y no al emitirse el billete; la consola rechaza `RECUPERACION_POR_CORREO` vacía; el paso 5 satura el runner de macOS y las pruebas con presupuesto de tiempo fijo caen de vez en cuando) · **H-15M-C01 y H-15M-C02 corregidos** · **DT-15M-C01** (corrección de la 15-M: once ficheros contra la base dependen del estado compartido de COP_A o de la historia de la base; uno falla siempre tras 20 corridas sin recrearla) · **DT-15M-C02** (`metricas.mjs` lee el informe de la corrida anterior si vitest no escribe uno nuevo) · **DT-15M-C03 y C04 CERRADAS en la 15-S1** (`audio-guardia-ws` «segundo operador» y `ejecutor-remoto` «el audio sube EN ORDEN») · **H-15R-C02 es el mismo defecto que H-15M-C01** (un solo identificador: H-15M-C01) · **DT-15R-09** y **H-15R-C01** cerrados · **DT-15R-C01 a C03**, (corrección 15-R) · **DT-15R-01 a 08** (15-R: sin desplegar —Netlify y Cloud Run, coturn, Web Push con navegadores reales—; la vuelta a normal con `close` por probar en sitio, S-15R-03; sin interfaz para crear una recurrente; aviso de arranque de la recuperación desactivada a propósito; AR-03 sin verificar contra el proyecto real; restablecer contraseñas sólo con pantalla para el superadministrador y el texto de acceso que remite al administrador; la franja de puertas sin el nombre del equipo y el tope sin pantalla; el identificador crudo del equipo en el aviso de acceso) · **DT-15Q2-01 sigue** (P-29 decidida en la 15-R, el TURN sin desplegar) · **DT-15U-01 y DT-15U-02** (15-U: el árbol de DESARROLLO sigue con 18 vulnerabilidades, 7 altas, de herramientas que no viajan a producción; NestJS 12 ya existe y la ronda se queda en la 11) · **DT-15Q2-01 a DT-15Q2-04** (15-Q2: el TURN sin alojar ni probar, P-29; `pnpm sitio:edge` no conoce el modo puente; el puente sin equipos reales ni Cloud Run; una sola instancia de API, P-30) · **DT-15Q-03 cerrado por la 15-Q2** · **DT-15Q-01, 02, 04 y 05** (15-Q: sin WAN el Edge no guarda los eventos de equipo que no son accesos; la nube en sitio con la base caída niega a la terminal en carrera con el Edge; la doble decisión no tiene prueba de extremo a extremo; el corte de WAN de §9 aún no se ha hecho con equipos de verdad; los ficheros generados del contrato crecen) · **DT-15P-01 a DT-15P-05** (15-P: el audio sin medir en sitio; tres ficheros cruzan las 300 líneas; sólo el videoportero descubre salidas; el historial enseña el nombre de HOY del punto; `soloSiLaDeclara` sólo lo respeta el guion de sitio) · **DT-15O-01 a DT-15O-03** (15-O: pedir al equipo sólo lo nuevo, P-24; `/ready` `agotado` es una foto del instante; dos ficheros crecieron por encima de 300 líneas) · **DT-15N-01 a DT-15N-05** (15-N: la carrera de `RegistrarAcceso.alertar`, en la ruta de la cámara y sin tocar; el aviso al residente no llega a la app, PENDIENTE DE DEFINICIÓN; el recorrido 12c con Chromium y video sintético no es viable aquí; tres ficheros más cruzan las 300 líneas; la credencial en la consulta a go2rtc, riesgo aceptado) · **DT-15M-01 a DT-15M-03** (15-M: ocho ficheros cruzan las 300 líneas; la cola del volcado histórico no se vacía antes de cerrar el pool; el 401 RTSP del videoportero no se reprodujo en simulación y el ensayo anota el esquema) · **DT-15M-04 a 06 CERRADOS en la 15-N** (O2, O3, O1) · **DT-15L-01, DT-15L-03 a DT-15L-10** (de la corrección 2: **H-15L-C02 CORREGIDO**, un falso verde de `equipos-entre-copropiedades` que dependía de un equipo creado por otra suite y que el guardián del ítem 10 destapó; **DT-15L-09**, dos métodos del dominio sin llamador tras retirar la confirmación presencial —decisión del usuario—, y **DT-15L-10**, `ficha.ts` y `escucha-alertstream.ts` siguen por encima de 300 líneas) · (15-L: la persona queda en la terminal tras retirar su rostro; tres ficheros cruzaron las 300 líneas; rutas sólo-placa sin pantalla; los rechazos de la API aún citan reglas, la consola los limpia; y de la corrección: la bandeja de la app conserva lo pendiente de una cuenta que cerró sesión, reintenta lo agotado, y el diagnóstico del paso 5c confunde un fallo de código con uno de permisos) · **DT-15L-02 CERRADO y H-15L-C01 CORREGIDO en la corrección de la 15-L** · los adaptadores en memoria del Bloque 0.3 que siguen (`REGISTRO_DE_BLOQUEOS`, `OPERACIONES_DE_DISPOSITIVO`, `REPOSITORIO_CODIGOS_MFA`, `NOTIFICADOR_PUSH`) · **H-15K-01** (cambiar de copropiedad y crear en el acto puede escribir en la anterior; reportado) · **DT-15K-02** (S-62: ocho repositorios con claims `{}` que dependen de un rol que omite la RLS) · **H-15J-01** (el adaptador del residente crea la recurrente sin escribir sus filas de patrón; la app sigue fallando cerrada, H-15I-06; no afecta a los 16 escenarios) · **H-15I-05 CERRADO en la 15-J** · **D-140** (bloqueos de acceso en memoria, 15-E) · **D-137** (actor de ingesta: corregido con la 0035, S-44) · **D-139** (alertas, órdenes y auditoría en memoria: corregido con la 0036) · **D-138** (`guardia.controller.ts` supera las 300 líneas de §2.3 desde la A4; el video fue a un controlador aparte, la partición del resto queda para la 16) · **D-101** (roja intermitente de `@ncr/api`: no reapareció en la 15-K —la roja sin nombre de su segunda corrida eran dos pruebas de la ronda, ya aisladas— y el paso 5 ya nombra cualquier roja; NO cerrada), **D-133** (control contra claves ajenas a tablas append-only, 15-D) y **D-29** (canal de tiempo real por proceso) · **D-25, D-130, D-131 y D-132 CERRADOS en la 15-D** · **D-78 y D-34 CERRADAS en la 14** · más **H-13-25**, abierto a propósito a la espera de firma |
| **Contradicciones abiertas**   | **0** (**47** registradas, recontadas por sección en la 15-R; todas resueltas) · **C-53 a C-56** de la 15-R, resueltas (Push sin Firebase frente a §2.6; R1 frente a E3 y E7, que corregían pruebas que afirmaban el defecto; la rotación con recifrado frente a H-15B-1) · **C-37 resuelta en la 15-R** por la decisión P-20 · **C-51** y **C-52** de la 15-Q2, resueltas; **C-51 cerrada** en la 15-U · **C-50** de la 15-Q · **C-47 a C-49** de la 15-P · detalle en `auditoria/contradicciones-y-supuestos.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Decisiones pendientes**      | Abiertas, sin bloquear: **P-19**, **P-24**, **P-28**, **P-32** (nueva en la 15-R: a quién llega el respaldo de una alerta sin operador; hoy a nadie) y las de valor conservador vigente de la §3 del registro · **Resueltas en la 15-R:** **P-20** (cierra C-37), **P-23** (ADR-036), **P-25**, **P-29** (coturn, sin desplegar), **P-30** (una instancia) y **P-31** (cuarentena, E6); **P-26 fuera de alcance** · antes: **P-27 = A** (ADR-035), **P-22** (15-N), **P-21** sin objeto, P-08, P-09 y P-15 a P-18 (15-I), P-02 (15-B) · más las **aceptaciones de riesgo** de `seguridad/ACEPTACIONES_DE_RIESGO.md`: **AR-01, AR-05 y H-15B-1 por firmar**, **AR-03 por verificar** contra el proyecto; AR-02 y AR-04 cerradas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Supuestos vigentes**         | 160 (161 registrados, S-184 retirado; recontados por fila en la 15-R) — **S-15R-01 y S-15R-03 a S-15R-08** añadidos en la 15-R (vida del aviso push, `close` devuelve a normal, tope de 12 h, misma IP hacia Netlify y Cloud Run, proxy de Cloud Run, el transporte no cuenta para la cuarentena, STUN basta al Edge; S-15R-02 no se usó) · **S-193 a S-196** añadidos en la 15-U (qué no crece, las versiones elegidas, el parser `extended`, una referencia por módulo dinámico) · **S-185 a S-192** añadidos en la 15-Q2 (gracia de 30 s de la alerta, «Edge activo» = marcado como puente, `edge:<equipo>` sólo para su host, fuente `.invalid` del video, orden tardía de la nube, excepción de los adaptadores de puerto, TURN efímero de 10 min, plazo de 2,5 s); **S-184** retirado · **S-181 a S-184** añadidos en la 15-Q (incremental condicional por versión, v1 sellada por la nube, 30 días de vencidas en la instantánea, dos clientes por equipo) · **S-174 a S-180** añadidos en la 15-P (canal 101 por omisión, ruta del H.264, canal deshabilitado en el simulado, tramo de 60 s, ruta de submódulos, cerradura N = puerta N, medición acústica en sitio) · **S-170 a S-173** añadidos en la 15-O (clientes del pooler, reintento de pg-boss, volcado por lotes, ventana de aviso de `/ready`) · **S-161 a S-169** añadidos en la 15-N (fin de la llamada, audio que no se abre solo, roles del aviso, reloj ilegible, causa del 401 RTSP, 5/51, reenvío sin planificador, nombres secretos, aviso sin equipo) · **S-107 a S-160** añadidos en la 15-M, con huecos de numeración entre bloques (Digest y bloqueo declarado, video, rostros por capacidad, estado y alertas, consola y fechas, residente en la web, arranque, cierre y respaldo) · **S-96 a S-106** añadidos en la corrección 2 de la 15-L (caché de 30 s, EXIF, foto previa, frase en la app, bucle local, rutas del videoportero Ultra, códigos de rechazo, simulador de F4, «equipo real», lo que se guarda, alcance del control) · **S-90 a S-95** añadidos en la corrección de la 15-L (mDNS en el punto de acceso, reinstalar gana a lo guardado, «vista» en el teléfono, tope de la bandeja, cadencia de recarga, ventana de notificaciones) · **S-66 a S-89** añadidos en la 15-L (firmware de la verificación remota, credencial rechazada, porteros, y el flujo de visitantes S-78 a S-89) · **S-63 a S-65** añadidos en el anexo de la 15-K (estado de `badXmlContent` y vida del nonce en el simulado; audio sin cuerpo en el videoportero) · **S-62** añadido en la 15-K (la API se conecta con un rol que omite la RLS; el único no conservador del registro) · **S-52 a S-61** añadidos en la 15-I · **S-48 a S-51** añadidos en la 15-H (llave del código de patrullaje, quinto intento, cifras de los límites, temporal escrita) · **S-39 a S-47** añadidos en la 15-E (actor de ingesta propio, enlace del titular, forma de la URL RTSP S-46 y API de go2rtc S-47, por confirmar en sitio); S-38 sigue pendiente de ratificar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **Extensiones al contrato**    | 6 — **E-06 · D-12, el residente en la consola web**, aprobada el 2026-09-29 (15-M) · **E-05 · consentimiento declarado por quien registra (F4)**, aprobada el 2026-09-27 (ADR-032) · E-01 `FUERA_DE_HORARIO`, aprobada · **E-02 · Bloque B sesión 1 (identidad por usuario y portería)**, aprobada el 2026-09-25 · **E-03 · Bloque B sesión 2 (residentes y app, D1–D9)**, aprobada el 2026-09-26 · **E-04 · decisiones de sitio D-10 y D-11**, aprobada el 2026-09-26                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

---

## Corrección `correccion-macos` — entre la 12 y la 13 · **CERRADA**

**Rama:** `correccion-macos` · **PR:** [#22](https://github.com/4rg3n15/NextResidential/pull/22)
— **FUSIONADO en develop el 2026-09-22** (`153df52`, fusión con dos padres, sin
squash) · **No es una etapa:** no añade producto. Corrige el verificador y el CI.

> **Corregido el 2026-09-22.** Esta ficha y la cabecera describían la rama como
> «en curso» y el PR como abierto con la fusión ya hecha. El control del paso 1b
> no lo veía porque solo comparaba el documento consigo mismo; desde la ETAPA 13
> pregunta a **git**: una rama descrita como «en curso» cuya punta ya es ancestro
> de HEAD está fusionada, y eso es un fallo.

> **Procedencia, escrita como es y no como convenía.** La rama se sacó de la
> punta de `etapa-12-edge-gateway-offline` cuando su PR #21 **seguía abierto**,
> porque `develop` no contenía todavía la ETAPA 12 y el trabajo habría partido
> de un árbol sin el código que hay que corregir. Era equivalente **en
> contenido** a lo que `develop` iba a ser, y eso no autoriza a llamarlo
> `develop` — es el mismo defecto que se corrigió en la ETAPA 12 aplicado a la
> documentación. Fusionado el #21, `develop` se trajo aquí **por fusión**, y
> ahora la procedencia es literal.

### El hallazgo que la motiva, dicho sin suavizar

**El CI no ejecutaba `verificar-etapa.sh`.** Ni con `--con-base` ni sin él, ni en
Linux ni en macOS. El flujo corría nueve controles escogidos a mano; el
verificador tiene **25 pasos**. Consecuencias, todas comprobadas:

- Los pasos **12, 12b, 12c y 13** —esquema, aislamiento, arranque en frío,
  KPI-03 e inmutabilidad contra PostgreSQL real— **no se habían ejecutado nunca
  en ninguna máquina salvo la del usuario.**
- Tampoco los pasos 5b a 5d (Flutter), 11 (latencia), 14 (estabilidad) ni 15.
- Y el «25 de 25 pasos» que aparece en **todos** los informes anteriores salía
  siempre de una sola máquina. Cuando esos informes decían «CI verde en las dos
  plataformas», era cierto de los nueve controles y no del veredicto.

Ahora hay un trabajo `verificador-con-base` en `macos-latest` que instala
Flutter, Chromium y PostgreSQL, siembra la base y ejecuta el verificador entero.

### Lo que encontró la primera corrida

| ID        | Qué                                                                                                                                                                                                                                                                                                                                                     | Estado                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **D-102** | El bloque «QUEDARON FUERA de la medición» interpolaba el objeto de fallo: imprimía **`[object Object]`**. Y llamaba «la corrida no terminó» a una suite en rojo — la confusión que D-100 había cerrado diez líneas más arriba                                                                                                                           | **Corregido** · sonda 22 ampliada                                        |
| **D-103** | El paso 12 comparaba como TEXTO un número de `wc`, que **BSD almohadilla y GNU no**. En macOS fallaba con el KPI-03 cumplido delante: una inserción aceptada, cero duplicados, e incumplimiento informado                                                                                                                                               | **Corregido** · sonda 23                                                 |
| **D-104** | El diagnóstico del paso 13 filtraba por `×` y `→`. Si el proceso moría antes de una aserción no casaba ninguno, y el paso imprimía la etiqueta y **nada más**                                                                                                                                                                                           | **Corregido**                                                            |
| **D-105** | D-100 hizo que el control imprimiera el nombre de cada prueba roja; **el filtro del paso 7 lo tiraba**. macOS informó «5 prueba(s) fallaron» y ni una línea más, con los nombres a tres líneas de distancia                                                                                                                                             | **Corregido**                                                            |
| **D-106** | El paso 5 falló en macOS imprimiendo **cero líneas**: ni código, ni bytes, ni cola                                                                                                                                                                                                                                                                      | **Corregido** · y su instrumentación halló D-108 en la corrida siguiente |
| **D-107** | El control de la base preguntaba `select version()` y daba por buena una base **vacía**. Cuatro minutos después aparecían cinco rojas de `residente-pg.test.ts` sin relación aparente. En las máquinas de desarrollo era invisible: sus clústeres llevan esquema y semillas puestos de antes                                                            | **Corregido** · prueba negativa en el propio trabajo de macOS            |
| **D-108** | Los colores de Vitest **parten `Tests` de su número**, y el recuento del paso 5 no casaba. Con colores, la rama que detecta pruebas en rojo tampoco casa: la única defensa que quedaba era el código de salida                                                                                                                                          | **Corregido** · sonda 24                                                 |
| **D-112** | `turbo.json` no declaraba las variables de las que dependen las pruebas. Turborepo 2.x filtra el entorno, así que `DATABASE_URL_PRUEBAS` no llegaba a vitest y cinco pruebas se saltaban **en silencio** bajo `pnpm test` mientras el paso 7 las ejecutaba. Los dos pasos verdes, discrepando                                                           | **Corregido** · paso 7b, sonda 25                                        |
| **D-113** | El control de D-112 raspaba las líneas `@ncr/api:test: …` de turbo. En el CI de macOS turbo **no escribe ese prefijo**: agrupa la salida y la deja desnuda. El control falló por su propio formato, no por el defecto que vigila — y `metricas.mjs` existe precisamente para no raspar consola                                                          | **Corregido** · lee el JSON de vitest                                    |
| **D-114** | El paso 5 decía «5 saltadas» y no decía CUÁLES. Tres corridas del runner se fueron en deducirlo, con el nombre esperando dentro del informe JSON que ese mismo paso acababa de escribir                                                                                                                                                                 | **Corregido** · `--saltadas`                                             |
| **D-115** | **El `dist/` viejo de la ETAPA 04, con otro nombre.** `.arranque-en-frio.json` lo escribe el paso 12b, está en `.gitignore`, y `arranque-en-frio.e2e.test.ts` se salta entero si no está. El resultado del paso 5 dependía de **si alguien había corrido el verificador antes en esa carpeta**: aquí daba 658 sin saltadas, en un runner limpio 653 y 5 | **Corregido** · el paso 0 lo borra                                       |

### D-112 · dos veredictos sobre lo mismo, los dos verdes, discrepando

La corrida del usuario **con la base ya correcta** destapó lo que ninguna de las
anteriores podía ver:

| Camino                                      | `@ncr/api`                      |
| ------------------------------------------- | ------------------------------- |
| Paso 5 · `pnpm test`, es decir **turbo**    | `653 passed \| 5 skipped (658)` |
| Paso 7 · `metricas.mjs`, **vitest directo** | `658 passed (658)`              |

Las cinco son las de `residente-pg.test.ts`, que con la base buena **pasan**.
Bajo turbo no llegaban a correr porque `turbo.json` no declaraba
`DATABASE_URL_PRUEBAS`: **Turborepo 2.x filtra el entorno**, la variable no
alcanzaba a vitest, y `it.runIf(URL_BASE !== undefined)` las saltaba en
silencio. Comprobado por ejecución, y con la prueba más limpia que hay: **el
hash de la tarea era idéntico con y sin la variable** —`0aee107cd4e37f5c`—, y
tras declararla difiere (`c490ac73…` frente a `8ab752ab…`).

Los dos pasos daban verde. Los dos mentían a medias. Y el verificador tenía las
dos cifras delante **sin compararlas nunca** — la misma familia que «`@ncr/api`
quedó FUERA de la medición»: el dato estaba, faltaba quien lo mirase. De ahí el
paso **7b** y el control `recuentos-coherentes.mjs`, que exige que los dos
caminos digan lo mismo —ejecutadas, saltadas y rojas— y enseña las dos cifras
cuando no.

Y una segunda mitad, porque la primera sola no basta: **una prueba saltada no
suma al verde del paso 5.** Hasta aquí ese paso solo miraba `Tests N failed`, y
una prueba que no llega a ejecutarse no falla —se descuenta del total y el
resumen sigue diciendo «passed»—. Con `--con-base` una saltada es ahora un
FALLO sin matices: la base está ahí, nada debería saltarse. Sin `--con-base` se
cuentan y se nombran, en lugar de callarlas.

### Las cinco saltadas de macOS: la hipótesis correcta, y la que no lo era

La declaración de `turbo.json` es la causa del defecto que el usuario reprodujo,
y está demostrada: con la variable declarada la suite da 658, sin ella 653 y 5
saltadas, y **el hash de la tarea difiere**. Eso está cerrado.

Lo que **no** era D-112 son las cinco saltadas que siguieron apareciendo en el
CI de macOS. El diagnóstico lo descartó por ejecución —turbo resolvía la
variable con valor: `configured: ["DATABASE_URL_PRUEBAS=7739001…"]`— y al
nombrarlas resultaron ser otras:

```
@ncr/api: 5 saltada(s)
  ⤷ el superadministrador recién aprovisionado PUEDE entrar …
     en apps/api/test/arranque-en-frio.e2e.test.ts
```

Se saltan porque **el paso 5 corre antes que el 12b**, que es quien escribe los
claims que necesitan. No es una omisión: es una dependencia de orden, y el paso
12b las ejecuta y exige explícitamente que no se salten. Quedan **declaradas**,
con el paso que las ejerce escrito al lado; cualquier otra saltada sigue siendo
un fallo, que es lo que hace útil a la regla.

Y por el camino apareció **D-115**, que es el hallazgo incómodo de esta parte:
ese fichero de claims está en `.gitignore`, así que **el resultado del paso 5
dependía de si alguien había corrido el verificador antes en esa carpeta**. Aquí
existía de una corrida previa y el paso daba «658, sin una sola saltada»; en un
runner recién creado daba «653 | 5 skipped». El verde local era falso, y lo era
por el mismo mecanismo que motivó este guion en la ETAPA 04: un artefacto que
envejece y que nadie declara. El paso 0 lo borra ahora.

### Lo que esto significa para las cifras de cobertura anteriores

**Hay que decirlo sin suavizarlo, y entra como insumo de la ETAPA 13.**

| Capa         | Antes de esta rama | Ahora            |
| ------------ | ------------------ | ---------------- |
| `aplicacion` | **5 archivos**     | **39 archivos**  |
| global       | **156 archivos**   | **306 archivos** |

Los «✓ las tres capas cumplen su umbral» de los informes anteriores **se
calcularon sobre una fracción del árbol**. El umbral del 90 % de §2.4 se
verificaba contra cinco archivos de capa de aplicación cuando hay treinta y
nueve, y el 70 % global contra ciento cincuenta y seis cuando hay trescientos
seis. Las cifras nuevas siguen cumpliendo —`aplicacion` 96,92 %, global
75,70 %—, así que la conclusión no cambia; **lo que cambia es que antes no
estaba demostrada**. Un umbral medido sobre una muestra que nadie eligió no es
una garantía.

La ETAPA 13 lo recibe como insumo: la auditoría de seguridad se apoya en
cobertura, y la cobertura que tenía delante hasta ahora no cubría lo que decía.

### La lección, que es una sola y aparece tres veces

**D-102, D-105 y D-108 son el mismo defecto: el arreglo se aplicó al sitio y no
a la clase.**

- D-102 · se arregló el mensaje de D-100 y sobrevivió intacto el de al lado.
- D-105 · se arregló que el control lo dijera, no que alguien lo escuchara.
- D-108 · **ya estaba descubierto y documentado** en la cabecera de
  `estabilidad.mjs` —«los códigos de color de Vitest partían `Tests` de su
  número»— y se corrigió solo allí. El paso 5 lo conservó intacto.

De ahí que el patrón ANSI viva ahora en `scripts/lib/sin-colores.mjs`, uno solo
para las tres superficies, y que la regla nueva del paso 8 mire el **fichero
entero** y no la línea: el defecto de D-103 vivía en dos líneas que, por
separado, son las dos portables.

### Lo que queda abierto

**El paso 13 en la máquina del usuario.** Se probó la hipótesis de que su fallo
fuera consecuencia del paso 12 —si la suite SQL aborta, la base queda a medias—
y **el experimento la refutó**: con el paso 12 abortado a propósito, las seis
pruebas del paso 13 pasan. El paso 13 está verde en `macos-latest`, así que lo
que el usuario vio es específico de su máquina. Con D-104 corregido, la próxima
corrida suya lo nombrará.

---

## Mapa de etapas

| Etapa  | Nombre                                                        | Rama                                   | Depende de                          | Estado                          | Informe                        |
| ------ | ------------------------------------------------------------- | -------------------------------------- | ----------------------------------- | ------------------------------- | ------------------------------ |
| **00** | Auditoría documental y plan maestro                           | `etapa00` ⚠️                           | —                                   | **CERRADA**                     | [ETAPA-00](etapas/ETAPA-00.md) |
| 01     | Modelo de datos y Supabase + guía de conexión                 | `etapa-01-modelo-datos-supabase`       | 00 ✅                               | **CERRADA**                     | [ETAPA-01](etapas/ETAPA-01.md) |
| 02     | Andamiaje del monorepo y núcleo hexagonal                     | `etapa-02-andamiaje-monorepo`          | 01 ✅                               | **CERRADA**                     | [ETAPA-02](etapas/ETAPA-02.md) |
| 03     | Auth, RBAC, MFA y aislamiento multiempresa                    | `etapa-03-auth-rbac-multiempresa`      | 02 ✅                               | **CERRADA**                     | [ETAPA-03](etapas/ETAPA-03.md) |
| 04     | Padrón: viviendas, residentes, vehículos                      | `etapa-04-padron`                      | 03 ✅                               | **CERRADA**                     | [ETAPA-04](etapas/ETAPA-04.md) |
| 05     | Autorizaciones y motor de reglas + MockProvider               | `etapa-05-autorizaciones-motor-reglas` | 04 ✅                               | **CERRADA**                     | [ETAPA-05](etapas/ETAPA-05.md) |
| 06     | Eventos, auditoría inmutable, alertas, tiempo real            | `etapa-06-eventos-auditoria`           | 05 ✅                               | **CERRADA**                     | [ETAPA-06](etapas/ETAPA-06.md) |
| 07     | Zonas comunes: horario y aforo                                | `etapa-07-zonas-comunes`               | 06 ✅                               | **CERRADA**                     | [ETAPA-07](etapas/ETAPA-07.md) |
| 08     | Biometría: consentimiento, calidad, sincronización, supresión | `etapa-08-biometria-consentimiento`    | 06 ✅                               | **CERRADA**                     | [ETAPA-08](etapas/ETAPA-08.md) |
| 09     | Consola web de administración                                 | `etapa-09-consola-administracion`      | 07 ✅, 08 ✅                        | **CERRADA**                     | [ETAPA-09](etapas/ETAPA-09.md) |
| 10     | Consolas de portería y guardia virtual                        | `etapa-10-consolas-operativas`         | 09 ✅                               | **CERRADA**                     | [ETAPA-10](etapas/ETAPA-10.md) |
| 11     | App móvil Flutter del residente                               | `etapa-11-app-flutter-residente`       | 09 ✅                               | **CERRADA** — 11-A, 11-B y 11-C | [ETAPA-11](etapas/ETAPA-11.md) |
| 12     | Edge Gateway: offline y reconciliación                        | `etapa-12-edge-gateway-offline`        | 06 ✅                               | **CERRADA**                     | [ETAPA-12](etapas/ETAPA-12.md) |
| 13     | Auditoría de ciberseguridad y endurecimiento                  | `etapa-13-auditoria-seguridad`         | 12 ✅                               | **CERRADA**                     | [ETAPA-13](etapas/ETAPA-13.md) |
| 14     | Observabilidad, CI/CD, PWA instalable y escritorio            | `etapa-14-cicd-pwa-escritorio`         | 13 ✅                               | **CERRADA**                     | [ETAPA-14](etapas/ETAPA-14.md) |
| 15     | Integración real con hardware Hikvision                       | `etapa-15-integracion-hikvision`       | 14 ✅                               | **BLOQUEADA** · sólo BE-02      | [ETAPA-15](etapas/ETAPA-15.md) |
| 16     | Documentación técnica final y README                          | `etapa-16-documentacion-final`         | 14 ✅ (ejecutable), 15 (definitiva) | **PENDIENTE — habilitada**      | —                              |

> ⚠️ **Desviación de nomenclatura registrada.** `CLAUDE.md` §2.5 exige ramas `etapa-NN-slug`; la ETAPA 00 se ejecutó en **`etapa00`** por indicación expresa del usuario. A partir de la ETAPA 01 se retomó la convención del contrato.
>
> **Regla de ramificación fijada por el usuario el 2026-09-06, vinculante en adelante:** > **cada rama de etapa se saca de `develop` actualizado, nunca de la rama de la etapa anterior.**
> La rama de la ETAPA 01 se creó antes de esta instrucción, desde `etapa00`, y se
> corrigió fusionando `develop` en ella (merge `61e8efd`, sin reescribir historia).
> Procedimiento para la ETAPA 02 en adelante:
>
> ```
> git fetch origin && git checkout develop && git pull --ff-only
> git checkout -b etapa-NN-slug
> ```

**Precondición de la ETAPA 15** (`CLAUDE.md` §6): su **mitad física** se ejecuta **solo** cuando el usuario tenga acceso al equipo. La mitad de código se cerró el 2026-09-22 contra simulado, sin tocar ningún aparato, y el guion `scripts/puesta-en-marcha-equipos.mjs` es lo que la cierra del todo delante del hardware.

---

## ETAPA 09 — Consola web de administración · **CERRADA** (09-A y 09-B)

**Rama:** `etapa-09-consola-administracion` · **Cierre de 09-A:** 2026-09-09 · **Informe:** [`etapas/ETAPA-09.md`](etapas/ETAPA-09.md)

La etapa se ejecuta en dos partes por indicación del usuario. **09-A está cerrada y verificada**; 09-B queda pendiente.

### Entregables de 09-A

| Entregable                                              | Ruta                                            | Estado |
| ------------------------------------------------------- | ----------------------------------------------- | ------ |
| Preset Tailwind compartido y verificación de contraste  | `packages/config/src/`                          | ✅     |
| Sistema de componentes sobre el catálogo del mockup     | `apps/web/src/componentes/`                     | ✅     |
| Marco, barra lateral y cabecera con visibilidad por rol | `apps/web/src/componentes/`, `app/(consola)/`   | ✅     |
| Acceso multi-rol con segundo factor (W-01)              | `apps/web/src/app/acceso/`                      | ✅     |
| Dashboard operativo (W-02)                              | `apps/web/src/app/(consola)/tablero/`           | ✅     |
| Base de PWA: manifiesto, iconos y service worker        | `apps/web/public/`                              | ✅     |
| Endpoints del tablero en la API                         | `apps/api/src/tablero/`                         | ✅     |
| Tipos de respuesta en OpenAPI y sus controles           | `apps/api/src/**/respuestas.ts`, `scripts/lib/` | ✅     |
| Cliente generado desde el contrato                      | `packages/contracts/src/generado/`              | ✅     |
| ADR-006 (datos y estado) y ADR-007 (cliente generado)   | `docs/decisiones/`                              | ✅     |

### Pendiente en 09-B

Viviendas, vehículos, visitantes y autorizaciones, zonas comunes, dispositivos y sincronización, eventos y alertas, informes y auditoría, y el buscador global de la cabecera —hoy deshabilitado con su motivo—.

### Verificación

`./scripts/verificar-etapa.sh` → **correcta**, desde artefactos limpios. 850 pruebas en 69 ficheros, 69 de 69 recogidos. Cobertura: dominio 98,66 % · aplicación 98,28 % · global 74,48 %. KPI-25: 200 de 200 alertas, p99 de 7 ms.

La primera ejecución salió **FALLIDA** y sus tres hallazgos eran reales: `comun` convertido en módulo por una carpeta con nombre de capa, datos de prueba con forma de topología real (KPI-11), y un doble de `EventSource` que no compilaba. Los tres corregidos.

### Segunda ronda (2026-09-09), tras la revisión del cliente

| Asunto                                                                                                                                          | Estado                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| CI en rojo: la sonda 10 dependía de `apps/api/dist`, que no existe en un checkout limpio                                                        | **Resuelto** · la sonda compila lo que necesita                                                             |
| Revisión de las otras nueve: sondas 3 y 6 sin mitad positiva; `metricas.mjs` no fallaba ante el descuadre; cuatro controles nunca corrían en CI | **Resuelto** · las tres correcciones comprobadas por mutación                                               |
| Contraste `#DC3341`                                                                                                                             | **Aprobado** · cifras de `03-mockups.md` §5.6 corregidas con las medidas reales                             |
| **D-39** · `/auth/mfa/*` inalcanzable                                                                                                           | **Resuelto** · retirado ([ADR-008](decisiones/ADR-008-supabase-auth-como-mecanismo-autoritativo-de-mfa.md)) |
| **D-42** · el Auth Hook de _custom claims_ no existía; sin él nadie puede entrar a la consola                                                   | **Resuelto** · migración `0024`                                                                             |
| Recuperación de contraseña, con respuesta uniforme y doble limitador                                                                            | **Construida** · [guía](guias/RECUPERACION_Y_USUARIOS.md)                                                   |
| Aprovisionamiento del primer superadministrador y de los demás roles                                                                            | **Documentado** · `scripts/aprovisionar-rol.mjs` + guía                                                     |

**P-14 · redefinido y CERRADO.** Se declaró como «no hay pantalla de inscripción de TOTP en la consola» y se resolvió con «hoy el titular la inscribe desde el panel de Supabase». **Esa salida no existía**: el panel solo ofrece _Remove MFA factors_ para los usuarios de la aplicación, y `Account → Security` es la cuenta de Supabase del operador, no la del usuario. El pendiente no describía una comodidad ausente sino un sistema inaccesible: ningún rol administrativo podía llegar a `aal2` y la API le respondía 401 en todo. La pantalla existe desde esta ronda y opera **solo sobre la propia sesión** — la petición de alta no lleva identificador de usuario y el servidor lo toma de la cookie `httpOnly`.

### Tercera y cuarta ronda (2026-09-09)

| Asunto                                                                                                | Estado                                                                                       |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **D-43** · el arranque en frío no podía escribir: `creado_por` es `NOT NULL` y no había quién firmara | **Resuelto** · migración `0025`, actor de sistema explícito y trazable; nada se relajó       |
| **D-44** · el `CHECK` del NIT rechazaba el formato colombiano `900123456-7`                           | **Resuelto** · migración `0026`, normalización en la base y validación previa en los guiones |
| **D-45** · nadie podía inscribir el segundo factor: el panel no lo ofrece (P-14)                      | **Resuelto** · pantalla de inscripción + códigos de recuperación de un solo uso              |
| Arranque en frío verificable de punta a punta, hasta «alguien puede entrar»                           | **Construido** · `supabase/arranque-en-frio.sh` + suite `arranque-en-frio.e2e`, sonda 11     |
| **D-46** · `503` intermitente al inscribir el factor; la pantalla se quedaba con el error             | **Resuelto** · una inscripción por titular a la vez; el éxito limpia el error                |
| **D-47** · `apps/web` no validaba su configuración al arrancar                                        | **Resuelto** · Zod + `instrumentation.ts`, salida con código 78 (`EX_CONFIG`)                |
| **D-48** · ciclo cerrado del segundo factor (`insufficient_aal`)                                      | **Resuelto** · los factores se leen del usuario; GoTrue no expone `GET /factors`             |
| **D-49** · el QR no se pintaba (SVG en crudo en un `<img src>`)                                       | **Resuelto** · normalizado a `data:image/svg+xml;base64`                                     |
| **D-50** · **la API no arrancaba en producción** y 363 pruebas no lo veían                            | **Resuelto** · el puerto de auditoría pasa al núcleo                                         |
| El camino completo, recorrido en navegador                                                            | **Construido** · `e2e/camino-de-acceso.mjs`, paso 12c del verificador                        |

### Sexta ronda (2026-09-10) — cuatro fallos del propio verificador

La abrió el verificador en macOS, no el producto. Los cuatro comparten raíz: **un control que concluye sobre un estado que no es el actual**.

| Asunto                                                                                                      | Estado                                                                                     |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **D-54** · contraseña literal en `e2e/doble-gotrue.mjs`. No es una credencial viva; §2.5 no distingue       | **Resuelto** · se sortea en cada corrida. Nada que rotar; el historial empujado no se toca |
| **D-51** · «contrato desfasado» que no había cambiado: 35 rutas idénticas en otro orden, por D-50           | **Resuelto** · el documento se emite en orden canónico; regenerado y confirmado            |
| **D-52** · dos sondas del paso 9: el mensaje «dejó rastro» era un diagnóstico falso del hallazgo D-54       | **Resuelto** · línea base antes de mutar; el banco refleja el árbol de trabajo completo    |
| **D-53** · el paso **12c** no fallaba ni se omitía: **no salía**, encerrado en el bloque `--con-base`       | **Resuelto** · 12c fuera del bloque, Chromium portable y **paso 15** que cuenta los pasos  |
| **D-55** · `arranque-en-frio.sh` no declaraba su conexión y solo funcionaba con las variables ya exportadas | **Resuelto** · fija y exporta los mismos valores por defecto que `verificar.sh`            |

Pruebas negativas: **13** (dos nuevas, sondas 12 y 13).

### Séptima ronda (2026-09-10) — el segundo factor, y el interruptor que pidió el cliente

| Asunto                                                                                                                                | Estado                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **D-56** · el código de seis dígitos correcto devolvía al login **sin decir por qué**: la API rechazaba el token y la consola callaba | **Resuelto** · se registran el estado y los NOMBRES de los claims del token (nunca sus valores)                  |
| **D-57** · `MFA_OBLIGATORIO`, interruptor temporal del segundo factor, a petición del cliente                                         | **RETIRADO** el 2026-09-10 · variable, ramas del guard, mensajes y `.env.example`; tres controles anti-regresión |
| Que no salga el QR y pidan el código: **no es un defecto**                                                                            | Esa cuenta ya tiene un factor verificado; se retira en el panel (Remove MFA factors)                             |

El interruptor se prueba en **las dos posiciones** —que encendido siga exigiendo el segundo factor es lo que nadie comprueba— y se recorre en el navegador: paso 5 del camino de acceso, con otra API y otra consola levantadas con la variable puesta.

### ETAPA 09-B (2026-09-10) — las siete pantallas restantes

| Entregable                                                                                              | Estado                                                                                           |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Viviendas · Vehículos · Visitantes · Zonas · Dispositivos · Eventos · Informes                          | **Construidas**, sobre el sistema de diseño de 09-A                                              |
| Backend que no existía: listar y escribir padrón, persistir autorizaciones, órdenes de equipo, informes | **Construido** · las lecturas bajo `copropiedades/:id` entran solas en el barrido de aislamiento |
| Carga de padrón XLSX (D-20t)                                                                            | **Construida** · lector propio, tipo real por firma, límites acotados, todo o nada               |
| Control de contrato de 09-A                                                                             | **Sin exenciones de esta etapa** · 41 de 49 operaciones tipadas y el CUERPO también (D-59)       |
| Menores y representante legal (D-42)                                                                    | **NO construido**, y dicho: no existe en el esquema; decisión de Grupo Control                   |

Migración nueva: **`0027`** (tipo de vehículo). Hay que aplicarla.

### Ronda de auditoría y corrección · 2026-09-10

Nueve etapas cerradas, 19 pasos de verificación, más de mil pruebas en verde — y **nadie podía entrar al sistema**. Esto es lo que había.

| Id        | Defecto                                                                                                                                                                                                                                                                                                                                                                                                                   | Estado                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **D-60**  | **La URL del JWKS no existía.** `/auth/v1/jwks` devuelve `404 page not found`; la ruta real es `/auth/v1/.well-known/jwks.json`. La API se quedaba sin ninguna clave y rechazaba **todos** los tokens. Verificado contra la documentación oficial de Supabase. **Sobrevivió a nueve etapas porque el doble de `e2e/doble-gotrue.mjs` servía el JWKS en la ruta equivocada**: el doble se construyó con la forma del error | **Corregido**                                                                                                           |
| **D-60b** | **Un JWKS que responde no es un JWKS que sirve.** Un proyecto sin llaves asimétricas devuelve `200 {"keys":[]}`; la sonda lo daba por bueno y ningún token podía verificarse                                                                                                                                                                                                                                              | **Corregido** · la sonda exige al menos una clave                                                                       |
| **D-61**  | **El `.env` sin salto de línea final.** `INGESTA_FIRMA_SECRETO` se quedó con `MFA_OBLIGATORIO=false` pegado al valor: la variable quedó corrupta, la otra nunca existió, y la aplicación arrancó igual porque `min(32)` solo mira longitud                                                                                                                                                                                | **Corregido** · secretos con forma, detección de variable engullida, y `pnpm entorno:diff`                              |
| **D-62**  | **Los mensajes de error decían una causa, no lo observado.** Un 401 por JWKS caído se registraba como `FIRMA_INVALIDA` y la consola lo traducía a «pon `MFA_OBLIGATORIO=false` en la API». Estaba puesto. **Tres rondas de trabajo persiguiendo una causa inexistente**                                                                                                                                                   | **Corregido** · el proveedor clasifica sus fallos, 503 en vez de 401, y la regla aplicada a todas las traducciones      |
| **D-63**  | **Los gráficos del tablero emitían `style="height:37%"`, que la CSP rechaza: las barras salían a CERO en producción.** No lo vio nadie porque jsdom no aplica CSP y el recorrido del navegador visita el tablero sin datos                                                                                                                                                                                                | **Corregido** · clases estáticas + control `frontera-csp.mjs` con prueba negativa                                       |
| **D-65**  | **La API compilaba contra el `dist/` de un paquete interno, que podía ser de otra etapa.** `pnpm --filter @ncr/api build` daba `TS2339` sobre un método que sí existía en el dominio y sí se exportaba. **El paso 3 del verificador construía solo por la raíz**, donde turbo deja los `dist/` frescos, así que nunca podía verlo. Decimoquinta aparición de DT-12                                                        | **Corregido** · referencias de proyecto y `tsc -b`; paso 3 reordenado y `frontera-construccion.mjs` con prueba negativa |
| **D-64**  | **`/ready` publicaba `postgres: 'no-conectado-etapa-04'`**, una cadena fija de cinco etapas atrás, y respondía 200 sin tocar la base                                                                                                                                                                                                                                                                                      | **Corregido** · `SELECT 1` real, y el 503 se decide sobre todas las dependencias                                        |

> **Sobre la sonda del JWKS, que era la sospecha principal.** No estaba rota: con un 404 `/ready` **sí** devuelve 503, comprobado contra un servidor real. Lo que no existía era **nadie que la consultara**. De ahí las comprobaciones de arranque: el proceso habla con el recurso real al levantar y lo dice con nombre y remedio, en vez de fallar en la primera petición del usuario.

### Bloqueo de ENTORNO — no es deuda de código

| Id        | Asunto                                                                                                                                                                                                                                                                                                                                              | Estado                                     |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **BE-01** | **SMTP y URLs de redirección de recuperación.** El cliente no tiene permisos para configurarlos en el panel de Supabase; está en gestión. El ciclo está **construido y documentado**, y la comprobación de arranque **nunca informa `ok`**: declara explícitamente que el SMTP no es observable desde la API y que el ciclo queda **SIN VERIFICAR** | **Abierto · fuera del alcance del código** |

### Deuda BLOQUEANTE de la ETAPA 13 — no es una decisión permanente

| Id        | Asunto                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Estado      |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **DB-01** | **`MFA_OBLIGATORIO` retirado del código el 2026-09-10.** No vuelve a `true`: desaparece. Variable, rama del guard, token `POLITICA_MFA`, aviso de arranque, cartel de la consola, rama de la ruta de sesión y los dos `.env.example`. Un modo que debilita un requisito formal y sobrevive en el árbol acaba activado en producción por accidente. Tres controles anti-regresión levantan los procesos **con** la variable puesta y exigen que no pase nada                                                                                                                                                                                                                                                | **CERRADA** |
| **DB-02** | **CERRADA el 2026-09-11, por el camino ejercido.** La duda era si el token del proyecto real llevaba `rol`. Lo llevaba: la bitácora de la consola del cliente enumera `rol` y `copropiedad_id` entre los claims recibidos, así que el gancho `0024` está activo y hace su trabajo. Y el camino completo se ejerce en los pasos **12b y 12c** del verificador —base vacía → migraciones → superadministrador → sesión aceptada con `aal2` y rechazada con `aal1`, y el recorrido del navegador hasta el tablero—. **Lo que el token traía bien era `rol`; lo que estaba roto era otra cosa**: `copropiedad_id` nulo en el superadministrador, que la consola leía como «sin permiso». Eso es D-67, no DB-02 | **CERRADA** |

> **Por qué DB-02 estuvo abierta tanto tiempo, y qué la cerró.** Se dio por «no verificada» porque la ronda anterior se hizo sin credenciales del proyecto real, y eso era correcto. La cerró el propio síntoma del cliente: su bitácora enumeraba los claims y `rol` estaba ahí. El diagnóstico previo — Que el token no traiga `rol` es lo serio: el guard derivaría el alcance de unos claims incompletos, y §2.7.6 llama a eso el riesgo número uno del proyecto. Con el JWKS corregido es muy probable que el síntoma desaparezca —era el mismo bloqueante— pero **probable no es verificado**, y esta ronda se hizo sin credenciales del proyecto real. Se da por **no verificado** hasta que el cliente ejecute el paso 5 de la guía.

### Bloques 6, 7 y 8 · 2026-09-11

| Bloque | Entregable                                                                                                            | Estado                                                                                                        |
| ------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **6**  | Modo oscuro declarado como **parejas fondo/texto** en `packages/config/src/temas.ts`, medidas en los DOS temas        | **Construido** · [ADR-014](decisiones/ADR-014-modo-oscuro-por-parejas-de-tokens.md)                           |
| 6      | Conmutador de tres posiciones —sistema, claro, oscuro— que recuerda la elección, **sin destello**                     | Construido · atributo desde el servidor por cookie; `@media` sin JavaScript                                   |
| 6      | Tipografía Helvetica y derivadas, con respaldo nativo y **sin descargar ninguna fuente**                              | Construido                                                                                                    |
| 6      | `scripts/lib/frontera-tema.mjs` · rompe la construcción ante cualquier color fuera del sistema                        | Construido · cinco sondas negativas observadas en rojo                                                        |
| **7**  | Configuración editable, con la tabla de permisos declarada **una vez** y publicada por la API en `editables`          | **Construido**                                                                                                |
| 7      | Validación en servidor además de cliente: 422 con TODOS los motivos, 400 del `ValidationPipe` ante campo no declarado | Construido · probado en la suite de aislamiento                                                               |
| 7      | Cada cambio efectivo en `auditoria_seguridad`, **en la misma transacción que el `UPDATE`**                            | Construido · migración **`0028`** (hay que aplicarla)                                                         |
| 7      | Lo no editable, en solo lectura **con el motivo visible**: cota legal, integridad, trazabilidad                       | Construido                                                                                                    |
| **8**  | Bucket privado de evidencia: pasos, declaración y verificación **por ejercicio**                                      | Procedimiento entregado · `docs/guias/CONEXION_SUPABASE.md` §7.1 y §7.2                                       |
| 8      | `scripts/verificar-bucket-evidencia.mjs` · sube objeto real, lo niega sin firma, lo sirve con firma, lo borra         | Construido                                                                                                    |
| 8      | Aclaración escrita del flujo biométrico de punta a punta                                                              | [`docs/arquitectura/flujo-biometrico-de-punta-a-punta.md`](arquitectura/flujo-biometrico-de-punta-a-punta.md) |

**Hallazgo del bloque 6 · el tema claro tenía un fallo de AA en producción.**
`bg-exito text-white` —la variante «éxito» del botón— daba **2,537 : 1**, menos de
la mitad de lo que AA exige, y llevaba nueve pantallas dado por verificado. No lo
vio la suite anterior porque medía colores sueltos contra superficies sueltas y
ese par no estaba declarado. Corregido con `exito.boton` = `#0A855C`.

**Hallazgo del bloque 7 · el banco de pruebas de la API no era el de producción.**
`crearApp` no registraba el filtro global de `main.ts`, así que **toda aserción de
la suite sobre un cuerpo de error comprobaba una forma que el despliegue no
produce**. Apareció al montar el 422 de configuración, que es el primer error cuyo
cuerpo la consola necesita leer. Ya está registrado; de 460 pruebas, la única que
cambió fue la que se acababa de escribir contra la forma equivocada.

**Precisión del bloque 8, para que no se lea de más.** Crear el bucket **no**
hace que la evidencia persista por sí solo: falta el adaptador
`AlmacenEvidenciaSupabase` detrás del puerto que ya existe. Lo que el bucket sí
cierra hoy es el primero de los cuatro recursos de DT-12 y el `SIN-CONFIGURAR`
del arranque. El detalle, sin adornos, en el documento de flujo biométrico.

### Alta de viviendas · CONSTRUIDO y verificado · 2026-09-16

Rama `etapa-04-alta-de-viviendas`, desde `develop`. Informe completo en
[`etapas/ETAPA-04-alta-de-viviendas.md`](etapas/ETAPA-04-alta-de-viviendas.md).

**Qué cambió.** La copropiedad declara una vez quién es —dirección, tipo, y cómo
llama a sus viviendas y agrupaciones— y el padrón se genera entero desde un
patrón, con vista previa obligatoria. Dentro va la migración de `agrupacion` que
estaba aprobada: los tres cambios de esquema son de catálogo porque todavía no
hay padrón cargado.

**Las dos preguntas del usuario, contestadas y con control:**

- **¿El tipo puede cambiar después?** Sí, y las viviendas ya creadas no se
  enteran, porque ninguna lo guarda y el dominio no lo lee. Lo vigila
  `scripts/lib/frontera-vocabulario.mjs`, con prueba negativa: sin él la
  respuesta envejecería en silencio.
- **¿Al cambiar el prefijo se renombra algo?** No hay nada que renombrar: la
  palabra nunca estuvo dentro del identificador (H-3). El alta individual
  rechaza «Casa 42» y la importación lo recorta y lo cuenta.

**Y la operación peligrosa —regenerar sobre un padrón con residentes— no existe:**
la generación solo inserta y una sola colisión la revierte entera, nombrando
todas las que chocaron.

**Veredicto literal de §2.8.0** — `./scripts/verificar-etapa.sh --con-base`, con
`DATABASE_URL_PRUEBAS` apuntando a una PostgreSQL local (ninguna credencial del
usuario viajó a ningún sitio):

```
▸ 13 · KPI-03 y la inmutabilidad de un evento REAL, contra base (requiere --con-base)
   ✓ 100 inserciones concurrentes, 0 duplicados (KPI-03)
   ✓ UPDATE y DELETE rechazados sobre un evento real (RN-03, CA-23)
   ✓ 50 ingresos simultáneos sobre 10 plazas, ni una de más (RN-14, CA-14)
   ✓ una hoja sin un solo UUID crea viviendas, personas y sus vínculos (D-72, RN-06)
   ✓ el superadministrador escribe el padrón en la copropiedad del selector (D-71)
   ✓ las 12 en una sentencia, el mismo número en tres agrupaciones, y una colisión revierte las 12
▸ 14 · estabilidad: la suite da lo mismo tres veces seguidas
   ✓ OK estabilidad: 3 corridas forzadas (sin caché de turbo) con resultado idéntico y ningún error sin manejar
▸ 15 · ningún paso declarado se quedó sin ejecutar
   ✓ OK 19 de 19 pasos ejecutados

VERIFICACIÓN DE ETAPA: correcta — se puede escribir el informe
```

**Cifras de esa misma ejecución:** 1 485 pruebas en verde (api 565 · dominio 380
· consola 350 · config 144 · providers 46), 116 de 116 ficheros recogidos,
cobertura de dominio 97,68 % y de aplicación 97,32 % —umbral 90 %—, global
74,42 % —umbral 70 %—, y los 15 controles negativos detectando su violación.

**Hallazgo del camino, y no menor.** El paso 13 se omite sin
`DATABASE_URL_PRUEBAS`, y esa omisión escondía tres pruebas contra base en rojo:
los casos de uso del padrón habían dejado de compilar con la firma nueva. Es la
familia de falso verde que el propio guion existe para impedir, esta vez desde el
otro lado —el control estaba, pero nadie le daba la base—. **Si usted ejecuta la
verificación sin esa variable, el paso 13 le dirá «omitido»: no es un verde.**

### Alta de viviendas · diseño escrito · 2026-09-16

Entregado **sin construir nada**, a la espera de aprobación:
[`decisiones/propuestas/alta-de-viviendas.md`](decisiones/propuestas/alta-de-viviendas.md).

Rehace el alta de viviendas —hoy exige repetir torre y dirección en cada una de
las 300 unidades— e incorpora dentro la migración de `agrupacion` ya aprobada,
porque toca el mismo campo y hoy no hay padrón cargado. Cinco hallazgos
condicionan el diseño; dos exigen decisión suya: el índice único pasa a ser
compuesto —`(copropiedad, agrupación, identificador)`, porque la Torre 1 y la
Torre 2 tienen las dos un 101— y el reparto de casas entre secciones (S-16).
El diálogo de primera vez **no crea la copropiedad**: no puede, porque nadie
entra antes de que exista una. Estimado 4,5–5,5 j.

### Bloques 4, 5 y 9 · propuestas escritas · 2026-09-12

Entregadas **sin construir nada**, a la espera de aprobación:

| Bloque                                                                  | Documento                                                                                                                    | Recomendación                                             |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| **4** · Sesiones, restablecimiento sin SMTP, WebAuthn, «Retomar sesión» | [`decisiones/propuestas/BLOQUE-04-sesiones-y-autenticacion.md`](decisiones/propuestas/BLOQUE-04-sesiones-y-autenticacion.md) | Construir 6,75 j de 11,25: diferir WebAuthn a la ETAPA 14 |
| **5** · Segundo factor a medias                                         | [`decisiones/propuestas/BLOQUE-05-mfa-a-medias.md`](decisiones/propuestas/BLOQUE-05-mfa-a-medias.md)                         | 1 j cierra el problema operativo                          |
| **9** · Revisión de cierre de la ETAPA 09                               | [`etapas/ETAPA-09-revision-de-cierre.md`](etapas/ETAPA-09-revision-de-cierre.md)                                             | 3 j de persistencia real antes de la ETAPA 10             |

**Corrección de cifra.** En dos ocasiones dije que «cinco» y luego «seis» módulos
abrían su propio `Pool`. Contado sobre el código son **tres** —`padron`,
`autorizaciones` y `multiempresa`— más la sonda de arranque, que conserva el suyo
a propósito. Cuatro `Pool`, 35 conexiones de tope. El problema es menor de lo que
dije y sigue teniendo que resolverse antes de la ETAPA 12 (**D-66**, 0,75 j).

**Lo que bloquea la ETAPA 10, dicho sin rodeos.** La consola de portería muestra
la evidencia de cada evento y decide con las listas negras, y las dos viven hoy
en memoria del proceso: al reiniciar, el portero ve un evento con la imagen rota
y una lista negra vacía. Son **3 jornadas** —`AlmacenEvidenciaSupabase` con
validación de tipo real, y el adaptador PostgreSQL de autorizaciones y listas
negras (D-25)— y conviene hacerlas antes de abrir la etapa, no dentro.

### D-71 · el superadministrador no podía escribir NADA · 2026-09-13

`POST /padron/viviendas` → `400 · La identidad no tiene copropiedad`.

**Causa.** Su `copropiedad_id` es **nulo por diseño** —no pertenece a ninguna,
las alcanza todas, y lo resuelve `app.es_superadmin()`—, y los casos de uso de
escritura la leían del token. La 09-B movió las **lecturas** bajo
`copropiedades/:id` para que entraran en el barrido de aislamiento; las
**escrituras** se quedaron tomándola del token, y nadie las recorrió con ese rol.

No afectaba sólo a viviendas: **padrón entero, autorizaciones, listas negras y
biometría**. Todas fallaban igual. El cliente tenía razón en pedir que no se
arreglara ruta a ruta.

**Por qué ninguna prueba lo vio.** Todas las de escritura usaban
**administrador**, que sí lleva `copropiedad_id`. Es el mismo hueco que dejó las
ocho pantallas en «sin permiso»: el rol que no encaja en el modelo mental de
«una identidad, una copropiedad» es justo el que nadie recorre.

| Corregido                                    | Cómo                                                                                                                                                                                                                                   |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toda escritura cuelga de `copropiedades/:id` | El padrón se movió; el resto ya estaba                                                                                                                                                                                                 |
| El contexto que llega al dominio             | `exigirAlcance` **devuelve el contexto de destino** con la copropiedad ya validada. Un caso de uso no puede olvidar la comprobación porque no la hace: recibe el dato comprobado o no se ejecuta                                       |
| El aislamiento **no se afloja**              | La copropiedad viene de la ruta, que la pone el cliente, así que se valida contra el alcance real: un administrador que apunte a otra recibe **404, no 403**                                                                           |
| Prueba derivada del enrutador                | `escrituras-superadministrador.e2e.test.ts` recorre **toda** ruta de escritura con `copropiedadId: null`. Una ruta nueva entra sola, y un `it` estructural falla si alguien vuelve a colgar una escritura fuera de `copropiedades/:id` |
| Alta real contra base                        | `padron-superadmin.test.ts`, en el paso 13                                                                                                                                                                                             |

**Un hallazgo de propina.** El primer intento de limpieza de esa prueba hacía
`DELETE` sobre `viviendas` y la base lo rechazó: «Borrado físico prohibido […]
use la baja lógica». RN-19 funcionando — y la confirmación de que la fila se
había creado de verdad.

**Vocabulario «Manzana».** No lo fija ningún requisito: viene de un mockup.
Propuesta escrita en
[`decisiones/propuestas/agrupacion-de-vivienda.md`](decisiones/propuestas/agrupacion-de-vivienda.md):
`agrupacion` como dato y `etiqueta_agrupacion` configurable por copropiedad.
Implica migración, y **hoy es barata porque no hay ni una vivienda creada**:
dos `ALTER TABLE` sin mover datos. En cuanto se cargue el padrón, deja de serlo.

### D-72 · la consola pedía un UUID donde va una persona · 2026-09-13

El campo se rotulaba **«Persona que visita (identificador)»**, aceptaba texto
libre y respondía `personaId must be a UUID` a quien escribiera un nombre. Nadie
tiene a mano el UUID de un visitante: el dato solo existe dentro de la base.

**No era un defecto de rótulo.** El flujo real es que el residente autoriza a
alguien **por su nombre y su documento**, y que si esa persona no está en el
sistema se cree en ese momento. La tabla `personas` existe precisamente para eso
(D-01): que la lista negra alcance a la misma persona sea cual sea el rol con el
que se presente (RN-06). La identidad importa; el UUID no es asunto del usuario.

| Corregido                        | Cómo                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identidad como objeto de valor   | `Documento` y `NombreDePersona` en `domain-core`. `12.345.678`, `12 345 678` y `12345678` producen **una sola forma**; lo que no se puede normalizar **falla** en vez de desaparecer, porque borrar lo desconocido colapsaría dos personas en una                                                                                                   |
| Buscar y crear en un solo paso   | `GET`/`POST /copropiedades/:id/padron/personas` y el componente `BuscadorDePersonas`: se teclea nombre o documento, se elige de la lista, y si no aparece se registra sin salir del formulario                                                                                                                                                      |
| Un documento repetido NO duplica | El alta resuelve a la persona que ya existe —lo decide el índice único parcial, no un `SELECT` previo (ADR-04)— y la consola **lo dice**: «ya estaba registrado como …». Fingir un alta que no ocurrió habría escondido que el nombre tecleado se descartó                                                                                          |
| La hoja de padrón, rellenable    | Pedía las columnas `vivienda_id` y `persona_id`. Ahora la vivienda se nombra **«Casa 12»**, la persona por **documento y nombre**, y el resumen dice cuántas viviendas y personas hubo que crear: una errata en la columna «vivienda» crea una casa que nadie quería, y el número la delata en el momento. Las cabeceras antiguas se siguen leyendo |
| Barrido, no ruta a ruta          | `formularios-sin-identificadores.test.ts` teclea basura en todo campo de texto de cada formulario, elige la primera opción de cada desplegable, resuelve cada buscador, envía, y comprueba **contra `openapi.json`** que toda propiedad declarada `format: uuid` llegó siendo un UUID. No hay lista de campos prohibidos que mantener               |
| Alta real contra base            | `padron-por-nombre.test.ts`, en el paso 13: una hoja sin un solo UUID crea las viviendas, las personas y sus vínculos, y la misma cédula escrita de dos formas resuelve a **una** persona                                                                                                                                                           |

**Lo que el barrido dejó clasificado y por qué.** Portería y guardia escriben
sobre el elemento que ya está en pantalla —solo se teclea el motivo—;
dispositivos son botones por fila; configuración declara `min`/`max` en sus
campos numéricos y responde 422 por campo. Ninguna pide una identidad. Queda
anotado que `POST /padron/residentes` sigue aceptando `personaId`: **no hay
todavía pantalla de residentes**, y cuando la haya debe usar el buscador.

### D-73 · la vigencia se aceptó invertida · 2026-09-13

«Desde 13/09/2026 05:45 p. m.» y «Hasta 13/09/2026 05:45 a. m.»: terminaba antes
de empezar. El formulario no lo señaló, y el error que acabó mostrando fue el de
**otro campo** —el UUID—, porque el `ValidationPipe` corre antes que el dominio.

**El dominio sí lo rechaza, y está comprobado.** `Vigencia.crear` devuelve fallo
para el rango invertido y para el de duración cero —el intervalo es
cerrado-abierto, así que con los dos extremos iguales no contiene ningún
instante—, y el caso de uso no llega a tocar el repositorio. No es un defecto de
fondo: **una vigencia invertida no se puede persistir.** Se añadió la prueba con
los valores exactos del 13, afirmando además que no se escribió nada, y
`autorizaciones-vigencia.e2e.test.ts` exige que la respuesta HTTP **nombre la
vigencia** y no mencione el UUID.

Lo que faltaba era el aviso: `problemaDeVigencia` señala el motivo **debajo del
campo «Hasta»** y bloquea el envío. No relaja nada —quien decide sigue siendo el
dominio—, pero una restricción que solo aparece cuando el servidor la nombra
obliga a descubrirla por ensayo y error.

### D-74 · «los días marcados» que no se veían · 2026-09-13

La casilla decía «Recurrente (08:00–18:00 en los días marcados)» y anunciaba dos
cosas que no existían: los días solo aparecían **después** de marcarla, y la
franja horaria estaba fija en el código. Ahora la casilla dice «Autorización
recurrente» a secas, y al marcarla se abre un grupo con los días **y** las dos
horas, editables; una franja que cruce la medianoche se señala en el formulario
con el mismo motivo que da RN-22 (se registra con dos autorizaciones).

### Adaptador real de barrera vehicular · 2026-09-15

**No es la ETAPA 15.** Es la rebanada acotada que propone
`decisiones/propuestas/apertura-real-antes-de-la-etapa-15.md`: un adaptador
detrás de un puerto que ya existía. El simulado sigue siendo el de por omisión y
la suite completa sigue corriendo sin hardware (KPI-12).

Los tres hallazgos de la validación en sitio están en
`guias/VALIDACION_HIKVISION_EN_SITIO.md` §0.ter, y **determinan el diseño**:

- **H-1** · la respuesta correcta del equipo no prueba que la barrera se movió.
  Observado: con el acceso bloqueado, la orden de abrir responde
  afirmativamente y el relé no actúa.
- **H-2** · no hay señal de posición cableada. El sistema **no puede demostrar**
  que una puerta se abrió, y ninguna pantalla va a afirmarlo.
- **H-3** · bloquear y desbloquear son estado persistente, no pulso: mandan
  sobre la decisión por vehículo.

**Consecuencia en el contrato interno.** El puerto `AccionadorDePuerta`
devolvía `void` y **ya no puede**: con un relé real hay tres desenlaces que el
operador resuelve de forma distinta —`aceptada`, `rechazada`, `inalcanzable`— y
`void` los aplasta en uno. Un portero necesita distinguir un rechazo, que se
arregla desbloqueando, de un equipo mudo, que se arregla llamando al técnico.
Ninguno de los tres estados dice «abierta», y `aceptada` lleva marcado **por el
tipo** que el paso no es observable (H-1, H-2).

**Bloqueo y desbloqueo** entran como caso de uso propio, no como variante de la
apertura: motivo obligatorio con la misma regla (RN-08), rastro antes de
accionar, estado vigente **con dueño y fecha**, y alcance de administración —
el portero no deja un conjunto sin entrada—.

**PENDIENTE DE DEFINICIÓN · consulta de estado.** El `GET` al estado de la
barrera devuelve `notSupport`; la interfaz del equipo lo consulta por otro
método **aún sin capturar**. Hasta entonces el sistema no puede preguntar en qué
estado está el acceso: solo sabe lo que él mismo ordenó.

**PENDIENTE · si el bloqueo sobrevive a un reinicio del equipo.** Sin comprobar.
Importa: si no sobreviviera, un corte de luz desbloquearía el acceso sin que
nadie se entere.

**ANOTADO · el equipo no es fuente de verdad auditable.** Su registro de
lecturas se puede borrar por API (`isSupportLPAuditDataDelete` es verdadero). La
trazabilidad vive en `eventos`, append-only por permisos y por disparador
(ADR-05). El equipo pasó además de control por cámara a **control por
plataforma**: la decisión la toma Next Control.

---

## ETAPA 14 — Observabilidad, CI/CD, PWA instalable y escritorio · **CERRADA** · 2026-09-22

**Rama:** `etapa-14-cicd-pwa-escritorio` · **Base:** `develop` (`ac5a6cf`)
**Informe de etapa:** [`etapas/ETAPA-14.md`](etapas/ETAPA-14.md) ·
**Guías nuevas:** [`guias/DESPLIEGUE.md`](guias/DESPLIEGUE.md) · [`guias/MANUAL_USUARIO.md`](guias/MANUAL_USUARIO.md)

**No añade una función de producto: añade la capacidad de demostrar que el
producto hace lo que dice.** Toda línea de registro lleva la correlación de su
petición —el identificador existía desde la ETAPA 02 y ninguna línea lo
contenía—; las cinco latencias comprometidas se miden y se publican con p50, p95
y p99, **cada una con el tramo que mide y lo que NO mide escrito al lado**; un
planificador de pg-boss invoca tres operaciones idempotentes que no llamaba
nadie; el CI produce los **seis** entregables y no tres; y la paleta de la app
del residente se genera desde el mismo preset que usa la consola.

### Las cuatro deudas que esta etapa recibió como insumo

| Insumo             | Desenlace                                                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D-101**          | **ABIERTA.** Ocho corridas más de la suite completa con cobertura en Linux: ocho verdes. Van 45 intentos y 1 aparición. **Instrumentada**, no cerrada — ver abajo |
| **D-34**           | **CERRADA, y era una COLISIÓN DE IDENTIFICADOR**: el control existía desde la ETAPA 08. Ver abajo                                                                 |
| **D-78**           | **CERRADA.** La paleta se genera; el cierre destapó **tres divergencias** del tema oscuro que la prueba anterior no podía ver                                     |
| **Planificadores** | **D-31, D-36 y D-40 CERRADAS.** Las tres tienen trabajo programado. D-36 necesitó un caso de uso nuevo, `ReiniciarAforosVencidos`                                 |

### D-101 · perseguida, y **no** cerrada

| Etapa     | Intentos | Apariciones |
| --------- | -------: | ----------: |
| ETAPA 12  |       11 |           0 |
| ETAPA 13  |       26 |           1 |
| ETAPA 14  |        8 |           0 |
| **Total** |   **45** |       **1** |

**Evidencia contra la hipótesis principal.** El sospechoso era una aserción
sensible al reloj bajo contención. La suite de `@ncr/api` tiene exactamente
cuatro, y los márgenes medidos son de **15×** (p99 de 61–67 ms contra un umbral
de 1 000) y **~50×** (p95 de decenas de ms contra 3 000). La contención tendría
que multiplicar la latencia por quince para producir una roja.

**Lo que sí se añade es instrumento.** Los informes JSON de las suites se
escribían en un temporal y se tiraban al terminar; ahora se conservan y el CI los
sube como artefacto **cuando el trabajo falla**. D-100 consiguió que la roja se
nombrara; esto consigue que la próxima traiga cada aserción con su duración y su
orden. Una aparición cada cuarenta y cinco corridas no se reproduce a voluntad.

### D-34 · la colisión de identificador

Este documento tenía **dos filas con el mismo identificador**: una en la ETAPA 08
diciendo «CERRADA, con control y prueba negativa», y otra en la 13 diciendo
«falta el control que la impida». Contrastado contra el código, la primera es la
correcta: `scripts/lib/frontera-modulos.mjs` existe desde la ETAPA 08, su
cabecera cita D-34 por su nombre, tiene sonda negativa y corre en el verificador
y en CI. **El control que la segunda fila decía que faltaba llevaba seis etapas
existiendo.** La fila de la 13 queda tachada con su explicación.

### Lo que esta etapa NO construyó, y por qué

| Elemento                                    | Por qué                                                                                                                                                                              | Reasignado a                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| **WebAuthn**                                | La razón por la que se difirió no cambió: **no eleva el `aal2` de Supabase, así que no satisface RN-20**. Es comodidad, no factor, y el alcance de la 14 no lo menciona              | Tras la 16                          |
| **S-24**                                    | Se anotó que «se cierra con el tablero de reglas de la ETAPA 14». El alcance de la 14 **no incluye ningún tablero de reglas**: incluye observabilidad, CI/CD, PWA y escritorio       | ~~ETAPA 16~~ **cerrado en la 15-Q** |
| **2 controles en deuda de prueba negativa** | `cliente-dart-desfasado.mjs` y `recorrido-web.mjs`. La lista **no creció**; tampoco encogió. Exigen SDK de Dart y un navegador **dentro del banco**, que es un clon sin dependencias | ETAPA 16                            |

### El paso 5e, y el coste de declarar un control

Estaba declarado no ejercido **en todas partes** desde el 2026-09-19 por una
diferencia de macOS. En Linux corre y pasa, así que la declaración se acota a
`darwin`. **Acotarla tuvo consecuencia inmediata:** la primera ejecución en tres
días salió roja por un motivo real —una aserción buscaba el «en construcción» de
la pestaña de visitantes, cierto en la 11-B y falso desde la 11—. La aserción
describía un estado que el producto ya no tenía, y nadie lo vio porque ninguna
máquina ejecutaba el fichero. Corregida.

### Requisito de CI registrado en la ETAPA 04 · **CUMPLIDO**

`./supabase/verificar.sh --con-pruebas --modo-supabase` —con la suite de
políticas RLS, no solo con las semillas— y la prueba de concurrencia KPI-03
corren ahora en CI y no solo en el entorno del usuario.

### Trabajo fuera del alcance, **autorizado por el usuario** como anticipo del punto 4 de la ETAPA 16

**No es alcance de la ETAPA 14 y se registra como lo que es.** El usuario
autorizó expresamente adelantar parte del punto 4 de la ETAPA 16:

- **Cuatro diagramas Mermaid en el README §3** —las cinco capas con la flecha
  prohibida, el recorrido de una decisión de acceso, el monorepo desplegado y el
  Edge sin WAN—, cada uno precedido de una frase que dice qué mirar. **Las tablas
  se quedan:** el diagrama acompaña, no sustituye.
- **Control nuevo con prueba negativa** (`mermaid-analizable.mjs`): localiza todo
  bloque ` ```mermaid ` del repositorio y falla si alguno no analiza, con Mermaid
  de verdad. La DoD de la ETAPA 16 exige «que los diagramas rendericen» y hasta
  hoy nada lo comprobaba: los cinco de `modelo-datos.md` llevaban desde la ETAPA
  01 sin que ninguna máquina los leyera.
- **`[CONTRADICCIÓN]` C-27**, registrada y resuelta: el README §3 enumeraba nueve
  agregados raíz **con `Persona` y sin `PlantillaBiometrica`**; `CLAUDE.md` §2.2
  enumera nueve **con `PlantillaBiometrica` y sin `Persona`**. Contrastado contra
  el código: **son nueve, los de `CLAUDE.md`**. `padron/persona.ts` no declara
  ningún agregado —exporta los objetos de valor `Documento` y `NombreDePersona`—
  y `modelo-datos.md` §2.10 clasifica `personas` como «tabla que no es agregado».
  **No son diez, y C-02 no se reabre.** Corregido el README, que era el único
  documento equivocado.

### Deuda nueva

| Id        | Qué                                                                                                                                                                                            | Se salda en |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **D-119** | Nada comprueba por máquina que la lista de agregados del README coincida con el dominio. Es lo que permitió C-27                                                                               | ETAPA 16    |
| **D-120** | KPI-13 no mide el tramo del equipo: el contrato de ingesta en vivo no trae marca del dispositivo                                                                                               | ETAPA 15    |
| **D-121** | El registro de latencias es por proceso; con varias instancias hay que agregar fuera                                                                                                           | ETAPA 16    |
| **D-122** | La actualización firmada del escritorio está cableada y **apagada** hasta que exista el par de claves. Lo destapó el CI: sin clave privada, el empaquetado falla DESPUÉS de producir el `.deb` | Operación   |
| **D-123** | `pnpm audit --prod` arrastra 12 avisos `low`/`moderate` de Express 4 y Nest 10 sin versión corregida                                                                                           | ETAPA 16    |
| **D-124** | El trinquete de ramas de `coherencia-estado-etapas.mjs` sube de 24 a 25 **sin que su código cambie**. Actualizado con el motivo escrito; falta identificar el bloque                           | ETAPA 16    |

### Supuestos nuevos

- **S-27** · los horarios de los tres trabajos (5 min, 1 h, 6 h). Ninguno viene
  del documento de requisitos; los tres son configurables.
- **S-28** · la ventana de 2 048 muestras del registro de latencias.

### Decisión pendiente que esta etapa NO puede tomar

**P-08 · la plataforma de despliegue de la API.** `DESPLIEGUE.md` está escrita
sin ella y lo dice en su primera línea: enumera las **cuatro** secciones exactas
que habrá que escribir cuando Grupo Control decida, y nada más de la guía depende
de esa decisión.

---

## Ronda `consola-superadmin-equipos` — después de la 15 · **CERRADA** · 2026-09-23

**Rama:** `consola-superadmin-equipos` · **Base:** `develop` (`f64b1d8`)
**No es una etapa del mapa de §5:** no añade una etapa nueva. Corrige código ya
fusionado a la luz de la documentación oficial del fabricante y construye el
aprovisionamiento de equipos que la 15 dejó fuera.
**Informe:** [`etapas/ETAPA-15-B-consola-y-equipos.md`](etapas/ETAPA-15-B-consola-y-equipos.md)

| Frente | Qué cierra                                                                                                                                                                                             | Resultado   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| **C**  | Lo que la guía ANPR obliga a corregir en código ya fusionado: `ctrlMod`, lectura invertida de la barrera, evento histórico, fotos de personas, idempotencia impuesta por el protocolo, mapa de errores | **Cerrado** |
| **A**  | Alta de equipos desde la consola con el secreto cifrado, «probar conexión» en el servidor con **cuatro** resultados distintos, pantalla y aviso en pantalla                                            | **Cerrado** |
| **B**  | Seis correcciones de consola: cantidad de viviendas, borrado definitivo y reactivación, nombre en «dirección», validación de dirección, dos ajustes que dejan de serlo, foto conectada                 | **Cerrado** |
| **D**  | Dos defectos del verificador: el clúster reutilizado sin comprobar y la roja que no se nombraba                                                                                                        | **Cerrado** |

### Lo que la documentación del fabricante destapó

**`ctrlMod` decide quién abre la barrera.** Con `0` la abre la cámara; con `1`,
la plataforma; con `2`, las dos. El principio rector del producto —«Next Control
decide, el hardware ejecuta»— **depende de un valor de configuración del
equipo**, y el proyecto no lo comprobaba. Ahora es una comprobación de arranque
del proveedor y parte del alta de un equipo: con `0` o `2`, el sistema se niega
a darlo por bueno y dice por qué.

**La lectura de `barrierGateCtrlType` estaba invertida.** `0` es control de
barrera **habilitado**, y lo demuestra `openGateType`, que sólo existe cuando
vale `0`. Ese campo es además evidencia de auditoría: dice si abrió la lista de
la cámara, la plataforma o una excepción, y ahora se normaliza y se registra
siempre.

**El evento puede ser histórico.** `alarmDataType = 1` significa que el equipo
está reenviando algo pasado. Tratarlo como presente habría abierto una barrera
por un coche que pasó ayer. Se aplica el mismo criterio que el videoportero ya
aplicaba a su flujo de alertas.

### H-15B-2 · dato biométrico por la puerta de atrás

El POST del «servidor de alarma» trae diez partes, y dos son `pilotPicture` y
`copilotPicture`: **las caras del conductor y del acompañante**. El proyecto
tiene un ciclo de vida biométrico completo bajo la Ley 1581 —consentimiento
previo, expreso e informado del titular, finalidad, supresión— y ninguna de esas
garantías se aplicaría a una foto que llega sola dentro de un evento de placa.
El visitante vino a que le leyeran la placa.

El receptor las **aparta antes de clasificar el sobre** y las rechaza con el
motivo en la bitácora. Severidad **Alta**, cerrado. Detalle en
`seguridad/AUDITORIA.md`.

### H-15B-1 · el precio de guardar credenciales en la base

Abrir el alta de equipos significa que la clave de cada cámara vive en la base.
**Comprometer la base pasa a comprometer los equipos**, y eso se dice sin
adorno. Se toma igualmente porque la alternativa —una variable de entorno por
equipo— no escala a multiempresa, y se paga con mitigaciones explícitas: cifrado
en la aplicación con llave derivada por copropiedad, llave distinta de la
biométrica, ninguna política de lectura para tokens de usuario, y un DTO de
respuesta que **no declara el campo**.

Severidad **Alta**, **mitigado con riesgo residual declarado** y procedimiento
de rotación escrito. Pendiente de firma.

### Lo que el usuario encontró usando la consola

| Frente | Defecto                                                                                                                 |
| ------ | ----------------------------------------------------------------------------------------------------------------------- |
| B.1    | El asistente de alta preguntaba torres, pisos y viviendas por piso, y **nunca cuántas viviendas hay**                   |
| B.2    | Una vivienda creada por error no se podía borrar: el disparador prohibía **todo** borrado, no sólo el que RN-19 prohíbe |
| B.3    | El diálogo inicial no pedía el nombre de la copropiedad, así que acababa escrito en «dirección»                         |
| B.4    | La dirección admitía cinco caracteres cualesquiera                                                                      |
| B.5    | Dos números que no son del conjunto se ofrecían como ajustes de pantalla                                                |
| B.6    | La captura de rostro existía y funcionaba, pero no había camino desde la autorización                                   |

### Defectos del verificador, cerrados

- **D.1** · `base-de-pruebas.sh` reutilizaba un clúster vivo **sin comprobar
  nada**. Con `max_connections=100`, las pruebas de KPI-03 y de aforo morían con
  «sorry, too many clients already» de forma intermitente. Ahora consulta el
  valor y reinicia si no sirve.
- **D.2 (D-113, un escalón más abajo)** · el paso de estabilidad **raspaba la
  consola** para nombrar la prueba roja, y el formato de la consola depende del
  reportero, que depende de `CI`. Ahora lee el informe JSON, que los seis
  paquetes emiten siempre desde un solo sitio.

### Lo que el verificador destapó al cerrar la ronda

Cinco defectos que nadie había previsto, y todos de la familia que este
proyecto persigue: **código nuevo que nadie había visto ejercitarse**. Los dos
últimos los encontró el CI, no la máquina de desarrollo, que es justo para lo
que existen las dos plataformas.

1. **`generacion-padron.test.ts` usaba la forma antigua del plan.** Sólo corre
   con base, así que la suite sin `--con-base` lo daba por bueno. Es el
   argumento de `--con-base` en una línea.
2. **El control de coherencia leía como «en curso» una rama que la cabecera
   declara CERRADA.** Recogía cualquier nombre entre acentos graves de una
   línea que mencionara «en curso», y en este documento una misma línea nombra
   a menudo dos ramas. Ahora exige la frase con la que el documento lo escribe
   de verdad.
3. **El recorrido del navegador no arrancaba: `EQUIPOS_LLAVE: Required`.** Es
   §2.7.1 funcionando —una variable obligatoria que falta impide el arranque—,
   y el único paso capaz de verlo es el único que ejecuta el proceso compilado
   en vez de montar la aplicación en memoria.
4. **El cliente Dart se quedó atrás.** El contrato ganó los DTO de equipos y
   cambió la forma del plan de viviendas; §2.6 exige que ese cliente sea
   **generado**, así que se regeneró con el SDK fijado en `.flutter-version`
   (207 ficheros) y se retiraron a mano los dos `*_tipo.dart` que el contrato
   ya no produce —`swagger_parser` no borra lo que deja de generar—. Lo
   confirma de paso: `EquipoDto`, el tipo de LECTURA, **no tiene el campo
   `secreto`**.
5. **D-115 · un `pg_ctl` no es un servidor.** La fórmula `libpq` de Homebrew
   —la que trae el runner de macOS— instala `psql`, `pg_ctl` e `initdb` y **no**
   el servidor. `base-de-pruebas.sh` elegía ese directorio porque encontraba
   `pg_ctl`, y reventaba a mitad de `initdb`, donde ya no se distingue de un
   control roto. Ahora exige los tres binarios, lo dice con esas palabras,
   admite `NCR_PGBIN` —validado igual— y tiene prueba negativa que reproduce el
   escenario en cualquier máquina.

### Lo que NO se pudo hacer, dicho con esas palabras

`docs/hikdocs/` —el destilado de la guía ANPR— vive en la máquina del usuario y
está en `.gitignore`, correctamente: es documentación propiedad del fabricante.
**No llegó a este entorno**, así que C.10 pedía citar el capítulo de cada ruta y
el capítulo no se pudo citar por número. El catálogo lleva un campo `capitulo`
relleno con **el tema** —«identidad del equipo», «control de la barrera»— y la
sustitución por la referencia exacta queda como deuda mecánica.

---

## Corrección `etapa-15s1-tipos-de-las-pruebas` — las pruebas de la API, compiladas (DT-15S1-03) · **CERRADA** · 2026-10-05

**Rama:** `etapa-15s1-tipos-de-las-pruebas` · **Base:** `develop` (`369df17`, merge del PR #45), no la rama de la 15-S1: el defecto es previo y vive en `develop` · **PR:** [4rg3n15/NextResidential#48](https://github.com/4rg3n15/NextResidential/pull/48), sin fusionar (abierto desde la interfaz contra `main`; redirigido a `develop`)
**Informe:** [`etapas/ETAPA-15S1-tipos-de-las-pruebas.md`](etapas/ETAPA-15S1-tipos-de-las-pruebas.md)

> **Esta corrección NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Ni una línea de producto. DT-15S1-03 nació en el informe de la 15-S1
> (`docs/etapas/ETAPA-15S1.md` §8, en la rama de su PR #46, sin fusionar).

| Qué                                  | Cómo queda                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DT-15S1-03 · las pruebas sin tipos   | **CERRADO.** `apps/api/tsconfig.pruebas.json` compila las 131 pruebas de `src/` y los 119 ficheros de `test/` con las opciones estrictas de la API y como corren (ESM, paquetes internos al fuente); `typecheck` de `@ncr/api` la compila sin caché de turbo, así que la recogen el paso 4 del verificador y el CI. 0 errores                         |
| Lo que salió                         | **50 errores previos, no 2.** Dobles atrás de su puerto, valores fuera de su enumerado, aridades, ayudantes mal tipados. El doble del hogar incumplía `CuentasDeResidentes` (de `residente`, no el `DirectorioDeCuentas` de `cuentas`): ahora `darDeBaja` tiene el contrato del adaptador, y una prueba por HTTP que con el doble de `develop` da 500 |
| H-15S1-C02 · H-13-02                 | **CORREGIDO.** Desde la 15-E (`91fc03e`) el sobre nunca llegaba a la copropiedad ajena: con UNA llave para todas, las tres pruebas de H-13-02 seguían en verde. Corregida, la primera cae. Anotado en `seguridad/AUDITORIA.md`                                                                                                                        |
| H-15S1-C03 · el motivo sin dirección | **CORREGIDO.** `EquipoInalcanzable` con tres argumentos para dos (15-P): el mensaje era `'vp'` y la aserción no podía fallar. Corregida, cae si el motivo filtra el mensaje                                                                                                                                                                           |
| H-15S1-C04 · el padrón sin claims    | **CORREGIDO.** `padron-superadmin` construía el adaptador sin claims desde la 15-R; pasaba porque la prueba se conecta como superusuario                                                                                                                                                                                                              |
| H-15S1-C05 · la caché de turbo       | **CORREGIDO.** Con un error en `apps/edge/test` —que las pruebas de la API leen—, `pnpm typecheck` daba el verde de la corrida anterior («cache hit»). `@ncr/api#typecheck` va sin caché                                                                                                                                                              |
| Aserciones                           | Dos existentes, mal tipadas y correctas en ejecución (`requiereConfirmacionHumana` sin estrechar): estrechadas, con la misma fuerza. Ninguna otra                                                                                                                                                                                                     |
| Que no vuelva                        | Sonda 41 (35 controles): el doble sin `darDeBaja` y un error en una prueba de `src/` rompen la compilación con su fichero; `typecheck` las sigue compilando, con las mismas opciones estrictas y sin caché. El paso 4 nombra los errores                                                                                                              |
| Deuda nueva                          | **DT-15S1-C02** (el mismo agujero en proveedores, 3 errores; dominio y Edge, 0) · **DT-15S1-C03** (la tercera prueba de H-13-02 no distingue llaves) · **DT-15S1-C04** (`biometria.e2e` entra en la lista privada del simulado)                                                                                                                       |

**Verificación:** `./scripts/verificar-etapa.sh --con-base` sobre `b570091`, con la base preparada como en CI (`--con-pruebas`) → «VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe» (D-112). 31 de 31 pasos, 5186 pruebas de TypeScript y 367 de Dart, tres corridas idénticas; dominio 96,20 %, aplicación 97,24 %, global 87,78 % de líneas; los 35 controles detectan su violación, la sonda 41 entre ellos. La corrida anterior, sobre `de1884d`, con el mismo veredicto. CI en `de1884d`: `controles` (Linux y macOS) y los seis entregables en verde; el verificador de macOS, FALLIDO en su paso 5 por DT-15M-C03, intermitente y ajena. En `b570091`: lo mismo en verde, y el verificador de macOS FALLIDO en su paso 7 por `edge-instantanea-pg` (DT-15M-C01, intermitente y ajena: esta rama no añade quien escriba reglas de COP_A). CI entero en verde en `e4d3262` (el cierre), con el verificador de macOS.

---

## Ronda `etapa-15s1-vispera-de-sitio` — víspera de sitio: el turno de audio por sesión, la víspera en el ensayo y la guía de mañana · **CERRADA** · 2026-10-04

**Rama:** `etapa-15s1-vispera-de-sitio` · **Base:** `develop` (`369df17`, merge del PR #45) · **PR:** [4rg3n15/NextResidential#46](https://github.com/4rg3n15/NextResidential/pull/46), sin fusionar
**Informe:** [`etapas/ETAPA-15S1.md`](etapas/ETAPA-15S1.md)

> **Esta ronda NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Mínima, para las pruebas en sitio: nada se ejerció contra el DS-KD9633.

| Qué                           | Cómo queda                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 · el turno de audio        | **CERRADO.** Se suelta por SESIÓN, y cada conversación toma la suya al abrirse: la vieja que termina después ya no se lleva el turno ni cierra el canal en el equipo, se haya colgado y vuelto a llamar o cambiado de equipo y vuelto sin colgar (`CanalConSesiones`, fichero nuevo). La prueba de la carrera falla 10 de 10 sobre `369df17` y pasa 20 de 20 con el arreglo |
| A2 · la víspera del ensayo    | `pnpm sitio:ensayo` (también `--solo-lectura`): 0047–0054 una a una contra la base real, por el registro de la CLI o por su huella; las variables nuevas desde la 15-N por clase, sin imprimir valores; la consola por el bucle local y el reenvío del audio                                                                                                                |
| A3 · la guía                  | `ENTREGA_EN_SITIO.md` §0 «La víspera», §4 bis el orden de mañana y lo que no se puede probar en sitio (Web Push, TURN, Netlify/Cloud Run)                                                                                                                                                                                                                                   |
| H-15S1-01 · fuera del encargo | **CORREGIDO en el ejemplo.** `RECUPERACION_POR_CORREO` vacía —como la traía `apps/web/.env.example`— impide arrancar la consola. El ejemplo dice ahora `desactivada`; el esquema queda como deuda (DT-15S1-02)                                                                                                                                                              |
| CI del PR                     | Cayó dos veces en el verificador de macOS por tres intermitentes previas: DT-15M-C03, DT-15M-C04 y H-15S1-02 («TODA ruta autenticada», 5 s). **CORREGIDAS en `4e816ab`**, con autorización expresa: tres ficheros de prueba, +2 líneas, ninguna aserción, y cada una vista fallar antes con su mecanismo                                                                    |
| Ficheros existentes           | El código no crece: `guardia.module.ts` 320, `puerta-de-audio.ts` 172, `sitio-ensayo.mjs` 300, `.env.example` 52. La guía, sí: 539 → 587; y, autorizados, tres ficheros de prueba (+2)                                                                                                                                                                                      |
| Deuda nueva                   | **DT-15S1-01** (la conversación toma la sesión al aceptarse el WebSocket, no al emitirse el billete) · **DT-15S1-02** (la consola rechaza la recuperación vacía) · **DT-15S1-03** (`HogarEnMemoria` no cumple `CuentasDeResidentes`; previa, oculta porque las pruebas no se compilan) · **DT-15S1-04** (el paso 5 satura el runner de macOS)                               |

**Verificación:** `./scripts/verificar-etapa.sh --con-base` sobre `4e816ab` —con los arreglos de las tres intermitentes—, con la base preparada como en CI (`--con-pruebas`) → «VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe» (D-112). 31 de 31 pasos, 5204 pruebas de TypeScript (21 más que `develop`) y 367 de Dart, tres corridas idénticas; dominio 96,20 %, aplicación 97,14 %, global 87,78 % de líneas, como sobre `7e4a6df`, el primer cierre. Dos corridas anteriores se interrumpieron a propósito (informe, §6): la IP privada de una prueba de A2, que cazó CI (KPI-11), y la segunda entrada de la carrera de A1. El CI sobre `acebd40` cayó dos veces en el verificador de macOS por las tres intermitentes; Sobre `4e816ab`, los cuatro trabajos del CI en verde, también el verificador de macOS. Después sólo entró documentación: este cierre.

---

## Corrección `etapa-15m-alerta-archivada-aislada` — la alerta archivada, contada donde nadie más escribe (H-15M-C01) · **CERRADA** · 2026-10-03

**Rama:** `etapa-15m-alerta-archivada-aislada` · **Base:** `develop` (`7b31083`, merge del PR #41) · **PR:** [4rg3n15/NextResidential#44](https://github.com/4rg3n15/NextResidential/pull/44), sin fusionar
**Informe:** [`etapas/ETAPA-15M-alerta-archivada-aislada.md`](etapas/ETAPA-15M-alerta-archivada-aislada.md)

> **Destino corregido el 2026-10-04.** El PR #44 se fusionó por error en `main` (`6e9b5f2`), contra §2.5. Estos commits llegan a `develop` por la rama `etapa-15m-alerta-archivada-en-develop`; `main` vuelve a su estado anterior (`7a63c17`).

> **Esta corrección NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Sólo toca pruebas: ni una línea de producto.

| Qué                           | Cómo queda                                                                                                                                                                                                                                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H-15M-C01 · la alerta         | **CORREGIDO.** «Una alerta archivada deja de contar como pendiente» medía `antes + 1` sobre las alertas de COP_A mientras `persistencia-operativa-pg` las abría y resolvía en paralelo (CI, `2980cf8`: «expected 73 to be 74»). Ahora cuenta en una copropiedad propia: 0, 1, 0                                        |
| Cómo se vio                   | Rara con dos ficheros (0 de 150); con ruido de alertas en COP_A, la original falla 17 de 20 en los dos sentidos y la corregida 0 de 70 (las 30 últimas, con la versión final). Sin `AND archivada_en IS NULL`, roja con «expected 1 to be +0»                                                                          |
| H-15M-C02 · fuera del encargo | **CORREGIDO.** «Aparece en Dispositivos» chocaba con `dispositivos_endpoint_uk` contra los equipos que corridas anteriores dejaron activos en COP_A (1 de 150 en el bucle sobre `develop`). Da de alta en la misma copropiedad propia                                                                                  |
| Lo que cuesta                 | Una alta de copropiedad por corrida, no una por prueba: cada alta toca la secuencia de pools y la lista global que miran `porteros-por-identificador-pg` y `copropiedades-pg` (anotadas en DT-15M-C01)                                                                                                                 |
| Deuda nueva                   | **DT-15M-C01**: once ficheros contra la base dependen del estado compartido de COP_A o de la historia de la base, con el detalle y los arreglos propuestos en el §8 del informe · **DT-15M-C02** a **DT-15M-C04**: tres fallos intermitentes ajenos, cada uno tumbó una corrida del verificador (C04, en el CI del PR) |

**Verificación:** `./scripts/verificar-etapa.sh --con-base` sobre `99669c8`, con la base preparada como en CI (`--con-pruebas`) → «VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe» (D-112). 31 de 31 pasos, 4974 pruebas de TypeScript y 367 de Dart, tres corridas idénticas; dominio 96,20 %, aplicación 97,10 %, global 87,22 % de líneas. Las dos corridas anteriores, sobre el mismo commit, salieron FALLIDAS por causas ajenas a esta corrección, y el informe dice cuáles (H-15R-C01 con la base recién sembrada; DT-15M-C02 y DT-15M-C03). CI verde en `825a905`, con el verificador de macOS; en `5db26dd`, sólo documentación, una roja ajena en su paso 5 (DT-15M-C04).

---

## Corrección `etapa-15r-proveedor-del-edge` — el Edge compone su proveedor de equipos como la API (DT-15R-09) · **CERRADA** · 2026-10-03

**Rama:** `etapa-15r-proveedor-del-edge` · **Base:** `etapa-15r-huecos-y-decisiones` (`5566b8e`), **no** `develop`: lo que corrige sólo existe en esa rama, sin fusionar · **PR:** [4rg3n15/NextResidential#43](https://github.com/4rg3n15/NextResidential/pull/43), contra `etapa-15r-huecos-y-decisiones`: se fusiona antes que el de la 15-R ([4rg3n15/NextResidential#42](https://github.com/4rg3n15/NextResidential/pull/42)); contiene su cierre (`0ce8ed5`, fusionado en `da64043`)
**Informe:** [`etapas/ETAPA-15R-proveedor-del-edge.md`](etapas/ETAPA-15R-proveedor-del-edge.md)

> **Esta corrección NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Probada contra la terminal simulada de `providers` y el túnel en memoria con
> el protocolo de verdad; nada contra un equipo real.

| Qué                           | Cómo queda                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DT-15R-09 · el reloj          | **CERRADO.** Con puente, el alta por el Edge lee la hora del equipo con `EQUIPOS_DESVIO_DE_RELOJ_S` de su `.env`; 13 h atrasado vuelve a la nube como `RelojDelEquipoDesviado`, sin escribir nada                                                                                                                                                                                     |
| Los otros ajustes             | Zona y plantilla horaria del alta, límites de la foto, plazo por petición y **puerto RTSP** (no estaba en el enunciado): los siete de la API, con sus nombres, valores por omisión y límites                                                                                                                                                                                          |
| `pnpm sitio:edge`             | Juzga la hora de cada equipo con el mismo umbral que frena el alta (eran 60 s fijos)                                                                                                                                                                                                                                                                                                  |
| Que no vuelvan a separarse    | Prueba de paridad contra el esquema de la API y guardián: toda variable que la API pasa al proveedor tiene su pareja en el Edge, o una exención con motivo                                                                                                                                                                                                                            |
| H-15R-C01 · fuera del encargo | **CORREGIDO.** La DoD del Edge en sitio (`edge-en-sitio-pg`) contaba como permitida CONC001, que no está en la semilla: la deja la prueba SQL de KPI-03 en el paso 12, después de la suite. Con la base que pide el paso 1c (`--con-semillas`) fallaba (12 de 15), también sin esta corrección; pasaba en CI porque antes corre `--con-pruebas`. Ahora la prueba pone su precondición |
| Deuda nueva                   | **DT-15R-C01** (el adaptador del Edge sin `traza`), **DT-15R-C02** (la vuelta atrás del audio no llega al Edge), **DT-15R-C03** (apertura por el túnel cumplida tras el «no aceptado» de la nube); **H-15R-C02**, previa (una prueba del tablero que depende de las suites en paralelo)                                                                                               |

**Verificación:** `./scripts/verificar-etapa.sh --con-base` sobre `6050b05`, con la base recién sembrada (`--con-semillas`) → «VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe» (D-112). 31 de 31 pasos, 5183 pruebas de TypeScript (46 más que la 15-R, todas del Edge) y 367 de Dart, tres corridas idénticas; dominio 96,20 %, aplicación 97,18 %, global 87,77 % de líneas. La corrida anterior salió FALLIDA por H-15R-C01 —también sobre `5566b8e`—, corregido en `857ae2b`. Después sólo entró documentación: `da64043` (el cierre de la 15-R) y este cierre. En CI (macOS), sobre `2980cf8`, el verificador salió FALLIDO una vez por H-15R-C02 —una prueba previa del tablero que depende de las suites en paralelo, ajena a esta corrección—, que en el mismo job pasó en los pasos 5 y 14.

---

## Ronda `etapa-15r-huecos-y-decisiones` — huecos funcionales, decisiones del cliente y documentación · **CERRADA** · 2026-10-03

**Rama:** `etapa-15r-huecos-y-decisiones` · **Base:** `develop` (`7b31083`, merge del PR #41, la 15-U) · **PR:** [4rg3n15/NextResidential#42](https://github.com/4rg3n15/NextResidential/pull/42), sin fusionar
**Informe:** [`etapas/ETAPA-15R.md`](etapas/ETAPA-15R.md)

> **Esta ronda NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Nada de lo nuevo se ha ejercido contra un equipo real ni contra un despliegue
> real (DT-15R-01).

| Bloque | Qué deja                                                                                                                                                                                                                                                             |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | Códigos de recuperación del segundo factor, bloqueos de acceso y operaciones de dispositivo en PostgreSQL (0051): sobreviven al reinicio, un solo uso garantizado por la base                                                                                        |
| B      | **Web Push estándar sin Firebase** (P-23, ADR-036, C-53): cifrado y VAPID con `node:crypto`, suscripción por aparato (0052), «Avisar al residente» que envía y dice a cuántos llegó (DT-15N-02 cerrada); APK firmado e iPhone por PWA                                |
| C      | Puerta **libre o bloqueada** sólo por la administración, con motivo y plazo, vuelta automática que sobrevive al reinicio y franja en toda la consola (P-25, 0053); `close` como vuelta a normal por probar en sitio (S-15R-03)                                       |
| D      | SSE y audio **directos a la API** con billete de un solo uso; IP leída sólo de la cabecera de Netlify y firmada; `connect-src` sólo a la API (P-20, P-30, cierra C-37)                                                                                               |
| E      | E1–E8: escrituras retenidas al cambiar de copropiedad, claims de servicio reales (0054), recurrente con sus filas (C-54), cierre con Supabase caído, carrera de alertas, **cuarentena del Edge** (P-31), referencias largas (C-55), recuperación desactivada (AR-04) |
| F      | `seguridad/ACEPTACIONES_DE_RIESGO.md` (AR-05 nueva); **rotación de `EQUIPOS_LLAVE` con recifrado** (C-56, `CONEXION_SUPABASE.md` §13); guía de coturn (P-29)                                                                                                         |
| G      | README y manual de usuario al día, guías de visita archivadas, FCM retirado de los documentos derivados, atribución D-112 corregida en cinco fichas de esta página, registro recontado                                                                               |

**Verificación:** `./scripts/verificar-etapa.sh --con-base` sobre `5566b8e` → «VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe» (D-112). 31 de 31 pasos, 5137 pruebas de TypeScript y 367 de Dart, tres corridas idénticas; dominio 96,20 %, aplicación 97,18 %, global 87,66 % de líneas. Las dos corridas anteriores salieron FALLIDAS por defectos de la ronda, corregidos en `dbaf167` (la consola no compilaba: un gancho de React sin `use client`) y `5566b8e` (un `Pool` sin oyente de `error` en la herramienta de rotación).

---

## Ronda `etapa-15u-dependencias` — vulnerabilidades de dependencias (AR-02 no se acepta: se corrige; cierra C-51) · **CERRADA** · 2026-10-03

**Rama:** `etapa-15u-dependencias` · **Base:** `develop` (`57fddf5`, merge del PR #40) · **PR:** [4rg3n15/NextResidential#41](https://github.com/4rg3n15/NextResidential/pull/41), sin fusionar
**Informe:** [`etapas/ETAPA-15U.md`](etapas/ETAPA-15U.md)

> **Esta ronda NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Nada funcional cambia: la misma API sobre NestJS 11 y Express 5.

| Medición                      | Antes (`develop@57fddf5`)           | Después                                        |
| ----------------------------- | ----------------------------------- | ---------------------------------------------- |
| `pnpm audit --prod`           | **12** · 3 bajas, 9 moderadas       | **0** · «No known vulnerabilities found»       |
| `pnpm audit` (con desarrollo) | 30 · 6 bajas, 17 moderadas, 7 altas | 18 · 3 bajas, 8 moderadas, 7 altas (DT-15U-01) |

| Qué                     | Cómo queda                                                                                                                                                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependencias            | `@nestjs/*` 10.4.22 → 11.2.7 (todos a la vez), swagger 8.1.0 → 11.4.5, throttler 6.3.0 → 6.4.0, express 4.21.2 → 5.2.1; qs 6.16.0, body-parser 2.3.0 y file-type 21.3.4 llegan por la subida; ningún `override` nuevo, uno retirado                                  |
| Lo que la subida rompía | NestJS 11 deduplica por referencia (375 rutas, estado repartido) → una referencia por módulo dinámico; Express 5 anulaba el saneamiento de la consulta → se fija en la petición; parser `simple` → `extended` (H-13-13); `enableCors(any)` → `satisfies CorsOptions` |
| Contrato                | Swagger 11 tipa `enum: [true]` como `boolean` (antes `number`, y el cliente Dart habría fallado al leerlo); contrato, cliente TS y cliente Dart regenerados; el control del contrato tipado sube su cota de 6 a 9                                                    |
| Pruebas nuevas          | `rutas-del-enrutador.e2e` (el enrutador ve 174 de 174 endpoints, sin duplicados; ningún módulo dos veces) y `consulta-saneada.e2e` — verdes en la base, rojas con la subida antes de corregir                                                                        |
| R1                      | La suite completa, las regresiones de sitio (cámara 28/09, CRLF del SDP contra go2rtc real, cortes de la 15-O, rostro, apertura por punto), aislamiento, escalamiento, DoD de la 15-Q y DoD de dos procesos de la 15-Q2, **sin tocar una aserción**                  |
| Registro                | **AR-02 y H-13-26 CERRADOS** · **C-51 cerrada** · S-193 a S-196 · DT-15U-01 y DT-15U-02                                                                                                                                                                              |

**Verificación:** `./scripts/verificar-etapa.sh --con-base` sobre `f26da41` → «VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe» (D-112). 31 de 31 pasos, 4974 pruebas, tres corridas idénticas; dominio 96,20 %, aplicación 97,17 %, global 87,25 % de líneas. A mitad de la corrida cambió sólo un comentario (`7a64241`).

---

## Ronda `etapa-15q2-edge-puente` — el Edge como puente entre la nube y los equipos (P-27 = A, corrige la ETAPA 12 y la 15-Q) · **CERRADA** · 2026-10-02

**Rama:** `etapa-15q2-edge-puente` · **Base:** `develop` (`4849f4e`, merge del PR #39; no hay ninguna 15-U en `develop`, C-51) · **PR:** [#40](https://github.com/4rg3n15/NextResidential/pull/40), sin fusionar
**Informe:** [`etapas/ETAPA-15Q2.md`](etapas/ETAPA-15Q2.md) · **Decisión:** [ADR-035](decisiones/ADR-035-el-edge-es-el-puente-local-permanente.md) (sustituye en parte a ADR-034)

> **Esta ronda NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> La DoD corre con la API y el Edge en procesos distintos, contra PostgreSQL y
> los equipos SIMULADOS; nada contra un equipo físico ni contra un TURN real.

| Bloque | Qué queda                                                                                                                                                                                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | Túnel WebSocket saliente Edge → API (`/edge/tunel`), identidad de la 15-Q (HMAC, marca, nonce), protocolo v1 tipado con latido, plazos, ritmo, tamaño y canales de audio; un Edge por copropiedad; `/ready` y panel con «conectado / desconectado desde…»; alerta tras 30 s; UNA instancia (C-52) |
| B      | Los equipos reportan sólo al Edge; con nube decide la nube y ejecuta el Edge; sin respuesta a tiempo decide el Edge; nunca los dos (cierra DT-15Q-03, retira S-184); la API no se suscribe a equipos con puente                                                                                   |
| C      | `ProveedorEnrutado` detrás de los mismos puertos; contrato contra directo y vía Edge sin cambiar aserciones; con el Edge caído, 503 `EDGE_NO_DISPONIBLE` en el acto                                                                                                                               |
| D      | Credenciales sólo en el Edge (AES-256-GCM); en la nube referencia y huella; migración que borra de la nube sólo tras confirmar el Edge; reversión documentada y probada; go2rtc junto al Edge                                                                                                     |
| E      | Audio por el túnel < 2 s contra el simulado; WHEP hacia el go2rtc del Edge; STUN/TURN con credencial efímera; dónde va el TURN: P-29                                                                                                                                                              |
| R1     | Una copropiedad sin Edge puente funciona como antes; elección por copropiedad (`edge_gateways.puente`), nunca global                                                                                                                                                                              |

**Verificación:** `./scripts/verificar-etapa.sh --con-base` sobre `df8ec58` → «VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe». Las dos corridas anteriores salieron FALLIDAS (regresiones R1 en la consola y en el alta con RLS; frontera O2 y control de entorno); corregidas en `159fa4d` y `df8ec58`. En CI (macOS) sobre `7f45904`: «… correcta CON 2 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) …» (D-112 y el 5e, declarado sólo para macOS).

---

## Ronda `etapa-15q-edge-en-sitio` — Edge en sitio: contingencia real con los equipos (corrige la ETAPA 12, S-24) · **CERRADA** · 2026-10-02

**Rama:** `etapa-15q-edge-en-sitio` · **Base:** `develop` (`40f0250`, merge del PR #38) · **PR:** [#39](https://github.com/4rg3n15/NextResidential/pull/39), sin fusionar
**Informe:** [`etapas/ETAPA-15Q.md`](etapas/ETAPA-15Q.md) · **Decisión:** [ADR-034](decisiones/ADR-034-el-edge-es-contingencia.md) (P-27 = B, la opción que el agente recomendó) · **corregida en la 15-Q2:** P-27 = A, [ADR-035](decisiones/ADR-035-el-edge-es-el-puente-local-permanente.md), que sustituye en parte a ADR-034

> **Esta ronda NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> La DoD del Edge corre contra la API real con PostgreSQL y los equipos
> SIMULADOS de `packages/providers`; el corte de WAN con los equipos de verdad
> es el procedimiento de `DESPLIEGUE_EDGE.md` §9, pendiente de sitio (DT-15Q-04).

| Bloque | Qué queda                                                                                                                                                                                                                                                                                          |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1     | `GET /copropiedades/:id/reglas/instantanea?desde=`: versión publicada por hash (0049, consecutiva con candado), «sin cambios» con fe de vida, 409 si la nube va por detrás; identidad del Edge derivada por generación y validada en la aplicación; otra copropiedad → 404 y `auditoria_seguridad` |
| Q2     | Descarga cada `REGLAS_DESCARGA_SEGUNDOS` y al volver el WAN, en SQLite; la versión sólo avanza; hash verificado; cada decisión sella la versión y marca la caché obsoleta                                                                                                                          |
| Q3     | Escuchas de terminal y videoportero y receptor de Alarm Server local con el MISMO `packages/providers`; la cámara publica a los dos                                                                                                                                                                |
| Q4     | Sin nube: decide, abre la barrera o contesta a la terminal por `AccessPointProvider`, y el accionamiento viaja en la bandeja; la nube escribe la constancia atribuida al Edge                                                                                                                      |
| Q5     | `/hechos` y `/estado` con HMAC, marca y nonce; la cámara por secreto y origen (C-50); una interfaz; 8 MiB / 64 KiB; límite por IP con `Retry-After`; rotación documentada                                                                                                                          |
| Q6     | Sin regla en caché, niega; «escalar» sin WAN también niega (P-28)                                                                                                                                                                                                                                  |
| Q7     | `.env.example` del Edge con las 8 variables de sitio y el control `entorno-declarado` leyendo también `esquema-de-sitio.ts`; `pnpm sitio:edge`; `DESPLIEGUE_EDGE.md` reescrita                                                                                                                     |
| Q8     | DoD contra PostgreSQL: 30 min sin WAN, 20 accesos (15 aperturas), 20 eventos una sola vez en < 5 min con la primera respuesta perdida; paridad nube/Edge con datos reales                                                                                                                          |

**Verificación:** `./scripts/verificar-etapa.sh --con-base` sobre `fca3b32` → «VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe». La corrida anterior, sobre `b6881b0`, salió FALLIDA por la prueba de paridad de rostros (biometría en memoria frente a la base); corregida en `fca3b32`.

---

## Ronda `etapa-15p-guardia-intercom-y-puertas` — guardia virtual: audio bidireccional y puertas del videoportero · **CERRADA** · 2026-10-01

**Rama:** `etapa-15p-guardia-intercom-y-puertas` · **Base:** `develop` (`580ccc3`, merge del PR #37) · **PR:** [#38](https://github.com/4rg3n15/NextResidential/pull/38), sin fusionar
**Informe:** [`etapas/ETAPA-15P.md`](etapas/ETAPA-15P.md) · **Decisión:** [ADR-001, enmienda 1](decisiones/ADR-001-intercom-isapi-twowayaudio.md)

> **Esta ronda NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Medida y probada contra un videoportero simulado que sigue el manual de
> familia, no contra el DS-KD9633: su comprobación en sitio está en la lista
> final del informe y en la guía §8.4.1 y §8.4.2.

| Bloque | Qué queda                                                                                                                                                                                                                                                 |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0      | Proceso vigilado; escucha con backoff que sigue; sesión renovada en el middleware; WHEP abortable; canal 101 por omisión y cómo pasar a H.264; `keepAlive` en los dos pools                                                                               |
| P1     | Banco con Chromium y mismo reloj contra el simulado en red: B (WebSocket) ida 37 ms y vuelta 70 ms sin canales huérfanos; A (go2rtc) roba el canal y lo deja tomado; el anterior no entrega la ida                                                        |
| P2     | Billete de un uso, WebSocket por el mismo origen, turno del dominio, pulsar para hablar, cortes del servidor, `close` al colgar, constancia sin audio (0047), micrófono sólo en `/guardia`, límites propios; `GUARDIA_AUDIO_TRANSPORTE=http` vuelve atrás |
| P3     | Árbol de salidas leído del equipo (R3, tope 3); `puntos_de_acceso` (0048) con nombre editable; selector de punto en la guardia y apertura por punto con motivo, atribuida y auditada; sólo `open` (P-25)                                                  |
| P4     | Video bidireccional descrito en el ADR, sin andamiaje                                                                                                                                                                                                     |
| P5     | Unitarias, contra PostgreSQL como `authenticated`, de punta a punta por la API y recorrido de la consola (paso 9b) con el equipo simulado como oráculo                                                                                                    |

**Verificación:** `./scripts/verificar-etapa.sh --con-base` sobre `869029f` → «VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe».

---

## Corrección `etapa-15o-resiliencia-pg` — un corte de PostgreSQL ya no tumba la API (sitio, 30/09) · **CERRADA** · 2026-09-30

**Rama:** `etapa-15o-resiliencia-pg` · **Base:** `develop` (`d4620ca`, merge del PR #36) · **PR:** [#37](https://github.com/4rg3n15/NextResidential/pull/37), sin fusionar
**Informe:** [`etapas/ETAPA-15O.md`](etapas/ETAPA-15O.md)

> **Esta corrección NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Probada contra PostgreSQL real con cortes de verdad, no contra el pooler de
> Supabase: su comprobación en sitio está en la lista final del informe.

| Requisito              | Qué queda                                                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · oyentes            | `pool.on('error')` en el pool, la sonda, pg-boss y los guiones; control `frontera-conexiones.mjs` (42 faltas en `develop`, 0 aquí) en verificador, CI y prueba negativa |
| 2 · préstamo           | Un único `conCliente` para los 36 préstamos de la API; los 2 de los guiones, su gemelo `.mjs`                                                                           |
| 3 · pg-boss            | `'error'` atendido y publicado; reintento solo con espera creciente; `/ready` lo dice                                                                                   |
| 4 · presupuesto        | `PG_POOL_MAX` 10, `PGBOSS_POOL_MAX` 2, `SUPABASE_POOLER_MAX_CLIENTES` 15; la API no arranca si no cabe; `sitio:ensayo` lo juzga                                         |
| 5 · volcado            | Lotes de 500 con ventana de 250 ms y 500 eventos/s; pedir sólo lo nuevo no existe en la suscripción (P-24)                                                              |
| 6 · `/ready` y consola | 503 `agotado` / `no-disponible` con motivo; avisos; «Base de datos no disponible»                                                                                       |
| 7 · pruebas            | Cortes reales ociosos, a mitad de transacción y a mitad de lectura; vistas fallar; regresión de la cámara intacta                                                       |

**Verificación:** `./scripts/verificar-etapa.sh --con-base` sobre `c28585e` → «VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe» (el declarado es **D-112** —las pruebas saltadas del arranque en frío, que ejerce el paso 12b— · _atribución corregida en la 15-R: decía «el 5e», que en Linux se ejerce_). 31 de 31 pasos, 4322 pruebas de TypeScript y 367 de Dart, tres corridas idénticas; dominio 96,20 %, aplicación 96,74 %, global 86,24 %. La primera corrida salió FALLIDA: el reintento de lecturas también repetía cuando la base no se podía abrir (una prueba de límites pasó de 0,4 s a 4,2 s) y una rama del guion de la base no la ejercía ninguna prueba negativa; las dos se corrigieron en `c28585e`.

---

## Ronda `etapa-15n-video-y-guardia` — video en vivo en los tres equipos, guardia que se abre sola y pendientes del 28 y 29/09 · **CERRADA** · 2026-09-30

**Rama:** `etapa-15n-video-y-guardia` · **Base:** `develop` (`ec34e80`, merge del PR #35) · **PR:** [#36](https://github.com/4rg3n15/NextResidential/pull/36), sin fusionar
**Informe:** [`etapas/ETAPA-15N.md`](etapas/ETAPA-15N.md) ·
**Guía:** [`guias/archivo/PROXIMA-VISITA-15N.md`](guias/archivo/PROXIMA-VISITA-15N.md) (archivada en la 15-R)

> **Esta ronda NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Lo que toca un equipo está probado contra go2rtc real y el simulador; su
> comprobación en sitio está en la lista final del informe, equipo por equipo.

| Bloque       | Qué queda                                                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0            | V1 confirmado, V3 refutado (dos causas reales en el código), G3 sin mayor/menor (C-46), con archivo:línea antes del código                               |
| V1           | La oferta SDP llega entera a go2rtc; una sola tubería HTTP; prueba extremo a extremo por HTTP con go2rtc real, vista fallar                              |
| V2 · V3 · V5 | Canal que el equipo declara; Digest RTSP con un desafío y el algoritmo pedido; la causa del video en palabras; candidato y puerto WebRTC comprobados     |
| V4           | `sitio:video` no arranca con `api`/`rtsp` en trace/debug; riesgo aceptado en ADR-022 (enmienda 1)                                                        |
| G1–G4        | P-22 decidida; una alerta por disparador; la atención se abre sola con el video de ESE equipo; aviso y sonido en otras pantallas; preferencias (0046)    |
| R2           | Reloj leído antes del alta; negaciones del equipo con su motivo; hora de recepción con marca; el respaldo sólo lee la hora                               |
| R1           | Reenvío de plantillas vigentes al equipo que empieza a admitirlas (cola pg-boss); «Enviar a equipos pendientes»; estados «pendiente» y «omitido»         |
| A1 / A2      | Caídas resueltas solas al volver; la baja archiva; «Seleccionar todas las visibles»; filtros por fecha                                                   |
| R3           | El paso 3 del ensayo juzga la forma de alta que se usará                                                                                                 |
| O1–O6        | DT-15M-04 a 06 cerrados; `concurrency` en CI; «secreto obsoleto» en `entorno:diff`; búsqueda activa: 6 hallazgos, 5 corregidos y 1 declarado (DT-15N-01) |
| No hecho     | El recorrido 12c con Chromium y video sintético: no viable en este entorno (DT-15N-03)                                                                   |

**Verificación:** `./scripts/verificar-etapa.sh --con-base` sobre `0e4cdcb` → «VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe» (el declarado es **D-112** —las pruebas saltadas del arranque en frío, que ejerce el paso 12b— · _atribución corregida en la 15-R: decía «el 5e», que en Linux se ejerce_). 31 de 31 pasos, 4238 pruebas de TypeScript y 367 de Dart, tres corridas idénticas; dominio 96,20 %, aplicación 96,73 %, global 86,05 %. Las tres corridas anteriores salieron FALLIDAS y el informe dice por qué (una de ellas destapó un defecto real de la G, corregido en `0e4cdcb`).

---

## Ronda `etapa-15m-equipos-y-consola` — visita del 29/09: terminal, videoportero, video, indicadores y consola · **CERRADA** · 2026-09-29

**Rama:** `etapa-15m-equipos-y-consola` · **Base:** `develop` (`a46cb56`, merge del PR #34) · **PR:** [#35](https://github.com/4rg3n15/NextResidential/pull/35), sin fusionar
**Informe:** [`etapas/ETAPA-15M.md`](etapas/ETAPA-15M.md) ·
**Guía:** [`guias/archivo/VISITA-29-09.md`](guias/archivo/VISITA-29-09.md) (archivada en la 15-R) ·
**Contrato:** extensión **E-06** (D-12)

> **Esta ronda NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Todo lo que toca un equipo está probado contra un simulador que reproduce la
> evidencia del 28/09, y su comprobación en sitio está en la lista final del
> informe, equipo por equipo.

| Bloque          | Qué queda                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0               | Evidencia confirmada con archivo:línea antes del código; una línea de §0.3 corregida después                                                                  |
| E1 / C8         | Un 401 al nonce heredado nunca es la clave; UN intento real por credencial; bloqueo declarado por el equipo; la escucha con sesión Digest propia              |
| E2 / C1         | go2rtc por `PATCH`, sin `streams:` ni credenciales en disco, `#backchannel=0`, sin STUN; canales reales en la ficha; errores en palabras                      |
| E3 / C2         | El alta por capacidades: persona `normal` si no hay `visitor`, carga por `POST FaceDataRecord` si no hay `setUp`, y nada a medias si no hay operación         |
| E5 / C7, E4     | Un solo estado por equipo; alertas por condición con archivo y motivo (0044); receptores en la ficha y el huérfano apagado                                    |
| C6              | Secreto de Alarm Server por cámara (0045); sesiones de audio por videoportero; ensayo, puesta en marcha y respaldo desde el registro                          |
| C10, C4, C9, C5 | Selector de equipo en vivo; bajas con motivo de equipos (rostros retirados antes) y de residentes; confirmación de placa; fechas DD-MM-YYYY                   |
| C3              | El residente en la consola web, con los endpoints de la app (D-12, C-44, E-06)                                                                                |
| Otros fallos    | 503 al arrancar, cierre ordenado con el pool el último, «API caída» distinguible, respaldo por familia y serie                                                |
| Búsqueda activa | 8 de 12 defectos corregidos en guardia, portería, eventos, dispositivos y visitantes; los otros 4 con su motivo (P-22, DT-15M-04 a 06)                        |
| Verificador     | El paso 5 pone go2rtc real (v1.9.14 oficial, fijada por huella) en vez de saltarse sus pruebas; destapó que go2rtc oficial devuelve la clave por su API local |

**Verificación:** `./scripts/verificar-etapa.sh --con-base` → «VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe» (el declarado es **D-112** —las pruebas saltadas del arranque en frío, que ejerce el paso 12b— · _atribución corregida en la 15-R: decía «el 5e», que en Linux se ejerce_). 31 de 31 pasos, 4025 pruebas de TypeScript y 367 de Dart, tres corridas idénticas; dominio 96,20 %, aplicación 96,65 %, global 85,84 %. Las dos corridas anteriores salieron FALLIDAS y el informe dice por qué (§6).

---

## Ronda `etapa-15l-entrega-final` — entrega final en sitio · **CERRADA** · 2026-09-27

**Rama:** `etapa-15l-entrega-final` · **Base:** `develop` (`fc353bc`)
**Informe:** [`etapas/ETAPA-15L.md`](etapas/ETAPA-15L.md) ·
**Decisiones:** [`ADR-031`](decisiones/ADR-031-porteros-por-numero-lista-blanca-y-modo-pruebas.md) · [`ADR-032`](decisiones/ADR-032-consentimiento-declarado-por-quien-registra.md) · [`ADR-033`](decisiones/ADR-033-app-en-release-por-la-red-local.md) (corrección) ·
**Contrato:** extensión **E-05** (F4)

> **Esta ronda NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Deja todo lo que se puede probar sin el equipo delante probado contra
> simulador, y la lista de lo que sólo se prueba en sitio escrita en el
> informe («Requiere prueba en sitio»).

| Bloque       | Qué queda                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0            | Informe de bloqueos con archivo:línea, antes de escribir código                                                                                                                                                                                                                                                                                                                                                                                                 |
| A            | Verificación remota armada, apertura con desenlace, persona con vigencia, videoportero por capacidad, cámara que decide marcada, credencial sin bucle                                                                                                                                                                                                                                                                                                           |
| B            | `eventos_de_equipo` append-only (0040) y línea de tiempo en vivo; la fuga entre copropiedades del Bloque 0.4, cerrada con prueba negativa                                                                                                                                                                                                                                                                                                                       |
| C, D         | Dispositivos editables sin reiniciar (0041), «Probar conexión» por capacidad, latido real, códec leído por RTSP, video con estados, `pnpm sitio:video`                                                                                                                                                                                                                                                                                                          |
| E            | La app dice por qué no llega al servidor; guía del iPhone. E1 sustituido (el Bloque 0.5 mostró que no arreglaba nada)                                                                                                                                                                                                                                                                                                                                           |
| F            | Flujo de visitantes del cliente en consola y app (0043, ADR-032)                                                                                                                                                                                                                                                                                                                                                                                                |
| G            | El superadministrador edita el perfil de los residentes                                                                                                                                                                                                                                                                                                                                                                                                         |
| H            | Porteros por número y pool (0042), lista blanca de IP, modo pruebas, IP real del cliente (ADR-031)                                                                                                                                                                                                                                                                                                                                                              |
| I            | Cero códigos del proyecto en la interfaz: prueba sobre el fuente de la consola y de la app, y sobre las pantallas reales en el recorrido                                                                                                                                                                                                                                                                                                                        |
| J            | `pnpm sitio:ensayo`, `--capturar`/`--restaurar` y `ENTREGA_EN_SITIO.md`                                                                                                                                                                                                                                                                                                                                                                                         |
| Corrección   | App en Release desde el ícono y ATS local en las tres configuraciones; «Servidor» y «Cambiar servidor»; recarga de 20 s, situación real y notificaciones; bandeja persistente; la consola recarga sus listas; el portero ve el nombre de cada equipo; H-15L-C01 (ADR-033)                                                                                                                                                                                       |
| Corrección 2 | Foto desde la galería por el mismo camino; la casilla con el nombre del visitante como única constancia (ADR-032, enmienda); «Enviar eventos a este Mac» y «Verificación remota: activar/desactivar» en la ficha; pool precalentado, caché del registro y duración por decisión; aviso de equipos simulados; pg-boss frente al host IPv6; «Rostros» en la ficha; HikCentral en el ensayo y la ficha; bucle local del portero; omitir por falta de base es FALLO |

**Verificación:** `./scripts/verificar-etapa.sh --con-base` → «VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe» (el declarado es **D-112** —las pruebas saltadas del arranque en frío, que ejerce el paso 12b—; el 5e sólo se declara en macOS y en esta corrida, en Linux, se ejerció y pasó · _atribución corregida en la 15-R: decía «el 5e», que en Linux se ejerce_). 31 de 31 pasos, 3855 pruebas, tres corridas idénticas. Extracto literal en el §6 del informe.

**Verificación de la corrección:** `./scripts/verificar-etapa.sh --con-base` → «VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe» (el declarado es **D-112** —las pruebas saltadas del arranque en frío, que ejerce el paso 12b—; el 5e sólo se declara en macOS y en Linux se ejerció y pasó · _atribución corregida en la 15-R: decía «el 5e», que en Linux se ejerce_). 31 de 31 pasos, 3990 pruebas, tres corridas idénticas; CI verde en `d984fb4`. La primera corrida local salió FALLIDA por una base levantada a mano con 100 conexiones; está dicho en el informe.

**Verificación de la corrección 2:** `./scripts/verificar-etapa.sh --con-base` → «VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe» (tercera ejecución: la primera cayó por la frontera de extensibilidad y la carrera de `generacion-padron`; la segunda destapó H-15L-C02, un falso verde que el guardián del ítem 10 hizo visible). API 1551, consola 552, equipos 994, dominio 438, Edge 101, configuración 144, app 361; ninguna omisión por falta de base.

---

## Ronda `etapa-15k-hallazgos-de-sitio` — lo que encontró la primera visita a sitio · **CERRADA** · 2026-09-26 · anexo de sitio 2026-09-27

**Rama:** `etapa-15k-hallazgos-de-sitio` · **Base:** `develop` (`5cceb89`, con el PR #32)
**Informe:** [`etapas/ETAPA-15-K-hallazgos-de-sitio.md`](etapas/ETAPA-15-K-hallazgos-de-sitio.md) ·
**Decisiones:** [`ADR-029`](decisiones/ADR-029-consentimiento-presencial-del-titular.md) · [`ADR-030`](decisiones/ADR-030-atestacion-del-instalador.md) ·
**Contrato:** extensión **E-04** (D-10 y D-11)

> **Esta ronda NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> La primera visita (26/09/2026) conectó la API con la terminal y el
> videoportero, y la consola no dejó operarlos: nunca se había probado de punta
> a punta contra la API real. La próxima visita sigue
> [`VALIDACION_HIKVISION_EN_SITIO.md`](guias/VALIDACION_HIKVISION_EN_SITIO.md) §V, ya corregida.

| Id             | Qué pasó en sitio                                                                              | Estado                                                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H-SITIO-01** | Cámara «decide sola» con `barrierGateOper = 0` y el alta no quedaba registrada                 | **INSTRUMENTADO** · se registra como rechazada con su crudo; salida por D-11 (C-38)                                                               |
| **H-SITIO-02** | Dispositivos y tablero leían siempre la memoria                                                | **CORREGIDO**                                                                                                                                     |
| **H-SITIO-03** | El superadministrador no podía comprobar el consentimiento (403)                               | **CORREGIDO**                                                                                                                                     |
| **H-SITIO-04** | La terminal rechazó la carga de la plantilla con 400                                           | **INSTRUMENTADO** · dos causas demostrables corregidas; hipótesis H4-3 y H4-4                                                                     |
| **H-SITIO-05** | Verificación remota de la terminal «desconocida»                                               | **CORREGIDO**                                                                                                                                     |
| **H-SITIO-06** | `start:dev` (tsx) caía al arrancar                                                             | **CORREGIDO** · reabierto en el anexo: con `tsx` el `ValidationPipe` no validaba; `start:dev` compila con `tsc` y la API no arranca sin metadatos |
| **H-SITIO-07** | pg-boss por IPv6 en una red sólo IPv4                                                          | **CORREGIDO**                                                                                                                                     |
| **H-SITIO-08** | El proxy de la consola no reenviaba `PUT`                                                      | **CORREGIDO**                                                                                                                                     |
| **H-SITIO-09** | Biblioteca de rostros del videoportero «desconocida»                                           | **CORREGIDO**                                                                                                                                     |
| **H-SITIO-10** | Enlace y QR de consentimiento con URL de bucle local                                           | **CORREGIDO**                                                                                                                                     |
| **H-SITIO-11** | La app en iPhone físico sin conexión con la API                                                | **CORREGIDO**                                                                                                                                     |
| **H-SITIO-12** | La segunda orden a cada equipo, rechazada como «usuario o clave» (Digest)                      | **CORREGIDO**                                                                                                                                     |
| **H-SITIO-13** | «OK» del equipo y la puerta no se movió                                                        | **CORREGIDO** · causa demostrada en el anexo (espacio de nombres y `version="2.0"`); `--abrir` lo verifica en sitio                               |
| **H-SITIO-14** | La escucha de la terminal no dejaba ni una línea                                               | **CORREGIDO** · el JPEG dentro del flujo, solo, no lo explica: el primer evento lo perdía `currentEvent`                                          |
| **H-SITIO-15** | La terminal rechaza con 400 `badXmlContent` una escritura de cuerpo vacío, antes de autenticar | **CORREGIDO** · y el diagnóstico propio sondeaba `FDLib/Count` y `FDSearch` con un `POST` vacío                                                   |
| **H-15K-01**   | Cambiar de copropiedad y crear en el acto puede escribir en la anterior                        | **Reportado**                                                                                                                                     |
| **H-15K-02**   | La baja de persona usaba la ruta de la serie del videoportero                                  | **CORREGIDO**                                                                                                                                     |
| **S-62**       | La API se conecta con un rol que omite la RLS; ocho repositorios dependen de ello              | **Supuesto declarado** · DT-15K-02                                                                                                                |

**Causa raíz, cerrada:** el recorrido de la consola (paso 13b) contra la API
real con el adaptador real, PostgreSQL y el simulado por HTTP —que se comporta
como los equipos de sitio—, y su prueba negativa (13c), que reintroduce
H-SITIO-02, 03, 08, 13 y 15 y exige que el recorrido los nombre. El guion de
sitio, con `--abrir`, en el paso 12e.

**Verificador:** seis corridas finales. Antes del anexo, las tres primeras **FALLIDAS** destaparon el umbral de ramas propio de `@ncr/providers` (88,95 % → 90,12 % con pruebas), un paso 5 que no nombraba la roja y dos pruebas de la ronda sin aislamiento; la cuarta, sobre `967fb4e`, correcta. Tras el anexo, la quinta, sobre `c4e0efa`, **FALLIDA** en el paso 9: el control de la suite no decía por qué un fichero de prueba no cargaba (corregido; la causa de aquella vez no se reprodujo, DT-15K-08); y el CI de macOS destapó un doble de GoTrue más estricto que GoTrue con el TOTP (corregido). La sexta, sobre `47373df`: **correcta, 30 de 30 pasos sin una sola ✗** (veredicto literal en el informe, §6).

---

## Corrección `etapa-15j-patron-en-hora-local` — el patrón recurrente en la hora de la copropiedad · **CERRADA** · 2026-09-26

**Rama:** `etapa-15j-patron-en-hora-local` · **Base:** `develop` (`a7b7dc0`, con el PR #31)
**Informe:** [`etapas/ETAPA-15-J-patron-en-hora-local.md`](etapas/ETAPA-15-J-patron-en-hora-local.md)

> **No es una etapa ni cambia el estado de la 15**, que sigue BLOQUEADA sólo por
> `BE-02`. Corrige un defecto reportado en la 15-I.

| Id           | Qué                                                                                                                                            | Estado                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **H-15I-05** | La franja del patrón, guardada en hora local, se reconstruía con desplazamiento 0 en las dos lecturas del repositorio                          | **CERRADO** · `zona_horaria` en la misma consulta + Intl con el Reloj      |
| **H-15I-06** | La recurrente desde la app falla cerrada                                                                                                       | **Sigue cerrada**: quitar la guarda no basta (H-15J-01)                    |
| **H-15J-01** | El adaptador del residente crea la autorización `recurrente` sin escribir sus filas de patrón; el disparador diferido de la 0013 la rechazaría | **Reportado** · no se corrige aquí (fuera de alcance)                      |
| **H-15J-02** | El horario de zona se resuelve con el `now()` de SQL, no con el Reloj inyectado                                                                | **Observación** · sin efecto en Bogotá (sin horario de verano); no se toca |

**Prueba:** `apps/api/test/patron-en-hora-local-pg.test.ts` contra PostgreSQL
real: **5 de 9 en rojo sin la corrección, 9 de 9 en verde con ella**.

**Verificador:** una sola corrida, **correcta: 26 de 26 pasos sin una sola ✗**
(veredicto literal en el informe, §6).

---

## Ronda `etapa-15i-residentes-y-app` — Bloque B, sesión 2: residentes y app, hasta la puerta del sitio · **CERRADA** · 2026-09-26

**Rama:** `etapa-15i-residentes-y-app` · **Base:** `develop` (`aa2a764`)
**Informe:** [`etapas/ETAPA-15-I-residentes-y-app.md`](etapas/ETAPA-15-I-residentes-y-app.md) ·
**Decisiones:** [`ADR-025`](decisiones/ADR-025-codigos-de-ocupante-derivados.md) · [`ADR-026`](decisiones/ADR-026-tope-de-vehiculos-propios-en-la-base.md) · [`ADR-027`](decisiones/ADR-027-punto-de-extension-de-aprobacion.md) · [`ADR-028`](decisiones/ADR-028-la-consola-en-netlify-y-la-api-en-un-servidor.md) ·
**Contrato:** extensión **E-03**, con las decisiones D1–D9 del cliente

> **Esta ronda NO cierra la ETAPA 15, que queda BLOQUEADA sólo por `BE-02`.**
> Fusionada, lo único que falta de la 15 es ir a sitio: registrar los tres
> equipos desde la consola y ejecutar los 16 escenarios desde la consola y la
> app, siguiendo [`VALIDACION_HIKVISION_EN_SITIO.md`](guias/VALIDACION_HIKVISION_EN_SITIO.md) §V.

### Lo que ahora está

| Qué                                       | Cómo se impone                                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** · acceso por código                | Código corto de la copropiedad (la consola acepta también el NIT), usuario y contraseña en app y consola; `POST /auth/acceso`               |
| **Primer ingreso del residente**          | Cambio de contraseña en el servidor, alta con su vivienda y declaración de ocupantes con aviso de que es DEFINITIVA (D6)                    |
| **D5 a** · vehículos propios              | Tope de 2 por vivienda impuesto por la base, no por el código (ADR-026)                                                                     |
| **D5 b** · vehículos de terceros          | Por autorización con día y franja, sin tope                                                                                                 |
| **D5 c** · punto de extensión             | `PoliticaDeAprobacion` en los dos casos de uso de creación; un estado no persistible **falla cerrado** (ADR-027)                            |
| **Consentimiento del visitante**          | QR, «compartir» y estado en vivo desde la app; cámara real del teléfono con las medidas de calidad de la consola                            |
| **D7** · llamar a portería                | Botón en el perfil que marca el teléfono registrado de la copropiedad                                                                       |
| **Listas negras**                         | Rutas y pantalla para vetar y levantar (HU-35, RN-07); la placa se normaliza y el documento se resuelve a una persona                       |
| **Ensayo de los 16 escenarios por canal** | `apps/api/test/ensayo-en-sitio-pg.test.ts` contra PostgreSQL real, en SIMULADO: 24 de 26 filas en verde; V2 y V6 son procedimiento de sitio |

### Lo que se encontró por el camino

| Id                  | Qué                                                                                                                                | Estado                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **H-15I-01**        | El nivel de acceso se comparaba por nombre (`acceso_completo`) y el catálogo lo llama `completo`: ningún residente podía autorizar | Corregido · manda `permite_autorizar`            |
| **H-15I-02**        | Ninguna migración creaba los niveles de acceso de una copropiedad nueva: toda vinculación de residente se rechazaba                | Corregido · 0038                                 |
| **H-15I-03**        | La visita de un visitante nuevo desde la app daba 500 contra la base real: faltaban columnas NOT NULL                              | Corregido                                        |
| **H-15I-04**        | La API rechazaba un opcional enviado como `null` en el acceso                                                                      | Corregido · nulo = ausente                       |
| **H-15I-05**        | La persistencia guarda la franja de un patrón semanal en hora local y la relee como UTC                                            | **CERRADO en la 15-J** · sin migración           |
| **H-15I-06**        | La recurrente desde la app habría abierto a la hora equivocada por H-15I-05                                                        | Falla cerrada con RN-22 · sigue así por H-15J-01 |
| **H-15I-07**        | Toda lectura de placa con foto fallaba al persistirse: la ruta iba a una columna UUID                                              | Corregido · registro en `evidencias`             |
| **H-15I-08**        | Un número de empleado no UUID reventaba la consulta de identidad de la terminal                                                    | Corregido · desconocido                          |
| **H-15I-09**        | Una lectura dudosa abría la barrera sola (CU-01 3a)                                                                                | Corregido · la abre la portería con motivo       |
| **H-15I-10**        | La app suprimía la plantilla a las 24 h de la captura, no al final de la visita                                                    | Corregido · RN-11                                |
| **H-15I-11**        | El paso 7 del verificador corría cada suite con un búfer de 1 MiB; la de la API, en verde, escribe 1,1 MB y moría sin informe      | Corregido · 64 MiB y la causa visible            |
| **H-15I-12**        | Dos saneadores del dominio con regex de controles literales: `pnpm lint` en rojo                                                   | Corregido · filtro por punto de código           |
| **H-15I-13**        | `fechaNacimiento` del perfil sin longitud máxima (§2.7.4)                                                                          | Corregido · `@MaxLength(10)`                     |
| **H-15I-14**        | El recorrido de la app no comprobaba lo tecleado y el motor de Flutter web podía comerse la primera pulsación                      | Corregido · se lee y se reescribe                |
| **C-37** · **P-20** | Netlify (D8) frente al SSE y el audio de portería y guardia                                                                        | **Reportado** · no bloquea: en sitio, portátil   |

**Abierto y no bloqueante para BE-02:** S-38 (por ratificar), AR-01 a AR-04 y el
riesgo residual de H-15B-1 (aceptaciones sin firmar), P-19, P-20 y H-15J-01
(H-15I-05, cerrado en la 15-J).

**Verificador:** tres corridas; la tercera, sobre `f01e274`, **correcta, 26 de 26
pasos sin una sola ✗**. Las dos primeras destaparon H-15I-11 a H-15I-14
(detalle en el informe, §6).

---

## Ronda `etapa-15h-identidad-y-porteria` — Bloque B, sesión 1: identidad por usuario y portería · **CERRADA** · 2026-09-26

**Rama:** `etapa-15h-identidad-y-porteria` · **Base:** `develop` (`80b8d5b`)
**Informe:** [`etapas/ETAPA-15-H-identidad-y-porteria.md`](etapas/ETAPA-15-H-identidad-y-porteria.md) ·
**Decisiones:** [`ADR-023`](decisiones/ADR-023-cuentas-por-nombre-de-usuario.md) · [`ADR-024`](decisiones/ADR-024-turnos-y-patrullaje-del-portero.md) ·
**Contrato:** extensión **E-02**

> **Esta ronda NO cierra la ETAPA 15, que sigue BLOQUEADA (`BE-02`).** Amplía el
> contrato con lo que el cliente pidió para portería. **No empieza la sesión 2
> del Bloque B** (residentes).

### Lo que ahora está

| Qué                                   | Cómo se impone                                                                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **B1** · cuentas por usuario y NIT    | `POST /auth/acceso`; correo sintético bajo `.invalid` sólo hacia el proveedor; 5/min por cuenta, 10/min por origen, 30/min por dirección |
| **Primer ingreso**                    | Indicador en `usuarios` → claim del gancho → guarda global: 403 en toda ruta salvo cambio y cierre                                       |
| **B3** · permisos del portero         | `@Roles`; bloquear accesos y zonas (C-32); prueba negativa por cada «no puede» contra la API                                             |
| **Turnos**                            | Franja en la zona de la copropiedad calculada por la base; guarda en CADA petición con el reloj inyectado; extra sólo superadministrador |
| **Patrullaje**                        | Estado en la base; 423 en toda acción; código derivado por turno, guardado en hash; el quinto fallo cierra la sesión                     |
| **B4** · panel del superadministrador | «Porteros»: de turno ahora, alta y datos, restablecimiento, calendario semanal, bitácora append-only como `eventos` (ADR-005)            |

### Lo que se encontró por el camino

| Id                 | Qué                                                                                                                             | Estado                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **H-15H-01**       | `usuarios_edicion` admite `id = app.usuario_id()` y la tabla se publica por REST: una cuenta podía cambiarse identidad y estado | Corregido · `tg_usuario_campos_propios` (0037) |
| **H-15H-02**       | El acceso de la consola iba directo a Supabase: el turno y el límite por cuenta habrían tenido una puerta lateral               | Corregido · todo acceso por la API             |
| **C-33**           | El claim `copropiedades` no está acotado por turno, aunque la 0024 lo decía                                                     | Resuelta · el turno lo impone la guarda        |
| **DT-15H-01 a 03** | Apertura de zona sin tabla de historial; sin baja de portero en el panel; nombre del superadministrador en la bitácora          | **Abiertas** · ETAPA 16 / sesión 2             |

---

## Ronda `etapa-15e-integracion-en-sitio` — todo lo que se puede probar en sitio sin tocar el dominio · **CERRADA** · 2026-09-25

**Rama:** `etapa-15e-integracion-en-sitio` · **Base:** `develop` (`4cea5f0`)
**Informe:** [`etapas/ETAPA-15-E-integracion-en-sitio.md`](etapas/ETAPA-15-E-integracion-en-sitio.md) ·
**Decisiones:** [`ADR-022`](decisiones/ADR-022-el-navegador-negocia-el-video-con-la-api.md) ·
**Guía:** [`guias/INTEGRACION_HIKVISION.md`](guias/INTEGRACION_HIKVISION.md)

> **Esta ronda NO cierra la ETAPA 15, que sigue BLOQUEADA (`BE-02`).** Ninguna
> de sus afirmaciones está VERIFICADA CONTRA HARDWARE: el entorno no alcanza
> ningún aparato. Lo que deja es la versión que el usuario lleva a sitio, y la
> **hoja de resultados de 16 escenarios** que es la única forma de cerrar la 15.
> El Bloque B (residentes y portería: usuarios, primer inicio, turnos,
> patrullaje, supervisión) **no se ejecuta** hasta que el usuario lo pida y quede
> registrado como extensión al contrato.

### Lo que faltaba y ahora está

| Qué                                                                                                        | Por qué importaba                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1** · apertura, intercom y placas por los puertos del proveedor; histórico en PG                        | `ACCESS_POINT_PROVIDER` e `INTERCOM_PROVIDER` no tenían consumidor: la consola decía «abierto» sobre un equipo que nunca recibió la orden. El arranque anuncia qué camino atiende         |
| **A2** · verificación remota de la terminal de punta a punta                                               | La terminal reportaba y **nadie le devolvía el veredicto**: con `remoteCheck` esperaba para siempre. `remoteCheck` y `remoteCheckResult` distinguidos; `AcsCfg` como corrección explícita |
| **A3** · CU-02 contra PostgreSQL, enlace del VISITANTE, sincronización a todas                             | Consentimientos y plantillas vivían en memoria; el consentimiento se pedía al residente (RN-10 al revés); una terminal sola. Sincronización verificada por conteo, no por HTTP 200        |
| **A4** · llamada emergente, escuchas por capacidad, señalización y audio persistente                       | La llamada del videoportero no llegaba a ninguna consola; el audio abría un PUT por trozo; nada escuchaba a terminal ni videoportero                                                      |
| **A5** · vista en vivo por WHEP a través de la API (ADR-022)                                               | La consola tenía un recuadro que decía «llega con la ETAPA 15». El navegador nunca ve RTSP ni el puente; KPI-33 se mide en pantalla                                                       |
| **A6** · app móvil sin `localhost` por omisión, ATS sólo en depuración (sustituida en la 15-L por ADR-033) | Un teléfono con `localhost` habla consigo mismo; la app arrancaba y fallaba sin decir por qué                                                                                             |
| **A7** · umbrales técnicos fuera de la consola del superadmin                                              | Se enviaban valores que el motor no debía recibir desde ahí; ahora se muestran en sólo lectura con su escala                                                                              |
| **A8** · hoja de resultados de 16 escenarios en el guion de sitio                                          | Sin hoja no hay forma de convertir «probado contra mock» en «verificado contra hardware»; el guion la escribe con lo que sabe y deja lo demás en blanco                                   |

### Lo que se encontró por el camino

| Id        | Qué                                                                                                                                                | Estado                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **D-137** | `ACTOR_INGESTA` era el superadministrador de la semilla y no existía en las migraciones: contra una base sin semilla, la ingesta no tenía actor    | Corregido · migración 0035, actor `…0003` (S-44) |
| **D-138** | `guardia.controller.ts` supera las 300 líneas de §2.3 desde la A4 (534). El video fue a `VideoController`; la partición del resto queda para la 16 | **Abierto** · ETAPA 16                           |
| **D-139** | Alertas, órdenes manuales y auditoría de seguridad vivían en memoria: sin evidencia de CA-18, RN-08 ni KPI-38 tras un reinicio                     | Corregido · migración 0036, tres repositorios PG |
| **D-140** | Los bloqueos de acceso (`RegistroDeBloqueos`) siguen en memoria                                                                                    | **Abierto** · ETAPA 16                           |
| —         | El enlace del titular no llegaba a la app (el DTO lo omitía); el enlace no era de un solo uso ni dejaba evidencia de origen; sin QR                | Corregido en el lote de cierre                   |
| —         | El recuadro de video de la consola afirmaba que WebRTC exige HTTPS; sólo el micrófono lo exige. Corregido en A5 y dicho en ADR-022                 | Corregido                                        |

### Supuestos registrados

**S-39 a S-45** (A3 y A4: actor de ingesta, enlace del titular, formato del audio, señalización por capacidad) y **S-46** (forma de la URL RTSP, flujo secundario) y **S-47** (API de go2rtc: `PUT /api/streams` reemplaza; WHEP con `application/sdp`). S-46 y S-47 se confirman en sitio.

---

## Ronda `etapa-15d-integracion-extensible` — consolidación funcional, desacople de hardware y cierre de D-25 · **CERRADA** · 2026-09-24

**Rama:** `etapa-15d-integracion-extensible` · **Base:** `develop` (`e075e82`)
**Informe:** [`etapas/ETAPA-15-D-consolidacion.md`](etapas/ETAPA-15-D-consolidacion.md) ·
**Decisiones:** [`ADR-019`](decisiones/ADR-019-el-hardware-se-elige-por-capacidades.md) ·
[`ADR-020`](decisiones/ADR-020-el-autorizante-desde-la-consola-es-el-titular.md) ·
[`ADR-021`](decisiones/ADR-021-la-fotografia-del-visitante-no-es-dato-biometrico.md) ·
**Seguridad:** [`seguridad/AUDITORIA-EXPOSICION-15D.md`](seguridad/AUDITORIA-EXPOSICION-15D.md)

> **Esta ronda NO cierra la ETAPA 15, que sigue BLOQUEADA (`BE-02`).** Nada de
> lo que trae se ejecutó contra un aparato; todo está clasificado en el informe
> como documentado, simulado o probado contra mock. Lo que sí cierra es lo que
> el motor, la consola y el paquete de proveedores tenían a medias.

### Lo que faltaba y ahora está

| Qué                                                                                     | Por qué importaba                                                                                                                                           |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D-25 cerrado**: el motor lee autorizaciones, padrón y lista negra de la base          | Hasta aquí toda lectura de placa era `FALLO_TECNICO`; el motor era decorativo contra base real                                                              |
| **El hardware se elige por capacidades** (ADR-019)                                      | Nada impedía un `if (fabricante === …)`; ahora un fabricante inventado pasa la suite de contrato y un control de CI vigila que siga siendo así              |
| **CRUD completo de la consola**: zonas, viviendas, vehículos, visitantes con fotografía | Zonas no se creaban; vehículos y viviendas no se editaban; el visitante no tenía foto. Y **ninguna autorización de la consola existía contra base** (D-131) |
| **Terminal y videoportero al nivel de la cámara** (O4)                                  | Recibían la ficha de una cámara con cinco «sin comprobar» que no les aplicaban y ninguno de sus propios veredictos; D-130 no se cotejaba con el equipo      |
| **Ninguna respuesta lleva la red del equipo** (C-28)                                    | La dirección privada salía en el tablero y en el inventario para los administradores; §7.1 lo prohíbe y la VLAN de H-15-1 perdía sentido                    |
| **El guion de sitio funciona otra vez** (D-132)                                         | Llevaba roto desde la 15-C sin que nada lo ejecutara; ahora tiene entrada propia, ficha por familia, KPI-13/32 y proxy de KPI-33, y modo `--simulado`       |

### Lo que se encontró por el camino

| Id        | Qué                                                                                                                                                                                                                        | Estado                                      |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **D-131** | `autorizado_por` recibía el usuario de la consola y el disparador RN-05 lo rechazaba: cinco rondas de falso verde con dobles                                                                                               | Corregido · ADR-020 · S-38 por ratificar    |
| **D-132** | El guion de puesta en marcha importaba símbolos que el barril ya no exporta                                                                                                                                                | Corregido · `@ncr/providers/operacion`      |
| **D-133** | Tercera clave ajena hacia una tabla append-only (0034); falta el control que lo impida                                                                                                                                     | **Abierto** · ETAPA 16                      |
| **D-130** | El modo de la terminal ahora se coteja con lo que el equipo declara: «decide sola» es `decide_solo` salvo declaración expresa                                                                                              | Corregido contra simulado                   |
| **D-134** | La autorización sembrada con placa vale ocho horas desde la siembra y una prueba de D-25 dependía de ella: roja por el reloj, destapada por el verificador                                                                 | Corregido: la prueba crea la suya           |
| **D-135** | El ejemplo de entorno declaraba las variables del guion de sitio sin lector conocido, y el control de extensibilidad no estaba en la base del trinquete de ramas: destapado por el verificador (paso 9)                    | Corregido: exentas con lector; base al día  |
| **D-136** | La prueba de borrado definitivo de vehículo pasaba claims vacíos y sólo salía verde con el dueño superusuario; con el dueño que replica Supabase, la RLS forzada decía «no existe». Destapado por la estabilidad (paso 14) | Corregido: la prueba pasa los claims reales |

### Contradicciones y supuestos registrados

**C-28** (Alta) · la red del equipo fuera del contrato, revoca C-11 · **C-29**
(Media) · clave ajena hacia `evidencias` frente a ADR-005 · **C-30** (Media) · el
barril mínimo frente al guion de sitio · **C-31** (Alta) · RN-05 y la
autorización creada desde la consola. **S-35 a S-38**; S-38 pendiente de
ratificación del cliente.

---

## Ronda `etapa-15c-hikvision-provider` — la mitad de la 15 que no necesita hardware · **CERRADA** · 2026-09-23

**Rama:** `etapa-15c-hikvision-provider` · **Base:** `develop` (`6a06c08`)
**Informe:** [`etapas/ETAPA-15-C-hikvision-provider.md`](etapas/ETAPA-15-C-hikvision-provider.md) ·
**Decisión:** [`decisiones/ADR-018`](decisiones/ADR-018-punto-de-composicion-de-proveedores.md)

> **Esta ronda NO cierra la ETAPA 15, y por eso la 15 pasa a BLOQUEADA (`BE-02`).**
> El DoD de la 15 exige los tres hitos técnicos con equipo real. Lo que aquí se
> cierra es lo que se puede cerrar sin un aparato delante; lo que falta está
> enumerado en §11 del informe, KPI por KPI y ruta por ruta.

### Lo que faltaba y ahora está

| Qué                                                                            | Por qué importaba                                                                                                                                |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`HikvisionProvider`** con los cuatro puertos, misma firma que `MockProvider` | Existían los adaptadores de cada familia y no existía quien los uniera                                                                           |
| **El punto de composición** (ADR-018)                                          | ADR-003 prometía que cambiar de adaptador no tocaba nada más, y **no había dónde comprobarlo**: biometría hacía `new MockProvider` en su fábrica |
| **`PlateEventSource` implementado**, por sus dos transportes                   | Estaba declarado desde la ETAPA 05 con **cero implementaciones**: el receptor llamaba al caso de uso por su cuenta y el puerto era un adorno     |
| **La suite de contrato de LSP**                                                | Las mismas aserciones contra los dos proveedores, sin una rama. Es el entregable que más pesa de la etapa                                        |

### Lo que la guía integral obligó a corregir en código ya fusionado

Cuatro, y **dos fallaban en la dirección segura**, que es la peor forma de fallar
bien: el sistema hacía lo correcto por el motivo equivocado, y el mensaje mandaba
a revisar el sitio que estaba bien.

| Corrección                                            | Qué pasaba                                                                                                                                                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **El nombre del nodo del modo de control**            | El lector buscaba una grafía que el esquema no usa. Contra un equipo real no casaba nunca, el veredicto devolvía «no declarado» y **una cámara BIEN configurada se rechazaba** (C-16)                |
| **`confidenceLevel` es un porcentaje entero SIEMPRE** | La heurística «si vale más de 1, divide» rompía el caso peor: una confianza de **1 —uno por ciento—** pasaba como certeza total, y la lectura más dudosa que el equipo puede emitir abría la barrera |
| **El modo no basta: son tres vías**                   | Las políticas internas del equipo y los disparadores vinculados abren solos valga lo que valga el modo                                                                                               |
| **La hora sin desplazamiento no se interpreta**       | Leerla en la zona del proceso corre el histórico cinco horas, en silencio y sin posible corrección                                                                                                   |

### Lo que la propia suite destapó

**`TerminalFacial` aceptaba una plantilla vacía y `MockProvider` la rechazaba
desde la ETAPA 05.** No eran intercambiables, y la diferencia caía del lado peor:
contra el equipo real, una captura fallida se subía igual y dejaba en la terminal
un rostro que no reconoce a nadie, con todo el sistema diciendo que está
sincronizado. Es exactamente para lo que la prueba de LSP existe.

### Contradicciones registradas

**C-16** (Alta) · el modo de control se llama de dos formas en el mismo
documento · **C-17** (Media) · la región del canal se enumera de dos formas ·
**C-18** (Media) · qué debe contestar el receptor al equipo.

---

## ETAPA 15 — Integración con hardware Hikvision · **BLOQUEADA** · lo construible, cerrado el 2026-09-23

**Rama:** `etapa-15-integracion-hikvision` · **Base:** `develop` (`b9d2a60`)
**Informe:** [`etapas/ETAPA-15.md`](etapas/ETAPA-15.md) ·
**Guía:** [`guias/VALIDACION_HIKVISION_EN_SITIO.md`](guias/VALIDACION_HIKVISION_EN_SITIO.md) §8

> **El título dice «contra simulado» a propósito, y no es una matización.**
> Nada de esta etapa se ejecutó contra un equipo. El entorno de desarrollo
> deniega por diseño todo destino de rango privado —`x-deny-reason:
private_dest_ip`—, de modo que la LAN donde viven los tres aparatos es
> inalcanzable desde donde se escribió el código, hoy y siempre. Llamar a esto
> «ETAPA 15 cerrada» sin más sería exactamente el falso verde que este proyecto
> persigue, con la peor consecuencia posible: creer que el hardware está
> integrado.

**Lo que sí quedó demostrado, y es lo que la etapa venía a demostrar.** La regla
dura de §6 —«si necesitas modificar el dominio, la aplicación o la interfaz, es
un defecto de diseño de las etapas anteriores»— **se cumplió**: lo que se
escribió son adaptadores de puertos que ya existían más una capa de presentación
nueva. Ni una línea de dominio, ni una de aplicación. Esa verificación es la
prueba de OE-03.

### Las rutas, por procedencia

| Procedencia                    | Cuántas | Cuáles                                                       |
| ------------------------------ | ------: | ------------------------------------------------------------ |
| **VERIFICADA**                 |   **1** | La barrera, capturada del equipo el 15/09/2026               |
| **DOCUMENTADA, NO VERIFICADA** |  **12** | Identidad, capacidades, plantillas, aperturas, flujo y audio |

Cada documentada dice **qué comprobar en sitio** para ascenderla. Una etiqueta
«pendiente de verificar» que no dice qué verificar es media etiqueta, y delante
del equipo no sirve de nada.

### Nueve indicadores siguen pendientes de medición

KPI-13, KPI-14, KPI-17, KPI-18, KPI-22, KPI-26, KPI-27, KPI-32 y KPI-33. Son los
nueve que la matriz de trazabilidad marca con **H**. Ninguno se puede medir sin
los equipos, y los tres hitos técnicos del reto —prototipo, prueba LPR real,
prueba facial real— **siguen sin ejecutarse de punta a punta con hardware**.

### H-15-1 · la acreditación del receptor es más débil que la firma

**Severidad media, aceptada y declarada.** La cámara no firma y no hay ajuste
que lo cambie, así que su extremo se acredita con secreto largo por equipo más
origen: sin integridad de cuerpo, sin anti-repetición, sin resistencia a quien
vea la URL. **El endurecimiento real es la VLAN de equipos, no el código.**

### Lo que esta etapa NO construyó, y por qué

| Elemento                              | Por qué                                                                                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/guias/INTEGRACION_HIKVISION.md` | Sus diez apartados están escritos para ejecutarse frente al equipo. Sin haber tocado ninguno serían diez apartados de suposiciones con aspecto de procedimiento |
| Descubrimiento ONVIF                  | Inventariar la red exige estar en esa red                                                                                                                       |
| Controlador de E/S y sabotaje         | KPI-26 se mide abriendo un gabinete                                                                                                                             |
| Vídeo RTSP → WebRTC                   | El puente necesita un flujo real que medir                                                                                                                      |
| Mapa de errores del fabricante        | Hoy se distinguen los tres códigos que el simulado puede producir                                                                                               |

### Trabajo fuera del alcance, **autorizado por el usuario**

La **captura de rostro en la consola** es anticipo del punto 4 de la ETAPA 16 y
se registra como tal. Hasta hoy la captura vivía sólo en la app del residente
(ADR-016) y el escritorio no tenía por dónde, así que el recorrido facial no
podía originarse desde la consola.

### Deuda nueva

| Id        | Qué                                                                                                     | Se salda en |
| --------- | ------------------------------------------------------------------------------------------------------- | ----------- |
| **D-125** | Doce rutas DOCUMENTADAS, NO VERIFICADAS                                                                 | Con equipos |
| **D-126** | `INTEGRACION_HIKVISION.md` sin escribir: exige la sesión con hardware                                   | Con equipos |
| **D-127** | El transporte de audio lanza: faltan códec, cadencia y duplex medidos                                   | Con equipos |
| **D-128** | El campo `vector` transporta una imagen con esta terminal; el nombre miente                             | ETAPA 16    |
| **D-129** | `FaceDetector` falta en la mayoría de navegadores de escritorio: el encuadre lo confirma quien opera    | ETAPA 16    |
| **D-130** | El modo de la terminal se declara por configuración y **nada comprueba** que coincida con el del equipo | Con equipos |

---

## ETAPA 13 — Auditoría de ciberseguridad y endurecimiento · **CERRADA** · 2026-09-22

**Rama:** `etapa-13-auditoria-seguridad`, sacada de `develop` (`153df52`) ·
**Informe de etapa:** [`etapas/ETAPA-13.md`](etapas/ETAPA-13.md) ·
**Informe de auditoría:** [`seguridad/AUDITORIA.md`](seguridad/AUDITORIA.md)

**No añade producto.** Audita lo construido en las doce etapas anteriores y
endurece lo que la auditoría encontró flojo. Aquí un hallazgo no es un fracaso:
es el entregable.

### 26 hallazgos

| Severidad       | Total | Cerrados | Abiertos |
| --------------- | ----: | -------: | -------: |
| **Crítica**     |     0 |        0 |    **0** |
| **Alta**        |     3 |        3 |    **0** |
| **Media**       |    15 |       15 |    **0** |
| **Baja**        |     6 |        5 |    **1** |
| **Informativa** |     2 |        2 |    **0** |

**DoD cumplido:** cero críticos o altos ABIERTOS. El único abierto —H-13-25, la
contraseña inerte que sobrevive en el historial de Git— **lo está a propósito**:
es una decisión del cliente, con su aceptación de riesgo redactada y sin firmar.

**Los tres altos:**

| Id          | Qué                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H-13-05** | La lista blanca de DTOs rechazaba `colado` y **aceptaba** `__proto__`, `constructor`, `toString`, `valueOf` y `hasOwnProperty`                    |
| **H-13-09** | El saneamiento **mutilaba en silencio** toda carga base64 —XLSX, CSV, vector biométrico— con la firma `PK\x03\x04` intacta: 2xx sobre un ZIP roto |
| **H-13-26** | El árbol de dependencias tenía **4 vulnerabilidades críticas y 23 altas en producción**. Hoy, cero y cero                                         |

### El hallazgo que nadie esperaba · H-13-11

`src/seguridad.ts` —CORS, CSP, HSTS y el `ValidationPipe` real— tenía **0 % de
cobertura con 656 pruebas en verde**. El fixture de la suite reconstruía su
propia tubería y **nunca llamaba a `aplicarSeguridad`**. Cambiar `origin:` por
`true`, o borrar `forbidNonWhitelisted`, no ponía nada en rojo. Y los dos
literales ya habían divergido en `enableImplicitConversion`.

**Durante doce etapas, toda afirmación de los informes sobre §2.7.2, §2.7.3 y
§2.7.7 se apoyó en una tubería que el despliegue no usa.** Hoy `crearApp` monta
la real: cobertura de 0 % a 100 %, sin que ninguna prueba se pusiera en rojo.

### Qué deja construido, además de los hallazgos

| Entregable                               | Qué es                                                                                                         |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `docs/seguridad/AUDITORIA.md`            | 26 hallazgos con evidencia reproducible, OWASP Top 10, ASVS nivel 2 y las 4 aceptaciones de riesgo             |
| 7 suites de seguridad nuevas             | CORS y cabeceras, escalamiento de 6 roles, saneamiento, límite bajo carga, fugas por registro, XSS, CSV        |
| 3 modos nuevos en el escaneo de secretos | `--indice` (lo que se va a confirmar), `--historial` (2 158 blobs en 0,75 s) y los prohibidos por `.gitignore` |
| `scripts/lib/longitud-por-campo.mjs`     | «Longitud máxima POR CAMPO» de §2.7.4 donde de verdad puede estar: el DTO. 44 campos, todos con cota           |
| Migración `0031`                         | La capa de ADR-005 que la aserción **no verificaba**: RLS activa Y FORZADA en las append-only                  |
| `60_matriz_rls_completa.sql`             | La matriz derivada del catálogo: **42 tablas**, no las 26 de un `ARRAY[...]` escrito a mano                    |

### Los insumos, uno a uno

| Insumo                   | Resultado                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **D-112**                | **Cerrado.** Esta etapa mide `aplicacion` sobre 39 archivos y global sobre 308, y lo afirma por su propia ejecución        |
| **D-08**                 | **Reformulado y cerrado** (H-13-03): no es un acto de DDL, son **cuatro**, y el despliegue detecta los cuatro              |
| **D-09**                 | **Cerrado en el modo que reproduce la condición** (dueño NO superusuario). Contra el proyecto real: AR-03                  |
| **D-12**                 | **VERIFICADO en el clúster local**, como superusuario y como dueño no superusuario. Contra el proyecto real: AR-03         |
| **D-32**                 | **Cerrado por construcción**, no por un bloqueo: la fila referenciada no puede desaparecer porque `eventos` es append-only |
| **D-41**                 | **Cerrado** (H-13-02): HKDF con la copropiedad como sal, y no una KDF con factor de trabajo — ASVS V6                      |
| **7 controles en deuda** | **De 7 a 2.** Escribir una de las cinco destapó H-13-01: un lcov vacío se leía como «global 100 %»                         |
| **D-101**                | **REPRODUCIDA.** Ver abajo                                                                                                 |
| **BE-01**                | **Auditado como NO VERIFICABLE de punta a punta**, con esas palabras. AR-04 redactada                                      |

### D-101 · reprodujo, y el mecanismo que debía nombrarla no la nombró

La instrucción era explícita: _no la cierres por ausencia de síntoma_. No hizo
falta. En el paso 14 del verificador:

```
corrida 1/3: codigo 0 · @ncr/api:test: Tests 728 passed (728)
corrida 2/3: codigo 1 · @ncr/api:test: Tests 1 failed | 727 passed (728)
corrida 3/3: codigo 0 · @ncr/api:test: Tests 728 passed (728)
```

**Y no la nombró.** `estabilidad.mjs` recogía las líneas que empiezan por `× `,
que es como Vitest lista las fallidas con su reportero por omisión — pero este
paso ejecuta el comando con `CI=1`, y con `CI` puesto **Vitest cambia de
reportero** y emite `FAIL <fichero> > <suite> > <prueba>` sin una sola línea con
`×`. El nombre estaba en la salida y el filtro no lo miraba. Es la mitad que
D-100 dejó sin cerrar, y es la misma familia dentro de la corrección de la
familia. Corregido en esta etapa.

**Sigue ABIERTA**, y se reasigna a la ETAPA 14 con lo que se sabe. Perseguida
después sobre el mismo commit: 12 corridas de `@ncr/api` a solas, 8 de la suite
COMPLETA en paralelo y 6 más del paso 14 — **26 sin reproducir**, sumadas a los
11 intentos de la ETAPA 12. Lo único que la aparición añade es un dato: salió
bajo la suite completa en paralelo y no bajo `@ncr/api` a solas, lo que apunta a
contención de recursos y no a la lógica de una prueba. **Una aparición no es un
diagnóstico**, así que no se cierra.

### D-116 · la que SÍ se nombró · **CERRADA**

El control arreglado dio resultado en la corrida siguiente, y sirvió para lo que
se arregló: nombró `src/app/(consola)/viviendas/generacion.test.tsx`, con su
prueba y su mensaje. **No era D-101**: es `@ncr/web` en macOS, no `@ncr/api` en
Linux bajo cobertura. Son dos intermitentes distintas, y confundirlas habría
cerrado la una con el diagnóstico de la otra.

Causa comprobada por ejecución: Testing Library espera **1000 ms** por omisión,
y la consola tiene **quince** consultas que dependen de esa cifra. Con
`asyncUtilTimeout: 1` sale el mismo mensaje en las mismas pruebas — falla la
espera, no la aserción. La cifra sube a 5 s **una vez**, en
`apps/web/src/pruebas/preparacion.ts`. Las 350 pruebas de `@ncr/web`, en verde.

### Aceptaciones de riesgo **pendientes de firma**

| Id        | Qué se acepta                                                                                                                                                         |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AR-01** | La contraseña inerte de `e2e/doble-gotrue.mjs` en el historial, sin reescribirlo (H-13-25)                                                                            |
| **AR-02** | ~~Las 12 vulnerabilidades moderadas y bajas que quedan en producción~~ **CERRADO en la 15-U** (2026-10-03): no se aceptó, se corrigió — `pnpm audit --prod` de 12 a 0 |
| **AR-03** | D-09 y D-12, demostrados en un clúster que REPRODUCE Supabase y no en Supabase                                                                                        |
| **AR-04** | El ciclo de recuperación de contraseña, NO VERIFICABLE de punta a punta (BE-01)                                                                                       |

### Reasignaciones

- **D-34** (un módulo alcanza el interior de otro sin pasar por su barril) estaba
  asignada a la 13 y **no se hizo**: es una frontera de arquitectura de §2.2, no
  una medida de §2.7, y esta etapa no amplía su alcance. **Pasa a la 14**, con
  esa razón escrita en vez de arrastrarse en silencio.

---

## ETAPA 12 — Edge Gateway: offline y reconciliación · **CERRADA** · 2026-09-21

**Rama:** `etapa-12-edge-gateway-offline`, salida de la punta de
`etapa-11-app-flutter-residente-b` y **fusionada con `develop`** una vez cerrado
el PR #20 (`a7c046d`) · **Informe:** [`etapas/ETAPA-12.md`](etapas/ETAPA-12.md)

> **Corrección del 2026-09-21.** Esta ficha y el informe decían «desde `develop`
> con la ETAPA 11 cerrada», y no era cierto: el PR #20 seguía abierto y
> `develop` no contenía 11-B ni 11-C. Que `develop` fuera un ancestro estricto
> hacía la base equivalente en contenido, no en hecho. Corregido por fusión.

| Entregable                                        | Estado                                                                                                                              |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Dominio reutilizado SIN modificar**             | Cumplido · `apps/edge` no tiene una sola regla de acceso propia. Probado por los dos caminos en `misma-decision.test.ts`            |
| Caché de reglas versionada                        | SQLite, una instantánea cerrada por copropiedad. **La versión solo avanza**: una respuesta vieja que llega tarde no hace retroceder |
| Detección de WAN y modo autónomo                  | Máquina de estados pura con histéresis (3 para caer, 2 para volver). Arranca autónomo, no en línea                                  |
| Decisión local sellando la versión (RN-16, CA-21) | Cada decisión lleva la `VersionDeReglas` de la caché que la produjo                                                                 |
| Bandeja con clave de idempotencia                 | La misma mecánica que la app del residente, a propósito. Clave primaria en SQLite: lo impide la base, no un `if`                    |
| Reconciliación ordenada (RN-17, CA-22)            | En orden, duplicado descartado en silencio con 202, corte del lote al primer fallo                                                  |
| Reanudación ante conexión intermitente            | Desde el último confirmado. Probado con un corte a mitad de lote                                                                    |
| Contingencia configurable                         | `denegar` por omisión (§2.1.4). **`escalar` tampoco abre**: entrega el caso al portero                                              |
| Marcado de caché obsoleta (KPI-31)                | Por antigüedad de la instantánea, medida desde que **la nube** la generó                                                            |
| **DoD · 30 min sin WAN, 20 accesos**              | **Ejecutada** · los 20 resueltos localmente, los 20 en la nube exactamente una vez, en dos tics de 15 s                             |
| **DoD · 24 h sin degradación (KPI-30)**           | **Ejecutada** · 1.440 accesos; decide igual en la hora 23; el coste por acceso no crece con la bandeja llena                        |
| `docs/guias/DESPLIEGUE_EDGE.md`                   | Entregada · aprovisionamiento, identidad y llave **por equipo**, rotación en el orden correcto, NTP y actualización por fases       |
| **ADR-017**                                       | `node:sqlite` y no un módulo nativo: se despliega copiando ficheros, sin `node-gyp` en una máquina de portería                      |

**Lo que la API tuvo que crecer, y solo eso:** `POST /ingesta/reconciliacion`,
que **no vuelve a decidir**. Recalcular con las reglas de hoy haría que el
histórico afirmara algo que nadie decidió y borraría la única prueba de qué hizo
el Edge durante el corte.

**Hallazgos:** **D-98** —una instantánea truncada tumbaba el gateway en vez de
caer en contingencia— y **D-99** —`SQLITE_PATH` admitía un byte nulo, encontrado
otra vez por la prueba genérica de D-91—.

### Por qué se retiró el cierre · D-100 y D-101

| ID        | Qué                                                                                                                                                                                                                                                                                                                                                                                                                                           | Estado                                                                           |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **D-100** | `metricas.mjs` tenía el informe JSON con la prueba roja **en memoria** y no imprimía su nombre: decía «la corrida NO terminó» con un recuento de bytes y mandaba a buscar una cobertura baja inexistente. Confundía **suite en rojo** con **corrida interrumpida**, que tienen remedios opuestos. Su filtro de pistas se tragaba `ERR_PNPM_*`, el eco de pnpm                                                                                 | **Corregido** · prueba negativa 22                                               |
| **D-101** | Una prueba de `@ncr/api` falla de forma **intermitente en Linux bajo cobertura**: 1 de 658 en `ubuntu-latest`, verde en `macos-latest` sobre la misma SHA (`bbae506`). **No reproducida en 11 intentos deliberados** (5 en el CI con un paso de caza, 6 en local con `taskset -c 0,1`); el sospechoso principal —la prueba de latencia— se midió clavada a un núcleo y da p99 de 61–67 ms contra un umbral de 1 000. Causa **no establecida** | **Abierto** · instrumentado. Con D-100 corregido, la próxima roja se nombra sola |

**La etapa se cerró la primera vez sobre un veredicto local de macOS mientras el
CI de `ubuntu-latest` estaba en rojo.** El cierre se retiró y se repone ahora con
las tres condiciones cumplidas: CI **verde en las dos plataformas** sobre la SHA
final —corrida [**139**](https://github.com/4rg3n15/NextResidential/actions/runs/35560294330)
sobre `4899ae9`—, `verificar-etapa.sh --con-base` correcto en local, y el
veredicto del informe diciendo de qué corrida sale cada cosa. La que dejó la
etapa abierta, para que quede el rastro, es la
[**133**](https://github.com/4rg3n15/NextResidential/actions/runs/35486519614)
sobre `bbae506`.

Nota de método: **re-ejecutar hasta el verde no es un arreglo.** «Flake» no es
una causa raíz.

**S-24 · CERRADO en la ronda 15-Q (2026-10-02, ADR-034).** Lo que sigue es el texto de entonces. **Declarado y no construido · S-24:** la ruta que SIRVE la instantánea de reglas
desde la nube. Cliente y contrato están; hoy la caché se siembra al aprovisionar.
Se cierra con el tablero de reglas de la ETAPA 14. No afecta a la DoD —que parte
de un gateway ya sincronizado— pero sí a la operación en régimen.

---

## ETAPA 11 — App móvil Flutter del residente · **CERRADA** · 2026-09-20

**Ramas:** `etapa-11-app-flutter-residente` (11-A) y
`etapa-11-app-flutter-residente-b` (11-B y 11-C), desde `develop` actualizado ·
**Informe:** [`etapas/ETAPA-11.md`](etapas/ETAPA-11.md)

La etapa se ejecutó en mitades, aprobadas por el usuario. El corte no fue por
tamaño: **11-A se recorre entera en un emulador sin conceder un permiso del
sistema ni cortar la red; lo que vino después no se puede demostrar sin ninguna
de las dos.** 11-B construyó el servidor que sostiene las pantallas que
escriben; 11-C, las pantallas, la captura con consentimiento del titular y la
medición de KPI-10.

### Lo que 11-A dejó construido

| Entregable                                           | Estado                                                                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **La superficie del residente en la API**            | `copropiedades/:id/mi/{vivienda,familia,vehiculos,autorizaciones,historial}`. **No existía**: OE-02 no tenía endpoint |
| **El SEGUNDO EJE del aislamiento**                   | `alcanzaVivienda` en el dominio. La vivienda **nunca** llega en la petición: se deriva de la identidad                |
| Suite `aislamiento-residente.e2e.test.ts`            | Rompe el build. La lista de rutas se DERIVA del enrutador, y lleva línea base                                         |
| App Flutter con arquitectura limpia                  | Dominio, aplicación, infraestructura y presentación, con los puertos declarados en Dart                               |
| Cliente Dart **generado** desde OpenAPI              | 170 ficheros · control que falla si se queda atrás                                                                    |
| Sesión en Keychain/Keystore + **refresco al volver** | Política pura con reloj inyectado, y **una sola** renovación concurrente                                              |
| Los cinco estados transversales                      | Unión sellada: el `switch` no compila si falta una rama                                                               |
| Pantallas M-1, M-2, M-3, M-6 y M-8                   | Con las decisiones del mockup revisadas, y lo que falta dicho en pantalla                                             |
| **Recorrido en navegador** con capturas              | Acceso → inicio → familia → vehículos → pendiente → perfil → historial                                                |
| Los **dos contratos** de evento de Hikvision         | XML del Alarm Server y JSON del `alertStream`, con el filtro del volcado histórico. El simulado los emite             |
| Verificador: **23 pasos** (cinco nuevos)             | Coherencia de este documento · análisis Dart · suite y cobertura por capa · cliente al día y secretos · recorrido     |

### Hallazgos de esta mitad

| ID       | Qué                                                                                                                                                                                                     | Estado                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **D-76** | Un residente podía dar acceso a una zona a la autorización **de otra vivienda**: el permiso se da a un `autorizacionId` del cuerpo                                                                      | **Corregido**                                                 |
| **D-77** | `GET …/biometria/consentimientos/:id` expone el estado de cualquier consentimiento del conjunto a quien conozca su UUID                                                                                 | **Corregido en 11-C** · 404 al que no es titular              |
| **D-78** | El tema de la app copia los colores del preset a mano; la prueba compara con el `.ts` mientras no se genere                                                                                             | Declarado                                                     |
| **D-79** | El paso 5 del verificador decidía por TEXTO y no por código de salida: con la compilación rota informaba verde con cero pruebas ejecutadas                                                              | **Corregido**                                                 |
| **D-80** | **`echo "$x" \| grep -q` bajo `pipefail` devuelve 141 al ACERTAR.** La comprobación de pruebas en rojo —y la de SECRETOS de `verificar-frontera.sh`— se leían como falsas justo cuando encontraban algo | **Corregido** · regla en `portabilidad.mjs` + prueba negativa |

**D-80 es el más caro de los cinco** y llevaba en el repositorio desde que se
escribió el verificador. Apareció por una cadena: la coherencia de este
documento (control nuevo) puso el paso 1b en rojo → se leyó la salida entera →
la suite decía «en verde» con 0 ficheros recogidos → al mirar por qué, salió el 141. Un control nuevo destapó un hueco en otro que llevaba nueve etapas dándose
por bueno.

### Ronda de entorno del 2026-09-18 · pedida por el usuario

Tres rondas perdidas en errores de entorno, y la causa no estaba donde parecía.
El síntoma era `PathAccessException` al crear `.dart_tool`; las dos hipótesis
—directorio de trabajo o `PUB_CACHE`— se **descartaron midiendo**, sustituyendo
`flutter` por un guion que imprime su `pwd` y su entorno: los tres pasos lo
invocan desde `apps/mobile`, con `PUB_CACHE` sin definir. Lo que sí lo explica
es que su Dart era **3.11.5** y el `pubspec.yaml` exige **^3.13.3**.

| Añadido                                                     | Por qué                                                                                      |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **`.flutter-version`** en la raíz, y el paso 1 lo comprueba | Node tenía `.nvmrc` desde la 02; Flutter no tenía nada. El mínimo de Dart se lee del pubspec |
| **Paso 1c · escritura por ejercicio**                       | `access(W_OK)` no ve un montaje de solo lectura ni una ACL. Nueve rutas, creando y borrando  |
| **Diagnóstico en los pasos móviles**                        | Comando, directorio, binario y versiones; y si es entorno, lo dice con esas palabras         |

| ID       | Qué                                                                                          | Estado        |
| -------- | -------------------------------------------------------------------------------------------- | ------------- |
| **D-81** | `cumple()` aceptaba `^` y **no lo interpretaba**: devolvía `true` para cualquier versión     | **Corregido** |
| **D-82** | El control del cliente Dart usaba el `dart` del PATH, que puede no ser el del Flutter en uso | **Corregido** |

**D-81 lo destapó la propia comprobación nueva**, probada con un mínimo
imposible: pasó en verde. Es la misma familia de siempre, y esta vez a los diez
minutos de nacer el control.

---

### Segunda ronda de entorno · 2026-09-19 · `objective_c` y el control genérico

**Quién arrastraba `objective_c`**, medido con `flutter pub deps`:
`flutter_secure_storage` → su plugin de **Windows** → `path_provider` (federado,
arrastra las cinco plataformas) → `path_provider_foundation` → `objective_c`.
Su `hook/build.dart` compila `.m` con `clang` **solo en iOS y macOS** —en Linux
devuelve sin hacer nada, por eso el contenedor nunca lo reprodujo— y exige el
SDK de Apple. Acotado con `dependency_overrides` a `path_provider_foundation`
2.5.1, la última versión sin él: **desaparece del `pubspec.lock`**, `analyze`
sin hallazgos y las 72 pruebas de Dart en verde.

| Añadido                                          | Por qué                                                                                                   |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| **`dependencias-acotadas.mjs`**                  | Un `dependency_overrides` sin motivo escrito es una versión congelada que nadie vuelve a mirar            |
| **`controles-sin-prueba-negativa.mjs`** (paso 9) | El control **genérico** de la familia: todo control que el verificador ejecuta debe tener prueba negativa |
| **Paso 1 · `xcrun` en macOS**                    | Xcode seleccionado no implica SDK. Se ejecuta el comando y se exige que la ruta exista                    |
| **Paso 1 · Chromium y puerto del 5e**            | El recorrido **no necesita la API**; necesita navegador y el 4599 libre, y ahora se nombran               |

| ID       | Qué                                                                                                                                                                                                                                                                           | Estado                                                                               |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **D-83** | `objective_c` entraba por el plugin de **Windows** y rompía `flutter test` en macOS                                                                                                                                                                                           | **Corregido**                                                                        |
| **D-84** | La lista de pruebas negativas se mantenía a mano: un control podía nacer sin ella —así nació D-81—                                                                                                                                                                            | **Corregido**                                                                        |
| **D-85** | `metricas.mjs` se callaba que la corrida de un paquete no terminó: el paso 7 decía «capa por debajo del umbral» cuando la verdad era «capa que nadie midió»                                                                                                                   | **Corregido**                                                                        |
| **D-86** | `@ncr/providers` al 84,58 % frente al 90 % que él mismo declara (`intercom-simulado.ts` al 0 %); fallaba en cada corrida y nadie lo veía                                                                                                                                      | **Cerrado** con pruebas: 98,49 % líneas, 90,47 % ramas                               |
| **D-87** | El recorrido del 5e leía el `<input>` del DOM creyendo leer el campo de la app: en Flutter web el motor copia al widget al enfocar, así que el valor leído podía ser cierto y el campo seguir vacío para la app. El primer arreglo movió el fallo de campo en vez de quitarlo | **Corregido** · se espera al foco del motor y la verdad la da el validador de la app |
| **D-88** | La comprobación del navegador del paso 1 daba por hecho `node_modules`, y el banco de pruebas negativas es un clon sin ellos: falso positivo en el caso 6                                                                                                                     | **Corregido**                                                                        |

Hoy: **18 de 25 controles con prueba negativa, 7 en deuda declarada**, y esa
lista solo puede encoger. Lo que aún no cubre —una rama _nueva_ dentro de un
control que _ya_ tiene prueba, que es literalmente D-81— exige granularidad de
rama: la suite negativa bajo `NODE_V8_COVERAGE`. **Es el primer trabajo de 11-B.**

---

### 11-B · arrancada el 2026-09-19

**Primero: la granularidad de rama**, que era lo que faltaba del control
genérico. `controles-sin-prueba-negativa.mjs` atrapa al fichero que nace sin
prueba; **no atrapaba a D-81**, que era una rama nueva dentro de un fichero que
ya la tenía. Ahora la suite negativa corre bajo `NODE_V8_COVERAGE` —cada proceso
que lanza escribe su cobertura, incluidos los del clon— y
`ramas-de-los-controles.json` fija cuántos bloques no ejecuta nadie por control:
**20 controles, 267 bloques, y ese número no puede subir**. `verificar-entorno.mjs`
—donde vivió D-81— queda con 39 bloques clavados.

**Y el paso 5e queda DECLARADO no ejercido**, no desactivado: sale en cada
ejecución con motivo y fecha, el veredicto lo dice, y **caduca** cuando se cierre
la ETAPA 14. Motivo: el motor de Flutter web no engancha el campo de contraseña
bajo Chromium en macOS —el `<input>` recibe el texto y el widget no se entera—,
reproducible allí y no en Linux.

**Sobre `cerrarSesion()` y la ETAPA 15: no la bloquea.** La consola no usa el
puerto de dominio `IntercomProvider`, usa el puerto de aplicación
`CanalDeIntercom`, y **sus tres métodos llevan `operadorId` explícito**: no hay
estado por instancia que compartir. La exclusividad por dispositivo la sostiene
la máquina de `@ncr/domain-core`, que es justo lo que el equipo real impone con
su única conexión de armado. Lo que sí queda anotado para la 15: el adaptador
ISAPI abre **una conexión por dispositivo**, atada al titular del canal, nunca
una por operador.

---

### 11-B · primer bloque construido · 2026-09-19

**El servidor del residente, que no existía.** `POST …/mi/autorizaciones`
(vigencia, patrón, acompañantes nominales, zonas, observaciones), `GET
…/mi/zonas` (aforo y horario) y `POST …/mi/notificaciones/aparatos` (token FCM).
Migración **0030**: `clave_idempotencia` con índice único parcial y la tabla
`dispositivos_de_notificacion` con su RLS por identidad.

**Rechazos tipados con precedencia probada** (`puedeAutorizar` en el dominio):
RN-06 > RN-13 > P-11 > RN-04/CA-03. Respuesta 200 con motivo y explicación, no 403. Segundo eje de aislamiento ampliado a las escrituras: 23 pruebas.

**Cliente:** bandeja de salida con retroceso acotado y jitter, y validación de
calidad de captura (CA-08). 93 pruebas de Dart.

| ID       | Qué                                                                                                                 | Estado        |
| -------- | ------------------------------------------------------------------------------------------------------------------- | ------------- |
| **D-89** | Dos consultas del adaptador del residente no existían en el esquema (`niveles_de_acceso`, `v.direccion`)            | **Corregido** |
| **D-90** | `.env.example` no decía la verdad: tres nombres que nadie lee, cuatro sin declarar y uno sin el `=`                 | **Corregido** |
| **D-91** | `VAR=` llegaba al validador como cadena vacía e impedía el arranque, incluso en las variables con valor por omisión | **Corregido** |

**D-89 cambia cómo hay que leer 11-A:** ninguna lectura del residente funcionaba
contra una base real, y la suite estaba en verde porque probaba un doble en
memoria. Lo cierra `apps/api/test/residente-pg.test.ts`, que ejerce cada
adaptador contra el esquema migrado.

**NO entró en este bloque:** las pantallas M-4, M-5 y M-7 de Flutter, la captura
con cámara y la medición de KPI-10.

---

### 11-C · cerrada el 2026-09-20 · las pantallas, la cámara y el KPI medido

| Entregable                                      | Estado                                                                                                                                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M-4 · Crear visitante**                       | Construida · vigencia, patrón con días y franjas, acompañantes nominales, zonas, placa y observaciones. Los cuatro rechazos con su texto, separados por `SalidaDelRechazo` |
| **M-5 · Zonas comunes**                         | Construida · la interfaz refleja y lo dice: el aforo **no reserva plaza**. Las franjas que cruzan medianoche llegan aplanadas y se pintan enteras                          |
| **M-7 · Notificaciones**                        | Construida · cinco estados, no un interruptor. El token rota y se reenvía solo; al cerrar sesión se olvida                                                                 |
| **Bandeja de salida conectada al cliente HTTP** | Construida · se encola ANTES de intentar; el rechazo de negocio no se reintenta; el 401 no retrocede; lo rendido se enseña, no se borra                                    |
| **Captura con consentimiento del titular**      | Construida · ruta propia del residente **sin `titularId` en el cuerpo** (RN-10); sin consentimiento no hay sincronización (RN-09); sin casilla de aceptar en la app        |
| **KPI-10 medido**                               | `apps/api/test/kpi-10.e2e.test.ts` · p50 ~2 ms, p95 ~5 ms sobre un presupuesto de 3 000 ms de los 60 000                                                                   |
| **D-77**                                        | **Cerrado** · el residente que no es titular recibe 404, y el titular sí lo lee                                                                                            |

**Lo que sigue declarado, y por qué:**

- **El adaptador real de cámara** (paquete `camera`) y **el de FCM**
  (`firebase_messaging`). Los dos llevan binarios nativos y credenciales que
  §2.5 prohíbe versionar —`google-services.json`, `GoogleService-Info.plist`— y
  un permiso del sistema que solo se prueba en un dispositivo. Los puertos, las
  pantallas, la máquina de estados y el registro contra el conjunto están
  construidos y probados; lo que falta es quién implementa el puerto. Se cierra
  cuando la app se compile contra un aparato con el proyecto de Firebase
  aprovisionado. Es ADR-03 aplicado al teléfono.
- **D-78** · el tema de la app copia los colores del preset a mano.

**Hallazgos de esta mitad:** D-77 (cerrado), **D-93** —el doble de escrituras
repartía identificadores ambiguos y hacía pasar la prueba del segundo eje sobre
la ruta de rostro sin demostrar nada—, **D-94** —`contracts` apuntaba a un
esquema renombrado en D-92—, **D-95** —el banco de pruebas negativas confundía
«el control no está versionado» con «el control falló»— y **D-96** —el trinquete
de ramas exigía una cifra fija a controles cuyas ramas dependen del host, así
que estaba condenado a ponerse rojo en macOS o en Linux por la máquina y no por
el código— y **D-97** —la prueba de la franja que cruza medianoche afirmaba un
texto que solo es cierto con `TZ=Etc/UTC`, así que estaba verde aquí y roja en
la máquina del usuario—. De D-97 sale **S-23**, declarado y no corregido: la app
pinta el horario de las zonas en el huso del teléfono y no en el de la
copropiedad.

Los cinco son la misma familia, y los cuatro aparecieron **en controles**, no
en producto: el doble, el contrato, el banco de pruebas, el trinquete y una
prueba de widget. Un control que no puede distinguir dos situaciones distintas
no está demostrado — y uno que da resultados distintos según la máquina tampoco.

---

## ETAPA 10 — Consolas operativas · **CERRADA** · 2026-09-18

Rama `etapa-10-consolas-operativas`, desde `develop` con la 09 ya fusionada.

| Entregable                                            | Estado                                                                                                                                             |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Consola de **portería** (HU-21 a HU-24)               | Construida · evento actual con evidencia, vivienda y autorización; apertura y negación con motivo; historial inmediato; alertas y listas negras    |
| Consola de **guardia virtual** (CU-03, HU-25 a HU-29) | Construida · cola por tiempo de espera, ficha, video reservado, abrir/negar atribuido, aviso al residente, emergencia                              |
| **Los cuatro flujos alternos de CU-03**               | Cubiertos · detalle en [`etapas/ETAPA-10.md`](etapas/ETAPA-10.md) §3                                                                               |
| Exclusividad del canal de audio (ADR-01)              | **Máquina de estados pura en el dominio**: bloqueo por dispositivo, cola, liberación por reloj. La ETAPA 15 sustituye el transporte, no las reglas |
| `IntercomSimulado` tras `IntercomProvider`            | Construido · aplica la exclusividad de verdad                                                                                                      |
| KPI-35 · conmutación sin fuga                         | Probado por HTTP: la copropiedad fuera del turno responde **404, no 403**                                                                          |
| Los tres avisos de la 09                              | Resueltos · `img-src` con el origen de Supabase, y el video y la PWA declaran que necesitan HTTPS                                                  |
| **DT-12**                                             | **Cerrado** · [`seguridad/DT-12-recursos-externos.md`](seguridad/DT-12-recursos-externos.md)                                                       |
| Paso 3.ter por IP                                     | Recorre **las once pantallas**, las dos nuevas incluidas                                                                                           |

**Sobre DT-12.** Los cuatro recursos externos quedan cerrados salvo SMTP, que es
bloqueo de entorno (BE-01) y lo resuelve el bloque 4 por el otro lado. **FCM no
es deuda**: es orden de etapas —el registro de tokens es de la 11— y el intento
de aviso ya queda registrado. **Realtime tampoco**: no se usa, el canal es SSE
propio, y la razón es RN-18: escalar en menos de 10 s no puede depender de un
servicio externo. Medido, 200 de 200.

**Deuda nueva declarada:** D-69 (el estado del canal vive en el proceso; con
varias instancias haría falta llevarlo a PostgreSQL, y por eso la máquina está
en el dominio) y D-70 (bitácora de órdenes en memoria, acotada a 200 por
copropiedad; el historial completo ya vive en `eventos`).

**Lo que no se puede medir sin hardware, dicho:** KPI-32 y KPI-33 son latencias
extremo a extremo. El proveedor simulado no da una cifra que signifique nada, y
publicar una sería peor que no tenerla.

---

### D-68 · la consola no funcionaba por red · 2026-09-13

**La ETAPA 10 no se lanza hasta que esto esté cerrado, y ya lo está.**

Entrando por una IP de red, el código del autenticador se rechazaba **siempre**,
con «La sesión expiró». El mismo código entraba por `localhost`. Reproducido en
el navegador: **cero cookies `ncr_*`** en el origen de red.

**Causa.** El atributo `Secure` de la cookie salía de `NODE_ENV`, no del esquema
de la petición. Sobre HTTP el navegador descarta una cookie `Secure` en
silencio, así que el paso del segundo factor llegaba sin nada que leer. Por
`localhost` y `127.0.0.1` no pasaba: el navegador los trata como orígenes
**potencialmente seguros** y ahí sí las acepta. Es **la misma forma que D-67**
—algo decidido por el modo de compilación y no por cómo se alcanzó la página— y
la misma exención del bucle local lo escondió las dos veces.

**Y el banco de pruebas lo tapaba.** El recorrido del navegador fijaba
`COOKIE_SEGURA: 'false'`, es decir **desactivaba justo el atributo que rompe en
el despliegue real**. Un banco que apaga la condición del defecto no prueba el
sistema: prueba una variante suya que nadie despliega. Retirado.

| Corregido                      | Cómo                                                                                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| El atributo `Secure`           | Lo decide la petición. El middleware sella `x-ncr-esquema-seguro` con la **misma función** que decide `upgrade-insecure-requests`; `COOKIE_SEGURA` queda como salida para un proxy que no reenvíe el esquema                         |
| `httpOnly`, `SameSite`, `path` | **Sin tocar.** No dependen del esquema, y el recorrido comprueba en el navegador que siguen puestas                                                                                                                                  |
| El mensaje que mentía          | «Sin cookie» y «sesión expirada» eran tres causas con un solo texto. Ahora se distinguen: el nuevo dice que el navegador no devolvió la cookie y qué mirar, sin filtrar nada del servidor. El anterior mandaba a reintentar en bucle |
| **Paso 3.ter** del recorrido   | El camino ENTERO por IP de red: contraseña → factor → `aal2` → tablero, las nueve pantallas **comparadas** con el bucle local, el canal en vivo y el contexto seguro                                                                 |

**Lo que NO es un defecto y queda dicho:** por IP sin TLS el navegador no
registra el service worker, así que no hay PWA instalable ni caché sin conexión.
Vuelve solo con dominio y HTTPS. Lo mismo afectará a la cámara de la guardia
virtual (ETAPA 10): `getUserMedia` exige contexto seguro.

**`API_URL=http://localhost:3000` no era parte de esto.** La consola nunca llama
a la API desde el navegador: todo pasa por el proxy del servidor. Sí queda
anotado un aviso para la ETAPA 10 — la evidencia se sirve con URL firmada del
**bucket**, y `img-src` no lista hoy el origen de Supabase.

Todo el detalle, con los pasos para comprobarlo y lo que espera al desplegar
(TLS, dominio, proxy, CORS, `Site URL` y `Redirect URLs`), en
[`guias/CONSOLA_EN_RED_Y_DESPLIEGUE.md`](guias/CONSOLA_EN_RED_Y_DESPLIEGUE.md).

---

### CIERRE DE LA ETAPA 09 · 2026-09-12

**La etapa queda CERRADA.** Verificación de §2.8.0 ejecutada con base de datos:
`./scripts/verificar-etapa.sh --con-base` → **`VERIFICACIÓN DE ETAPA: correcta`**,
**19 de 19 pasos**, 1.266 pruebas en 97 ficheros, tres corridas idénticas.
Dominio 97,75 % · aplicación 97,42 % · global 71,63 %. KPI-03, RN-03/CA-23 y
RN-14/CA-14 ejercidos contra PostgreSQL real, no omitidos.

#### Lo último que se construyó

| Asunto                                                                          | Estado                                                                                                                          |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **D-67** · la consola sin estilos por cualquier origen que no fuera `localhost` | **Corregido** · `upgrade-insecure-requests` depende del esquema de la petición, no del modo de compilación                      |
| Paso **3.bis** del recorrido del navegador                                      | **Nuevo** · mide reglas CSS aplicadas y color de fondo real, **también por una IP de red**                                      |
| **`AlmacenEvidenciaSupabase`**                                                  | **Construido** · elegido por configuración; con `EVIDENCIA_BUCKET` ausente, el arranque avisa de que la evidencia es de memoria |
| **`RepositorioListaNegraPg`**                                                   | **Construido** · el puerto llevaba desde la ETAPA 05 declarado y **sin nadie detrás**                                           |
| **D-66** · un solo `Pool`                                                       | **Corregido** · `PoolModule` global, tope único configurable, y control que rompe el build si alguien abre otro                 |
| Barrido de factores `unverified`                                                | **Ya estaba construido**; lo que faltaba era **verlo** — ver la corrección de abajo                                             |

#### Correcciones a lo que dije antes

1. **El barrido de factores `unverified` ya existía.** La propuesta del bloque 5
   lo presentaba como trabajo pendiente de media jornada: es falso, `retirarNoVerificados`
   está en `supabase-auth.ts` desde una ronda anterior. Lo que **no** existía era
   una prueba que lo observara: nadie había visto el `DELETE` emitirse. Ya la hay,
   con su mutación, y con la mitad que impide que el arreglo se vuelva el agujero
   —que el barrido **no** alcance a un factor verificado, porque si lo alcanzara
   cualquiera podría quitarse el segundo factor abriendo la pantalla de inscripción—.
2. **Las listas negras no estaban «en memoria».** Estaban peor: el puerto
   declarado, los casos de uso escritos y **ningún adaptador ni proveedor**. El
   motor recibía conjuntos vacíos, así que RN-06 —precedencia absoluta— no tenía
   de dónde leer.
3. **Las autorizaciones sí estaban persistidas** desde la 09-B (`RepositorioAutorizacionesPg`).
   D-25 era menor de lo que dije.
4. **El `ERR_SSL_PROTOCOL_ERROR` de hace dos bloques era D-67**, no el buscador
   global. Desactivé las consultas y el síntoma desapareció; la causa siguió ahí.

---

### Lo que queda ABIERTO al cerrar la ETAPA 09

Sin adornos, con dueño y peso.

| Id                                | Asunto                                                                                                                                                                                                                                                                                                                                    | Etapa                 | Peso   |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------ |
| **BE-01**                         | **SMTP.** No hay proveedor de correo. El arranque verifica la mitad nuestra —la URL de redirección— y **declara que no puede ver** el SMTP ni la plantilla, que viven en el panel. El bloque 4 lo resuelve por el otro lado: con restablecimiento por TOTP, el SMTP deja de ser requisito operativo                                       | Bloque 4              | 3 j    |
| **Sesiones por rol**              | Supabase tiene **una** política de sesión por proyecto; las duraciones por rol y la cota absoluta se construyen en nuestra capa. Aprobado el diseño, no construido                                                                                                                                                                        | Bloque 4              | 1,5 j  |
| **WebAuthn**                      | **Diferido a la ETAPA 14**, aprobado. No eleva el `aal2` de Supabase, así que no satisface RN-20: es comodidad, no factor                                                                                                                                                                                                                 | ETAPA 14              | 4,5 j  |
| **«Retomar sesión»**              | Diseñado con doble cota —vida del dispositivo y techo absoluto que no se renueva—, cookie `httpOnly`. No construido                                                                                                                                                                                                                       | Bloque 4              | 1,5 j  |
| **FCM**                           | El `NotificadorPush` cableado **anota en la bitácora y no envía**. Deliberado: la ETAPA 11 es dueña del registro de tokens del dispositivo. Cuando llegue, pasa a ser el quinto recurso comprobado al arrancar                                                                                                                            | ETAPA 11              | —      |
| **Realtime frente al SSE propio** | **No es deuda: es una decisión tomada y medida.** No se usa Supabase Realtime; el canal es SSE propio de la API, detrás del mismo puerto que un adaptador de Realtime cumpliría. RN-18 exige escalar en menos de 10 s y eso no puede depender de un servicio externo. Medido: 200 de 200 alertas, p99 de 65 ms contra un umbral de 10 000 | —                     | —      |
| **Seis variables sin validar**    | `PGBOSS_SCHEMA`, `DEVICE_VAULT_*`, `LOG_LEVEL`, `SENTRY_DSN`, `BIOMETRIC_KEY_REF`, `BIOMETRIC_ALGORITHM` están en `.env.example` y Zod **no** las valida. No es un fallo activo —no se leen— pero `pnpm entorno:diff` se las exige al cliente sin que sirvan. Dueños: `SENTRY_DSN` y `LOG_LEVEL` → ETAPA 14; `DEVICE_VAULT_*` → ETAPA 15  | ETAPA 14              | 0,25 j |
| **Flujo biométrico**              | De las cinco piezas, la 1 (`AlmacenEvidenciaSupabase`) y la 4 (tipo real por contenido) **quedan construidas**. Siguen abiertas: repositorios PostgreSQL de consentimientos y plantillas (**D-39**, ETAPA 11, 1,5 j), captura en Flutter (ETAPA 11, 3 j) y sincronización con terminal facial (ETAPA 15)                                  | 11 y 15               | —      |
| **D-58**                          | El evento no distingue residente de visitante; el informe lo dice en vez de fingir el filtro. Requiere columna nueva en `eventos`, que es append-only y particionada                                                                                                                                                                      | Por decidir           | 1 j    |
| **D-42**                          | Menores y representante legal: no existe en el esquema. Decisión de Grupo Control                                                                                                                                                                                                                                                         | Pendiente del cliente | —      |
| **`factoresDe` sin uso**          | Función exportada que nadie llama. Residuo de la ronda de MFA; se retira o se usa en el contador de códigos                                                                                                                                                                                                                               | Bloque 4              | 0,1 j  |

#### Lo que pesa menos de una jornada y cierra un requisito

Preguntó cuál del subconjunto mínimo entra ahora. La respuesta es **una sola
pieza**, y no es la que yo había puesto primero:

**Superficie de los códigos de recuperación en la consola — 0,5 jornadas.**
El endpoint que los regenera **ya existe** (`POST /auth/mfa/codigos`, que
reemplaza los diez). Lo que no existe es dónde pulsarlo ni dónde ver cuántos
quedan. Hoy, quien gasta los diez se queda sin la salida documentada de RN-20 y
CA-25 y depende del panel de Supabase — que es exactamente el agujero operativo
que usted quiere cerrar. Media jornada de consola sobre API ya construida,
cierra la condición 4 del bloque 4, y de paso da uso a `factoresDe`.

El resto del bloque 4 no baja de 1,5 jornadas por pieza y no cabe en el
criterio que puso.

### Lo que usted debe ejecutar tras los bloques 6-8

1. Aplicar la migración **`0028`** (`supabase db push` o el procedimiento de §4.3
   de la guía de conexión). Sin ella, un cambio de configuración hace `ROLLBACK`
   al intentar auditarlo — y eso es lo correcto: antes que guardar sin rastro.
2. Crear el bucket privado de evidencia siguiendo
   `docs/guias/CONEXION_SUPABASE.md` §7.1, y declarar `EVIDENCIA_BUCKET` en
   `apps/api/.env`.
3. Ejecutar `node scripts/verificar-bucket-evidencia.mjs` con sus credenciales
   exportadas en la sesión (§7.2). La salida esperada está en la guía.

### Lo que usted debe ejecutar antes de la 09-B

Las migraciones `0023` a `0026`, el SMTP y la plantilla de correo, el Auth Hook de claims, el primer superadministrador y **la inscripción de su propio segundo factor desde la consola** — sin ese último paso, ningún rol administrativo entra. Todo en pasos numerados en [`docs/guias/RECUPERACION_Y_USUARIOS.md`](guias/RECUPERACION_Y_USUARIOS.md).

---

## ETAPA 00 — Auditoría documental y plan maestro · **CERRADA**

**Rama:** `etapa00` · **Cierre:** 2026-09-06 · **Informe:** [`etapas/ETAPA-00.md`](etapas/ETAPA-00.md)

### Entregables

| Entregable                               | Ruta                                                | Estado |
| ---------------------------------------- | --------------------------------------------------- | ------ |
| Auditoría de la solicitud                | `docs/auditoria/00-solicitud.md`                    | ✅     |
| Legibilidad e inventario de requisitos   | `docs/auditoria/01-legibilidad-requisitos.md`       | ✅     |
| Auditoría de arquitectura                | `docs/auditoria/02-arquitectura.md`                 | ✅     |
| Auditoría de mockups y sistema de diseño | `docs/auditoria/03-mockups.md`                      | ✅     |
| Requisitos no funcionales                | `docs/auditoria/04-requisitos-no-funcionales.md`    | ✅     |
| Matriz de trazabilidad consolidada       | `docs/auditoria/matriz-trazabilidad-consolidada.md` | ✅     |
| Contradicciones y supuestos              | `docs/auditoria/contradicciones-y-supuestos.md`     | ✅     |
| ADR formalizados (5)                     | `docs/decisiones/`                                  | ✅     |
| Estado de etapas                         | `docs/ESTADO_ETAPAS.md`                             | ✅     |
| Informe de cierre                        | `docs/etapas/ETAPA-00.md`                           | ✅     |

### Definición de Terminado

| Criterio                                         | Resultado                        |
| ------------------------------------------------ | -------------------------------- |
| 38 HU asignadas a etapa concreta                 | ✅ 38/38                         |
| 26 CA asignados a etapa concreta                 | ✅ 26/26                         |
| 37 KPI asignados a etapa concreta                | ✅ 37/37                         |
| Ninguno huérfano                                 | ✅ Verificado por reparto y suma |
| Toda contradicción documentada con su resolución | ✅ 14/14                         |

### Verificación de la línea base de `CLAUDE.md` §1

Inventario contrastado contra el `.docx` original: **coincide punto por punto**.
Confirmado: **`KPI-19` no existe** · la entrada 21 figura como **`KP1-21`** · el total real de indicadores es **37, no 38**.

---

## ETAPA 01 — Modelo de datos y Supabase · **CERRADA**

**Rama:** `etapa-01-modelo-datos-supabase` · **Base:** `develop` · **Cierre:** 2026-09-06
**Ejecutada en dos pasos por indicación del usuario:** 01-A diseño para aprobación, 01-B implementación.

### Entregables

| Entregable                                                | Ruta                                               | Estado |
| --------------------------------------------------------- | -------------------------------------------------- | ------ |
| Diseño del modelo de datos                                | `docs/arquitectura/modelo-datos.md`                | ✅     |
| 16 migraciones versionadas, idempotentes y reversibles    | `supabase/migrations/`                             | ✅     |
| Guiones de reversión, uno por migración                   | `supabase/reversion/`                              | ✅     |
| Matriz RLS y suite de verificación                        | `supabase/policies/`                               | ✅     |
| Semillas de dos copropiedades ficticias                   | `supabase/seed/seed.sql`                           | ✅     |
| Verificador local, sin credenciales                       | `supabase/verificar.sh`                            | ✅     |
| Guía de conexión                                          | `docs/guias/CONEXION_SUPABASE.md`                  | ✅     |
| Diseño de verificación asimétrica (insumo de la ETAPA 03) | `docs/arquitectura/verificacion-jwt-asimetrica.md` | ✅     |
| `.env.example` por aplicación                             | `apps/*/.env.example`                              | ✅     |
| Informe de cierre                                         | `docs/etapas/ETAPA-01.md`                          | ✅     |

### Definición de Terminado

| Criterio                                                         | Resultado                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Las migraciones corren limpias sobre una base vacía              | ✅ Verificado sobre PostgreSQL 16.13                                      |
| RLS activa en el 100 % de las tablas                             | ✅ **42/42** (31 tablas + 11 particiones), activa **y forzada**           |
| Cada RN de integridad tiene contraparte estructural identificada | ✅ 22/22 · `modelo-datos.md` §10                                          |
| _(añadido)_ Idempotencia                                         | ✅ Tres pasadas consecutivas sin error ni cambio                          |
| _(añadido)_ Reversibilidad                                       | ✅ Ciclo completo aplicar → revertir → aplicar, 0 objetos residuales      |
| _(añadido)_ KPI-03                                               | ✅ 100 inserciones concurrentes reales: 1 aceptada, 99 rechazadas, 1 fila |

### Cifras del esquema

31 tablas lógicas · **10 particiones** de `eventos` en un despliegue limpio · 31 enumerados · 95 políticas RLS · **18 migraciones** · 18 guiones de reversión.

> **Precisión sobre el recuento de particiones (2026-09-06).** El informe de cierre decía «11 particiones»: era el número que deja la **suite de pruebas**, que crea una partición adicional a propósito para verificar que nace protegida. Un `supabase db push` limpio deja **10** — la ventana de `app.mantener_particiones_eventos(6, 3)`: seis meses atrás, el actual y tres adelante.
>
> Si al consultar el proyecto real aparecen **80** y **41**, ambos números son correctos y no hay nada que revisar:
>
> | Consulta                                 | Resultado | Por qué                                                                                                                           |
> | ---------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------- |
> | `pg_class WHERE relispartition`          | **80**    | Cuenta particiones de tabla **y de índice**. `eventos` tiene 7 índices, y cada uno se particiona con ella: 10 tablas + 70 índices |
> | `information_schema.tables … BASE TABLE` | **41**    | 31 tablas lógicas + 10 particiones. Una partición es una tabla base a ojos de `information_schema`                                |
> | `pg_class WHERE relkind='p'`             | **1**     | **`eventos` es la única tabla particionada.** Es la comprobación que zanja la duda                                                |
>
> Reproducido localmente con las mismas cifras exactas.

> **Corrección del 2026-09-06 · esquema nuevo de llaves de Supabase.** El proyecto
> no tiene `anon` ni `service_role` como llaves de API, ni secreto JWT compartido:
> usa `sb_publishable_…`, `sb_secret_…` y **firma asimétrica verificada contra
> JWKS**. Se corrigieron los cuatro `.env.example` y la guía de conexión, y se
> escribió `docs/arquitectura/verificacion-jwt-asimetrica.md` como diseño
> vinculante de la ETAPA 03. **Ninguna migración cambió**: las llaves resuelven a
> los mismos roles de PostgreSQL y las políticas leen `request.jwt.claims`, que
> es indiferente al algoritmo de firma.
>
> **SEGUNDA TANDA DE HALLAZGOS del 2026-09-06 · el contenedor mentía.** La migración `0017` falló al aplicarse en Supabase gestionado. Al construir un arnés local que replica sus capacidades reales —rol dueño **no** superusuario: `./supabase/verificar.sh --modo-supabase`— aparecieron **tres defectos que una suite verde había estado ocultando**:
>
> | #   | Defecto                                                   | Por qué era invisible        | Corrección                                                            |
> | --- | --------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------- |
> | 1   | `0017` usaba 4 sentencias que exigen superusuario         | El contenedor lo era         | `0017` reescrita; el rol de conexión pasa a procedimiento de operador |
> | 2   | El **seed** era inaplicable: `FORCE RLS` alcanza al dueño | Un superusuario omite la RLS | El seed fija contexto de claims por tramo                             |
> | 3   | **Recursión infinita** en `app.es_mi_vivienda`            | Ídem: sin RLS no hay ciclo   | Migración `0018`                                                      |
>
> El tercero es el grave: `SECURITY DEFINER` **no** evita la RLS —solo cambia la identidad—, y con `FORCE` las políticas alcanzan al dueño. La política de `residentes` llamaba a una función que lee `residentes`. En Supabase habría estallado con «stack depth limit exceeded» en cuanto un residente consultara sus datos.

> **HALLAZGO CRÍTICO del 2026-09-06 · cerrado por la migración `0017`.** La verificación contra el proyecto real detectó que `eventos` **no estaba protegida**: `REVOKE UPDATE, DELETE` alcanzaba a los roles de aplicación pero no al **dueño** de las tablas, que en Supabase es `postgres` — el usuario de la cadena de conexión por defecto. RN-03, CA-23 y ADR-005 quedaban sin garantía estructural. Peor: la aserción que debía detectarlo llevaba `AND grantee <> 'postgres'`, excluyendo justamente al rol del hallazgo. Cerrado con `REVOKE` al dueño (incluido `TRUNCATE`), trigger `BEFORE UPDATE`, rol de conexión dedicado `app_api` y una aserción que ya no excluye a nadie. Enmienda 1 del ADR-005 · D-22 · guía §12.

> **Actualización del 2026-09-06.** Tras el cierre se incorporó la **política de retención** que el usuario fijó (P-12), como migración `0016`: plazos configurables por copropiedad, RN-11 convertida en cota superior por `CHECK`, y el libro append-only `purgas_retencion`. Los trabajos de purga son de las ETAPAS 06 y 14; aquí queda la política y dónde se acredita.

---

## ETAPA 02 — Andamiaje del monorepo y núcleo hexagonal · **CERRADA**

Monorepo pnpm + Turborepo, API NestJS que no arranca sin configuración completa, núcleo hexagonal con 21 tokens y los puertos de los nueve agregados, y fronteras impuestas por el linter. **DoD verificado por mutación**: seis violaciones introducidas a propósito y rechazadas; arranque sin `.env` abortado con `EX_CONFIG` (78). 27 pruebas, 100 % de cobertura en el dominio (umbral 90 %). Informe en `docs/etapas/ETAPA-02.md`; convenciones en `docs/arquitectura/CONVENCIONES.md`. Deudas nuevas: D-13 a D-16, [SUPUESTO] S-13.

> Verificación de la ETAPA 01 contra el proyecto real (2026-09-06): `pg_has_role(...,'authenticated','MEMBER')` → **true**, así que **D-12 queda cerrada** y el rol `app_api` es viable. `eventos` sin concesiones de UPDATE/DELETE y RLS activa y forzada: cero filas en ambas. La prueba de ejecución del `UPDATE` **quedó pendiente** por tabla de eventos vacía — es la única comprobación del cierre que no está demostrada por ejecución.

## ETAPA 03 — Auth, RBAC, MFA y aislamiento multiempresa · **CERRADA**

Verificación asimétrica del JWT contra JWKS (caché 10 min, suelo de refresco 60 s, HS256 rechazado), RBAC declarativo con denegación por defecto en los dos guards, MFA TOTP obligatorio para los tres roles administrativos, y barrera de aislamiento en la capa de aplicación además de la RLS. **Suite de aislamiento que enumera el enrutador** y recorre los cuatro caminos; rompe el build ante cualquier fuga, comprobado por mutación. 40 pruebas verdes; suite SQL verde en `--modo-supabase`. Corregido el defecto de la 02: `node dist/main.js` no leía `.env`. Informe en `docs/etapas/ETAPA-03.md`. Deudas nuevas: D-17 a D-19t, [SUPUESTO] S-14.

## ETAPA 04 — Padrón · **CERRADA**

VO `Placa` normalizado al construir, agregado `Vivienda` con métodos de intención, primer adaptador PostgreSQL real y carga transaccional desde CSV. **KPI-03 verificado a través del caso de uso contra base real: 100 intentos concurrentes → 1 aceptado, 99 rechazados, 1 fila activa.** RN-19 sin borrado físico, probado por inspección del adaptador y sometido a mutación. **94 pruebas en 15 ficheros** (33 dominio + 61 API), con cobertura medida **por capa**: dominio 97,09 %, aplicación 99,11 %, global 74,91 %. Informe en `docs/etapas/ETAPA-04.md`. Deudas nuevas: D-20t a D-23t, [SUPUESTO] S-15.

> **Corrección del 2026-09-07.** El informe de cierre reportó 51 pruebas verdes y en el entorno del usuario fallaron 3: la suite de la API corría contra un `packages/domain-core/dist` de una etapa anterior, porque `dist` está en `.gitignore` y `pnpm --filter <app> test` no dispara `turbo`. Corregido resolviendo `@ncr/domain-core` al **código fuente** en las pruebas. Se añadió `./scripts/verificar-etapa.sh` como **requisito de DoD de toda etapa** (§2.8.0 del contrato): parte de artefactos limpios, instala con `--frozen-lockfile` y comprueba que **ningún fichero de prueba se quedó sin ejecutar** — un fichero que no carga no cuenta como fallo, desaparece del recuento.

> **Cierre verificado del 2026-09-07 (Adenda 2).** Las cifras del cierre anterior se recalcularon **sin shell**, porque el «8 de 14» venía de un error de conteo y ese mismo shell midió el resto. Hallazgo serio: §2.4 exige 90 % también en **aplicación**, y esa capa **nunca se había medido** — estaba en 79,11 %, con `casos-de-uso.ts` al 48 %. Corregido a 99,11 % con 10 pruebas nuevas; el umbral se comprueba ahora por capa en cada cierre. Además: auditoría de portabilidad ampliada a **cuatro superficies** (`.sh`, `scripts` de `package.json`, `.husky/`, `run:` de workflows), versión de Node declarada en `.nvmrc`/`engines` y comprobada, y **pruebas negativas de los propios controles** automatizadas en el DoD y en CI (Linux y macOS).

> **Requisito registrado para la ETAPA 14 (CI/CD):** la suite `./supabase/verificar.sh --con-pruebas --modo-supabase` y la prueba de concurrencia KPI-03 deben ejecutarse **en CI**, no en el entorno del usuario. Hoy se omiten sin base local, y esa omisión avisa pero no protege.

## ETAPA 05 — Autorizaciones y motor de reglas · **CERRADA**

Motor de reglas como **función pura** `evaluarAcceso(contexto, reglas)`, con reloj inyectado, cero I/O y **100 % de cobertura de ramas** en `packages/domain-core/src/reglas/`. Precedencia vinculante `listaNegra > vigencia > patrón > zona` verificada con dos pruebas de CA-13. Agregado `Autorización` con `Vigencia` cerrado-abierta y `PatrónRecurrencia` con la zona horaria dentro del objeto de valor. Cuatro casos de uso y gestión de listas negras con RN-07 (quién veta ≠ quién levanta). `MockProvider` con los cuatro puertos, latencia, fallos, reintentos, duplicados y baja confianza, todo con generador **con semilla**. **KPI-11 comprobado por ejecución** (`scripts/lib/frontera-hardware.mjs`) en el verificador, en `verificar-frontera.sh` y en CI, con prueba negativa propia. Contrato de firma del Alarm Server (RNF-03.11): sin firma válida, 401. **206 pruebas en 25 ficheros**; cobertura por capa: dominio 99,29 % (ramas 100 %), aplicación 98,38 %, global **81,45 % medido en el contenedor Linux**. La ejecución posterior del usuario en macOS dio **81,78 %**; las dos son válidas y la diferencia no es un error: la cobertura global depende de qué ficheros recorre la corrida y de la máquina que la ejecuta. Se anota el entorno junto a la cifra para que la próxima comparación no parezca una discrepancia. Informe en `docs/etapas/ETAPA-05.md`. [SUPUESTO] S-15 **cerrado**. Deudas nuevas: D-25 a D-28.

> **Defecto de seguridad encontrado y corregido (D-24).** Los controladores de padrón y autenticación importaban sus DTOs con `import type`, lo que borra la clase al compilar y deja el `ValidationPipe` **inerte**: un POST con un tipo equivocado y un campo no declarado llegaba al manejador sin 400. Venía de las ETAPAS 03 y 04. Corregido, con `consistent-type-imports` desactivada en los controladores y una prueba de regresión (`validacion-dtos.e2e.test.ts`) verificada por mutación. Es el tercer caso de la misma familia: **un detalle del compilado que hace inerte un control sin ponerlo en rojo.**

> **Corrección de los dos defectos del verificador reportados desde macOS.** El paso 9 comparaba el contenido en memoria en vez de preguntarle a git, e informaba «package.json quedó alterado» con el árbol limpio; ahora las sondas operan sobre un **clon temporal fuera del árbol** y el estado se compara con `git status --porcelain=v1` antes y después. El paso 10 se colgaba porque la sonda de arranque levantaba la API de verdad en un equipo con `.env` completo; ahora usa `NCR_IGNORAR_ENV_FILE=1` y **todos los pasos tienen límite de tiempo** (`scripts/lib/con-limite.mjs`, portable BSD/GNU).

## ETAPA 06 — Eventos, auditoría inmutable, alertas y tiempo real · **CERRADA**

Agregado `Acceso` **inmutable** —congelado, sin un solo método que cambie su estado, con una prueba que enumera su prototipo y se pone roja si alguien añade uno—. Cierra **D-27**: la ingesta ya no solo acredita la firma, decide y persiste el camino entero (clave → decisión → evento → alerta → escalamiento → aviso). Idempotencia real por el libro `recepciones_evento` (migración **0019**), no particionado: el índice único de `eventos` debe incluir `ocurrido_en`, que **no es estable entre reintentos**, así que no podía deduplicar lo que el Edge reenvía. Histórico con filtro completo (cubre el hueco D-05 del mockup), paginación **por conjunto de claves** y exportación a CSV, Excel y PDF **sin dependencias nuevas**. Evidencia por URL firmada de vida corta (RN-21). **413 pruebas en 40 ficheros**; cobertura por capa medida en el contenedor Linux: dominio 99,58 % (ramas 100 %), aplicación 97,67 %, global 89,29 %. Informe en `docs/etapas/ETAPA-06.md`.

### El pendiente de la ETAPA 01, **cerrado por ejecución**

El cierre de la 01 anotó que la prueba del `UPDATE` sobre `eventos` quedaba sin hacer por tabla vacía. Ahora hay filas: `test/eventos-pg.test.ts` inserta un evento **por el adaptador de la aplicación**, intenta el `UPDATE` y el `DELETE` con el rol de conexión —dueño **no** superusuario, como en Supabase— y exige que ambos sean rechazados y que la fila siga intacta.

**Verificado por mutación:** con el trigger desactivado y el `UPDATE` reconcedido, la prueba se pone roja. El experimento dejó además un dato útil que ADR-005 afirmaba sin demostrar: **la RLS sí es la tercera capa** —el `UPDATE` afectó a 0 filas y la fila sobrevivió intacta—, pero **no lanza**, solo no hace nada. Por eso la prueba exige un error y no solo una fila sin alterar: un no-op silencioso no es «rechazar la operación» (CA-23).

### Hallazgo: una clave ajena hacia una tabla append-only es imposible

`alertas_evento_fk` (migración 0011) apuntaba a `eventos`. La comprobación de integridad referencial bloquea la fila referenciada con `SELECT … FOR KEY SHARE`, y PostgreSQL exige para ese bloqueo el privilegio UPDATE o DELETE **además** del SELECT — que ADR-005 revoca a todos, dueño incluido. Toda inserción en `alertas` con `evento_id` habría fallado con «permission denied for table eventos».

Vivió cinco etapas invisible porque las dos tablas estaban vacías: **una restricción que nunca se ejerce no se distingue de una que funciona.** Es la cuarta de la misma familia. Corregido en la migración **0021**, que también arregla el gemelo `consent_evidencia_fk` → `evidencias` (lo destapó su propia aserción general) y deja `scripts/lib/frontera-append-only.mjs` como **sexto control con prueba negativa**, que lo detecta al escribir la migración y no al aplicarla.

### P-06 y P-07, resueltas

| ID   | Decisión                      | Resolución del usuario (2026-09-07)                                                                                                                                                                                                                                                           |
| ---- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-06 | Umbral de latido              | Conservador y **configurable por copropiedad** (migración 0020): latido cada 60 s, 1 latido tolerado, caído a los 300 s. Tres estados —`saludable`, `degradado`, `caido`— y solo el último alerta · **SUSTITUIDA en la 15-B**: deja de ser configurable (ver §P-06 en la tabla de decisiones) |
| P-07 | Definición de «acceso dudoso» | **Escalar en vez de decidir.** No es un motivo concreto: es toda decisión que el motor no pudo cerrar con certeza (4 casos enumerados en `politica-alertas.ts`), y su consecuencia es un humano                                                                                               |

### KPI-25 medido bajo carga, no supuesto

200 eventos en ráfaga con 25 consolas SSE conectadas: **200/200 entregadas**, p50 2 ms, p95 5 ms, p99 9 ms, máximo 15 ms, contra un umbral de 10 000 ms. Detalle, escalera de contingencia y procedimiento para medir Supabase Realtime cuando haya credenciales: `docs/arquitectura/tiempo-real-y-contingencia.md`.

> **La prueba de carga encontró un defecto que no era la latencia.** La primera ejecución entregó **120 de 200** —exactamente el límite del `throttler` por IP— con 200 dispositivos distintos saliendo por una sola IP. El `@Throttle({ default: … })` de la ruta reconfigura el limitador `default` para **todos** los guards, incluido el global, que cuenta por IP. Era el defecto que el propio comentario del código decía evitar. En un conjunto real todas las cámaras comparten enrutador: el tope las habría sumado a todas y habría empezado a rechazar eventos en silencio. Corregido con dos limitadores **con nombre** (`default` por IP, `dispositivo` por equipo firmante), cerrando D-28.

> **Tres correcciones al propio verificador.** (1) `supabase/verificar.sh` concedía la pertenencia a `authenticated` **antes** de aplicar las migraciones; en PostgreSQL 16 un rol con `CREATEROLE` que crea otro recibe sobre él una pertenencia implícita con `set_option = false` que **sustituye** a la anterior, así que en un clúster limpio la suite SQL no podía ni arrancar (`permission denied to set role`). Solo se veía en una máquina nueva: los roles son de ámbito de clúster y `DROP DATABASE` no los borra. (2) El paso de base real daba **verde con el servidor caído**, porque esas pruebas se omiten solas y el guion leía la omisión como éxito. Ahora comprueba la marca `OMITIDA`: una omisión no es un verde. (3) `metricas.mjs` imprimía «(sin resumen de cobertura)» y **seguía**: una ejecución informó «las tres capas cumplen su umbral» midiendo 21 archivos en vez de 83, con la capa de aplicación desaparecida. Ahora una capa sin medir es fallo.

## ETAPA 07 — Zonas comunes: horario y aforo · **CERRADA**

Agregado `Zona` con `Aforo`, `HorarioDeZona` y política de reinicio; casos de uso `ConfigurarZona`, `AutorizarZonaAVisitante`, `ValidarAforo` y `LiberarAforo`; adaptadores PostgreSQL y en memoria; superficie HTTP bajo `/copropiedades/:id/zonas`. La zona entra al contexto del motor **ya resuelta** por el puerto `ResolutorDeZona`: el motor no consulta nada, sigue siendo la función pura de la ETAPA 05. **538 pruebas en 47 ficheros**; cobertura por capa medida en el contenedor Linux: dominio 99,67 % (ramas 99,21 %), aplicación 97,82 %, global 88,30 %, y el paso 14 exige que tres corridas den lo mismo. Informe en `docs/etapas/ETAPA-07.md`.

### El aforo lo garantiza la base, y la mutación demuestra por qué

El adaptador ocupa una plaza con una sola sentencia:

```
UPDATE public.zona_aforo SET conteo_actual = conteo_actual + 1
 WHERE copropiedad_id = $1 AND zona_id = $2 AND conteo_actual < aforo_maximo
RETURNING conteo_actual
```

**Cero filas devueltas ES el aforo superado.** No hay `SELECT` previo, así que no hay ventana entre comprobar y ocupar. `test/aforo-concurrencia.test.ts` lanza **50 ingresos simultáneos por 50 conexiones distintas** sobre una zona de 10 plazas: entran 10, y los conteos devueltos son 1..10 sin repetirse.

> **Lo que enseñó la mutación.** Sustituido el incremento atómico por una lectura seguida de una escritura, **los 50 entraron y los 50 recibieron `conteo = 1`**. Y el `CHECK (conteo_actual <= aforo_maximo)` **no lo detectó**: cada escritura fijaba un valor absoluto —1— que nunca supera el máximo. El `CHECK` impide la fila inválida; el incremento atómico impide la carrera. No son redundantes: son las dos mitades de la misma garantía, y solo una prueba con concurrencia real las distingue.

La prueba está cableada en el **paso 13** de `verificar-etapa.sh`, junto a KPI-03 y la inmutabilidad de eventos, con la misma comprobación de `OMITIDA`. En memoria pasaría con cualquier implementación: JavaScript tiene un hilo y dos peticiones nunca coinciden.

### S-09 cerrado: la medianoche no reinicia el contador

Una jornada que cruza el día se modela con **dos franjas** enlazadas por `continua_del_dia_anterior` (migración `0007`, ETAPA 01). `HorarioDeZona.cierraJornada` solo reconoce cierre de jornada cuando una franja termina a las 24:00 **y no hay continuación al día siguiente**; si la hay, el corte es artificio de representación y `debeReiniciarAforo` devuelve `false`. Una fiesta de las 22:00 del sábado a la 01:00 del domingo no vacía el salón a medianoche.

### P-04 resuelta y S-17 nuevo

| ID   | Asunto                                                     | Resolución                                                                                                                                                                                                                                     |
| ---- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-04 | Reinicio del contador de aforo                             | **RESUELTA** — tres políticas por zona (`cierre_horario` por defecto, `manual`, `nunca`), columna `zonas.politica_reinicio_aforo`. Cubre CU-05 excepción 6a: salida no registrada por fallo de sensor no deja el contador inflado para siempre |
| S-17 | Toda zona común exige permiso explícito de la autorización | Es lo que separa CA-15 (`FUERA_DE_HORARIO`) de `ZONA_NO_AUTORIZADA` (CU-05 alterno 2a). Las zonas de paso se modelan sin `zonaId` en la solicitud. Conservador: sin permiso, se deniega                                                        |

### La prueba intermitente, resuelta antes de cerrar

La primera ejecución del usuario falló con `socket hang up` en la primera prueba HTTP de zonas y la segunda pasó sin tocar nada. No se cerró la etapa hasta hacerla determinista, porque **una intermitente enseña a reejecutar hasta el verde**.

**Causa, medida:** `crearApp` hacía `app.init()` y nunca `listen()`. `supertest`, si el servidor no escucha, lo levanta él en su constructor y lo **cierra** al terminar la petición. Instrumentado: **300 peticiones producían 300 `listen()` y 300 `close()`**, y el servidor terminaba sin escuchar; con `await app.listen(0)`, **un `listen()` y ningún `close()`**. La URL se fija en el constructor y la conexión se abre después: basta con que otra petición cierre el servidor en medio. Se descartó por ejecución la carrera de `keepAlive` —superagent manda `Connection: close`— y no hay temporizadores en `src/`. **No se reprodujo el fallo exacto en el contenedor** (ocho corridas completas y 120 ciclos de app nueva + primer golpe, todas verdes); lo que está medido es el mecanismo.

**Lo que destapó el arreglo:** con el servidor vivo afloró un `Unhandled Error` (ECONNRESET tras el `abort()` de la prueba SSE) que el cierre de `supertest` venía ocultando. Reescrita con `fetch` + `AbortController`.

**Revisión del resto de la suite:** el `sleep` de 200 ms de la medición KPI-25 pasa a espera por condición (`event: listo`); la placa de KPI-03 se generaba con los cuatro últimos dígitos del reloj —se repiten cada diez segundos, y en `vehiculos` no hay borrado— y las claves de `eventos-pg` con `Date.now()`: ambas con entropía real. Ese defecto **solo se ve ejecutando la suite dos veces**.

### Paso 14 · control genérico contra intermitencias

`scripts/lib/estabilidad.mjs` corre la suite **tres veces** y exige resultado idéntico: recuentos por paquete, ficheros, títulos en rojo y **errores no manejados**, que cuentan como fallo aunque las pruebas salgan verdes. Séptimo control con prueba negativa.

> **Dos trampas del propio control, encontradas antes de confiar en él.** Sin `TURBO_FORCE` la segunda corrida es `cache hit, replaying logs`: reimprime los números sin ejecutar nada — el falso verde más redondo posible. Y los códigos de color de Vitest impedían reconocer una sola línea de recuento: comparar dos firmas vacías daba «idéntico». Ahora fuerza la ejecución y falla si no reconoce ningún recuento.

### Hallazgo: `apps/api` lintaba solo `src`

`"lint": "eslint src"` dejaba **`apps/api/test/` —diez ficheros— fuera de ESLint en CI**. Solo lo veía el gancho de pre-commit, que es local y se puede saltar con `--no-verify`. Se destapó al intentar el commit de esta etapa: dos errores que `pnpm lint` había dado por buenos. Corregido a `eslint src test`. Misma familia que los anteriores: **un control que existe y no alcanza lo que cree alcanzar.**

## ETAPA 08 — Biometría con consentimiento · **CERRADA**

Ciclo completo del dato más sensible del sistema: captura, calidad, consentimiento del **titular**, sincronización, supresión y retirada de cada terminal. Agregados `ConsentimientoBiometrico` y `PlantillaBiometrica`, `PolíticaConsentimiento` (§2.2), cinco casos de uso, bóveda AES-256-GCM y superficie HTTP contra `MockProvider` (ADR-03). **645 pruebas en 53 ficheros**; cobertura por capa en el contenedor Linux: dominio 98,61 % (ramas 97,78 %), aplicación 98,15 %, global 90,04 %. Informe en `docs/etapas/ETAPA-08.md`; entregable en `docs/seguridad/ciclo-vida-biometrico.md`.

### RN-10 no se cumple con un `if`, sino con una ausencia

No hay columna donde escribir «el residente consintió por él» (D-08), no existe el método `delegar` —una prueba enumera el prototipo y falla si alguien lo añade— y `quienResponde` sale del token, nunca del cuerpo: si lo pusiera el cliente, la regla sería una casilla que cualquiera marca.

### El cerrojo que faltaba, quinta aparición de la misma familia

Sincronizar no es cambiar el estado de la plantilla: es escribir la fila que dice que está en **ESE equipo**. `plantilla_sincronizaciones` no tenía disparador, así que esa fila se insertaba con el consentimiento pendiente, rechazado o revocado. Los dos cerrojos de la ETAPA 01 vigilaban la puerta de al lado, y no se veía **porque no había filas que la cruzaran** — como la clave ajena imposible de la ETAPA 06, esta vez sobre el dato más sensible. Migración `0022`: ahora son tres niveles, los tres verificados por mutación.

### El vector no sale porque no hay operación que lo saque

`BovedaDePlantillas` no ofrece `leerVector`. Se cifra al guardar y se descifra dentro del adaptador, hacia la terminal. Exponerlo exigiría **añadir la operación al puerto**, que es una decisión visible en una revisión y no un descuido. Una prueba e2e lo vigila enumerando el enrutador, no leyendo el código. GCM y no CBC porque hace falta autenticar: sin etiqueta, quien escriba en la base sustituye la plantilla de un visitante por la suya y el lector la acepta.

### Tres defectos propios, encontrados por la prueba y por la mutación

1. El encolado de la retirada usaba `'pendiente'` y **el cerrojo nuevo lo rechazaba**: dos garantías escritas la misma tarde chocando. El error era del encolado —ahí `'pendiente'` significa «pendiente de sincronizar»—. La cola de retirada no necesita estado: es derivable, y un estado derivable que se persiste acaba desincronizado de su origen.
2. La prueba de la cota legal **daba verde con el CHECK retirado**: la hacía sobre la plantilla de un visitante, donde otro disparador la salvaba. Probaba otro control creyendo probar este.
3. Sincronizar contra una terminal desconocida devolvía **500**. Un lector apagado es un fallo técnico (503, con el equipo nombrado); confundirlo con el 403 del consentimiento acusa al visitante de algo que no hizo.

### D-34 cerrado: eran 35, no tres

La cuenta de la ETAPA 07 salió de un `grep` que solo veía `../<modulo>/<capa>` y se dejaba fuera todos los `../../`. `scripts/lib/frontera-modulos.mjs` es el control, octavo con prueba negativa; qué cuenta como módulo se deriva de la estructura, así que `biometria` quedó cubierto el día que se creó.

## Etapas 09 a 16 — `PENDIENTE`

Sin trabajo iniciado. Cada etapa se habilita cuando la anterior queda cerrada.

### Insumos que la ETAPA 01 hereda de la 00

| Insumo                                                         | Dónde está                                               |
| -------------------------------------------------------------- | -------------------------------------------------------- |
| Los **nueve** agregados raíz con sus invariantes y campos      | `02-arquitectura.md` §2.1                                |
| Mínimo de tablas y requisitos no negociables del esquema       | `CLAUDE.md` §6 ETAPA 01                                  |
| Invariantes que exigen contraparte estructural                 | `matriz-trazabilidad-consolidada.md` §2                  |
| ADR-004 (índices únicos parciales) y ADR-005 (`REVOKE`)        | `docs/decisiones/`                                       |
| Requisitos no funcionales de seguridad, auditoría e integridad | `04-requisitos-no-funcionales.md` RNF-03, RNF-04, RNF-08 |
| C-02 (nueve agregados) y C-22 (lectura correcta de KPI-01)     | `contradicciones-y-supuestos.md`                         |

---

## Registro de decisiones pendientes

Detalle completo en [`auditoria/contradicciones-y-supuestos.md`](auditoria/contradicciones-y-supuestos.md) §3.

| ID    | Decisión                                                             | Bloquea a partir de              | Estado                                                                                                                                                                                                                                                                                                                                                                            |
| ----- | -------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-01  | Firma de documentos de cesión, confidencialidad y seguridad          | _(condición contractual previa)_ | Abierta                                                                                                                                                                                                                                                                                                                                                                           |
| P-02  | Umbral de confianza de lectura de placa                              | ETAPA 15                         | **RESUELTA** (15-B) — 80 en la escala **0–100 de `confidenceLevel`** del evento ANPR, no en centésimas inventadas. Deja de ser ajuste de pantalla y pasa a constante documentada, fijada por restricción (migración 0032)                                                                                                                                                         |
| P-03  | Plazo de respuesta al consentimiento                                 | ETAPA 08                         | Abierta — supuesto vigente: 24 h                                                                                                                                                                                                                                                                                                                                                  |
| P-04  | Política de reinicio del contador de aforo                           | ETAPA 07                         | **RESUELTA** (ETAPA 07) — tres políticas por zona; `cierre_horario` por defecto                                                                                                                                                                                                                                                                                                   |
| P-05  | Margen de vigencia del caché de reglas                               | ETAPA 12                         | Abierta — supuesto vigente: 24 h                                                                                                                                                                                                                                                                                                                                                  |
| P-06  | Umbral de latido de dispositivo                                      | ETAPA 06                         | **SUSTITUIDA** (15-B) — la resolución de la ETAPA 06 lo dejaba **configurable por copropiedad**; ya no lo es. La base lo ata al periodo de latido y a los latidos tolerados (0020), y dejarlo editable permitía contradecir esa restricción desde una pantalla. Constante documentada: 5 minutos. **Quien cambió la decisión: el usuario, en el encargo de la 15-B (frente B.5)** |
| P-07  | Definición de «acceso dudoso»                                        | ETAPA 06                         | **RESUELTA** (ETAPA 06) — ante la duda, escalar a un humano                                                                                                                                                                                                                                                                                                                       |
| P-08  | Plataforma de despliegue de la API                                   | ETAPA 14                         | Abierta                                                                                                                                                                                                                                                                                                                                                                           |
| P-09  | ¿Compuerta de aprobación administrativa?                             | ETAPA 05                         | Abierta — no se construye                                                                                                                                                                                                                                                                                                                                                         |
| P-10  | ¿Reservas de zonas sin cobro?                                        | ETAPA 07                         | Abierta — no se construyen                                                                                                                                                                                                                                                                                                                                                        |
| P-11  | «Nivel de acceso» por residente                                      | ETAPA 04                         | Abierta — valor por defecto restrictivo                                                                                                                                                                                                                                                                                                                                           |
| P-14  | `secret scanning` y `push protection` de GitHub                      | _(ajuste del servidor)_          | **Abierta (ETAPA 13)** — con ellos activos, H-13-17 tendría además una barrera antes de que el objeto llegue al remoto. Desde el árbol no se ve; se comprueba en _Settings → Code security and analysis_                                                                                                                                                                          |
| AR-01 | Aceptar la contraseña inerte del historial sin reescribirlo          | _(decisión del cliente)_         | **Redactada, sin firmar** (ETAPA 13) — `seguridad/AUDITORIA.md` §7                                                                                                                                                                                                                                                                                                                |
| AR-02 | Aceptar las 12 vulnerabilidades moderadas y bajas restantes          | _(decisión del cliente)_         | **CERRADO** (15-U, 2026-10-03) — no se aceptó: `pnpm audit --prod` de 12 (3 bajas, 9 moderadas) a 0 con NestJS 11 y Express 5                                                                                                                                                                                                                                                     |
| AR-03 | Aceptar D-09 y D-12 demostrados en el clúster que reproduce Supabase | ETAPA 15                         | **Redactada, sin firmar** (ETAPA 13) — se cierra con credenciales del proyecto real                                                                                                                                                                                                                                                                                               |
| AR-04 | Aceptar el ciclo de recuperación como NO VERIFICABLE                 | _(bloqueo de entorno)_           | **Redactada, sin firmar** (ETAPA 13) — se reabre en cuanto haya permisos en el panel                                                                                                                                                                                                                                                                                              |

---

## Deuda técnica acumulada

| ID   | Deuda                                                                                                                                                                                                                                             | Origen                  | Se salda en                                                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01 | `CLAUDE.md` §2.2 declara 6 agregados raíz donde el diagrama declara 9                                                                                                                                                                             | C-02                    | Corrección del contrato, a decisión del usuario                                                                                                               |
| D-02 | Dos pantallas no existen en los mockups: captura de rostro y consentimiento del visitante                                                                                                                                                         | M-02, M-03              | ETAPA 08 (diseño) · 11 (implementación)                                                                                                                       |
| D-03 | Los 5 estados obligatorios (vacío, cargando, error, sin permiso, offline) no están diseñados en ninguna de las 18 pantallas                                                                                                                       | `03-mockups.md` §4      | ETAPAS 09, 10, 11                                                                                                                                             |
| D-04 | HU-03 (carga de padrón por archivo) sin punto de entrada en la interfaz                                                                                                                                                                           | M-04                    | ETAPA 09                                                                                                                                                      |
| D-05 | El filtro de eventos del mockup no cubre HU-32 (falta fecha y vivienda; solo XLS)                                                                                                                                                                 | M-08                    | ETAPA 09                                                                                                                                                      |
| D-06 | La consola operativa del mockup fusiona portería y guardia virtual y omite 4 exigencias                                                                                                                                                           | C-12                    | ETAPA 10                                                                                                                                                      |
| D-07 | 9 indicadores solo verificables con hardware; hasta entonces se reportan como «pendiente de hardware»                                                                                                                                             | ADR-003                 | ETAPA 15                                                                                                                                                      |
| D-08 | El dueño de las tablas (`postgres`) conserva `ALTER TABLE … DISABLE TRIGGER` sobre las append-only. Cerrarlo exigiría que el dueño no fuera `postgres`, lo que rompería `supabase db push`                                                        | ADR-005 Enmienda 1      | **CERRADA en la ETAPA 13** (H-13-03): no es un acto de DDL, son **cuatro**, y el despliegue detecta los cuatro. La `0031` cubre la capa que faltaba           |
| D-09 | La base local corre con un dueño **superusuario** y Supabase no. Un `REVOKE` al dueño no se puede demostrar por ejecución en el contenedor, solo leyendo el ACL                                                                                   | Hallazgo del 2026-09-06 | **CERRADA en la ETAPA 13** por ejecución en `--modo-supabase`, con el dueño `sb_postgres_sim` NO superusuario. Contra el proyecto real: **AR-03**, sin firmar |
| D-10 | Las aserciones de las migraciones ya aplicadas (`0015`, `0016`) no se reejecutan: `supabase db push` solo aplica migraciones nuevas. Una corrección de aserción solo protege despliegues limpios                                                  | Hallazgo del 2026-09-06 | Toda corrección de garantía va en una migración **nueva**, nunca editando una aplicada                                                                        |
| D-11 | `tg_usuario_tenant` evalúa una invariante (D-02) consultando `roles_usuario` **bajo RLS**: su veredicto depende de la visibilidad del llamante. Es `DEFERRABLE INITIALLY DEFERRED`, así que corre en el `COMMIT` con el contexto que quede activo | Arnés `--modo-supabase` | ETAPA 03, al definir el contexto de sesión de la API. Mitigado en el seed restaurando el contexto antes del `COMMIT` ([SUPUESTO] S-11)                        |
| D-12 | Que `postgres` pueda `GRANT authenticated TO app_api` es un supuesto sin verificar contra el proyecto real ([SUPUESTO] S-12). La documentación de Supabase concede en la dirección contraria                                                      | Enmienda 2 del ADR-005  | Sonda de `CONEXION_SUPABASE.md` §12.1, antes de crear el rol                                                                                                  |

---

## Deuda de la ETAPA 08

| ID   | Deuda                                                                                                         | Se salda en                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| D-34 | Importaciones que entran en un módulo por dentro y no por su barril                                           | **CERRADA** en la ETAPA 08, con control y prueba negativa              |
| D-39 | Repositorios de biometría y almacén de sobres cifrados, en memoria                                            | Misma raíz que D-25, D-35 y D-17. La frontera es definitiva            |
| D-40 | `BarrerPlantillasVencidas` sin planificador: hoy se invoca por su ruta HTTP                                   | ETAPA 14, con pg-boss                                                  |
| D-41 | La derivación de la llave es `sha256` del secreto; procede una KDF con sal por copropiedad                    | **CERRADA en la ETAPA 13** (H-13-02): HKDF con la copropiedad como sal |
| D-42 | El sistema no distingue a un menor de edad, cuyo dato biométrico exige consentimiento del representante legal | Decisión de Grupo Control antes de producción                          |
| D-43 | `LatidoDto` cruza de `eventos` a `autorizaciones`: el controlador de ingesta vive en el módulo equivocado     | ETAPA 15                                                               |

## Deuda de la ETAPA 07

| ID       | Deuda                                                                                                                                                                                 | Se salda en                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~D-34~~ | El control de fronteras no exige que un módulo importe a otro **por su barril**                                                                                                       | **CORRECCIÓN DE LA ETAPA 14: esta fila era una COLISIÓN DE IDENTIFICADOR.** El identificador D-34 ya estaba emitido en la ETAPA 08 para esa misma deuda, y allí figura **CERRADA con control y prueba negativa**. El control —`scripts/lib/frontera-modulos.mjs`— existe desde la 08, su cabecera dice «se destapó al cerrar la ETAPA 07 (D-34)», tiene sonda negativa (8) y corre en el verificador y en CI: «11 módulos, ninguna importación entra por dentro». Nada faltaba. El registro dice que los identificadores emitidos **no se reutilizan**, y esta fila lo hizo. Se marca para que la referencia siga resolviendo y no se vuelva a contar como deuda |
| D-35     | `RepositorioZonasPg` existe y se prueba contra base real, pero lo cableado en runtime es el doble en memoria                                                                          | Misma raíz que D-25: sin contraseña de PostgreSQL (D-17). La frontera es definitiva; cambia la fábrica y nada más                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D-36     | El reinicio por `cierre_horario` se **proyecta al leer** y se persiste al ocupar: una zona que nadie toca en un mes conserva su fila con el conteo antiguo hasta el siguiente ingreso | ETAPA 14, con pg-boss: un trabajo programado que lo aplique sin depender de que alguien entre                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D-37     | `LiberarAforo` no exige identificar a quién sale: el contador baja pero no consta qué plaza se liberó                                                                                 | ETAPA 10, cuando la portería registre la salida contra el evento de entrada                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| D-38     | El paso 14 ejecuta la suite tres veces: el cierre de etapa pasa de ~40 s de pruebas a ~2 min                                                                                          | Precio aceptado. ETAPA 14: en CI puede repartirse entre trabajos en paralelo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| P-10     | «¿Reservas de zonas sin cobro?» sigue abierta: esta etapa construye **aforo y horario**, no reservas, aunque el mockup muestre «Reservas del día»                                     | Decisión del usuario. Fuera de alcance mientras no se resuelva                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Deuda de la ETAPA 06

| ID    | Deuda                                                                                                                                                                                               | Estado / se salda en                                                                                                                                            |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-25  | Autorizaciones y listas negras sin adaptador PostgreSQL                                                                                                                                             | **Sigue abierta.** Sin contraseña (D-17). La FRONTERA quedó definitiva: `RepositorioEventosPg` cumple el mismo puerto que el doble y se prueba contra base real |
| D-27  | La ingesta aceptaba el evento sin persistirlo ni decidirlo                                                                                                                                          | **CERRADA** en la ETAPA 06                                                                                                                                      |
| D-28  | Rate limiting por dispositivo en la ingesta                                                                                                                                                         | **CERRADA** en la ETAPA 06, con el defecto del limitador `default` corregido                                                                                    |
| D-21t | Claims por petición al repositorio                                                                                                                                                                  | **CERRADA de facto**: `RepositorioEventosPg` recibe los claims por constructor y fija `request.jwt.claims` en la misma conexión que ejecuta la sentencia        |
| D-29  | `CanalEnProceso` reparte solo entre los suscriptores de SU proceso: con más de una instancia de API, un operador conectado a la B no ve lo publicado por la A                                       | ETAPA 14 — peldaño 1 de la escalera de contingencia (`LISTEN/NOTIFY`)                                                                                           |
| D-30  | El notificador push deja constancia y encola, pero no envía: FCM exige el registro de tokens del dispositivo del residente                                                                          | ETAPA 11                                                                                                                                                        |
| D-31  | `VigilarLatidos` es una operación idempotente sin planificador: nadie la invoca todavía                                                                                                             | ETAPA 14 (pg-boss)                                                                                                                                              |
| D-32  | El trigger que sustituye a las claves ajenas retiradas comprueba existencia **sin bloqueo de fila**: no protege de una referencia a una fila insertada en una transacción concurrente sin confirmar | Riesgo residual declarado. Consecuencia nula mientras no se borren eventos; se reevalúa en la ETAPA 13                                                          |
| D-33  | La exportación tiene tope de 10 000 filas y declara el truncado por cabecera; la consola debe mostrarlo                                                                                             | ETAPA 09                                                                                                                                                        |
