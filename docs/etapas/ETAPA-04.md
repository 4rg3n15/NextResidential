# ETAPA 04 — Padrón: viviendas, residentes, vehículos

**Rama `etapa-04-padron` · desde `develop` actualizado · 2026-09-07**

## 1. Qué se construyó

El padrón (OE-01): el agregado `Vivienda` con sus residentes y vehículos, el objeto de valor `Placa` normalizado al construirse, los casos de uso de alta y baja, el **primer adaptador PostgreSQL real** del proyecto, y la carga transaccional desde archivo.

La pieza que justifica la etapa es la prueba de KPI-03: **100 inserciones concurrentes reales a través del caso de uso**, contra una base de verdad, con 1 aceptada y 99 rechazadas. Hasta ahora esa garantía se había probado en SQL crudo; ahora se prueba por el camino que usará la aplicación.

## 2. Cómo se organizó y por qué

**La placa se normaliza en el objeto de valor, no en el DTO ni en el controlador.** Es la decisión de la que depende todo lo demás. Una placa que viaja como `string` llega escrita de cinco formas —`abc-123`, `ABC 123`, `ＡＢＣ１２３`— y entonces el índice único deja de proteger: para PostgreSQL son filas distintas; para el portero, el mismo coche. Con un único punto de entrada (`Placa.crear`) la forma normalizada es exactamente la que exige el `CHECK` de la migración 0005, así que dominio y base no pueden discrepar.

**Y normaliza rechazando, no limpiando.** Se eliminan separadores conocidos (espacio, guion, punto); cualquier otro carácter **falla**. Borrar lo desconocido convertiría `ABC12Ω3` en una placa válida distinta, que es peor que rechazarla.

**El adaptador no hace `SELECT` previo antes de insertar.** Inserta y deja que el índice único parcial decida, traduciendo el `23505` a un valor de negocio. Un `SELECT`-luego-`INSERT` es correcto en pruebas secuenciales y falso bajo concurrencia: entre las dos sentencias caben otras cien. Es ADR-04 llevado al código, y es lo que hace que KPI-03 sea alcanzable.

**La comprobación de placa repetida que sí hay en el agregado es conveniencia, no garantía**, y el comentario lo dice: solo ve los vehículos ya cargados en memoria y dos peticiones simultáneas la superan las dos. Está para dar un error legible y ahorrar un viaje, no para sostener RN-04.

**No existe `DELETE` en el adaptador, y no es un olvido.** La migración 0015 lo revoca a todos los roles, así que escribirlo produciría un fallo de permisos en vez de un borrado. Las bajas son `UPDATE` con motivo, actor y fecha. Una prueba lee el fichero fuente y falla si aparece un `DELETE` o un `TRUNCATE`.

**La carga de archivo valida todas las filas antes de escribir ninguna, y aborta entera si una falla.** Una carga parcial es peor que ninguna: el administrador no sabe qué entró y reintentar duplica lo que sí pasó. El caso de uso trabaja sobre **filas ya extraídas**, no sobre bytes: el analizador es un adaptador, y por eso añadir XLSX no toca la lógica.

**`Aislamiento` se hizo global.** Todo módulo con recursos de tenant lo necesita, y obligar a cada uno a reprovisionarlo abre la puerta a que alguno se lo salte. La barrera del riesgo número uno no debe depender de que cada módulo se acuerde de importarla.

**Un `Pool` por proceso.** Abrir una conexión por petición agotaría el límite del pooler de Supabase en cuanto haya carga.

## 3. Árbol de archivos

