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

| Fichero                                                                                    | Propósito                                                                       |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `packages/domain-core/src/tiempo/ventana-del-dia.ts`                                       | «Hoy» según la zona de la copropiedad; función pura con instante inyectado      |
| `packages/domain-core/src/tiempo/ventana-del-dia.test.ts`                                  | 10 pruebas: husos, cambios de horario, bordes de medianoche                     |
| `apps/api/src/tablero/aplicacion/puertos.ts`                                               | `RepositorioTablero` y sus proyecciones. **Sin `credencialRef`**                |
| `apps/api/src/tablero/aplicacion/casos-de-uso.ts`                                          | `ConsultarIndicadores`, `ConsultarAccesosPorHora`, `ConsultarDispositivos`      |
| `apps/api/src/tablero/aplicacion/casos-de-uso.test.ts`                                     | 14 pruebas de las dos reglas: ventana del día y estado por latido               |
| `apps/api/src/tablero/infraestructura/repositorio-tablero-pg.ts`                           | Adaptador PostgreSQL, todo parametrizado, columnas enumeradas                   |
| `apps/api/src/tablero/infraestructura/repositorio-tablero-en-memoria.ts`                   | Adaptador vigente (D-17); se apoya en los repositorios de eventos por su barril |
| `apps/api/src/tablero/presentacion/tablero.controller.ts`                                  | Tres rutas bajo `copropiedades/:id/tablero`                                     |
| `apps/api/src/tablero/presentacion/respuestas.ts`                                          | DTOs de salida del tablero                                                      |
| `apps/api/src/tablero/{tablero.module.ts,index.ts}`                                        | Raíz de composición y barril                                                    |
| `apps/api/src/comun/respuestas.ts`                                                         | `ErrorApiDto`, `DetalleDeErrorDto` y el enumerado de motivos                    |
| `apps/api/src/{autenticacion,eventos,multiempresa,salud}/**/respuestas.ts`                 | DTOs de salida de los controladores que consume la 09-A                         |
| `apps/api/test/tablero.e2e.test.ts`                                                        | 9 pruebas, incluida la que exige que la credencial no salga                     |
| `apps/api/src/autenticacion/dominio/codigos-recuperacion.ts`                               | Generación, hash SHA-256 y cotejo en tiempo constante. Función pura             |
| `apps/api/src/autenticacion/aplicacion/puertos.ts`                                         | `RepositorioCodigosMfa` y `AdministradorDeFactores`                             |
| `apps/api/src/autenticacion/infraestructura/{codigos-mfa-en-memoria,factores-supabase}.ts` | Adaptadores: almacén y retirada de factores                                     |
| `apps/api/test/{codigos-recuperacion,arranque-en-frio}.e2e.test.ts`                        | Consumo único, aislamiento entre usuarios; y «esta sesión ENTRA»                |
| `supabase/migrations/…_0026_nit_y_codigos_mfa.sql`                                         | Normalización del NIT y tabla de códigos (solo el hash), con RLS forzada        |
| `supabase/arranque-en-frio.sh`                                                             | Base vacía → migraciones → aprovisionamiento → claims reales volcados           |

### Contratos y verificación

| Fichero                                  | Propósito                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `packages/contracts/src/generado/api.ts` | Cliente **generado**. No se formatea ni se lintea                         |
| `packages/contracts/src/index.ts`        | Barril de solo tipos, con los alias que usa la consola                    |
| `scripts/lib/contrato-tipado.mjs`        | Ninguna ruta sin respuesta tipada; exenciones con etapa que caducan solas |
| `scripts/lib/contrato-desfasado.mjs`     | Regenera en un temporal y compara byte a byte                             |

### Consola

| Fichero                                                 | Propósito                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `packages/config/src/tailwind-preset.ts`                | Paleta, tipografía, densidad, radios. Con el hallazgo de contraste documentado  |
| `packages/config/src/contraste.ts`                      | Fórmula WCAG 2.1, pura                                                          |
| `packages/config/src/contraste.test.ts`                 | 39 pruebas sobre los pares reales de la consola                                 |
| `apps/web/src/middleware.ts` · `middleware-csp.ts`      | CSP con nonce por petición; la política se prueba como cadena                   |
| `apps/web/src/lib/configuracion.ts`                     | Configuración `server-only`, validada; ninguna variable pública                 |
| `apps/web/src/lib/sesion/*`                             | Cookies `httpOnly`, cliente de identidad, renovación anticipada                 |
| `apps/web/src/lib/api/*`                                | Cliente tipado, proveedor de consultas y las cuatro del tablero                 |
| `apps/web/src/lib/sse/*`                                | Canal en vivo, política de reconexión y contexto de estado                      |
| `apps/web/src/lib/{motivos,navegacion,cn}.ts`           | Los diez motivos en español, navegación por rol, composición de clases          |
| `apps/web/src/app/api/{sesion,ncr}/**`                  | BFF: sesión, segundo factor, estado y proxy hacia la API                        |
| `apps/web/src/app/acceso/**`                            | W-01: credenciales → **inscripción** → segundo factor → códigos de recuperación |
| `apps/web/src/app/api/sesion/mfa/inscripcion/route.ts`  | Alta del factor sobre la propia sesión; la identidad sale de la cookie          |
| `apps/web/src/app/(consola)/tablero/**`                 | W-02                                                                            |
| `apps/web/src/componentes/**`                           | Catálogo: KPI, tabla, dispositivo, distintivo, modal con motivo, estados        |
| `apps/web/public/{manifest.webmanifest,sw.js,iconos/*}` | Base de PWA                                                                     |

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

Ejecución del **2026-09-10**, con `MFA_OBLIGATORIO` ya en el esquema de las dos aplicaciones y el camino del navegador ampliado a su paso 5. PostgreSQL local (`--con-base`) y `DATABASE_URL_PRUEBAS` exportada.

