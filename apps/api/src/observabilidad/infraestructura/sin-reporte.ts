import type { ReporteDeErrores } from '../aplicacion/puertos';

/**
 * Sin `SENTRY_DSN` no hay agregador, y eso es un despliegue legítimo —el de
 * desarrollo y el de CI lo son—. Lo que NO es legítimo es que el código tenga
 * que preguntar si hay reporte antes de reportar: el `if` se escribe una vez
 * aquí y no en cada punto de captura (patrón de objeto nulo).
 */
export class SinReporteDeErrores implements ReporteDeErrores {
  capturar(): void {
    /* no hay a dónde enviarlo, y no pasa nada: el log estructurado queda */
  }
}
