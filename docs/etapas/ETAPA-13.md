# ETAPA 13 — Auditoría de ciberseguridad y endurecimiento

**Rama:** `etapa-13-auditoria-seguridad` · **Base:** `develop` (`153df52`)
**Informe de auditoría:** [`docs/seguridad/AUDITORIA.md`](../seguridad/AUDITORIA.md)

---

## 1 · Qué se construyó

Esta etapa no añade producto. **Audita lo construido en las doce anteriores y
endurece lo que la auditoría encontró flojo**, que es una distinción que importa
porque cambia el criterio de éxito: aquí un hallazgo no es un fracaso, es el
entregable.

Se recorrieron las dieciséis dimensiones que `CLAUDE.md` §6 enumera para esta
etapa —secretos en el código y en el historial, CORS por origen, método y
cabecera, fuzzing de DTOs, inyección SQL sobre todos los campos persistidos,
límite de peticiones bajo carga, la matriz completa de RLS política por
política, CSP y cabeceras, XSS almacenado y reflejado, IDOR por recurso,
escalamiento entre los seis roles, carga de archivos por tipo real, fugas por
registro y por mensaje de error, dependencias vulnerables, y OWASP Top 10 y ASVS
nivel 2 como listas formales—. **Ninguna quedó sin ejecutar**, y las que no se
pueden demostrar desde este entorno están dichas con esas palabras y con lo que
haría falta para cerrarlas.

Salieron **26 hallazgos**: ninguno crítico, **tres altos**, quince medios, seis
bajos y dos informativos. Veinticinco quedan cerrados. El único abierto es de
severidad baja y es una **aceptación de riesgo redactada para su firma**, no una
remediación pendiente.

Los tres altos, porque son los que sostienen la etapa:

- **H-13-05** — la lista blanca de DTOs rechazaba una clave inventada y
  **aceptaba** `__proto__`, `constructor`, `toString`, `valueOf` y
  `hasOwnProperty`. No hubo contaminación de prototipo —se comprobó—, pero una
  lista blanca con cinco puntos ciegos no es una lista blanca, y de ella cuelga
  la afirmación de §2.7.3 que respaldaba los informes de etapa.
- **H-13-09** — el saneamiento de entrada **mutilaba en silencio** toda carga
  base64: el XLSX del padrón, el CSV y el vector biométrico llegaban recortados
  a 4 096 caracteres, con la firma `PK\x03\x04` intacta, de modo que la
  validación de tipo real los daba por buenos y el DTO no protestaba. 2xx sobre
  un archivo roto, sin error, sin aviso y sin traza. Es un defecto introducido
  **durante esta misma etapa**, y por eso está registrado como hallazgo con
  severidad en vez de arreglado en silencio: es la regla 1 de la etapa.
- **H-13-26** — el árbol de dependencias tenía **4 vulnerabilidades críticas y
  23 altas en producción**. Hoy tiene cero y cero.

Y el hallazgo que no esperaba encontrar: **`src/seguridad.ts` —CORS, CSP, HSTS y
el `ValidationPipe` real— tenía 0 % de cobertura con 656 pruebas en verde**
(H-13-11). El fixture de la suite reconstruía su propia tubería y jamás llamaba
a `aplicarSeguridad`. Durante doce etapas, toda afirmación de los informes sobre
§2.7.2, §2.7.3 y §2.7.7 se apoyó en una tubería que el despliegue no usa.

Además de los hallazgos, la etapa deja **siete suites de seguridad nuevas** que
se ejecutan en cada integración, **tres modos nuevos en el escaneo de secretos**
—índice, historial y ficheros prohibidos por `.gitignore`—, **un control nuevo**
de longitud por campo, **una migración de aserción** que cubre la capa de
ADR-005 que nadie verificaba, y **una matriz de RLS derivada del catálogo** en
vez de escrita a mano.

---

## 2 · Cómo se organizó, decisión por decisión

### 2.1 · Tres palabras con significado fijo, y por qué hacían falta

El informe de auditoría define en su §0 tres términos y no usa ningún otro:
**VERIFICADO** (se ejecutó, aquí está la salida), **LEÍDO** (se comprobó leyendo
el ACL, el catálogo o el código, sin ejercerlo) y **NO VERIFICABLE** (no se
puede demostrar desde este entorno, y se nombra qué haría falta).

No es un formalismo. La instrucción de la etapa lo pedía con un motivo
concreto: _«probable» no es «verificado»: esa confusión ya costó DB-02 abierta
durante semanas_. Un informe que mezcla «lo comprobé» con «lo leí y tiene buena
pinta» **no se puede auditar**, porque el lector no sabe qué apoyo tiene cada
línea. Con tres palabras y ninguna más, cada afirmación lleva su propio nivel de
prueba encima.

De ahí sale también la tabla de §4.2 del informe: siete cosas que **no se
pueden** verificar desde aquí, cada una con el porqué y con lo que haría falta.
Es más corta que la lista de lo verificado, y es la parte que más trabajo costó
escribir, porque la tentación de todo informe de seguridad es que no exista.

### 2.2 · Registrar antes de arreglar, incluso lo propio

La regla 1 de la etapa dice que una medida que nunca se construyó es un hallazgo
con severidad, no un añadido silencioso. Se aplicó sin excepciones, y la
excepción que más costó fue la propia: **H-13-09 es un defecto ALTO en código
que esta etapa escribió tres commits antes**.

La alternativa —corregirlo y no contarlo, ya que nunca llegó a `develop`— era
tentadora y habría sido exactamente lo contrario de auditar. Un informe que
oculta los defectos de su autor no vale para el que lo lea después, que es
precisamente quien tiene que decidir si confiar en el resto.

