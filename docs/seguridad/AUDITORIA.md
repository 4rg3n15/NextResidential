# Auditoría de ciberseguridad · ETAPA 13

**Proyecto:** Next Control Residencial · **Rama:** `etapa-13-auditoria-seguridad`
**Base:** `develop` (`153df52`) · **Fecha:** 2026-09-22
**Alcance:** `CLAUDE.md` §6 ETAPA 13, íntegro y sin ampliar.

---

## 0 · Cómo leer este documento, y qué NO dice

La ETAPA 13 **verifica y endurece**. No introduce la seguridad por primera vez:
§2.7 la exigía desde la ETAPA 01. De ahí la regla que gobierna todo lo que
sigue y que conviene tener presente al leer cualquier fila:

> **Una medida que nunca se construyó es un HALLAZGO con severidad, no un
> añadido silencioso.** Nada se arregla sin quedar registrado primero.

Por eso hay hallazgos ALTOS sobre código que se escribió _durante esta misma
etapa_ (H-13-09): registrarlo y remediarlo es el procedimiento; ocultarlo
porque «ya está arreglado» sería exactamente lo contrario de auditar.

**Tres palabras con significado fijo en este documento:**

| Palabra            | Qué garantiza                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **VERIFICADO**     | Se ejecutó, aquí está la salida. Es el único término que acredita algo.                          |
| **LEÍDO**          | Se comprobó leyendo el ACL, el catálogo o el código, sin ejercerlo. Vale menos, y se dice.       |
| **NO VERIFICABLE** | No se puede demostrar desde este entorno. Se dice con esas palabras y se nombra qué haría falta. |

No se usa «probable», «debería» ni «parece». Esa confusión ya costó tener
DB-02 abierta durante semanas: _«probable» no es «verificado»_.

> **Sobre los valores de las evidencias.** Donde una sonda usó una llave
> sintética, aquí aparece como `sb_secret_<sintética>`. No es pudor: el escáner
> de secretos de este mismo repositorio marca el documento si se escriben
> enteras —son indistinguibles de una llave real, que es exactamente la
> propiedad que se le pide— y el gancho de pre-commit rechaza el commit. Lo
> comprobó al primer intento.

---

## 1 · Resumen ejecutivo

**26 hallazgos.** Ninguno crítico. Tres ALTOS, **los tres cerrados**.

| Severidad       | Total | Cerrados | Abiertos | Abiertos: cuáles                              |
| --------------- | ----: | -------: | -------: | --------------------------------------------- |
| **Crítica**     |     0 |        0 |    **0** | —                                             |
| **Alta**        |     3 |        3 |    **0** | —                                             |
| **Media**       |    15 |       15 |    **0** | —                                             |
| **Baja**        |     6 |        5 |    **1** | H-13-25 (riesgo aceptado, pendiente de firma) |
| **Informativa** |     2 |        2 |    **0** | —                                             |
| **Total**       |    26 |       25 |    **1** |                                               |

**DoD de la etapa:** cero hallazgos críticos o altos ABIERTOS → **cumplido**.
El único abierto es de severidad BAJA y es una **aceptación de riesgo redactada
para su firma** (§7), no una remediación pendiente.

**Los tres ALTOS, en una línea cada uno:**

- **H-13-05** · la lista blanca de DTOs rechazaba `colado` y **aceptaba**
  `__proto__`, `constructor`, `toString`, `valueOf` y `hasOwnProperty`.
- **H-13-09** · el saneamiento de entrada **mutilaba en silencio** toda carga
  base64 —XLSX del padrón, CSV, vector biométrico— con la firma `PK\x03\x04`
  intacta, de modo que la validación de tipo real la daba por buena.
- **H-13-26** · el árbol de dependencias tenía **4 vulnerabilidades críticas y
  23 altas en producción**.

**Lo que esta auditoría encontró y no esperaba encontrar:** que
`src/seguridad.ts` —CORS, CSP, HSTS y el `ValidationPipe` real— tenía **0 % de
cobertura con 656 pruebas en verde** (H-13-11). Durante doce etapas, toda
afirmación de los informes sobre §2.7.2, §2.7.3 y §2.7.7 se apoyó en una
tubería que el despliegue no usa.

---

## 2 · Tabla de hallazgos

Cada fila remite a §3, donde está la evidencia reproducible completa.

| Id          | Severidad   | Dimensión            | Hallazgo                                                                                  | Estado                         |
| ----------- | ----------- | -------------------- | ----------------------------------------------------------------------------------------- | ------------------------------ |
| **H-13-01** | Media       | Controles            | Un informe de cobertura VACÍO se leía como «global 100 %» y salía con 0                   | **CERRADO**                    |
| **H-13-02** | Media       | Criptografía (D-41)  | La llave de la bóveda biométrica era `sha256(secreto)`, igual para todo tenant            | **CERRADO**                    |
| **H-13-03** | Media       | Base de datos (D-08) | La aserción de ADR-005 no verificaba la capa que de verdad detiene al dueño               | **CERRADO**                    |
| **H-13-04** | Media       | RLS                  | La matriz de RLS recorría 26 tablas escritas a mano; el catálogo tiene 42                 | **CERRADO**                    |
| **H-13-05** | **Alta**    | Validación           | `forbidNonWhitelisted` no ve las claves heredadas de `Object.prototype`                   | **CERRADO**                    |
| **H-13-06** | Media       | Saneamiento          | §2.7.4 nunca se construyó: bytes NUL y controles llegaban a la traza inmutable            | **CERRADO**                    |
| **H-13-07** | Media       | Validación           | Sin cota de profundidad: un cuerpo a 1 500 niveles desbordaba la pila (500)               | **CERRADO**                    |
| **H-13-08** | Baja        | Herramientas         | Las dos superficies de lint miraban árboles distintos: verde en una, rojo en otra         | **CERRADO**                    |
| **H-13-09** | **Alta**    | Saneamiento          | El propio saneamiento mutilaba en silencio toda carga base64                              | **CERRADO**                    |
| **H-13-10** | Media       | Autenticación        | La firma HMAC de ingesta se verificaba sobre la CADENA VACÍA (repliegue abierto)          | **CERRADO**                    |
| **H-13-11** | Media       | Falso verde          | `src/seguridad.ts` al **0 %** de cobertura con 656 pruebas en verde                       | **CERRADO**                    |
| **H-13-12** | Media       | Errores              | El 413 del límite de payload salía como 500 «Error interno», a nivel `error`              | **CERRADO**                    |
| **H-13-13** | Media       | Validación           | Un parámetro de consulta repetido o con sintaxis de objeto producía 500                   | **CERRADO**                    |
| **H-13-14** | Baja        | Saneamiento          | Los controles bidireccionales de Unicode llegaban a la traza inmutable                    | **CERRADO**                    |
| **H-13-15** | Media       | Inyección            | Inyección de fórmulas CSV en la exportación del padrón                                    | **CERRADO**                    |
| **H-13-16** | Media       | Integridad           | Sin NFC, dos formas Unicode del mismo identificador esquivan el índice único              | **CERRADO**                    |
| **H-13-17** | Media       | Secretos             | El escaneo NUNCA miraba el historial de Git: cumplía la mitad del alcance                 | **CERRADO**                    |
| **H-13-18** | Media       | Secretos             | Un solo byte NUL hacía invisible al escáner un fichero fuente completo                    | **CERRADO**                    |
| **H-13-19** | Media       | Secretos             | Sin patrón para los tres secretos propios del proyecto ni para tokens de nube             | **CERRADO**                    |
| **H-13-20** | Baja        | Secretos             | El escáner leía el ÁRBOL y no el ÍNDICE: un secreto ya preparado pasaba                   | **CERRADO**                    |
| **H-13-21** | Baja        | CORS                 | Aceptaba `ftp://x`, `no-es-una-url` y `http://` con credenciales en producción            | **CERRADO**                    |
| **H-13-22** | Informativa | CORS                 | `DELETE` anunciado sin ruta que lo use; `x-request-id` no legible por la consola          | **CERRADO**                    |
| **H-13-23** | Baja        | Higiene              | Ficheros que `.gitignore` prohíbe y que estaban versionados                               | **CERRADO**                    |
| **H-13-24** | Informativa | Fugas por error      | El cuerpo del 429 nombraba `ThrottlerException`                                           | **CERRADO**                    |
| **H-13-25** | Baja        | Secretos (historial) | Una contraseña literal inerte sobrevive en el historial y es alcanzable                   | **ABIERTO · riesgo aceptado**  |
| **H-13-26** | **Alta**    | Dependencias         | 4 vulnerabilidades críticas y 23 altas en **producción**                                  | **CERRADO**                    |
| **H-15B-1** | **Alta**    | Criptografía         | Guardar credenciales de equipo en la base: quien vuelque la base abre los equipos         | **MITIGADO · riesgo residual** |
| **H-15B-2** | **Alta**    | Datos personales     | El evento ANPR empuja `pilotPicture` y `copilotPicture`: biometría por la puerta de atrás | **CERRADO**                    |

---

## 3 · Hallazgos en detalle

Formato de cada uno: **qué es · evidencia reproducible · remediación ·
verificación posterior**. La evidencia es siempre salida de una ejecución real,
copiada literal.

---

### H-13-01 · Media · Un informe de cobertura VACÍO se leía como «global 100 %»

**Qué es.** `scripts/lib/cobertura-flutter.mjs` calculaba el porcentaje global
dividiendo líneas cubiertas entre líneas totales. Con un `lcov.info` vacío o sin
registros `SF:`/`DA:`, el divisor es cero y el control informaba **«global
100 %» saliendo con código 0**. Una suite de Dart que no llegara a correr —por
un fallo de entorno, por un `--coverage` mal pasado— daba verde.

Apareció al escribir su prueba negativa, que es precisamente lo que esa suite
existe para provocar.

**Evidencia.** Sonda 26 de `scripts/lib/pruebas-negativas.mjs`, con un lcov
vacío: antes informaba `global 100 %` y salía 0.

**Remediación.** Guarda explícita antes de dividir:

```js
if (globalTotal === 0) {
  console.error('FALLO el informe de cobertura no contiene ni una línea medible.');
  console.error('  Una cobertura de cero líneas no es el 100 %: es una suite que no corrió.');
  process.exit(1);
}
```

