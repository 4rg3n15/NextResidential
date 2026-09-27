# ADR-031 · El portero entra con un NÚMERO de su pool; desde qué IP, lo decide la API en cada petición; y un MODO PRUEBAS global

|              |                                                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Estado**   | Aceptada · ETAPA 15-L (2026-09-27) · decisiones del cliente H1 a H7                                                                                                                                                |
| **Deroga**   | **ADR-023 en lo que toca al portero y al NIT**: el usuario escogido por quien da de alta y la entrada con NIT + usuario. Siguen vigentes el correo sintético `.invalid`, el primer ingreso y el cambio obligatorio |
| **Afecta a** | migración `0042` · `apps/api/src/plataforma` (nuevo) · `apps/api/src/cuentas` · `apps/api/src/porteria` · `apps/api/src/guardia` · `apps/web` (acceso, porteros, configuración, franja) · `servidor.mjs`           |
| **Registra** | C-39 (numeración progresiva frente a pools) · C-40 (portería y guardia como dos superficies frente a porteros de guardia remota) · S-73 a S-77                                                                     |

---

## Contexto

Para la entrega en sitio el cliente cambió cómo se identifica y desde dónde
entra un portero:

- **H1 · H2.** Cada copropiedad tiene un **pool** de números —la 1 del 1001 al
  1999, la 10 del 10001 al 10999; 0001–0999 reservado—. El superadministrador da
  de alta al portero con nombre, documento y contraseña temporal, y el sistema
  le asigna el siguiente número libre: sin carreras, único en la plataforma,
  **nunca reutilizado**, con un cupo configurable (máximo 999).
- **H3.** El portero entra **sólo con su número y su contraseña**. El NIT
  desaparece de la interfaz.
- **H4.** El superadministrador configura por copropiedad la IP del computador
  de portería y las IP permitidas para la **guardia remota**. Fuera de ellas:
  403 con el texto exacto «No autorizado para guardia remota», anotado en
  `auditoria_seguridad`, al entrar **y en cada petición**. Con la lista remota
  vacía, sólo desde la IP de una sesión activa de un superadministrador (así se
  prueba desde el mismo Mac). Al superadministrador no se le restringe nada.
- **H5.** Un **modo pruebas** global, del superadministrador, ACTIVO por
  omisión: las restricciones de porteros se evalúan y se anotan «habría sido
  rechazado» sin bloquear; el límite de peticiones sube (no se apaga); una
  franja fija lo dice en toda la consola; cada cambio queda auditado y surte
  efecto sin reiniciar. Apagado, el bloqueo por intentos es temporal y por
  (IP, identificador), nunca por el identificador a secas.
- **H6.** La IP es la del cliente de verdad: la API cree `X-Forwarded-For`
  **sólo** del proxy propio.

## Decisión

### 1 · El número y su pool viven en la base

- `pools_de_porteros (copropiedad_id, numero, inicio, fin, siguiente, cupo)` con
  una restricción de **exclusión** (`int4range … WITH &&`): dos pools no pueden
  solaparse. Un disparador da su pool a cada copropiedad nueva; las existentes
  lo reciben en orden de creación.
- La copropiedad de un número se resuelve **siempre por esa tabla**
  (`int4range(inicio, fin) @> numero`), nunca con aritmética en el código.
- `usuarios.numero_de_portero`: índice único en toda la plataforma, inmutable
  por disparador y del pool de su copropiedad. La fila del usuario no se borra
  (RN-19), así que un número dado de baja sigue ocupado para siempre: lo que se
  atribuyó a esa persona sigue señalándola.
- `app.asignar_numero_de_portero` toma el pool con `FOR UPDATE` **en la misma
  transacción que crea la cuenta** y comprueba el cupo bajo ese mismo bloqueo
  (ADR-04): veinte altas simultáneas reciben veinte números consecutivos.
- La **baja** del portero (nueva, `POST …/porteros/:id/baja`, con motivo) deja
  cuenta y rol inactivos, cierra sus sesiones con motivo `baja` y libera una
  plaza del cupo; el número no vuelve al pool.

### 2 · El portero entra con el número y nada más

- `POST /auth/acceso` con `{ usuario: "<número>", contrasena }`, sin `codigo` ni
  `nit`. La API resuelve el número a su cuenta y entra en el proveedor con el
  correo sintético —o con el correo REAL si el portero es anterior a la 15-H
  (S-77)—.
- Un portero sólo entra por número, y un número sólo sirve a un portero: si el
  rol y el camino no casan, la respuesta es la misma que unas credenciales
  equivocadas. El NIT deja de ser un campo de la API (`forbidNonWhitelisted`) y
  de la consola.
- El usuario interno del portero lo genera el servidor (`p` + 12 hexadecimales):
  nadie lo escoge ni lo ve.

### 3 · La regla de IP, en la API y en cada petición

Un módulo nuevo, `plataforma`, con una guarda global (`GuardaDeOrigen`) detrás
de la de turno:

- **Portero:** la IP (`req.ip`) tiene que estar en la lista remota —o, vacía, ser
  la de una sesión de superadministrador activa en los últimos 30 minutos
  (S-73)— o en la de portería. Las rutas marcadas `@SoloGuardiaRemota()` —cola,
  intercom, aviso al residente, emergencia— **no** admiten la de portería. La
  misma regla se evalúa al iniciar sesión.
