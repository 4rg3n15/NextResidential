# ETAPA 15-D · Consolidación funcional, desacople de hardware y cierre de D-25

**Rama:** `etapa-15d-integracion-extensible` · **Base:** `develop` (`e075e82`)

| Commit     | Qué trae                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| `a12010a`  | `feat(etapa-15d/autorizaciones)`: cierra D-25 — el motor decide con el contexto de la base (O1)                           |
| `a9e5c83`  | `feat(etapa-15d/proveedores)`: decide por capacidades, adaptador ficticio y registro real de equipos (O2)                 |
| `e182275`  | `feat(etapa-15d/proveedores)`: evento en JSON por parte, clases rostro y llamada, transporte de suscripción por capacidad |
| `cbd1e83`  | `feat(etapa-15d/consola)`: CRUD de viviendas, vehículos, visitantes con fotografía y zonas (O3)                           |
| `6c1f4ef`  | `feat(etapa-15d/equipos)`: diagnóstico polimórfico, ficha en servicio, edición y guion de sitio (O4)                      |
| `c8f9286`  | `feat(etapa-15d/seguridad)`: ninguna respuesta lleva la red del equipo, edición parcial y aviso del accionador (O5)       |
| _(cierre)_ | `docs(etapa-15d)`: informe, ADR-019/020/021, contradicciones C-28 a C-31, auditoría de exposición y ESTADO                |

Esta ronda **NO se fusiona**: abre PR contra `develop` y se detiene ahí.

> **ESTA RONDA NO CIERRA LA ETAPA 15, y la 15 sigue BLOQUEADA (`BE-02`).**
> Todo lo que aquí se afirma está clasificado como **DOCUMENTADO**, **SIMULADO**,
> **PROBADO CONTRA MOCK** o **VERIFICADO CONTRA HARDWARE REAL**. En esta ronda
> **no hay ni una afirmación de la cuarta clase**: el entorno no alcanza ninguna
> dirección privada y no se habló con ningún aparato. §11 enumera lo que sigue
> sin demostrarse, KPI por KPI e hito por hito, sin suavizarlo.

---

## 1 · CAMBIOS · qué se construyó

**O1 · D-25 cerrado.** El motor de reglas dejó de negar todo por `FALLO_TECNICO`:
`CargadorDeContextoPg` lee autorizaciones activas, padrón, lista negra y umbral
de confianza en **una consulta** por lectura, y la selección del cargador se dice
al arrancar. El cargador conservador se conserva como alternativa declarada
(`CARGADOR_DE_CONTEXTO=conservador`), no como defecto silencioso. Umbral único
en la escala 0–100 del evento (D6). _Probado contra base real y contra mock._

**O2 · El hardware se elige por capacidades.** Vocabulario neutral con tres
estados, registro de adaptadores, adaptador ficticio «Órbita» que pasa la suite
de contrato sin tocar el dominio, y el control de CI `frontera-extensibilidad`
que rompe el build si esa condición se rompe (ADR-019). Las capacidades se
descubren al sondear y se persisten en `dispositivos`. _Probado contra mock._

**O3 · La consola completa su CRUD.** Zonas: alta, edición (horario, aforo,
icono, normas, cierre manual) y baja lógica, con repositorio PostgreSQL cableado
(P1). Padrón: edición de vivienda y de vehículo, borrado definitivo de vehículo
sólo sin historial (disparador 0034), regeneración con modos `conservar` y
`sobrescribir`. Visitantes: placa y observaciones al crear, modificación de una
autorización viva y **fotografía de identificación** por el camino de la
evidencia —tipo real por bytes, tope antes de decodificar, bucket privado, URL
firmada de 120 s— que **no es dato biométrico** (ADR-021). D7 verificado por
prueba (`padron-por-nombre.test.ts`, contra base). _Probado contra base real,
contra mock y por HTTP._