**Verificación posterior.** `node scripts/lib/pruebas-negativas.mjs` →
`✓ y un lcov VACÍO no se lee como «todo cubierto»`.

---

### H-13-02 · Media · La llave de la bóveda biométrica era `sha256(secreto)` · cierra D-41

**Qué es.** `BovedaCifrada` derivaba la llave AES-256-GCM con
`createHash('sha256').update(secreto)`: **una sola llave para todas las
copropiedades**, sin sal y sin función de derivación. Dos consecuencias: el
compromiso de la llave maestra abre las plantillas de todos los conjuntos a la
vez, y la derivación no separa criptográficamente a un tenant de otro, que es
lo que RN-15 exige del resto del sistema.

Es D-41, declarado en su día como deuda y traído aquí como hallazgo.

**Remediación.** HKDF (RFC 5869) con la copropiedad como sal:

```ts
private llaveDe(copropiedadId: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', this.maestra, copropiedadId, 'ncr:plantillas-biometricas:v1', 32),
  );
}
```

HKDF y no PBKDF2/scrypt/argon2 **a propósito**: las funciones con factor de
trabajo existen para material de BAJA entropía —contraseñas de persona—. Aquí
la entrada es una llave ya fuerte de 32 bytes o más, validada al arranque, y
para ese caso ASVS V6 pide una KDF de extracción-expansión, no un coste
artificial que se pagaría en cada descifrado.

**Verificación posterior.** Tres pruebas en
`apps/api/src/biometria/aplicacion/casos-de-uso.test.ts`: descifrar con la
copropiedad ajena falla; con la propia llega a la terminal; el mismo vector
produce cuerpos cifrados distintos en dos copropiedades.

---

### H-13-03 · Media · La aserción de ADR-005 no verificaba la capa que de verdad detiene al dueño · cierra D-08

**Qué es.** ADR-005 sostiene la inmutabilidad de `eventos` sobre cuatro capas:
`REVOKE` al dueño, disparador `BEFORE UPDATE/DELETE`, RLS en modo `FORCE` sin
política de escritura, y una aserción de despliegue. La aserción de la
migración `0017` comprobaba **dos** de las tres capas efectivas: las concesiones
y los disparadores habilitados. **No comprobaba la RLS forzada.**

**Evidencia — la cadena completa, ejecutada contra el clúster de pruebas con el
dueño real `sb_postgres_sim` (NO superusuario, que es el caso de Supabase):**

```
1. ALTER TABLE public.eventos_2026_09 DISABLE TRIGGER ALL
   → ERROR: permission denied: "RI_ConstraintTrigger_c_178920" is a system trigger

2. GRANT UPDATE ON public.eventos TO sb_postgres_sim;  UPDATE public.eventos …
   → GRANT
   → UPDATE 0                    ← la RLS en modo FORCE, sin política de UPDATE

3. ALTER TABLE public.eventos NO FORCE ROW LEVEL SECURITY;  (+ la partición)
   UPDATE public.eventos …
   → ERROR: Modificacion prohibida en public.eventos_2026_09: la tabla es
            append-only. RN-03, CA-23, ADR-005          ← el DISPARADOR

4. ALTER TABLE public.eventos_2026_09 DISABLE TRIGGER tg_prohibir_update;
   UPDATE public.eventos …
   → ALTER TABLE
   → UPDATE 6
```

**Lo que esto corrige del enunciado de D-08.** El riesgo residual **no** es «el
dueño conserva `DISABLE TRIGGER`». Son **cuatro** actos deliberados de DDL, y el
primero ni siquiera funciona en su forma general: `DISABLE TRIGGER ALL` es
rechazado porque la clave ajena de la partición protege de paso al disparador de
inmutabilidad. Hay que nombrarlo exactamente.

**Remediación.** Migración `0031`, que asevera lo que faltaba: RLS **activa y
forzada** en cada tabla append-only y en cada partición de `eventos`, y que no
exista política de `UPDATE`, `DELETE` o `ALL` sobre ellas.

**Verificación posterior · por ejecución, en los dos sentidos.**

```
$ psql -f supabase/migrations/…_0031_asercion_rls_forzada_append_only.sql
NOTICE: H-13-03 verificado: RLS ACTIVA y FORZADA en las append-only, sin política de escritura

# y con NO FORCE puesto a mano:
ERROR: ADR-005 incumplido (H-13-03): 2 tabla(s) append-only sin RLS forzada
       (eventos:RLS SIN FORCE, eventos_2026_09:RLS SIN FORCE).
```

Y el acto 4 lo detecta la aserción (b) de la `0017`, que **sí** recorre las
particiones:

```
ERROR: ADR-005 incumplido: 1 triggers append-only ausentes o desactivados
       (eventos_2026_09:tg_prohibir_update)
```

> **Nota de método, porque costó un diagnóstico falso.** Ejecutar el FICHERO de
> la `0017` para comprobar si detecta el acto 4 devuelve «verificado» aunque el
> disparador esté desactivado: la migración lo **recrea** antes de aseverar. Hay
> que ejecutar el bloque de aserción SOLO. Se anota porque es justo la forma en
> que un control parece funcionar sin funcionar.

---

### H-13-04 · Media · La matriz de RLS recorría 26 tablas escritas a mano

**Qué es.** `00_aislamiento_multiempresa.sql` prueba el aislamiento sobre un
`ARRAY[...]` de veintiséis nombres de tabla. El esquema tiene **42** tablas con
`copropiedad_id`. Una tabla nueva no entra sola en esa lista, y una lista a mano
que nadie actualiza es la familia de defecto que este repositorio lleva trece
etapas persiguiendo.

**Remediación.** `supabase/policies/tests/60_matriz_rls_completa.sql`, que
**deriva** el conjunto del catálogo (`pg_class` + `pg_attribute`) en vez de
enumerarlo, y comprueba las cuatro cosas que el alcance pide: prueba negativa
(no se ve ni una fila ajena), prueba positiva (las propias SÍ se ven),
cobertura (toda tabla derivada tiene política de lectura) y escritura cruzada
(RECHAZADA, no filtrada en silencio).

**Verificación posterior.**

```
NOTICE: matriz RLS · negativa: 42 tabla(s) derivadas del catálogo, cero filas ajenas
NOTICE: matriz RLS · positiva: 25 tabla(s) con filas propias visibles; 17 sin semillas (…)
NOTICE: matriz RLS · cobertura: toda tabla derivada tiene política de lectura
NOTICE: matriz RLS · particiones: alcanzables por el padre (6 propias) y sin fuga (0 ajenas)
NOTICE: matriz RLS · escritura cruzada: RECHAZADA, no filtrada en silencio
```

Las 17 «sin semillas» no son un hueco de la política sino de los datos de
prueba: la negativa sí las cubre a las 42. Se nombran una a una para que la
diferencia esté a la vista y no se lea como cobertura.

> **Un falso positivo propio, corregido.** La primera versión marcaba las 12
> particiones de `eventos` como «inalcanzables». No lo son: se consultan **por
> el padre**, y una política sobre el padre las alcanza. Se excluye
> `relispartition` de esa comprobación y se añade la 3b, que demuestra por
> ejecución que el padre llega a ellas.

---

### H-13-05 · **ALTA** · `forbidNonWhitelisted` no ve las claves heredadas de `Object.prototype`

**Qué es.** §2.7.3 exige `ValidationPipe` con `whitelist` y
`forbidNonWhitelisted`, y los informes de etapa se apoyan en que «ningún campo
pasa inadvertido». No era cierto: `class-validator` consulta las claves con el
operador `in`, que las encuentra **heredadas** y por tanto no las declara
sobrantes.

**Evidencia.** Barrido sobre `POST /copropiedades/:id/guardia/ordenes`:

```
[A.1] clave colado           -> 400 RECHAZADA
[A.1] clave __proto__        -> 201 ACEPTADA (whitelist no la ve)
[A.1] clave constructor      -> 201 ACEPTADA (whitelist no la ve)
[A.1] clave toString         -> 201 ACEPTADA (whitelist no la ve)
[A.1] clave valueOf          -> 201 ACEPTADA (whitelist no la ve)
[A.1] clave hasOwnProperty   -> 201 ACEPTADA (whitelist no la ve)
[A.1] clave prototype        -> 400 RECHAZADA
```

**No hubo contaminación de prototipo** —se comprobó en el mismo proceso con tres
cargas distintas, incluida `{"constructor":{"prototype":{…}}}`:
`Object.prototype.pol1/pol2/pol3 = undefined undefined undefined`— porque
Express protege ahí. **La severidad ALTA no es por el impacto medido sino por lo
que la afirmación sostenía:** una lista blanca con cinco puntos ciegos no es una
lista blanca, y de ella cuelga la defensa en profundidad de §2.7.3.

**Remediación.** `apps/api/src/comun/saneamiento.ts`: lista de claves prohibidas
rechazada con 400 antes del pipe, y objetos reconstruidos con
`Object.create(null)` en cada nivel — aunque una clave se colara, no habría
prototipo que contaminar.

**Verificación posterior.** `apps/api/test/saneamiento-entrada.e2e.test.ts`, que
replica el arranque real de `main.ts`: las seis claves → 400, y
`Object.prototype.polucionNCR` sigue `undefined`.

---

### H-13-06 · Media · §2.7.4 nunca se construyó

**Qué es.** El contrato lo dice sin ambigüedad desde la ETAPA 01: «toda entrada
de texto se **sanea y normaliza antes de persistirse**: recorte, normalización
Unicode NFC, remoción de caracteres de control y bytes nulos». **No existía.** El
`ValidationPipe` valida FORMA —tipo, presencia, patrón— y no toca el contenido.

**Evidencia.**

```
POST …/guardia/ordenes {"motivo":"Apertura\u0000autorizada\u0007por\u001bportería"}
  [4.1] -> 201
  [4.1] GET ordenes -> 200
        ¿persiste \u0000? true   ¿\u0007? true   ¿\u001b? true
```

Y contra PostgreSQL de verdad:

```
INSERT INTO t VALUES (E'Apertura\000autorizada');
ERROR:  invalid byte sequence for encoding "UTF8": 0x00
```

Es decir: en un despliegue con los repositorios PostgreSQL cableados el valor no
se rechaza en el borde, **revienta en el adaptador** (500); en los módulos hoy
cableados en memoria se guarda tal cual. Y un `\u001b` es el comienzo de una
secuencia ANSI: un motivo de apertura puede pintar texto falso en el terminal de
quien lee la bitácora, que es prueba de auditoría (RN-03).

