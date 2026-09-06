# 02 · Auditoría de la arquitectura propuesta

**Insumos auditados:**
- `docs/insumos/arquitectura_nextresidential_ddd.pdf` — 1 página, «Capas DDD», texto extraíble íntegro
- `docs/insumos/diagrama_arquitectura_nextresidential_ddd.json` — export de Lucidchart, **4 páginas**, 91 formas y 25 conectores

**Autoridad:** alta. Vinculante salvo contradicción con el PDF del reto o con el documento de requisitos.

> **Hallazgo de alcance.** El contrato (`CLAUDE.md` §3) anticipaba un diagrama de una sola vista —«1. Capas DDD»—. El JSON contiene **cuatro**: `1. Capas DDD` (59 formas), `2. Mapa de contextos` (13), `3. Agregados y objetos de valor` (10), `4. Flujo CU-01 por capas` (9). Las páginas 2, 3 y 4 no estaban previstas y aportan material decisivo: el mapa de subdominios, las firmas completas de los agregados con sus invariantes anotadas, y la secuencia de CU-01 atravesando las capas. Esta auditoría las incorpora.

---

## 1. Las cinco capas — reconstrucción y validación

| Capa | Definición textual del diagrama | Prohibición | Validada |
|---|---|---|---|
| **Presentación** (driving) | «adaptadores de entrada. Traducen protocolo a casos de uso. No contienen reglas de negocio» | Cero reglas de negocio | ✅ |
| **Aplicación** | «orquesta casos de uso, transacciones e idempotencia. Define los puertos. **No decide accesos**» | No decide | ✅ |
| **Dominio** | «el núcleo. Cero IO, cero dependencias. **Idéntica en la nube y en el Edge Gateway**» | Cero I/O | ✅ |
| **Infraestructura** (driven) | «adaptadores de salida. Implementan los puertos que define el dominio» | No define contratos | ✅ |
| **Física** | «hardware Hikvision. **Ejecuta, nunca decide**» | No decide | ✅ |

**Dirección de dependencia**, leída de los conectores del diagrama:

```
Presentación ──depende de──▶ Aplicación ──depende de──▶ Dominio ◀──implementa los puertos── Infraestructura
                                                                    (inversión de dependencias)
Infraestructura ──comanda ISAPI──▶ Física
```

Ninguna flecha sale del dominio. **Coincide exactamente con `CLAUDE.md` §2.2.**

### 1.1 Contenido por capa, verificado contra el diagrama

**Presentación — 6 adaptadores.** App móvil Flutter · Consola de administración · Consola de portería · Consola de guardia virtual · **Alarm Server HTTP** (recibe el POST multipart de la cámara: XML del evento, foto y recorte de placa) · Trabajadores programados (supresión, sincronización, reintentos).

> Que el **Alarm Server** viva en presentación y no en infraestructura es una decisión correcta y no obvia: es un adaptador *de entrada* —la cámara empuja hacia nosotros—, aunque hable con hardware. Su responsabilidad es traducir un POST a un caso de uso, nunca decidir. Se construye en la ETAPA 15; su **contrato de evento normalizado** se define en la ETAPA 05 para que la 15 solo lo conecte.

**Aplicación — 6 familias de casos de uso + 3 grupos de puertos + 3 servicios transversales.**

| Familia | Casos de uso del diagrama | Etapa |
|---|---|---|
| Padrón | `CrearVivienda`, `RegistrarResidente`, `RegistrarVehiculo`, `DesactivarVivienda` | 04 |
| Autorizaciones | `CrearAutorizacion`, `CrearRecurrente`, `AgregarAcompanante`, `Revocar` | 05 |
| Acceso | `ResolverAcceso`, `AperturaManual`, `AperturaRemota`, `ConsultarHistorial` | 05 · 06 · 10 |
| Biometría | `CapturarRostro`, `SolicitarConsentimiento`, `Sincronizar`, `SuprimirPlantilla` | 08 |
| Zonas | `ConfigurarZona`, `AutorizarZonaAVisitante`, `ValidarAforo`, `LiberarAforo` | 07 |
| Vigilancia | `AtenderIntercom`, `ContactarResidente`, `EscalarEvento`, `GenerarAlerta` | 10 · 06 |

Transversales: DTOs y mapeadores («el agregado nunca sale crudo») · Manejadores de eventos de dominio · Políticas de aplicación (unidad de trabajo, idempotencia, reintento, **aislamiento por copropiedad**).

