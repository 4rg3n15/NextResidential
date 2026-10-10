# RONDA 15-S4 · Resultados de la visita del 09/10

**Rama:** `etapa-15s4-resultados-visita-0910` · **Base:** `develop` (`7d6d628`, merge del PR #54) ·
**PR:** hacia `develop`, sin fusionar · **Fecha:** 2026-10-10 ·
**Encargo:** RONDA 15-S4, sólo documentación (tareas 1 a 5) ·
**Abre:** C-65 · C-66 · DT-15S4-01 a DT-15S4-03 · H-15S4-01 · **Documenta:** S-15S2-02

> **Esta ronda NO cierra la ETAPA 15**, que sigue BLOQUEADA sólo por `BE-02`.
> **Ninguna línea de código ni de pruebas.** La integración con los equipos
> está congelada desde el 09/10 y no se tocó: el código congelado se **leyó**
> para verificar la evidencia, no se cambió. Sin migración.

**Lo incómodo primero.**

1. **Los tres hitos del reto llegaron sin declarar.** El encargo los trajo como
   «[SÍ / NO / NO SE PROBÓ]», sin elegir, igual que «Rostro de residente», «Decide
   solo» y el navegador del video. `hoja.md` es la plantilla SIMULADA del 07/10,
   vacía: no es evidencia.
   - Con la regla 10 del encargo (comportamiento conservador), un hito sin
     declarar cuenta como NO SE PROBÓ.
   - La tarea 3 lo deja claro: **la ETAPA 15 no se cierra**. Es lo que más pesa
     de esta ronda, y no depende de nada que yo pueda hacer.
2. **La tarea 2b no se sostiene tal como venía, y no la registré así.** El
   encargo leía la conversación de las 20:33:56 —«PUT 401», «bytesSubidos: 0»,
   «tramos: 0»— como «la subida no se recupera de un 401 del primer PUT», y
   pedía una DT de prioridad ALTA.
   - **No estoy de acuerdo porque** «tramos: 0» prueba que la API nunca recibió
     «pulsar». Sin «pulsar», la API descarta el audio antes de llegar al
     adaptador, y por eso «bytesSubidos: 0». El 401 se recupera en la primera
     trama, como mostró la sesión siguiente: 401 y luego 200, con 384 320 B
     subidos.
   - El equipo no oyó al operador porque no le llegó nada. **Lo que no se sabe
     es si el operador pulsó.**
   - Registrado como C-66, con dos DT de prioridad Media y Baja en lugar de una
     Alta.
   - **El riesgo de esa lectura** era corregir un 401 que no tenía la culpa y
     volver al sitio con el mismo silencio.
3. **La tarea 2c es cierta a medias.** «La referencia documenta
   `GET|PUT …/audioData?sessionId=`» vale para la referencia de **la terminal**.
   La del **videoportero** sólo trae `close?sessionId=` y el `sessionId` de
   `open`. En el videoportero, el uso en `audioData` lo prueba la guardia (200
   el 09/10), no su documento.
4. **El encargo hablaba de tres documentos y llegaron cuatro.** El cuarto,
   «Access Control Event Types and Event Linkage Types», sirvió para los
   códigos de evento del QR.
5. **KPI-13, KPI-32 y KPI-33 siguen sin cifra.** El «primer byte» de las
   sesiones cuenta desde `open`, no de extremo a extremo.

---

## 1 · Qué se construyó

Nada ejecutable: es una ronda de documentación sobre la visita del 09/10.

**Lo medido, con su fuente.** Va en la guía de validación (§10), con la
corrección de su §8.4.4, y resumido en la de entrega (§9):

- los dos informes de `pnpm sitio:audio` (20:19 y 20:20);
- las cuatro sesiones de la guardia del registro de la API (20:32 a 20:38);
- el canal de video de la terminal;
- los hitos, que constan como no declarados.

**Los dos desacuerdos entre fuentes, al registro.**

- **C-65:** el guion dijo «`sessionId` rechazado»; la guardia, minutos
  después, «usado».
- **C-66:** la lectura del encargo frente al código y al registro.

**Tres deudas, cada una con la prueba que la demostraría y una corrección
acotada propuesta** para una ronda con autorización expresa: DT-15S4-01 a
DT-15S4-03.

**La documentación del fabricante.** Los cuatro documentos se citan por
sección y dato, sin versionarse. S-15S2-02 deja de ser supuesto. Lo que dicen
de QR, `cardNo`, SADP y Probe queda anotado para sus rondas, sin implementar.

**ESTADO** dice ahora, en BE-02, exactamente qué hito y qué prueba faltan para
cerrar la ETAPA 15.

## 2 · Cómo se organizó y por qué

- **Primero los documentos, después la evidencia, después el código.**
  - Los .docx se convirtieron a texto con la biblioteca estándar de Python, en
    el área temporal de la sesión. No pasaron por el repositorio ni por git.
  - Los títulos pedidos son exactos: **«Two-Way Audio»** en la terminal
    («ISAPI · Face Recognition Terminals · Value Series») y en el videoportero
    («ISAPI · IP Series · Ultra Series»). En los dos, «# Two-Way Audio» → «##
    Two-Way Audio», con «API Calling Flow» y «Message Format and Example».
  - El «Product Scope» confirma cada equipo: `DS-K1T344MBFWX-E1`,
    `DS-KD9633-WBE6` y `DS-TCG405-E`. El documento de la cámara no tiene
    sección de audio.
- **El código congelado se leyó, no se tocó.** Para verificar 2a y 2b hacía
  falta saber qué hace cada línea del registro:

  - `ConversacionDeAudio.alAudio` descarta sin «pulsar»;
  - `IntercomIsapiPersistente` abre la subida en `open`, cuenta los bytes al
    entrar a `enviarAudio` y reabre en la trama siguiente;
  - `SesionDeAudio.anotar` culpa al `sessionId` de todo 400 o 403;
  - `sitio-audio.mjs` usa ese mismo adaptador y espera un Enter antes del tono.

  Sin esa lectura, 2b se habría registrado al revés.

- **Una contradicción entre el encargo y la evidencia se registra como
  contradicción.** Es la práctica del registro (C-47, C-48, C-51): una lectura
  del encargo que el código o la medida refutan se anota con su resolución. No
  se calla ni se acata.
- **Identificadores internos fuera.** El extracto trae los UUID de la
  copropiedad, los equipos y el operador, cuatro `sessionId` y un nombre de
  canal. Ninguno entra al repositorio: los equipos son «la terminal» y «el
  videoportero», y qué sesión es de cuál lo dice el usuario («Terminal,
  20:35»). Antes del commit se escanearon las líneas añadidas en busca de UUID,
  IP y de esos valores: ninguno.
- **Las tablas de la guía y del registro con el Prettier del repositorio.** La
  primera pasada usó otro Prettier (la copia de trabajo no tenía
  `node_modules`) y reformateaba tablas enteras; se rehízo con la versión
  fijada (3.4.2). En S-15S2-02 la cita va en una nota bajo la tabla, para no
  reabrir el ancho de una tabla de 190 filas.
- **ESTADO, sólo con lo cierto.** BE-02 es el bloqueo único y nombra lo que
  falta: los tres hitos con su evidencia y tres KPI de latencia. El mapa de
  etapas dice por qué la 15 sigue BLOQUEADA, y la ficha de la ETAPA 15 lleva
  una actualización fechada.

## 3 · Árbol de archivos

```
docs/guias/VALIDACION_HIKVISION_EN_SITIO.md   §10 nueva: fuentes, audio (sitio:audio y guardia), video, hitos,
                                              documentación del fabricante y próxima visita; §8.4.4 corregida
docs/guias/ENTREGA_EN_SITIO.md                §9 nueva: la visita del 09/10, lo medido y lo que falta (y el índice)
docs/auditoria/contradicciones-y-supuestos.md C-65, C-66 (con DT-15S4-01 a 03), S-15S2-02 documentado,
                                              §3 ter (QR, cardNo, SADP, Probe) y recuentos
docs/ESTADO_ETAPAS.md                         cabecera, BE-02, mapa, ficha de la ETAPA 15 y ficha de la 15-S4
docs/etapas/ETAPA-15S4-resultados-visita-0910.md   este informe
```

Ningún fichero de `apps/`, `packages/`, `scripts/`, `supabase/` ni
`.github/`. Los cuatro .docx no entran.

## 4 · Tabla SOLID

**No aplica a ningún fichero de esta ronda:** los cinco son documentos. Lo que
la regla 2 protege —ficheros de código ≤ 300 líneas, clases ≤ 5 métodos
públicos, la aplicación importando sólo tipos de `@ncr/providers`, ninguna regla
nueva dentro de `MotorDeReglas`— no cambia porque no cambia el código. El
verificador lo comprueba igual (§6).

| Fichero                                | S                                    | O   | L   | I   | D   |
| -------------------------------------- | ------------------------------------ | --- | --- | --- | --- |
| `VALIDACION_HIKVISION_EN_SITIO.md`     | Una sección nueva, una visita        | —   | —   | —   | —   |
| `ENTREGA_EN_SITIO.md`                  | Una sección nueva, el resumen        | —   | —   | —   | —   |
| `contradicciones-y-supuestos.md`       | Dos entradas, una nota y una sección | —   | —   | —   | —   |
| `ESTADO_ETAPAS.md`                     | Cabecera, mapa y fichas              | —   | —   | —   | —   |
| `ETAPA-15S4-resultados-visita-0910.md` | Este informe                         | —   | —   | —   | —   |

Las correcciones **propuestas** de las DT respetan la regla 2:

- un cambio en el adaptador congelado (DT-15S4-01 y DT-15S4-03);
- un contador en la aplicación de la guardia (DT-15S4-02);
- sin tocar el dominio.

## 5 · Trazabilidad

| Requisito                                           | Cómo queda tras el 09/10                                                                                                                                               |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OE-03** (hardware desacoplado, sin tocar dominio) | Sin cambio de código en esta ronda. La integración congelada funcionó con los equipos en audio y video (declarado y medido). El cierre formal espera los hitos (BE-02) |
| **OE-07** (guardia virtual)                         | Hablar y escuchar a la vez con los dos equipos: SÍ, salvo la conversación de las 20:33:56 sin tramos (C-66). Video en vivo: SÍ                                         |
| **KPI-33 / CA-19** (audio y video < 2 s)            | **Sin cifra**. El «primer byte» cuenta desde `open`; ni la palmada (§8.4.1, fila 4) ni el primer cuadro constan                                                        |
| **KPI-32 / CA-20** (apertura remota < 3 s)          | **Sin cifra**                                                                                                                                                          |
| **KPI-13** (relé < 3 s)                             | **Sin cifra**                                                                                                                                                          |
| **ADR-01** (ISAPI TwoWayAudio)                      | Confirmado por el fabricante: `PUT audioData` persistente sin `Content-Length`, `keep-alive`, `octet-stream`, Digest; G.711ulaw de 160/320 B por trama de 20/40 ms     |
| **RN-12 / RN-21** (nada del equipo en el cliente)   | Ni IP, ni credenciales, ni identificadores internos en la documentación                                                                                                |
| **Ley 1581** (voz = dato personal)                  | Sólo cifras de bytes, niveles y estados; ningún audio                                                                                                                  |
| **Hitos técnicos 1, 2 y 3** (DoD de la ETAPA 15)    | **No declarados** → la ETAPA 15 no se cierra                                                                                                                           |

## 6 · Pruebas

**Qué se probó.** Ninguna prueba nueva: la ronda no tiene código. La tarea 5
pide que el verificador salga igual que en `develop`, y es lo que se comprobó.

### Veredicto literal de `./scripts/verificar-etapa.sh --con-base` (§2.8.0)

Sobre `c5669b4`, desde cero (sin `dist/`, `.turbo/` ni `coverage/`,
instalación con `--frozen-lockfile`), con la base `ncr` reconstruida de 0001 a
0057 por `./supabase/verificar.sh --con-pruebas --modo-supabase` justo antes,
en 46 min 15 s:

```
VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe
```

El control declarado y no ejercido es el de **D-112**: las cinco pruebas del
arranque en frío que el paso 5 salta porque necesitan los claims que escribe el
paso 12b, que es quien las ejecuta. Es el mismo de las rondas anteriores.

**Es la segunda corrida. La primera dio FALLIDA, y por un error mío de
entorno, no del cambio.**

- Tras el reinicio del contenedor arranqué la base de pruebas a mano, con
  `max_connections` de omisión (100), en vez de con
  `scripts/base-de-pruebas.sh`, que la arranca con 300 y exige 200.
- KPI-03 («100 inserciones simultáneas de la misma placa») cayó con «sorry,
  too many clients already».
- El paso 7b lo cazó: la misma suite daba una roja por turbo y ninguna en
  directo.
- Se reinició la base con el guion del repositorio y se repitió todo.

**Igual que `develop`.** Las cifras coinciden con la verificación de la 15-S2,
el último cambio de código en `develop`:

| Qué                                                 | 15-S2 (`1cd6f80`)                       | 15-S4 (`c5669b4`)                       |
| --------------------------------------------------- | --------------------------------------- | --------------------------------------- |
| Pasos                                               | 31 de 31, sin ✗                         | 31 de 31, sin ✗                         |
| Ficheros de prueba                                  | 562 de 562                              | 562 de 562                              |
| Pruebas de TypeScript                               | 5648 (API 2551 + 5 saltadas declaradas) | 5648 (API 2551 + 5 saltadas declaradas) |
| Pruebas de Dart                                     | 508                                     | 508                                     |
| Cobertura de líneas · dominio / aplicación / global | 96,41 % / 97,81 % / 88,59 %             | 96,41 % / 97,81 % / 88,59 %             |
| Estabilidad (paso 14)                               | 3 corridas idénticas                    | 3 corridas idénticas                    |
| Pruebas negativas (paso 9)                          | 35 controles · 257 bloques sin ejercer  | 35 controles · 257 bloques sin ejercer  |
| `sitio:ensayo` simulado (paso 12f)                  | 47 OK · 0 FALLO                         | 47 OK · 0 FALLO                         |

Además, el paso 10 da secretos limpios en 7 777 blobs del historial y las
fronteras, incluido KPI-11, en verde. El paso 1b dice que ESTADO es coherente.

**Cómo ejecutarlo.** `./scripts/base-de-pruebas.sh` (nunca la base a mano: H-15S4-01 abajo),
`./supabase/verificar.sh --con-pruebas --modo-supabase` y
`./scripts/verificar-etapa.sh --con-base`.

## 7 · Verificación de seguridad (§2.7)

- **Secretos y datos personales.** No se copió ninguna IP, credencial, UUID,
  `sessionId` ni nombre de canal del extracto. Las líneas añadidas se
  escanearon antes del commit, y el escaneo de secretos del gancho dio limpio.
- **Los documentos del fabricante, fuera del repositorio.** Se citan por
  documento, sección y dato. La IP de ejemplo que traen no se copió.
- **Sin superficie nueva.** Sin rutas, sin DTO, sin RLS ni permisos tocados:
  no hay nada que validar, limitar ni aislar de nuevo.
- **Las correcciones propuestas no relajan nada.** La de DT-15S4-01 limita los
  reintentos de subida a uno por segundo: hoy son hasta 36 en 2 s. La de
  DT-15S4-02 cuenta tramas y no guarda audio.

## 8 · Hallazgos, deuda, supuestos y pendientes

**Contradicciones**, en el registro:

- **C-65 · Media, resuelta.** `pnpm sitio:audio` dijo «`sessionId:
rechazado`», y la guardia, minutos después, «usado», en los mismos equipos.
  - Prevalece la guardia, con la documentación del fabricante.
  - [Probable] el `PUT` del tono quedó ocioso de 16 a 25 s por la espera del
    Enter. Las tramas abrieron otros `PUT`: un 401 y después 400, **también
    sin `sessionId`**.
  - La hipótesis «falta `Content-Length`» queda refutada por el fabricante.
- **C-66 · Media, resuelta.** «La subida no se recupera de un 401» frente al
  código y al registro: sin «pulsar» no sale audio, y el 401 se recupera en la
  primera trama.

**Deuda.** Todas se corregirían en una ronda futura, con autorización expresa:
la integración está congelada.

- **DT-15S4-01 · Media.** `sitio:audio` y la regla compartida
  `rechazoPorSesion`.
  - Qué falla:
    - el `PUT` del tono queda ocioso;
    - cada trama reabre sin pausa;
    - todo 400 se atribuye al `sessionId`;
    - la ventana «del tono» empieza antes del Enter.
  - Prueba: un simulado que acepta un solo `PUT` por sesión, y en sitio,
    `--segundos=1`.
- **DT-15S4-02 · Media.** Una conversación de 90 s sin un solo tramo.
  - Prueba: pulsar, mirar «Enviando» y la línea de la sesión.
  - Corrección propuesta: contar las tramas descartadas sin «pulsar».
- **DT-15S4-03 · Baja.** El primer `PUT` de subida da 401 (desafío caducado)
  en 2 de 4 sesiones; se recupera en la primera trama.
  - Corrección propuesta: reabrir en el acto, una vez.

**Hallazgos.**

- **H-15S4-01 · Entorno, mío.** La primera corrida del verificador dio
  FALLIDA porque arranqué la base de pruebas a mano tras el reinicio del
  contenedor, con `max_connections` de 100. KPI-03 cayó con «too many
  clients»; el guion `scripts/base-de-pruebas.sh` la arranca con 300. No es
  del cambio: repetida con el guion, la corrida sale correcta (§6).

**Supuestos.**

- **S-15S2-02 documentado.** Lo fija la referencia de la terminal, y la
  guardia lo midió con 200 en los dos equipos.
- La regla «repetir sin él ante 400 o 403» no es del fabricante: es la de C-65.
- Nuevos: ninguno. El de `cardNo` del §3 ter queda marcado `[SUPUESTO]` para
  la ronda del QR, sin número, porque no gobierna nada construido.

**PENDIENTE DE DEFINICIÓN.**

- La declaración de los tres hitos del 09/10, con su evidencia.
- Conducta conservadora mientras falte: la ETAPA 15 sigue BLOQUEADA.

## 9 · Qué debe hacer el usuario manualmente

1. **Declarar los hitos del 09/10**, si se probaron, con SÍ, NO o NO SE PROBÓ y
   su evidencia (evento en /eventos, captura, hora):

   - prototipo;
   - LPR real;
   - facial real;
   - rostro de residente;
   - «decide solo» atestado.

   Y el navegador del video. Con eso, una ronda corta puede cerrar la ETAPA 15
   o decir qué prueba falta.

2. **Si no se probaron, en la próxima visita** seguir
   `VALIDACION_HIKVISION_EN_SITIO.md` §10.6:
   - hitos 1, 2 y 3;
   - la palmada de KPI-33 y el primer cuadro con el navegador anotado;
   - KPI-32 y KPI-13;
   - pulsar antes de hablar y comprobar «tramos» > 0;
   - `pnpm sitio:audio -- --segundos=1` con Enter en el acto.
3. **Decidir si se autoriza la corrección** de DT-15S4-01 a DT-15S4-03 en una
   ronda futura: toca la integración congelada (salvo DT-15S4-02).
4. **Nada que instalar ni migrar.** `supabase db push` no cambia.

## 10 · Rama y commits

Rama `etapa-15s4-resultados-visita-0910`, desde `develop` (`7d6d628`):

- `c5669b4` docs(etapa-15s4/visita): lo medido el 09/10, C-65, C-66 y S-15S2-02 documentado
- el cierre: `chore(etapa-15s4): cierre de etapa`, con este informe y ESTADO.
