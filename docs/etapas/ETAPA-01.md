# Informe de cierre · ETAPA 01 — Modelo de datos y Supabase

- **Rama:** `etapa-01-modelo-datos-supabase` · **Base:** `develop`
- **Fecha de cierre:** 2026-09-06
- **Contrato:** `CLAUDE.md` v3.0 (con la extensión E-01 aprobada en esta etapa)
- **Ejecutada en dos pasos por indicación del usuario:** 01-A diseño para aprobación · 01-B implementación

---

## 1. Qué se construyó

Un esquema de base de datos que **hace estructuralmente imposible violar las reglas de negocio**, y la guía que permite conectarlo a un proyecto Supabase sin ambigüedad.

El objetivo declarado de la etapa no era «crear las tablas». Era conseguir que la respuesta a *«¿podría alguien con acceso directo a la base violar esta regla?»* sea **no** en todas las reglas donde eso sea expresable. Treinta tablas, ciento setenta y un `CHECK`, ciento ochenta claves foráneas, noventa y cuatro índices únicos y sesenta y cuatro disparadores existen para eso, no para almacenar datos.

Hay un puñado de decisiones donde esa diferencia se ve con claridad. `RN-10` dice que el consentimiento biométrico lo otorga el visitante, no el residente que lo invita: en vez de validarlo en un caso de uso, se **eliminó la columna donde se escribiría la infracción** — no hay dónde registrar «el residente consintió por el visitante». `RN-21` dice que las credenciales de dispositivo nunca se exponen: la columna `credencial_ref` lleva un `CHECK` de formato que hace que **escribir una contraseña literal falle**. `CA-16` dice que sin motivo escrito el sistema no ejecuta la apertura: la restricción del evento hace que una apertura manual sin motivo **no pueda registrarse**, y como RN-02 obliga a que todo intento genere evento, lo que no puede registrarse no puede ocurrir.

Y el esquema se verificó de verdad. No contra una promesa: contra un PostgreSQL 16 real, con las migraciones aplicadas sobre una base vacía, la suite de aislamiento ejecutada como usuario no privilegiado, y **cien inserciones concurrentes reales** compitiendo por la misma placa — una aceptada, noventa y nueve rechazadas, una fila en la base. Eso es KPI-03, y es lo que ningún `SELECT` previo en el código podría haber conseguido.

---

## 2. Cómo se organizó y por qué

*Esta es la sección que hay que leer si solo se va a leer una.*

**Tres niveles de garantía, y una regla para repartir entre ellos.** Estructural (tipo, `NOT NULL`, `CHECK`, `UNIQUE`, permisos), procedural en base (disparador, política) y de aplicación (invariante del agregado). **Toda invariante que pueda violarse por concurrencia o por acceso directo va al nivel 1.** El nivel 3 no sustituye al 1; lo acompaña, porque es donde la regla se lee y se entiende. La tabla de trazabilidad de `modelo-datos.md` §10 dice, regla por regla, en qué nivel quedó y por qué.

**El esquema se derivó de los agregados, no de las pantallas.** Tiene consecuencias visibles: la columna «TIPO» de vehículos del mockup no produjo campo —es una proyección de lectura—, y hay tres tablas que ninguna pantalla muestra. Derivar de las pantallas habría producido un esquema que sirve a la interfaz de hoy y estorba a la de mañana.

**Los supuestos abiertos se convirtieron en columnas, no en constantes.** `umbral_confianza_placa`, `margen_cache_reglas`, `umbral_latido_dispositivo`, `plazo_consentimiento` y `politica_contingencia_edge` viven en `copropiedades` con valor conservador por defecto. Un supuesto escondido en una constante es indistinguible de una decisión tomada; uno en una columna es visible, auditable, corregible sin desplegar y distinto por copropiedad. Cuando Grupo Control resuelva P-02 a P-07, la resolución será un `UPDATE`.

**El contador de aforo se separó de la configuración de la zona, y no por estética.** Con el máximo en `zonas` y el conteo en otra tabla, `conteo_actual <= aforo_maximo` sería un cruce de dos tablas y solo podría garantizarse con un disparador. Juntos en la misma fila es un `CHECK`: RN-14 pasa de «el código lo respeta» a «la base no admite otro estado». Y de paso resuelve la contención de bloqueos —el contador es la fila más escrita en hora punta; la configuración, de las menos— y permite el incremento atómico sin consulta previa, donde cero filas devueltas *es* el aforo superado.

**La idempotencia de la reconciliación no descansa donde parecía.** PostgreSQL exige que el índice único de una tabla particionada incluya la clave de partición, así que sobre `eventos` solo cabe `UNIQUE (copropiedad_id, clave_idempotencia, ocurrido_en)` — que no detendría un reenvío con marca temporal recalculada tras un ajuste de reloj, justo el escenario que RN-17 quiere cubrir. Por eso la garantía real la aporta `bandeja_salida_edge`, sin particionar, con la restricción simple. El índice de `eventos` se conserva como segunda barrera. **Hay una prueba dedicada a este escenario exacto**, porque es el tipo de agujero que solo aparece en producción tras un corte largo.

**La inmutabilidad se implementó con `REVOKE`, no con RLS, y eso importa.** La llave secreta de Supabase **omite RLS por completo**, y tres rutas la usan por diseño. Los permisos de tabla son la capa que esa clave no elude. Es exactamente la razón por la que ADR-005 pide `REVOKE UPDATE, DELETE` y no una política. Verificado: `UPDATE` y `DELETE` sobre `eventos` fallan con `permission denied` para los seis roles.

**Y se cubrió el punto donde esa garantía podía erosionarse en silencio.** Las particiones nuevas **no** heredan las revocaciones del padre. Si el mantenimiento mensual creara particiones sin aplicar el `REVOKE`, dentro de un mes los eventos volverían a ser mutables sin que nadie lo notara. Por eso el `REVOKE` vive **dentro** de la función que crea la partición, y la suite lo comprueba **sobre una partición recién creada**, no solo sobre la del mes en curso.

**Sin partición `DEFAULT`, a sabiendas del coste.** Un evento fuera de rango falla ruidosamente en vez de acabar en un cajón de sastre que no se puede podar, crece sin control y bloquea la creación de particiones solapadas. El precio es mantenimiento programado que crea particiones por adelantado; se paga.

