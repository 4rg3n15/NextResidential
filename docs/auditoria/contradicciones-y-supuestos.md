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

## 1. Contradicciones · 22 registradas, 22 resueltas

### C-01 · Protocolo del intercom — **Alta**

|                |                                                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fuente A**   | Requisitos §13.2, tabla «Stack sugerido», fila _Intercom_: _«SIP hacia el videoportero, con puente WebRTC (LiveKit o Janus)»_. §13.4 lo declara el mayor riesgo de cronograma |
| **Fuente B**   | Diagrama arquitectónico, caja «Puente de intercom»: _«ISAPI TwoWayAudio, o SIP con Asterisk si el modelo no lo soporta»_ — deja ambas rutas abiertas                          |
| **Fuente C**   | `CLAUDE.md` ADR-01: ISAPI TwoWayAudio, decisión expresa del cliente                                                                                                           |
| **Resolución** | Prevalece **ISAPI TwoWayAudio**                                                                                                                                               |

**Justificación.** La decisión del cliente es posterior a la redacción del documento. Además, §13 se declara a sí misma ajena al estándar de especificación (_«Esta sección no forma parte del estándar de especificación de requisitos…»_), y la propuesta SIP **no tiene criterio de verificación asociado**: ningún OE, RN, HU, CU ni CA exige SIP. Los compromisos reales —KPI-32, KPI-33, CA-19, CA-20— son de latencia y trazabilidad, agnósticos al protocolo. El diagrama no contradice la decisión: la contiene como primera opción.

**Obligaciones derivadas.** Toda referencia a SIP, Asterisk, LiveKit o Janus queda **fuera del alcance de implementación**: no se construye, no se deja andamiaje, no se menciona en el código. SIP sobrevive únicamente como contingencia documentada, realizable como adaptador nuevo tras el mismo puerto. El `.docx` original **no se modifica**.
**Formalizada en:** `docs/decisiones/ADR-001-intercom-isapi-twowayaudio.md` · **Afecta a:** ETAPAS 10, 15

---

### C-02 · Número de agregados raíz: seis frente a nueve — **Alta**

|                |                                                                                                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fuente A**   | `CLAUDE.md` §2.2: seis agregados raíz «del diagrama, vinculantes» — `Copropiedad`, `Vivienda`, `Autorización`, `Acceso`, `Consentimiento`, `Zona`. Coincide con la página 1 del diagrama |
| **Fuente B**   | Diagrama, **página 3 «Agregados y objetos de valor»**: nueve, añadiendo `PlantillaBiometrica`, **`ListaNegra` «raíz de agregado»** y **`Dispositivo` «raíz de agregado»**                |
| **Resolución** | Se adoptan **nueve agregados raíz**                                                                                                                                                      |

**Justificación.** No es desacuerdo de criterio: `CLAUDE.md` declara que su lista proviene del diagrama, y la vista del diagrama dedicada precisamente a los agregados declara tres más. La lista del contrato es un resumen de la página 1, no el inventario completo. **Y el hueco tiene consecuencia funcional:** sin `ListaNegra` y sin `Dispositivo`, cinco reglas se quedan sin invariante que las sostenga —RN-06, RN-07, RN-12, RN-21— y CA-26 no tiene dónde vivir. `PolíticaListaNegra` _aplica_ la lista; no gobierna quién puede crearla ni levantarla, que es una invariante de agregado (RN-07).

**Acción.** Se propone al usuario la corrección de `CLAUDE.md` §2.2. Entretanto se construye con nueve y se documenta. Se añaden además los puertos faltantes: `ListaNegraRepo`, `DispositivoRepo`, `ConsentimientoRepo`, `PlantillaRepo`.
**Detalle en:** `02-arquitectura.md` §2 · **Afecta a:** ETAPAS 01, 05, 06, 08

---

### C-03 · Aprobación administrativa de autorizaciones — **Alta**

|                |                                                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Fuente A**   | OE-02: la autorización del residente _«se propague al motor de reglas **sin intervención de portería**»_. KPI-06 exige ≥ 95 % de ingresos autónomos. PB-01 identifica la dependencia de un tercero como el problema a eliminar |
| **Fuente B**   | Mockup W-05: ciclo `Pendiente → Aprobada / Denegada` con botones **Aprobar** y **Rechazar** operados por el administrador                                                                                                      |
| **Resolución** | **No se construye compuerta de aprobación**                                                                                                                                                                                    |

**Justificación.** Jerarquía Requisitos > Mockups. Ninguna HU, RN, CU ni CA menciona una aprobación administrativa. Y una compuerta humana hace **inalcanzable** KPI-06 cuando el administrador no está disponible —reintroduciendo exactamente PB-01, el problema que el proyecto viene a resolver—.

**Reinterpretación de la pantalla.** Los distintivos pasan a representar el ciclo de vida real de `Autorizacion`: **Vigente · Programada · Expirada · Revocada**. Los botones se sustituyen por **Revocar** (RN-10) y **Ver detalle**.
**Deriva en:** `PENDIENTE DE DEFINICIÓN` **P-09** · **Afecta a:** ETAPAS 05, 09, 11

---

### C-04 · Reservas de zonas comunes — **Media**

|                |                                                                                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Fuente A**   | Alcance **excluido**: _«Reservas de zonas comunes con cobro o pago en línea»_. Alcance **incluido**: _«Zonas comunes con horario, aforo y reglas configurables»_ — sin mencionar reservas. HU-18, HU-19 y HU-20 no hablan de agendar |
| **Fuente B**   | Mockup W-06 «Reservas de Hoy» con estados Confirmada/Pendiente; mockup M-5 «Mis Reservas Activas» y botón «Solicitar Acceso»                                                                                                         |
| **Resolución** | Las **reservas no se construyen**. Se implementa **solicitud de acceso a zona** (HU-19)                                                                                                                                              |

**Justificación.** El alcance excluye reservas _con cobro_; el alcance incluido no menciona reservas _sin cobro_. Ante el silencio, manda lo que sí tiene HU: HU-19 pide _autorizar acceso_, no agendar franja. Construir una agenda con confirmación sería ampliar el alcance por iniciativa propia.
**Deriva en:** `PENDIENTE DE DEFINICIÓN` **P-10** · **Afecta a:** ETAPAS 07, 09, 11

---

### C-05 · Selector de rol en el login — **Alta**

|                |                                                                                                                                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fuente A**   | RN-15 y la ETAPA 03: rol y `copropiedad_id` provienen de los _custom claims_ del JWT. RN-20 y CA-25 exigen MFA para roles administrativos. Requisitos §12 lista _«Login **y selección de copropiedad**»_. El sistema tiene **6 roles** |
| **Fuente B**   | Mockup W-01: chips «TIPO DE USUARIO» con **3 roles elegibles por el usuario**, sin paso MFA y sin selector de copropiedad                                                                                                              |
| **Resolución** | **El selector se elimina.** Login único; el rol se deriva del token                                                                                                                                                                    |

