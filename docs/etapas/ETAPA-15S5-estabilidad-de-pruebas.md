# RONDA 15-S5 · Estabilidad de la suite y del verificador

**Rama:** `etapa-15s5-estabilidad-de-pruebas` · **Base:** `develop` (`e2507bc`, merge del PR #55) ·
**PR:** hacia `develop`, sin fusionar · **Fecha:** 2026-10-10 ·
**Encargo:** RONDA 15-S5, tareas 1 a 7 y la declaración de la visita del 09/10 ·
**Cierra:** DT-15M-C01 · DT-15M-C02 · DT-15S2-10 · DT-15S2-11 · H-15S4-01 · la carrera de paridad del PR #54 ·
**Deja abierta con evidencia:** DT-15X-07 · **Abre:** H-15S5-01 a H-15S5-06 · DT-15S5-01 a DT-15S5-06 · S-15S5-01

> **No toca producto.** Sólo pruebas (`apps/api/test`), guiones del verificador
> (`scripts/verificar-etapa.sh` y `scripts/lib/`) y documentación. La
> integración con los equipos sigue congelada: ningún adaptador, ningún
> `scripts/sitio-*.mjs`. **La ETAPA 15 sigue BLOQUEADA sólo por `BE-02`.**

**Lo incómodo primero.**

1. **El inventario de la 15-M estaba incompleto.** Los once ficheros de
   DT-15M-C01 eran de 38. Hoy hay 57 ficheros contra la base, y al repasarlos
   salieron otros seis con la misma enfermedad.
   - Uno más, `visitas-pg` 3i, no lo vio nadie leyendo código. Apareció cuando
     encendí **todas** las interferencias a la vez sobre una base envejecida.
   - Leer el código no basta para encontrarlas. Hay que provocarlas, y por eso
     las interferencias quedan en el repositorio y no en este informe
     (`apps/api/test/interferencia.ts`).
2. **Varias pruebas cambian de copropiedad, y lo digo antes de que se note en
   el diff.**
   - Se mudan a una copropiedad u hogar PROPIOS: las de generación del padrón,
     autorizaciones de consola, baja de residente, órdenes manuales y el
     bloque 3i de visitas.
   - Las aserciones son las mismas o más estrictas. En §2 escribo, prueba por
     prueba, qué garantizaba antes y qué garantiza ahora.
   - Lo que pierden es «funciona en COP_A con su historia encima». Eso nunca
     fue lo que afirmaban, y era justo lo que las hacía depender del orden de
     los ficheros.
3. **Dos guiones que esta ronda no puede tocar pueden dar un fallo FALSO del
   verificador en macOS.**
   - `sitio-ensayo.mjs` escribe 16 418 B y termina con `process.exit`. El paso
     12f busca su `VEREDICTO` en el texto, y el búfer de una tubería en macOS
     es de 16 KB.
   - `puesta-en-marcha-equipos.mjs` escribe 18 903 B y alimenta la sonda 38b.
   - En Linux llegan enteros: medido con lector lento.
   - Quedan como DT-15S5-01 y DT-15S5-02. Corregirlos es una línea cada uno,
     pero los dos están congelados o fuera de los ficheros permitidos.
4. **DT-15X-07 no se reprodujo.**
   - Se intentaron 140 pasadas de `equipos.e2e`, varias a la vez y
     con carga, sin un solo «socket hang up».
   - Sí encontré y medí un mecanismo que da exactamente ese mensaje con esta
     pila: el agente HTTP de Node 22 conserva la conexión y el servidor se
     reabre en el mismo puerto. Falla 300 de 300.
   - No puedo afirmar que sea la causa: en `equipos.e2e` la ventana para que
     ocurra no existe en la práctica (§2, T7). No lo llamo intermitente: queda
     abierta, con lo probado.
5. **Hay un choque entre dos reglas del encargo, y lo resolví así.**
   - La regla 4 manda las sondas a `pruebas-negativas.mjs`. La regla 2 prohíbe
     que crezca un fichero de más de 300 líneas, y ese tiene 3911.
   - Las sondas nuevas viven en `scripts/lib/sondas/`, invocadas desde la suite
     con su ruta literal, que es donde `controles-sin-prueba-negativa.mjs` la
     busca. Moví allí también la sonda 7 tal cual.
   - La suite **baja de 3911 a 3652 líneas**.
6. **La primera corrida del verificador salió FALLIDA, y no por una prueba.**
   - El paso 9 —el banco negativo bajo la cobertura de V8— superó su límite
     de 600 s y lo mataron; detrás cayó el trinquete de ramas, que se queda
     sin la cobertura del banco muerto. Y una prueba de la T2 importaba de
     `base-exigida.ts` sin registrar el guardián.
   - El banco tardaba 722 s con cobertura y 381 s sin ella: diez
     compilaciones con `tsc` escribían una cobertura que nadie mide
     (H-15S5-05). Corregido en un commit propio; ahora, 441 s.
   - Las tres corridas que cuentan son las de después (§6).

---

## 1 · Qué se construyó

Una suite que deja de depender del orden de sus ficheros y de la edad de la
base, y un verificador que nombra lo que cae y no pierde lo que escribe.

- **T1 · La paridad nube ↔ Edge** compara sólo las plantillas que siembra. La
  carrera del PR #54 se reprodujo antes de corregirla con una plantilla
  «ajena» revocada en el instante exacto, y esa interferencia queda dentro de
  la prueba.
- **T2 · El inventario de DT-15M-C01.**
  - Cada prueba que dependía de COP_A compartida o de la historia de la base
    trae ahora su interferencia determinista, en su ventana.
  - Las que fallaron con ella están corregidas; las demás, registradas con su
    riesgo.
  - La suite entera de la API sale en verde de las dos formas: con todas las
    interferencias encendidas sobre una base envejecida, y sobre una base
    recreada.
- **T3 · El paso 14** cuenta por pasada los ficheros recogidos, ejecutados,
  omitidos y caídos.
  - Nombra el que cae fuera de sus aserciones, con el motivo de vitest.
  - Nombra el que falta frente a otra pasada y el paquete cuyo informe no se
    escribió.
  - Cada pasada guarda sus informes en `estabilidad/pasada-N/`.
- **T4 · `verificar-base-de-pruebas.mjs`** rechaza al principio una base con
  menos conexiones de las que la suite necesita. El mínimo lo lee de
  `base-de-pruebas.sh` y el remedio va en una línea.
- **T5 · Auditoría de los 125 `process.exit(`** de `scripts/`. Las 20 salidas
  en riesgo de `scripts/lib` pasan a `process.exitCode`, y hay una sonda de
  lector lento por clase de guion.
- **T6 · `metricas.mjs`** ya no lee el informe de una corrida anterior.
- **T7 · `equipos.e2e` bajo carga:** no reproducido; lo probado queda escrito.
- **La declaración del usuario del 2026-10-10** sobre la visita del 09/10,
  registrada en `ESTADO_ETAPAS.md` (ficha de la ETAPA 15 y BE-02) y en
  `VALIDACION_HIKVISION_EN_SITIO.md` §10.

## 2 · Cómo se organizó y por qué

### T1 · La carrera de paridad (PR #54)

**Qué pasaba.** El Edge decide con una instantánea tomada en el `beforeAll`, y
la nube lee la base en vivo. `biometria-pg` revocaba a la vez el
consentimiento de una plantilla de COP_A. Si caía entre la instantánea y la
lectura de la nube, el Edge permitía y la nube negaba con
`SIN_CONSENTIMIENTO`: el mismo motor con datos distintos.

**Reproducción determinista.**

- La primera versión NO falló: la plantilla ajena era de una persona sin
  autorización, y los dos lados la negaban igual.
- La que falla siembra la ajena como residente PERMITIDO y la revoca
  exactamente en esa ventana.
- Falló dos de dos veces, con la firma del CI: `permitido: true` frente a
  `motivo: SIN_CONSENTIMIENTO, regla: politica.consentimiento`.

**Corrección.**

- Se comparan sólo las cinco plantillas propias: el rostro reconocible, los
  tres residentes y una nueva revocada ANTES de la instantánea.
- Se exige que la ajena SÍ esté en la instantánea. La interferencia queda viva:
  volver a «todas» rompe la prueba siempre.
- La siembra sale a `siembra-de-rostros.ts`, porque el fichero estaba en 299
  líneas.

**Antes y después.**

- Antes: «misma decisión en cada plantilla de la instantánea», que incluía las
  que hubieran dejado otros ficheros, según el orden.
- Ahora: lo mismo sobre un conjunto fijo y propio que cubre permitido,
  pendiente, revocado y lista negra, más la garantía de que la ventana de
  carrera se ejerce.

### T2 · DT-15M-C01: una interferencia por dependencia

**El mecanismo.**

- `apps/api/test/interferencia.ts` define interferencias con nombre. Apagadas
  no hacen nada; `NCR_INTERFERENCIA=<nombre>[,…]|todas` las enciende.
- Las que dejan huella permanente se encienden a petición: una copropiedad más,
  órdenes fechadas en 2099, 300 autorizaciones que empiezan mañana. Esa huella
  es la que dejarían decenas de corridas sin recrear la base, que es el estado
  que la suite tiene que aguantar.
- Las que no dejan huella van fijas en su prueba: la plantilla ajena de la T1 y
  la que vence en 90 minutos en `biometria-pg`.

**El patrón de corrección** es siempre el mismo: la prueba depende sólo de lo
que siembra. Unas veces se acota la comparación a lo propio; otras, la prueba
vive en una copropiedad u hogar propios; otras, la fuente que ensuciaba deja
de hacerlo.

| Fichero                                                                                                | Dependencia                                                                                                                                            | Interferencia                                                          | ¿Fallaba con ella?                                                                                                       | Corrección                                                                                                             |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `copropiedades-pg` L74, L122                                                                           | La lista global de copropiedades igual a una segunda lectura                                                                                           | `copropiedad-nueva`: un alta entre las dos lecturas                    | **Sí**, 2 de 4: «expected […(2)] to deeply equal […(3)]»                                                                 | `antes ⊆ vista ⊆ después`, sin repetidas                                                                               |
| `porteros-por-identificador-pg` L255                                                                   | Número de pool `b = a + 1` entre dos altas                                                                                                             | `copropiedad-nueva` entre las dos altas                                | **Sí**: «expected 15 to be 14»                                                                                           | `b > a` y ningún número perdido; las consultas a `consultas-de-porteros-pg.ts` (547 → 535 líneas)                      |
| `generacion-padron` L133                                                                               | La fila `generacion_de_padron` MÁS RECIENTE de COP_A                                                                                                   | `padron-generado`: otra generación, con otro plan, antes de leer       | **Sí**: «expected 'Sin agrupaciones, 3 viviendas' to match /3 agrupaciones/»                                             | Copropiedad propia de la corrida                                                                                       |
| `persistencia-operativa-pg` L261                                                                       | Su orden entre «las últimas 20» de COP_A                                                                                                               | `ordenes-futuras`: 20 órdenes de COP_A fechadas en 2099                | **Sí**: «expected undefined to be 'Visitante confirmado…'»                                                               | El bloque, a `ordenes-manuales-pg.test.ts` en una copropiedad propia; el DELETE exige filas propias (360 → 308 líneas) |
| `ensayo-en-sitio-pg` L615 (V4)                                                                         | Su orden entre «las últimas 20» de `/guardia/ordenes`                                                                                                  | La base con 61 órdenes de COP_A en 2099                                | **Sí**: «expected undefined to be '…0012'» («orden sin persistir»)                                                       | `horaDeLaOrden` (631 → 628)                                                                                            |
| `salidas-del-videoportero-pg` L159                                                                     | La FUENTE: fechaba su orden en 2099, en COP_A, para verse entre sus 200                                                                                | —                                                                      | —                                                                                                                        | `horaDeLaOrden`: en una base limpia ya no escribe en el futuro                                                         |
| `autorizaciones-pg` L182                                                                               | Su autorización entre las 300 activas de inicio más reciente                                                                                           | `autorizaciones-futuras`: 300 activas que empiezan mañana              | **Sí**: «expected undefined to be true»                                                                                  | Copropiedad propia, con su vivienda, su titular y su visitante                                                         |
| `biometria-pg` L347 (fuente); `visitas-pg` F3/R1 y `verificacion-remota-armada-pg` L278-282 (víctimas) | El barrido de la prueba suprime TODO lo vencido de COP_A con el reloj dos horas por delante                                                            | Una plantilla «de otro fichero» que vence en 90 min, fija en la prueba | **Sí**: «expected 'suprimida' to be 'activa'»                                                                            | El barrido de la prueba sólo ve sus capturas (`soloLasPropias`); `TerminalEspia` a `dobles/` (366 → 361)               |
| `edge-en-sitio-pg.e2e` L150, L192                                                                      | La visita `ABC9999` de la semilla, que vale 8 h, cuenta como apertura                                                                                  | `semilla-vieja`: esa visita, vencida                                   | **Sí**: «expected 12 to be 15», la firma de macOS                                                                        | Visita vigente con placa propia (D-134)                                                                                |
| `edge-misma-decision-pg.e2e`, casos de placa                                                           | El caso «visita vigente» es `ABC9999`                                                                                                                  | `semilla-vieja`                                                        | **No fallaba, y ése era el problema**: los dos lados negaban igual. Con «la visita PERMITE»: «expected false to be true» | Visita propia y la aserción nueva                                                                                      |
| `baja-de-residente-pg` L121                                                                            | Entra con el código corto de COP_A, que `residentes-y-vehiculos-pg` cambia                                                                             | `codigo-de-a`: el código cambia justo después de leerlo                | **Sí**: 401 «Usuario, código o contraseña incorrectos»                                                                   | Copropiedad propia, con su código                                                                                      |
| `edge-instantanea-pg.e2e` L95, L107                                                                    | «Sin cambios» con la misma versión                                                                                                                     | `regla-nueva`: un veto entre las dos descargas                         | **No** (corregida en la 15-S1). Sin su reintento, la misma interferencia la pone roja                                    | —                                                                                                                      |
| `titular-por-administracion-pg` L35, L62                                                               | La búsqueda por subcadena devuelve EXACTAMENTE la suya                                                                                                 | `vivienda-parecida`: otra vivienda «XT…»                               | **Sí**: «expected […(2)] to deeply equal [Array(1)]»                                                                     | Contiene / no contiene, y cada fila coincide                                                                           |
| `autorregistro.e2e` L180                                                                               | TODA fila histórica de El Roble con la forma `ip:<hmac>`                                                                                               | `fallo-sin-ip`: una fila «ip:desconocida»                              | **Sí**: «expected 'ip:desconocida' to match …»                                                                           | Sólo las de estos intentos                                                                                             |
| `rostro-del-residente-pg` L179, L225                                                                   | La espera cuenta sesiones paradas por el texto del SQL, en todo el clúster                                                                             | `sesion-ajena-parada`: dos sesiones ajenas paradas con ese SQL         | **No** en el 201/409; **sí** en lo que dice probar: «las dos peticiones esperaban: expected 0 to be ≥ 2»                 | Sesiones detrás del cerrojo de la prueba (`pg_blocking_pids`, recursivo)                                               |
| `modo-de-puerta-pg` L121-132                                                                           | Las APIs de los demás ficheros barren las puertas de todas las copropiedades cada 30 s con el reloj real                                               | `barrido-ajeno-de-puertas`: una API ajena barre con reloj real + 2 min | **Sí**: «expected undefined to be 'normal'»                                                                              | La orden se fecha mañana                                                                                               |
| `mis-visitas-revocacion.e2e` (montar)                                                                  | Cada corrida dejaba una terminal facial ACTIVA más en COP_A, y toda foto va a todas                                                                    | Historia: una corrida, de 1 a 2 terminales (medido)                    | No forzada: la caída por tiempo pediría ~2000 terminales                                                                 | `afterAll` da de baja su terminal: 2 → 2                                                                               |
| `visitas-pg` 3i L651, L667 — **hallada** con todas encendidas                                          | La app del residente de la semilla (C-42) lista las 200 autorizaciones de SU vivienda de inicio más reciente, y C-42 acumula las de todas las corridas | `autorizaciones-futuras`                                               | **Sí**: «expected undefined to match object { situacion: 'vigente' }» y 'rechazada'                                      | Hogar propio (titular con nivel «completo»); los dobles a `dobles/visitas-con-foto.ts` (692 → 667)                     |

**Qué garantizaba cada prueba cambiada, antes y después (igual o más).**

- `copropiedades-pg`
  - Antes: «vista = todas», en dos lecturas distintas.
  - Ahora: `antes ⊆ vista ⊆ después` y sin repetidas.
  - Las copropiedades no se borran (`tg_prohibir_delete`): es la misma
    propiedad, sin la carrera.
- `porteros-por-identificador-pg`
  - Antes: `b = a + 1`.
  - Ahora: `b > a` y cada número de en medio es el pool de otra copropiedad
    que existe.
  - Sin nadie en medio equivale a `b = a + 1`. Un número perdido por la
    secuencia sigue fallando: probado con un `nextval` sin alta, da «huecos: 1».
- `generacion-padron`, `autorizaciones-pg`, `baja-de-residente-pg` y las
  órdenes de `ordenes-manuales-pg`: las mismas aserciones, en una copropiedad
  sin vecinos.
  - En las órdenes hay además una garantía nueva. «El DELETE falla» exige antes
    que HAYA filas que borrar: el disparador es por fila, y sobre una tabla
    vacía el DELETE «pasaba» sin probar nada.
  - Esa prueba dependía de que la anterior hubiera escrito en COP_A.
- `ensayo-en-sitio-pg` y `salidas-del-videoportero-pg`: lo mismo. La orden se
  fecha a la hora real, o un milisegundo después de la última si la
  copropiedad ya tiene órdenes posteriores (`horaDeLaOrden`).
- `biometria-pg`
  - Antes: «el barrido suprime lo vencido», con el barrido sobre TODA COP_A.
  - Ahora: igual, sobre lo que esta corrida captura (`soloLasPropias` filtra el
    resultado de la consulta REAL de `vencidas`).
  - Y una garantía nueva: la plantilla de otro fichero que vence en 90 minutos
    sale intacta.
- `edge-en-sitio-pg` y `edge-misma-decision-pg`
  - Antes: la visita de la semilla `ABC9999`, que vence a las ocho horas.
  - Ahora: una visita vigente propia (D-134).
  - En la paridad hay además una garantía nueva: «la visita PERMITE». Sin ella,
    con la base vieja los dos lados negaban igual y el caso «visita vigente»
    dejaba de probar lo que dice, en verde.
- `titular-por-administracion-pg`
  - Antes: `toEqual([la suya])` y `toEqual([])`.
  - Ahora: contiene / no contiene la suya, y **cada** fila devuelta coincide con
    la búsqueda, que es lo que la consulta promete.
  - «No hay otras» nunca fue la propiedad: la búsqueda es por subcadena sobre
    toda la copropiedad.
- `autorregistro.e2e`
  - Antes: TODA fila histórica de El Roble con la forma `ip:<hmac>`.
  - Ahora: las de estos intentos (≥ 2), cada una con la forma.
- `rostro-del-residente-pg`
  - Antes: 201/409 con dos peticiones que «se esperaba» que coincidieran.
  - Ahora: lo mismo, más la garantía de que las DOS esperaban detrás del
    cerrojo de la prueba al soltarlo.
  - La espera contaba sesiones por el texto del SQL en todo el clúster. Con dos
    sesiones ajenas paradas, salía antes y la prueba seguía en verde **sin
    ejercer la carrera** que dice probar.
- `modo-de-puerta-pg`: lo mismo, con la orden fechada mañana. Ninguna API de la
  suite la ve vencida con el reloj real.
- `mis-visitas-revocacion.e2e`: lo mismo, y da de baja su terminal al terminar.
- `visitas-pg` 3i: lo mismo, con un residente de hogar propio (nivel
  «completo»).

**Registradas, con su riesgo y su porqué (no se corrigen aquí):**

- **DT-15S5-03 · Baja.** `mis-visitas-revocacion.e2e` L189: la cola
  `porRetirar(COP_A)` la consumen también `visitas-pg` y `baja-de-residente-pg`.
  - Si otra API retira «nuestra» plantilla entre `guardar(suprimida)` y el
    bucle, el espía de esta prueba no la ve.
  - La ventana está DENTRO del caso de uso de producto: no hay costura de
    prueba donde colocar la interferencia sin tocar producto.
  - Corrección propuesta: la prueba en un hogar y una copropiedad propios.
- **DT-15S5-04 · Baja.** Colisiones por espacio pequeño:
  - `copropiedadPropia()` del banco del hogar usa `W` + 6 cifras contra un
    índice único global (10⁶);
  - el sufijo del banco sale de la hora (dos ficheros en el mismo milisegundo,
    1 de 10);
  - las placas de `vehiculos-propios-pg` son de 4 cifras, y sólo chocan tras
    una corrida interrumpida.
  - Corrección propuesta: sufijos de `randomBytes` y reintento ante 23505.
- **DT-15S5-05 · Baja.** Fechas de nacimiento escritas a mano para «menor»
  (`2012-03-01`, `2012-06-01`, `2015-08-2x`, `2016-04-09`). Empiezan a fallar
  en 2030. Corrección propuesta: relativas a hoy, como `rostro-de-menores-pg`.
- **S-15S5-01 · Supuesto.** `eventos` tiene particiones de −6 a +3 meses
  alrededor de la migración, sin partición por omisión. Una base de pruebas
  más vieja que esa ventana rechaza todo evento.
  - El verificador la recrea en el paso 12 y el CI parte de cero.
  - En producción lo cubre el procedimiento mensual de `CONEXION_SUPABASE.md`.
  - No es de una prueba concreta: es de la base.
- **Defendidas, y comprobadas con su interferencia o su razonamiento:**
  - `edge-instantanea-pg` ya estaba corregida en la 15-S1. Con la interferencia
    `regla-nueva` pasa; con el reintento de la 15-S1 quitado, la misma
    interferencia la pone roja.
  - Los «accesos por hora» de `tablero-pg` (≥ sobre una tabla de sólo
    inserción) quedan con un riesgo de frontera de medianoche.
  - `persistencia-operativa-pg` (> 0 sobre sus caídas), `eventos-pg` y el resto
    de `biometria-pg`.

**La corrida que lo demuestra todo junto.** La suite entera de la API, con
`NCR_INTERFERENCIA=todas`, sobre la base que dejaron todas las pruebas de esta
tarea:

- 2543 en verde y 13 omitidas en 4 ficheros: los dos de go2rtc real
  (`*.real.test.ts`), `arranque-en-frio.e2e` (lo ejerce el paso 12b) y
  `vista-en-vivo-extremo-a-extremo.e2e`. Son las mismas que sin
  interferencias; con `--con-base` el verificador declara las suyas.
- Después, con la base recreada y sin interferencias: 2543 en verde.
- La primera corrida con todas dio 2 rojas (3i de `visitas-pg`): es la fila que
  falta del inventario de la 15-M.

### T3 · DT-15S2-10: el paso 14 nombra el fichero que cae

**Medido con vitest 3.2.7.**

- **`beforeAll` que lanza o fichero que no carga:** el informe lo trae
  `failed`, con `message`, y NINGUNA aserción en rojo (`skipped` o ninguna).
  El paso decía «el código de salida viene de fuera de las pruebas».
- **El proceso del fichero muere (SIGKILL):** vitest cae entero con «Channel
  closed» y NO escribe el informe del paquete.
- **Un fichero que desaparece de una pasada** con el mismo código pasaba por
  estable.

**Lo nuevo** (`scripts/lib/ficheros-de-la-pasada.mjs`, 135 líneas):

- **Archivo por pasada.** Cada pasada archiva sus informes en
  `.informes-de-prueba/estabilidad/pasada-N/`, en vez de borrarlos al empezar
  la siguiente. Los informes sueltos de antes, por ejemplo los del paso 7, se
  retiran antes de la primera.
- **Recuento por pasada:** ficheros recogidos, ejecutados (al menos una
  aserción corrida), omitidos (todas omitidas sin motivo, un `skipIf`) y
  caídos.
- **Faltas con nombre**, hasta ocho y «… y N más»:
  - `caído: paquete › fichero → motivo de vitest`;
  - `falta: …` frente a otra pasada;
  - `sin informe: paquete — vitest murió antes de escribirlo → <primera línea
de error de la consola>`.

**Las sondas** (`scripts/lib/sondas/ficheros-caidos.mjs`): tres pasadas de una
suite falsa de diez ficheros. Contra el control anterior **fallan las seis**;
contra el nuevo pasan:

- un `beforeAll` que lanza;
- uno caído sin motivo;
- el recuento por pasada;
- los informes que no se pisan;
- nueve ficheros que desaparecen con el mismo código;
- un paquete que muere sin informe;
- y un informe suelto de antes que no se cuela en la primera pasada.

### T4 · H-15S4-01: la base mal arrancada falla al principio

- `verificar-base-de-pruebas.mjs` pregunta `SHOW max_connections` justo después
  de conectar, antes del esquema y las semillas, y lo compara con
  `CONEXIONES_MINIMAS` leído de `scripts/base-de-pruebas.sh`. Si no puede
  leerlo, falla: no se inventa un mínimo.
- El FALLO es una sola línea: «… admite 100 conexiones y la suite necesita 200
  (KPI-03 abre cien a la vez): arránquela con scripts/base-de-pruebas.sh».
- La sonda va dentro de la (c bis), que ya levantaba a propósito un clúster a 100.
  - Con el control anterior, el mensaje no nombraba las conexiones: hablaba
    del esquema.
  - Con el nuevo, sí.
  - Tras el reinicio de `base-de-pruebas.sh`, las conexiones dejan de ser la
    queja.

### T5 · DT-15S2-11: la auditoría de `process.exit`

**Medido en este Linux con Node 22.** `process.exit` tira lo que quedaba en
cola:

- **Pipe de bash (`$( )`):** se pierde por encima de ~64 KB si el lector va
  lento, e incluso con uno rápido llegan 465 KB de 1 MB.
- **Socket de un `spawn` de Node:** se pierde por encima de ~27 KB.
- **8 KB o menos:** llega siempre.
- **macOS**, que es el entorno objetivo y el del `verificador-con-base` del CI:
  las tuberías empiezan con 16 KB.

**Clasificación** (125 llamadas en 53 guiones, cada una con quién lee y cuánto
puede haberse escrito antes):

| Clase                                                                                                                                       | Guiones                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Riesgo                                                                   | Qué se hizo                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Controles de hallazgos: listan un hallazgo por línea, sin tope, y salen con 1. Los lee el verificador por `$( )`, el CI y la suite negativa | `cliente-dart-desfasado` (hasta ~70 KB), `contrato-tipado` (~42–90 KB), `frontera-hardware`, `frontera-modulos` (~50 KB), `entorno-declarado` (~21 KB), `coherencia-estado-etapas` (8–16 KB hoy; la línea de etapas cerradas ya mide 8 KB), `esquemas-unicos`, `flutter-sin-secretos`, `frontera-csp`, `frontera-extensibilidad`, `frontera-tema`, `inyeccion-explicita` (~60 KB), `longitud-por-campo` (~22 KB), `omisiones-sin-base` (85–100 KB con la base caída), `portabilidad` | **EN RIESGO**                                                            | `process.exitCode` y el resto en un `else`, el patrón de `metricas.mjs`. En `cliente-dart-desfasado`, de paso, el `finally` vuelve a borrar el banco (con `exit` quedaba en `$TMPDIR`) |
| Resúmenes de suite                                                                                                                          | `pruebas-negativas` (70–150 KB al fallar; es lo primero que se pierde: sus ✗ y su resumen), `estabilidad` («solo en la k» sin tope), `recuentos-coherentes` (las dos salidas con lista, 50–150 KB en el caso D-112)                                                                                                                                                                                                                                                                  | **EN RIESGO**                                                            | Igual. En `recuentos`, la rama `--saltadas` se reordena sin `exit`                                                                                                                     |
| Guiones de sitio fuera de lo permitido                                                                                                      | `sitio-ensayo` (16 418 B; el paso 12f lee su `VEREDICTO` por TEXTO), `puesta-en-marcha-equipos` (18 903 B; la sonda 38b lee un mensaje)                                                                                                                                                                                                                                                                                                                                              | **EN RIESGO en macOS**. En Linux llegan enteros, medido con lector lento | **No se tocan** (congelado / fuera de la lista): DT-15S5-01 y DT-15S5-02                                                                                                               |
| Salida acotada o sólo para una persona en una terminal                                                                                      | Los 33 restantes. Entre ellos `metricas` (ya corregido en la 15-S2), `escanear-secretos` (tope de 20), `verificar-*`, `contar-pruebas`, `con-limite` (hereda la salida del hijo), `go2rtc-para-pruebas`, `listar-copropiedades`, `probar-barrera`, `registrar-copropiedad`, `rotar-llave-de-equipos`, `sitio-audio`, `sitio-edge` y `sitio-video`                                                                                                                                    | **Sin riesgo**                                                           | Ninguno                                                                                                                                                                                |

**Una sonda de lector lento por clase** (`scripts/lib/sondas/lector-lento-por-clase.mjs`):

- **Controles de hallazgos.** Representante: `inyeccion-explicita` con un árbol
  de 600 parámetros sin `@Inject`. Con el guion anterior llegan 32 017 B de
  115 936; con el nuevo, enteros y con su última línea.
- **Resúmenes de suite.** Representante: `estabilidad` con 600 rojas en una
  pasada. Con el anterior llegan 20 617 de 48 020; con el nuevo, enteros.
- `lector-lento.mjs` admite `conError`: los hallazgos van por stderr.
- La tercera clase no lleva sonda: no se puede corregir aquí, y sobre Linux
  pasaría igual. Su medida queda en DT-15S5-01 y -02.

### T6 · DT-15M-C02: el informe viejo

`metricas.mjs` borra `<paquete>.json` antes de correr; sólo cuenta el que
escriba esta corrida. Y no crece: sale la asignación redundante de
`codigoSalida`.

La sonda (`sondas/informe-viejo.mjs`) planta un informe viejo con una roja de
nombre inconfundible y corre `metricas` con un `pnpm` falso delante en el
`PATH`, que muere sin escribir informe (H-15S5-06):

- con el control anterior: «SUITE EN ROJO · ✗ roja de OTRA corrida»;
- con el nuevo: «CORRIDA INTERRUMPIDA · … sin informe JSON», sin nombrarla.

### T7 · DT-15X-07: `equipos.e2e` bajo carga

**Las pasadas:** 140 de `equipos.e2e`, cada una en su proceso de vitest, contra la API
de la rama.

- **60 de seis en seis**, sobre 4 núcleos con carga ~10.
- **80 de ocho en ocho.**
- **Resultado:** 135 en verde y **ningún «socket hang up» ni `ECONNRESET`**.
- **Las cinco rojas** son todas de una ronda en la que corría a la vez el banco
  negativo (carga 15, H-15S5-04):
  - tres por el plazo de 5 s de la primera prueba, que arranca la app DENTRO de
    la prueba;
  - dos porque vitest no cargó un módulo a tiempo («Timeout calling fetch»).

**El mecanismo que sí da «socket hang up»,** medido aparte
(`node:http`, el agente global de Node 22 con `keepAlive: true`):

- Se cierra un servidor y se reabre en el MISMO puerto antes de que el cliente
  procese el cierre: el agente reutiliza la conexión muerta y la petición
  falla con `ECONNRESET socket hang up`, **300 de 300**.
- Con una vuelta del bucle de eventos en medio, 300 de 300. Con diez, 0 de 300.
  Con 5 ms, 1 de 300.

**Por qué no lo doy por causa.**

- `crearApp` ya deja el servidor escuchando una sola vez (la corrección del
  2026-09-08): `supertest` no abre ni cierra nada por petición.
- En `equipos.e2e` la única ventana es ENTRE pruebas: el `afterEach` cierra la
  app y la siguiente arranca en un puerto efímero nuevo. En medio hay cientos
  de vueltas (compilar el módulo de Nest, firmar el token).
- Para que pase haría falta el mismo puerto y menos de diez vueltas.

**Queda abierta, con esto escrito.** Si vuelve a salir, el registro tiene que
decir en qué prueba y con qué puerto: eso confirmaría o descartaría este
mecanismo.

## 3 · Árbol de archivos

**Nuevos (todos ≤ 300 líneas):**

```
apps/api/test/
├─ interferencia.ts                 153  las interferencias con nombre (NCR_INTERFERENCIA) y sus acciones
├─ siembra-de-rostros.ts            135  la siembra de la paridad de rostros (T1), fuera del fichero de 299
├─ hora-de-la-orden.ts               25  la hora de una orden que la prueba busca entre «las últimas N»
├─ visita-de-la-corrida.ts           39  una visita vigente con placa propia (D-134) y un Pool de un uso
├─ consultas-de-porteros-pg.ts       40  las lecturas de porteros-por-identificador, y «sin huecos»
├─ ordenes-manuales-pg.test.ts       94  las órdenes manuales, en copropiedad propia (antes en persistencia-operativa)
└─ dobles/
   ├─ plantillas-de-la-corrida.ts    73  TerminalEspia, soloLasPropias y la plantilla ajena que vence
   └─ visitas-con-foto.ts            79  los dobles de visitas-pg y el hogar propio del bloque 3i
scripts/lib/
├─ ficheros-de-la-pasada.mjs        135  archivo por pasada; recogidos, ejecutados, omitidos y caídos
└─ sondas/
   ├─ estabilidad.mjs               274  la sonda 7, movida tal cual desde pruebas-negativas.mjs
   ├─ ficheros-caidos.mjs           182  T3: el fichero que cae fuera de sus aserciones sale nombrado
   ├─ base-corta.mjs                 54  T4: la base a 100 conexiones falla al principio
   ├─ lector-lento-por-clase.mjs    103  T5: un lector lento por clase de guion
   └─ informe-viejo.mjs              72  T6: un informe viejo no se lee como de esta corrida
docs/etapas/ETAPA-15S5-estabilidad-de-pruebas.md     este informe
```

**Modificados** (líneas antes → después; ninguno de más de 300 crece):

| Fichero                                                                                                  | Líneas                      | Qué                                                                                                           |
| -------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `apps/api/test/edge-misma-decision-pg.e2e.test.ts`                                                       | 299 → 257                   | T1; visita propia y «la visita permite» (T2)                                                                  |
| `apps/api/test/copropiedades-pg.test.ts`                                                                 | 128 → 157                   | `antes ⊆ vista ⊆ después`                                                                                     |
| `apps/api/test/porteros-por-identificador-pg.test.ts`                                                    | 547 → 535                   | `b > a` sin huecos; consultas fuera                                                                           |
| `apps/api/test/generacion-padron.test.ts`                                                                | 177 → 192                   | Copropiedad propia                                                                                            |
| `apps/api/test/persistencia-operativa-pg.test.ts`                                                        | 360 → 308                   | Sin el bloque de órdenes                                                                                      |
| `apps/api/test/ensayo-en-sitio-pg.test.ts`                                                               | 631 → 628                   | `horaDeLaOrden`                                                                                               |
| `apps/api/test/salidas-del-videoportero-pg.test.ts`                                                      | 187 → 188                   | `horaDeLaOrden` en vez de 2099                                                                                |
| `apps/api/test/autorizaciones-pg.test.ts`                                                                | 214 → 240                   | Copropiedad propia con su hogar                                                                               |
| `apps/api/test/biometria-pg.test.ts`                                                                     | 366 → 361                   | El barrido ve sólo lo suyo; la ajena intacta                                                                  |
| `apps/api/test/edge-en-sitio-pg.e2e.test.ts`                                                             | 201 → 208                   | Visita propia                                                                                                 |
| `apps/api/test/edge-instantanea-pg.e2e.test.ts`                                                          | 221 → 230                   | La interferencia `regla-nueva`                                                                                |
| `apps/api/test/baja-de-residente-pg.test.ts`                                                             | 232 → 249                   | Copropiedad propia con su código                                                                              |
| `apps/api/test/titular-por-administracion-pg.test.ts`                                                    | 208 → 222                   | Contiene, y cada fila coincide                                                                                |
| `apps/api/test/autorregistro.e2e.test.ts`                                                                | 225 → 237                   | Sólo las filas de estos intentos                                                                              |
| `apps/api/test/rostro-del-residente-pg.test.ts`                                                          | 251 → 272                   | La espera, detrás del cerrojo propio                                                                          |
| `apps/api/test/modo-de-puerta-pg.test.ts`                                                                | 137 → 164                   | La orden, mañana                                                                                              |
| `apps/api/test/mis-visitas-revocacion.e2e.test.ts`                                                       | 219 → 227                   | Baja de su terminal                                                                                           |
| `apps/api/test/visitas-pg.test.ts`                                                                       | 692 → 667                   | Hogar propio en 3i; dobles fuera                                                                              |
| `scripts/lib/estabilidad.mjs`                                                                            | 244 → 265                   | T3 y T5                                                                                                       |
| `scripts/lib/verificar-base-de-pruebas.mjs`                                                              | 130 → 169                   | T4                                                                                                            |
| `scripts/lib/metricas.mjs`                                                                               | 532 → 532                   | T6                                                                                                            |
| `scripts/lib/lector-lento.mjs`                                                                           | 62 → 67                     | `conError`                                                                                                    |
| `scripts/lib/pruebas-negativas.mjs`                                                                      | 3911 → 3652                 | Sonda 7 a `sondas/`; las nuevas, invocadas con su ruta literal; `tsc` y la sonda 35 sin cobertura (H-15S5-05) |
| `scripts/lib/ramas-de-los-controles.json`                                                                | 43 → 44                     | `ficheros-de-la-pasada.mjs: 0`                                                                                |
| `scripts/verificar-etapa.sh`                                                                             | 1295 → 1295                 | El paso 14 enseña las líneas «pasada»                                                                         |
| 19 guiones de `scripts/lib` (T5)                                                                         | ninguno de más de 300 crece | `process.exitCode` y `else`                                                                                   |
| `docs/ESTADO_ETAPAS.md`, `docs/guias/VALIDACION_HIKVISION_EN_SITIO.md`, `docs/guias/ENTREGA_EN_SITIO.md` | —                           | La declaración del 09/10; cabecera y ficha                                                                    |
| `docs/auditoria/contradicciones-y-supuestos.md`                                                          | —                           | S-15S5-01 y S-15S5-02                                                                                         |
| `docs/etapas/ETAPA-15X-rostro-del-residente.md`                                                          | —                           | DT-15X-07: lo que se probó en la 15-S5                                                                        |

## 4 · Tabla SOLID

Para los ficheros nuevos y cambiados de código de pruebas y guiones. Los
documentos no aplican.

| Fichero                                                                                                  | S                                                                          | O                                                                          | L                                                                                                                 | I                                                   | D                                                                                                |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `interferencia.ts`                                                                                       | Sólo interferencias: encenderlas y lo que hace «otro fichero»              | Una interferencia nueva es una función nueva; las pruebas no cambian       | —                                                                                                                 | Cada prueba importa sólo la que usa                 | El `Pool` llega por parámetro                                                                    |
| `siembra-de-rostros.ts`, `visita-de-la-corrida.ts`, `hora-de-la-orden.ts`, `consultas-de-porteros-pg.ts` | Una siembra o consulta cada uno                                            | —                                                                          | —                                                                                                                 | Funciones sueltas, sin clase                        | `Pool` o URL por parámetro                                                                       |
| `dobles/plantillas-de-la-corrida.ts`                                                                     | El espía, el acotado y la ajena: lo que `biometria-pg` necesita de la base | `soloLasPropias` decora el repositorio sin tocarlo                         | `soloLasPropias` devuelve un `RepositorioPlantillas` real, con `vencidas` filtrado: sustituible donde el original | Sólo el puerto `RepositorioPlantillas`              | Recibe el repositorio, no lo construye                                                           |
| `dobles/visitas-con-foto.ts`                                                                             | Los dobles de las visitas con foto y el hogar propio                       | —                                                                          | `TerminalesSimuladas` cumple `FaceTemplateProvider`                                                               | Ídem                                                | `Pool` por parámetro                                                                             |
| `ordenes-manuales-pg.test.ts`                                                                            | Un bloque: las órdenes sobreviven a un reinicio                            | —                                                                          | —                                                                                                                 | —                                                   | —                                                                                                |
| `ficheros-de-la-pasada.mjs`                                                                              | Ficheros por pasada: archivar, leer y diagnosticar                         | `estabilidad.mjs` lo usa sin cambiar su comparación de firmas              | —                                                                                                                 | Seis funciones sueltas                              | Directorio y raíz por parámetro                                                                  |
| `pruebas-negativas.mjs`                                                                                  | La suite de sondas: esta ronda le quita la 7 y sólo invoca las nuevas      | Sondas nuevas en módulos nuevos, no en ella                                | —                                                                                                                 | —                                                   | El entorno de los procesos que nadie mide (`tsc`, el arranque de la 35), explícito en la llamada |
| `sondas/*.mjs`                                                                                           | Una tarea por fichero; la 7, tal cual                                      | Sondas nuevas en módulos nuevos; la suite sólo las invoca                  | —                                                                                                                 | Reciben `{ raiz, banco, correr, ok, mal, control }` | El control llega como literal desde la suite                                                     |
| `estabilidad.mjs`, `verificar-base-de-pruebas.mjs`, `metricas.mjs`, `lector-lento.mjs` y los 19 de la T5 | Sin cambio de responsabilidad                                              | `conError` es una opción con valor por omisión: quien no la pasa no cambia | —                                                                                                                 | —                                                   | `verificar-base-de-pruebas` lee el mínimo de su fuente; la ruta, por argumento                   |

## 5 · Trazabilidad

| Requisito                                                       | Cómo queda                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **§2.8.0** (un verde que no se reproduce no vale)               | Lo que la ronda ataca de raíz. Pruebas que ya no dependen del orden de los ficheros ni de la edad de la base (T1, T2). Un paso 14 que nombra el fichero que cae (T3). Un verificador que no pierde su propia salida (T5) ni lee informes viejos (T6)                                                               |
| **§2.3** (SRP: ≤ 300 líneas; un fichero de más de 300 no crece) | Ninguno crece. `pruebas-negativas` 3911 → 3650, `persistencia-operativa-pg` 360 → 308, `visitas-pg` 692 → 667, `porteros-…` 547 → 535, `ensayo-en-sitio-pg` 631 → 628, `biometria-pg` 366 → 361; `metricas`, `coherencia-estado-etapas`, `portabilidad` y `verificar-etapa.sh`, iguales. Todo fichero nuevo, ≤ 300 |
| **KPI-03** (100 inserciones simultáneas)                        | Protegido de antemano: una base con menos de 200 conexiones falla al principio (T4)                                                                                                                                                                                                                                |
| **RN-16** (la misma decisión en la nube y en el Edge)           | Su prueba deja de compararse con datos distintos (T1) y de dejar de probar la visita permitida con la base vieja (T2)                                                                                                                                                                                              |
| **RN-11** (supresión de lo vencido)                             | `biometria-pg` lo sigue probando, sin suprimir lo de otros ficheros (T2)                                                                                                                                                                                                                                           |
| **KPI-12** (la suite con MockProvider)                          | Ninguna aserción de producto cambia de sentido; los cambios de pruebas, en §2                                                                                                                                                                                                                                      |
| **ETAPA 15**                                                    | Sigue BLOQUEADA sólo por BE-02. Declaración del 09/10 registrada (ESTADO, VALIDACION §10)                                                                                                                                                                                                                          |

## 6 · Pruebas

**Cómo se ejecutan:**

- Todo: `./scripts/base-de-pruebas.sh` y después `./scripts/verificar-etapa.sh --con-base`.
- Las interferencias:
  `NCR_INTERFERENCIA=todas DATABASE_URL_PRUEBAS=… pnpm --filter @ncr/api test`,
  y después recree la base.

**Lo que se vio fallar antes de corregir** está en §2, tarea por tarea, con su
mensaje literal.

### Tres corridas seguidas de `./scripts/verificar-etapa.sh --con-base` (§2.8.0)

Base arrancada SÓLO con `scripts/base-de-pruebas.sh`, y recreada desde cero
entre la primera y la segunda.

**Corrida 1:** sobre `bd6dcdd`, con la base que dejaron las pruebas de la ronda (62 copropiedades), en 58 min 33 s → «VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe». 31 de 31 pasos, 96 ✓ y 0 ✗; 563 de 563 ficheros de prueba; 5648 pruebas de TypeScript y 508 de Dart; el banco negativo (35 controles) y el trinquete de ramas (45 controles medidos, 236 bloques sin ejercer) en verde; tres pasadas idénticas en el paso 14, 563 ficheros recogidos y ejecutados, 0 omitidos y 0 caídos en cada una. Dominio 96,41 %, aplicación 97,75 %, global 88,56 % de líneas.

**Corrida 2** (tras recrear la base desde cero): `./scripts/base-de-pruebas.sh parar`, el directorio de datos borrado, `./scripts/base-de-pruebas.sh arrancar` (un `initdb` nuevo, 0 tablas) y `./supabase/verificar.sh --con-pruebas --modo-supabase` (las 57 migraciones y la semilla: 2 copropiedades). Sobre `bd6dcdd`, en 56 min 45 s → «VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe». 31 de 31 pasos, 96 ✓ y 0 ✗; 563 de 563 ficheros de prueba; 5648 pruebas de TypeScript y 508 de Dart; el banco negativo (35 controles) y el trinquete de ramas (45 controles medidos, 236 bloques sin ejercer) en verde; tres pasadas idénticas en el paso 14, 563 ficheros recogidos y ejecutados, 0 omitidos y 0 caídos en cada una. El verificador vio la base recién hecha: «esquema presente · 2 copropiedad(es) sembrada(s)».

**Corrida 3:** sobre `bd6dcdd`, con la base que dejó la corrida 2 (60 copropiedades), en 58 min 22 s → «VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe». 31 de 31 pasos, 96 ✓ y 0 ✗; 563 de 563 ficheros de prueba; 5648 pruebas de TypeScript y 508 de Dart; el banco negativo (35 controles) y el trinquete de ramas (45 controles medidos, 236 bloques sin ejercer) en verde; tres pasadas idénticas en el paso 14, 563 ficheros recogidos y ejecutados, 0 omitidos y 0 caídos en cada una.

Antes de estas tres, una corrida sobre el código de la T7 salió **FALLIDA** (el paso 9 superó sus 600 s, y `rostro-del-residente-pg` importaba `base-exigida.ts` sin el guardián): no cuenta, y su causa es H-15S5-05 (§8). El «1 control declarado no ejercido» es el mismo de las rondas anteriores (D-112), y no es de Linux.

## 7 · Verificación de seguridad (§2.7)

| Medida                   | Estado                                                                                                                                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Secretos             | Ninguno nuevo. Las claves de las pruebas son las de siempre, de prueba; los NIT, documentos y placas, al azar. Escaneo de secretos limpio en cada commit                                                                         |
| 6 · RLS y `service_role` | Ninguna política cambia. Las pruebas que se mudan a una copropiedad propia siguen pasando por el rol de la API y la RLS forzada donde ya lo hacían. Las siembras directas son del superusuario de la base de pruebas, como antes |
| 8 · Datos personales     | Ninguno real: personas, viviendas y placas sintéticas; IP sólo de RFC 5737                                                                                                                                                       |
| Resto                    | Sin cambio: no se toca producto                                                                                                                                                                                                  |

## 8 · Hallazgos, deuda, supuestos y pendientes

**Cerradas en esta ronda.**

- **DT-15M-C01** — §2, T2, con la tabla. Los once de la 15-M y los seis que
  faltaban.
- **DT-15M-C02** — T6.
- **DT-15S2-10** — T3.
- **DT-15S2-11** — T5; en `scripts/lib`. Los dos guiones de fuera quedan en
  DT-15S5-01 y -02.
- **H-15S4-01** — T4.
- **La carrera del PR #54** — T1.

**Hallazgos.**

- **H-15S5-01 · El inventario de DT-15M-C01 estaba incompleto.** Seis ficheros
  nuevos desde la 15-M tenían la misma dependencia:
  - `modo-de-puerta-pg`, `titular-por-administracion-pg`, `autorregistro.e2e`,
    `rostro-del-residente-pg`, `mis-visitas-revocacion.e2e`;
  - y el bloque 3i de `visitas-pg`, que sólo apareció con todas las
    interferencias encendidas.
  - Lección: el inventario se demuestra provocándolo, no leyéndolo.
- **H-15S5-02 · Una prueba que no podía fallar.** «Las órdenes no se borran:
  DELETE falla por disparador» corría el `DELETE` sobre COP_A.
  - El disparador es por fila: sin filas, el DELETE no falla y la prueba
    tampoco demuestra nada.
  - Pasaba porque la prueba anterior del mismo bloque escribía en COP_A.
  - Ahora exige primero que haya filas propias.
- **H-15S5-03 · Dos pruebas en verde que habían dejado de probar lo suyo.**
  - La paridad con la base vieja: «visita vigente» pasaba a ser una negación en
    los dos lados.
  - La carrera del rostro con sesiones ajenas paradas: salía de la espera
    antes de que las dos peticiones coincidieran.
  - Las dos llevan ahora la aserción que lo impide.
- **H-15S5-04 · Con carga extrema, `equipos.e2e` cae por plazo, no por «socket
  hang up».**
  - Fue en la ronda 5 de la T7: seis pasadas a la vez con el banco negativo
    corriendo, carga 15 sobre 4 núcleos, y cinco rojas.
  - En tres, la primera prueba —que arranca la app DENTRO de la prueba— superó
    sus 5 s («Test timed out»). En dos, vitest no cargó un módulo a tiempo
    («Timeout calling fetch»).
  - Es una carga que fabriqué yo y que el verificador no produce: no se
    corrige aquí. Queda escrito porque es la forma en que este fichero cae
    cuando cae.
- **H-15S5-05 · El paso 9 se pasaba de su límite bajo la cobertura de V8.**
  - Primera corrida del verificador: «el comando superó el límite de 600 s y
    fue interrumpido». En cascada, el trinquete de ramas: «escanear-secretos
    pasa de 2 a 19 bloques» y «lector-lento sigue en la base y ya no se
    mide». El banco, muerto, no escribió su cobertura.
  - Medido por sección en este contenedor: 381 s sin cobertura, 722 s con
    `NODE_V8_COVERAGE`, que es como lo corre el paso 9. La sección 41
    —diez compilaciones con `tsc` y ocho `--showConfig`— pasaba de 111 s a
    324 s; el arranque de la API de la 35, de 46 s a 85 s.
  - Ninguno de esos procesos es un control de `scripts/lib`, lo único que
    mide `ramas-de-los-controles.mjs`: su cobertura se escribía y nadie la
    leía.
  - Corrección: esos procesos corren con `NODE_V8_COVERAGE` vacío. Con
    cobertura, 441 s. Ninguna aserción cambia, y el trinquete da lo mismo que
    antes: 44 controles medidos, 236 bloques sin ejercer.
  - Lo que esta ronda añadió al banco (sondas 7 bis, 22 bis y ter, 26 c ter)
    son unos 20 s. No era la causa. [Suposición] la 15-S4 pasó el paso 9 en
    otro contenedor más rápido; no medí entonces su tiempo.
  - Y la misma corrida vio otra cosa: `rostro-del-residente-pg` importaba
    `URL_BASE` de `base-exigida.ts` sin registrar el guardián. La sesión
    parada de la interferencia usa ahora el `Pool` de la prueba (en el commit
    de la T2).
- **H-15S5-06 · La sonda de la T6 daba por hecho dónde vive `pnpm`.** La CI
  del PR #56 dio rojo en «controles» (ubuntu y macOS) con una sola
  comprobación: «metricas culpa a una prueba de OTRA corrida o no dice que
  falta el informe».
  - La sonda quitaba del `PATH` el directorio de `node`, porque aquí `pnpm`
    vive a su lado. En los runners de GitHub está en `~/setup-pnpm`: vitest
    corría, escribía un informe nuevo y la premisa no se cumplía.
  - Reproducido con `pnpm` y `node` enlazados en otro directorio del `PATH`:
    el mismo ✗.
  - Ahora antepone al `PATH` un `pnpm` falso que muere sin escribir informe,
    que es vitest muriendo. Pasa con los dos `PATH`; con el `rmSync` de
    `metricas.mjs` quitado vuelve a dar el ✗. Lo corrige `9378f90`.
  - Las tres corridas del verificador eran verdes de verdad: aquí la sonda sí
    escondía `pnpm`. Lo que faltaba era que lo hiciera en cualquier máquina.

**Deuda que abre.**

- **DT-15S5-01 · Media · `scripts/sitio-ensayo.mjs:297`.** Termina con
  `process.exit` tras 16 418 B, y el paso 12f busca su `VEREDICTO` en el
  texto.
  - En macOS (tuberías de 16 KB) el paso puede fallar con el ensayo en verde.
  - En Linux llega entero, medido con lector lento.
  - Congelado: una línea, `process.exitCode`.
- **DT-15S5-02 · Media · `scripts/puesta-en-marcha-equipos.mjs:908`.** Lo
  mismo con 18 903 B; lo lee la sonda 38b. Fuera de los ficheros permitidos en
  esta ronda.
- **DT-15S5-03 · Baja.** La cola `porRetirar(COP_A)` compartida por tres
  ficheros (§2, T2).
- **DT-15S5-04 · Baja.** Sufijos y códigos de espacio pequeño (§2, T2).
- **DT-15S5-05 · Baja.** Fechas de nacimiento escritas a mano: caducan en 2030
  (§2, T2).
- **DT-15S5-06 · Baja · el verificador no enciende las interferencias.** Hoy se
  encienden a mano. Un paso que corra la suite de la API con
  `NCR_INTERFERENCIA=todas` y recree la base después costaría unos 4 minutos
  más un `verificar.sh`. Lo propongo; no lo añado sin que lo pidan.

**Deuda que sigue abierta con evidencia nueva.**

- **DT-15X-07 · `equipos.e2e` «socket hang up»** (§2, T7). No reproducido, con
  las pasadas contadas. El mecanismo medido y por qué no lo doy por causa están
  en §2.

**Supuestos.**

- **S-15S5-01** — las particiones de `eventos` en una base de pruebas vieja
  (§2, T2).
- **[SUPUESTO]** — la cifra de macOS («tuberías de 16 KB») es la documentada
  del sistema, no medida aquí: este entorno es Linux. Lo que sí está medido es
  Linux: ~64 KB por tubería y ~27 KB por socket.

**Corregido de paso.** `cliente-dart-desfasado` y su `finally` (T5): con
`process.exit` el banco temporal quedaba en `$TMPDIR` en cada fallo.

**Ningún `PENDIENTE DE DEFINICIÓN` nuevo.**

## 9 · Qué debe hacer el usuario manualmente

1. Revisar y fusionar el PR hacia `develop`. Yo no fusiono.
2. Si alguna vez corre la suite con `NCR_INTERFERENCIA=…`, recree la base
   después (`./supabase/verificar.sh --con-pruebas --modo-supabase`). Las
   interferencias dejan a propósito la huella de una base vieja.
3. Para la próxima ronda que pueda tocar `scripts/sitio-ensayo.mjs` y
   `scripts/puesta-en-marcha-equipos.mjs`: DT-15S5-01 y -02. Son una línea cada
   uno: `process.exitCode` en vez de `process.exit`.
4. Si `equipos.e2e` vuelve a dar «socket hang up», guarde el registro entero del
   trabajo (DT-15X-07): hace falta saber en qué prueba fue.

## 10 · Rama y commits

Rama `etapa-15s5-estabilidad-de-pruebas`, desde `develop` (`e2507bc`, merge del PR #55):

- `a5edd50` docs(etapa-15s5): declaración de la visita del 09/10
- `38250ce` fix(etapa-15s5/pruebas): la paridad de rostros compara solo lo que siembra — T1
- `562538d` test(etapa-15s5/pruebas): DT-15M-C01 — cada prueba contra la base, con la interferencia que la rompía — T2
- `4ca405c` fix(etapa-15s5/verificador): DT-15S2-10 — el paso 14 nombra el fichero que cae fuera de sus aserciones — T3
- `79debc6` fix(etapa-15s5/verificador): H-15S4-01 — una base con menos conexiones de las que la suite necesita falla al principio — T4
- `1a213c3` fix(etapa-15s5/verificador): DT-15S2-11 — los guiones con salida sin tope terminan con exitCode, no con process.exit — T5
- `89adf87` fix(etapa-15s5/verificador): DT-15M-C02 — metricas.mjs ya no lee el informe de una corrida anterior — T6
- `6760384` docs(etapa-15s5): DT-15X-07 — no reproducido en 140 pasadas de equipos.e2e con carga — T7
- `bd6dcdd` fix(etapa-15s5/verificador): el paso 9 ya no se pasa de su límite — H-15S5-05
- el cierre: `chore(etapa-15s5): cierre de etapa`, con este informe, ESTADO y el registro.
- `9378f90` fix(etapa-15s5/verificador): la sonda del informe viejo no depende de dónde viva pnpm — H-15S5-06, tras el rojo de la CI