**Remediación.** `SaneamientoMiddleware`, con una lección de orden que quedó
escrita en el código porque no da error de tipos ni de compilación:

> La primera versión se registró dentro de `aplicarSeguridad`, que corre **antes**
> de `express.json()`. Allí `req.body` todavía no existe y el saneador no saneaba
> nada. Se expone aparte como `aplicarSaneamiento(app)` y `main.ts` lo llama
> DESPUÉS de los parsers. Medido: con el middleware antes, `[R.1] ¿NUL sobrevive?
true`; después, `[R.2] false`.

**Verificación posterior.** 13 pruebas unitarias + e2e que comprueba el NUL
**al escribir y al releer**.

---

### H-13-07 · Media · Recursión sin cota en la validación

**Qué es.** §2.4 lo prohíbe con esas palabras: «Jamás recursión sobre entrada no
acotada del usuario». Un cuerpo anidado desbordaba la pila.

**Evidencia.**

```
[B.2] profundidad   900 -> 400
[B.2] profundidad  1200 -> 400
[B.2] profundidad  1500 -> 500   {"nivel":"error",…,"error":"Maximum call stack size exceeded"}
[B.2] profundidad  3000 -> 500
```

Aislado por ejecución: contra una ruta **sin DTO de cuerpo**, profundidad 20 000
→ 201. La rotura no está en `JSON.parse` sino en el recorrido del validador.
Coste medido: 60 peticiones de profundidad 20 000 en 827 ms, y `/health`
respondió 200 tras la ráfaga — el proceso no cae, pero cada petición cuesta una
traza de error completa.

**Remediación.** `PROFUNDIDAD_MAXIMA = 32` en el saneador, antes del pipe. El
DTO más anidado del árbol tiene **tres** niveles
(`LoteDeReconciliacionDto → EventoReconciliadoDto → DecisionDelEdgeDto`), así
que 32 es holgado y la cota no recorta nada legítimo.

**Verificación posterior.** Profundidad 3 000 → 4xx, en la e2e.

---

### H-13-08 · Baja · Las dos superficies de lint miraban árboles distintos

**Qué es.** `pnpm lint` ejecuta `eslint src` y nunca alcanza la raíz del
paquete; `lint-staged` le pasa a eslint el fichero indexado tal cual. Verde en
una, rojo en la otra, sobre el mismo árbol. Se manifestó con
`apps/web/next-env.d.ts`, que Next 15.5 regenera con una `triple-slash
reference` que la regla `@typescript-eslint/triple-slash-reference` rechaza.

**Remediación.** La exclusión vive en `eslint.config.mjs` —la configuración que
**ambas** comparten— y no en un `--ignore-pattern` del gancho, para que no
puedan volver a discrepar.

**Verificación posterior.** `npx eslint --no-warn-ignored apps/web/next-env.d.ts`
→ EXIT 0, y `pnpm lint` → 7 de 7 tareas correctas. (El fichero además dejó de
versionarse: ver H-13-23.)

---

### H-13-09 · **ALTA** · El saneamiento mutilaba en silencio toda carga base64

**Qué es.** El hallazgo más grave de la etapa, y es sobre código escrito **en
esta misma etapa**. `sanearTexto` aplicaba un techo global de 4 096 caracteres
con `.slice()`. Parecía prudente.

**Evidencia** (ejecutada de nuevo al cerrar, sobre un ZIP sintético):

```
base64 entrada: 10672 -> salida: 4096
bytes antes: 8004 -> despues: 3072 | firma PK conservada: 504b0304
```

Las tres rutas de carga del sistema declaran límites muy superiores:

```
apps/api/src/padron/presentacion/dtos.ts:183   xlsxBase64  @Length(1, 340_000)
apps/api/src/padron/presentacion/dtos.ts:205   csv         @Length(1, 1_000_000)
apps/api/src/biometria/presentacion/dtos.ts:73 vector      @MaxLength(16384)
```

Y el resultado es peor que un rechazo: **la firma `PK\x03\x04` sobrevive al
recorte**, así que la validación de tipo real (`xlsx.ts:16`) da el archivo por
bueno y el ZIP mutilado sigue camino; el DTO no protesta porque 4 096 cabe en
`[1, 340000]`. **No hay 400, no hay aviso, no hay traza:** 2xx sobre un archivo
roto.

**Remediación.** Es la lección de `Placa`, aplicada donde faltaba: **lo que
queda fuera debe FALLAR, no desaparecer.** Un recorte silencioso convierte un
dato inválido en un dato válido y equivocado, que es estrictamente peor.

1. Retirado el techo del saneador. La «longitud máxima **por campo**» que exige
   §2.7.4 vive donde puede ser específica: el `@MaxLength`/`@Length` de cada DTO.
2. Control nuevo `scripts/lib/longitud-por-campo.mjs`, cableado al verificador,
   que rompe el build si un `@IsString()` nace sin cota.
3. El techo del conjunto sigue siendo `LIMITE_PAYLOAD` (§2.7.8), que se
   comprueba aparte (H-13-12).

**Verificación posterior.**

```
$ node scripts/lib/longitud-por-campo.mjs
longitud por campo: 44 campo(s) @IsString(), todos con cota declarada
```

Y la regresión de punta a punta: un CSV de 200 filas y más de 8 kB por la
tubería real → la API informa `filasLeidas: 200`. Con el techo se habrían leído
unas 55, sin un solo error.

> El control nuevo nació con el defecto de la familia: contaba como campo el
> `@IsString()` que aparece **dentro de un comentario** —el del fichero que
> explica por qué existe el control—. Lo destapó su propia prueba negativa.

---

### H-13-10 · Media · La firma HMAC de ingesta se verificaba sobre la cadena vacía

**Qué es.** `guardia-firma.ts` hacía `cuerpoCrudo: peticion.cuerpoCrudo ?? ''`.
`guardarCuerpoCrudo` sólo se engancha en `express.json({ verify })`, así que con
**cualquier otro content-type** `cuerpoCrudo` queda `undefined` y la firma se
verificaba sobre la cadena vacía. Es un repliegue **abierto**.

**Evidencia.**

```
POST /ingesta/latidos
Content-Type: application/x-www-form-urlencoded
x-ncr-firma: firmar(SECRETO, marca, '')        ← firma sobre la CADENA VACÍA
cuerpo: copropiedadId=<COP_A>&dispositivoId=disp-1
  -> 202 {"recibido":true}
```

Línea base que descarta el falso positivo: firmando el cuerpo JSON crudo → 202;
firmando el cuerpo urlencoded real → 401. El guard **acepta** cuando la firma
cubre `''` y **rechaza** cuando cubre el cuerpo de verdad.

**Por qué importa antes de la ETAPA 15 y no después.** El Alarm Server de
Hikvision publica `multipart/form-data` —XML del evento, foto completa y recorte
de placa—. Con ese parser montado, `express.json` no ejecutaría su `verify`,
`cuerpoCrudo` sería `undefined` en **todos** los POST de cámara, y una sola firma
capturada valdría para cualquier cuerpo dentro de la ventana de 300 s. Eso es
forja de eventos sobre una tabla que RN-03 declara inalterable.

**Remediación.** Fallar cerrado: `cuerpoCrudo === undefined` → 401.

**Verificación posterior.** Dos regresiones en `ingesta.e2e.test.ts`: firma
sobre `''` → 401, y firma sobre el cuerpo urlencoded real → 401 también.

---

### H-13-11 · Media · `src/seguridad.ts` al 0 % de cobertura con 656 pruebas en verde

**Qué es.** El fixture `apps/api/test/utilidades.ts:crearApp` **reconstruía a
mano** `express.json` + `ValidationPipe` + `FiltroGlobalDeExcepciones`, y **no
llamaba nunca a `aplicarSeguridad`**.

**Evidencia.**

```
$ vitest run --coverage --coverage.include='src/seguridad.ts'
 Test Files  55 passed | 1 skipped (56)
      Tests  656 passed | 5 skipped (661)

File          | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
 seguridad.ts |       0 |        0 |       0 |       0 | 1-57
```

Y por comportamiento, la misma petición contra los dos montajes:

```
[0.1] crearApp()        GET /health 200  csp= undefined  hsts= undefined  xcto= undefined
[P.0] arranque de main  GET /health 200  CSP: default-src 'self';script-src 'self';…
                                         HSTS: max-age=31536000; includeSubDomains; preload
```

**Consecuencia.** Cambiar `origin:` por `true`, añadir `'*'` a `methods`, o
borrar `forbidNonWhitelisted`, **no ponía en rojo ninguna de las 656 pruebas**.
Y los dos literales ya habían divergido: producción pasaba
`transformOptions: { enableImplicitConversion: false }` y el fixture no, así que
la suite validaba con reglas de conversión distintas de las del despliegue.

Es la familia de falso verde que §2.8.0 documenta —la metadata de decoradores en
la ETAPA 03, el `dist` viejo en la 04— aplicada esta vez a §2.7.2, §2.7.3 y
§2.7.7. **Mientras estuvo así, toda afirmación de los informes de etapa sobre
esas tres secciones se apoyaba en una tubería que el despliegue no usa.**

**Remediación.** `crearApp` monta la tubería real, en el mismo orden que
`main.ts`. Y suite nueva `cors-y-cabeceras.e2e.test.ts` que verifica **por
origen, por método y por cabecera**, que es lo que pide el alcance.

**Verificación posterior.**

```
File             | % Stmts | % Branch | % Funcs | % Lines
  seguridad.ts   |     100 |      100 |     100 |     100
  saneamiento.ts |     100 |      100 |     100 |     100
```

---

### H-13-12 · Media · El 413 salía como 500 «Error interno»

**Qué es.** `body-parser` y `express` no lanzan `HttpException`: lanzan
`http-errors`, que llevan su código en `status`/`statusCode`. El filtro global
los degradaba todos al repliegue de 500.

**Evidencia.**

```
POST …/guardia/ordenes  cuerpo 150 kB -> 400
POST …/guardia/ordenes  cuerpo 300 kB -> 500
{"nivel":"error","mensaje":"peticion fallida",…,"estado":500,"error":"request entity too large"}
```