**Justificación.** Dos problemas independientes. Primero, **el rol no se elige, se deriva**: un selector en el cliente sugiere que la elección influye en los permisos y crea superficie de confusión sin aportar nada. Segundo, faltan tres roles (Superadministrador, Operador de central, Servicio/Integración) y dos pasos obligatorios.

**Se añaden:** paso de **segundo factor TOTP** para roles administrativos (RN-20, CA-25) y **selector de copropiedad posterior a la autenticación** cuando el token habilita más de una —caso del Operador de central, HU-25, KPI-35—.
**Afecta a:** ETAPAS 03, 09

---

### C-06 · Acompañantes: contador frente a lista nominal — **Media**

|                |                                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fuente A**   | HU-09: _«registrar acompañantes»_. Diagrama pág. 3: `acompanantes: Acompanante[]` — colección de entidades con identidad. RN-02 exige que el evento registre el actor |
| **Fuente B**   | Mockup M-4: control «Número de acompañantes» con contador `−` / `+`                                                                                                   |
| **Resolución** | **Lista nominal** con nombre y documento por acompañante                                                                                                              |

**Justificación.** Un contador no permite auditar quién entró, y RN-02 exige actor en el evento. El contador se conserva como **atajo de interfaz** que despliega N filas. Coherente con CU-01, donde los acompañantes entran en el mismo vehículo pero cada persona genera su propio registro de acceso.
**Afecta a:** ETAPAS 05, 11

---

### C-07 · KPI-12: meta frente a fuente de medición — **Media**

|                |                                                                                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fuente A**   | KPI-12, **meta**: _«Suite completa verde con adaptadores simulados»_                                                                                                   |
| **Fuente B**   | KPI-12, **fuente de medición**: _«Ejecución en CI con otros dispositivos de otro proveedor»_. El alcance excluido prohíbe implementar adaptadores de otros fabricantes |
| **Resolución** | Manda la **meta**. La fuente correcta es la ejecución de la suite completa contra `MockProvider`, sin hardware                                                         |

**Justificación.** La fuente de medición se contradice con el propio alcance del proyecto. **`MockProvider` _es_ el «otro proveedor»** que demuestra la sustituibilidad: dos implementaciones del mismo puerto, la suite verde con ambas, sin cambiar una aserción. Eso es el principio de sustitución de Liskov, que es lo que KPI-12 pretende medir.
**Afecta a:** ETAPAS 05, 14

---

### C-11 · Direcciones IP de dispositivo visibles en el navegador — **Baja**

|                |                                                                                                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fuente A**   | RN-21: _«Las credenciales y secretos de dispositivos nunca se exponen al frontend ni a la aplicación móvil»_. KPI-11: cero referencias a IP de dispositivo fuera de la capa de proveedor |
| **Fuente B**   | Mockup W-07: cada tarjeta de dispositivo muestra su IP (`192.168.1.101`…)                                                                                                                |
| **Resolución** | Se mantiene la visibilidad, **restringida por rol**                                                                                                                                      |

**Justificación, en tres partes.** (1) **KPI-11 no se incumple**: se refiere a referencias _en código fuente_; una IP leída de la base y renderizada no lo es, y el análisis estático seguirá dando cero. (2) **RN-21 no se incumple**: una IP no es una credencial; `credencialRef` **nunca** viaja al navegador, ni enmascarada. (3) **Pero es endurecimiento razonable**: la IP se muestra solo a Administrador y Superadministrador, nunca a Portero ni a Operador de central, y nunca en logs ni en mensajes de error.
**Afecta a:** ETAPAS 09, 13

---

### C-12 · La consola operativa omite cuatro exigencias verificables — **Alta**

|                |                                                                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fuente A**   | RN-08 y CA-16: sin motivo escrito, la apertura **no se ejecuta**. HU-25 y KPI-35: multiproyecto. HU-26, CA-19 y ADR-01: intercom con audio. CU-03 alterno 3a: cola con tiempo de espera |
| **Fuente B**   | Mockup W-09: una sola consola, con vídeo pero sin audio, sin conmutador de copropiedad, sin cola y con **ABRIR/DENEGAR que actúan directamente, sin pedir motivo**                      |
| **Resolución** | El mockup es base visual, no especificación completa. Se **separan dos superficies** y se añaden los cuatro elementos                                                                   |

**Justificación.** Tal como está dibujada, la consola **incumple un criterio de aceptación** (CA-16) y hace indemostrable un indicador (KPI-35). Además fusiona dos roles con permisos y contexto distintos: el Portero es presencial y de una sola copropiedad; el Operador de central es remoto y multiproyecto. `W-09a` (Portería) y `W-09b` (Guardia virtual) se construyen por separado en la ETAPA 10, esta última con exclusividad de canal, cola y conmutador.
**Afecta a:** ETAPA 10

---

### C-14 · Tres denominaciones de marca — **Baja**

|                |                                                                                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Fuentes**    | «NextResidential» (login del mockup) · «Next Control · RESIDENCIAL» (barra lateral) · «Next Control Residencial» (documentos) · «Nex Control Residential» (cabecera del `.docx`) · pie «© 2025 Next Control» y «Versión 4.2.1-Prod» |
| **Resolución** | El producto se denomina **Next Control Residencial**. El repositorio conserva `NextResidential`                                                                                                                                      |

El bloque de marca de la interfaz muestra «Next Control» con «RESIDENCIAL» como descriptor secundario. El número de versión se toma del `package.json` en tiempo de construcción; la versión ficticia «4.2.1-Prod» no llega al entregable.
**Afecta a:** ETAPAS 09, 11, 16

---

### C-15 · Plataforma de despliegue de la API — **Baja**

|                |                                                                                         |
| -------------- | --------------------------------------------------------------------------------------- |
| **Fuente A**   | Requisitos §13.2: _«Railway o Fly.io — continuidad con la infraestructura que ya usas»_ |
| **Fuente B**   | `CLAUDE.md` §2.6 fija el stack completo y **no menciona plataforma de despliegue**      |
| **Resolución** | **`PENDIENTE DE DEFINICIÓN` P-08.** No bloquea ninguna etapa hasta la 14                |

Requisito no negociable sea cual sea la elección: la cuenta debe ser **corporativa de Grupo Control**, nunca personal (PDF del reto §8).
**Afecta a:** ETAPA 14

---

### C-22 · KPI-01 frente a RN-13 — **Media**

|                |                                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Fuente A**   | KPI-01: _«0 residentes sin vivienda activa»_                                                                           |
| **Fuente B**   | RN-13: una vivienda puede quedar **inactiva** conservando sus autorizaciones vigentes. RN-19 prohíbe el borrado físico |
| **Resolución** | KPI-01 se lee como indicador de **integridad referencial**: _«0 residentes **activos** sin vivienda asociada»_         |

