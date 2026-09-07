import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';
import type { CodigoDeRecuperacion, InscripcionMfa } from '../dominio/mfa';
import { consumirCodigoDeRecuperacion, generarCodigosDeRecuperacion } from '../dominio/mfa';

/**
 * Inscripción y verificación TOTP.
 *
 * El almacén es en memoria por la deuda D-17 (la API aún no conecta a
 * PostgreSQL). La FRONTERA ya es la definitiva: `ServicioMfa` no sabe dónde se
 * guarda, así que sustituir el mapa por el repositorio real no toca esta clase
 * ni los controladores.
 *
 * `window: 1` acepta el código del periodo anterior y el siguiente: sin esa
 * tolerancia, un reloj de teléfono desviado unos segundos deja al usuario
 * fuera. Más ventana alargaría la vida útil de un código interceptado.
 */
@Injectable()
export class ServicioMfa {
  private readonly inscripciones = new Map<string, InscripcionMfa>();

  constructor() {
    authenticator.options = { window: 1, step: 30 };
  }

  inscribir(usuarioId: string, correo: string): { uriOtpauth: string; codigos: string[] } {
    const secreto = authenticator.generateSecret();
    const { codigosEnClaro, almacenables } = generarCodigosDeRecuperacion();
    this.inscripciones.set(usuarioId, {
      usuarioId,
      secreto,
      uriOtpauth: authenticator.keyuri(correo, 'Next Control Residencial', secreto),
      verificada: false,
      codigos: almacenables,
    });
    // Los códigos en claro se devuelven UNA sola vez, aquí. No se vuelven a
    // poder consultar: solo existe su hash.
    return { uriOtpauth: this.inscripciones.get(usuarioId)!.uriOtpauth, codigos: codigosEnClaro };
  }

  verificar(usuarioId: string, codigo: string): boolean {
    const inscripcion = this.inscripciones.get(usuarioId);
    if (!inscripcion) return false;
    const valido =
      authenticator.check(codigo.replace(/\s/g, ''), inscripcion.secreto) ||
      consumirCodigoDeRecuperacion(inscripcion.codigos, codigo);
    if (valido) inscripcion.verificada = true;
    return valido;
  }

  estaVerificada(usuarioId: string): boolean {
    return this.inscripciones.get(usuarioId)?.verificada ?? false;
  }

  codigosRestantes(usuarioId: string): number {
    const c: CodigoDeRecuperacion[] = this.inscripciones.get(usuarioId)?.codigos ?? [];
    return c.filter((x) => !x.usado).length;
  }
}