**O4 · Terminal y videoportero al nivel de la cámara.** El diagnóstico lleva la
familia y descubre las capacidades en la misma ronda; la ficha es polimórfica
(una terminal ya no recibe cinco «sin comprobar» de cámara); la terminal que
decide sola es `decide_solo` salvo declaración expresa (cierra **D-130** en lo
que se puede cerrar sin equipo); un equipo en servicio se vuelve a sondear con
la clave guardada (`POST …/diagnostico`); la consola gana «Ficha» con
correcciones y «Editar». El guion de sitio, **roto desde la 15-C** (D-132),
vuelve a funcionar con una entrada de operación propia, imprime la ficha por
familia, rotula KPI-13/KPI-32 y mide un **proxy** de KPI-33. _Simulado y
probado contra mock._

**O5 · Blindaje y arranque honesto.** Ninguna respuesta lleva `host`, `puerto`,
`protocolo` ni `usuario` de un equipo, para ningún rol (C-28 revoca C-11); la
edición es parcial y el servidor conserva lo que el cliente no vio; el
accionador de puerta activo se anuncia al arrancar con su consecuencia. Auditoría
de exposición del árbol y del historial: **limpia** (§7).

## 2 · PROBLEMAS · lo que se encontró y no estaba en la lista

| Id        | Qué                                                                                                                                                                                                                       | Estado                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **D-131** | Desde la 09-B, **ninguna autorización creada desde la consola llegaba a existir contra base real**: `autorizado_por` recibía el usuario de la consola y el disparador RN-05 lo rechazaba. Los dobles no tienen disparador | **Corregido** (ADR-020, S-38) · C-31                            |
| **D-132** | `scripts/puesta-en-marcha-equipos.mjs` importaba del barril símbolos que la 15-C dejó de exportar: **roto desde `ea69d9a`**, y nada lo ejecutaba                                                                          | **Corregido** (`@ncr/providers/operacion`, `--simulado`) · C-30 |
| **D-133** | Una clave ajena hacia una tabla append-only se escribió por **tercera** vez (0034, tras 0008 y 0021): falta un control que lo detecte antes de aplicar la migración                                                       | **Abierto** · ETAPA 16 · C-29                                   |
| **D-130** | El modo de la terminal se declaraba sin que nada lo cotejara con el equipo                                                                                                                                                | **Corregido contra simulado**; contra equipo, con equipos       |
| —         | `pruebas-negativas.mjs` ya usaba los identificadores D-113 y D-114 para otros defectos; los de esta ronda se renumeraron a D-131 y D-132 antes de documentarlos                                                           | Resuelto                                                        |

**D-101** no reapareció en ninguna corrida de esta ronda; sigue abierta y no se
cierra por ausencia.

## 3 · Cómo se organizó y por qué

### 3.1 · El motor lee de la base, y lo dice

`CargadorDeContextoPg` es el adaptador de un puerto que existía desde la ETAPA 05
y que nadie implementaba contra base. Lee en **una** sentencia lo que el motor
necesita y lo entrega cerrado; el motor sigue siendo puro. La elección del
cargador es una variable validada al arranque y se **anuncia** en la bitácora
con su consecuencia, igual que el proveedor de equipos y, desde O5, el
accionador: un adaptador que entra en silencio es la forma más cara de fallar
bien.

### 3.2 · Capacidades, no marcas

El proveedor real pregunta al equipo qué sabe hacer y actúa sobre ese
vocabulario; la familia sólo decide qué preguntar. `desconocida` bloquea: es la
dirección segura y produce fricción en el alta, que la ficha resuelve diciendo
el campo exacto. La prueba de fuego es un fabricante inventado que pasa la suite
de contrato. Detalle en
[`extensibilidad-por-capacidades.md`](../arquitectura/extensibilidad-por-capacidades.md).

### 3.3 · Dos caminos para dos fotos