Lo mismo con H-13-08 (las dos superficies de lint), con el `next-env.d.ts` que
el control de `.gitignore` encontró **en un commit de esta misma rama**, y con
el control de longitud que nació contando como campo un `@IsString()` escrito
dentro de un comentario.

### 2.3 · Lo que queda fuera debe FALLAR, no desaparecer

Es la lección de `Placa`, y esta etapa la aplicó dos veces en sentidos opuestos.

**Al quitar el recorte** (H-13-09): el techo global de 4 096 caracteres con
`.slice()` convertía un dato inválido en un dato válido y equivocado, que es
estrictamente peor que rechazarlo. La «longitud máxima por campo» que exige
§2.7.4 se movió a donde puede ser específica —el `@MaxLength`/`@Length` de cada
DTO, que sabe si el campo es un motivo de apertura de 512 caracteres o un libro
de Excel de 340 000— y se sostiene con un control nuevo,
`scripts/lib/longitud-por-campo.mjs`, que rompe el build si un `@IsString()`
nace sin cota. Midió 44 campos, todos con la suya.

**Al añadir el rechazo** (H-13-13): un parámetro de consulta que llega como
arreglo u objeto podría colapsarse a escalar, y sería el mismo error. Se
rechaza con 400.

### 2.4 · El orden del middleware es parte del contrato, y no da error de tipos

`aplicarSaneamiento` no vive dentro de `aplicarSeguridad`, y tiene su propia
función con su propio nombre a propósito. La primera versión lo registró en el
sitio cómodo —dentro de `aplicarSeguridad`— y **no saneaba absolutamente nada**,
porque esa función corre antes de `express.json()` y allí `req.body` todavía no
existe. No hubo error de compilación, no hubo error de tipos: la prueba de
H-13-06 simplemente se quedó en rojo.

Queda escrito en el código, en los dos ficheros, porque es un fallo que sólo se
ve ejecutando: con el middleware antes de los parsers, `¿NUL sobrevive? true`;
después, `false`.

### 2.5 · La suite de pruebas monta la tubería del despliegue, no una imitación

H-13-11 obligó a una decisión de alcance: se podía escribir una suite nueva que
ejercitara `aplicarSeguridad` aparte —barato— o hacer que `crearApp` montara la
tubería real, con lo que **las 656 pruebas existentes pasan a correr contra ella**.

Se hizo lo segundo, aunque era más arriesgado, porque lo primero deja el
problema de fondo intacto: la suite seguiría validando con un `ValidationPipe`
distinto del de producción, y los dos literales seguirían pudiendo divergir sin
que nadie lo notara —ya habían divergido en `enableImplicitConversion`—.

La cobertura de `seguridad.ts` pasó de **0 % a 100 %** sin que ninguna prueba se
pusiera en rojo, lo que además dice algo tranquilizador: la tubería real y la
imitada se comportaban igual en todo salvo en lo que nadie probaba.

### 2.6 · La heurística del escáner mira la FORMA del valor, no una lista de palabras

Al añadir patrones para los tres secretos propios del proyecto (H-13-19) apareció
el problema de siempre: el árbol está lleno de valores de prueba con nombres
como `INGESTA_FIRMA_SECRETO`, y un patrón por nombre los marca todos.

La salida fácil es una lista de palabras que indican «esto es de prueba»
—«prueba», «ejemplo», «solo-para»—. Se descartó: esa lista **va siempre por
detrás** del siguiente marcador que alguien invente, y cada palabra que se le
añade es justo la que un valor real podría llevar en su nombre.

Lo que de verdad separa una llave de una frase es de dónde sale. Una llave la
genera `openssl rand`: mezcla mayúsculas con dígitos, o es hexadecimal largo. Un
marcador lo escribe una persona en minúsculas con guiones —
`un-secreto-de-al-menos-treinta-y-dos-caracteres`— y eso no lo produce ningún
generador. La sonda 28(c) prueba las dos formas de llave real **y** la
contraprueba del marcador: un control que grita en cada commit se desactiva a la
semana.

### 2.7 · La regla de seguridad vive en un sitio; la de formato, donde quiera

H-13-15 —la inyección de fórmulas CSV— estaba resuelta en el exportador de
eventos y olvidada en el del padrón. Al corregirlo se podía unificar los dos
`celda()`, pero los dos formatos tienen políticas de entrecomillado
legítimamente distintas: uno entrecomilla siempre, el otro sólo cuando hace
falta, y hay pruebas que dependen de esa forma.

Se extrajo **solo la neutralización de fórmulas** a `apps/api/src/comun/csv.ts`.
La política de entrecomillado puede diferir entre formatos; la de seguridad, no.

### 2.8 · Cuatro actos de DDL, no uno: lo que D-08 decía de menos

La formulación de D-08 —«el dueño conserva `ALTER TABLE … DISABLE TRIGGER`»— se
midió y resultó ser generosa con el atacante y a la vez injusta con el diseño.
La cadena real, contra el clúster con el dueño NO superusuario:

1. `DISABLE TRIGGER ALL` **falla**: la clave ajena de la partición es un
   disparador de sistema y protege de paso al de inmutabilidad.
2. Reconcederse `UPDATE` funciona, y el `UPDATE` afecta a **0 filas**: la RLS en
   modo `FORCE`, sin política de escritura, lo detiene.
3. Quitar `FORCE ROW LEVEL SECURITY` tampoco basta: salta el **disparador**.
4. Sólo desactivando el disparador **por su nombre exacto** el `UPDATE` pasa.

