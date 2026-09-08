# Canal de tiempo real: diseño, medición y contingencia

**ETAPA 06** · RN-18 · CA-18 · KPI-25 · riesgo declarado en el documento de requisitos §13.4

---

## 1 · Por qué este documento existe en la ETAPA 06 y no en la 10

El documento de requisitos señala **Supabase Realtime como riesgo** y KPI-25 compromete
**menos de 10 segundos** desde que una alerta se genera hasta que llega al operador de
central. Las consolas que dependen de ese canal se construyen en las ETAPAS 09 y 10.

Descubrir en la ETAPA 10 que el transporte no alcanza el umbral significaría rehacer la
consola con la mitad del proyecto encima. Por eso esta etapa hace tres cosas antes de que
nadie dependa del canal:

1. **Aísla el transporte tras un puerto** (`CanalTiempoReal`), de forma que cambiarlo no
   toque ni el dominio, ni la aplicación, ni la interfaz.
2. **Construye un adaptador propio** que no depende de Supabase — y por tanto es, en sí
   mismo, la contingencia.
3. **Mide la latencia bajo carga**, con una cifra reproducible que entra en el
   verificador de cierre de cada etapa.

---

## 2 · La decisión que hace irrelevante el riesgo

> **El compromiso de los 10 segundos no depende del transporte.**

`EscalarAlerta` (`apps/api/src/eventos/aplicacion/escalamiento.ts`) es una operación de la
capa de aplicación con su propio cronómetro: publica, **cuenta a cuántos llegó**, sella el
instante en el agregado y lo compara con `PLAZO_ESCALAMIENTO_MS`, que vive en el dominio.

Tres consecuencias, y las tres importan:

| Decisión                                            | Qué evita                                                                                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| El plazo está en el **dominio**, no en el adaptador | Cambiar de transporte no cambia el compromiso sin que nadie lo note                                                                             |
| `publicar` devuelve **el número de destinatarios**  | Una publicación a cero suscriptores es un no-envío; con `Promise<void>` sería indistinguible de un envío correcto, y KPI-25 daría siempre verde |
| El evento se **anexa antes** de publicarse          | Un fallo de transporte nunca deja a la consola mostrando un acceso que no está en el histórico                                                  |

Cero destinatarios **no cuenta como escalamiento**: es el flujo alterno de CU-03 —ausencia
de operador disponible—, se registra como aviso y dispara el respaldo.

---

## 3 · El adaptador que se construyó: SSE en proceso

`CanalEnProceso` + `GET /copropiedades/:id/eventos/flujo` (Server-Sent Events).

**SSE y no WebSocket.** El flujo es de una sola dirección —la API empuja, la consola
escucha—, va sobre HTTP/1.1 sin negociación aparte, atraviesa cualquier proxy corporativo y
reconecta solo. Un WebSocket añadiría un protocolo más que asegurar y auditar en la ETAPA 13
a cambio de un canal de vuelta que las consolas no usan: sus acciones ya viajan por POST.

**Aislamiento por construcción.** Los suscriptores se guardan **por copropiedad** y
`publicar` nunca recorre otro conjunto. No es una optimización: la consola de guardia
virtual conmuta entre copropiedades (KPI-35), y un canal con una sola lista global filtraría
eventos de una a los operadores de la otra en cuanto alguien olvidara un `if`. Aquí no hay
`if` que olvidar.

**Sockets muertos.** Un suscriptor que ya no acepta escritura se retira en el acto y **no se
cuenta** como destinatario. Contarlo haría que KPI-25 diera verde sobre entregas que no
ocurrieron.

---

## 4 · La medición

`apps/api/test/latencia-tiempo-real.test.ts` levanta un servidor HTTP real, abre **25
consolas SSE**, lanza **200 eventos firmados en ráfaga** —como llega un Edge que reconcilia
tras un corte de WAN— y mide, para cada alerta, el intervalo entre su `generadaEn` y su
llegada al cliente. Es el mismo instante que sella KPI-25, así que la cifra es comparable
con la que la bitácora registra en producción.

### Resultado (2026-09-07, contenedor Linux del entorno de trabajo)

| Métrica            | Valor   | Umbral                     |
| ------------------ | ------- | -------------------------- |
| Alertas entregadas | 200/200 | toda alerta a toda consola |
| p50                | 1 ms    | —                          |
| p95                | 3 ms    | —                          |
| p99                | 4 ms    | < 1 000 ms (margen propio) |
| Máximo             | 15 ms   | < 10 000 ms (KPI-25)       |

