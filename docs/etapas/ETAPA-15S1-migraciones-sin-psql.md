# Corrección de la 15-S1 · la 0052 y la 0053, aplicables con `supabase db push` (H-15S1-C06)

**Rama:** `etapa-15s1-migraciones-sin-psql` · **Base:** `develop` (`967e1f9`) · **Fecha:** 2026-10-06
**Abre:** H-15S1-C06 · **Cierra:** H-15S1-C06

> Esta corrección **no** cierra la ETAPA 15, que sigue bloqueada sólo por `BE-02`.

## 1 · Qué se construyó

Nada de producto. La víspera de la visita, al aplicar a la base real las migraciones
0047 a 0054, `supabase db push` aplicó de la 0047 a la 0051 y se detuvo en la 0052 con
`ERROR: syntax error at or near "\" (SQLSTATE 42601)`. La 0052 (avisos Web Push, 15-R)
y la 0053 (modo de puerta, 15-R) llevaban la línea `\set ON_ERROR_STOP on`, que es una
orden del cliente `psql` y no SQL. Se retira de las dos y se añade un control que la
rechaza en cualquier migración futura.

## 2 · Cómo se organizó y por qué

- **Por qué el CI estaba en verde.** `supabase/verificar.sh` aplica cada migración con
  `psql -f`, y `psql` ejecuta sus propias órdenes antes de mandar el SQL. `supabase db
push` manda el texto al servidor, que no las conoce. El banco y el despliegue no
  ejecutaban lo mismo: es la familia de falsos verdes que §2.8.0 persigue.
- **Retirar, no sustituir.** El verificador ya llama a `psql` con `-v ON_ERROR_STOP=1`,
  y la CLI de Supabase se detiene en el primer error. La línea no aportaba nada en
  ningún camino.
- **Editar dos migraciones (excepción a D-10).** D-10 dice que las migraciones son
  historia y no se editan, porque una base ya migrada quedaría con otra versión. Aquí
  no hay tal base: en la real, la 0052 falló en su primera sentencia y la 0053 no llegó
  a ejecutarse; la del CI se recrea en cada corrida. Una migración nueva que «arreglara»
  la 0052 no serviría: la cadena seguiría rota en la 0052.
- **El control lee el SQL versionado**, como `frontera-append-only.mjs`: avisa cuando
  alguien escribe la línea, no cuando un despliegue falla. Reconoce la orden como
  `psql`: una `\` fuera de un comentario, una cadena (también `E'…'`), un
  identificador entre comillas o un cuerpo `$…$`, **también a mitad de línea**
  (`SELECT 1; \set …`, que psql admite). La primera versión sólo miraba el principio
  de la línea y dejaba pasar esa forma (revisión de Codex en el PR #49; comprobado:
  la versión anterior da 0 sobre ella, la nueva la señala). Buscar cualquier `\`
  no valía: los CHECK reales llevan `'[\x00-\x1F]'`.

- **Dos avisos de dependencias, en el mismo PR.** La CI del PR cayó en `pnpm audit
--prod --audit-level=high` por dos avisos publicados después del último verde de
  `develop`: **crítico** `proxy-addr` < 2.0.8 (GHSA-jqcg-44mw-7w3h; lo usa `express`
  para `API_PROXIES_DE_CONFIANZA`, de lo que depende la lista blanca de porteros) y
  **alto** `source-map-js` < 1.2.2 (GHSA-68fv-2mgg-jv7q; `postcss` de la consola). No
  son de este cambio, pero rompen todo PR y `develop` en su siguiente corrida. Se
  acotan en `pnpm.overrides` con `^`, como H-13-26. `pnpm audit --prod` → 0; las 86
  pruebas de IP, proxies y porteros de la API, en verde; API y consola compilan.

## 3 · Árbol de archivos

| Fichero                                                              | Propósito                                                        |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `supabase/migrations/20261004130000_0052_suscripciones_web_push.sql` | Sin `\set ON_ERROR_STOP on`                                      |
| `supabase/migrations/20261004140000_0053_modo_de_puerta.sql`         | Sin `\set ON_ERROR_STOP on`                                      |
| `scripts/lib/migraciones-sin-psql.mjs`                               | Control nuevo: ninguna migración lleva órdenes de psql           |
| `scripts/verificar-etapa.sh`                                         | Lo ejecuta en el paso 10                                         |
| `scripts/lib/pruebas-negativas.mjs`                                  | Sonda 5 bis: lo ve fallar                                        |
| `scripts/lib/ramas-de-los-controles.json`                            | Línea base de ramas del control nuevo (0 sin ejercer)            |
| `package.json`, `pnpm-lock.yaml`                                     | `proxy-addr` ^2.0.8 y `source-map-js` ^1.2.2 en `pnpm.overrides` |
| `docs/ESTADO_ETAPAS.md`                                              | Cabecera y ficha                                                 |

## 4 · Tabla SOLID

| Principio | Justificación                                                         |
| --------- | --------------------------------------------------------------------- |
| SRP       | El control hace una sola comprobación; no toca el de claves ajenas    |
| OCP       | Se añade como un control más del paso 10, sin cambiar los existentes  |
| LSP       | No aplica: no hay sustitución de implementaciones                     |
| ISP       | No aplica: no hay puertos                                             |
| DIP       | No aplica: guion de verificación, fuera de `domain/` y `application/` |

## 5 · Trazabilidad

KPI-11 y el resto no cambian. Afecta a la entrega de RN-08 y P-25 (0053, modo de puerta)
y de ADR-036 (0052, Web Push) en la base real: sin esta corrección, ninguna de las dos
existía en ella.

## 6 · Pruebas

- `node scripts/lib/migraciones-sin-psql.mjs` sobre `develop` (sin la corrección) →
  código 1, `0052…:27` y `0053…:20`. Con la corrección → «54 fichero(s), todas
  aplicables con supabase db push».
- `node scripts/lib/pruebas-negativas.mjs` → «los 35 controles detectan su violación y
  aceptan el caso legítimo»; la sonda 5 bis pasa en sus dos sentidos.
- `controles-sin-prueba-negativa.mjs` → 43 de 45; `ramas-de-los-controles.mjs` → 42
  controles, 257 bloques sin ejercer (no sube).
- **Veredicto de §2.8.0:** el verificador completo con base no se ejecutó en este
  entorno; lo ejecuta el CI del PR (`verificar-etapa.sh --con-base (macos)`). El cierre
  queda condicionado a ese verde.

## 7 · Seguridad

Sin cambios en RLS, permisos ni secretos. La 0052 y la 0053 aplican exactamente las
mismas sentencias que antes.

## 8 · Deuda, supuestos y pendientes

Ninguno nuevo. `[SUPUESTO]` implícito y comprobado contra el error del usuario: la CLI
aborta la migración en su primera sentencia, así que la 0052 no quedó a medias.

## 9 · Qué debe hacer el usuario

1. Con esta rama (o `develop` tras fusionar), `supabase db push`: debe ofrecer la 0052,
   la 0053 y la 0054, y aplicarlas.
2. `supabase migration list`: la 0047 a la 0054 en las dos columnas.
3. Reiniciar la API.

## 10 · Rama y commits

`etapa-15s1-migraciones-sin-psql` · `fix(etapa-15s1/migraciones): …` y el cierre.