**Las políticas se escribieron sobre `current_setting('request.jwt.claims')` y no sobre `auth.jwt()`.** Son la misma cosa —`auth.jwt()` es un envoltorio de eso—, pero la forma larga hace que el esquema y su suite corran igual sobre un PostgreSQL vacío. El efecto práctico es que **esta etapa pudo verificarse sin credenciales de Supabase**, que es justo lo que el usuario pidió al decir que las cargaría él en `.env`.

**La reversibilidad se resolvió fuera de `supabase/migrations/`.** El CLI de Supabase no tiene *down migrations*. Los guiones viven en `supabase/reversion/`, uno por migración, y el ciclo completo aplicar → revertir → aplicar se ejecutó de principio a fin: cero objetos residuales, y la suite verde otra vez al reaplicar. El de `eventos` exige confirmación explícita, porque revertirlo destruye un registro que RN-03 declara inmutable.

---

## 3. Árbol de archivos

```
supabase/
├─ verificar.sh                          Verificador local: crea base vacía, migra, siembra y prueba
├─ migrations/
│  ├─ ..._0001_extensiones_roles_y_esquemas.sql   pgcrypto, citext, esquemas app y pgboss, roles de Supabase
│  ├─ ..._0002_tipos_enumerados.sql               30 enumerados, incluido FUERA_DE_HORARIO (E-01)
│  ├─ ..._0003_funciones_de_contexto.sql          claims, predicados de alcance, disparadores comunes
│  ├─ ..._0004_tenant_e_identidad.sql             copropiedades, usuarios, roles_usuario
│  ├─ ..._0005_padron.sql                         personas, viviendas, niveles_acceso, residentes,
│  │                                              vehiculos, visitantes, listas_negras, predicado V
│  ├─ ..._0006_autorizaciones.sql                 autorizaciones y sus tres hijas, vista de vigentes
│  ├─ ..._0007_zonas.sql                          zonas, horarios y el contador de aforo con su CHECK
│  ├─ ..._0008_biometria.sql                      evidencias, consentimientos, plantillas, sincronizaciones
│  ├─ ..._0009_dispositivos_y_edge.sql            dispositivos, puntos de acceso, edge_gateways, vista operativa
│  ├─ ..._0010_reglas.sql                         versiones_de_reglas y reglas, append-only por versión
│  ├─ ..._0011_eventos_y_auditoria.sql            eventos particionada, alertas, auditoría, bandeja del Edge
│  ├─ ..._0012_particiones_eventos.sql            creación de particiones con REVOKE incorporado
│  ├─ ..._0013_disparadores.sql                   invariantes de nivel 2 que cruzan tablas
│  ├─ ..._0014_rls_politicas.sql                  93 políticas, RLS activa y forzada en las 30 tablas
│  └─ ..._0015_permisos_e_inmutabilidad.sql       ADR-005, D-20 y dos aserciones de la DoD
├─ reversion/                            15 guiones de reversión + README con la advertencia de eventos
├─ policies/
│  ├─ README.md                          Matriz RLS revisable, predicados y el agujero de service_role
│  └─ tests/
│     ├─ 00_aislamiento_multiempresa.sql Positiva y negativa por tabla · KPI-35 · alcance del residente
│     ├─ 10_invariantes_estructurales.sql 15 invariantes, ejecutadas como superusuario a propósito
│     ├─ 20_inmutabilidad_eventos.sql    ADR-005 con los seis roles + partición recién creada
│     └─ 30_concurrencia_placas.sh       KPI-03 con 100 conexiones reales
└─ seed/seed.sql                         Dos copropiedades ficticias, coherentes con los mockups

apps/{api,web,mobile,edge}/.env.example  Nombres y advertencias, ningún valor

docs/
├─ arquitectura/modelo-datos.md          Diseño aprobado, actualizado con las decisiones del usuario
├─ guias/CONEXION_SUPABASE.md            Guía de conexión con lista de verificación final
├─ ESTADO_ETAPAS.md                      (modificado) ETAPA 01 cerrada, regla de ramificación fijada
├─ auditoria/contradicciones-y-supuestos.md  (modificado) S-08, S-09, P-11 resuelto, extensión E-01
└─ etapas/ETAPA-01.md                    Este informe

CLAUDE.md                                (modificado) §2.4 con el décimo motivo tipado
```

---

## 4. Cumplimiento SOLID

Esta etapa produce SQL, no clases. La tabla traduce cada principio a su forma en un esquema relacional y señala dónde se verifica.

| Principio | Materialización en el esquema | Verificación |
|---|---|---|
| **SRP** | Una tabla, una razón de cambio. Se separó `zona_aforo` de `zonas` porque el contador y la configuración cambian por motivos y a ritmos distintos; `consentimientos_biometricos` de `plantillas_biometricas` porque el consentimiento pertenece al titular y la plantilla al sistema; `puntos_de_acceso` de `dispositivos` porque «qué se abrió» y «qué equipo lo hizo» son cosas distintas | Ninguna tabla mezcla configuración de baja escritura con estado de alta escritura |
| **OCP** | Extender no exige migrar: `niveles_acceso` es catálogo y no enumerado (P-11), `reglas.definicion` es `jsonb` y las reglas se publican por versión en vez de editarse | Añadir un nivel de acceso o una regla es un `INSERT`, no una migración |
| **LSP** | Toda tabla operativa expone el mismo contrato: `copropiedad_id`, columnas de auditoría y —donde hay historial— baja lógica. Las políticas y los disparadores se generan en bucle sobre ese contrato | Los bucles de las migraciones `0013`, `0014` y `0015` recorren las tablas sin excepciones especiales |
| **ISP** | Cada superficie ve lo que necesita y nada más: `dispositivos_operativos` sirve a portero y operador sin `host` ni `credencial_ref`; `autorizaciones_vigentes` da el estado derivado sin exponer el cálculo; ninguna política concede acceso a `vector_cifrado` | La prueba de aislamiento confirma que el residente ve 0 dispositivos |
| **DIP** | El esquema no depende de Supabase: las políticas leen `current_setting('request.jwt.claims')`, que es lo que `auth.jwt()` envuelve. Supabase es un detalle de despliegue, no una dependencia del modelo | Las 15 migraciones y la suite completa corren sobre PostgreSQL 16 vacío, sin Supabase |