**Justificación.** Tal como está redactado, desactivar una vivienda con residentes incumpliría KPI-01 **por diseño** —el propio RN-13 lo provocaría—. La intención del indicador, evidente por su nombre («Integridad referencial») y por su fuente de medición («Consulta de huérfanos»), es detectar **huérfanos**: residentes cuyo `vivienda_id` no resuelve. La desactivación propaga el estado; no rompe la referencia.
**Afecta a:** ETAPAS 01, 04

---

### C-23 · Superficie del residente: móvil o PWA — **Baja**

|                |                                                                                       |
| -------------- | ------------------------------------------------------------------------------------- |
| **Fuente A**   | PDF del reto §1: _«Aplicación móvil o PWA muy sencilla»_                              |
| **Fuente B**   | Requisitos: **Flutter (iOS y Android)**, confirmado en el alcance incluido y en §13.3 |
| **Resolución** | **Ambas cosas.** Flutter para el residente; PWA instalable para las consolas web      |

No es contradicción sino precisión progresiva: el reto abre la opción, los requisitos la cierran. `CLAUDE.md` §2.6 confirma las dos superficies.
**Afecta a:** ETAPAS 09, 11, 14

---

### C-26 · Tres perfiles frente a seis roles — **Baja**

|                |                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------- |
| **Fuente A**   | PDF del reto §1: 3 perfiles (Administrador, Portero/Seguridad, Propietario/Residente)        |
| **Fuente B**   | Requisitos §5: 6 roles (añade Superadministrador, Operador de central, Servicio/Integración) |
| **Resolución** | **Se construyen los 6 roles**, agrupados en las 3 superficies de producto                    |

**Justificación.** Granularidad distinta, no conflicto. Los 3 perfiles son las tres _superficies_ (administración, operación, residente); los 6 roles son el modelo de autorización. El Operador de central lo introduce el propio PDF en su §4; el Superadministrador es lo que hace posible el multiempresa que el PDF exige; Servicio/Integración es una identidad no humana necesaria para el Edge.
**Afecta a:** ETAPAS 03, 09, 10

---

### C-27 · Qué nueve agregados raíz son los nueve — **Media** · registrada en la ETAPA 14

|                |                                                                                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fuente A**   | `README.md` §3, hasta la ETAPA 14: nueve, **con `Persona` y sin `PlantillaBiometrica`**, y `Consentimiento` en vez de `ConsentimientoBiometrico`                                       |
| **Fuente B**   | `CLAUDE.md` §2.2 y `02-arquitectura.md` §2.1: nueve, **con `PlantillaBiometrica` y sin `Persona`**                                                                                     |
| **Fuente C**   | El código: `packages/domain-core/src/padron/persona.ts` **y** `packages/domain-core/src/biometria/plantilla.ts` existen los dos, que es lo que hacía parecer que fueran diez           |
| **Resolución** | **Nueve, los de la fuente B.** `Persona` **no es agregado raíz**: `persona.ts` no declara ninguno. La lista del README estaba mal y se corrigió; C-02 no se reabre y no hay una décima |

**Cómo se resolvió, que es lo que importa: contrastando contra el código, no eligiendo entre dos documentos.**

`padron/persona.ts` no contiene ningún agregado. Lo que exporta son **dos objetos de valor** —`Documento` y `NombreDePersona`— más el catálogo `TIPOS_DE_DOCUMENTO`; su propia cabecera lo dice en la primera línea («objetos de valor `Documento` y `NombreDePersona`») y explica por qué existen: normalizar el documento para que el índice único `(copropiedad, tipo, número)` alcance a la misma persona se presente como visitante, acompañante o residente (RN-06). No tiene métodos de intención, no tiene estado, no tiene frontera de consistencia. No es raíz de nada.

`biometria/plantilla.ts` sí lo es, y lo dice con esas palabras: «Agregado raíz `PlantillaBiometrica` — RN-09, RN-11 · CA-09, CA-10, CA-11». Tiene estado (`ESTADOS_PLANTILLA`), métodos de intención (`sincronizar`, `programarSupresion`, `suprimir`) e invariante propia (no sincroniza sin consentimiento vigente; supresión antes de 24 h).

Y el modelo de datos ya lo había zanjado sin que nadie lo cruzara con el README: [`modelo-datos.md`](../arquitectura/modelo-datos.md) dedica una sección por agregado —§2.1 a §2.9, nueve— y clasifica `personas` en **§2.10 «Tablas que no son agregado»**, con la nota «Entidad de identidad compartida · ver D-01». `PlantillaBiometrica` tiene la suya, §2.6.

**Por qué `Persona` se coló.** D-01 introdujo `personas` como entidad de identidad compartida en la ETAPA 01 porque sin ella RN-06 es inaplicable, y D-72 la llevó a la interfaz en la ETAPA 09. Es una pieza visible y muy citada; al redactar el README se la ascendió a raíz por peso aparente, y a cambio cayó la que menos se nombra. Es un error de redacción de un documento derivado, no una decisión de diseño que nadie tomara: **ninguna fuente declaró jamás diez**, y el dominio no implementa diez.

**Qué NO es esto.** No es la reapertura de C-02. C-02 fijó **nueve** frente a los seis que resumía el contrato, y esos nueve siguen siendo estos nueve, con los mismos nombres. Si hubieran sido diez habría que declararlo aquí y cambiar `modelo-datos.md` §2; no lo son.

**Remedio aplicado (ETAPA 14):** corregida la lista de `README.md` §3 —entra `PlantillaBiometrica`, sale `Persona`, y `Consentimiento` pasa a `ConsentimientoBiometrico`, que es el nombre del agregado en el código y en el diagrama— con una nota al pie que remite a esta entrada. El README es el único documento que estaba mal; `CLAUDE.md`, `02-arquitectura.md` y `modelo-datos.md` no se tocan porque coincidían entre sí y con el código.

**Riesgo residual declarado:** nada comprueba por máquina que la lista del README siga coincidiendo con los agregados del dominio. Queda anotado como deuda **D-119** para la ETAPA 16, que es la dueña de la consolidación documental; el control natural es derivar la lista de las cabeceras «Agregado raíz» de `packages/domain-core/src/**` y compararla con la del README, igual que `coherencia-estado-etapas.mjs` hace con `ESTADO_ETAPAS.md`.

**Afecta a:** ETAPAS 00, 01, 14, 16

---

### C-16 · El modo de control se llama de dos formas en el mismo documento — **Alta** · registrada en la ETAPA 15-C

