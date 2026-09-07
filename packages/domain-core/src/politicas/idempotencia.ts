import type { Resultado } from '../compartido/resultado';
import { exito, fallo } from '../compartido/resultado';
import type { ErrorDominio } from '../compartido/errores';
import { errorDominio } from '../compartido/errores';

/**
 * Política de idempotencia (RN-17, CA-22, decisión D-11).
 *
 * La clave la construye el DOMINIO, no el transporte, porque de ella depende
 * que un reenvío del Edge se descarte. Se deriva solo de lo que identifica al
 * hecho —copropiedad, dispositivo, origen y su identificador— y NUNCA de la
 * marca de tiempo: el Edge puede recalcular `ocurridoEn` al reconciliar, y si
 * el instante entrara en la clave, el mismo hecho produciría dos claves y dos
 * filas. Es exactamente el escenario que D-11 obliga a cubrir.
 */
export interface DescriptorDeHecho {
  readonly copropiedadId: string;
  readonly dispositivoId: string;
  readonly origen: string;
  readonly referenciaExterna: string;
}

const SEGURO = /^[A-Za-z0-9_.:-]{1,128}$/;

export const construirClaveIdempotencia = (
  d: DescriptorDeHecho,
): Resultado<string, ErrorDominio> => {
  const partes = [d.copropiedadId, d.dispositivoId, d.origen, d.referenciaExterna];
  for (const parte of partes) {
    if (!SEGURO.test(parte)) {
      return fallo(
        errorDominio(
          'DATO_INVALIDO',
          `Componente de clave de idempotencia no admitido: "${parte}"`,
          'RN-17',
        ),
      );
    }
  }
  return exito(partes.join(':'));
};

/** Registro de claves ya vistas. La implementación duradera es la base (D-11). */
export interface RegistroDeIdempotencia {
  yaProcesada(clave: string): Promise<boolean>;
  marcarProcesada(clave: string): Promise<void>;
}
