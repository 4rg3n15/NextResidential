# ETAPA 15-B · Consola del superadministrador y lo que la documentación ISAPI obliga

**Rama:** `consola-superadmin-equipos` · **Base:** `develop` (`f64b1d8`)
**No es una etapa del mapa de §5.** Es una ronda de corrección sobre código ya
fusionado (PR #25) más el aprovisionamiento de equipos que la ETAPA 15 dejó
fuera. Se documenta con el mismo rigor que una etapa porque toca esquema,
dominio, API, consola y verificador.

---

## 1 · Qué se construyó

Cuatro frentes, una sola rama.

**El primero fue el frente C**, y ese orden no es casual: es código que ya está
fusionado y que la guía oficial del fabricante demuestra que estaba mal. Un
defecto en producción se corrige antes de construir encima. La guía dice que
`ctrlMod` decide **quién abre la barrera** —la cámara o la plataforma—, y que la
lectura que el proyecto tenía de `barrierGateCtrlType` estaba invertida. También
enumera diez partes en el POST del «servidor de alarma», y dos de ellas son las
caras del conductor y del acompañante: dato biométrico entrando por una puerta
que nadie abrió.

**El frente A** abre la puerta que faltaba: dar de alta una cámara exigía
`psql`. Ahora se hace desde la consola, con la clave del equipo guardada
cifrada, y con un «probar conexión» que corre en el servidor y distingue cuatro
situaciones distintas en vez de decir «no se pudo conectar».

**El frente B** son seis correcciones de la consola que el usuario encontró
usándola. La más profunda invierte el asistente de alta de viviendas: preguntaba
torres, pisos y viviendas por piso, y **nunca cuántas viviendas hay**.

**El frente D** cierra dos defectos del propio verificador: uno reutilizaba un
clúster de PostgreSQL sin comprobar que servía, y el otro informaba «terminó en
rojo» sin poder nombrar la prueba.

---

## 2 · Cómo se organizó y por qué

### 2.1 · El control existe antes que el adaptador (C.1)

`ctrlMod` no es un dato del inventario: es el interruptor del que depende el
principio rector del producto. Con `ctrlMod = 0` la cámara abre por su cuenta,
el motor de reglas queda decorativo y se pierde la trazabilidad de RN-02 y
RN-03. Por eso **no** se resolvió escribiendo una nota en la guía de puesta en
marcha, que es lo que habría sido cómodo: se resolvió como una comprobación de
arranque del proveedor (`comprobarModoDeControl`) y como parte del alta de un
equipo desde la consola. Con un valor que no sea `1`, el equipo queda **NO
VERIFICADO** y la pantalla dice por qué, con esas palabras.

El tercer valor —`2`, «ambos»— es el que más fácil habría sido aceptar y el que
peor habría estado: significa que la cámara **también** puede abrir. No es un
término medio; es el caso 0 con una puerta más.

### 2.2 · Un solo cifrado en el proyecto (A.1)

La tentación evidente al tener que cifrar el secreto de un equipo era escribir
un segundo cifrado «parecido» al de las plantillas biométricas. Dos cifrados son
dos superficies que auditar, dos sitios donde equivocarse con el vector de
inicialización y dos respuestas distintas a «¿y si rota la llave?».

El sobre AES-256-GCM con llave derivada por copropiedad (HKDF, H-13-02) se
extrajo a `apps/api/src/comun/cripto/sobre-aes-gcm.ts` y lo comparten los dos
usos. Lo que **no** se comparte es el material de clave: `EQUIPOS_LLAVE` es
distinta de `BIOMETRIA_LLAVE`, y el `info` de HKDF ata cada llave derivada a su
propósito. Comprometer las plantillas no entrega las cámaras.

### 2.3 · El secreto es de escritura POR TIPO, no por costumbre (A.2)

`EquipoDto` —lo que la API devuelve— **no declara el campo**. No está
enmascarado ni vacío: no existe, y el tipo generado para la consola tampoco lo
tiene, así que no hay descuido posible dentro de seis meses.

El enmascarado («••••») habría sido peor que inútil: obliga a la consola a
distinguir «no lo cambies» de «ponlo a puntos», y el día que alguien reenvíe el
formulario entero la credencial del equipo pasa a ser literalmente «••••••».
Aquí, `secreto` ausente significa «no lo cambies» y punto.

### 2.4 · Cuatro resultados, y ninguno genérico (A.3)

«No se pudo conectar» manda a revisar cuatro cosas a la vez. Cada uno de estos
cuatro se resuelve de una manera y sólo de una:

| Resultado      | Qué pasó                                | Qué hace el sistema                                           |
| -------------- | --------------------------------------- | ------------------------------------------------------------- |
| `alcanzado`    | Contesta y autentica                    | Guarda modelo y firmware del propio equipo; queda VERIFICADO  |
| `decide_solo`  | Contesta, autentica, y `ctrlMod` ≠ 1    | **Hallazgo de bloqueo.** NO VERIFICADO con ese motivo exacto  |
| `credencial`   | El equipo rechaza el usuario o la clave | Lo dice **y avisa de que no se reintente**: bloquea la cuenta |
| `inalcanzable` | No contesta                             | Nombra host y puerto, **jamás el secreto**                    |

El aviso de la credencial es literal y se repite en la pantalla porque el modo
de fallo real no es teclear mal la clave una vez: es **volver a intentarlo cinco
veces** y dejar la cuenta de servicio bloqueada en el equipo.

Guardar un equipo que no contesta es legítimo —se instala el lunes— y queda
marcado con su motivo. Lo que no se hace es probar cuando no hay clave: al
editar sin reescribirla, el sistema dice que no probó en vez de inventar un
rechazo, porque un rechazo falso invita a reintentar.

### 2.5 · La pregunta que faltaba (B.1)

El asistente de alta de viviendas tenía tres formularios y el de apartamentos
—el que usa un edificio— **nunca preguntaba cuántas viviendas hay**. Pedía
torres, pisos y viviendas por piso, y la cantidad salía de multiplicar. Quien
administra un conjunto sabe que tiene 120 apartamentos; que salgan de 4 × 6 × 5
es una cuenta que tenía que hacer él para poder contestar. Y el denominador
—torre, sector, manzana— era obligatorio incluso donde no existe.

Queda invertido, con **un solo plan para todos los tipos**:

- El denominador es **opcional**: `agrupaciones = 0` significa que el conjunto
  no se divide y las viviendas son sólo número.
- La cantidad es la pregunta principal: sin denominador, el total; con
  denominador, la cantidad **por cada uno**, que es como se describe un conjunto
  de verdad («cinco torres de veinticuatro»).
- Los pisos pasan a ser una forma de **numerar**, no de contar. Un edificio de
  24 apartamentos con 4 por piso tiene 6 pisos: eso lo deduce el plan.

No se reabrió nada de lo ya resuelto: la identidad de una vivienda sigue siendo
el par (agrupación, identificador) sostenido por el índice único compuesto
(ADR-04, migración 0029), y la creación sigue ocurriendo en una sola sentencia
que se revierte entera.

### 2.6 · El borrado definitivo, sin tocar el disparador (B.2)

RN-19 prohíbe el borrado físico **donde hay historial**. El disparador genérico
prohibía **todo** borrado, que es más de lo que la regla pide, y dejaba sin
salida el caso real: «la creé por error hace un minuto».

El disparador **no se deshabilitó**. Se sustituyó en `viviendas` por uno que
expresa la regla con precisión: mira si hay residentes, vehículos,
autorizaciones o **un solo evento**, y sólo entonces se niega. La garantía sigue
estando en la base y alcanza también al dueño de la tabla. Lo que cambia es que
ahora la base **mira** en vez de suponer.

El borrado pasa por una función `SECURITY DEFINER` que vuelve a comprobar la
copropiedad, vuelve a comprobar el historial y escribe el rastro de auditoría en
la misma transacción que el borrado. Ni `authenticated` ni `service_role` tienen
el privilegio de `DELETE`: la función es la única puerta, y tiene cerradura (una
política de `DELETE` nueva, porque antes no hacía falta ninguna).

### 2.7 · Dos ajustes que dejan de serlo (B.5)

Un campo de formulario dice «esto es tuyo, elige». Ninguno de los dos lo era:

- **El umbral de confianza no era un número del conjunto: era un número del
  fabricante.** La cámara publica `confidenceLevel` en la escala 0–100 del
  evento ANPR. Mientras fue editable, el valor por omisión —0,85— eran
  centésimas inventadas: nadie podía decir de dónde salían. Ahora es **80 sobre
  100**, con respaldo documental, y cambiarlo exige migración.
- **El margen de latido no era independiente.** La base ya lo ata al periodo de
  latido y a los latidos tolerados (`copropiedades_umbral_latido_coherente`,
  migración 0020). Dejarlo editable permitía contradecir esa restricción desde
  una pantalla, y entonces el rechazo llegaba como un error de base de datos.

Los dos siguen **viéndose** con su motivo, que es la diferencia entre «solo
lectura» y «oculto» que el catálogo de configuración ya defendía.

La migración 0032 contesta la pregunta que había que contestar en la migración y
no en el informe: **qué pasa con los valores ya guardados**. Se normalizan al
valor documentado, y también cambia el valor por omisión de la columna — sin
eso, cada copropiedad nueva nacía con el 0,850 anterior y chocaba contra la
restricción nueva. Lo demostró la primera semilla que se cargó.

### 2.8 · El verificador no puede dar por bueno lo que no comprobó (D)

`base-de-pruebas.sh` aplicaba `max_connections=300` sólo al **crear** el
clúster; si encontraba uno vivo lo reutilizaba sin mirar nada. Un clúster
levantado antes de esa corrección seguía con el 100 por omisión y las pruebas de
KPI-03 y de aforo morían con «sorry, too many clients already», de forma
intermitente. Ahora la rama de reutilización consulta `SHOW max_connections` y,
si no llega, lo dice y lo reinicia.

El paso de estabilidad informaba «la corrida N terminó en rojo» y, con sus
propias palabras, «sin nombre de prueba en la salida: el reportero no lo emitió.
Es un defecto de ESTE control». Lo era: **raspaba la consola**, y el formato de
la consola depende del reportero, que depende de si `CI` está puesto. Ahora los
seis paquetes emiten siempre su informe JSON desde un solo sitio y el control lo
lee de ahí — que es lo que el paso 7 ya hacía. Se distinguen además tres
situaciones que antes eran una sola: roja nombrada, suite que no llegó a
ejecutarse, y rojo que viene de fuera de las pruebas.

---

## 3 · Árbol de archivos

### Nuevos

| Archivo                                                                  | Propósito                                                                     |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `supabase/migrations/…0032_equipos_y_correcciones_de_consola.sql`        | Datos de conexión, bóveda cifrada de credenciales, borrado con historial, B.5 |
| `supabase/policies/tests/70_equipos_y_borrado_de_vivienda.sql`           | Lo que la 0032 tiene que sostener **por ejecución**                           |
| `apps/api/src/comun/cripto/sobre-aes-gcm.ts`                             | El sobre AES-256-GCM. Un solo cifrado en el proyecto                          |
| `apps/api/src/equipos/aplicacion/puertos.ts`                             | Alta, datos y los cuatro resultados del sondeo, como tipos                    |
| `apps/api/src/equipos/infraestructura/sonda-por-proveedor.ts`            | «Probar conexión» real, sin una sola ruta escrita aquí                        |
| `apps/api/src/equipos/infraestructura/repositorio-equipos-pg.ts`         | Equipo, sobre cifrado y auditoría en una sola transacción                     |
| `apps/api/src/equipos/infraestructura/repositorio-equipos-en-memoria.ts` | Doble; demuestra que el secreto se cifra al entrar                            |
| `apps/api/src/equipos/presentacion/{dtos,equipos.controller}.ts`         | La superficie HTTP. El secreto entra y no vuelve                              |
| `apps/api/src/equipos/{equipos.module,index}.ts`                         | Raíz de composición y barril                                                  |
| `apps/api/src/padron/aplicacion/borrado-definitivo.test.ts`              | B.2: qué impide el borrado, y con qué recuento                                |
| `apps/api/test/equipos.e2e.test.ts`                                      | Secreto de escritura, roles y los cuatro resultados                           |
| `apps/web/src/app/(consola)/dispositivos/alta-de-equipo.tsx`             | El formulario, con el campo específico de cada tipo y el aviso de A.5         |
| `scripts/lib/reporteros-de-prueba.mjs`                                   | El informe JSON de cada suite, siempre y en un solo sitio                     |
| `packages/providers/src/camara/modo-de-control.ts`                       | C.1 · `ctrlMod` como comprobación de arranque                                 |
| `packages/providers/src/equipo/errores-del-fabricante.ts`                | C.10 · el mapa de errores del fabricante hacia REACCIONES                     |

### Modificados (selección)

| Archivo                                                | Cambio                                                            |
| ------------------------------------------------------ | ----------------------------------------------------------------- |
| `packages/domain-core/src/padron/plan-de-viviendas.ts` | B.1 · un solo plan; la cantidad es la pregunta principal          |
| `apps/api/src/multiempresa/configuracion.ts`           | B.4 y B.5 · validación de dirección y dos constantes documentadas |
| `apps/web/src/componentes/configuracion-inicial.tsx`   | B.3 · pide el nombre, relleno con el que hay                      |
| `apps/web/src/app/(consola)/visitantes/pantalla.tsx`   | B.6 · ofrece la foto con el visitante ya elegido                  |
| `scripts/base-de-pruebas.sh`                           | D.1 · el clúster reutilizado se comprueba                         |
| `scripts/lib/estabilidad.mjs`                          | D.2 · la roja se nombra desde el informe JSON                     |
| `scripts/lib/frontera-hardware.mjs`                    | A.7 · los rangos de documentación (RFC 5737) no son de nadie      |

---

## 4 · Tabla SOLID

| Principio | Cómo se materializa aquí                                                                                                                                                                 | Verificación                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **SRP**   | `sobre-aes-gcm.ts` cifra y nada más; `sonda-por-proveedor.ts` sondea; `repositorio-equipos-pg.ts` persiste. El formulario de alta salió a su propio fichero para no engordar la pantalla | Ningún archivo nuevo pasa de 300 líneas                                                          |
| **OCP**   | Un fabricante nuevo es una `SondaDeEquipo` nueva detrás del mismo puerto: el controlador no cambia                                                                                       | `EquiposController` no nombra ningún protocolo                                                   |
| **LSP**   | La sonda real y el doble de la suite son intercambiables: las mismas aserciones pasan con los dos                                                                                        | `test/equipos.e2e.test.ts` usa los dos en el mismo fichero                                       |
| **ISP**   | `SondaDeEquipo` tiene **un** método. `RepositorioDeEquipos` no sabe cifrar: recibe el alta y el veredicto                                                                                | Ningún adaptador lanza `NotImplemented`                                                          |
| **DIP**   | El controlador depende de dos símbolos; quién los cumple lo decide `EquiposModule`                                                                                                       | `frontera-hardware` en verde: ni el protocolo ni una IP de equipo salen de `packages/providers/` |

---

## 5 · Trazabilidad

| Elemento    | Cubierto                                                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| **RN**      | RN-02, RN-03 (C.2, C.5) · RN-12, RN-21 (A.1, A.2) · RN-13, RN-19 (B.2) · RN-09, RN-10 (B.6, C.4) · RN-15          |
| **CA**      | CA-02 (B.2) · CA-08 (B.6, sin relajar) · CA-26 (A.3)                                                              |
| **KPI**     | KPI-11 (A.7, con rangos de documentación) · KPI-03 (D.1) · KPI-04 (B.2)                                           |
| **HU**      | HU-01 (B.1) · HU-36 (A.4)                                                                                         |
| **OE**      | OE-01 (B.1) · OE-03 (C.1: el control antes que el adaptador) · OE-08 (A.2: aislamiento y auditoría)               |
| **Parcial** | CU-01 excepción 3a: el umbral ya tiene respaldo documental (P-02), pero **no se ha medido contra un equipo real** |

---

## 6 · Pruebas

| Suite                                       | Resultado                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| `@ncr/api`                                  | 901 pasan · 5 omitidas                                                 |
| `@ncr/web`                                  | 385 pasan                                                              |
| `@ncr/domain-core`                          | 400 pasan                                                              |
| `@ncr/providers`                            | 193 pasan                                                              |
| `@ncr/edge`                                 | 101 pasan                                                              |
| `@ncr/config`                               | 144 pasan                                                              |
| Suite SQL (`--con-pruebas --modo-supabase`) | verificación completa, incluido `70_equipos_y_borrado_de_vivienda.sql` |

El veredicto literal de `./scripts/verificar-etapa.sh --con-base` está en §10.

---

## 7 · Verificación de seguridad (§2.7)

| Medida                           | Estado en esta rama                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1 · Secretos en entorno          | `EQUIPOS_LLAVE` exigida al arrancar, con su `_REF` que sólo admite `env:` o `vault:`. En `.env.example` sin valor             |
| 2 · CORS                         | Sin cambios                                                                                                                   |
| 3 · Validación en backend        | DTOs nuevos con `whitelist` y `forbidNonWhitelisted`; el umbral retirado produce **400 explícito**, no un descarte silencioso |
| 4 · Anti inyección y saneamiento | Todo parametrizado; `sanearTexto` (NFC + controles + NUL) se aplica **antes de medir** la dirección                           |
| 5 · Rate limiting                | Sin cambios                                                                                                                   |
| 6 · RLS activa y forzada         | `credenciales_de_equipo` con `FORCE`, sin política de `SELECT` para tokens de usuario; probado por ejecución                  |
| 7 · CSP                          | Sin cambios; `frontera-csp` en verde                                                                                          |
| 8 · Transversales                | Auditoría en la misma transacción que la escritura; el secreto no aparece en ninguna respuesta, log ni error                  |

**Hallazgos nuevos:** `H-15B-1` (Alta, mitigado con riesgo residual declarado) y
`H-15B-2` (Alta, cerrado). Detalle en `docs/seguridad/AUDITORIA.md`.

---

## 8 · Deuda técnica, supuestos y pendientes

- **`docs/hikdocs/` no llegó a este entorno.** El destilado de la guía ANPR
  existe en la máquina del usuario y está en `.gitignore`, correctamente: es
  documentación propiedad del fabricante y no se versiona. La consecuencia es
  concreta y hay que declararla: **C.10 pedía citar el capítulo de cada ruta y
  no se pudo citar un número**. El campo `capitulo` del catálogo existe y está
  relleno, pero nombra **el tema** («identidad del equipo», «control de la
  barrera») en vez de «§4.2». Queda como deuda: con la guía delante, sustituir
  el tema por la referencia exacta es un cambio mecánico.
- **`[SUPUESTO]` S-31** · el campo específico de cada tipo de equipo (canal de
  barrera, número de puerta, canal de audio) se pide uno por tipo. Un modelo con
  dos barreras y dos relés a la vez necesitaría más de uno.
- **P-02 RESUELTA, P-06 SUSTITUIDA.** Ver `docs/ESTADO_ETAPAS.md`.
- **Nada de esto se ha ejecutado contra hardware.** El entorno deniega por
  diseño todo destino de rango privado. Los cuatro resultados del sondeo están
  probados con la respuesta exacta que el equipo daría, escrita a partir de la
  documentación; no con el equipo.

---

## 9 · Qué debe hacer el usuario manualmente

1. **Añadir `EQUIPOS_LLAVE` al entorno** de la API, con al menos 32 caracteres
   y **distinta** de `BIOMETRIA_LLAVE`. Sin ella el proceso no arranca — es
   deliberado.
2. **Aplicar la migración 0032** (`supabase db push` o el procedimiento de
   `docs/guias/CONEXION_SUPABASE.md`). Normaliza el umbral de confianza a 0,800
   en todas las copropiedades y fija el valor por restricción.
3. **Dar IP fija a cada equipo** en el router del conjunto antes de registrarlo.
   El proyecto ya pagó el precio de no tenerla: la cámara desapareció de su
   dirección entre dos sesiones.
4. **Crear un usuario de servicio con privilegio mínimo** en cada aparato y
   cambiar la credencial de fábrica. Es lo que se escribe en el alta.
5. **Registrar los equipos** desde `Dispositivos → + Agregar equipo`, probando
   la conexión antes de guardar. Con el servidor fuera de la red del conjunto,
   el sondeo dirá «inalcanzable» y el equipo quedará NO VERIFICADO: es correcto
   y está dicho en la pantalla.
6. **Comprobar `ctrlMod` en cada cámara LPR.** Si el alta responde «el equipo
   abre por su cuenta», hay que cambiarlo en el panel del equipo antes de
   ponerlo en servicio.
7. **Firmar o rechazar** el riesgo residual de `H-15B-1` en
   `docs/seguridad/AUDITORIA.md`.

---

## 10 · Rama y commits

**Rama:** `consola-superadmin-equipos` · **Base:** `develop` (`f64b1d8`)

| Commit    | Qué cierra                                                       |
| --------- | ---------------------------------------------------------------- |
| `5b8aaf9` | Frente C · lo que la documentación ISAPI obliga a corregir       |
| `900f8d2` | Frente D · el clúster reutilizado y la roja que no se nombraba   |
| `00a373a` | Frente A (alta, cifrado, sondeo) y B.1, B.4, B.5, B.2 en la base |
| `3f1673c` | Frente A (pantalla) y B.2, B.3, B.6 en la consola                |
