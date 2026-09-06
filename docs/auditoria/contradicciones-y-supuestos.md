# Contradicciones, supuestos y decisiones pendientes

**Registro único y autoritativo** de todo lo que la ETAPA 00 no pudo resolver leyendo los insumos, o que resolvió eligiendo entre fuentes en conflicto.

**Reglas que gobiernan este documento** (`CLAUDE.md` §2.1):
- Decisión de negocio no resuelta → `PENDIENTE DE DEFINICIÓN`, **comportamiento conservador (denegar por defecto)**, reportada. Nunca inventada en silencio.
- Suposición del agente → marcada `[SUPUESTO]` en código y en informe.
- Conflicto entre fuentes → `[CONTRADICCIÓN]` con la resolución aplicada según la jerarquía de §3.

**Jerarquía de resolución:** PDF del reto → Requisitos → Arquitectura → Mockups.
`CLAUDE.md` y sus ADR son **decisiones del cliente posteriores a los insumos** y prevalecen sobre todos ellos cuando se pronuncian de forma expresa.

> **Sobre la numeración.** Las series `C-`, `S-` y `P-` tienen huecos. Varios candidatos a contradicción se reclasificaron durante la consolidación como hallazgos de legibilidad (`L-`) o de mockup (`M-`) por no serlo realmente —una errata no es un conflicto entre fuentes—. Los identificadores emitidos **no se reutilizan**, para que las referencias cruzadas de los demás documentos sigan siendo válidas.

---

## 1. Contradicciones · 14 registradas, 14 resueltas

### C-01 · Protocolo del intercom — **Alta**

| | |
|---|---|
| **Fuente A** | Requisitos §13.2, tabla «Stack sugerido», fila *Intercom*: *«SIP hacia el videoportero, con puente WebRTC (LiveKit o Janus)»*. §13.4 lo declara el mayor riesgo de cronograma |
| **Fuente B** | Diagrama arquitectónico, caja «Puente de intercom»: *«ISAPI TwoWayAudio, o SIP con Asterisk si el modelo no lo soporta»* — deja ambas rutas abiertas |
| **Fuente C** | `CLAUDE.md` ADR-01: ISAPI TwoWayAudio, decisión expresa del cliente |
| **Resolución** | Prevalece **ISAPI TwoWayAudio** |

**Justificación.** La decisión del cliente es posterior a la redacción del documento. Además, §13 se declara a sí misma ajena al estándar de especificación (*«Esta sección no forma parte del estándar de especificación de requisitos…»*), y la propuesta SIP **no tiene criterio de verificación asociado**: ningún OE, RN, HU, CU ni CA exige SIP. Los compromisos reales —KPI-32, KPI-33, CA-19, CA-20— son de latencia y trazabilidad, agnósticos al protocolo. El diagrama no contradice la decisión: la contiene como primera opción.

**Obligaciones derivadas.** Toda referencia a SIP, Asterisk, LiveKit o Janus queda **fuera del alcance de implementación**: no se construye, no se deja andamiaje, no se menciona en el código. SIP sobrevive únicamente como contingencia documentada, realizable como adaptador nuevo tras el mismo puerto. El `.docx` original **no se modifica**.
**Formalizada en:** `docs/decisiones/ADR-001-intercom-isapi-twowayaudio.md` · **Afecta a:** ETAPAS 10, 15

---

### C-02 · Número de agregados raíz: seis frente a nueve — **Alta**

| | |
|---|---|
| **Fuente A** | `CLAUDE.md` §2.2: seis agregados raíz «del diagrama, vinculantes» — `Copropiedad`, `Vivienda`, `Autorización`, `Acceso`, `Consentimiento`, `Zona`. Coincide con la página 1 del diagrama |
| **Fuente B** | Diagrama, **página 3 «Agregados y objetos de valor»**: nueve, añadiendo `PlantillaBiometrica`, **`ListaNegra` «raíz de agregado»** y **`Dispositivo` «raíz de agregado»** |
| **Resolución** | Se adoptan **nueve agregados raíz** |

