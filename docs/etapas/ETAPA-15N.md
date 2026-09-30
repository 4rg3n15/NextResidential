# ETAPA 15-N · Vista en vivo en los tres equipos, guardia que se abre sola y pendientes de las visitas del 28 y 29/09

**Rama:** `etapa-15n-video-y-guardia` · **Base:** `develop` (`ec34e80`, merge del PR #35) ·
**PR:** [#36](https://github.com/4rg3n15/NextResidential/pull/36), sin fusionar · **Fecha:** 2026-09-30 ·
**Guía de la próxima visita:** [`guias/PROXIMA-VISITA-15N.md`](../guias/PROXIMA-VISITA-15N.md)

> **Esta ronda NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Todo lo que toca un equipo está probado contra go2rtc real (v1.9.14 oficial)
> y contra el simulador que reproduce la evidencia del 28 y 29/09. Su
> comprobación con los aparatos está en la [lista final](#lista-de-verificación-en-sitio),
> equipo por equipo y con el resultado esperado de cada paso.

**En una línea.** El video no salía por un `.trim()`: el saneamiento global le
quitaba a la oferta SDP su CRLF final y go2rtc contestaba EOF sin llegar al
equipo. Arreglado y probado de punta a punta por HTTP con go2rtc real; además,
el canal se toma de lo que el equipo declara, el Digest RTSP respeta el desafío,
la guardia se abre sola con el video del equipo que pide atención, el reloj del
equipo se lee antes de dar de alta, las plantillas que faltaban llegan solas al
equipo que empieza a admitirlas y las alertas de caída se cierran al volver.

---

## Bloque 0 · Evidencia antes del código, con archivo:línea

### 0.1 · V1 · el EOF de go2rtc en `POST /api/webrtc` — **CONFIRMADO**

- `apps/api/src/main.ts:134` montaba `express.text({ type: 'application/sdp' })`
  bajo la ruta WHEP: `req.body` es una CADENA.
- `apps/api/src/main.ts:145` llamaba a `aplicarSaneamiento(app)` DESPUÉS de los
  parsers y para TODAS las rutas.
- `apps/api/src/seguridad.ts:112-121` → `SaneamientoMiddleware`
  (`comun/saneamiento.ts:149-152`) → `sanear(req.body)`.
- `comun/saneamiento.ts:115-116`: `sanearTexto` hace
  `replace(CONTROL).normalize('NFC').trim()` → el `\r\n` final desaparece.
- Reproducido con go2rtc v1.9.14 oficial (revisión `b5948cf`), misma oferta y
  fuente inalcanzable: **sin CRLF final**, HTTP 500 «EOF» en 1,3 ms y en el
  registro `webrtc.go:272 > error=EOF` y `server.go:129 > error=EOF` en el MISMO
  milisegundo, sin intentar el RTSP; **con CRLF final**, «dial tcp …: connection
  refused» (`webrtc.go:281`): sí llega al RTSP.
- Por qué la 15-M no lo vio: `puente-go2rtc.real.test.ts` llamaba a
  `PuenteGo2rtc.negociar()` con una oferta ya terminada en CRLF, **sin pasar por
  `main.ts` ni por el saneamiento**.
- El «EOF» de la 15-M (backchannel) era OTRO: el equipo cerraba la conexión
  RTSP. Los dos se leen igual en la respuesta de go2rtc.

### 0.2 · V3 · «credencial rechazada por RTSP» en el videoportero — **hipótesis del encargo REFUTADA; otras dos causas en el código**

- `packages/providers/src/equipo/rtsp-describe.ts:70-74` abría una conexión TCP
  NUEVA por sonda; `:162` primer DESCRIBE sin `Authorization`; `:164-170` usaba
  el desafío de ESA respuesta. No había caché de nonce: no podía heredarse. El
  patrón E1 de la 15-M no estaba aquí.
- Causas reales de un 401 con la clave buena:
  (a) `digest-calculo.ts:111-118` calculaba SIEMPRE MD5 y `:125` declaraba
  `algorithm=${desafio.algorithm}`: si el equipo pide SHA-256, el resumen es
  falso. El fabricante documenta `MD5`, `SHA256` y `MD5/SHA256` (manual
  IP/Ultra, `SecurityCap/…/algorithmType`).
  (b) `rtsp-describe.ts:95` unía las cabeceras `WWW-Authenticate` repetidas con
  «, » y `digest-calculo.ts:56` no cortaba en un segundo `Digest`: dos desafíos
  se MEZCLABAN parámetro a parámetro.
- La sonda ya anotaba esquema ofrecido y enviado desde la 15-M
  (`rtsp-describe.ts:177-188`), pero sólo el primero, y 403/404/412/454 salían
  como «contestó RTSP N» (`:192-199`).
- `[SUPUESTO]` S-165: la causa en el videoportero es (a) o (b); no hay captura
  del desafío del 29/09. La sonda nueva lo anota.
- Manual IP/Ultra, «Real-Time Live View · API Calling Flow»: DESCRIBE → 401
  `Digest realm, nonce, algorithm="MD5"` → DESCRIBE autenticado con la URL RTSP
  completa como `uri`. Es lo que hace la sonda.

### 0.3 · G3 · el evento de la llamada — **no tiene mayor/menor** `[CONTRADICCIÓN]` C-46

- La «Llamada entrante» del 28/09 sale de
  `packages/providers/src/hikvision/catalogo-de-eventos.ts:115-141`
  (`eventoDeLlamada`, por `cmdType`), invocado en
  `clasificacion-de-bloque.ts:87-94` cuando el bloque trae `VoiceTalkEvent`.
- Manual IP/Ultra, intercom, «Integration Steps»: «The device uploads an
  intercom interaction event (eventType: voiceTalkEvent)» con
  `VoiceTalkEvent.cmdType: "request"`; `cmdType` ∈ `request`, `cancel`, `answer`,
  `reject`, `bellTimeout`, `hangUp`, `deviceOnCall`.
- «Access_Control_Event_Types», Other Events (0x5): 0x25 «Doorbell Ring» (5/37,
  ya `timbre`) y 0x33 «Call Center» (5/51, sin mapear hasta ahora).
- Disparador: `llamada` con `cmdType` `request` (o sin él), y 5/51
  (`[SUPUESTO]` S-166). `cancel`, `answer`, `reject`, `bellTimeout` y `hangUp` la
  retiran de la cola (`[SUPUESTO]` S-161).

---

## Avance

| Bloque                 | Estado                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **V1** · SDP entero    | **Hecho.** Prueba extremo a extremo por HTTP con go2rtc real, vista fallar con el código anterior (502 «EOF»)                                    |
| **V2** · canal         | **Hecho.** El canal se toma de lo que el equipo declara; «Probar conexión», alta y edición lo proponen y lo guardan                              |
| **V3** · RTSP          | **Hecho.** Un desafío, resumen según algoritmo, esquema anotado sin la clave, 401/403/404/412/454 en palabras. Causa en sitio: S-165             |
| **V4** · clave en logs | **Hecho con riesgo aceptado** (ADR-022, enmienda 1): no hay vía para que la clave no viaje en la consulta a go2rtc; mitigado                     |
| **V5** · alcance       | **Hecho.** Ficha, Guardia y Portería con selector; errores en palabras por causa; comprobación del candidato y del puerto; guía del cortafuegos  |
| **G1–G4**              | **Hechos.** P-22 decidida; una alerta por disparador; la atención se abre sola con el video de ESE equipo; preferencias por copropiedad          |
| **R2** · reloj         | **Hecho.** Lectura antes del alta, negaciones del equipo con su motivo, hora de recepción con marca, respaldo que sólo lee la hora               |
| **R1** · plantillas    | **Hecho.** (a) ya estaba desde la 15-M; (b) cola `ncr.reenviar-plantillas`; (c) «Enviar a equipos pendientes»; (d) estados «pendiente»/«omitido» |
| **A1 / A2** · alertas  | **Hechos.** Resolución automática al volver, archivo en la baja, «Seleccionar todas las visibles», filtros por fecha                             |
| **R3** · ensayo        | **Hecho.** El paso 3 juzga con la decisión del alta real y escribe la forma que se usará                                                         |
| **O1–O6**              | **Hechos.** DT-15M-04, 05 y 06 cerrados; CI con `concurrency`; secreto obsoleto; búsqueda activa (6 hallazgos, 5 corregidos, 1 declarado)        |
| Paso 12c con Chromium  | **No hecho: no viable en este entorno** (§8, DT-15N-03)                                                                                          |

## Lo que se hizo distinto del encargo

- **V3.** La hipótesis del nonce heredado no se sostuvo (Bloque 0.2); se
  corrigieron las dos causas que sí estaban en el código.
- **V4.** El encargo pedía evaluar sacar la clave de la consulta. Medido con
  go2rtc v1.9.14: su API sólo lee `name` y `src` de la consulta, y un alias en el
  YAML exigiría la credencial en el fichero (RN-21). Queda como riesgo aceptado
  con mitigaciones, en ADR-022.
- **G1.** La política de alertas del dominio no escala vigencia ni patrón; el
  cliente los quiere en la atención. Se hace en la aplicación, sin tocar el
  dominio (C-45).
- **G3.** El evento de llamada no tiene mayor/menor (C-46).
- **R2 (d).** El encargo decía «no restaura zona ni hora salvo con bandera
  explícita». No hay bandera: la hora se fija en el equipo con NTP, y restaurar
  la de un respaldo es exactamente el error del 29/09. El respaldo la guarda
  sólo para leerla.
- **R1 (a).** Ya estaba desde la 15-M (alta y edición guardan las capacidades
  que devuelve la sonda; prueba O2 de `equipos.e2e`). Se declara, no se toca.
- **O1.** Se tocó el RESULTADO que devuelve el adaptador (un campo opcional,
  `rechazo`), no la orden que sale hacia la cámara. La regresión del 28/09 pasa
  sin cambiar aserciones.
- **O2 y O3** van en un mismo commit porque comparten el contrato regenerado.
- **Las tres primeras corridas del verificador salieron FALLIDAS** (§6), y la
  primera se leyó mal: se miraron sus fallos cuando iba por el paso 5 y se
  perdió el del paso 10. Lo que dijeron:
  · **paso 10 (§2.2)** — `arranque/tuberia-http.ts`, creado en V1, importaba por
  dentro de `autorizaciones` y `visitas`; ahora por sus barriles (`ba15a6a`);
  · **paso 12e** — los equipos simulados del guion de sitio no listaban sus
  flujos, que V2 pregunta (`25eff60`);
  · **paso 13b** — el recorrido de la consola abría desde Guardia una placa que
  Portería ya había atendido y el portero abría el «evento actual» de una cola
  vacía: describía el modelo anterior a P-22. Ahora comprueba en Chromium que
  la Guardia pasa SOLA a «Atención» una placa desconocida (G2) y que el portero
  abre a mano desde «Equipos en vivo» (`25eff60`);
  · **paso 12c** — por IP, Chromium pide `/favicon.ico` por su cuenta y la
  consola contestaba 404, un rojo intermitente (4 de 4 aquí, 0 de 1 en la
  primera corrida). La consola sirve ahora el icono de la PWA como
  `favicon.ico` y el camino anota la URL de lo que falla (`ba15a6a`).

  La tercera corrida salió FALLIDA por un **defecto real de la G**, que sólo el
  recorrido en Chromium vio: en Guardia, «Última orden: …» vivía dentro de la
  tarjeta del elemento atendido; la orden lo saca de la cola (P-22), la tarjeta
  se vacía y el operador dejaba de ver qué contestó el equipo —también el
  «Rechazada por el equipo» de O1—. Ahora queda fuera del elemento, con su
  prueba vista fallar (`guardia/ultima-orden.test.tsx`). En la misma corrida
  apareció una carrera del propio recorrido (F5, de la 15-L: leía la lista del
  portero sin esperar su refresco); ahora espera como la del
  superadministrador.

- **Aserciones que cambiaron, y por qué ninguna es de la cámara.** La A5 del
  puente fijaba el reenvío de la oferta SIN CRLF (era el defecto de V1); la
  prueba «negación ordinaria no genera alerta» fijaba lo contrario de P-22; el
  paso 3 del ensayo fijaba el FALLO del DS-KD9633 (R3); la ayuda del canal de
  video decía «Vacío = 102» (V2). Las cuatro describían el comportamiento que el
  encargo manda corregir.

---

## 1 · Qué se construyó

La vista en vivo funciona por el camino real: la oferta del navegador cruza la
tubería HTTP de la API sin que el saneamiento la toque, llega entera a go2rtc y
vuelve la respuesta SDP. Qué canal se pide ya no se supone: se elige entre los
que el equipo declara, y cuando algo falla la consola dice la causa (sin canal,
credencial, SHA-256, permiso, sesión, H.265, puente caído, oferta rechazada)
porque la API se lo pregunta al equipo en vez de repetir el «wrong response» de
go2rtc.

La guardia deja de ser una lista de los últimos cincuenta eventos. Recibe sólo
lo que llega en vivo y necesita a una persona —la llamada del videoportero, el
rostro no reconocido o la persona sin permiso, la placa sin autorización, la
lista negra y lo dudoso—, abre UNA alerta por disparador y, si el operador no
atiende a nadie, pasa sola a «Atención» con el video de ESE equipo. En
cualquier otra pantalla suena y ofrece «Atender». Cada copropiedad decide, por
disparador, si abre sola y si suena.

Los pendientes de las visitas quedan resueltos alrededor: el reloj del equipo se
lee antes de dar de alta a alguien con vigencia; las negaciones del propio
equipo se dicen con su motivo; el equipo que empieza a admitir rostros recibe
los vigentes que le faltaban; las alertas de caída se cierran solas al volver
la señal; el ensayo juzga la forma de alta que se usará; la barrera que rechaza
se lee «rechazada»; «Sin zona» quita la zona; el aviso al residente va a nombre
del equipo y del operador; y `entorno:diff` señala las llaves olvidadas.

## 2 · Cómo se organizó y por qué

1. **Una sola tubería HTTP** (`arranque/tuberia-http.ts`) que montan `main.ts`,
   el banco de pruebas y la suite de saneamiento. V1 existió porque las pruebas
   usaban una réplica de la tubería; ahora no hay réplica que pueda divergir.
2. **Las rutas cuyo cuerpo es un formato no se sanean como texto** (WHEP y el
   audio del operador); tienen su validación propia (`oferta-sdp.ts`: `v=0`,
   sin caracteres de control fuera de fin de línea). El puente repone el CRLF si
   falta. De paso apareció que el mismo saneamiento convertía el trozo de audio
   en `{0:…,1:…}` y el controlador respondía 400 a todo trozo.
3. **El canal de video es una función pura en `providers/nucleo`**
   (`canal-de-video.ts`), la misma que usan la API, la consola y el ensayo: un
   solo criterio, sin copias.
4. **El Digest RTSP elige UN desafío** (`rtsp-desafios.ts`: Digest MD5, luego
   SHA-256, luego Basic) y el resumen sigue al algoritmo (vectores de la
   RFC 7616). Con MD5 el cálculo es el de siempre: la regresión de la cámara no
   cambia.
5. **El diagnóstico del video pregunta al equipo** (`diagnostico-de-video.ts`)
   porque go2rtc responde lo mismo a 403, 404, 412 y 454.
6. **Qué pide atención lo decide la aplicación** (`disparadores-de-atencion.ts`),
   no el dominio: la política de alertas del dominio responde a otra pregunta
   (qué es crítico, RN-18). La cola se lee por hora de RECEPCIÓN (un equipo con
   el reloj atrasado no puede enterrar a quien espera), una llamada por equipo,
   y las preferencias por copropiedad viven en la base con RLS forzada (`0046`).
7. **La alerta se serializa por clave** (`deduplicacion-de-alertas.ts`): dos
   avisos simultáneos de la misma llamada abrían dos alertas.
8. **En la consola, un proveedor global** (`componentes/atencion-en-vivo.tsx`)
   escucha el canal SSE, suena UNA vez por elemento nuevo y avisa fuera de
   Guardia y Portería. La elección de qué pasa a «Atención» es una función pura
   (`lib/atencion/seleccion.ts`) con sus propias pruebas.
9. **El reloj se lee antes de escribir nada** (`terminal-facial.ts`,
   `nucleo/reloj-del-equipo.ts`): una persona dada de alta sin su rostro, o con
   una vigencia que el equipo lee corrida, es peor que no darla de alta. La
   marca de reloj desviado en la línea de tiempo se calcula AL LEER: la ingesta
   de la cámara no se toca.
10. **El reenvío de plantillas cruza módulos por puertos.** `equipos` declara
    `ReenvioDePlantillasAEquipo`; `planificacion` lo implementa con la cola
    `ncr.reenviar-plantillas` de pg-boss (clave única por equipo) y, sin
    planificador, en el proceso (S-167); `biometria` ofrece
    `EnviarPlantillasAEquipo`, que sólo manda las vigentes que el equipo no
    tiene. Las dependencias se resuelven con `ModuleRef` perezoso para no crear
    ciclos entre módulos.
11. **El ensayo juzga con el código del alta** (`capacidades-de-personas.ts`
    usa `forma-del-alta.ts` y las lecturas de `rostros-y-personas.ts`): no puede
    volver a exigir una forma que el alta no usa.
12. **O1 es aditivo en el puerto**: `ResultadoAccionamiento.rechazo` es opcional;
    quien no lo lee se comporta como antes.
13. **O2: `null` es «quítala»** en la edición (`OmitType` + `PartialType`), y
    ausente sigue siendo «no la toques».

## 3 · Árbol de archivos (selección)

```
apps/api/src/
├─ arranque/tuberia-http.ts                         # la tubería HTTP única (V1)
├─ guardia/presentacion/oferta-sdp.ts               # validación propia del SDP (V1)
├─ guardia/presentacion/atencion.controller.ts      # cola y preferencias de atención (G1)
├─ guardia/aplicacion/{consultar-cola,preferencias-de-atencion}.ts
├─ guardia/infraestructura/{fuente-de-la-cola,preferencias-de-atencion-pg}.ts
├─ guardia/infraestructura/accionador-por-proveedor.ts  # rechazo ≠ sin respuesta (O1)
├─ eventos/aplicacion/disparadores-de-atencion.ts   # qué pide a una persona (G1, C-45)
├─ eventos/aplicacion/alertas-del-ciclo-del-equipo.ts   # caída resuelta sola, baja archiva (A1)
├─ alarmserver/aplicacion/alerta-de-atencion.ts     # la alerta de lo que emite el equipo (G2)
├─ biometria/aplicacion/enviar-a-equipo.ts          # las vigentes que le faltan (R1)
├─ equipos/aplicacion/{reenvio-de-plantillas,archivo-de-alertas-del-equipo}.ts  # puertos (R1, A1)
└─ planificacion/aplicacion/reenvio-de-plantillas.ts    # cola pg-boss y respaldo en proceso (R1)
apps/web/src/
├─ componentes/{atencion-en-vivo,evidencia-de-evento}.tsx   # aviso global y evidencia (G2)
├─ lib/atencion/{seleccion,avisos,use-atencion}.ts  # qué pasa a «Atención», sonido y aviso
├─ app/(consola)/configuracion/preferencias-de-atencion.tsx
└─ app/(consola)/{guardia,porteria,eventos,visitantes,dispositivos}/…   # pantallas ajustadas
packages/providers/src/
├─ nucleo/{canal-de-video,reloj-del-equipo}.ts      # canal declarado (V2), desvío (R2)
├─ equipo/{rtsp-desafios,diagnostico-de-video}.ts   # un desafío (V3), causa del video (V5)
├─ diagnostico/video-del-diagnostico.ts
├─ simulacion/oferta-de-navegador.ts                # oferta real de Chromium con CRLF (V1)
└─ ensayo/capacidades-de-personas.ts                # el paso 3 con la decisión del alta (R3)
scripts/lib/{registro-de-go2rtc,candidato-webrtc,comparar-entorno}.mjs  # V4, V5, O5
scripts/puesta-en-marcha-equipos.mjs                # equipos simulados que listan sus flujos (12e)
e2e/{recorrido-de-consola,camino-de-acceso}.mjs     # G2 en Chromium; URL de lo que falla (13b, 12c)
apps/web/public/favicon.ico                         # el icono de la PWA, sin 404 por IP (12c)
supabase/migrations/20260930120000_0046_cola_de_atencion.sql  (+ reversión y prueba 99c)
.github/workflows/verificacion.yml                  # concurrency (O4)
```

## 4 · Tabla SOLID (lo creado en la etapa)

| Archivo                                              | SRP                                    | OCP                                       | LSP                                           | ISP                               | DIP                                       |
| ---------------------------------------------------- | -------------------------------------- | ----------------------------------------- | --------------------------------------------- | --------------------------------- | ----------------------------------------- |
| `arranque/tuberia-http.ts`                           | Monta la tubería; nada más             | Una ruta-formato nueva es una entrada     | —                                             | —                                 | Recibe la app; no conoce módulos          |
| `guardia/presentacion/oferta-sdp.ts`                 | Valida la forma de un SDP              | Función pura                              | —                                             | —                                 | Sin dependencias                          |
| `eventos/aplicacion/disparadores-de-atencion.ts`     | Qué pide atención                      | Un disparador nuevo es una rama declarada | —                                             | Lee sólo el evento                | Sin infraestructura                       |
| `guardia/aplicacion/consultar-cola.ts`               | Compone cola y preferencias            | —                                         | Fuente en memoria y PG intercambiables        | `FuenteDeLaCola` de una operación | Depende de puertos                        |
| `guardia/infraestructura/fuente-de-la-cola.ts`       | Traduce eventos a elementos de la cola | —                                         | Cumple el puerto                              | —                                 | Implementa el puerto de aplicación        |
| `alarmserver/aplicacion/alerta-de-atencion.ts`       | Arma la alerta de un evento de equipo  | Función pura                              | —                                             | —                                 | La abre `AbrirAlertaDeEquipo`, por puerto |
| `eventos/aplicacion/alertas-del-ciclo-del-equipo.ts` | Resuelve caídas y archiva por baja     | —                                         | —                                             | Dos métodos de intención          | Repositorio por puerto                    |
| `biometria/aplicacion/enviar-a-equipo.ts`            | Envía lo que le falta a un equipo      | —                                         | —                                             | Un método                         | Repositorio y sincronizador por puerto    |
| `planificacion/aplicacion/reenvio-de-plantillas.ts`  | Encola o ejecuta el reenvío            | Otra cola es otra implementación          | Planificador inerte y pg-boss intercambiables | `ColaAPedido` de dos métodos      | Depende de `ColaAPedido`, no de pg-boss   |
| `equipos/aplicacion/reenvio-de-plantillas.ts`        | Declara el puerto                      | —                                         | —                                             | Un método                         | Lo implementa otro módulo                 |
| `providers/nucleo/canal-de-video.ts`                 | Elige el canal                         | Función pura                              | —                                             | —                                 | Sin dependencias                          |
| `providers/nucleo/reloj-del-equipo.ts`               | Mide y dice el desvío                  | Función pura                              | —                                             | —                                 | Sin dependencias                          |
| `providers/equipo/rtsp-desafios.ts`                  | Elige un desafío                       | Un esquema nuevo es una preferencia más   | —                                             | —                                 | Sin dependencias                          |
| `providers/equipo/diagnostico-de-video.ts`           | Traduce la respuesta RTSP a una causa  | —                                         | —                                             | —                                 | Sin red propia: recibe el resultado       |
| `web/lib/atencion/seleccion.ts`                      | Qué pasa a «Atención»                  | Función pura                              | —                                             | —                                 | Sin React                                 |
| `web/componentes/atencion-en-vivo.tsx`               | Aviso global de atención               | Sonido y notificación inyectables         | —                                             | —                                 | Canal SSE inyectable (`suscribir`)        |
| `scripts/lib/candidato-webrtc.mjs`                   | Comprueba candidato y puerto           | —                                         | —                                             | —                                 | Interfaces de red inyectadas              |

Todo archivo nuevo queda por debajo de 300 líneas. Tres existentes cruzaron el
límite en esta ronda (DT-15N-04, §8).

## 5 · Trazabilidad

| Elemento    | Cubierto en la 15-N                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OE-07**   | Guardia virtual: atención automática con video del equipo, audio tras `IntercomProvider`, apertura y negación con motivo, aviso al residente      |
| **OE-03**   | Todo tras los puertos; la regresión de la cámara sin cambios; el proveedor simulado y el real con la misma suite                                  |
| **OE-04**   | Reenvío de plantillas vigentes (R1); nunca sin consentimiento vigente (RN-09)                                                                     |
| **OE-05**   | Negaciones del equipo con su motivo; hora de recepción con marca de reloj; alertas que se cierran con constancia                                  |
| **RN**      | RN-02, RN-08 (motivo), RN-09, RN-11, RN-15 (preferencias con RLS, aislamiento en la cola), RN-18 (alerta única), RN-19 (baja archiva), RN-21 (V4) |
| **HU**      | HU-21 a HU-29 (portería y guardia), HU-13 y HU-14 (alta en equipos), HU-35 (lista negra en la cola)                                               |
| **CU**      | CU-03 completo contra simulación (llamada, residente que no contesta, operador ocupado); CU-02 (sincronización al equipo que empieza a admitirla) |
| **CA**      | CA-16, CA-17 (motivo), CA-18 (escalamiento < 10 s, alerta única), CA-19 (video), CA-20 (apertura atribuida), CA-26 (caída y vuelta)               |
| **KPI**     | KPI-11 (ninguna IP ni ISAPI fuera de `providers`), KPI-25, KPI-33 (medición de negociación y primer cuadro, sin cambios), KPI-35 (aislamiento)    |
| **CP**      | CP-10                                                                                                                                             |
| **Parcial** | HU-28: el aviso queda en Alertas pero **no llega a la app del residente** (DT-15N-02). KPI-32/33 con hardware: pendiente de la visita (BE-02)     |

## 6 · Pruebas

### Qué se probó y cómo

- **V1:** `vista-en-vivo-extremo-a-extremo.e2e.test.ts` — oferta real de
  Chromium con CRLF final → tubería de `main.ts` → controlador WHEP → go2rtc
  real → RTSP simulado → 201 con SDP. Vista fallar con el código anterior
  (502 «EOF»).
- **V2/V3/V5:** canal inexistente (412), equipo en H.265 y clave mala, cada uno
  con su frase, contra go2rtc real; vectores de la RFC 7616; desafíos repetidos.
- **G:** cada disparador abre SU equipo y pide SU WHEP en la consola; dos
  seguidos, el segundo espera; la llamada en vivo abre una alerta y el histórico
  no; colgar la saca; preferencias con roles, aislamiento y RLS contra
  PostgreSQL.
- **R2:** reloj desviado no escribe nada; reloj ilegible no bloquea (S-164);
  códigos de negación del equipo; marca de reloj en la línea de tiempo.
- **R1:** alta y edición que pasan a «recibe» encolan una vez; el reenvío sólo
  manda lo que falta; la ficha lista pendientes y omitidos contra PostgreSQL.
- **A1/A2, R3, O1–O6:** cada arreglo con su prueba vista fallar antes.
- **Regresión de la cámara del 28/09** (`regresion-camara-28-09.test.ts` y
  `.e2e.test.ts`, con PostgreSQL) en verde tras cada bloque, **sin cambiar una
  aserción**.

Cómo ejecutarlas: `./scripts/verificar-etapa.sh --con-base` (con PostgreSQL y el
binario oficial de go2rtc, que el propio guion pone).

### Resultado

Sobre `0e4cdcb`, cuarta corrida de `./scripts/verificar-etapa.sh --con-base`
(las tres anteriores, FALLIDAS, en «Lo que se hizo distinto del encargo»):

| Superficie                         | Resultado                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| API (con PostgreSQL y go2rtc real) | 1768 pruebas: 1763 en verde y 5 omitidas **declaradas**, que se ejercen en otro paso     |
| Proveedores                        | 1099 en verde                                                                            |
| Consola                            | 688 en verde                                                                             |
| Dominio · configuración · Edge     | 438 · 144 · 101 en verde                                                                 |
| Total TypeScript                   | 4238 pruebas, el mismo recuento por turbo y por vitest directo (paso 7b)                 |
| App (Dart)                         | 367 en verde, iguales en otro huso horario                                               |
| Estabilidad                        | 3 corridas forzadas sin caché, con resultado idéntico                                    |
| Ficheros de prueba                 | 380 de 380 recogidos                                                                     |
| KPI-25 bajo carga                  | p50 / p95 / p99 = 7 / 21 / 26 ms (umbral 10 000 ms)                                      |
| `sitio:ensayo` en simulado         | SIN FALLOS · 46 OK · 0 FALLO · 10 no aplica                                              |
| Recorrido de la consola            | En verde, y el negativo detecta los cinco defectos de sitio reintroducidos por su nombre |
| Regresión de la cámara del 28/09   | En verde, sin una aserción cambiada                                                      |

### Veredicto literal de `./scripts/verificar-etapa.sh --con-base` (§2.8.0)

```
▸ 15 · ningún paso declarado se quedó sin ejecutar
   ✓ OK 31 de 31 pasos ejecutados

VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe
```

### Cobertura por capa

| Capa (TypeScript)                | Líneas  | Ramas   | Funciones | Umbral |
| -------------------------------- | ------- | ------- | --------- | ------ |
| Dominio (`packages/domain-core`) | 96,20 % | 96,91 % | 96,04 %   | 90 %   |
| Aplicación (`**/aplicacion/**`)  | 96,73 % | 89,83 % | 97,60 %   | 90 %   |
| Global                           | 86,05 % | 86,02 % | 85,01 %   | 70 %   |

| Capa (app Dart) | Líneas  | Umbral |
| --------------- | ------- | ------ |
| Dominio         | 98,05 % | 90 %   |
| Aplicación      | 96,89 % | 90 %   |
| Infraestructura | 89,62 % | 60 %   |
| Presentación    | 89,04 % | 50 %   |
| Global          | 89,68 % | 70 %   |

El control declarado y no ejercido es el mismo de la 15-M: se declara sólo para
macOS («0 de ellos en linux»), con motivo y etapa de revisión.

## 7 · Verificación de seguridad (§2.7)

| Medida                      | En esta ronda                                                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Secretos                | Ninguno en el repositorio (escaneo en cada commit). V4: riesgo aceptado y mitigado. O5: `entorno:diff` señala llaves olvidadas sin imprimirlas |
| 2 · CORS                    | Sin cambios                                                                                                                                    |
| 3 · Validación              | El SDP con validación propia; `zonaId` acepta `null` sólo en la edición; `dispositivoId` del aviso validado como UUID                          |
| 4 · Inyección / saneamiento | El saneamiento sigue en todas las rutas de texto; sólo las de formato (SDP, audio) se excluyen, con su validación                              |
| 5 · Rate limiting           | Sin cambios; las rutas nuevas heredan el global                                                                                                |
| 6 · RLS                     | `0046` con RLS forzada, prueba negativa (99c) y reversión                                                                                      |
| 7 · CSP                     | Sin cambios; el video sigue sin exponer go2rtc al navegador (ADR-022)                                                                          |
| 8 · Transversales           | Roles declarativos en las rutas nuevas; el reenvío corre como servicio; ninguna clave ni IP en registros ni documentos                         |

## 8 · Deuda técnica, supuestos y pendientes

- **DT-15N-01.** `RegistrarAcceso.alertar` tiene la misma carrera que tenía
  `AbrirAlertaDeEquipo` (dos lecturas simultáneas de la misma placa podrían abrir
  dos alertas). Es la ruta de la cámara: no se toca sin autorización (REGLA
  DURA). La deduplicación por ventana la limita a lecturas en el mismo instante.
- **DT-15N-02 · PENDIENTE DE DEFINICIÓN (P-23).** «Avisar al residente» deja la alerta
  y la constancia, pero **no le llega a la app**: el notificador push sigue
  siendo el provisional de la ETAPA 06. La consola y la API ahora lo dicen. Falta
  decidir el canal (FCM con los tokens que la app ya registra, o la bandeja de
  notificaciones del residente).
- **DT-15N-03.** El recorrido del paso 12c con Chromium recibiendo video
  sintético **no es viable en este entorno**: el único ffmpeg disponible es el
  de Playwright, compilado sin `lavfi`/`testsrc`, sin H.264 y sin RTSP, y go2rtc
  no genera video sin ffmpeg. La negociación real queda cubierta por la prueba
  extremo a extremo de V1; el cuadro en pantalla se verifica en sitio.
- **DT-15N-04.** Tres ficheros existentes cruzaron las 300 líneas en esta ronda:
  `guardia/presentacion/dtos.ts` (327), `planificacion/planificacion.module.ts`
  (315) y `biometria/biometria.module.ts` (304). Se suman a DT-15M-01.
- **DT-15N-05 · riesgo aceptado.** La credencial viaja en la consulta a la API
  local de go2rtc (ADR-022, enmienda 1).
- **Cerrados:** DT-15M-04 (O2), DT-15M-05 (O3), DT-15M-06 (O1).
- **Supuestos nuevos:** S-161 a S-169. **Contradicciones nuevas:** C-45 (media) y
  C-46 (baja), resueltas. **P-22** decidida por el cliente; **P-23** nueva (el
  canal del aviso al residente). Todo en
  `docs/auditoria/contradicciones-y-supuestos.md`.

## 9 · Qué debe hacer el usuario manualmente

1. Rotar la clave de los equipos si el 29/09 go2rtc corrió en `trace`, y
   editarlos en la consola con la nueva.
2. `pnpm entorno:diff` y borrar las líneas marcadas «SECRETO OBSOLETO».
3. Aplicar la migración `0046`.
4. Permitir go2rtc en el cortafuegos del Mac (TCP y UDP) y fijar
   `VIDEO_IP_ANUNCIADA` si el operador ve el video desde otro equipo.
5. Poner NTP en los tres equipos.
6. Seguir la [guía de la próxima visita](../guias/PROXIMA-VISITA-15N.md) y la
   lista de abajo.
7. Decidir el canal del aviso al residente (DT-15N-02).

## 10 · Rama y commits

Rama `etapa-15n-video-y-guardia`, desde `develop` (`ec34e80`). PR [#36](https://github.com/4rg3n15/NextResidential/pull/36) hacia
`develop`, sin fusionar.

- `05ef465` fix(etapa-15n/video): la oferta SDP llega entera a go2rtc y el audio del operador como bytes
- `be74aee` fix(etapa-15n/video): canal que el equipo declara, Digest RTSP que respeta el desafío y fallos de video en palabras
- `4a96aa8` fix(etapa-15n/video): sitio:video no arranca go2rtc con un registro que escribe la clave de los equipos
- `a874de9` feat(etapa-15n/guardia): la atención se abre sola ante lo que necesita a una persona
- `a4e7eba` fix(etapa-15n/alertas): la caída de un equipo se resuelve sola al volver, la baja archiva y la lista filtra por fecha
- `ec0f0ef` fix(etapa-15n/equipos): el reloj del equipo se lee antes de dar de alta y sus negaciones se dicen con su motivo
- `0e06e97` feat(etapa-15n/biometria): el equipo que pasa a recibir plantillas recibe las vigentes que le faltaban
- `b62be68` docs(etapa-15n/video): la credencial en la consulta a go2rtc queda como riesgo aceptado con sus mitigaciones
- `87bd6e6` fix(etapa-15n/ensayo): el paso 3 juzga la forma de alta que se usará, no la de la terminal
- `2c7106c` fix(etapa-15n/guardia): la barrera que rechaza la orden se lee «rechazada», no «no respondió»
- `399792a` fix(etapa-15n/guardia): «Sin zona» quita la zona y el aviso al residente va a nombre del equipo y del operador
- `6606cad` ci(etapa-15n/ci): una corrida de verificación por rama, la nueva cancela la vieja
- `4aba2e3` fix(etapa-15n/entorno): entorno:diff avisa «secreto obsoleto: bórrelo» sin imprimir el valor
- `c3f2afe` fix(etapa-15n/consola): búsqueda activa · textos que prometían lo que ya no es verdad
- `25eff60` fix(etapa-15n/verificacion): el guion de sitio y el recorrido de la consola, al día con V2 y P-22
- `ba15a6a` fix(etapa-15n/verificacion): la tubería HTTP entra por los barriles y la consola sirve su favicon
- `0e4cdcb` fix(etapa-15n/guardia): lo que contestó el equipo sigue a la vista cuando la orden saca al elemento de la cola
- el commit de cierre documental (este informe, ESTADO, supuestos y guía)

---

## Lista de verificación en sitio

Orden: cámara, terminal, videoportero, plataforma. Guardia virtual abierta en
otro equipo durante toda la visita. Cada fila: qué hacer → qué debe pasar.
Anote el resultado en la hoja, **sin direcciones ni claves**.

### Cámara LPR DS-TCG405-E

| #   | Paso                                                           | Resultado esperado                                                                                                                  |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Ficha → «Probar conexión»                                      | Verificado; el canal de video propuesto es uno de los que la cámara declara (no el 102 si no lo tiene). Guardar lo deja en la ficha |
| 2   | Vista en vivo en la ficha, en Guardia y en Portería (selector) | Imagen en menos de 2 s (KPI-33). Si no, el recuadro dice la causa: sin canal, credencial, H.265, puente caído u oferta rechazada    |
| 3   | Placa del padrón                                               | Abre la barrera como el 28/09; el evento en Eventos; **no** entra en la cola de atención                                            |
| 4   | Placa desconocida                                              | Guardia pasa sola a «Atención» con la placa y el video de ESTA cámara; UNA alerta; suena. En otra pantalla, aviso con «Atender»     |
| 5   | Abrir con motivo con la barrera bloqueada en el equipo         | «Rechazada por el equipo» con su motivo, no «no respondió» (O1). Con el equipo desconectado de la red: «Equipo inalcanzable»        |
| 6   | Editar → «Sin zona» → Guardar                                  | La ficha queda sin zona (O2)                                                                                                        |

### Terminal facial DS-K1T344MBFWX-E1

| #   | Paso                                                                            | Resultado esperado                                                                                                               |
| --- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Ficha → «Probar conexión»                                                       | Verificado; fila «reloj» dentro de la tolerancia (30 s); canal de video declarado                                                |
| 2   | Vista en vivo en la ficha, Guardia y Portería                                   | Imagen, o la causa en palabras                                                                                                   |
| 3   | Visitante nuevo con foto desde la app                                           | Alta `visitor` + `PUT FDSetUp` como el 29/09; la ficha de la visita dice «Enviado» en la terminal                                |
| 4   | Rostro con permiso                                                              | Abre como el 29/09; no entra en la cola                                                                                          |
| 5   | Rostro no registrado                                                            | Guardia pasa sola a «Atención» con el video de la terminal; UNA alerta; suena                                                    |
| 6   | Visitante cuya vigencia ya terminó                                              | «El equipo negó el acceso: permiso vencido» (o el motivo que dé el equipo), en la cola de atención; nunca «Fallo técnico»        |
| 7   | `pnpm sitio:ensayo`, paso 3                                                     | OK, con «forma de alta: persona «visitor» con su vigencia (POST …/UserInfo/Record) · rostro por PUT …/FDSetUp»                   |
| 8   | (Sólo si el cliente lo autoriza) reloj 1 h atrás sin NTP y alta de un visitante | La visita dice «No se le envió: el reloj del equipo va 1 h atrasado»; la terminal no tiene a esa persona. **Vuelva a poner NTP** |

### Videoportero DS-KD9633-WBE6

| #   | Paso                                                                                  | Resultado esperado                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | NTP en el equipo; ficha → «Probar conexión»                                           | Fila «reloj» dentro de la tolerancia (el 29/09 iba unas 13 h atrasado). Si la sonda RTSP falla, anota el esquema ofrecido y el enviado: copie esa línea (S-165) |
| 2   | Vista en vivo en la ficha, Guardia y Portería                                         | Imagen, o la causa en palabras                                                                                                                                  |
| 3   | Pulsar la llamada en el equipo                                                        | Guardia pasa sola a «Atención» con la llamada y el video del videoportero; UNA alerta; suena; «Hablar» a la vista (el audio no se abre solo, S-162)             |
| 4   | Colgar en el equipo                                                                   | La llamada sale de la cola (S-161)                                                                                                                              |
| 5   | «Avisar al residente» con la llamada en «Atención» (vivienda conocida)                | Alerta a nombre del videoportero; la consola dice que no le llega a la app (DT-15N-02). Sin vivienda, el botón está apagado                                     |
| 6   | Visitante nuevo con foto                                                              | Alta `normal` + `POST FaceDataRecord` como el 29/09; «Enviado» en el videoportero                                                                               |
| 7   | `pnpm sitio:ensayo`, paso 3                                                           | **OK** (antes FALLO), con «forma de alta: persona «normal» con su vigencia (POST …/UserInfo/Record) · rostro por POST …/FDLib/FaceDataRecord»                   |
| 8   | Una visita registrada cuando el equipo aún no se sabía capaz; luego «Probar conexión» | La ficha de la visita pasa de «Pendiente» u «Omitido» a «Enviado» sin tocar nada (R1). Si no, «Enviar a equipos pendientes»                                     |

### La plataforma

| #   | Paso                                                                                | Resultado esperado                                                                        |
| --- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | Alertas «dispositivo caído» de días anteriores                                      | Se resuelven solas al primer latido o evento, con la nota «resuelta automáticamente» (A1) |
| 2   | Recuadro «N alertas sin resolver» y tablero                                         | No cuentan resueltas ni archivadas                                                        |
| 3   | Alertas → filtro por fecha → «Seleccionar todas las visibles» → archivar con motivo | Sólo las visibles; quedan archivadas con el motivo (A2)                                   |
| 4   | Configuración → Preferencias de atención → apagar «abrir sola» de «placa»           | Una placa desconocida entra en la cola pero no se abre sola                               |
| 5   | Portátil de portería → consola por la IP del Mac → vista en vivo                    | Imagen. Si negocia y no llega, candidato o cortafuegos (guía §1)                          |
| 6   | `pnpm entorno:diff`                                                                 | Sin «SECRETO OBSOLETO»                                                                    |
