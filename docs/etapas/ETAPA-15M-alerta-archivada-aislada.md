# Corrección de la 15-M · La alerta archivada, contada donde nadie más escribe (H-15M-C01)

**Rama:** `etapa-15m-alerta-archivada-aislada` · **Base:** `develop` (`7b31083`, merge del PR #41) ·
**PR:** ninguno, no se pidió · **Fecha:** 2026-10-03 · **Corrige:** H-15M-C01 ·
**Corrige, fuera del encargo:** H-15M-C02 · **Abre:** DT-15M-C01

> **Esta corrección NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Sólo toca pruebas: ni una línea de producto, ni de migraciones, ni de guiones.

**Lo incómodo primero.**

1. **El encargo solo no bastaba para el «hecho».** El primer bucle sobre el código
   de `develop` —`tablero-pg` y `persistencia-operativa-pg` juntas, 150 veces—
   falló una vez, y no por la alerta: «un equipo dado de alta… aparece en
   Dispositivos» chocó con `dispositivos_endpoint_uk`. Cada corrida dejaba en
   COP_A dos equipos activos para siempre, y el host y el puerto salían del
   mismo número: 60 000 combinaciones, no 12 millones. En una base que acumula
   corridas el choque es cuestión de tiempo (≈ k/60 000 por corrida tras k
   corridas). Es el arreglo de la 15-K (`cea9121`), que redujo el choque sin
   eliminarlo. Se corrige aquí (H-15M-C02), en un commit aparte: «ninguna falla»
   no se podía cumplir sin él.
2. **La carrera del encargo es rara con dos ficheros, y hubo que forzarla para
   verla.** Cero fallos de la alerta en esas 150 corridas. Con un generador que
   abre y resuelve alertas en COP_A sin parar —lo que hace
   `persistencia-operativa-pg`, pero continuo—, la prueba original falló **17 de
   20**, en los dos sentidos: «expected 305 to be 306» (el del CI: una ajena se
   resolvió entre las dos lecturas) y «expected 308 to be 307» (una ajena se
   abrió). Con «≥» la segunda dirección habría pasado y la primera seguiría
   fallando: relajarla no la arreglaba ni demostraba nada.
3. **Aislar también escribe en un sitio compartido.** Cada alta de copropiedad
   toma un número de `pools_de_porteros_numero_seq` y añade una fila a la lista
   global, y dos suites miran justo eso mientras ésta corre:
   `porteros-por-identificador-pg` (L255, números de pool consecutivos) y
   `copropiedades-pg` (L74 y L122, la misma lista en dos lecturas). Ya lo hacían
   porteros (tres altas por corrida), `credencial-vuelve-a-la-nube-pg` y el
   montaje del DoD del puente (una cada una); esta corrección añade **una por
   corrida, no una por prueba**, a propósito. La ventana es de milisegundos y no
   es cero: quedan anotadas con su arreglo propuesto (§8).
4. **Hay once ficheros más con riesgos del mismo origen** —el estado compartido
   de COP_A o la historia de la base—, anotados y sin corregir, como pide el
   encargo (§8). Uno falla de forma **determinista** tras veinte corridas sin
   recrear la base: `persistencia-operativa-pg` busca su orden entre «las
   últimas 20» de COP_A y `salidas-del-videoportero-pg` deja una fechada en 2099
   en cada corrida, en una tabla que no admite `DELETE`. El verificador no lo ve
   porque su paso 12 recrea la base; una máquina que corre la suite a mano entre
   verificaciones, sí.
5. **Una corrida fallida de la prueba original dejaba basura.** La aserción
   cortaba antes de archivar, así que cada fallo dejaba una alerta pendiente para
   siempre en COP_A. Se vio en el bucle con ruido: el conteo subía uno por fallo.

---

## 1 · Qué se construyó

Un módulo de apoyo para las pruebas contra la base, `apps/api/test/copropiedad-propia.ts`,
que da a una corrida **su propia copropiedad**, con un administrador de verdad
de esa copropiedad, y un equipo suyo cuando hace falta. Nadie más escribe en
ella, así que lo que se cuente allí es exacto.

Con él, «una alerta archivada deja de contar como pendiente» ya no mide `antes + 1`
sobre las alertas de COP_A, que otras suites abren y resuelven a la vez: en su
copropiedad parte de **0**, sube a **1** al guardar la alerta y vuelve a **0** al
archivarla. Sigue demostrando lo que demostraba —quitar `AND archivada_en IS NULL`
de `conteosDeAlertas` la pone roja con «expected 1 to be +0»— y ya no depende de
lo que hagan los demás. Y «un equipo dado de alta… aparece en Dispositivos» da de
alta sus dos equipos en esa misma copropiedad, donde no hay equipos de corridas
anteriores con los que chocar.

## 2 · Cómo se organizó y por qué

**Una copropiedad propia, no «al menos».** La 15-K resolvió un caso parecido
—los accesos por hora— relajando a «≥», y allí era correcto: los eventos sólo se
añaden, así que el delta nunca baja de lo anexado. Las alertas no: otras suites
las **resuelven**, el conteo baja, y el fallo del CI fue justo ése (73 en vez de
74). Con «≥» la prueba seguiría fallando cuando una ajena se resuelve y dejaría
de demostrar que lo archivado no cuenta cuando una ajena se abre. Donde nadie más
escribe, la aserción deja de ser relativa: 0, 1, 0, exactos.

**El 0 inicial es un detector, no un adorno.** Si mañana algo escribiera alertas
en todas las copropiedades mientras corre la suite —el barrido de latidos abre
«equipo caído» en las que tienen equipos sin latido, y un equipo recién creado no
ha latido nunca—, la prueba fallaría en su primera línea y con nombre. Hoy no
pasa: `crearApp` arranca con `PLANIFICADOR_HABILITADO: false` y `EQUIPOS_LATIDO_S: 0`
(`apps/api/test/utilidades.ts`), y ninguna prueba barre todas las copropiedades.

**Un administrador DE ESA copropiedad.** La prueba de los equipos los daba de alta
con el administrador de COP_A. Reutilizarlo con otra copropiedad en los claims
habría funcionado —la RLS mira los claims, no el padrón— y habría sido mentira:
un usuario de COP_A actuando en otra. El módulo crea el usuario y su rol
`administrador` en la copropiedad nueva, y las dos pruebas operan con él por el
rol de la API, con la RLS forzada, como antes.

**El escenario lo monta el superusuario.** Crear copropiedad, usuario y rol es
preparar el terreno, no lo que se prueba; se hace como ya lo hacían
`porteros-por-identificador-pg`, `credencial-vuelve-a-la-nube-pg` y el montaje del
DoD del puente. Lo probado —tablero, alertas, equipos— sigue con `sb_postgres_sim`.

**Una por corrida, no una por prueba.** La primera versión creaba una copropiedad
en cada una de las dos pruebas. La auditoría de las demás suites (§8) encontró que
toda alta de copropiedad perturba a dos de ellas, y se pasó a una sola, compartida:
`copropiedadDeLaCorrida` crea la primera vez y reutiliza después. Las dos pruebas
no se pisan: una da de alta equipos, la otra cuenta alertas, y dar de alta un
equipo no abre ninguna.

**El NIT, al azar y con otra longitud.** `copropiedades_nit_uk` es único. Las
suites que ya creaban copropiedades lo derivan de la hora, con diez u once cifras;
éste tiene doce, la primera un 6 y las once siguientes al azar, así que no puede
coincidir con ninguno de ellos y entre corridas propias la probabilidad es
despreciable.

**Equipos con dirección fija.** Sin equipos previos en la copropiedad, el índice
único —por copropiedad, host y puerto— no tiene con qué chocar: los dos de la
prueba van a `198.51.100.10:80` y `.11:80`, y el de la alerta a `192.0.2.10:80`
(rangos de documentación, RFC 5737, que `frontera-hardware.mjs` admite). Desaparece
el puerto derivado de la corrida y su comentario, que ya no explicaban nada.

**Lo que no se tocó.** Las otras cuatro pruebas del fichero siguen en COP_A.
«Sin claims, la RLS devuelve cero filas» pedía además más de cero equipos con
claims; antes los ponía la primera prueba y ahora los pone la semilla, que trae
cuatro activos en COP_A: es más independiente que antes, no menos.

## 3 · Árbol de archivos

```
apps/api/test/
├─ copropiedad-propia.ts        nuevo · la copropiedad de la corrida, con su administrador, y un equipo suyo (137 líneas)
└─ tablero-pg.test.ts           las dos pruebas, en esa copropiedad; sin el puerto por corrida (338 → 333)
docs/
├─ etapas/ETAPA-15M-alerta-archivada-aislada.md   este informe
└─ ESTADO_ETAPAS.md             cabecera, defectos abiertos y ficha de la corrección
```

**Ningún fichero existente de código, pruebas o guiones crece** (S-193):
`tablero-pg.test.ts` adelgaza cinco líneas. El módulo nuevo tiene 137.

## 4 · Tabla SOLID

| Pieza                              | SRP                                                 | OCP                                                        | LSP                                    | ISP                                                       | DIP                                                   |
| ---------------------------------- | --------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------- |
| `copropiedadDeLaCorrida`           | Dar a una corrida su copropiedad y su administrador | Otra prueba que necesite una la pide; no se toca el módulo | —                                      | Devuelve sólo `id` y `ctx`                                | Recibe el `Pool`; no lee el entorno ni `base-exigida` |
| `equipoPropio`                     | Un equipo de esa copropiedad, por su administrador  | —                                                          | Sirve cualquier `RepositorioDeEquipos` | Pide sólo `crear` (`Pick<RepositorioDeEquipos, 'crear'>`) | El repositorio llega inyectado, con su llave          |
| `tablero-pg.test.ts` (dos pruebas) | Cada prueba sigue demostrando una sola cosa         | —                                                          | —                                      | —                                                         | —                                                     |

## 5 · Trazabilidad

No cambia la cobertura de requisitos: las dos pruebas demuestran lo mismo que
antes, sin depender de otras suites.

| Elemento                 | Qué toca                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| **W-02 · HU-32**         | Las alertas pendientes del tablero excluyen las archivadas (Otros fallos de la 15-M)        |
| **RN-19**                | El archivo de alertas es lógico: la fila queda y deja de contar                             |
| **HU-38 · W-07 · CA-26** | Un equipo dado de alta —también uno «decide solo»— aparece en Dispositivos (H-SITIO-02)     |
| **Contrato §2.8.0**      | Un resultado que no se reproduce: dos pruebas que dependían de la historia y de los vecinos |

## 6 · Pruebas

### Qué se probó y cómo

- **Vista fallar la aserción** (lo que pedía el encargo): sin `AND archivada_en IS NULL`
  en `conteosDeAlertas`, la prueba falla con «expected 1 to be +0»; con el código
  actual pasa. Repetido sobre la versión final.
- **La carrera, forzada.** Un generador de ruido (no versionado: es diagnóstico,
  no prueba) con tres bucles concurrentes que insertan en COP_A una alerta
  `acceso_dudoso` abierta, con `origen_texto`, y la pasan a `resuelta` tras 0–8 ms,
  sin parar (36 812 durante las 20 corridas de la original). Con él corriendo y
  sólo la prueba de la alerta: la original, **17 fallos de 20**, en los dos
  sentidos; la corregida, **0 de 40** y, en su versión final (una copropiedad por
  corrida), **0 de 30**.
- **El choque de H-15M-C02, determinista.** Con la corrida fijada a un mismo valor
  dos veces seguidas: el código anterior falla la segunda con
  `duplicate key value violates unique constraint "dispositivos_endpoint_uk"`; el
  nuevo pasa las dos.
- **Las dos suites juntas, muchas veces** (lo que pedía el encargo): «PENDIENTE: resultado del bucle de 300».
  Sobre el código de `develop`, 150 corridas dieron un fallo, el de H-15M-C02.
- **Una copropiedad por corrida:** 205 → 206 copropiedades tras una corrida de
  `tablero-pg`.

Cómo ejecutarlas: con `DATABASE_URL_PRUEBAS` apuntando a una base migrada y
sembrada (`./supabase/verificar.sh --con-semillas --modo-supabase`),
`pnpm --filter @ncr/api exec vitest run test/tablero-pg.test.ts test/persistencia-operativa-pg.test.ts`;
todo, con `./scripts/verificar-etapa.sh --con-base`.

### Veredicto literal de `./scripts/verificar-etapa.sh --con-base` (§2.8.0)

«PENDIENTE: veredicto del verificador.»

## 7 · Verificación de seguridad (§2.7)

| §2.7              | Qué hizo esta corrección                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Secretos      | Ninguno nuevo. La llave y las claves son las de prueba que ya usan las suites de equipos; correos `.invalid` (RFC 2606); escaneo limpio |
| 2 · CORS          | Sin cambios                                                                                                                             |
| 3 · Validación    | Sin cambios                                                                                                                             |
| 4 · Inyección     | Las tres altas del módulo, parametrizadas                                                                                               |
| 5 · Rate limiting | Sin cambios                                                                                                                             |
| 6 · RLS           | Se sigue ejerciendo igual: tablero, alertas y equipos con el rol de la API y la RLS forzada; sólo el escenario lo monta el superusuario |
| 7 · CSP           | Sin cambios                                                                                                                             |
| 8 · Transversales | IP de equipos sólo de los rangos de documentación (RFC 5737), como exige KPI-11                                                         |

## 8 · Deuda técnica, supuestos y pendientes

- **H-15M-C01 · CORREGIDO.** «Una alerta archivada deja de contar como pendiente»
  (`c998316`, 15-M) medía una diferencia sobre el conteo global de COP_A mientras
  otras suites abrían y resolvían alertas en ella. Ahora cuenta en su propia
  copropiedad: 0, 1, 0.
- **H-15M-C02 · CORREGIDO, fuera del encargo.** «Aparece en Dispositivos» (15-K)
  chocaba con `dispositivos_endpoint_uk` contra los equipos que corridas anteriores
  dejaron activos en COP_A. Ahora da de alta en la copropiedad de la corrida.
- **DT-15M-C01 · once ficheros contra la base dependen del estado compartido de
  COP_A o de la historia de la base.** Revisados los 38 que importan
  `base-exigida`, cada caso leído en el código. Ninguno se corrige aquí.

  **Con el mismo patrón** —diferencia o igualdad exacta sobre algo que otras
  suites cambian a la vez—:

  | Prueba                               | Qué mide                                                                                                | Quién lo mueve en paralelo                                                                                              | Riesgo                               |
  | ------------------------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
  | `edge-instantanea-pg.e2e` L95, L107  | «Sin cambios» con la misma versión, y «versión + 1»: la versión es el hash de TODAS las reglas de COP_A | Toda suite que toque vehículos, autorizaciones, listas negras o plantillas de COP_A                                     | Versión nueva antes de tiempo, o + 2 |
  | `generacion-padron` L133             | La fila `generacion_de_padron` más reciente de COP_A                                                    | `padron-edicion-pg` (L101, L105, L121): tres `confirmar` en COP_A con otro plan                                         | Lee la fila de la otra suite         |
  | `copropiedades-pg` L74, L122         | La lista de TODAS las copropiedades frente a una segunda lectura                                        | Toda alta de copropiedad: porteros (3 por corrida), credencial-vuelve, el montaje del DoD y, desde aquí, tablero-pg (1) | Bajo: la segunda lectura ve una más  |
  | `porteros-por-identificador-pg` L255 | Número de pool `+ 1` entre dos altas seguidas; sale de una secuencia global                             | La misma: cualquier alta de copropiedad entre las dos                                                                   | Bajo: salto de 2                     |

  Arreglo propuesto para las dos últimas, sin relajar lo que demuestran: leer la
  lista antes y después y exigir `antes ⊆ vista ⊆ después` (las copropiedades no
  se borran), y comprobar los pools por su forma —`inicio = n·1000 + 1`, sin
  solape, `b > a`— en vez de por números consecutivos.

  **Defendidas, con el razonamiento comprobado:** «los accesos por hora» de
  `tablero-pg` (15-K: «≥» sobre `eventos`, que es sólo de inserción; queda un
  riesgo bajo de frontera horaria —`horaLocal` se calcula después de anexar, y una
  medianoche entre las dos lecturas cambia el día—), `persistencia-operativa-pg`
  L230 (`> 0` sobre sus propias caídas), `eventos-pg` (cuenta por clave) y
  `biometria-pg` («≥» sobre filas propias).

  **Del mismo origen, con otro mecanismo:**

  | Prueba                                                                   | Mecanismo                                                                                                                                   | Riesgo                                                                       |
  | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
  | `persistencia-operativa-pg` L261-263                                     | Su orden entre «las últimas 20» de COP_A; `salidas-del-videoportero-pg` deja una fechada en 2099 por corrida, y la tabla no admite `DELETE` | **Determinista** tras 20 corridas sin recrear la base (el paso 12 la recrea) |
  | `ensayo-en-sitio-pg` L615                                                | Su orden «de ahora» entre las últimas que devuelve `/guardia/ordenes`                                                                       | Acumulativa, la misma causa                                                  |
  | `autorizaciones-pg` L182                                                 | Su autorización entre las 300 activas de inicio más reciente; otras suites dejan activas con inicio futuro                                  | Acumulativa (`[Probable]`: unas 25–30 corridas sin recrear la base)          |
  | `visitas-pg` L351, L396, L422 · `verificacion-remota-armada-pg` L278-282 | El barrido de `biometria-pg` (L347, reloj + 2 h) suprime las plantillas vencidas de TODA COP_A, también las suyas                           | Plantilla suprimida o retirada antes de tiempo                               |
  | `edge-misma-decision-pg.e2e` L197                                        | Compara Edge y nube en cada plantilla de una instantánea tomada antes; otras suites revocan o suprimen plantillas de COP_A                  | Discrepancia entre los dos lados                                             |
  | `baja-de-residente-pg` L121                                              | Inicia sesión con el código corto de COP_A, que `residentes-y-vehiculos-pg` cambia en cada corrida                                          | Bajo: 401                                                                    |

- **Riesgo residual de esta corrección.** La copropiedad propia vale mientras sólo
  la suite escriba en la base de pruebas. Una API de desarrollo conectada a esa
  misma base con el planificador encendido abriría «equipo caído» en ella; el 0
  inicial lo diría con nombre (§2).
- **Supuestos y contradicciones:** ninguno nuevo.

## 9 · Qué debe hacer el usuario manualmente

1. **Nada para que esto funcione.** Si su base de pruebas local lleva muchas
   corridas sin recrearse, `./supabase/verificar.sh --con-semillas --modo-supabase`
   la deja limpia: reinicia las ventanas acumulativas de DT-15M-C01 y se lleva los
   equipos y alertas que la prueba original dejó en COP_A.
2. **Decidir DT-15M-C01.** Las once quedan anotadas; la más urgente es
   `persistencia-operativa-pg` L261, que falla siempre tras veinte corridas sin
   recrear la base.

## 10 · Rama y commits

Rama `etapa-15m-alerta-archivada-aislada`, desde `develop` (`7b31083`). El entorno
proponía `claude/hopeful-keller-lnds0q`; desde el primer commit se trabajó en la
rama con nombre de etapa (§2.5).

| Commit          | Qué |
| --------------- | --- |
| _por completar_ |     |
