# ADR-035 · El Edge es el puente local permanente entre la nube y los equipos

|               |                                                                                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Estado**    | Aceptada · ronda 15-Q2 (2026-10-02) · **decisión del cliente** (P-27 = A)                                                                                                                                                       |
| **Sustituye** | **En parte** a [ADR-034](ADR-034-el-edge-es-contingencia.md): el papel del Edge con WAN. Lo que ADR-034 construyó y sigue valiendo está en «Qué se conserva»                                                                    |
| **Afecta a**  | `apps/edge` (túnel, ejecutor de órdenes, credenciales, go2rtc) · `apps/api/src/edge` (túnel, proveedor vía Edge) · el enrutamiento del proveedor de equipos · `docs/guias/DESPLIEGUE_EDGE.md` · `docs/guias/DESPLIEGUE.md` §4.4 |

---

## Corrección del registro, dicha con exactitud

En la ronda 15-Q, la pregunta P-27 («¿qué papel tiene el Edge en sitio?») se
hizo con dos opciones, y el agente marcó la **B** como «Recomendado». La
respuesta recibida fue esa opción, y ADR-034 la registró como «decisión del
cliente». **La transcripción fue fiel; la decisión no lo era.** El cliente
aclara que lo que decidió es la **A**, y la recomendación del agente se hizo sin
un dato que la invalida: la API irá en Cloud Run.

Por eso este ADR no corrige ADR-034 en silencio ni lo reescribe: lo sustituye
en parte, y ADR-034 queda como registro de lo que se construyó y por qué.

## Contexto: por qué B no sirve en producción

- **La API irá en Cloud Run** (decisión del cliente para producción). Un
  servicio de Cloud Run no tiene ruta hacia las direcciones privadas de la red
  de un conjunto: no puede abrir una conexión hacia la cámara, la terminal o el
  videoportero, y nadie va a publicar esos equipos en internet.
- Con B, la nube «habla con los equipos» sólo mientras la API corre en la misma
  red que ellos —el portátil en sitio de las rondas 15-K a 15-P—. Fuera de ese
  entorno, la nube **nunca** alcanzaría los equipos, y el Edge sería el único
  que los oye sin ser el que decide.
- B obligaba además a que cada equipo admitiera **dos clientes** a la vez (dos
  destinos de Alarm Server, dos suscripciones; S-184) y aceptaba un riesgo de
  doble decisión (DT-15Q-03). Con A, ninguno de los dos existe.

## Decisión

**El Edge es el único que habla con los equipos de su conjunto, siempre.**

1. **Túnel saliente.** El Edge abre UN WebSocket seguro, persistente y
   **saliente** hacia la API, autenticado con su identidad de la 15-Q (HMAC,
   marca temporal y nonce; la API valida Edge, generación de credencial y
   copropiedad en la capa de aplicación, RN-15). Saliente, porque es lo único
   que atraviesa el NAT del conjunto sin abrir puertos en su router. Un Edge
   por copropiedad conectado a la vez.
2. **Un solo actor sobre los equipos.** Los equipos reportan sólo al Edge. Con
   nube, **la API decide** —motor y reglas de siempre— y devuelve la orden; **el
   Edge la ejecuta** y confirma. Si la nube no responde dentro del plazo, el
   Edge decide con su caché (la contingencia de la 15-Q), acciona, sella la
   versión y lo guarda para reconciliar. Nunca deciden los dos.
3. **Las órdenes de la consola viajan por el túnel**, detrás de los mismos
   puertos del dominio (`AccessPointProvider`, `FaceTemplateProvider`,
   `IntercomProvider` y los de diagnóstico y salidas), con plazo y con un motivo
   tipado si el Edge no está conectado. Nunca quedan colgadas.
4. **Las credenciales de los equipos viven sólo en el Edge**, cifradas en
   reposo con una llave del Edge. La API guarda una referencia y una huella no
   reversible.
5. **Audio y video de la guardia pasan por el Edge**: el audio por canales
   binarios del túnel; el video, negociado por la API y servido por un go2rtc
   junto al Edge, de modo que la URL RTSP con credencial no sale del conjunto.
6. **La elección es por copropiedad, no global.** Una copropiedad **sin** Edge
   activo funciona exactamente como hoy: la API habla directo con los equipos.
   Es el modo del portátil en sitio y el de las pruebas existentes (R1).

## Qué se conserva de ADR-034

La instantánea de reglas versionada con hash; la identidad del Edge derivada y
validada en la aplicación; las entradas locales con HMAC y nonce; la decisión
local con `@ncr/domain-core` sin modificar; la bandeja con clave de
idempotencia y la reconciliación; `pnpm sitio:edge`; la corrección del orden
numérico de las versiones; y la DoD de 30 minutos sin WAN, que pasa a ser la
prueba de regresión de la contingencia.

## Qué queda sustituido

| De ADR-034                                  | Con ADR-035                                                     |
| ------------------------------------------- | --------------------------------------------------------------- |
| «La nube sigue hablando con los equipos»    | La nube habla con el Edge; el Edge, con los equipos             |
| El Edge pregunta a `/ready` por cada acceso | El Edge envía el hecho por el túnel y espera la orden con plazo |
| Dos clientes por equipo ([SUPUESTO] S-184)  | Uno: el Edge. S-184 se retira                                   |
| Riesgo de doble decisión (DT-15Q-03)        | Cerrado por construcción: sólo el Edge acciona                  |
| La cámara publica a la API **y** al Edge    | La cámara publica **sólo** al Edge                              |

## Consecuencias

- **Una sola instancia de API.** El túnel de cada Edge y el turno de audio
  viven en el proceso que los aceptó; con dos instancias, una orden podría
  llegar a la que no tiene el túnel. `DESPLIEGUE.md` §4.4 lo dice y corrige la
  afirmación «sin estado en memoria». Escalar exige un bus entre instancias,
  fuera de esta ronda.
- **El Edge es punto único del conjunto.** Sin Edge conectado, la consola no
  alcanza los equipos: cada orden falla en el acto con un motivo tipado. Los
  accesos siguen resolviéndose en el sitio (contingencia).
- **Video entre redes.** Los medios WebRTC tienen que atravesar el NAT del
  conjunto: STUN y TURN configurables. Cloud Run no acepta UDP, así que el TURN
  se aloja en otro servicio: **PENDIENTE DE DEFINICIÓN** dónde.
- **Lo que nadie decidió todavía** sigue negando: «escalar al portero» sin WAN
  (P-28).
