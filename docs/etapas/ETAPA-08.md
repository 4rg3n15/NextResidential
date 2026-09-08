# ETAPA 08 — Biometría con consentimiento

Rama `etapa-08-biometria-consentimiento` · sacada de `develop` actualizado (`6774b53`).

---

## 1 · Qué se construyó

El ciclo completo del dato más sensible que este sistema toca: desde que una cámara mide un
rostro hasta que no queda rastro de él. Y, sobre todo, **la garantía de que ese dato no se
mueve sin permiso de su dueño**.

La etapa entrega los dos agregados que faltaban del diagrama —`ConsentimientoBiometrico` y
`PlantillaBiometrica`—, la política de consentimiento que §2.2 declara vinculante, cinco
casos de uso, la bóveda cifrada, la superficie HTTP y el documento de ciclo de vida bajo la
Ley 1581 de 2012.

También cierra **D-34**, que venía de la ETAPA 07: las importaciones que entran en un módulo
por dentro en vez de por su barril, y el control que lo impide.

---

## 2 · Cómo se organizó y por qué

### 2.1 RN-10 no se cumple con un `if`: se cumple con una ausencia

El titular de un dato biométrico de visitante es **el visitante**. No el residente que lo
invita, no el administrador que lo registra. Es RN-10 y es el artículo 9 de la Ley 1581.

Una comprobación `if (quienAcepta !== titular) throw` cumpliría la regla y duraría hasta el
primer refactor apresurado. Aquí la regla se sostiene de otra forma: **no hay manera de
expresar la delegación.**

- En el esquema no existe columna donde escribirla (decisión D-08 de la ETAPA 01). La prueba
  SQL verifica que no aparezcan `residente_id`, `autorizado_por` ni
  `solicitado_por_residente`.
- En el dominio no existe el método. Una prueba enumera el prototipo del agregado y falla si
  alguien añade `delegar`, `enNombreDe` o similar.
- En la API, `quienResponde` se toma **del token**, nunca del cuerpo. Si lo pusiera el
  cliente, RN-10 sería una casilla que cualquiera marca.

`otorgar(quienAcepta, ahora)` pide la identidad de quien acepta aunque el agregado ya sepa
quién es su titular. Podría no pedirla, y entonces la llamada sería `otorgar(ahora)`,
imposible de auditar: nada en la firma obligaría a comprobar quién está al otro lado.

### 2.2 El cerrojo que faltaba, y por qué nadie lo veía

La ETAPA 01 dejó dos cerrojos sobre `plantillas_biometricas`: la clave ajena NOT NULL al
consentimiento y el disparador que impide pasar a un estado sincronizable. Parecían
completos.

**Sincronizar no es cambiar el estado de la plantilla: es escribir la fila que dice que la
plantilla está en ESE equipo.** Esa tabla —`plantilla_sincronizaciones`— no tenía ningún
disparador. La fila podía insertarse con el consentimiento `pendiente`, `rechazado` o
`revocado`. Los dos cerrojos vigilaban la puerta de al lado.

Es la misma familia que la clave ajena imposible de la ETAPA 06: una garantía que parece
completa con una puerta abierta que **no se ve porque no hay filas que la crucen**. Esta vez
la puerta daba al dato más sensible del sistema.

La migración `0022` la cierra. Ahora son tres niveles:

| Nivel | Qué impide                             | Dónde                                     |
| ----- | -------------------------------------- | ----------------------------------------- |
| 1     | Plantilla sin fila de consentimiento   | FK NOT NULL (0008)                        |
| 2     | Pasar a un estado sincronizable        | `tg_plantilla_consentimiento` (0013)      |
| 3     | **Registrar que está en una terminal** | `tg_sincronizacion_consentimiento` (0022) |

Y la capa de aplicación **vuelve a preguntar en el instante de empujar**, aunque el estado ya
diga `pendiente_sincronizacion`: entre habilitar y sincronizar pueden pasar minutos, y en
esos minutos el titular pudo revocar. Confiar en el estado sería confiar en una foto vieja.