**Dominio.** Agregados, objetos de valor, `MotorDeReglas`, políticas, eventos de dominio, especificaciones y fábricas. Detalle en §2 y §3.

**Infraestructura — 12 adaptadores.** Repositorios Supabase (RLS por copropiedad, tabla `eventos` particionada por mes) · Supabase Auth (JWT con claims, MFA TOTP) · Supabase Storage (buckets privados, URLs firmadas) · Supabase Realtime · Colas pg-boss · Edge Gateway SQLite · **HikvisionProvider** · **MockProvider** · Descubrimiento ONVIF · go2rtc · Puente de intercom · Firebase Cloud Messaging.

**Física — 6 equipos.** Cámara LPR («**modo evento**: reporta placa y foto. NO decide la apertura por sí misma») · Terminal facial · Talanquera («se acciona por relé, **siempre por orden del software**») · Torniquete y puertas · Intercom/videoportero · Controlador de E/S («relés y sensores. Reporta sabotaje y estado de puerta»).

---

## 2. Agregados raíz — **discrepancia relevante**

`CLAUDE.md` §2.2 declara **seis** agregados raíz «del diagrama, vinculantes»: `Copropiedad`, `Vivienda`, `Autorización`, `Acceso`, `Consentimiento`, `Zona`. La página 1 del diagrama muestra exactamente esos seis. **La página 3 del JSON muestra nueve.**

| Agregado | Página 1 | Página 3 | En `CLAUDE.md` §2.2 |
|---|---|---|---|
| `Copropiedad` | ✅ | ✅ | ✅ |
| `Vivienda` | ✅ | ✅ | ✅ |
| `Autorizacion` | ✅ | ✅ | ✅ |
| `Acceso` | ✅ | ✅ | ✅ |
| `Zona` | ✅ | ✅ | ✅ |
| `ConsentimientoBiometrico` | ✅ («Consentimiento») | ✅ | ✅ (como «Consentimiento») |
| **`PlantillaBiometrica`** | ❌ | ✅ | ❌ |
| **`ListaNegra`** | ❌ | ✅ «raíz de agregado» | ❌ |
| **`Dispositivo`** | ❌ | ✅ «raíz de agregado» | ❌ |

### `[CONTRADICCIÓN]` C-02 — el contrato cita seis raíces; su propia fuente declara nueve

**Diagnóstico.** No es un desacuerdo de criterio: `CLAUDE.md` §2.2 dice explícitamente que la lista proviene del diagrama, y el diagrama —en la vista que se dedica precisamente a los agregados— declara tres raíces más. La lista del contrato es un **resumen de la página 1**, no el inventario completo.

**Por qué importa, y mucho.** Sin `ListaNegra` y sin `Dispositivo` como agregados, **cinco reglas de negocio se quedan sin lugar donde vivir**:

- **RN-06** (precedencia absoluta de la lista negra) y **RN-07** (solo administrador u operador crean o levantan listas negras) no tienen agregado que sostenga sus invariantes. `PolíticaListaNegra` es una política del motor de reglas: *aplica* la lista, no la *gobierna*. Quién puede crearla y cómo se levanta es una invariante de agregado.
- **RN-21** (credenciales de dispositivo nunca expuestas) necesita un agregado que encapsule `credencialRef` como referencia a bóveda, nunca como valor.
- **CA-26** (terminal marcada como caída tras el umbral) necesita estado y latido en algún sitio.
- **RN-12** («no decide accesos, solo ejecuta») es, en la página 3, una invariante anotada del propio `Dispositivo`.

**Resolución.** Se adoptan **nueve agregados raíz**, la granularidad de la página 3. Los seis de `CLAUDE.md` §2.2 son un subconjunto correcto pero incompleto; los tres adicionales no contradicen nada, llenan huecos reales. Se propone la corrección de §2.2 al usuario; entretanto se construye con nueve y se deja constancia. Registrado como **C-02** en `contradicciones-y-supuestos.md`.

### 2.1 Los nueve agregados con sus invariantes (página 3 del diagrama)