La captura biométrica (CU-02) y la fotografía de identificación del visitante
comparten sólo la reducción de imagen. La segunda va por el camino de la
evidencia: referencia en `evidencias`, hash, bucket privado, URL firmada. Ni
plantilla ni terminal. ADR-021 fija por qué no es dato biométrico bajo la Ley
1581 y qué haría falta para que lo fuera.

### 3.4 · La ficha decide con el mismo dato que el proveedor

Los hallazgos de la terminal y del videoportero se derivan de las capacidades
neutrales, que son las que el proveedor mira antes de pedir algo. Lo que la
consola dice y lo que el sistema hará después no pueden discrepar.

### 3.5 · Lo que el cliente no ve no puede filtrar

Tras §7.1 la red del conjunto no cruza al navegador: `EquipoDto` y el tablero
pierden `host`, `puerto`, `protocolo` y `usuario`; la edición es parcial y el
servidor completa con lo guardado; el sondeo posterior usa la credencial cifrada
sin que nadie la reescriba. Es lo que hace útil la VLAN de equipos de H-15-1.

## 4 · Árbol de archivos

### Nuevos (selección)

| Fichero                                                                                                                                       | Propósito                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `apps/api/src/autorizaciones/infraestructura/cargador-pg.ts`                                                                                  | El cargador de contexto contra base (O1)                                               |
| `packages/providers/src/nucleo/{capacidades,errores,proveedor}.ts`                                                                            | Vocabulario neutral y tipo de proveedor (O2)                                           |
| `packages/providers/src/ficticio/*`                                                                                                           | «Órbita»: la prueba de fuego de ADR-019                                                |
| `packages/providers/src/hikvision/capacidades-hikvision.ts`                                                                                   | Descubrimiento de capacidades desde los volcados reales                                |
| `scripts/lib/frontera-extensibilidad.mjs`                                                                                                     | Control de CI de ADR-019, con prueba negativa ▸ 32                                     |
| `supabase/migrations/20260924120000_0033_capacidades_de_equipo.sql`                                                                           | `dispositivos.capacidades`, `fabricante`, `modo_de_terminal`, audio habilitado         |
| `supabase/migrations/20260924120100_0034_zonas_icono_foto_de_visitante_y_borrado_de_vehiculo.sql`                                             | Icono de zona, `foto_visitante`, borrado definitivo de vehículo, disparador de la foto |
| `apps/api/src/autorizaciones/aplicacion/fotografia-de-visitante.ts`                                                                           | Adjuntar y servir la fotografía (ADR-021)                                              |
| `apps/api/src/comun/archivos/tipo-real.ts`                                                                                                    | Tipo real por bytes, compartido por evidencia y fotografía                             |
| `apps/api/src/guardia/infraestructura/aviso-de-arranque-del-accionador.ts`                                                                    | Qué accionador quedó activo, dicho al arrancar (O5)                                    |
| `packages/providers/src/diagnostico/diagnostico-por-familia.test.ts`                                                                          | La ficha polimórfica, contra el simulador                                              |
| `packages/providers/src/operacion.ts`                                                                                                         | Entrada para guiones de sitio (D-132)                                                  |
| `apps/web/src/componentes/fotografia-visitante.tsx`                                                                                           | La fotografía en la tarjeta del visitante                                              |
| `apps/web/src/app/(consola)/dispositivos/ficha-dialogo.tsx`                                                                                   | Ficha de un equipo en servicio, con correcciones                                       |
| `apps/web/src/app/(consola)/zonas/iconos.ts`                                                                                                  | Catálogo cerrado de iconos de zona                                                     |
| `apps/api/test/{autorizaciones-pg,autorizaciones-consola.e2e,padron-edicion-pg,zonas-pg,registro-de-equipos-pg,cargador-contexto-pg}.test.ts` | Las pruebas contra base y por HTTP de la ronda                                         |
| `docs/decisiones/ADR-019…`, `ADR-020…`, `ADR-021…`                                                                                            | Las tres decisiones                                                                    |
| `docs/arquitectura/extensibilidad-por-capacidades.md`                                                                                         | Cómo se añade un fabricante                                                            |
| `docs/seguridad/AUDITORIA-EXPOSICION-15D.md`                                                                                                  | §7.2, con constancia                                                                   |