---

## 5. Trazabilidad

### Cubierto por completo

| Elemento | Contraparte estructural |
|---|---|
| **RN-02** | `dispositivo_id`, `regla_aplicada`, `version_reglas` `NOT NULL` + `CHECK` de motivo |
| **RN-03** | `REVOKE UPDATE, DELETE` en padre y particiones · sin columnas `actualizado_*` |
| **RN-04** | `UNIQUE (copropiedad_id, placa) WHERE estado='activo'` |
| **RN-05** | FK a `residentes` + disparador de coherencia + predicado V de RLS |
| **RN-06** | Índices únicos parciales sobre `listas_negras`, por persona **y** por placa |
| **RN-07** | Política de `INSERT`/`UPDATE` restringida a administrador y operador de central |
| **RN-08** | `CHECK` de `tipo='manual'` con operador y motivo no vacío |
| **RN-09** | FK `consentimiento_id NOT NULL` (nivel 1) + disparador de estado vigente (nivel 2) |
| **RN-10** | **Ausencia** de columna que vincule el consentimiento a un residente |
| **RN-11** | `suprimir_en NOT NULL` + índice del barrido + `CHECK` de vector nulo al suprimir |
| **RN-12** | `credencial_ref` inaccesible por RLS a roles de interfaz + vista sin `host` |
| **RN-13** | Disparador sobre `INSERT` en `autorizaciones` |
| **RN-14** | `CHECK (conteo_actual <= aforo_maximo)` |
| **RN-15** | `copropiedad_id NOT NULL` + RLS forzada + **FK compuestas** `(copropiedad_id, id)` |
| **RN-16** | `version_reglas NOT NULL` + `decidido_por_edge` + versión monótona |
| **RN-17** | `UNIQUE (copropiedad_id, clave_idempotencia)` en `bandeja_salida_edge` |
| **RN-19** | Sin `DELETE` concedido a ningún rol + disparador anti-borrado |
| **RN-21** | `CHECK (credencial_ref ~ '^(env\|vault):...')` |
| **CA-02, CA-03, CA-09, CA-10, CA-14, CA-15, CA-16, CA-17, CA-23, CA-24** | Todas con contraparte estructural y prueba |
| **KPI-01, KPI-02, KPI-03, KPI-04, KPI-05, KPI-24, KPI-31, KPI-36** | Base estructural puesta y verificada |

### Cubierto parcialmente, con motivo

| Elemento | Estado | Motivo |
|---|---|---|
| **KPI-36, KPI-37, KPI-38** | Base puesta, **cobertura incompleta por diseño** | Esta etapa cubre el aislamiento por el camino del JWT. El **segundo camino —`service_role`, que omite RLS— es de la ETAPA 03**, en la capa de aplicación. La base sola no basta, y el `README.md` de `supabase/policies/` lo dice sin rodeos |
| **RN-18, CA-18, CA-26** | Tablas y columnas listas | El escalamiento y la alerta son lógica de la ETAPA 06 |
| **RN-22, CA-06** | `patrones_recurrencia` con sus restricciones | La evaluación del patrón es el motor de reglas, ETAPA 05 |
| **KPI-29, KPI-30, KPI-31** | `bandeja_salida_edge` y `edge_gateways` listas | La reconciliación es la ETAPA 12 |
| **Retención de eventos y evidencia** | **Resuelta** *(adenda)* | Plazos fijados por el usuario e implementados en la migración `0016`. Los trabajos de purga son de las ETAPAS 06 y 14 |

---

## 6. Pruebas

**Cómo ejecutarlas.** Sin credenciales de Supabase, contra un PostgreSQL local:

```bash
./supabase/verificar.sh --con-pruebas
```

| Prueba | Qué verifica | Resultado |
|---|---|---|
| **Migraciones sobre base vacía** | DoD principal | ✅ 15/15 limpias sobre PostgreSQL 16.13 |
| **Idempotencia** | Reejecutar no rompe ni cambia | ✅ Tres pasadas consecutivas sin error |
| **Reversibilidad** | Ciclo aplicar → revertir → aplicar | ✅ 15/15 revertidas, **0 tablas residuales**, suite verde al reaplicar |
| **RLS activa y forzada** | DoD: 100 % de las tablas | ✅ **40/40** (30 tablas + 10 particiones) |
| **Aislamiento — positiva** | El administrador ve lo suyo | ✅ |
| **Aislamiento — negativa, 26 tablas** | Cero filas ajenas visibles | ✅ **0 fugas** |
| **Aislamiento — escritura cruzada** | `INSERT` en otra copropiedad | ✅ Rechazado por RLS |
| **Aislamiento — usuarios de plataforma (D-02)** | Las filas con tenant nulo solo para superadmin | ✅ 0 visibles |
| **KPI-35 — operador multiproyecto** | Atiende dos copropiedades, y solo las de sus claims | ✅ |
| **Alcance del residente** | 1 vivienda, sus vehículos, 0 dispositivos | ✅ |
| **RN-04 / CA-03 / KPI-02** | Placa duplicada activa rechazada | ✅ |
| **D-05** | La misma placa sí existe en otra copropiedad | ✅ |
| **Normalización** | `abc-1234` rechazada por la base | ✅ |
| **RN-14 / CA-14** | Aforo por encima del máximo, e incremento atómico con aforo lleno | ✅ 0 filas devueltas |
| **CA-16 / CA-17** | Apertura manual sin motivo, y con motivo en blanco | ✅ Ambas rechazadas |
| **Errores tipados** | Negar sin motivo | ✅ Rechazado |
| **E-01 / D-18** | CA-14 y CA-15 distinguibles en el evento | ✅ Dos motivos distintos |
| **RN-09 / CA-09** | Nivel 1 (FK) y nivel 2 (consentimiento no vigente) | ✅ Ambos bloquean |
| **RN-05** | Autorizar hacia vivienda ajena | ✅ Rechazado |
| **RN-13** | Vivienda inactiva: sin autorizaciones nuevas, con las vigentes conservadas | ✅ |
| **RN-19 / CA-02** | Borrado físico | ✅ Rechazado |
| **RN-17 / CA-22 / D-11** | Reenvío con `ocurrido_en` recalculado | ✅ Descartado por la bandeja |
| **RN-21 / D-09b** | Credencial literal en `credencial_ref` | ✅ Rechazada |
| **RN-16** | Versión de reglas no consecutiva | ✅ Rechazada |
| **P-11** | Nivel por defecto del residente | ✅ El más restrictivo |
| **ADR-005 / CA-23** | `UPDATE` y `DELETE` sobre eventos, **con los seis roles** | ✅ `permission denied` en los seis |
| **ADR-005 en partición nueva** | Nace sin `UPDATE`/`DELETE` y con RLS forzada | ✅ |
| **D-12** | Evento fuera de rango de particiones | ✅ Falla ruidosamente |
| **KPI-03** | **100 inserciones concurrentes reales** | ✅ **1 aceptada · 99 rechazadas · 1 fila** |

