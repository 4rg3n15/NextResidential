# Matriz de trazabilidad consolidada

**Propósito.** Garantizar que **ningún elemento de la especificación quede huérfano**: cada objetivo, regla, historia, caso de uso, criterio de aceptación, indicador y caso de prueba tiene etapa asignada y pantalla donde se manifiesta.

**Definición de Terminado de la ETAPA 00 que este documento cierra:**

> «Los 38 HU, 26 CA y 37 KPI están asignados a una etapa concreta. Ninguno queda huérfano.»

**Convención de columnas «Etapa»:** cuando figuran dos, la **primera en negrita** es la etapa que la implementa y responde por ella; la segunda es donde se expone o se verifica con hardware.

**Nomenclatura de pantallas:** `W-nn` consola web · `M-n` aplicación móvil, según `03-mockups.md`.

---

## 1. Vista por objetivo específico

| OE        | Enunciado abreviado                                   | RN                         | HU                   | CU           | CA                  | KPI             | CP    | Etapas           | Pantallas                              |
| --------- | ----------------------------------------------------- | -------------------------- | -------------------- | ------------ | ------------------- | --------------- | ----- | ---------------- | -------------------------------------- |
| **OE-01** | Administración completa del **padrón** _(ver L-05)_   | RN-04, RN-19               | HU-01 … HU-06        | —            | CA-01, CA-02, CA-03 | KPI-01 … KPI-05 | CP-01 | **04** · 01 · 09 | W-03, W-04, M-2, M-3                   |
| **OE-02** | Autorización de visitantes desde la app, con vigencia | RN-01, RN-05, RN-13, RN-22 | HU-07 … HU-10        | CU-01        | CA-04 … CA-07       | KPI-06 … KPI-10 | CP-02 | **05** · 11      | W-05, M-4                              |
| **OE-02** | Lista negra con precedencia                           | RN-06, RN-07               | HU-35                | CU-01        | CA-13               | —               | CP-03 | **05** · 09      | W-05, W-08                             |
| **OE-03** | Integración desacoplada por capa de proveedor         | RN-12                      | HU-16, HU-17, HU-38  | CU-01        | CA-12               | KPI-11 … KPI-14 | CP-04 | **05** · 15      | W-07, W-09                             |
| **OE-03** | Reglas de zona _(fila de la matriz original)_         | RN-14                      | HU-18, HU-19, HU-20  | CU-05        | CA-14, CA-15        | KPI-15          | CP-05 | **07** · 09 · 11 | W-06, M-5                              |
| **OE-04** | Biometría con consentimiento y supresión              | RN-09, RN-10, RN-11        | HU-11 … HU-15        | CU-02        | CA-08 … CA-11       | KPI-16 … KPI-21 | CP-06 | **08** · 11 · 15 | M-4 _(+ pantallas nuevas)_             |
| **OE-05** | Trazabilidad y auditoría inmutable                    | RN-02, RN-03, RN-08        | HU-21 … HU-24, HU-32 | CU-01, CU-03 | CA-16, CA-17, CA-23 | KPI-22 … KPI-24 | CP-07 | **06** · 01 · 10 | W-08, W-09, W-10                       |
| **OE-05** | Escalamiento y alertas                                | RN-18                      | HU-29, HU-34         | CU-03        | CA-18, CA-26        | KPI-25 … KPI-27 | CP-08 | **06** · 15      | W-02, W-08, M-7                        |
| **OE-06** | Continuidad offline y reconciliación                  | RN-16, RN-17               | HU-30, HU-31         | CU-04        | CA-21, CA-22        | KPI-28 … KPI-31 | CP-09 | **12**           | _(sin pantalla propia; marca en W-08)_ |
| **OE-07** | Operación remota multiproyecto                        | RN-08, RN-18               | HU-25 … HU-28        | CU-03        | CA-19, CA-20        | KPI-32 … KPI-35 | CP-10 | **10** · 15      | W-09                                   |
| **OE-08** | Multiempresa con aislamiento de datos                 | RN-15, RN-20, RN-21        | HU-36, HU-37         | —            | CA-24, CA-25        | KPI-36 … KPI-38 | CP-11 | **03** · 01 · 13 | W-01                                   |

> La matriz original del documento de requisitos (§9) asigna la fila de zonas comunes a **OE-03**, lo que parece un desliz —zonas es materia de OE-05 y del reglamento, no de la capa de integración—. Se **conserva tal cual** para no alterar el original, y se señala aquí. El trabajo se planifica igual: ETAPA 07.

