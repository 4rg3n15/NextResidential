# 01 · Auditoría de legibilidad e inventario del documento de requisitos

**Insumos auditados:**
- `docs/insumos/Requisitos_Next_Control_Residencial_v1.docx` — **fuente original**, autoridad máxima
- `docs/insumos/Requisitos.md` — derivado en Markdown, contrastado contra el original

**Metadatos declarados:** Proyecto «Nex Control Residential» · Versión V1.0 · Fecha 1/09/2026 · Autor Argenis Omaña · Control de versiones: «Beta 1.0 · 01/09/2026 · Planteamiento de requisitos 1 (Objetivos y KPIS)».

**Regla observada:** el documento original **no se modifica**. Toda corrección vive en este informe y en los artefactos derivados.

---

## 1. Método

1. Descompresión del `.docx` y extracción de `word/document.xml`, preservando el orden de párrafos y las fronteras de celda de tabla.
2. Extracción de `Requisitos.md` decodificando como UTF-8 con BOM.
3. Normalización de ambos textos —eliminación de sintaxis Markdown (`**`, `|`, filas separadoras `:-`, `<br>`, escapes `1\.`), normalización Unicode NFC y colapso de espacios— y comparación palabra a palabra con `difflib.SequenceMatcher`.
4. Batería de comprobaciones de codificación, control de caracteres, integridad de tablas y numeración de identificadores.

---

## 2. Codificación y forma del archivo derivado

| Comprobación | Resultado | Valoración |
|---|---|---|
| Codificación | UTF-8 | Correcta |
| **BOM** | **Presente** (`EF BB BF`) | **Hallazgo L-01** |
| Saltos de línea | LF puro (0 CRLF, 0 CR sueltos) | Correcto |
| Bytes `NUL` | 0 | Correcto |
| Caracteres de control (categoría Cc, excluidos `\n` y `\t`) | 0 | Correcto |
| Normalización Unicode | NFC | Correcta |
| Caracteres corruptos / mojibake | Ninguno | Correcto |
| Longitud de línea máxima | 638 caracteres | Aceptable en Markdown |
| Repertorio no ASCII | Solo acentuación castellana, `·`, `→`, `—`, `–`, `≥`, comillas tipográficas `“ ”`, `¿` | Correcto |

### Hallazgo L-01 · BOM en `Requisitos.md`
**Severidad:** baja.
**Descripción:** el archivo abre con la marca de orden de bytes `EF BB BF`. En Markdown es inocuo para la lectura humana, pero rompe comparaciones byte a byte, puede desplazar el primer encabezado en algunos analizadores y ensucia los `diff` de Git.
**Remediación:** al generar cualquier artefacto derivado de este documento, decodificar con `utf-8-sig`. No se reescribe el insumo.

---

## 3. Fidelidad del derivado Markdown frente al `.docx`

**Resultado: fidelidad total.**

| Medición | Valor |
|---|---|
| Similitud palabra a palabra, texto crudo | 0,9848 |
| Similitud tras normalizar sintaxis Markdown | **1,0000** |
| Diferencias de contenido | **0** |
| Bloques divergentes tras normalizar | **0** |

Las 79 divergencias del crudo son, sin excepción, artefactos de conversión de Word a Markdown y no alteran una sola palabra del contenido:

| Artefacto | Ocurrencias | Naturaleza |
|---|---|---|
| Filas separadoras de tabla `\| :- \| :- \|` | 24 | Sintaxis Markdown obligatoria; no existen en el `.docx` |
| `<br>` sustituyendo saltos de línea dentro de celda | ~45 | Equivalente funcional del salto de línea intracelda de Word |
| Escapes de ordinal `1\.`, `2\.` | ~10 | Evitan que Markdown convierta el texto en lista numerada |

**Conclusión operativa:** `Requisitos.md` es una **fuente de trabajo fiable** y puede usarse para búsqueda, `grep` y trazabilidad automatizada. La autoridad formal sigue siendo el `.docx`; en cualquier discrepancia futura, manda el original.

---

## 4. Integridad de tablas

24 tablas detectadas. **Ninguna malformada ni truncada**: en las 24, todas las filas tienen idéntico número de columnas.