| Agregado | Campos clave | Métodos de intención | Invariantes anotadas | RN |
|---|---|---|---|---|
| **`Copropiedad`** | `nombre`, `nit`, `zonaHoraria`, `versionReglas`, `estado` | `registrarZona`, `registrarDispositivo`, `publicarReglas` | Frontera de aislamiento | RN-15 |
| **`Vivienda`** | `copropiedadId`, `identificador`, `residentes[]`, `vehiculos[]`, `estado` | `agregarResidente`, `registrarVehiculo`, `desactivar` | Una placa activa por vivienda · Inactiva no genera autorizaciones | RN-04, RN-13 |
| **`Autorizacion`** | `viviendaId`, `visitante`, `placa?`, `vigencia`, `patron?`, `zonas[]`, `acompanantes[]` | `crear`, `revocar(motivo)`, `estaVigenteEn`, `permiteZona` | Solo hacia la propia vivienda | RN-05, RN-01, RN-22 |
| **`Acceso`** | `ocurridoEn`, `dispositivoId`, `zonaId?`, `resultado`, `reglaAplicada`, `versionReglas`, `evidencia`, `claveIdempotencia` | `registrar` (**y nada más**) | **INMUTABLE, sin setters** · Siempre con actor y dispositivo · Clave única por copropiedad | RN-02, RN-03, RN-17 |
| **`ConsentimientoBiometrico`** | `titularId`, `finalidad`, `otorgadoEn`, `versionPolitica`, `medio`, `evidencia`, `estado` | `otorgar`, `revocar`, `estaVigente` | **El titular es el visitante** · Previo a sincronizar | RN-09, RN-10 |
| **`PlantillaBiometrica`** | `personaId`, `consentimientoId`, `calidad`, `sincronizadaEn?`, `suprimirEn`, `estado` | `sincronizar(terminal)`, `programarSupresion`, `suprimir` | No sincroniza sin consentimiento · Supresión antes de 24 h | RN-09, RN-11 |
| **`Zona`** | `tipo`, `horario[]`, `aforo`, `controladores[]` | `admiteIngreso`, `incrementarAforo`, `liberarAforo`, `reiniciarConteo` | El aforo nunca supera el máximo | RN-14 |
| **`ListaNegra`** | `personaId?`, `placa?`, `motivo`, `creadaPor`, `estado` | `incluir`, `levantar(usuario)`, `contiene(placa)` | Precedencia sobre autorizaciones · Solo admin u operador | RN-06, RN-07 |
| **`Dispositivo`** | `tipo`, `zonaId`, `host`, `credencialRef`, `estado`, `ultimoLatido` | `sincronizar`, `marcarCaido`, `estaSaludable` | **Credencial nunca en claro** · No decide accesos, solo ejecuta | RN-21, RN-12 |

**Observación de diseño.** `ConsentimientoBiometrico` y `PlantillaBiometrica` son agregados **separados** y esto es deliberado: tienen ciclos de vida distintos y razones de cambio distintas. El consentimiento pertenece al titular y puede revocarse en cualquier momento; la plantilla pertenece al sistema y se suprime como consecuencia. Fundirlos haría imposible expresar «consentimiento revocado, plantilla aún presente en terminal» —que es justamente el estado transitorio que RN-11 obliga a cerrar en menos de 24 h—.

---

## 3. Objetos de valor — **seis, coinciden**

| VO | Definición del diagrama | Regla de construcción |
|---|---|---|
| `Placa` | «Inmutable. Se **normaliza al construir**: mayúsculas, sin separadores» | Normalización en el constructor, no en el repositorio (base de KPI-02, RN-04) |
| `Vigencia` | «Desde y hasta **con zona horaria**. Método `contiene(instante)`» | `tstzrange` en base; la zona horaria es la de la copropiedad |
| `PatronRecurrencia` | «Días de la semana y franjas horarias. Método `aplicaEn(instante)`» | RN-22, CA-06 |
| `Aforo` | «Máximo y conteo. Invariante: el conteo nunca supera el máximo» | RN-14, CA-14 |
| `ResultadoAcceso` | «Permitido o negado con **motivo tipado**: `VIGENCIA_EXPIRADA`, `AFORO_SUPERADO`…» | Errores tipados de §2.4; prohibido `null` como señal |
| `VersionDeReglas` | «Sella con qué reglas se decidió. **Clave para auditar decisiones del Edge**» | RN-16, CA-21, KPI-31 |

Coinciden exactamente con `CLAUDE.md` §2.2. El catálogo completo de motivos del contrato —nueve valores— extiende el ejemplo del diagrama sin contradecirlo.

---

