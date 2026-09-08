# 04 · Requisitos no funcionales

**Origen.** El documento de requisitos v1.0 **no contiene** una sección formal de requisitos no funcionales (hallazgo §9 de `01-legibilidad-requisitos.md`). Esta sección la construye, derivándola de tres fuentes ya existentes y verificables:

1. Los **37 KPI** del documento de requisitos, que fijan metas numéricas sin requisito que las respalde.
2. Las **22 RN**, que imponen restricciones transversales de seguridad, auditoría y privacidad.
3. La **§9 del PDF del reto** —privacidad, seguridad, disponibilidad—, de autoridad máxima.

**Naturaleza de este documento.** Es un **derivado**, no una modificación del original. Ningún RNF inventa una exigencia: cada uno tiene KPI o RN de respaldo. Cuando un umbral no está en ninguna fuente, se marca `[SUPUESTO]` y se elige el valor conservador.

**Formato.** Cada requisito lleva: enunciado, métrica, umbral, fuente de medición, KPI/RN de respaldo, etapa donde se implementa y etapa donde se verifica.

---

## RNF-01 · Latencia de la decisión y del accionamiento

**Enunciado.** El sistema resuelve y ejecuta una decisión de acceso dentro de presupuestos de tiempo acotados, medidos de extremo a extremo y no por tramos aislados.

| #    | Métrica                                                         | Umbral                                   | Fuente de medición                                         | Respaldo          |
| ---- | --------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------- | ----------------- |
| 01.1 | Detección de placa → accionamiento del relé                     | **< 3 s**                                | Marcas de tiempo del evento, tramos 1→7 del flujo de CU-01 | KPI-13            |
| 01.2 | Creación de autorización → disponibilidad en el motor de reglas | **< 5 s**                                | Marca de creación vs. marca de disponibilidad              | KPI-09            |
| 01.3 | Acción del operador → accionamiento remoto                      | **< 3 s**                                | Marca de tiempo del evento remoto                          | KPI-32, CA-20     |
| 01.4 | Establecimiento de audio y vídeo, extremo a extremo             | **< 2 s**                                | Medición en sesión de intercomunicador                     | KPI-33, CA-19     |
| 01.5 | Revocación → siguiente detección denegada                       | **< 60 s**                               | Prueba de revocación seguida de detección                  | CA-07             |
| 01.6 | Percentil de referencia                                         | **p95** sobre 30 mediciones consecutivas | Tablero de latencias                                       | `[SUPUESTO]` S-02 |

> **`[SUPUESTO]` S-02 — percentil de medición.** Ningún KPI dice si el umbral es media, mediana o percentil. Un promedio esconde la cola larga, que es justo la que arruina la experiencia. Se adopta **p95** como criterio de cumplimiento y se reporta también p50 y p99. Conservador y demostrable.

**Implementa:** 05 (contrato y presupuesto), 12 (Edge). **Verifica:** 14 (instrumentación), 15 (hardware real).

---

## RNF-02 · Disponibilidad y continuidad operativa

**Enunciado.** La operación crítica de acceso sobrevive a la pérdida de conectividad WAN sin degradación funcional, y los eventos generados durante el corte se reconcilian sin pérdida ni duplicación.

| #    | Métrica                                                     | Umbral                                                      | Fuente de medición                         | Respaldo         |
| ---- | ----------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------ | ---------------- |
| 02.1 | Accesos con regla en caché resueltos durante el corte       | **100 %**                                                   | 30 min sin WAN, 20 accesos de prueba       | KPI-28, CA-21    |
| 02.2 | Eventos locales reconciliados tras reconectar               | **100 % en < 5 min, sin duplicados**                        | Conteo local vs. nube                      | KPI-29, CA-22    |
| 02.3 | Autonomía continuada del Edge                               | **24 h sin degradación**                                    | Prueba de resistencia prolongada           | KPI-30           |
| 02.4 | Decisiones tomadas con reglas obsoletas más allá del margen | **0**                                                       | Revisión de `VersionDeReglas` en el evento | KPI-31           |
| 02.5 | Margen de vigencia del caché de reglas                      | **24 h** `[SUPUESTO]` S-03                                  | Configuración del Edge                     | P-05             |
| 02.6 | Política ante regla ausente del caché                       | **Denegar por defecto**, configurable                       | Configuración por copropiedad              | CU-04 3a, §2.1.4 |
| 02.7 | Reanudación ante conexión intermitente                      | Desde el **último evento confirmado**, sin reenvío completo | Prueba de corte intermitente               | CU-04 5a         |