**Cobertura de código:** no aplica; esta etapa no produce código de aplicación. El umbral del 90 % en `domain/` y `application/` empieza a medirse en la ETAPA 02.

---

## 7. Verificación de seguridad

Contra el checklist de `CLAUDE.md` §2.7.

| # | Punto | Estado en esta etapa |
|---|---|---|
| 1 | **Secretos solo en variables de entorno** | ✅ Cero credenciales en migraciones, semillas o documentación. Las semillas usan dominios `.invalid` y referencias `vault:`. Y **la base lo impone**: `CHECK (credencial_ref ~ '^(env\|vault):...')` hace que una credencial literal falle |
| 2 | CORS restrictivo | No aplica · nombre y advertencia en `apps/api/.env.example` |
| 3 | Validación en el backend | Parcial · **el DTO valida forma, el agregado valida verdad, y la base valida lo que ninguno de los dos puede**: 171 `CHECK` |
| 4 | **Anti inyección SQL** | ✅ Cero concatenación para armar SQL con entrada de usuario. El SQL dinámico de las migraciones usa `format(%I/%L)` sobre listas literales. **Ninguna función lleva `SECURITY DEFINER` salvo una**, con justificación escrita y `search_path` fijo |
| 5 | Rate limiting | No aplica · nombres en `.env.example` |
| 6 | **RLS activa y forzada** | ✅ **40/40**, con aserción que hace fallar la migración si no. **Con la salvedad declarada**: `service_role` omite RLS, y la contención de ese camino es de la ETAPA 03 |
| 7 | CSP | No aplica |
| 8 | **Transversales** | ✅ Evidencia en bucket privado con URL firmada de vida corta, y la tabla guarda ruta y hash, **nunca URL** · auditoría append-only **por permisos**, no por código · MFA documentado en la guía |

**Hallazgos de esta etapa**

1. **El rol de mantenimiento conservaba `UPDATE`/`DELETE` sobre `eventos`.** El `GRANT ALL ON ALL TABLES` a `app_mantenimiento` se ejecutaba **después** del `REVOKE` de ADR-005 y lo deshacía. Detectado por inspección de `information_schema.role_table_grants`, corregido reordenando la migración, y **convertido en aserción permanente**: la migración `0015` ahora falla si algún rol distinto del propietario conserva esos permisos.
2. **Riesgo residual documentado.** El único actor capaz de modificar `eventos` es un superusuario de PostgreSQL, que en Supabase no está disponible para la aplicación. Se deja escrito porque un riesgo aceptado y documentado es distinto de un riesgo no visto.
3. **`app.es_mi_vivienda` es la única función `SECURITY DEFINER`**, y su justificación está escrita en el código: sin ella, evaluar la política de una tabla exigiría evaluar la de otra y la recursión rompería toda lectura del residente; y la alternativa —llevar la vivienda en el token— deja el claim obsoleto cuando un residente se muda, lo que se traduce en acceso a datos de una vivienda que ya no es la suya.

---

## 8. Deuda técnica, supuestos y pendientes

### Deuda nueva

| ID | Deuda | Se salda en |
|---|---|---|
| D-08 | El **segundo camino de aislamiento** (`service_role`) no está cubierto: la base sola no puede | **ETAPA 03** |
| D-09 | El mantenimiento de particiones necesita un trabajo pg-boss programado; hoy la función existe pero nadie la llama sola | ETAPA 02 (pg-boss) · 06 |
| ~~D-10~~ | La **política de retención** de eventos y evidencia no está definida en ningún insumo | **Saldada el 2026-09-06** por decisión del usuario · ver adenda al final |
| D-11 | El **Auth Hook de *custom claims*** está documentado pero no implementado: sin él, ninguna política concede acceso | **ETAPA 03** |

### Deuda saldada

**D-01 de la ETAPA 00** queda saldada en lo sustantivo: los nueve agregados fueron aprobados e implementados. Solo resta corregir el texto de `CLAUDE.md` §2.2, que sigue enumerando seis.

### Supuestos

`S-08` — una persona es residente de una sola vivienda activa a la vez.
`S-09` — los horarios que cruzan medianoche se modelan como dos filas, y **el corte de medianoche no reinicia el aforo**.

Los siete de la ETAPA 00 siguen vigentes; cinco de ellos son ahora **columnas configurables** de `copropiedades`.

### Pendientes

**P-11 resuelto** por el usuario: catálogo de niveles, no booleano, con el más restrictivo por defecto.
Quedan **diez** abiertos, ninguno bloquea la ETAPA 02.
**Nuevo:** política de retención (D-10 arriba).

### Extensión al contrato

**E-01** — `FUERA_DE_HORARIO` como décimo motivo tipado, solicitada por D-18 y **aprobada por el usuario**. `CLAUDE.md` §2.4 actualizado con la justificación, y prueba de regresión en la suite.

---

## 9. Qué debe hacer el usuario manualmente