|                |                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Fuente A**   | El capítulo de control de barrera de entrada y salida, que nombra el campo **`ctrlMod`** en la ruta con formato JSON                      |
| **Fuente B**   | El capítulo de referencia de la API, cuyo esquema XML del documento de parámetros de entrada declara **`<ctrlMode>`**, con «e»            |
| **Resolución** | **Al LEER se aceptan las dos. Al ESCRIBIR se usa la del esquema (`ctrlMode`)**, que es la que el equipo valida cuando recibe el documento |

**Por qué esto era grave y no cosmético.** El lector de la ETAPA 15-B buscaba
sólo `ctrlMod`. Contra el documento real del equipo la expresión **no casaba
nunca**, así que devolvía «no declarado» y el veredicto rechazaba el equipo por
«no declaró quién controla la barrera».

Falla cerrado, que es lo correcto, y por eso el efecto era el peor posible de un
fallo correcto: **una cámara BIEN configurada se rechazaba**, y el mensaje
mandaba al operador a revisar justo el campo que estaba bien. Un fallo abierto
se descubre; uno cerrado que acusa al sitio equivocado se convierte en «esta
integración no funciona».

**Dónde vive:** `packages/providers/src/camara/modo-de-control.ts` ·
`veredicto-de-control.test.ts` lo prueba con un cuerpo real de cada grafía.

**Afecta a:** ETAPAS 15, 15-B, 15-C

---

### C-17 · La región del canal se enumera de dos formas en el mismo capítulo — **Media** · registrada en la ETAPA 15-C

|                |                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Fuente A**   | La descripción del documento básico del canal: `AFandAM`, `APAC`, `All`, `ER`, `EU`, `EUandCIS`, `HKandMO`, `ME`, `THAandLA`, `other` |
| **Fuente B**   | Las capacidades del mismo documento, unas páginas después: `opt="default,EU,CIS,EU_CIS,ME"`                                           |
| **Resolución** | **NUNCA se envía una región fija.** Se lee el documento del equipo y se devuelve **la que vino**, intacta                             |

**Por qué no se elige una de las dos.** Porque no hace falta, y elegir sería
apostar. El `PUT` exige el documento básico completo, así que el flujo obligado
es leer-modificar-escribir: se cambia el índice de país y **todo lo demás sale
tal como entró**. Con eso, cuál de las dos enumeraciones implemente ESE firmware
deja de importar — y si un día importara, el equipo lo diría rechazando su
propio valor, que es un error muy fácil de leer.

Elegir la lista B «porque es la de las capacidades» habría escrito `default` en
un equipo que espera `other`, y el rechazo no nombraría el campo.

**Dónde vive:** `packages/providers/src/camara/pais-del-algoritmo.ts`
(`conPaisCorregido` conserva la región) · prueba en
`configuracion-de-la-camara.test.ts`.

**Afecta a:** ETAPA 15-C

---

### C-18 · Qué debe contestar el receptor al equipo — **Media** · registrada en la ETAPA 15-C

|                |                                                                                                                  |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Fuente A**   | El capítulo del servicio de escucha: exige `Content-Length: 0` y **recomienda `Connection: keep-alive`**         |
| **Fuente B**   | Los ejemplos del capítulo ANPR y del servidor de alarma: `200 OK` con **`Connection: close`**, sin exigir cuerpo |
| **Resolución** | **Se sigue la fuente B**, por ser la del capítulo de la familia de equipo que esta cámara es                     |

**Y la salida está escrita al lado del código, no sólo aquí.** Si en sitio la
cámara reenvía **pese a recibir `200`**, la primera prueba es devolver cuerpo
vacío con `Content-Length: 0`. Quien esté delante del equipo tiene que
encontrarlo sin buscar en un informe, y por eso vive en el comentario de
`RESPUESTA_AL_EQUIPO`.

**Qué NO se cambia mientras tanto:** el `200 OK` siempre —incluso ante un sobre
ilegible—, porque un `400` no le dice al equipo «esto está mal» sino «no te he
recibido», y lo reenvía en bucle.

**Dónde vive:** `apps/api/src/alarmserver/presentacion/alarm-server.controller.ts`.

**Afecta a:** ETAPAS 15, 15-C

---

### C-28 · «El cliente nunca conoce la IP de un equipo» frente a la dirección que el tablero mostraba a los administradores — **Alta** · registrada en la ETAPA 15-D

|                |                                                                                                                                                                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fuente A**   | Enunciado de la 15-D §7.1: «el cliente NUNCA necesita conocer la IP privada de un equipo. Direcciones, credenciales y detalles de red […] jamás forman parte del contrato público»                                                                    |
| **Fuente B**   | C-11 (ETAPA 09) y el mockup W-07: la dirección es «dato de inventario, no secreto» y se muestra a los roles administrativos; `EquipoDto` y `DispositivoDelTableroDto` la llevaban                                                                     |
| **Resolución** | **Manda la fuente A.** C-28 revoca C-11: ningún DTO lleva `host`, `puerto`, `protocolo` ni `usuario` para ningún rol; la edición pasa a ser parcial y lo que no viene se conserva en el servidor (§6.1). El mockup se atiende en lo que no expone red |

**Por qué es alta.** Una dirección privada en una respuesta HTTP es una dirección en la caché del navegador, en el registro del proxy y en cualquier captura de pantalla adjuntada a un correo. La VLAN de equipos —el endurecimiento real de H-15-1— pierde sentido si su plano sale por la API.

**Remedio aplicado (15-D):** `apps/api/src/equipos/presentacion/dtos.ts` (`EquipoDto` sin red; `EdicionDeEquipoDto` parcial), `tablero/presentacion` (sin `host` ni `puerto`), detalle de sondeo con el host **elidido**, consola sin la columna «Dirección». Pruebas: `equipos.e2e.test.ts` («ninguna respuesta lleva dirección…») y `tablero.e2e.test.ts` («NI el rol administrativo…»).

**Afecta a:** ETAPAS 09, 15-B, 15-D, 16

---

### C-29 · Una clave ajena hacia `evidencias` frente a ADR-005 — **Media** · registrada en la ETAPA 15-D

|                |                                                                                                                                                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fuente A**   | Migración 0034 en su primera redacción: `autorizaciones.evidencia_foto_id` con `FOREIGN KEY … REFERENCES evidencias`                                                                                                                               |
| **Fuente B**   | ADR-005 y migración 0017: `evidencias` es append-only con `UPDATE` revocado **incluso al dueño**; una clave ajena toma `FOR KEY SHARE`, que exige ese privilegio. La 0021 ya lo había corregido en `alertas` y `consentimientos_biometricos`       |
| **Resolución** | **Manda ADR-005.** La referencia va por disparador `tg_autorizacion_foto_existe` (misma forma que `tg_consentimiento_evidencia_existe`), y la comprobación general de la 0021 —«ninguna clave ajena apunta a una append-only»— sigue siendo cierta |