**Tres órdenes de magnitud de margen sobre el compromiso.** La prueba exige p99 < 1 s —una
décima parte del umbral— precisamente para avisar cuando la latencia _empiece_ a subir, no
cuando ya se haya incumplido el indicador.

### Lo que la medición encontró, y no era la latencia

La primera ejecución entregó **120 de 200** alertas, exactamente el límite del `throttler`
por IP. Los 200 eventos venían de 200 dispositivos distintos, pero salían de una sola IP: el
decorador `@Throttle({ default: ... })` de la ruta reconfigura el limitador `default` **para
todos los guards**, incluido el global, que cuenta por IP.

Es el defecto que el propio comentario del código decía evitar, dentro del código que lo
decía. En un conjunto real todas las cámaras comparten enrutador, así que el tope global de
120/min las habría sumado a todas y habría empezado a rechazar eventos —silenciosamente, con
un 429 que ninguna cámara reporta— en cuanto el conjunto tuviera tráfico.

**Corregido con dos limitadores con nombre** (`default` por IP, `dispositivo` por equipo
firmante, cada uno con su propio `getTracker`). Sin la prueba de carga, esto se habría
descubierto en producción.

### Lo que la medición NO cubre

**No mide Supabase Realtime.** Este entorno no tiene credenciales del proyecto (D-17), así
que no hay contra qué medirlo. La cifra de arriba es del adaptador propio.

---

## 5 · Cómo medir Supabase Realtime cuando haya credenciales

El procedimiento, para ejecutarlo contra el proyecto real:

1. Exportar `SUPABASE_URL` y la llave publicable del proyecto (`sb_publishable_…`).
2. Implementar `CanalSupabaseRealtime` contra el puerto `CanalTiempoReal`. Es un fichero
   nuevo en `apps/api/src/eventos/infraestructura/`; **no se toca nada más**.
3. Cablearlo en `eventos.module.ts` sustituyendo `CanalEnProceso` en el proveedor de
   `CANAL_TIEMPO_REAL`.
4. Ejecutar `pnpm --filter @ncr/api exec vitest run test/latencia-tiempo-real.test.ts`. La
   prueba no cambia: mide el puerto, no el adaptador.
5. Comparar contra la tabla de §4. El criterio de aceptación es el de KPI-25: p99 y máximo
   por debajo de 10 s con toda alerta entregada.

---

## 6 · La escalera de contingencia

Ordenada de menor a mayor coste. Cada peldaño es un adaptador detrás del mismo puerto.

| #   | Opción                              | Cuándo                                                 | Coste                                                  |
| --- | ----------------------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| 0   | **SSE en proceso** (construido)     | Por defecto. Una sola instancia de API                 | Cero: ya está                                          |
| 1   | SSE + `LISTEN/NOTIFY` de PostgreSQL | Varias instancias de API detrás de un balanceador      | Un adaptador; PostgreSQL ya está en el stack           |
| 2   | Supabase Realtime                   | Si se prefiere delegar el abanico y su latencia cumple | Un adaptador; dependencia externa en el camino crítico |
| 3   | Sondeo con cursor                   | Red hostil que corta conexiones largas; último recurso | Un adaptador; latencia = periodo de sondeo             |

**El peldaño 1 es el que la ETAPA 14 debería tomar** si el despliegue pasa a más de una
instancia: `CanalEnProceso` reparte solo entre los suscriptores de _su_ proceso, así que con
dos instancias un operador conectado a la B no vería lo publicado por la A. No es una
limitación oculta —está aquí escrita— y su solución no toca ninguna capa por encima del
adaptador.

---

## 7 · Lo que queda registrado para las etapas siguientes

- **ETAPA 09/10**: la consola consume `GET /copropiedades/:id/eventos/flujo`. El contrato de
  los mensajes son los temas `eventos` y `alertas` de `aplicacion/puertos.ts`.
- **ETAPA 14**: si hay más de una instancia de API, el peldaño 1 de §6 deja de ser opcional.
  La medición de §4 se incorpora al tablero de latencias comprometidas.
- **ETAPA 13**: el endpoint SSE mantiene una conexión abierta por operador; la auditoría debe
  cubrir el agotamiento de descriptores y el límite de conexiones por identidad.
