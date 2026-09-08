# Ciclo de vida del dato biométrico

**Next Control Residencial · Ley 1581 de 2012 (Colombia)**
Vigente desde la ETAPA 08 · última revisión 2026-09-08

> Este documento describe qué le pasa a la cara de una persona desde que una
> cámara la mide hasta que no queda rastro de ella, y **dónde está escrito cada
> compromiso**. No es una declaración de intenciones: cada afirmación remite a
> una migración, un disparador, un CHECK o una prueba, y las que no se pueden
> demostrar todavía están marcadas como tales.

---

## 1 · Qué dato se trata, y cuál no

| Se trata                                                         | NO se trata                                         |
| ---------------------------------------------------------------- | --------------------------------------------------- |
| Una **plantilla** biométrica: un vector derivado del rostro      | La fotografía del rostro, que no se conserva        |
| Su **calidad** medida (0 a 1) y el instante de captura           | Datos sensibles ajenos al control de acceso         |
| El consentimiento del titular, su canal y la versión de política | Ningún dato biométrico de menores sin representante |

La plantilla **no es reversible a una fotografía**, pero sigue siendo dato
sensible: identifica de forma única a una persona y su tratamiento exige
autorización previa, expresa e informada (Ley 1581, art. 5 y 6, lit. a).

La imagen de la que se deriva **no viaja al servidor**. La medición de calidad
—encuadre, nitidez, iluminación, rostro único— la hace el dispositivo que
captura y envía números, no la foto. Es minimización (art. 4, lit. c) aplicada
antes de que el dato exista: lo que no se sube no se puede filtrar.

---

## 2 · Los seis principios, y dónde vive cada uno

| Principio (art. 4)     | Cómo se cumple aquí                                                                        | Dónde está escrito                                      |
| ---------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| **Legalidad**          | El tratamiento solo ocurre con consentimiento registrado del titular                       | FK `plantillas_consentimiento_fk` (0008)                |
| **Finalidad**          | Una sola: `control_acceso`. Se persiste en cada consentimiento y es obligatoria            | `consentimientos_biometricos.finalidad` · dominio       |
| **Libertad**           | Nadie puede consentir por otro, y la negativa deja la autorización viva **solo por placa** | Decisión D-08 · `ConsentimientoBiometrico.otorgar`      |
| **Veracidad**          | La captura de mala calidad se rechaza antes de generar plantilla                           | `evaluarCaptura` · CA-08                                |
| **Acceso restringido** | Ninguna API devuelve el vector; el puerto no ofrece leerlo                                 | `BovedaDePlantillas` · prueba «lo que no existe»        |
| **Seguridad**          | AES-256-GCM cifrado en la aplicación, llave por referencia                                 | `BovedaAesGcm` · CHECK `plantillas_llave_es_referencia` |
| **Confidencialidad**   | RLS activa y forzada; el camino de servicio se valida además en la aplicación              | 0014 · ETAPA 03                                         |

---

## 3 · El ciclo, paso a paso

### 3.1 Captura (CU-02, pasos 1 a 3)

1. El dispositivo mide la captura y envía **medidas, no imagen**.
2. `evaluarCaptura` decide. Si rechaza, devuelve **todos** los motivos a la vez
   —encuadre, nitidez, iluminación, rostros— para que el visitante corrija una
   sola vez en lugar de repetir la foto una vez por defecto.
3. Solo si acepta se crea la **solicitud de consentimiento**, en estado
   `pendiente`, y la plantilla en `pendiente_consentimiento`.
4. El vector se cifra al entrar. **Nunca se guarda en claro**, ni siquiera
   transitoriamente: no hay rama «si no hay llave, guardamos sin cifrar», porque
   la configuración ya impidió arrancar sin llave.

> **Por qué en este orden.** Pedir el consentimiento y descubrir después que la
> foto no servía obliga a repetir la solicitud, y una solicitud repetida erosiona
> justamente que sea informada y libre.

### 3.2 Consentimiento (CU-02, pasos 4 y 5 · RN-10)

**Lo otorga el titular.** El titular de un dato biométrico de visitante es el
visitante, no el residente que lo invita ni el administrador que lo registra.

Esto no se sostiene con una comprobación, sino con una **ausencia**:

- En el esquema, **no existe columna** donde escribir «el residente consintió por
  él» (decisión D-08). La prueba `50_consentimiento_biometrico.sql` verifica que
  no existan `residente_id`, `autorizado_por` ni `solicitado_por_residente`.
- En el dominio, `otorgar(quienAcepta, …)` exige la identidad de quien acepta y
  la compara con el titular. La API la toma **del token**, nunca del cuerpo: si
  la pusiera el cliente, RN-10 sería una casilla que cualquiera marca.
- No hay método `delegar`, `enNombreDe` ni equivalente. Una prueba enumera el
  prototipo y falla si alguien lo añade.

Se registran: titular, finalidad, **versión de la política aceptada**, canal,
instante de solicitud, instante de otorgamiento y evidencia.

