import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Reloj } from '@ncr/domain-core';
import { RELOJ } from '@ncr/domain-core';
import { CONFIGURACION } from '../../configuracion/configuracion.module';
import type { Configuracion } from '../../configuracion/esquema';
import { CABECERA_FIRMA, CABECERA_MARCA, verificarFirma } from './firma-ingesta';

/** Express no guarda el cuerpo crudo; sin él no se puede verificar una firma. */
export interface PeticionConCuerpoCrudo extends Request {
  cuerpoCrudo?: string;
}

/**
 * Guarda la representación EXACTA que llegó por el cable. Se engancha en
 * `express.json({ verify })` porque después de parsear el JSON el original ya
 * no existe, y reserializarlo produce otra cadena —otro orden de claves, otro
 * espaciado— con la que ninguna firma cuadraría.
 */
export const guardarCuerpoCrudo = (
  req: PeticionConCuerpoCrudo,
  _res: unknown,
  buf: Buffer,
): void => {
  req.cuerpoCrudo = buf.toString('utf8');
};

/**
 * RNF-03.11 · Sin firma válida no hay ingesta. Deniega por defecto: cualquier
 * anomalía —falta la cabecera, la marca no es un número, la ventana expiró—
 * termina en 401, y el motivo se registra pero **no se devuelve al cliente**:
 * decirle a quien lo intenta si falló la firma o la ventana le enseña cómo
 * acercarse.
 */
@Injectable()
export class GuardiaDeFirmaDeIngesta implements CanActivate {
  constructor(
    @Inject(CONFIGURACION) private readonly config: Configuracion,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  canActivate(contexto: ExecutionContext): boolean {
    const peticion = contexto.switchToHttp().getRequest<PeticionConCuerpoCrudo>();
    const cabecera = (nombre: string): string | undefined => {
      const valor = peticion.headers[nombre];
      return Array.isArray(valor) ? valor[0] : valor;
    };

    /**
     * ═══════════════════════════════════════════════════════════════════════
     * AQUÍ SE FALLA CERRADO · H-13-10
     *
     * La línea era `cuerpoCrudo: peticion.cuerpoCrudo ?? ''`, y ese `?? ''` era
     * un repliegue ABIERTO: `guardarCuerpoCrudo` sólo se engancha en
     * `express.json({ verify })`, así que con CUALQUIER otro content-type
     * `cuerpoCrudo` queda `undefined` y la firma se verificaba **sobre la
     * cadena vacía**. Medido:
     *
     *   POST /ingesta/latidos · Content-Type: application/x-www-form-urlencoded
     *   x-ncr-firma: firmar(SECRETO, marca, '')      ← firma sobre ''
     *   cuerpo: copropiedadId=…&dispositivoId=disp-1
     *     -> 202 {"recibido":true}                   ← aceptado, sin cubrirlo
     *
     * Línea base que descarta el falso positivo: firmando el cuerpo real, 401.
     *
     * Importa ANTES de la ETAPA 15, no después: el Alarm Server de Hikvision
     * publica `multipart/form-data` —XML del evento, foto y recorte de placa—.
     * Con ese parser montado, `express.json` no ejecuta su `verify`,
     * `cuerpoCrudo` sería `undefined` en TODOS los POST de cámara, y una sola
     * firma capturada valdría para cualquier cuerpo dentro de la ventana. Eso
     * es forja de eventos sobre una tabla que RN-03 declara inalterable.
     * ═══════════════════════════════════════════════════════════════════════
     */
    if (peticion.cuerpoCrudo === undefined) {
      throw new UnauthorizedException('Firma de ingesta no válida');
    }

    const veredicto = verificarFirma({
      firmaRecibida: cabecera(CABECERA_FIRMA),
      marcaTemporal: cabecera(CABECERA_MARCA),
      cuerpoCrudo: peticion.cuerpoCrudo,
      secreto: this.config.INGESTA_FIRMA_SECRETO,
      ahora: this.reloj.ahora(),
      ventanaSegundos: this.config.INGESTA_VENTANA_SEGUNDOS,
    });
    if (!veredicto.valida) throw new UnauthorizedException('Firma de ingesta no válida');
    return true;
  }
}
