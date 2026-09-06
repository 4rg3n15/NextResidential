# 00 · Auditoría de la solicitud del proyecto

**Insumo auditado:** `docs/insumos/Next_Control_Residencial_Reto_de_Desarrollo.pdf` (9 páginas, documento confidencial de alcance).
**Autoridad:** máxima. Es el «qué» y el «por qué» del proyecto. Ante conflicto, prevalece sobre requisitos, arquitectura y mockups.
**Etapa:** 00 · **Fecha:** 2026-09-06

---

## 1. Misión

Construir un **producto SaaS profesional, multiempresa y escalable** para villas, parcelaciones y unidades residenciales, que unifique en una sola plataforma el control de acceso, el padrón de residentes, los visitantes, las placas, el reconocimiento facial, las zonas comunes y la guardia virtual, operando sobre hardware Hikvision.

La cadena de valor declarada es:

```
Next Control Cloud → Edge Gateway → Hikvision → Talanquera / Torniquete / Puerta
```

Las cuatro cifras que el documento pone en portada fijan el listón: **3 perfiles principales**, **1 plataforma integrada**, **24/7 lista para guardia virtual**, **100 % trazabilidad de eventos**.

El documento es explícito en lo que **no** busca: *«No buscamos una maqueta»*. Y en lo que sí: demostrar capacidad real de construir producto usando Claude Code como herramienta principal de desarrollo. Esto convierte la velocidad y el dominio de la herramienta en un criterio evaluable —20 % de la nota—, no en un detalle de método.

---

## 2. Los tres perfiles y lo que cada uno debe poder hacer

El documento insiste en que **la experiencia cambia según el rol**: *«No queremos un sistema técnico difícil de operar»*.

| Perfil | Naturaleza | Debe poder hacer |
|---|---|---|
| **A · Administrador** | Control integral de la copropiedad | Casas, propietarios, residentes y vehículos · Visitantes, contratistas y personal recurrente · Permisos y restricciones por zonas · Dispositivos, sincronización y eventos · Informes y auditoría |
| **P · Portero / Seguridad** | Consola operativa en tiempo real | Evento actual con foto, placa o rostro · Casa destino y autorización · Abrir / negar / registrar novedad · Alertas y listas negras · Historial inmediato |
| **R · Propietario / Residente** | Aplicación móvil o PWA **muy sencilla** | Registrar placas propias y visitantes · Autorizar por fecha, horario y acceso · Tomar foto del visitante para acceso facial · Autorizar piscina, gimnasio y otras zonas · Ver historial e informes de sus visitantes |

> **`[CONTRADICCIÓN]` C-26 — perfiles del reto (3) vs. roles del sistema (6).**
> El PDF del reto describe 3 perfiles; el documento de requisitos define 6 roles (Superadministrador, Administrador, Portero/Seguridad, Operador de central, Residente, Servicio/Integración).
> **Resolución:** no hay conflicto real, hay granularidad distinta. Los 3 perfiles del reto son las tres *superficies de producto* (administración, operación, residente); los 6 roles son el modelo de autorización. El Operador de central es la variante remota del Portero —el propio PDF lo introduce en su §4—, el Superadministrador es el rol de plataforma que hace posible el multiempresa que el PDF exige, y Servicio/Integración es una identidad no humana. **Se construyen los 6 roles**, agrupados en las 3 superficies. Registrado en `contradicciones-y-supuestos.md`.

**La app del residente no es un accesorio.** El documento la califica como *«una de las piezas centrales del producto»* y le dedica su §2 completa. Esto tiene consecuencia de prioridad: la ETAPA 11 no es una etapa de relleno al final, es donde se demuestra OE-02 de extremo a extremo y donde se juega el 10 % de UX.

---

## 3. El núcleo funcional

La §3 del PDF encabeza con la frase que gobierna toda la arquitectura: **«El software decide; el hardware ejecuta.»**

### 3.1 Los tres flujos de cara al usuario

