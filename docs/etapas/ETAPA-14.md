# ETAPA 14 — Observabilidad, CI/CD, PWA instalable y escritorio

**Rama:** `etapa-14-cicd-pwa-escritorio` · **Base:** `develop` (`ac5a6cf`)
**Guías nuevas:** [`DESPLIEGUE.md`](../guias/DESPLIEGUE.md) · [`MANUAL_USUARIO.md`](../guias/MANUAL_USUARIO.md)

---

## 1 · Qué se construyó

Esta etapa no añade una función de producto: añade la capacidad de **demostrar**
que el producto hace lo que dice. Es una diferencia de fondo, y se nota en el
tipo de trabajo que contiene.

Lo que había antes: un identificador de correlación que viajaba en una cabecera
y no aparecía en ninguna línea de registro; cinco latencias comprometidas en el
documento de requisitos y ninguna medición; tres operaciones idempotentes,
probadas, que no invocaba nadie; un manifiesto y un service worker que hacían
que la consola _pareciera_ una PWA; un flujo de CI que compilaba tres de los
seis entregables; dos variables de entorno en el ejemplo que nadie leía; y una
paleta de colores copiada a mano en la app del residente.

Lo que hay ahora: **toda línea de registro lleva la correlación de su
petición**, incluidas las que escribe un repositorio tres capas más abajo. Las
cinco latencias se miden por rutas marcadas con un decorador y se publican con
p50, p95 y p99 en una ruta y en una pantalla, **cada una con el tramo que mide y
con lo que no mide escrito al lado**. Un planificador de pg-boss invoca las tres
operaciones huérfanas —entre ellas el barrido que RN-11 obliga a ejecutar dentro
de 24 h y que hasta ahora se cumplía si alguien se acordaba—. Un control
comprueba que la consola es instalable de verdad, y destapó que no lo era del
todo. El escritorio existe: Tauri, con ventana y menús propios y una política de
red que impide que la ventana con la sesión del operador navegue fuera del
backend propio. El CI produce los **seis** entregables. Y la paleta de la app se
genera desde el mismo preset que usa la consola.

Además, y fuera del alcance original —**autorizado por el usuario como anticipo
del punto 4 de la ETAPA 16**—, el README §3 gana cuatro diagramas Mermaid con un
control que comprueba que analizan, y se resuelve una contradicción sobre el
número de agregados raíz.

---

## 2 · Cómo se organizó, decisión por decisión

### 2.1 · La correlación va en un `AsyncLocalStorage`, y el middleware es el primero de todos

El identificador existía desde la ETAPA 02 y viajaba en `x-request-id` de ida y
de vuelta. Lo único para lo que sirve —**filtrar el registro por él**— no
funcionaba, porque ninguna línea lo contenía.

La alternativa honesta era pasarlo por la firma de cada método hasta el último
repositorio. No se hizo por una razón de arquitectura y no de comodidad: el
dominio no puede llevar un parámetro de transporte en sus firmas, y la
aplicación tampoco debería. `AsyncLocalStorage` es la primitiva de Node para
exactamente esto y propaga a través de `await`, de `Promise.all` y de los
manejadores de eventos sin que nadie tenga que acordarse.

**Middleware de Express y no interceptor de Nest**, y la diferencia es
funcional: un interceptor recibe un `Observable` y el trabajo real ocurre cuando
alguien se suscribe, **fuera** del `run()`. El contexto se perdería para la mitad
del manejador, que es la peor forma de fallar —funciona en la prueba corta y no
en la ruta que importa—. El middleware envuelve `next()`, y todo lo que sigue
corre dentro. Va **el primero de todos** por lo mismo: colocado más abajo, las
líneas de las capas anteriores saldrían sin correlación.

**El identificador entrante se sanea.** Es entrada de red que acaba en los
registros: un salto de línea dentro convertiría una entrada de log en dos, y la
segunda la escribiría quien llama. Y se **descarta entero** en vez de truncarse,
porque truncar deja pasar el prefijo que eligió el llamante.

### 2.2 · Sentry se habla directamente, detrás de un puerto

`§2.6` fija «Logs estructurados + Sentry». Lo que se implementa es el **protocolo
de sobres de Sentry** —un POST con tres líneas NDJSON y la clave pública en
`X-Sentry-Auth`—, no el SDK. Tres razones, y ninguna es el gusto:

1. **Superficie de dependencia.** `@sentry/node` arrastra OpenTelemetry y medio
   centenar de paquetes transitivos a una API que la ETAPA 13 acaba de dejar en
   0 vulnerabilidades altas y críticas.