### 2.3 El vector no sale de la bóveda porque no hay operación que lo saque

`BovedaDePlantillas` cifra al guardar y descifra **dentro del adaptador**, hacia la terminal.
No expone `leerVector`.

No es purismo. Si el puerto ofreciera una lectura, cualquier caso de uso —o cualquier
controlador que alguien escriba dentro de seis meses— podría sacar el vector a la capa de
presentación y de ahí al navegador. «La plantilla vive en la terminal y cifrada en base,
nunca en el cliente» deja de ser una norma que hay que recordar y pasa a ser **una operación
que no existe**: para exponerla habría que añadirla al puerto, que es una decisión visible en
una revisión, no un descuido.

Una prueba e2e lo vigila enumerando el enrutador —no leyendo el código—, para que siga siendo
cierto cuando la ETAPA 09 añada controladores.

**AES-256-GCM y no CBC.** El vector necesita ser autenticado, no solo cifrado: sin etiqueta de
integridad, quien pudiera escribir en la base sustituiría la plantilla de un visitante por la
suya y el lector la aceptaría sin pestañear. Protegería la confidencialidad y no la
identidad, que en control de acceso es exactamente lo que hay que proteger. Hay prueba: se
altera un byte del sobre y la plantilla no llega a la terminal.

**Cifrado en la aplicación y no con `pgcrypto`** (D-10): si la llave vive en la base, quien
lee la base lee la llave. La llave se exige al arrancar —como el secreto de la ingesta—
porque una API que levanta sin llave y falla al guardar la primera plantilla habría hecho
capturar el rostro de un visitante para nada. Lo que se persiste junto a la fila es su
**referencia**, con CHECK de formato.

### 2.4 La cota legal como CHECK, y por qué hacía falta una segunda

La ETAPA 01 ya imponía `margen_supresion_plantilla <= interval '24 hours'` sobre la
configuración de cada copropiedad: la ley como **cota superior**, no como valor por defecto.
Se puede configurar menos; nunca más.

El disparador que ata `suprimir_en` a la vigencia de la autorización **devuelve antes de
comprobar nada cuando no hay autorización** —la plantilla de un residente, cuyo ciclo no lo
fija una visita—. Por ese camino, `suprimir_en` admitía el año 3000. Un plazo que se puede
fijar arbitrariamente lejos es, para el principio de finalidad, no tener plazo. La `0022`
añade `CHECK (suprimir_en > creado_en AND suprimir_en <= creado_en + interval '5 years')`.

### 2.5 Revocar suprime ya; retirar de la terminal se encola

CA-11 exige supresión inmediata al revocar. Dejarla al barrido de pg-boss haría que el
cumplimiento dependiera de que un worker esté vivo: con el worker caído, la revocación sería
decorativa. El disparador `tg_revocacion_suprime` borra el vector, la referencia de llave y
el algoritmo **en la misma transacción** que marca la revocación.

Lo que sí puede esperar —retirar la plantilla de cada terminal, que exige hablar con el
hardware— se encola. La distinción es deliberada: lo que está bajo control de la base se hace
ya; lo que depende de una red ajena se encola y se acredita.

### 2.6 La cola de retirada es una consulta, no un estado

Y esto salió de un defecto propio. La primera versión del disparador de revocación marcaba
las filas de sincronización como `'pendiente'` para encolar la retirada, y **el cerrojo del
punto 2.2 la rechazaba**: con el consentimiento revocado, la única transición admitida es a
`suprimida`. Dos garantías escritas la misma tarde chocando entre sí.

El error era del encolado, no del cerrojo: `'pendiente'` en esa tabla significa «pendiente de
SINCRONIZAR». Marcar una retirada con el estado que pide lo contrario habría sido, además de
un choque, una mentira en la fila.

