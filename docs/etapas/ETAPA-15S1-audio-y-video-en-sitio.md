# CORRECCIÓN DE LA 15-S1 · Audio y video en sitio (visita del 06/10/2026)

**Rama:** `etapa-15s1-audio-y-video-en-sitio` · **Base:** `develop` (`8ee5cd9`, merge del PR #51, que ya traía el #50) ·
**PR:** hacia `develop`, sin fusionar · **Fecha:** 2026-10-07 ·
**Encargo:** `CORRIGE ETAPA 15` con los hallazgos A a E de la visita del 06/10 ·
**Cierra:** H-15S1-C07 a H-15S1-C11 · **Abre:** DT-15S1-C05 a DT-15S1-C13 · S-15S1-01 y S-15S1-02 · **Refuta:** S-176

> **Esta corrección NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Se cumplió la regla dura de la etapa: sólo adaptadores (`packages/providers`,
> `infraestructura` y `presentacion` de la API), la consola, textos y
> documentación. Ni `packages/domain-core` ni ningún `aplicacion/` de la API
> cambian (§2.1).

**Lo incómodo primero.**

1. **Nada de esto se ha ejercido contra los equipos.** A, B y C están probados
   contra los simulados, alimentados con la forma **real** de lo que contestaron
   los aparatos el 06/10. **KPI-33 (audio y video < 2 s) sigue sin cifra.** Lo que
   se mide mañana está en «Qué medir mañana en sitio», al final de este informe.
2. **La causa de que se pidiera el 102 no está demostrada.**
   - **Lo que está cerrado [Cierto].** Con el XML real de la cámara, la cadena
     directa ya proponía el 101. El hueco real que se encontró, y se cierra, está
     en el **Edge** (H-15S1-C08).
   - **La causa más probable [Probable].** El usuario de servicio no puede leer
     la lista de flujos: el `curl` que leyó el 101 se hizo con `admin`. Con esta
     ronda, la ficha lo dirá con el motivo en vez de callar.
3. **La cámara LPR tiene un solo canal, el 101, y entrega H.265.** El navegador
   no lo reproduce por WebRTC. Desde hoy la consola lo dice **antes** de llamar al
   puente. Ningún código lo resuelve:
   - hace falta cambiar ese flujo a H.264 en el equipo;
   - eso exige **autorización del cliente**;
   - sin ella, esa cámara no tiene video en la consola. El acceso funciona igual.
4. **La terminal facial habla por rutas declaradas por analogía, no medidas**
   ([SUPUESTO] S-15S1-02). Si la DS-K1T344MBFWX-E1 no las tiene:

   - contestará 404 a la lista de canales;
   - la guardia obtendrá el turno sin transporte, con el motivo.

   Se mide mañana.

5. **Mi propio commit de A y B dejó dos defectos**, que la suite entera y KPI-11
   destaparon antes del push:

   - un e2e que fijaba la regla refutada S-176;
   - una prueba de la API que escribía el protocolo del fabricante fuera de su
     paquete.

   Están corregidos en `24ec82e`. No llegaron a la rama remota.

---

## 1 · Qué se construyó

**A · El audio del videoportero ya no depende de un interruptor que no existe.**

- **Lo que mostró el equipo.** El DS-KD9633-WBE6 V2.3.9 declara su canal de
  audio con `enabled=false`, rechaza escribirlo (`400 · statusCode 6 ·
badXmlContent`) y **lo abre igual** (`open` → `200` con `sessionId`).
- **Por qué la guardia callaba.** La capacidad exigía `habilitado === true`, así
  que quedaba en `no` y la guardia nunca abría transporte. El «paso de puesta en
  marcha» que las guías pedían desde el 18/09 no tiene dónde hacerse.
- **El cambio.** El canal **declarado** (`id > 0`, prefiriendo uno con
  `enabled=true` si lo hay) es la capacidad. La compuerta sigue siendo humana: la
  casilla de la ficha, que ahora dice lo que es, «comprobé en sitio que el
  equipo abre el canal de audio (atestación)».
- **Sin la casilla.** La guardia obtiene el turno **sin transporte** y la consola
  dice qué marcar. Los textos que mandaban a «habilitarlo en su panel» cambian:
  ficha, ensayo, error del intercom y guías.

**B · La guardia habla también por la terminal facial, por capacidad.**

- **La casilla.** Existe para el videoportero y la terminal, en la consola y en
  la API. La API no la restringía por tipo; ahora una prueba lo fija.
- **Las rutas.** Las de audio bidireccional se declaran también para la familia
  `terminal`. El intercom toma la familia **del equipo**, no una fija.
- **La señalización de llamada.** Se envía sólo si el equipo la declara **y** su
  familia la tiene catalogada; la de la terminal no lo está.
- **La llamada a la central** de la terminal (5/51, ya catalogada) entra en la
  cola como `llamada`, con esa terminal propuesta para audio y video. Se
  verificó que ya ocurría y queda fijado con un e2e.
- **El ensayo** prueba el audio de la terminal si declara canal.

**C · El canal de video que el equipo declara manda, y la ficha lo dice.**

- **C.1 · el Edge.** Si el equipo va por el Edge, «Probar conexión» guardaba
  capacidades y canal nuevos **en la nube** y no se los entregaba. El Edge seguía
  decidiendo con su copia, con el 102. Ahora se le entrega la ficha sin clave.
- **C.2 · el códec declarado.** Si el canal elegido **declara** un códec que no
  es H.264, el video se niega antes del puente, con el canal y «requiere
  autorización del cliente».
- **C.3 · el aviso en la ficha.** «Probar conexión» trae un hallazgo propio,
  «canal de video de la ficha»:
  - **aviso** cuando el guardado no está entre los declarados, diciendo cuál se
    usará;
  - **no comprobado**, con el motivo, cuando la lista no se pudo leer o llegó
    vacía.

**D1 · Una cancelación del navegador ya no es una «excepción no capturada».**
La consola imprimía `⨯ uncaughtException: [Error: aborted]` cada vez que el
operador cambiaba de equipo con el video negociándose. La causa es de Next 15 y
se reprodujo con su propia función. `servidor.mjs` filtra **esa** firma delante
de los manejadores de Next.

**E · Documentación.** Se corrigieron tres guías:

- `VALIDACION_HIKVISION_EN_SITIO.md`: §TwoWayAudio, §8.4 (ahora «atestar el
  canal») y §8.4.1;
- `INTEGRACION_HIKVISION.md`: filas del videoportero y la terminal, §6 y
  diagnóstico;
- `ENTREGA_EN_SITIO.md`: 4 bis, plan B y ajustes.

En el registro, S-176 queda refutado y entran S-15S1-01 y S-15S1-02.

---

## 2 · Cómo se organizó y por qué

**La regla dura decidió dónde cabía cada cambio.**

- Todo lo que el encargo pedía era de **adaptador**:
  - qué significa `enabled`;
  - qué rutas tiene una familia;
  - qué se le dice al operador;
  - cómo se entrega una ficha al Edge.
- **Ningún caso de uso cambió de forma.**
  - La guardia ya separaba «turno» de «transporte».
  - El repositorio ya era un decorador sobre el de la nube.
  - La ficha ya era una lista de hallazgos.
- **Dos textos de `aplicacion/` nombran al videoportero en la llamada.** No se
  tocaron, y quedan como DT-15S1-C08.

**A · la capacidad es el canal declarado; la decisión, una persona.**

- **Lo descartado.** Escribir `enabled=true` desde el código. El firmware lo
  rechaza, y además una vía de audio hacia la calle encendida por el código es
  una decisión de seguridad tomada sin nadie.
- **Por qué se quedó la casilla.** El encargo pedía mantenerla, con razón.
  `abrirSesion` es la prueba real, pero ocurre con un visitante delante. La
  atestación separa «el equipo dice que tiene canal» de «alguien comprobó que
  abre», y queda en la auditoría del equipo («audio habilitado»).
- **El error tipado.** `CanalDeEquipoNoHabilitado` se exporta para que la API
  distinga «nadie atestó» (turno sin transporte, con el motivo) de un fallo del
  equipo.

**B · por capacidad, nunca por tipo (ADR-019), sin relajar el catálogo.**

- **Cómo se declara una ruta en dos familias.** El catálogo ya redeclara el
  mismo propósito por familia. Las rutas de audio de la terminal **se derivan**
  de las del videoportero con una función (`rutasDeAudioDeLaTerminal`), cada una
  con su procedencia y su S-15S1-02. No se relajó la comprobación de familia en
  general.
- **La familia sale del equipo.** El tipo se traduce a familia, y la familia es
  un parámetro del intercom. El valor por omisión, `videoportero`, conserva el
  comportamiento anterior (LSP).
- **La señalización sólo con su familia.** `tieneRuta(propósito, familia)` evita
  mandarle a la terminal la del videoportero por analogía.

**C · contrastar con lo declarado, en el adaptador y en la ficha.**

- **C.1.** Primero se reprodujo la cadena entera con el XML real:

  - descubrimiento;
  - JSON, como lo guarda la base;
  - `capacidadesDesdeJson`;
  - proveedor.

  Salía el 101, así que el hueco no estaba ahí. Estaba en
  `RepositorioConCredencialEnElEdge.registrarSondeo`, que no avisaba al Edge.

- **C.2.** Es una comprobación en el proveedor, **antes** de construir la
  fuente. El texto del error es el que pidió el encargo, y su prueba fijada se
  cambió a propósito.
- **C.3.**
  - **Hallazgo propio, no frase pegada.** El hallazgo vive en un módulo propio
    (`hallazgo-del-canal-de-video.ts`) para no engordar `ficha.ts`. Antes la
    sustitución del canal iba pegada al hallazgo del códec, y con H.264 ese
    hallazgo es «conforme»: el aviso quedaba dentro de un verde.
  - **El motivo de la lista sin leer.** Sólo iba a la bitácora. Ahora sube por
    una devolución de llamada del descubrimiento al diagnóstico, sin cambiar la
    forma de las capacidades guardadas, que irían a la base y al contrato.
  - **«No admite» frente a «no se pudo leer».** Se distinguen como en
    H-SITIO-09: el equipo que dice «no listo mis canales» es NO APLICA y no
    añade hallazgo.

**D1 · el filtro va a nivel de proceso porque no hay otro sitio.**

- **El mecanismo, reproducido.**
  - Con el middleware en runtime `nodejs`, Next 15 clona el cuerpo del POST.
  - Al terminar el middleware, **sustituye las tripas** del `IncomingMessage`
    por las de un `PassThrough`.
  - El primero sólo emite `error` si alguien escucha; el segundo, siempre.
- **Lo que se comprobó y se descartó.** Un oyente puesto en `servidor.mjs` antes
  de Next **se pierde** con la sustitución. Tocar Next o el middleware estaba
  fuera de alcance.
- **El filtro.** Se pone tras `app.prepare()`, delante de los manejadores de
  Next. Descarta sólo `aborted` + `ECONNRESET`, la firma con que Node aborta una
  petición entrante, y entrega todo lo demás intacto y en orden. Sin
  manejadores previos no se pone: un fallo de verdad sigue terminando el
  proceso.

**KPI-11 · cómo prueba la API lo que se le pidió al equipo sin escribir el protocolo.**

- El equipo simulado tiene un registro nuevo, `alAtender(propósito, verbo)`.
- Para una ruta que el catálogo de **su** familia no tiene, anota `null`.
- La prueba de la API compara propósitos del catálogo, no rutas de cable.
- Exige que a la terminal no le llegue **ninguna** ruta ajena: así se sigue
  viendo fallar la sonda B3, la de la familia fija.

---

## 3 · Árbol de archivos

```
packages/providers/src/
├─ hikvision/capacidades-hikvision.ts        A · canalDeAudioUtilizable por canal declarado; B · lista de canales con la familia del equipo; C.3 · alNoLeerCanalesDeVideo
├─ hikvision/capacidades-hikvision.test.ts   A · enabled=false, id 0, el videoportero real, sin canales
├─ hikvision/canales-de-video.ts             C.3 · alNoLeer: «no se pudo leer» o «sin canales», nunca «no admite»
├─ hikvision/hikvision-provider.ts           B · familia del intercom por el equipo, señalización con tieneRuta; C.2 · códec declarado antes del puente
├─ hikvision/registro-de-equipos.ts          A · el campo de la casilla documentado como atestación
├─ hikvision/canal-de-video-en-sitio.test.ts (nuevo) C.1 y C.2 con el XML real de la DS-TCG405-E
├─ equipo/catalogo-de-rutas.ts               B · rutas de audio de la familia terminal (derivadas), tieneRuta
├─ equipo/anexo-de-sitio.test.ts             B · propósitos sin duplicar en el anexo
├─ equipo/errores-neutrales.test.ts          C.2 · texto de VideoNoReproducible, cambiado a propósito
├─ videoportero/intercom-equipo.ts           A · cabecera y CanalDeEquipoNoHabilitado; B · familia como opción
├─ videoportero/intercom-isapi-persistente.ts B · familia como opción
├─ ensayo/paso-de-audio.ts                   A · textos; B · aplica a la terminal que declara canal
├─ diagnostico/ficha.ts                      A · textos del audio; C.3 · hallazgosDelVideo
├─ diagnostico/hallazgo-del-canal-de-video.ts (nuevo) C.3 · el hallazgo «canal de video de la ficha»
├─ diagnostico/canal-de-la-ficha-15s1.test.ts (nuevo) C.3 · siete casos, con 403 lowPrivilege y 403 sin cuerpo
├─ diagnostico/diagnostico-de-equipo.ts      C.3 · el motivo de la lista sin leer hasta el video del diagnóstico
├─ diagnostico/video-del-diagnostico.ts      C.3 · listaSinLeer en el resultado
├─ diagnostico/diagnostico-por-familia.test.ts A · escenario «sin audio» = sin canales
├─ nucleo/errores.ts                         C.2 · mensaje de VideoNoReproducible
├─ nucleo/motivo-legible.ts                  C.2 · la frase con la autorización del cliente
├─ simulacion/equipo-simulado.ts             B · terminal sin audio contesta 404; KPI-11 · alAtender
├─ simulacion/videoportero-de-audio.ts       A · abre un canal declarado con enabled=false (S-176 refutado)
└─ index.ts                                  A · exporta CanalDeEquipoNoHabilitado
apps/api/
├─ src/guardia/infraestructura/canal-intercom-con-transporte.ts  A · «nadie atestó» = turno sin transporte, con el motivo
├─ src/guardia/infraestructura/audio-por-capacidad.test.ts       (nuevo) A y B contra el proveedor real y el simulado
├─ src/equipos/infraestructura/credencial-en-el-edge.ts          C.1 · el sondeo que cambia capacidades o canal se entrega al Edge
├─ src/equipos/infraestructura/credencial-en-el-edge.test.ts     C.1 · con y sin puente
├─ src/equipos/presentacion/dtos.ts                              A · descripción de la atestación (contrato regenerado)
├─ test/atestacion-de-audio.e2e.test.ts                          (nuevo) B.1 · la terminal guarda la atestación
├─ test/llamada-de-la-terminal.e2e.test.ts                       (nuevo) B.4 · 5/51 entra como llamada con la terminal
└─ test/equipos.e2e.test.ts                                      A · «sin audio» es ningún canal declarado
apps/web/
├─ cancelaciones-del-cliente.mjs / .d.mts    (nuevos) D1 · el filtro y sus tipos
├─ servidor.mjs                              D1 · el filtro tras app.prepare()
├─ src/lib/cancelaciones-del-cliente.test.ts (nuevo) D1 · réplica con la función real de Next en un proceso aparte
├─ src/app/(consola)/dispositivos/alta-de-equipo.tsx            A y B · la casilla para videoportero y terminal, con su texto
├─ src/app/(consola)/dispositivos/alta-de-equipo-audio.test.tsx (nuevo) A.2 y B.1
├─ src/componentes/video-en-vivo.tsx         C.2 · la pista con la autorización del cliente
└─ src/componentes/causas-de-video.test.ts   C.2 · entrada literal actualizada
packages/contracts/openapi.json · src/generado/api.ts          descripción de la atestación, regenerados
apps/mobile/lib/api/generado/models/{alta,edicion}_de_equipo_dto.dart  ídem, regenerados
docs/guias/VALIDACION_HIKVISION_EN_SITIO.md · INTEGRACION_HIKVISION.md · ENTREGA_EN_SITIO.md   E
docs/auditoria/contradicciones-y-supuestos.md   S-176 refutado; S-15S1-01 y S-15S1-02; recuentos
docs/etapas/ETAPA-15S1-audio-y-video-en-sitio.md (este informe) · docs/ESTADO_ETAPAS.md (ficha)
```

---

## 4 · Tabla SOLID

| Archivo                                   | SRP                                                    | OCP                                                                  | LSP                                                                   | ISP                                                              | DIP                                                |
| ----------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| `hallazgo-del-canal-de-video.ts` (nuevo)  | Un hallazgo: el canal guardado frente al declarado     | Se compone en la ficha sin tocar los demás hallazgos                 | —                                                                     | Recibe sólo el video del diagnóstico y la lista declarada        | Función pura, sin I/O                              |
| `cancelaciones-del-cliente.mjs` (nuevo)   | Sólo distingue y filtra la cancelación del cliente     | Envuelve los manejadores de Next sin tocarlos                        | Los oyentes previos reciben los mismos argumentos y en el mismo orden | `proceso` sólo necesita `listeners`, `removeAllListeners` y `on` | `proceso` inyectable; el real por omisión          |
| `capacidades-hikvision.ts`                | `canalDeAudioUtilizable` es una regla pura de 2 líneas | El motivo de la lista sin leer sale por una devolución de llamada    | —                                                                     | La opción es opcional: quien no la pasa no cambia                | Usa el `ClienteDeEquipo` inyectado                 |
| `catalogo-de-rutas.ts`                    | El catálogo declara; `tieneRuta` sólo consulta         | La terminal hereda las rutas de audio por una función, sin copiarlas | —                                                                     | —                                                                | Datos, no I/O                                      |
| `intercom-equipo.ts` · `…-persistente.ts` | El intercom de un equipo, con su familia               | Una familia nueva es un valor, no un adaptador nuevo                 | Sin `familia`, `videoportero`: idéntico al de antes                   | La opción `familia` es opcional                                  | Reloj, conexión y familia inyectados               |
| `canal-intercom-con-transporte.ts`        | Turno + transporte                                     | Un error tipado más, sin tocar el turno                              | Con o sin transporte, el mismo contrato de estado                     | —                                                                | Depende del puerto del proveedor, no del adaptador |
| `credencial-en-el-edge.ts`                | Decide qué del repositorio va al Edge                  | Decorador: la base no cambia                                         | Mismo contrato que el repositorio que envuelve                        | —                                                                | Base y Edge inyectados                             |
| `equipo-simulado.ts`                      | Simula un equipo                                       | `alAtender` es un gancho, no una rama                                | Sin el gancho, idéntico                                               | Opcional                                                         | —                                                  |

Métricas de §2.3: los ficheros **nuevos** están todos por debajo de 300 líneas.
Ninguna clase nueva supera los 5 métodos públicos. Los ocho ficheros
**existentes** que ya estaban sobre 300 crecieron entre 3 y 50 líneas
(DT-15S1-C11). `grep -r "supabase\|axios\|isapi" packages/domain-core/src` →
0, porque el dominio no se tocó.

---

## 5 · Trazabilidad

| Elemento                     | Cómo queda                                                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **OE-07** · operación remota | **Parcial.** El audio de la guardia abre transporte en el videoportero y en la terminal con la atestación, probado contra simulados con la forma real. **Sin medir contra el equipo**            |
| **OE-03** · desacople        | **Reforzado.** Toda la corrección vive en adaptadores; la regla dura de la ETAPA 15 se cumplió. KPI-11 en verde tras retirar el protocolo de una prueba de la API                                |
| **CU-03** · guardia virtual  | La llamada de la terminal (5/51) entra en la cola como llamada, con la terminal propuesta para audio y video (e2e)                                                                               |
| **HU-26 / CA-19**            | Intercom aceptado → audio por el equipo. **KPI-33 sin cifra**: se mide en sitio                                                                                                                  |
| **HU-28 / CA-20**            | Sin cambio: la apertura remota no viaja por el canal de audio (ADR-01)                                                                                                                           |
| **KPI-11**                   | Verde: `frontera-hardware.mjs` sin hallazgos                                                                                                                                                     |
| **KPI-12**                   | La suite corre entera sin hardware. Las aserciones existentes no cambiaron, salvo el texto fijado de `VideoNoReproducible` (C.2, a propósito) y el escenario del e2e que fijaba S-176 (refutado) |
| **ADR-01 / ADR-019**         | Intercom por TwoWayAudio tras su puerto; capacidad, nunca tipo                                                                                                                                   |
| **RN-21**                    | La entrega al Edge (C.1) va **sin clave** (`null`): la credencial sigue sólo en el Edge                                                                                                          |

---

## 6 · Pruebas

### Qué se probó y cómo

Toda prueba nueva se vio **fallar primero**: en rojo antes de la corrección, o
con una sonda de mutación que reintroduce el defecto y exige el rojo. Las sondas
restauran siempre el fichero.

| Sonda     | Qué reintroduce                                                                                | Resultado                                                                                   |
| --------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| A1        | La regla vieja: sólo `enabled=true` es canal                                                   | Rojo (proveedores y API)                                                                    |
| B1        | La API restringe la casilla al videoportero                                                    | Rojo (e2e)                                                                                  |
| B2        | Sin las rutas de audio de la terminal                                                          | Rojo (API: 2 pruebas)                                                                       |
| B3        | Familia fija `videoportero` para el intercom                                                   | Rojo (API: «nunca por analogía», por la ruta ajena)                                         |
| B4        | Sin la entrada 5/51 del catálogo de eventos                                                    | Rojo (e2e de la llamada de la terminal)                                                     |
| C1-edge   | El repositorio no entrega al Edge                                                              | Rojo                                                                                        |
| C2        | Sin la comprobación del códec declarado                                                        | Rojo                                                                                        |
| C3a a C3d | Sin hallazgo; sin motivo; «no admite» como «no leído»; sin motivo del descubrimiento que lanza | Rojo, las cuatro                                                                            |
| D1a, D1b  | Filtro sin la condición; `servidor.mjs` sin el filtro                                          | Rojo, las dos                                                                               |
| G1        | El arnés de go2rtc de antes (listo con el primer `GET /api`)                                   | Rojo: el doble, 400 «source not supported»; el binario real con el arranque ensanchado, 404 |
| G2        | El arnés espera sólo el primer esquema                                                         | Rojo («no espera los tres»)                                                                 |

**Dos sondas no son observables, y se dice.**

- **La familia del descubrimiento de audio.** Las peticiones son idénticas en la
  red para las dos familias.
- **La línea de clase de G3.** La cola y la alerta funcionan por tipo.

**Recuentos de esta sesión, antes del verificador.**

- Proveedores: 1242 en verde, más 2 saltadas declaradas.
- API: 2323 en verde, más 86 saltadas.
- Consola: 814.
- Lint y `typecheck`, incluidos los programas de pruebas: limpios en los tres.
- `frontera-hardware`, `-vocabulario`, `-modulos`, `-extensibilidad` y `-construccion`: en verde.

### Veredicto literal de `./scripts/verificar-etapa.sh --con-base` (§2.8.0)

Sobre `ab48efa`, desde cero (sin `dist/`, `.turbo/` ni `coverage/`, instalación
con `--frozen-lockfile`), con `--con-base` —el paso 12 reconstruye la base `ncr`
de 0001 a 0056 y corre la suite SQL—, en 43 min 9 s:

```
VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe
```

El control declarado no ejercido es **D-112**: las cinco pruebas del arranque en frío que el paso 5 salta porque necesitan los claims que escribe el paso 12b, que es quien las ejecuta y exige que no se salten.

**Pasos y recuentos.** 31 de 31 pasos. Cobertura (paso 7): dominio 96,30 %, aplicación 97,61 %, global 88,16 %. App: 455 pruebas de Dart (paso 5c).

- **Paso 5, TypeScript.** Ninguna omisión por falta de base.

  | Paquete            | Pruebas                         |
  | ------------------ | ------------------------------- |
  | `@ncr/api`         | 2404 passed \| 5 skipped (2409) |
  | `@ncr/providers`   | 1248 passed (1248)              |
  | `@ncr/web`         | 814 passed (814)                |
  | `@ncr/domain-core` | 463 passed (463)                |
  | `@ncr/edge`        | 325 passed (325)                |
  | `@ncr/config`      | 144 passed (144)                |

- **Ficheros de prueba:** 525 de 525 recogidos (paso 6); los dos recuentos coinciden (paso 7b).
- **Paso 14, tres corridas sin caché:**
  - corrida 1/3: codigo 0 · @ncr/api:test: Tests 2409 passed (2409) · @ncr/config:test: Tests 144 passed (144) · @ncr/domain-core:test: Tests 463 passed (463) · @ncr/edge:test: Tests 325 passed (325) · @ncr/providers:test: Tests 1248 passed (1248) · @ncr/web:test: Tests 814 passed (814)
  - corrida 2/3: codigo 0 · @ncr/api:test: Tests 2409 passed (2409) · @ncr/config:test: Tests 144 passed (144) · @ncr/domain-core:test: Tests 463 passed (463) · @ncr/edge:test: Tests 325 passed (325) · @ncr/providers:test: Tests 1248 passed (1248) · @ncr/web:test: Tests 814 passed (814)
  - corrida 3/3: codigo 0 · @ncr/api:test: Tests 2409 passed (2409) · @ncr/config:test: Tests 144 passed (144) · @ncr/domain-core:test: Tests 463 passed (463) · @ncr/edge:test: Tests 325 passed (325) · @ncr/providers:test: Tests 1248 passed (1248) · @ncr/web:test: Tests 814 passed (814)

**Las cuatro corridas, y por qué hubo cuatro.** Ninguna se dio por buena a medias.

| Corrida | Commit    | Resultado                              | Causa y corrección                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------- | --------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.ª     | `9b28293` | FALLIDA, paso 12e                      | El guion de sitio contaba como «desmentida» la lista de audio de una terminal simulada sin audio: lo introdujo B. `5964ece`: las rutas de audio de la terminal pasan a módulo opcional                                                                                                                                                                                                                              |
| 2.ª     | `5964ece` | FALLIDA, pasos 7 y 7b                  | Anterior a esta ronda: tres pruebas de `edge-instantanea-pg` suponían que nadie más publicaba versiones de COP_A. `1087d57`: la misma propiedad sin depender del orden, reproducida antes con una sonda                                                                                                                                                                                                             |
| 3.ª     | `1087d57` | FALLIDA, paso 5 (y 6, 7b por arrastre) | El primer `PATCH` de la prueba de go2rtc real recibió 400 bajo carga. **Causa leída en el fuente de go2rtc v1.9.14 y medida con el binario real**: la API contesta `GET /api` antes de registrar `rtsp`, y entre medias el `PATCH` recorre 404 → 400 «source not supported» → 200. El arnés daba go2rtc por listo con el primer `GET /api`. `ab48efa`: espera a que `/api/schemes` liste `rtsp`, `webrtc` e `isapi` |
| 4.ª     | `ab48efa` | **correcta**                           | —                                                                                                                                                                                                                                                                                                                                                                                                                   |

---

## 7 · Verificación de seguridad (§2.7)

| Medida                       | En esta corrección                                                                                                                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Secretos                 | Ni credenciales ni IPs reales en código, pruebas o documentos. Las pruebas usan `127.0.0.1` y RFC 5737. La entrega al Edge (C.1) va **sin clave**. El escaneo de secretos del pre-commit pasó en cada commit                                                        |
| 2 · CORS                     | Sin cambio                                                                                                                                                                                                                                                          |
| 3 · Validación en el backend | El DTO sólo cambió su descripción. La casilla sigue validada como booleano en alta y edición, para los dos tipos                                                                                                                                                    |
| 4 · SQL                      | Sin SQL nuevo; sin migraciones                                                                                                                                                                                                                                      |
| 5 · Limitación de tasa       | Sin cambio                                                                                                                                                                                                                                                          |
| 6 · RLS y `service_role`     | Sin cambio. La entrega al Edge es por copropiedad, la del propio sondeo                                                                                                                                                                                             |
| 7 · CSP                      | Sin cambio. El filtro de D1 no toca cabeceras ni el middleware                                                                                                                                                                                                      |
| 8 · Transversales            | La atestación queda en la auditoría del equipo («audio habilitado»). El motivo de la lista sin leer es el resumen saneado de la respuesta (`lowPrivilege`), nunca el cuerpo ni la credencial. **El código no cambia el códec ni otro parámetro de la cámara** (C.4) |

**Lo que no se hace, a propósito.** Ni el código ni la API escriben nada en el
canal de audio del equipo. Una vía de audio hacia la calle sólo se usa cuando
una persona atestó que abre.

---

## 8 · Deuda técnica, supuestos y pendientes

**Hallazgos de la visita, corregidos aquí**

| ID         | Qué era                                                                                                                  | Cómo queda                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| H-15S1-C07 | El audio del videoportero no abría nunca: la capacidad exigía `enabled=true` y el firmware no deja escribirlo            | **Corregido** (A). El canal declarado es la capacidad; la compuerta es la atestación |
| H-15S1-C08 | Con el Edge, «Probar conexión» no le entregaba las capacidades ni el canal nuevos                                        | **Corregido** (C.1)                                                                  |
| H-15S1-C09 | Un canal que **declara** H.265 llegaba al puente para fallar allí                                                        | **Corregido** (C.2)                                                                  |
| H-15S1-C10 | La ficha no avisaba del canal guardado y no declarado con un hallazgo propio, y el motivo de la lista sin leer se perdía | **Corregido** (C.3)                                                                  |
| H-15S1-C11 | La consola imprimía como excepción no capturada la cancelación del navegador                                             | **Corregido** (D1)                                                                   |

**Deuda nueva (DT)**

| ID          | Qué                                                                                                                                                                                                                                                                                                                                                                                             | Por qué no se cerró aquí                                                                                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DT-15S1-C05 | **D2.** El videoportero contestó varias veces `400 «Device hardware error»` (`errorCode 805306369`) a `POST /ISAPI/Event/notification/subscribeEvent` antes de conectar. [Probable]: hueco de suscripción ocupado por una instancia anterior de la API                                                                                                                                          | Encargo: «solo DT». Se mide mañana: reiniciar la API y ver si el primer intento falla                                                                                                   |
| DT-15S1-C06 | **D3.** El diagnóstico en sitio se hizo con `admin` por `curl`. Las guías insisten ya en el usuario de servicio (§8.4 fila 1, 4 bis, «Qué medir mañana»), pero ninguna cifra de esta ronda sale de él                                                                                                                                                                                           | Encargo: «solo DT». Se cierra cuando la medición de mañana se haga con el usuario de servicio                                                                                           |
| DT-15S1-C07 | La reversión del canal de audio del ensayo (`configurar un canal de audio bidireccional`) recibiría `400 badXmlContent` en este firmware si tuviera que escribir. Hoy queda en `fallo` honesto, nunca en «restaurado»                                                                                                                                                                           | Falta saber si el firmware rechaza también un `PUT` **sin cambios**: se mide                                                                                                            |
| DT-15S1-C08 | Textos de `aplicacion/` que nombran al videoportero en la llamada: «Llamada en el videoportero» (`cola-de-atencion.ts`, título por omisión) y «llamada del videoportero recibida» (bitácora del ingestor). La cola de la terminal ya muestra el título del evento, «Llamada a la central»                                                                                                       | Regla dura de la ETAPA 15: `aplicacion/` no se toca en esta etapa                                                                                                                       |
| DT-15S1-C09 | La señalización de llamada (contestar o colgar) de la terminal no está catalogada. Si la K1T344 la declara, la consola no la envía                                                                                                                                                                                                                                                              | Sin documento que la respalde; se observa mañana (S-15S1-02)                                                                                                                            |
| DT-15S1-C10 | Un `403` **sin cuerpo** del fabricante en cualquier ruta de capacidad se trata como credencial rechazada y **tumba el descubrimiento entero** (H-SITIO-12). Si el usuario de servicio recibe eso en la lista de flujos, no se guarda ninguna capacidad. La ficha ya lo dice (C.3)                                                                                                               | Cambiar esa semántica es decisión de diseño (no reintentar una credencial). Recomendación: tratar el `403` sin cuerpo de una ruta de capacidad, no del contacto, como «no se pudo leer» |
| DT-15S1-C11 | Ocho ficheros que ya pasaban de 300 líneas crecieron: `hikvision-provider` 1039→1057, `equipo-simulado` 944→957, `catalogo-de-rutas` 779→829, `ficha` 641→653, `alta-de-equipo.tsx` 577→580, `diagnostico-de-equipo` 491→506, `intercom-equipo` 395→425, `capacidades-hikvision` 396→420                                                                                                        | Partirlos excede el encargo; lo nuevo va en módulos propios                                                                                                                             |
| DT-15S1-C12 | Los `.mjs` de la raíz de la consola (`servidor`, `ip-del-cliente`, `reenvio-de-audio` y ahora `cancelaciones-del-cliente`) quedan fuera del lint (`eslint src`); un `eslint` directo los rechaza por los globales de Node                                                                                                                                                                       | Anterior a esta ronda; el nuevo sigue la convención existente                                                                                                                           |
| DT-15S1-C13 | El Edge lanza `tic()` con `setInterval` sin protección contra solapes (`apps/edge/src/main.ts:69`, 15 s por omisión). Con la WAN degradada una vuelta puede pasar de 15 s, y dos `Reconciliacion.ejecutar()` tomarían las mismas filas: dos intentos por envío y la cuarentena adelantada. Señalado por la revisión de Codex en el PR [#52](https://github.com/4rg3n15/NextResidential/pull/52) | Fuera del diff de este PR. Propuesta: un candado `enCurso` que salte la vuelta con aviso, o `setTimeout` encadenado, extraído a una función con prueba propia                           |

**Supuestos.**

- **S-15S1-01** (A): `enabled` no es un interruptor configurable en esta
  familia. La prueba real es `abrirSesion`.
- **S-15S1-02** (B): la terminal habla por las mismas rutas de audio que el
  videoportero. No medido en la K1T344.
- **S-176, refutado.** Suponía que el equipo contesta `403 notSupport` a `open`
  con el canal deshabilitado. El equipo real abre.
- **Recuento:** 179 supuestos registrados, 177 vigentes.

**Pendientes de definición.** Ninguno nuevo. Que la cámara pase su flujo a
H.264 no es una decisión técnica: es una **autorización del cliente**.

---

## 9 · Qué debe hacer el usuario manualmente

1. **Fusionar el PR** hacia `develop` cuando la CI esté en verde (no se fusiona
   desde aquí).
2. **No hay migraciones** en esta corrección: no hace falta `supabase db push`.
3. **En el Mac de sitio, reiniciar la consola** con el arranque propio
   (`node servidor.mjs`, el de `pnpm sitio`) para que D1 entre en vigor, y la
   API para el resto.
4. **Antes de tocar la cámara, pedir la autorización del cliente** para cambiar
   su flujo 101 a H.264. Sin ella, se anota que la cámara queda sin video en la
   consola.
5. **Seguir «Qué medir mañana en sitio»**, equipo por equipo, **con el usuario
   de servicio**, y anotar cada cifra en la hoja.

---

## 10 · Rama y commits

Rama `etapa-15s1-audio-y-video-en-sitio`, desde `develop` en `8ee5cd9`.

| Commit    | Qué                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `642a6d2` | `fix(etapa-15s1/audio)`: el canal declarado es la capacidad, la casilla es la atestación y la terminal habla (H-15S1-C07, B)         |
| `9590588` | `fix(etapa-15s1/video)`: el canal declarado manda, H.265 se dice antes del puente y la ficha avisa del canal guardado (C)            |
| `24ec82e` | `test(etapa-15s1/audio)`: «sin audio» es ningún canal declarado y las pruebas de fuera del paquete no escriben el protocolo (KPI-11) |
| `c492ecb` | `fix(etapa-15s1/consola)`: una cancelación del navegador no es una excepción no capturada (D1)                                       |
| `9b28293` | `docs(etapa-15s1)`: guías, registro, informe y ficha de la corrección de audio y video en sitio                                      |
| `5964ece` | `fix(etapa-15s1/audio)`: el audio de la terminal es de módulo opcional en el catálogo (paso 12e del verificador)                     |
| `1087d57` | `test(etapa-15s1/edge)`: la instantánea del Edge no supone que nadie más toque MIRA (paso 7 del verificador)                         |
| `ab48efa` | `fix(etapa-15s1/proveedores)`: el arnés de go2rtc espera a que el puente admita las fuentes                                          |
| siguiente | `chore(etapa-15s1)`: cierre, con el veredicto de la 4.ª corrida                                                                      |

---

## Qué medir mañana en sitio

Todo **con el usuario de servicio**, nunca con `admin` (DT-15S1-C06). Cada cifra
va a la hoja. Las rutas son las de la guía; aquí no hay direcciones ni claves.

### Videoportero · DS-KD9633-WBE6 V2.3.9

| #   | Qué                                                                                                                 | Esperado                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | `GET /ISAPI/System/TwoWayAudio/channels`                                                                            | Canal 1, `G.711ulaw`, `enabled=false`. Un `401`/`403` es permiso del usuario: anótelo   |
| 2   | `PUT …/channels/1/open` y luego `PUT …/channels/1/close`                                                            | `200` con `sessionId`; `statusCode 1 · OK`. Si `open` no abre, **no** marque la casilla |
| 3   | Ficha → «Probar conexión»                                                                                           | «canal de audio bidireccional: canal 1 · g711u», conforme                               |
| 4   | Marcar «comprobé en sitio que el equipo abre el canal de audio (atestación)» y guardar                              | Queda en la auditoría del equipo                                                        |
| 5   | Guardia: atender una llamada → «Hablar», desde `http://127.0.0.1:3100` en el Mac (el micrófono sólo se concede ahí) | Transporte del equipo; la bitácora **no** dice «concedido SIN transporte»               |
| 6   | **KPI-33** hablando y escuchando: teléfono grabando entre los dos altavoces, una palmada en cada punta (S-180)      | < 2 s en cada sentido                                                                   |
| 7   | Reiniciar la API y mirar la primera suscripción a eventos (DT-15S1-C05)                                             | ¿`805306369` al primer intento? Anote cuántos hasta conectar                            |

### Terminal facial · DS-K1T344MBFWX-E1 V4.61.0

| #   | Qué                                                       | Esperado                                                                                                |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | `GET /ISAPI/System/TwoWayAudio/channels`                  | Si contesta la lista, S-15S1-02 se confirma. Un `404`/`notSupport` la refuta: sin audio por la terminal |
| 2   | `open` y `close` del canal que declare                    | Como el videoportero; si no abre, **no** se marca la casilla                                            |
| 3   | Ficha → «Probar conexión»                                 | «canal de audio bidireccional» con canal y formato; y «señalización de llamada» (DT-15S1-C09)           |
| 4   | Atestación en su ficha                                    | Como el videoportero                                                                                    |
| 5   | Pulsar **llamar a la central** en la terminal             | En la cola: «Llamada a la central», con la terminal propuesta para audio y video                        |
| 6   | «Hablar», micrófono y **KPI-33**, como en el videoportero | < 2 s en cada sentido                                                                                   |

### Cámara LPR · DS-TCG405-E V5.4.0

| #   | Qué                                                                                                    | Esperado                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `GET /ISAPI/Streaming/channels`                                                                        | Un canal, `101`, H.265. **Si da `403`, ésa es la causa [Probable] del 102**: anote si trae `lowPrivilege` o viene sin cuerpo (DT-15S1-C10) |
| 2   | Ficha → «Probar conexión»                                                                              | Hallazgo «canal de video de la ficha»: aviso «la ficha tiene el canal 102… se usará el 101», o «no comprobado» con el motivo               |
| 3   | Con Edge: tras «Probar conexión», pedir el video                                                       | El Edge usa el 101 (H-15S1-C08), no el 102                                                                                                 |
| 4   | «Ver video en vivo»                                                                                    | Sin llamar al puente: «el equipo entrega H.265 en el canal 101… (requiere autorización del cliente)»                                       |
| 5   | **Sólo con la autorización del cliente:** el flujo 101 a H.264 en el panel → «Probar conexión» → video | Primer cuadro y **KPI-33** (< 2 s). Sin autorización: anotar «cámara sin video en la consola»                                              |
