# PROMPT MAESTRO — NEXT CONTROL RESIDENCIAL

### Contrato de trabajo del agente de desarrollo · v3.0

---

## §0. CÓMO SE USA ESTE DOCUMENTO

Este archivo se entrega **una sola vez** al agente al inicio de la sesión, o —mejor— se guarda como `CLAUDE.md` en la raíz del repositorio para que se cargue en cada sesión. A partir de ahí, el usuario avanza con comandos cortos:

| Comando del usuario           | Qué hace el agente                                                               |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `EJECUTA ETAPA NN`            | Ejecuta **esa etapa y solo esa**, entrega el informe y se detiene.               |
| `ESTADO`                      | Muestra `docs/ESTADO_ETAPAS.md`: qué está hecho, qué falta, qué quedó pendiente. |
| `EXPLICA ETAPA NN`            | Reexplica la etapa ya construida sin tocar código.                               |
| `CORRIGE ETAPA NN: <detalle>` | Corrige dentro de la rama de esa etapa, sin avanzar a la siguiente.              |
| `AUDITA`                      | Ejecuta la verificación de seguridad de §2.7 sobre lo construido hasta ahora.    |

**Regla de oro:** el agente nunca avanza de etapa por iniciativa propia. Termina, informa y espera.

---

## §1. CONTEXTO VERIFICADO DEL PROYECTO

> Esta sección ya fue verificada contra el documento original. **No la re-deduzcas: úsala como línea base** y confírmala en la ETAPA 00.

**Qué es.** Next Control Residencial es una plataforma SaaS multiempresa de control de acceso para copropiedades (villas, parcelaciones, conjuntos), construida sobre hardware Hikvision. Unifica padrón, autorización de visitantes, LPR, reconocimiento facial, zonas comunes, guardia virtual y trazabilidad.

**Principio rector, del que se deriva toda la arquitectura:**

> **Next Control decide. El hardware ejecuta.**
> Si la cámara resuelve la apertura por su cuenta, el motor de reglas queda decorativo y se pierde la trazabilidad. La cámara opera en **modo evento**: reporta, no decide.

**Inventario verificado del documento de requisitos (v1.0, 01/09/2026):**

| Elemento                     | Cantidad real          | Observación                                                                                                                                                  |
| ---------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Objetivos específicos (OE)   | 8                      | OE-01 a OE-08, secuencia completa                                                                                                                            |
| Indicadores (KPI)            | **37 entradas, no 38** | Falta `KPI-19`. La entrada 21 está escrita como **`KP1-21`** (uno numérico en lugar de la I). Corregir en el documento derivado; **no** alterar el original. |
| Reglas de negocio (RN)       | 22                     | RN-01 a RN-22, completas                                                                                                                                     |
| Historias de usuario (HU)    | 38                     | HU-01 a HU-38, todas en estado _Pendiente_                                                                                                                   |
| Casos de uso (CU)            | 5                      | CU-01 a CU-05                                                                                                                                                |
| Criterios de aceptación (CA) | 26                     | CA-01 a CA-26, formato Gherkin                                                                                                                               |
| Problemas AS-IS (PB)         | 6                      | PB-01 a PB-06                                                                                                                                                |
| Casos de prueba (CP)         | 11                     | CP-01 a CP-11                                                                                                                                                |
| Roles del sistema            | 6                      | Superadministrador, Administrador, Portero/Seguridad, Operador de central, Residente, Servicio/Integración                                                   |
| Términos de glosario         | 22                     | Lenguaje ubicuo del dominio                                                                                                                                  |

**Vacío conocido:** el documento **no tiene una sección formal de requisitos no funcionales**. Debe construirse en la ETAPA 00 derivándola de los KPI de latencia (09, 13, 25, 32, 33), disponibilidad (28-31) y seguridad (36-38).

**Fuera de alcance explícito** (no construir, ni "por si acaso"): facturación y recaudo, reservas con pago en línea, VMS y grabación continua, correspondencia, ERP/contabilidad, convivencia/PQR/asambleas, app dedicada para el visitante, adaptadores de otros fabricantes (la arquitectura los admite; no se implementan), publicación en tiendas, LPR de motocicletas a alta velocidad, integración con alarma/incendio, migración automática desde HikCentral, multiidioma.

**Restricción legal y contractual:** todo el desarrollo pertenece patrimonialmente a Grupo Control. Repositorios, dominios, cuentas cloud, llaves y ambientes van bajo cuentas corporativas, nunca personales. El tratamiento biométrico se rige por la **Ley 1581 de 2012** (Colombia): consentimiento previo, expreso e informado del **titular**, principio de finalidad y supresión.

---

## §2. REGLAS GLOBALES — VINCULANTES EN TODAS LAS ETAPAS

Aplican a cada línea de código. No se repiten por etapa: se dan por incluidas siempre.

### 2.1 Disciplina de ejecución

1. Nunca ejecutes una etapa que no se te pidió. Nada de "aprovecho y adelanto la siguiente".
2. Nunca ejecutes una etapa si la anterior no está cerrada en `docs/ESTADO_ETAPAS.md`. Si falta una dependencia, dilo y detente; no improvises el trabajo faltante.
3. Al terminar: **verificación de cierre** (§2.8.0), informe (§2.8), actualización de `ESTADO_ETAPAS.md`, commit de cierre, **alto**.
4. Decisión de negocio no resuelta → `PENDIENTE DE DEFINICIÓN`, comportamiento conservador (**denegar por defecto**), reporte en el informe. Nunca la inventes en silencio.
5. Suposición tuya → marcada `[SUPUESTO]` en código y en informe.
6. Conflicto entre fuentes → `[CONTRADICCIÓN]` con la resolución aplicada según §3.

### 2.2 Arquitectura obligatoria

**Monolito modular con arquitectura hexagonal.** Un despliegue de API, dividido internamente en módulos con frontera real.

Cada módulo expone **solo** su API pública mediante un barril `index.ts`. Ningún módulo importa archivos internos de otro ni consulta sus tablas: se comunican por interfaces y eventos de dominio.

**Cinco capas, según el diagrama arquitectónico del proyecto:**

| Capa                         | Responsabilidad                                                                                                         | Prohibiciones                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Presentación** (driving)   | Traduce protocolo a casos de uso: controladores HTTP, DTOs, mapeadores, Alarm Server, workers programados.              | Cero reglas de negocio.                          |
| **Aplicación**               | Orquesta casos de uso, transacciones, idempotencia, unidad de trabajo, aislamiento por copropiedad. Define los puertos. | **No decide accesos**: delega en el dominio.     |
| **Dominio**                  | El núcleo: agregados, objetos de valor, políticas, motor de reglas, eventos. **Idéntico en la nube y en el Edge.**      | Cero I/O, cero NestJS, cero Supabase, cero HTTP. |
| **Infraestructura** (driven) | Implementa los puertos: repositorios Supabase, pg-boss, storage, providers de hardware, notificaciones.                 | No define contratos; los cumple.                 |
| **Física**                   | Hardware Hikvision.                                                                                                     | **Ejecuta, nunca decide.**                       |

Dirección de dependencia: `presentación → aplicación → dominio ← infraestructura`. Ninguna flecha sale del dominio. El agregado nunca se serializa crudo al transporte: siempre DTO + mapeador.

**Agregados raíz — nueve** (del diagrama, vinculantes):

| Agregado                   | Frontera de consistencia                            | Invariantes que sostiene |
| -------------------------- | --------------------------------------------------- | ------------------------ |
| `Copropiedad`              | Frontera del tenant                                 | RN-15                    |
| `Vivienda`                 | Residentes y vehículos                              | RN-04, RN-13             |
| `Autorización`             | Vigencia, patrón, acompañantes, zonas               | RN-01, RN-05, RN-22      |
| `Acceso`                   | Inmutable: sin setters, sin update, sin delete      | RN-02, RN-03, RN-17      |
| `ConsentimientoBiometrico` | Titular, finalidad, versión de política, revocación | RN-09, RN-10             |
| `PlantillaBiometrica`      | Calidad, sincronización, supresión programada       | RN-09, RN-11             |
| `Zona`                     | Horario, aforo, controladores                       | RN-14                    |
| `ListaNegra`               | Quién la crea y quién la levanta                    | RN-06, RN-07             |
| `Dispositivo`              | Credencial por referencia, latido, estado           | RN-12, RN-21, CA-26      |

> **`[CONTRADICCIÓN]` C-02 — resuelta, no reabrir.** Este contrato enumeraba **seis** agregados raíz citando el diagrama arquitectónico como fuente. La página 1 del diagrama muestra esos seis, pero **la página 3 —la vista dedicada precisamente a los agregados— declara nueve**, añadiendo `PlantillaBiometrica`, `ListaNegra` y `Dispositivo` con la anotación «raíz de agregado».
>
> **No era un desacuerdo de criterio: era un resumen incompleto de su propia fuente**, y el hueco tenía consecuencia funcional. Sin `ListaNegra` y sin `Dispositivo` como agregados, **cinco reglas de negocio se quedaban sin invariante que las sostuviera**: RN-06 y RN-07 (`PolíticaListaNegra` _aplica_ la lista, no gobierna quién puede crearla ni levantarla, que es una invariante de agregado), RN-12, RN-21 y el criterio CA-26.
>
> **Resolución:** se adoptan los nueve. Aprobado por el cliente el 2026-09-06 e implementado en la ETAPA 01.
> Detalle en `docs/auditoria/02-arquitectura.md` §2 · registro en `docs/auditoria/contradicciones-y-supuestos.md` C-02 · esquema en `docs/arquitectura/modelo-datos.md` §2.

