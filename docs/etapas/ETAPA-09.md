# ETAPA 09-A — Consola web de administración: sistema de diseño, marco, acceso y tablero

**Rama:** `etapa-09-consola-administracion` · **Cierre:** 2026-09-09
**Depende de:** ETAPAS 07 ✅ y 08 ✅ · **Alcance:** 09-A. Viviendas, vehículos, visitantes, zonas, dispositivos, eventos e informes son **09-B**.

---

## 1 · Qué se construyó

La consola de administración existe y arranca: preset de diseño compartido, sistema de componentes, marco de navegación con visibilidad por rol, acceso con segundo factor y el dashboard operativo del mockup W-02 alimentado en vivo. Y, debajo, tres piezas de backend que la consola necesitaba y no existían.

El **preset Tailwind** vive en `packages/config` y lo consumen la consola de esta etapa, las consolas operativas de la 10 y —traducido a `ThemeData`— la app Flutter de la 11. Sale del análisis de frecuencia sobre el mockup que hizo la ETAPA 00, no de una interpretación nueva.

El **marco de la consola** es la barra lateral oscura de nueve elementos del mockup, con cabecera de buscador, indicador del canal en vivo y menú de usuario. Cada elemento declara qué roles lo ven; los que aún no existen aparecen deshabilitados con la etapa que los construirá, porque un enlace a una pantalla no construida se percibe como una aplicación rota.

El **acceso** es de dos pasos: credenciales y, para los roles administrativos, segundo factor TOTP. El selector «TIPO DE USUARIO» del mockup **no está** —hallazgo M-01, contradicción C-05—: el rol se deriva del token.

El **tablero** son las cuatro tarjetas de indicadores, la lista de últimos eventos alimentada por SSE, el histograma de accesos por hora y el estado de dispositivos. Cada bloque carga, falla y se recupera por su cuenta.

En la API se añadieron el **módulo `tablero`** —tres casos de uso de lectura sobre su propio puerto— y los **tipos de respuesta en OpenAPI**, que no existían en ningún controlador. En `packages/contracts`, el **cliente generado** desde el contrato, con dos controles que rompen la verificación si se desincroniza.

---

## 2 · Cómo se organizó y por qué

### 2.1 · El navegador habla solo con su propio origen (patrón BFF)

Es la decisión que gobierna todo lo demás y merece explicarse primero.

La ETAPA 02 dejó `apps/web/.env.example` con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, dando por supuesto que el navegador hablaría con Supabase y con la API directamente. Esta etapa cambia ese supuesto: **el navegador solo habla con la consola, y la consola —en el servidor— habla con Supabase y con la API.**

El token de sesión vive en una cookie `httpOnly`. El JavaScript de la página no puede leerlo, y como nunca necesita enviarlo —lo pone el proxy del servidor—, tampoco lo echa en falta. La consecuencia concreta: un XSS deja de ser un robo de sesión permanente y pasa a ser, como mucho, una acción mientras la pestaña está abierta.

Tres piezas lo sostienen:

- `app/api/sesion/*` — alta, baja, estado y segundo factor. Reciben correo y contraseña, contactan con el proveedor de identidad y guardan el token. **La respuesta al navegador no lleva token**: lleva qué hacer a continuación.
- `app/api/ncr/[...ruta]` — proxy hacia la API. **No decide nada**: no filtra por rol, no reinterpreta respuestas, no traduce códigos. La API es la autoridad; esto es transporte. Una comprobación de permisos aquí crearía una segunda política que se separaría de la del backend en la primera etapa siguiente.
- `lib/sesion/token.ts` — renueva el token **por anticipación**, no por reacción.

Ninguna variable de la consola lleva ya `NEXT_PUBLIC_`.

### 2.2 · Por qué el token se renueva antes de caducar

La expiración de Supabase es de pocos minutos. Refrescar de forma perezosa —esperar al 401— funciona para una petición normal y **tumba el canal SSE**: un flujo ya abierto no tiene a quién devolverle el 401, así que deja de entregar sin dar ningún error. El operador ve una lista que no cambia y concluye que no está pasando nada.

Por eso `tokenVigente()` renueva cuando faltan menos de 60 s, y el canal consulta `/api/sesion/estado` para programar una **reapertura planificada** 45 s antes del vencimiento. Esa reapertura no cuenta como fallo: el contador de reintentos sigue a cero y no se penaliza con retroceso.

### 2.3 · El canal en vivo, y por qué no hay sondeo

La ETAPA 06 midió el canal SSE: 200 de 200 alertas con 25 consolas suscritas, p99 de 3 ms contra el umbral de 10 000 ms de KPI-25. Sondear daría peor latencia y más carga.

El cliente hace tres cosas que un `new EventSource(url)` no hace:

1. **Reconecta con retroceso exponencial y jitter completo.** El jitter no es adorno: veinticinco consolas pierden la conexión a la vez —porque la pierden por lo mismo— y sin él reintentarían en el mismo milisegundo, que el limitador de peticiones (§2.7.5) contaría como una ráfaga y respondería con 429, alargando la caída.
2. **Recupera lo perdido.** Guarda el instante del último evento entregado y, al reconectar, pide exactamente ese hueco. Un corte de treinta segundos no deja un agujero en la lista.
3. **Publica su estado.** El indicador está en la cabecera, visible desde cualquier pantalla y con `aria-live`. Una lista congelada sin avisar es peor que una vacía.

Cuando llega un evento, la consola lo antepone a la lista y **invalida** las consultas de indicadores e histograma. No suma uno al contador: eso reimplementaría en el navegador una cuenta que ya vive en el dominio, y las dos se separarían en cuanto una autorización cambiara de estado.

### 2.4 · El tablero es tres endpoints, no uno

La auditoría de mockups lo pide explícitamente: «una tarjeta caída no debe tumbar el tablero». Con una respuesta agregada, un fallo en el histograma dejaría los cuatro indicadores en error. Por eso la API expone `indicadores`, `accesos-por-hora` y `dispositivos` por separado, y la consola los consulta por separado.

