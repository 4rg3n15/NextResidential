# RONDA 15-W · Cuentas y hogar

**Rama:** `etapa-15w-cuentas-y-hogar` · **Base:** `develop` (`f605442`, merge del PR #49) ·
**PR:** [4rg3n15/NextResidential#51](https://github.com/4rg3n15/NextResidential/pull/51), hacia `develop`, sin fusionar · **Fecha:** 2026-10-06 ·
**Decisiones del cliente que aplica:** D-W1, D-W2, D-W5 a D-W10 (ADR-037, ADR-038) ·
**Cierra:** el problema CRÍTICO 1 del encargo (cualquier cuenta podía hacerse titular de una vivienda vacía) y **P-36** (por D-W10)

> **Esta ronda NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Las migraciones 0055 y 0056 no se han aplicado al proyecto Supabase real: las
> aplica usted (§9). Nada de lo nuevo se ha ejercido contra un teléfono real.

**Lo incómodo primero.**

1. **Un residente con iPhone no puede usar nada de lo nuevo.** En producción el
   iPhone sólo tiene la consola web instalada (P-23, ADR-036), y la consola del
   residente (`/mi`, D-12) no tiene ninguna de estas funciones (DT-15W-07):

   - «Crear cuenta»;
   - el primer ingreso;
   - menores;
   - plazas;
   - editar y eliminar vehículos;
   - revocar visitas.

   El encargo las pedía en la app, y en la app están. Pero la consecuencia es
   que **un adulto que no sea el titular y sólo tenga iPhone no puede crear su
   cuenta**: necesita un Android, o que la administración le cree la cuenta.
   Esta ronda sí corrige los dos textos de esa consola que la 15-W volvió
   falsos: «Sólo la administración cambia este número» y «La administración del
   conjunto las vincula desde la consola».

2. **La edad la declara quien se registra; nadie la verifica.** El dominio y la
   base impiden que una cuenta quede atada a una persona MENOR según su fecha de
   nacimiento, en «Crear cuenta», en el primer ingreso y al editarla; pero un
   menor que escriba una fecha falsa crea su cuenta. Comprobar la edad exigiría
   un documento verificado, que este sistema no tiene. Es la regla de D-W2
   aplicada con el dato disponible, no una garantía de identidad.
3. **El titular no se puede mudar desde la app** (`TITULAR_NO_SE_MUDA`). Es la
   opción conservadora de una decisión que no está tomada (**P-38**): si el
   titular se fuera con un código, su vivienda —con otros adultos dentro—
   quedaría sin nadie que gestione sus plazas, y «Asignar vivienda» sólo sirve
   para viviendas sin ninguna cuenta. El cambio de titular de una vivienda con
   gente dentro necesita una definición suya.
4. **El texto de la política de tratamiento de datos es provisional** (**P-37**,
   versión `2026-10-provisional-1`). Cada autorregistro deja escrita la versión
   que aceptó; cuando el área legal entregue el definitivo, se cambia la versión
   y el texto, y la app lo pide solo.
5. **El límite por IP del registro cuenta por dirección**: detrás del WiFi de un
   conjunto (una sola IP pública), las 10 altas cada 10 minutos son de toda la
   red. Para una familia es de sobra; para una jornada de altas masivas en la
   portería, no: en ese caso, cuentas por la administración o esperar.
6. **El tiempo uniforme es de los FALLOS.** Todo código incorrecto, usado, de
   otro conjunto o con el registro suspendido espera al menos 500 ms y contesta
   lo mismo; un alta correcta contesta antes. Eso no revela nada que el 201 no
   diga ya.
7. **Cuatro defectos reales aparecieron antes del cierre: dos los encontraron
   las pruebas, y dos, el cruce con la app y con la documentación.**
   - **La alerta de suspensión.** Escribía `resultado = 'suspendido'` en
     `auditoria_seguridad`, que la base rechaza: el registro **nunca llegaba a
     suspenderse**, y el fallo número 30 daba 500. Lo encontraron las pruebas.
   - **El cambio de vivienda.** Tomaba la plaza nueva antes de soltar la vieja,
     y el índice de una plaza por cuenta lo convertía en «código incorrecto». Con
     la 15-W toda cuenta tiene plaza, así que **nadie habría podido mudarse**.
     También lo encontraron las pruebas.
   - **El límite de 5 intentos por dirección y conjunto.** Contaba el formulario
     vacío con el que la app pide la política: abrir «Crear cuenta» seis veces en
     15 minutos desde la misma red dejaba sin el texto que hay que aceptar. Ese
     límite no tenía ninguna prueba que lo viera fallar. Salió al revisar la app.
   - **La carrera perdida.** Quien perdía una carrera de dos altas sobre el
     mismo código recibía 409 y sin el tiempo mínimo: la única respuesta de
     código que no era uniforme. Salió al revisar la documentación.
   - Los cuatro están corregidos, y cada uno tiene una prueba que lo ve fallar.
   - **Y tras abrir el PR, la revisión automática encontró tres más, los tres
     reales**, corregidos en el mismo PR con su prueba vista fallar:
     - un `PUT` del tope sin el campo `tope` devolvía la vivienda al tope de su
       copropiedad, en silencio; ahora es 400, y sólo `null` lo hace;
     - con cupo para varias, dos altas de plaza a la vez elegían el mismo número
       y la perdedora leía «tope alcanzado»; ahora el número se calcula bajo el
       bloqueo de la vivienda, y seis altas simultáneas entran las seis;
     - el historial de la placa se comprobaba en otra transacción que el cambio;
       ahora lo decide el propio `UPDATE`, y un evento llegado entre medias ya
       no deja cambiar la placa.
8. **Me salté dos veces el límite de §2.3 y lo corregí antes del cierre.**
   - `MiHogarController` y `SupervisionDeResidentesController` llegaron a seis
     métodos públicos. Las rutas nuevas salieron a sus propios controladores
     con los mismos `operationId`, así que el contrato no cambió.
   - Cuatro pruebas nuevas pasaban de 300 líneas. Se partieron en `e8d6e84`,
     sin tocar una aserción.
   - Quedan tres clases con más de cinco métodos que **ya** los tenían, y esta
     ronda no las hace crecer: `RepositorioDeCuentasPg` 6, `AltaDelResidentePg`
     6 y el doble en memoria de cuentas 14. Es deuda anterior y no se
     refactoriza aquí.
9. **«Compartir» no abre la hoja de compartir del sistema, como pedía el
   encargo: copia el mensaje completo al portapapeles y lo dice**
   ([CONTRADICCIÓN] C-61).
   - La hoja exige una dependencia nativa nueva (`share_plus`), y el encargo
     dice «sin tecnologías nuevas».
   - Este repositorio ya pagó cinco rondas por una dependencia nativa en macOS
     (`objective_c`).
   - No la añadí sin su visto bueno; con él, es un cambio pequeño en
     `compartir.dart` y `pubspec.yaml`.
10. **«Crear cuenta» exige que el conjunto tenga código corto** (S-15W-13).
    Sin él, los códigos de plaza salen sin prefijo y el registro los rechaza como
    inválidos, porque no hay con qué saber de qué conjunto son. El §9 se lo pide.
11. **La app ofrece «Editar» y «Eliminar» en todos los vehículos.** Los que
    registró la administración contestan 404 al intentarlo (DT-15W-02), porque
    la lista no dice cuáles son propios y arreglarla toca un controlador que
    esta ronda no debía hacer crecer.

---

## 1 · Qué se construyó

**La primera cuenta de cada vivienda la crea la administración, ya asignada a
ella (D1).** «Nuevo residente» exige elegir una vivienda activa sin titular; la
cuenta nace con contraseña inicial y cambio obligatorio, y en la MISMA
transacción queda como titular (`ocupacion_de_viviendas.primer_residente_id`),
con su fila en la bitácora. Si dos altas llegan a la vez, la base deja una y la
identidad sobrante del proveedor se borra. Desaparece la rama «no lo tengo»: una
vivienda sin cuentas ya no admite a nadie desde la app (`VIVIENDA_SIN_TITULAR`).
Era el problema CRÍTICO: con las credenciales que daba la administración —o con
«Crear cuenta»— se tomaba la casa de otro. Las cuentas antiguas sin vivienda la
reciben con «Asignar vivienda», con motivo.

**«Crear cuenta» en la app, sólo para residentes (D2, D-W1, D-W8).** Seis campos
y la casilla de la política de datos. El código de la plaza lleva delante el del
conjunto (`MIRA-K7PQ-2XWZ`): el prefijo decide la copropiedad y el código sólo se
busca allí, en tiempo constante, entre las plazas libres de viviendas que YA
tienen titular. La cuenta nace atada a esa plaza, nunca como titular, sin cambio
de contraseña y sin tokens. Todo fallo de código contesta lo mismo y tarda lo
mismo; treinta en una hora suspenden el registro de ese conjunto y avisan al
superadministrador, que lo reanuda.

**El primer ingreso ya no pide vivienda ni código (D3):** nombres, documento de
adulto, teléfono y fecha. Si la fecha dice que es menor, la cuenta queda
bloqueada y nada de la persona se escribe.

**Los menores del hogar, sin cuenta (D4, D-W2).** Cualquier adulto de la vivienda
los registra en una plaza libre, los edita y los da de baja; nadie de otra
vivienda los ve. A los 18, el titular le da un código de traspaso con el que la
persona crea su cuenta conservando su historial.

**Las plazas, en manos del titular (D4 bis, D-W10).** Añade hasta el tope —4
contándose, ampliable por vivienda por el superadministrador— y retira las
libres; la base decide el tope, también bajo peticiones simultáneas, y bajar el
tope por omisión no le quita plazas a nadie.

**Vehículos y visitas (D5, D6).** El residente edita sus vehículos (la placa
sólo si no tienen historial) y los elimina (borrado sin historial, baja con él),
y revoca sus visitas, con el rostro fuera de las terminales en el acto.

**Consola:** «Nuevo residente» con vivienda, columnas Vivienda y Origen,
«Asignar vivienda», «Plazas: N de M» y «Cambiar tope», el aviso de registro
suspendido con «Reanudar» y el tope por omisión. **App:**

- «Crear cuenta» con los seis campos y la política que manda el servidor, y la entrada automática después.
- El primer ingreso, sin vivienda ni código:
  - si la administración aún no asignó la vivienda, una pantalla de espera;
  - si la fecha dice que es menor, un final con «Salir».
- «Ocupantes», con «3 de 4», añadir y retirar plazas (el titular) y «Compartir» los códigos.
- «Mi familia», con los menores y el código de traspaso.
- «Editar» y «Eliminar» en los vehículos.
- «Revocar» en las visitas, con motivo.

## 2 · Cómo se organizó y por qué

- **La base decide lo que se puede pisar a la vez.** El tope de plazas, una
  plaza por cuenta, un titular por vivienda y «nunca un menor con cuenta» están
  en disparadores e índices (0055, 0056), no en un `SELECT` previo (ADR-04). El
  dominio dice lo mismo antes, para que la app explique; la base es la última
  palabra. Lo demuestran 20 altas simultáneas sobre la cuarta plaza (SQL) y
  cinco «añadir» a la vez por HTTP: entra una.
- **Bloqueo consultivo, no `SELECT … FOR UPDATE`** ([CONTRADICCIÓN] C-59): el
  encargo pedía las dos cosas a la vez —«FOR UPDATE» y «el mismo patrón que la
  0038»—, y la 0038 usa `pg_advisory_xact_lock`. Se siguió la 0038: serializa
  las altas de plazas de una vivienda sin bloquear su fila para nadie más.
- **Cuentas no sabe qué es una plaza.** El residente depende de cuentas, no al
  revés. Cuentas declara dos puertos —`EscrituraDelVinculo`, que se ejecuta
  DENTRO de la transacción de la cuenta, e `InvitacionesDeResidente`, que se
  INSCRIBE al arrancar— y el residente los cumple (DIP). Sin inscripción, el
  registro no está disponible: falla cerrado.
- **La edad antes que el prefijo** (desviación del orden del encargo, que la
  ponía tras la suspensión): así un menor recibe la misma respuesta exista o no
  el conjunto, y la edad no sirve para averiguar qué códigos cortos existen ni
  qué registro está suspendido.
- **Ninguna ruta pública nueva salvo `POST /auth/registro`** —y el texto de la
  política tenía que venir del servidor—: todo 400 de esa ruta lleva la
  política ([CONTRADICCIÓN] C-60). La app la pide enviando el formulario vacío.
- **Un controlador aparte para «Crear cuenta»**, no en `cuentas.controller.ts`
  como decía el encargo: allí pasaba de 300 líneas. Mismo módulo y mismo
  prefijo `auth/`.
- **Lo ajeno responde 404 en el propio SQL**: cada sentencia de menores, plazas,
  vehículos y visitas filtra por la vivienda del ámbito, y las sondas lo ven
  fallar quitando ese filtro.
- **Reutilizar, no copiar:** editar y borrar un vehículo propio usan la lógica
  del padrón, extraída a `padron/aplicacion/vehiculos-compartidos.ts`
  (`casos-de-uso.ts` baja de 649 a 577 líneas); revocar una visita encadena
  `RevocarAutorizacion` y `SuprimirRostroDeAutorizacion`.
- **Los ficheros vigilados no crecen:** `puertos-hogar.ts` 279 → 273,
  `padron/aplicacion/casos-de-uso.ts` 649 → 577, `biometria/aplicacion/casos-de-uso.ts`
  y `mi.controller.ts` sin cambios. Lo nuevo va en ficheros nuevos.
- **Booleanos llanos en el contrato.** `enum: [true]` hacía que el generador de
  Dart emitiera código que no compila; las seis propiedades nuevas son
  `boolean` y la verdad la pone el validador.
- **Sin cachés** de derechos, ámbitos, edades ni de la suspensión: todo se lee
  en cada petición.
- **El formulario sin código no gasta el cupo (IP, prefijo)**. La política
  llega en el 400 del formulario vacío (C-60). Si ese 400 contara contra el
  conjunto, abrir la pantalla le quitaría intentos a quien de verdad prueba un
  código. Sin código no hay prefijo que contar ni comparación alguna: la forma
  lo para antes. Lo limita el tope por IP, y un código malformado sigue
  contando.
- **«El residente no elige quién es» se prueba entera, desde el enrutador.**
  Toda escritura del residente con cuerpo se recorre con cada uno de los siete
  campos prohibidos, uno a uno, y el 400 tiene que nombrar el campo. Una ruta
  nueva entra sola, y un DTO que declare uno de esos campos pone la prueba en
  rojo.
- **Las pruebas nuevas, por debajo de 300 líneas, partidas por lo que prueban**:
  D5, «Asignar vivienda» y los límites del registro tienen fichero propio, con
  el banco común `banco-del-hogar-pg.ts`. Ninguna aserción cambió al partir, y
  las sondas siguen viendo los defectos desde los ficheros nuevos.

## 3 · Árbol de archivos

**Base de datos.**

- `supabase/migrations/20261007120000_0055_autorregistro_y_titular_asignado.sql` (170) — `origen_de_alta`, edad en la base (`app.es_menor_de_edad`, dos disparadores), 15 hechos nuevos de la bitácora, guarda del origen en `tg_usuario_campos_propios`.
- `supabase/migrations/20261007130000_0056_menores_y_plazas.sql` (368) — `tarjeta_identidad` y `registro_civil`; plazas con `persona_id` (cuenta O persona); el titular añade y retira; topes por copropiedad y por vivienda, con bloqueo consultivo; nadie pierde plazas al bajar el tope.
- `supabase/reversion/0055_revert.sql` (70) · `0056_revert.sql` (72) — reversión con confirmación explícita; la 0055 deja el cuerpo de la 0037 idéntico.
- `supabase/policies/tests/99l_autorregistro_y_menores.sql` (523) — lo que la base sostiene sola: edad, cuenta-o-persona, quién ocupa, topes, bitácora.
- `supabase/policies/tests/99l_plazas_concurrentes.sh` (98) — 20 altas a la vez sobre la cuarta plaza: entra una.
- `supabase/policies/tests/90_residentes_y_vehiculos_propios.sql` — el servicio actúa en nombre de OTRA cuenta: desde la 0056 el titular sí añade plazas (3 líneas).

**Dominio (`packages/domain-core`).**

- `residente/edad.ts` (74) — edad civil en Bogotá con reloj inyectado; 29 de febrero como la base (S-15W-06).
- `residente/vinculacion.ts` — sin «no lo tengo»; `VIVIENDA_SIN_TITULAR` y `TITULAR_NO_SE_MUDA`.
- `residente/ocupantes.ts` — tope por vivienda, añadir y retirar plazas.
- `residente/perfil.ts` · `padron/persona.ts` — documento de adulto frente a TI/RC; fecha obligatoria.
- `index.ts` — exporta `edad`.
- Pruebas: `edad.test.ts` (59), `ocupantes.test.ts` (119), `vinculacion.test.ts` (122, una por par de reglas en conflicto); `residentes-15i.test.ts` (237 → 115) cede sus bloques de vinculación y ocupantes, reescritos para la 15-W, a esas dos.

**API · cuentas.**

- `aplicacion/registrar-residente.ts` (178) — «Crear cuenta» en el orden que es la regla: forma, edad, prefijo, suspensión, código, cuenta con vínculo.
- `aplicacion/puertos-del-registro.ts` (77) — `EscrituraDelVinculo` e `InvitacionesDeResidente`: cuentas declara, residente cumple.
- `aplicacion/politica-de-datos.ts` (28) — versión y texto provisional (P-37).
- `aplicacion/crear-cuenta.ts` — la cuenta y su vínculo en una transacción; compensación en el proveedor.
- `aplicacion/puertos.ts` · `cuentas.module.ts` · `index.ts` — el puerto transaccional y la inscripción al arrancar.
- `infraestructura/repositorio-cuentas-pg.ts` · `-memoria.ts` — `origen_de_alta`; el vínculo dentro de la transacción.
- `presentacion/registro.controller.ts` (95) — `POST /auth/registro`, aparte de `cuentas.controller.ts` (300 líneas).
- `presentacion/dtos-registro.ts` (77) · `limites-de-registro.ts` (59) · `politica-en-el-rechazo.ts` (34) — forma, los tres límites y la política en todo 400.
- Pruebas: `registrar-residente.test.ts` (208) · `crear-cuenta-con-vinculo.test.ts` (107).

**API · residente.**

- Aplicación (casos de uso): `primer-ingreso.ts` (127), `menores-del-hogar.ts` (198), `plazas-del-titular.ts` (152), `vehiculos-propios-edicion.ts` (168), `revocar-mi-visita.ts` (114), `titulares-y-registro.ts` (75), `tope-de-la-copropiedad.ts` (56).
- Aplicación (modificados): `alta.ts` (cambio de vivienda con código), `ocupantes.ts` (de 1 al tope), `perfil.ts`, `supervision-de-residentes.ts` (vivienda obligatoria en el alta), `puertos-hogar.ts` (279 → 273).
- Aplicación (puertos nuevos): `puertos-de-menores.ts`, `-de-plazas.ts`, `-de-suspension.ts`, `-de-titularidad.ts`, `-de-vehiculos-propios.ts`, `-del-primer-ingreso.ts`.
- Aplicación (vocabulario): `tipos-de-hecho.ts` (62) — los hechos de la bitácora, uno por fila de la restricción.
- Infraestructura (PostgreSQL, nuevos): `invitaciones-pg.ts` (248, código en tiempo constante en la copropiedad del prefijo), `menores-pg.ts` (275), `plazas-del-titular-pg.ts` (149), `primer-ingreso-pg.ts` (114), `persona-del-residente-pg.ts` (110, salida de `alta-pg.ts` sin cambiar su lógica), `titularidad-pg.ts` (180), `suspension-del-registro-pg.ts` (72), `tope-de-la-copropiedad-pg.ts` (29), `vehiculos-propios-edicion-pg.ts` (152), `visitas-de-mi-vivienda-pg.ts` (34).
- Infraestructura (modificados): `alta-pg.ts` (314 → 268: suelta la plaza vieja antes de tomar la nueva), `ocupantes-pg.ts`, `bitacora-residentes-pg.ts`, `codigos-de-ocupante.ts` (prefijo del conjunto).
- Presentación (controladores nuevos, ninguno con más de cinco rutas): `mis-menores.controller.ts`, `mis-plazas.controller.ts`, `mis-vehiculos.controller.ts`, `titulares.controller.ts`, `tope-de-plazas.controller.ts`, `registro-de-la-copropiedad.controller.ts`.
- Presentación (DTO): `dtos-menores.ts`, `dtos-plazas.ts`, `dtos-primer-ingreso.ts`, `dtos-revocacion.ts`, `dtos-titulares.ts`, `dtos-vehiculos-propios.ts`.
- Presentación (otros nuevos): `limites-del-hogar.ts` (el límite de vehículos).
- Presentación (modificados): `mi-alta.controller.ts`, `mi-hogar.controller.ts`, `mis-visitas.controller.ts`, `supervision-de-residentes.controller.ts`, `dtos-hogar.ts`, `respuestas-hogar.ts`.
- Composición: `hogar-15w.providers.ts` (198, raíz de composición de la ronda) · `hogar.providers.ts` · `residente.module.ts`.
- Pruebas unitarias: `alta.test.ts`, `menores-del-hogar.test.ts`, `plazas-del-titular.test.ts`, `primer-ingreso.test.ts`, `revocar-mi-visita.test.ts`, `titulares-y-topes.test.ts`, `vehiculos-propios-edicion.test.ts`.

**API · padrón y común.**

- `padron/aplicacion/vehiculos-compartidos.ts` (115) — editar y borrar un vehículo, extraídos del padrón para el residente.
- `padron/aplicacion/casos-de-uso.ts` (649 → 577) · `padron/index.ts` — la extracción anterior.
- `comun/cripto/sobre-aes-gcm.ts` — propósitos `codigoDeTraspaso` e `ipDeRegistro` (HKDF de la maestra, ninguna variable nueva).
- `app.module.ts` — el limitador con nombre `registro`.

**API · pruebas contra PostgreSQL.** Todas con el banco compartido `test/banco-del-hogar-pg.ts` (300).

- `titular-por-administracion-pg.test.ts` (208) — D1.
- `asignar-vivienda-pg.test.ts` (161) — cuentas antiguas y 403 del residente.
- `autorregistro.e2e.test.ts` (224) — D2.
- `autorregistro-limites.e2e.test.ts` (115) — suspensión y 429.
- `menores-del-hogar-pg.test.ts` (297) — D4.
- `plazas-del-titular-pg.test.ts` (194) — D4 bis.
- `vehiculos-propios-pg.test.ts` (160) — D5.
- `mis-visitas-revocacion.e2e.test.ts` (219) — D6.
- Modificadas: `residentes-y-vehiculos-pg` (D1–D3 y el cambio de vivienda); `baja-de-residente-pg`; `aislamiento.e2e` y `aislamiento-residente.e2e` (las 19 rutas nuevas); `escrituras-superadministrador.e2e`; `mfa-retirado.e2e`; `dobles/hogar-en-memoria.ts`.

**Consola (`apps/web/src`).**

- `(consola)/residentes/vivienda-sin-titular.tsx` (144) — selector con búsqueda en el servidor.
- `asignar-vivienda.tsx` (104) — el diálogo con motivo.
- `tope-de-plazas.tsx` (208) — «Plazas: N de M» y «Cambiar tope».
- `configuracion/registro-de-residentes.tsx` (176) — «Registro suspendido por intentos» y «Reanudar».
- `configuracion/tope-de-plazas-por-omision.tsx` (147) — bloque «Hogares».
- `componentes/campo-de-motivo.tsx` (55) · `lib/validacion/tope-de-plazas.ts` (19) — motivo y tope compartidos.
- Modificados:
  - `residentes/pantalla.tsx` — columnas Vivienda y Origen.
  - `dialogos.tsx` — «Nuevo residente» con vivienda.
  - `ocupantes.tsx` — el texto ya no dice «definitivo».
  - `consultas.ts` — sin caché.
  - `configuracion/pantalla.tsx`.
  - `lib/api/cliente.ts` — `mensajeDeFallo`.
- Pruebas:
  - `titulares.test.tsx` (268), `tope-de-plazas.test.tsx` (144), `registro-y-plazas.test.tsx` (196).
  - `pantalla.test.tsx` y `formularios-sin-identificadores.test.tsx`, actualizadas.

**Generados.** `packages/contracts/openapi.json` (183 → 202 operaciones: 19 nuevas, ninguna retirada) · `packages/contracts/src/generado/api.ts` · el cliente Dart en `apps/mobile/lib/infraestructura/api/generado/`.

**App del residente (`apps/mobile`).** Ningún fichero nuevo pasa de 300 líneas; `app.dart` ya pasaba y baja (367 → 364).

- **Dominio:**
  - `edad.dart` (105) — la regla de cortesía con un día de margen (S-15W-14).
  - `registro.dart` (143) — «Crear cuenta»: tipos, puerto, prefijo y reglas del botón.
  - `plazas.dart` (90) — cupo «3 de 4», tope, titular y el mensaje de «Compartir».
  - `menores.dart` (105) · `primer_ingreso.dart` (73) · `vehiculos_propios.dart` (32) · `revocacion.dart` (46).
  - Modificados: `hogar.dart` y `acceso.dart` (el paso «esperar vivienda»).
- **Infraestructura** (sobre el cliente generado):
  - `registro_api.dart` (102) — la política llega en el rechazo.
  - `menores_api.dart` (99) · `plazas_api.dart` (42) · `revocacion_api.dart` (36).
  - `cuerpo_de_error.dart` (66) — `campos` y `politica` del sobre de error; espera del 429.
  - Modificados: `hogar_api.dart` (primer ingreso, cambio de vivienda, vehículos) y `soporte_de_api.dart` (429 en español).
- **Presentación — pantallas nuevas:**
  - `registro.dart` (254).
  - `cambio_de_vivienda.dart` (176) y `declarar_ocupantes.dart` (129), salidas de `alta.dart`.
  - `menor.dart` (209).
- **Presentación — widgets y apoyo nuevos:**
  - `campos_del_registro.dart` (130) · `politica_de_datos.dart` (122) · `fila_de_menor.dart` (108).
  - `campo_de_fecha.dart` (76) · `dialogo_de_motivo.dart` (97) · `compartir.dart` (39).
  - `acciones_de_la_familia.dart` (267) · `material_de_la_app.dart` (38).
- **Presentación — modificados:** acceso, alta, primer ingreso, ocupantes, familia, vehículos, nuevo vehículo, visitantes, perfil, pestañas y dependencias.
- **Generado:** el cliente Dart (52 ficheros nuevos y 23 cambiados en `lib/infraestructura/api/generado/`), por el generador; ninguno a mano.
- **Recorrido web:** `e2e/recorrido-web.mjs` (788 → 868, DT-15W-03), con los pasos de la 15-W.
- **Pruebas nuevas:**
  - Dominio: `edad_test`, `registro_test`, `hogar_15w_test`.
  - Infraestructura: `registro_api_test`, `hogar_15w_api_test`, `primer_ingreso_y_vehiculos_api_test`.
  - Presentación: `registro_test`, `alta_15w_test`, `menores_test`, `ocupantes_test`, `vehiculos_15w_test`, `revocar_test`.
  - Doble: `dobles/hogar_15w_falso.dart`.
- **Pruebas actualizadas:** `hogar_falso`, `app_de_prueba`, `hogar_api_test` (249 → 226: lo nuevo, a `primer_ingreso_y_vehiculos_api_test`), `hogar_15i_test`, `armazon_test`, `pantallas_test`, `servidor_test`, `acceso_test` y `hogar_test`.

**Documentación.**

- **Nuevos:**
  - `docs/decisiones/ADR-037-titular-asignado-y-crear-cuenta-con-codigo-de-plaza.md`.
  - `docs/decisiones/ADR-038-menores-sin-cuenta-gestionados-por-el-hogar.md`.
- **Registro** (`docs/auditoria/contradicciones-y-supuestos.md`): C-57 a C-61, E-07, S-15W-02 a S-15W-17, P-36 cerrada, P-37 y P-38. Recuentos por fila: 52 contradicciones; 177 supuestos, 176 vigentes; 34 pendientes; 7 extensiones.
- **Modelo de datos** (`docs/arquitectura/modelo-datos.md`): 0055 y 0056, con los dos diagramas al día y D-15W-01 y D-15W-02.
- **Guías:**
  - `MANUAL_USUARIO.md`: superadministrador y residente.
  - `CONEXION_SUPABASE.md`: §4, y §6.4 con el registro público apagado.
  - `VALIDACION_HIKVISION_EN_SITIO.md`: el residente de prueba nace con su vivienda.
  - `ENTREGA_EN_SITIO.md`: la 0055 y la 0056 en la víspera.
- **Decisiones:** `README.md` del índice (ADR-037 y ADR-038, y ADR-036, que faltaba) y `ADR-023` (estado: sustituida para residentes).
- **Proyecto:**
  - `README.md`: la ronda; ADR-037 y ADR-038, 35 en total.
  - Este informe.
  - `docs/ESTADO_ETAPAS.md`: cabecera y ficha.

## 4 · Tabla SOLID

**Comprobación mecánica (§2.3).**

- **Ficheros nuevos de código, pruebas y consola: ninguno pasa de 300 líneas.** El mayor de código es `menores-pg.ts` (275) y el de pruebas, `banco-del-hogar-pg.ts` (300).
- **Cuatro pruebas nuevas pasaban y se partieron antes del cierre** (`e8d6e84`). Iban de 305 a 338 líneas; se partieron sin tocar una aserción.
- **Dos SQL nuevos pasan de 300, y se declaran (DT-15W-03).** Son la migración 0056 (368) y la prueba `99l_autorregistro_y_menores.sql` (523). Es el mismo caso que la 0037, la 0038 y la prueba `10_`: una sola transacción cuyo estado encadenan sus secciones.
- **Existentes que siguen por encima del tope y crecen: cuatro.**
  - Tres son listas exhaustivas, cuya función es enumerar cada ruta o formulario nuevo: `aislamiento.e2e` (727 → 737), `aislamiento-residente.e2e` (597 → 617) y `formularios-sin-identificadores.test.tsx` (578 → 597).
  - La cuarta es `residentes-y-vehiculos-pg.test.ts` (620 → 752), porque D1–D3 cambian los flujos 15-I que recorre.
- **Bajan:** `padron/aplicacion/casos-de-uso.ts` (649 → 577), `alta-pg.ts` (314 → 268) y `puertos-hogar.ts` (279 → 273).
- **Clases de producción con más de cinco métodos públicos: ninguna nueva.**
  - Los seis controladores nuevos tienen cinco rutas o menos.
  - Las tres que ya pasaban siguen igual, sin crecer: `RepositorioDeCuentasPg` 6, `AltaDelResidentePg` 6 y `RepositorioDeCuentasEnMemoria` 14.
  - El banco de pruebas `BancoDelHogar` tiene 16. Es código de prueba, como `hogar-en-memoria.ts` (22) o `directorio-del-residente.ts` (12).

| Bloque                                       | SRP                                                                                               | OCP                                                                                                             | LSP                                                                             | ISP                                                                      | DIP                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Base (0055, 0056)                            | Un disparador por invariante: cuenta sólo mayor, persona con cuenta, quién ocupa, tope, conservar | Cada regla nueva es un disparador o una restricción nueva; las de la 0037/0038 no se reescriben salvo la guarda | —                                                                               | —                                                                        | La API no decide lo concurrente: lo decide la base (ADR-04)                                                          |
| Dominio (`edad`, `vinculacion`, `ocupantes`) | Edad, vinculación y tope, cada uno en su módulo puro                                              | `TITULAR_NO_SE_MUDA` entra como un caso más de la lista ordenada; una prueba por cada par en conflicto          | —                                                                               | Funciones pequeñas, sin objeto de servicio                               | Reloj inyectado (`ahora`); cero I/O; el día de Bogotá por el calendario de la zona                                   |
| Cuentas («Crear cuenta»)                     | El caso de uso ordena; los límites, la política y el controlador, cada uno aparte                 | Un vínculo nuevo (otro tipo de cuenta) sería otra `EscrituraDelVinculo`, sin tocar `CrearCuenta`                | El repositorio PG y el de memoria escriben el vínculo dentro de la transacción  | `EscrituraDelVinculo` e `InvitacionesDeResidente`: un propósito cada uno | Cuentas declara los puertos y residente los cumple: cuentas no sabe qué es una plaza; sin inscripción, falla cerrado |
| Residente (D1, D3–D6)                        | Un caso de uso por operación; los ficheros vigilados no crecen y lo nuevo va en ficheros nuevos   | Editar y borrar vehículos reutilizan la lógica del padrón (`vehiculos-compartidos.ts`), no la copian            | Los adaptadores PG y el doble en memoria pasan las mismas pruebas de aplicación | Seis puertos nuevos y pequeños; ninguno lanza `NotImplemented`           | Los casos de uso dependen de puertos; Nest inyecta por token desde `hogar-15w.providers.ts`                          |
| Superadministrador (titulares, topes)        | Asignar vivienda, suspensión y topes en casos de uso y controladores distintos                    | El tope por omisión es una ruta propia, no un campo más de la configuración general                             | —                                                                               | Puertos de titularidad, suspensión y tope separados                      | Las comprobaciones previas sólo eligen 404 o 409; la verdad la escribe la base                                       |
| Consola                                      | Selector, diálogo, tope, aviso y tope por omisión, un componente cada uno                         | `campo-de-motivo.tsx` y la validación del tope se comparten                                                     | —                                                                               | Props mínimas                                                            | Cliente generado desde OpenAPI; ninguna vista consulta Supabase                                                      |

`grep -rE "supabase|axios|isapi" packages/domain-core/src/` sigue en 0.

## 5 · Trazabilidad

| Referencia                                                 | Cómo queda                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Problema 1 del encargo (CRÍTICO)**                       | **Cerrado.** Ninguna cuenta se hace titular de una vivienda vacía: la rama «no lo tengo» desaparece y la primera cuenta nace asignada por la administración. Tres altas simultáneas para la misma vivienda dan 201, 409 y 409, y las identidades sobrantes se borran del proveedor |
| **Problemas 2 a 7**                                        | **Cerrados**: revocación propia (D6), editar y eliminar vehículos con límite propio (D5), `tarjeta_identidad` y `registro_civil` (0056), regla de edad (`edad.ts` y 0055), menores (D4), plazas del titular (D4 bis)                                                               |
| **OE-01** · **HU-02** · **CA-01**                          | La cuenta del titular nace asociada a su vivienda; la consola la muestra en la columna «Vivienda»                                                                                                                                                                                  |
| **HU-04** · **RN-19** · **CA-02**                          | La baja de un menor lo deja inactivo con su historial. Un vehículo con historial se da de baja; sin historial se borra                                                                                                                                                             |
| **HU-05** · **HU-06** · **RN-04** · **CA-03** · **ADR-04** | El residente edita sus vehículos. La placa sólo cambia sin historial, y la de otro vehículo activo da 409 por el índice único parcial                                                                                                                                              |
| **HU-10** · **CA-07**                                      | **Parcial.** El residente revoca su propia visita (antes sólo podía portería). Que la siguiente detección se niegue lo da el motor desde la ETAPA 05, por el estado `revocada`; aquí se prueba el estado y la supresión, no una detección                                          |
| **RN-05**                                                  | La visita, el vehículo, el menor y la plaza se buscan por la vivienda del ámbito, en el propio SQL. Los de un vecino dan 404, y las sondas lo ven fallar quitando el filtro                                                                                                        |
| **OE-04** · **RN-11**                                      | Al revocar una visita, su rostro sale de las terminales en el acto. La baja de un menor suprime sus plantillas                                                                                                                                                                     |
| **RN-13**                                                  | Asignar titular o vivienda exige una vivienda activa: una inactiva da 404                                                                                                                                                                                                          |
| **RN-15** · **KPI-36/37** · **CA-24** · **CP-11**          | Lo ajeno da 404 en el SQL. Las 19 rutas nuevas están en las listas exhaustivas de aislamiento, que rompen si una ruta queda sin clasificar                                                                                                                                         |
| **RN-20** · **HU-37**                                      | Sin cambio: el superadministrador sigue con segundo factor. Las rutas nuevas de administración son suyas, y el residente recibe 403 (`asignar-vivienda-pg`)                                                                                                                        |
| **Ley 1581 de 2012**                                       | La casilla de tratamiento de datos registra la versión aceptada en la bitácora. Los menores no tienen cuenta (D-W2). El texto es provisional (P-37)                                                                                                                                |
| **ADR-023 → ADR-037** · **ADR-038**                        | Formalizados; contradicciones **C-57 a C-60**                                                                                                                                                                                                                                      |
| **P-36**                                                   | **Cerrada** por D-W10                                                                                                                                                                                                                                                              |
| **KPI-13, 17, 25, 32, 33** · hitos 2 y 3                   | Sin cambio en esta ronda: siguen pendientes en sitio (**BE-02**)                                                                                                                                                                                                                   |

## 6 · Pruebas

### Qué se probó y cómo

**Base de datos.** `./supabase/verificar.sh --con-pruebas --modo-supabase`, sobre la base `ncr` reconstruida (0001 a 0056).

- `99l_autorregistro_y_menores.sql` recorre, una transacción que se deshace:
  - la edad con el día de Bogotá;
  - cuenta O persona;
  - quién ocupa una plaza;
  - el titular y el tope;
  - el tope propio;
  - nadie pierde plazas al bajar el tope;
  - el administrador no toca topes;
  - la bitácora sin cuenta.
- `99l_plazas_concurrentes.sh`: **20 altas simultáneas sobre la cuarta plaza: entra una, 19 rechazadas, 4 vivas**.
- El modo Supabase demuestra por ejecución el `REVOKE` al dueño y la RLS forzada.
- La 0056 avisa cuántas viviendas superaban el tope y conservan sus plazas. En la base de pruebas: **0**.

**Dominio, sin base** (`packages/domain-core`, 44 pruebas en 4 ficheros):

- `edad.test` (9): el día de Bogotá frente al de UTC, y el 29 de febrero.
- `ocupantes.test` (15).
- `vinculacion.test` (13): una por cada par de reglas en conflicto.
- Lo que sigue vigente de `residentes-15i.test` (7).

**Aplicación, sin base** (57 pruebas en 9 ficheros):

- `registrar-residente` (8): el orden de los pasos es la regla, y todo fallo de código espera lo mismo.
- `crear-cuenta-con-vinculo` (4): la compensación, forzada.
- `alta` (9).
- `menores-del-hogar` (8).
- `plazas-del-titular` (5).
- `primer-ingreso` (5).
- `revocar-mi-visita` (5).
- `titulares-y-topes` (6).
- `vehiculos-propios-edicion` (7).

**API contra PostgreSQL** (la cadena real con el gancho de claims y la RLS forzada; sólo el proveedor de identidad es falso):

| Fichero                         | Pruebas | Qué demuestra                                                                                                                                                                                   |
| ------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `titular-por-administracion-pg` | 5       | D1: nace asignada; 409/404; **tres altas a la vez → 201, 409, 409** y las identidades sobrantes borradas; el titular menor, bloqueado                                                           |
| `asignar-vivienda-pg`           | 2       | Cuentas antiguas con motivo; el residente, 403 en las rutas de la administración                                                                                                                |
| `autorregistro.e2e`             | 9       | D2: la política en el 400; forma; campos prohibidos; menor sin rastro; nace en ESA plaza; **cuatro fallos distintos, la misma respuesta y el tiempo mínimo**; la carrera de cuatro → una cuenta |
| `autorregistro-limites.e2e`     | 3       | 30 fallos suspenden; un código bueno, suspendido, contesta como uno malo y no cuenta; reanudar; 429 por IP                                                                                      |
| `menores-del-hogar-pg`          | 7       | D4: cualquier adulto; 18+ → 400; plaza ocupada 409 y dos altas a la vez → una; lo ajeno 404; el traspaso conserva persona y plaza                                                               |
| `plazas-del-titular-pg`         | 7       | D4 bis: tope en la base, también con cinco «añadir» a la vez; otro adulto 403; la plaza ajena 404                                                                                               |
| `vehiculos-propios-pg`          | 5       | D5: la placa sólo sin historial; tipo, vivienda o estado → 400; duplicada 409; el del vecino 404; borrado o baja                                                                                |
| `mis-visitas-revocacion.e2e`    | 5       | D6: el rostro fuera de las terminales en el acto; la del vecino y la de otra copropiedad 404; dos veces 409                                                                                     |
| `residentes-y-vehiculos-pg`     | 14      | Los flujos 15-I reescritos para D1–D3, y el cambio de vivienda con código (el defecto del orden)                                                                                                |
| `baja-de-residente-pg`          | 5       | El titular dado de baja deja la vivienda sin titular                                                                                                                                            |

**API sin base:**

- `limitador-de-registro.e2e` (4): el limitador (IP, prefijo), visto fallar, y el formulario sin código fuera de él.
- `campos-prohibidos-del-residente.e2e` (2): toda escritura del residente con cuerpo, sacada del enrutador, rechaza cada uno de los siete campos.
- Las listas exhaustivas de `aislamiento.e2e` y `aislamiento-residente.e2e` con las 19 rutas nuevas.

**Consola:** las pruebas de `@ncr/web` (titulares, tope de plazas, registro y plazas, residentes, formularios sin identificadores y `mi`).

**App:**

- `flutter analyze` sin hallazgos.
- `flutter test`: **455 en verde**, también con `TZ=Pacific/Auckland` y `TZ=America/Bogota`.
- Cobertura (`cobertura-flutter.mjs`): dominio 98,26 %, aplicación 96,89 %, infraestructura 91,36 %, presentación 91,31 %, global 91,48 %.
- El recorrido web (`recorrido-web.mjs`), completo con los pasos de la 15-W.

**Sondas de mutación** (cada control nuevo, visto fallar; se aplicó la violación, se corrió la prueba, salió roja y se restauró). Del backend, 30:

- **El titular y la vivienda** (7):
  - el titular que se muda;
  - el orden de la mudanza;
  - dos titulares a la vez;
  - la identidad huérfana;
  - viviendas sin titular sin filtro;
  - el menor sin bloquear;
  - el origen de alta sin guarda en la base.
- **El registro** (8):
  - la edad tras el prefijo;
  - el fallo que no cuenta;
  - el suspendido sin igualar;
  - el vínculo sin compensar;
  - la alerta `'suspendido'`;
  - el formulario vacío que gasta cupo;
  - sin el limitador con nombre;
  - la carrera sin igualar.
- **Menores** (5):
  - editar un menor ajeno;
  - sin regla de edad;
  - traspaso sin titular;
  - traspaso sin fecha;
  - baja sin regenerar.
- **Plazas** (4):
  - sin el disparador del tope;
  - un adulto que añade plazas;
  - sin conservar plazas al bajar el tope;
  - retirar una plaza ajena.
- **Vehículos** (2): la placa con historial; el del vecino, sin filtro.
- **Visitas** (3):
  - revocar la del vecino;
  - el rostro sin suprimir;
  - revocar dos veces.
- **Campos prohibidos** (1): un DTO con `viviendaId`.

La consola y la app hicieron lo mismo con sus condiciones nuevas: cada una, rota a propósito, puso en rojo su prueba.

**Cómo ejecutarlas:**

1. `eval "$(./scripts/base-de-pruebas.sh arrancar)"`.
2. `./supabase/verificar.sh --con-pruebas --modo-supabase`.
3. `./scripts/verificar-etapa.sh --con-base`.
4. La app, desde `apps/mobile`: `flutter analyze && flutter test`.

### Veredicto literal de `./scripts/verificar-etapa.sh --con-base` (§2.8.0)

Sobre `3ded4f5`, desde cero (sin `dist/`, `.turbo/` ni `coverage/`, instalación
con `--frozen-lockfile`), con la base `ncr` reconstruida de 0001 a 0056, en
39 min 51 s:

```
VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe
```

El control declarado y no ejercido es el de **D-112**: las 5 pruebas del arranque en frío que la suite
salta porque necesitan los claims que escribe el paso 12b, que es quien las
ejecuta.

**Pasos y recuentos.** 31 de 31 pasos.

- **Paso 5, TypeScript.** Ninguna omisión por falta de base: 45 ficheros usan la base, todos con su guardián.

  | Paquete            | Pruebas en verde                    |
  | ------------------ | ----------------------------------- |
  | `@ncr/api`         | **2389**, más 5 saltadas declaradas |
  | `@ncr/providers`   | 1231                                |
  | `@ncr/web`         | 805                                 |
  | `@ncr/domain-core` | 463                                 |
  | `@ncr/edge`        | 325                                 |
  | `@ncr/config`      | 144                                 |

- **Total de TypeScript: 5362 pruebas.** Coinciden por los dos caminos (paso 7b) y salen iguales tres veces seguidas sin caché (paso 14: la API, 2394 de 2394).
- **Dart:** 455 (paso 5c), también en otro huso horario.
- **Ficheros de prueba:** 517 de 517 recogidos.

**Rendimiento y concurrencia.**

- KPI-25 (paso 11): p50 8 ms · p95 42 ms · p99 54 ms, frente a un umbral de 10 s.
- KPI-03: 100 inserciones concurrentes, 0 duplicados.
- 50 ingresos simultáneos sobre 10 plazas de aforo: ni uno de más.

**Controles y entorno.**

- Los 35 controles detectan su violación.
- El trinquete de ramas sin ejercer no sube: 257, y bajó 1.
- Ensayo de sitio en simulado: «SIN FALLOS · 47 OK · 0 FALLO».
- El recorrido de la consola (13b) y el de la app (5e), en verde.
- Cliente Dart al día (473 ficheros).
- Historial sin secretos (7342 blobs).
- 164 campos de texto con cota.
- 56 migraciones aplicables con `supabase db push`.

**Después de esta corrida** entraron las tres correcciones de la revisión automática del PR (`fix(etapa-15w/hogar)`, posterior al cierre).

- Se validaron con:
  - las 41 suites de vehículos, plazas, padrón, residente y cuentas contra la base (365 en verde);
  - lint y typecheck;
  - el contrato y los dos clientes regenerados;
  - una sonda por corrección, en rojo con su violación.
- La verificación completa de esa cabeza es la del CI del PR, que corre `verificar-etapa.sh --con-base` en macOS.

Antes de esta corrida, la base y las suites tocadas se ejecutaron por separado:

- La suite SQL en modo Supabase.
- Las suites PG de la ronda, dos veces seguidas en paralelo, contra `ncr15w`.
- La de la carrera del registro, tres veces.

### Cobertura por capa

| Capa                            | Líneas  | Ramas   | Funciones | Umbral |
| ------------------------------- | ------- | ------- | --------- | ------ |
| Dominio (`domain-core`)         | 96,30 % | 96,52 % | 96,19 %   | 90 %   |
| Aplicación (`**/aplicacion/**`) | 97,60 % | 91,69 % | 98,46 %   | 90 %   |
| Global (TypeScript)             | 88,11 % | 87,10 % | 87,04 %   | 70 %   |
| App · dominio                   | 98,26 % | —       | —         | 90 %   |
| App · aplicación                | 96,89 % | —       | —         | 90 %   |
| App · global (sin lo generado)  | 91,48 % | —       | —         | 70 %   |

## 7 · Verificación de seguridad (§2.7)

| §2.7 | Qué se comprobó en esta ronda                                                                                                                                                                                                                                                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **Secretos.** Ninguna variable nueva: las llaves del código de traspaso y del HMAC de la IP salen de la maestra por HKDF, con propósito propio (ADR-025). El escaneo del índice (gancho de cada commit) y del historial está limpio                                                                                                                                       |
| 2    | **CORS.** Sin cambio                                                                                                                                                                                                                                                                                                                                                      |
| 3    | **Validación.** Cada ruta nueva del residente rechaza con 400 `viviendaId`, `personaId`, `titularId`, `rol`, `estado`, `origen` y `es_titular`, y «Crear cuenta» rechaza `rol`, `copropiedadId`, `viviendaId`, `plazaId` y `esTitular`. La forma vive en el DTO (cota por campo, también en las tres fechas: `longitud-por-campo`); la verdad, en el dominio y en la base |
| 4    | **Inyección SQL.** Todo va parametrizado, y la búsqueda de viviendas sin titular usa `position()`: ningún comodín del usuario llega a un `LIKE`. Motivos y nombres pasan por el saneamiento global; el motivo de revocación tiene un máximo de 200                                                                                                                        |
| 5    | **Límites por petición.** Ver la tabla de abajo. Todo 429 lleva `Retry-After`, y la prueba lo comprueba en el registro                                                                                                                                                                                                                                                    |
| 6    | **RLS.** Las tablas tocadas siguen con `FORCE ROW LEVEL SECURITY`; la única política nueva es estrecha (`viviendas_tope_plataforma`). Los disparadores fallan cerrado. Las rutas que escriben como servicio validan la copropiedad también en la aplicación. Lo ajeno da 404 en el SQL, y las sondas lo ven fallar sin el filtro                                          |
| 7    | **CSP.** Sin cambio: la consola no añade orígenes                                                                                                                                                                                                                                                                                                                         |
| 8    | **Transversales.** Ver los puntos de abajo                                                                                                                                                                                                                                                                                                                                |

Límites por petición (§2.7.5):

| Ruta                        | Límite                                      |
| --------------------------- | ------------------------------------------- |
| Registro, por IP            | 10 cada 10 min                              |
| Registro, por (IP, prefijo) | 5 cada 15 min                               |
| Registro, por copropiedad   | 30 fallos en una hora suspenden su registro |
| Vehículos                   | 20 por minuto                               |
| Menores                     | 20 por minuto                               |
| Plazas                      | 10 por minuto                               |
| Revocación de visitas       | 30 por minuto                               |
| Topes y asignar vivienda    | 10 por minuto                               |

Transversales (§2.7.8):

- **RBAC.** Las rutas son declarativas (`@Roles`) y el segundo factor del superadministrador no cambia.
- **Registro.** Ante un código fallido, la respuesta y el tiempo mínimo son iguales (500 ms), y el código se compara en tiempo constante.
- **Datos personales.**
  - La IP sólo llega a la bitácora como HMAC (`ip:<16 hex>`, probado).
  - El documento del menor sale enmascarado (`••••5678`, probado) y el del perfil no entra en la bitácora (probado).
  - Esta ronda no añade ninguna línea de log.
- **Registro público de Supabase Auth.** Debe seguir desactivado: es un paso manual del §9.

## 8 · Deuda técnica, supuestos y pendientes

**Deuda técnica.**

- **DT-15W-01 · Los 409 de la administración no llevan un código máquina.** Pasa con «Esta vivienda ya tiene titular», «Ese usuario no está disponible» y «Esa cuenta ya tiene vivienda». La consola sólo puede mostrar el texto y refrescar la lista; no puede, por ejemplo, quitar del selector la vivienda que otro acaba de tomar. En la app, el 409 del usuario ocupado no tiene `campos` y no se pinta bajo «Usuario».
- **DT-15W-02 · La lista de vehículos del residente no dice cuáles son propios.** `GET …/mi/vehiculos` no trae `origen`, tipo ni ocupantes. La app ofrece «Editar» y «Eliminar» en todos, y los que registró la administración contestan 404 «Vehículo propio no encontrado» al intentarlo. Arreglarlo es un campo más en el contrato de una ruta de `mi.controller.ts`, que esta ronda no debía tocar.
- **DT-15W-03 · Ficheros por encima de 300 líneas.**
  - Nuevos: la migración 0056 (368) y la prueba `99l_autorregistro_y_menores.sql` (523).
  - Existentes que crecen:
    - las tres listas exhaustivas;
    - `residentes-y-vehiculos-pg.test.ts` (620 → 752);
    - el recorrido de la app `apps/mobile/e2e/recorrido-web.mjs` (788 → 868), con los pasos de la 15-W.
  - Y `padron/aplicacion/puertos.ts` (416 → 418): la variante `placa_con_historial` del resultado de editar, que exige la corrección del PR.
  - Se suman a DT-15P-02 y anteriores (§4).
- **DT-15W-04 · La ficha de plazas de la consola no distingue a un menor sin cuenta** (`PlazaDeOcupanteDto.sinCuenta`): ve «ocupada». Se pinta en la app, no en la consola.
- **DT-15W-05 · Los 400 de forma del `ValidationPipe` llegan en inglés y sin `campos`.** Los de la regla —el caso de uso— sí llevan `campos` y texto en español. La app cubre en el teléfono los casos conocidos.
- **DT-15W-06 · «Compartir» no abre la hoja del sistema** ([CONTRADICCIÓN] C-61): copia el mensaje completo al portapapeles y lo dice. La hoja exige una dependencia nativa nueva (`share_plus`), que queda propuesta.
- **DT-15W-07 · La consola del residente no tiene nada de la 15-W.**
  - Falta: «Crear cuenta», primer ingreso, menores, plazas, editar y eliminar vehículos, y revocar visitas.
  - Es la única vía del iPhone en producción (P-23).
  - Un adulto con sólo iPhone, que no sea el titular, no puede crear su cuenta.
  - La paridad (D-12) es una ronda propia: las rutas existen y son las mismas que usa la app.
- **DT-15W-08 · La víspera de sitio (`pnpm sitio:ensayo`) comprueba las migraciones 0047–0054, no la 0055 ni la 0056.** Su aplicación se confirma con `supabase migration list` (§9); `ENTREGA_EN_SITIO.md` lo dice.

**[SUPUESTO]** S-15W-02 a S-15W-17 en `docs/auditoria/contradicciones-y-supuestos.md`:

- **De la regla:**
  - S-15W-02 · la fecha de nacimiento en «Crear cuenta».
  - S-15W-03 · el tope de 4 contando al titular.
  - S-15W-05 · el código de traspaso.
  - S-15W-06 · el 29 de febrero.
  - S-15W-07 · `usuarios.nombre` hasta el primer ingreso.
  - S-15W-08 · el texto provisional de la política.
  - S-15W-09 · la alerta de la suspensión.
  - S-15W-10 · el titular no se muda.
  - S-15W-13 · «Crear cuenta» exige el código corto del conjunto.
- **De la consola:**
  - S-15W-11 · «Asignar vivienda» sólo en cuentas activas.
  - S-15W-12 · el 1–20 del tope, como cortesía.
- **De la app:**
  - S-15W-04 · el correo del registro llega al primer ingreso.
  - S-15W-14 · la edad en el teléfono, con un día de margen.
  - S-15W-15 · «Revocar» en vigentes y programadas.
  - S-15W-16 · «Eliminar» sustituye a «Dar de baja».
  - S-15W-17 · la entrada automática tras «Crear cuenta».

**[CONTRADICCIÓN]** registradas y resueltas: C-57 (ADR-023 frente a D-W1), C-58 («no lo tengo» frente a D-W9), C-59 (`FOR UPDATE` frente a la 0038), C-60 (la política sin ruta pública nueva), C-61 (la hoja de compartir frente a «sin tecnologías nuevas»).

**PENDIENTE DE DEFINICIÓN.**

- **P-37** · El texto definitivo de la política de tratamiento de datos.
- **P-38** · El cambio de titular de una vivienda con otros adultos. Hoy se deniega.
- **P-36**, cerrada por D-W10.

## 9 · Qué debe hacer el usuario manualmente

1. **Aplicar las migraciones 0055 y 0056**: `supabase db push`, y confirmar con
   `supabase migration list` que las dos aparecen aplicadas. La 0056 avisa
   (`NOTICE`) cuántas viviendas superaban el tope de 4 y conservan sus plazas con
   un tope propio: anótelo.
2. **En el panel de Supabase (Authentication → Sign In / Providers), comprobar
   que el registro público sigue DESACTIVADO** («Allow new users to sign up»).
   «Crear cuenta» no lo necesita: pasa por la API, que crea la identidad con la
   llave secreta después de validar el código. Con el registro público abierto,
   cualquiera crearía identidades sin código (`CONEXION_SUPABASE.md`).
3. **Comprobar que cada copropiedad tiene su código corto** (Configuración →
   «Código de acceso de la copropiedad»). Sin él, los códigos de plaza salen sin
   prefijo y «Crear cuenta» los rechaza (S-15W-13).
4. **En la consola, crear la primera cuenta de cada vivienda** con su vivienda
   asignada («Nuevo residente»), entregar usuario y contraseña inicial al
   titular en persona, y **asignar vivienda a las cuentas antiguas** que aún no
   la tengan («Asignar vivienda», con motivo).
5. **Decidir tres cosas:**
   - **P-37** · pedir al área legal el texto definitivo de la política de datos.
   - **P-38** · cómo se cambia el titular de una vivienda con otros adultos.
   - **C-61** · si se añade `share_plus` para que «Compartir» abra la hoja del sistema.

## 10 · Rama y commits

Rama `etapa-15w-cuentas-y-hogar`, desde `develop` (`f605442`) · PR [4rg3n15/NextResidential#51](https://github.com/4rg3n15/NextResidential/pull/51), **sin fusionar** (lo fusiona usted).

- `061a764` feat(etapa-15w/base): 0055 y 0056 — autorregistro, titular asignado, menores y tope de plazas
- `e91477f` feat(etapa-15w/base): una cuenta no se cambia a sí misma el origen de alta
- `a35f5e3` feat(etapa-15w/hogar): D1–D6 en dominio y API — titular asignado, «Crear cuenta», menores, plazas, vehículos y visitas
- `b586a5d` feat(etapa-15w/consola): contrato regenerado y la consola de la 15-W
- `5923152` test(etapa-15w/hogar): la plaza de otra vivienda no existe para su titular
- `00de863` fix(etapa-15w/hogar): las tres fechas de nacimiento nuevas, con cota por campo (§2.7.4)
- `356f8bb` refactor(etapa-15w/hogar): cinco rutas por clase — vehículos propios y titulares, en su controlador
- `e8d6e84` test(etapa-15w/hogar): ninguna prueba nueva pasa de 300 líneas (§2.3)
- `0bc0a25` fix(etapa-15w/cuentas): el formulario sin código no gasta el cupo (IP, prefijo) — y el limitador, visto fallar
- `48a65c5` test(etapa-15w/hogar): ninguna escritura del residente acepta los siete campos prohibidos
- `e6c8050` fix(etapa-15w/cuentas): la plaza tomada en ese instante contesta como un código usado
- `58ad78a` fix(etapa-15w/consola): dos textos del residente que la 15-W volvió falsos
- `eaacafd` feat(etapa-15w/app): «Crear cuenta», primer ingreso, menores, plazas, vehículos y visitas en la app del residente
- `3ded4f5` docs(etapa-15w): ADR-037 y ADR-038, el registro (C-57 a C-61, E-07, S-15W, P-36 a P-38), modelo de datos y guías
- cierre: `chore(etapa-15w): cierre de etapa` — este informe y la ficha y cabecera de `docs/ESTADO_ETAPAS.md`
- `6bc6995` fix(etapa-15w/hogar): las tres observaciones de la revisión del PR — tope omitido, número de plaza y placa con historial
- y su registro en este informe y en la ficha (`docs(etapa-15w)`)
