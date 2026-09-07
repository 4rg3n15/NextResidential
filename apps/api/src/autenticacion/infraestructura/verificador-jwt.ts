import { jwtVerify, errors } from 'jose';
import type { ProveedorDeJwks } from './jwks';
import { RechazoDeAutenticacion } from '../dominio/errores';
import { esquemaClaims } from '../dominio/claims';
import type { Claims } from '../dominio/claims';

/**
 * Lista CERRADA de algoritmos. `jose` toma el algoritmo de la clave del JWKS,
 * no del encabezado del token, y esta lista lo acota además de forma explícita.
 *
 * HS256 no aparece, y su ausencia es el punto de la clase: este proyecto no
 * tiene secreto compartido, así que una biblioteca configurada con «cualquier
 * algoritmo» convertiría una clave PÚBLICA conocida en un secreto de firma
 * válido — la confusión de algoritmos de manual.
 */
const ALGORITMOS_ADMITIDOS = ['RS256', 'RS512', 'ES256', 'ES512', 'EdDSA'] as const;

export interface OpcionesVerificacion {
  readonly emisor: string;
  readonly audiencia: string;
  readonly toleranciaRelojSegundos: number;
}

export class VerificadorDeJwt {
  constructor(
    private readonly jwks: ProveedorDeJwks,
    private readonly opciones: OpcionesVerificacion,
  ) {}

  async verificar(token: string): Promise<Claims> {
    if (!token) throw new RechazoDeAutenticacion('SIN_TOKEN');

    let cargaUtil: unknown;
    try {
      const resultado = await jwtVerify(token, this.jwks.obtener(), {
        algorithms: [...ALGORITMOS_ADMITIDOS],
        issuer: this.opciones.emisor,
        audience: this.opciones.audiencia,
        clockTolerance: this.opciones.toleranciaRelojSegundos,
      });
      cargaUtil = resultado.payload;
    } catch (e) {
      throw this.traducir(e);
    }

    // La firma acredita el emisor, no la forma. Un token legítimo puede traer
    // claims que este sistema no espera, y el rol es una decisión de acceso.
    const analisis = esquemaClaims.safeParse(cargaUtil);
    if (!analisis.success) throw new RechazoDeAutenticacion('CLAIMS_INVALIDOS');
    return analisis.data;
  }

  private traducir(e: unknown): RechazoDeAutenticacion {
    if (e instanceof RechazoDeAutenticacion) return e;
    if (e instanceof errors.JWTExpired) return new RechazoDeAutenticacion('EXPIRADO');
    if (e instanceof errors.JWKSNoMatchingKey) return new RechazoDeAutenticacion('KID_DESCONOCIDO');
    if (e instanceof errors.JOSEAlgNotAllowed)
      return new RechazoDeAutenticacion('ALGORITMO_NO_ADMITIDO');
    if (e instanceof errors.JWKSTimeout || e instanceof errors.JWKSMultipleMatchingKeys) {
      return new RechazoDeAutenticacion('JWKS_NO_DISPONIBLE');
    }
    if (e instanceof errors.JWTClaimValidationFailed) {
      if (e.claim === 'iss') return new RechazoDeAutenticacion('EMISOR_INVALIDO');
      if (e.claim === 'aud') return new RechazoDeAutenticacion('AUDIENCIA_INVALIDA');
      return new RechazoDeAutenticacion('CLAIMS_INVALIDOS');
    }
    // Todo lo demás —firma rota, formato ilegible— se colapsa a un solo motivo:
    // afinar el diagnóstico para el cliente es afinárselo a un atacante.
    return new RechazoDeAutenticacion('FIRMA_INVALIDA');
  }
}