Las tres son **consultas, no reglas**: viven en la capa de aplicación, sobre `RepositorioTablero`, sin SQL en la presentación. Aun así hay dos decisiones que no son de transporte y que se repetirían mal en cada consumidor si se dejaran arriba, y las dos las resuelve el dominio:

- **Qué significa «hoy».** `ventanaDelDia(ahora, zonaHoraria)` es una función pura del dominio con el instante inyectado. La zona sale de `copropiedades.zona_horaria` (migración 0004, NOT NULL, validada contra `pg_timezone_names`), no del servidor ni del navegador. Un conjunto en `America/Bogota` visto desde un servidor en UTC perdería las cinco últimas horas del día y sumaría cinco del anterior.
- **Cuándo un dispositivo está en línea.** `estadoPorLatido` contra el umbral de la copropiedad (migración 0020: latido cada 60 s, 1 tolerado, caído a los 300 s de silencio). **No se lee `estado_salud`**: esa columna la mantiene el vigilante de latidos y puede ir por detrás; el tablero tiene que decir la verdad en el instante en que se pinta.

### 2.5 · La credencial del dispositivo no puede salir porque no se puede nombrar

`RN-21` prohíbe exponer credenciales de dispositivo. La forma de garantizarlo no es filtrar el campo al serializar: es que el campo **no exista** en la proyección. `DispositivoDelTablero` no tiene `credencialRef`, las consultas enumeran columnas una a una —nunca `SELECT *`— y una prueba inyecta el campo a la fuerza en el adaptador y exige que no aparezca en el cuerpo serializado completo, no campo a campo.

El direccionamiento (`host`, `puerto`, `firmware`) sí es dato de inventario y no secreto (C-11), y se rellena solo para roles administrativos. La decisión se toma **en el borde**, en el controlador: el caso de uso no debe conocer el rol de quien mira.

### 2.6 · El contraste, medido

`03-mockups.md` §5.6 convierte el contraste en verificación obligatoria de esta etapa. Se implementó como cálculo, no como criterio: `packages/config/src/contraste.ts` aplica la fórmula de WCAG 2.1 y 39 pruebas recorren los pares reales de la consola.

Al medir aparecieron dos cosas:

| Par                            | §5.6 estimaba | Medido    | AA texto normal |
| ------------------------------ | ------------- | --------- | --------------- |
| `#E63946` sobre blanco         | ≈ 3,9 : 1     | **4,168** | no cumple       |
| Blanco sobre relleno `#E63946` | ≈ 4,4 : 1     | **4,168** | no cumple       |

El primero estaba previsto y se resuelve como pedía el enunciado: `marca.texto` = `#A23037` (6,97 : 1) para todo texto pequeño, enlaces y bordes.

**El segundo no estaba previsto en el enunciado, pero sí en el documento de diseño**, que decía «verificar por componente y **oscurecer el relleno si no alcanza**». Se aplica esa salida: `marca.boton` = `#DC3341` (4,572 : 1), el oscurecimiento más pequeño que alcanza el umbral, a menos de 1,2 : 1 del original —el ojo los lee como el mismo tono—. **La identidad no cambia**: `#E63946` sigue intacto y sigue siendo el color dominante de la pantalla, porque va donde no hay texto pequeño: filete del elemento activo, pastillas de icono, barras del histograma y distintivos sobre fondo suave. Ahí AA pide 3 : 1 como componente, y 4,168 lo supera con margen.

Queda como decisión abierta a su revisión: si prefiere el rojo original también en el relleno de los botones, la salida es subir la etiqueta a ≥ 18,66 px en negrita, que es el umbral de «texto grande».

### 2.7 · Los cinco estados obligatorios, como componentes

El mockup dibuja el camino feliz con datos en sus dieciocho pantallas. Los cinco estados que `CLAUDE.md` §6 exige están en `componentes/estados.tsx`, juntos y no improvisados por pantalla, por una razón concreta: si cada vista los inventara, «sin permiso» y «no encontrado» acabarían pareciéndose, **y en este sistema no son lo mismo**. Un recurso de otra copropiedad devuelve 404 a propósito, porque un 403 confirmaría que el identificador existe. Si la consola lo mostrara como «no tienes permiso sobre esto», desharía por texto lo que el backend oculta por código de estado. Hay una prueba que lo fija.

### 2.8 · El service worker no cachea nada autenticado

Un service worker es un almacén **por origen, no por usuario**. Si guardara la respuesta de `/api/ncr/copropiedades/A/…` y luego entrara un operador de la copropiedad B en el mismo equipo —una portería con turnos es exactamente ese caso—, el navegador le serviría datos de A sin que ninguna barrera del servidor llegara a intervenir: una fuga entre copropiedades invisible para la RLS y para la capa de aplicación, que son las dos barreras de §2.7.6.

Por eso `/api/**` es **solo red**, sin lectura ni escritura de caché. Los estáticos de `_next` van a caché primero porque llevan hash en el nombre. Los documentos van a red primero y, sin red, a la página de «sin conexión», que **no muestra cifras guardadas**: en control de acceso, un dato viejo presentado como actual lleva a abrir o cerrar una puerta que no tocaba.

---

## 3 · Árbol de ficheros

### Backend (API)