**Cómo se vio:** la primera prueba contra base de la fotografía del visitante falló con `permission denied for table evidencias` en un `INSERT` que sí estaba permitido: el permiso que faltaba era el del bloqueo de la FK. Es la tercera vez que el mismo patrón aparece (alertas, consentimientos, autorizaciones): merece un control que lo detecte antes de escribir la migración, y queda anotado como deuda (D-133).

**Afecta a:** ETAPAS 01, 06, 08, 15-D

---

### C-30 · El barril mínimo de `@ncr/providers` frente al guion de puesta en marcha — **Media** · registrada en la ETAPA 15-D

|                |                                                                                                                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fuente A**   | 15-C y 15-D (O2): el barril es la API pública para la aplicación y NO expone catálogo de rutas, cliente ni jueces del fabricante (KPI-11)                                                                                                                     |
| **Fuente B**   | `scripts/puesta-en-marcha-equipos.mjs` importaba `RUTAS`, `ClienteDeEquipo`, `juzgarModo`… del barril, y la guía §8.1 lo presentaba como «un solo comando antes de tocar nada»                                                                                |
| **Resolución** | **Las dos tienen razón y no se tocan mutuamente**: el guion es el único consumidor legítimo del catálogo, y recibe una **entrada de operación propia** (`@ncr/providers/operacion`, `dist/operacion.js`) que la aplicación no importa. El barril sigue mínimo |

**Cómo se vio:** el guion llevaba **roto desde `ea69d9a` (15-C)**: destructuraba símbolos que ya no existían y habría fallado en el primer `new ClienteDeEquipo` delante del equipo. Nada lo ejecutaba en CI. Registrado como D-132; ahora tiene modo `--simulado` y se ejecuta como evidencia de la etapa.

**Afecta a:** ETAPAS 15, 15-C, 15-D

---

### C-31 · RN-05 y la autorización creada desde la consola — **Alta** · registrada en la ETAPA 15-D

|                |                                                                                                                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fuente A**   | RN-05 y el disparador `tg_autorizacion_coherente` (0013): `autorizado_por` es un residente titular activo de la vivienda destino                                                                                                  |
| **Fuente B**   | HU-07/HU-16 y la consola de administración y portería (09-B): un usuario administrador o portero crea autorizaciones, y el adaptador escribía SU identificador en `autorizado_por`                                                |
| **Resolución** | **Manda RN-05 en la base.** El adaptador registra la autorización a nombre del **titular** de la vivienda y conserva al actor en `creado_por` (ADR-020, `[SUPUESTO]` S-38). Sin titular, error tipado; no se relaja el disparador |

**Por qué es alta.** Desde la 09-B **ninguna autorización creada desde la consola llegaba a existir contra una base real** (D-131): las pruebas con dobles no tienen el disparador y el falso verde duró cinco rondas. Se destapó con la primera prueba contra base de la 15-D.

**Afecta a:** ETAPAS 05, 09-B, 15-D · **pendiente de ratificación del cliente** (S-38)

---

## 2. Supuestos · 24 registrados

Cada supuesto se marca `[SUPUESTO]` en el código donde se materialice, y todos son **configurables**, no constantes escondidas.