Son cuatro actos deliberados de DDL, ninguno de ellos un `UPDATE` desde el
código, y el despliegue detecta los cuatro: la aserción de la `0017` cubre el 2
y el 4 —y sí recorre las particiones, lo nombra: `eventos_2026_09:tg_prohibir_update`—
y la `0031`, nueva, cubre el 3, que era **el único que nadie verificaba**.

> Una nota de método que quedó escrita en la migración porque costó un
> diagnóstico falso: ejecutar el FICHERO de la `0017` para ver si detecta el
> acto 4 devuelve «verificado» aunque el disparador esté desactivado, porque la
> migración lo **recrea** antes de aseverar. Hay que ejecutar el bloque de
> aserción solo.

### 2.9 · Derivar del catálogo, no enumerar a mano

La matriz de RLS (H-13-04) se deriva de `pg_class` + `pg_attribute`: **42 tablas
con `copropiedad_id`**, frente a las 26 que la suite anterior recorría desde un
`ARRAY[...]`. Es la misma decisión que ya gobierna la suite de aislamiento —que
lee el enrutador de Nest— y la matriz de escalamiento de roles nueva —que lee
los decoradores—.

El criterio, repetido tres veces en esta etapa: **una lista escrita a mano
envejece en la primera etapa que añade algo, y su envejecimiento es
silencioso**. Derivarla cuesta más al escribirla y no cuesta nada después.

---

## 3 · Árbol de archivos

### Nuevos

| Fichero                                                           | Para qué                                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `docs/seguridad/AUDITORIA.md`                                     | El entregable: 26 hallazgos con evidencia reproducible, OWASP, ASVS y las aceptaciones de riesgo |
| `apps/api/src/comun/saneamiento.ts`                               | El saneamiento de §2.7.4 que nunca se construyó (H-13-05, 06, 07, 13, 14)                        |
| `apps/api/src/comun/saneamiento.test.ts`                          | Qué hace exactamente, **y qué NO debe tocar**                                                    |
| `apps/api/src/comun/csv.ts`                                       | La neutralización de fórmulas, en un solo sitio (H-13-15)                                        |
| `apps/api/src/comun/csv.test.ts`                                  | Su prueba, con el caso legítimo incluido                                                         |
| `apps/api/src/padron/aplicacion/exportar-padron.test.ts`          | Que ninguna celda del padrón salga como fórmula viva                                             |
| `apps/api/test/saneamiento-entrada.e2e.test.ts`                   | H-13-05, 06, 07, 09 y 13 sobre el arranque REAL de `main.ts`                                     |
| `apps/api/test/cors-y-cabeceras.e2e.test.ts`                      | CORS por origen, método y cabecera; CSP, HSTS, nosniff (H-13-11, 21, 22)                         |
| `apps/api/test/escalamiento-de-privilegios.e2e.test.ts`           | La matriz de los seis roles, derivada del enrutador                                              |
| `apps/api/test/limite-de-peticiones.e2e.test.ts`                  | El límite bajo carga, el `Retry-After` y el backoff del Edge                                     |
| `apps/api/test/fugas-por-registro.e2e.test.ts`                    | Redacción, y que una línea de registro no se pueda falsificar desde la entrada                   |
| `apps/api/test/xss.e2e.test.ts`                                   | XSS almacenado y reflejado, incluido el 404 con la carga en la ruta                              |
| `scripts/lib/longitud-por-campo.mjs`                              | «Longitud máxima POR CAMPO» de §2.7.4, donde de verdad puede estar                               |
| `supabase/migrations/…_0031_asercion_rls_forzada_append_only.sql` | La capa de ADR-005 que la aserción no verificaba (H-13-03)                                       |
| `supabase/policies/tests/60_matriz_rls_completa.sql`              | La matriz de RLS derivada del catálogo: 42 tablas (H-13-04)                                      |

### Modificados

