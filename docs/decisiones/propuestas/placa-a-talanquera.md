# De la placa a la talanquera: qué falta exactamente

**Pregunta (2026-09-14), ya con datos del equipo.** «Para ejercer placa
autorizada → talanquera abierta, ¿qué falta? ¿Es viable una implementación
mínima antes de la ETAPA 15, qué pesa y qué habría que construir?»

**Respuesta corta.** Es viable, pesan **unas 3 jornadas**, y hay **un dato que
falta y que solo se puede conseguir con los equipos delante**: cuál es el relé
que abre la barrera. Sin eso, la última pieza se escribe a ciegas.

> **Corrijo una cifra mía.** El 2026-09-14 estimé 1,5 jornadas. Esa cifra era
> para **abrir y cerrar a mano desde la consola**, que es lo que se preguntó
> entonces. Placa → talanquera es más: añade el servidor de alarmas y el
> accionamiento automático tras una decisión permitida. No es que la estimación
> anterior estuviera mal; es que el alcance es otro, y conviene decirlo antes de
> que las dos cifras convivan.

---

## 1 · La cadena completa, tramo por tramo

| #   | Tramo                                        | Estado                                                                                  |
| --- | -------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | La cámara lee la placa y envía el evento     | **Hecho y medido.** Funciona contra el equipo real                                      |
| 2   | Alguien recibe ese envío y lo traduce        | **FALTA** — el servidor de alarmas                                                      |
| 3   | El analizador del evento                     | **Hecho hoy**, en `packages/providers/src/anpr/`, probado y compartido con el simulador |
| 4   | Las fotografías van al bucket privado        | El almacén existe; falta engancharlo al traductor                                       |
| 5   | La ingesta firmada decide con el motor       | **Hecho.** `POST /ingesta/eventos` → `RegistrarAcceso` → motor de reglas                |
| 6   | El evento inmutable, la alerta, el aviso     | **Hecho**                                                                               |
| 7   | Si la decisión permite, **abrir la barrera** | **FALTA** — hoy nadie acciona nada tras una decisión                                    |
| 8   | El relé real                                 | **FALTA**, y además falta saber **cuál es**                                             |

---

## 2 · Los tres huecos, en detalle

### 2.1 · El servidor de alarmas, y por qué es una frontera y no una ruta más

El equipo envía su `POST` **sin autenticación de ninguna clase** —lo medimos: el
cliente HTTP embebido del aparato, sin firma, sin credenciales—. La ingesta del
sistema, en cambio, **exige firma**: es lo que impide que cualquiera invente un
hecho de hardware.

Las dos cosas son correctas y por eso **no se pueden conectar directamente**.
Apuntar la cámara a `/ingesta/eventos` obligaría a relajar la firma, y relajar
la firma significa que cualquiera con acceso a esa red puede fabricar un paso de
vehículo con la matrícula que quiera, que el sistema decidiría sobre ese hecho
falso y lo guardaría como evento **inmutable**.

El traductor es una superficie con su propio modelo de amenaza:

- Escucha **acotada a la red de los equipos**, nunca expuesta a Internet.
- **Contrasta el origen** contra el dispositivo registrado: un envío que no
  viene de un equipo dado de alta se descarta y se registra.
- Resuelve la copropiedad **desde el registro de dispositivos**, jamás desde el
  cuerpo del envío. Un identificador de tenant que viaja en la petición es un
  campo con el que equivocarse, y el modo de equivocarse es escribir en el
  tenant de otro.
- Límite de tasa y de tamaño: el envío real ronda 170 kB.
- Sube las dos imágenes al bucket privado y pasa **la referencia**, no los
  bytes (RN-21).
- Firma hacia dentro y llama a la ingesta que ya existe.

`capturePicSecurityCode` **no sirve como control**: no está documentado como
firma criptográfica y no hay clave con la que verificarlo. Se arrastra como
metadato. Tratarlo como autenticación sería peor que no tener ninguna, porque
parecería que la hay.

**Peso: 0,8 jornadas.** El análisis del evento —lo caro— ya está hecho.

### 2.2 · Nadie acciona tras una decisión permitida

Hoy `RegistrarAcceso` decide, registra el evento, levanta la alerta y avisa.
**No abre nada.** Es coherente con lo que había —contra el simulador no hay
barrera que abrir— pero es el eslabón que la pregunta pide.

