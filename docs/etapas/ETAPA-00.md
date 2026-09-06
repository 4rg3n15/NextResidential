# Informe de cierre · ETAPA 00 — Auditoría documental y plan maestro

- **Rama:** `etapa00` · **Base:** `develop`
- **Fecha de cierre:** 2026-09-06
- **Contrato:** `CLAUDE.md` v3.0
- **Código de producto escrito:** **ninguno**, por diseño (`CLAUDE.md` §6, ETAPA 00)

---

## 1. Qué se construyó

Se construyó el **plan que gobierna las dieciséis etapas restantes**, y se construyó verificando —no suponiendo— lo que dicen los insumos.

El trabajo tuvo dos mitades. La primera fue de lectura forense: los cuatro insumos se leyeron completos, y el documento de requisitos se leyó dos veces, una desde el `.docx` original y otra desde su derivado en Markdown, comparando ambos palabra a palabra para saber si el derivado era confiable. Lo es: tras normalizar la sintaxis de Markdown, la similitud es exacta, cero diferencias de contenido. Eso permite usarlo para trazabilidad automatizada sin miedo a estar trabajando sobre una copia degradada.

La segunda mitad fue de reconciliación. Los cuatro insumos no dicen exactamente lo mismo, y en algunos puntos se contradicen de frente. El documento de requisitos propone SIP para el intercom mientras el contrato decide ISAPI. El contrato cita seis agregados raíz mientras el diagrama que le sirve de fuente declara nueve. Los mockups dibujan un flujo de aprobación administrativa que haría inalcanzable el objetivo específico número dos. Cada uno de esos choques se resolvió aplicando la jerarquía de autoridad, se documentó con su justificación, y ninguno se resolvió en silencio.

De ahí salieron catorce contradicciones resueltas, siete supuestos con valor conservador y once decisiones que solo el cliente puede tomar —todas con comportamiento por defecto vigente, ninguna bloqueando el arranque de la ETAPA 01—.

Se verificó además la línea base del contrato contra la fuente original: los ocho objetivos, las veintidós reglas, las treinta y ocho historias, los cinco casos de uso, los veintiséis criterios y los veintidós términos de glosario coinciden punto por punto. Y se confirmaron las dos anomalías que el contrato anticipaba: **`KPI-19` no existe** y la entrada 21 está escrita como **`KP1-21`**, con un uno numérico. El total real de indicadores es 37, no 38.

Se cubrió el vacío más serio de la especificación: el documento de requisitos **no tiene sección de requisitos no funcionales**. Los compromisos de latencia, disponibilidad, seguridad y privacidad existían dispersos entre indicadores y reglas, sin requisito que los respaldara. Ahora existen doce, cada uno con métrica, umbral, fuente de medición, indicador de respaldo y etapa de verificación. Treinta y seis de los treinta y siete indicadores tienen ahora requisito no funcional que los sostiene; los dos restantes son funcionales puros y se cubren con reglas de negocio.

Y se cerró la Definición de Terminado: las treinta y ocho historias, los veintiséis criterios y los treinta y siete indicadores están asignados a una etapa concreta. Ninguno huérfano.

---

## 2. Cómo se organizó y por qué

*Esta es la sección que hay que leer si solo se va a leer una.*

**El orden de lectura no fue negociable, y eso importa.** Los insumos se leyeron en el orden que fija `CLAUDE.md` §3 —reto, requisitos, arquitectura, mockups— porque cada uno se interpreta a la luz del anterior. Leer los mockups antes que los requisitos habría llevado a construir el flujo de aprobación administrativa que los mockups dibujan, sin advertir que contradice el objetivo específico número dos. El orden es lo que convierte una discrepancia en una contradicción detectable.

**Se separó lo que dice cada insumo de lo que hay que hacer al respecto.** Los cuatro documentos de auditoría (`00-solicitud`, `01-legibilidad-requisitos`, `02-arquitectura`, `03-mockups`) responden a la pregunta «¿qué dice esto y qué implica?». Los tres transversales (`04-requisitos-no-funcionales`, `matriz-trazabilidad-consolidada`, `contradicciones-y-supuestos`) responden a «¿y entonces qué construimos, cuándo, y qué queda sin decidir?». Mezclarlos habría producido cuatro documentos que nadie puede consultar cuando busca una respuesta concreta.