| Tabla | Línea | Filas | Contenido | Estado |
|---|---|---|---|---|
| Cabecera del proyecto | 7 | 3 | Proyecto, versión, fecha, autor | OK |
| Control de versiones | 13 | 6 | 1 entrada + **3 filas vacías** | OK (ver L-02) |
| Objetivos específicos | 25 | 10 | 8 OE | OK |
| **Indicadores de éxito** | 38 | 47 | 37 KPI + 8 filas de agrupación | OK (ver L-03) |
| Problemas identificados | 95 | 8 | 6 PB | OK |
| Herramientas actuales | 106 | 7 | 5 sistemas | OK |
| Alcance incluido / excluido | 123 | 15 | 13 pares | OK |
| Implicados | 141 | 9 | 7 stakeholders | OK |
| Roles del sistema | 153 | 8 | 6 roles | OK |
| Reglas de negocio | 164 | 24 | 22 RN | OK |
| Historias de usuario | 192 | 40 | 38 HU | OK |
| CU-01 … CU-05 | 236–280 | 8 c/u | 5 casos de uso | OK |
| Matriz de trazabilidad | 292 | 13 | 11 filas | OK |
| Criterios de aceptación | 309 | 28 | 26 CA | OK |
| Glosario | 340 | 24 | **22 términos** | OK |
| Mockups y wireframes | 367 | 16 | 14 pantallas | OK (ver L-06) |
| Componentes de la solución | 390 | 9 | 7 componentes | OK |
| Stack sugerido | 402 | 16 | 14 capas | OK |
| Riesgos técnicos | 427 | 8 | 6 riesgos | OK |
| Orden de construcción | 438 | 10 | 8 fases | OK |

### Hallazgo L-02 · Filas vacías en «Control de versiones»
**Severidad:** cosmética. Tres filas `|||||` sin contenido, residuo de la plantilla. Sin efecto sobre el análisis.

### Hallazgo L-03 · Filas de agrupación en la tabla de KPI
**Severidad:** baja, pero relevante para el procesamiento automático.
**Descripción:** la tabla de indicadores mezcla dos tipos de fila con la misma estructura. Ocho filas actúan como encabezado de grupo —`01 | Modelo de datos de copropiedades | **Meta** | **Fuente de medición**`— repitiendo literalmente los títulos de las columnas 3 y 4 en lugar de dejarlas vacías o fusionar celdas. Los ocho grupos corresponden uno a uno con los ocho objetivos específicos, aunque el documento no lo declara.
**Efecto:** cualquier lectura automática que cuente filas de datos obtiene 45 en vez de 37.
**Remediación en el derivado:** los ocho grupos se explicitan como `OE-01`…`OE-08` y las columnas repetidas se vacían. La correspondencia grupo → objetivo, ya validada, es:

| Grupo | Título | Objetivo | KPI que contiene |
|---|---|---|---|
| 01 | Modelo de datos de copropiedades | OE-01 | KPI-01 … KPI-05 |
| 02 | Autorización autónoma desde la app | OE-02 | KPI-06 … KPI-10 |
| 03 | Capa de integración desacoplada | OE-03 | KPI-11 … KPI-15 |
| 04 | Control biométrico | OE-04 | KPI-16, 17, 18, 20, `KP1-21` |
| 05 | Trazabilidad | OE-05 | KPI-22 … KPI-27 |
| 06 | Continuidad ante caída de red | OE-06 | KPI-28 … KPI-31 |
| 07 | Operación remota | OE-07 | KPI-32 … KPI-35 |
| 08 | Multiempresa con aislamiento de datos | OE-08 | KPI-36, 37, 38 |

### Hallazgo L-04 · Backticks residuales dentro de celdas
**Severidad:** baja.
**Descripción:** cuatro celdas del derivado Markdown contienen la secuencia `` ` ` `` —backtick, espacio, backtick—, residuo de la conversión de un espacio de no separación o de una ejecución vacía de Word. Al renderizar, aparece un fragmento de código vacío al inicio del texto de la celda.

| Línea | KPI | Celda afectada | Texto tal como aparece |
|---|---|---|---|
| 55 | KPI-13 | Fuente de medición | `` ` ``​`` ` ``​`Marcas de tiempo en los eventos` |
| 60 | KPI-17 | Fuente de medición | `` ` ``​`` ` ``​`100 intentos de personas registradas` |
| 69 | KPI-26 | **Indicador** | `` ` ``​`` ` ``​`Cobertura de sabotaje` |
| 80 | KPI-35 | Fuente de medición | `` ` ``​`` ` ``​`Prueba de sesión con proyectos alternados` |