**Justificación.** No es desacuerdo de criterio: `CLAUDE.md` declara que su lista proviene del diagrama, y la vista del diagrama dedicada precisamente a los agregados declara tres más. La lista del contrato es un resumen de la página 1, no el inventario completo. **Y el hueco tiene consecuencia funcional:** sin `ListaNegra` y sin `Dispositivo`, cinco reglas se quedan sin invariante que las sostenga —RN-06, RN-07, RN-12, RN-21— y CA-26 no tiene dónde vivir. `PolíticaListaNegra` *aplica* la lista; no gobierna quién puede crearla ni levantarla, que es una invariante de agregado (RN-07).

**Acción.** Se propone al usuario la corrección de `CLAUDE.md` §2.2. Entretanto se construye con nueve y se documenta. Se añaden además los puertos faltantes: `ListaNegraRepo`, `DispositivoRepo`, `ConsentimientoRepo`, `PlantillaRepo`.
**Detalle en:** `02-arquitectura.md` §2 · **Afecta a:** ETAPAS 01, 05, 06, 08

---

### C-03 · Aprobación administrativa de autorizaciones — **Alta**

| | |
|---|---|
| **Fuente A** | OE-02: la autorización del residente *«se propague al motor de reglas **sin intervención de portería**»*. KPI-06 exige ≥ 95 % de ingresos autónomos. PB-01 identifica la dependencia de un tercero como el problema a eliminar |
| **Fuente B** | Mockup W-05: ciclo `Pendiente → Aprobada / Denegada` con botones **Aprobar** y **Rechazar** operados por el administrador |
| **Resolución** | **No se construye compuerta de aprobación** |

**Justificación.** Jerarquía Requisitos > Mockups. Ninguna HU, RN, CU ni CA menciona una aprobación administrativa. Y una compuerta humana hace **inalcanzable** KPI-06 cuando el administrador no está disponible —reintroduciendo exactamente PB-01, el problema que el proyecto viene a resolver—.

**Reinterpretación de la pantalla.** Los distintivos pasan a representar el ciclo de vida real de `Autorizacion`: **Vigente · Programada · Expirada · Revocada**. Los botones se sustituyen por **Revocar** (RN-10) y **Ver detalle**.
**Deriva en:** `PENDIENTE DE DEFINICIÓN` **P-09** · **Afecta a:** ETAPAS 05, 09, 11

---

### C-04 · Reservas de zonas comunes — **Media**

| | |
|---|---|
| **Fuente A** | Alcance **excluido**: *«Reservas de zonas comunes con cobro o pago en línea»*. Alcance **incluido**: *«Zonas comunes con horario, aforo y reglas configurables»* — sin mencionar reservas. HU-18, HU-19 y HU-20 no hablan de agendar |
| **Fuente B** | Mockup W-06 «Reservas de Hoy» con estados Confirmada/Pendiente; mockup M-5 «Mis Reservas Activas» y botón «Solicitar Acceso» |
| **Resolución** | Las **reservas no se construyen**. Se implementa **solicitud de acceso a zona** (HU-19) |

**Justificación.** El alcance excluye reservas *con cobro*; el alcance incluido no menciona reservas *sin cobro*. Ante el silencio, manda lo que sí tiene HU: HU-19 pide *autorizar acceso*, no agendar franja. Construir una agenda con confirmación sería ampliar el alcance por iniciativa propia.
**Deriva en:** `PENDIENTE DE DEFINICIÓN` **P-10** · **Afecta a:** ETAPAS 07, 09, 11

---

### C-05 · Selector de rol en el login — **Alta**

