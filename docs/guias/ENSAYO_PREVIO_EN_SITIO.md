# Ensayo previo en sitio · los 16 escenarios por canal · **SIMULADO**

> **SIMULADO. No es verificación de hardware.** Se ejecutó con
> `PROVEEDOR_DE_EQUIPOS=simulado`, contra una PostgreSQL con todas las
> migraciones hasta la `0038` y las semillas, `CARGADOR_DE_CONTEXTO=postgres` y
> la persistencia de eventos y biometría en PostgreSQL. Del otro lado no había
> ningún equipo. Lo que demuestra es que, cuando la cámara, la terminal o el
> videoportero publiquen, **todo lo que está detrás decide lo que tiene que
> decidir**: motor, cargador, persistencia, consentimiento, lista negra y
> órdenes. Lo que sólo puede demostrar el aparato (vídeo real, audio, relé,
> reconocimiento de un rostro de verdad, latencias de extremo a extremo) queda
> para BE-02 y está marcado **PROCEDIMIENTO EN SITIO**.

**Fecha:** 2026-09-26 · **Rama:** `etapa-15i-residentes-y-app` · **Prueba que lo
respalda:** `apps/api/test/ensayo-en-sitio-pg.test.ts` (10 pruebas, 4 corridas
seguidas en verde; la corre el verificador con `--con-base`).

---

## Cómo se ensayó

- **Canal app:** la visita, el vehículo propio o la foto salen de la ruta de la
  app del residente (`/copropiedades/:id/mi/…`) con un token de residente, que
  es lo que hace la app al pulsar.
- **Canal consola:** salen de la ruta de la consola (`/copropiedades/:id/…`)
  con un token de administración, que es lo que hace la consola.
- **La decisión** la toma el motor real, que lee de la base lo que esas rutas
  escribieron. La cámara y la terminal publican en el receptor
  (`/alarm-server/…`) igual que en sitio: sobre multiparte con XML y foto, y
  JSON de verificación remota.
- **El reloj** de la API se fija por escenario (`RELOJ`). La cámara publica con
  ese mismo instante, así «hora fuera» y «día distinto» son instantes reales, no
  autorizaciones fabricadas.
- **Día y franja (D5 b):** cada visita de tercero es de UN día, de 14:00 a 18:00
  (UTC en el ensayo). Con una visita de un día, «hora fuera» y «día distinto»
  salen los dos como `VIGENCIA_EXPIRADA`: el dominio no distingue «aún no
  empieza» de «ya pasó».

## Resultado

**Los 16 escenarios quedaron ensayados.** De sus 26 filas escenario × canal,
**24 son automáticas y están en verde (24 de 24)**. Las otras 2 son
procedimiento en sitio:

| Familia      | Escenarios | Filas  | Automáticas en verde          | Procedimiento en sitio                     |
| ------------ | ---------- | ------ | ----------------------------- | ------------------------------------------ |
| Cámara LPR   | 5          | 10     | 10 (5 app + 5 consola)        | —                                          |
| Terminal     | 5          | 10     | 10 (5 app + 5 consola)        | —                                          |
| Videoportero | 6          | 6      | 4 (V1, V3, V4, V5)            | V2 (audio) y V6 (conmutación y emergencia) |
| **Total**    | **16**     | **26** | **24 ensayadas, 24 en verde** | **2**                                      |

A esas se suman las tres comprobaciones adicionales (L6, L7 y T6), también en verde.

> V2 y V6 son PROCEDIMIENTO EN SITIO: necesitan un micrófono, dos operadores y
> una segunda copropiedad delante. El aislamiento al conmutar entre
> copropiedades ya lo prueban las suites de KPI-35.

### Cámara LPR · vehículo de TERCERO con día y franja

| Escenario | Canal   | Esperado                                  | Obtenido          | Motivo              | Prueba                                  |
| --------- | ------- | ----------------------------------------- | ----------------- | ------------------- | --------------------------------------- |
| L1        | app     | PERMITIDO, la barrera abre                | PERMITIDO · abrió | —                   | `ensayo-en-sitio-pg` · «L1–L5 por app»  |
| L1        | consola | PERMITIDO, la barrera abre                | PERMITIDO · abrió | —                   | «L1–L5 por consola»                     |
| L2        | app     | NEGADO                                    | NEGADO            | `PLACA_DESCONOCIDA` | «L1–L5 por app»                         |
| L2        | consola | NEGADO                                    | NEGADO            | `PLACA_DESCONOCIDA` | «L1–L5 por consola»                     |
| L3        | app     | NEGADO (día correcto, hora fuera)         | NEGADO            | `VIGENCIA_EXPIRADA` | «L1–L5 por app»                         |
| L3        | consola | NEGADO (día correcto, hora fuera)         | NEGADO            | `VIGENCIA_EXPIRADA` | «L1–L5 por consola»                     |
| L4        | app     | NEGADO (hora correcta, día distinto)      | NEGADO            | `VIGENCIA_EXPIRADA` | «L1–L5 por app»                         |
| L4        | consola | NEGADO (hora correcta, día distinto)      | NEGADO            | `VIGENCIA_EXPIRADA` | «L1–L5 por consola»                     |
| L5        | app     | NEGADO por lista negra con visita vigente | NEGADO            | `LISTA_NEGRA`       | «L1–L5 por app» (veto desde la consola) |
| L5        | consola | NEGADO por lista negra con visita vigente | NEGADO            | `LISTA_NEGRA`       | «L1–L5 por consola»                     |