## 4. Puertos — tres grupos, catorce puertos

| Grupo | Puertos | Adaptador previsto | Etapa |
|---|---|---|---|
| **Repositorio** | `ViviendaRepo`, `AutorizacionRepo`, `ZonaRepo`, `EventoRepo`, `ReglaRepo` | Repositorios Supabase · SQLite en el Edge | 01 · 02 · 12 |
| **Proveedor** | `AccessPointProvider`, `PlateEventSource`, `FaceTemplateProvider`, `IntercomProvider` | `MockProvider` (05) · `HikvisionProvider` (15) | 05 · 15 |
| **Soporte** | `Reloj`, `GeneradorDeId`, `Notificador`, `AlmacenEvidencia`, `Bitacora` | Sistema · UUID · FCM · Supabase Storage · logger estructurado | 02 · 06 |

**Verificación ISP:** los cuatro puertos de proveedor están segregados por capacidad —punto de acceso, fuente de eventos de placa, plantillas faciales, intercom—, no fundidos en un `HardwareService`. `MockProvider` implementa los cuatro sin lanzar `NotImplemented`.

### 4.1 Huecos detectados: puertos sin adaptador previsto

| Hueco | Diagnóstico | Resolución |
|---|---|---|
| **`ListaNegraRepo` no existe** | El diagrama declara `ListaNegra` como agregado raíz (pág. 3) pero no lista un repositorio para él | Se añade `ListaNegraRepo` al grupo de repositorio. ETAPA 05 |
| **`DispositivoRepo` no existe** | Mismo caso con `Dispositivo` | Se añade `DispositivoRepo`. ETAPA 01 (tabla) · 05 (puerto) |
| **`ConsentimientoRepo` / `PlantillaRepo` no existen** | Dos agregados de la ETAPA 08 sin repositorio declarado | Se añaden en la ETAPA 08 |
| **Descubrimiento ONVIF sin puerto** | Aparece en infraestructura (pág. 1) sin puerto de dominio que lo invoque | Correcto: es una **herramienta de aprovisionamiento**, no una capacidad de dominio. Se expone como caso de uso administrativo que habla directo al adaptador. ETAPA 15 |
| **go2rtc y Puente de intercom sin puerto propio** | Ambos aparecen en infraestructura | Correcto por diseño: **go2rtc** sirve un flujo de vídeo al navegador y nunca cruza el dominio; el **puente de intercom** es parte de la implementación de `IntercomProvider`, no un puerto aparte. Ver §7 |
| **FCM sin puerto propio** | Aparece en infraestructura | Correcto: implementa el puerto de soporte `Notificador` |

---

## 5. Políticas — tres, coinciden, con una precisión de precedencia

| Política | Enunciado del diagrama | RN |
|---|---|---|
| `PoliticaListaNegra` | «Precedencia absoluta: gana sobre cualquier autorización vigente» | RN-06 |
| `PoliticaZona` | «Horario y aforo se validan aunque la persona tenga permiso» | RN-14 |
| `PoliticaConsentimiento` | «Sin consentimiento vigente del titular no hay sincronización» | RN-09, RN-10 |

La página 3 añade un dato que la página 1 no da y que es **normativo para el motor de reglas**:

```
MotorDeReglas · servicio de dominio
  # Precedencia: listaNegra > vigencia > patrón > zona
```

Esta cadena de precedencia es vinculante para la ETAPA 05. Implica que las políticas no son un conjunto conmutable: se evalúan en orden, y la primera que niega determina el motivo del `ResultadoAcceso`. Es lo que hace que un visitante en lista negra **con autorización vigente** produzca motivo `LISTA_NEGRA` y no `VIGENCIA_EXPIRADA`, que es exactamente lo que CA-13 exige poder demostrar.

El diagrama también fija la naturaleza del servicio, coherente con §2.4 del contrato: *«(sin estado) · (sin acceso a base de datos) · (sin red, sin reloj interno) · Reloj e identificadores se inyectan · Idéntico en la nube y en el Edge»*, con firma `evaluarAcceso(ctx, reglas): Decision` y cuatro verificadores privados.