| ID                      | Supuesto                                                                                                                                                                                  | Valor adoptado                                                                                                                                                                                                                             | Por qué es el conservador                                                                                                                                                                                                                                                                                                            | Etapa                                                                                                                                                                                                                                          | Resuelve                                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **S-01**                | «Estado administrativo» como entrada del motor de reglas (PDF del reto §3) coexistiendo con la exclusión de facturación                                                                   | `Vivienda.estadoAdministrativo` es un **campo alimentado externamente**; Next Control lo **lee**, no lo **calcula**                                                                                                                        | Ignorar la dimensión rompería el motor que el PDF pide; construir cartera excedería el alcance. Leer sin calcular respeta ambos                                                                                                                                                                                                      | 04 · 05                                                                                                                                                                                                                                        | —                                                                                                                                                 |
| **S-02**                | Percentil de medición de las latencias comprometidas                                                                                                                                      | **p95**, reportando también p50 y p99                                                                                                                                                                                                      | Un promedio esconde la cola larga, que es la que arruina la experiencia                                                                                                                                                                                                                                                              | 14                                                                                                                                                                                                                                             | —                                                                                                                                                 |
| **S-03**                | Margen de vigencia del caché de reglas del Edge (KPI-31)                                                                                                                                  | **24 h**, configurable                                                                                                                                                                                                                     | Alineado con KPI-30 (autonomía de 24 h). Superado el margen, el evento se marca como decidido con reglas potencialmente obsoletas                                                                                                                                                                                                    | 12                                                                                                                                                                                                                                             | P-05                                                                                                                                              |
| **S-04**                | Plazo de respuesta del visitante al consentimiento (CU-02 3a)                                                                                                                             | **24 h o el inicio de la vigencia, lo que ocurra primero**                                                                                                                                                                                 | Vencido el plazo, la autorización queda vigente **solo por placa**, sin acceso facial: se deniega la vía biométrica, no se concede                                                                                                                                                                                                   | 08                                                                                                                                                                                                                                             | P-03                                                                                                                                              |
| **S-05**                | Umbral de confianza de lectura de placa (CU-01 3a)                                                                                                                                        | **0,85**, configurable por copropiedad                                                                                                                                                                                                     | Por debajo, **no se decide automáticamente**: se envía a validación humana. La duda nunca abre                                                                                                                                                                                                                                       | 05 · 15                                                                                                                                                                                                                                        | P-02                                                                                                                                              |
| **S-06**                | Umbral de latido para marcar un dispositivo caído (CA-26)                                                                                                                                 | **3 latidos perdidos o 5 minutos**, configurable por tipo                                                                                                                                                                                  | Marcar caído de más es molesto; marcar de menos oculta un equipo muerto. Tres latidos absorbe una pérdida aislada sin ocultar una caída real                                                                                                                                                                                         | 06                                                                                                                                                                                                                                             | P-06                                                                                                                                              |
| **S-07**                | Definición de «acceso dudoso» como evento crítico (RN-18)                                                                                                                                 | `ResultadoAcceso` igual a **`CONFIANZA_INSUFICIENTE` o `PLACA_DESCONOCIDA`**                                                                                                                                                               | Ambos escalan. Escalar de más satura al operador; escalar de menos deja pasar el caso que RN-18 quiere atrapar. Estos dos son los únicos resultados que denotan incertidumbre, no violación de regla                                                                                                                                 | 06                                                                                                                                                                                                                                             | P-07                                                                                                                                              |
| **S-08** _(ETAPA 01)_   | Una persona es residente de una sola vivienda activa a la vez                                                                                                                             | Índice único parcial sobre `residentes (copropiedad_id, persona_id) WHERE estado='activo'`                                                                                                                                                 | El documento no lo dice. Permitir dos viviendas haría ambigua la vivienda destino de una autorización, y RN-05 dejaría de ser verificable                                                                                                                                                                                            | 04                                                                                                                                                                                                                                             | —                                                                                                                                                 |
| **S-09** _(ETAPA 01)_   | Los horarios de zona que cruzan medianoche se modelan como dos filas                                                                                                                      | `CHECK (hora_inicio < hora_fin)` + columna `continua_del_dia_anterior`                                                                                                                                                                     | Permitir `hora_fin < hora_inicio` como marca de cruce mete un caso especial en la comparación del motor de reglas. **Precisado por el usuario al aprobar 01-A: el corte de medianoche NO reinicia el contador de aforo** — es artificio de representación, no cierre de jornada. Caso de prueba de límite obligatorio de la ETAPA 07 | 07                                                                                                                                                                                                                                             | **IMPLEMENTADO** (ETAPA 07): `HorarioDeZona.cierraJornada` solo reconoce cierre cuando NO hay franja `continua_del_dia_anterior` al día siguiente |
| **S-25** _(ETAPA 13)_   | En el Supabase gestionado de Grupo Control, el rol de la cadena de conexión es **DUEÑO** de las tablas y **NO superusuario**                                                              | Se reproduce en el clúster local con el rol `sb_postgres_sim`, y `verificar.sh --modo-supabase` lo declara en cada ejecución                                                                                                               | Es la condición que hace efectivos el `REVOKE` al dueño y la RLS forzada de ADR-005: un superusuario las ignora por definición. Si no se cumpliera, la inmutabilidad de `eventos` dependería solo del disparador. La aserción de despliegue lo comprueba la primera vez que las migraciones se apliquen contra el proyecto real      | 13 · 15                                                                                                                                                                                                                                        | **AR-03**, redactada y sin firmar                                                                                                                 |
| **S-26** _(ETAPA 13)_   | Ningún DTO de consulta necesita un campo de tipo **arreglo**                                                                                                                              | Un parámetro de consulta que llega como arreglo u objeto se **rechaza** con 400 (H-13-13)                                                                                                                                                  | Hoy es cierto en los tres DTO de consulta que existen, y la alternativa —colapsar el arreglo a escalar— es el recorte silencioso que H-13-09 acaba de costar. Si un endpoint futuro necesita `?zona=a&zona=b`, hay que relajar la regla **con un DTO que lo declare**, no quitándola                                                 | 13                                                                                                                                                                                                                                             | —                                                                                                                                                 |
| **S-35** _(ETAPA 15-D)_ | El campo con el que la terminal declara si espera el veredicto de la plataforma (`remoteCheck` en su configuración de control de acceso)                                                  | Se lee y se juzga; `desconocida` si no aparece                                                                                                                                                                                             | Hasta capturarlo del equipo real, la ausencia bloquea (no se asume que espere). El guion de puesta en marcha lo confirma o lo desmiente en sitio                                                                                                                                                                                     | 15-D · 15                                                                                                                                                                                                                                      | Con equipos                                                                                                                                       |
| **S-36** _(ETAPA 15-D)_ | Las claves con las que el equipo publica en JSON los eventos de rostro y de llamada (persona, veredicto pendiente, origen de la llamada)                                                  | Se leen con esos nombres y, si faltan, el evento entra como `desconocido`                                                                                                                                                                  | Un evento que no se entiende no abre nada; se registra y se cuenta. Las claves se confirman capturando un evento real                                                                                                                                                                                                                | 15-D · 15                                                                                                                                                                                                                                      | Con equipos                                                                                                                                       |
| **S-37** _(ETAPA 15-D)_ | Qué puede CAMBIAR una autorización viva desde la consola                                                                                                                                  | Fin de vigencia, placa y observaciones; nunca la vivienda ni el visitante                                                                                                                                                                  | Cambiar el destinatario o la vivienda es otra autorización con su propia traza; acortar por debajo de «ahora» es una revocación sin motivo y se rechaza                                                                                                                                                                              | 15-D                                                                                                                                                                                                                                           | —                                                                                                                                                 |
| **S-38** _(ETAPA 15-D)_ | A nombre de quién se registra una autorización creada por administración o portería                                                                                                       | Del residente **titular** activo de la vivienda; `creado_por` conserva al actor. Sin titular, se niega                                                                                                                                     | RN-05 lo exige en la base y el documento no contempla el caso. Negar sin titular es el comportamiento conservador; «a nombre del titular» es la decisión de ADR-020 y **necesita ratificación del cliente**                                                                                                                          | 15-D                                                                                                                                                                                                                                           | **ADR-020**, pendiente de ratificar                                                                                                               |
| **S-39** _(ETAPA 15-E)_ | Forma del cuerpo con que se contesta la verificación remota de la terminal (`PUT /ISAPI/AccessControl/remoteCheck?format=json`, `RemoteCheck{serialNo, checkResult, info}`)               | Se envía así y el catálogo lo declara **no verificado**; la ficha lo marca                                                                                                                                                                 | Si el firmware rechaza la ruta o la forma, la terminal NO abre: al vencer su plazo sin respuesta niega (S-41). El error se registra con la ruta y el propósito, que es lo que hay que corregir en sitio                                                                                                                              | 15-E · 15                                                                                                                                                                                                                                      | Con equipos                                                                                                                                       |
| **S-40** _(ETAPA 15-E)_ | Confianza de un rostro que la terminal ya reconoció                                                                                                                                       | **1,0**: la terminal aplicó su propio umbral y no publica similitud                                                                                                                                                                        | El motor no vuelve a juzgar la similitud que no tiene; lo que decide son consentimiento (RN-09), autorización y lista negra. Si un evento trae `similarity`, se usará en su lugar cuando el equipo real lo confirme                                                                                                                  | 15-E · 15                                                                                                                                                                                                                                      | Con equipos                                                                                                                                       |
| **S-41** _(ETAPA 15-E)_ | Qué hace la terminal en `reporta_y_espera` si la plataforma no responde en su plazo                                                                                                       | **Niega**, y el plazo se lee de su configuración si el firmware lo declara                                                                                                                                                                 | Es la dirección segura y la única compatible con «Next Control decide»: un equipo que abriera por silencio decidiría solo. Se mide en sitio con la hoja de resultados (escenario terminal · sin respuesta)                                                                                                                           | 15-E · 15                                                                                                                                                                                                                                      | Con equipos                                                                                                                                       |
| **S-42** _(ETAPA 15-E)_ | A qué vivienda llama un videoportero que declara `buildingNumber` y `unitNumber`                                                                                                          | `unitNumber` = identificador de la vivienda; `buildingNumber` = agrupación; si no cuadra con agrupación, se busca sin ella                                                                                                                 | Es lo único que el equipo declara y lo único que el padrón tiene. Si no se resuelve, la llamada se AVISA igual con la unidad tal cual y la vivienda en null: una llamada nunca se pierde por un número mal escrito en el aparato. Se confirma en sitio con la hoja de resultados (escenario videoportero · llamada)                  | 15-E · 15                                                                                                                                                                                                                                      | Con equipos                                                                                                                                       |
| **S-43** _(ETAPA 15-E)_ | Quién es «el titular» ante el enlace de consentimiento                                                                                                                                    | Quien tiene el enlace: credencial **al portador**, firmada por copropiedad, para UN consentimiento, con caducidad al plazo P-03                                                                                                            | Es el modelo de un SMS de verificación: la identidad la acredita el canal de entrega, no el sistema. Por eso el enlace no lleva nombre ni dato alguno, por eso queda en bitácora quién lo emitió, y por eso el canal es una decisión de Grupo Control (P-15). Sin canal definido, se entrega en mano y se registra `presencial`      | 15-E                                                                                                                                                                                                                                           | **P-15**                                                                                                                                          |
| **S-44** _(ETAPA 15-E)_ | Identidad que firma lo que escriben los equipos y el enlace del titular                                                                                                                   | `app.actor_de_ingesta()` = `…0003`, creado por la migración 0035; **no** el superadministrador `…0002` del seed                                                                                                                            | Hasta la 15-E `ACTOR_INGESTA` valía `…0002`: en una base con sólo migraciones no existía —la primera escritura de una cámara habría fallado por clave ajena— y en la de demostración firmaba lo de las cámaras con un humano. Una identidad propia, sin login y por migración, es lo único que hace verdadera la auditoría (KPI-05)  | 15-E                                                                                                                                                                                                                                           | —                                                                                                                                                 |
| **S-45** _(ETAPA 15-E)_ | Forma con la que se contesta o cuelga una llamada por señalización (`PUT /ISAPI/VideoIntercom/callSignal`, `CallSignal{cmdType: answer                                                    | hangUp}`)                                                                                                                                                                                                                                  | Se envía SÓLO si el equipo declara `senalizacionDeLlamada` = `si`; el del proyecto declara `no` y la ficha lo marca NO APLICA POR CAPACIDAD                                                                                                                                                                                          | Sin la capacidad no se emite ninguna señal y la llamada la atiende el aparato; el audio y la apertura no dependen de ella. Un rechazo del equipo a la señal no tumba la sesión de audio. La forma se confirma sólo en un modelo que la declare | 15-E · 15                                                                                                                                         | Con equipos |
| **S-46** _(ETAPA 15-E)_ | Forma de la URL RTSP de los equipos Hikvision con video (cámara LPR, terminal facial, videoportero): `rtsp://<usuario>:<clave>@<host>:554/Streaming/Channels/1<01                         | 02>`                                                                                                                                                                                                                                       | Se usa el flujo **secundario** (`102`) por omisión: menor tasa de bits y latencia hacia el navegador; la URL la construye SÓLO `packages/providers` (`hikvision/video-rtsp.ts`) y viaja de la API al puente, nunca al cliente ni a la bitácora                                                                                       | Si un modelo usa otra ruta, cambia una función del proveedor y nada más; el puerto `origenDeVideo` y el uso de caso no la nombran. Un flujo secundario ausente se ve en sitio como «puente no responde» (502) y se corrige pasando a `101`     | 15-E · 15                                                                                                                                         | Con equipos |
| **S-47** _(ETAPA 15-E)_ | API de go2rtc con la que la API registra y negocia: `PUT /api/streams?name&src` (crea o REEMPLAZA la fuente) y `POST /api/webrtc?src` con `application/sdp` (WHEP, respuesta `201`/`200`) | Verificado contra la especificación OpenAPI publicada de go2rtc (`website/api/openapi.yaml`); el adaptador acepta `200` y `201`, exige que la respuesta empiece por `v=0` y redacta cualquier `rtsp://` de los errores antes de exponerlos | Si `PUT` no reemplazara, una credencial rotada dejaría un flujo viejo: se comprueba en sitio rotando la clave de un equipo y volviendo a abrir la vista                                                                                                                                                                              | 15-E · 15                                                                                                                                                                                                                                      | Con equipos                                                                                                                                       |