---

## 2. Reglas de negocio → etapa

| RN    | Enunciado abreviado                            | Mecanismo principal                                | Etapa       | Verifica              |
| ----- | ---------------------------------------------- | -------------------------------------------------- | ----------- | --------------------- |
| RN-01 | Autorización vencida no habilita acceso        | `PolíticaVigencia` sobre VO `Vigencia`             | **05**      | CA-05, KPI-07         |
| RN-02 | Todo intento genera evento completo            | Agregado `Acceso` + columnas NOT NULL              | **06**      | KPI-23                |
| RN-03 | Eventos inmutables                             | `REVOKE UPDATE, DELETE` (ADR-005)                  | **01** · 06 | CA-23, KPI-24         |
| RN-04 | Una placa por vivienda activa                  | Índice único parcial (ADR-004)                     | **01** · 04 | CA-03, KPI-02, KPI-03 |
| RN-05 | Residente autoriza solo su vivienda            | Invariante de `Autorizacion` + RLS                 | **05**      | CP-02                 |
| RN-06 | Lista negra con precedencia absoluta           | `PolíticaListaNegra`, primera en la cadena         | **05**      | CA-13, CP-03          |
| RN-07 | Solo admin u operador gestionan lista negra    | Invariante de `ListaNegra` + guard RBAC            | **05** · 03 | CP-03                 |
| RN-08 | Apertura manual con motivo y atribución        | Motivo obligatorio en el caso de uso               | **10**      | CA-16, CA-17, KPI-34  |
| RN-09 | Consentimiento previo a sincronizar            | `PolíticaConsentimiento` + invariante de plantilla | **08**      | CA-09, KPI-20         |
| RN-10 | El consentimiento lo otorga el visitante       | Invariante de `ConsentimientoBiometrico`           | **08**      | CP-06                 |
| RN-11 | Supresión en 24 h al vencer o revocar          | pg-boss + `programarSupresion`                     | **08**      | CA-10, CA-11, KPI-21  |
| RN-12 | La UI no invoca hardware                       | Frontera de capas + análisis estático              | **02** · 05 | KPI-11, CP-04         |
| RN-13 | Vivienda inactiva no genera autorizaciones     | Invariante de `Vivienda`                           | **04**      | CP-02                 |
| RN-14 | Zona: aforo y horario mandan                   | `Zona.admiteIngreso` + `PolíticaZona`              | **07**      | CA-14, CA-15, KPI-15  |
| RN-15 | Aislamiento entre copropiedades                | RLS forzada + validación en aplicación             | **03** · 01 | CA-24, KPI-36 … 38    |
| RN-16 | Edge decide con caché y marca la versión       | VO `VersionDeReglas` sellado en el evento          | **12**      | CA-21, KPI-31         |
| RN-17 | Idempotencia en la reconciliación              | Clave única por copropiedad                        | **12** · 01 | CA-22, KPI-29         |
| RN-18 | Escalamiento automático de eventos críticos    | Manejadores de eventos de dominio                  | **06**      | CA-18, KPI-25         |
| RN-19 | Sin borrado físico con historial               | `desactivar()` + trigger anti-`DELETE`             | **01** · 04 | CA-02, KPI-04         |
| RN-20 | MFA para roles administrativos                 | Supabase Auth TOTP + guard                         | **03**      | CA-25                 |
| RN-21 | Credenciales de dispositivo fuera del frontend | `Dispositivo.credencialRef` a bóveda               | **05** · 15 | Auditoría 13          |
| RN-22 | Recurrente se evalúa contra su patrón          | `PatronRecurrencia.aplicaEn`                       | **05**      | CA-06                 |

**22 de 22 asignadas.**

---

## 3. Historias de usuario → etapa · **38 de 38 asignadas**