El límite **funcionaba**; lo que fallaba era decirlo. Dos consecuencias: el
cliente recibía «Error interno» sin saber que se había pasado de tamaño, y cada
petición demasiado grande escribía una entrada de nivel `error` justo encima de
la alerta que sí importa. Un cliente torpe podía ahogar la señal.

**Remediación.** El filtro adopta el código de la biblioteca cuando está en el
rango 4xx. Un `status` de 5xx traído por una dependencia sigue siendo nuestro y
no cambia nada.

**Verificación posterior.** `validacion-dtos.e2e.test.ts`: 300 000 caracteres →
**413**, y el cuerpo no menciona `entity too large`, `body-parser` ni `stack`.

---

### H-13-13 · Media · Un parámetro de consulta no escalar producía 500

**Qué es.** `qs` convierte `?b=1&b=2` en un arreglo y `?b[x]=1` en un objeto. La
firma del controlador declara `busqueda?: string`, así que el primer `.trim()`
reventaba.

**Evidencia.**

```
[Q.1] escalar  (?busqueda=a)            -> 200 []
[Q.1] arreglo  (?busqueda=a&busqueda=b) -> 500 {"estado":500,…,"mensaje":"Error interno"}
[Q.1] objeto   (?busqueda[x]=1)         -> 500
```

El contraste con el escalar descarta que el 500 venga de la base: con una sola
letra el caso de uso devuelve `exito([])` sin tocar el repositorio.

**Remediación.** Un parámetro de consulta es un escalar por contrato en esta
API: ninguno de los tres DTO de consulta del árbol declara un campo de tipo
arreglo. El no escalar se **rechaza** con 400. No se colapsa a escalar — eso
sería volver al recorte silencioso de H-13-09.

**Verificación posterior.** Tres pruebas: el escalar sigue funcionando, el
repetido → 400, el de sintaxis de objeto → 400.

---

### H-13-14 · Baja · Los controles bidireccionales de Unicode llegaban a la traza inmutable

**Qué es.** La expresión de saneamiento cubría C0 y C1 (`\u0000-\u001F`,
`\u007F-\u009F`). `U+202E` —anulación de derecha a izquierda— está fuera.

**Evidencia.**

```
POST …/ordenes {"motivo":"Apertura\u0000autorizada\u0007de‮turno"}
[P.5] -> 201 | ¿NUL en lo almacenado? false | ¿U+202E? true
```

Y el mismo carácter atraviesa la exportación: `formatos.ts:76` filtra por punto
de código `< 0x20` y `0x7f`, así que el CSV y el XLS lo arrastran (el PDF no,
porque recorta a ASCII imprimible).

**Por qué es un hallazgo y no una curiosidad.** Es falsificación de
**presentación** sobre un registro que RN-03 declara inalterable: un motivo de
apertura puede leerse al revés de como se guardó, y quien audite verá lo que
quiso quien lo escribió, sin que un solo byte de la fila haya cambiado.

**Remediación.** Se añaden `U+200B`, `U+200E-F`, `U+202A-E`, `U+2066-9` y
`U+FEFF`. **NO** se quitan `U+200C` ni `U+200D`: el no-unidor y el unidor de
anchura cero son ortografía legítima en persa y en hindi y arman las secuencias
de emoji. Un saneador que se come escritura válida es un defecto, no una defensa.

**Verificación posterior.** Dos pruebas unitarias: los bidi fuera, `U+200C` y
`U+200D` intactos.

---

### H-13-15 · Media · Inyección de fórmulas CSV en la exportación del padrón

**Qué es.** Un campo que empieza por `=`, `+`, `-` o `@` lo interpreta Excel
como **fórmula** al abrir el fichero. El entrecomillado de RFC 4180 no protege:
Excel lo deshace al abrir. `eventos/presentacion/formatos.ts` lo trataba;
`padron/aplicacion/exportar-padron.ts` **no**.

**Evidencia — la cadena completa, contra la base real:**

```
1) alta -> registrada 0ea4dd7f-a968-47c4-9aa3-6e3838fbebd5
2) en la BASE -> "=HYPERLINK(\"http://malo.example\",\"ver\")"
3) linea del CSV -> "\"=HYPERLINK(\"\"http://malo.example\"\",\"\"ver\"\")\",C13-426428,,,,,"
4) lo que Excel evalua -> "=HYPERLINK(\"http://m"
```

Contraste con el exportador hermano: el campo `motivoManual` de `formatos.ts`
sale como `"'=HYPERLINK(…"`, **con** apóstrofo neutralizador.

**Remediación.** La regla vive en `apps/api/src/comun/csv.ts`, que los dos
exportadores importan. La política de entrecomillado puede diferir entre
formatos; la de seguridad, no. Es exactamente la divergencia que el comentario
de `exportar-padron.ts` decía querer evitar.

**Verificación posterior.** `comun/csv.test.ts` (4 casos) y
`exportar-padron.test.ts`: ninguna celda empieza por `=` tras deshacer el
entrecomillado, y un padrón normal sale intacto.

---

### H-13-16 · Media · Sin NFC, dos formas Unicode del mismo identificador esquivan el índice único

**Qué es.** El índice único parcial
`(copropiedad_id, coalesce(agrupacion,''), identificador)` compara **bytes**.

**Evidencia.**

```
alta 1 (NFC): registrada U+004D U+0061 U+00F1 U+0061 U+006E U+0061       («Mañana»)
alta 2 (NFD): registrada U+004D U+0061 U+006E U+0303 U+0061 U+006E U+0061 («Mañana»)
filas ACTIVAS que el usuario ve como la misma vivienda: 2
```

Es literalmente el argumento que `persona.ts:12-16` ya escribía para el
documento —«12.345.678, 12345678 y 12 345 678 son tres filas para PostgreSQL y
una sola persona para el portero»—, aplicado a `Placa` (NFKC) y a
`NombreDePersona` (NFC) pero **no** a `identificador` ni a `agrupacion`, que son
los dos únicos campos de identidad del padrón sin objeto de valor.

**Remediación.** `.normalize('NFC')` en el alta por pantalla y en la carga
masiva. NFC y no NFKC, por el mismo motivo que en `persona.ts`: NFKC colapsa
caracteres que aquí distinguen. La carga masiva importa especialmente porque una
hoja de cálculo guardada en macOS trae los acentos **descompuestos**: la misma
vivienda escrita por la pantalla y por el archivo daría dos filas.

**Verificación posterior.** Prueba en `padron/aplicacion/casos-de-uso.test.ts`
con ambas formas.

---

### H-13-17 · Media · El escaneo de secretos NUNCA miraba el historial de Git

**Qué es.** El alcance de la ETAPA 13 pide literalmente «confirmación de que
ninguno está en el código **ni en el historial de Git**». La segunda mitad no
tenía control: el escáner enumeraba sólo el árbol vivo (`git ls-files`).

**Evidencia — demostración A/B en un clon desechable:**

```
$ node scripts/lib/escanear-secretos.mjs
escaneo de secretos: limpio (1132 archivos)

$ printf 'export const K = "sb_secret_<sintética>";' > apps/api/src/fuga.ts
$ git add apps/api/src/fuga.ts && git commit -m "s"
$ node scripts/lib/escanear-secretos.mjs
POSIBLES SECRETOS: apps/api/src/fuga.ts:1  llave secreta de Supabase   EXIT=1

$ git rm apps/api/src/fuga.ts && git commit -m "quita el secreto"
$ node scripts/lib/escanear-secretos.mjs
escaneo de secretos: limpio (1132 archivos)                            EXIT=0

$ git cat-file blob $(git rev-parse HEAD~1:apps/api/src/fuga.ts)
export const K = "sb_secret_<sintética>";
```

El control informa «limpio» y sale 0 mientras la llave sigue siendo recuperable
con una orden. Y como el gancho de pre-commit y el CI invocan **el mismo**
escáner, ninguno de los dos cubría el historial.

**Remediación.** Modo `--historial`: recorre todos los blobs alcanzables desde
todas las referencias. Cableado al verificador y al CI, con
`actions/checkout@v4` a `fetch-depth: 0` —sin eso, el control correría sobre un
solo commit e informaría «limpio» sobre un repositorio que no ha visto—.

Coste medido: **2 158 blobs en 0,75 s**. No hay excusa de coste.

**Verificación posterior.**

```
$ node scripts/lib/escanear-secretos.mjs --historial
escaneo de secretos: limpio (2182 blobs del historial alcanzable · 2 de línea base declarados)
```

> **Y una recaída, encontrada comparando el control consigo mismo.** El
> `fetch-depth: 0` se añadió al trabajo `controles` y **no** al de
> `verificar-etapa.sh --con-base`, que ejecuta el mismo escaneo dentro del
> verificador. En la misma corrida de CI, el mismo control informó:
>
> ```
> controles:              limpio (2180 blobs del historial alcanzable)
> verificador-con-base:   limpio (1136 blobs del historial alcanzable)
> ```
>
> Mil blobs de diferencia, «limpio» las dos veces. Es **exactamente el modo de
> fallo que este hallazgo documenta** —un control que informa verde sobre un
> repositorio que no ha visto— reintroducido por poner la mitad del remedio. No
> se detectó leyendo el YAML: se detectó porque el control publica **cuántos
> blobs miró**, y dos cifras distintas del mismo control en la misma corrida no
> pueden ser las dos correctas. Los dos trabajos traen ahora la historia
> completa.

Y la prueba negativa (sonda 28e) planta un secreto, lo confirma, lo retira en el
commit siguiente y exige que el modo historial siga viéndolo.

> El modo historial nació denunciando una versión antigua **de sí mismo**: el
> encabezado del escáner contiene el valor sintético con el que
> se documenta H-13-20. `EXCLUIDOS` se aplica ahora también en el historial, por
> la ruta que git asocia al objeto. No es una excepción: es no morderse la cola.

---

### H-13-18 · Media · Un byte NUL hacía invisible al escáner un fichero entero

**Qué es.** El escáner descartaba el fichero completo al encontrar un `\0`,
imitando a `grep -I`. No es teórico: hay un `.ts` versionado con un NUL legítimo
—un fixture de saneamiento en `packages/domain-core/src/padron/persona.test.ts`—
que el escáner nunca leyó.

**Evidencia — A/B con la única diferencia siendo el byte:**