### Modificados (selección)

`equipos` (sonda polimórfica, edición parcial, `POST …/diagnostico`, DTOs sin
red), `tablero` (sin red), `zonas` (PG cableado, alta/baja/icono), `padron`
(edición, borrado, modos), `autorizaciones` (placa, observaciones, modificar,
autorizante titular), `guardia.module.ts` (aviso), `main.ts` (tope propio de la
fotografía), `hikvision-provider.ts`, `diagnostico/{diagnostico-de-equipo,ficha}.ts`,
`equipo/catalogo-de-rutas.ts`, `scripts/puesta-en-marcha-equipos.mjs`,
`scripts/verificar-etapa.sh`, `.github/workflows/verificacion.yml`, contrato
OpenAPI, cliente web y cliente Dart (regenerados tres veces), consola de
visitantes, zonas, vehículos, viviendas y dispositivos.

## 5 · Tabla SOLID

| Principio | Cómo se materializa aquí                                                                                                                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SRP**   | `descubrirCapacidades` pregunta; `fichaDe` aplana; `AdjuntarFotografiaDeVisitante` valida y guarda; `UrlDeFotografiaDeVisitante` firma. El controlador de equipos traduce, y `altaDesdeEdicion` sólo fusiona           |
| **OCP**   | Un fabricante nuevo es `registrarAdaptador` + un directorio; una capacidad nueva es un campo con tres estados. Ninguno produce diff en `MotorDeReglas`, en `ProveedoresModule` ni en la consola                        |
| **LSP**   | La suite de contrato corre contra **tres** proveedores con las mismas aserciones; «Órbita» tiene capacidades reducidas y las declara, no las finge                                                                     |
| **ISP**   | `RepositorioAutorizaciones` gana dos métodos (adjuntar, leer referencia) y no un «servicio de fotos»; `ResolutorDePlaca` y `LectorDeUmbral` son puertos de un método                                                   |
| **DIP**   | El dominio declara `placa`/`observaciones` como valor; la aplicación declara `FotografiaDeVisitante` y `ViviendaSinTitular`; PostgreSQL y el bucket los cumplen. `grep supabase\|axios\|isapi` en `domain/` sigue en 0 |

## 6 · Trazabilidad

| Elemento                        | Cómo queda                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **OE-01 · HU-01 a HU-06**       | Edición de vivienda y de vehículo, borrado definitivo sólo sin historial (RN-19), regeneración con modos. Probado contra base                                |
| **OE-02 · HU-07, HU-09, HU-10** | Placa y observaciones al crear; modificación de una viva (S-37); revocación intacta. **D-131** hacía que nada de esto existiera contra base desde la consola |
| **OE-03 · KPI-11, KPI-12**      | ADR-019 con su prueba de fuego y su control de CI. La suite entera corre sin hardware y contra el adaptador real apuntando al simulador                      |
| **OE-05 · RN-02, RN-21**        | La fotografía entra como evidencia con hash; sale sólo firmada. Ninguna respuesta lleva red ni credencial                                                    |
| **CU-05 · HU-18 a HU-20**       | Alta, edición y baja de zonas desde la consola, con PostgreSQL (P1)                                                                                          |
| **RN-05**                       | Precisado para la consola: ADR-020, S-38, pendiente de ratificar                                                                                             |
| **RN-09, RN-10**                | La fotografía **no** es biometría: sin plantilla, sin terminal, sin consentimiento de plantilla (ADR-021). Los dos caminos no se mezclan                     |
| **RN-12, RN-21, CA-26**         | Sondeo de un equipo en servicio con la clave guardada; el cliente no la ve ni la reenvía                                                                     |
| **D-25 · CU-01 completo**       | Cerrado contra base: placa activa PERMITIDO, vencida VIGENCIA_EXPIRADA, desconocida PLACA_DESCONOCIDA, vetada LISTA_NEGRA                                    |
| **KPI-13, KPI-32, KPI-33**      | El guion los rotula y mide; **ninguna cifra existe**: no hubo equipo. KPI-33 sólo tendrá proxy incluso con equipo                                            |