**Objetos de valor:** `Placa` (normalizada al construir), `Vigencia`, `PatrónRecurrencia`, `Aforo`, `ResultadoAcceso`, `VersiónDeReglas`.
**Puertos:** repositorio (`ViviendaRepo`, `AutorizacionRepo`, `ZonaRepo`, `EventoRepo`, `ReglaRepo`, **`ListaNegraRepo`**, **`DispositivoRepo`**, **`ConsentimientoRepo`**, **`PlantillaRepo`**), proveedor (`AccessPointProvider`, `PlateEventSource`, `FaceTemplateProvider`, `IntercomProvider`), soporte (`Reloj`, `GeneradorDeId`, `Notificador`, `AlmacenEvidencia`, `Bitácora`).
**Políticas:** `PolíticaListaNegra` (precedencia absoluta, RN-06), `PolíticaZona` (RN-14), `PolíticaConsentimiento` (RN-09, RN-10).
**Precedencia del motor de reglas**, vinculante (diagrama pág. 3): `listaNegra > vigencia > patrón > zona`. Se evalúan en orden, y la primera que niega determina el motivo del `ResultadoAcceso` — es lo que hace que un visitante en lista negra **con autorización vigente** produzca motivo `LISTA_NEGRA` y no `VIGENCIA_EXPIRADA` (CA-13).

### 2.3 SOLID — obligatorio y verificable

| Principio | Materialización concreta                                                                                           | Verificación mecánica                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| **SRP**   | Una clase, una razón de cambio. Un caso de uso, una operación de negocio. Prohibidos los _services_ de 800 líneas. | Ningún archivo > 300 líneas; ninguna clase > 5 métodos públicos.  |
| **OCP**   | Nuevas reglas = nuevas `Policy`/`Specification` componibles. Nuevo fabricante = nuevo adaptador.                   | Agregar una regla no produce diff en `MotorDeReglas`.             |
| **LSP**   | `MockProvider` e `HikvisionProvider` intercambiables: la suite pasa con ambos sin cambiar una aserción.            | KPI-12.                                                           |
| **ISP**   | Puertos pequeños y específicos, nunca un `HardwareService` monolítico.                                             | Ningún adaptador lanza `NotImplemented`.                          |
| **DIP**   | El dominio declara interfaces; la infraestructura implementa; Nest inyecta por token.                              | `grep -r "supabase\|axios\|isapi" src/**/domain/` devuelve **0**. |

Cada informe de etapa incluye una **tabla de cumplimiento SOLID** de los archivos creados, con una línea de justificación por principio.

### 2.4 Estilo, eficiencia y calidad

- TypeScript estricto: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. **Prohibido `any`** — usa `unknown` + validación.
- **Funciones puras y lambdas** para toda evaluación, transformación y filtrado. El motor de reglas es `(contexto, reglas) => Decisión`, puro, con **reloj inyectado**: nunca `new Date()` dentro de la lógica.
- Composición sobre herencia. Reglas componibles vía _Specification_ con combinadores `and` / `or` / `not` como lambdas.
- Inmutabilidad por defecto: `readonly`, VOs sin setters. Los agregados cambian por **métodos de intención** (`autorizacion.revocar(motivo, ahora)`), nunca por asignación externa.
- Recursividad donde el dominio es recursivo (árboles de reglas, jerarquía de zonas), con caso base explícito y **profundidad acotada**. Jamás recursión sobre entrada no acotada del usuario.
- Sin N+1: batch e índices desde el diseño.
- **Errores tipados.** `ResultadoAcceso` con motivo enumerado: `VIGENCIA_EXPIRADA`, `AFORO_SUPERADO`, `LISTA_NEGRA`, `ZONA_NO_AUTORIZADA`, `FUERA_DE_PATRON`, **`FUERA_DE_HORARIO`**, `SIN_CONSENTIMIENTO`, `PLACA_DESCONOCIDA`, `CONFIANZA_INSUFICIENTE`, `FALLO_TECNICO`. Prohibido lanzar strings o devolver `null` como señal de negocio.
  > **Extensión al contrato · D-18, aprobada por el cliente el 2026-09-06 (ETAPA 01-B).** `FUERA_DE_HORARIO` es el décimo motivo y no estaba en la enumeración original. Se añade porque CA-15 exige negar con motivo «fuera de horario» y ninguno de los nueve lo expresaba: `ZONA_NO_AUTORIZADA` es la falta de permiso sobre la zona (CU-05 alterno 2a), `AFORO_SUPERADO` es CA-14 —un criterio distinto— y `FUERA_DE_PATRON` es el patrón de recurrencia de la autorización (RN-22, CA-06), no el horario de la zona (RN-14, CA-15). Colapsarlos haría indistinguibles dos criterios que el documento separa a propósito.
- Cobertura mínima: **90 % en `domain/` y `application/`**, 70 % global. El dominio se prueba sin mocks de infraestructura porque no la conoce.
- Lenguaje ubicuo **en español** para el dominio (`Vivienda`, `Autorizacion`, `Aforo`); inglés para lo puramente técnico (`Repository`, `Provider`, `Handler`). Consistente, sin mezclar dentro de un mismo concepto.

### 2.5 Git — convenciones obligatorias

- **Una rama por etapa**, nombrada exactamente `etapa-NN-slug`:
  `etapa-00-auditoria-documental`, `etapa-01-modelo-datos-supabase`, `etapa-11-app-flutter-residente`…
- **Prohibido** cualquier nombre autogenerado por la herramienta: `claude/*`, `feature/auto-*`, `agent-*`, `codex/*` o variantes. Si el entorno propone uno, **renómbralo antes del primer commit**.
- Base: `develop`. `main` solo recibe merges de etapas cerradas y verificadas.
- Conventional Commits con prefijo de etapa:
  `feat(etapa-04/padron): agrega invariante de placa única por vivienda activa`
- Cierre de etapa: `chore(etapa-NN): cierre de etapa` + informe en `docs/etapas/ETAPA-NN.md`.
- `.gitignore` desde el primer commit: `.env*`, `*.pem`, `*.key`, `service-account*.json`, `google-services.json`, `GoogleService-Info.plist`, `/coverage`, `/dist`, `/build`, `*.sqlite`.
- **Jamás un secreto en el repositorio.** Si detectas uno en el historial, detén todo y repórtalo antes de continuar.

### 2.6 Stack fijo (no se negocia sin autorización explícita)

| Capa                                      | Tecnología                                                                                                           |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Base de datos, auth, storage, tiempo real | Supabase (PostgreSQL)                                                                                                |
| API y lógica de negocio                   | NestJS + TypeScript estricto                                                                                         |
| Colas y trabajos programados              | pg-boss sobre el mismo PostgreSQL                                                                                    |
| Consola web / escritorio                  | Next.js + TypeScript + **Tailwind CSS** + shadcn/ui, entregada como **PWA instalable** y empaquetada para escritorio |
| Aplicación móvil                          | **Flutter** (Dart), iOS y Android                                                                                    |
| Push                                      | Firebase Cloud Messaging                                                                                             |
| Edge Gateway                              | Node.js + TypeScript + SQLite                                                                                        |
| Video de cámaras al navegador             | go2rtc (RTSP → WebRTC)                                                                                               |
| **Intercom**                              | **ISAPI TwoWayAudio** — ver ADR-01 en §4                                                                             |
| Contratos                                 | OpenAPI generado desde NestJS; cliente Dart **generado**, nunca escrito a mano                                       |
| CI/CD                                     | GitHub Actions                                                                                                       |
| Observabilidad                            | Logs estructurados + Sentry                                                                                          |

### 2.7 Seguridad — línea base desde la ETAPA 01, no al final

La ETAPA 13 **audita** esto; no lo introduce. Construir sin estas medidas y "asegurar después" produce parches, no seguridad.