**Las contradicciones se centralizaron en un solo archivo.** Cada auditoría diagnostica los choques que encuentra en su insumo, pero la resolución vive en `contradicciones-y-supuestos.md`. Si la resolución estuviera repartida, dentro de tres etapas nadie sabría dónde buscar por qué el intercom es ISAPI y no SIP. Los identificadores emitidos —`C-`, `S-`, `P-`— no se reutilizan nunca, aunque queden huecos en la serie, para que las referencias cruzadas sigan siendo válidas cuando algo se reclasifique.

**La matriz de trazabilidad se organizó por elemento, no por etapa.** Hay una tabla para las reglas, otra para las historias, otra para los criterios, otra para los indicadores, y cada una termina con un **reparto por etapa cuya suma se verifica**. Una matriz organizada por etapas habría sido más cómoda de leer y completamente inútil para lo que la Definición de Terminado exige: demostrar que nada quedó huérfano. La suma es la prueba.

**Los indicadores se etiquetaron por dependencia de hardware.** Nueve de los treinta y siete solo pueden cerrarse con el equipo físico delante. Están marcados y asignados a la ETAPA 15. La consecuencia práctica es una regla de honestidad para los informes intermedios: hasta esa etapa se reportan como *«verificado contra simulación, pendiente de hardware»*, nunca como cumplidos. Sin esa distinción, el proyecto podría llegar a la etapa 14 creyendo que tiene treinta y siete indicadores verdes cuando tiene veintiocho.

**Los requisitos no funcionales se derivaron, no se inventaron.** Cada uno de los doce apunta al indicador o a la regla que lo respalda. Hay una sola excepción, y está señalada: **RNF-03.11, la validación de firma del Alarm Server**. Procede exclusivamente del paso 2 del flujo de CU-01 del diagrama, donde dice «valida firma», y ningún indicador ni regla lo respaldaba. Se elevó a requisito formal porque sin él el endpoint de ingesta aceptaría eventos de acceso de cualquiera que alcance la URL —lo que permitiría fabricar aperturas y falsear la auditoría completa—. Es el hallazgo de seguridad más importante de esta etapa, y salió de una caja de un diagrama.

**El sistema de diseño se extrajo por medición, no a ojo.** La paleta se obtuvo analizando la frecuencia de los píxeles saturados de la imagen. Eso permitió detectar algo que una lectura visual habría pasado por alto: el rojo de marca `#E63946` da un contraste de 3,9:1 sobre blanco, **insuficiente para texto normal en nivel AA**. La regla derivada —ese rojo no se usa como texto pequeño sobre blanco— es la clase de restricción que, descubierta en la etapa 09, habría obligado a rehacer componentes.

**Los cinco ADR se formalizaron añadiendo lo que el contrato no traía: cómo se verifica cada decisión.** `CLAUDE.md` §4 los declaraba cerrados y explicaba sus consecuencias. Faltaba la parte mecánica. Ahora ADR-001 tiene su `grep` de encapsulamiento, ADR-003 su análisis estático que rompe el build, ADR-004 su prueba de cien inserciones concurrentes y ADR-005 su prueba con los seis roles más `service_role`. Una decisión de arquitectura sin prueba que la sostenga es una intención.

**Y una decisión de método:** el `.docx` original **no se tocó**, ni siquiera para corregir `KP1-21`. Todas las correcciones viven en los derivados. Si Grupo Control audita el documento fuente, debe encontrarlo como lo escribió su autor, y encontrar aparte el registro de qué se corrigió y por qué.

---

## 3. Árbol de archivos