**Políticas que el diagrama no declara y el negocio necesita.** `CLAUDE.md` §6 (ETAPA 05) nombra además `PolíticaVigencia` (RN-01), `PolíticaRecurrencia` (RN-22) y `PolíticaVivienda` (RN-05). En el diagrama esas tres aparecen como los verificadores privados del motor (`verificarVigencia`, `verificarPatron`, más la comprobación de vivienda). **No hay contradicción**: son la misma lógica expresada con granularidad distinta. Se construyen como `Specification` componibles —una por regla, con combinadores `and`/`or`/`not`—, lo que satisface OCP: agregar una regla no debe producir diff en `MotorDeReglas`.

---

## 6. Eventos de dominio

Cuatro declarados: `AccesoResuelto`, `AutorizacionRevocada`, `ConsentimientoRevocado`, `PlantillaSuprimida`.

Los manejadores de la capa de aplicación «reaccionan a eventos de dominio: notificar, escalar, programar supresión».

**Cobertura verificada frente a lo que el negocio exige:**

| Evento | Consume | Cubre |
|---|---|---|
| `AccesoResuelto` | Realtime a consolas · push al residente · escalamiento si es crítico | RN-02, RN-18, HU-34, CA-18 |
| `AutorizacionRevocada` | Invalidación de caché · propagación al Edge · supresión de plantilla asociada | CA-07 (< 60 s), RN-11 |
| `ConsentimientoRevocado` | Supresión inmediata en todas las terminales | RN-11, CA-11 |
| `PlantillaSuprimida` | Registro de auditoría de la supresión | CA-10, KPI-21 |

**Hueco detectado.** No hay evento para el **cambio de estado de un dispositivo**. CA-26 exige que una terminal que supera el umbral sin reportarse aparezca marcada como caída *y que se haya generado la alerta correspondiente*; RN-18 escala «dispositivo caído» como evento crítico. Sin un evento de dominio, esa alerta quedaría acoplada a un `job` de infraestructura.
**Resolución:** se añade **`DispositivoDegradado`** (con `estadoAnterior`, `estadoNuevo`, `ultimoLatido`) al catálogo de eventos de dominio, emitido por el agregado `Dispositivo`. ETAPA 06.

Segundo hueco menor: no hay evento para **aforo alcanzado**, que sería útil para la consola de zonas. Se considera **opcional**, no exigido por ninguna RN ni CA; no se añade para no inflar el catálogo sin requisito que lo respalde.

---

## 7. ADR-01 · Verificación de encapsulamiento del intercom

**Pregunta a responder:** ¿queda ISAPI TwoWayAudio correctamente encapsulado tras `IntercomProvider`?

**Respuesta: sí, y el diagrama lo confirma en tres puntos independientes.**

1. **El puerto está en el grupo correcto.** `IntercomProvider` figura entre los «Puertos de proveedor» de la capa de **aplicación**, junto a `AccessPointProvider`, `PlateEventSource` y `FaceTemplateProvider`. El dominio lo declara; la infraestructura lo implementa.
2. **La firma del puerto no menciona protocolo.** `abrirSesion(dispositivoId, operadorId)`, `enviarAudio(chunk)`, `recibirAudio()`, `cerrarSesion(motivo)`, `estadoSesion()`. Ninguna de las cinco operaciones nombra TwoWayAudio, ISAPI, SIP, códec ni canal. Es intención pura. **El dominio no sabe qué es TwoWayAudio.**
3. **El protocolo vive donde debe.** «Puente de intercom» está en la capa de **infraestructura**, y `HikvisionProvider` es «el único punto que toca el hardware».

**La prueba definitiva del encapsulamiento** es la propia contingencia de ADR-01: si el modelo concreto no soportara TwoWayAudio o excediera el umbral de latencia, la salida es **un adaptador nuevo detrás del mismo puerto**, sin tocar dominio, aplicación ni interfaz. Que esa salida sea posible sin modificar nada aguas arriba es la demostración de que el encapsulamiento es real y no nominal.

**Consecuencias de ADR-01 que el diagrama no cubre y las etapas 10 y 15 deben resolver:**

| Consecuencia | Por qué | Etapa |
|---|---|---|
| **Exclusividad del canal** | Un canal TwoWayAudio suele ser exclusivo por dispositivo: hacen falta bloqueo, cola de espera y liberación por *timeout* para que dos operadores no colisionen | 10 (simulado) · 15 (real) |
| **Semiduplex** | Algunos modelos no soportan duplex completo: la consola debe indicar visualmente el turno de palabra | 10 |
| **Vídeo por camino separado** | RTSP → go2rtc → WebRTC. Audio y vídeo se sincronizan **en la consola**, no en el dispositivo | 10 · 15 |
| **La apertura remota no viaja por el canal de audio** | Es una orden independiente por `AccessPointProvider`, atribuida al operador y auditada | 10 · 15 |

