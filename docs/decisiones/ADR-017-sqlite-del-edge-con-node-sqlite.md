# ADR-017 · SQLite del Edge con `node:sqlite`, no con un módulo nativo

**Fecha:** 2026-09-20 · **Estado:** aceptada · **Etapa:** 12

## Contexto

El Edge Gateway necesita almacenamiento local duradero para dos cosas: la caché
de reglas versionada y la bandeja de salida. `CLAUDE.md` §2.6 fija SQLite; lo
que queda por decidir es **con qué biblioteca**.

El contexto que manda no es técnico sino de operación: esto corre en **un equipo
pequeño en la portería de una copropiedad**, al que se accede por red y que
actualiza alguien que no es el equipo de desarrollo.

## Decisión

**`node:sqlite`**, el módulo que trae el propio runtime desde Node 22.5,
aislado detrás de los puertos `CacheDeReglas` y `BandejaDeSalida`.

## Alternativas consideradas

**`better-sqlite3`.** Es mejor biblioteca —API más rica, más rápida, madura— y
se descartó por lo que arrastra en este despliegue concreto:

1. **Es un módulo nativo.** O se compila con `node-gyp` en el equipo —lo que
   obliga a instalar un compilador en una máquina de portería— o se publican
   binarios por arquitectura. Y son al menos dos: x64 y arm64, que es lo que
   lleva un mini-PC barato.
2. **Hay que rehacerlos en cada actualización de Node**, porque el ABI cambia.
3. Cada una de esas es una forma de que **una actualización remota deje un
   gateway sin arrancar**, y un gateway que no arranca es una puerta que no
   abre. La guía de despliegue (§6) actualiza por fases justamente porque ese
   riesgo existe; no hacía falta añadirle uno evitable.

**`sql.js` (SQLite compilado a WebAssembly).** Sin binarios nativos, y
descartada por lo contrario: mantiene la base **en memoria** y hay que
persistirla a mano. La bandeja del Edge existe precisamente para sobrevivir a un
corte de luz; una base que se serializa cuando alguien se acuerda es la forma más
directa de perder los accesos de un corte.

**Un fichero de texto con una línea por evento.** Sería suficiente para la
bandeja y no para la caché, y no da la garantía que aquí importa:
`clave_idempotencia` como CLAVE PRIMARIA hace que encolar dos veces el mismo
hecho deje **una** fila, y lo impide la base y no un `if`. Es ADR-04 aplicado al
Edge.

## Consecuencias

- **Cero dependencias nativas.** Se despliega copiando ficheros. No hay
  `node-gyp`, ni compilador, ni binarios por arquitectura.
- **La versión de Node pasa a ser un requisito duro** del equipo, y está en
  `.nvmrc` y en la guía. §2.8.0 ya verifica el runtime, así que no es una
  restricción nueva: es una que ahora también aplica en la portería.
- **`node:sqlite` está marcado experimental.** Emite un aviso al cargar y su API
  puede cambiar. Por eso vive detrás de los puertos: sustituirlo es reescribir
  `infraestructura/sqlite/` y nada más — dos adaptadores y el fichero que lo
  carga.
- **No se importa con `import`.** `node:sqlite` es un módulo «solo con prefijo»:
  `isBuiltin('node:sqlite')` es `true` pero no aparece en `builtinModules`, y
  los empaquetadores deciden si algo es interno mirando esa lista tras quitar el
  `node:`. Vite lo intenta resolver como un paquete llamado `sqlite` y **el
  fichero de pruebas entero no llega a cargarse**: la suite informa «0 test»,
  que es peor que un rojo porque parece que no había nada que probar. Se carga
  con `process.getBuiltinModule('node:sqlite')`, que no deja ningún
  especificador que resolver, y los tipos siguen siendo los reales. Todo eso
  vive en `infraestructura/sqlite/motor.ts`, con el motivo escrito.

## Verificación

```bash
pnpm --filter @ncr/edge test          # 101 pruebas, SQLite real en memoria y en fichero
node -e "process.getBuiltinModule('node:sqlite')"   # existe en el runtime declarado
```

`apps/edge/src/infraestructura/sqlite/adaptadores.test.ts` ejerce los dos
adaptadores contra una base de verdad, incluida la supervivencia al reinicio
—dos objetos sobre el mismo fichero—, que es la garantía por la que se eligió
SQLite y no memoria.

## Contingencia

Si `node:sqlite` cambiara de API de forma incompatible o se retirara, la salida
es **un adaptador nuevo detrás de los mismos puertos**, con `better-sqlite3` y
binarios por arquitectura publicados en la distribución del gateway. Ni el
dominio, ni la aplicación, ni las pruebas de la DoD cambian: solo
`infraestructura/sqlite/`.