1. **Cargar las credenciales de Supabase** en los cuatro `.env`, siguiendo `docs/guias/CONEXION_SUPABASE.md` §3. Ninguna credencial se pide ni se recibe por chat.
2. **Aplicar el esquema al proyecto real**: `supabase link` y `supabase db push` (§4 de la guía). Las migraciones ya están verificadas contra PostgreSQL 16; falta confirmarlo contra el proyecto.
3. **Ejecutar la comprobación práctica de aislamiento** de §5.3 de la guía contra el proyecto real. Si la consulta cruzada devuelve filas o el `INSERT` tiene éxito, **detener el despliegue**.
4. **Crear el bucket `evidencias` como privado** y habilitar **MFA TOTP** en el proyecto (§7 y §6.2 de la guía).
5. **Programar `app.mantener_particiones_eventos()` mensualmente**. Sin esto, dentro de tres meses la ingesta de eventos empezará a fallar — ruidosamente, que es lo que se quiso, pero fallará.
6. **Obtener el visto bueno de la asesoría jurídica** de Grupo Control sobre los tres plazos de retención, antes de producción.
7. ~~Corregir `CLAUDE.md` §2.2~~ — **hecho el 2026-09-06** para que enumere los nueve agregados raíz aprobados, y no seis.
8. Completar la **lista de verificación** de `CONEXION_SUPABASE.md` §11 antes de dar la conexión por buena.

---

## 10. Rama y commits