| Fichero                                                                    | Propósito                                                                       |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `packages/domain-core/src/tiempo/ventana-del-dia.ts`                       | «Hoy» según la zona de la copropiedad; función pura con instante inyectado      |
| `packages/domain-core/src/tiempo/ventana-del-dia.test.ts`                  | 10 pruebas: husos, cambios de horario, bordes de medianoche                     |
| `apps/api/src/tablero/aplicacion/puertos.ts`                               | `RepositorioTablero` y sus proyecciones. **Sin `credencialRef`**                |
| `apps/api/src/tablero/aplicacion/casos-de-uso.ts`                          | `ConsultarIndicadores`, `ConsultarAccesosPorHora`, `ConsultarDispositivos`      |
| `apps/api/src/tablero/aplicacion/casos-de-uso.test.ts`                     | 14 pruebas de las dos reglas: ventana del día y estado por latido               |
| `apps/api/src/tablero/infraestructura/repositorio-tablero-pg.ts`           | Adaptador PostgreSQL, todo parametrizado, columnas enumeradas                   |
| `apps/api/src/tablero/infraestructura/repositorio-tablero-en-memoria.ts`   | Adaptador vigente (D-17); se apoya en los repositorios de eventos por su barril |
| `apps/api/src/tablero/presentacion/tablero.controller.ts`                  | Tres rutas bajo `copropiedades/:id/tablero`                                     |
| `apps/api/src/tablero/presentacion/respuestas.ts`                          | DTOs de salida del tablero                                                      |
| `apps/api/src/tablero/{tablero.module.ts,index.ts}`                        | Raíz de composición y barril                                                    |
| `apps/api/src/comun/respuestas.ts`                                         | `ErrorApiDto`, `DetalleDeErrorDto` y el enumerado de motivos                    |
| `apps/api/src/{autenticacion,eventos,multiempresa,salud}/**/respuestas.ts` | DTOs de salida de los controladores que consume la 09-A                         |
| `apps/api/test/tablero.e2e.test.ts`                                        | 9 pruebas, incluida la que exige que la credencial no salga                     |
| `apps/api/src/autenticacion/dominio/codigos-recuperacion.ts`               | Generación, hash SHA-256 y cotejo en tiempo constante. Función pura              |
| `apps/api/src/autenticacion/aplicacion/puertos.ts`                         | `RepositorioCodigosMfa` y `AdministradorDeFactores`                              |
| `apps/api/src/autenticacion/infraestructura/{codigos-mfa-en-memoria,factores-supabase}.ts` | Adaptadores: almacén y retirada de factores                       |
| `apps/api/test/{codigos-recuperacion,arranque-en-frio}.e2e.test.ts`        | Consumo único, aislamiento entre usuarios; y «esta sesión ENTRA»                 |
| `supabase/migrations/…_0026_nit_y_codigos_mfa.sql`                         | Normalización del NIT y tabla de códigos (solo el hash), con RLS forzada         |
| `supabase/arranque-en-frio.sh`                                             | Base vacía → migraciones → aprovisionamiento → claims reales volcados            |

### Contratos y verificación

| Fichero                                  | Propósito                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `packages/contracts/src/generado/api.ts` | Cliente **generado**. No se formatea ni se lintea                         |
| `packages/contracts/src/index.ts`        | Barril de solo tipos, con los alias que usa la consola                    |
| `scripts/lib/contrato-tipado.mjs`        | Ninguna ruta sin respuesta tipada; exenciones con etapa que caducan solas |
| `scripts/lib/contrato-desfasado.mjs`     | Regenera en un temporal y compara byte a byte                             |

### Consola

| Fichero                                                 | Propósito                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `packages/config/src/tailwind-preset.ts`                | Paleta, tipografía, densidad, radios. Con el hallazgo de contraste documentado |
| `packages/config/src/contraste.ts`                      | Fórmula WCAG 2.1, pura                                                         |
| `packages/config/src/contraste.test.ts`                 | 39 pruebas sobre los pares reales de la consola                                |
| `apps/web/src/middleware.ts` · `middleware-csp.ts`      | CSP con nonce por petición; la política se prueba como cadena                  |
| `apps/web/src/lib/configuracion.ts`                     | Configuración `server-only`, validada; ninguna variable pública                |
| `apps/web/src/lib/sesion/*`                             | Cookies `httpOnly`, cliente de identidad, renovación anticipada                |
| `apps/web/src/lib/api/*`                                | Cliente tipado, proveedor de consultas y las cuatro del tablero                |
| `apps/web/src/lib/sse/*`                                | Canal en vivo, política de reconexión y contexto de estado                     |
| `apps/web/src/lib/{motivos,navegacion,cn}.ts`           | Los diez motivos en español, navegación por rol, composición de clases         |
| `apps/web/src/app/api/{sesion,ncr}/**`                  | BFF: sesión, segundo factor, estado y proxy hacia la API                       |
| `apps/web/src/app/acceso/**`                            | W-01: credenciales → **inscripción** → segundo factor → códigos de recuperación |
| `apps/web/src/app/api/sesion/mfa/inscripcion/route.ts`  | Alta del factor sobre la propia sesión; la identidad sale de la cookie          |
| `apps/web/src/app/(consola)/tablero/**`                 | W-02                                                                           |
| `apps/web/src/componentes/**`                           | Catálogo: KPI, tabla, dispositivo, distintivo, modal con motivo, estados       |
| `apps/web/public/{manifest.webmanifest,sw.js,iconos/*}` | Base de PWA                                                                    |

---

## 4 · Cumplimiento SOLID

| Principio | Materialización en esta etapa                                                                                                                                             | Verificación                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **SRP**   | Un caso de uso por consulta del tablero; el proxy BFF solo transporta; `contraste.ts` solo calcula. Ningún fichero supera 300 líneas ni ninguna clase 5 métodos públicos  | `pnpm lint` · revisión del árbol                 |
| **OCP**   | Un motivo de denegación nuevo entra por `MOTIVOS_ACCESO` y aparece solo en el contrato y en el cliente; el registro de textos deja de compilar hasta que se le dé uno     | `TEXTO_MOTIVO` es `Record<MotivoAcceso, string>` |
| **LSP**   | `RepositorioTableroPg` y `RepositorioTableroEnMemoria` cumplen el mismo puerto; los casos de uso no distinguen cuál está detrás                                           | `tablero.module.ts` cambia la fábrica y nada más |
| **ISP**   | `RepositorioTablero` expone seis operaciones de lectura y ninguna de escritura. Ningún adaptador lanza `NotImplemented`                                                   | Interfaz en `tablero/aplicacion/puertos.ts`      |
| **DIP**   | La aplicación declara el puerto; la infraestructura lo cumple; Nest inyecta por token `REPOSITORIO_TABLERO`. La consola depende de `useIndicadores`, no de TanStack Query | `verificar-frontera.sh` · `frontera-modulos.mjs` |