---

## 3. Decisiones pendientes de definición · 13 registradas

Ninguna bloquea la ETAPA 01. Cada una tiene comportamiento conservador vigente hasta que el usuario decida.

| ID                                       | Decisión pendiente                                                                                                             | Comportamiento conservador vigente                                                                                                                                                                                                                                                                                                                                                                         | Bloquea a partir de                                                       | Quién decide                                                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P-01**                                 | Firma de los documentos de cesión de derechos patrimoniales, confidencialidad y seguridad de la información (PDF del reto §8)  | El desarrollo continúa; el repositorio, las cuentas y las llaves se crean bajo control de **Grupo Control** desde el inicio                                                                                                                                                                                                                                                                                | _(no bloquea técnicamente; es condición contractual previa según el PDF)_ | Grupo Control · asesoría jurídica                                                                                                                                                  |
| **P-02**                                 | Umbral de confianza de lectura de placa                                                                                        | `[SUPUESTO]` S-05 = **0,85**. Por debajo: validación humana, nunca apertura automática                                                                                                                                                                                                                                                                                                                     | ETAPA 15 (calibración con la cámara real)                                 | Grupo Control · área técnica                                                                                                                                                       |
| **P-03**                                 | Plazo de respuesta al consentimiento del visitante                                                                             | `[SUPUESTO]` S-04 = **24 h o inicio de vigencia**                                                                                                                                                                                                                                                                                                                                                          | ETAPA 08                                                                  | Grupo Control · asesoría jurídica                                                                                                                                                  |
| **P-04**                                 | Política horaria de reinicio del contador de aforo ante salida no registrada (CU-05 6a)                                        | Reinicio a cero al **cierre del horario** de la zona, con evento de auditoría y alerta si el conteo descartado era distinto de cero                                                                                                                                                                                                                                                                        | ETAPA 07                                                                  | Administrador de la copropiedad piloto · **RESUELTA en la ETAPA 07:** tres políticas por zona (`cierre_horario` por defecto, `manual`, `nunca`) en `zonas.politica_reinicio_aforo` |
| **P-05**                                 | Margen de vigencia del caché de reglas                                                                                         | `[SUPUESTO]` S-03 = **24 h**                                                                                                                                                                                                                                                                                                                                                                               | ETAPA 12                                                                  | Grupo Control                                                                                                                                                                      |
| **P-06**                                 | Umbral de latido de dispositivo                                                                                                | `[SUPUESTO]` S-06 = **3 latidos o 5 min**                                                                                                                                                                                                                                                                                                                                                                  | ETAPA 06                                                                  | Área técnica                                                                                                                                                                       |
| **P-07**                                 | Qué constituye un «acceso dudoso» (RN-18)                                                                                      | `[SUPUESTO]` S-07 = `CONFIANZA_INSUFICIENTE` o `PLACA_DESCONOCIDA`                                                                                                                                                                                                                                                                                                                                         | ETAPA 06                                                                  | Grupo Control                                                                                                                                                                      |
| **P-08**                                 | Plataforma de despliegue de la API                                                                                             | Ninguno. La decisión no afecta al código si se respeta la frontera hexagonal                                                                                                                                                                                                                                                                                                                               | ETAPA 14                                                                  | Grupo Control                                                                                                                                                                      |
| **P-09**                                 | ¿Existe compuerta de aprobación administrativa de autorizaciones? (C-03)                                                       | **No se construye.** El residente autoriza y la autorización nace vigente; el administrador puede revocar                                                                                                                                                                                                                                                                                                  | ETAPA 05                                                                  | Grupo Control                                                                                                                                                                      |
| **P-10**                                 | ¿Se quieren reservas de zonas con franja horaria y sin cobro? (C-04)                                                           | **No se construyen.** Solo «solicitar acceso» (HU-19)                                                                                                                                                                                                                                                                                                                                                      | ETAPA 07                                                                  | Grupo Control                                                                                                                                                                      |
| ~~**P-12**~~ **RESUELTO** _(2026-09-06)_ | Política de retención de eventos, evidencia y plantillas — abierta en la ETAPA 01-B, no fijada en ningún insumo                | **Eventos 24 meses · evidencia fotográfica 90 días · plantillas ligadas a la vigencia de su autorización.** Implementado como columnas configurables por copropiedad, con `CHECK (margen_supresion_plantilla <= '24 hours')` que mete RN-11 en el esquema como **cota superior**, y el libro append-only `purgas_retencion` que acredita el cumplimiento. **Sujeto a confirmación legal de Grupo Control** | —                                                                         | Resuelto por el usuario · pendiente de visto bueno jurídico                                                                                                                        |
| ~~**P-11**~~ **RESUELTO** _(2026-09-06)_ | «Nivel de acceso» por residente                                                                                                | **Catálogo `niveles_acceso`**, no booleano ni enumerado: arranca con dos valores (`solo_ingreso`, `completo`) y admite más sin migración. Un disparador asigna el de menor `orden` —el más restrictivo— cuando el residente llega sin nivel. Solo el titular crea autorizaciones (RN-05)                                                                                                                   | —                                                                         | Resuelto por el usuario                                                                                                                                                            |
| **P-14** _(ETAPA 13)_                    | ¿Están activados `secret scanning` y `push protection` sobre el repositorio en GitHub?                                         | El escaneo de historial corre en CI en cada integración, que es lo que sí está bajo control del árbol. Con `push protection` activa habría además una barrera **antes** de que el objeto llegue al remoto                                                                                                                                                                                                  | _(ajuste del servidor; no bloquea)_                                       | Grupo Control · quien administre la organización en GitHub                                                                                                                         |
| **P-15** _(ETAPA 15-E)_                  | Canal de entrega del enlace con el que el TITULAR responde su consentimiento (SMS, WhatsApp, correo) y proveedor de mensajería | El sistema **emite** el enlace y lo muestra a quien capturó el rostro (consola o app del residente) para entregarlo en mano; no envía nada por sí mismo. El canal declarado en el consentimiento es el que se usó de verdad. `[SUPUESTO]` S-43                                                                                                                                                             | Producción (no bloquea la prueba en sitio: el usuario hace de visitante)  | Grupo Control · asesoría jurídica (qué canal acredita al titular) · área técnica (proveedor)                                                                                       |