| Archivo                                            | Propósito                                                             |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| `domain-core/src/padron/placa.ts`                  | VO `Placa`: normaliza al construir, rechaza lo que no reconoce        |
| `domain-core/src/padron/vivienda.ts`               | Agregado raíz con métodos de intención; RN-13, RN-19, KPI-01          |
| `api/src/padron/aplicacion/puertos.ts`             | `RepositorioPadron`; el choque de placa es un valor, no una excepción |
| `api/src/padron/aplicacion/casos-de-uso.ts`        | `RegistrarVehiculo`, `DesactivarVehiculo`, `DesactivarVivienda`       |
| `api/src/padron/aplicacion/carga-padron.ts`        | Carga todo-o-nada + analizador CSV sin dependencias                   |
| `api/src/padron/infraestructura/repositorio-pg.ts` | Adaptador PostgreSQL; sin `SELECT` previo, sin `DELETE`               |
| `api/src/padron/presentacion/`                     | Controlador y DTOs; traduce errores tipados a códigos HTTP            |
| `api/src/padron/padron.module.ts`                  | `Pool` por proceso; cableado del puerto                               |
| `api/src/multiempresa/multiempresa.module.ts`      | `Aislamiento` global                                                  |
| `api/test/concurrencia-padron.test.ts`             | **KPI-03**: 100 conexiones reales; y RN-19 por inspección del fuente  |

## 4. Cumplimiento SOLID

| Principio | Materialización                                                                                          | Verificación           |
| --------- | -------------------------------------------------------------------------------------------------------- | ---------------------- |
| **SRP**   | `Placa` normaliza, `Vivienda` sostiene invariantes, el adaptador traduce SQL; ninguno pasa de 300 líneas | `wc -l`                |
| **OCP**   | XLSX entra como otro analizador que produce `FilaPadron[]`; la carga no cambia                           | Diseño del puerto      |
| **LSP**   | La suite de carga corre con un repositorio doble; la de concurrencia con el real, sin cambiar aserciones | 2 suites, mismo puerto |
| **ISP**   | `RepositorioPadron` expone lo que el padrón usa, no un CRUD genérico                                     | Lectura                |
| **DIP**   | El caso de uso recibe el puerto por constructor; el módulo decide el adaptador                           | `padron.module.ts`     |

## 5. Trazabilidad

**Cubierto:** OE-01 · RN-04, RN-05, RN-13, RN-19 · CA-02, CA-03 · CP-01 · KPI-01, KPI-02, KPI-03, KPI-04, KPI-05 · HU-01, HU-02, HU-03 (carga CSV), HU-05, HU-06.

**Parcial, con motivo:**

- **HU-03 / XLSX** — se entrega CSV. El analizador binario es superficie de ataque y merece su propia revisión junto con la validación por tipo real (§2.7.8); entra en la ETAPA 09 con la interfaz de carga. El puerto ya lo admite sin cambios.
- **HU-04 (editar vivienda)** — la baja y el alta están; la edición de atributos llega con la consola (ETAPA 09), que es donde se define qué campos son editables.
- **RN-04** — el índice de la ETAPA 01 es `(copropiedad_id, placa)`, es decir **una placa activa por copropiedad**, que es más estricto que «por vivienda» y por tanto lo satisface. Se deja anotado porque los dos textos difieren.

## 6. Pruebas

**51 en la API + 33 en el dominio.**

- `placa.test.ts` — siete escrituras equivalentes colapsan a una; NFKC; la forma normalizada satisface el `CHECK`; rechaza homoglifos y caracteres extraños en vez de limpiarlos.
- `vivienda.test.ts` — baja lógica con motivo obligatorio, RN-13, un solo titular, KPI-01, y que una placa vuelve a admitirse tras la baja.
- `carga-padron.test.ts` — **una fila inválida impide que se escriba la fila válida anterior**; un choque a mitad aborta la carga; el CSV entrecomillado no se parte mal.
- `concurrencia-padron.test.ts` — **KPI-03 con base real**: `intentos: 100 · aceptados: 1 · rechazados: 99 · filas activas: 1`. Y RN-19 por inspección del fuente del adaptador.