**Implementa:** 12. **Verifica:** 12 (DoD), 14.

---

## RNF-03 · Seguridad de la plataforma

**Enunciado.** El sistema opera con una línea base de seguridad activa desde la primera etapa, no añadida al final, y ninguna superficie expone secretos ni admite entrada no validada.

| #     | Requisito                                                                | Umbral / criterio                                                                                                                                               | Respaldo                           |
| ----- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 03.1  | **Aislamiento multiempresa** — todo intento de acceso cruzado se rechaza | **100 %** responde 403 o 404                                                                                                                                    | KPI-36, RN-15, CA-24               |
| 03.2  | **Cobertura de la suite de aislamiento**                                 | **100 % de endpoints**, por los **dos caminos**: JWT de usuario y `service_role`                                                                                | KPI-37, CP-11                      |
| 03.3  | **Registro del intento cruzado**                                         | **100 %** queda en `auditoria_seguridad`                                                                                                                        | KPI-38, RN-15                      |
| 03.4  | **MFA TOTP** para roles administrativos                                  | Acceso no concedido hasta completar el segundo factor                                                                                                           | RN-20, CA-25                       |
| 03.5  | **Secretos fuera del código y del frontend**                             | 0 credenciales, llaves, IP de dispositivo o tokens en repositorio, tests, seeds o historial de Git                                                              | RN-21, §2.7.1                      |
| 03.6  | **Validación en el servidor**                                            | `ValidationPipe` global con `whitelist`, `forbidNonWhitelisted`, `transform`. Todo DTO validado                                                                 | §2.7.3                             |
| 03.7  | **Anti inyección SQL**                                                   | Solo consultas parametrizadas o query builder. Saneamiento y normalización antes de persistir                                                                   | §2.7.4                             |
| 03.8  | **Rate limiting**                                                        | Global + endurecido en login, MFA, recuperación, creación de autorizaciones, ingesta de eventos y apertura. Por **IP y por identidad**. `429` con `Retry-After` | §2.7.5                             |
| 03.9  | **RLS activa y forzada**                                                 | `FORCE ROW LEVEL SECURITY` en el **100 %** de las tablas, con prueba positiva y negativa por política                                                           | §2.7.6                             |
| 03.10 | **CORS y CSP**                                                           | Lista blanca explícita; CSP con nonce por petición, sin `unsafe-inline` ni `unsafe-eval`                                                                        | §2.7.2, §2.7.7                     |
| 03.11 | **Autenticación del Alarm Server**                                       | El POST de la cámara se **valida por firma** antes de procesarse                                                                                                | **Diagrama pág. 4, paso 2** · H-04 |
| 03.12 | **Transporte**                                                           | HTTPS obligatorio; HSTS; `nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`                                                                          | §2.7.8, PDF del reto §9            |
| 03.13 | **Evidencia**                                                            | Buckets privados con URLs firmadas de vida corta                                                                                                                | RN-21, §2.7.8                      |
| 03.14 | **Carga de archivos**                                                    | Validada por **tipo real**, no por extensión; tamaño máximo de payload                                                                                          | §2.7.8                             |

> **RNF-03.11 es un requisito que ningún KPI ni RN respaldaba.** Procede exclusivamente del paso 2 del flujo de CU-01 del diagrama («valida firma»). Sin él, el endpoint de ingesta acepta eventos de acceso de cualquiera que alcance la URL, lo que permitiría fabricar aperturas y falsear la auditoría. Se eleva aquí a requisito formal.

**Implementa:** 01, 02, 03 (línea base) · 15 (03.11). **Verifica:** 03 (suite que rompe el build), 13 (auditoría formal).

---

## RNF-04 · Auditoría e integridad de la información

**Enunciado.** Ningún acceso existe sin evento, ningún evento puede alterarse y toda operación queda atribuida.