---

## 5 · Trazabilidad

**Cubierto en esta etapa:** HU-36 y HU-37 (acceso multi-rol y segundo factor) · HU-38 (dashboard operativo) · CA-25 (MFA obligatorio para roles administrativos, por `aal2`) · RN-12 y CA-26 (estado del dispositivo por latido) · RN-15 (aislamiento: las tres rutas nuevas entran solas en el recorrido) · RN-20 (segundo factor) · RN-21 (la credencial no sale de la API) · KPI-14 (pantallas mínimas de administración, la parte 09-A) · KPI-25 (canal en vivo consumido, medido en el paso 11).

**Parcialmente cubierto:** HU-01 a HU-04, HU-18, HU-32 y HU-35 — sus pantallas son **09-B**; esta etapa deja el marco, el catálogo de componentes y el cliente tipado sobre los que se montan. KPI-35 (conmutación entre copropiedades sin fuga) — la clave de consulta ya la contempla, pero la conmutación se construye en la ETAPA 10 y allí se prueba.

**Deliberadamente fuera:** M-01/C-05 resuelto quitando el selector de rol; el buscador global queda deshabilitado con su motivo porque busca casas, placas y residentes, que son 09-B.

---

## 6 · Pruebas

**Qué se probó, y por qué eso.** Se probó lo que **no da error cuando se rompe**: la CSP —que mal formada deja de proteger sin avisar—, el proxy BFF, el cliente de identidad, el canal en vivo, la ventana del día y las reglas de presentación que sostienen decisiones del backend. La maquetación no se prueba; las garantías, sí.

Dos hallazgos de las propias pruebas, antes de llegar al verificador:

- `ventanaDelDia` devolvía una ventana de **48 horas** en `Pacific/Chatham` (UTC+12:45): el cálculo del día siguiente pasaba por un mediodía UTC que allí ya cae en el día posterior. Lo encontró la prueba, no la revisión.
- Dos controles del verificador solo miraban `*.test.ts`. Las pruebas de componente en `.tsx` habrían **desaparecido del recuento sin dejar ningún rojo** —la misma familia de defecto que el guion existe para impedir—. `contar-pruebas` y `metricas` recorren ahora también `.tsx`, y `metricas` mide `@ncr/config` y `@ncr/web`, que estaban fuera de la corrida.

**Cómo ejecutarlas:** `pnpm test` · `pnpm --filter @ncr/web test` · `pnpm verificar:etapa`.

### Veredicto literal de §2.8.0

Ejecución del 2026-09-09 tras la cuarta ronda, con base PostgreSQL local (`--con-base`):

```
▸ 4 · lint y typecheck
   ✓ pnpm lint
   ✓ pnpm typecheck

▸ 5 · suite completa
   @ncr/providers:test:       Tests  24 passed (24)
   @ncr/config:test:       Tests  39 passed (39)
   @ncr/domain-core:test:       Tests  328 passed (328)
   @ncr/web:test:       Tests  134 passed (134)
   @ncr/api:test:       Tests  363 passed (363)
   ✓ suite completa en verde

▸ 6 · ningún fichero de prueba se quedó sin recoger
   ✓ 74 de 74 ficheros de prueba ejecutados

▸ 7 · umbrales de cobertura por capa (§2.4)
     OK   dominio (packages/domain-core/src): lineas 98.66 % · ramas 97.67 % · funciones 98.72 % (umbral 90 %, 28 archivos)
     OK   aplicacion (**/aplicacion/**): lineas 98.28 % · ramas 91.46 % · funciones 98.36 % (umbral 90 %, 20 archivos)
     OK   global: lineas 77.12 % · ramas 87.28 % · funciones 85.47 % (umbral 70 %, 185 archivos)
   ✓ las tres capas cumplen su umbral

▸ 8 · portabilidad de las superficies con shell (macOS/BSD y CI/GNU)
   ✓ portabilidad: 16 superficies con shell sin construcciones divergentes BSD/GNU (.sh, scripts de package.json, .husky/, run: de workflows, Makefile)

▸ 9 · pruebas negativas de los propios controles
   ✓ PRUEBAS NEGATIVAS: los 11 controles detectan su violación y aceptan el caso legítimo, sin tocar el árbol

▸ 10 · fronteras de arquitectura y secretos
   ✓ fronteras (DoD ETAPA 02)
   ✓ frontera-modulos: 7 módulos (autenticacion, autorizaciones, biometria, eventos, padron, tablero, zonas) y ninguna importación entra por dentro
   ✓ sin secretos
   ✓ KPI-11: sin ISAPI ni IPs de dispositivo fuera de packages/providers/
   ✓ sin claves ajenas vigentes hacia tablas append-only (2 declaradas, 2 retiradas, 4 tablas vigiladas)

▸ 10b · el contrato OpenAPI tiene tipos y el cliente generado está al día
   ✓ 18 de 35 operaciones con respuesta tipada; 17 exentas con etapa declarada
   ✓ contrato y cliente generado al día respecto de los controladores

▸ 11 · latencia del canal de tiempo real bajo carga (KPI-25)
   alertas entregadas: 200 de 200
   p50 / p95 / p99   : 2 / 5 / 8 ms
   maximo            : 11 ms
   umbral KPI-25     : 10000 ms
   ✓ KPI-25 con margen sobre el umbral

▸ 12 · esquema y aislamiento en --modo-supabase
   ✓ migraciones, semillas y suite SQL

▸ 12b · arranque en frío: base vacía → migraciones → superadministrador
   ✓ una base recién migrada llega a un superadministrador con claims válidos
   ✓ y esa sesión ENTRA: la API la acepta con aal2 y la rechaza con aal1

▸ 13 · KPI-03 y la inmutabilidad de un evento REAL, contra base
   ✓ 100 inserciones concurrentes, 0 duplicados (KPI-03)
   ✓ UPDATE y DELETE rechazados sobre un evento real (RN-03, CA-23)
   ✓ 50 ingresos simultáneos sobre 10 plazas, ni una de más (RN-14, CA-14)

▸ 14 · estabilidad: la suite da lo mismo tres veces seguidas
      corrida 1/3: codigo 0 · @ncr/api:test: Tests 363 passed (363) · @ncr/config:test: Tests 39 passed (39) · @ncr/domain-core:test: Tests 328 passed (328) · @ncr/providers:test: Tests 24 passed (24) · @ncr/web:test: Tests 134 passed (134)
      corrida 2/3: codigo 0 · @ncr/api:test: Tests 363 passed (363) · @ncr/config:test: Tests 39 passed (39) · @ncr/domain-core:test: Tests 328 passed (328) · @ncr/providers:test: Tests 24 passed (24) · @ncr/web:test: Tests 134 passed (134)
      corrida 3/3: codigo 0 · @ncr/api:test: Tests 363 passed (363) · @ncr/config:test: Tests 39 passed (39) · @ncr/domain-core:test: Tests 328 passed (328) · @ncr/providers:test: Tests 24 passed (24) · @ncr/web:test: Tests 134 passed (134)
   ✓ OK estabilidad: 3 corridas forzadas (sin caché de turbo) con resultado idéntico y ningún error sin manejar

VERIFICACIÓN DE ETAPA: correcta — se puede escribir el informe
```