**Cómo ejecutarlas.** `pnpm --filter @ncr/api test` corre todo; la de concurrencia se **omite avisando** si no hay base. Para ejecutarla de verdad: levantar PostgreSQL, `./supabase/verificar.sh --con-semillas --modo-supabase`, y exportar `DATABASE_URL_PRUEBAS`.

**Mutación:** introducir un `DELETE` en el adaptador hace fallar la prueba de RN-19; desactivar la barrera de aislamiento hace fallar la suite multiempresa. Las dos se comprobaron.

**Cobertura — cifras recalculadas sin shell (2026-09-07).**

### Corrección del 2026-09-07 · el informe reportó 51 verdes y en el entorno del usuario fallaron 3

El fallo era real y reproducible una vez entendido: `packages/domain-core/dist` está en `.gitignore`, así que cada checkout tiene el suyo, y `pnpm --filter @ncr/api test` **no dispara `turbo`**, por lo que no reconstruye el dominio. En este entorno el `dist` se había reconstruido durante el trabajo; en el del usuario era de la ETAPA 03 y no contenía los reexports del padrón. `Placa` llegaba `undefined` —no «módulo no encontrado»— así que fallaban exactamente las tres pruebas que la usan y pasaban las otras 48.

No hubo dependencia circular: se descartó reproduciendo el fallo con un `dist` construido a partir del `index.ts` de la etapa anterior.

**Corrección:** las pruebas de la API resuelven `@ncr/domain-core` a su **código fuente** mediante un alias de Vitest. Comprobado que con esa resolución la suite da 51 verdes **incluso con el `dist` obsoleto**: ya no existe artefacto intermedio que pueda envejecer.

**Y una comprobación de honestidad:** `scripts/verificar-etapa.sh`, tal como se escribió primero, **no** habría detectado este fallo, porque borra y reconstruye `dist`. Se verificó ejecutándolo con el defecto presente: pasaba. Por eso se le añadió el control que sí cubre esta familia —recuento de ficheros de prueba ejecutados frente a los que hay en disco—, sometido a mutación: con un fichero que no carga, informa «solo 8 de 14» y falla.

## 7. Verificación de seguridad (§2.7)

| #   | Medida                                    | Estado                                                                                                    |
| --- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | Sin secretos                              | ✅ escaneo limpio                                                                                         |
| 3   | Validación en backend                     | ✅ DTOs con `class-validator`; el DTO valida forma, el VO y el agregado validan verdad                    |
| 4   | Anti inyección SQL                        | ✅ **todas** las consultas parametrizadas; cero concatenación. La placa se normaliza antes de persistirse |
| 6   | Aislamiento                               | ✅ cada endpoint llama a `exigirAlcance`; la suite los recorrió automáticamente                           |
| 8   | Auditoría append-only, sin borrado físico | ✅ el adaptador no tiene `DELETE`; probado por inspección                                                 |

El CSV se limita en tamaño y rechaza bytes nulos en el DTO.

## 8. Deuda técnica y supuestos

| ID              | Detalle                                                                                                                                                                              | Se salda en                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| D-20t           | XLSX pendiente; solo CSV                                                                                                                                                             | ETAPA 09                                      |
| D-21t           | El `Pool` recibe claims vacíos: el contexto por petición aún no viaja al repositorio, así que las escrituras se apoyan en la validación de aplicación y no en la RLS de esa conexión | ETAPA 06, con proveedor de ámbito de petición |
| D-22t           | La prueba de concurrencia se omite sin base local. **Debe correr en CI**                                                                                                             | **ETAPA 14 — requisito registrado**           |
| D-23t           | Editar vivienda (HU-04) sin caso de uso                                                                                                                                              | ETAPA 09                                      |
| [SUPUESTO] S-15 | Un solo titular activo por vivienda. El documento no lo dice; se deduce de que CU-01 pregunta «al residente» en singular                                                             | Confirmar con el cliente                      |

## 9. Qué debe hacer el usuario

