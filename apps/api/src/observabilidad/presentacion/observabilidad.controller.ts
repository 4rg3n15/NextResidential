import { Controller, Get, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles, SinRecursoDeTenant } from '../../comun/decoradores';
import { METRICAS } from '../aplicacion/puertos';
import type { Metricas } from '../aplicacion/puertos';
import { LatenciasDto } from './respuestas';

/**
 * El tablero de latencias comprometidas (RNF-11.3, ETAPA 14).
 *
 * **`@SinRecursoDeTenant()` y es correcto**: esto no expone ni un dato de
 * ninguna copropiedad. Son tiempos agregados del proceso —cuántos milisegundos
 * tardó la API, cuántas veces pasó del techo—, sin identificadores, sin placas
 * y sin personas. Por eso tampoco lleva `:id` en la ruta, y por eso la suite de
 * aislamiento no tiene nada que intentar aquí.
 *
 * **Y aun así pide sesión y rol administrativo.** Un mapa de dónde tarda el
 * sistema es información de operación: dice cuál es la ruta lenta y a qué hora
 * se degrada, que es justo lo que alguien querría saber antes de probar algo.
 */
@ApiTags('observabilidad')
@ApiBearerAuth()
@Controller('observabilidad')
export class ObservabilidadController {
  constructor(@Inject(METRICAS) private readonly metricas: Metricas) {}

  @Get('latencias')
  @Roles('administrador', 'superadministrador', 'operador_central')
  @SinRecursoDeTenant()
  @ApiOperation({
    summary: 'p50, p95 y p99 de las cinco latencias comprometidas (KPI-09, 13, 25, 32, 33)',
    description:
      'Cada fila trae el tramo que mide y lo que NO mide. Se leen juntos a propósito: ' +
      'una cifra de latencia sin su tramo no demuestra nada.',
  })
  @ApiOkResponse({ type: LatenciasDto })
  latencias(): LatenciasDto {
    const resumen = this.metricas.resumen();
    return {
      desde: resumen.desde,
      ventana: resumen.ventana,
      porProceso: true,
      filas: resumen.filas.map((f) => ({
        definicion: {
          clave: f.definicion.clave,
          titulo: f.definicion.titulo,
          umbralMs: f.definicion.umbralMs,
          segmento: f.definicion.segmento,
          noIncluye: f.definicion.noIncluye,
          rnf: f.definicion.rnf,
          ca: f.definicion.ca ?? null,
        },
        muestras: f.muestras,
        observadas: f.observadas,
        incumplimientos: f.incumplimientos,
        p50: f.p50,
        p95: f.p95,
        p99: f.p99,
        maximo: f.maximo,
        cumple: f.cumple,
      })),
    };
  }
}