2. **Parcheo global.** El SDK instrumenta `http`, `express` y las promesas por
   monkey-patching al cargar. Eso choca de frente con el principio de esta
   arquitectura: la infraestructura implementa un puerto, no se cuela por debajo
   de las capas.
3. **Comprobabilidad.** Un adaptador de 120 líneas se prueba sin red, inyectando
   el `fetch`. Con el SDK haría falta un servidor falso y aun así no se sabría
   qué se envió.

**Lo que se pierde, dicho sin adornos:** rastreo de transacciones, fuentes de
mapa subidas, agrupado automático por huella e integraciones de plataforma. Si
Grupo Control las quiere, la salida es **otro adaptador detrás del mismo
puerto** —exactamente el argumento de ADR-01— y ni el dominio ni la aplicación
se enteran.

**Solo los 5xx.** Un 400 o un 403 no son fallos del sistema: son el sistema
funcionando. Mandarlos al agregador convertiría el panel en un registro de
accesos y enterraría el 500 que sí hay que mirar.

### 2.3 · El cronómetro lo pone un decorador, y el tramo se publica con la cifra

`@MideKpi('KPI-32')` sobre la ruta, y un único interceptor que mide. Es
declarativo por la misma razón que el RBAC es un guard y no un `if` disperso: un
cronómetro puesto a mano dentro de un caso de uso obliga a tocar su constructor,
sus pruebas y su firma, y al tercer sitio alguien mide desde otro punto.

**KPI-25 es la excepción, y está justificada:** no es una ruta HTTP —el
escalamiento lo dispara la ingesta, no un operador—, así que se anota en
`EscalarAlerta`, que **ya calculaba la cifra** para decidir si escaló dentro de
plazo. La instrumentación no cambia ni una decisión de ese caso de uso.

Tres decisiones del registro de latencias que sostienen lo demás:

- **Anillo acotado, no acumulador.** Un contador de suma y cuenta da la media, y
  la media es la cifra que oculta el incumplimiento: diez mil peticiones de 30 ms
  y cinco de 9 s dan 34 ms de media con cinco accesos fuera de plazo dentro.
- **Los contadores de incumplimiento viven FUERA del anillo.** Si vivieran
  dentro, una ráfaga de tráfico sano borraría el rastro de los incumplimientos
  de hace una hora y el tablero diría «0» sobre un día que tuvo cuarenta.
- **`cumple: null` no es `cumple: false`.** Sin muestras no hay nada que juzgar,
  y un tablero recién arrancado pintado en verde estaría afirmando algo que
  nadie ha medido.

Y la decisión que gobierna la pantalla entera: **cada fila publica `segmento` y
`noIncluye`, y se leen antes que la cifra**. El alcance de la etapa dice que el
documento exige poder DEMOSTRAR las latencias, no afirmarlas; y demostrar una
latencia obliga a decir dónde empieza el cronómetro, dónde termina y qué queda
fuera. Un p95 de 40 ms sobre el tramo equivocado es una afirmación más cómoda y
no más cierta. Los dos extremos físicos de KPI-13 —la cámara reconociendo la
placa y el relé cerrando— **no se miden aquí y la fila lo dice**: los mide la
ETAPA 15 con el equipo delante.

### 2.4 · El planificador: pg-boss, y un fallo no detiene a los demás

Las tres operaciones —`VigilarLatidos`, el reinicio de aforos y
`BarrerPlantillasVencidas`— existían idempotentes y probadas desde su etapa. Lo
único que faltaba era quién las llamara.

**pg-boss y no `setInterval`.** Un temporizador en el proceso parece suficiente
hasta que hay dos instancias de API: entonces el barrido corre dos veces y la
vigilancia abre dos alertas por el mismo equipo. pg-boss toma el cerrojo en
PostgreSQL —la misma base que ya está ahí— y solo una instancia ejecuta cada
disparo.

**Un fallo en una copropiedad no detiene las demás.** Es la decisión más
importante del módulo: sin ella, una copropiedad con una terminal inalcanzable
dejaría sin barrer a todas las que vinieran detrás en el bucle, y el
incumplimiento de RN-11 sería de todo el sistema y no de una.

**Los casos de uso se resuelven con `ModuleRef` y no por importación.** Los tres
viven en módulos que se registran como **dinámicos**; importarlos desde el módulo
de planificación volvería a invocar esas fábricas y crearía una **segunda
instancia de cada repositorio**. El planificador barrería un almacén y las rutas
otro, y las pruebas seguirían en verde porque cada una mira el suyo.

**Apagado, el planificador escribe qué no va a ejecutar.** El silencio dejaría
creer que RN-11 se está cumpliendo, y detrás hay un plazo legal.