**Remediación:** se eliminan en el derivado. No alteran el significado de ningún indicador.

---

## 5. Verificación de la numeración de identificadores

Conteo de identificadores únicos mediante expresión regular sobre el texto completo:

| Serie | Únicos encontrados | Esperado por continuidad | Estado |
|---|---|---|---|
| **OE-** | 8 | OE-01 … OE-08 | ✅ Secuencia completa |
| **KPI-** | 36 | — | ⚠️ Ver K-01 y K-02 |
| **KP1-** | 1 (`KP1-21`) | — | ⚠️ Ver K-02 |
| **RN-** | 22 | RN-01 … RN-22 | ✅ Secuencia completa |
| **HU-** | 38 | HU-01 … HU-38 | ✅ Secuencia completa |
| **CU-** | 5 | CU-01 … CU-05 | ✅ Secuencia completa |
| **CA-** | 26 | CA-01 … CA-26 | ✅ Secuencia completa |
| **PB-** | 6 | PB-01 … PB-06 | ✅ Secuencia completa |
| **CP-** | 11 | CP-01 … CP-11 | ✅ Secuencia completa |
| Roles | 6 | — | ✅ |
| Términos de glosario | 22 | — | ✅ |

### Hallazgo K-01 · `KPI-19` no existe — **confirmado**
**Severidad:** media (afecta a la trazabilidad y al recuento de compromisos).
**Descripción:** la serie de indicadores salta de `KPI-18` (Falsa aceptación, FAR) a `KPI-20` (Consentimiento previo). No hay indicador 19 en ninguna parte del documento, ni en el grupo 04 ni en ningún otro.
**Diagnóstico:** salto de numeración, no contenido perdido. El grupo 04 «Control biométrico» está temáticamente completo con lo que declara: calidad de captura (16), FRR (17), FAR (18), consentimiento previo (20) y supresión al vencer (21). No se detecta un hueco conceptual que un indicador 19 debiera llenar.
**Resolución:** **no se renumera.** Renumerar rompería toda referencia externa ya escrita. El identificador `KPI-19` se declara **inexistente y reservado**; ningún artefacto del proyecto debe usarlo. El total real de indicadores es **37**, no 38.

### Hallazgo K-02 · `KP1-21` — uno numérico en lugar de la letra I — **confirmado**
**Severidad:** media (rompe la búsqueda y la trazabilidad automatizada).
**Descripción:** la entrada 21 del grupo 04 —«Supresión al vencer · 100 % eliminadas de la terminal dentro de 24 h»— está escrita como **`KP1-21`**: dígito «1» en lugar de la letra «I». Es la única ocurrencia de esa grafía en todo el documento.
**Efecto:** una búsqueda de `KPI-` no la encuentra. Cualquier matriz de trazabilidad construida automáticamente la omitiría.
**Resolución:** en todos los artefactos derivados se escribe **`KPI-21`**, señalando entre paréntesis *«registrada en el original como `KP1-21`»* la primera vez que aparece en cada documento. El original no se toca.

### Recuento final verificado

| Elemento | Cantidad real | Coincide con la línea base de `CLAUDE.md` §1 |
|---|---|---|
| Objetivos específicos (OE) | 8 | ✅ |
| Indicadores (KPI) | **37 entradas, no 38** | ✅ confirmado |
| Reglas de negocio (RN) | 22 | ✅ |
| Historias de usuario (HU) | 38, todas en estado *Pendiente* | ✅ |
| Casos de uso (CU) | 5 | ✅ |
| Criterios de aceptación (CA) | 26, formato Gherkin | ✅ |
| Problemas AS-IS (PB) | 6 | ✅ |
| Casos de prueba (CP) | 11 | ✅ |
| Roles del sistema | 6 | ✅ |
| Términos de glosario | 22 | ✅ |

**La línea base de `CLAUDE.md` §1 queda verificada punto por punto contra la fuente original.**

---

## 6. Otras anomalías de redacción