> **Nota sobre C-01.** La caja «Puente de intercom» del diagrama dice literalmente *«ISAPI TwoWayAudio, o SIP con Asterisk si el modelo no lo soporta»*, dejando ambas rutas abiertas, mientras §13.2 del documento de requisitos propone SIP + LiveKit/Janus. ADR-01 cierra la decisión a favor de TwoWayAudio. El diagrama no contradice la decisión: la contiene como primera opción. Ver `ADR-001`.

---

## 8. Mapa de contextos (página 2) — material nuevo

El diagrama clasifica los contextos delimitados en tres estratos, con una indicación explícita de dónde invertir esfuerzo de diseño.

### Subdominio núcleo — «la ventaja competitiva. Aquí va el mejor esfuerzo de diseño»

**`Control de acceso`** — motor de reglas, decisión y evento inmutable. Lenguaje ubicuo: acceso, apertura, decisión, motivo, versión de reglas.
> *«Es el único contexto que decide. Todos los demás le proveen contexto o ejecutan su salida.»*

### Subdominios de soporte — «propios del negocio, se construyen pero no diferencian por sí solos»

| Contexto | Lenguaje ubicuo | Relación con el núcleo |
|---|---|---|
| `Padrón` | copropiedad, vivienda, residente, vehículo | **Río arriba** — «provee titulares y placas» |
| `Autorizaciones` | autorización, visitante, vigencia, recurrencia, lista negra | **Río arriba** — «provee permisos vigentes» |
| `Zonas y aforo` | zona, horario, aforo, contador | **Río arriba** — «provee restricciones de zona» |
| `Biometría y consentimiento` | plantilla, consentimiento, supresión | **Contexto con carga legal propia** — «provee identidad del rostro» |
| `Dispositivos e integración` | dispositivo, proveedor, sincronización, salud | **Capa anticorrupción del núcleo** — «ordena la ejecución» |
| `Vigilancia y alertas` | alerta, sesión de atención, escalamiento | **Río abajo** — «publica eventos y escalamientos» |

### Subdominios genéricos — «resueltos con terceros. **No invertir esfuerzo de diseño aquí**»

| Contexto | Tercero | Relación |
|---|---|---|
| `Identidad y multiempresa` | Supabase Auth con claims y MFA — *«No construir un sistema de identidad propio»* | «autentica y aísla por copropiedad» |
| `Notificaciones` | Firebase Cloud Messaging | «entrega alertas» |
| `Almacenamiento de evidencia` | Supabase Storage con buckets privados y URLs firmadas | «guarda la evidencia» |

**Consecuencias operativas de este mapa, que gobiernan el reparto de esfuerzo entre etapas:**

1. **`Dispositivos e integración` es una capa anticorrupción.** No es un contexto más: su función es impedir que el vocabulario de Hikvision se filtre al núcleo. Refuerza RN-12 y KPI-11 desde el diseño de contextos, no solo desde el linter.
2. **`Biometría y consentimiento` tiene carga legal propia**, lo que justifica que la ETAPA 08 produzca un documento normativo específico (`ciclo-vida-biometrico.md`) y no solo código.
3. **No construir identidad propia.** La ETAPA 03 integra Supabase Auth; no implementa emisión de tokens, hash de contraseñas ni gestión de sesiones desde cero. El esfuerzo va al *aislamiento*, no a la autenticación.
4. **Alineación con la matriz de evaluación.** El núcleo —motor de reglas y evento inmutable— es donde el diagrama pide el mejor esfuerzo, y coincide con el 25 % de «arquitectura y calidad del código». No es casualidad: es el mismo criterio expresado dos veces.

---

## 9. Flujo de CU-01 por capas (página 4) — material nuevo

Ocho pasos que atraviesan las cuatro capas de software. Es la especificación de secuencia que la ETAPA 05 debe reproducir con `MockProvider` y la ETAPA 15 con hardware real.