**La primera ejecución salió FALLIDA**, y sus tres hallazgos eran reales:

1. Crear `comun/presentacion/` para un DTO compartido convirtió `comun` en módulo a ojos de `frontera-modulos` —`esModulo` se deriva de la estructura, y basta una carpeta con nombre de capa—: 32 violaciones de golpe, las importaciones de siempre ahora ilegales. El control tenía razón: o `comun` es fontanería y no lleva capas, o es un módulo y se entra por su barril. Se eligió lo primero.
2. KPI-11: los datos de prueba del tablero traían IPs con forma de direccionamiento real y el nombre del fabricante en una referencia de bóveda. Un dato de prueba con forma de topología real acaba copiado en un fichero de configuración.
3. `FuenteFalsa implements Partial<EventSource>` no compilaba: es un doble, no una implementación parcial.

### 6.bis · Segunda ronda: el CI, y lo que la revisión destapó

El cierre de 09-A pasó en macOS y **falló en el CI**, en las cuatro
comprobaciones y siempre en la misma sonda: la décima, la que esta etapa añadió.

**Qué necesitaba el espejo que en CI no existía.** `contrato-desfasado.mjs`
regenera el contrato ejecutando `apps/api/dist/openapi.js`, que está en
`.gitignore`. En el equipo de desarrollo existía porque `verificar-etapa.sh`
compila en el paso 3, seis pasos antes de las sondas; en el flujo del CI,
«Pruebas negativas» corre **antes** de «Compilación, lint y tipos», así que
sobre un checkout limpio no había nada que ejecutar. Reproducido en local
borrando el `dist`: mismo mensaje, palabra por palabra.

El fallo fue **ruidoso** —«el espejo no reproduce el estado al día»— porque la
sonda comprueba su línea base antes de mutar nada. Sin esa comprobación previa
habría dado verde sin ejercitar el control. Aun así, un control que solo
funciona si alguien compiló antes no es un control: **la sonda compila lo que
necesita**, y se verificó con el árbol sin ningún artefacto.

**La revisión de las otras nueve, con el mismo criterio, encontró tres cosas:**

| Hallazgo                                        | Por qué pasaba en vacío                                                                                                                                                                                                                                                                |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sonda 6** · era la más débil de las diez      | Solo exigía `codigo !== 0`. Un `.nvmrc` que no llegara al clon, o un fallo al arrancar, la habrían dado por buena: habría informado «detectado» sin que el control detectara nada. Ahora exige el motivo y comprueba también el caso legítimo                                          |
| **Sonda 3** · sin mitad positiva                | Solo exigía que el control fallara. Un `contar-pruebas.mjs` que fallara siempre habría seguido en verde                                                                                                                                                                                |
| **`metricas.mjs`** · tenía el dato y no actuaba | Imprimía «66 de 66 ficheros» y se limitaba a enseñarlo. `contar-pruebas.mjs` sí falla ante el descuadre, pero **no corría en el CI**: allí un fichero de prueba que nadie ejecutara salía impreso en el informe y verde en el resultado, y quien mira un CI en verde no lee las cifras |

Las tres correcciones se comprobaron **por mutación**: con los controles rotos a
propósito, las sondas 3 y 6 se ponen rojas donde antes daban verde, y un fichero
de prueba huérfano rompe `metricas`.

**Y una cuarta, por otra vía.** Cuatro controles se probaban en «Pruebas
negativas» —donde se comprueba que detectan su violación— pero **no se
ejecutaban nunca contra el repositorio**: `frontera-modulos`,
`frontera-append-only`, `contrato-tipado` y `contrato-desfasado`. Entran como
pasos del flujo.

---

## 6.ter · Lo añadido tras la revisión del cliente

**Contraste.** `#DC3341` aprobado. Las cifras de `03-mockups.md` §5.6 quedan
corregidas con las medidas reales, y con la explicación de dónde salía el
«≈ 3,9»: era `#E63946` contra el **lienzo** (3,954), no contra el blanco de
tarjeta (4,168). El que sí estaba mal era el «≈ 4,4» del texto blanco sobre
relleno, que medido da 4,168.

**D-39 · `/auth/mfa/*` retirado** (ADR-008). Se elimina el vertical completo,
no solo las rutas: dejar `ServicioMfa` sin exponer habría sido código muerto y
la ETAPA 13 lo marcaría igual. RN-20 y CA-25 no se tocan.

**Recuperación de contraseña.** Solicitud, correo de un solo uso y página de
contraseña nueva, con respuesta uniforme —mismo texto, mismo código y mismo
camino de ejecución exista o no la cuenta— y dos limitadores, por IP y por
identidad. El canje del token ocurre en el servidor.