**El actor es `app.actor_de_sistema()`**, el de la migración `0025`. No se
inventa un UUID: `usuarios.actualizado_por` tiene clave ajena hacia `usuarios`, y
un identificador sintético haría fallar cada escritura del barrido con una
violación de integridad.

### 2.5 · La PWA: el control mira el código, no la prosa

Una PWA no instalable **no da ningún error**. No hay excepción, no hay consola en
rojo, no hay prueba que falle: el navegador simplemente no ofrece instalarla. Es
el modo de fallo que este proyecto persigue, en su forma más silenciosa, y por
eso el control nuevo comprueba los campos de instalabilidad, los tamaños
**reales** de los iconos leídos del IHDR del PNG, y la exclusión de `/api/` de la
caché.

Esa última se comprueba **sobre el código**: tiene que existir un predicado que
reconozca las rutas de la API y una salida temprana del manejador de `fetch` que
lo use. Buscar la frase «solo red» en un comentario daría por bueno un worker que
la dice y no la cumple.

### 2.6 · Escritorio: la ventana se construye en `setup()`, y no es un detalle

La consola es una aplicación **servida** —Next.js con renderizado en servidor—,
así que el empaquetado apunta a una URL y no a un directorio estático. Eso
significa que la ventana podría navegar a cualquier sitio si nadie lo impide:
basta un enlace, una redirección o una inyección para que la ventana de
escritorio, que lleva la sesión del operador, acabe en un dominio ajeno.

`on_navigation` es el filtro, y es un método del constructor de la **vista web**,
no de la configuración. Una ventana declarada en `tauri.conf.json` nace sin él.
De ahí que la ventana se construya en `setup()`.

**Los orígenes admitidos se compilan dentro del binario.** Un fichero de
configuración junto al ejecutable lo puede editar quien tenga el equipo, y con
ello redirigir esa misma ventana a un servidor suyo. Cambiarlos exige recompilar
y volver a firmar.

### 2.7 · D-78: la paleta se genera, y generar destapó tres divergencias

La deuda estaba declarada con su salida escrita —«generar este fichero desde el
preset, como se genera el cliente de API»— y mientras tanto una prueba de Dart
leía el `.ts` como **texto** y comprobaba que cada color copiado siguiera
apareciendo allí.

Esa prueba protegía de la mitad del problema. Al generar salieron las otras tres:

| Divergencia                                                                        | Por qué la prueba no la veía                                          |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `bordeOscuro` era `#2A2A3D` — el borde de la familia `oscuro.*` del tema **CLARO** | La cadena existe en el fichero. El borde del tema oscuro es `#33334A` |
| `fondoOscuro` y `tarjetaOscura` salían de `oscuro.*` y no de `lienzo` y `tarjeta`  | Mismo motivo: los valores existen, con otro papel                     |
| De los **40 tokens por tema**, la app había copiado **15**                         | Una prueba que busca lo copiado no puede ver lo que nunca se copió    |

---

## 3 · Árbol de archivos

````
apps/api/src/
├─ observabilidad/                        # MÓDULO NUEVO
│  ├─ aplicacion/kpis.ts                  # los 5 KPI con su tramo y su `noIncluye`
│  ├─ aplicacion/percentiles.ts           # p50/p95/p99 puros, con el método declarado
│  ├─ aplicacion/puertos.ts               # `Metricas` y `ReporteDeErrores`
│  ├─ infraestructura/registro-de-latencias.ts   # anillo acotado por indicador
│  ├─ infraestructura/sentry-http.ts      # protocolo de sobres de Sentry
│  ├─ infraestructura/sin-reporte.ts      # objeto nulo: sin DSN no hay agregador
│  ├─ presentacion/mide-kpi.decorator.ts  # `@MideKpi('KPI-32')`
│  ├─ presentacion/interceptor-de-latencias.ts   # el único cronómetro
│  ├─ presentacion/observabilidad.controller.ts  # GET /observabilidad/latencias
│  └─ index.ts                            # barril (§2.2)
├─ planificacion/                         # MÓDULO NUEVO
│  ├─ aplicacion/puertos.ts               # `Planificador`, `CatalogoDeCopropiedades`
│  ├─ aplicacion/trabajos.ts              # un fallo no detiene a los demás
│  ├─ infraestructura/planificador-pgboss.ts
│  ├─ infraestructura/planificador-inerte.ts     # registra lo que NO ejecutará
│  ├─ infraestructura/catalogo-copropiedades-pg.ts
│  ├─ planificacion.module.ts             # los tres trabajos y su actor
│  └─ index.ts
├─ comun/contexto/contexto-de-peticion.ts # AsyncLocalStorage + saneo del id
└─ version.ts                             # `release` para Sentry