1. `pnpm install` (tras el pull; el fallo de `unplugin-swc` fue `node_modules` desactualizado, no una dependencia sin declarar).
2. `pnpm --filter @ncr/api test` → 51 verdes, con la de concurrencia omitida y avisando.
3. Para ejecutar KPI-03 contra su proyecto: exportar `DATABASE_URL_PRUEBAS` con el usuario `app_api` y correr `pnpm --filter @ncr/api exec vitest run test/concurrencia-padron.test.ts`. **Creará y dejará una fila de vehículo de prueba.**
4. Confirmar S-15 (un titular por vivienda).
5. Pendiente de la 01: el `UPDATE` sobre un evento real.

## 10. Rama y commits

Rama `etapa-04-padron`, desde `develop` actualizado. Commit `etapa4 esquemas`.

---

# Adenda 2 · Cierre verificado de la ETAPA 04

**2026-09-07 · sin avance de etapa**

## E.1 · Métricas recalculadas sin shell

La cifra «8 de 14» del cierre anterior salió de un **error de conteo en shell**: el `grep` capturaba solo el primer número de «1 failed | 4 passed (5)». Como ese mismo shell midió el resto del cierre, todo se recalculó con `scripts/lib/metricas.mjs`, que lee el **informe JSON del ejecutor** en vez de raspar la consola.

**Desglose del «33 + 51» — ahora 33 + 61 = 94 pruebas en 15 ficheros:**

| Fichero                                                     | Pruebas         |
| ----------------------------------------------------------- | --------------- |
| `packages/domain-core/src/compartido/resultado.test.ts`     | 6               |
| `packages/domain-core/src/compartido/errores.test.ts`       | 3               |
| `packages/domain-core/src/eventos/bus-en-memoria.test.ts`   | 3               |
| `packages/domain-core/src/politicas/idempotencia.test.ts`   | 4               |
| `packages/domain-core/src/tokens.test.ts`                   | 3               |
| `packages/domain-core/src/padron/placa.test.ts`             | 7               |
| `packages/domain-core/src/padron/vivienda.test.ts`          | 7               |
| `apps/api/src/configuracion/esquema.test.ts`                | 4               |
| `apps/api/src/comun/bitacora/bitacora-estructurada.test.ts` | 4               |
| `apps/api/src/autenticacion/dominio/mfa.test.ts`            | 4               |
| `apps/api/src/padron/aplicacion/carga-padron.test.ts`       | 8               |
| `apps/api/src/padron/aplicacion/casos-de-uso.test.ts`       | **10 (nuevas)** |
| `apps/api/test/aislamiento.e2e.test.ts`                     | 13              |
| `apps/api/test/autenticacion.e2e.test.ts`                   | 16              |
| `apps/api/test/concurrencia-padron.test.ts`                 | 2               |

**Cobertura por capa (§2.4), medida por primera vez como el contrato la exige:**

| Capa                                 | Líneas      | Ramas   | Funciones | Umbral |
| ------------------------------------ | ----------- | ------- | --------- | ------ |
| Dominio (`packages/domain-core/src`) | **97,09 %** | 98,90 % | 90,91 %   | 90 %   |
| **Aplicación** (`**/aplicacion/**`)  | **99,11 %** | 92,31 % | 100 %     | 90 %   |
| Global                               | **74,91 %** | 88,28 % | 83,33 %   | 70 %   |

### Qué estaba mal en las cifras anteriores

**Una cifra incompleta y un incumplimiento que nadie había medido.**

- El informe decía «cobertura del dominio: 99,15 %». Ese número era el de Vitest **con sus exclusiones** (interfaces puras, que no compilan a código ejecutable). Medido sin exclusiones sobre todos los archivos del dominio, es **97,09 %**. Ninguno de los dos es falso; miden conjuntos distintos, y el informe no decía cuál.
- **Lo serio:** §2.4 exige 90 % en dominio **y en aplicación**, y la capa de aplicación **nunca se midió**. Estaba en **79,11 %**, por debajo del umbral del contrato, con `casos-de-uso.ts` al 48 % —los caminos de error no se probaban—. Se añadieron 10 pruebas y quedó en 99,11 %. El umbral se comprueba ahora por capa en cada cierre.