| HU    | Rol                 | MoSCoW | Épica            | Etapa            | Pantalla                              | CA que la verifica |
| ----- | ------------------- | ------ | ---------------- | ---------------- | ------------------------------------- | ------------------ |
| HU-01 | Administrador       | Must   | Padrón           | **04** · 09      | W-03                                  | —                  |
| HU-02 | Administrador       | Must   | Padrón           | **04** · 09      | W-03, M-2                             | CA-01              |
| HU-03 | Administrador       | Should | Padrón           | **04** · 09      | W-03 _(M-04: falta punto de entrada)_ | —                  |
| HU-04 | Administrador       | Must   | Padrón           | **04** · 09      | W-03, M-2                             | CA-02              |
| HU-05 | Residente           | Must   | Vehículos        | **04** · 11      | M-3, W-04                             | —                  |
| HU-06 | Sistema             | Must   | Vehículos        | **04**           | W-04, M-3                             | CA-03              |
| HU-07 | Residente           | Must   | Autorización     | **05** · 11      | M-4, W-05                             | CA-04, CA-05       |
| HU-08 | Residente           | Must   | Autorización     | **05** · 11      | M-4 _(M-12: falta control)_           | CA-06              |
| HU-09 | Residente           | Should | Autorización     | **05** · 11      | M-4 _(C-06: lista nominal)_           | —                  |
| HU-10 | Residente           | Must   | Autorización     | **05** · 11      | M-4, W-05                             | CA-07              |
| HU-11 | Residente           | Must   | Biometría        | **08** · 11      | _(M-02: pantalla por diseñar)_        | CA-08              |
| HU-12 | **Visitante**       | Must   | Biometría        | **08**           | _(M-03: pantalla por diseñar)_        | CA-09              |
| HU-13 | Sistema             | Must   | Biometría        | **08** · 11      | _(captura)_                           | CA-08              |
| HU-14 | Sistema             | Must   | Biometría        | **08**           | —                                     | CA-10              |
| HU-15 | Titular del dato    | Must   | Biometría        | **08**           | _(consentimiento + M-8)_              | CA-11              |
| HU-16 | Sistema             | Must   | Motor de reglas  | **05**           | W-08, W-09                            | CA-12, CA-13       |
| HU-17 | Sistema             | Must   | Motor de reglas  | **05** · 06      | W-02, W-08                            | —                  |
| HU-18 | Administrador       | Must   | Zonas comunes    | **07** · 09      | W-06                                  | CA-15              |
| HU-19 | Residente           | Should | Zonas comunes    | **07** · 11      | M-5 _(M-12: falta control en M-4)_    | —                  |
| HU-20 | Sistema             | Must   | Zonas comunes    | **07**           | W-06, M-5                             | CA-14              |
| HU-21 | Portero             | Must   | Consola portería | **10**           | W-09                                  | —                  |
| HU-22 | Portero             | Must   | Consola portería | **10**           | W-09 _(C-12: falta motivo)_           | CA-16, CA-17       |
| HU-23 | Portero             | Must   | Consola portería | **10**           | W-09                                  | —                  |
| HU-24 | Portero             | Must   | Consola portería | **10** · 06      | W-09, W-08                            | —                  |
| HU-25 | Operador de central | Must   | Guardia virtual  | **10**           | W-09 _(C-12: falta conmutador)_       | —                  |
| HU-26 | Operador de central | Must   | Guardia virtual  | **10** · 15      | W-09 _(C-12: falta intercom)_         | CA-19              |
| HU-27 | Operador de central | Should | Guardia virtual  | **10**           | W-09                                  | —                  |
| HU-28 | Operador de central | Must   | Guardia virtual  | **10** · 15      | W-09                                  | CA-20              |
| HU-29 | Sistema             | Must   | Guardia virtual  | **06**           | W-02, W-08                            | CA-18              |
| HU-30 | Sistema             | Must   | Continuidad      | **12**           | —                                     | CA-21              |
| HU-31 | Sistema             | Must   | Continuidad      | **12**           | —                                     | CA-22              |
| HU-32 | Administrador       | Must   | Trazabilidad     | **06** · 09      | W-08, W-10                            | CA-23              |
| HU-33 | Residente           | Should | App residente    | **11**           | M-1, M-6                              | —                  |
| HU-34 | Residente           | Should | App residente    | **06** · 11      | M-7                                   | —                  |
| HU-35 | Administrador       | Must   | Seguridad        | **05** · 09      | W-05, W-08                            | CA-13              |
| HU-36 | Superadministrador  | Must   | Multiempresa     | **03** · 09      | W-01                                  | CA-24              |
| HU-37 | Administrador       | Must   | Seguridad        | **03** · 09      | W-01 _(C-05: falta MFA)_              | CA-25              |
| HU-38 | Administrador       | Must   | Dispositivos     | **06** · 09 · 15 | W-07                                  | CA-26              |

### Reparto por etapa