## 7 · SEGURIDAD · verificación contra §2.7 y auditoría de exposición

| #   | Medida                     | Estado en esta ronda                                                                                                                                                      |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Secretos sólo en entorno   | ✅ Auditoría de exposición **limpia** en árbol e historial (2911 blobs); ver [`AUDITORIA-EXPOSICION-15D.md`](../seguridad/AUDITORIA-EXPOSICION-15D.md)                    |
| 2   | CORS restrictivo           | Sin cambios                                                                                                                                                               |
| 3   | Validación en backend      | ✅ DTOs nuevos con `whitelist`; la fotografía valida forma en el DTO y verdad (bytes, tope) en el caso de uso                                                             |
| 4   | Anti inyección             | ✅ Toda consulta nueva parametrizada; el borrado de vehículo es función SQL versionada                                                                                    |
| 5   | Rate limiting              | Sin cambios; la ruta de fotografía tiene tope de cuerpo propio (2200 kB) y tope de bytes reales (1,5 MiB)                                                                 |
| 6   | RLS + filtro de aplicación | ✅ Toda ruta nueva pasa por `exigirAlcance`; la suite de aislamiento recorre las rutas nuevas automáticamente; `adjuntarFotografia` de otra copropiedad devuelve `false`  |
| 7   | CSP                        | Sin cambios; la fotografía se pinta con `img` desde una URL firmada del origen de evidencia ya permitido                                                                  |
| 8   | Transversales              | ✅ Tipo real por bytes (§2.7.8) compartido; credenciales de equipo nunca en respuesta ni en bitácora; **red del equipo fuera del contrato** (C-28); auditoría append-only |

## 8 · PRUEBAS

Por paquete, al cerrar la ronda y antes del verificador:

| Paquete            | Ficheros | Pruebas | Cobertura por capa                                                    |
| ------------------ | -------: | ------: | --------------------------------------------------------------------- |
| `@ncr/providers`   |       29 |     564 | ramas ≥ 90 % (el umbral del paquete, que la O2 hizo subir)            |
| `@ncr/api`         |      86+ |    982+ | dominio y aplicación ≥ 90 % (lo mide el verificador)                  |
| `@ncr/web`         |       36 |     413 | —                                                                     |
| `@ncr/domain-core` |        — |       — | 21 pruebas nuevas de `Autorizacion` (placa, observaciones, modificar) |
| Flutter            |        — |       — | `dart analyze lib`: sin incidencias; cliente al día (250 ficheros)    |

Contra **base real** (`DATABASE_URL_PRUEBAS`): `cargador-contexto-pg` (D-25),
`autorizaciones-pg` (D-131, foto), `padron-edicion-pg` (modos, edición, borrado
y disparador), `zonas-pg`, `registro-de-equipos-pg`.

### El veredicto literal de `./scripts/verificar-etapa.sh --con-base`

<!-- VEREDICTO -->

### El guion de sitio, ejecutado en modo SIMULADO

`node scripts/puesta-en-marcha-equipos.mjs --simulado --con-audio` · salida 0 ·
las tres familias, sus rutas confirmadas contra el simulador, la ficha de cada
una sin bloqueos, KPI-13 y KPI-32 dentro de umbral y el proxy de KPI-33 con su
advertencia. **Es SIMULADO y el informe lo dice en su cabecera y en su
veredicto: no vale como verificación.**