**El gancho de _custom claims_ que faltaba (migración 0024).** La guía de
conexión lo describía y lo dejaba anotado como trabajo de la ETAPA 03; al
construir el acceso se comprobó que **nunca llegó a escribirse**. Ningún token
de Supabase llevaba `rol` ni `copropiedad_id`, así que el sistema fallaba
cerrado —correcto— y era **inutilizable**: nadie podía entrar a la consola. Es
el hueco de backend más grande que esta etapa encontró, y no se veía desde
ninguna prueba porque la suite firma sus propios tokens.

## 6.quater · El arranque en frío, y por qué doce controles no lo vieron

El despliegue real falló en dos puntos encadenados: no había ninguna copropiedad que pasarle al guion, y el guion no podía crear el primer usuario porque `creado_por` es `NOT NULL`.

**El ciclo.** KPI-05 exige columnas de auditoría en toda tabla operativa, y son claves ajenas a `usuarios`:

```
copropiedades.creado_por  →  usuarios
usuarios.creado_por       →  usuarios      (a sí misma)
roles_usuario.creado_por  →  usuarios
```

Sobre una base vacía no hay nada a lo que apuntar. El único modo de romperlo es una fila de `usuarios` que se referencie a sí misma.

**La respuesta a la pregunta del cliente: el mecanismo existía, y estaba en el sitio equivocado.** `supabase/seed/seed.sql` lo resuelve —y bien—: fija `request.jwt.claims` con una identidad de plataforma, que es la misma vía que usa la aplicación y no un privilegio especial, y crea el actor autorreferenciado. Pero lo hace **dentro del fichero de datos de demostración**, en la misma transacción que crea «Urbanización Mira», sus viviendas y sus residentes. En producción nadie ejecuta ese fichero. La identidad que el sistema necesita para existir estaba atrapada en un fichero cuyo propósito son datos falsos.

**Por qué ninguna prueba lo delataba, que es lo que importa.** No es que las pruebas se salten el camino: es que **entre las dos suites cubrían todo menos el único camino que un despliegue recorre**.

| Suite                              | Qué hace                                         | Por qué no ve esto                                                           |
| ---------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------- |
| SQL (`verificar.sh --con-pruebas`) | Migraciones → **semillas** → políticas           | Corre siempre después del seed, así que siempre encuentra el actor ya creado |
| API (`vitest`)                     | Firma sus propios tokens, adaptadores en memoria | Nunca toca la base: no hay `creado_por` que violar                           |

Cada una es correcta para lo suyo. El hueco estaba justo entre ambas, y esa forma —«dos controles que se solapan y dejan un hueco en el medio»— es la variante que faltaba en la lista de este proyecto.

**La corrección.** Migración `0025`: el actor de sistema pasa a ser infraestructura, con identificador fijo, y las funciones de aprovisionamiento se ejecutan **en una sola transacción**. Eso último no es un detalle de estilo: `tg_usuario_tenant` es `DEFERRABLE INITIALLY DEFERRED` y se comprueba al commit, así que el usuario y su rol deben escribirse juntos — y cada petición REST es una transacción distinta. El guion antiguo no podía funcionar **ni arreglando `creado_por`**.

**Ninguna restricción se debilitó.** Las columnas siguen siendo `NOT NULL`; lo que hay es un actor explícito y trazable, y las filas de arranque quedan atribuidas a él.

**Tres defectos más, que solo aparecen ejecutando:**

| Defecto                                                                      | Cómo se veía                                                                                                                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `0024` daba por hecho el rol `supabase_auth_admin`                           | En un clúster desnudo no existe: la migración abortaba en su primer `GRANT`. Lo aporta la plataforma, igual que `service_role` |
| La aserción de `0025` medía **visibilidad RLS**, no existencia               | Decía «no existe el actor de sistema» mientras un `INSERT` posterior chocaba con su clave primaria                             |
| La validación de `arranque_vincular_usuario` leía antes de fijar el contexto | Respondía «no existe esa copropiedad» sobre una que sí existía — el mismo mensaje engañoso que originó todo esto               |

**La prueba.** `supabase/arranque-en-frio.sh` recorre base vacía → migraciones sin semillas → aprovisionamiento → claims válidos, y comprueba también que la base parte vacía de verdad, que ninguna columna de auditoría perdió su `NOT NULL` —con una única excepción declarada, `auditoria_seguridad.creado_por`, que caduca sola—, que un identificador inexistente se rechaza con causa, que repetir no duplica y que el gancho no fabrica `aal`. Cuatro mutaciones comprobadas. Es el paso **12b** de `verificar-etapa.sh --con-base`.

---

---

## 6.quinquies · El segundo factor, y el pendiente que describía mal el problema

Con las migraciones aplicadas, la copropiedad creada y el superadministrador vinculado, el sistema **seguía siendo inaccesible**: no había forma de inscribir el TOTP que el guard exige.

**P-14 estaba mal declarado, y ese es el hallazgo.** Decía «no hay pantalla de inscripción en la consola» y lo resolvía con «hoy se hace desde el panel». Esa salida no existe: el panel de Supabase, en `Authentication → Users`, solo ofrece _Remove MFA factors_; `Account → Security` es la cuenta del operador del panel, no la del usuario de la aplicación. Y hace bien en no ofrecerlo — un factor cuyo secreto pasó por manos de un tercero no es un segundo factor. El pendiente describía una comodidad ausente cuando lo que describía era un sistema en el que **ningún rol administrativo podía entrar**.

**La pantalla.** Inscripción sobre la propia sesión: QR, la clave en texto para quien no puede escanear —una portería sin cámara, un gestor de contraseñas de escritorio— y el código de verificación. La petición de alta **no lleva ningún identificador de usuario**: el servidor lo toma de la cookie `httpOnly`. No es una comprobación que se pueda olvidar; es que no existe el dato con el que equivocarse, y hay una prueba que se rompe si alguien lo añade.

**Códigos de recuperación.** Supabase no los ofrece —su respuesta a perder el teléfono es tener varios factores, que no sirve si solo había uno—, así que los emite la API: diez, entregados una sola vez, guardados **solo como hash**, comparados en tiempo constante y de un solo uso garantizado por el `DELETE` que consume, no por el `SELECT` que comprueba. Un código **no da acceso**: retira el factor perdido para poder inscribir otro. El `aal2` sigue emitiéndolo Supabase (ADR-008).