**Si el titular no responde** dentro del plazo (`[SUPUESTO]` S-03, 24 h
configurables), el consentimiento **expira**. Expirar no es rechazar: el titular
no dijo que no, no dijo nada. La consecuencia práctica es la misma —no hay
plantilla— y la jurídica no, así que el estado es distinto y así consta.

### 3.3 Sincronización a la terminal (RN-09 · CA-09)

**Sin consentimiento vigente del titular, la plantilla no sale de la base.** La
garantía es estructural y tiene **tres cerrojos**, no uno:

| Nivel | Qué impide                                            | Dónde                                     |
| ----- | ----------------------------------------------------- | ----------------------------------------- |
| 1     | Que exista plantilla sin fila de consentimiento       | FK NOT NULL (migración 0008)              |
| 2     | Que la plantilla pase a un estado sincronizable       | `tg_plantilla_consentimiento` (0013)      |
| 3     | Que se registre que la plantilla está en una terminal | `tg_sincronizacion_consentimiento` (0022) |

> **El nivel 3 faltaba hasta la ETAPA 08, y su ausencia era el hueco real.**
> «Sincronizar» no es cambiar el estado de la plantilla: es escribir la fila que
> dice que está en ESE equipo. Esa tabla no tenía cerrojo, así que la fila podía
> insertarse con el consentimiento pendiente, rechazado o revocado. Los dos
> cerrojos anteriores vigilaban la puerta de al lado. No se veía porque no había
> filas que cruzaran esa puerta.

La capa de aplicación **vuelve a preguntar en el instante de empujar**, aunque
el estado ya diga `pendiente_sincronizacion`: entre habilitar y sincronizar
pueden pasar minutos, y en esos minutos el titular pudo revocar.

### 3.4 Dónde vive la plantilla

| Sitio                     | Estado                                 | Quién puede leerla                 |
| ------------------------- | -------------------------------------- | ---------------------------------- |
| Terminal facial Hikvision | En claro, en el equipo                 | El propio equipo                   |
| Base de datos             | **Cifrada** (AES-256-GCM), llave fuera | Nadie: no hay operación de lectura |
| Consola web / app móvil   | **Nunca**                              | —                                  |
| Copias de seguridad       | Cifrada, igual que en la base          | Nadie sin la llave del entorno     |

**GCM y no CBC** porque el vector necesita ser autenticado: sin etiqueta de
integridad, alguien con escritura en la base podría sustituir la plantilla de un
visitante por la suya y la terminal la aceptaría. El cifrado protegería la
confidencialidad y no la identidad — que en control de acceso es lo que hay que
proteger. Una plantilla manipulada no llega a la terminal: se rechaza al
descifrar, y hay prueba de ello.

**Cifrado en la aplicación y no con `pgcrypto`** (decisión D-10): si la llave
vive en la base, quien lee la base lee la llave, y el cifrado deja de proteger
del volcado, que es la fuga que importa.

**La llave no se persiste.** Lo que se guarda junto a la plantilla es una
_referencia_ (`env:…` o `vault:…`), y el esquema lo impone con un CHECK de
formato: si alguien intentara guardar el valor, la fila no entraría.

### 3.5 Supresión (RN-11 · CA-10, CA-11)

Hay dos caminos y son distintos a propósito:

**Por revocación — inmediata, en la misma transacción.**
El disparador `tg_revocacion_suprime` borra el vector, la referencia de llave y
el algoritmo en el mismo `UPDATE` que marca el consentimiento como revocado.
Dejarlo al trabajo programado haría que el cumplimiento dependiera de que un
worker esté vivo; con el worker caído, la revocación sería decorativa.

**Por vencimiento — dentro del margen de la copropiedad.**
El barrido recorre las plantillas cuyo `suprimir_en` ya pasó. El margen es
configurable por copropiedad y **la ley actúa como cota superior, no como valor
por defecto**: `CHECK (margen_supresion_plantilla <= interval '24 hours')`. Una
copropiedad puede configurar menos; nunca más.

Y una cota absoluta sobre la propia plantilla:
`CHECK (suprimir_en > creado_en AND suprimir_en <= creado_en + interval '5 years')`.

> **Por qué hizo falta esa segunda cota.** El disparador que ata `suprimir_en` a
> la vigencia de la autorización devuelve antes de comprobar nada cuando **no
> hay autorización** —la plantilla de un residente, cuyo ciclo no lo fija una
> visita—. Por ese camino admitía el año 3000. Un plazo que se puede fijar
> arbitrariamente lejos es, para el principio de finalidad, no tener plazo.

**Suprimir es borrar, no etiquetar.** El esquema lo exige:
`CHECK (estado <> 'suprimida' OR (vector_cifrado IS NULL AND suprimida_en IS NOT NULL))`.
Una fila marcada como suprimida que conserve el vector no entra en la tabla.

**Retirada de cada terminal (CA-10).** La cola no es un estado que alguien
escribe: es una **consulta** —toda fila `sincronizada` cuya plantilla está
`suprimida`—. Un estado derivable que se persiste acaba desincronizado de su
origen; una consulta, no. Si el lector no responde, la fila sigue en la cola y
el próximo barrido lo reintenta: **no se marca retirado lo que no se retiró**,
porque CA-10 se acredita con esa cola vacía.