### Hallazgo L-05 · «patrón» donde debe decir «padrón» (OE-01)
**Severidad:** media. Es una ambigüedad semántica real, no un descuido tipográfico inocuo.
**Texto original:** *«Habilitar la administración completa del **patrón** de la copropiedad – viviendas, residentes, vehículos y sus relaciones – …»*
**Problema:** en este mismo documento, «patrón» tiene un significado técnico distinto y activo: `PatrónRecurrencia`, «patrón de días y franjas» (RN-22, CA-06, CU-01 4a). Usar la misma palabra para el censo de la copropiedad y para la recurrencia horaria es una colisión de lenguaje ubicuo en el objetivo específico número uno.
**Resolución:** OE-01 se lee **«padrón»** (censo de viviendas, residentes y vehículos). Coherente con el uso correcto en el resto del documento —épica «Padrón» de HU-01…HU-04, HU-03 «cargar el **padrón** inicial», matriz de trazabilidad «CP-01 Integridad del **padrón**»—. En el lenguaje ubicuo del proyecto: **Padrón** = censo; **PatrónRecurrencia** = objeto de valor de días y franjas.

### Hallazgo L-06 · Enlaces de mockups sin resolver
**Severidad:** baja, ya subsanada.
**Descripción:** las 14 filas de la tabla §12 «Mockups y wireframes» tienen la columna «Enlace o adjunto» con el valor literal `[pendiente]`.
**Resolución:** el insumo `NexResidential_Mockups.png` cubre esas pantallas. La correspondencia fila a fila se establece en `03-mockups.md` §2. Dos filas de esa tabla **no tienen contraparte en el mockup**: «Pantalla de consentimiento del visitante» y la parte de captura de rostro de «App — crear visitante y capturar rostro». Ver hallazgos M-02 y M-03.

### Hallazgo L-07 · Redacción defectuosa en la fuente de medición de KPI-11
**Severidad:** baja.
**Texto original:** *«Análisis estáticos en integración continua monitoreando que siempre presente»* — frase incompleta.
**Resolución:** se interpreta y se reescribe en el derivado como *«Análisis estático ejecutado en cada corrida de integración continua, con el resultado como condición de aprobación del build.»* La meta del indicador —0 referencias a ISAPI o IP de dispositivo fuera del proveedor— es inequívoca y no se altera.

### Hallazgo L-08 · «Calidad de Apertura» donde debe decir «Calidad de captura» (KPI-16)
**Severidad:** baja.
**Texto original:** indicador `KPI-16` titulado *«Calidad de Apertura»*, con meta *«≥ 95 % de fotos adjuntadas son aceptadas al primer intento»* y fuente *«100 fotos de rostros en luz normal»*.
**Problema:** el título contradice a la meta. «Apertura» designa en el glosario el accionamiento físico del relé; este indicador mide la aceptación de fotografías en la validación de calidad biométrica.
**Resolución:** se lee **«Calidad de captura»**. Meta y fuente de medición permanecen sin cambios y son las que gobiernan.

---

## 7. Requisitos ambiguos o sin criterio de verificación

Ocho puntos en los que el documento no permite construir sin decidir algo que no dice. Cada uno recibe comportamiento conservador y queda registrado en `contradicciones-y-supuestos.md`.