| # | Paso | Capa | Detalle del diagrama |
|---|---|---|---|
| 1 | **Cámara LPR** | Física | Detecta placa y envía POST multipart con XML, foto y recorte |
| 2 | **Alarm Server** | Presentación | **Valida firma**, guarda evidencia y arma el comando |
| 3 | **`ResolverAcceso`** | Aplicación | Abre unidad de trabajo y **clave de idempotencia** |
| 4 | **Repositorios** | Aplicación → Infra | Cargan autorización, lista negra, zona y reglas vigentes · *«vía puerto de repositorio»* |
| 5 | **`MotorDeReglas`** | Dominio | `evaluarAcceso` → `Decision` con motivo tipado · *«contexto completo»* |
| 6 | **Orquestación** | Aplicación | Si permite: ordena apertura. Si niega: registra y notifica · *«Decision»* |
| 7 | **`HikvisionProvider`** | Infraestructura | Abre el relé por ISAPI. **Dos reintentos ante fallo** · *«vía puerto de proveedor»* |
| 8 | **Persistencia** | Infraestructura | Evento inmutable + Realtime a consolas + push al residente · *«push, no polling»* |

**Anotación de latencia del propio diagrama:** *«menos de 3 s en total»* sobre el tramo final. Es KPI-13, y el diagrama lo sitúa como presupuesto **de extremo a extremo**, no solo del accionamiento del relé. La ETAPA 14 debe instrumentar los ocho pasos para poder demostrarlo.

**Tres detalles que solo aparecen aquí y son vinculantes:**

- **Paso 2 — «valida firma».** El Alarm Server debe **autenticar el POST de la cámara** antes de procesarlo. No estaba en ningún requisito ni RN. Sin esto, el endpoint de ingesta acepta eventos de acceso de cualquiera que alcance la URL —una vulnerabilidad crítica—. Se incorpora como requisito de seguridad en `04-requisitos-no-funcionales.md` (**RNF-03**) y se implementa en la ETAPA 15, con el contrato definido en la 05.
- **Paso 3 — la clave de idempotencia se abre en el caso de uso**, no en la base ni en el proveedor. Coherente con RN-17 y con el manejo de la excepción 2a de CU-01 (evento duplicado se descarta sin generar evento de acceso).
- **Paso 7 — «dos reintentos»**, exactamente los que CU-01 excepción 5a exige. La política de reintentos es de infraestructura y configurable, con el valor 2 como línea base.

---

## 10. Verificación: ¿cada una de las 22 RN tiene dónde vivir?

**Sí, las 22 tienen lugar** — pero cinco de ellas solo después de incorporar los tres agregados adicionales de la página 3 (C-02) y una necesita un evento de dominio nuevo (§6).

| RN | Enunciado abreviado | Dónde vive | Mecanismo | Etapa |
|---|---|---|---|---|
| RN-01 | Autorización vencida no habilita acceso | `Autorizacion.estaVigenteEn` + `PoliticaVigencia` | VO `Vigencia` | 05 |
| RN-02 | Todo intento genera evento completo | `Acceso` · invariante «siempre con actor y dispositivo» | Agregado + NOT NULL | 06 |
| RN-03 | Eventos inmutables | `Acceso` sin setters **+ `REVOKE UPDATE, DELETE`** | ADR-005 | 01 · 06 |
| RN-04 | Una placa por vivienda activa | `Vivienda` **+ índice único parcial** | ADR-004 | 01 · 04 |
| RN-05 | Residente autoriza solo su vivienda | `Autorizacion` · invariante de agregado | Fábrica + RLS | 05 |
| RN-06 | Lista negra con precedencia absoluta | **`ListaNegra`** + `PoliticaListaNegra` (primera en la cadena) | **Requiere C-02** | 05 |
| RN-07 | Solo admin u operador gestionan lista negra | **`ListaNegra.incluir/levantar`** + guard RBAC | **Requiere C-02** | 05 |
| RN-08 | Apertura manual exige motivo y atribución | `AperturaManual` / `AperturaRemota` · motivo obligatorio en el caso de uso | DTO + agregado | 10 |
| RN-09 | Consentimiento previo a sincronizar | `PoliticaConsentimiento` + invariante de `PlantillaBiometrica` | Doble barrera | 08 |
| RN-10 | El consentimiento lo otorga el visitante | `ConsentimientoBiometrico` · invariante «el titular es el visitante» | Agregado | 08 |
| RN-11 | Supresión en 24 h al vencer o revocar | `PlantillaBiometrica.programarSupresion/suprimir` + pg-boss | Agregado + cola | 08 |
| RN-12 | La UI no invoca hardware | Frontera de capas + invariante de `Dispositivo` | Linter + KPI-11 | 02 · 05 |
| RN-13 | Vivienda inactiva no genera autorizaciones | `Vivienda` · invariante | Agregado | 04 |
| RN-14 | Zona: aforo y horario mandan | `Zona.admiteIngreso` + `Aforo` + `PoliticaZona` | VO + política | 07 |
| RN-15 | Aislamiento entre copropiedades | `Copropiedad` como frontera + RLS + validación en aplicación | **Doble camino** | 01 · 03 |
| RN-16 | Edge decide con caché y marca la versión | `VersionDeReglas` sellada en `Acceso` | VO | 12 |
| RN-17 | Idempotencia en la reconciliación | `Acceso.claveIdempotencia` · invariante «única por copropiedad» | Índice único | 12 |
| RN-18 | Escalamiento automático de eventos críticos | Manejador de `AccesoResuelto` **+ `DispositivoDegradado`** | **Requiere §6** | 06 |
| RN-19 | Sin borrado físico con historial | `desactivar()` + trigger que impide `DELETE` | Base de datos | 01 · 04 |
| RN-20 | MFA para roles administrativos | Supabase Auth + guard | Infra + guard | 03 |
| RN-21 | Credenciales de dispositivo fuera del frontend | **`Dispositivo.credencialRef`** · invariante «nunca en claro» | **Requiere C-02** | 05 · 15 |
| RN-22 | Recurrente se evalúa contra su patrón | `PatronRecurrencia.aplicaEn` + `PoliticaRecurrencia` | VO + política | 05 |