Y al ir a escribirlo aparece algo que conviene decidir antes y no dentro de la
ETAPA 15:

> **Hay dos puertos para la misma intención.** `AccessPointProvider` vive en el
> dominio, lo implementa el simulador y **no lo usa nadie**; devuelve
> `{aceptado, latenciaMs}`. `AccionadorDePuerta` vive en el módulo de guardia,
> **sí se usa** —es el de la apertura manual— y devuelve `void`.
>
> El que se usa es el que **pierde la latencia**, que es justo lo que KPI-13 y
> KPI-32 exigen medir. El adaptador real debería implementar el del dominio, y
> la apertura manual pasar a usarlo también. No es refactor por gusto: con dos
> puertos, el día que se conecte el equipo habría que decidir a cuál engancharlo
> y la mitad del sistema mediría la latencia y la otra mitad no.

**Peso: 0,5 jornadas**, incluyendo reconciliar los dos puertos y el caso de uso
que acciona tras una decisión permitida.

### 2.3 · El relé: el dato que falta

`/ISAPI/System/IO/outputs` en la cámara devuelve **una sola salida**, y su
`IOUseType` es **`whiteLight`** — la luz de apoyo, no la barrera. La ruta
genérica `/ISAPI/System/IO/capabilities` responde `notSupport` en este firmware.

Así que **no sabemos todavía qué abre la talanquera**. Tres posibilidades, y las
tres se distinguen hoy:

1. La cámara tiene otra salida que esa ruta no enumera, bajo la rama de ISAPI
   propia de la familia de tráfico. Se busca en el sondeo del paso 3.2 de la
   guía de validación y en la pantalla de control de barrera de su interfaz web.
2. La barrera está cableada a **otro equipo** —un controlador de puerta o el
   propio terminal—. Entonces el accionador apunta a ese otro equipo, y el
   diseño no cambia: cambia el dispositivo registrado.
3. La instalación no tiene barrera conectada todavía. En ese caso se valida el
   accionamiento contra el relé del terminal facial y se deja documentado.

**Hasta que esto se responda, la pieza 4 de abajo no se puede escribir.** Es lo
que conviene sacar mientras los equipos estén disponibles.

---

## 3 · Lo que pesa, en orden de ejecución

| Orden | Pieza                                                                               | Peso     | Bloqueada por |
| ----- | ----------------------------------------------------------------------------------- | -------- | ------------- |
| 1     | Servidor de alarmas: escucha, frontera, evidencia al bucket, firma hacia la ingesta | 0,8 j    | —             |
| 2     | `ocurridoEnDispositivo` en el contrato de ingesta (§4)                              | 0,3 j    | su decisión   |
| 3     | Accionamiento tras decisión permitida + reconciliar los dos puertos                 | 0,5 j    | —             |
| 4     | `AccionadorHikvision` real: Digest y la orden del relé                              | 0,5 j    | **el §2.3**   |
| 5     | Elección de adaptador **por dispositivo** y resolución de `credencial_ref`          | 0,5 j    | —             |
| 6     | Prueba en sitio de punta a punta y medición de las dos latencias                    | 0,4 j    | 1–5           |
|       | **Total**                                                                           | **~3 j** |               |

Las piezas 1, 3 y 5 **no necesitan el equipo**: se construyen y se prueban
contra el simulador, que desde hoy emite la forma real del evento. Solo la 4 y
la 6 requieren hardware delante.

---

## 4 · ¿Encaja el contrato de ingesta de la ETAPA 05?

**Encaja en lo esencial**, y en un punto encaja mejor de lo previsto. Tres
huecos, de los cuales **uno importa de verdad**.

### Lo que encaja uno a uno

| El equipo manda   | El contrato tiene     | Observación                                                                                                                                                                    |
| ----------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `licensePlate`    | `placaLeida`          | La normaliza el objeto de valor `Placa`, no el traductor                                                                                                                       |
| `confidenceLevel` | `confianzaCentesimas` | **0..100 entero en los dos lados.** La decisión de la ETAPA 05 de usar centésimas enteras resulta ser exactamente la resolución del aparato: no había más precisión que llevar |
| `UUID`            | `referenciaExterna`   | Es la clave de idempotencia (RN-17, CA-22). El equipo sí da un identificador propio, que era el supuesto que quedaba por confirmar                                             |
| —                 | `metodo: 'placa'`     | Lo pone el traductor                                                                                                                                                           |
| —                 | `dispositivoId`       | Lo resuelve el traductor desde el origen, **no desde el cuerpo**                                                                                                               |
| —                 | `copropiedadId`       | **Del registro de dispositivos**, nunca del envío                                                                                                                              |