| # | Requisito | Qué falta | Tratamiento |
|---|---|---|---|
| A-01 | **CU-01, excepción 3a** — «lectura de placa con confianza por debajo del umbral» | El umbral no se define en ninguna parte | `PENDIENTE DE DEFINICIÓN` P-02. Umbral **configurable por copropiedad**, valor por defecto `[SUPUESTO]` **0,85**. Por debajo: no se decide automáticamente, se envía a validación humana |
| A-02 | **CU-02, alterno 3a** — «el visitante no responde en el plazo definido» | El plazo no se define | `PENDIENTE DE DEFINICIÓN` P-03. `[SUPUESTO]`: **24 h desde el envío, o el inicio de la vigencia, lo que ocurra primero**. Vencido: la autorización queda vigente **solo por placa**, sin acceso facial |
| A-03 | **CU-05, excepción 6a** — «el contador de aforo se reinicia según la política horaria configurada» | La política no se define | `PENDIENTE DE DEFINICIÓN` P-04. `[SUPUESTO]`: reinicio a cero al **cierre del horario** de la zona, con evento de auditoría y alerta al administrador cuando el reinicio descarta un conteo distinto de cero |
| A-04 | **CU-04, alterno 3a** — «política de contingencia configurada (denegar por defecto o escalar al portero)» | Cuál es el valor por defecto | Resuelto por §2.1.4 del contrato: **denegar por defecto**. Configurable por copropiedad |
| A-05 | **KPI-31** — «reglas obsoletas más allá del margen definido» | El margen de vigencia del caché no se define | `PENDIENTE DE DEFINICIÓN` P-05. `[SUPUESTO]`: **24 h**, alineado con KPI-30 (autonomía de 24 h). Superado el margen, el Edge marca el evento como decidido con reglas potencialmente obsoletas |
| A-06 | **CA-26** — «una terminal lleva más del umbral configurado sin reportarse» | El umbral de latido no se define | `PENDIENTE DE DEFINICIÓN` P-06. `[SUPUESTO]`: **3 latidos perdidos o 5 minutos**, configurable por tipo de dispositivo |
| A-07 | **KPI-14** — «100 % de los dispositivos deben estar en alcance operable» | «Alcance operable» no está definido y no es medible como está redactado | Se reformula en el derivado: *«todo dispositivo registrado responde a una orden de prueba y reporta estado dentro del umbral de latido»*. Verificable solo con hardware (ETAPA 15) |
| A-08 | **RN-18** — «acceso dudoso» como evento crítico | No se define qué hace dudoso a un acceso | `PENDIENTE DE DEFINICIÓN` P-07. `[SUPUESTO]`: se considera dudoso todo acceso cuyo `ResultadoAcceso` sea `CONFIANZA_INSUFICIENTE` o `PLACA_DESCONOCIDA`. Ambos escalan |

---

## 8. Contradicciones internas y frente al PDF del reto

Cinco contradicciones detectadas en este paso. Todas se registran con su resolución en `contradicciones-y-supuestos.md`; aquí se enuncia el diagnóstico.

| # | Contradicción | Resolución aplicada |
|---|---|---|
| **C-01** | **Intercom.** §13.2 propone *«SIP hacia el videoportero, con puente WebRTC (LiveKit o Janus)»*; §13.4 lo declara la pieza más difícil del proyecto. El diagrama arquitectónico deja ambas rutas abiertas: *«ISAPI TwoWayAudio, o SIP con Asterisk si el modelo no lo soporta»*. `CLAUDE.md` ADR-01 decide ISAPI TwoWayAudio | Prevalece **ISAPI TwoWayAudio** por decisión expresa del cliente, posterior al documento. §13 se declara a sí misma ajena al estándar de especificación y la propuesta SIP no tiene criterio de verificación asociado: ningún OE, RN, HU, CU ni CA exige SIP. Los KPI comprometidos (32, 33) y los CA (19, 20) son de latencia y trazabilidad, agnósticos al protocolo. SIP sobrevive como contingencia documentada, realizable como adaptador nuevo tras el mismo puerto. Formalizado en `ADR-001` |
| **C-07** | **KPI-12.** La meta dice *«suite completa verde con adaptadores simulados»*, pero su fuente de medición dice *«Ejecución en CI con otros dispositivos de otro proveedor»* — y el alcance excluido prohíbe implementar adaptadores de otros fabricantes | Manda la **meta**, no la fuente. La fuente correcta es la ejecución de la suite completa contra `MockProvider` en CI, sin hardware. `MockProvider` **es** el «otro proveedor» que demuestra la sustituibilidad (LSP): dos implementaciones del mismo puerto, la suite verde con ambas y sin cambiar una aserción |
| **C-22** | **KPI-01 vs RN-13.** KPI-01 exige *«0 residentes sin vivienda activa»*; RN-13 establece que una vivienda puede quedar **inactiva** conservando sus autorizaciones vigentes, y RN-19 prohíbe el borrado físico. Al desactivar una vivienda con residentes, KPI-01 quedaría incumplido por diseño | KPI-01 se lee como indicador de **integridad referencial**, no de estado: *«0 residentes **activos** sin vivienda asociada»*. Un residente activo siempre tiene `vivienda_id` válido; la desactivación de la vivienda propaga el estado, no rompe la relación. La consulta de huérfanos verifica referencias, no actividad |
| **C-15** | **Plataforma de despliegue.** §13.2 sugiere *«Railway o Fly.io»*; `CLAUDE.md` §2.6 fija el stack completo pero **no menciona plataforma de despliegue** de la API | `PENDIENTE DE DEFINICIÓN` **P-08**. No bloquea ninguna etapa hasta la 14. Se decide allí, con el requisito de que la cuenta sea corporativa de Grupo Control (§9 del PDF del reto) |
| **C-23** | **Superficie del residente.** El PDF del reto dice *«Aplicación móvil o PWA»*; el documento de requisitos fija **Flutter (iOS y Android)** y el alcance incluido lo confirma | No es contradicción sino precisión progresiva: el reto abre la opción, los requisitos la cierran. Se construye **Flutter** para el residente y **PWA instalable** para las consolas web. Ambas cosas, no una en lugar de otra |