```
docs/
├─ ESTADO_ETAPAS.md                              Estado vinculante de las 17 etapas; habilita o bloquea la siguiente
├─ auditoria/
│  ├─ 00-solicitud.md                            Auditoría del PDF del reto: misión, perfiles, núcleo funcional,
│  │                                             guardia virtual, tabla Hikvision, hitos, matriz de evaluación,
│  │                                             PI y el principio rector capa por capa
│  ├─ 01-legibilidad-requisitos.md               Codificación, integridad de tablas, verificación de numeración,
│  │                                             fidelidad del derivado, 8 requisitos ambiguos, 5 contradicciones
│  ├─ 02-arquitectura.md                         Validación de las 5 capas, 9 agregados, 6 VO, 14 puertos,
│  │                                             políticas y eventos; mapa de contextos; flujo de CU-01;
│  │                                             verificación de que las 22 RN tienen dónde vivir
│  ├─ 03-mockups.md                              Inventario de las 18 pantallas con rol, HU, campos, acciones
│  │                                             y estados ausentes; sistema de diseño medido
│  ├─ 04-requisitos-no-funcionales.md            Los 12 RNF que el documento original no tenía, derivados de
│  │                                             los KPI, las RN y la §9 del PDF del reto
│  ├─ matriz-trazabilidad-consolidada.md         OE → RN → HU → CU → CA → KPI → CP → etapa → pantalla,
│  │                                             con reparto y suma verificada por etapa
│  └─ contradicciones-y-supuestos.md             Registro único de 14 contradicciones, 7 supuestos y
│                                                11 decisiones pendientes
├─ decisiones/
│  ├─ README.md                                  Índice de ADR y regla de no reapertura
│  ├─ ADR-001-intercom-isapi-twowayaudio.md      Intercom por ISAPI TwoWayAudio; resolución de C-01
│  ├─ ADR-002-empaquetado-escritorio-tauri.md    Tauri sobre Electron
│  ├─ ADR-003-hardware-al-final.md               El hardware al final como prueba del desacople
│  ├─ ADR-004-integridad-concurrente-...md       Índices únicos parciales, no SELECT previo
│  └─ ADR-005-inmutabilidad-por-permisos-...md   REVOKE UPDATE, DELETE sobre eventos
└─ etapas/
   └─ ETAPA-00.md                                Este informe

docs/arquitectura/  ·  docs/seguridad/  ·  docs/guias/       Creados vacíos; se pueblan desde la ETAPA 01
```

**Archivos modificados:** ninguno. **Insumos alterados:** ninguno.

---

## 4. Cumplimiento SOLID

**No se escribió código de producto en esta etapa**, por lo que no hay archivos que evaluar. La tabla que exige `CLAUDE.md` §2.8.4 se rellena con las **decisiones de esta etapa que determinan cómo se materializará cada principio**, y con dónde se verificará.

| Principio | Decisión de la ETAPA 00 que lo determina | Dónde se verifica |
|---|---|---|
| **SRP** | Siete documentos con una responsabilidad cada uno: cuatro auditan un insumo, tres consolidan una dimensión transversal. Ningún documento diagnostica y resuelve a la vez —la resolución vive centralizada—. En el plan: se adoptaron **nueve agregados** en lugar de seis porque `ListaNegra` y `Dispositivo` tienen razones de cambio propias, y `ConsentimientoBiometrico` y `PlantillaBiometrica` se mantienen separados porque sus ciclos de vida son distintos | ETAPAS 01–08 · límite de 300 líneas y 5 métodos públicos |
| **OCP** | Se fijó que las políticas del motor se construyen como `Specification` componibles con combinadores `and`/`or`/`not`, y se declaró vinculante la cadena de precedencia `listaNegra > vigencia > patrón > zona` hallada en la página 3 del diagrama. Agregar una regla no debe producir diff en `MotorDeReglas` | ETAPA 05 |
| **LSP** | Se resolvió C-07 estableciendo que `MockProvider` **es** el proveedor alternativo que demuestra la sustituibilidad, y que la suite debe pasar con ambas implementaciones **sin cambiar una aserción** | ETAPAS 05 y 15 · KPI-12 |
| **ISP** | Se verificó que los cuatro puertos de proveedor del diagrama están segregados por capacidad y no fundidos en un `HardwareService`. Se detectaron cuatro repositorios faltantes y se añadieron como puertos pequeños y específicos, no como un repositorio genérico | ETAPAS 01, 05, 08 · ningún adaptador lanza `NotImplemented` |
| **DIP** | Se validó que ninguna flecha sale del dominio y que la única entrada es «implementa los puertos — inversión de dependencias». Se confirmó que ADR-001 mantiene el protocolo fuera del dominio, verificado en tres puntos independientes del diagrama | ETAPA 02 · el build falla si `domain/` importa infraestructura · KPI-11 |

---

## 5. Trazabilidad

### Cubierto por completo