## E.2 · Auditoría de portabilidad ampliada a cuatro superficies

`portabilidad.mjs` solo miraba `.sh`. Ahora audita también los `scripts` de cada `package.json`, los ganchos de `.husky/`, los bloques `run:` de los flujos —incluidos los `run: |` multilínea— y el `Makefile` si aparece. **Prueba de mutación:** una divergencia inyectada por superficie, las cuatro detectadas con fichero y línea.

## E.3 · La versión del runtime, declarada y comprobada

Mover la verificación a Node cierra la divergencia BSD/GNU y abre otra: el resultado depende de la versión de Node. La diferencia es que esta **sí está declarada**, y ahora también comprobada: `.nvmrc` (22.22.2), `engines` (`node >=22.11.0 <23`, `pnpm >=9.15.0 <10`), y `verificar-entorno.mjs` como paso 1 del DoD y del CI. Probado por mutación: con `engines.node: ">=99"` la verificación se detiene.

## E.4 · Pruebas negativas automatizadas

Las tres que se ejecutaban a mano —más una cuarta— viven en `scripts/lib/pruebas-negativas.mjs`, en el DoD y en `.github/workflows/verificacion.yml`, que corre en **Linux y macOS** a propósito:

```
▸ 1 · un secreto sintético bloquea el escaneo            ✓ detectado
▸ 2 · una construcción BSD/GNU divergente rompe          ✓ detectada
▸ 3 · un fichero de prueba no recogido dispara el paso   ✓ detectado
▸ 4 · un Node fuera de `engines` detiene la verificación ✓ detectado
```

Cada sonda revierte su cambio en `finally` y se comprueba que el árbol queda limpio: una prueba negativa que deje residuos es peor que no tenerla. El secreto es **sintético** y su fichero se borra sin llegar nunca al índice.

El flujo de CI completo —build de las cuatro aplicaciones, PWA, escritorio— sigue siendo la ETAPA 14. Este se adelanta porque cubre lo que no puede esperar: que los controles sigan detectando.

## E.5 · DoD original, ejecutado

| DoD                                                     | Origen                    | Resultado                                                          |
| ------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------ |
| 100 inserciones concurrentes, 0 duplicados              | ETAPA 04, KPI-03 / ADR-04 | `intentos: 100 · aceptados: 1 · rechazados: 99 · filas activas: 1` |
| Suite de aislamiento multiempresa                       | ETAPA 03                  | 13 pruebas verdes                                                  |
| Importar infraestructura desde `domain/` rompe el build | ETAPA 02                  | 6 violaciones inyectadas, 6 rechazadas                             |
| La app no arranca sin `.env` completo                   | ETAPA 02                  | Abortada con `EX_CONFIG` (78), sin filtrar valores                 |
| Esquema y RLS en `--modo-supabase`                      | ETAPA 01                  | 18/18 migraciones, 4 pruebas SQL, KPI-03 en base                   |

La de concurrencia se ejecutó **a través del caso de uso** contra PostgreSQL real, no contra un doble.

## E.6 · Veredicto de §2.8.0

```
✓ entorno: Node 22.22.2 y pnpm dentro de engines · .nvmrc 22.22.2
✓ pnpm install --frozen-lockfile      ✓ build desde cero
✓ lint   ✓ typecheck
✓ 33 + 61 pruebas verdes              ✓ 15 de 15 ficheros recogidos
✓ dominio 97,09 % · aplicación 99,11 % · global 74,91 %
✓ portabilidad: 14 superficies        ✓ 4 controles detectan su violación
✓ fronteras   ✓ sin secretos
VERIFICACIÓN DE ETAPA: correcta
```