### Hueco 1 · No hay hora del equipo · **este sí hay que cerrarlo**

El equipo manda `dateTime` **con su desfase horario**. El contrato no tiene
dónde ponerlo, y `RegistrarAcceso` sella `reloj.ahora()` — la hora del
**servidor**.

En un evento en vivo la diferencia son milisegundos y no se nota. **En la
reconciliación del Edge sí**: tras media hora sin WAN (CU-04, CA-21, CA-22,
KPI-31), veinte accesos resueltos localmente llegarían a la nube fechados **a la
hora de la reconciliación**, no a la del acceso. El historial diría que veinte
vehículos entraron en el mismo minuto.

El dato existe, llega, y hoy se tira.

**Propuesta:** `ocurridoEnDispositivo?: string` —ISO-8601 con desfase— opcional
en `EventoIngestaDto` y en `HechoEntrante`; `RegistrarAcceso` lo usa si viene y
cae al reloj si no. Es **aditivo y opcional**, así que no rompe a ningún emisor
actual, y la columna `ocurrido_en` ya existe. **0,3 jornadas.**

Conviene además conservar **la hora de recepción aparte**, para poder medir el
desfase del reloj del equipo: un aparato con la hora corrida es un problema de
la ETAPA 12 que hoy no se detectaría. Eso sí requiere columna nueva, así que lo
dejo señalado y no propuesto.

**No lo he hecho.** Cambia el contrato de ingesta, que es superficie publicada,
y eso lo decide usted.

### Hueco 2 · No hay canal · **diferible**

`channelID` distingue carriles dentro de un mismo equipo. Con una cámara y un
carril no molesta, y no hay riesgo de colisión de claves porque el `UUID` del
evento ya es único. Cuando haya un equipo de dos carriles, la salida limpia es
registrar cada carril como su propio dispositivo lógico, no ampliar el contrato.

### Hueco 3 · La evidencia no viaja por el DTO · **correcto así**

El equipo manda dos JPEG en el mismo envío; el contrato solo admite
`evidenciaId`. Es lo correcto: las imágenes van al bucket privado y por el
contrato viaja la referencia (RN-21). No hay nada que cambiar; hay que construir
el traductor que lo hace.

---

## 5 · Lo que sí he hecho hoy

El evento real es ya material del proyecto, en `packages/providers/src/anpr/`:

- **El analizador** del XML y del envío multipart, que es el que usará el
  adaptador de la ETAPA 15. No decodifica el cuerpo a texto —una imagen pasada
  por UTF-8 queda destruida y el fallo aparece después, al validar la
  evidencia—, y antepone los dos guiones al delimitador, que empieza por guiones
  en este fabricante: sin eso, la coincidencia cae dentro del propio JPEG.
- **El emisor**, que construye envíos con esa forma exacta: el delimitador del
  equipo, el desfase horario pegado a la fecha, la confianza en centésimas, el
  identificador propio y `vehicelRect` **con la errata del fabricante**.
- **`MockProvider` ya no se inventa la lectura.** La construye con la forma del
  equipo y la vuelve a leer con el mismo analizador. El camino simulado y el
  real comparten normalizador, que es lo que hace que ADR-03 signifique algo.
- **Un control nuevo que solo existe porque hay dato real:**
  `laCamaraDecidePorSuCuenta`. `barrierGateCtrlType` distinto de 0 —o ausente—
  significa que el equipo acciona por su cuenta, y eso deja de ser un comentario
  en una guía para ser algo que la ingesta puede rechazar.

**Lo que falta para cerrarlo: la captura.** `docs/insumos/hikvision/` está en su
máquina, no en el repositorio. Todo lo anterior está probado contra una
**reconstrucción** hecha con la lista de campos que usted me pasó, no contra los
bytes. La prueba `captura-real.test.ts` ya está escrita y espera esos archivos:
mientras no estén, **imprime OMITIDA** y lo dice. Empuje el directorio y esa
prueba pasa a ejercerse sola.