```
$ printf 'const k = "sb_secret_<sintética>";\nconst x = "\0";\n' > apps/api/src/fuga3.ts
$ node scripts/lib/escanear-secretos.mjs
escaneo de secretos: limpio (1133 archivos)                EXIT=0

$ printf 'const k = "sb_secret_<sintética>";\nconst x = "";\n'   > apps/api/src/fuga3.ts
$ node scripts/lib/escanear-secretos.mjs
POSIBLES SECRETOS: apps/api/src/fuga3.ts:1  llave secreta de Supabase   EXIT=1
```

**Remediación.** El NUL se **quita** y el contenido se escanea igual. Sólo se
omite lo que es binario de verdad, decidido por proporción de bytes no
imprimibles sobre los primeros 8 KiB: un PNG o un PDF no tienen líneas que
reportar; un fuente con un byte de control sí.

**Verificación posterior.** Sonda 28b: `✓ un byte NUL ya no hace invisible el
fichero entero`.

---

### H-13-19 · Media · Sin patrón para los secretos propios del proyecto

**Qué es.** Los siete patrones cubrían Supabase, JWT, PEM y formas genéricas.
Ninguno cubría los tres secretos que el propio esquema Zod declara obligatorios:
`INGESTA_FIRMA_SECRETO`, `BIOMETRIA_LLAVE` y `EDGE_INGESTA_SECRETO`. Tampoco
`AKIA…`, `AIza…`, `ghp_…` ni `xox…`.

**Evidencia.** Un fichero con los dos primeros y valores de alta entropía →
`escaneo de secretos: limpio (1133 archivos)`, EXIT 0.

**Lo que abre.** `INGESTA_FIRMA_SECRETO` es **lo único** que protege
`/ingesta/eventos`, `/ingesta/reconciliacion` y `/ingesta/latidos`, que son
rutas `@Publico()`. Con esa llave se firman eventos contra una tabla que RN-03
declara inalterable.

**Comprobado además:** hoy no hay ningún literal real de los tres en el árbol ni
en el historial; todos los valores presentes se autodescriben como de prueba. El
riesgo no se ha materializado — pero si se materializa, el control no lo vería.

**Remediación.** Patrones nuevos para los tres nombres propios y para los cuatro
formatos de nube. Y una decisión de diseño que importa: **se distingue una llave
de una frase por la FORMA DEL VALOR, no por una lista de palabras**. Una lista
de marcadores («prueba», «ejemplo») va siempre por detrás del siguiente que
alguien invente, y cada palabra que se le añade es justo la que un valor real
podría llevar. Una llave la genera `openssl rand`: mezcla mayúsculas con dígitos
o es hexadecimal largo. Un marcador lo escribe una persona en minúsculas con
guiones.

**Verificación posterior.** Sonda 28c, con **contraprueba**: la llave sintética
se detecta y el marcador legible no produce ruido. La contraprueba no es
opcional — un control que grita en cada commit se desactiva a la semana.

---

### H-13-20 · Baja · El escáner leía el ÁRBOL y no el ÍNDICE

**Qué es.** `git ls-files` da los NOMBRES del índice, pero el contenido se leía
del disco con `readFileSync`. Si lo preparado y lo que hay en el árbol difieren,
el gancho valida el árbol y se confirma el índice.

**Evidencia.**

```
$ git show :apps/api/src/fuga2.ts   ->  export const K = "sb_secret_<sintética>";
$ cat      apps/api/src/fuga2.ts    ->  export const K = "inocuo";
$ node scripts/lib/escanear-secretos.mjs            -> limpio (1138 archivos)  EXIT=0
$ node scripts/lib/escanear-secretos.mjs --indice   -> fuga2.ts:1 llave secreta EXIT=1
```

La secuencia no es rebuscada: `git add .` seguido de seguir editando el fichero
la produce sola.

**Remediación.** Modo `--indice`, que lee con `git show :ruta`, y el gancho de
pre-commit lo usa. En CI el árbol y el commit coinciden, así que allí sigue
valiendo el modo árbol.

**Verificación posterior.** Sonda 28a, con el A/B completo.

---

### H-13-21 · Baja · CORS aceptaba cualquier cadena como origen

**Qué es.** Las únicas comprobaciones eran «no vacío» y «no es `*`».

**Evidencia, con `NODE_ENV=production`:**

```
CORS_ALLOWED_ORIGINS="http://consola.ejemplo.co"       -> ACEPTADO
CORS_ALLOWED_ORIGINS="https://consola.ejemplo.co/"     -> ACEPTADO
CORS_ALLOWED_ORIGINS="ftp://x"                         -> ACEPTADO
CORS_ALLOWED_ORIGINS="no-es-una-url"                   -> ACEPTADO
CORS_ALLOWED_ORIGINS="https://consola.ejemplo.co/ruta" -> ACEPTADO
```

Y con el primero, la API emite credenciales hacia texto plano:

```
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: http://consola.ejemplo.co
Access-Control-Allow-Credentials: true
```

Contra la exigencia de HTTPS de §2.7.8, sin que nada lo advierta. El valor de
`.env.example` es `http://localhost:3001` —correcto en desarrollo y
silenciosamente peligroso si se copia a producción—, que es exactamente cómo
llega uno de estos a un despliegue.

La barra final importa aunque parezca cosmética: el navegador envía `Origin`
**sin** barra ni ruta, así que `https://consola.ejemplo.co/` no casa nunca y la
consola se queda fuera con un fallo sin diagnóstico.

**Nota:** las entradas malformadas fallan **cerrado**, no abierto. Rompen la
consola; no abren la API.

**Remediación.** Cada origen se valida contra `new URL(o).origin`: forma
canónica, esquema `http`/`https`, y `https` obligatorio con `NODE_ENV=production`
salvo `localhost` y `127.0.0.1`.

**Verificación posterior.** Dos pruebas en `configuracion/esquema.test.ts`:
cinco formas malformadas → `ErrorDeConfiguracion`; `http://` en producción →
error que menciona HTTPS; `https://` y `http://localhost:3001` → pasan.

---

### H-13-22 · Informativa · `DELETE` anunciado sin ruta, y `x-request-id` no legible

**Qué es.** Dos desviaciones de mínimo privilegio y de trazabilidad en la
configuración CORS.

**Evidencia.**

```
$ grep -rhoE "@(Get|Post|Put|Patch|Delete)\(" apps/api/src --include=*.controller.ts | sort | uniq -c
     34 @Get(      1 @Patch(      43 @Post(

$ curl -X OPTIONS … -H 'Origin: https://consola.ejemplo.co'
Access-Control-Allow-Methods: GET,POST,PATCH,DELETE,OPTIONS
Access-Control-Allow-Headers: Content-Type,Authorization,x-request-id
(sin Access-Control-Expose-Headers)
```

No hay ni un `@Delete` ni un `@Put` en las 77 rutas. Y `x-request-id` estaba en
`allowedHeaders` —lo que el navegador puede ENVIAR— pero no en `exposedHeaders`
—lo que puede LEER—: como la consola vive en otro origen por diseño, su
JavaScript no podía leer el identificador con el que se correlaciona un
incidente. Afecta a la trazabilidad, no a la confidencialidad.

**Remediación.** `methods` sin `DELETE`, con el motivo escrito para que
reponerlo sea una decisión y no un descuido (RN-19 prohíbe el borrado físico), y
`exposedHeaders: ['x-request-id', 'Retry-After']`.

**Verificación posterior.** `cors-y-cabeceras.e2e.test.ts`: los métodos no
contienen `PUT` ni `*`, y `Access-Control-Expose-Headers` contiene
`x-request-id`.

---

### H-13-23 · Baja · Ficheros que `.gitignore` prohíbe, versionados

**Qué es.** `.gitignore` **no desversiona nada**: una vez que un fichero está en
el índice, la regla deja de aplicarle.

**Evidencia.**

```
$ git ls-files | grep -i DS_Store
docs/.DS_Store                                  # con `.DS_Store` en .gitignore:3

$ git check-ignore --no-index -v apps/web/next-env.d.ts
.gitignore:31:next-env.d.ts	apps/web/next-env.d.ts   # declarado desde la ETAPA 09, y versionado
```

Ninguno de los dos contiene secretos —el `.DS_Store` filtra nombres de ficheros
y disposición de carpetas de la máquina del desarrollador— pero **la misma
grieta alcanza a `.env`, `*.pem`, `*.key` y `service-account*.json`**, que están
en esa lista precisamente porque §2.5 los prohíbe.

**Remediación.** Los dos fuera del índice (`git rm --cached`), `Thumbs.db`
añadido a `.gitignore`, y control nuevo dentro del escáner de secretos:
`git ls-files -i -c --exclude-standard` da exactamente esa intersección.

**Verificación posterior.** El control encontró los dos, y sonda 28d planta un
`*.pem` con `git add --force` y exige que se detecte.

> Este control encontró, entre otras cosas, el `next-env.d.ts` que el **propio
> trabajo de esta etapa** acababa de confirmar dos commits antes.

---

### H-13-24 · Informativa · El cuerpo del 429 nombraba `ThrottlerException`

**Qué es.** Encontrado al ejercer el limitador bajo carga.

**Evidencia.**

```
{"estado":429,"correlacion":"sin-correlacion","mensaje":"ThrottlerException: Too Many Requests"}
```

No es una brecha, pero le dice a quien sondea qué biblioteca hay detrás y dónde
buscarle los CVE — información que §2.7.8 clasifica como fuga por mensaje de
error y que a un cliente legítimo no le sirve de nada.

**Remediación.** El filtro global retira el prefijo `<Algo>Exception: ` de forma
genérica —cualquier `HttpException` de una dependencia futura llegará con la
misma forma— conservando el texto útil.

**Verificación posterior.** `limite-de-peticiones.e2e.test.ts`: el cuerpo del
429 no casa con `/throttle|storage|ttl|tracker/i`.

---

### H-13-25 · Baja · **ABIERTO** · Una contraseña literal inerte en el historial

**Qué es.** Es la instancia concreta que demuestra que H-13-17 no era
hipotético. Barrido exhaustivo de los blobs alcanzables desde todas las
referencias:

```
$ git cat-file blob 459332bc45ef1c2e198c358e016e2d1731b51863 | grep -n -i contrasena
37:  contrasena: 'Contrasena-De-Prueba-1',

$ git log --oneline HEAD -S'Contrasena-De-Prueba-1'
f06050e fix(etapa-09/verificacion): … y la contrasena literal
05cf156 fix(etapa-09/api): …

$ git merge-base --is-ancestor 0702d6f HEAD && echo "SI"
SI: el commit con la contrasena es ancestro de HEAD
```

