# ETAPA 10 — Consolas operativas

`etapa-10-consolas-operativas` · OE-07 contra simulación · CU-03 · HU-21 a HU-29

---

## 1 · Qué se construyó

Dos consolas, **no una con más botones**. La distinción viene de C-12 y gobierna
todo lo demás: el portero atiende **una** puerta y la tiene delante; el operador
de central atiende **varias copropiedades** y no ve ninguna, así que todo lo que
sabe se lo dice la pantalla.

De ahí que la portería ponga el evento actual en el centro y la guardia virtual
ponga la **cola** — en una, el evento que importa es el que hay; en la otra es
una elección entre varios, y esa elección la decide el tiempo de espera.

Debajo de las dos hay una máquina de estados pura para la exclusividad del canal
de audio, un caso de uso donde el motivo es **condición de la orden** y no campo
del formulario, y una cola que ordena por antigüedad y no por recencia.

---

## 2 · Cómo se organizó, decisión por decisión

### 2.1 · La exclusividad del canal es DOMINIO, no detalle del adaptador

Un canal TwoWayAudio admite una conversación a la vez. Parece del fabricante y
no lo es: de ahí salen decisiones que el operador ve y que quedan auditadas
—quién tiene la palabra, quién espera, a quién se le cortó—. Si viviera en el
adaptador ISAPI, la ETAPA 15 tendría que reimplementarla y la consola no podría
demostrarse sin hardware, que es lo que ADR-03 prohíbe.

`packages/domain-core/src/intercom/canal-exclusivo.ts` es una función pura con
reloj inyectado. Tres decisiones dentro:

- **El segundo operador se encola, no se rechaza.** Rechazar obliga a reintentar
  a ciegas contra un canal que no se sabe cuándo se libera, con un visitante
  delante.
- **La liberación por inactividad la decide el reloj, no un `setTimeout`.** Un
  temporizador vive en el proceso: si el proceso se reinicia, el canal queda
  tomado para siempre y nadie puede volver a hablar con esa puerta.
- **Ceder no es cerrar.** Al soltar entra el primero de la cola _en el mismo
  acto_; dejarlo libre y esperar a que alguien lo pida abre una ventana para que
  un tercero se cuele por delante de quien llevaba esperando.

### 2.2 · El motivo es una condición, y eso se nota en el código

`AccionarPuertaAMano` valida el motivo **antes** de llamar al accionador, y la
prueba mira el accionador, no la respuesta: un caso de uso que devolviera error
y hubiera tocado el relé igualmente pasaría cualquier aserción sobre el cuerpo.

El rastro se escribe **antes** de accionar. Al revés, una caída entre las dos
operaciones dejaría una puerta abierta sin constancia — el peor de los dos
estados. Así, lo peor posible es una orden registrada que no llegó a abrir: el
operador lo ve, insiste, y el incidente queda documentado.

En la consola, el botón está **deshabilitado hasta que el motivo vale**, con la
misma regla que aplica el servidor. Un formulario que deja pulsar y luego
muestra un error enseña a escribir cualquier cosa para pasar.

### 2.3 · La cola ordena por espera, no por recencia

Una bandeja por recencia hunde al que lleva más tiempo esperando cada vez que
llega otro, y el operador acaba atendiendo siempre al último. No da error, no
rompe nada, y deja a alguien en la calle.

La única inversión admitida es la severidad: lista negra, confianza insuficiente
y fallo técnico se adelantan. La espera se **calcula** en cada consulta; guardada
envejecería y la pantalla mostraría un número que dejó de ser cierto.

### 2.4 · Todo cuelga de `copropiedades/:id`

La suite de aislamiento enumera el enrutador. Una ruta con la copropiedad en el
camino entra sola en ese barrido; una que la tomara del token quedaría fuera sin
que nadie lo notara.

---

## 3 · Los cuatro flujos alternos de CU-03

| Flujo                                            | Dónde está                                                                                                                             |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · El residente no responde                     | «Avisar al residente» deja constancia del intento y del texto. El envío por FCM es de la ETAPA 11                                      |
| 2 · El residente niega                           | Es una negación con motivo: el mismo diálogo, el mismo registro                                                                        |
| 3 · El operador está ocupado en otra copropiedad | El canal es exclusivo **por copropiedad y dispositivo**; la consola muestra el puesto en la cola. Conmutar de copropiedad no lo suelta |
| 4 · No hay operador disponible                   | La emergencia escala igual, y la cola marca en rojo lo que pasa del umbral                                                             |

---

## 4 · Los tres avisos que quedaban de la 09, resueltos

| Aviso                                         | Resuelto                                                                                                                                                                                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `img-src` sin el origen de Supabase           | La CSP lo lista desde esta etapa. Se añade **sólo el origen**: una CSP compara origen, y fingir que acota rutas daría una falsa sensación de acotamiento. Lo que acota la evidencia es que el bucket sea privado y la URL caduque en 60 s |
| El video de la guardia virtual necesita HTTPS | Dicho **en la propia pantalla**, no sólo en un documento: el recuadro explica que el puente RTSP → WebRTC llega en la 15 y que el navegador no reproduce cámara fuera de contexto seguro. Un recuadro negro parecería una cámara caída    |
| La PWA necesita HTTPS                         | El recorrido lo declara en cada corrida y está en la guía de red                                                                                                                                                                          |

---

## 5 · Trazabilidad

**Cubiertos:** HU-21 a HU-24 (portería) · HU-25 a HU-29 (guardia virtual) ·
CU-03 con sus cuatro flujos alternos · CA-16 y CA-17 (motivo obligatorio) ·
RN-08 · RN-02 (la negación también genera evento) · RN-18 (emergencia con
severidad crítica) · KPI-35 (conmutación sin fuga, probada por HTTP) ·
ADR-01 (exclusividad del canal, aplicada de verdad).

**Parcialmente cubiertos, con su motivo:**

- **Video en vivo (HU-26).** El puente RTSP → WebRTC es de la ETAPA 15 y exige
  contexto seguro. La consola reserva el espacio y **dice** qué falta.
- **Audio real.** `IntercomSimulado` implementa el puerto con la máquina de
  estados de verdad; lo que la 15 sustituye es el transporte, no las reglas.
- **KPI-32 y KPI-33** (latencia de apertura y de audio extremo a extremo). No se
  pueden medir sin hardware; el simulado no da una cifra que signifique nada.

---

## 6 · Deuda declarada

| Id                    | Asunto                                                                                                                               | Salida                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **D-69**              | El estado del canal vive en el proceso. Con varias instancias, dos operadores en instancias distintas podrían romper la exclusividad | El mismo estado en PostgreSQL con la misma máquina. Por eso la máquina vive en el dominio |
| **D-70**              | La bitácora de órdenes manuales es en memoria, acotada a 200 por copropiedad                                                         | Tabla de órdenes. El historial completo ya vive en `eventos`, que sí es persistente       |
| **DT-13 (reaparece)** | `GuardiaModule` tuvo que importarse el último en `app.module` para no romper un ciclo de barriles                                    | La salida sigue siendo mover los puertos compartidos al núcleo                            |