---

## 4 · Derechos del titular y cómo se ejercen

| Derecho (art. 8)                    | Cómo                                                    | Estado                                          |
| ----------------------------------- | ------------------------------------------------------- | ----------------------------------------------- |
| Conocer, actualizar, rectificar     | Consulta del estado de su consentimiento                | `GET …/biometria/consentimientos/:id`           |
| Solicitar prueba del consentimiento | La fila registra canal, versión de política y evidencia | Persistido desde la captura                     |
| Ser informado del uso               | La finalidad es obligatoria y se persiste               | `consentimientos_biometricos.finalidad`         |
| **Revocar**                         | Sin motivo, sin aprobación, con efecto inmediato        | `POST …/consentimientos/:id/revocacion`         |
| Presentar queja ante la SIC         | Procedimiento del responsable                           | **Pendiente**: lo define Grupo Control (ver §7) |

Revocar **no admite condiciones**: no se exige motivo, ni que la autorización
haya vencido, ni que un administrador lo apruebe. Por eso el agregado no tiene
más comprobación que la de titularidad.

---

## 5 · Qué se puede demostrar hoy, y cómo

| Compromiso                                               | Prueba                                           | Verificado por mutación |
| -------------------------------------------------------- | ------------------------------------------------ | ----------------------- |
| Sin fila de consentimiento no hay plantilla              | `50_consentimiento_biometrico.sql` (nivel 1)     | Sí                      |
| Sin consentimiento vigente no se pasa a sincronizable    | `50_…sql` (nivel 2)                              | Sí                      |
| Sin consentimiento vigente no se registra en la terminal | `50_…sql` (nivel 3)                              | **Sí — cerrojo nuevo**  |
| Revocar borra el vector en la misma transacción          | `50_…sql` · `casos-de-uso.test.ts`               | Sí                      |
| El plazo de conservación tiene cota estructural          | `50_…sql`                                        | Sí                      |
| El margen configurable no puede exceder 24 h             | `50_…sql`                                        | Sí                      |
| El vector se guarda cifrado, nunca en claro              | `casos-de-uso.test.ts`                           | —                       |
| Una plantilla manipulada no llega a la terminal          | `casos-de-uso.test.ts` (etiqueta GCM)            | —                       |
| Ninguna ruta expone un vector                            | `biometria.e2e.test.ts`, enumerando el enrutador | —                       |
| Nadie consiente por otro                                 | dominio, aplicación y HTTP                       | —                       |

**Verificado por mutación** significa que se desactivó la garantía y se comprobó
que la prueba se pone roja. Un control que nadie ha visto fallar no está
demostrado: la propia prueba de la cota legal daba verde con el CHECK retirado
—la salvaba otro disparador— hasta que la mutación lo destapó.

---

## 6 · Lo que todavía NO se puede demostrar

Se declara en vez de insinuar cumplimiento:

1. **La supresión en el equipo físico**, contra hardware Hikvision real. Hoy se
   demuestra contra `MockProvider`, incluido el caso del lector caído. La
   verificación con equipo es de la **ETAPA 15**, y el ciclo alta →
   reconocimiento → supresión es uno de sus hitos.
2. **La persistencia en PostgreSQL desde la API en tiempo de ejecución.** Sin
   credencial (D-17) lo cableado son dobles en memoria. La frontera es
   definitiva y los cerrojos son de la base, probados contra base real.
3. **El barrido programado.** `BarrerPlantillasVencidas` es idempotente y está
   probado, pero nadie lo invoca todavía: el planificador de pg-boss es de la
   **ETAPA 14**. Hoy se ejecuta por su ruta HTTP.
4. **Cifrado en reposo del propio PostgreSQL** y rotación de la llave de
   plantillas: procedimiento de operador, **ETAPA 13**.

---

## 7 · Lo que Grupo Control debe definir antes de producción

Ninguna de estas es una decisión de ingeniería, y ninguna se ha inventado:

1. **Versión y texto de la política de tratamiento** que se le muestra al
   titular. El sistema persiste la versión aceptada; el texto no lo escribe el
   equipo de desarrollo.
2. **Procedimiento de reclamación ante la SIC** y responsable designado.
3. **Registro de la base de datos ante el RNBD**, si aplica por volumen.
4. **Plazo de respuesta al consentimiento** (`[SUPUESTO]` S-03: 24 h) y **margen
   de supresión** por copropiedad (por defecto 24 h, que es también el máximo).
5. **Menores de edad**: hoy el sistema no distingue. Tratar datos biométricos de
   un menor exige el consentimiento de su representante legal, y eso es un
   requisito nuevo, no un ajuste — se anota como riesgo abierto.

---

## 8 · Resumen en una línea

El dato biométrico entra cifrado, sale solo hacia una terminal y solo con
consentimiento vigente del titular, se borra —no se etiqueta— al revocar o al
vencer el plazo, y todo lo anterior lo sostienen claves ajenas, disparadores y
restricciones CHECK de PostgreSQL, no la buena voluntad del código que las usa.