apps/web/
├─ src/app/(consola)/observabilidad/      # W-11 · tablero de latencias
└─ src-tauri/                             # ESCRITORIO (ADR-002)
   ├─ src/main.rs · src/red.rs · src/menu.rs
   ├─ tauri.conf.json · Cargo.toml · build.rs
   └─ capabilities/default.json           # privilegio mínimo

apps/mobile/lib/configuracion/paleta.g.dart   # GENERADO desde el preset (D-78)

scripts/lib/
├─ mermaid-analizable.mjs                 # todo bloque ```mermaid analiza
├─ pwa-instalable.mjs                     # la consola es instalable de verdad
└─ generar-paleta-dart.mjs                # genera y comprueba la paleta

docs/guias/DESPLIEGUE.md                  # con P-08 sin decidir, y dicho así
docs/guias/MANUAL_USUARIO.md              # por los seis roles
````

**Modificados de peso:** `main.ts` y `app.module.ts` (cableado), `esquema.ts`
(cinco variables nuevas), `bitacora-estructurada.ts` (correlación y nivel),
`filtro-global.ts` (reporte de 5xx), `aislamiento.e2e.test.ts` (la grieta de
§2.9), `verificacion.yml` (tercer trabajo), `verificar-etapa.sh` (tres pasos),
`pruebas-negativas.mjs` (tres sondas), `README.md` (cuatro diagramas y la lista
de agregados corregida).

---

## 4 · Cumplimiento SOLID

| Principio | Cómo se materializa en esta etapa                                                                                                                                           | Verificación                                                             |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **SRP**   | `percentiles.ts` calcula, `registro-de-latencias.ts` acumula, `interceptor-de-latencias.ts` cronometra y el controlador presenta. Cuatro razones de cambio, cuatro ficheros | Ningún fichero nuevo > 300 líneas; ninguna clase > 5 métodos públicos    |
| **OCP**   | Un KPI nuevo es una entrada en `KPIS` y un `@MideKpi` en su ruta: **cero diff** en el interceptor. Un trabajo programado nuevo es una entrada en `trabajosDeMantenimiento`  | Añadir KPI-26 no tocaría ni el interceptor ni el registro                |
| **LSP**   | `PlanificadorPgBoss` y `PlanificadorInerte` son intercambiables: la aplicación arranca igual con los dos y la suite corre con el segundo sin cambiar una aserción           | La suite completa corre con `PLANIFICADOR_HABILITADO=false`              |
| **ISP**   | `Metricas` tiene dos métodos; `ReporteDeErrores`, uno. No hay un `ObservabilidadService` que lo haga todo                                                                   | Ningún adaptador lanza `NotImplemented`                                  |
| **DIP**   | La aplicación declara `Metricas`, `ReporteDeErrores`, `Planificador` y `CatalogoDeCopropiedades`; la infraestructura los implementa; Nest inyecta por token                 | `frontera-modulos.mjs`: 11 módulos, ninguna importación entra por dentro |

---

## 5 · Trazabilidad

| Elemento                    | Cómo lo cubre esta etapa                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| **RNF-11.3**                | Tableros que sustentan KPI-09, 13, 25, 32 y 33 con p50/p95/p99 · **cubierto**                        |
| **KPI-09, 13, 25, 32, 33**  | Medidos e instrumentados. **Parcial en KPI-13 y KPI-33**, y la fila lo dice: falta el tramo físico   |
| **KPI-11**                  | Análisis estático en el trabajo `controles` de CI · sin cambios, sigue verde                         |
| **KPI-12**                  | La suite completa corre sin hardware, en los tres trabajos de CI                                     |
| **RN-11 · CA-10, CA-11**    | El barrido de plantillas pasa de invocarse a mano a tener planificador (D-40) · **cubierto**         |
| **RN-12 · CA-26**           | La vigilancia de latidos se ejecuta sola cada cinco minutos (D-31) · **cubierto**                    |
| **RN-14 · CA-14**           | El reinicio de aforo se persiste sin depender de que alguien entre (D-36) · **cubierto**             |
| **§2.7.1**                  | Cinco variables nuevas validadas por Zod; dos de ellas dejan de ser deuda declarada                  |
| **§2.7.6**                  | Los trabajos reciben la copropiedad explícita: la validación de aislamiento en la capa de aplicación |
| **§2.7.7**                  | CSP del empaquetado de escritorio, sin `unsafe-inline` en `script-src`                               |
| **DoD ETAPA 14**            | Los seis entregables desde CI · **cubierto** por el trabajo `entregables`                            |
| **DoD ETAPA 16 (anticipo)** | «Que los diagramas Mermaid rendericen» · **cubierto** por `mermaid-analizable.mjs`                   |