| #    | Métrica                                                          | Umbral                                                    | Fuente de medición                               | Respaldo                      |
| ---- | ---------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------ | ----------------------------- |
| 04.1 | Accesos del log del dispositivo sin evento en plataforma         | **0**                                                     | Cruce de 50 accesos                              | KPI-22                        |
| 04.2 | Eventos con actor, dispositivo, zona, resultado y regla aplicada | **100 %**                                                 | Consulta de campos nulos                         | KPI-23, RN-02                 |
| 04.3 | Eventos editables o eliminables desde la aplicación              | **0**, garantizado por permisos de base de datos          | Intento de `UPDATE`/`DELETE` con todos los roles | KPI-24, RN-03, CA-23, ADR-005 |
| 04.4 | Operaciones con usuario y marca de tiempo                        | **100 %**                                                 | Consulta de logs                                 | KPI-05                        |
| 04.5 | Eliminaciones físicas de registros con eventos asociados         | **0**                                                     | Intento de borrado de residente con historial    | KPI-04, RN-19, CA-02          |
| 04.6 | Integridad referencial                                           | **0 residentes activos sin vivienda asociada** (ver C-22) | Consulta de huérfanos                            | KPI-01                        |
| 04.7 | Atribución de acción remota                                      | **100 %** con identidad del operador en turno             | Consulta de eventos de origen remoto             | KPI-34, RN-08                 |
| 04.8 | Apertura manual sin motivo escrito                               | **0 ejecutadas**                                          | Intento de apertura sin motivo                   | RN-08, CA-16                  |

**Implementa:** 01 (permisos y columnas), 06. **Verifica:** 06 (DoD), 13.

---

## RNF-05 · Privacidad y tratamiento de datos biométricos

**Enunciado.** El tratamiento de datos biométricos cumple la **Ley 1581 de 2012** de forma verificable, no declarativa.

| #    | Requisito                                     | Umbral / criterio                                                                                         | Respaldo                                                         |
| ---- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 05.1 | Consentimiento **previo** a la sincronización | **100 %**. Sin consentimiento vigente no hay sincronización, bloqueado por API **y** por ruta de servicio | KPI-20, RN-09, CA-09                                             |
| 05.2 | Titularidad del consentimiento                | Lo otorga **el visitante**, nunca el residente que lo invita                                              | RN-10                                                            |
| 05.3 | Consentimiento **verificable**                | Se registra titular, finalidad, fecha, **versión de política**, medio y evidencia                         | PDF del reto §9, agregado `ConsentimientoBiometrico`             |
| 05.4 | Supresión al vencer la vigencia               | **100 % eliminadas de la terminal dentro de 24 h**                                                        | KPI-21 _(registrada en el original como `KP1-21`)_, RN-11, CA-10 |
| 05.5 | Supresión ante revocación                     | **Inmediata** en todas las terminales; el siguiente intento facial se niega                               | RN-11, CA-11                                                     |
| 05.6 | Ubicación de la plantilla                     | En la terminal y **cifrada en base**; **nunca en el cliente**                                             | Riesgo §13.4, ETAPA 08                                           |
| 05.7 | Minimización                                  | No se capturan datos biométricos sin autorización previa que los justifique                               | Principio de finalidad                                           |
| 05.8 | Plazo de respuesta al consentimiento          | **24 h o el inicio de la vigencia, lo que ocurra primero** `[SUPUESTO]` S-04                              | P-03, CU-02 3a                                                   |
| 05.9 | Trazabilidad de la supresión                  | Toda supresión deja registro con instante y causa                                                         | CA-10                                                            |

**Implementa:** 08. **Verifica:** 08 (DoD), 13. **Documenta:** `docs/seguridad/ciclo-vida-biometrico.md` (ETAPA 08).

---

## RNF-06 · Precisión del reconocimiento

**Enunciado.** El reconocimiento facial y de placas alcanza tasas de acierto compatibles con el uso desatendido, y por debajo del umbral de confianza no decide solo.

| #    | Métrica                                                | Umbral                                                         | Fuente de medición                      | Respaldo                                            |
| ---- | ------------------------------------------------------ | -------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------- |
| 06.1 | Calidad de captura — fotos aceptadas al primer intento | **≥ 95 %**                                                     | 100 fotos de rostros en luz normal      | KPI-16 _(titulado «Calidad de Apertura», ver L-08)_ |
| 06.2 | Falso rechazo (FRR)                                    | **< 5 %**                                                      | 100 intentos de personas registradas    | KPI-17                                              |
| 06.3 | Falsa aceptación (FAR)                                 | **< 0,1 %**                                                    | 100 intentos de personas no registradas | KPI-18                                              |
| 06.4 | Umbral de confianza de lectura de placa                | **0,85**, configurable por copropiedad `[SUPUESTO]` S-05       | Configuración                           | P-02, CU-01 3a                                      |
| 06.5 | Lectura por debajo del umbral                          | **No se decide automáticamente**; se envía a validación humana | Prueba con lectura degradada            | CU-01 3a                                            |