| Elemento | Cobertura |
|---|---|
| **8 OE** | Los ocho con reglas, historias, casos, criterios, indicadores, casos de prueba, etapas y pantallas asignados |
| **22 RN** | Las veintidós con mecanismo de implementación y etapa. Cero huérfanas |
| **38 HU** | Las treinta y ocho con etapa, pantalla y criterio que las verifica |
| **5 CU** | Los cinco con etapa, incluidos **todos** sus flujos alternos y excepciones |
| **26 CA** | Los veintiséis con etapa que los cierra y método de verificación |
| **37 KPI** | Los treinta y siete con etapa, fuente de medición y requisito no funcional de respaldo |
| **11 CP** | Los once con etapa y elementos que cubren |
| **6 PB** | Los seis con la solución que los elimina y su etapa |
| **6 roles** | Los seis reconciliados con los 3 perfiles del PDF del reto (C-26) |
| **22 términos de glosario** | Verificados; se ampliarán con vocabulario técnico en la ETAPA 16 |
| **5 ADR** | Los cinco formalizados con contexto, alternativas, consecuencias, verificación y contingencia |

### Cubierto parcialmente, con motivo

| Elemento | Estado | Motivo |
|---|---|---|
| **KPI-19** | **No aplicable** | No existe en el documento original. Identificador reservado; ningún artefacto debe usarlo |
| **9 KPI dependientes de hardware** (13, 14, 17, 18, 22, 26, 27, 32, 33) | Asignados, **no verificables** hasta la ETAPA 15 | ADR-003. Hasta entonces se reportan como «pendiente de hardware» |
| **KPI-07 y KPI-15** | Sin requisito no funcional | Son funcionales puros: los cubren RN-01, RN-22 y RN-14 con pruebas de comportamiento |
| **2 pantallas** (captura de rostro, consentimiento del visitante) | Especificadas, **no dibujadas** | No existen en el mockup (M-02, M-03). Se diseñan en la ETAPA 08 |
| **11 decisiones de negocio** | Con comportamiento conservador vigente | Requieren decisión de Grupo Control. Ninguna bloquea la ETAPA 01 |

---

## 6. Pruebas

Esta etapa no produce código, pero sí produce **afirmaciones verificables**. Todas se comprobaron mecánicamente.

| Verificación | Método | Resultado |
|---|---|---|
| Fidelidad de `Requisitos.md` frente al `.docx` | Extracción de `word/document.xml` preservando fronteras de celda; normalización de sintaxis Markdown y Unicode NFC; comparación palabra a palabra con `difflib` | **Similitud 1,0000 · 0 diferencias de contenido.** Las 79 divergencias del crudo son artefactos de conversión |
| Numeración de identificadores | Expresión regular sobre el texto completo, conteo de únicos por serie | OE 8 · KPI 36 + `KP1-21` = **37** · RN 22 · HU 38 · CU 5 · CA 26 · PB 6 · CP 11. **Coincide con la línea base de `CLAUDE.md` §1** |
| **Ausencia de `KPI-19`** | Búsqueda directa del identificador | **Confirmada.** Cero ocurrencias |
| **Grafía `KP1-21`** | Búsqueda de la variante con uno numérico | **Confirmada.** Una única ocurrencia |
| Codificación de `Requisitos.md` | Inspección de bytes: BOM, saltos de línea, `NUL`, categoría Unicode, forma de normalización | UTF-8 **con BOM** · LF puro · 0 `NUL` · 0 caracteres de control · NFC · sin mojibake |
| Integridad de tablas | Conteo de columnas por fila en las 24 tablas | **24/24 consistentes.** Ninguna malformada ni truncada |
| Backticks residuales | Búsqueda de la secuencia `` ` ` `` en celdas | **4 ocurrencias localizadas** (KPI-13, 17, 26, 35) |
| Términos de glosario | Conteo de filas de la tabla §11 | **22**, coincide con la línea base |
| Estructura del diagrama JSON | Recorrido de `pages[].items` y extracción de `textAreas` | **4 páginas · 91 formas · 25 conectores.** Texto íntegro extraído |
| Legibilidad del PDF de capas DDD | Extracción de texto | Íntegro, sin pérdida |
| Paleta del mockup | Análisis de frecuencia sobre píxeles con S > 0,35 y V > 0,25, agrupados por H/S/V | Primario `#E63946` · éxito `#10B981` · superficie oscura `#040407`/`#252542` · lienzo `#F8F9FA` |
| **Contraste de accesibilidad** | Cálculo sobre el primario | `#E63946` sobre blanco ≈ **3,9:1 — insuficiente para texto normal AA**. Regla derivada en `03-mockups.md` §5.6 |
| Cierre de la Definición de Terminado | Reparto por etapa y suma en las tres tablas | HU **38/38** · CA **26/26** · KPI **37/37** |