---

## 3 bis. Extensiones al contrato

Cambios a `CLAUDE.md` solicitados por una etapa y **aprobados expresamente por el
cliente**. Se registran aquí porque modifican el contrato de trabajo, no solo el
código.

### E-01 · Décimo motivo tipado `FUERA_DE_HORARIO` — **aprobada el 2026-09-06**

|                      |                                                                                                                                                                                                                                                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Solicitada por**   | ETAPA 01-A, decisión **D-18**                                                                                                                                                                                                                                                                                                                |
| **Qué cambia**       | `CLAUDE.md` §2.4 pasa de nueve motivos enumerados a diez                                                                                                                                                                                                                                                                                     |
| **Por qué**          | CA-15 exige negar con motivo «fuera de horario» y ninguno de los nueve lo expresaba. `ZONA_NO_AUTORIZADA` es la falta de permiso sobre la zona (CU-05 alterno 2a); `AFORO_SUPERADO` es CA-14, un criterio distinto; `FUERA_DE_PATRON` es el patrón de recurrencia de la autorización (RN-22, CA-06), no el horario de la zona (RN-14, CA-15) |
| **Riesgo que evita** | Colapsar CA-14 y CA-15 en un mismo motivo los haría indistinguibles en el evento, y la consola no podría decirle al residente por qué se le negó el paso                                                                                                                                                                                     |
| **Dónde vive**       | Enumerado `motivo_acceso` (migración `0002`) · `CLAUDE.md` §2.4 con la justificación · prueba de regresión en `supabase/policies/tests/10_invariantes_estructurales.sql`                                                                                                                                                                     |

---

## 4. Resumen

| Categoría                   | Cantidad                              | Estado                                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[CONTRADICCIÓN]`           | **22**                                | **22 resueltas**, ninguna abierta (C-28 a C-31 añadidas en la 15-D)                                                                                                                                                    |
| `[SUPUESTO]`                | **24**                                | 7 de la ETAPA 00, S-08 y S-09 de la ETAPA 01, S-25 y S-26 de la 13, S-35 a S-38 de la 15-D (S-38 pendiente de ratificar) y **S-39 a S-47 de la 15-E** (S-46 y S-47 se confirman en sitio). Todos con valor conservador |
| `PENDIENTE DE DEFINICIÓN`   | **12** — **2 resueltos** (P-11, P-12) | Los 10 abiertos tienen comportamiento conservador vigente; ninguno bloquea la ETAPA 02. P-12 queda sujeto a confirmación legal                                                                                         |
| **Extensiones al contrato** | **1**                                 | E-01 · `FUERA_DE_HORARIO`, aprobada                                                                                                                                                                                    |

**Contradicciones por severidad:** **8 altas** (C-01, C-02, C-03, C-05, C-12, C-16, C-28, C-31) · **9 medias** (C-04, C-06, C-07, C-17, C-18, C-22, C-27, C-29, C-30) · **5 bajas** (C-11, C-14, C-15, C-23, C-26). Total 22. C-28 **revoca** C-11.

**Contradicción con mayor impacto en el código:** **C-02**. Es la única que cambia el modelo de dominio, y sin resolverla cinco reglas de negocio no tendrían agregado que las sostuviera.

**Contradicción con mayor impacto en el producto:** **C-03**. Determina si el residente autoriza de verdad o solo solicita, y con ello si OE-02 se cumple o queda en enunciado.