| Flujo | Qué hace | Dónde vive en el plan |
|---|---|---|
| **VISITANTES · Autorización inteligente** | Nombre, documento, placa, fecha/hora inicial y final, acompañantes y observaciones. Autorizaciones únicas o recurrentes. | ETAPA 05 (dominio) · ETAPA 11 (app) |
| **PLACAS · Ingreso vehicular** | El residente registra una placa. La cámara LPR la detecta, Next Control valida reglas y, si corresponde, abre la talanquera. | ETAPA 05 (motor + Mock) · ETAPA 15 (hardware) |
| **ROSTRO · Acceso biométrico** | El residente toma una foto del visitante. El sistema valida calidad, registra consentimiento, sincroniza con terminales autorizadas y controla la vigencia. | ETAPA 08 · ETAPA 15 |

Nótese el orden de las cuatro operaciones del flujo facial: **valida calidad → registra consentimiento → sincroniza → controla vigencia**. El consentimiento está *antes* de la sincronización, no después. Es la misma secuencia que RN-09 impone y que CU-02 detalla, y es la razón por la que la ETAPA 08 no puede ser un CRUD de fotos.

### 3.2 Los seis componentes del núcleo

| Componente | Alcance según el PDF | Etapa |
|---|---|---|
| **LPR / ANPR** | Reconocimiento de placas, listas blancas/negras, horarios, vigencias, accesos permitidos y trazabilidad fotográfica | 05 · 15 |
| **Reconocimiento facial** | Alta de rostros, sincronización, control por zonas, vencimiento automático y registro de cada acceso | 08 · 15 |
| **Control físico** | Talanqueras, torniquetes, puertas y relés. Apertura automática o manual con auditoría | 05 (puerto) · 15 (relé) |
| **Zonas comunes** | Piscina, gimnasio, salón social, coworking y otras áreas, con horarios, aforo y reglas configurables | 07 |
| **Motor de reglas** | Reglas configurables por persona, vivienda, placa, horario, zona, tipo de visitante, vigencia y **estado administrativo** | 05 |
| **Eventos y auditoría** | Quién entró, por dónde, cuándo, quién autorizó, qué dispositivo intervino y cuál fue el resultado | 06 |

> **`[SUPUESTO]` S-01 — «estado administrativo» como entrada del motor de reglas.**
> El PDF incluye *estado administrativo* entre las dimensiones configurables del motor de reglas, pero el documento de requisitos **excluye explícitamente** facturación, cartera y recaudo del alcance. El mockup móvil refuerza la tensión: la tarjeta de vivienda muestra un distintivo **«Al día»**.
> **Supuesto adoptado:** `Vivienda` expone un campo `estadoAdministrativo` (enumerado, p. ej. `AlDia | EnMora | Suspendida`) que el motor de reglas **lee** como cualquier otra entrada, pero que Next Control **no calcula**: se alimenta manualmente por el administrador o por integración externa futura. Construir el módulo de cartera queda fuera de alcance; ignorar la dimensión rompería el motor de reglas que el PDF pide. Registrado en `contradicciones-y-supuestos.md`.

Las seis dimensiones del motor —persona, vivienda, placa, horario, zona, tipo de visitante, vigencia, estado administrativo— son la especificación del **contexto de evaluación** que la ETAPA 05 debe construir: `evaluarAcceso(contexto, reglas) => Decisión` recibe exactamente esas entradas.

---

## 4. Guardia virtual: la cadena y sus tres exigencias

La §4 del PDF es tajante en el encuadre: la guardia virtual se diseña **desde el inicio**, no se añade después. *«El sistema debe poder operar con portero presencial, central remota o modalidad híbrida.»*

**La cadena canónica:**

```
Visitante llega → Video / intercom → Central de monitoreo → Validación → Apertura remota
```

Esta cadena es CU-03 del documento de requisitos, y de ella se derivan tres exigencias que el PDF nombra por separado:

| Exigencia | Texto del PDF | Consecuencia técnica |
|---|---|---|
| **Consola remota** | Un operador podrá atender **diferentes proyectos**, ver el evento, consultar la vivienda, hablar con el visitante, contactar al residente, autorizar o negar y abrir remotamente | Conmutación multi-copropiedad sin fuga de datos (KPI-35) · sesión de audio y video (ADR-01) · apertura atribuida al operador (RN-08) |
| **Escalamiento** | Eventos críticos, listas negras, fallas de dispositivo y accesos dudosos podrán escalarse **automáticamente** a supervisión | Escalamiento por regla, no por decisión humana (RN-18, CA-18, < 10 s) |
| **Continuidad** | La operación crítica deberá seguir funcionando **localmente** ante caída de Internet mediante Edge Gateway y reglas/caché local *cuando sea técnicamente posible* | Edge Gateway con caché versionado y reconciliación (ETAPA 12) |

Obsérvese la salvedad *«cuando sea técnicamente posible»*: el PDF admite que no todo acceso puede resolverse offline. Esto es exactamente lo que CU-04 resuelve con su flujo alterno 3a —regla no presente en caché → política de contingencia configurable—, y lo que la ETAPA 12 debe implementar con **denegar por defecto** como valor conservador.

---

## 5. Integración Hikvision: tabla componente por componente

Encabezado de la §5: *«La lógica de negocio de Next Control no debe quedar amarrada a una sola marca.»*

| Componente | Objetivo | Requisito del PDF | Puerto del dominio | Etapa |
|---|---|---|---|---|
| **Cámaras LPR** | Placas y evidencia | Eventos + listas + decisión | `PlateEventSource` | 05 · 15 |
| **Terminales faciales** | Acceso de personas | Alta / baja / sincronización | `FaceTemplateProvider` | 08 · 15 |
| **Talanqueras** | Acceso vehicular | Apertura automática/manual | `AccessPointProvider` | 05 · 15 |
| **Torniquetes / puertas** | Zonas comunes | Reglas por usuario y zona | `AccessPointProvider` | 07 · 15 |
| **Intercom / videoportero** | Guardia virtual | Atención remota | `IntercomProvider` (ADR-01) | 10 · 15 |
| **HikCentral** | Referencia / convivencia inicial | **Reducir dependencia progresivamente** | — (sin puerto) | — |

**El mandato arquitectónico, textual:**

> *«Arquitectura obligatoria: crear una capa de integración independiente —por ejemplo `HikvisionProvider`— usando ISAPI/API/eventos oficiales donde corresponda. La UI nunca debe hablar directamente con el hardware. Next Control debe poder incorporar otros fabricantes en el futuro.»*

Tres lecturas relevantes de ese párrafo:

1. **«por ejemplo `HikvisionProvider`»** — el nombre es ilustrativo; lo vinculante es la existencia de la capa, no su denominación. Se conserva el nombre por continuidad con el documento de requisitos y el diagrama.
2. **«La UI nunca debe hablar directamente con el hardware»** — es RN-12, y se verifica mecánicamente con KPI-11: cero referencias a ISAPI o a IP de dispositivo fuera de `packages/providers`. La ETAPA 05 instala ese análisis estático en CI.
3. **«debe poder incorporar otros fabricantes»** — *poder*, no *hacerlo*. El alcance excluido del documento de requisitos lo confirma: la arquitectura los admite, no se implementan. Lo que se demuestra es la **sustituibilidad** (KPI-12, principio LSP), no la variedad.

**HikCentral es el único componente sin puerto**, y con razón: no es hardware que Next Control comande, es el sistema incumbente que se va desplazando. No hay integración que construir; hay dependencia que reducir. No genera trabajo en ninguna etapa.

---

## 6. Pantallas mínimas

*«Se privilegia un producto compacto, usable y listo para crecer.»* Veinte pantallas en dos bloques:

| Administración / Seguridad (10) | Etapa | Aplicación del propietario (10) | Etapa |
|---|---|---|---|
| Login + roles y permisos | 09 | Inicio / mi vivienda | 11 |
| Dashboard operativo | 09 | Mi familia | 11 |
| Viviendas / residentes | 09 | Mis vehículos | 11 |
| Vehículos / placas | 09 | Registrar placa | 11 |
| Visitantes / autorizaciones | 09 | Crear visitante | 11 |
| Zonas comunes | 09 | Vigencia desde / hasta | 11 |
| Dispositivos / sincronización | 09 | Tomar foto / registrar rostro | 11 |
| Eventos / alertas | 09 | Autorizar zonas comunes | 11 |
| Informes / auditoría | 09 | Historial e informe de visitas | 11 |
| Consola de portería / guardia virtual | 10 | Notificaciones y perfil | 11 |