| | |
|---|---|
| **Fuente A** | RN-15 y la ETAPA 03: rol y `copropiedad_id` provienen de los *custom claims* del JWT. RN-20 y CA-25 exigen MFA para roles administrativos. Requisitos §12 lista *«Login **y selección de copropiedad**»*. El sistema tiene **6 roles** |
| **Fuente B** | Mockup W-01: chips «TIPO DE USUARIO» con **3 roles elegibles por el usuario**, sin paso MFA y sin selector de copropiedad |
| **Resolución** | **El selector se elimina.** Login único; el rol se deriva del token |

**Justificación.** Dos problemas independientes. Primero, **el rol no se elige, se deriva**: un selector en el cliente sugiere que la elección influye en los permisos y crea superficie de confusión sin aportar nada. Segundo, faltan tres roles (Superadministrador, Operador de central, Servicio/Integración) y dos pasos obligatorios.

**Se añaden:** paso de **segundo factor TOTP** para roles administrativos (RN-20, CA-25) y **selector de copropiedad posterior a la autenticación** cuando el token habilita más de una —caso del Operador de central, HU-25, KPI-35—.
**Afecta a:** ETAPAS 03, 09

---

### C-06 · Acompañantes: contador frente a lista nominal — **Media**

| | |
|---|---|
| **Fuente A** | HU-09: *«registrar acompañantes»*. Diagrama pág. 3: `acompanantes: Acompanante[]` — colección de entidades con identidad. RN-02 exige que el evento registre el actor |
| **Fuente B** | Mockup M-4: control «Número de acompañantes» con contador `−` / `+` |
| **Resolución** | **Lista nominal** con nombre y documento por acompañante |

**Justificación.** Un contador no permite auditar quién entró, y RN-02 exige actor en el evento. El contador se conserva como **atajo de interfaz** que despliega N filas. Coherente con CU-01, donde los acompañantes entran en el mismo vehículo pero cada persona genera su propio registro de acceso.
**Afecta a:** ETAPAS 05, 11

---

### C-07 · KPI-12: meta frente a fuente de medición — **Media**

| | |
|---|---|
| **Fuente A** | KPI-12, **meta**: *«Suite completa verde con adaptadores simulados»* |
| **Fuente B** | KPI-12, **fuente de medición**: *«Ejecución en CI con otros dispositivos de otro proveedor»*. El alcance excluido prohíbe implementar adaptadores de otros fabricantes |
| **Resolución** | Manda la **meta**. La fuente correcta es la ejecución de la suite completa contra `MockProvider`, sin hardware |

**Justificación.** La fuente de medición se contradice con el propio alcance del proyecto. **`MockProvider` *es* el «otro proveedor»** que demuestra la sustituibilidad: dos implementaciones del mismo puerto, la suite verde con ambas, sin cambiar una aserción. Eso es el principio de sustitución de Liskov, que es lo que KPI-12 pretende medir.
**Afecta a:** ETAPAS 05, 14

---

### C-11 · Direcciones IP de dispositivo visibles en el navegador — **Baja**

| | |
|---|---|
| **Fuente A** | RN-21: *«Las credenciales y secretos de dispositivos nunca se exponen al frontend ni a la aplicación móvil»*. KPI-11: cero referencias a IP de dispositivo fuera de la capa de proveedor |
| **Fuente B** | Mockup W-07: cada tarjeta de dispositivo muestra su IP (`192.168.1.101`…) |
| **Resolución** | Se mantiene la visibilidad, **restringida por rol** |

**Justificación, en tres partes.** (1) **KPI-11 no se incumple**: se refiere a referencias *en código fuente*; una IP leída de la base y renderizada no lo es, y el análisis estático seguirá dando cero. (2) **RN-21 no se incumple**: una IP no es una credencial; `credencialRef` **nunca** viaja al navegador, ni enmascarada. (3) **Pero es endurecimiento razonable**: la IP se muestra solo a Administrador y Superadministrador, nunca a Portero ni a Operador de central, y nunca en logs ni en mensajes de error.
**Afecta a:** ETAPAS 09, 13