| Etapa | HU que implementa                               | Total     |
| ----- | ----------------------------------------------- | --------- |
| 03    | HU-36, HU-37                                    | 2         |
| 04    | HU-01 … HU-06                                   | 6         |
| 05    | HU-07, HU-08, HU-09, HU-10, HU-16, HU-17, HU-35 | 7         |
| 06    | HU-29, HU-32, HU-34, HU-38                      | 4         |
| 07    | HU-18, HU-19, HU-20                             | 3         |
| 08    | HU-11 … HU-15                                   | 5         |
| 10    | HU-21 … HU-28                                   | 8         |
| 11    | HU-33                                           | 1         |
| 12    | HU-30, HU-31                                    | 2         |
|       | **Total**                                       | **38** ✅ |

_(Las etapas 09 y 11 exponen historias implementadas en etapas anteriores; su contribución propia figura en la columna secundaria de la tabla principal.)_

---

## 4. Criterios de aceptación → etapa · **26 de 26 asignados**

| CA    | HU    | Criterio abreviado                                                                  | Etapa que lo cierra                   | Cómo se verifica                                  |
| ----- | ----- | ----------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------- |
| CA-01 | HU-02 | Residente asociado aparece al consultar la vivienda                                 | **04**                                | Prueba de integración                             |
| CA-02 | HU-04 | Borrado físico impedido; se ofrece inactivar                                        | **04** · 01                           | Prueba + trigger de base                          |
| CA-03 | HU-06 | Placa duplicada activa rechazada con el conflicto                                   | **04** · 01                           | Prueba de concurrencia + índice único             |
| CA-04 | HU-07 | Detección dentro de vigencia → abre y registra permitido                            | **05**                                | Suite del motor con `MockProvider`                |
| CA-05 | HU-07 | Vencida → niega con motivo `VIGENCIA_EXPIRADA`, sin accionar relé                   | **05**                                | Suite del motor                                   |
| CA-06 | HU-08 | Fuera del patrón → niega con `FUERA_DE_PATRON`                                      | **05**                                | Suite del motor                                   |
| CA-07 | HU-10 | Revocada → siguiente detección negada en < 60 s                                     | **05** · 12                           | Prueba temporizada                                |
| CA-08 | HU-11 | Foto sin rostro o borrosa → rechazada, sin plantilla                                | **08**                                | Prueba de validación de calidad                   |
| CA-09 | HU-12 | Sin consentimiento → sincronización bloqueada, estado «pendiente de consentimiento» | **08**                                | Prueba por API **y** por ruta de servicio         |
| CA-10 | HU-14 | Vencida + 24 h → plantilla ausente de toda terminal, con registro                   | **08**                                | Prueba temporizada con pg-boss                    |
| CA-11 | HU-15 | Revocación → supresión en todas las terminales; siguiente intento negado            | **08**                                | Prueba de revocación                              |
| CA-12 | HU-16 | Placa desconocida → aparece en consola con evidencia, sin apertura                  | **05** · 10                           | Suite del motor + consola                         |
| CA-13 | HU-16 | Lista negra → niega, alerta y escala                                                | **05** · 06                           | Suite del motor + escalamiento                    |
| CA-14 | HU-20 | Aforo máximo alcanzado → niega con `AFORO_SUPERADO`                                 | **07**                                | Prueba en el límite (aforo, aforo+1)              |
| CA-15 | HU-18 | Fuera de horario → niega con `FUERA_DE_HORARIO`                                     | **07**                                | Prueba en el límite (minuto de apertura y cierre) |
| CA-16 | HU-22 | Sin motivo escrito → **no se ejecuta la apertura**                                  | **10**                                | Prueba del caso de uso                            |
| CA-17 | HU-22 | Con motivo → evento con identidad, motivo y marca de tiempo                         | **10**                                | Prueba del caso de uso                            |
| CA-18 | HU-29 | Evento crítico → operador notificado en < 10 s                                      | **06**                                | Prueba temporizada                                |
| CA-19 | HU-26 | Intercom aceptado → audio y vídeo con retardo < 2 s                                 | **10** _(simulado)_ · **15** _(real)_ | Medición en sesión                                |
| CA-20 | HU-28 | Apertura remota → relé en < 3 s, con identidad                                      | **10** _(simulado)_ · **15** _(real)_ | Medición de marcas de tiempo                      |
| CA-21 | HU-30 | Sin internet + regla en caché → resuelve local y marca la versión                   | **12**                                | Prueba de corte de WAN                            |
| CA-22 | HU-31 | 20 eventos offline → 20 en la nube, exactamente una vez, < 5 min                    | **12**                                | Conteo local vs. nube                             |
| CA-23 | HU-32 | `UPDATE`/`DELETE` sobre eventos rechazado **para todos los roles**                  | **01** · 06                           | Prueba con cada rol de aplicación                 |
| CA-24 | HU-36 | Consulta cruzada por API → 403/404 + evento de seguridad                            | **03**                                | Suite de aislamiento (rompe el build)             |
| CA-25 | HU-37 | Credenciales válidas sin MFA → acceso no concedido                                  | **03**                                | Prueba de flujo de autenticación                  |
| CA-26 | HU-38 | Terminal sin reportarse → marcada caída + alerta generada                           | **06** · 09                           | Prueba con latido suprimido                       |