Las 10 de administración son el alcance de la ETAPA 09, salvo la última —consola de portería y guardia virtual—, que por su peso operativo y por depender del `IntercomProvider` tiene etapa propia (10). Las 10 del propietario son el alcance de la ETAPA 11; el mockup entregado las agrupa en 8 pantallas (ver `03-mockups.md`), porque *«registrar placa»* vive dentro de *«mis vehículos»* y *«vigencia desde/hasta»* y *«tomar foto»* viven dentro de *«nuevo visitante»*.

> **Hallazgo.** *«Tomar foto / registrar rostro»* es pantalla mínima obligatoria del PDF, pero **no aparece** en el mockup de «Nuevo Visitante» ni en ninguna de las 8 pantallas móviles entregadas. Tampoco existe la pantalla de consentimiento del visitante que el propio documento de requisitos lista en su §12. Ambas se diseñan en la ETAPA 08 y se implementan en la 11. Detalle en `03-mockups.md`, hallazgos M-02 y M-03.

---

## 7. Los tres hitos técnicos

*«No buscamos una maqueta. Buscamos demostrar capacidad real para construir producto con Claude Code.»*

| # | Hito | Cadena exacta exigida | Etapa que lo cierra |
|---|---|---|---|
| **1** | **Prototipo funcional** | Login, viviendas, residentes, vehículos, visitantes y dispositivos, con base de datos y arquitectura limpia | 09 (con 01–05 detrás) |
| **2** | **Prueba LPR real** | Registrar placa desde la app → detectar en cámara Hikvision → validar → abrir relé/talanquera → registrar evento | 15 |
| **3** | **Prueba facial real** | Tomar foto desde la app → sincronizar terminal → reconocer → validar zona → liberar acceso → registrar evento | 15 |

Los hitos 2 y 3 son cadenas **de extremo a extremo que arrancan en la app móvil**. Esto significa que la ETAPA 15 no puede ejecutarse sin la ETAPA 11 terminada, aunque el mapa de etapas la haga depender solo de la 14. No es una contradicción del plan —la 14 depende de la 13, que depende de la 12, que depende de la 06, y la 11 depende de la 09—, pero conviene dejarlo escrito: **la 11 es precondición funcional de los hitos 2 y 3**, no solo de OE-02.

---

## 8. Matriz de evaluación y su efecto sobre la priorización

| Criterio | Peso | Qué lo demuestra en este plan |
|---|---|---|
| **Arquitectura y calidad del código** | **25 %** | Frontera hexagonal verificada por linter (02) · dominio puro compartido API↔Edge (12) · SOLID por etapa (§2.3) · cobertura 90 % en dominio y aplicación |
| **Integración real con hardware Hikvision** | **25 %** | ETAPA 15 completa · guía `INTEGRACION_HIKVISION.md` · los tres hitos ejecutados frente al equipo |
| **Velocidad y dominio de Claude Code** | **20 %** | Cadencia de etapas cerradas · informes por etapa · trazabilidad de cada decisión |
| **UX / aplicación móvil / interfaz** | **10 %** | ETAPA 11 (Flutter) · ETAPA 09 con estados vacío/cargando/error/sin permiso/offline · accesibilidad AA |
| **Seguridad, auditoría y protección de datos** | **10 %** | §2.7 desde la etapa 01 · suite de aislamiento que rompe el build (03) · auditoría formal (13) · ciclo de vida biométrico (08) |
| **Documentación, pruebas y explicación técnica** | **10 %** | 17 informes de etapa · ADR · README con glosario (16) · guías operativas |

**Regla de priorización derivada.** Arquitectura e integración suman el **50 %**. Ante disyuntiva entre pulir una pantalla y sostener una frontera arquitectónica o una prueba de hardware, **gana la frontera o el hardware**. Ante disyuntiva entre una funcionalidad extra y una prueba que demuestre un KPI, gana la prueba: el documento exige *demostrar*, y demostrar es medir.

---

