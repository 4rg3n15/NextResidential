import { POLITICA_DEL_ROSTRO_DE_MENOR } from '../src/residente/aplicacion/politica-del-rostro';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-X (D3) · LAS RUTAS DEL RESIDENTE QUE NOMBRAN UN RECURSO DE SU VIVIENDA
 *
 * El menor del hogar (`:residenteId`). Las recorre, SIN base y con el doble de
 * menores, `aislamiento-recurso-de-vivienda.e2e`: el menor del vecino responde
 * 404 por las tres, el propio no (la línea base), y ni la identidad de servicio
 * ni un residente de otra copropiedad las alcanzan. No es una exención:
 * `aislamiento-residente.e2e` las cuenta como cubiertas PORQUE aquélla las
 * recorre de verdad.
 *
 * El cuerpo de la escritura tiene la forma correcta: con una mal formada, el
 * `ValidationPipe` respondería 400 antes de mirar la vivienda, y un 400 no
 * demuestra aislamiento.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface RutaConRecurso {
  readonly metodo: 'get' | 'post';
  /** El estado con el recurso PROPIO: la línea base de la suite. */
  readonly conElPropio: number;
  readonly cuerpo?: Record<string, unknown>;
}

const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(48, 7),
  Buffer.from([0xff, 0xd9]),
]).toString('base64');

export const CON_RECURSO_DE_LA_VIVIENDA: Readonly<Record<string, RutaConRecurso>> = {
  'GET /copropiedades/:id/mi/menores/:residenteId/rostro': { metodo: 'get', conElPropio: 200 },
  'POST /copropiedades/:id/mi/menores/:residenteId/rostro': {
    metodo: 'post',
    conElPropio: 201,
    cuerpo: {
      contenidoBase64: JPEG,
      tipoMime: 'image/jpeg',
      medidas: { rostrosDetectados: 1, nitidez: 0.9, iluminacion: 0.6, proporcionRostro: 0.4 },
      versionPolitica: POLITICA_DEL_ROSTRO_DE_MENOR.version,
      aceptaPolitica: true,
      declaraRepresentacionLegal: true,
      menorInformadoYDeAcuerdo: true,
    },
  },
  // Después del alta de la línea base: había un rostro que retirar.
  'POST /copropiedades/:id/mi/menores/:residenteId/rostro/retiro': {
    metodo: 'post',
    conElPropio: 200,
  },
};