### Reparto por etapa

| Etapa | CA que cierra                            | Total     |
| ----- | ---------------------------------------- | --------- |
| 01    | _(soporte de CA-02, CA-03, CA-23)_       | —         |
| 03    | CA-24, CA-25                             | 2         |
| 04    | CA-01, CA-02, CA-03                      | 3         |
| 05    | CA-04, CA-05, CA-06, CA-07, CA-12, CA-13 | 6         |
| 06    | CA-18, CA-23, CA-26                      | 3         |
| 07    | CA-14, CA-15                             | 2         |
| 08    | CA-08, CA-09, CA-10, CA-11               | 4         |
| 10    | CA-16, CA-17, CA-19, CA-20               | 4         |
| 12    | CA-21, CA-22                             | 2         |
|       | **Total**                                | **26** ✅ |

---

## 5. Indicadores → etapa · **37 de 37 asignados**

> `KPI-19` **no existe** en el documento original (hallazgo K-01). `KPI-21` figura en el original como `KP1-21` (hallazgo K-02).
> **H** = requiere hardware real; su verificación definitiva es la ETAPA 15.

| KPI          | Indicador                                 | Meta                                | Etapa            | Verifica                                  | RNF           |
| ------------ | ----------------------------------------- | ----------------------------------- | ---------------- | ----------------------------------------- | ------------- |
| KPI-01       | Integridad referencial                    | 0 residentes activos sin vivienda   | **04** · 01      | Consulta de huérfanos                     | 04.6          |
| KPI-02       | Unidad de placa                           | 100 % de rechazo                    | **04** · 01      | 100 placas con 10 duplicadas              | 08.2          |
| KPI-03       | Integridad bajo concurrencia              | 0 duplicados en 100 simultáneas     | **04** · 01      | Script de carga concurrente               | 08.1          |
| KPI-04       | Preservación histórica                    | 0 eliminaciones físicas             | **04** · 01      | Borrado de residente con historial        | 04.5          |
| KPI-05       | Auditoría de cambios                      | 100 % con usuario y marca de tiempo | **01** · 04      | Consulta de logs                          | 04.4          |
| KPI-06       | Tasa de ingreso autónomo                  | ≥ 95 %                              | **11** · 05      | 20 ingresos de prueba                     | 09.2          |
| KPI-07       | Respeto de vigencia                       | 0 ingresos fuera de rango           | **05**           | Cruce evento vs. vigencia                 | _(funcional)_ |
| KPI-08       | Fidelidad de sincronización               | 100 % íntegras                      | **11** · 05      | 30 autorizaciones, campo a campo          | 09.3          |
| KPI-09       | Latencia de propagación                   | < 5 s                               | **05** · 14      | Marcas de tiempo                          | 01.2          |
| KPI-10       | Tiempo de autorización                    | < 60 s                              | **11**           | Usabilidad con 5 residentes               | 09.1          |
| KPI-11       | Desacople de interfaz                     | 0 referencias fuera del proveedor   | **05** · 02 · 14 | Análisis estático en CI                   | 07.1          |
| KPI-12       | Sustituibilidad del proveedor             | Suite verde con simulado            | **05** · 14      | Ejecución en CI                           | 07.2          |
| KPI-13 **H** | Latencia de apertura                      | < 3 s                               | **15** · 05      | Marcas de tiempo del evento               | 01.1          |
| KPI-14 **H** | Cobertura de dispositivos                 | Todos operables                     | **15**           | Matriz de prueba por tipo                 | 10.3          |
| KPI-15       | Cumplimiento de reglas de zona            | 100 % respetan horario y aforo      | **07**           | Pruebas en el límite                      | _(funcional)_ |
| KPI-16       | Calidad de captura _(ver L-08)_           | ≥ 95 % al primer intento            | **08** · 11      | 100 fotos en luz normal                   | 06.1          |
| KPI-17 **H** | Falso rechazo (FRR)                       | < 5 %                               | **15** · 08      | 100 intentos de registrados               | 06.2          |
| KPI-18 **H** | Falsa aceptación (FAR)                    | < 0,1 %                             | **15** · 08      | 100 intentos de no registrados            | 06.3          |
| ~~KPI-19~~   | **Inexistente — identificador reservado** | —                                   | —                | —                                         | —             |
| KPI-20       | Consentimiento previo                     | 100 % antes de sincronizar          | **08**           | Consulta de plantillas sin consentimiento | 05.1          |
| KPI-21       | Supresión al vencer                       | 100 % en < 24 h                     | **08** · 15      | Consulta de terminal tras vencimiento     | 05.4          |
| KPI-22 **H** | Completitud de auditoría                  | 0 accesos del log sin evento        | **06** · 15      | Cruce de 50 accesos                       | 04.1          |
| KPI-23       | Completitud de campos                     | 100 % con todos los campos          | **06**           | Consulta de nulos                         | 04.2          |
| KPI-24       | Inmutabilidad                             | 0 eventos editables                 | **01** · 06      | Intento de edición                        | 04.3          |
| KPI-25       | Latencia de alerta                        | < 10 s                              | **06** · 14      | Marca del evento vs. recepción            | 12.1          |
| KPI-26 **H** | Cobertura de sabotaje                     | 100 % generan alerta                | **15** · 06      | 10 aperturas de gabinete                  | 12.2          |
| KPI-27 **H** | Tasa de falsa alarma                      | < 5 %                               | **15** · 06      | Clasificación de una semana               | 12.3          |
| KPI-28       | Continuidad local                         | 100 % con regla en caché            | **12**           | 30 min sin WAN, 20 accesos                | 02.1          |
| KPI-29       | Reconciliación                            | 100 % en < 5 min sin duplicados     | **12**           | Conteo local vs. nube                     | 02.2          |
| KPI-30       | Autonomía del Edge                        | 24 h sin degradación                | **12**           | Prueba de estrés prolongada               | 02.3          |
| KPI-31       | Vigencia del caché                        | 0 decisiones con reglas obsoletas   | **12**           | Revisión de `VersionDeReglas`             | 02.4          |
| KPI-32 **H** | Latencia de apertura remota               | < 3 s                               | **10** · 15      | Marca de tiempo del evento                | 01.3          |
| KPI-33 **H** | Latencia de audio y vídeo                 | < 2 s                               | **10** · 15      | Medición en sesión de intercom            | 01.4          |
| KPI-34       | Trazabilidad de acción remota             | 100 % con identidad del operador    | **10**           | Consulta de eventos remotos               | 04.7          |
| KPI-35       | Continuidad multiproyecto                 | ≥ 2 copropiedades sin fuga          | **10** · 03      | Sesión con proyectos alternados           | 10.1          |
| KPI-36       | Aislamiento                               | 100 % responden 403/404             | **03** · 13      | Suite con IDs ajenos                      | 03.1          |
| KPI-37       | Cobertura de la prueba                    | 100 % de endpoints                  | **03** · 13      | Rutas expuestas vs. probadas              | 03.2          |
| KPI-38       | Registro del intento                      | 100 % en auditoría                  | **03** · 13      | Consulta de eventos de seguridad          | 03.3          |