La cola no necesita estado propio porque **es derivable**: toda fila `sincronizada` cuya
plantilla está `suprimida` es una plantilla que sigue en un equipo y debe salir de él. Un
estado derivable que se persiste acaba desincronizado de su origen; una consulta, no.

### 2.7 D-34 cerrado: eran 35, no tres

Al escribir el control aparecieron **35 importaciones** entrando por el interior de otro
módulo, no las tres que se anotaron al cerrar la ETAPA 07. Aquella cuenta salió de un `grep`
que solo veía el patrón `../<modulo>/<capa>` y se dejaba fuera todos los `../../`.

`scripts/lib/frontera-modulos.mjs` es el control. Qué cuenta como módulo **se deriva de la
estructura** —un directorio de `apps/api/src` con alguna de las cuatro capas— y no de una
lista escrita a mano: `biometria` quedó cubierto el día que se creó, sin que nadie tuviera
que acordarse. Es el octavo control con prueba negativa.

---

## 3 · Árbol de archivos

```
supabase/migrations/20260908120000_0022_consentimiento_y_supresion.sql
                                     el cerrojo que faltaba, la supresión inmediata y la cota
supabase/policies/tests/50_consentimiento_biometrico.sql
                                     RN-09 en tres niveles, RN-10, RN-11 y CA-09 a CA-11

packages/domain-core/src/biometria/
├─ calidad-captura.ts             evaluarCaptura: pura, devuelve TODOS los motivos
├─ consentimiento.ts              agregado: solicitar, otorgar, rechazar, revocar, expirar
├─ plantilla.ts                   agregado: estados, plazo, retirada. SIN el vector
├─ politica-consentimiento.ts     PolíticaConsentimiento (§2.2) y las dos colas
└─ *.test.ts                      60 pruebas de dominio

apps/api/src/biometria/
├─ aplicacion/puertos.ts          RepositorioConsentimientos, RepositorioPlantillas, BovedaDePlantillas
├─ aplicacion/casos-de-uso.ts     los cinco casos de uso, con el orden calidad→consentimiento→plantilla
├─ aplicacion/casos-de-uso.test.ts 29 pruebas de aplicación
├─ infraestructura/boveda-cifrada.ts        AES-256-GCM; el descifrado no sale de la clase
├─ infraestructura/repositorios-en-memoria.ts dobles, con la cola de retirada derivada
├─ presentacion/dtos.ts           medidas acotadas, vector en base64, cota del plazo
├─ presentacion/biometria.controller.ts     cinco rutas; ninguna devuelve un vector
├─ biometria.module.ts            raíz de composición; MockProvider por ADR-03
└─ index.ts                       barril (§2.2)

apps/api/src/{autenticacion,padron,zonas,eventos}/index.ts   barriles nuevos (D-34)
apps/api/src/configuracion/esquema.ts    BIOMETRIA_LLAVE, _REF y el plazo de respuesta
apps/api/.env.example                    las tres variables, con su porqué
apps/api/test/biometria.e2e.test.ts      CU-02 por HTTP, aislamiento y «lo que no existe»
scripts/lib/frontera-modulos.mjs         CONTROL NUEVO: a un módulo se entra por su barril
scripts/lib/pruebas-negativas.mjs        octava prueba negativa
scripts/verificar-etapa.sh               el control nuevo, en el paso 10
docs/seguridad/ciclo-vida-biometrico.md  entregable de la etapa
docs/etapas/ETAPA-08.md                  este informe
```

---

## 4 · Tabla SOLID