**Ya fue corregida en el árbol** por el commit `f06050e`, que la sustituyó por
un valor sorteado por ejecución:

```
-  contrasena: 'Contrasena-De-Prueba-1',
+  contrasena: `Ncr-${randomBytes(12).toString('base64url')}`,
```

**Impacto real, acotado.** Es la contraseña de un doble de GoTrue que se levanta
**dentro del proceso de prueba** —el propio fichero lo dice: «así el camino es
real de punta a punta sin tocar la red»—. Nunca fue credencial de un servicio
real.

**Por qué queda ABIERTO y no se remedia.** Reescribir el historial invalidaría
las 27 referencias y todos los SHA citados en los trece informes de etapa, a
cambio de retirar un valor inerte. La decisión es **suya**: §7 lleva el texto de
aceptación de riesgo redactado para su firma. Mientras tanto, los dos blobs
están declarados como **línea base** en el escáner, con nombre y motivo, para
que cualquier hallazgo futuro del historial sea real y no ruido heredado.

---

### H-13-26 · **ALTA** · Cuatro vulnerabilidades críticas y 23 altas en producción

**Qué es.** El árbol de dependencias no tenía ninguna acotación (`pnpm.overrides`
estaba vacío).

**Evidencia — medida sobre el árbol anterior (`fa83f04`), reconstruido para
poder compararlo:**

```
$ pnpm audit --prod
59 vulnerabilities found
Severity: 6 low | 26 moderate | 23 high | 4 critical

$ pnpm audit
78 vulnerabilities found
Severity: 8 low | 36 moderate | 28 high | 6 critical
```

**Remediación.** `pnpm.overrides` acotadas, y la palabra _acotadas_ es el
hallazgo dentro del hallazgo: la primera versión usó `>=`, que es una
**actualización de versión mayor automática que nadie revisa**. Arrastró Vite 8 y
vitest 5 y dejó las 350 pruebas de `@ncr/web` en rojo con «invalid JS syntax».
Un `override` sin techo no es una corrección: es un riesgo distinto con el mismo
nombre. Todas usan `^`.

**Verificación posterior · estado actual:**

```
$ pnpm audit --prod
12 vulnerabilities found
Severity: 3 low | 9 moderate            ← 0 altas, 0 críticas

$ pnpm audit
19 vulnerabilities found
Severity: 5 low | 14 moderate           ← 0 altas, 0 críticas
```

Las 12 restantes en producción son **moderadas y bajas**, todas de dependencias
transitivas sin versión corregida publicada. Se declaran, no se ocultan: §7
lleva su aceptación de riesgo redactada.

---

### H-15B-1 · **ALTA** · Guardar la credencial del equipo en la base amplía lo que cuesta un volcado

**Qué es.** La ETAPA 15-B abre el alta de equipos desde la consola (A.1). Eso
significa que el usuario, la dirección y **la clave** de cada cámara, terminal
y videoportero pasan a vivir en la base de datos. Antes no estaban: la
credencial era una referencia a una variable de entorno, y el precio de esa
pureza era que dar de alta una cámara exigía acceso al servidor y una redespliegue.

El riesgo es directo y hay que decirlo sin adorno: **comprometer la base de
datos pasa a comprometer los equipos**. Antes, un volcado entregaba datos
personales; ahora entregaría además la puerta de entrada al hardware que abre
las barreras del conjunto. No es teórico: es la consecuencia mecánica de la
decisión.

**Por qué se toma igualmente.** La alternativa —una variable de entorno por
equipo— no escala a multiempresa: cuarenta conjuntos con seis aparatos cada uno
son doscientas cuarenta variables, y cada alta pasa a ser un despliegue. Un
producto SaaS en el que registrar una cámara exige tocar el servidor no es un
producto. La decisión es guardar la credencial y **pagar el precio en
mitigaciones explícitas**, no fingir que el riesgo no existe.

**Severidad: Alta.** No por probabilidad —requiere ya haber comprometido la
base— sino por impacto: control físico de accesos.

**Mitigaciones implantadas.**

1. **Cifrado en la APLICACIÓN, no en la base** (D-10). La llave no toca
   PostgreSQL: llega por `EQUIPOS_LLAVE` y la aplicación no arranca sin ella.
   Un volcado entrega `bytea` sin sentido, no credenciales.
2. **AES-256-GCM con llave derivada POR COPROPIEDAD** (HKDF, el mismo sobre que
   H-13-02). Comprometer la llave derivada de un conjunto no abre los equipos
   de otro, y la etiqueta de integridad impide sustituir el contenido: quien
   tuviera escritura en la base no puede cambiar la credencial por una suya.
3. **Llave distinta de la biométrica.** Se comparte el código de cifrado —uno
   solo en el proyecto— y no el material de clave: comprometer las plantillas
   no entrega las cámaras.
4. **Ningún token de usuario lee la tabla.** `credenciales_de_equipo` no tiene
   política de `SELECT` para `authenticated`: ni el superadministrador la lee.
   Sólo el camino de servicio, que es el que va a hablar con el equipo.
   Probado por ejecución en `supabase/policies/tests/70_…`.
5. **La API nunca devuelve el secreto**, y no por disciplina: el DTO de
   respuesta no declara el campo, así que el tipo generado para la consola no
   tiene dónde ponerlo.
6. **Usuario de servicio con privilegio mínimo** en el equipo, no el de
   fábrica: lo pide la pantalla de alta y lo detalla la guía de integración.

**Riesgo residual declarado.** Quien comprometa a la vez la base **y** la
variable de entorno del proceso obtiene las credenciales. Eso es equivalente a
haber comprometido el servidor entero, y en ese escenario el atacante ya puede
pedirle al propio sistema que abra la barrera. La mitigación real de ese caso no
es criptográfica: es que el usuario de servicio del equipo tenga el privilegio
mínimo y que el acceso quede auditado, que es lo que hacen las capas 6 y la
auditoría en la misma transacción.

**Procedimiento de rotación.** En este orden, y sin caída:

1. Cambiar la clave **en el equipo** (usuario de servicio, no el de fábrica).
2. Editar el equipo en la consola con la clave nueva y **probar la conexión**
   antes de guardar. La escritura desactiva la credencial anterior y escribe la
   nueva en la misma transacción: nunca hay dos vigentes ni un hueco sin
   ninguna.
3. Si lo que rota es `EQUIPOS_LLAVE` —no la clave del equipo—, hay que volver a
   escribir la clave de cada aparato desde la consola, porque el sobre anterior
   deja de descifrarse. Es deliberado: una rotación de llave maestra que
   descifrase con la vieja para recifrar con la nueva obligaría a tener las dos
   a la vez en el proceso, que es exactamente el momento en que una fuga las
   entrega juntas.
4. Comprobar en la pantalla de Dispositivos que cada equipo vuelve a
   **verificado**; el que quede en «no verificado» dice por qué.

---

### H-15B-2 · **ALTA** · El evento de la cámara empuja fotografías de personas

**Qué es.** La guía oficial del fabricante para el evento ANPR enumera diez
partes en el POST multipart del «servidor de alarma». Dos de ellas son
`pilotPicture.jpg` y `copilotPicture.jpg`: **las caras del conductor y del
acompañante**.

Eso es dato biométrico entrando por una puerta que nadie abrió. El proyecto
tiene un ciclo de vida biométrico completo bajo la Ley 1581 de 2012
—consentimiento previo, expreso e informado del **titular**, finalidad,
supresión programada— y ninguna de esas garantías se aplicaría a una fotografía
que llega sola dentro de un evento de placa. El visitante no consintió: vino a
que le leyeran la placa.

**Severidad: Alta**, por la naturaleza del dato y por el régimen legal que lo
gobierna. Un incumplimiento aquí no es una vulnerabilidad técnica: es un
tratamiento de dato sensible sin base legal.

**Remediación.** El receptor **aparta esas partes antes de clasificar el
sobre** y las rechaza explícitamente, con el nombre y el motivo en la bitácora
a nivel `error`. No se guardan, no se reenvían y no llegan a ningún caso de
uso. El recuento de partes rechazadas viaja en el sobre normalizado para que la
auditoría pueda verlo.

**Verificación.** `packages/providers/src/hikvision/publicacion-alarm-server.test.ts`
—una cámara simulada que publica con `conRostros`— y el registro de la
petición, que nombra las partes apartadas.

**Lo que NO se hace, y es deliberado:** desactivar esa función en la cámara no
es suficiente como única medida. La configuración del equipo puede cambiarla
cualquiera con acceso a su panel; el rechazo en el receptor es la barrera que
no depende de la configuración del aparato.

---

## 4 · Dimensiones del alcance · qué se hizo con cada una

El alcance de §6 ETAPA 13 enumera dieciséis dimensiones. Esta tabla dice, para
cada una, **qué se ejecutó y qué demostró**. Ninguna queda sin fila.