## 9 · Deuda técnica, supuestos y pendientes

- **`[SUPUESTO]` S-35, S-36, S-37, S-38** registrados en
  [`contradicciones-y-supuestos.md`](../auditoria/contradicciones-y-supuestos.md) §2.
  **S-38 (ADR-020) necesita la ratificación del cliente.**
- **D-133** · control que impida una clave ajena hacia tablas append-only antes
  de aplicar la migración (tercera vez).
- **D-125 a D-129** siguen como estaban; **D-130** corregido contra simulado.
- **Deuda que O2 dejó dicha y no hizo:** el ciclo de vida de las escuchas de
  eventos de terminal y videoportero en la API (quién las arranca y las para)
  no está construido; el transporte de audio del videoportero sigue sin medir
  (D-127); las rutas siguen DOCUMENTADAS, no verificadas (D-125).
- **`PENDIENTE DE DEFINICIÓN`:** si la fotografía del visitante exige constancia
  de tratamiento firmada por el visitante (no biométrica). Hoy no se pide; ADR-021
  §Contingencia dice dónde entraría.

## 10 · Qué debe hacer el usuario manualmente

1. **Aplicar las migraciones 0033 y 0034** a su proyecto (`supabase db push` o
   la guía de conexión §6). Sin la 0034 la consola no puede crear zonas ni
   adjuntar fotografías.
2. **Ratificar o rechazar S-38 / ADR-020** (a nombre de quién queda una
   autorización creada por administración).
3. **Revisar la ficha de cada equipo** desde la consola («Ficha») en cuanto haya
   un equipo alcanzable: lo que salga en rojo impide operar.
4. **Ejecutar el guion de sitio** delante de los aparatos (§8.1 de la guía),
   primero con `--sin-accionar`, y adjuntar el informe elidido.
5. **Comprobar en su `.env` local** que no queda `host` de un equipo en ningún
   fichero que se sincronice (D8/D9 son suyos; esta auditoría no los alcanza).

## 11 · LO QUE SIGUE SIN DEMOSTRARSE, DICHO SIN SUAVIZAR

### Los tres hitos técnicos del reto · SIN EJECUTAR

Prototipo funcional contra equipos, prueba LPR real y prueba facial real: **los
tres siguen sin ejecutarse de punta a punta con hardware**. Esta ronda no cambió
eso ni podía: el entorno no alcanza ninguna dirección privada.

### Los KPI que siguen sin medir

**KPI-13, KPI-14, KPI-17, KPI-18, KPI-22, KPI-26, KPI-27, KPI-32 y KPI-33.** El
guion los rotula y sabe medir KPI-13 y KPI-32; KPI-33 sólo tendrá un proxy
(apertura del canal) incluso con equipo, porque el extremo lejano es el
navegador del operador.

### Lo que está PROBADO CONTRA MOCK y no contra hardware

Todo el diagnóstico polimórfico, el descubrimiento de capacidades, la ficha de
terminal y videoportero, el adaptador ficticio, el guion en modo `--simulado`,
los eventos JSON de rostro y llamada (S-36) y la verificación remota de la
terminal (S-35). **Ninguna de estas afirmaciones se sostiene contra un aparato.**

### Lo que está SIMULADO

El informe del guion adjunto a esta ronda. Está rotulado.

### Lo que está sólo DOCUMENTADO

Las rutas del catálogo de terminal y videoportero (D-125), el campo
`remoteCheck` (S-35), las claves JSON de eventos (S-36), el formato y la
cadencia del audio (D-127).

### Qué haría falta para cerrar la ETAPA 15

Lo mismo que decía la 15-C, más lo que esta ronda deja preparado: una sesión
delante de los tres equipos con el guion (`--sin-accionar` primero, luego con
accionamiento y `--con-audio`), la ficha de cada uno desde la consola sin
bloqueos, y las tres pruebas de punta a punta con su hoja de KPI.