**Implementa:** 05 (umbral y desvío a validación), 08 (calidad). **Verifica:** 15 (06.2, 06.3 exigen hardware y muestra real).

---

## RNF-07 · Mantenibilidad y desacople de proveedor

**Enunciado.** La lógica de negocio no depende de un fabricante, y esa independencia se verifica mecánicamente en cada construcción.

| #    | Métrica                                                                 | Umbral                                                                                                | Fuente de medición                                                                        | Respaldo                                        |
| ---- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 07.1 | Referencias a ISAPI o a IP de dispositivo fuera de la capa de proveedor | **0**                                                                                                 | Análisis estático ejecutado en cada corrida de CI, como condición de aprobación del build | KPI-11, RN-12 _(redacción corregida, ver L-07)_ |
| 07.2 | Sustituibilidad del proveedor                                           | Suite **completa verde** con `MockProvider`, sin hardware conectado                                   | Ejecución en CI                                                                           | KPI-12 _(fuente corregida, ver C-07)_           |
| 07.3 | Adaptadores que lanzan `NotImplemented`                                 | **0**                                                                                                 | Revisión de la implementación de puertos                                                  | §2.3 (ISP)                                      |
| 07.4 | Importaciones de infraestructura desde `domain/`                        | **0** — el build falla si aparece una                                                                 | Regla de frontera de ESLint                                                               | §2.2, DoD ETAPA 02                              |
| 07.5 | Cobertura de pruebas                                                    | **≥ 90 %** en `domain/` y `application/`; **≥ 70 %** global; **100 % de ramas** en el motor de reglas | Informe de cobertura en CI                                                                | §2.4, DoD ETAPA 05                              |
| 07.6 | Tamaño de unidad                                                        | Ningún archivo > 300 líneas; ninguna clase > 5 métodos públicos                                       | Análisis estático                                                                         | §2.3 (SRP)                                      |
| 07.7 | Uso de `any`                                                            | **0**                                                                                                 | ESLint con regla que rompe el build                                                       | §2.4                                            |

**Implementa:** 02 (reglas), 05 (análisis y Mock). **Verifica:** 14 (CI completa).

---

## RNF-08 · Integridad bajo concurrencia

**Enunciado.** Las invariantes que pueden violarse por carrera se garantizan en la base de datos, no en el código de aplicación.

| #    | Métrica                                       | Umbral                                                | Fuente de medición                            | Respaldo             |
| ---- | --------------------------------------------- | ----------------------------------------------------- | --------------------------------------------- | -------------------- |
| 08.1 | Duplicados en inserción concurrente de placas | **0 en 100 inserciones simultáneas**                  | Script de carga concurrente                   | KPI-03, ADR-004      |
| 08.2 | Rechazo ante placa duplicada activa           | **100 %**                                             | Carga de 100 placas con 10 duplicadas         | KPI-02, RN-04, CA-03 |
| 08.3 | Duplicación de eventos en la reconciliación   | **0** — clave de idempotencia única por copropiedad   | Reenvío deliberado de eventos ya confirmados  | RN-17, CU-04 6a      |
| 08.4 | Aforo por encima del máximo                   | **0** — invariante del agregado y de la base          | Prueba en el límite: aforo exacto y aforo + 1 | RN-14, CA-14         |
| 08.5 | Exclusividad del canal de intercom            | **0 sesiones simultáneas** sobre el mismo dispositivo | Prueba con dos operadores concurrentes        | ADR-001              |

**Implementa:** 01 (índices y restricciones), 04, 07, 10, 12. **Verifica:** 04 (DoD de concurrencia), 12.

---

## RNF-09 · Usabilidad y accesibilidad

**Enunciado.** El producto es operable por personal no técnico, y el residente completa su tarea principal sin fricción.

