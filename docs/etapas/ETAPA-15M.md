# ETAPA 15-M · Conexión completa con terminal y videoportero, video en vivo, indicadores fiables y ajustes de consola

**Rama:** `etapa-15m-equipos-y-consola` · **Base:** `develop` (`a46cb56`, merge del PR #34)

> **Encargo (`CORRIGE ETAPA 15`, 2026-09-29):** la visita del 29/09. La cámara
> LPR es la única ruta verificada con hardware y **no cambia su comportamiento
> observable**; terminal y videoportero fallaban por un rechazo de credencial
> falso (E1); no hay video en ningún equipo (E2); el videoportero debe
> reconocer visitantes como la terminal (E3); los receptores de eventos son
> restos de otra plataforma (E4); los indicadores y las alertas mienten (E5).
> Más los requisitos C1 a C10 del cliente. Se entrega en el orden de prioridad
> del encargo y se declara lo no hecho. **La ETAPA 15 sigue BLOQUEADA sólo por
> `BE-02`**.

---

## Bloque 0 · Confirmación o descarte de la evidencia, con archivo:línea

Escrito antes del código. Cada afirmación está etiquetada: **[Cierto]** se lee
en el código o se reprodujo; **[Probable]** es inferencia fundamentada;
**[Suposición]** rellena lo que no se pudo ver.

### 0.1 · E1 · el falso «rechazó el usuario o la clave» — **CONFIRMADO**

**[Cierto] La hipótesis del asesor es la mecánica exacta del código, y la
bitácora del 28/09 cae en una rama concreta.**

| Paso                                             | Dónde                                                                                                                       | Qué hace                                                                                                                                                                                                                                                                     |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Una sesión Digest por equipo, compartida         | `packages/providers/src/barrera/digest.ts:267-284`                                                                          | `sesionDigestCompartida` indexa por `(transporte, base, usuario)`: **un** `desafio`, **un** `contador` y **una** marca `rechazadaEn` para la escucha, los sondeos, las órdenes y las cargas de foto del mismo equipo                                                         |
| Autenticación preventiva con el nonce compartido | `equipo/cliente.ts:386` y `:502` (`enviar` → `sesion.autorizacionPara`)                                                     | Si la sesión ya tiene desafío —el que negoció la escucha—, **toda** petición sale con `Authorization` y ese nonce, `nc` incrementado                                                                                                                                         |
| El 401 a esa petición preventiva                 | `equipo/cliente.ts:388-412`                                                                                                 | Dos ramas. **Con** `WWW-Authenticate` y `stale=false` (`:391-404`): `marcarRechazada` → 30 min sin red. **Sin** `WWW-Authenticate` (`:405-412`): anota «el equipo contestó 401 SIN desafío Digest» —la línea literal de la bitácora del 28/09— y devuelve el 401 al llamador |
| Quién convierte ese 401 en «credencial»          | `diagnostico/diagnostico-de-equipo.ts:353-355`; `equipo/errores-del-fabricante.ts:397`; `equipo/escucha-alertstream.ts:227` | El sondeo (`clase: 'credencial'`), el mapa de errores (`401` → credencial) y la escucha (`CredencialRechazada`) leen cualquier 401 sin `stale` como la clave                                                                                                                 |
| La ventana                                       | `equipo/cliente.ts:64` y `:381-384`; `barrera/control-barrera.ts:125`                                                       | 30 minutos (`VENTANA_DE_CREDENCIAL_RECHAZADA_MS`) sin tocar la red, con `CredencialRechazada(hace)`. La cámara comparte esta marca                                                                                                                                           |

- **[Cierto] Los 16–29 ms son viajes de red reales**, no la ventana: la rama
  `:405-412` devuelve el 401 del equipo y el sondeo tarda lo que tarda el
  equipo. La ventana de 30 min responde en 0 ms.
- **[Cierto] Sin `lockStatus` ni `unlockTime` en el cuerpo, no es un bloqueo
  del equipo.** El mapa de errores hoy no distingue ese caso: se añade (E1-f).
- **[Probable] El disparador es el nonce de la escucha.** La escucha de 23 min
  negoció el desafío que quedó en la sesión compartida; cada petición suelta
  lo reutilizó con `nc` creciente. El equipo, que responde `stale="false"` a
  un nonce caducado (evidencia del 28/09), contestó 401 —con o sin desafío—
  y las dos ramas de `conDigest` lo leyeron como clave. `curl --digest` y el
  ensayo no lo ven porque **cada uno arranca sin desafío** y hace el
  intercambio limpio `401 → autenticación → 200`.
- **[Cierto] El criterio (a) del encargo no existe hoy en ninguna de las tres
  superficies**: `conDigest` no sabe si el desafío con que viajó la petición
  se obtuvo en ese mismo intercambio o lo heredó de otra conexión.

**RTSP (`equipo/rtsp-describe.ts:163-180`): la [Suposición] del encargo se
DESCARTA en el código.** La sonda hace un intercambio limpio por conexión:
`DESCRIBE` sin credencial → 401 → una `DESCRIBE` autenticada con el desafío de
ese mismo 401. No hay nonce cacheado que caducar. El 401 del videoportero por
RTSP tiene otra causa, y sin el equipo no se puede afirmar cuál. Lo que sí se
hace: el ensayo anotará el desafío recibido y la cabecera enviada (sin la
clave) para que la visita lo capture, y la sonda probará también `Basic` si
el Digest falla. Candidatas **[Suposición]**: `qop` ausente o distinto en el
RTSP del KD9633, `realm` distinto del HTTP, o el camino `/Streaming/Channels/…`
que ese modelo no expone por RTSP con esta credencial.

### 0.2 · E2 · video en vivo — **CONFIRMADOS los dos fallos con el binario real**

Se obtuvo el binario real de go2rtc (`@camera.ui/go2rtc-linux-x64`
1.9.14, en el scratchpad, fuera del repositorio) y se reprodujo:

| Fallo                                   | Dónde                                                                 | Reproducción con el binario                                                                                                                                                                                                                                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400 yaml: … did not find expected key` | `scripts/sitio-video.mjs:111` (`streams: {}`)                         | **[Cierto]** con `streams: {}` en el YAML, `PUT /api/streams` responde `400 yaml: line 7: did not find expected key`: el parche textual de go2rtc no sabe insertar bajo un mapa en línea                                                                                                                                               |
| La credencial queda en disco            | `apps/api/src/guardia/infraestructura/puente-go2rtc.ts:64-71` (`PUT`) | **[Cierto]** sin `streams:` el `PUT` responde 200 **y escribe** `streams:\n  prueba:\n    - rtsp://u:p@…` en el YAML. Contradice RN-21                                                                                                                                                                                                 |
| Sin persistir                           | —                                                                     | **[Cierto]** `PATCH /api/streams?name=&src=` responde 200, crea el flujo **en memoria** y el YAML **no cambia**. `POST /api/webrtc?src=<url>` sin registrar da `404 stream not found` en esta compilación                                                                                                                              |
| `HTTP 500 · EOF` al negociar            | `puente-go2rtc.ts:73-89`                                              | **[Probable]** el «backchannel» ONVIF: go2rtc pide el audio de vuelta en el `DESCRIBE` y el equipo cierra. Se reproduce con el simulador RTSP (que hoy sólo contesta `DESCRIBE`, `simulacion/servidor-rtsp.ts:81`) cerrando la conexión ante `Require: www.onvif.org/ver20/backchannel`, y se corrige con `#backchannel=0` en el `src` |

La lectura de la lista de flujos de go2rtc ya devuelve `rtsp://***@…`
(redactado); el registro de go2rtc no imprimió la clave en las pruebas.

### 0.3 · E3 · rostros en el videoportero — **CONFIRMADO: el camino existe y un campo lo rompe**

- **[Cierto]** `hikvision/hikvision-provider.ts:771-786` (`bibliotecaDe`): para
  un equipo que no es terminal construye el **mismo** `TerminalFacial` con
  `modo: 'decide_el_equipo'`. El videoportero ya usa las rutas de la terminal:
  `POST …/UserInfo/Record` y `POST …/FDLib/FaceDataRecord` multipart
  (`equipo/catalogo-de-rutas.ts:247-289`), que son las que el KD9633 declara
  (`post` en FDLib, sin `setUp`).
- **[Cierto]** `terminal/persona-en-el-equipo.ts:136`: con vigencia, la
  persona se da de alta con `userType: 'visitor'` **sin mirar lo que el
  equipo admite**. El KD9633 sólo admite `normal`: el alta fallaría con un
  400 que hoy se leería como «foto rechazada». Es el punto exacto que E3
  pide gobernar por capacidad.
- **[Cierto]** `apps/api/src/equipos/aplicacion/terminales-de-rostros.ts:72`:
  «aún no se sabe si admite rostros» sale cuando `bibliotecaDeRostros.estado`
  no es `si` ni `no`, y eso es lo que deja el sondeo cuando E1 lo tumba. **La
  omisión es consecuencia de E1**, no de una capacidad ausente.
- **[Cierto] Faltan los extractos ISAPI del KD9633**: `docs/hikdocs/` no está
  en este entorno. Las rutas que usa hoy el adaptador para el videoportero
  son las de la terminal, y se marcan **[SUPUESTO] S-107** hasta tener:
  «Access Control → UserInfo/Record (JSON)», «UserInfo/capabilities»,
  «Intelligent/FDLib/FaceDataRecord (multipart)» y «FDLib/FDSearch» del
  DS-KD9633. **Pedidos al usuario en el informe de avance.**

### 0.4 · Qué NO se toca sin avisar

- **La ruta de la cámara** (lectura → `POST /alarm-server/<secreto>` →
  decisión → relé) comparte `SesionDigest` y `conDigest`. Antes de tocarlos se
  escribe la suite de regresión del 28/09 (`packages/providers/src/barrera/regresion-camara-28-09.test.ts`
  y `apps/api/test/regresion-camara-28-09.e2e.test.ts`) y se exige verde sin
  cambiar una aserción.
- El dominio (`packages/domain-core`) no se toca en ningún bloque.

---

## Avance

_(Una fila por bloque, con su commit, según se entrega.)_

| Bloque | Estado | Commit | Qué queda    |
| ------ | ------ | ------ | ------------ |
| 0      | Hecho  | —      | Este informe |