---

### C-12 · La consola operativa omite cuatro exigencias verificables — **Alta**

| | |
|---|---|
| **Fuente A** | RN-08 y CA-16: sin motivo escrito, la apertura **no se ejecuta**. HU-25 y KPI-35: multiproyecto. HU-26, CA-19 y ADR-01: intercom con audio. CU-03 alterno 3a: cola con tiempo de espera |
| **Fuente B** | Mockup W-09: una sola consola, con vídeo pero sin audio, sin conmutador de copropiedad, sin cola y con **ABRIR/DENEGAR que actúan directamente, sin pedir motivo** |
| **Resolución** | El mockup es base visual, no especificación completa. Se **separan dos superficies** y se añaden los cuatro elementos |

**Justificación.** Tal como está dibujada, la consola **incumple un criterio de aceptación** (CA-16) y hace indemostrable un indicador (KPI-35). Además fusiona dos roles con permisos y contexto distintos: el Portero es presencial y de una sola copropiedad; el Operador de central es remoto y multiproyecto. `W-09a` (Portería) y `W-09b` (Guardia virtual) se construyen por separado en la ETAPA 10, esta última con exclusividad de canal, cola y conmutador.
**Afecta a:** ETAPA 10

---

### C-14 · Tres denominaciones de marca — **Baja**

| | |
|---|---|
| **Fuentes** | «NextResidential» (login del mockup) · «Next Control · RESIDENCIAL» (barra lateral) · «Next Control Residencial» (documentos) · «Nex Control Residential» (cabecera del `.docx`) · pie «© 2025 Next Control» y «Versión 4.2.1-Prod» |
| **Resolución** | El producto se denomina **Next Control Residencial**. El repositorio conserva `NextResidential` |

El bloque de marca de la interfaz muestra «Next Control» con «RESIDENCIAL» como descriptor secundario. El número de versión se toma del `package.json` en tiempo de construcción; la versión ficticia «4.2.1-Prod» no llega al entregable.
**Afecta a:** ETAPAS 09, 11, 16

---

### C-15 · Plataforma de despliegue de la API — **Baja**

| | |
|---|---|
| **Fuente A** | Requisitos §13.2: *«Railway o Fly.io — continuidad con la infraestructura que ya usas»* |
| **Fuente B** | `CLAUDE.md` §2.6 fija el stack completo y **no menciona plataforma de despliegue** |
| **Resolución** | **`PENDIENTE DE DEFINICIÓN` P-08.** No bloquea ninguna etapa hasta la 14 |

Requisito no negociable sea cual sea la elección: la cuenta debe ser **corporativa de Grupo Control**, nunca personal (PDF del reto §8).
**Afecta a:** ETAPA 14

---

### C-22 · KPI-01 frente a RN-13 — **Media**

| | |
|---|---|
| **Fuente A** | KPI-01: *«0 residentes sin vivienda activa»* |
| **Fuente B** | RN-13: una vivienda puede quedar **inactiva** conservando sus autorizaciones vigentes. RN-19 prohíbe el borrado físico |
| **Resolución** | KPI-01 se lee como indicador de **integridad referencial**: *«0 residentes **activos** sin vivienda asociada»* |

**Justificación.** Tal como está redactado, desactivar una vivienda con residentes incumpliría KPI-01 **por diseño** —el propio RN-13 lo provocaría—. La intención del indicador, evidente por su nombre («Integridad referencial») y por su fuente de medición («Consulta de huérfanos»), es detectar **huérfanos**: residentes cuyo `vivienda_id` no resuelve. La desactivación propaga el estado; no rompe la referencia.
**Afecta a:** ETAPAS 01, 04

---

### C-23 · Superficie del residente: móvil o PWA — **Baja**

