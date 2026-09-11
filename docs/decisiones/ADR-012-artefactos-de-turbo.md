# ADR-012 · Cada tarea declara sus artefactos, incluidas las que no producen ninguno

**Fecha:** 2026-09-11 · **Estado:** aceptada · **Etapa:** 09-B

## Contexto

Cada compilación imprimía:

```
WARNING  no output files found for task @ncr/web#build. Please check your `outputs` key in `turbo.json`
```

`outputs` valía `["dist/**"]` para todas las tareas. Es correcto para la API y
los paquetes, que emiten en `dist/`, y **falso para la consola**: Next.js emite
en `.next/`. Turbo no encontraba nada que guardar, así que **nunca cacheaba esa
tarea**: cada compilación rehacía Next.js entera, en local y en CI.

El aviso llevaba tiempo ahí. Ese es el daño de fondo: un aviso permanente que
nadie puede arreglar enseña a leer las compilaciones sin mirarlas, y el
siguiente aviso —el que sí importe— pasará igual de desapercibido.

## Decisión

1. `build` declara `["dist/**", ".next/**", "!.next/cache/**"]`.
   Se excluye `.next/cache/**` a propósito: es caché de la propia herramienta,
   se regenera sola y guardarla engordaría el artefacto sin aportar nada.
2. **`@ncr/edge#build` declara `outputs: []`.** Su `build` es hoy un `echo`
   reservado para la ETAPA 12 y de verdad no produce nada. Sin esta línea, el
   aviso se limitaba a cambiar de destinatario. `[]` no es un apaño: dice
   «esta tarea no emite artefactos», que es exactamente el hecho.

## Consecuencias

- La consola se cachea: la segunda compilación sin cambios resuelve en `FULL
TURBO` en vez de rehacer Next.js.
- Ninguna compilación imprime avisos. Cuando aparezca uno, será nuevo y
  significará algo.
- Cualquier aplicación futura que emita fuera de `dist/` debe declararlo, o
  reaparecerá el mismo aviso — que ahora sí será señal.
