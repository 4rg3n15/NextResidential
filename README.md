# Next Control Residencial

Plataforma SaaS multiempresa de control de acceso para copropiedades —villas, parcelaciones y unidades residenciales— construida sobre hardware Hikvision. Unifica padrón, autorización de visitantes, reconocimiento de placas (LPR), reconocimiento facial, zonas comunes, guardia virtual y trazabilidad completa de eventos.

> **Principio rector del producto**
> **Next Control decide. El hardware ejecuta.**
> La cámara opera en modo evento: reporta, no decide. Si el hardware resolviera la apertura por su cuenta, el motor de reglas quedaría decorativo y se perdería la trazabilidad que sostiene la auditoría.

**Estado:** en desarrollo activo · 6 de 17 etapas cerradas · ETAPA 06 en ejecución
**Rama de integración:** `develop`
**Documento de gobierno:** [`CLAUDE.md`](./CLAUDE.md) — contrato de trabajo v3.0

---

## Índice

1. [Qué resuelve](#1-qué-resuelve)
2. [Estado del proyecto](#2-estado-del-proyecto)
3. [Arquitectura](#3-arquitectura)
4. [Stack tecnológico](#4-stack-tecnológico)
5. [Estructura del repositorio](#5-estructura-del-repositorio)
6. [Puesta en marcha](#6-puesta-en-marcha)
7. [Verificación y pruebas](#7-verificación-y-pruebas)
8. [Modelo de datos](#8-modelo-de-datos)
9. [Seguridad](#9-seguridad)
10. [Decisiones de arquitectura (ADR)](#10-decisiones-de-arquitectura-adr)
11. [Hallazgos relevantes del desarrollo](#11-hallazgos-relevantes-del-desarrollo)
12. [Trazabilidad de requisitos](#12-trazabilidad-de-requisitos)
13. [Convenciones de contribución](#13-convenciones-de-contribución)
14. [Glosario](#14-glosario)
15. [Propiedad intelectual](#15-propiedad-intelectual)

---

## 1. Qué resuelve

El control de acceso en copropiedades opera hoy con procesos manuales y sistemas de fabricante que no dialogan entre sí. El portero anota en papel, las autorizaciones se dan por teléfono, no hay registro verificable de quién entró ni quién lo autorizó, y la administración depende de una consola de fabricante que no se puede extender.

Next Control Residencial construye la capa de decisión propia: las reglas, los datos, la automatización, la experiencia móvil del residente, la operación remota y la trazabilidad viven en la plataforma. El hardware queda reducido a lo que debe ser — un ejecutor.

**Tres perfiles de uso:**

| Perfil | Superficie | Qué hace |
|---|---|---|
| Administrador | Consola web | Padrón, zonas, dispositivos, reglas, listas negras, informes y auditoría |
| Portero / Operador de central | Consola operativa | Evento actual con evidencia, apertura manual con motivo, intercom, escalamiento |
| Propietario / Residente | App móvil (Flutter) y PWA | Autoriza visitantes, registra placas, captura rostros, reserva zonas, consulta historial |

---

## 2. Estado del proyecto

El desarrollo se ejecuta en **17 etapas secuenciales**. Cada una tiene alcance definido, criterios de aceptación y una definición de terminado verificable. Ninguna etapa avanza sin que la anterior esté verificada.

### Etapas cerradas

| # | Etapa | Qué dejó construido |
|---|---|---|
| **00** | Auditoría documental y plan maestro | Los cuatro insumos auditados y contrastados. 14 contradicciones resueltas, 12 requisitos no funcionales derivados, matriz de trazabilidad que asigna los 38 HU, 26 CA y 37 KPI a una etapa concreta |
| **01** | Modelo de datos y Supabase | 31 tablas, 95 políticas RLS, 18 migraciones versionadas y aplicadas contra el proyecto real. Guía de conexión completa |
| **02** | Andamiaje del monorepo y núcleo hexagonal | Monorepo pnpm + Turborepo, dominio puro como paquete con frontera que el linter hace cumplir, configuración validada al arranque, línea base de seguridad activa |
| **03** | Autenticación, RBAC, MFA y aislamiento multiempresa | Verificación asimétrica de JWT contra JWKS, seis roles como guards declarativos, MFA TOTP obligatorio para administrativos, suite de aislamiento por cuatro caminos que rompe el build ante cualquier fuga |
| **04** | Padrón | Agregado `Vivienda`, objeto de valor `Placa`, casos de uso de alta y baja, primer adaptador PostgreSQL real, carga transaccional desde CSV |
| **05** | Autorizaciones y motor de reglas | Motor de reglas como función pura con 100 % de cobertura de ramas, `MockProvider` completo de los cuatro puertos, contrato de firma del Alarm Server, análisis estático que aísla el protocolo del fabricante |

**Métricas al cierre de la ETAPA 05:** 206 pruebas en 25 ficheros · dominio 99,33 % líneas / **100 % ramas** · aplicación 98,38 % · global 81,78 %

### En ejecución

| # | Etapa | Alcance |
|---|---|---|
| **06** | Eventos, auditoría inmutable, alertas y tiempo real | Agregado `Acceso` inmutable, ingesta idempotente, evidencia en bucket privado con URL firmada, escalamiento automático a central en menos de 10 s, canal de tiempo real con latencia medida bajo carga, exportación de historial |

### Próximas etapas

| # | Etapa | Alcance |
|---|---|---|
| 07 | Zonas comunes | Agregado `Zona` con horario y aforo. El aforo se garantiza por restricción de base, no por código |
| 08 | Biometría con consentimiento | Ciclo completo bajo Ley 1581 de 2012: captura, validación de calidad, consentimiento del titular, sincronización y supresión verificada |
| 09 | Consola web de administración | Next.js + Tailwind. Dashboard, padrón, vehículos, visitantes, zonas, dispositivos, eventos e informes. Base de PWA |
| 10 | Consolas operativas | Portería y guardia virtual multiproyecto, con video en vivo, intercom y apertura remota atribuida |
| 11 | Aplicación móvil Flutter | Las ocho pantallas del residente, con cliente generado desde OpenAPI |
| 12 | Edge Gateway | Operación autónoma sin conexión y reconciliación idempotente al reconectar |
| 13 | Auditoría de ciberseguridad | Verificación y endurecimiento. No introduce la seguridad: la audita |
| 14 | Observabilidad, CI/CD, PWA y escritorio | Métricas de las latencias comprometidas, pipeline completo, empaquetado de escritorio |
| 15 | **Integración Hikvision** | ISAPI sobre Digest, Alarm Server, relés, terminales faciales, ONVIF, intercom TwoWayAudio |
| 16 | Documentación técnica final | Consolidación, README definitivo, OpenAPI navegable |

### Pruebas con hardware

| Momento | Requiere | Qué se prueba |
|---|---|---|
| Validación técnica temprana | Nada del sistema | Autenticación ISAPI, recepción de un evento de placa, accionamiento de relé |
| Prueba LPR de punta a punta | ETAPA 10 cerrada | Registrar placa → detectar → validar → abrir talanquera → registrar evento |
| Prueba facial y portería virtual | ETAPAS 11 y 15 | Foto desde la app → sincronizar terminal → reconocer → liberar acceso |

---

## 3. Arquitectura

**Monolito modular con arquitectura hexagonal.** Un despliegue de API, dividido internamente en módulos con frontera real: cada uno expone solo su barril público y se comunican por interfaces y eventos de dominio, nunca por acceso directo a las tablas del otro.

### Cinco capas

| Capa | Responsabilidad | Prohibiciones |
|---|---|---|
| **Presentación** | Traduce protocolo a casos de uso: controladores, DTOs, Alarm Server, workers | Cero reglas de negocio |
| **Aplicación** | Orquesta casos de uso, transacciones, idempotencia, aislamiento por copropiedad | No decide accesos: delega en el dominio |
| **Dominio** | Agregados, objetos de valor, políticas, motor de reglas, eventos. Idéntico en la nube y en el Edge | Cero I/O, cero framework, cero base de datos |
| **Infraestructura** | Implementa los puertos: repositorios, colas, storage, proveedores de hardware | No define contratos; los cumple |
| **Física** | Hardware Hikvision | Ejecuta, nunca decide |

La dirección de dependencia apunta siempre hacia adentro. **Ninguna flecha sale del dominio**, y eso no es una convención: el linter rompe la construcción si `domain/` importa infraestructura o si aparece un `any`.

### Nueve agregados raíz

`Copropiedad` (frontera del tenant) · `Vivienda` · `Persona` · `Autorización` · `Acceso` (inmutable) · `Consentimiento` · `Zona` · `Dispositivo` · `ListaNegra`

### Objetos de valor

`Placa` (normalizada al construirse, rechaza en lugar de limpiar) · `Vigencia` · `PatrónRecurrencia` · `Aforo` · `ResultadoAcceso` · `VersiónDeReglas`

### El motor de reglas

Función pura con reloj inyectado y cero I/O:

```
evaluarAcceso(contexto, reglas) → Decisión
```

Las políticas son componibles y devuelven `ResultadoAcceso | null`, donde `null` significa **«no me pronuncio»**. Distinguirlo de «permito» es lo que impide que una política indiferente abra la puerta.

**Cadena de precedencia vinculante:** `listaNegra > vigencia > patrón > zona`. Una persona en lista negra con autorización vigente recibe motivo `LISTA_NEGRA`, no `VIGENCIA_EXPIRADA`.

Cada decisión sella la `VersiónDeReglas` con la que se tomó. Es lo que hará auditables las decisiones que el Edge Gateway tome sin conexión.

---

## 4. Stack tecnológico

| Capa | Tecnología | Por qué |
|---|---|---|
| Base de datos, auth, storage, tiempo real | Supabase (PostgreSQL) | RLS nativa como segunda barrera de aislamiento |
| API y lógica de negocio | NestJS + TypeScript estricto | Inyección de dependencias que hace natural el patrón de puertos |
| Colas y trabajos programados | pg-boss | Sobre el mismo PostgreSQL: una pieza menos que operar |
| Consola web / escritorio | Next.js + Tailwind + shadcn/ui | PWA instalable y empaquetado de escritorio desde una sola base |
| Aplicación móvil | Flutter | iOS y Android desde un código |
| Push | Firebase Cloud Messaging | |
| Edge Gateway | Node.js + SQLite | Reutiliza el dominio sin modificarlo |
| Video al navegador | go2rtc | RTSP → WebRTC |
| Intercom | ISAPI TwoWayAudio | Ver ADR-001 |
| Contratos | OpenAPI generado desde NestJS | El cliente Dart se genera, nunca se escribe a mano |

---

## 5. Estructura del repositorio

```
NextResidential/
├─ apps/
│  ├─ api/            # NestJS — monolito modular hexagonal
│  ├─ web/            # Next.js — consolas (ETAPA 09-10)
│  ├─ mobile/         # Flutter — app del residente (ETAPA 11)
│  └─ edge/           # Edge Gateway (ETAPA 12)
├─ packages/
│  ├─ domain-core/    # dominio puro compartido API ↔ Edge
│  ├─ providers/      # puertos + MockProvider + HikvisionProvider (ETAPA 15)
│  ├─ contracts/      # OpenAPI, tipos y clientes generados
│  └─ config/         # tsconfig, eslint, prettier, preset Tailwind
├─ supabase/
│  ├─ migrations/     # SQL versionado, idempotente y reversible
│  ├─ policies/       # RLS
│  └─ seed/           # datos de prueba, sin datos reales
├─ scripts/
│  ├─ verificar-etapa.sh      # DoD obligatorio antes de cada informe
│  ├─ verificar-frontera.sh   # fronteras de arquitectura por mutación
│  └─ lib/portabilidad.mjs    # audita compatibilidad macOS/Linux
├─ docs/
│  ├─ ESTADO_ETAPAS.md
│  ├─ auditoria/      # los cuatro informes de la ETAPA 00
│  ├─ etapas/         # ETAPA-NN.md, informe por etapa
│  ├─ arquitectura/
│  ├─ decisiones/     # ADR
│  ├─ seguridad/
│  └─ guias/
└─ .github/workflows/ # CI (ETAPA 14)
```

---

## 6. Puesta en marcha

### Prerrequisitos

- Node **22.22.2** (declarado en `.nvmrc`; el arranque falla fuera del rango)
- pnpm vía corepack
- CLI de Supabase
- Un proyecto Supabase con credenciales propias

### Instalación

```bash
nvm use
corepack enable
pnpm install
```

### Variables de entorno

Cada aplicación trae su `.env.example` con nombres y descripciones, **nunca con valores**. Cópialo y complétalo:

```bash
cp apps/api/.env.example apps/api/.env
```

La configuración se valida con Zod al arranque: **si falta una variable, la aplicación no arranca** y termina con código `EX_CONFIG` (78) indicando cuál falta, sin filtrar valores.

> **Sobre las llaves de Supabase.** El proyecto usa el esquema nuevo (`sb_publishable_…` / `sb_secret_…`) y verificación asimétrica de JWT contra JWKS. No existe secreto JWT compartido.
> La llave **secreta omite Row Level Security por completo**: va únicamente en `apps/api` y `apps/edge`, jamás en un cliente, jamás con prefijo `NEXT_PUBLIC_`, jamás compilada en Flutter.

Ver [`docs/guias/CONEXION_SUPABASE.md`](./docs/guias/CONEXION_SUPABASE.md) para el procedimiento completo, incluida la rotación de llaves.

### Base de datos

```bash
supabase login
supabase link --project-ref <tu-ref>
supabase db push
```

### Arranque

```bash
pnpm --filter @ncr/api start:dev
```

Endpoints de salud: `/health` (proceso vivo) y `/ready` (dependencias alcanzables, incluida una sonda real contra JWKS).

---

## 7. Verificación y pruebas

### Suite completa

```bash
pnpm --filter @ncr/api test
pnpm --filter @ncr/domain-core test
pnpm --filter @ncr/providers test
```

### Verificación de etapa — obligatoria antes de cerrar

```bash
./scripts/verificar-etapa.sh
```

Once pasos, y ninguno es decorativo:

| Paso | Verifica |
|---|---|
| 0 | Borra artefactos: corre como un checkout nuevo |
| 1 | Node y pnpm dentro de lo declarado |
| 2 | Instalación coherente con el lockfile |
| 3 | Compilación desde cero |
| 4 | Lint y typecheck |
| 5 | Suite completa en verde |
| 6 | **Ningún fichero de prueba se quedó sin recoger** |
| 7 | Umbrales de cobertura **por capa** |
| 8 | Portabilidad de los guiones entre macOS/BSD y CI/GNU |
| 9 | Pruebas negativas de los propios controles |
| 10 | Fronteras de arquitectura, secretos y aislamiento del protocolo del fabricante |

Los pasos 6 y 9 existen por experiencia directa: un fichero que no carga desaparece del recuento sin ponerse en rojo, y un control que nadie ha visto fallar no está demostrado.

### Fronteras por mutación

```bash
./scripts/verificar-frontera.sh
```

Introduce violaciones a propósito y exige que el linter las rechace: importaciones de infraestructura desde el dominio, `new Date()` en lógica que debe usar reloj inyectado, `any`, y aparición del protocolo del fabricante fuera de `packages/providers`.

### Umbrales vigentes

| Capa | Umbral | Actual |
|---|---|---|
| Dominio | 90 % | 99,33 % líneas · 100 % ramas |
| Aplicación | 90 % | 98,38 % |
| Global | 70 % | 81,78 % |

La cobertura se comprueba **por capa** porque un agregado alto puede esconder una capa entera sin probar. Ocurrió: la capa de aplicación estaba al 79 % mientras el número global se veía bien.

---

## 8. Modelo de datos

31 tablas, 95 políticas RLS, 18 migraciones. Detalle completo y diagrama entidad-relación en [`docs/arquitectura/modelo-datos.md`](./docs/arquitectura/modelo-datos.md).

Cuatro principios de diseño:

**El esquema deriva de los agregados, no de las pantallas.** Las fronteras de consistencia transaccional determinan las tablas.

**Lo que se puede garantizar en la base, se garantiza en la base.** La invariante de placa única por vivienda activa es un índice único parcial, no un `SELECT` previo en el código. Un `SELECT`-luego-`INSERT` es correcto en pruebas secuenciales y falso bajo concurrencia.

**Algunas reglas se cumplen quitando dónde infringirlas.** El consentimiento biométrico no tiene columna que lo vincule a un residente: no se puede escribir «el residente consintió por el visitante» porque no existe el sitio.

**Sin borrado físico donde hay historial.** Estado y fecha de desactivación, reforzados por disparadores que impiden el `DELETE`.

---

## 9. Seguridad

La seguridad es condición de cada etapa desde la 01, no una etapa al final. La ETAPA 13 la audita; no la introduce.

| Medida | Cómo está implementada |
|---|---|
| **Secretos** | Solo en variables de entorno, validadas al arranque. Escáner en pre-commit. Ningún valor en el repositorio |
| **CORS** | Lista blanca explícita por variable. Nunca `*` ni `origin: true` |
| **Validación** | `ValidationPipe` estricto con rechazo de campos no declarados. El DTO valida forma; el agregado valida verdad |
| **Inyección SQL** | Solo consultas parametrizadas. Toda entrada se sanea y normaliza antes de persistirse |
| **Rate limiting** | Global más límites endurecidos en login, MFA, ingesta y apertura remota |
| **RLS** | Activa **y forzada** en todas las tablas, con `copropiedad_id` derivado de los claims |
| **CSP** | `script-src 'self'` con nonce por request. Sin `unsafe-inline` ni `unsafe-eval` |
| **MFA** | TOTP obligatorio en los tres roles administrativos, con códigos de recuperación en hash |

### El riesgo número uno: la llave secreta omite RLS

El Edge Gateway, los workers y la ingesta de eventos usan la llave secreta por diseño, y esa llave **salta Row Level Security por completo**. Por eso el aislamiento se implementa **dos veces**: en RLS y en la capa de aplicación.

La suite de la ETAPA 03 recorre todos los endpoints por los cuatro caminos —JWT propio, JWT de otra copropiedad, identidad de servicio y operador multiproyecto— y **rompe la construcción ante cualquier fuga**. La lista de endpoints se enumera del enrutador, no de una lista escrita a mano: un endpoint nuevo entra en el recorrido el día que se escribe.

### Inmutabilidad de la auditoría

La tabla de eventos no admite `UPDATE` ni `DELETE`. Tres barreras superpuestas: RLS en modo forzado sin política de actualización, revocación de privilegios a nivel de tabla, y un disparador que alcanza incluso al dueño. La inmutabilidad no puede depender de que el código se porte bien.

---

## 10. Decisiones de arquitectura (ADR)

| ID | Decisión | Estado |
|---|---|---|
| **ADR-001** | Intercom por **ISAPI TwoWayAudio**; se descarta SIP + Asterisk | Cerrada |
| **ADR-002** | Empaquetado de escritorio con **Tauri** | Cerrada |
| **ADR-003** | El hardware va al final. Todo el sistema funciona contra `MockProvider` | Cerrada |
| **ADR-004** | La integridad concurrente se resuelve en la base de datos | Cerrada |
| **ADR-005** | Inmutabilidad de eventos por permisos, no por código | Cerrada |

Detalle en [`docs/decisiones/`](./docs/decisiones/).

**Sobre ADR-001:** la sección de stack sugerido del documento de requisitos proponía SIP con puente WebRTC. Prevalece ISAPI TwoWayAudio por decisión del cliente. Ningún requisito, regla de negocio ni criterio de aceptación exige SIP; los indicadores comprometidos son de latencia y trazabilidad, agnósticos al protocolo. La ruta SIP sobrevive como contingencia documentada, realizable como adaptador nuevo detrás del mismo puerto sin tocar el dominio.

---

## 11. Hallazgos relevantes del desarrollo

Cinco defectos encontrados y corregidos que habrían llegado a producción. Se documentan porque explican por qué el método de verificación es el que es.

**Recursión infinita en las políticas de seguridad.** Una función declarada `SECURITY DEFINER` para «evitar» RLS no la evitaba: cambia con qué identidad corre la función, no si se le aplica. La política de residentes llamaba a la función, la función leía la tabla de residentes, y la lectura reevaluaba la política. Habría reventado en cuanto el primer residente abriera la app.
→ *Regla derivada: el predicado de una política nunca debe leer, ni directa ni transitivamente, la tabla que filtra.*

**Fuga en la lista negra por acompañantes.** Sin una tabla de identidad compartida, una misma persona era tres cadenas de texto sin relación: bloqueada como visitante principal, admitida como acompañante.

**La tabla de eventos era modificable.** El rol de la cadena de conexión por defecto conservaba privilegios de modificación y borrado sobre la evidencia de auditoría.

**La validación de entrada estaba inerte.** Importar los DTOs con `import type` borra la clase al compilar; sin clase no hay metadata, y el `ValidationPipe` desistía en silencio. Un cuerpo con campos no declarados y tipos inválidos llegaba al manejador sin error.

**Un fichero de prueba que no carga desaparece del recuento.** No cuenta como fallo: la suite reportaba verde con menos ficheros ejecutados de los que existen en disco.

Los tres últimos son la misma familia — *«la comprobación existe pero no comprueba nada»*. De ahí el paso 6 y las pruebas negativas del paso 9 del verificador.

---

## 12. Trazabilidad de requisitos

El proyecto se rige por una especificación formal con 8 objetivos específicos, 22 reglas de negocio, 38 historias de usuario, 5 casos de uso, 26 criterios de aceptación y 37 indicadores.

La matriz consolidada —[`docs/auditoria/matriz-trazabilidad-consolidada.md`](./docs/auditoria/matriz-trazabilidad-consolidada.md)— asigna cada elemento a una etapa concreta y a la pantalla que lo expone. Ninguno queda huérfano.

**Nota de honestidad sobre los indicadores:** nueve de los 37 dependen de hardware. Hasta la ETAPA 15 se reportan como *«verificado contra simulación, pendiente de hardware»*, nunca como cumplidos.

---

## 13. Convenciones de contribución

**Ramas.** Una por etapa, nombrada `etapa-NN-slug`. Sale siempre de `develop` actualizado, nunca de la rama anterior. Base de integración: `develop`. `main` recibe merges en hitos verificados.

**Commits.** Conventional Commits con prefijo de etapa:
`feat(etapa-04/padron): agrega invariante de placa única por vivienda activa`

**Antes de cerrar una etapa.** `./scripts/verificar-etapa.sh` debe pasar completo, y su veredicto literal se pega en el informe. Ninguna cifra de pruebas se reporta si no sale de esa ejecución.

**Estilo.** TypeScript estricto, sin `any`. Lenguaje ubicuo en español para el dominio, inglés para lo técnico. Inmutabilidad por defecto. Errores tipados: prohibido lanzar cadenas o devolver `null` como señal de negocio.

**Entornos.** Desarrollo en macOS, CI en Linux. Todo guion debe funcionar en ambos; `scripts/lib/portabilidad.mjs` lo audita.

---

## 14. Glosario

### Dominio

| Término | Significado en este proyecto |
|---|---|
| **Copropiedad** | Unidad residencial administrada. Es la frontera del tenant: todo dato operativo le pertenece |
| **Vivienda** | Casa o apartamento. Agrupa residentes y vehículos |
| **Residente** | Persona que habita una vivienda. Puede ser propietario o arrendatario |
| **Persona** | Identidad compartida entre roles. Permite que la lista negra aplique a alguien sea cual sea el rol con el que se presente |
| **Visitante** | Quien accede por autorización de un residente |
| **Autorización** | Permiso con vigencia, acompañantes y zonas permitidas. Única o recurrente |
| **Acceso** | Intento evaluado. Inmutable: sin modificación ni borrado |
| **Evento** | Registro de todo intento, permitido o negado, con su evidencia |
| **Zona** | Área común con horario, aforo y reglas propias |
| **Aforo** | Máximo y conteo actual. El conteo nunca supera el máximo, garantizado por restricción |
| **Lista negra** | Veto con precedencia absoluta sobre cualquier autorización vigente |
| **Consentimiento** | Autorización expresa del titular para tratamiento biométrico, bajo Ley 1581 de 2012 |
| **Plantilla biométrica** | Representación del rostro almacenada en la terminal. Nunca viaja al cliente |
| **Vigencia** | Rango temporal con zona horaria durante el cual una autorización es válida |
| **Motor de reglas** | Función pura que decide cada acceso |
| **Versión de reglas** | Sello de con qué reglas se tomó una decisión. Clave para auditar lo decidido sin conexión |

### Técnicos

| Término | Significado |
|---|---|
| **Agregado raíz** | Entidad que define una frontera de consistencia transaccional y protege una invariante |
| **Objeto de valor** | Tipo inmutable sin identidad propia, validado al construirse |
| **Puerto** | Interfaz que el dominio declara y la infraestructura implementa |
| **Adaptador** | Implementación concreta de un puerto |
| **Política** | Regla componible que se pronuncia sobre un acceso, o se abstiene |
| **Bandeja de salida** | Cola local del Edge con clave de idempotencia para reconciliar al reconectar |
| **RLS** | Row Level Security. Filtrado por fila en PostgreSQL según la identidad de la conexión |
| **JWKS** | Conjunto de claves públicas para verificar firmas de token sin secreto compartido |
| **ISAPI** | Interfaz HTTP de Hikvision para comandar dispositivos |
| **TwoWayAudio** | Canal de audio bidireccional de ISAPI, usado para el intercom |
| **ONVIF** | Estándar de descubrimiento e interoperabilidad de dispositivos de video |
| **LPR / ANPR** | Reconocimiento automático de placas |
| **Digest Auth** | Esquema de autenticación HTTP que usan los equipos Hikvision |
| **Edge Gateway** | Nodo local que mantiene la operación crítica ante caída de Internet |
| **MockProvider** | Adaptador simulado que permite operar y probar el sistema completo sin hardware |
| **RBAC** | Control de acceso basado en roles |
| **MFA / TOTP** | Segundo factor de autenticación por código temporal |
| **CSP** | Content Security Policy. Cabecera que restringe qué scripts puede ejecutar el navegador |

---

## 15. Propiedad intelectual

Todo el desarrollo realizado dentro de este proyecto pertenece patrimonialmente a **Grupo Control** en los términos definidos contractualmente: código fuente y objeto, arquitectura, bases de datos y esquemas, APIs e integraciones, documentación técnica y funcional, pruebas, modelos, reglas y configuraciones, prompts y automatizaciones, diseños y componentes, credenciales y ambientes, y toda mejora, versión o derivado.

Los repositorios, dominios, cuentas cloud, llaves, bases de datos y ambientes de despliegue deben permanecer bajo cuentas corporativas controladas por Grupo Control.

Documento confidencial. Prohibida su copia, publicación, licenciamiento o reutilización comercial sin autorización previa, expresa y escrita del titular.
