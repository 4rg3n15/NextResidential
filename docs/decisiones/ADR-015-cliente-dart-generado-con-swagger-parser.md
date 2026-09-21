# ADR-015 · El cliente Dart se genera con `swagger_parser` + `retrofit`

**Fecha:** 2026-09-18 · **Estado:** aceptada · **Etapa:** 11-A

> Este ADR se prometió en un comentario de `apps/mobile/swagger_parser.yaml`
> («Registrado como ADR-015») y no se escribió hasta la 11-C. Un ADR citado que
> no existe es peor que ninguno: quien busque la justificación no la encuentra y
> concluye que la decisión se tomó sin ella.

## Contexto

§2.6 del contrato exige que el cliente Dart se **genere** desde OpenAPI y nunca
se escriba a mano, y el documento de requisitos lo señala con su motivo: Dart es
**el único componente que no comparte tipos con el resto del monorepo**. La
consola de Next.js importa los tipos que `openapi-typescript` produce
(ADR-007) y el compilador de TypeScript la obliga a estar al día; Dart no tiene
esa red. Si el cliente se escribe a mano, la app y la API se separan en silencio
y el primer aviso llega como un campo nulo en producción.

Queda por decidir **con qué** se genera.

## Decisión

**`swagger_parser`** para leer el contrato y emitir modelos y clientes, con
**`retrofit`** + **`json_serializable`** como destino, todo ejecutado por
`build_runner`. La configuración vive en `apps/mobile/swagger_parser.yaml` y
apunta a `packages/contracts/openapi.json`, que es el mismo artefacto del que
come la consola: **una sola fuente para los dos clientes**.

## Alternativas consideradas

**`openapi-generator` (el oficial).** Es el más completo y el que más gente usa,
y se descartó por dos razones concretas de este repositorio:

1. **Exige una JVM** y descarga su `.jar` en tiempo de construcción. Eso es una
   dependencia que no está en ningún lockfile, y §2.8.0 verifica la instalación
   con `--frozen-lockfile` precisamente para que una dependencia instalada a
   mano no pase inadvertida. Un generador que se baja solo rompe esa garantía.
2. **Obliga a instalar Java en el CI** para una tarea que no lo necesita de otro
   modo, y a fijar su versión, y a mantenerla.

`swagger_parser` es una dependencia de desarrollo más del `pubspec.lock`, con lo
que entra en la misma disciplina que todo lo demás.

**Escribirlo a mano.** Prohibido por §2.6, y con razón: es exactamente lo que el
documento de requisitos señala como el riesgo de Dart.

**`chopper` o `dio` a pelo como destino.** `retrofit` genera sobre `dio`, que ya
es la dependencia HTTP de la app —la misma que lleva el interceptor de sesión—,
así que no añade un segundo cliente HTTP al binario.

## Consecuencias

- **El contrato manda.** Cuando un DTO cambia en la API, el generador reescribe
  el cliente y **`repositorio_api.dart` deja de compilar**: un sitio, señalado
  por el compilador, en vez de catorce pantallas que fallan en ejecución.
- **El nombre de la clase ES el nombre del esquema.** Dos DTO homónimos en la
  API colapsan en un solo esquema de OpenAPI y el cliente generado describe la
  forma equivocada **sin dar ningún error**. Ocurrió (D-92) y lo encontró el
  compilador de Dart, no un control; desde entonces lo vigila
  `scripts/lib/esquemas-unicos.mjs`, que lee el **código fuente** y no el
  contrato, porque en el JSON la colisión ya ocurrió.
- **Lo generado se versiona.** Quien clone el repositorio compila sin ejecutar
  el generador, y un cliente desfasado se ve en el diff.
- **`contrato:desfasado`** comprueba que lo versionado corresponde a los
  controladores actuales.

## Verificación

```bash
pnpm contrato            # OpenAPI desde los controladores de NestJS
pnpm contrato:cliente    # cliente TypeScript
cd apps/mobile && dart run swagger_parser && dart run build_runner build --delete-conflicting-outputs
pnpm contrato:desfasado  # rompe si lo versionado no corresponde
```

## Contingencia

Si `swagger_parser` dejara de mantenerse o de cubrir una construcción del
contrato, la salida es cambiar de generador —no escribir el cliente a mano—. El
único código propio que toca los tipos generados es `repositorio_api.dart`, así
que la migración se mide en ese fichero y en ninguno más.