### Reparto por etapa

| Etapa  | KPI que responde                                                       | Total     |
| ------ | ---------------------------------------------------------------------- | --------- |
| 01     | KPI-05, KPI-24                                                         | 2         |
| 03     | KPI-36, KPI-37, KPI-38                                                 | 3         |
| 04     | KPI-01, KPI-02, KPI-03, KPI-04                                         | 4         |
| 05     | KPI-07, KPI-09, KPI-11, KPI-12                                         | 4         |
| 06     | KPI-23, KPI-25                                                         | 2         |
| 07     | KPI-15                                                                 | 1         |
| 08     | KPI-16, KPI-20, KPI-21                                                 | 3         |
| 10     | KPI-34, KPI-35                                                         | 2         |
| 11     | KPI-06, KPI-08, KPI-10                                                 | 3         |
| 12     | KPI-28, KPI-29, KPI-30, KPI-31                                         | 4         |
| **15** | KPI-13, KPI-14, KPI-17, KPI-18, KPI-22, KPI-26, KPI-27, KPI-32, KPI-33 | **9**     |
|        | **Total**                                                              | **37** ✅ |

**Nueve indicadores (24 %) solo pueden cerrarse con hardware real.** Es coherente con el peso del criterio de integración (25 %) y con ADR-003: el sistema debe funcionar completo contra `MockProvider`, pero nueve compromisos numéricos exigen el equipo físico. Hasta la ETAPA 15 se reportan como **«verificado contra simulación, pendiente de hardware»** — nunca como cumplidos.