| Principio | Cómo se materializa                                                                                                                                                                    | Comprobación                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **SRP**   | `evaluarCaptura` mide, `ConsentimientoBiometrico` guarda la voluntad del titular, `PlantillaBiometrica` el ciclo del dato, `BovedaAesGcm` cifra. Cinco casos de uso, cinco operaciones | Ningún archivo > 300 líneas; ninguna clase > 5 métodos públicos         |
| **OCP**   | Un canal de consentimiento nuevo es una entrada en `CANALES`; un umbral distinto se inyecta sin tocar la función                                                                       | Añadir la biometría no produjo diff en el motor de reglas               |
| **LSP**   | `BovedaDePlantillas` acepta hoy `MockProvider` y mañana el de Hikvision: la suite pasa con ambos sin cambiar una aserción                                                              | ADR-03 · KPI-12                                                         |
| **ISP**   | `BovedaDePlantillas` expone cuatro operaciones y **no expone leer**. Los repositorios están separados por agregado                                                                     | Ningún adaptador lanza `NotImplemented`                                 |
| **DIP**   | El dominio no sabe cifrar ni conoce PostgreSQL; la bóveda implementa un puerto que declara la aplicación                                                                               | `grep -r "supabase\|axios\|isapi" packages/domain-core/src/` sigue en 0 |

---

## 5 · Trazabilidad

### Cubierto

| Elemento          | Dónde                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------- |
| **CU-02**         | Completo, incluido el flujo alterno de quien no responde (el consentimiento expira)      |
| **RN-09**         | Tres cerrojos estructurales, los tres verificados por mutación                           |
| **RN-10**         | Inexpresable la delegación: esquema, dominio y API                                       |
| **RN-11**         | Supresión inmediata al revocar y por vencimiento, con cota legal como CHECK              |
| **HU-11 a HU-15** | Captura, calidad, consentimiento, sincronización y revocación por API                    |
| **CA-08**         | Encuadre, nitidez, iluminación y rostro único, con los motivos completos                 |
| **CA-09**         | Sin consentimiento vigente no hay sincronización, probado por API y por ruta de servicio |
| **CA-10**         | Suprimir es borrar el vector, no etiquetar; la retirada se acredita con la cola vacía    |
| **CA-11**         | Revocar suprime en la misma transacción                                                  |
| **CP-06**         | La batería de `50_consentimiento_biometrico.sql`                                         |
| **KPI-16**        | Rechazo de capturas de baja calidad, con umbrales inyectables                            |
| **KPI-17, 18**    | Estados y trazas de sincronización y supresión                                           |
| **KPI-20, 21**    | Barrido idempotente con las dos cuentas separadas                                        |
| **D-34**          | Cerrado, con control propio y prueba negativa                                            |

### Parcialmente cubierto, con motivo

| Elemento                      | Estado                                                                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Supresión en el equipo físico | Demostrada contra `MockProvider`, incluido el lector caído. Con hardware, **ETAPA 15**                                                   |
| Persistencia en PostgreSQL    | Los cerrojos son de la base y se prueban contra base real; lo cableado en runtime son dobles (D-17). La frontera es definitiva           |
| Barrido programado            | `BarrerPlantillasVencidas` es idempotente y está probado, pero nadie lo invoca: el planificador de pg-boss es de la **ETAPA 14** (D-40)  |
| Pantalla de consentimiento    | La API está; la pantalla del visitante es de la **ETAPA 11** (deuda D-02, de la ETAPA 00)                                                |
| Menores de edad               | El sistema no distingue. Exige consentimiento del representante legal: requisito nuevo, no ajuste. Declarado en el documento de la etapa |

---

## 6 · Pruebas

**645 pruebas en 53 ficheros**: 318 de dominio, 303 de la API y 24 de proveedores. Cobertura
por capa, medida en el contenedor Linux: dominio 98,61 % de líneas y 97,78 % de ramas,
aplicación 98,15 %, global 90,04 %.

### Verificación por mutación de los tres cerrojos

Desactivado cada uno, la prueba SQL se pone roja:

```
--- con «cerrojo de sincronización» desactivado ---
ERROR:  RN-09 INCUMPLIDA: se registro sincronizacion en terminal sin consentimiento
--- con «supresión por revocación» desactivado ---
ERROR:  CA-11: la plantilla quedo en pendiente_sincronizacion
--- con «cota legal de conservación» desactivado ---
ERROR:  RN-11 INCUMPLIDA: se acepto un plazo de conservacion sin cota
```