- **Superadministrador:** se anota desde qué IP trabaja (para la regla anterior);
  no se le restringe nada.
- **Resto de roles:** ni lo ven.
- Las reglas se releen cada 5 s y el modo pruebas cada 3 s (S-76): quitar una IP
  corta las sesiones abiertas desde ella sin reiniciar.

### 4 · La IP del cliente es la del socket, salvo proxy propio

- La API: `trust proxy` = `API_PROXIES_DE_CONFIANZA` (por omisión `loopback`,
  que es la consola en el mismo equipo). Un `X-Forwarded-For` de cualquier otro
  origen no se cree.
- La consola: `servidor.mjs` arranca Next y **sustituye** `X-Forwarded-For` por
  la dirección del socket antes de que Next la vea (`next start` conservaba la
  que mandara el navegador). La consola la reenvía a la API en el proxy
  `/api/ncr` y en todo lo que pide en nombre de la persona (sesión, cambio de
  contraseña, páginas pintadas en el servidor).
- La app móvil habla directamente con la API: su IP es la del socket.

### 5 · El modo pruebas

`ajustes_globales` (una fila) con `modo_pruebas`, ACTIVO por omisión en la 0042,
leído y cambiado sólo por el superadministrador (`GET`/`PUT /plataforma/modo-pruebas`;
la lectura es de todo el que tiene sesión, para la franja). Cada cambio escribe
`cambio_configuracion` en `auditoria_seguridad`. Con el modo activo: las
restricciones de IP entran y se anotan «… · habría sido rechazado (modo
pruebas)» (una vez cada 5 minutos por portero, IP y tipo de ruta), no hay
bloqueo por intentos, y los límites de acceso y el general se multiplican por
`MODO_PRUEBAS_FACTOR_DE_LIMITE` (S-75). Apagado, 5 fallos del mismo número desde
la misma IP bloquean 5 minutos (S-74), con 429 y `Retry-After`.

## Alternativas consideradas

| Alternativa                                                     | Por qué no                                                                                                                                                 |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Numeración progresiva global (1, 2, 3…)                         | El número no diría de qué copropiedad es, y H1 pide pools. Registrado como C-39                                                                            |
| Resolver la copropiedad con `floor(numero / 1000)`              | Prohibido expresamente (H1): un pool que se reasigne o un tamaño distinto rompería en silencio la identidad. La tabla es la única verdad                   |
| `SELECT max(numero) + 1` en el código                           | Dos altas simultáneas se llevan el mismo número; ADR-04 dice que eso lo resuelve la base, bajo bloqueo                                                     |
| Regla de IP sólo al iniciar sesión                              | Quitar una IP no cortaría a quien ya entró; H4 exige cada petición                                                                                         |
| Bloqueo por identificador a secas                               | Cualquiera bloquearía a un portero tecleando su número desde otro equipo; H5 lo prohíbe                                                                    |
| Confiar en `X-Forwarded-For` siempre                            | Un portero se declararía desde la IP permitida con una cabecera. Es exactamente lo que la lista blanca impide                                              |
| Apagar el modo pruebas en la base desde las pruebas en paralelo | El interruptor es global: apagarlo en una suite haría fallar a las que corren a la vez. H7 lo sustituye en memoria y prueba el adaptador de la base aparte |

## Consecuencias

- **Asumidas:** el `trust proxy` hay que configurarlo si la consola y la API
  están en equipos distintos (`API_PROXIES_DE_CONFIANZA` con la IP de la
  consola). El modo pruebas ACTIVO por omisión es deliberado para la entrega:
  la guía de entrega dice cuándo apagarlo.
- **La guardia virtual la ve el portero** (C-40): la interfaz la muestra y la
  API decide por IP.
- **Riesgo residual:** con la lista remota vacía, cualquier portero de
  cualquier copropiedad puede entrar desde la IP de un superadministrador
  activo. Es la regla de transición que pidió el cliente para probar desde el
  mismo Mac; deja de aplicar en cuanto la lista tiene una entrada.

## Verificación

- `apps/api/test/porteros-por-identificador-pg.test.ts` · los doce casos de H7
  contra PostgreSQL, más la baja y el adaptador del modo pruebas.
- `supabase/policies/tests/99_porteros_por_identificador.sql` · pools sin
  solape, número progresivo con cupo, único e inmutable; IP y modo pruebas sólo
  del superadministrador.
- `apps/api/test/cuentas-y-porteria.e2e.test.ts` · alta con documento y número,
  bloqueo por (IP, número) con `Retry-After`, portero por correo que entra con
  su número.
- `apps/api/test/limite-de-peticiones.e2e.test.ts` · con el modo pruebas el
  límite sube, no se apaga.
- `apps/web/src/lib/ip-del-cliente.test.ts` · la consola descarta la cabecera
  que manda el navegador.
- `e2e/recorrido-de-consola.mjs` · el portero sembrado entra por su número en
  Chromium, contra la consola arrancada con `servidor.mjs`.

## Contingencia

Si en sitio la lista blanca impide trabajar, el superadministrador **activa el
modo pruebas** desde Configuración: nada se bloquea y todo queda anotado. Si la
IP que ve la API no es la esperada, `auditoria_seguridad` guarda la que vio en
cada rechazo: con ella se corrige la lista o `API_PROXIES_DE_CONFIANZA`, sin
tocar código.