**Parcialmente cubierto, con su motivo:**

- **KPI-13** mide el tramo de servidor. El contrato de ingesta en vivo no trae
  marca del equipo —solo la trae la reconciliación del Edge, que es otro caso—,
  así que desde aquí no hay forma de medir el primer tramo. Queda como **D-120**
  para la ETAPA 15, que tiene el equipo delante.
- **KPI-33** mide hoy el canal **simulado**. El adaptador real llega en la ETAPA
  15 (ADR-03), y la fila del tablero lo dice en cada lectura.
- **WebAuthn**, diferido a esta etapa desde el bloque 4, **no se construye**. Ver
  §8.

---

## 6 · Pruebas

### Veredicto literal de `./scripts/verificar-etapa.sh --con-base` (§2.8.0)

<!-- VEREDICTO -->

### Suites

| Paquete            | Pruebas | Notas                                                            |
| ------------------ | ------: | ---------------------------------------------------------------- |
| `@ncr/api`         |         | + 26 nuevas: observabilidad, planificación, contexto y bitácora  |
| `@ncr/web`         |         | + 1 sobre la visibilidad de la pantalla nueva                    |
| `@ncr/domain-core` |         | sin cambios                                                      |
| `@ncr/edge`        |         | sin cambios                                                      |
| Flutter            |     160 | `flutter analyze`: sin incidencias                               |
| Rust (Tauri)       |       3 | política de red: prefijo de dominio, credenciales, canal interno |

### Cobertura por capa (§2.4)

<!-- COBERTURA -->

### Los tres controles nuevos, y lo que encontró cada uno