### Terminal facial · captura → consentimiento del VISITANTE → contador → verificación remota

En cada canal: la foto sale de la app (`/mi/autorizaciones/:id/rostro`) o de
la consola (`/biometria/capturas`, más el enlace). **El visitante acepta desde
el enlace público**; antes de aceptar, el contador de la biblioteca de la
terminal simulada NO cambia; después, sí. Luego la terminal pide su veredicto.

| Escenario | Canal   | Esperado                                       | Obtenido  | Motivo                                                          | Prueba                       |
| --------- | ------- | ---------------------------------------------- | --------- | --------------------------------------------------------------- | ---------------------------- |
| T1        | app     | PERMITIDO tras consentimiento y sincronización | PERMITIDO | —                                                               | «T1–T5 por app»              |
| T1        | consola | PERMITIDO tras consentimiento y sincronización | PERMITIDO | —                                                               | «T1–T5 por consola»          |
| T2        | app     | NEGADO sin identidad (rostro no enrolado)      | NEGADO    | `FALLO_TECNICO` (no hay titular)                                | «T1–T5 por app» (id no UUID) |
| T2        | consola | NEGADO sin identidad                           | NEGADO    | `FALLO_TECNICO` (no hay titular)                                | «T1–T5 por consola»          |
| T3        | app     | NEGADO (día correcto, hora fuera)              | NEGADO    | `VIGENCIA_EXPIRADA`                                             | «T1–T5 por app»              |
| T3        | consola | NEGADO (día correcto, hora fuera)              | NEGADO    | `VIGENCIA_EXPIRADA`                                             | «T1–T5 por consola»          |
| T4        | app     | NEGADO (hora correcta, día distinto)           | NEGADO    | `SIN_CONSENTIMIENTO` (la plantilla venció con la visita, RN-11) | «T1–T5 por app»              |
| T4        | consola | NEGADO (hora correcta, día distinto)           | NEGADO    | `SIN_CONSENTIMIENTO`                                            | «T1–T5 por consola»          |
| T5        | app     | NEGADO por lista negra con visita vigente      | NEGADO    | `LISTA_NEGRA` (veto por documento)                              | «T1–T5 por app»              |
| T5        | consola | NEGADO por lista negra con visita vigente      | NEGADO    | `LISTA_NEGRA`                                                   | «T1–T5 por consola»          |

**T2, motivo `FALLO_TECNICO`.** Con un rostro que no es de ninguna plantilla
nuestra, el motor no tiene titular que evaluar y el evento lo dice así. En sitio,
lo normal es que la terminal ni siquiera publique un desconocido. Si llega a
publicarlo, se niega y queda registrado, que es lo que pide la hoja. El motivo
no se cambió porque vive en el motor, y el motor no se toca.

**T4, motivo `SIN_CONSENTIMIENTO`.** La plantilla vive lo que la visita (RN-11).
Al día siguiente ya venció, y en sitio la terminal la habrá suprimido. El motor
evalúa el consentimiento antes que la vigencia, así que ése es el motivo.

### Videoportero · timbre → aviso → vista en vivo → apertura atribuida

«Atender» por señalización (`callSignal`) y el reconocimiento facial son **NO
APLICA POR CAPACIDAD** en este modelo. El videoportero no participa por la app
del residente: todas sus filas son de consola.

| Escenario | Canal   | Esperado                                               | Obtenido                                              | Motivo | Prueba                   |
| --------- | ------- | ------------------------------------------------------ | ----------------------------------------------------- | ------ | ------------------------ |
| V1        | consola | Aviso emergente; un timbre no es fila de eventos       | Aviso recibido por el canal de tiempo real            | —      | «V1 · el timbre llega…»  |
| V2        | consola | Audio por su canal propio (G.711)                      | **PROCEDIMIENTO EN SITIO**                            | —      | —                        |
| V3        | consola | Vídeo por WHEP a través de la API                      | 503 que nombra `GO2RTC_URL` (sin puente en el ensayo) | —      | «V3 · la vista en vivo…» |
| V4        | consola | Apertura remota con motivo, atribuida y persistida     | Abrió; orden a nombre del operador en `/ordenes`      | —      | «V4 · apertura remota…»  |
| V5        | consola | Negación con motivo, la puerta no se mueve             | Negada con motivo, sin apertura                       | —      | «V5 · negación…»         |
| V6        | consola | Otra copropiedad en cola, emergencia, facial NO APLICA | **PROCEDIMIENTO EN SITIO**                            | —      | KPI-35: `guardia.e2e`    |