> **La tercera línea no salía al principio: la prueba daba verde con el CHECK retirado.**
> La hacía sobre la plantilla de un visitante, donde el disparador de la `0016` la salvaba —
> estaba probando otro control creyendo probar este. Ahora usa la plantilla de un residente,
> que es el único camino que el CHECK cubre en solitario. Un control que nadie ha visto
> fallar no está demostrado.

### Cómo ejecutarlas

```bash
pnpm --filter @ncr/domain-core test          # dominio biométrico
pnpm --filter @ncr/api test                  # aplicación y HTTP
./supabase/verificar.sh --con-pruebas --modo-supabase   # los tres cerrojos contra PostgreSQL
./scripts/verificar-etapa.sh --con-base      # todo
```

### Veredicto literal de §2.8.0

```
▸ 0 · borrando artefactos de compilación (así corre un checkout nuevo)
   ✓ dist, .turbo y coverage eliminados

▸ 1 · entorno dentro de lo declarado
   ✓ entorno: Node 22.22.2 y pnpm dentro de engines · .nvmrc 22.22.2

▸ 2 · instalación coherente con el lockfile
   ✓ pnpm install --frozen-lockfile

▸ 3 · compilación desde cero
   ✓ pnpm build

▸ 4 · lint y typecheck
   ✓ pnpm lint
   ✓ pnpm typecheck

▸ 5 · suite completa
   @ncr/providers:test:       Tests  24 passed (24)
   @ncr/domain-core:test:       Tests  318 passed (318)
   @ncr/api:test:       Tests  303 passed (303)
   ✓ suite completa en verde

▸ 6 · ningún fichero de prueba se quedó sin recoger
   ✓ 53 de 53 ficheros de prueba ejecutados

▸ 7 · umbrales de cobertura por capa (§2.4)
     OK   dominio (packages/domain-core/src): lineas 98.60 % · ramas 97.78 % · funciones 98.65 % (umbral 90 %, 27 archivos)
     OK   aplicacion (**/aplicacion/**): lineas 98.15 % · ramas 90.86 % · funciones 98.17 % (umbral 90 %, 17 archivos)
     OK   global: lineas 90.04 % · ramas 91.93 % · funciones 92.20 % (umbral 70 %, 110 archivos)
   ✓ las tres capas cumplen su umbral

▸ 8 · portabilidad de las superficies con shell (macOS/BSD y CI/GNU)
   ✓ portabilidad: 15 superficies con shell sin construcciones divergentes BSD/GNU (.sh, scripts de package.json, .husky/, run: de workflows, Makefile)

▸ 9 · pruebas negativas de los propios controles
   ✓ PRUEBAS NEGATIVAS: los 8 controles detectan su violación, sin tocar el árbol

▸ 10 · fronteras de arquitectura y secretos
   ✓ fronteras (DoD ETAPA 02)
   ✓ frontera-modulos: 6 módulos (autenticacion, autorizaciones, biometria, eventos, padron, zonas) y ninguna importación entra por dentro
   ✓ sin secretos
   ✓ KPI-11: sin ISAPI ni IPs de dispositivo fuera de packages/providers/
   ✓ sin claves ajenas vigentes hacia tablas append-only (2 declaradas, 2 retiradas, 4 tablas vigiladas)

▸ 11 · latencia del canal de tiempo real bajo carga (KPI-25)
   alertas entregadas: 200 de 200
   p50 / p95 / p99   : 2 / 4 / 8 ms
   maximo            : 10 ms
   umbral KPI-25     : 10000 ms
   ✓ KPI-25 con margen sobre el umbral

▸ 12 · esquema y aislamiento en --modo-supabase
   ✓ migraciones, semillas y suite SQL

▸ 13 · KPI-03 y la inmutabilidad de un evento REAL, contra base
   ✓ 100 inserciones concurrentes, 0 duplicados (KPI-03)
   ✓ UPDATE y DELETE rechazados sobre un evento real (RN-03, CA-23)
   ✓ 50 ingresos simultáneos sobre 10 plazas, ni una de más (RN-14, CA-14)

▸ 14 · estabilidad: la suite da lo mismo tres veces seguidas
      corrida 1/3: codigo 0 · @ncr/api:test: Tests 303 passed (303) · @ncr/domain-core:test: Tests 318 passed (318) · @ncr/providers:test: Tests 24 passed (24)
      corrida 2/3: codigo 0 · @ncr/api:test: Tests 303 passed (303) · @ncr/domain-core:test: Tests 318 passed (318) · @ncr/providers:test: Tests 24 passed (24)
      corrida 3/3: codigo 0 · @ncr/api:test: Tests 303 passed (303) · @ncr/domain-core:test: Tests 318 passed (318) · @ncr/providers:test: Tests 24 passed (24)
   ✓ OK estabilidad: 3 corridas forzadas (sin caché de turbo) con resultado idéntico y ningún error sin manejar

VERIFICACIÓN DE ETAPA: correcta — se puede escribir el informe
```

