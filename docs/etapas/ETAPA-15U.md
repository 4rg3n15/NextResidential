# ETAPA 15-U · Vulnerabilidades de dependencias (AR-02 no se acepta: se corrige)

**Rama:** `etapa-15u-dependencias` · **Base:** `develop` (`57fddf5`, merge del PR #40, la 15-Q2) ·
**PR:** [4rg3n15/NextResidential#41](https://github.com/4rg3n15/NextResidential/pull/41), sin fusionar · **Fecha:** 2026-10-03 ·
**Corrige:** H-13-26 / AR-02 (ETAPA 13) · **Cierra:** C-51

> **Esta ronda NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Es una corrección de dependencias: nada funcional cambia, y lo que la subida
> habría cambiado sin querer está abajo, con la prueba que lo detecta.

**Lo incómodo primero.**

1. **La subida rompía cosas que ninguna prueba nombraba, y dos eran de
   seguridad.** NestJS 11 dejó de deduplicar los módulos dinámicos por el hash
   de su configuración: `EquiposModule.registrar()`, llamado desde seis
   módulos, pasó a ser seis módulos. El enrutador registró **375** rutas en vez
   de **174** y el estado quedó repartido entre copias (un rostro sincronizado
   en una instancia y buscado en otra: 404). Y Express 5 convirtió `req.query`
   en un getter que vuelve a parsear la URL en cada lectura: **el saneamiento
   de la consulta (§2.7.4) dejaba de llegar al `ValidationPipe`** y al
   controlador, en silencio. Las suites de aislamiento y de escalamiento no lo
   veían: sólo exigían que la lista de rutas no estuviera vacía.
2. **«Sin versión corregida publicada» era falso.** AR-02 aceptaba 12
   vulnerabilidades con ese argumento. Hoy las 12 tienen versión corregida, y
   tres de las cuatro las trae sola la subida de NestJS (qs, body-parser y
   file-type son transitivas suyas). No hizo falta **ningún** `override` nuevo.
3. **El árbol completo, con las herramientas de desarrollo, no está a cero.**
   `pnpm audit --prod` da 0; `pnpm audit` da 18 (3 bajas, 8 moderadas, **7
   altas**), todas de herramientas de desarrollo (eslint, lint-staged,
   tailwind, vitest, turbo, mermaid). Eran 30 antes de la ronda. Quedan fuera
   del alcance pedido y se registran como **DT-15U-01**, no se esconden.

---

## Medición · antes y después

`pnpm audit --prod`, el 2026-10-03, sobre el mismo árbol de trabajo:

| Momento                                | Resultado                                                    |
| -------------------------------------- | ------------------------------------------------------------ |
| **Antes** (`develop@57fddf5`)          | `12 vulnerabilities found` · `Severity: 3 low \| 9 moderate` |
| **Después** (`etapa-15u-dependencias`) | `No known vulnerabilities found`                             |

| Aviso               | Paquete      | Vulnerable        | Corregida | Por dónde llegaba                                                | Cómo se corrige                      |
| ------------------- | ------------ | ----------------- | --------- | ---------------------------------------------------------------- | ------------------------------------ |
| GHSA-w7fw-mjwx-w883 | qs           | ≥ 6.7.0 ≤ 6.14.1  | ≥ 6.14.2  | `express@4.21.2` (directa de la API)                             | Express 5 → qs **6.16.0**            |
| GHSA-6rw7-vpxm-498p | qs           | < 6.14.1          | ≥ 6.14.1  | ídem                                                             | ídem                                 |
| GHSA-q8mj-m7cp-5q26 | qs           | ≥ 6.11.1 ≤ 6.15.1 | ≥ 6.15.2  | `@nestjs/platform-express@10` → `express@4.22.1` y `body-parser` | ídem                                 |
| GHSA-x5fp-wj9c-mxmx | qs           | ≥ 6.14.2 ≤ 6.15.3 | ≥ 6.16.0  | ídem                                                             | ídem                                 |
| GHSA-4mjr-xmp4-gh2g | qs           | ≥ 2.2.5 < 6.16.0  | ≥ 6.16.0  | ídem                                                             | ídem                                 |
| GHSA-v422-hmwv-36x6 | body-parser  | < 1.20.6          | ≥ 1.20.6  | `express@4` y `@nestjs/platform-express@10`                      | Express 5 → body-parser **2.3.0**    |
| GHSA-5v7r-6r5c-r473 | file-type    | ≥ 13.0.0 < 21.3.1 | ≥ 21.3.1  | `@nestjs/common@10.4.22` → `file-type@20.4.1`                    | `@nestjs/common@11.2.7` → **21.3.4** |
| GHSA-j47w-4g3g-c36v | file-type    | ≥ 20.0.0 ≤ 21.3.1 | ≥ 21.3.2  | ídem                                                             | ídem                                 |
| GHSA-36xv-jgw5-4q75 | @nestjs/core | ≤ 11.1.17         | ≥ 11.1.18 | directa de la API (10.4.22)                                      | **11.2.7**                           |

Las 12 de la cifra son estos 9 avisos contados por severidad sobre sus rutas;
el JSON de las dos mediciones está en el informe de la corrida, no en el
repositorio (no se versionan informes de herramienta).

---

## 1 · Qué se construyó

Nada nuevo para el usuario: es la misma API sobre otra base. Los cuatro
paquetes de NestJS suben juntos a la 11 (`common`, `core`, `platform-express`,
`testing`: **11.2.7**), con ellos `@nestjs/swagger` (**11.4.5**) y
`@nestjs/throttler` (**6.4.0**), y Express pasa de **4.21.2** a **5.2.1**. Las
correcciones de qs, body-parser y file-type llegan por esa subida: son
dependencias transitivas suyas, y la versión corregida es la que resuelve la
propia dependencia directa. No se añadió ningún `override`; se retiró uno
(`express>path-to-regexp`) que con Express 5 ya no apuntaba a nada.

Lo que sí se escribió es lo que la subida rompía —cinco módulos, el
saneamiento de la consulta, el parser de consulta, el tipo de CORS, la cota de
un control del contrato y un comentario que dejó de ser verdad— y **dos pruebas
nuevas** que fallan si cualquiera de esas roturas vuelve.

## 2 · Cómo se organizó y por qué

**Todos los `@nestjs/*` a la vez, en una sola subida.** Mezclar 10 y 11 no es
un estado intermedio válido: `platform-express@11` exige `core@^11`, y
`swagger@8` exige `core@^10`. Las versiones elegidas, y por qué cada una:

| Paquete                                      | Antes   | Después    | Por qué ésa                                                                                                                                                    |
| -------------------------------------------- | ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nestjs/common`, `core`, `platform-express` | 10.4.22 | **11.2.7** | La última 11.x: lleva la corrección de `core` (≥ 11.1.18) y `file-type` 21.3.4. La 12 existe y es otra mayor: no se pidió                                      |
| `@nestjs/testing`                            | 10.4.15 | **11.2.7** | La misma que el resto: el banco de pruebas tiene que montar el mismo grafo que el despliegue                                                                   |
| `@nestjs/swagger`                            | 8.1.0   | **11.4.5** | La última que depende de `js-yaml` 4: la 11.4.6 y la 11.4.7 traen `js-yaml` 5, que el `override` vigente (`^4.3.2`) forzaría a 4 por debajo de lo que declaran |
| `@nestjs/throttler`                          | 6.3.0   | **6.4.0**  | El paso más corto: la primera que admite Nest 11 en sus `peerDependencies`                                                                                     |
| `express`                                    | 4.21.2  | **5.2.1**  | La que trae `platform-express@11.2.7`; la API la declara directa porque monta sus parsers                                                                      |
| `@types/express`                             | 4.17.21 | **5.0.6**  | Los tipos de la 5                                                                                                                                              |

**La guía oficial, leída entera.** `docs.nestjs.com` no es alcanzable desde
este entorno; la guía de migración de la 10 a la 11 se leyó del historial del
repositorio `nestjs/docs.nestjs.com` (`content/migration.md` en `bdefe854`, la
última versión que la contiene). Recorrida apartado por apartado:

| Apartado de la guía                | Qué encontró aquí                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Express v5: comodines y parámetros | **Ninguna ruta usa `*`, `?`, `+`, paréntesis ni regex.** Comprobado sobre los 174 endpoints (los decoradores) y las rutas que la tubería monta con `app.use` (`/alarm-server`, audio, WHEP, fotografías): todas son literales con `:parámetros`, válidos en path-to-regexp 8. No hay `forRoutes` ni prefijo global                                                                                      |
| Express v5: parser de consulta     | **Rompía H-13-13**: con el parser `simple`, `?busqueda[x]=1` llegaba como una clave literal y pasaba (200 en vez de 400). Se conserva `qs` —el de Express 4— con `query parser = extended`, como indica la guía (`seguridad.ts`)                                                                                                                                                                        |
| Resolución de módulos              | **Rompía la API** (punto 1 de «lo incómodo»). La guía pide reutilizar la misma referencia; los cinco módulos que se importan desde varios sitios (`Equipos` ×6, `Biometria` ×5, `Guardia`, `Padron`, `Edge` ×2) la guardan en un campo estático. El modo `deep-hash` existe, pero la guía lo ofrece sólo para las pruebas: usarlo sólo allí haría que el banco montara un grafo distinto del desplegado |
| Inferencia de tipos de `Reflector` | Sin efecto: el código no usa `getAllAndMerge`, y `getAllAndOverride` ya se trataba como posible `undefined`                                                                                                                                                                                                                                                                                             |
| Orden de los ganchos de cierre     | Sin efecto, y es por diseño: el cierre ordenado separa FASES (`beforeApplicationShutdown` detiene escuchas, latidos y pg-boss; `onApplicationShutdown` cierra el pool). Todos los `before…` corren antes que cualquier `on…`, en el orden de módulos que sea                                                                                                                                            |
| Orden de registro de middleware    | Sin efecto: ningún módulo registra middleware de Nest (`configure(consumer)`); toda la tubería se monta en `montarTuberiaHttp`, en su orden explícito                                                                                                                                                                                                                                                   |
| Cache, Config, Terminus, Fastify   | No se usan                                                                                                                                                                                                                                                                                                                                                                                              |
| Node 16 y 18 fuera                 | El proyecto ya exige Node 22 (`.nvmrc`, `engines`)                                                                                                                                                                                                                                                                                                                                                      |

**Lo que no está en la guía y también rompía:**

- **`req.query` es un getter en Express 5** (de `express/lib/request.js`, sin
  caché). El saneamiento vaciaba el objeto devuelto y le copiaba lo saneado
  —el comentario decía «es de solo lectura en Express 5: se reemplaza su
  contenido», escrito antes de que Express 5 estuviera aquí—, y la siguiente
  lectura volvía a parsear la URL cruda. Ahora lo saneado se fija como
  propiedad de la petición (`Object.defineProperty`), que tapa el getter.
- **`INestApplication.enableCors` recibe `any` en Nest 11.** La función que
  decide el origen quedó sin tipos (`noImplicitAny`). Se tipa con
  `satisfies CorsOptions`, sin cambiar una opción.
- **body-parser 2 no mira `req._body`.** El sobre del Alarm Server marcaba esa
  propiedad para que `express.json` no esperara un flujo ya consumido. body-parser
  2 lo decide con `onFinished.isFinished(req)`, que tras `end` es cierto: el
  camino sigue funcionando (alarm-server y la regresión del 28/09 en verde) y
  sólo el comentario mentía. Se corrigió el comentario, no el código.
- **Swagger 11 cambia el contrato en dos cosas.** (a) `@ApiProperty({ enum:
[true] })` era `number` en swagger 8 y es `boolean` en la 11: **corrección**,
  porque la respuesta real es `true`. El cliente Dart generado leía
  `json['sinCambios'] as num` sobre un booleano y habría lanzado al usarse; la
  app no consume esa ruta (es del Edge), y por eso nunca se vio. (b) Los `$ref`
  anulables llevan ahora `type: object` además de `allOf`; el control del
  contrato tipado desciende un nivel más por ellos y su cota de recursión (6)
  cortaba antes de la última propiedad. Sube a 9, sigue acotada (§2.4).

### Lo que destaparon las pruebas (y se corrigió en la ronda)

| Rojo                                                                                    | Causa                                                                                                                                                                                                                                               | Corrección                            |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `biometria.e2e` (4) y `salidas-del-videoportero.e2e` (1): 404 donde iba 201/403/503     | Módulos duplicados: el estado vivía en otra copia                                                                                                                                                                                                   | Una referencia por módulo dinámico    |
| `aislamiento.e2e` · «sólo las rutas declaradas son alcanzables con aal1»: 7 en vez de 4 | Ídem. Aislada pasa; tras el resto del fichero, no [Probable: el doble de rutas multiplica peticiones y estado previos]. **No era un salto del segundo factor**: con la deduplicación las rutas no 401 son las mismas cuatro que declara la exención | Ídem                                  |
| `saneamiento-entrada.e2e` · `?busqueda[x]=1` → 200 en vez de 400                        | Parser de consulta `simple`                                                                                                                                                                                                                         | `query parser = extended`             |
| `rutas-del-enrutador.e2e` (nueva) · 375 rutas, 174 únicas                               | Módulos duplicados                                                                                                                                                                                                                                  | Ídem                                  |
| `consulta-saneada.e2e` (nueva) · 400 con `%20permitido%00%20`                           | `req.query` getter                                                                                                                                                                                                                                  | `defineProperty`                      |
| `tsc` · `origen` y `callback` con `any` implícito                                       | `enableCors(options?: any)`                                                                                                                                                                                                                         | `satisfies CorsOptions`               |
| `contrato:tipado` · dos rutas «sin respuesta tipada»                                    | Cota de recursión del control                                                                                                                                                                                                                       | 6 → 9                                 |
| `cliente-dart-desfasado` · dos modelos difieren                                         | `enum: [true]` ahora `boolean`                                                                                                                                                                                                                      | Cliente regenerado con la herramienta |

Las dos pruebas nuevas **pasan en la base** (Express 4: 5 de 5, medido en un
árbol de `develop@57fddf5`) y **fallaban con la subida** antes de las
correcciones: no describen la 15-U, describen el comportamiento que la 15-U no
podía cambiar. Y la guarda de módulos se vio fallar a propósito: quitada la
deduplicación sólo de `EquiposModule`, falla nombrándolo.

## 3 · Árbol de archivos

**Dependencias.** `apps/api/package.json` (versiones) · `package.json` (retira
`express>path-to-regexp`) · `pnpm-lock.yaml` (regenerado con `pnpm install`;
`--frozen-lockfile` limpio).

**Código (ninguno crece: mismo número de líneas que en la base).**

- `apps/api/src/{equipos,biometria,guardia,padron,edge}/*.module.ts` — `registrar()` devuelve siempre la misma referencia.
- `apps/api/src/comun/saneamiento.ts` — lo saneado se fija en la petición.
- `apps/api/src/seguridad.ts` — `query parser = extended`; `satisfies CorsOptions`.
- `apps/api/src/comun/sobre-de-equipo.ts` — sólo el comentario de la marca `_body`.
- `scripts/lib/contrato-tipado.mjs` — cota de recursión 6 → 9.

**Generados.** `packages/contracts/openapi.json` · `packages/contracts/src/generado/api.ts` (dos comentarios JSDoc) · `apps/mobile/lib/infraestructura/api/generado/models/` (cinco ficheros).

**Pruebas nuevas.**

- `apps/api/test/rutas-del-enrutador.e2e.test.ts` (101 líneas) — enrutador = decoradores, sin duplicados; ningún módulo dos veces.
- `apps/api/test/consulta-saneada.e2e.test.ts` (57 líneas) — la consulta que valida el pipe es la saneada.

**Documentación.** Este informe · `docs/ESTADO_ETAPAS.md` · `docs/seguridad/AUDITORIA.md` (H-13-26 y AR-02) · `docs/auditoria/contradicciones-y-supuestos.md` (C-51, S-193 a S-196) · `README.md` (stack).

## 4 · Tabla SOLID

| Archivo                           | SRP                                     | OCP                                                     | LSP                                        | ISP        | DIP                                                    |
| --------------------------------- | --------------------------------------- | ------------------------------------------------------- | ------------------------------------------ | ---------- | ------------------------------------------------------ |
| `*.module.ts` (5)                 | Siguen siendo sólo raíz de composición  | La referencia única no cambia lo que se compone         | El módulo es el mismo para cada importador | Sin cambio | Siguen inyectando por token                            |
| `saneamiento.ts`                  | Sanea; una línea cambia cómo se entrega | Sin cambio en las reglas de saneamiento                 | La petición sigue siendo un `Request`      | Sin cambio | Sin dependencias nuevas                                |
| `seguridad.ts`                    | Sigue siendo la postura HTTP entera     | Un ajuste más de la misma tubería                       | —                                          | —          | `CorsOptions` es un tipo, no una dependencia de código |
| `contrato-tipado.mjs`             | Un control, una pregunta                | Cota configurable en un solo sitio por función          | —                                          | —          | —                                                      |
| `rutas-del-enrutador.e2e.test.ts` | Mide la cobertura de las otras suites   | Deriva de los decoradores: un endpoint nuevo entra solo | —                                          | —          | Lee por `Reflector` y `ModulesContainer`, no por rutas |
| `consulta-saneada.e2e.test.ts`    | Una garantía: saneado antes del pipe    | —                                                       | —                                          | —          | Por la tubería real (`crearApp`)                       |

`grep -r "supabase\|axios\|isapi" src/**/domain/` sigue en 0: el dominio no se tocó.

## 5 · Trazabilidad

| Referencia                | Cómo queda                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| **H-13-26 / AR-02**       | **CERRADO**: `pnpm audit --prod` = 0. AR-02 deja de ser una aceptación de riesgo                       |
| **C-51**                  | **CERRADA**: la 15-U existe, es esta, y se hizo después de la 15-Q2 sobre su merge                     |
| OWASP A06 · ASVS V14      | Componentes vulnerables en producción: 0                                                               |
| RN-15 · CA-24 · KPI-36/37 | La suite de aislamiento recorre el 100 % de los endpoints, **medido** (174 = 174, sin duplicados)      |
| KPI-38 · escalamiento     | Ídem para la matriz de seis roles                                                                      |
| §2.7.3 / §2.7.4           | `ValidationPipe` estricto y saneamiento de cuerpo **y consulta** antes de validar, por la tubería real |
| §2.7.5                    | Throttler 6.4.0: las pruebas de límite (`limite-de-peticiones.e2e`, modo pruebas H5) sin tocar         |
| §2.7.8                    | Tipo real por bytes: propio (`comun/archivos/tipo-real.ts`); `file-type` no lo importa el código       |

## 6 · Pruebas

### Qué se probó y cómo

- **Antes de tocar nada**, las dos pruebas nuevas en un árbol de `develop@57fddf5`
  (Express 4): **5 de 5 en verde**. Con la subida y antes de corregir:
  `rutas-del-enrutador` 375 ≠ 174 y `consulta-saneada` 400 donde va 200.
- **Suite de la API sin base** tras las correcciones: 2064 verdes, 79 omitidas
  por falta de base, 0 rojas. **Con base:** 2136 verdes y 7 omitidas, que eran
  las del puente de video contra go2rtc real (sin `GO2RTC_BIN`); con el binario
  verificado del repositorio, las 12 de video y cámara del 28/09, en verde.
- **Recorrido de las superficies** (todas sin tocar una aserción):

  | Superficie                                        | Prueba que la recorre                                                                                     |
  | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
  | `/alarm-server/:secreto` e ingesta firmada        | `alarm-server.e2e`, `alarm-server-por-camara-pg.e2e`, `ingesta.e2e`, `regresion-camara-28-09.e2e`         |
  | Proxy de la consola `/api/ncr/[...ruta]`          | Paso 13b (Playwright: superadministrador y portero, de punta a punta, contra la API real) y `@ncr/web`    |
  | WHEP de video (y el CRLF del SDP)                 | `vista-en-vivo-extremo-a-extremo.e2e` y `puente-go2rtc.real` contra go2rtc real                           |
  | Servidores ICE                                    | `servidores-ice.e2e`                                                                                      |
  | SSE `/eventos/flujo`                              | `eventos.e2e`, `latencia-tiempo-real` y el paso 11 (KPI-25)                                               |
  | Despachador de upgrades (audio 15-P, túnel 15-Q2) | `audio-guardia-ws.e2e` y `edge-puente-procesos-pg.e2e` (12 de 12, la API y el Edge en procesos distintos) |
  | Throttler y límites por ruta                      | `limite-de-peticiones.e2e` y el modo pruebas H5                                                           |
  | `ValidationPipe`, saneamiento                     | `saneamiento-entrada.e2e`, `consulta-saneada.e2e`                                                         |
  | Helmet / CSP / CORS                               | `cors-y-cabeceras.e2e`                                                                                    |
  | Filtros globales                                  | `error-del-tunel.test` y los 4xx/5xx de toda la suite (el filtro no tiene prueba unitaria propia)         |
  | Puerto mientras arranca, cierre ordenado          | `puerto-mientras-arranca`, `cierre-ordenado`, y el paso 12d (`start:dev` arranca, inyecta y valida)       |
  | Aislamiento y escalamiento                        | `aislamiento.e2e`, `escalamiento-de-privilegios.e2e` sobre 174 de 174 endpoints (`rutas-del-enrutador`)   |
  | DoD 15-Q · 30 min sin WAN                         | `apps/edge/test/dod-corte-de-wan.test.ts` (20 accesos, exactamente una vez)                               |
  | DoD 15-Q2 · dos procesos                          | `edge-puente-procesos-pg.e2e` (guardián: la API no toca un equipo)                                        |

- Cómo ejecutarlas: `eval "$(./scripts/base-de-pruebas.sh arrancar)"`,
  `./supabase/verificar.sh --con-pruebas --modo-supabase` y
  `./scripts/verificar-etapa.sh --con-base`.

### Veredicto literal de `./scripts/verificar-etapa.sh --con-base` (§2.8.0)

Sobre `f26da41`, desde cero (sin `dist/`, `.turbo/` ni `coverage/`, instalación
con `--frozen-lockfile`). A mitad de la corrida (paso 5) se cambió sólo el
comentario de `sobre-de-equipo.ts` (`7a64241`); lo posterior es documentación.

```
VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe
```

El declarado es el de **D-112**: las 5 pruebas del arranque en frío que la
suite salta porque necesitan los claims que escribe el paso 12b, que es quien
las ejecuta. El 5e está declarado sólo para macOS: en esta corrida, en Linux,
se ejerció.

31 de 31 pasos. Paso 5: `@ncr/api` **2138** + 5 saltadas declaradas (eran 2132:
las 6 nuevas), `@ncr/providers` 1225, `@ncr/web` 747, `@ncr/domain-core` 438,
`@ncr/edge` 277, `@ncr/config` 144; ninguna omisión por falta de base.
**4974 pruebas**, las mismas por los dos caminos (paso 7b) y tres veces
seguidas sin caché (paso 14: la API 2143 de 2143). 460 de 460 ficheros de
prueba recogidos. KPI-25 (paso 11): p50 7 ms · p95 34 ms · p99 48 ms. KPI-03:
100 inserciones concurrentes, 0 duplicados. Los 34 controles detectan su
violación; el trinquete de ramas sin ejercer no sube (257).

### Cobertura por capa

| Capa       | Líneas  | Ramas   | Funciones | Umbral |
| ---------- | ------- | ------- | --------- | ------ |
| Dominio    | 96,20 % | 96,91 % | 96,04 %   | 90 %   |
| Aplicación | 97,17 % | 90,89 % | 98,08 %   | 90 %   |
| Global     | 87,25 % | 87,22 % | 86,40 %   | 70 %   |

## 7 · Verificación de seguridad (§2.7)

| §2.7 | Qué se comprobó en esta ronda                                                                                                                                                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Ningún secreto nuevo; el escaneo del índice y del historial, limpio (paso 10 y gancho de commit)                                                                                                      |
| 2    | CORS: las mismas opciones, ahora tipadas; `cors-y-cabeceras.e2e` sin tocar                                                                                                                            |
| 3    | `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`): sin cambio; `consulta-saneada.e2e` prueba que valida lo saneado                                                           |
| 4    | Saneamiento: **se recuperó** para la consulta (Express 5 lo anulaba); el SDP con su CRLF sigue sin tocarse (`vista-en-vivo-extremo-a-extremo.e2e` contra go2rtc real, 5 de 5)                         |
| 5    | Throttler 6.4.0 global y por ruta: las pruebas de 429 y `Retry-After` sin tocar                                                                                                                       |
| 6    | Aislamiento: la suite recorre 174 de 174 endpoints, una vez cada uno; ningún módulo duplicado (estado repartido = aislamiento no garantizado)                                                         |
| 7    | Helmet 8.0.0 y la CSP: sin cambio                                                                                                                                                                     |
| 8    | Tamaño de cuerpo por ruta (body-parser 2 con los mismos `limit`); tipo real de archivo: un PNG declarado JPEG y un GIF, 400 por sus bytes (`autorizaciones-consola.e2e:198`); `pnpm audit --prod` = 0 |

## 8 · Deuda técnica, supuestos y pendientes

- **DT-15U-01 · el árbol de desarrollo no está a cero.** `pnpm audit` = 18 (3
  bajas, 8 moderadas, 7 altas), todas de herramientas de desarrollo:
  `brace-expansion` y `braces` (altas, por eslint, typescript-eslint,
  lint-staged y tailwind), `esbuild`, `vitest`, `@vitest/mocker`, `yaml`,
  `turbo`, `@eslint/plugin-kit`, `dompurify` (por mermaid). Antes de la ronda
  eran 30 (6 bajas, 17 moderadas, 7 altas). No viajan a producción; se
  corrigen en una ronda propia, porque subir vitest o eslint de mayor es el
  riesgo que ya costó 350 pruebas en la ETAPA 13.
- **DT-15U-02 · NestJS 12 ya existe** (`@nestjs/common` 12.1.2). Esta ronda se
  queda en la 11 porque es lo pedido; la 12 trae paquetes ESM y otra guía.
- **S-193** · «Ningún archivo existente crece» se aplica al código, las
  pruebas y los guiones; la documentación que la ronda manda actualizar crece
  lo justo, y el lockfile cuenta como generado.
- **S-194** · Las versiones de la tabla del §2 (la última 11.x de Nest, swagger
  11.4.5 por `js-yaml` 4, throttler 6.4.0 como paso mínimo).
- **S-195** · El parser de consulta sigue siendo `qs` (`extended`), el de
  Express 4: el contrato de H-13-13 lo exige y ningún DTO cambia.
- **S-196** · Una referencia por módulo dinámico, no `deep-hash`: la guía lo
  ofrece sólo para pruebas, y el banco tiene que montar el grafo que se
  despliega.

## 9 · Qué debe hacer el usuario manualmente

1. Revisar y fusionar el PR cuando quiera: **no lo fusiono**.
2. Nada en paneles ni credenciales: no cambia ninguna variable de entorno ni el
   arranque (`DESPLIEGUE.md` no cambia; Node 22 ya cumplía el mínimo de Nest 11).
3. En el próximo despliegue, la API arranca igual. Si algo de la consola
   dejara de leer una consulta con corchetes, es H-13-13: el parser se
   mantuvo a propósito.

## 10 · Rama y commits

Rama `etapa-15u-dependencias` · PR [4rg3n15/NextResidential#41](https://github.com/4rg3n15/NextResidential/pull/41), **sin fusionar**.

- `b0c9851` fix(etapa-15u/dependencias): NestJS 11 y Express 5 — pnpm audit --prod de 12 a 0
- `f26da41` test(etapa-15u/api): el enrutador ve los 174 endpoints una vez, ningún módulo está dos veces y la consulta llega saneada
- `7a64241` docs(etapa-15u/api): el comentario de la marca \_body dice cómo lo decide body-parser 2
- cierre: informe, ESTADO, AUDITORIA (H-13-26 y AR-02), registro (C-51, S-193 a S-196) y README