| #   | Dimensión del alcance                             | Cómo se verificó                                                                                                                 | Resultado                                  |
| --- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1   | Secretos en el código **y en el historial**       | `escanear-secretos.mjs` en sus tres modos + barrido exhaustivo de blobs                                                          | H-13-17…20, 23, 25 · **VERIFICADO**        |
| 2   | CORS por origen, método y cabecera                | `cors-y-cabeceras.e2e.test.ts` (9 casos) + validación en el cargador                                                             | H-13-11, 21, 22 · **VERIFICADO**           |
| 3   | Validación de entrada · fuzzing de DTOs           | Barrido de las 44 rutas POST/PATCH derivadas del enrutador, con tipos inesperados, tamaño, Unicode, `NUL` y campos no declarados | H-13-05…07, 09, 12, 13 · **VERIFICADO**    |
| 4   | Inyección SQL sobre todos los campos persistidos  | Consultas parametrizadas en todo el árbol; 6 cargas clásicas tratadas como texto literal; saneamiento previo al guardado         | Sin hallazgo de inyección · **VERIFICADO** |
| 5   | Rate limiting bajo carga                          | `limite-de-peticiones.e2e.test.ts`: 12 permitidas, 4 rechazadas con `Retry-After`                                                | H-13-24 · **VERIFICADO**                   |
| 6   | Que el backoff del Edge no dispare el limitador   | `esperaDelIntento` con jitter que RESTA: mínimo 500 ms, techo 5 min; 120 × 500 ms = 60 s                                         | Sin hallazgo · **VERIFICADO**              |
| 7   | **Matriz completa de RLS**, política por política | `60_matriz_rls_completa.sql`, derivada del catálogo: 42 tablas, positiva y negativa                                              | H-13-04 · **VERIFICADO**                   |
| 8   | Las rutas `service_role`                          | Camino 3 de `aislamiento.e2e.test.ts`: no escribe fuera de su alcance, sí dentro, no alcanza lo no admitido                      | Sin hallazgo · **VERIFICADO**              |
| 9   | CSP y cabeceras con reporte real                  | `cors-y-cabeceras.e2e.test.ts`: CSP sin `unsafe-*`, HSTS, `nosniff`, `Referrer-Policy`, sin `x-powered-by`                       | H-13-11 · **VERIFICADO**                   |
| 10  | XSS almacenado y reflejado                        | `xss.e2e.test.ts`: 5 cargas, tipo declarado, `nosniff`, y el 404 con la carga en la RUTA                                         | Sin hallazgo · **VERIFICADO**              |
| 11  | IDOR sobre cada recurso                           | `aislamiento.e2e.test.ts`: identificadores ajenos en **todas** las rutas del enrutador, por los dos caminos                      | Sin hallazgo · **VERIFICADO**              |
| 12  | Escalamiento de privilegios entre los 6 roles     | `escalamiento-de-privilegios.e2e.test.ts`: 230 peticiones con el rol equivocado                                                  | Sin hallazgo · **VERIFICADO**              |
| 13  | Carga de archivos por tipo REAL                   | `tipoRealDe` (JPEG/PNG por bytes mágicos) y `xlsx.ts` (`PK\x03\x04`, bomba, XXE, recorrido de rutas)                             | H-13-09 · **VERIFICADO**                   |
| 14  | Fugas por logs y por mensajes de error            | `fugas-por-registro.e2e.test.ts`: redacción, y falsificación de línea desde la entrada                                           | H-13-24 · **VERIFICADO**                   |
| 15  | Dependencias vulnerables (`audit` + SCA en CI)    | `pnpm audit` antes y después, y el paso de CI                                                                                    | H-13-26 · **VERIFICADO**                   |
| 16  | OWASP Top 10 y ASVS nivel 2                       | §5 y §6 de este documento                                                                                                        | **VERIFICADO / LEÍDO**, por fila           |

### 4.1 · Inyección SQL · por qué no hay hallazgo, dicho con precisión

Lo que se comprobó, y en qué orden:

1. **Ninguna consulta se arma concatenando entrada.** El único punto donde
   aparece una concatenación dentro de SQL es
   `repositorio-pg.ts:360`: `p.nombre_completo ILIKE '%' || $2 || '%'`. La
   concatenación ocurre **dentro** de PostgreSQL, sobre un parámetro. Medido
   contra la base real, con las seis cargas clásicas:

   ```
   ' OR '1'='1                        -> filas: 0
   '; DROP TABLE public.personas; --  -> filas: 0
   1' UNION SELECT NULL--             -> filas: 0
   admin'--                           -> filas: 0
   %' OR 1=1 --                       -> filas: 0
   \'; SELECT pg_sleep(5); --         -> filas: 0

   personas: 10        ← la tabla sigue viva tras el intento de DROP
   ```

   Las seis se trataron como texto literal: ninguna devolvió fila y ninguna
   ejecutó nada.