```

▸ 0 · borrando artefactos de compilación (así corre un checkout nuevo)
   ✓ dist, .turbo y coverage eliminados

▸ 1 · entorno dentro de lo declarado
   ✓ entorno: Node 22.22.2 y pnpm dentro de engines · .nvmrc 22.22.2

▸ 2 · instalación coherente con el lockfile
   ✓ pnpm install --frozen-lockfile

▸ 3 · compilación desde cero
   ✓ pnpm build

▸ 4 · lint y typecheck
   ✓ pnpm lint
   ✓ pnpm typecheck

▸ 5 · suite completa
   @ncr/providers:test:       Tests  24 passed (24)
   @ncr/config:test:       Tests  39 passed (39)
   @ncr/domain-core:test:       Tests  328 passed (328)
   @ncr/web:test:       Tests  168 passed (168)
   @ncr/api:test:       Tests  370 passed (370)
   ✓ suite completa en verde

▸ 6 · ningún fichero de prueba se quedó sin recoger
   ✓ 78 de 78 ficheros de prueba ejecutados

▸ 7 · umbrales de cobertura por capa (§2.4)
     OK   dominio (packages/domain-core/src): lineas 98.66 % · ramas 97.67 % · funciones 98.72 % (umbral 90 %, 28 archivos)
     OK   aplicacion (**/aplicacion/**): lineas 98.28 % · ramas 91.46 % · funciones 98.36 % (umbral 90 %, 20 archivos)
     OK   global: lineas 77.98 % · ramas 87.55 % · funciones 86.07 % (umbral 70 %, 190 archivos)
   ✓ las tres capas cumplen su umbral

▸ 8 · portabilidad de las superficies con shell (macOS/BSD y CI/GNU)
   ✓ portabilidad: 16 superficies con shell sin construcciones divergentes BSD/GNU (.sh, scripts de package.json, .husky/, run: de workflows, Makefile)

▸ 9 · pruebas negativas de los propios controles
   ✓ PRUEBAS NEGATIVAS: los 13 controles detectan su violación y aceptan el caso legítimo, sin tocar el árbol

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
   p50 / p95 / p99   : 2 / 4 / 7 ms
   maximo            : 11 ms
   umbral KPI-25     : 10000 ms
   ✓ KPI-25 con margen sobre el umbral

▸ 12 · esquema y aislamiento en --modo-supabase (requiere --con-base)
   ✓ migraciones, semillas y suite SQL

▸ 12b · arranque en frío: base vacía → migraciones → superadministrador (requiere --con-base)
   ✓ una base recién migrada llega a un superadministrador con claims válidos
   ✓ y esa sesión ENTRA: la API la acepta con aal2 y la rechaza con aal1

▸ 12c · el camino del NAVEGADOR: contraseña → factor → QR → aal2 → tablero
   ✓ el camino completo se recorre en el navegador

▸ 13 · KPI-03 y la inmutabilidad de un evento REAL, contra base (requiere --con-base)
   ✓ 100 inserciones concurrentes, 0 duplicados (KPI-03)
   ✓ UPDATE y DELETE rechazados sobre un evento real (RN-03, CA-23)
   ✓ 50 ingresos simultáneos sobre 10 plazas, ni una de más (RN-14, CA-14)

▸ 14 · estabilidad: la suite da lo mismo tres veces seguidas
      corrida 1/3: codigo 0 · @ncr/api:test: Tests 370 passed (370) · @ncr/config:test: Tests 39 passed (39) · @ncr/domain-core:test: Tests 328 passed (328) · @ncr/providers:test: Tests 24 passed (24) · @ncr/web:test: Tests 168 passed (168)
      corrida 2/3: codigo 0 · @ncr/api:test: Tests 370 passed (370) · @ncr/config:test: Tests 39 passed (39) · @ncr/domain-core:test: Tests 328 passed (328) · @ncr/providers:test: Tests 24 passed (24) · @ncr/web:test: Tests 168 passed (168)
      corrida 3/3: codigo 0 · @ncr/api:test: Tests 370 passed (370) · @ncr/config:test: Tests 39 passed (39) · @ncr/domain-core:test: Tests 328 passed (328) · @ncr/providers:test: Tests 24 passed (24) · @ncr/web:test: Tests 168 passed (168)
   ✓ OK estabilidad: 3 corridas forzadas (sin caché de turbo) con resultado idéntico y ningún error sin manejar

▸ 15 · ningún paso declarado se quedó sin ejecutar
   ✓ OK 19 de 19 pasos ejecutados

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

| Defecto                                                                    | Cómo se veía                                                                                                                                                     |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El reinicio del limitador entre pruebas hacía `Object.keys` sobre un `Map` | Devuelve `[]` siempre: el reinicio existía y no reiniciaba nada. La suite se llenaba de `429` sin decir por qué. Ahora se comprueba la **forma** antes de usarla |
| La ruta de inscripción devolvía `400` con el proveedor caído               | «Tu petición está mal» cuando no había nada mal en su petición, y la consola no podía ofrecer reintentar. El estado sale del motivo, no de «lo que no sea 429»   |

### El NIT rechazaba el formato colombiano

`^[0-9]{5,15}$` no admite `900123456-7`, que es como se escribe. Migración `0026`: normalización en la base —el dígito de verificación se conserva, los puntos y espacios no—, `CHECK` que admite la forma con guion, y **validación previa en los guiones**, para que un formato equivocado produzca una instrucción y no un error crudo de restricción que hace parecer rota la guía.

---

## 6.sexies · El 503 intermitente del camino de acceso

Reportado desde el proyecto real, con el registro que lo delata:

```
POST /api/sesion/mfa/inscripcion 503 in 840ms
POST /api/sesion/mfa/inscripcion 200 in 849ms
```

La primera falla, la segunda funciona, y la pantalla se queda con el error de la primera: mensaje rojo, ningún QR. El sistema funcionaba y la inscripción era imposible.

### Por qué había dos llamadas, y por qué una fallaba

**Dos, porque el navegador hace dos.** `reactStrictMode: true` en `next.config.mjs`, que es lo correcto: en desarrollo React monta, limpia y vuelve a montar para descubrir efectos que no toleran repetirse. Este no lo toleraba. En producción no habría modo estricto, pero sí un doble clic o un reintento, que producen exactamente lo mismo.

**Una fallaba porque la inscripción es leer-y-borrar-y-crear, sin atomicidad.** Cada petición lista los factores del titular, borra los que estén a medio inscribir y crea uno nuevo con un nombre **fijo**. Dos a la vez: las dos leen la lista vacía, las dos crean con el mismo nombre y el proveedor rechaza la segunda. El otro orden es peor todavía —la segunda borra el factor que la primera acaba de crear y devuelve un QR de un factor que ya no existe—, y ese sí habría sido un fallo silencioso.

**Y ese rechazo se contaba mal.** `exigirOk` plegaba en `SERVICIO_NO_DISPONIBLE` todo lo que no fuera 400/401/403/429. Un 422 de «ya existe un factor con ese nombre» —recuperable, y que el proveedor explica en su `error_code`— llegaba a la pantalla como «no se pudo contactar con el servicio de identidad»: un mensaje que manda a investigar la red cuando el problema era nuestro.

**Lo que impidió diagnosticarlo desde el registro** es que no había registro. La ruta traducía el fallo a un número y descartaba la causa, así que en el log solo quedaba `503`. Es la misma familia de siempre en otra forma: no un control que no comprueba, sino un fallo que no deja rastro.

### Las tres correcciones, y por qué son tres

| Capa       | Corrección                                                                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ruta       | **Una inscripción por titular a la vez.** Las peticiones concurrentes comparten la misma y reciben la misma respuesta. La clave es un hash del token, nunca el token |
| Cliente    | Un conflicto de nombre se **reintenta una vez** con otro nombre. Es la red de seguridad para varias instancias, donde un mapa en memoria no alcanza                  |
| Traducción | 409/422 deja de ser «servicio no disponible»: tiene motivo propio, mensaje propio y se **registra con el estado y el `error_code` del proveedor** —nunca el cuerpo—  |

No es reintentar más veces: es **no hacer dos veces la misma operación**. El reintento cubre lo que el deduplicado por proceso no puede cubrir.

### Y la pantalla, que es la mitad que dejaba al usuario fuera

Aunque el servidor se hubiera arreglado solo, la pantalla habría seguido inservible: pintaba el error del primer intento y descartaba el QR del segundo. Dos reglas:

1. **El último intento manda.** Cada petición se numera y solo se aplica la respuesta del intento vigente. Una respuesta tardía de un intento superado se descarta entera — ni su error, ni su QR.
2. **El éxito limpia.** Al recibir el QR se borra el error, sea de quien sea. Un mensaje de fallo junto a un QR válido hace que el titular no confíe en lo que sí funciona.

Y una tercera cosa que faltaba: **sin QR ya no se muestra el campo del código**. Un campo donde teclear algo que no se puede obtener era la pantalla que el cliente describió. En su lugar hay el motivo y un botón para reintentar.

Las cuatro correcciones se comprobaron **por mutación**: sin el deduplicado, las dos pruebas que describen el síntoma se ponen rojas; sin la limpieza del error y sin el descarte del intento superado, las suyas también.

### La consola ya no arranca con el entorno incompleto (§2.7.1)

Esto no causó el `503` —la configuración del cliente era correcta—, pero lo destapó: `apps/web` comprobaba **presencia** de tres variables, de forma perezosa, en la primera petición que las necesitara. Un entorno a medias no se manifestaba como «la consola no arranca» sino como un `503` en mitad del acceso, que es el peor sitio para descubrirlo.

Ahora usa Zod como la API, y `instrumentation.ts` la valida al arrancar el proceso: si algo falta o tiene mal la forma, imprime el motivo y sale con **78 (`EX_CONFIG`)** — el código que distingue «mal configurado» de «se ha caído», para que un supervisor deje de reintentar. Presencia no es validez: se comprueban esquema y forma, se exige `https` fuera de local, y **una llave `sb_secret_` en la consola impide arrancar** con el motivo escrito — sería la llave que omite la RLS en el proceso que atiende al navegador (§2.7.6). Los mensajes nombran la variable y nunca su valor.

---

## 6.septies · El ciclo cerrado del segundo factor, y el camino recorrido entero

Cuatro rondas seguidas sobre lo mismo, cada corrección destapando el siguiente eslabón. El diagnóstico de fondo es uno solo y lo dijo el cliente: **nadie había recorrido el camino completo**. Lo que sigue son los defectos, y después la medida que impide que vuelva a pasar.

### La raíz común: se listaban los factores contra una ruta que no existe

`GET /auth/v1/factors` **no existe en GoTrue**. Los factores viven en el objeto del usuario. La consola pedía esa ruta, recibía un 404, y el código lo interpretaba como «este usuario no tiene ningún factor». De ese único error salieron tres de los cuatro síntomas:

| Síntoma reportado                                  | Qué era en realidad                                                                                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `403 insufficient_aal` al inscribir                | La consola mandaba a inscribir a quien **ya tenía un factor verificado**. Supabase exige `aal2` para añadir un segundo: el ciclo cerrado |
| «El código no es válido o ya caducó»               | El código nunca llegó a evaluarse. El rechazo era por nivel de sesión, y el mensaje acusaba al titular de un fallo que no era suyo       |
| El factor «a medias» y el acceso rechazado después | La limpieza de factores sin verificar tampoco limpiaba nada: leía de la misma ruta inexistente                                           |

**La afirmación de §B.6 era medio falsa y hay que decirlo.** Escribí que «la inscripción de TOTP funciona con la sesión `aal1` del propio titular». Es cierto **solo para el primer factor**: en cuanto hay uno verificado, añadir otro exige `aal2`. La guía está corregida.

**Correcciones.** Los factores se leen de `GET /auth/v1/user` (`factors[]`), y esa lectura **falla cerrado**: si no se puede leer, se lanza, en vez de asumir que no hay ninguno — asumirlo fue el defecto. `insufficient_aal` tiene motivo propio y la ruta responde `409` con `siguiente: 'segundo-factor'`, así que la pantalla **cambia de paso sola** en lugar de dejar al titular dando vueltas. Y una inscripción fallida ya no deja residuo: se limpia la marca del factor pendiente.

### El QR: la respuesta lo traía y el navegador no lo pintaba

No era la CSP —`img-src` ya admitía `data:` para los iconos de la PWA—. Era el formato: **GoTrue devuelve `qr_code` como marcado SVG en crudo**, y un `<img src="<svg …">` no tiene nada que cargar, así que el navegador enseña el texto alternativo. Se normaliza a `data:image/svg+xml;base64`, que además es la opción segura: dentro de un `<img>`, un SVG no ejecuta scripts ni carga recursos externos, cosa que insertarlo en el DOM sí permitiría. Sin imagen utilizable ya no se pinta un `<img>` roto: se enseña la clave.

### El `503` de los códigos de recuperación

`/api/ncr/auth/mfa/codigos` es la ruta correcta del BFF; el `503` era **la API sin responder**. El proxy lo traducía a un número y descartaba la causa, así que en el registro solo quedaba `503` y parecía una ruta inexistente. Ahora registra ruta y causa, y el mensaje dice qué comprobar. La pantalla de códigos aplica además la regla del último intento: cada llamada **invalida el juego anterior**, así que pintar una respuesta que no sea la última sería entregar diez códigos que ya no abren nada — y se descubriría el día de perder el teléfono.

### Y el defecto que solo aparece recorriendo el camino: **la API no arrancaba**

Al levantar el proceso real, `node dist/main.js` moría:

```
Nest can't resolve dependencies of the AutenticacionController (?, …)
```

`AutenticacionController` inyecta el puerto de auditoría, que `multiempresa` proveía como módulo `@Global()`. No bastaba. Y las **363 pruebas seguían en verde**, porque `Test.createTestingModule` envuelve `AppModule` en un módulo raíz propio y allí los globales alcanzan a todo: el arnés cubría un grafo de módulos que el proceso real no puede construir. Un puerto que comparten dos módulos no pertenece a ninguno de los dos — vive en `comun/auditoria` y lo provee `NucleoModule`.

### La medida: `e2e/camino-de-acceso.mjs`

Levanta la **API real** y la **consola compilada** —`next build` + `next start`, no `next dev`— contra un doble de Supabase Auth que reproduce la semántica del proveedor, incluidas las tres cosas que costaron una ronda cada una: no existe `GET /factors`, inscribir con `aal1` teniendo un factor verificado da `403 insufficient_aal`, y `qr_code` viene en crudo. Y conduce **Chromium**:

```
✓ la contraseña lleva a la inscripción del factor
✓ el navegador PINTA el QR (210×210, data:image/svg+xml;base64…)
✓ la clave en texto está disponible para quien no puede escanear
✓ la API entrega los 10 códigos de recuperación (10)
✓ la sesión `aal2` entra al tablero
✓ lleva a VERIFICAR, no a inscribir de nuevo
✓ queda UN solo factor verificado: la inscripción no dejó residuo
✓ ninguna petición del propio origen falló · sin errores de consola
```

Tres decisiones que lo hacen valer:

1. **Contra la consola compilada.** En desarrollo, el sobreimpreso de Next inyecta estilos en línea que la CSP rechaza; comprobar ahí obligaría a tolerar violaciones, que es como un control deja de controlar. Compilada, el navegador no se queja de nada.
2. **La prueba cabe dentro de la CSP del producto.** `waitForFunction` evalúa una cadena como JavaScript y la política lo prohíbe; se espera con localizadores. La prueba se adapta a la política, no al revés.
3. **Ninguna comprobación pasa en vacío.** La de los códigos llegó a fallar por su propia prisa —leía la lista antes de que llegara— y la siguiente pasaba sobre cero elementos. Las dos corregidas: se espera lo que se va a afirmar, y afirmar sobre una lista vacía es un fallo.

Es el paso **12c** de `verificar-etapa.sh`, y sin Chromium **no se omite en silencio**: se marca fallo.

---

## 6.octies · Cuatro fallos del propio verificador, y el que no salía

La sexta ronda no la abrió un defecto del producto: la abrió **el verificador**, corriendo en macOS y dando FALLIDA por cuatro motivos. Los cuatro comparten una raíz —**un control que concluye sobre un estado que no es el actual**— y uno de ellos es el peor de la familia: un control que no aparece.

### 1 · El secreto era real, y el gancho no lo vio porque no pasó por él

`e2e/doble-gotrue.mjs` traía una contraseña literal para su usuario de prueba. No es una credencial viva —es un doble local, el correo es `@ejemplo.invalid`— pero **§2.5 no distingue**, y la regla de trabajo del cliente tampoco: ninguna contraseña se inventa ni se versiona. El escáner tenía razón.

Lo que importa más que la línea: el gancho de pre-commit **funciona** —se comprobó introduciendo una violación sintética, y bloquea el commit—, luego ese commit no pasó por él. La contraseña ahora se **sortea en cada corrida** y no existe fuera del proceso.

Y antes de afirmar que no hay que tocar el historial, se recorrió: `git log -S` sobre **todo** el historial buscando valores con forma de llave —`sb_secret_…`, `sb_publishable_…`, claves privadas— devuelve **cero coincidencias con valor**; las nueve apariciones del prefijo son nombres de variable, reglas de validación y documentación. No hay nada que rotar ni que extirpar, y el historial empujado no se reescribe (§2.5).

### 2 · El contrato «desfasado» que no había cambiado

`pnpm contrato` producía 238 líneas de diferencia sobre `openapi.json`: **las mismas 35 rutas, el mismo contenido, otro orden**. Swagger las emite en el orden en que Nest registró los módulos, y mover el puerto de auditoría a `NucleoModule` —lo que hizo arrancar la API en producción, D-50— cambió ese orden.

Por qué en este entorno salió verde: **la última corrida completa era anterior a ese commit**. Ahí está la respuesta honesta a «uno de los dos no mide el estado real»: medía el estado real de un árbol que ya no era el que se empujó. Y el control tenía además un defecto propio: comparar byte a byte un artefacto cuyo orden depende del orden de registro de módulos convierte cualquier reordenamiento en una falsa alarma, y una falsa alarma repetida entrena a ignorar el control. El documento se emite ahora **en orden canónico** (`paths`, `components`, `tags` ordenados): a partir de aquí el fichero depende solo de la forma de la API (**D-51**).

### 3 · Las dos sondas del paso 9: ninguna dejaba rastro

- «La sonda dejó rastro en el banco» era **un diagnóstico falso**. La sonda 1 limpiaba lo suyo y volvía a escanear esperando cero; el escaneo daba uno porque el repositorio tenía el hallazgo del punto 1. El mensaje mandaba a buscar el defecto donde no estaba. Las sondas 1 y 2 toman ahora **línea base antes de mutar**, como ya hacía la 5, y distinguen «el banco arrastra mi residuo» de «el repositorio tiene un hallazgo real».
- «El espejo no reproduce el estado al día» era **consecuencia** del punto 2: el espejo copia el contrato versionado, y si el versionado está desfasado la sonda no puede concluir nada. Verde en cuanto se regeneró el contrato. Además, el banco se construía clonando `HEAD` y copiando tres ficheros sueltos del árbol: ahora **refleja el árbol de trabajo completo**, que es lo que se está verificando (**D-52**).

### 4 · El paso 12c no fallaba ni se omitía: no salía

Nació **dentro del bloque `--con-base`**. Sin base de datos no se ejecutaba, y como no se ejecutaba tampoco imprimía su omisión. La afirmación «sin Chromium no se omite en silencio» era cierta del guardián, y el guardián **no llegaba a correr**; encima miraba `/opt/pw-browsers`, una ruta de Linux, con el entorno de desarrollo objetivo en macOS. Tres correcciones:

1. **12c sale del bloque `--con-base`**, donde nunca debió estar: el camino del navegador no toca PostgreSQL —usa un doble de GoTrue y los adaptadores en memoria— y corre siempre.
2. **El guardián de Chromium vive dentro del propio comando**, resuelve `NCR_CHROMIUM`, `PLAYWRIGHT_BROWSERS_PATH`, `/opt/pw-browsers` y el registro propio de Playwright, y es **lo primero que se comprueba**: sin navegador falla en un segundo con el comando de instalación, en vez de descubrirlo tras compilar la consola.
3. **Paso 15 nuevo: `pasos-ejecutados.mjs`.** Compara los `paso "…"` declarados en el guion con los realmente ejecutados y nombra los que faltan. Los que necesitan base lo dicen **en su propia etiqueta** —`(requiere --con-base)`—, de modo que la exención se lee en la salida y no es un número escondido. Un paso ausente no daba ningún rojo: daba una salida más corta, y una salida más corta se lee como «todo bien» (**D-53**).

### 5 · Y uno más, encontrado al reproducir: el arranque en frío no declaraba su conexión

`arranque-en-frio.sh` documenta `PGHOST`/`PGPORT` y los fijaba **solo dentro del guion hijo**; un `export` de un hijo no vuelve al padre, así que sus propios `psql` hablaban con la instalación por defecto del sistema. Funcionaba únicamente si el operador ya tenía esas variables en su entorno —que es como funcionaba aquí y por qué nunca se vio—. Un guion cuya reproducibilidad depende de algo que no declara no prueba reproducibilidad. Ahora fija los mismos valores por defecto y los exporta (**D-55**).

Y los tres controles nuevos pasan por mutación, como el resto: sondas **12** (un paso declarado que no se ejecuta se nombra y rompe la verificación; y la exención de `--con-base` distingue las dos corridas) y **13** (sin Chromium el camino falla explícitamente). Las pruebas negativas son ahora **13**.

---

## 6.nonies · El interruptor del segundo factor, y por qué el código de seis dígitos devolvía al login

### Lo que el cliente vio, y qué significa cada mitad

> «No genera un QR, sino que directamente me solicita el código de 6 dígitos; al ingresarlo, me regresa al login y no avanza.»

Son dos hechos distintos y solo uno es un defecto.

**Que no aparezca el QR es correcto.** Esa cuenta **ya tiene un factor TOTP verificado** —de los intentos de las rondas anteriores—, y con un factor verificado la pantalla que toca es _verificar_, no _inscribir_. Es exactamente la corrección de D-48: antes mandaba a inscribir de nuevo y el proveedor respondía `403 insufficient_aal`. Si se quiere volver a ver el QR hay que retirar el factor en el panel (Authentication → Users → **Remove MFA factors**).

**Que el código correcto devuelva al login sí es un defecto, y estaba mudo.** La cadena es: la verificación funciona, Supabase emite un token nuevo con `aal2`, la consola lo guarda, y al entrar al tablero `sesionActual()` le pregunta a la API por `GET /auth/sesion`. Si la API responde 401, esa función devolvía **`null` sin decir nada** y el layout hacía `redirect('/acceso')`. El usuario ve «vuelvo al login»; nadie ve por qué.

En un proyecto real, la API rechaza un token bien firmado por tres motivos, y los tres producían el mismo rebote silencioso:

1. **El gancho de claims no está activo**, así que el token no trae `rol` ni `copropiedad_id` — el caso más frecuente, y el que la migración `0024` prepara pero que hay que **habilitar en el panel**.
2. El token es `aal1` con la regla en vigor (RN-20).
3. La firma no se verifica contra el JWKS configurado.

**Corrección:** `sesionActual()` registra ahora el estado devuelto por la API y **los NOMBRES de los claims presentes en el token** —nunca sus valores, nunca el token—, más una pista de los tres motivos. «Vuelve al login» pasa a ser una línea que dice `claims: aal,aud,email,exp,iat,sub` — sin `rol` — y ahí se acaba el misterio (**D-56**).

### El interruptor: `MFA_OBLIGATORIO`

El cliente pidió poder entrar solo con contraseña mientras se cierra ese camino, para poder ensayar la consola. Es una **desviación declarada de RN-20, CA-25 y §2.7.8**, y se ha construido como tal, no como un parche (**D-57**):

- **Una sola variable, el mismo nombre en los dos procesos**, `MFA_OBLIGATORIO`, y el valor por defecto es `true`: un entorno que no la menciona conserva el contrato. Se lee como `'true'`/`'false'` y cualquier otra cosa **detiene el arranque**, porque `Boolean('false')` es `true` y ese es el interruptor de seguridad clásico que queda encendido creyendo que está apagado.
- **Apagarlo hace una sola cosa**: el guard acepta `aal1` en un rol administrativo. Siguen exigiéndose contraseña válida, firma verificada contra el JWKS, rol y aislamiento por copropiedad. La suite lo comprueba pieza por pieza: sin token no se entra, con firma ajena no se entra, y un recurso de otra copropiedad sigue devolviendo 404.
- **`mfaVerificado` conserva su valor real, `false`.** La desviación no se disfraza de segundo factor cumplido, así que ninguna ruta que mire ese campo se engaña.
- **Se anuncia por tres vías**: la API lo grita al arrancar, lo escribe en la bitácora la primera vez que deja pasar un `aal1` —una vez por proceso, no en cada petición—, y **la consola lo muestra en pantalla** en todas las vistas. Un interruptor que solo vive en un `.env` se queda puesto: nadie lee el entorno de un despliegue que funciona.
- **El desajuste entre los dos procesos se detecta y se explica.** Si se apaga en la consola y no en la API, entrar al tablero devolvería al login sin una palabra —el mismo síntoma que motivó todo esto—. Antes de mandar a nadie al tablero, la ruta de acceso comprueba con la API que ese token le sirve; si no, responde con el nombre de la variable que falta.

### Probado en las dos posiciones, y en el navegador

Un interruptor de seguridad tiene dos modos de fallo y el peligroso no es el obvio: que **encendido no encienda** no lo descubre nadie, porque nadie prueba lo que da por hecho. Por eso la primera comprobación es que con el valor por defecto la regla sigue vigente, y por eso las 363 pruebas de la API corren con `MFA_OBLIGATORIO: true` **explícito** en su fixture.

Y el camino del navegador lo recorre entero en su paso 5: levanta **otra API y otra consola** con la variable puesta —se lee al arrancar, que es justo lo que hay que verificar— y comprueba que la contraseña sola llega al tablero, sin QR y sin código, con el aviso visible en pantalla y sin un solo error de consola.

---

## 7 · Verificación de seguridad (§2.7)

| #   | Medida                   | Estado en esta etapa                                                                                                                                                                                                                                                                   |
| --- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Secretos solo en entorno | ✅ Configuración `server-only` validada; **ninguna variable `NEXT_PUBLIC_`**; `.env.example` sin valores; escaneo limpio en 407 ficheros                                                                                                                                               |
| 2   | CORS restrictivo         | ✅ Sin cambios en la API. La consola no hace peticiones entre orígenes: todo va a su propio origen                                                                                                                                                                                     |
| 3   | Validación en el backend | ✅ Las rutas del BFF validan forma antes de reenviar; la validación real sigue siendo la del `ValidationPipe` de la API                                                                                                                                                                |
| 4   | Anti inyección SQL       | ✅ El adaptador del tablero es todo parametrizado, incluida la zona horaria de `AT TIME ZONE`; columnas enumeradas, nunca `SELECT *`                                                                                                                                                   |
| 5   | Rate limiting            | ✅ El del backend se conserva. El canal reconecta con jitter para no disparar el limitador; el 429 se propaga con su `Retry-After`                                                                                                                                                     |
| 6   | RLS y doble camino       | ✅ Las tres rutas nuevas cuelgan de `copropiedades/:id` y **entraron solas** en el recorrido de aislamiento por los dos caminos; hay además una aserción explícita en la suite                                                                                                         |
| 7   | CSP                      | ✅ Nonce por petición, sin `unsafe-inline`; `unsafe-eval` solo en desarrollo y con prueba que impide que se cuele. Más HSTS, `nosniff`, `Referrer-Policy` y `Permissions-Policy` con cámara y micrófono cerrados                                                                       |
| 8   | Transversales            | ⚠️ **MFA por `aal2`, con la desviación declarada D-57** (`MFA_OBLIGATORIO`, por defecto en vigor); RBAC declarativo en la API y ocultación por rol en la interfaz; token en cookie `httpOnly`; evidencia por URL firmada **sin cachear**; el service worker no guarda nada autenticado |

---

## 8 · Deuda técnica, supuestos y pendientes

| Id        | Asunto                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Estado                                                                                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D-39**  | `/auth/mfa/inscripcion` y `/auth/mfa/verificacion` son **inalcanzables para los roles administrativos**: el guard exige `aal2` antes que el guard de roles, y esos endpoints exigen rol administrativo. Un administrador sin segundo factor no puede llegar a inscribirlo. Además, verificar ahí no cambiaría el `aal` del token, así que no desbloquearía nada                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | **Resuelto** · retiradas. Supabase Auth es el mecanismo autoritativo ([ADR-008](../decisiones/ADR-008-supabase-auth-como-mecanismo-autoritativo-de-mfa.md)) |
| **D-40**  | El relleno rojo con etiqueta blanca no alcanza AA (4,168 medido). Resuelto con `marca.boton` = `#DC3341` bajo la salida que prevé §5.6                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | **Resuelto**, sujeto a su confirmación                                                                                                                      |
| **D-41**  | El fichero generado del cliente no se formatea ni se lintea. Descubierto porque el gancho de pre-commit lo reformateó y `contrato:desfasado` rompió el build al commit siguiente                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | **Resuelto** · en `.prettierignore` y en los `ignores` de ESLint                                                                                            |
| **S-19**  | `[SUPUESTO]` «Dentro ahora» se deriva del histórico como ingresos menos salidas del día, acotado a cero. Una salida puede no registrarse por fallo de sensor (CU-05, excepción 6a), así que es una aproximación **declarada** en el contrato                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Vigente                                                                                                                                                     |
| **S-20**  | `[SUPUESTO]` «Visitantes hoy» cuenta autorizaciones **activas cuya vigencia se cruza con el día local**, no las creadas hoy: el mockup cuenta visitas, no altas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Vigente                                                                                                                                                     |
| **P-13**  | `PENDIENTE DE DEFINICIÓN` El operador de central toma la **primera** copropiedad de su turno para que el tablero no le quede inservible. El selector real llega con la ETAPA 10                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Abierto                                                                                                                                                     |
| **P-14**  | `PENDIENTE` **redefinido y cerrado.** Se declaró como «falta la pantalla de inscripción» y se resolvió con «se hace desde el panel». El panel no inscribe factores: el pendiente ocultaba un sistema inaccesible. La pantalla existe y opera solo sobre la propia sesión                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | **Cerrado**                                                                                                                                                 |
| **D-43**  | El arranque en frío no podía escribir la primera fila: `creado_por` es `NOT NULL` y sobre una base vacía no hay a quién atribuirla                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | **Resuelto** · migración `0025`, actor de sistema explícito; ninguna restricción se debilitó                                                                |
| **D-44**  | El `CHECK` del NIT rechazaba `900123456-7`, que es el formato real                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | **Resuelto** · migración `0026` y validación previa en los guiones                                                                                          |
| **D-45**  | Nadie podía inscribir el segundo factor: el panel de Supabase solo los retira                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | **Resuelto** · pantalla de inscripción y códigos de recuperación                                                                                            |
| **DT-09** | Sin fuente web: se usa la pila del sistema. Autoalojar Inter entra con el empaquetado de la ETAPA 14; traerla de un CDN abriría `font-src` y `style-src` a un origen externo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Aceptada                                                                                                                                                    |
| **DT-10** | El adaptador vigente del tablero es el de memoria (D-17). Los conteos del padrón salen en cero porque no hay adaptador en memoria del padrón: una carencia **visible en pantalla**, preferible a un número inventado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Aceptada                                                                                                                                                    |
| **DT-11** | `jsdom` no implementa `<dialog>`. Se rellena `showModal`/`close` para probar la lógica; **el atrapado del foco, el Escape y la inercia del fondo no quedan cubiertos** por estas pruebas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Declarada                                                                                                                                                   |
| **DT-12** | **Configuración externa sin verificar — la familia «dos suites que se solapan y dejan un intervalo».** Ya aparecieron tres: el gancho de claims, el arranque en frío y la inscripción del factor. Quedan al menos cuatro del mismo tipo, todas con la misma forma: la API prueba su puerto con un doble y la base prueba sus filas, y nadie comprueba el recurso real de la plataforma. **Buckets de evidencia** (que el bucket exista y sea privado, y que un `GET` sin firma lo rechace de verdad — hoy se prueba la fila `evidencias`, no el bucket); **FCM** (credencial de servicio válida y envío real; hoy es un doble); **SMTP y la plantilla de recuperación** con su URL de redirección, recién configurados y nunca ejercitados de punta a punta; **Supabase Realtime** frente al canal SSE propio, que es el que se mide hoy. Diagnóstico declarado antes de la ETAPA 10; la comprobación se construye allí | Declarada                                                                                                                                                   |
| **D-46**  | `503` intermitente al inscribir el segundo factor: dos peticiones concurrentes creaban el factor con el mismo nombre fijo, el proveedor rechazaba una con 422 y la traducción la convertía en «servicio no disponible». La pantalla se quedaba con el error del intento fallido                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | **Resuelto** · una inscripción por titular a la vez, reintento por conflicto, motivo propio y registro con causa                                            |
| **D-47**  | `apps/web` no validaba su configuración al arrancar: comprobaba presencia, de forma perezosa. Un entorno incompleto aparecía como un `503` en mitad del acceso                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | **Resuelto** · Zod e `instrumentation.ts`, salida con código 78                                                                                             |
| **D-48**  | Ciclo cerrado del segundo factor: se listaban los factores contra `GET /auth/v1/factors`, que GoTrue no expone; el 404 se leía como «no tiene factores» y la consola mandaba a inscribir a quien ya tenía uno verificado (`403 insufficient_aal`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | **Resuelto** · se leen de `GET /auth/v1/user` y la lectura falla cerrado                                                                                    |
| **D-49**  | El QR no se pintaba: `qr_code` llega como SVG en crudo y un `<img src>` no lo carga                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | **Resuelto** · normalizado a `data:image/svg+xml;base64`                                                                                                    |
| **D-50**  | **La API no arrancaba en producción**: el puerto de auditoría no alcanzaba a `AutenticacionController`, y las 363 pruebas no lo veían porque el arnés monta un grafo de módulos distinto                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | **Resuelto** · el puerto vive en `comun/auditoria`, lo provee `NucleoModule`                                                                                |
| **D-51**  | `openapi.json` se emitía en el orden de registro de los módulos, así que reordenar el grafo —D-50— producía 238 líneas de diferencia sin un solo cambio de contrato, y el control de desfase lo denunciaba como cambio real                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | **Resuelto** · documento en orden canónico; el fichero depende solo de la forma de la API                                                                   |
| **D-52**  | El banco de las pruebas negativas clonaba `HEAD` y copiaba tres ficheros del árbol; las sondas 1 y 2 no tomaban línea base, así que un hallazgo REAL del repositorio se informaba como «la sonda dejó rastro»                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | **Resuelto** · el banco refleja el árbol completo y las sondas parten de línea base                                                                         |
| **D-53**  | El paso **12c** vivía dentro del bloque `--con-base`: sin base no se ejecutaba **ni se omitía**, no salía en la salida. Lo detectó el usuario leyendo y echándolo en falta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | **Resuelto** · 12c fuera del bloque, guardián de Chromium portable y paso 15 de recuento                                                                    |
| **D-54**  | Contraseña literal en `e2e/doble-gotrue.mjs`. No era una credencial viva, pero §2.5 no distingue. El gancho de pre-commit funciona: ese commit no pasó por él                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | **Resuelto** · se sortea en cada corrida; nada que rotar, historial empujado intacto                                                                        |
| **D-55**  | `arranque-en-frio.sh` no declaraba su conexión: fijaba `PGHOST`/`PGPORT` solo en el guion hijo, así que sus `psql` iban a la instalación por defecto del sistema y solo funcionaba con las variables ya en el entorno                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | **Resuelto** · fija y exporta los mismos valores por defecto                                                                                                |
| **D-56**  | El rechazo de la API al entrar al tablero era mudo: `sesionActual()` devolvía `null` y el layout rebotaba al login sin decir por qué. Un código de seis dígitos correcto acababa en la pantalla de acceso sin explicación                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | **Resuelto** · se registran el estado y los NOMBRES de los claims del token (nunca sus valores)                                                             |
| **D-57**  | `MFA_OBLIGATORIO` · interruptor temporal del segundo factor, **desviación declarada de RN-20, CA-25 y §2.7.8**, a petición del cliente para poder ensayar la consola. Por defecto `true`. Apagado solo admite `aal1` en roles administrativos: contraseña, firma, rol y aislamiento siguen en vigor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | **Vigente mientras el cliente lo necesite** · anunciado al arrancar, en la bitácora y en pantalla; probado en las dos posiciones y en el navegador          |
| **DT-13** | `multiempresa/aislamiento.ts` toma tipos del barril de `autenticacion`, así que un import explícito entre esos módulos cerraría un ciclo de `require`. Hoy no hace falta; si hiciera, la salida es mover también ese vocabulario al núcleo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Declarada                                                                                                                                                   |

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

| Commit    | Contenido                                                                     |
| --------- | ----------------------------------------------------------------------------- |
| `5030194` | Módulo `tablero`, tipos de respuesta en OpenAPI y el control que los exige    |
| `d279066` | Cliente generado en `packages/contracts` y los dos controles de contrato      |
| `109d15a` | Preset compartido, marco de la consola, acceso con MFA y tablero              |
| `297a259` | 49 pruebas de lo que falla en silencio; dos controles que no veían `.tsx`     |
| `579931e` | ADR-006 (datos y estado) y ADR-007 (cliente generado)                         |
| `1746730` | Los tres defectos que cazó la primera ejecución del verificador               |
| `c407265` | Segunda ronda: el fallo del CI y la revisión de las diez sondas               |
| `1e2cd39` | Arranque en frío (0023-0025) y la prueba que lo recorre entero                |
| `3ed32e5` | El informe del arranque en frío y el hueco entre las dos suites               |
| `77a821b` | Inscripción del segundo factor, códigos de recuperación, NIT (0026), sonda 11 |
| `876daee` | P-14 redefinido, enmienda del ADR-008 y DT-12                                 |
| `dadc741` | Veredicto de la cuarta ronda, en verde y contra base                          |
| `59cdaf2` | El `503` intermitente de la inscripción y §2.7.1 en la consola                |
| `3d14e2a` | Veredicto en verde tras corregir el `503` de la inscripción                   |
| `1cf1325` | Los factores se leen del usuario; GoTrue no expone `GET /factors`             |
| `05cf156` | La API no arrancaba en producción; el camino completo por navegador           |
| `0702d6f` | El camino integrado como paso 12c del verificador                             |
| `f06050e` | Sexta ronda: contrato canónico, el paso que no salía, la contraseña literal   |
| `4441933` | `MFA_OBLIGATORIO`: el interruptor temporal del segundo factor (D-56, D-57)    |
| `c9ed654` | Veredicto literal de la séptima ronda, en verde y contra base                 |