## 9. Propiedad intelectual y confidencialidad

Condición **esencial de participación**, no cláusula accesoria. Todo desarrollo pertenece patrimonialmente a **Grupo Control**. La cesión cubre once categorías: código fuente y objeto; arquitectura, bases de datos y esquemas; APIs, integraciones y conectores; documentación técnica y funcional; pruebas, modelos, reglas y configuraciones; **prompts, agentes, scripts y automatizaciones**; diseños, UX/UI y componentes; credenciales, repositorios y ambientes; mejoras, versiones, derivados y evoluciones; know-how documentado.

Prohibido: copiar, extraer, publicar, licenciar, vender, entregar a terceros, reutilizar comercialmente o crear productos derivados con material del proyecto, salvo autorización previa, expresa y escrita.

**Consecuencias operativas vinculantes para todas las etapas:**

1. **Repositorios, dominios, cuentas cloud, llaves, bases de datos, documentación y ambientes bajo cuentas corporativas de Grupo Control.** Nunca cuentas personales del desarrollador. Se verifica en la ETAPA 01 (guía de conexión Supabase) y en la 14 (CI/CD y despliegue).
2. **Los prompts y este mismo `CLAUDE.md` son entregables cedidos.** Viven en el repositorio, versionados.
3. El documento advierte que la redacción contractual definitiva debe revisarla un abogado colombiano antes de firma. **`PENDIENTE DE DEFINICIÓN` P-01:** el desarrollo no se detiene por esto, pero la firma de los documentos de cesión, confidencialidad y seguridad de la información es previa al inicio según el PDF. Es una acción del usuario, no del agente; se registra en el informe de etapa como tarea manual pendiente.

---

## 10. Privacidad, seguridad y disponibilidad

La §9 del PDF encuadra el riesgo: *«Se tratarán rostros, fotografías, identificaciones, vehículos e historiales de acceso.»*

| Eje | Exigencias textuales | Dónde se cumple |
|---|---|---|
| **Privacidad** | Consentimiento **verificable** para biometría, minimización de datos, políticas de retención y mecanismos de eliminación según normativa aplicable | ETAPA 08 · `docs/seguridad/ciclo-vida-biometrico.md` · Ley 1581 de 2012 |
| **Seguridad** | HTTPS, MFA administrativo, RBAC, **secretos fuera del frontend**, logs, rate limiting, backups y almacenamiento privado | §2.7 desde la ETAPA 01 · ETAPA 03 (MFA/RBAC) · ETAPA 13 (auditoría) |
| **Disponibilidad** | Arquitectura Edge para operación local, colas de sincronización, reintentos, **confirmación de ejecución** y recuperación tras caída de Internet | ETAPA 12 · pg-boss desde la ETAPA 02 |

Dos matices que conviene no perder:

- **«Consentimiento verificable»** es más que «consentimiento registrado»: exige poder demostrar, después, quién consintió, cuándo, para qué finalidad y bajo qué versión de política. Por eso el agregado `ConsentimientoBiometrico` del diagrama lleva `versionPolitica`, `medio` y `evidencia`, y no solo un booleano.
- **«Confirmación de ejecución»** no aparece en ningún KPI, pero es una exigencia del PDF: el sistema debe saber si la orden de apertura *se ejecutó*, no solo si *se envió*. Se traduce en que `AccessPointProvider` devuelve un resultado, y en que el evento registra el desenlace técnico —incluida la excepción 5a de CU-01, «el proveedor no logra comunicarse con el relé»—. Se implementa en la ETAPA 05 (contrato) y se verifica en la 15 (relé real).

---

## 11. «Next Control decide. El hardware ejecuta.» — qué implica capa por capa

El PDF cierra con este principio y con una advertencia sobre dónde está —y dónde no está— el valor:

> *«El valor no está en una interfaz bonita ni en reemplazar una pantalla de HikCentral. Está en construir una plataforma residencial propia con reglas, datos, automatización, experiencia móvil, operación remota y trazabilidad suficiente para convertirse en un producto comercial escalable.»*

El principio no es un eslogan: es una restricción de diseño con consecuencias distintas en cada una de las cinco capas.