---

## 6. Casos de uso → etapa

| CU        | Título                                                 | Etapa principal                       | Flujos alternos y excepciones                                                                                                                                           | Dónde se prueban                                           |
| --------- | ------------------------------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **CU-01** | Ingreso vehicular por detección de placa               | **05** _(Mock)_ · **15** _(real)_     | 4a vencida · 4b desconocida · 4c lista negra · 4d fuera de patrón · 5a relé sin respuesta (2 reintentos) · 2a evento malformado o duplicado · 3a confianza insuficiente | 05: suite completa contra `MockProvider` (DoD de la etapa) |
| **CU-02** | Alta y sincronización de rostro con consentimiento     | **08**                                | 2a calidad insuficiente · 3a visitante no responde · 4a rechaza consentimiento · 6a terminal no responde · 7a revocación antes del vencimiento                          | 08: pruebas por API y por ruta de servicio                 |
| **CU-03** | Atención de visitante no anunciado por guardia virtual | **10** _(simulado)_ · **15** _(real)_ | 5a residente no responde · 5b residente niega · 3a operador ocupado en otra copropiedad · 2a sin operador disponible · 6a fallo de apertura                             | 10: simulación completa; 15: con intercom real             |
| **CU-04** | Operación autónoma durante caída y reconciliación      | **12**                                | 3a regla no en caché → contingencia · 5a conexión intermitente · 6a clave duplicada · 2a caché fuera de margen                                                          | 12: corte de WAN de 30 min + prueba de 24 h                |
| **CU-05** | Acceso a zona común con horario y aforo                | **07**                                | 3a fuera de horario · 4a aforo lleno · 2a zona no autorizada · 5a fallo del controlador · 6a salida no registrada                                                       | 07: pruebas en el límite                                   |

---

## 7. Casos de prueba → etapa

| CP    | Título                       | Etapa       | Cubre                                              |
| ----- | ---------------------------- | ----------- | -------------------------------------------------- |
| CP-01 | Integridad del padrón        | **04**      | KPI-01 … KPI-05, CA-01 … CA-03                     |
| CP-02 | Vigencia de autorización     | **05**      | RN-01, RN-05, RN-13, RN-22, CA-04 … CA-07          |
| CP-03 | Lista negra                  | **05**      | RN-06, RN-07, CA-13                                |
| CP-04 | Desacople de proveedor       | **05** · 14 | RN-12, KPI-11, KPI-12, CA-12                       |
| CP-05 | Horario y aforo              | **07**      | RN-14, CA-14, CA-15, KPI-15                        |
| CP-06 | Consentimiento y supresión   | **08**      | RN-09 … RN-11, CA-08 … CA-11                       |
| CP-07 | Integridad de auditoría      | **06**      | RN-02, RN-03, RN-08, CA-23, KPI-22 … KPI-24        |
| CP-08 | Escalamiento y alertas       | **06**      | RN-18, CA-18, KPI-25 … KPI-27                      |
| CP-09 | Continuidad y reconciliación | **12**      | RN-16, RN-17, CA-21, CA-22, KPI-28 … KPI-31        |
| CP-10 | Operación remota             | **10** · 15 | RN-08, RN-18, CA-19, CA-20, KPI-32 … KPI-35        |
| CP-11 | Aislamiento multiempresa     | **03** · 13 | RN-15, RN-20, RN-21, CA-24, CA-25, KPI-36 … KPI-38 |

**11 de 11 asignados.**

---

## 8. Problemas AS-IS → dónde se resuelven