| #    | Métrica                                                   | Umbral                                                                       | Fuente de medición                                         | Respaldo                     |
| ---- | --------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------- |
| 09.1 | Tiempo de creación de una autorización, extremo a extremo | **< 60 s**                                                                   | Prueba de usabilidad con 5 residentes                      | KPI-10                       |
| 09.2 | Tasa de ingreso autónomo                                  | **≥ 95 %** de autorizados ingresan sin apertura manual                       | 20 ingresos de prueba, conteo de eventos manuales          | KPI-06                       |
| 09.3 | Fidelidad de la sincronización de autorizaciones          | **100 %** llegan íntegras a administración                                   | 30 autorizaciones, comparación campo a campo               | KPI-08                       |
| 09.4 | Accesibilidad                                             | **WCAG 2.1 nivel AA**                                                        | Auditoría automática + revisión manual de contraste y foco | §2.4, ETAPA 09               |
| 09.5 | Estados por vista                                         | Toda vista implementa **vacío, cargando, error, sin permiso y sin conexión** | Revisión pantalla por pantalla                             | ETAPA 09, `03-mockups.md` §4 |
| 09.6 | Objetivo táctil mínimo en móvil                           | **44 × 44 px**                                                               | Revisión de la app                                         | WCAG 2.5.5                   |
| 09.7 | Contraste del color de marca                              | El rojo `#E63946` no se usa como texto pequeño sobre blanco                  | Revisión de componentes                                    | `03-mockups.md` §5.6         |

**Implementa:** 09, 10, 11. **Verifica:** 11 (prueba de usabilidad de 09.1), 14.

---

## RNF-10 · Multiempresa y escalabilidad

**Enunciado.** Una sola instancia opera múltiples copropiedades con aislamiento estricto, y un operador atiende varias sin fuga de datos.

| #    | Métrica                                  | Umbral                                                                                              | Fuente de medición                        | Respaldo                         |
| ---- | ---------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------- |
| 10.1 | Continuidad multiproyecto                | Un operador atiende **≥ 2 copropiedades sin fuga de datos**                                         | Prueba de sesión con proyectos alternados | KPI-35, HU-25                    |
| 10.2 | `copropiedad_id` en toda tabla operativa | **NOT NULL**, sin excepción                                                                         | Revisión del esquema                      | §6 ETAPA 01                      |
| 10.3 | Cobertura de dispositivos operables      | Todo dispositivo registrado responde a orden de prueba y reporta estado dentro del umbral de latido | Matriz de prueba por tipo de equipo       | KPI-14 _(reformulado, ver A-07)_ |
| 10.4 | Umbral de latido de dispositivo          | **3 latidos perdidos o 5 min**, configurable por tipo `[SUPUESTO]` S-06                             | Configuración                             | P-06, CA-26                      |
| 10.5 | Cambio de copropiedad en sesión          | Reinicio completo de contexto y caché de cliente; sin datos residuales                              | Prueba automatizada de conmutación        | KPI-35, DoD ETAPA 10             |

**Implementa:** 01, 03, 10. **Verifica:** 03 (suite de aislamiento), 10 (DoD).

---

## RNF-11 · Observabilidad

**Enunciado.** Cada latencia comprometida es demostrable con datos, no afirmable. El documento de requisitos exige _sustentar_ los indicadores; sin instrumentación no hay sustento.

| #    | Requisito                                      | Criterio                                                                                                     | Respaldo       |
| ---- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------- |
| 11.1 | Logs estructurados con correlación de petición | Todo evento de acceso trazable de extremo a extremo por un identificador de correlación                      | §2.6, ETAPA 14 |
| 11.2 | **Redacción de datos sensibles en logs**       | 0 contraseñas, tokens, credenciales de dispositivo o plantillas biométricas en logs                          | §2.7.8, RN-21  |
| 11.3 | Métricas de las latencias comprometidas        | Tableros que sustenten KPI-09, 13, 25, 32 y 33 con p50/p95/p99                                               | ETAPA 14       |
| 11.4 | Reporte de errores                             | Sentry con agrupación y alerta                                                                               | §2.6           |
| 11.5 | Salud de dispositivos                          | Latido, estado y última sincronización consultables y alertables                                             | CA-26, HU-38   |
| 11.6 | Marca de decisión del Edge                     | Todo evento decidido localmente lleva `VersionDeReglas` y, si aplica, marca de caché potencialmente obsoleto | RN-16, KPI-31  |

**Implementa:** 02 (logger con redacción), 06, 12. **Verifica:** 14.

---

## RNF-12 · Alertas y escalamiento

**Enunciado.** Los eventos críticos llegan a quien debe actuar, en tiempo acotado y sin depender de que alguien los revise.