| Fichero                                                                                  | Qué cambió                                                                               |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/api/test/utilidades.ts`                                                            | `crearApp` monta la tubería REAL del despliegue: 0 % → 100 % en `seguridad.ts` (H-13-11) |
| `apps/api/src/seguridad.ts`                                                              | `exposedHeaders`, `DELETE` retirado, y `aplicarSaneamiento` como función propia          |
| `apps/api/src/main.ts`                                                                   | Llama al saneamiento DESPUÉS de los parsers, con el porqué escrito                       |
| `apps/api/src/comun/filtros/filtro-global.ts`                                            | El 4xx de biblioteca sale como 4xx (H-13-12) y no nombra la clase que lo lanzó (H-13-24) |
| `apps/api/src/configuracion/esquema.ts`                                                  | Cada origen CORS validado como origen canónico; HTTPS forzado en producción (H-13-21)    |
| `apps/api/src/autorizaciones/presentacion/guardia-firma.ts`                              | Sin cuerpo crudo no hay firma que verificar: 401 (H-13-10)                               |
| `apps/api/src/biometria/infraestructura/boveda-cifrada.ts`                               | HKDF con la copropiedad como sal (H-13-02, cierra D-41)                                  |
| `apps/api/src/padron/aplicacion/casos-de-uso.ts` y `carga-padron.ts`                     | NFC en identificador y agrupación (H-13-16)                                              |
| `apps/api/src/padron/aplicacion/exportar-padron.ts` y `eventos/presentacion/formatos.ts` | Los dos usan el mismo escapador (H-13-15)                                                |
| `scripts/lib/escanear-secretos.mjs`                                                      | Tres modos, cinco patrones nuevos, NUL, y los ficheros que `.gitignore` prohíbe          |
| `scripts/lib/pruebas-negativas.mjs`                                                      | Sondas 27 y 28, con contraprueba en cada una                                             |
| `scripts/lib/estabilidad.mjs`                                                            | Nombra la prueba roja también con `CI=1`, que es como este paso ejecuta la suite         |
| `scripts/lib/ramas-de-los-controles.mjs`                                                 | `verificar-escritura.mjs` declarado sensible al entorno, con la medición (D-96)          |
| `scripts/verificar-etapa.sh`                                                             | Dos controles nuevos cableados: historial de secretos y longitud por campo               |
| `.github/workflows/verificacion.yml`                                                     | `fetch-depth: 0` y el paso de historial                                                  |
| `.husky/pre-commit`                                                                      | El escaneo mira el ÍNDICE, que es lo que se va a confirmar (H-13-20)                     |
| `.gitignore` · `eslint.config.mjs`                                                       | `Thumbs.db`; y la exclusión compartida por las dos superficies de lint (H-13-08)         |
| `package.json` · `pnpm-lock.yaml`                                                        | `overrides` **acotadas con `^`**: de 4 críticas y 23 altas en producción a 0 y 0         |

### Retirados del índice

| Fichero                  | Por qué                                                                        |
| ------------------------ | ------------------------------------------------------------------------------ |
| `docs/.DS_Store`         | `.gitignore:3` lo prohíbe desde el primer commit y estaba versionado (H-13-23) |
| `apps/web/next-env.d.ts` | `.gitignore:31` lo prohíbe desde la ETAPA 09; lo genera Next en cada build     |

---

## 4 · Cumplimiento SOLID

| Principio | Cómo se materializa en lo que esta etapa escribió                                                                                                                                                               | Verificación                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **SRP**   | `saneamiento.ts` sanea y no valida; `csv.ts` neutraliza fórmulas y no entrecomilla; `longitud-por-campo.mjs` mira una cosa. El fichero más largo de los nuevos tiene 162 líneas, muy por debajo del tope de 300 | `wc -l` sobre los nuevos: máximo 162                             |
| **OCP**   | Un patrón nuevo en el escáner es una entrada más en `PATRONES`, con su validador opcional; no se toca la función que recorre. Un modo nuevo es una rama del selector, no una copia del cuerpo                   | Los cinco patrones nuevos entraron sin tocar `esFuga`            |
| **LSP**   | `crearApp` y el arranque de `main.ts` montan la MISMA tubería: la suite pasa contra las dos sin cambiar una aserción. Es literalmente el principio, aplicado al ensamblaje en vez de a una clase                | 723 pruebas verdes tras sustituir la tubería imitada por la real |
| **ISP**   | `aplicarSeguridad` y `aplicarSaneamiento` son dos funciones porque son dos momentos del arranque. Fundirlas en una «configurar todo» fue el primer intento y **no funcionaba**                                  | H-13-06: el orden es la condición de que funcione                |
| **DIP**   | Nada de lo añadido entra en `domain/`. El saneamiento vive en presentación —traduce protocolo—, la bóveda sigue detrás de su puerto, y `exportar-padron` importa un ayudante de `comun`, no un adaptador        | `pnpm lint` con las reglas de frontera: 7 de 7                   |

---

## 5 · Trazabilidad

| Elemento                              | Cómo lo cubre esta etapa                                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **KPI-22** · completitud de auditoría | **NO VERIFICABLE aquí.** Exige cruzar el log DEL DISPOSITIVO con los eventos. Marcado **H** en la matriz: ETAPA 15          |
| **KPI-23** · completitud de campos    | **VERIFICADO**: 6 de 6 eventos con todos los campos; 14 columnas NOT NULL, listadas                                         |
| **KPI-24** · inmutabilidad            | **VERIFICADO**: `UPDATE` y `DELETE` denegados a `anon`, `authenticated`, `service_role`, `app_mantenimiento` y **al dueño** |
| **KPI-36** · aislamiento              | **VERIFICADO**: ninguna ruta devuelve datos ajenos, por los dos caminos                                                     |
| **KPI-37** · cobertura de la prueba   | **VERIFICADO**: la suite deriva las rutas del enrutador, no de una lista                                                    |
| **KPI-38** · registro del intento     | **VERIFICADO**: todo acceso cruzado deja rastro en `auditoria_seguridad` (CA-24)                                            |
| **KPI-03** · integridad concurrente   | **VERIFICADO** de paso: 100 inserciones simultáneas, 1 aceptada, 99 rechazadas, 0 duplicados                                |
| **KPI-11** · frontera del hardware    | **VERIFICADO** — y roto y reparado dentro de la etapa: dos comentarios míos nombraban al fabricante                         |
| **KPI-25** · latencia de alerta       | **VERIFICADO** de paso: 200 de 200 entregadas, p99 84 ms contra un umbral de 10 000                                         |
| **CA-23** · evento inalterable        | **VERIFICADO** por los cuatro caminos de ADR-005                                                                            |
| **CA-24** · acceso cruzado auditado   | **VERIFICADO**                                                                                                              |
| **CP-11** · aislamiento multiempresa  | **VERIFICADO**                                                                                                              |
| **RN-03, RN-15, RN-21**               | Cubiertas por las anteriores                                                                                                |
| **OWASP Top 10 2021**                 | Las diez categorías, con veredicto y base — §5 del informe de auditoría                                                     |
| **OWASP ASVS nivel 2**                | Los catorce capítulos, con veredicto y base — §6 del informe de auditoría                                                   |

**Parcialmente cubierto, con el motivo:**

- **ASVS V2 (autenticación)** — el ciclo de recuperación por correo es **NO
  VERIFICABLE** de punta a punta: SMTP y URLs de redirección viven en el panel
  de Supabase, sin permisos (BE-01). Lo que sí está verificado: el endpoint
  responde 204 sin revelar si la cuenta existe, está limitado a 5 por minuto,
  exige segundo factor donde corresponde y deja registro.
- **ASVS V8 (protección de datos)** — la supresión biométrica está verificada en
  la base y en la cola; **verificada en la terminal física** es ETAPA 15.
- **ASVS V9 (comunicaciones)** — **LEÍDO**, no verificado: el cifrado en tránsito
  real depende del despliegue, no del árbol.

---

## 6 · Pruebas

### Qué se probó, y cómo ejecutarlo

Siete suites nuevas en `apps/api/test/` y tres ficheros de prueba unitaria. La
receta completa —incluida la base efímera y los tres modos del escáner— está en
§9 del informe de auditoría. En corto:

```bash
eval "$(./scripts/base-de-pruebas.sh arrancar)"
./supabase/verificar.sh --con-pruebas --modo-supabase
node scripts/lib/escanear-secretos.mjs --historial
cd apps/api && npx vitest run
```

### Cobertura

Medida **por capa**, como exige §2.8.0, y sobre el árbol entero —que es lo que
D-112 dejó como insumo de esta etapa—:

```
OK   dominio (packages/domain-core/src): lineas 97.73 % · ramas 96.48 % · funciones 97.42 % (umbral 90 %, 34 archivos)
OK   aplicacion (**/aplicacion/**):      lineas 97.08 % · ramas 92.46 % · funciones 98.25 % (umbral 90 %, 39 archivos)
OK   global:                             lineas 76.48 % · ramas 85.04 % · funciones 80.00 % (umbral 70 %, 308 archivos)
```

**39 archivos en `aplicacion` y 308 en global**, no 5 y 156. Es el primer cierre
de etapa cuyo «las tres capas cumplen» se calcula sobre el árbol completo.

Y la cobertura de los dos ficheros que esta etapa puso en el centro:

```
seguridad.ts   | 100 % Stmts | 100 % Branch | 100 % Funcs | 100 % Lines
saneamiento.ts | 100 % Stmts | 100 % Branch | 100 % Funcs | 100 % Lines
```

### Veredicto literal de `./scripts/verificar-etapa.sh --con-base`

Corrida sobre `a6f702b`, con la base efímera levantada y el SDK de Flutter
presente. **Los 26 pasos, ejecutados.** Sale copiado tal cual, incluidos los dos
avisos, porque un veredicto recortado no es un veredicto:

```
▸ 1b · docs/ESTADO_ETAPAS.md no se contradice a sí mismo
   ✓ coherente: 17 etapas en el mapa, 14 cerradas con ficha e informe, cabecera al día
     · 0 de 0 rama(s) «en curso» comprobadas contra git

▸ 5 · suite completa
   @ncr/config:test:       Tests  144 passed (144)
   @ncr/providers:test:    Tests   78 passed (78)
   @ncr/edge:test:         Tests  101 passed (101)
   @ncr/domain-core:test:  Tests  398 passed (398)
   @ncr/web:test:          Tests  350 passed (350)
   @ncr/api:test:          Tests  723 passed | 5 skipped (728)
   ⚠ suite sin rojas · las saltadas están DECLARADAS y se ejercen en otro paso

▸ 6 · ningún fichero de prueba se quedó sin recoger
   ✓ 145 de 145 ficheros de prueba ejecutados

▸ 7 · umbrales de cobertura por capa (§2.4)
     OK   dominio (packages/domain-core/src): lineas 97.73 % · ramas 96.48 % · funciones 97.42 % (umbral 90 %, 34 archivos)
     OK   aplicacion (**/aplicacion/**):      lineas 97.08 % · ramas 92.46 % · funciones 98.25 % (umbral 90 %, 39 archivos)
     OK   global:                             lineas 76.48 % · ramas 85.04 % · funciones 80.00 % (umbral 70 %, 308 archivos)
   ✓ las tres capas cumplen su umbral

▸ 7b · los dos recuentos de la MISMA suite coinciden (D-112)
   ✓ recuentos: 6 paquete(s) con el mismo resultado por los dos caminos · 1799 pruebas

▸ 9 · pruebas negativas de los propios controles
   ✓ controles: 31 de 33 con prueba negativa · 2 en deuda declarada (no puede crecer)
   ✓ PRUEBAS NEGATIVAS: los 24 controles detectan su violación y aceptan el caso legítimo, sin tocar el árbol
   ✓ ramas: 30 controles medidos · 194 bloques sin ejercer (no puede subir)

▸ 10 · fronteras de arquitectura y secretos
   ✓ sin secretos
   ✓ escaneo de secretos: limpio (2 182 blobs del historial alcanzable · 2 de línea base declarados)
   ✓ longitud por campo: 44 campo(s) @IsString(), todos con cota declarada
   ✓ KPI-11: sin ISAPI ni IPs de dispositivo fuera de packages/providers/

▸ 12 · esquema y aislamiento en --modo-supabase (requiere --con-base)
   ✓ migraciones, semillas y suite SQL

▸ 13 · KPI-03 y la inmutabilidad de un evento REAL, contra base (requiere --con-base)
   ✓ 100 inserciones concurrentes, 0 duplicados (KPI-03)
   ✓ UPDATE y DELETE rechazados sobre un evento real (RN-03, CA-23)

▸ 14 · estabilidad: la suite da lo mismo tres veces seguidas
      corrida 1/3: codigo 0 · @ncr/api:test: Tests 728 passed (728) · …
      corrida 2/3: codigo 0 · @ncr/api:test: Tests 728 passed (728) · …
      corrida 3/3: codigo 0 · @ncr/api:test: Tests 728 passed (728) · …
   ✓ OK estabilidad: 3 corridas forzadas (sin caché de turbo) con resultado idéntico

▸ 15 · ningún paso declarado se quedó sin ejecutar
   ✓ OK 26 de 26 pasos ejecutados

VERIFICACIÓN DE ETAPA: correcta CON 2 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe
```

**Los dos «declarados no ejercidos», dichos sin suavizarlos**, porque el
veredicto los nombra y esconderlos aquí sería justo lo contrario de esta etapa:

1. **Paso 5e · el recorrido de la app en un navegador.** Declarado no ejercido
   desde el 2026-09-19 por diferencia de entorno en el enganche del campo por el
   motor de Flutter web. Revisión en la ETAPA 14. Los otros tres controles
   móviles —análisis estático, 158 pruebas de Dart con cobertura por capa y
   cliente generado sin diferencias ni secretos— **sí** se ejercen.
2. **`cliente-dart-desfasado.mjs` y `apps/mobile/e2e/recorrido-web.mjs`**, los
   dos controles que siguen en deuda de prueba negativa. El primero necesita el
   SDK de Dart para regenerar y comparar; el segundo, compilar la app para web y
   conducir un navegador. Ninguno es pereza, y la deuda **solo puede encoger**:
   esta etapa la bajó de 7 a 2.

Y las **5 saltadas** de `@ncr/api` no son una omisión: son las de
`arranque-en-frio.e2e.test.ts`, que necesitan los claims que escribe el paso
12b — que es quien las ejecuta y quien exige que no se salten—. En el paso 14,
donde la base sí está, corren las 728.

### De qué corrida sale este veredicto, y qué pasó después

| Dónde                                          | SHA       | Resultado                                                                          |
| ---------------------------------------------- | --------- | ---------------------------------------------------------------------------------- |
| Local, `--con-base` + SDK de Flutter           | `a6f702b` | **correcta**, cero ✗ — es el veredicto de arriba                                   |
| **CI · los TRES trabajos**                     | `a6f702b` | **verde** · `controles` (ubuntu y macOS) + `verificar-etapa.sh --con-base (macos)` |
| Local, `--con-base` + SDK de Flutter, repetida | `5cd2286` | **correcta**, cero ✗ — mismo veredicto                                             |

Entre `a6f702b` y la punta de la rama **solo cambia documentación**, comprobado
por máquina y no de memoria:

```
$ git diff --stat a6f702b..HEAD -- ':!docs'
(sin salida: el árbol de código es idéntico)
```

Los tres commits que van después son el veredicto literal, el expediente de
D-101 y la corrección del recuento por severidad. Se dice porque la alternativa
—citar una corrida y dejar que el lector suponga que corresponde a la punta— es
exactamente la clase de atajo que esta etapa audita.

---

## 7 · Verificación de seguridad de la etapa (§2.7)

| §     | Medida                       | Estado al cerrar                                                                                                                       |
| ----- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 2.7.1 | Secretos solo en el entorno  | **Reforzado**: el escaneo cubre ahora el índice, el historial y los ficheros que `.gitignore` prohíbe; cinco patrones nuevos           |
| 2.7.2 | CORS restrictivo             | **Reforzado y por primera vez PROBADO**: por origen, método y cabecera; cada origen validado como origen canónico; HTTPS en producción |
| 2.7.3 | Validación en el backend     | **Reforzado**: la lista blanca ve ahora las claves heredadas, y la suite corre contra el `ValidationPipe` del despliegue               |
| 2.7.4 | Anti inyección y saneamiento | **Construido**: no existía. Control, NFC, NUL, bidi, profundidad, y la cota por campo donde puede ser específica                       |
| 2.7.5 | Rate limiting                | **Probado bajo carga**: 429 con `Retry-After`; y el backoff del Edge, que no puede agotar el límite por sí mismo                       |
| 2.7.6 | RLS activa y forzada         | **Probada la matriz completa**: 42 tablas derivadas del catálogo, 46 de 46 con RLS forzada, 101 políticas, positiva y negativa         |
| 2.7.7 | CSP y cabeceras              | **Por primera vez PROBADAS**: sin `unsafe-*`, `object-src 'none'`, `frame-ancestors 'none'`, HSTS, `nosniff`, sin `x-powered-by`       |
| 2.7.8 | Transversales                | **Reforzado**: tipo real de archivo ya estaba; el 413 se dice, el error no nombra su clase, y el registro no se puede falsificar       |

---

## 8 · Deuda, hallazgos y supuestos

### Los insumos que la etapa recibió, y qué pasó con cada uno

| Insumo                   | Qué era                                                                     | Resultado                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **D-112**                | La cobertura se medía sobre 5 archivos de 39 y 156 de 306                   | **Cerrado**. Esta etapa mide 39 y 308, y lo afirma por su propia ejecución, no por un «verificado» anterior            |
| **D-08**                 | El dueño conserva `ALTER TABLE … DISABLE TRIGGER`                           | **Reformulado y cerrado** como H-13-03: son cuatro actos de DDL, y el despliegue detecta los cuatro                    |
| **D-09**                 | El clúster local corre con dueño SUPERUSUARIO y Supabase no                 | **Cerrado en el modo que reproduce la condición** (`sb_postgres_sim`, no superusuario). Contra el proyecto real: AR-03 |
| **D-12**                 | Que `postgres` pueda `GRANT authenticated TO app_api` era un supuesto       | **VERIFICADO en el clúster local**, como superusuario y como dueño no superusuario. Contra el proyecto real: AR-03     |
| **D-32**                 | El disparador que sustituye a la clave ajena comprueba sin bloquear la fila | **Cerrado**: ver abajo                                                                                                 |
| **D-41**                 | La llave de la bóveda era `sha256` del secreto, sin sal por copropiedad     | **Cerrado** como H-13-02: HKDF con la copropiedad como sal                                                             |
| **7 controles en deuda** | Sin prueba negativa                                                         | **De 7 a 2.** Y escribir una de ellas destapó H-13-01                                                                  |
| **D-101**                | Roja intermitente de `@ncr/api`, no reproducida en 11 intentos              | **REPRODUCIDA en esta etapa.** Ver abajo                                                                               |
| **BE-01**                | SMTP y URLs de redirección sin permisos en el panel                         | **Auditado como NO VERIFICABLE de punta a punta**, con esas palabras. AR-04                                            |

### D-32 · por qué se cierra, y por qué no es por un bloqueo

El riesgo enunciado era que el disparador de `alertas` comprueba la existencia
del evento **sin bloquear la fila**, de modo que podría quedar una alerta
apuntando a un evento que desapareció entre la comprobación y la inserción.

Se ejercitó la carrera de verdad: una sesión inserta el evento y **no confirma**;
otra, mientras tanto, intenta crear la alerta sobre él.

```
sesión A: INSERT 0 1   (sin COMMIT)
sesión B: ERROR: La alerta referencia un evento inexistente en esta copropiedad
sesión A: ROLLBACK
alertas colgadas tras la carrera: 0
```

Y con un evento inexistente, lo mismo. La ventana que el riesgo describía exige
que la fila referenciada **desaparezca** después de una comprobación correcta, y
eso no puede ocurrir: `eventos` tiene cero políticas de `DELETE`, el privilegio
revocado para todos los roles incluido el dueño, y un disparador
`BEFORE DELETE`. **Se cierra por construcción, no por un bloqueo** — y la
distinción importa, porque si mañana `eventos` dejara de ser append-only, el
riesgo vuelve.

### D-101 · reprodujo, y esto es lo que se sabe

La instrucción de la etapa era explícita: _no la cierres por ausencia de
síntoma_. No hizo falta — **apareció**.

En el paso 14 del verificador, que ejecuta la suite tres veces seguidas sin
caché:

```
corrida 1/3: codigo 0 · @ncr/api:test: Tests 728 passed (728)
corrida 2/3: codigo 1 · @ncr/api:test: Tests 1 failed | 727 passed (728)
corrida 3/3: codigo 0 · @ncr/api:test: Tests 728 passed (728)
```

**Y el mecanismo que D-100 añadió para que la próxima roja se nombrara sola no
la nombró.** El paso informó «la corrida 2 terminó en rojo (codigo 1)» y, debajo,
nada. La causa es de la misma familia que persigue: `estabilidad.mjs` recogía
las líneas que empiezan por `× `, que es como Vitest lista las pruebas fallidas
con su reportero por omisión — pero este paso ejecuta el comando con `CI=1`, y
**con `CI` puesto Vitest cambia de reportero** y emite `FAIL <fichero> > <suite>

> <prueba>`sin una sola línea con`×`. El nombre estaba en la salida y el
> filtro no lo miraba.

Corregido en esta etapa: el filtro recoge también `FAIL ` y las líneas de
detalle, y cuando aun así no encuentre nombre lo dirá con todas las letras —«es
un defecto de ESTE control, no una roja anónima»— en vez de callar.

**Y luego no volvió a aparecer.** Perseguida en el mismo entorno, sobre el mismo
commit, con la base viva:

| Intento                                                            | Corridas | Rojas |
| ------------------------------------------------------------------ | -------: | ----: |
| `CI=1 TURBO_FORCE=true pnpm --filter @ncr/api test`                |       12 | **0** |
| `CI=1 TURBO_FORCE=true pnpm test` (la suite COMPLETA, en paralelo) |        8 | **0** |
| Paso 14 del verificador (tres corridas por ejecución), después     |        6 | **0** |

Van **26 corridas** sin reproducir, sumadas a los 11 intentos de la ETAPA 12.
Lo único que la aparición añade al expediente es un dato: **salió bajo la suite
COMPLETA en paralelo, no bajo `@ncr/api` a solas**, lo que apunta a contención
de recursos entre los seis paquetes y no a la lógica de una prueba.

**No se cierra.** La instrucción de la etapa era explícita —_no la cierres por
ausencia de síntoma_— y sigue valiendo ahora que el síntoma apareció una vez:
una aparición no es un diagnóstico. Se reasigna a la ETAPA 14, que es donde vive
la observabilidad, con el dato nuevo y con el control ya arreglado para que la
próxima vez se nombre sola de verdad.

### Deuda que esta etapa NO cierra, y por qué

| ID          | Qué                                                                         | Por qué sigue abierta                                                                                                                              |
| ----------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D-101**   | La roja intermitente de `@ncr/api`                                          | **Reproducida, no diagnosticada.** Ver arriba. No se cierra por ausencia de síntoma ni por una sola aparición                                      |
| **D-78**    | Colores puestos a mano en la consola                                        | Fuera del alcance de esta etapa: no es una medida de §2.7. Sigue asignada a la 14                                                                  |
| **D-34**    | El control de fronteras no exige que un módulo importe a otro por su barril | Estaba asignada a la 13 y **no se hizo**: es una frontera de arquitectura (§2.2), no una medida de §2.7. Se reasigna a la 14 con esa razón escrita |
| **BE-01**   | SMTP y URLs de redirección                                                  | Bloqueo de ENTORNO. Auditado como NO VERIFICABLE, con AR-04 redactada                                                                              |
| **H-13-25** | La contraseña inerte en el historial                                        | **Abierto a propósito**: es una decisión del cliente, con AR-01 redactada para su firma                                                            |

### Supuestos y decisiones nuevas

- **`[SUPUESTO]` S-25** — Que en el Supabase gestionado de Grupo Control el rol
  de conexión sea DUEÑO de las tablas y NO superusuario. Es la condición que
  hace efectivos el `REVOKE` y la RLS forzada. Se reproduce en el clúster local
  con `sb_postgres_sim` y la aserción de despliegue lo comprobará la primera vez
  que las migraciones se apliquen contra el proyecto real.
- **`[SUPUESTO]` S-26** — Que ningún DTO de consulta necesitará jamás un campo
  de tipo arreglo. Hoy es cierto en los tres que existen, y de ahí sale la regla
  de H-13-13: un parámetro no escalar es entrada malformada. Si un endpoint
  futuro necesita `?zona=a&zona=b`, hay que relajar la regla **con un DTO que lo
  declare**, no quitándola.
- **`PENDIENTE DE DEFINICIÓN` P-14** — Qué hacer con `secret scanning` y `push
protection` de GitHub. Con ellos activos, H-13-17 tendría además una barrera
  antes de que el objeto llegue al remoto. Es un ajuste del servidor, no del
  árbol, y desde aquí no se ve. Comportamiento conservador mientras tanto: el
  escaneo de historial corre en CI en cada integración.

---

## 9 · Qué debe hacer usted

1. **Firmar, o rechazar, las cuatro aceptaciones de riesgo** de §7 del informe de
   auditoría. Están redactadas, con lo que se acepta, por qué, qué lo acota y
   qué lo reabriría. Rechazar cualquiera reabre su hallazgo, y no hay problema
   en eso: hay que saberlo para planificarlo.
   - **AR-01** · la contraseña inerte en el historial (H-13-25).
   - **AR-02** · las 12 vulnerabilidades moderadas y bajas que quedan en
     producción, sin versión corregida publicada (H-13-26).
   - **AR-03** · D-09 y D-12, demostrados en un clúster que reproduce Supabase.
   - **AR-04** · el ciclo de recuperación, NO VERIFICABLE de punta a punta (BE-01).
2. **Decidir sobre las credenciales del proyecto Supabase real** — es la
   pregunta (a) del cierre.
3. **Comprobar en GitHub** si `secret scanning` y `push protection` están
   activados sobre el repositorio (P-14). Se hace en
   _Settings → Code security and analysis_.
4. **Revisar el `docs/.DS_Store` retirado.** No contenía secretos, pero filtraba
   nombres de ficheros y disposición de carpetas de su máquina. Si le consta que
   alguna carpeta de trabajo tenía nombres sensibles, conviene saberlo ahora.
5. **Nada más.** Esta etapa no pide crear recursos, ni tocar el panel, ni rotar
   ninguna llave: no se encontró ninguna comprometida.

---

## 10 · Rama y commits

**Rama:** `etapa-13-auditoria-seguridad`, sacada de `develop` (`153df52`) como
exigen las precondiciones — no de `correccion-macos` ni de la rama de la 12.

En el primer commit se cumplieron las tres precondiciones:

- `main` tenía `7a63c17` («Revise README…») que `develop` no tenía. **Se trajo
  por fusión**, resolviendo el conflicto del README a favor de `develop` tras
  compararlos sección por sección: la versión de `main` era un resumen más
  corto y la de `develop` la que la ETAPA 16 va a reescribir. Queda escrito para
  que esa etapa sepa de dónde parte.
- **`ESTADO_ETAPAS.md` corregido**: la cabecera decía «en curso la rama
  `correccion-macos`» y su ficha presentaba el PR #22 como abierto, cuando está
  fusionado en `develop`.
- **Control nuevo en el paso 1b**: una rama descrita como «en curso» cuya punta
  ya es ancestro de `HEAD` es **FALLO**. Le pregunta a git, no a GitHub, y
  tiene su prueba negativa. Antes no lo veía, que es justo por lo que la
  cabecera pudo quedarse mintiendo.

### Commits

| SHA       | Qué                                                                                         |
| --------- | ------------------------------------------------------------------------------------------- |
| `590deab` | Fusión de `main`: trae `7a63c17`, con el README resuelto a favor de `develop`               |
| `072abc9` | Precondiciones · base desde `develop`, cabecera corregida, control de coherencia contra git |
| `9ac73c4` | La deuda de pruebas negativas baja de 7 a 2 — y escribir una destapó **H-13-01**            |
| `7356701` | **H-13-02** (HKDF por copropiedad, cierra D-41) y **H-13-03** (la tercera capa de ADR-005)  |
| `fa83f04` | **H-13-04** · la matriz de RLS derivada del catálogo: 42 tablas, no 26                      |
| `730bd86` | **H-13-05, H-13-06, H-13-07** · el saneamiento de §2.7.4, que nunca se construyó            |
| `5dd9b89` | **H-13-09 a H-13-23 y H-13-26** · nueve hallazgos, de ALTA a informativa                    |
| `c419160` | Dos defectos del propio andamiaje, destapados por sus pruebas negativas                     |
| `74c4335` | Las cinco dimensiones que no se habían medido nunca — y **H-13-24**                         |
| `7395ac2` | **KPI-11 roto por un comentario mío**, y seis ramas de control que nadie ejercía            |
| `2ef9899` | **D-96** · el trinquete contaba el SDK de Flutter como código nuevo                         |

> Los últimos tres commits no corrigen producto: corrigen **los controles y el
> informe de esta misma etapa**, cada uno porque un control se puso en rojo. Que
> estén en el historial en vez de aplastados en un `--amend` es deliberado: la
> etapa que audita la disciplina del proyecto no puede esconder sus propios
> tropiezos con ella.