**Cómo reproducirlas.** Los comandos usados son extracción con `python3` sobre `docs/insumos/`. Se documentarán como script reutilizable en la ETAPA 02, junto con el resto del utillaje del repositorio.

**Cobertura de código:** no aplica. No hay código.

---

## 7. Verificación de seguridad de la etapa

Contrastada contra el checklist de `CLAUDE.md` §2.7. La mayoría de los puntos no aplica todavía —no hay aplicación—, pero tres sí, y uno produjo un hallazgo.

| # | Punto de §2.7 | Estado en esta etapa |
|---|---|---|
| 1 | **Secretos solo en variables de entorno** | ✅ **Verificado.** Los siete documentos producidos no contienen credenciales, llaves, IP reales, URLs de Supabase ni tokens. Las IP citadas (`192.168.1.101`) proceden del mockup y se citan como **hallazgo**, no como configuración. El correo `admin@urbanizacionmira.com` del mockup es de ejemplo ficticio |
| 2 | CORS restrictivo | No aplica |
| 3 | Validación en el backend | No aplica · **especificado** en RNF-03.6 |
| 4 | Anti inyección SQL | No aplica · **especificado** en RNF-03.7 |
| 5 | Rate limiting | No aplica · **especificado** en RNF-03.8 |
| 6 | RLS activa y forzada | No aplica · **especificado** en RNF-03.9, y señalado como el riesgo número uno del proyecto |
| 7 | Content Security Policy | No aplica · **especificado** en RNF-03.10 |
| 8 | Transversales | No aplica · **especificados** en RNF-03.12 a RNF-03.14 |

**Hallazgo de seguridad de esta etapa · RNF-03.11 — autenticación del Alarm Server.**
El paso 2 del flujo de CU-01 del diagrama dice *«valida firma»*. Ningún indicador, regla de negocio ni criterio de aceptación lo respaldaba. Sin esa validación, el endpoint que recibe los eventos de la cámara aceptaría eventos de acceso de **cualquiera que alcance la URL**, permitiendo fabricar aperturas y falsear la auditoría completa —lo que anularía OE-05 y OE-03 a la vez—. Se elevó a requisito no funcional formal; el contrato se define en la ETAPA 05 y se implementa en la 15.

**Nota sobre el repositorio.** `.gitignore` cubre `.env*`, `*.pem`, `*.key`, `service-account*.json`, `google-services.json`, `GoogleService-Info.plist`, `/coverage`, `/dist`, `/build` y `*.sqlite` desde antes de esta etapa. No se detectó ningún secreto en el historial de Git.

---

## 8. Deuda técnica, supuestos y decisiones pendientes

### Deuda técnica generada

| ID | Deuda | Se salda en |
|---|---|---|
| D-01 | `CLAUDE.md` §2.2 declara 6 agregados raíz donde el diagrama declara 9 (C-02) | Corrección del contrato — **requiere decisión del usuario** |
| D-02 | Dos pantallas inexistentes: captura de rostro y consentimiento del visitante | ETAPA 08 (diseño) · 11 (implementación) |
| D-03 | Los 5 estados obligatorios no están diseñados en ninguna de las 18 pantallas | ETAPAS 09, 10, 11 |
| D-04 | HU-03 sin punto de entrada en la interfaz | ETAPA 09 |
| D-05 | El filtro de eventos del mockup no cubre HU-32 | ETAPA 09 |
| D-06 | La consola operativa fusiona dos roles y omite 4 exigencias verificables | ETAPA 10 |
| D-07 | 9 indicadores solo verificables con hardware | ETAPA 15 |

### `[SUPUESTO]` · 7