---

## 7 · Verificación de seguridad (contra §2.7)

| Medida                    | Estado en esta etapa                                                                                                                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Secretos              | ✅ `BIOMETRIA_LLAVE` vive en el entorno y se exige al arrancar. Lo que se persiste es su **referencia**, con CHECK de formato: si alguien pusiera ahí el valor, la fila no entra. Escaneo limpio sobre 313 archivos                             |
| 2 · CORS                  | ✅ Sin cambios: las rutas nuevas quedan bajo la lista blanca global                                                                                                                                                                             |
| 3 · Validación en backend | ✅ Medidas acotadas a rangos, vector validado como base64 con tope de 16 KiB, plazo en ISO-8601. Y el DTO valida forma mientras el agregado valida verdad: la cota del plazo se rechaza en el dominio                                           |
| 4 · Anti inyección SQL    | ✅ Todo parametrizado. Los disparadores nuevos no concatenan nada                                                                                                                                                                               |
| 5 · Rate limiting         | ✅ Heredado del global. La captura no es un endpoint de ingesta ni de autenticación                                                                                                                                                             |
| 6 · Aislamiento doble     | ✅ `exigirAlcance` en las cinco rutas y `copropiedad_id` en todas las consultas. Probado: un administrador de otra copropiedad recibe 404; sin token, 401. **Y los cerrojos son de la base**, que es lo que cubre el camino de la llave secreta |
| 7 · CSP                   | ✅ Sin cambios (Helmet global)                                                                                                                                                                                                                  |
| 8 · Transversales         | ✅ Ningún dato biométrico en logs ni en respuestas. El claro se sobreescribe en memoria tras entregarlo a la terminal. Cifrado autenticado: una plantilla manipulada se rechaza                                                                 |

> **Lo más fuerte de esta etapa en seguridad no es una medida añadida: es una operación que
> no existe.** No hay ruta, ni método de puerto, ni campo de DTO que devuelva un vector
> biométrico. Para exponerlo habría que añadir la operación al puerto — una decisión visible
> en una revisión, no un descuido.

---

## 8 · Deuda técnica, supuestos y pendientes

### Hallazgos de la etapa

1. **El cerrojo que faltaba** (§2.2 de este informe): `plantilla_sincronizaciones` sin
   disparador. Quinta aparición de la familia «una garantía con una puerta abierta que nadie
   ve porque no hay filas que la crucen».
2. **Dos garantías propias chocando**: el encolado de la retirada usaba el estado que el
   cerrojo prohíbe. Lo destapó la prueba, no una revisión.
3. **Una prueba que probaba otro control**: la cota legal daba verde con el CHECK retirado.
   Lo destapó la mutación.