**Cero reglas huérfanas.**

---

## 11. Huecos del diagrama — resumen

| # | Hueco | Tipo | Resolución | Etapa |
|---|---|---|---|---|
| H-01 | `ListaNegra` y `Dispositivo` ausentes de la lista de raíces del contrato | Agregado sin declarar | Se adoptan 9 raíces (C-02) | 02 |
| H-02 | `ListaNegraRepo`, `DispositivoRepo`, `ConsentimientoRepo`, `PlantillaRepo` no declarados | Puerto faltante | Se añaden | 01 · 05 · 08 |
| H-03 | Sin evento de dominio para cambio de estado de dispositivo | Evento faltante | Se añade `DispositivoDegradado` | 06 |
| H-04 | «Valida firma» del Alarm Server sin requisito que lo respalde | Requisito no funcional implícito | Se formaliza como RNF-03 | 05 · 15 |
| H-05 | Precedencia `listaNegra > vigencia > patrón > zona` solo en pág. 3 | Regla no elevada a RN | Se declara vinculante para el motor | 05 |
| H-06 | ONVIF sin puerto de dominio | Aparente hueco | **No es hueco**: es aprovisionamiento, no capacidad de dominio | 15 |
| H-07 | `Copropiedad` no declara invariante sobre `versionReglas` | Invariante implícita | `publicarReglas` incrementa monótonamente la versión; se explicita | 05 |

---

## 12. Conclusión

La arquitectura del diagrama es **coherente, completa y consistente** con `CLAUDE.md` §2.2, con una salvedad de fondo y varias de detalle:

- **Las cinco capas, la dirección de dependencia y la inversión de dependencias se validan sin reservas.**
- **Los seis objetos de valor, los tres grupos de puertos y las tres políticas coinciden exactamente.**
- **La discrepancia relevante es C-02:** el contrato cita seis agregados raíz donde su fuente declara nueve. Los tres faltantes —`PlantillaBiometrica`, `ListaNegra`, `Dispositivo`— no son adorno: sin ellos, RN-06, RN-07, RN-12, RN-21 y CA-26 no tienen invariante que las sostenga.
- **ADR-01 queda correctamente encapsulado** tras `IntercomProvider`, verificado en tres puntos independientes del diagrama.
- **Las 22 RN tienen lugar donde vivir**, cinco de ellas condicionadas a adoptar C-02.
- **Las páginas 2, 3 y 4 del JSON son material nuevo y vinculante:** el mapa de contextos fija dónde invertir esfuerzo, la página 3 fija las invariantes por agregado y la cadena de precedencia del motor, y la página 4 fija la secuencia de CU-01 con dos requisitos que ningún otro insumo menciona —validación de firma en el Alarm Server y presupuesto de latencia de extremo a extremo—.