**Y también existe la vía por API**, que es la que el cliente preguntaba: contraseña → `POST /auth/v1/factors` → `challenge` → `verify`, con la llave **publicable** y el token del propio titular. La consola hace exactamente esas tres llamadas. Queda escrita en la guía para desbloquearse sin navegador.

### El arranque en frío llega ahora hasta «alguien puede entrar»

El guion se paraba en «la base emite claims», que no es lo mismo. Quien decide si se entra es el guard de la API, que es TypeScript y no SQL. Ahora el guion **vuelca los claims que la base produjo de verdad** y una suite los mete por el stack HTTP completo: `aal2` entra, `aal1` no entra —RN-20 no se relajó por comodidad de arranque—, y la ruta de recuperación sí es alcanzable con `aal1`, que es la excepción declarada sin la cual quien pierde el teléfono se queda fuera para siempre.

**Sonda 11 de las pruebas negativas**, sin necesidad de PostgreSQL porque lo que se pone a prueba es la suite y no la base: con claims bien formados pasa entera; con el rol cambiado se rompe; sin fichero **se omite y la omisión queda escrita en la salida**, que es lo que el paso 12b comprueba. Una suite que se omite en silencio es un verde que no ejercitó nada.

### Dos defectos más de la familia, uno dentro de las propias pruebas

| Defecto                                                                | Cómo se veía                                                                                                                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| El reinicio del limitador entre pruebas hacía `Object.keys` sobre un `Map` | Devuelve `[]` siempre: el reinicio existía y no reiniciaba nada. La suite se llenaba de `429` sin decir por qué. Ahora se comprueba la **forma** antes de usarla |
| La ruta de inscripción devolvía `400` con el proveedor caído          | «Tu petición está mal» cuando no había nada mal en su petición, y la consola no podía ofrecer reintentar. El estado sale del motivo, no de «lo que no sea 429» |

### El NIT rechazaba el formato colombiano

`^[0-9]{5,15}$` no admite `900123456-7`, que es como se escribe. Migración `0026`: normalización en la base —el dígito de verificación se conserva, los puntos y espacios no—, `CHECK` que admite la forma con guion, y **validación previa en los guiones**, para que un formato equivocado produzca una instrucción y no un error crudo de restricción que hace parecer rota la guía.

---

## 7 · Verificación de seguridad (§2.7)

| #   | Medida                   | Estado en esta etapa                                                                                                                                                                                             |
| --- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Secretos solo en entorno | ✅ Configuración `server-only` validada; **ninguna variable `NEXT_PUBLIC_`**; `.env.example` sin valores; escaneo limpio en 407 ficheros                                                                         |
| 2   | CORS restrictivo         | ✅ Sin cambios en la API. La consola no hace peticiones entre orígenes: todo va a su propio origen                                                                                                               |
| 3   | Validación en el backend | ✅ Las rutas del BFF validan forma antes de reenviar; la validación real sigue siendo la del `ValidationPipe` de la API                                                                                          |
| 4   | Anti inyección SQL       | ✅ El adaptador del tablero es todo parametrizado, incluida la zona horaria de `AT TIME ZONE`; columnas enumeradas, nunca `SELECT *`                                                                             |
| 5   | Rate limiting            | ✅ El del backend se conserva. El canal reconecta con jitter para no disparar el limitador; el 429 se propaga con su `Retry-After`                                                                               |
| 6   | RLS y doble camino       | ✅ Las tres rutas nuevas cuelgan de `copropiedades/:id` y **entraron solas** en el recorrido de aislamiento por los dos caminos; hay además una aserción explícita en la suite                                   |
| 7   | CSP                      | ✅ Nonce por petición, sin `unsafe-inline`; `unsafe-eval` solo en desarrollo y con prueba que impide que se cuele. Más HSTS, `nosniff`, `Referrer-Policy` y `Permissions-Policy` con cámara y micrófono cerrados |
| 8   | Transversales            | ✅ MFA por `aal2`; RBAC declarativo en la API y ocultación por rol en la interfaz; token en cookie `httpOnly`; evidencia por URL firmada **sin cachear**; el service worker no guarda nada autenticado           |

---

## 8 · Deuda técnica, supuestos y pendientes