---

## 9. Vacío estructural: ausencia de requisitos no funcionales

**Confirmado.** El documento **no contiene** una sección formal de requisitos no funcionales. Es el vacío más relevante de la especificación, y no es menor: los compromisos de latencia, disponibilidad, seguridad y privacidad existen —están dispersos entre los KPI, las RN y la §9 del PDF del reto—, pero no como requisitos verificables con criterio propio.

**Consecuencia si no se subsana:** el proyecto tendría metas numéricas (KPI) sin requisito que las respalde, y sería imposible decidir en tiempo de diseño si una decisión arquitectónica cumple o incumple algo.

**Propuesta:** se construye la sección completa en `04-requisitos-no-funcionales.md`, derivándola de:

- **Latencia:** KPI-09 (< 5 s propagación), KPI-13 (< 3 s apertura), KPI-25 (< 10 s alerta), KPI-32 (< 3 s apertura remota), KPI-33 (< 2 s audio y video)
- **Disponibilidad y continuidad:** KPI-28 a KPI-31 (continuidad local, reconciliación, autonomía 24 h, vigencia de caché)
- **Seguridad y aislamiento:** KPI-36, KPI-37, KPI-38, más RN-15, RN-20 y RN-21
- **Auditoría e integridad:** KPI-22 a KPI-24 y KPI-05
- **Privacidad:** KPI-20, KPI-21 y la Ley 1581 de 2012
- **Precisión biométrica:** KPI-16, KPI-17, KPI-18
- **Mantenibilidad y desacople:** KPI-11, KPI-12
- **Usabilidad:** KPI-10, KPI-06

Doce requisitos no funcionales (RNF-01 … RNF-12), cada uno con métrica, umbral, fuente de medición, KPI de respaldo y etapa donde se verifica.

---

## 10. Resumen de hallazgos

| ID | Hallazgo | Severidad | Estado |
|---|---|---|---|
| L-01 | BOM en `Requisitos.md` | Baja | Documentado; decodificar con `utf-8-sig` |
| L-02 | Filas vacías en «Control de versiones» | Cosmética | Documentado |
| L-03 | Filas de agrupación con encabezados repetidos en la tabla de KPI | Baja | Correspondencia grupo→OE establecida |
| L-04 | Backticks residuales `` ` ` `` en 4 celdas | Baja | Localizados; se limpian en derivados |
| L-05 | «patrón» por «padrón» en OE-01 | Media | Resuelto: OE-01 se lee «padrón» |
| L-06 | 14 enlaces de mockup como `[pendiente]` | Baja | Resuelto vía `03-mockups.md`; 2 pantallas sin contraparte |
| L-07 | Fuente de medición de KPI-11 incompleta | Baja | Reescrita en el derivado |
| L-08 | KPI-16 titulado «Calidad de Apertura» | Baja | Se lee «Calidad de captura» |
| **K-01** | **`KPI-19` no existe** | **Media** | **Confirmado. Identificador reservado, no se renumera. Total real: 37** |
| **K-02** | **`KP1-21` con uno numérico** | **Media** | **Confirmado. Se escribe `KPI-21` en los derivados** |
| A-01…A-08 | 8 requisitos ambiguos o sin criterio | Media | Comportamiento conservador + `PENDIENTE DE DEFINICIÓN` |
| C-01, C-07, C-15, C-22, C-23 | 5 contradicciones | Media/Alta | Resueltas; ver §8 y `contradicciones-y-supuestos.md` |

**Cero hallazgos que impidan avanzar.** El documento es utilizable como especificación. El derivado Markdown es fiel al original y apto para trazabilidad automatizada.