| | |
|---|---|
| **Fuente A** | PDF del reto §1: *«Aplicación móvil o PWA muy sencilla»* |
| **Fuente B** | Requisitos: **Flutter (iOS y Android)**, confirmado en el alcance incluido y en §13.3 |
| **Resolución** | **Ambas cosas.** Flutter para el residente; PWA instalable para las consolas web |

No es contradicción sino precisión progresiva: el reto abre la opción, los requisitos la cierran. `CLAUDE.md` §2.6 confirma las dos superficies.
**Afecta a:** ETAPAS 09, 11, 14

---

### C-26 · Tres perfiles frente a seis roles — **Baja**

| | |
|---|---|
| **Fuente A** | PDF del reto §1: 3 perfiles (Administrador, Portero/Seguridad, Propietario/Residente) |
| **Fuente B** | Requisitos §5: 6 roles (añade Superadministrador, Operador de central, Servicio/Integración) |
| **Resolución** | **Se construyen los 6 roles**, agrupados en las 3 superficies de producto |

**Justificación.** Granularidad distinta, no conflicto. Los 3 perfiles son las tres *superficies* (administración, operación, residente); los 6 roles son el modelo de autorización. El Operador de central lo introduce el propio PDF en su §4; el Superadministrador es lo que hace posible el multiempresa que el PDF exige; Servicio/Integración es una identidad no humana necesaria para el Edge.
**Afecta a:** ETAPAS 03, 09, 10

---

## 2. Supuestos · 7 registrados

Cada supuesto se marca `[SUPUESTO]` en el código donde se materialice, y todos son **configurables**, no constantes escondidas.

| ID | Supuesto | Valor adoptado | Por qué es el conservador | Etapa | Resuelve |
|---|---|---|---|---|---|
| **S-01** | «Estado administrativo» como entrada del motor de reglas (PDF del reto §3) coexistiendo con la exclusión de facturación | `Vivienda.estadoAdministrativo` es un **campo alimentado externamente**; Next Control lo **lee**, no lo **calcula** | Ignorar la dimensión rompería el motor que el PDF pide; construir cartera excedería el alcance. Leer sin calcular respeta ambos | 04 · 05 | — |
| **S-02** | Percentil de medición de las latencias comprometidas | **p95**, reportando también p50 y p99 | Un promedio esconde la cola larga, que es la que arruina la experiencia | 14 | — |
| **S-03** | Margen de vigencia del caché de reglas del Edge (KPI-31) | **24 h**, configurable | Alineado con KPI-30 (autonomía de 24 h). Superado el margen, el evento se marca como decidido con reglas potencialmente obsoletas | 12 | P-05 |
| **S-04** | Plazo de respuesta del visitante al consentimiento (CU-02 3a) | **24 h o el inicio de la vigencia, lo que ocurra primero** | Vencido el plazo, la autorización queda vigente **solo por placa**, sin acceso facial: se deniega la vía biométrica, no se concede | 08 | P-03 |
| **S-05** | Umbral de confianza de lectura de placa (CU-01 3a) | **0,85**, configurable por copropiedad | Por debajo, **no se decide automáticamente**: se envía a validación humana. La duda nunca abre | 05 · 15 | P-02 |
| **S-06** | Umbral de latido para marcar un dispositivo caído (CA-26) | **3 latidos perdidos o 5 minutos**, configurable por tipo | Marcar caído de más es molesto; marcar de menos oculta un equipo muerto. Tres latidos absorbe una pérdida aislada sin ocultar una caída real | 06 | P-06 |
| **S-07** | Definición de «acceso dudoso» como evento crítico (RN-18) | `ResultadoAcceso` igual a **`CONFIANZA_INSUFICIENTE` o `PLACA_DESCONOCIDA`** | Ambos escalan. Escalar de más satura al operador; escalar de menos deja pasar el caso que RN-18 quiere atrapar. Estos dos son los únicos resultados que denotan incertidumbre, no violación de regla | 06 | P-07 |

---

## 3. Decisiones pendientes de definición · 11 registradas