1. **Secretos solo en variables de entorno.** Cero credenciales, llaves, IPs de dispositivos, URLs de Supabase o tokens en código, tests, seeds, comentarios o repositorio. Módulo de configuración tipado y validado con Zod al arranque: **si falta una variable, la aplicación no arranca**. Se versiona `.env.example` con nombres y descripciones, jamás con valores.
2. **CORS restrictivo.** Lista blanca explícita desde `CORS_ALLOWED_ORIGINS`. Nada de `origin: true` ni `*`. Métodos y cabeceras enumerados; `credentials: true` solo para orígenes propios.
3. **Validación en el backend, siempre.** La del frontend es cortesía de UX; la real es la del servidor. `ValidationPipe` global con `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`. Todo DTO validado. Y además: **el DTO valida forma, el agregado valida verdad** — los invariantes de negocio viven en el dominio.
4. **Anti inyección SQL.** Solo consultas parametrizadas o query builder; prohibida la concatenación de strings para armar SQL. Toda entrada de texto se **sanea y normaliza antes de persistirse**: recorte, normalización Unicode NFC, remoción de caracteres de control y bytes nulos, longitud máxima por campo, escape de HTML en campos que se rendericen. Las placas se normalizan en el objeto de valor. Si hace falta SQL crudo, va en función SQL versionada, parametrizada y `SECURITY INVOKER`.
5. **Rate limiting obligatorio.** `@nestjs/throttler` global más límites endurecidos por ruta sensible: login, MFA, recuperación, creación de autorizaciones, ingesta de eventos, apertura manual y remota. Limita por **IP y por identidad**. Respuesta `429` con `Retry-After`. Los reintentos del Edge usan backoff exponencial con _jitter_ para no chocar con el límite.
6. **RLS activa y forzada en todas las tablas** (`FORCE ROW LEVEL SECURITY`), con `copropiedad_id` derivado de los claims del JWT. **Y además**: la clave `service_role` **omite RLS**, así que toda ruta que la use (Edge, workers, ingesta) valida la copropiedad **también en la capa de aplicación**. El aislamiento se prueba por los dos caminos (KPI-36, KPI-37, CA-24). Este es el riesgo de seguridad número uno del proyecto.
7. **Content Security Policy.** Helmet en la API y CSP en la consola: `default-src 'self'`; `script-src 'self'` **con nonce por request**, sin `unsafe-inline` ni `unsafe-eval`; `object-src 'none'`; `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`; `img-src`/`connect-src`/`media-src` acotados a orígenes propios, Supabase y el puente de video. Más HSTS, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` y `Permissions-Policy` restrictiva (cámara y micrófono solo donde se capturan).
8. **Transversales.** HTTPS obligatorio. MFA TOTP para roles administrativos (RN-20). RBAC por _guard_ declarativo, nunca `if (rol === 'admin')` disperso. Contraseñas y tokens jamás en logs. Evidencia en buckets privados con URLs firmadas de vida corta (RN-21). Tamaño máximo de payload. Carga de archivos validada por **tipo real**, no por extensión. Auditoría append-only garantizada por permisos de base de datos, no solo por código.

### 2.8 Informe de cierre de etapa

#### 2.8.0 Verificación previa — obligatoria, por ejecución real

**Antes de escribir una sola línea del informe** se ejecuta `./scripts/verificar-etapa.sh` y se pega su veredicto en la sección de pruebas. Si sale FALLIDA, la etapa **no se cierra**. No se reportan cifras de pruebas que no salgan de esa ejecución.

El guion parte de un estado **limpio de artefactos** —borra `dist/`, `.turbo/` y `coverage/`— porque el modo de fallo que motivó la regla no es una prueba en rojo, sino un **verde que no se reproduce**:

| Fecha    | Falso verde                                                     | Causa                                                                                                                                                                      |
| -------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ETAPA 03 | La validación de DTOs parecía activa y no lo estaba             | El transformador de pruebas no emitía metadata de decoradores                                                                                                              |
| ETAPA 04 | 51 verdes aquí, 3 rojas en el entorno del usuario               | La suite corría contra un `dist/` de una etapa anterior; `dist` está en `.gitignore`, así que cada checkout tiene el suyo, y `pnpm --filter <app> test` no dispara `turbo` |
| ETAPA 04 | El propio control anti-falso-verde informaba «0 de 14» en macOS | `paste -sd+ \| bc`: sintaxis de GNU que BSD no acepta. El verificador producía un falso **negativo**                                                                       |

De ahí dos controles que el guion incorpora y que no son opcionales:

- **Recuento de ficheros de prueba recogidos frente a los que hay en disco.** Detecta el fichero que existe y **nadie ejecuta** —un patrón `include` que dejó de alcanzarlo, un paquete fuera de la corrida—: ahí no hay ningún rojo, la suite informa «4 passed» y parece correcta.
- **Instalación con `--frozen-lockfile`**, para que una dependencia instalada a mano y no declarada no pase inadvertida.
- **Portabilidad BSD/GNU de las cuatro superficies con shell**: los `.sh`, los `scripts` de cada `package.json`, los ganchos de `.husky/` y los bloques `run:` de los flujos. El entorno de desarrollo objetivo es **macOS**; el CI corre en **Linux**. Un guion que solo funciona en uno de los dos no verifica nada en el otro.
- **Cobertura medida POR CAPA**, no en agregado: §2.4 exige 90 % en dominio **y en aplicación**, y 70 % global. Un agregado alto esconde una capa por debajo — ocurrió: `aplicacion` estaba al 79 % sin que nadie lo midiera.
- **Pruebas negativas de los propios controles.** Un control que nadie ha visto fallar no está demostrado; `scripts/lib/pruebas-negativas.mjs` introduce cada violación y exige que se detecte.
- **Versión de Node y pnpm dentro de lo declarado** (`.nvmrc`, `engines`). La verificación depende de Node, así que el runtime también se comprueba.

Y una regla de diseño derivada: **las pruebas resuelven los paquetes internos a su código fuente, nunca a su `dist/`.** Un artefacto intermedio puede envejecer; el fuente no.

---

En el chat y en `docs/etapas/ETAPA-NN.md`:

1. **Qué se construyó** — en prosa, no lista de archivos.
2. **Cómo se organizó y por qué** — decisión por decisión. _Es la sección más importante:_ el usuario debe entender la arquitectura leyendo solo esto.
3. **Árbol de archivos** creados/modificados, una línea de propósito cada uno.
4. **Tabla SOLID** (§2.3).
5. **Trazabilidad** — OE, RN, HU, CU, CA, KPI y CP cubiertos; y los parcialmente cubiertos, con el motivo.
6. **Pruebas** — qué se probó, cómo ejecutarlas, resultado, cobertura, y el **veredicto literal de §2.8.0**.
7. **Verificación de seguridad** de la etapa, contra el checklist de §2.7.
8. **Deuda técnica**, `[SUPUESTO]` y `PENDIENTE DE DEFINICIÓN` generados.
9. **Qué debe hacer el usuario manualmente** (paneles, credenciales, dispositivos), en pasos numerados.
10. **Rama y commits.**

### 2.9 Estructura del monorepo — un solo repositorio

```
next-control-residencial/
├─ apps/
│  ├─ api/            # NestJS — monolito modular hexagonal
│  ├─ web/            # Next.js — admin + portería + guardia virtual (PWA / escritorio)
│  ├─ mobile/         # Flutter — app del residente
│  └─ edge/           # Edge Gateway Node.js + SQLite
├─ packages/
│  ├─ domain-core/    # dominio puro compartido API ↔ Edge
│  ├─ providers/      # puertos + MockProvider + HikvisionProvider (etapa 15)
│  ├─ contracts/      # OpenAPI, tipos compartidos, clientes generados
│  └─ config/         # tsconfig, eslint, prettier, preset Tailwind compartidos
├─ supabase/
│  ├─ migrations/  ├─ policies/  └─ seed/
├─ docs/
│  ├─ ESTADO_ETAPAS.md
│  ├─ auditoria/   ├─ etapas/   ├─ arquitectura/
│  ├─ decisiones/  # ADR
│  ├─ seguridad/   └─ guias/
└─ .github/workflows/
```

---

## §3. INSUMOS Y ORDEN DE LECTURA

Se leen **en este orden**; cada uno se interpreta a la luz del anterior.

| #   | Archivo                                                                               | Qué aporta                                                                                            | Autoridad                                             |
| --- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1   | `Next_Control_Residencial___Reto_de_Desarrollo.pdf`                                   | Solicitud, alcance comercial, criterios de evaluación con pesos, condiciones de PI y confidencialidad | **Máxima** — el "qué" y el "por qué"                  |
| 2   | `Requisitos_Next_Control_Residencial_v1.docx` (y su equivalente `.md`)                | Especificación formal verificable: OE, KPI, RN, HU, CU, CA, roles, glosario, stack, riesgos           | **Máxima** — el detalle medible                       |
| 3   | `..._Diagrama_Arquitectónico_-_1__Capas_DDD.pdf` + `..._Diagrama_Arquitectónico.json` | Capas, agregados, VOs, puertos, políticas, eventos                                                    | Alta — vinculante salvo contradicción con 1 y 2       |
| 4   | `NexResidential.png`                                                                  | Mockups de consolas web y app móvil                                                                   | Vinculante en estructura y flujo; flexible en píxeles |

**Jerarquía ante conflicto:** PDF del reto → Requisitos → Arquitectura → Mockups.
Nunca resuelvas un conflicto en silencio: documenta `[CONTRADICCIÓN]`, la resolución y su justificación.

**Criterios de evaluación del proyecto y su peso** — úsalos para priorizar esfuerzo cuando tengas que elegir:
arquitectura y calidad del código **25 %** · integración real con hardware Hikvision **25 %** · velocidad y dominio de la herramienta de IA **20 %** · UX y app móvil **10 %** · seguridad, auditoría y protección de datos **10 %** · documentación, pruebas y explicación técnica **10 %**.

---

## §4. DECISIONES DE ARQUITECTURA YA TOMADAS (ADR)

Estas decisiones están **cerradas**. No las reabras ni propongas alternativas salvo que aparezca un impedimento técnico duro, en cuyo caso lo reportas antes de cambiar nada.

### ADR-01 · Intercom: **ISAPI TwoWayAudio** (decisión del cliente)

**Decisión.** El audio bidireccional de la guardia virtual se implementa sobre **ISAPI TwoWayAudio** de Hikvision. Se descarta el camino SIP + Asterisk.

**`[CONTRADICCIÓN]` — resuelta, no reabrir.**
La §13.2 del documento de requisitos (tabla «Stack sugerido», fila _Intercom_) propone _«SIP hacia el videoportero, con puente WebRTC (LiveKit o Janus)»_, y la §13.4 lo señala como el mayor riesgo de cronograma del proyecto. El diagrama arquitectónico, en cambio, deja abiertas ambas rutas: _«ISAPI TwoWayAudio, o SIP con Asterisk si el modelo no lo soporta»_.

**Resolución:** prevalece **ISAPI TwoWayAudio**, por decisión expresa del cliente posterior a la redacción del documento. Esta decisión **sobrescribe** la sugerencia de §13.2, que era eso —una sugerencia dentro de una sección que el propio documento declara ajena al estándar de especificación—, no un requisito con criterio de verificación asociado. Ningún OE, RN, HU, CU ni CA exige SIP; los KPI comprometidos (KPI-32, KPI-33, CA-19, CA-20) son de latencia y trazabilidad, y son agnósticos al protocolo.

**Obligaciones derivadas de esta resolución:**

- La ETAPA 00 debe registrar esta contradicción en `docs/auditoria/contradicciones-y-supuestos.md` con su resolución y esta justificación, y formalizar el ADR-01 en `docs/decisiones/`.
- Toda referencia a SIP, Asterisk, LiveKit o Janus queda **fuera del alcance de implementación**. No se construye, no se deja andamiaje para ello, no se menciona en el código.
- El documento de requisitos original **no se modifica**: la corrección vive en el ADR y en el informe de auditoría. Si Grupo Control revisa el `.docx`, debe encontrar el ADR como el registro formal de por qué lo construido difiere de la sugerencia inicial.
- La ruta SIP sobrevive únicamente como **contingencia documentada** (ver más abajo), realizable como adaptador nuevo detrás del mismo puerto.

**Diseño resultante:**

- El puerto `IntercomProvider` del dominio expone intención pura, sin protocolo: `abrirSesion(dispositivoId, operadorId)`, `enviarAudio(chunk)`, `recibirAudio()`, `cerrarSesion(motivo)`, `estadoSesion()`. El dominio no sabe qué es TwoWayAudio.
- `HikvisionIntercomProvider` (etapa 15) implementa ese puerto: abre el canal por `/ISAPI/System/TwoWayAudio/channels/<id>/open`, transmite y recibe el flujo de audio con autenticación **Digest**, y lo cierra explícitamente. Maneja códec, muestreo y semiduplex/duplex completo según el modelo.
- **Puente de intercom** (servicio en la nube o en el Edge, según latencia): traduce entre el flujo ISAPI y el navegador del operador vía WebSocket/WebRTC. El navegador **nunca** habla ISAPI (RN-12, RN-21).
- **Video** por camino separado: RTSP del equipo → `go2rtc` → WebRTC en el navegador. Audio y video se sincronizan en la consola, no en el dispositivo.
- La **apertura remota** no viaja por el canal de audio: es una orden independiente por `AccessPointProvider`, atribuida al operador y auditada (RN-08, CA-20).

**Consecuencias que debes asumir:**

- Un canal TwoWayAudio suele ser **exclusivo**: gestiona bloqueo por dispositivo, cola de espera y liberación con _timeout_, para que dos operadores no colisionen.
- Objetivos medibles: audio y video < 2 s extremo a extremo (KPI-33, CA-19); apertura remota < 3 s (KPI-32, CA-20).
- Semiduplex en algunos modelos: la consola debe indicar visualmente el turno de palabra.
- **Contingencia** (no es plan A): si el modelo concreto no soporta TwoWayAudio o su latencia excede el umbral, la salida es **un adaptador nuevo** detrás del mismo puerto, sin tocar dominio, aplicación ni interfaz. Ese es precisamente el propósito del puerto.

### ADR-02 · Empaquetado de escritorio: **Tauri**

Menor tamaño y menor superficie de ataque que Electron, con la misma base Next.js. Electron queda como alternativa documentada, no implementada.

### ADR-03 · El hardware va al final, y eso es una prueba, no una concesión

Todo el sistema debe funcionar completo contra `MockProvider`. Si el sistema necesita hardware para demostrarse, el desacople falló y OE-03 no se cumple.

### ADR-04 · La integridad concurrente se resuelve en la base de datos

Invariantes como "una placa activa por vivienda" (RN-04) se garantizan con **índice único parcial**, no con un `SELECT` previo en el código. KPI-03 exige 0 duplicados en 100 inserciones simultáneas: solo la base puede garantizarlo.

### ADR-05 · Inmutabilidad de eventos por permisos de base de datos **y por trigger**

RN-03 y CA-23 se implementan con `REVOKE UPDATE, DELETE, TRUNCATE` sobre `eventos` para todos los roles **y para el dueño de la tabla**, más un trigger `BEFORE UPDATE OR DELETE` que bloquea incluso a quien pueda reconcederse el privilegio. La inmutabilidad no puede depender de que el código "no lo haga".

> **Corrección del 2026-09-06 · verificada contra el proyecto real.** La formulación anterior decía «para todos los roles de aplicación» y ahí estaba el hueco: en Supabase el **dueño** de las tablas es `postgres`, que es **el rol que trae la cadena de conexión por defecto**. Un `REVOKE` que no lo incluye deja intacta la vía por la que la API se conecta de verdad; se comprobó que `UPDATE public.eventos` tenía éxito. Además, **un `REVOKE` solo nunca basta contra el dueño**, porque puede reconcederse el privilegio.
>
> **Resolución, en capas:** (1) `REVOKE` también al dueño —efectivo en Supabase, donde `postgres` **no** es superusuario—; (2) trigger `BEFORE UPDATE`, que sí alcanza al dueño; (3) la RLS misma, que al no existir política de `UPDATE` sobre `eventos` y estar en modo `FORCE` alcanza también al dueño; (4) aserción de despliegue que falla si se revierte cualquiera. El rol de conexión dedicado **`app_api`** es defensa adicional y es un **procedimiento de operador**, no una migración: crearlo desde SQL versionado exige privilegios que Supabase no concede (Enmienda 2 del ADR-005).
>
> **Riesgo residual declarado:** el dueño conserva `ALTER TABLE … DISABLE TRIGGER`. Es un acto de DDL deliberado, no un `UPDATE` desde el código, y la aserción lo detecta en el siguiente despliegue porque verifica `tgenabled`, no solo la existencia del trigger.
>
> Migración `0017` · prueba `supabase/policies/tests/40_inmutabilidad_frente_al_dueno.sql` · procedimiento en `docs/guias/CONEXION_SUPABASE.md` §12.

---

## §5. MAPA DE ETAPAS

| Etapa | Nombre                                                        | Rama                                   | Depende de                       | Demuestra                      |
| ----- | ------------------------------------------------------------- | -------------------------------------- | -------------------------------- | ------------------------------ |
| 00    | Auditoría documental y plan maestro                           | `etapa-00-auditoria-documental`        | —                                | Comprensión verificada         |
| 01    | Modelo de datos y Supabase + guía de conexión                 | `etapa-01-modelo-datos-supabase`       | 00                               | OE-01, OE-08 (base)            |
| 02    | Andamiaje del monorepo y núcleo hexagonal                     | `etapa-02-andamiaje-monorepo`          | 01                               | Fronteras de arquitectura      |
| 03    | Auth, RBAC, MFA y aislamiento multiempresa                    | `etapa-03-auth-rbac-multiempresa`      | 02                               | OE-08                          |
| 04    | Padrón: viviendas, residentes, vehículos                      | `etapa-04-padron`                      | 03                               | OE-01                          |
| 05    | Autorizaciones y motor de reglas + MockProvider               | `etapa-05-autorizaciones-motor-reglas` | 04                               | OE-02, OE-03                   |
| 06    | Eventos, auditoría inmutable, alertas, tiempo real            | `etapa-06-eventos-auditoria`           | 05                               | OE-05                          |
| 07    | Zonas comunes: horario y aforo                                | `etapa-07-zonas-comunes`               | 06                               | CU-05                          |
| 08    | Biometría: consentimiento, calidad, sincronización, supresión | `etapa-08-biometria-consentimiento`    | 06                               | OE-04                          |
| 09    | Consola web de administración (Next.js + Tailwind)            | `etapa-09-consola-administracion`      | 07, 08                           | Pantallas mínimas              |
| 10    | Consolas de portería y guardia virtual                        | `etapa-10-consolas-operativas`         | 09                               | OE-07 (sin hardware)           |
| 11    | App móvil Flutter del residente                               | `etapa-11-app-flutter-residente`       | 09                               | OE-02 extremo a extremo        |
| 12    | Edge Gateway: offline y reconciliación                        | `etapa-12-edge-gateway-offline`        | 06                               | OE-06                          |
| 13    | Auditoría de ciberseguridad y endurecimiento                  | `etapa-13-auditoria-seguridad`         | 12                               | KPI-36 a 38                    |
| 14    | Observabilidad, CI/CD, PWA instalable y escritorio            | `etapa-14-cicd-pwa-escritorio`         | 13                               | Entregabilidad                 |
| 15    | **Integración real con hardware Hikvision**                   | `etapa-15-integracion-hikvision`       | 14                               | OE-03, OE-07 reales            |
| 16    | **Documentación técnica final y README**                      | `etapa-16-documentacion-final`         | 14 (ejecutable), 15 (definitiva) | Entregable documental completo |

---

## §6. ETAPAS EN DETALLE

> Cada etapa se ejecuta con el mismo esqueleto: **Objetivo → Alcance → Fuera de alcance → Entregables → Trazabilidad → Definición de Terminado (DoD)**. El DoD no es opcional: si un ítem no se cumple, la etapa no se cierra.

---

### ETAPA 00 — Auditoría documental y plan maestro

`etapa-00-auditoria-documental` · **No se escribe código de producto.**

**Objetivo.** Demostrar comprensión verificada de los cuatro insumos antes de tocar una línea de código, y producir el plan que gobierna las 15 etapas restantes.

**Alcance — cuatro pasos, en este orden exacto:**

**Paso 1 · Solicitud del proyecto (PDF del reto).** Lee completo. Tabula: misión; los 3 perfiles y lo que cada uno debe poder hacer; el núcleo funcional (LPR/ANPR, facial, control físico, zonas, motor de reglas, eventos y auditoría); el modelo de guardia virtual con su cadena _visitante → intercom → central → validación → apertura remota_; la tabla de integración Hikvision componente por componente; las pantallas mínimas de administración y de la app; los 3 hitos técnicos (prototipo funcional, prueba LPR real, prueba facial real); la matriz de evaluación con pesos; las obligaciones de PI y confidencialidad; y las exigencias de privacidad, seguridad y disponibilidad. Cierra explicando qué implica _"Next Control decide, el hardware ejecuta"_ para cada capa de la arquitectura.

**Paso 2 · Requisitos, con verificación de legibilidad.** Lee el `.docx` (fuente original) y contrástalo con el `.md`. Produce un informe de legibilidad que reporte: codificación, BOM, tipo de salto de línea, tablas malformadas o truncadas, caracteres corruptos o backticks residuales dentro de celdas; **verificación de la numeración de los KPI** confirmando lo ya detectado (falta `KPI-19`; la entrada 21 aparece como `KP1-21`) y cualquier otra anomalía; inventario final verificado contra la tabla de §1; requisitos ambiguos o sin criterio de verificación; **propuesta de sección formal de requisitos no funcionales** derivada de los KPI de latencia, disponibilidad y seguridad; y contradicciones internas o con el PDF, marcadas y resueltas. **No modifiques el documento original**: las correcciones van en un derivado.

**Paso 3 · Arquitectura propuesta.** Lee el PDF de capas DDD y el JSON del diagrama. Reconstruye y valida las 5 capas, los 6 agregados raíz, los 6 objetos de valor, los 3 grupos de puertos, las 3 políticas y los eventos de dominio. Verifica que **cada una de las 22 RN tenga un lugar donde vivir** en el dominio, y señala los huecos: reglas sin agregado, agregados sin invariante explícita, puertos sin adaptador previsto. Confirma que ADR-01 (ISAPI TwoWayAudio) queda correctamente encapsulado tras `IntercomProvider`.

**Paso 4 · Mockups.** Analiza `NexResidential.png`. Inventaría cada pantalla: login multi-rol; dashboard operativo con tarjetas de KPI, eventos en tiempo real, accesos por hora y estado de dispositivos; gestión de viviendas; vehículos y placas; control de visitantes con tarjetas de aprobación/rechazo; zonas comunes con aforo y reservas del día; dispositivos con estado en línea/fuera de línea y sincronización; historial de eventos con filtros y exportación; informes y auditoría; consola de guardia virtual con video en vivo, ficha del visitante, abrir/denegar y alerta de emergencia; y las 8 pantallas móviles del residente (inicio, mi familia, mis vehículos, nuevo visitante, zonas comunes, historial, notificaciones, perfil). Por cada una: rol, HU que cubre, entidades y campos expuestos, acciones, y **los estados que el mockup no muestra** (vacío, cargando, error, sin permiso, offline). Deriva el sistema de diseño —paleta, tipografía, densidad, navegación, componentes recurrentes— como especificación del preset Tailwind de la etapa 09.

**Entregables.**
`docs/auditoria/00-solicitud.md` · `01-legibilidad-requisitos.md` · `02-arquitectura.md` · `03-mockups.md` · `04-requisitos-no-funcionales.md` · `matriz-trazabilidad-consolidada.md` (OE → RN → HU → CU → CA → KPI → CP → etapa → pantalla) · `contradicciones-y-supuestos.md` · `docs/ESTADO_ETAPAS.md` inicializado · `docs/decisiones/` con los ADR de §4 formalizados.

**DoD.** Los 38 HU, 26 CA y 37 KPI están asignados a una etapa concreta. Ninguno queda huérfano. Toda contradicción está documentada con su resolución.

---

### ETAPA 01 — Modelo de datos y Supabase

`etapa-01-modelo-datos-supabase`

**Objetivo.** Un esquema que haga estructuralmente imposible violar las reglas de negocio, y una guía que permita al usuario conectar su proyecto Supabase sin ambigüedad.

**Alcance.**

_1 · Diseño._ Deriva el esquema desde los **agregados**, no desde las pantallas. Mínimo: `copropiedades` · `usuarios` y `roles_usuario` · `viviendas` · `residentes` · `vehiculos` · `visitantes` · `autorizaciones` · `autorizacion_acompanantes` · `patrones_recurrencia` · `zonas` · `zona_aforo` · `autorizaciones_zona` · `dispositivos` · `puntos_de_acceso` · `consentimientos_biometricos` · `plantillas_biometricas` (metadatos y estado de sincronización) · `listas_negras` · `reglas` y `versiones_de_reglas` · `eventos` (append-only, **particionada por mes**) · `evidencias` · `alertas` · `auditoria_seguridad` · `bandeja_salida_edge` con claves de idempotencia · esquema de pg-boss.

Requisitos no negociables del diseño:

- `copropiedad_id` **NOT NULL** en toda tabla operativa: es la frontera del tenant.
- **Sin borrado físico** donde hay historial: `estado` + `desactivado_en` (RN-19, CA-02, KPI-04), reforzado por trigger que impida el `DELETE`.
- `eventos` inmutable por permisos **y por trigger**, con el dueño de la tabla incluido en la revocación (ADR-05, RN-03, CA-23).
- Auditoría en toda tabla: `creado_en`, `creado_por`, `actualizado_en`, `actualizado_por` (KPI-05).
- Enumerados para resultados y motivos; `tstzrange` para vigencias con zona horaria; normalización explícita de placas y documentos.
- **Índices únicos parciales** para invariantes concurrentes (ADR-04): único sobre `(copropiedad_id, placa)` filtrado por `activo = true` (KPI-02, KPI-03, CA-03).
- Índices de consulta para los filtros reales de las pantallas: eventos por vivienda, persona, dispositivo y rango de fechas.

_2 · Migraciones y RLS._ SQL versionado, idempotente y reversible en `supabase/migrations/`. RLS habilitada **y forzada** en todas las tablas, con política por rol derivada de los claims del JWT, y **prueba negativa por cada política**.

_3 · Seeds._ Una copropiedad ficticia coherente con los mockups. Datos inventados; cero datos reales; cero secretos.

_4 · `docs/guias/CONEXION_SUPABASE.md`_ — paso a paso, asumiendo que el usuario **ya tiene credenciales**:

- Dónde encontrar en el panel: _Project URL_, **llave publicable** (`sb_publishable_…`), **llave secreta** (`sb_secret_…`), **URL del JWKS**, cadena directa y de _pooler_.
- Qué llave usa cada superficie y por qué: la **publicable** en web y móvil (resuelve al rol `anon`, sujeta a RLS); la **secreta** **solo en servidor** (API, workers, Edge), nunca en un cliente, nunca en `NEXT_PUBLIC_*`, nunca compilada en Flutter.
  > **Corrección del 2026-09-06.** El proyecto de Grupo Control usa el esquema nuevo: **no tiene `anon` ni `service_role` como llaves de API, ni secreto JWT compartido**. Los proyectos creados desde noviembre de 2025 ya no traen las llaves heredadas, y desde el 1 de octubre de 2025 los proyectos nuevos usan **firma asimétrica** por defecto. Lo que **no** cambia: los **roles de PostgreSQL** `anon`, `authenticated` y `service_role` siguen existiendo y las llaves resuelven a ellos, así que el esquema, los `GRANT`/`REVOKE` y las políticas RLS de la ETAPA 01 no se tocan. La llave secreta sigue omitiendo RLS: **el riesgo número uno no cambia, solo cambia el nombre de la variable**.
- `.env.example` por aplicación, con la advertencia explícita de que todo `NEXT_PUBLIC_*` es público por definición y de que **todo lo compilado en Flutter es extraíble del binario**.
- CLI: instalación, `supabase link`, aplicación de migraciones, verificación de que RLS quedó activa y **comprobación práctica del aislamiento** (una consulta cruzada entre copropiedades debe fallar).
- Auth: MFA TOTP, expiración de tokens, _custom claims_ de `copropiedad_id` y rol vía _auth hook_.
- Storage: buckets privados de evidencia, políticas y URLs firmadas de vida corta.
- Extensiones (`pgcrypto`, `pg_cron` si aplica) y esquema de pg-boss.
- Backups, retención y **procedimiento de rotación de llaves**: qué se rompe y en qué orden se rota.
- Checklist final con casilla por ítem.

**Entregables.** Migraciones, políticas, seeds, la guía, y `docs/arquitectura/modelo-datos.md` con diagrama entidad-relación en Mermaid y justificación de cada decisión no obvia.

**DoD.** Las migraciones corren limpias sobre una base vacía. RLS activa en el 100 % de las tablas. Cada RN de integridad tiene su contraparte estructural identificada.

---

### ETAPA 02 — Andamiaje del monorepo y núcleo hexagonal

`etapa-02-andamiaje-monorepo`

**Objetivo.** Que la arquitectura sea imposible de violar por accidente, porque el linter lo impide.

**Alcance.** Monorepo de §2.9 (pnpm workspaces + Turborepo). NestJS con configuración tipada y validada (arranque fallido ante variable faltante). Núcleo hexagonal real aunque vacío: puertos, tokens de inyección, `Result`/`Either` tipado, `Reloj` inyectable, `GeneradorDeId`, unidad de trabajo, política de idempotencia, bus de eventos de dominio, manejo global de errores y logger estructurado con **redacción de datos sensibles**.

Seguridad ya activa: Helmet + CSP, CORS por lista blanca, `ValidationPipe` estricto, `ThrottlerModule`, límite de payload, `/health` y `/ready`.

Herramientas: ESLint con **reglas de frontera** que rompan el build si `domain/` importa infraestructura o si aparece `any`; Prettier; Husky + lint-staged; **escaneo de secretos en pre-commit**; Vitest/Jest; generación de OpenAPI; preset Tailwind compartido.

**Entregable adicional.** `docs/arquitectura/CONVENCIONES.md`: reglas de módulo, nomenclatura, y el procedimiento exacto para crear un módulo nuevo sin romper las fronteras.

**DoD.** Un intento deliberado de importar Supabase desde `domain/` falla el build. La app no arranca sin `.env` completo.

---

### ETAPA 03 — Autenticación, RBAC, MFA y aislamiento multiempresa

`etapa-03-auth-rbac-multiempresa`

**Objetivo.** Cerrar el riesgo número uno del proyecto: la fuga de datos entre copropiedades.

**Alcance.** Integración con Supabase Auth: **verificación asimétrica del JWT contra el JWKS del proyecto** —nunca HS256 con secreto compartido, que este proyecto ya no tiene—, _custom claims_ de copropiedad y rol, refresco y revocación de sesión. Los **6 roles** implementados como guards declarativos y decoradores de permiso.

> **Diseño vinculante:** `docs/arquitectura/verificacion-jwt-asimetrica.md`, escrito en la ETAPA 01 y verificado contra la documentación oficial. Fija las reglas de verificación (algoritmo tomado de la clave y no del token, HS256 rechazado, TTL de caché de 10 min alineado con el edge de Supabase, fallo cerrado), el procedimiento de rotación sin caída con su margen de 20 minutos, y las consecuencias de la **expiración de 5 minutos** para Flutter (ETAPA 11), el canal de tiempo real (ETAPA 06) y el rate limiting. El Edge (ETAPA 12) **no** se ve afectado: usa la llave secreta, no un token de usuario.

MFA TOTP obligatorio para roles administrativos (RN-20, CA-25): alta, verificación, códigos de recuperación de un solo uso almacenados en hash, y bloqueo del acceso hasta completar el segundo factor.

**Aislamiento por doble camino:** interceptor que deriva `copropiedad_id` del token e inyecta el contexto del tenant en cada caso de uso; RLS como segunda barrera; y validación explícita en la capa de aplicación para **toda ruta que use `service_role`**, porque esa llave omite RLS. Todo acceso cruzado responde 403/404 y se registra en `auditoria_seguridad` (RN-15, CA-24).

Rate limiting endurecido en login, MFA y recuperación.

**Entregable crítico.** Suite automatizada que recorre **todos** los endpoints con identificadores de otra copropiedad, por los dos caminos (JWT de usuario y `service_role`), ejecutable en CI y que **rompe el build** ante cualquier fuga. KPI-36, KPI-37, KPI-38, CP-11.

**DoD.** 100 % de endpoints cubiertos por la suite de aislamiento. Ningún rol administrativo entra sin segundo factor.

---

### ETAPA 04 — Padrón

`etapa-04-padron`

**Objetivo.** La base sobre la que operan todas las reglas: OE-01.

**Alcance.** Agregado `Vivienda` (con residentes y vehículos) y VO `Placa` normalizada al construirse. Casos de uso: `CrearVivienda`, `EditarVivienda`, `DesactivarVivienda`, `RegistrarResidente`, `DesactivarResidente`, `RegistrarVehiculo`, `DesactivarVehiculo`, `CargarPadronDesdeArchivo` (CSV/XLSX con validación fila a fila, reporte de errores y carga transaccional).

Invariantes: una placa activa por vivienda (RN-04, CA-03); integridad referencial residente↔vivienda (KPI-01); prohibición de borrado físico con historial (RN-19, CA-02); integridad bajo concurrencia por restricción de base (KPI-03); vivienda inactiva no genera nuevas autorizaciones pero conserva las vigentes (RN-13).

**Trazabilidad.** HU-01 a HU-06 · CA-01 a CA-03 · CP-01 · KPI-01 a KPI-05.

**DoD.** Prueba de concurrencia real: 100 inserciones simultáneas, 0 duplicados.

---

### ETAPA 05 — Autorizaciones y motor de reglas

`etapa-05-autorizaciones-motor-reglas`

**Objetivo.** El corazón del producto: la decisión de acceso, pura y auditable, funcionando sin hardware.

**Alcance.** Agregado `Autorización` con `Vigencia`, `PatrónRecurrencia`, acompañantes, zonas permitidas y revocación. Casos de uso: `CrearAutorizacion`, `CrearRecurrente`, `AgregarAcompanante`, `RevocarAutorizacion`.

**Motor de reglas como función pura** `evaluarAcceso(contexto, reglas) => Decisión`, con reloj inyectado y cero I/O. Políticas componibles: `PolíticaListaNegra` con **precedencia absoluta** sobre cualquier autorización vigente (RN-06), `PolíticaVigencia` (RN-01), `PolíticaRecurrencia` (RN-22), `PolíticaVivienda` (RN-05), `PolíticaZona` (RN-14). **Cada decisión sella la `VersiónDeReglas` con la que se tomó** — es lo que hará auditable al Edge en la etapa 12.

`MockProvider` completo implementando los cuatro puertos de proveedor, con simulación de latencia, fallos, reintentos, eventos duplicados y **lecturas de baja confianza que no deben decidirse automáticamente** (CU-01, excepción 3a). Toda la suite corre sin hardware (KPI-12).

Análisis estático en CI que falle si aparece `ISAPI` o una IP de dispositivo fuera de `packages/providers` (KPI-11).

Gestión de listas negras con control de quién puede crearlas y levantarlas (HU-35, RN-07).

**Trazabilidad.** CU-01 completo con Mock · HU-07 a HU-10, HU-16, HU-17, HU-35 · CA-04 a CA-07, CA-12, CA-13 · CP-02, CP-03, CP-04 · KPI-06 a KPI-12.

**DoD.** El motor de reglas tiene 100 % de cobertura de ramas. CU-01 y sus cuatro flujos alternos pasan contra `MockProvider`.

---

### ETAPA 06 — Eventos, auditoría inmutable, alertas y tiempo real

`etapa-06-eventos-auditoria`

**Objetivo.** OE-05: que ningún acceso exista sin evento, y que ningún evento pueda alterarse.

**Alcance.** Agregado `Acceso` inmutable —sin setters, sin update, sin delete—. Todo intento, permitido o negado, genera evento con actor, dispositivo, zona, resultado, regla aplicada, versión de reglas y evidencia (RN-02, KPI-23). Ingesta idempotente. Evidencia en bucket privado con URL firmada de vida corta.

Alertas y **escalamiento automático** de eventos críticos —lista negra, sabotaje, dispositivo caído, acceso dudoso— al operador de central en menos de 10 s (RN-18, CA-18, KPI-25). Push a residentes por FCM (HU-34). Canal de tiempo real hacia las consolas, **midiendo latencia bajo carga desde ya** y con plan de contingencia documentado si Supabase Realtime no alcanza el umbral (riesgo identificado en el propio documento de requisitos).

Consulta, filtrado y exportación del historial en PDF/Excel/CSV (HU-32), como en el mockup de Informes.

**Trazabilidad.** HU-32, HU-34 · CA-18, CA-23 · CP-07, CP-08 · KPI-22 a KPI-27.

**DoD.** Un intento de `UPDATE` o `DELETE` sobre `eventos` falla a nivel de base de datos con cualquier rol de aplicación.

---

### ETAPA 07 — Zonas comunes

`etapa-07-zonas-comunes`

**Objetivo.** CU-05 completo: horario y aforo se respetan aunque la persona tenga permiso.

**Alcance.** Agregado `Zona` con horario, `Aforo` (invariante: el conteo nunca supera el máximo), controladores asociados y normas configurables como en el mockup. Casos de uso: `ConfigurarZona`, `AutorizarZonaAVisitante`, `ValidarAforo`, `LiberarAforo`. Política horaria de reinicio del contador ante salida no registrada por falla de sensor (CU-05, excepción 6a).

**Trazabilidad.** HU-18, HU-19, HU-20 · CA-14, CA-15 · CP-05 · KPI-15 · RN-14.

**DoD.** Pruebas en el límite: aforo exacto, aforo+1, minuto de apertura y minuto de cierre del horario.

---

### ETAPA 08 — Biometría con consentimiento

`etapa-08-biometria-consentimiento`

**Objetivo.** OE-04 con cumplimiento normativo real, no decorativo.

**Alcance.** Agregado `Consentimiento` (titular, finalidad, versión de política, evidencia, revocación). CU-02 completo: captura → validación de calidad (encuadre, nitidez, iluminación, rostro único; HU-13, CA-08, KPI-16) → solicitud de consentimiento **al visitante, no al residente** (RN-10) → aceptación → generación de plantilla → encolado de sincronización → programación de supresión.

Bloqueo duro: **sin consentimiento vigente no hay sincronización** (RN-09, CA-09). Supresión automática dentro de 24 h del vencimiento y **supresión inmediata ante revocación** (RN-11, CA-10, CA-11), implementada con pg-boss y reintentos. Manejo del flujo alterno en que el visitante no responde: la autorización queda vigente solo por placa.

Pantalla de consentimiento del visitante. La plantilla vive en la terminal y cifrada en base; **nunca en el cliente**.

**Entregable adicional.** `docs/seguridad/ciclo-vida-biometrico.md`: ciclo completo del dato bajo Ley 1581 de 2012, desde la captura hasta la supresión verificada.

**Trazabilidad.** HU-11 a HU-15 · CA-08 a CA-11 · CP-06 · KPI-16 a KPI-18, KPI-20, KPI-21 _(la registrada como `KP1-21`)_.

**DoD.** Es imposible sincronizar una plantilla sin consentimiento registrado, probado tanto por API como por ruta de servicio.

---

### ETAPA 09 — Consola web de administración

`etapa-09-consola-administracion`

**Objetivo.** Las pantallas mínimas de administración, fieles a los mockups.

**Alcance.** Next.js + TypeScript + Tailwind: login multi-rol; dashboard operativo (tarjetas de KPI, eventos en tiempo real, accesos por hora, estado de dispositivos); viviendas; vehículos y placas; visitantes y autorizaciones; zonas comunes; dispositivos y sincronización; eventos y alertas; informes y auditoría.

Implementa el **preset Tailwind** derivado en la etapa 00. Estados vacío/cargando/error/sin permiso/offline en toda vista. Accesibilidad AA. **Cliente de API generado desde OpenAPI**, nunca escrito a mano. CSP con nonce, sin `unsafe-inline`. Base de PWA (manifest, service worker, instalabilidad) que se completa en la etapa 14.

**Trazabilidad.** HU-01 a HU-04, HU-18, HU-32, HU-35, HU-36, HU-38 · KPI-14.

**DoD.** Ninguna vista consulta Supabase directamente saltándose la API. Ninguna clave de servicio llega al navegador.

---

### ETAPA 10 — Consolas operativas

`etapa-10-consolas-operativas`

**Objetivo.** OE-07 completo contra simulación; la parte física llega en la etapa 15.

**Alcance.**

_Portería:_ evento actual con evidencia, vivienda destino y autorización; apertura o negación manual con **motivo obligatorio** —sin motivo no se ejecuta la apertura— (CA-16, CA-17, RN-08); historial inmediato; alertas y listas negras activas. HU-21 a HU-24.

_Guardia virtual:_ consola multiproyecto con conmutación entre copropiedades **sin fuga de datos** (KPI-35); cola de eventos con indicador de tiempo de espera; ficha de la vivienda; video en vivo; audio bidireccional tras `IntercomProvider` (ADR-01, implementación simulada en esta etapa); abrir/denegar atribuido al operador; contacto con el residente; escalamiento y alerta de emergencia. Manejo de los flujos alternos de CU-03: residente que no responde, residente que niega, operador ocupado en otra copropiedad, ausencia de operador disponible.

Gestión de **exclusividad del canal de audio**: bloqueo por dispositivo, cola y liberación por timeout (consecuencia de ADR-01).

**Trazabilidad.** CU-03 · HU-21 a HU-29 · CA-16 a CA-20 · CP-10 · KPI-32 a KPI-35.

**DoD.** Un operador alternando entre dos copropiedades no ve ni un dato de la otra, verificado por prueba automatizada.

---

### ETAPA 11 — Aplicación móvil Flutter del residente

`etapa-11-app-flutter-residente`

**Objetivo.** OE-02 de extremo a extremo. Es una de las piezas centrales del producto y pesa en la evaluación de UX.

**Alcance.** Las 8 pantallas del mockup: inicio/mi vivienda, mi familia, mis vehículos, nuevo visitante (vigencia desde/hasta, acompañantes, autorización vehicular, observaciones), zonas comunes con aforo y solicitud de acceso, historial con filtros, notificaciones y perfil con preferencias.

Arquitectura limpia también en Dart (dominio, casos de uso, repositorios). **Cliente generado desde OpenAPI**, nunca a mano —el documento de requisitos lo señala explícitamente porque Dart es el único componente que no comparte tipos con el resto—. Almacenamiento seguro de sesión (Keychain/Keystore). FCM. Captura de cámara con validación de calidad **antes** del envío. Modo sin conexión con reintento. **Ningún secreto en el binario.**

**Trazabilidad.** HU-05, HU-07 a HU-11, HU-19, HU-33, HU-34 · CA-04 a CA-08 · KPI-06 a KPI-10.

**DoD.** Un residente crea una autorización en menos de 60 s de extremo a extremo (KPI-10), medido con prueba de usabilidad.

---

### ETAPA 12 — Edge Gateway

`etapa-12-edge-gateway-offline`

**Objetivo.** OE-06, el diferenciador técnico del producto.

**Alcance.** Node.js + TypeScript + SQLite, **reutilizando `packages/domain-core` sin modificarlo**: la misma decisión debe producirse en la nube y en el Edge. Caché de reglas versionado; detección de pérdida de WAN y conmutación a modo autónomo; decisión local marcando la `VersiónDeReglas` usada (RN-16, CA-21); bandeja de salida con **clave de idempotencia**; reconciliación ordenada al reconectar con descarte silencioso de duplicados (RN-17, CA-22); reanudación desde el último evento confirmado ante conexión intermitente; **política de contingencia configurable** cuando la regla no está en caché (denegar por defecto o escalar al portero); y marcado de eventos decididos con caché potencialmente obsoleto (KPI-31).

**Entregable adicional.** `docs/guias/DESPLIEGUE_EDGE.md`: aprovisionamiento, identidad de servicio, rotación de credenciales, sincronización de reloj y actualización remota.

**Trazabilidad.** CU-04 · HU-30, HU-31 · CA-21, CA-22 · CP-09 · KPI-28 a KPI-31.

**DoD.** 30 minutos sin WAN con 20 accesos de prueba resueltos localmente; al reconectar, los 20 aparecen en la nube exactamente una vez en menos de 5 minutos. Prueba de 24 h de autonomía sin degradación.

---

### ETAPA 13 — Auditoría de ciberseguridad y endurecimiento

`etapa-13-auditoria-seguridad`

**Objetivo.** Verificar y endurecer. **No introduce la seguridad por primera vez**: §2.7 la exigía desde la etapa 01.

**Alcance.** Produce `docs/seguridad/AUDITORIA.md` con hallazgo, severidad, evidencia, remediación y verificación posterior. Cubre:

- Inventario de secretos y confirmación de que ninguno está en el código **ni en el historial de Git**.
- CORS verificado por origen, método y cabecera.
- Validación de entrada en backend: _fuzzing_ de DTOs, tipos inesperados, sobrecarga de tamaño, Unicode, bytes `NUL`, campos no declarados.
- Inyección SQL sobre **todos** los campos persistidos, y verificación del saneamiento previo al guardado.
- Rate limiting bajo carga, y verificación de que el backoff del Edge no lo dispara.
- **Matriz completa de RLS**, política por política, con prueba positiva y negativa, incluyendo las rutas `service_role`.
- CSP y cabeceras verificadas con reporte real de violaciones.
- XSS almacenado y reflejado; IDOR sobre cada recurso; escalamiento de privilegios entre los 6 roles.
- Seguridad de carga de archivos (tipo real, no extensión).
- Fugas por logs y por mensajes de error.
- Dependencias vulnerables (`audit` + SCA en CI).
- OWASP Top 10 y OWASP ASVS nivel 2 como listas de verificación formales.
- Ejecución de la batería de KPI de seguridad y auditoría: KPI-22 a KPI-24, KPI-36 a KPI-38.

**DoD.** Cero hallazgos críticos o altos abiertos. Cada hallazgo medio o bajo tiene remediación o aceptación de riesgo documentada y firmada.

---

### ETAPA 14 — Observabilidad, CI/CD, PWA y escritorio

`etapa-14-cicd-pwa-escritorio`

**Objetivo.** Que el sistema sea entregable, medible y verificable de forma automática.

**Alcance.** Logs estructurados con correlación de petición; Sentry; **métricas de las latencias comprometidas** (KPI-09, 13, 25, 32, 33) con tableros que las sustenten —el documento exige poder demostrarlas, no solo afirmarlas—.

GitHub Actions: lint; análisis estático de frontera de arquitectura (KPI-11); suite completa con adaptador simulado (KPI-12); cobertura mínima; escaneo de secretos y de dependencias; build de las cuatro aplicaciones; migraciones verificadas; suite de aislamiento multiempresa.

**PWA completa:** manifest, iconos, service worker con estrategia de caché explícita, comportamiento offline razonable, instalabilidad verificada en escritorio y móvil.
**Escritorio:** empaquetado con **Tauri** (ADR-02), actualizaciones firmadas, ventana y menús propios, política de red restringida al backend propio.

**Entregables.** `docs/guias/DESPLIEGUE.md` y `docs/guias/MANUAL_USUARIO.md` por rol.

**DoD.** Un solo repositorio produce API, consola web, PWA instalable, aplicación de escritorio, app Flutter y Edge Gateway, todo desde CI.

---

### ETAPA 15 — Integración real con hardware Hikvision _(última, por diseño)_

`etapa-15-integracion-hikvision`

**Objetivo.** Sustituir `MockProvider` por `HikvisionProvider` **sin tocar nada más**. Pesa el 25 % de la evaluación del proyecto.

**Precondición.** Esta etapa se ejecuta **solo** cuando el usuario tenga acceso al equipo y entregue un prompt adicional con la documentación ISAPI del modelo concreto, IPs, credenciales y llaves de referencia.

**Regla dura.** Implementas adaptadores de puertos ya existentes. **Si necesitas modificar el dominio, la aplicación o la interfaz, es un defecto de diseño de las etapas anteriores: detente y repórtalo antes de tocar nada.** Esa verificación es, en sí misma, la prueba de OE-03.

**Alcance.**

- ISAPI sobre HTTP con **autenticación Digest**; único punto del sistema que toca hardware.
- **Alarm Server HTTP** que recibe el POST multipart de la cámara: XML del evento, foto completa y recorte de placa. Normalización al contrato de evento ya definido en la etapa 05.
- **Verificación de que la cámara opera en modo evento** —reporta sin accionar—. Si el modelo decide por su cuenta, es un hallazgo de bloqueo: repórtalo antes de continuar.
- Accionamiento de relé para talanquera, torniquete y puertas, con medición de latencia.
- Alta, baja y sincronización de plantillas en terminales faciales, con supresión verificada.
- **Intercom por ISAPI TwoWayAudio** según ADR-01: apertura del canal, transmisión bidireccional, gestión de exclusividad, cierre explícito, y el puente hacia el navegador del operador. Video por RTSP → go2rtc → WebRTC.
- Descubrimiento ONVIF (WS-Discovery) para inventariar los equipos de la red del conjunto.
- Controlador de E/S: relés, sensores, reporte de sabotaje y estado de puerta (KPI-26).
- Mapa de errores del fabricante hacia los motivos tipados del dominio.

**Lo que ya debe estar listo desde la etapa 05 y solo se conecta aquí:** puertos estables, contrato de eventos normalizados, registro de dispositivos y credenciales por copropiedad (en variables de entorno o cifradas en base, **nunca en código**, RN-21), umbral de confianza de lectura configurable, y política de reintentos.

**Entregable estrella: `docs/guias/INTEGRACION_HIKVISION.md`** — guía paso a paso, escrita para ejecutarse frente al equipo físico:

1. Inventario y prerrequisitos: modelos, firmware mínimo, licencias, topología, VLAN, direccionamiento fijo, puertos requeridos en cada sentido.
2. Acceso inicial a cada equipo, cambio de credenciales de fábrica y creación de usuario de servicio con privilegio mínimo.
3. Configuración de la cámara LPR en **modo evento** y del Alarm Server apuntando al endpoint de ingesta, con el formato exacto del POST esperado y ejemplo de payload.
4. Relé y talanquera: configuración, prueba de accionamiento y medición de latencia (< 3 s, KPI-13).
5. Terminal facial: alta de la primera plantilla y verificación del ciclo alta → reconocimiento → supresión.
6. **Intercom TwoWayAudio**: habilitación del canal, verificación de códec y muestreo, prueba de duplex, medición de latencia extremo a extremo (< 2 s, KPI-33), y configuración del puente hacia el navegador.
7. Registro de cada dispositivo en Next Control y prueba de sincronización.
8. Batería de pruebas de aceptación en sitio, criterio por criterio, con hoja de resultados por KPI.
9. Diagnóstico de fallos frecuentes: Digest rechazado, eventos duplicados, lecturas de baja confianza, relé que no responde, terminal degradada, canal de audio ocupado, reloj desincronizado.
10. **Rollback a `MockProvider` sin detener el servicio**, y plan de puesta en marcha por fases.

**DoD.** Los tres hitos técnicos del reto se ejecutan de punta a punta con hardware real: prototipo funcional, prueba LPR real (registrar placa desde la app → detectar → validar → abrir talanquera → registrar evento) y prueba facial real (foto desde la app → sincronizar terminal → reconocer → validar zona → liberar acceso → registrar evento).

---

### ETAPA 16 — Documentación técnica final y README

`etapa-16-documentacion-final`

**Objetivo.** Que cualquier ingeniero que llegue nuevo al proyecto —o cualquier evaluador de Grupo Control— pueda entenderlo, levantarlo y operarlo leyendo el repositorio, sin preguntarle nada a quien lo construyó. La documentación pesa el **10 % de la evaluación** del reto y es la única parte del entregable que se lee antes que el código.

**Cuándo se ejecuta.** Se puede ejecutar apenas cerrada la ETAPA 14, si la 15 se pospone por falta de hardware. En ese caso **se vuelve a ejecutar tras la ETAPA 15** para incorporar la integración real, y el README indica explícitamente qué estaba verificado contra `MockProvider` y qué contra hardware.

**Alcance.**

_1 · `README.md` en la raíz — el documento de entrada al proyecto._ Debe contener, en este orden:

1. **Encabezado**: nombre, una frase de qué es, estado del proyecto, versión, y el principio rector (_Next Control decide, el hardware ejecuta_).
2. **Índice** navegable con anclas a cada sección, incluidas las subsecciones de segundo nivel. Verificado: ningún enlace roto, ningún ancla huérfana.
3. **Qué resuelve** — el problema AS-IS (los 6 PB) y el beneficio esperado, en prosa breve.
4. **Arquitectura** — las 5 capas, el diagrama en Mermaid, la estructura del monorepo comentada carpeta por carpeta, y el mapa de módulos con sus fronteras.
5. **Stack tecnológico** con la justificación de cada elección.
6. **Puesta en marcha** — prerrequisitos con versiones exactas, clonado, instalación, variables de entorno (remitiendo a `.env.example`, jamás con valores), migraciones, seeds, arranque de cada una de las cuatro aplicaciones, y verificación de que todo levantó. Un ingeniero nuevo debe llegar a "funcionando" siguiendo solo esta sección.
7. **Cómo ejecutar las pruebas**, incluida la suite completa con adaptador simulado y sin hardware.
8. **Modelo de datos** — resumen y enlace al detalle.
9. **Seguridad** — resumen de las 8 medidas de §2.7 y enlace a la auditoría.
10. **Decisiones de arquitectura (ADR)** — tabla con id, decisión, estado y enlace. ADR-01 explicando por qué el intercom es ISAPI y no SIP.
11. **Trazabilidad** — enlace a la matriz consolidada y estado de cobertura de los 8 OE, 22 RN, 38 HU, 5 CU, 26 CA y 37 KPI.
12. **Mapa de etapas** con enlace a cada informe.
13. **Guías operativas** — índice de las guías de `docs/guias/`.
14. **Convenciones de contribución** — ramas, commits, fronteras de arquitectura, umbral de cobertura.
15. **Glosario** (ver punto 2).
16. **Licencia y propiedad intelectual** — la cláusula de titularidad de Grupo Control y la restricción de reutilización.

_2 · Glosario, dentro del README y con ancla propia._ Los 22 términos del documento de requisitos —copropiedad, vivienda, residente, visitante, autorización, autorización recurrente, acceso, apertura, evento, dispositivo, terminal facial, plantilla biométrica, consentimiento, vigencia, zona, aforo, lista negra, motor de reglas, Edge Gateway, proveedor, adaptador simulado, clave de idempotencia— **más los términos técnicos que introdujo la construcción**: agregado raíz, objeto de valor, puerto, adaptador, política, especificación, versión de reglas, bandeja de salida, RLS, ISAPI, TwoWayAudio, Digest, ONVIF, LPR/ANPR, RBAC, MFA, CSP. Cada entrada: definición en el contexto de este proyecto —no la genérica— y, cuando aplique, dónde vive en el código. Ordenado alfabéticamente y enlazado desde las secciones que usan cada término.

_3 · Índice general de la documentación_ — `docs/README.md` que mapee todo `docs/` (auditoría, etapas, arquitectura, decisiones, seguridad, guías) con una línea de propósito por documento, para que nada quede enterrado.

_4 · Consolidación y verificación._ Revisa que las guías producidas en etapas anteriores sigan siendo correctas tras los cambios posteriores —una guía desactualizada es peor que ninguna—; que los 17 informes de etapa estén completos; que todo enlace interno resuelva; que no haya secretos, IPs reales ni credenciales en ningún documento; y que los diagramas Mermaid rendericen.

_5 · Documentación de API._ OpenAPI publicado y navegable, con descripción por endpoint, códigos de error tipados y ejemplos de request/response.

**DoD.** Un ingeniero que nunca vio el proyecto clona el repositorio, sigue el README y llega a un sistema funcionando con datos de prueba, sin ayuda externa. El índice no tiene enlaces rotos. Ningún término del glosario aparece definido en dos lugares con redacciones distintas.

---

## §7. ENTREGA FINAL ESPERADA

**Un solo repositorio** que contenga, funcionando y documentado:

- API NestJS como monolito modular hexagonal, con el dominio puro compartido con el Edge.
- Consola web Next.js + Tailwind, entregada como **PWA instalable** y como **aplicación de escritorio empaquetada**, con las tres superficies operativas (administración, portería, guardia virtual).
- App móvil Flutter del residente.
- Edge Gateway con operación offline y reconciliación.
- Esquema Supabase con migraciones, RLS y seeds.
- Capa de proveedores con `MockProvider` e `HikvisionProvider`.
- Suite de pruebas que corre **completa sin hardware**.
- CI/CD que verifica arquitectura, aislamiento, seguridad y cobertura.
- Documentación: auditoría documental, ADR, arquitectura, modelo de datos, conexión a Supabase, despliegue, despliegue del Edge, manual por rol, ciclo de vida biométrico, auditoría de ciberseguridad, integración Hikvision y los **17 informes de etapa**.
- **`README.md` raíz con índice navegable y glosario completo** (ETAPA 16), más `docs/README.md` como índice general de la documentación. Es la puerta de entrada al proyecto y lo primero que lee un evaluador.

Cada etapa en su propia rama, nombrada con la etapa. **Nunca con un nombre genérico autogenerado.**

---

## §8. PRIMERA INSTRUCCIÓN

No escribas código todavía.

Confirma que leíste este contrato. En un máximo de diez líneas, enumera: las reglas que consideras invariables, la decisión de ADR-01 y su consecuencia arquitectónica, y cuál crees que es el mayor riesgo técnico del proyecto.

Luego **espera** a que el usuario escriba `EJECUTA ETAPA 00`.