| #    | Métrica                                                        | Umbral                                                                                     | Fuente de medición                                      | Respaldo      |
| ---- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ------------- |
| 12.1 | Latencia de alerta — evento crítico → notificación al operador | **< 10 s**                                                                                 | Marca del evento vs. marca de recepción                 | KPI-25, CA-18 |
| 12.2 | Cobertura de sabotaje                                          | **100 %** de eventos de manipulación generan alerta                                        | 10 aperturas de gabinete no autorizadas o desconexiones | KPI-26        |
| 12.3 | Tasa de falsa alarma                                           | **< 5 %**                                                                                  | Clasificación manual de una semana de alertas           | KPI-27        |
| 12.4 | Escalamiento automático                                        | Lista negra, sabotaje, dispositivo caído y **acceso dudoso** escalan sin intervención      | Prueba por cada tipo de evento crítico                  | RN-18         |
| 12.5 | Definición de «acceso dudoso»                                  | `ResultadoAcceso` igual a `CONFIANZA_INSUFICIENTE` o `PLACA_DESCONOCIDA` `[SUPUESTO]` S-07 | Configuración del motor                                 | P-07          |
| 12.6 | Notificación al residente                                      | Push por FCM al ingresar su visitante                                                      | HU-34                                                   |

**Implementa:** 06. **Verifica:** 06 (DoD), 15 (12.2 exige hardware).

---

## Trazabilidad inversa: todos los KPI tienen RNF

| KPI    | RNF                  | KPI        | RNF                         | KPI    | RNF        |
| ------ | -------------------- | ---------- | --------------------------- | ------ | ---------- |
| KPI-01 | 04.6                 | KPI-14     | 10.3                        | KPI-28 | 02.1       |
| KPI-02 | 08.2                 | KPI-15     | _(funcional, RN-14)_ + 08.4 | KPI-29 | 02.2       |
| KPI-03 | 08.1                 | KPI-16     | 06.1                        | KPI-30 | 02.3       |
| KPI-04 | 04.5                 | KPI-17     | 06.2                        | KPI-31 | 02.4, 11.6 |
| KPI-05 | 04.4                 | KPI-18     | 06.3                        | KPI-32 | 01.3       |
| KPI-06 | 09.2                 | **KPI-19** | **inexistente**             | KPI-33 | 01.4       |
| KPI-07 | _(funcional, RN-01)_ | KPI-20     | 05.1                        | KPI-34 | 04.7       |
| KPI-08 | 09.3                 | KPI-21     | 05.4                        | KPI-35 | 10.1, 10.5 |
| KPI-09 | 01.2                 | KPI-22     | 04.1                        | KPI-36 | 03.1       |
| KPI-10 | 09.1                 | KPI-23     | 04.2                        | KPI-37 | 03.2       |
| KPI-11 | 07.1                 | KPI-24     | 04.3                        | KPI-38 | 03.3       |
| KPI-12 | 07.2                 | KPI-25     | 12.1                        |        |            |
| KPI-13 | 01.1                 | KPI-26     | 12.2                        |        |            |
|        |                      | KPI-27     | 12.3                        |        |            |

**36 de 37 KPI tienen requisito no funcional de respaldo.** Los dos restantes —KPI-07 (respeto de vigencia) y KPI-15 (cumplimiento de reglas de zona)— son **funcionales puros**: los cubre directamente el motor de reglas mediante RN-01, RN-22 y RN-14, y se verifican con pruebas de comportamiento, no con métricas de calidad de servicio. KPI-19 no existe (hallazgo K-01).

---

## Supuestos generados por este documento

| ID   | Supuesto                                | Valor conservador adoptado                           | Resuelve       |
| ---- | --------------------------------------- | ---------------------------------------------------- | -------------- |
| S-02 | Percentil de medición de latencias      | **p95** (se reporta también p50 y p99)               | RNF-01.6       |
| S-03 | Margen de vigencia del caché de reglas  | **24 h**                                             | RNF-02.5, P-05 |
| S-04 | Plazo de respuesta al consentimiento    | **24 h o inicio de vigencia**, lo que ocurra primero | RNF-05.8, P-03 |
| S-05 | Umbral de confianza de lectura de placa | **0,85**, configurable                               | RNF-06.4, P-02 |
| S-06 | Umbral de latido de dispositivo         | **3 latidos o 5 min**                                | RNF-10.4, P-06 |
| S-07 | Definición de «acceso dudoso»           | `CONFIANZA_INSUFICIENTE` o `PLACA_DESCONOCIDA`       | RNF-12.5, P-07 |

Todos se consolidan en `contradicciones-y-supuestos.md`.
