/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H-SITIO-06 (ANEXO 15-K) · SIN METADATOS DE TIPOS, LA API NO ARRANCA
 *
 * `start:dev` corría con `tsx`, que compila con esbuild y no emite
 * `design:paramtypes`. La 15-K arregló la mitad visible —la inyección por tipo
 * que tumbaba el arranque— con `@Inject` explícito. La otra mitad era
 * silenciosa: el `ValidationPipe` global conoce el DTO de cada `@Body()` y
 * `@Query()` por esos mismos metadatos, y sin ellos NO VALIDA NADA —ni
 * `whitelist`, ni `forbidNonWhitelisted`, ni la conversión de tipos—. Se vio
 * en el recorrido de la consola: con tsx, el historial de eventos contestaba
 * 400 porque `tamanoPagina` llegaba como texto al dominio.
 *
 * Validar en el servidor es §2.7.3, no una opción del modo de desarrollo: sin
 * metadatos el proceso se niega a arrancar, igual que sin una variable de
 * entorno. `start:dev` compila con `tsc`, que sí los emite.
 * ═════════════════════════════════════════════════════════════════════════════
 */

/** Un decorador cualquiera basta para que el compilador emita los metadatos. */
const marcar: ClassDecorator = () => undefined;

class Dependencia {}

@marcar
class SondaDeMetadatos {
  constructor(readonly dependencia: Dependencia) {}
}

export const MOTIVO_SIN_METADATOS =
  'este arranque no emite metadatos de tipos (¿tsx o esbuild?): el ValidationPipe no ' +
  'validaría ningún DTO (§2.7.3) y la API se niega a arrancar. Use `start:dev` (compila ' +
  'con tsc) o `build` + `start` (H-SITIO-06)';

/** ¿Emitió el compilador `design:paramtypes`? Con tsc o SWC sí; con esbuild, no. */
export const emiteMetadatosDeTipos = (clase: object = SondaDeMetadatos): boolean =>
  Reflect.getMetadata('design:paramtypes', clase) !== undefined;