| Id        | Asunto                                                                                                                                                                                                                                                                                                                                                          | Estado                                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **D-39**  | `/auth/mfa/inscripcion` y `/auth/mfa/verificacion` son **inalcanzables para los roles administrativos**: el guard exige `aal2` antes que el guard de roles, y esos endpoints exigen rol administrativo. Un administrador sin segundo factor no puede llegar a inscribirlo. Además, verificar ahí no cambiaría el `aal` del token, así que no desbloquearía nada | **Resuelto** · retiradas. Supabase Auth es el mecanismo autoritativo ([ADR-008](../decisiones/ADR-008-supabase-auth-como-mecanismo-autoritativo-de-mfa.md)) |
| **D-40**  | El relleno rojo con etiqueta blanca no alcanza AA (4,168 medido). Resuelto con `marca.boton` = `#DC3341` bajo la salida que prevé §5.6                                                                                                                                                                                                                          | **Resuelto**, sujeto a su confirmación                                                                                |
| **D-41**  | El fichero generado del cliente no se formatea ni se lintea. Descubierto porque el gancho de pre-commit lo reformateó y `contrato:desfasado` rompió el build al commit siguiente                                                                                                                                                                                | **Resuelto** · en `.prettierignore` y en los `ignores` de ESLint                                                      |
| **S-19**  | `[SUPUESTO]` «Dentro ahora» se deriva del histórico como ingresos menos salidas del día, acotado a cero. Una salida puede no registrarse por fallo de sensor (CU-05, excepción 6a), así que es una aproximación **declarada** en el contrato                                                                                                                    | Vigente                                                                                                               |
| **S-20**  | `[SUPUESTO]` «Visitantes hoy» cuenta autorizaciones **activas cuya vigencia se cruza con el día local**, no las creadas hoy: el mockup cuenta visitas, no altas                                                                                                                                                                                                 | Vigente                                                                                                               |
| **P-13**  | `PENDIENTE DE DEFINICIÓN` El operador de central toma la **primera** copropiedad de su turno para que el tablero no le quede inservible. El selector real llega con la ETAPA 10                                                                                                                                                                                 | Abierto                                                                                                               |
| **P-14**  | `PENDIENTE` **redefinido y cerrado.** Se declaró como «falta la pantalla de inscripción» y se resolvió con «se hace desde el panel». El panel no inscribe factores: el pendiente ocultaba un sistema inaccesible. La pantalla existe y opera solo sobre la propia sesión                                                                            | **Cerrado**                                                                                                           |
| **D-43**  | El arranque en frío no podía escribir la primera fila: `creado_por` es `NOT NULL` y sobre una base vacía no hay a quién atribuirla                                                                                                                                                                                                               | **Resuelto** · migración `0025`, actor de sistema explícito; ninguna restricción se debilitó                          |
| **D-44**  | El `CHECK` del NIT rechazaba `900123456-7`, que es el formato real                                                                                                                                                                                                                                                                               | **Resuelto** · migración `0026` y validación previa en los guiones                                                    |
| **D-45**  | Nadie podía inscribir el segundo factor: el panel de Supabase solo los retira                                                                                                                                                                                                                                                                    | **Resuelto** · pantalla de inscripción y códigos de recuperación                                                      |
| **DT-09** | Sin fuente web: se usa la pila del sistema. Autoalojar Inter entra con el empaquetado de la ETAPA 14; traerla de un CDN abriría `font-src` y `style-src` a un origen externo                                                                                                                                                                                    | Aceptada                                                                                                              |
| **DT-10** | El adaptador vigente del tablero es el de memoria (D-17). Los conteos del padrón salen en cero porque no hay adaptador en memoria del padrón: una carencia **visible en pantalla**, preferible a un número inventado                                                                                                                                            | Aceptada                                                                                                              |
| **DT-11** | `jsdom` no implementa `<dialog>`. Se rellena `showModal`/`close` para probar la lógica; **el atrapado del foco, el Escape y la inercia del fondo no quedan cubiertos** por estas pruebas                                                                                                                                                                        | Declarada                                                                                                             |
| **DT-12** | **Configuración externa sin verificar — la familia «dos suites que se solapan y dejan un intervalo».** Ya aparecieron tres: el gancho de claims, el arranque en frío y la inscripción del factor. Quedan al menos cuatro del mismo tipo, todas con la misma forma: la API prueba su puerto con un doble y la base prueba sus filas, y nadie comprueba el recurso real de la plataforma. **Buckets de evidencia** (que el bucket exista y sea privado, y que un `GET` sin firma lo rechace de verdad — hoy se prueba la fila `evidencias`, no el bucket); **FCM** (credencial de servicio válida y envío real; hoy es un doble); **SMTP y la plantilla de recuperación** con su URL de redirección, recién configurados y nunca ejercitados de punta a punta; **Supabase Realtime** frente al canal SSE propio, que es el que se mide hoy. Diagnóstico declarado antes de la ETAPA 10; la comprobación se construye allí | Declarada |

---

## 9 · Qué debe hacer usted manualmente

1. **Copiar `apps/web/.env.example` a `apps/web/.env.local`** y completar `API_URL`, `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`. Ninguna lleva `NEXT_PUBLIC_`: si alguna lo llevara, acabaría en el paquete del navegador.
2. **Levantar la API** (`pnpm --filter @ncr/api start:dev`) y la consola (`pnpm --filter @ncr/web dev`, puerto 3100).
3. **Comprobar la CSP en el navegador**: abrir la consola de desarrollo y confirmar que no hay violaciones. Es lo único de §2.7.7 que no se puede verificar sin navegador.
4. **Instalar la PWA** desde el menú del navegador y confirmar que arranca en modo independiente y que, sin red, aparece la página de «sin conexión» y no un tablero con cifras viejas.
5. **Inscribir su segundo factor desde la consola**: active TOTP una vez en el panel (`Authentication → Providers → Multi-Factor Authentication`), entre en `/acceso` con su correo y contraseña, y la consola le mostrará el QR y le entregará los diez códigos de recuperación. **Guárdelos**: se muestran una sola vez. El paso a paso, y la vía equivalente por API, en [`docs/guias/RECUPERACION_Y_USUARIOS.md`](../guias/RECUPERACION_Y_USUARIOS.md) §B.6.
6. **Confirmar la variante `marca.boton`** (#DC3341) para el relleno de botones con etiqueta blanca, o indicar si prefiere conservar `#E63946` subiendo la etiqueta a ≥ 18,66 px en negrita.

---

## 10 · Rama y commits

**Rama:** `etapa-09-consola-administracion`, sacada de `develop` actualizado.

| Commit    | Contenido                                                                  |
| --------- | -------------------------------------------------------------------------- |
| `5030194` | Módulo `tablero`, tipos de respuesta en OpenAPI y el control que los exige |
| `d279066` | Cliente generado en `packages/contracts` y los dos controles de contrato   |
| `109d15a` | Preset compartido, marco de la consola, acceso con MFA y tablero           |
| `297a259` | 49 pruebas de lo que falla en silencio; dos controles que no veían `.tsx`  |
| `579931e` | ADR-006 (datos y estado) y ADR-007 (cliente generado)                      |
| `1746730` | Los tres defectos que cazó la primera ejecución del verificador            |
| `c407265` | Segunda ronda: el fallo del CI y la revisión de las diez sondas             |
| `1e2cd39` | Arranque en frío (0023-0025) y la prueba que lo recorre entero              |
| `3ed32e5` | El informe del arranque en frío y el hueco entre las dos suites             |
| `77a821b` | Inscripción del segundo factor, códigos de recuperación, NIT (0026), sonda 11 |