- **Rama:** `etapa-01-modelo-datos-supabase` · **Base:** `develop`
- **Regla fijada por el usuario y ya vigente:** cada rama de etapa se saca de `develop` actualizado, nunca de la rama de la etapa anterior. Registrada en `docs/ESTADO_ETAPAS.md`.
- **Pull request:** [#2](https://github.com/4rg3n15/NextResidential/pull/2), reapuntado a `develop` y retitulado.
- **Commits:**
  - `969a426` — `docs(etapa-01/modelo-datos): disena el esquema para aprobacion (paso 01-A)`
  - `61e8efd` — `merge(etapa-01): incorpora develop actualizado`
  - *(este)* — `feat(etapa-01/supabase): implementa el esquema, RLS, semillas y guia de conexion`
  - *(cierre)* — `chore(etapa-01): cierre de etapa`

---

## Cierre

**La ETAPA 01 queda CERRADA.** La Definición de Terminado se cumple y se amplía: las migraciones corren limpias sobre una base vacía, RLS está activa **y forzada** en el 100 % de las tablas, cada RN de integridad tiene su contraparte estructural identificada, y además el esquema resultó **idempotente**, **reversible de principio a fin** y capaz de sostener **KPI-03 con cien conexiones concurrentes reales**.

**La ETAPA 02 queda habilitada.** El agente se detiene aquí y espera instrucción expresa, conforme a `CLAUDE.md` §2.1.1.


---

# Adenda · 2026-09-06

Tres encargos posteriores al cierre, ejecutados sobre la misma rama. Ninguno
reabre la etapa: dos son correcciones documentales y el tercero resuelve un
pendiente que la propia etapa había abierto.

## A.1 · `CLAUDE.md` §2.2 corregida — nueve agregados raíz

El contrato seguía enumerando seis. Ahora lista los **nueve** en tabla, con las
invariantes que cada uno sostiene, y con la resolución de **C-02** citada en el
propio texto: por qué eran seis, qué declara la página 3 del diagrama, y qué
cinco reglas de negocio se quedaban sin invariante sin `ListaNegra` ni
`Dispositivo`. Se añadieron además los cuatro puertos de repositorio que
faltaban y la cadena de precedencia del motor (`listaNegra > vigencia > patrón >
zona`), que era vinculante y solo estaba en la auditoría.

Importaba hacerlo ya: es el archivo que se carga en cada sesión, y un contrato
desactualizado induce al error en la sesión siguiente, no en esta.

## A.2 · Política de retención — decisión resuelta (P-12)

Fijada por el usuario, **sujeta a confirmación legal de Grupo Control**:

| Dato | Plazo | Fundamento |
|---|---|---|
| Eventos | **24 meses** | Sustentan la responsabilidad ante un incidente (PB-06); su finalidad sobrevive al hecho registrado. Dos ciclos anuales de administración, sin volverse archivo indefinido |
| Evidencia fotográfica | **90 días** | Dato más sensible que el registro del acceso, y con finalidad que se agota antes: sustentar una reclamación inmediata. Minimización, Ley 1581 art. 4 lit. c |
| Plantillas biométricas | **Ligadas a la vigencia de su autorización** | Ya lo exigía RN-11; ahora es estructural |

**Migración `0016`.** Los tres plazos son **columnas de `copropiedades`**, no
constantes: la retención puede variar por contrato o por exigencia de una
autoridad, y un plazo escondido en el código no se audita ni se ajusta sin
desplegar.

Tres decisiones dentro de la decisión, que conviene no perder:

1. **La ley entra en el esquema como cota superior, no como valor por defecto.**
   `CHECK (margen_supresion_plantilla <= '24 hours')`: una copropiedad puede
   configurar un margen **más corto** que el legal, nunca más largo. La
   configuración no puede incumplir RN-11.
2. **El evento sobrevive a su evidencia sin perder trazabilidad.** A los 90 días
   se borra el objeto de Storage, pero la fila de `evidencias` permanece **con su
   hash**. Se puede seguir demostrando qué imagen sustentó la decisión sin
   conservar la imagen.
3. **La purga de eventos no puede ser un `DELETE`.** Ningún rol lo tiene
   concedido (ADR-005, D-20): se ejecuta soltando particiones mensuales enteras
   con el rol de mantenimiento. Es, retrospectivamente, **un segundo motivo para
   haber particionado por mes**, además del de consulta.

**Y una tabla nueva: `purgas_retencion`,** libro append-only que acredita cada
purga. Es tabla aparte y no columnas en `evidencias` porque esa tabla es
append-only por permisos: marcar una fila como purgada exigiría conceder
`UPDATE`, y eso abriría la puerta a editar el hash — justo lo que hace
verificable la evidencia. Sin este libro, la retención sería **indemostrable**:
pasado el plazo no quedaría ni el dato ni constancia de haberlo suprimido.

`plantillas_biometricas` gana `autorizacion_id`, **nullable a propósito**: un
residente también registra su rostro, y esa plantilla no nace de una
autorización de visitante sino de su condición de residente. Son dos ciclos de
vida legítimos y distintos. Cuando la columna tiene valor, un disparador impide
programar la supresión más allá de `upper(vigencia) + margen`.

**Lo que la adenda NO implementa:** los tres trabajos de purga. Son de las
ETAPAS 06 y 14. Aquí queda la política, su cota legal y dónde se acredita.

## A.3 · Verificación tras la adenda

| Prueba | Resultado |
|---|---|
| 16 migraciones sobre base vacía | ✅ |
| Idempotencia, dos pasadas adicionales | ✅ 0 fallos |
| Reversibilidad, ciclo completo con `0016` | ✅ 16/16, **0 tablas residuales** |
| RLS activa y forzada | ✅ **42/42** (31 tablas + 11 particiones) |
| Margen de supresión más corto que el legal | ✅ Aceptado |
| Margen de supresión **superior a 24 h** | ✅ **Rechazado por `CHECK`** |
| Plantilla que sobrevive a su autorización | ✅ **Rechazada por disparador** |
| Plantilla dentro del margen legal | ✅ Aceptada |
| `purgas_retencion` append-only | ✅ `DELETE` rechazado |
| Suite completa (aislamiento, invariantes, inmutabilidad, KPI-03) | ✅ Verde |

**Cifras finales:** 31 tablas · 11 particiones · 31 enumerados · 95 políticas RLS
· 16 migraciones · 16 guiones de reversión.

## A.4 · Qué queda en manos del usuario

Los puntos 1 a 4 de la lista de §9 —credenciales, `db push`, comprobación de
aislamiento contra el proyecto real, bucket privado y MFA— los ejecuta el
usuario con sus credenciales. Quedan además:

1. **Visto bueno de la asesoría jurídica** de Grupo Control sobre los tres
   plazos de retención. Es lo único que falta para dar P-12 por cerrado del todo.
2. **Programar `app.mantener_particiones_eventos()`** mensualmente.
3. Los trabajos de purga, cuando lleguen las ETAPAS 06 y 14.


---

# Adenda 2 · 2026-09-06 · esquema nuevo de llaves de Supabase

El cliente confirmó que su proyecto usa el esquema nuevo: **no tiene `anon` ni
`service_role` como llaves de API, ni secreto JWT compartido**. La firma es
asimétrica y se verifica contra un endpoint JWKS.

Verificado contra la documentación oficial antes de escribir nada. Fuentes en
`docs/arquitectura/verificacion-jwt-asimetrica.md` §6.

## B.1 · Lo que **no** cambia — y es casi todo

**Las 16 migraciones no cambian ni una línea.** Conviene entender por qué,
porque es la diferencia entre un cambio cosmético y uno de fondo:

- Lo que cambió son las **llaves de API**. Los **roles de PostgreSQL** `anon`,
  `authenticated` y `service_role` **siguen existiendo**, y las llaves nuevas
  resuelven a ellos. La publicable actúa como `anon`; la secreta como
  `service_role`, que conserva `BYPASSRLS`.
- Nuestras 95 políticas no leen la llave: leen `request.jwt.claims`, que
  PostgREST rellena **después** de verificar el token. El algoritmo de firma es
  indiferente para ese mecanismo.
- Los `GRANT` y `REVOKE` de la migración `0015` se declaran sobre roles, no
  sobre llaves. `REVOKE UPDATE, DELETE ON eventos` sigue siendo la barrera que
  la llave secreta **no** elude: `BYPASSRLS` omite políticas de **fila**, no
  privilegios de **tabla**. ADR-005 se sostiene tal cual.
- Los *custom claims* del auth hook funcionan igual: el gancho se ejecuta
  **antes** de firmar y modifica la carga útil; el algoritmo se aplica después.

**Y el riesgo número uno tampoco cambia.** La llave secreta omite RLS igual que
lo hacía `service_role`. Cambió el nombre de la variable de entorno, no el
riesgo ni la contención en tres capas.

## B.2 · Lo que sí se corrigió

| Archivo | Cambio |
|---|---|
| `apps/api/.env.example` | `SUPABASE_ANON_KEY` → `SUPABASE_PUBLISHABLE_KEY` · `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SECRET_KEY` · `SUPABASE_JWT_SECRET` **eliminada**, sustituida por `SUPABASE_JWKS_URL` + TTL de caché |
| `apps/web/.env.example` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| `apps/mobile/.env.example` | `SUPABASE_ANON_KEY` → `SUPABASE_PUBLISHABLE_KEY` + nota sobre el refresco al volver a primer plano |
| `apps/edge/.env.example` | Añadidas `SUPABASE_SECRET_KEY` y `SUPABASE_JWKS_URL`, con caché persistente para los cortes de WAN y la recomendación de **una llave secreta por Edge** |
| `docs/guias/CONEXION_SUPABASE.md` | §1, §2, §6.3 y §10 reescritas: nombres nuevos, dónde se obtienen, verificación asimétrica y rotación sin caída |
| `docs/arquitectura/verificacion-jwt-asimetrica.md` | **Nuevo.** Diseño vinculante de la ETAPA 03 |
| `CLAUDE.md` §6 | ETAPA 01 y ETAPA 03 actualizadas |

## B.3 · Tres cosas que salieron de verificar en vez de suponer

1. **El margen de 20 minutos al rotar no es arbitrario**, y de entenderlo salió
   una decisión: son los 10 minutos que Supabase cachea el JWKS en su edge más
   los 10 de nuestra caché local. **Por eso nuestro TTL se fija en 10 minutos y
   no más**: con 30, el margen seguro pasaría a 40 y la recomendación oficial
   dejaría de protegernos.

2. **La expiración de 5 minutos no afecta al Edge ni a los workers.** Usan la
   llave secreta, no un token de usuario. La autonomía de 24 h (KPI-30) no
   depende de ninguna sesión. Donde sí duele es en Flutter —por la suspensión,
   no por el plazo— y en el canal de tiempo real, que debe reenviar el token
   renovado al socket o la conexión se cae a los 5 minutos, justo lo que KPI-25
   mide.

3. **Una discrepancia en la propia documentación**, dejada por escrito en vez de
   resuelta en silencio: la guía general de JWT sigue citando 3600 s como valor
   por defecto, mientras el material de llaves de firma describe los 5 minutos
   del esquema nuevo. Manda el panel del proyecto. Se diseñó para 5 minutos
   porque diseñar para el plazo corto es seguro si resulta ser más largo; al
   revés no.

## B.4 · Un supuesto nuevo

`[SUPUESTO]` **S-10** — un operador de central atiende un número **acotado** de
copropiedades por turno. El claim `copropiedades` es un arreglo que viaja en
cada petición y ahora se renueva doce veces más a menudo; se acota al turno
activo, no al histórico. Si aparece un caso que lo desmienta, el alcance deja de
ser un claim y pasa a resolverse con una consulta, a costa de una función
`SECURITY DEFINER` más que habría que justificar por escrito.

## B.5 · Verificación

La suite completa se reejecutó tras los cambios: **verde**, incluido KPI-03 con
100 conexiones concurrentes reales. Era lo esperado —no se tocó SQL—, y por eso
mismo se comprobó: la afirmación «esto no toca el esquema» vale más habiéndola
puesto a prueba.

---

# Adenda 3 · Hallazgo de la verificación contra el proyecto real
**2026-09-06 · migración `0017` · rama `etapa-01-modelo-datos-supabase`**

## C.1 · Qué se encontró

El usuario aplicó las migraciones sobre su proyecto Supabase y verificó. RLS salió activa y forzada sin excepciones. Pero `eventos` **no estaba protegida**: `information_schema.role_table_grants` devolvía `postgres` con `UPDATE` y `DELETE`.

El informe de cierre de 01-B afirmaba que el único actor capaz de modificar eventos sería «un superusuario de PostgreSQL, que en Supabase no está disponible para la aplicación». **Esa afirmación era falsa**, y por dos motivos independientes:

1. En Supabase, `postgres` es el **dueño** de las tablas creadas por migraciones. El dueño no necesita ser superusuario para tener privilegios sobre sus objetos.
2. `postgres` es **el usuario de la cadena de conexión que entrega el panel**. No es un rol administrativo apartado: es el rol con el que la API se habría conectado.

RN-03, CA-23, KPI-24 y ADR-005 quedaban sin garantía estructural. Verificado por ejecución: `UPDATE public.eventos SET regla_aplicada = 'ALTERADA'` tuvo éxito.

**Alcance exacto del hueco:** solo `UPDATE`. El `DELETE` ya estaba bloqueado por `tg_prohibir_delete` (migración `0013`), que existía por RN-19 y no por ADR-005 — la protección venía de otra regla, por casualidad. Y el `UPDATE` era el peor de los dos: un `DELETE` deja un vacío detectable en la secuencia; un `UPDATE` reescribe la regla que decidió un acceso sin dejar rastro de que hubo cambio.

## C.2 · Por qué la aserción no lo detectó

La migración `0015` terminaba con una aserción que decía verificar ADR-005. Contenía esta línea:

```sql
AND grantee <> 'postgres'
```

Excluía del control exactamente al rol que resultó ser el problema. La aserción no falló porque estaba escrita para no poder fallar por ese motivo. La misma exclusión estaba en `0016` y en la prueba `20_inmutabilidad_eventos.sql`: se propagó por copia, sin que ninguna de las tres reexaminara el supuesto.

## C.3 · Por qué la suite tampoco

La prueba `20_inmutabilidad_eventos.sql` recorre los seis roles y verifica que `UPDATE` y `DELETE` fallan. Pasaba, y decía la verdad sobre lo que probaba. El defecto era de **alcance**: cada iteración empieza con `SET LOCAL ROLE authenticated`, así que la prueba nunca intentaba la operación con **la identidad tal como llega la conexión** — que es justamente lo que hace una cadena de conexión. Se probaban todos los caminos menos el que iba a usarse en producción.

A eso se sumó una diferencia real del entorno, que ahora queda declarada: la base local corre con un dueño **superusuario** y Supabase no. Un superusuario ignora los permisos de tabla, así que un `REVOKE` al dueño **no se puede demostrar por ejecución** en el contenedor. Eso no ocultó este fallo —el `UPDATE` habría salido igual de bien— pero sí significa que la garantía del `REVOKE` solo se puede verificar aquí leyendo el ACL.

## C.4 · La corrección

Migración `0017`, en cuatro capas, porque **ninguna basta sola**: el dueño puede reconcederse un privilegio revocado, y puede desactivar un trigger. Juntas, cada una cubre el modo de fallo de la otra.

| Capa | Qué cierra | Comprobado |
|---|---|---|
| `REVOKE UPDATE, DELETE, TRUNCATE` al dueño real | El uso desde el código de la aplicación. Efectivo en Supabase, donde `postgres` no es superusuario | Con un dueño no-superusuario: `permission denied for table` |
| Trigger `BEFORE UPDATE` `ENABLE ALWAYS` | Al dueño y también a un superusuario | Bloquea; y `session_replication_role` está vedado al no-superusuario |
| Rol `app_api` (no dueño, `NOBYPASSRLS`, sin DDL) | Que la conexión de la API *sea* el dueño | Nace sin `LOGIN` ni contraseña: falla cerrado |
| Aserción sin exclusiones + `tgenabled` | La reversión silenciosa de cualquiera de las tres | Rompe el despliegue en las dos mutaciones probadas |

`TRUNCATE` se incorporó al revisar el ACL: tras revocar `UPDATE` y `DELETE` quedaba `postgres=arDxt/postgres`, y esa `D` vacía la tabla entera **sin disparar ningún trigger `FOR EACH ROW`**.

Alcanza a `eventos` y sus particiones —presentes y futuras: los triggers del padre particionado se clonan solos, comprobado sobre una partición creada después—, `evidencias`, `auditoria_seguridad` y `purgas_retencion`.

## C.5 · Qué se hizo para que no se repita

- **Prueba `40_inmutabilidad_frente_al_dueno.sql`**, que ataca por el camino que faltaba: sin `SET ROLE`, con la identidad de la conexión. Sometida a **mutación** —revertir el `REVOKE`, y desactivar el trigger— y falla en ambos casos, que es lo único que demuestra que una prueba sirve.
- **`verificar.sh` declara la fidelidad del entorno en cada ejecución**: qué rol conecta, si es superusuario, quién es el dueño, y qué garantías **no** puede demostrar el contenedor. Una suite verde que no dice contra qué corrió es lo que permitió este fallo.
- **Las tres exclusiones `grantee <> 'postgres'` eliminadas.**
- **Regla nueva:** toda corrección de una garantía va en migración **nueva**. Editar `0015` no habría cambiado nada en el proyecto del usuario, porque `supabase db push` no reaplica lo ya aplicado (deuda D-10).

## C.6 · Recuento de particiones

No hay nada que revisar: `eventos` es la única tabla particionada. Los 80 y 41 observados son correctos y se reprodujeron localmente con las mismas cifras — 80 cuenta particiones de tabla **y de índice** (10 + 7×10), y 41 son las 31 tablas lógicas más las 10 particiones. La comprobación que lo zanja es `SELECT count(*) FROM pg_class WHERE relkind = 'p'`, que devuelve **1**. El «11 particiones» del informe anterior era el número que deja la suite de pruebas, no un despliegue limpio.

---

# Adenda 4 · El contenedor mentía
**2026-09-06 · migraciones `0017` (reescrita) y `0018` · arnés `--modo-supabase`**

## D.1 · Qué pasó

La migración `0017` de la Adenda 3 **falló al aplicarse** en Supabase gestionado y revirtió entera. La causa inmediata: creaba el rol `app_api` con sentencias que exigen superusuario. La causa de fondo es la que importa, y es la que el usuario venía señalando: **mi entorno de verificación me daba superusuario y Supabase no**, así que una suite verde no significaba lo que yo decía que significaba.

En vez de corregir sentencia por sentencia a medida que fallaban, construí un arnés que replica las capacidades reales de Supabase —rol dueño `NOSUPERUSER` + `CREATEROLE`— y pasé por él **todo** el esquema. Aparecieron tres defectos, no uno.

## D.2 · Los tres defectos

**1 · `0017` usaba cuatro sentencias privilegiadas, no una.**

| Sentencia | Error | Causa real |
|---|---|---|
| `ALTER ROLE … NOSUPERUSER NOBYPASSRLS` | `permission denied to alter role` | PostgreSQL exige superusuario para **tocar** `superuser` y `bypassrls`, aunque sea para ponerlos en NO. No falla por el valor: falla por nombrarlos |
| `GRANT authenticated TO app_api` | `permission denied to grant role` | Supabase documenta la dirección contraria: `grant mi_rol to authenticator` |
| `ALTER DEFAULT PRIVILEGES FOR ROLE …` | `permission denied` | Exige pertenencia al rol nombrado |
| `COMMENT ON ROLE …` | `permission denied` | No disponible sin superusuario |

Confirmado además que `0001`–`0016` pasan limpias como no-superusuario: el problema estaba acotado a `0017`.

**2 · El seed era inaplicable en Supabase.** `FORCE ROW LEVEL SECURITY` aplica las políticas **también al dueño**. El seed decía ejecutarse «con un rol con privilegio suficiente»; no existe tal rol. En el contenedor funcionaba porque el superusuario omite la RLS. En Supabase habría fallado con «new row violates row-level security policy» en la primera fila.

**3 · Recursión infinita en `app.es_mi_vivienda` — el grave.** La función es `SECURITY DEFINER`, elegida así creyendo que evitaba la RLS. **No la evita:** `SECURITY DEFINER` cambia con qué identidad corre una función, no si se le aplica la RLS. La política de `residentes` llamaba a la función, la función lee `residentes`, la lectura reevaluaba la política. `stack depth limit exceeded`. En Supabase habría estallado en cuanto un residente abriera la app.

## D.3 · Las correcciones

- **`0017` reescrita.** Solo la garantía: `REVOKE` al dueño, trigger `BEFORE UPDATE` `ENABLE ALWAYS`, aserciones. Cero sentencias privilegiadas. El rol de conexión sale de la migración y pasa a `CONEXION_SUPABASE.md` §12 como procedimiento de operador — necesita una contraseña, que nunca puede estar en el repositorio. La migración lo **vigila**: si existe, verifica sus atributos contra `pg_roles` en cada despliegue y falla si no son los esperados, que es exactamente lo que se pidió cuando `ALTER ROLE` no es posible.
- **`0018`**: política de `residentes` no recursiva, resuelta contra los claims. Mismo aislamiento, sin ciclo. Con aserción que impide reintroducirlo.
- **Seed**: adopta por tramos la identidad que cada política exige. Efecto colateral: pasa a ser **prueba positiva** de la matriz RLS.

## D.4 · Las capas, recontadas

La Adenda 3 contaba mal. Frente al dueño hay **tres** barreras; frente a la llave secreta, **dos**:

| Capa | Frente al dueño (`postgres`) | Frente a `service_role` (BYPASSRLS) |
|---|---|---|
| RLS: `eventos` sin política de `UPDATE`, en modo `FORCE` | **Sí** — afecta a cero filas | No — la omite |
| `REVOKE UPDATE, DELETE, TRUNCATE` | **Sí** | **Sí** |
| Trigger `BEFORE UPDATE` | Sí, si se reconcede el privilegio | **Sí — última barrera** |

Demostrado por ejecución: con `service_role` y el `UPDATE` deliberadamente reconcedido, **el trigger detiene la alteración**. Es el escenario que hace del trigger algo más que redundancia, y ahora lo cubre la sección 5 de la prueba 40.

## D.5 · Cómo se cierra la brecha del entorno

`./supabase/verificar.sh --con-pruebas --modo-supabase` aplica el esquema con un rol dueño **no superusuario**, y con `service_role` llevando el `BYPASSRLS` que tiene en Supabase. En ese modo:

- el `REVOKE` al dueño se demuestra **por ejecución**, no leyendo el ACL;
- la RLS forzada se aplica de verdad, incluida al dueño;
- la recursión de políticas se manifiesta en lugar de esconderse.

Ambos modos se ejecutan: 18/18 migraciones, seed y suite completa verdes en los dos, con KPI-03 sobre 100 conexiones concurrentes reales. El modo por defecto sigue existiendo porque es más rápido; el fiel es el que decide.

Queda declarado lo que **aún** no se puede verificar en local ([SUPUESTO] S-12, deuda D-12): que `postgres` pueda `GRANT authenticated TO app_api` en el proyecto real. Lo resuelve una sola consulta, la sonda de §12.1, antes de crear nada.