2. **Lo que sí hace** un `%` o un `_` en ese término es actuar como comodín del
   patrón `LIKE`, devolviendo el padrón completo del tenant en una consulta.
   Medido sobre la misma base:

   ```
   con %:                                  1
   activas del tenant:                     1     ← devuelve las suyas, todas
   personas de OTROS tenants en la base:   9     ← y ninguna de ellas
   ```

   No cruza la frontera: el filtro `p.copropiedad_id = $1` sigue en pie.
   La ruta está limitada a `administrador` y `superadministrador`, que ya
   disponen del listado completo por `GET /padron/personas`, así que el impacto
   es nulo. **Se deja anotado**: si algún día la búsqueda se expone a un rol con
   menos alcance que el listado completo, hay que escapar `%`, `_` y `\`.

3. **El saneamiento previo al guardado** que §2.7.4 exige no existía: es
   H-13-06, y se remedió.

### 4.2 · Lo que NO se pudo verificar, dicho con esas palabras

| Qué                                                                  | Por qué no                                                                                                                                                       | Qué haría falta                                       |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **KPI-22** · completitud de auditoría (0 accesos del log sin evento) | Exige cruzar el log **del dispositivo** con los eventos de la plataforma. Es un KPI marcado **H** (hardware) en la matriz.                                       | ETAPA 15, con el equipo delante                       |
| **BE-01** · ciclo de recuperación de contraseña de punta a punta     | SMTP y URLs de redirección están en el panel de Supabase, sin permisos. **El correo no se puede enviar ni recibir desde aquí.**                                  | Permisos de administración del proyecto (§8)          |
| **D-09** · que el dueño en Supabase NO sea superusuario              | Se demuestra en el clúster local con `sb_postgres_sim`, que reproduce la condición. **No es el proyecto real.**                                                  | Credenciales del proyecto real (§8, pregunta _a_)     |
| **D-12** · que `postgres` pueda `GRANT authenticated TO app_api`     | **VERIFICADO en el clúster local**, como superusuario y como dueño no superusuario. En Supabase gestionado depende de `ADMIN OPTION`.                            | Credenciales del proyecto real (§8, pregunta _a_)     |
| Objetos o referencias que el remoto tenga y este clon no             | Sólo se pueden escanear los objetos locales: 27 referencias. Ramas borradas en el servidor o historia descartada por un `push --force` no existen en este disco. | Escaneo en el servidor, o `secret scanning` de GitHub |
| Si algún valor «de prueba» fue alguna vez una credencial real        | Los valores se autodescriben, pero confirmarlo exige el gestor de credenciales de Grupo Control.                                                                 | Inventario de credenciales del cliente                |
| Si GitHub tiene activadas `secret scanning` y `push protection`      | No hay nada declarado en el árbol; el estado vive en la configuración del repositorio.                                                                           | Acceso a los ajustes del repositorio (§8)             |

---

## 5 · OWASP Top 10 (2021) · lista de verificación formal

| Categoría                                                        | Qué se verificó, y cómo                                                                                                                                                                                                                                                                                                                                                                            | Veredicto                     |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **A01 · Control de acceso roto**                                 | Guard global que **deniega por defecto** (ruta sin `@Roles` → 403); suite de aislamiento sobre todas las rutas por los dos caminos (JWT y llave de servicio); matriz de escalamiento de 6 roles × 77 rutas, 230 peticiones, **0 respuestas 2xx**; RLS forzada en 46 de 46 tablas, 101 políticas; acceso cruzado responde 404 y no 403, a propósito, para no confirmar que el identificador existe. | **VERIFICADO · sin hallazgo** |
| **A02 · Fallos criptográficos**                                  | HKDF por copropiedad en la bóveda biométrica (H-13-02); AES-256-GCM; JWT verificado contra el JWKS con el algoritmo tomado de la clave y no del token; HSTS con `preload`; evidencia en bucket privado con URL firmada de vida corta que **no se guarda**, se firma en cada lectura.                                                                                                               | **H-13-02, cerrado**          |
| **A03 · Inyección**                                              | SQL: §4.1. CSV/fórmulas: H-13-15. XSS: `xss.e2e.test.ts`. Inyección en el visor de registros: `fugas-por-registro.e2e.test.ts`. Contaminación de prototipo: H-13-05.                                                                                                                                                                                                                               | **H-13-05, 15, cerrados**     |
| **A04 · Diseño inseguro**                                        | Denegar por defecto en el motor de reglas y en los guards; precedencia `listaNegra > vigencia > patrón > zona`; inmutabilidad en cuatro capas (ADR-005); idempotencia en la ingesta; consentimiento como bloqueo duro de la sincronización biométrica.                                                                                                                                             | **LEÍDO · sin hallazgo**      |
| **A05 · Configuración insegura**                                 | Configuración tipada y validada con Zod: **la aplicación no arranca si falta una variable**; CORS por lista blanca validada como origen canónico (H-13-21); CSP sin `unsafe-*`; `x-powered-by` ausente; límite de payload con su 413 (H-13-12).                                                                                                                                                    | **H-13-11, 12, 21, cerrados** |
| **A06 · Componentes vulnerables**                                | `pnpm audit` antes/después: de 4 críticas y 23 altas en producción a **0 y 0** (H-13-26); `overrides` acotadas con `^`; paso de auditoría en CI.                                                                                                                                                                                                                                                   | **H-13-26, cerrado**          |
| **A07 · Fallos de identificación y autenticación**               | MFA TOTP obligatorio para roles administrativos, con la lista de rutas exentas **derivada del decorador** y probada («la exención no crece sin que nadie lo vea»); códigos de recuperación de un solo uso en hash; rate limiting endurecido en login, MFA y recuperación; firma HMAC de ingesta que ahora falla cerrado (H-13-10).                                                                 | **H-13-10, cerrado**          |
| **A08 · Fallos de integridad de software y datos**               | Instalación con `--frozen-lockfile`; `overrides` acotadas; eventos append-only por permisos, disparador y RLS forzada; `VersiónDeReglas` sellada en cada decisión; claves de idempotencia en la bandeja del Edge.                                                                                                                                                                                  | **VERIFICADO · sin hallazgo** |
| **A09 · Fallos de registro y monitorización**                    | Redacción por clave a cualquier profundidad; registro estructurado con identificador de correlación; **la línea no se puede falsificar desde la entrada**; `auditoria_seguridad` append-only con todo acceso cruzado registrado (CA-24).                                                                                                                                                           | **VERIFICADO · sin hallazgo** |
| **A10 · Falsificación de petición del lado del servidor (SSRF)** | La API no toma URLs del usuario. Las únicas salidas son a Supabase y a FCM, con anfitriones que vienen de la configuración validada. El Edge habla sólo con la URL de nube de su configuración.                                                                                                                                                                                                    | **LEÍDO · sin hallazgo**      |

---

## 6 · OWASP ASVS nivel 2 · lista de verificación formal

Por capítulo, con el veredicto y el término exacto (§0).

| Capítulo ASVS                                   | Estado                   | Base                                                                                                                                                                               |
| ----------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **V1 · Arquitectura y diseño**                  | **VERIFICADO**           | Monolito modular hexagonal con frontera impuesta por el linter; `docs/arquitectura/`; ADR fechados                                                                                 |
| **V2 · Autenticación**                          | **VERIFICADO / parcial** | JWT asimétrico contra JWKS, HS256 rechazado, TTL de caché alineado; MFA TOTP obligatorio; **el ciclo de recuperación por correo es NO VERIFICABLE aquí** (BE-01)                   |
| **V3 · Gestión de sesión**                      | **VERIFICADO**           | Token en cabecera `Authorization`, nunca en cookie — lo que además descarta CSRF por diseño; expiración de 5 min con refresco; revocación                                          |
| **V4 · Control de acceso**                      | **VERIFICADO**           | §5 A01. Denegar por defecto; matriz de 6 roles; doble barrera (aplicación + RLS)                                                                                                   |
| **V5 · Validación, saneamiento y codificación** | **VERIFICADO**           | `ValidationPipe` estricto **real** (H-13-11); saneamiento de §2.7.4 (H-13-06); cota de profundidad (H-13-07); cota por campo (H-13-09); tipo real de archivo                       |
| **V6 · Criptografía almacenada**                | **VERIFICADO**           | HKDF por tenant (H-13-02); AES-256-GCM; la plantilla biométrica no vuelve a salir de la bóveda                                                                                     |
| **V7 · Manejo de errores y registro**           | **VERIFICADO**           | Filtro global que no filtra el interior (H-13-12, H-13-24); redacción; correlación                                                                                                 |
| **V8 · Protección de datos**                    | **VERIFICADO / parcial** | Buckets privados con URL firmada de vida corta; supresión biométrica programada y por revocación; **la supresión verificada en la terminal física es de la ETAPA 15**              |
| **V9 · Comunicaciones**                         | **LEÍDO**                | HSTS con `preload`; HTTPS exigido; CORS sólo `https` en producción (H-13-21). El cifrado en tránsito real depende del despliegue                                                   |
| **V10 · Código malicioso**                      | **VERIFICADO**           | Escaneo de secretos en tres modos; `--frozen-lockfile`; SCA en CI; sin `eval` en el árbol de producción                                                                            |
| **V11 · Lógica de negocio**                     | **VERIFICADO**           | Motor de reglas puro con reloj inyectado y 100 % de ramas; aforo en el límite; idempotencia; concurrencia por restricción de base (KPI-03: 100 intentos, 1 aceptado, 0 duplicados) |
| **V12 · Archivos y recursos**                   | **VERIFICADO**           | Tipo real por bytes mágicos; cotas de bomba de descompresión, entradas y razón; XXE rechazado; recorrido de rutas imposible por diseño                                             |
| **V13 · API y servicios web**                   | **VERIFICADO**           | OpenAPI generado; cliente Dart generado; rate limiting por IP **y por identidad**; firma HMAC en la superficie sin sesión                                                          |
| **V14 · Configuración**                         | **VERIFICADO**           | Arranque fallido ante variable faltante; `.env.example` con nombres y nunca valores; CSP y cabeceras; `overrides` acotadas                                                         |

---

## 7 · Riesgos aceptados · **pendientes de su firma**

Redactados, **no dados por firmados**. Cada uno lleva lo que se acepta, por qué,
qué lo acota y qué lo reabriría.

### AR-01 · La contraseña inerte en el historial de Git (H-13-25)

> Acepto que el blob `459332bc…` (y su gemelo `7062bfa7…`), que contiene la
> línea `contrasena: 'Contrasena-De-Prueba-1'` de `e2e/doble-gotrue.mjs`,
> permanezca en el historial del repositorio sin reescribirlo.
>
> **Lo acepto porque** el valor es la contraseña de un doble de GoTrue que se
> levanta dentro del proceso de prueba y nunca fue credencial de un servicio
> real; porque el árbol ya no la contiene desde `f06050e`; y porque reescribir
> el historial invalidaría las 27 referencias y todos los SHA citados en los
> informes de etapa a cambio de retirar un valor inerte.
>
> **Queda acotado** por su declaración como línea base en
> `scripts/lib/escanear-secretos.mjs`, con nombre y motivo, de modo que el
> escaneo de historial parte de cero y cualquier hallazgo futuro es real.
>
> **Se reabre si** se descubre que ese valor se reutilizó en alguna cuenta real,
> o si el repositorio pasa a ser público.
>
> Firma: \***\*\*\*\*\***\_\_\***\*\*\*\*\*** Fecha: \***\*\_\_\_\_\*\***

### AR-02 · Las 12 vulnerabilidades moderadas y bajas que quedan en producción (H-13-26)

> Acepto que el árbol de dependencias de producción conserve 12
> vulnerabilidades —3 bajas y 9 moderadas— después de llevar las críticas y las
> altas a cero.
>
> **Lo acepto porque** todas son de dependencias transitivas sin versión
> corregida publicada al 2026-09-22, y forzarlas con un `override` sin techo es
> el riesgo distinto que ya se materializó en esta misma etapa: `>=` arrastró
> Vite 8 y vitest 5 y dejó 350 pruebas en rojo.
>
> **Queda acotado** por el paso de auditoría en CI, que vuelve a medir en cada
> integración, y por las `overrides` acotadas con `^`, que sí recogen las
> correcciones de parche y menor.
>
> **Se reabre si** alguna sube a alta o crítica, o si aparece versión corregida.
>
> Firma: \***\*\*\*\*\***\_\_\***\*\*\*\*\*** Fecha: \***\*\_\_\_\_\*\***

### AR-03 · D-09 y D-12 demostrados en un clúster que REPRODUCE Supabase, no en Supabase

> Acepto que la inmutabilidad frente al dueño (D-09) y la concesión de
> `authenticated` al rol de conexión dedicado (D-12) queden demostradas por
> ejecución contra el clúster local en **modo Supabase** —rol dueño
> `sb_postgres_sim`, NO superusuario— y no contra el proyecto real de Grupo
> Control.
>
> **Lo acepto porque** el modo reproduce la condición que hace la diferencia —el
> dueño no es superusuario, así que el `REVOKE` y la RLS forzada le alcanzan— y
> porque entregar credenciales del proyecto real a un entorno de desarrollo es
> un riesgo mayor que el que cierra.
>
> **Queda acotado** por la aserción de despliegue: la primera vez que las
> migraciones se apliquen contra el proyecto real, `0017` y `0031` fallan si
> alguna de las cuatro capas no está.
>
> **Se reabre** en el momento en que haya credenciales autorizadas, o en la
> ETAPA 15 al conectar el entorno definitivo.
>
> Firma: \***\*\*\*\*\***\_\_\***\*\*\*\*\*** Fecha: \***\*\_\_\_\_\*\***

### AR-04 · El ciclo de recuperación de contraseña, NO VERIFICABLE de punta a punta (BE-01)

> Acepto que el ciclo completo de recuperación de contraseña —envío del correo,
> apertura del enlace, redirección a la consola— quede **auditado como NO
> VERIFICABLE de punta a punta**, y no como «cumple».
>
> **Lo acepto porque** el SMTP y las URLs de redirección viven en el panel de
> Supabase y el proyecto no tiene permisos de administración concedidos; desde
> este entorno el correo no se puede enviar ni recibir.
>
> **Queda acotado** por lo que sí está verificado: el endpoint responde 204 sin
> revelar si la cuenta existe, está limitado a 5 por minuto, exige segundo
> factor donde corresponde y deja registro en `auditoria_seguridad`. Lo que no
> se puede afirmar es que el correo llegue y que su enlace vuelva a la consola.
>
> **Se reabre** en cuanto haya permisos en el panel.
>
> Firma: \***\*\*\*\*\***\_\_\***\*\*\*\*\*** Fecha: \***\*\_\_\_\_\*\***

---

## 8 · Qué queda en sus manos

1. **Firmar, o rechazar, las cuatro aceptaciones de riesgo de §7.** Rechazar
   cualquiera de ellas reabre el hallazgo correspondiente; no hay problema en
   eso, pero hay que decirlo para poder planificarlo.
2. **Decidir sobre las credenciales del proyecto Supabase real** (§4.2, D-09 y
   D-12). Ver la pregunta _a_ del informe de etapa.
3. **Comprobar en GitHub** si `secret scanning` y `push protection` están
   activados en el repositorio. Es un ajuste del servidor, no del árbol, y desde
   aquí no se ve. Con `push protection` activa, H-13-17 tendría además una
   barrera antes de que el objeto llegue al remoto.
4. **Revisar el `.DS_Store` retirado.** No contenía secretos, pero filtraba
   nombres de ficheros y disposición de carpetas de su máquina. Si le consta que
   alguna carpeta de trabajo tenía nombres sensibles, conviene saberlo.

---

## 9 · Reproducir esta auditoría

```bash
# 1 · Base de pruebas efímera (crea el clúster, no usa el del sistema)
eval "$(./scripts/base-de-pruebas.sh arrancar)"

# 2 · Esquema, semillas y suite de políticas, con el dueño NO superusuario
./supabase/verificar.sh --con-pruebas --modo-supabase

# 3 · Secretos: árbol, índice e historial
node scripts/lib/escanear-secretos.mjs
node scripts/lib/escanear-secretos.mjs --indice
node scripts/lib/escanear-secretos.mjs --historial

# 4 · Las suites de seguridad de la API
cd apps/api && npx vitest run \
  test/aislamiento.e2e.test.ts \
  test/escalamiento-de-privilegios.e2e.test.ts \
  test/cors-y-cabeceras.e2e.test.ts \
  test/saneamiento-entrada.e2e.test.ts \
  test/limite-de-peticiones.e2e.test.ts \
  test/fugas-por-registro.e2e.test.ts \
  test/xss.e2e.test.ts \
  test/ingesta.e2e.test.ts

# 5 · Dependencias
pnpm audit --prod

# 6 · Los controles, y la prueba de que detectan su violación
node scripts/lib/longitud-por-campo.mjs
node scripts/lib/pruebas-negativas.mjs
node scripts/lib/controles-sin-prueba-negativa.mjs

# 7 · El verificador entero
./scripts/verificar-etapa.sh --con-base
```