| ID | Supuesto | Valor |
|---|---|---|
| S-01 | `estadoAdministrativo` es leído, no calculado por Next Control | Campo alimentado externamente |
| S-02 | Percentil de medición de latencias | **p95** (+ p50 y p99) |
| S-03 | Margen de vigencia del caché de reglas | **24 h** |
| S-04 | Plazo de respuesta al consentimiento | **24 h o inicio de vigencia** |
| S-05 | Umbral de confianza de lectura de placa | **0,85** |
| S-06 | Umbral de latido de dispositivo | **3 latidos o 5 min** |
| S-07 | Definición de «acceso dudoso» | `CONFIANZA_INSUFICIENTE` o `PLACA_DESCONOCIDA` |

Todos configurables, ninguno constante escondida.

### `PENDIENTE DE DEFINICIÓN` · 11

P-01 a P-11, detallados en `contradicciones-y-supuestos.md` §3. **Ninguno bloquea la ETAPA 01.** Los tres que más afectan al producto:

- **P-09** — ¿existe compuerta de aprobación administrativa de autorizaciones? *Por defecto: no se construye.* Determina si OE-02 se cumple o queda en enunciado.
- **P-10** — ¿se quieren reservas de zonas sin cobro? *Por defecto: no se construyen.*
- **P-11** — ¿qué significa «nivel de acceso» por residente? *Por defecto: el más restrictivo.*

---

## 9. Qué debe hacer el usuario manualmente

Ordenado por urgencia. Los puntos 1 y 2 son previos a la ETAPA 01; el resto puede resolverse en paralelo.

1. **Revisar y aprobar la resolución de C-02** (nueve agregados raíz en lugar de seis). Es la única contradicción que cambia el modelo de dominio, y la ETAPA 01 deriva el esquema de los agregados. Si se aprueba, conviene corregir `CLAUDE.md` §2.2 para que el contrato y la implementación no diverjan. **Bloquea el diseño definitivo del esquema.**

2. **Tener a mano las credenciales del proyecto Supabase**, bajo cuenta corporativa de Grupo Control (PDF del reto §8). La ETAPA 01 produce la guía de conexión asumiendo que ya existen. Concretamente hará falta: *Project URL*, *anon key*, *service_role key*, *JWT secret*, cadena de conexión directa y de *pooler*.

3. **Decidir P-09, P-10 y P-11** — las tres decisiones de producto que cambian qué se construye. P-11 se necesita en la ETAPA 04, P-09 en la 05 y P-10 en la 07. Hasta entonces rige el comportamiento conservador.

4. **Confirmar la nomenclatura de ramas.** La ETAPA 00 se ejecutó en `etapa00` por indicación expresa; `CLAUDE.md` §2.5 exige `etapa-NN-slug`. Indicar si a partir de la ETAPA 01 se retoma la convención del contrato (`etapa-01-modelo-datos-supabase`) o se mantiene el formato corto.

5. **Publicar la rama `develop` en el remoto.** Actualmente solo existen `main` y `etapa00` en `origin`. `CLAUDE.md` §2.5 fija `develop` como base de todas las ramas de etapa.

6. **Confirmar el estado de los documentos de cesión de derechos, confidencialidad y seguridad de la información** (P-01). El PDF del reto los declara condición previa al inicio. No bloquea técnicamente, pero es una condición contractual esencial y debe quedar resuelta.

7. **Prever el acceso al laboratorio de hardware** con antelación a la ETAPA 15: modelos concretos, firmware, documentación ISAPI, IPs y credenciales de servicio. Nueve indicadores dependen de ello, y la etapa tiene precondición explícita.

---

## 10. Rama y commits

- **Rama:** `etapa00`
- **Base:** `develop` (creada localmente a partir de `origin/main`, commit `73d160d`)
- **Commits de esta etapa:** ver `git log etapa00` — un commit de contenido y un commit de cierre `chore(etapa-00): cierre de etapa`
- **Insumos modificados:** ninguno
- **Código de producto:** ninguno, por diseño

---

## Cierre

**La ETAPA 00 queda CERRADA.** La Definición de Terminado se cumple: 38 historias, 26 criterios y 37 indicadores asignados a etapa concreta, ninguno huérfano, y las catorce contradicciones documentadas con su resolución.

**La ETAPA 01 queda habilitada.** El agente se detiene aquí y espera instrucción expresa, conforme a `CLAUDE.md` §2.1.1.