| Control                   | Qué comprueba                            | Qué encontró al escribirlo                                                           |
| ------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `pwa-instalable.mjs`      | Que la consola sea instalable de verdad  | El icono «enmascarable» era **byte a byte** el mismo que el normal                   |
| `generar-paleta-dart.mjs` | Que la paleta de la app venga del preset | Tres divergencias del tema oscuro que la prueba de texto no podía ver (§2.7)         |
| `mermaid-analizable.mjs`  | Que todo bloque ```mermaid analice       | Un defecto **en sí mismo**: fallaba solo cuando el diagrama era CORRECTO (ver abajo) |

> **El control que fallaba solo en el caso bueno.** `mermaid-analizable.mjs`
> buscaba la versión de Mermaid bajo la raíz **revisada**, que en su propia
> prueba negativa es un directorio temporal sin `node_modules`. Con un diagrama
> roto salía antes de llegar a esa línea y funcionaba; con uno correcto reventaba
> con ENOENT. Lo destapó su prueba negativa en la primera ejecución, que es
> exactamente para lo que existe.

---

## 7 · Verificación de seguridad de la etapa (§2.7)

| §     | Medida                       | Cómo queda tras esta etapa                                                                                                               |
| ----- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 2.7.1 | Secretos solo en entorno     | Cinco variables nuevas, todas en Zod y en `.env.example` **sin valor**. `SENTRY_DSN` mal formado impide arrancar                         |
| 2.7.2 | CORS restrictivo             | Sin cambios                                                                                                                              |
| 2.7.3 | Validación en el backend     | Sin cambios. El DTO nuevo es de **salida**                                                                                               |
| 2.7.4 | Anti inyección y saneamiento | El `x-request-id` entrante se **descarta** si no es una etiqueta: un salto de línea partiría una entrada de log en dos                   |
| 2.7.5 | Rate limiting                | Sin cambios                                                                                                                              |
| 2.7.6 | RLS y doble camino           | Los trabajos programados usan la llave secreta y reciben la copropiedad **explícita**; la suite de aislamiento gana la mitad que faltaba |
| 2.7.7 | CSP                          | La del escritorio: `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`                                                    |
| 2.7.8 | Transversales                | El contexto que sale hacia Sentry pasa por la **misma redacción** que los registros: un agregador es un tercero                          |

**Tres decisiones de seguridad propias de esta etapa:**

1. **El tablero de latencias pide sesión y rol administrativo** aunque no exponga
   ni un dato de copropiedad. Un mapa de dónde tarda el sistema dice cuál es la
   ruta lenta y a qué hora se degrada, que es justo lo que alguien querría saber
   antes de probar algo.
2. **El service worker nunca cachea `/api/`.** Una respuesta de un tenant servida
   a otro desde el disco del navegador es una fuga que ninguna RLS puede ver.
3. **La política de red del escritorio se compila dentro del binario.** Un
   fichero junto al ejecutable lo edita quien tenga el equipo.

---

## 8 · Deuda, hallazgos y supuestos

### 8.1 · Las deudas que esta etapa recibió, una por una

| Id                       | Estado                                                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D-101**                | **ABIERTA.** Perseguida, no cerrada. Ver §8.2                                                                                                                          |
| **D-34**                 | **CERRADA — y era una colisión de identificador.** Ver §8.3                                                                                                            |
| **D-78**                 | **CERRADA.** La paleta se genera desde el preset; el cierre destapó tres divergencias (§2.7)                                                                           |
| **D-31**                 | **CERRADA.** `VigilarLatidos` tiene planificador: cada cinco minutos                                                                                                   |
| **D-36**                 | **CERRADA.** `ReiniciarAforosVencidos`, caso de uso nuevo, cada hora                                                                                                   |
| **D-40**                 | **CERRADA.** `BarrerPlantillasVencidas`, cada seis horas. RN-11 deja de depender de que alguien se acuerde                                                             |
| **D-29**                 | **ABIERTA, y declarada en la guía.** El canal de tiempo real sigue siendo por proceso. `DESPLIEGUE.md` §4.4 dice qué significa para un despliegue de varias instancias |
| **D-38**                 | **Precio aceptado, y ahora repartido.** El paso 14 sigue ejecutando la suite tres veces; el CI la reparte entre tres trabajos que corren en paralelo                   |
| **Seis variables**       | **De seis a cuatro.** `LOG_LEVEL` y `SENTRY_DSN` pasan a validarse y a usarse; las cuatro de `DEVICE_VAULT_*` y `BIOMETRIC_*` siguen con dueño en la ETAPA 15          |
| **`PGBOSS_SCHEMA`**      | **Deja de ser una exención.** Estaba exenta de Zod con la nota «la lee la configuración de pg-boss»; no había tal configuración. Ahora la hay                          |
| **WebAuthn**             | **NO se construye.** Ver §8.4                                                                                                                                          |
| **S-24**                 | **Sigue declarado y no construido.** Ver §8.5                                                                                                                          |
| **Paso 5e**              | **Se ejerce en Linux.** La declaración se acota a macOS, y acotarla destapó una aserción caduca. Ver §8.6                                                              |
| **2 controles en deuda** | **Siguen en deuda, sin crecer.** Ver §8.7                                                                                                                              |
| **Requisito de CI**      | **CUMPLIDO.** `./supabase/verificar.sh --con-pruebas --modo-supabase` y KPI-03 corren en CI                                                                            |

### 8.2 · D-101 · perseguida, y **no** cerrada

La instrucción era explícita: no cerrarla por ausencia de síntoma. No se cierra.

**Lo que se hizo en esta etapa:** ocho corridas de la suite **completa con
cobertura**, bajo `CI=1`, en Linux, con cuatro núcleos —las condiciones bajo las
que se vio aparecer—. **Ocho verdes**, 1 888 pruebas cada una.

| Etapa     | Intentos | Apariciones |
| --------- | -------: | ----------: |
| ETAPA 12  |       11 |           0 |
| ETAPA 13  |       26 |           1 |
| ETAPA 14  |        8 |           0 |
| **Total** |   **45** |       **1** |

**Evidencia CONTRA la hipótesis principal.** El sospechoso era una aserción
sensible al reloj bajo contención de recursos. La suite de `@ncr/api` tiene
exactamente cuatro, y sus márgenes se midieron:

| Prueba                         | Aserción        | Medido (ETAPA 13, clavado a un núcleo) | Margen |
| ------------------------------ | --------------- | -------------------------------------- | -----: |
| `latencia-tiempo-real.test.ts` | p99 < 1 000 ms  | 61–67 ms                               |   ~15× |
| `latencia-tiempo-real.test.ts` | máx < 10 000 ms | —                                      |   alto |
| `kpi-10.e2e.test.ts` (×2)      | p95 < 3 000 ms  | decenas de ms                          |   ~50× |

Con esos márgenes, la contención tendría que multiplicar la latencia por quince
para producir una roja. **No es imposible, pero deja de ser la explicación
cómoda.**

**Lo que sí se añade: instrumento.** D-100 consiguió que la roja se **nombrara**.
El nombre solo no diagnostica. Los informes JSON de las suites dejaban de existir
al terminar el proceso —se escribían en un temporal— y ahora se conservan; el CI
los sube como artefacto **cuando el trabajo falla**. La próxima aparición traerá
cada aserción con su estado, su duración y su orden. Una aparición cada cuarenta
y cinco corridas no se reproduce a voluntad: hay que estar preparado para la que
venga.

### 8.3 · D-34 · era una colisión de identificador, y eso también es un hallazgo

`ESTADO_ETAPAS.md` tenía **dos filas con el mismo identificador**:

- una, en la tabla de la ETAPA 08: «**CERRADA** en la ETAPA 08, con control y
  prueba negativa»;
- otra, en la de la 13: «REASIGNADA a la ETAPA 14 … falta el control que la
  impida».

**Contrastado contra el código, la primera es la correcta.**
`scripts/lib/frontera-modulos.mjs` existe desde la ETAPA 08, su cabecera dice
literalmente «se destapó al cerrar la ETAPA 07 (D-34)», tiene prueba negativa
(sonda 8) y se ejecuta en el verificador y en CI. Su salida en esta etapa:

```
OK frontera-modulos: 11 módulos (autenticacion, autorizaciones, biometria, eventos,
guardia, observabilidad, padron, planificacion, residente, tablero, zonas),
ninguna importación entra por dentro y un solo Pool de PostgreSQL (D-66)
```

El control que la segunda fila decía que faltaba **llevaba seis etapas
existiendo**. Lo que había era un identificador reutilizado en dos tablas
distintas, y el registro dice que los identificadores emitidos no se reutilizan.
La segunda fila se corrige en `ESTADO_ETAPAS.md` y se anota el motivo.

### 8.4 · WebAuthn · no se construye, y la razón no cambió

Diferido a esta etapa desde el bloque 4, con su justificación ya escrita:
**no eleva el `aal2` de Supabase, así que no satisface RN-20**. Es comodidad, no
factor. Construirlo aquí habría añadido 4,5 jornadas a una etapa cuyo alcance no
lo menciona, para una función que no cubre ningún requisito. Se reasigna a
**después de la ETAPA 16**, como mejora de experiencia, y se registra así.

### 8.5 · S-24 · sigue declarado y no construido

La ruta que sirve la instantánea de reglas desde la nube. Se anotó que «se cierra
con el tablero de reglas de la ETAPA 14», y **el alcance de esta etapa no incluye
ningún tablero de reglas**: incluye observabilidad, CI/CD, PWA y escritorio. Se
reasigna a la ETAPA 16 con su condición escrita, en vez de darla por cerrada
porque esta etapa construyó _un_ tablero que no es _ese_ tablero.

### 8.6 · El paso 5e, y el coste de declarar un control

Estaba declarado no ejercido **en todas partes** desde el 2026-09-19, por una
diferencia de entorno de macOS. En Linux corre y pasa. La declaración se acota
ahora a `darwin`, de modo que donde el paso puede ejercerse, se ejerce.

**Acotarla tuvo consecuencia inmediata, y es la lección.** La primera ejecución
en tres días salió **roja**, y por un motivo real: una aserción del recorrido
buscaba el texto «en construcción» de la pestaña de visitantes. Era cierto en la
ETAPA 11-B; la 11 sustituyó esa pestaña por la pantalla real. **La aserción
describía un estado que el producto ya no tenía, y nadie lo vio porque ninguna
máquina ejecutaba el fichero.** Corregida: el recorrido pasa entero, catorce
comprobaciones.

### 8.7 · Los dos controles que siguen en deuda de prueba negativa

`cliente-dart-desfasado.mjs` y `apps/mobile/e2e/recorrido-web.mjs`. La lista **no
creció** —el trinquete lo comprueba— pero tampoco encogió, y conviene decir por
qué en vez de dejarlo implícito: la primera exige regenerar el cliente con el SDK
de Dart dentro del banco de pruebas negativas, que es un clon sin dependencias
resueltas; la segunda exige compilar la app para web y conducir un navegador
dentro de ese mismo banco. Las dos son viables y las dos son caras. Se reasignan
a la ETAPA 16 con esa condición escrita.

### 8.8 · Deuda NUEVA de esta etapa

| Id        | Qué                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Se salda en |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **D-119** | Nada comprueba por máquina que la lista de agregados raíz del README coincida con el dominio. Es lo que permitió C-27                                                                                                                                                                                                                                                                                                                                                                         | ETAPA 16    |
| **D-120** | KPI-13 no mide el tramo del equipo: el contrato de ingesta en vivo no trae marca del dispositivo                                                                                                                                                                                                                                                                                                                                                                                              | ETAPA 15    |
| **D-121** | El registro de latencias es **por proceso**. Con varias instancias hay que agregar fuera; hoy la respuesta lo declara (`porProceso: true`) y ya está                                                                                                                                                                                                                                                                                                                                          | ETAPA 16    |
| **D-122** | **La actualización firmada está cableada y APAGADA.** Lo destapó el CI: con el actualizador activo, Tauri empaqueta el `.deb` y **después** falla con «A public key has been found, but no private key». Es la respuesta correcta —un artefacto de actualización sin firmar no sirve—, así que `createUpdaterArtifacts` y `updater.active` quedan en `false` y `pubkey` vacía, en vez de un marcador que el actualizador rechazaría en ejecución. Pasos para activarla, en `DESPLIEGUE.md` §7 | Operación   |
| **D-123** | `pnpm audit --prod` arrastra 12 avisos `low`/`moderate` de Express 4 y Nest 10 sin versión corregida. El paso de CI falla a partir de `high`                                                                                                                                                                                                                                                                                                                                                  | ETAPA 16    |

### 8.9 · Supuestos

- **[SUPUESTO] S-27 · los horarios de los tres trabajos.** Cinco minutos, una
  hora y seis horas. El primero es el umbral de latido más corto que admite la
  configuración; el segundo, la granularidad del cierre de jornada; el tercero
  deja 18 h de margen sobre las 24 que exige RN-11. Los tres son configurables
  cambiando `HORARIOS`, y ninguno viene del documento de requisitos.
- **[SUPUESTO] S-28 · la ventana de latencias, 2 048 muestras.** Acota la memoria
  del proceso y da un p99 estable con 100 muestras o más. Configurable por
  `METRICAS_VENTANA`.

---

## 9 · Qué debe hacer usted

1. **Decidir P-08** — la plataforma de despliegue de la API. Es la pregunta del
   final de este informe. `DESPLIEGUE.md` §13 enumera **exactamente** las cuatro
   secciones que habrá que escribir cuando decida, y nada más de esa guía
   depende de la decisión.
2. **Generar el par de claves de actualización del escritorio**, antes de la
   primera entrega:
   ```bash
   pnpm --filter @ncr/web exec tauri signer generate -w ~/.ncr/actualizacion.key
   ```
   Publique la **pública** en `apps/web/src-tauri/tauri.conf.json`, ponga
   `updater.active` y `bundle.createUpdaterArtifacts` en `true`, y guarde la
   privada en el gestor de secretos de Grupo Control —**nunca en el
   repositorio**— exponiéndola al empaquetado como `TAURI_SIGNING_PRIVATE_KEY`.
   El procedimiento completo, con sus cuatro pasos, está en `DESPLIEGUE.md` §7.
   Hasta entonces el binario funciona y **no se actualiza solo**, que es el
   comportamiento conservador correcto: nadie instala lo que no viene firmado.
3. **Decidir si quiere Sentry**, y con qué proyecto. Si sí, cargue `SENTRY_DSN`
   en el entorno del despliegue. Si no, déjela vacía: la API arranca igual y el
   reporte queda en objeto nulo. **Vacía es legítimo; mal formada impide
   arrancar**, a propósito.
4. **Fijar `LOG_LEVEL=info` en producción.** Con `debug` el volumen de registro
   se multiplica sin aportar nada en régimen.
5. **Decidir el reparto del planificador.** Con una sola instancia, déjelo
   encendido. Con varias, puede dejarlo encendido en todas —pg-boss toma el
   cerrojo— o dedicar un proceso. **Lo que no debe hacer es apagarlo en todas:**
   RN-11 dejaría de cumplirse, y el registro lo dirá en cada arranque.
6. **Revisar el icono enmascarable.** Se regeneró con el arte al 60 % del lado
   para que quepa en la zona segura. Es correcto y es geométrico: si diseño
   quiere otra composición, es un `.png` y se sustituye.
7. **Firmar las cuatro aceptaciones de riesgo de la ETAPA 13** (AR-01 a AR-04),
   que siguen redactadas y sin firma.

---

## 10 · Rama y commits

**Rama:** `etapa-14-cicd-pwa-escritorio`, sacada de `develop` (`ac5a6cf`).

| Commit    | Qué                                                                             |
| --------- | ------------------------------------------------------------------------------- |
| `34282ae` | Observabilidad: correlación, Sentry tras un puerto y el tablero de latencias    |
| `0e4e7d3` | Planificación: pg-boss invoca las tres operaciones huérfanas (D-31, D-36, D-40) |
| `afb03a3` | PWA verificada, escritorio con Tauri y la paleta generada (D-78)                |
| `044c764` | CI de los seis entregables, guías, y el instrumento de D-101                    |

<!-- COMMITS-FINALES -->