### Capa de Presentación (driving)
**Implica:** las consolas y la app **nunca** hablan con el hardware, ni siquiera «solo para leer». El Alarm Server HTTP que recibe el POST multipart de la cámara vive aquí porque es un adaptador de entrada, y su única responsabilidad es traducir ese POST a un caso de uso —jamás decidir si abre.
**Prohibición operativa:** cero `if` de negocio en un controlador. Si una consola pudiera abrir una talanquera por sí misma, el principio quedaría roto en la capa más visible.
**Verificación:** RN-12, KPI-11.

### Capa de Aplicación
**Implica:** orquesta, pero **no decide accesos**. El caso de uso `ResolverAcceso` carga el contexto, invoca al dominio, y actúa sobre la `Decisión` que recibe. Si la lógica de «¿está vigente?» apareciera aquí, el Edge Gateway tendría que reimplementarla y las dos decisiones divergirían con el tiempo.
**Consecuencia directa:** la unidad de trabajo, la idempotencia y el aislamiento por copropiedad son de esta capa; la verdad del negocio no.

### Capa de Dominio
**Implica:** es el **único** lugar donde se decide. `evaluarAcceso(contexto, reglas) => Decisión` es una función pura, con reloj inyectado y sin I/O, **idéntica en la nube y en el Edge**. Que sea idéntica no es elegancia: es lo que hace que RN-16 pueda cumplirse —el Edge decide con la misma lógica y solo cambia la versión de reglas en caché— y lo que hace auditable la decisión offline.
**Consecuencia directa:** el dominio no sabe qué es una cámara, ni ISAPI, ni Supabase. Sabe qué es una `Placa`, una `Vigencia` y un `ResultadoAcceso`.

### Capa de Infraestructura (driven)
**Implica:** `HikvisionProvider` es el **único punto del sistema que toca hardware**. Traduce intención de dominio a protocolo del fabricante y traduce errores del fabricante a motivos tipados del dominio. Si el modelo concreto no soportara TwoWayAudio, la salida es un adaptador nuevo detrás del mismo puerto —no un cambio de dominio—.
**Consecuencia directa:** `MockProvider` e `HikvisionProvider` son intercambiables y la suite pasa con ambos (KPI-12, LSP).

### Capa Física
**Implica:** la cámara opera en **modo evento**: reporta placa y foto, **no acciona**. El documento de requisitos lo eleva a riesgo explícito en su §13.4: *«Si la cámara resuelve la apertura por sí misma, se pierde trazabilidad y el motor de reglas queda decorativo.»*
**Consecuencia directa y de bloqueo:** verificar el modo evento en el modelo concreto es la **primera** tarea de la ETAPA 15. Si el equipo decide por su cuenta y no puede configurarse de otro modo, es un hallazgo de bloqueo que se reporta antes de continuar, porque invalida OE-03 y OE-05 simultáneamente: sin decisión centralizada no hay regla aplicada que registrar en el evento.

---

## 12. Trazabilidad de esta auditoría

| Elemento del PDF | Se recoge en |
|---|---|
| Misión y principio rector | §1, §11 · `README.md` (ETAPA 16) |
| 3 perfiles | §2 · `02-arquitectura.md` (roles) · C-26 |
| Núcleo funcional (6 componentes) | §3 · ETAPAS 05, 07, 08, 06, 15 |
| Cadena de guardia virtual | §4 · CU-03 · ETAPA 10 |
| Tabla de integración Hikvision | §5 · puertos de proveedor · ETAPA 15 |
| 20 pantallas mínimas | §6 · `03-mockups.md` · ETAPAS 09, 10, 11 |
| 3 hitos técnicos | §7 · DoD de la ETAPA 15 |
| Matriz de evaluación con pesos | §8 · regla de priorización |
| PI y confidencialidad | §9 · P-01 · ETAPA 01 y 14 |
| Privacidad, seguridad, disponibilidad | §10 · `04-requisitos-no-funcionales.md` · ETAPAS 08, 12, 13 |

**Contradicciones y supuestos generados por esta auditoría:** C-26, S-01, P-01. Consolidados en `contradicciones-y-supuestos.md`.