Ninguna bloquea la ETAPA 01. Cada una tiene comportamiento conservador vigente hasta que el usuario decida.

| ID | Decisión pendiente | Comportamiento conservador vigente | Bloquea a partir de | Quién decide |
|---|---|---|---|---|
| **P-01** | Firma de los documentos de cesión de derechos patrimoniales, confidencialidad y seguridad de la información (PDF del reto §8) | El desarrollo continúa; el repositorio, las cuentas y las llaves se crean bajo control de **Grupo Control** desde el inicio | *(no bloquea técnicamente; es condición contractual previa según el PDF)* | Grupo Control · asesoría jurídica |
| **P-02** | Umbral de confianza de lectura de placa | `[SUPUESTO]` S-05 = **0,85**. Por debajo: validación humana, nunca apertura automática | ETAPA 15 (calibración con la cámara real) | Grupo Control · área técnica |
| **P-03** | Plazo de respuesta al consentimiento del visitante | `[SUPUESTO]` S-04 = **24 h o inicio de vigencia** | ETAPA 08 | Grupo Control · asesoría jurídica |
| **P-04** | Política horaria de reinicio del contador de aforo ante salida no registrada (CU-05 6a) | Reinicio a cero al **cierre del horario** de la zona, con evento de auditoría y alerta si el conteo descartado era distinto de cero | ETAPA 07 | Administrador de la copropiedad piloto |
| **P-05** | Margen de vigencia del caché de reglas | `[SUPUESTO]` S-03 = **24 h** | ETAPA 12 | Grupo Control |
| **P-06** | Umbral de latido de dispositivo | `[SUPUESTO]` S-06 = **3 latidos o 5 min** | ETAPA 06 | Área técnica |
| **P-07** | Qué constituye un «acceso dudoso» (RN-18) | `[SUPUESTO]` S-07 = `CONFIANZA_INSUFICIENTE` o `PLACA_DESCONOCIDA` | ETAPA 06 | Grupo Control |
| **P-08** | Plataforma de despliegue de la API | Ninguno. La decisión no afecta al código si se respeta la frontera hexagonal | ETAPA 14 | Grupo Control |
| **P-09** | ¿Existe compuerta de aprobación administrativa de autorizaciones? (C-03) | **No se construye.** El residente autoriza y la autorización nace vigente; el administrador puede revocar | ETAPA 05 | Grupo Control |
| **P-10** | ¿Se quieren reservas de zonas con franja horaria y sin cobro? (C-04) | **No se construyen.** Solo «solicitar acceso» (HU-19) | ETAPA 07 | Grupo Control |
| **P-11** | «Nivel de acceso» por residente («Acceso Completo» / «Solo Ingreso», mockup M-2) | `Residente.nivelAcceso` con valor por defecto **el más restrictivo**; solo el titular de la vivienda crea autorizaciones (RN-05) | ETAPA 04 | Grupo Control |

---

## 4. Resumen

| Categoría | Cantidad | Estado |
|---|---|---|
| `[CONTRADICCIÓN]` | **14** | **14 resueltas**, ninguna abierta |
| `[SUPUESTO]` | **7** | Todos con valor conservador y configurable |
| `PENDIENTE DE DEFINICIÓN` | **11** | Todos con comportamiento conservador vigente; **ninguno bloquea la ETAPA 01** |

**Contradicciones por severidad:** **5 altas** (C-01, C-02, C-03, C-05, C-12) · **4 medias** (C-04, C-06, C-07, C-22) · **5 bajas** (C-11, C-14, C-15, C-23, C-26). Total 14.

**Contradicción con mayor impacto en el código:** **C-02**. Es la única que cambia el modelo de dominio, y sin resolverla cinco reglas de negocio no tendrían agregado que las sostuviera.

**Contradicción con mayor impacto en el producto:** **C-03**. Determina si el residente autoriza de verdad o solo solicita, y con ello si OE-02 se cumple o queda en enunciado.