| PB    | Problema                                                                         | Se resuelve con                                         | Etapa            |
| ----- | -------------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------- |
| PB-01 | La autorización depende de una llamada a portería y de que el residente conteste | Autorización previa desde la app, con vigencia          | **11** · 05      |
| PB-02 | Registro manual en libreta, sin evidencia fotográfica                            | Evento inmutable con evidencia por cada intento         | **06**           |
| PB-03 | Autorizaciones sin vigencia: quien entró una vez vuelve indefinidamente          | VO `Vigencia` + `PolíticaVigencia`                      | **05**           |
| PB-04 | El operador no puede bloquear zonas comunes remotamente                          | Zona con interruptor de apertura y reglas configurables | **07** · 09      |
| PB-05 | Alta y baja de rostros y placas depende de personal técnico con HikCentral       | Alta desde la app y sincronización automática           | **08** · 11 · 15 |
| PB-06 | No queda constancia de quién autorizó cada ingreso                               | `Acceso` con actor, regla aplicada y atribución         | **06**           |

---

## 9. Pantallas → etapa · HU

| Pantalla                                       | Superficie  | Rol                     | Etapa       | HU                          |
| ---------------------------------------------- | ----------- | ----------------------- | ----------- | --------------------------- |
| W-01 Login _(+MFA, +copropiedad)_              | Web         | Todos                   | **09** · 03 | HU-36, HU-37                |
| W-02 Dashboard operativo                       | Web         | Administrador           | **09**      | HU-32, HU-38                |
| W-03 Viviendas                                 | Web         | Administrador           | **09**      | HU-01 … HU-04               |
| W-04 Vehículos y placas                        | Web         | Administrador           | **09**      | HU-05, HU-06                |
| W-05 Visitantes y autorizaciones               | Web         | Administrador           | **09**      | HU-07 … HU-10, HU-35        |
| W-06 Zonas comunes                             | Web         | Administrador           | **09**      | HU-18, HU-20                |
| W-07 Dispositivos                              | Web         | Administrador           | **09**      | HU-38                       |
| W-08 Eventos y alertas                         | Web         | Administrador           | **09**      | HU-24, HU-32                |
| W-10 Informes y auditoría                      | Web         | Administrador           | **09**      | HU-32                       |
| W-09a Consola de portería                      | Web         | Portero                 | **10**      | HU-21 … HU-24               |
| W-09b Consola de guardia virtual               | Web         | Operador de central     | **10**      | HU-25 … HU-29               |
| M-1 Inicio / mi vivienda                       | Móvil       | Residente               | **11**      | HU-33                       |
| M-2 Mi familia                                 | Móvil       | Residente               | **11**      | HU-02, HU-04                |
| M-3 Mis vehículos                              | Móvil       | Residente               | **11**      | HU-05, HU-06                |
| M-4 Nuevo visitante _(+patrón, +zonas, +foto)_ | Móvil       | Residente               | **11**      | HU-07 … HU-09, HU-11, HU-19 |
| M-5 Zonas comunes                              | Móvil       | Residente               | **11**      | HU-19                       |
| M-6 Historial                                  | Móvil       | Residente               | **11**      | HU-33                       |
| M-7 Notificaciones                             | Móvil       | Residente               | **11**      | HU-34                       |
| M-8 Mi perfil                                  | Móvil       | Residente               | **11**      | HU-37                       |
| **N-1 Captura de rostro** _(nueva)_            | Móvil       | Residente               | **08** · 11 | HU-11, HU-13                |
| **N-2 Consentimiento del visitante** _(nueva)_ | Web pública | **Visitante (titular)** | **08**      | HU-12, HU-15                |

Dos pantallas nuevas, ambas derivadas de hallazgos M-02 y M-03.

---

## 10. Verificación de la Definición de Terminado

| Requisito del DoD                                 | Resultado                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| **38 HU asignadas a etapa concreta**              | ✅ 38/38 — §3                                                             |
| **26 CA asignados a etapa concreta**              | ✅ 26/26 — §4                                                             |
| **37 KPI asignados a etapa concreta**             | ✅ 37/37 — §5 (9 requieren hardware, todos asignados a la ETAPA 15)       |
| **Ninguno huérfano**                              | ✅ Verificado por reparto y suma en las tres tablas                       |
| **22 RN con etapa**                               | ✅ 22/22 — §2                                                             |
| **5 CU con etapa**                                | ✅ 5/5 — §6                                                               |
| **11 CP con etapa**                               | ✅ 11/11 — §7                                                             |
| **6 PB con solución identificada**                | ✅ 6/6 — §8                                                               |
| **Toda contradicción documentada con resolución** | ✅ 14 contradicciones y 11 pendientes en `contradicciones-y-supuestos.md` |