### Comprobaciones adicionales (fuera de los 16, C-35)

| Escenario | Canal   | Esperado                                    | Obtenido                                                                         | Prueba                                   |
| --------- | ------- | ------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------- |
| L6        | app     | Vehículo PROPIO pasa a cualquier hora       | PERMITIDO a las 03:00                                                            | «L6 · un vehículo PROPIO…»               |
| L7        | consola | Inservible se niega; dudosa no abre sola    | 30 → `CONFIANZA_INSUFICIENTE`; 60 → sin apertura, abierta a mano por el operador | «L7 · baja confianza…»                   |
| T6        | ambos   | Revocar suprime la plantilla de la terminal | Probado aparte                                                                   | `biometria-pg`, `consentimiento-publico` |

---

## Lo que el ensayo destapó, y quedó corregido en esta sesión

Cada uno de estos defectos habría hecho fallar un escenario **en sitio**:

| ID                   | Qué pasaba                                                                                                                                       | Consecuencia en sitio                                                          | Corrección                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **H-15I-07**         | Toda lectura de placa **con foto** fallaba al guardarse en PostgreSQL: se insertaba la ruta de la foto en `eventos.evidencia_id`, que es un UUID | **Ningún acceso por placa quedaba registrado** (RN-02) y L1–L7 fallaban        | La foto se registra en `evidencias` (SHA-256 y tamaño) y el evento lleva su id. La URL firmada resuelve la ruta |
| **H-15I-09**         | Una lectura **dudosa** (entre la mitad del umbral y el umbral) abría la barrera sola                                                             | CU-01 3a violado: una placa sucia abría                                        | El ingestor ya no acciona con `requiereConfirmacionHumana`. La apertura la hace la portería con motivo          |
| **Visitas a pie**    | `app.normalizar_placa(NULL)` devuelve `''`, que viola la restricción de placa normalizada                                                        | Toda visita sin vehículo desde la app se rechazaba como «placa duplicada»      | Se guarda `NULL`                                                                                                |
| **H-15I-08**         | Un número de empleado que no es UUID reventaba la consulta de identidad                                                                          | La terminal se quedaba sin veredicto con personas dadas de alta a mano         | Se trata como desconocido: se niega y se registra                                                               |
| **H-15I-10**         | La app suprimía la plantilla a las 24 h de la CAPTURA                                                                                            | En una visita de mañana, la plantilla vencía antes de que llegara el visitante | Se suprime al terminar la visita (RN-11)                                                                        |
| **Lista negra**      | No había ruta ni pantalla para vetar                                                                                                             | L5 y T5 imposibles desde la consola                                            | Rutas `listas-negras` y pantalla «Listas negras» (HU-35, RN-07)                                                 |
| **Cámara de la app** | La app enviaba 128 bytes aleatorios en vez de una foto                                                                                           | El hito 3 (foto desde la app → terminal) era imposible                         | Cámara real del teléfono, con las medidas de calidad de la consola                                              |

## Lo que queda reportado sin corregir

- ~~**H-15I-05 · el patrón de recurrencia se evalúa en UTC.**~~ **CERRADO en la
  ETAPA 15-J** ([informe](../etapas/ETAPA-15-J-patron-en-hora-local.md)): las
  dos lecturas del repositorio toman el desplazamiento de
  `copropiedades.zona_horaria` en el instante del reloj, sin migración; lo
  prueba `apps/api/test/patron-en-hora-local-pg.test.ts` contra PostgreSQL
  real. La recurrente desde la app **sigue fallando cerrada** (H-15I-06), ahora
  por otro motivo: su adaptador no escribe las filas del patrón (H-15J-01).
  Texto original: La persistencia de
  autorizaciones guarda la franja de un patrón semanal en hora local, sin su
  desplazamiento, y la relee como UTC. En Bogotá, una franja de 14:00 a 18:00
  se evaluaría de 09:00 a 13:00. **No afecta a ninguno de los 16 escenarios**,
  porque las visitas de día y franja son de un solo día, sin patrón. Está en
  la persistencia, que este encargo no deja tocar, así que se reporta con su
  parche en el informe de la etapa. Mientras tanto, la recurrente desde la app
  **falla cerrada** con un mensaje (H-15I-06).