4. **500 donde debía haber 503**: una terminal que no responde no es una prohibición.
   Confundirlos es grave por partida doble — la acción del operador es distinta, y el 403
   acusaba al visitante de algo que no hizo.
5. **D-34 eran 35 violaciones, no tres.** La cuenta anterior salió de un `grep` que no veía
   los `../../`.

### Deuda nueva

| ID   | Deuda                                                                                                                                | Se salda en                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| D-39 | Los repositorios de biometría y el almacén de sobres cifrados son dobles en memoria                                                  | Misma raíz que D-25, D-35 y D-17. La frontera es definitiva    |
| D-40 | `BarrerPlantillasVencidas` no tiene planificador: hoy se invoca por su ruta HTTP                                                     | ETAPA 14, con pg-boss                                          |
| D-41 | La derivación de la llave es `sha256` del secreto. Una KDF con sal por copropiedad es lo correcto                                    | ETAPA 13, con el procedimiento de rotación                     |
| D-42 | El sistema no distingue a un menor de edad. Tratar su dato biométrico exige consentimiento del representante legal                   | Requisito nuevo: decisión de Grupo Control antes de producción |
| D-43 | `LatidoDto` cruza de `eventos` a `autorizaciones`: el controlador de ingesta vive en el módulo equivocado. El barril lo hizo visible | ETAPA 15, al traer el Alarm Server real                        |

### Supuesto nuevo

**`[SUPUESTO]` S-18 — umbrales de calidad de captura.** El documento exige validar encuadre,
nitidez, iluminación y rostro único, y no fija números. Se eligen conservadores —rechazar de
más molesta; aceptar de menos deja plantillas que no funcionan y un visitante en la puerta
sin saber por qué— y son **inyectables**, porque el equipo de captura de cada copropiedad no
es el mismo.

### Pendientes que siguen abiertos

**P-03 · plazo de respuesta al consentimiento.** Supuesto vigente 24 h, ahora configurable
por variable de entorno. Pasado el plazo el consentimiento **expira** —que no es rechazar— y
la autorización sigue viva solo por placa, como prevé el flujo alterno de CU-02.

---

## 9 · Qué debe hacer el usuario manualmente

1. **Cargar `BIOMETRIA_LLAVE` en el `.env`** de cada entorno: mínimo 32 caracteres,
   generada al azar y distinta por entorno. Sin ella la API no arranca, a propósito.
   Dejar `BIOMETRIA_LLAVE_REF=env:BIOMETRIA_LLAVE` salvo que se use una bóveda.
2. **Ejecutar `./scripts/verificar-etapa.sh --con-base` en macOS** y confirmar los 14 pasos,
   con las tres corridas idénticas del paso 14.
3. **Definir con Grupo Control, antes de producción**, lo que el documento de la etapa
   enumera y que no es decisión de ingeniería: el texto y la versión de la política de
   tratamiento, el procedimiento de reclamación ante la SIC, el responsable designado, el
   registro ante el RNBD si aplica, y **la política sobre menores de edad** (D-42).
4. **Revisar `docs/seguridad/ciclo-vida-biometrico.md`**, en particular su §6 —lo que todavía
   no se puede demostrar— y su §7 —lo que falta por definir—. Está escrito para que un
   auditor lo lea sin conocer el código.

---

## 10 · Rama y commits

**Rama:** `etapa-08-biometria-consentimiento`, sacada de `develop` actualizado en `6774b53`
(merge de la PR #11, ETAPA 07).

| Commit     | Mensaje                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| `a0a5e9c`  | `refactor(etapa-08/fronteras): a cada módulo se entra por su barril, y ahora hay control que lo exige` |
| `d34ef0d`  | `feat(etapa-08/biometria): cierra el cerrojo que faltaba entre consentimiento y terminal`              |
| `c5bb8a9`  | `feat(etapa-08/biometria): ciclo completo del dato biométrico con consentimiento del titular`          |
| _(cierre)_ | `chore(etapa-08): cierre de etapa`                                                                     |
