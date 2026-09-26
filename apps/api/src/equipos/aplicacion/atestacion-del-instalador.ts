import { Placa, errorDominio, esFallo, exito, fallo } from '@ncr/domain-core';
import type { Bitacora, ErrorDominio, Resultado } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type {
  AtestacionDelInstalador,
  RepositorioDeAtestaciones,
  RepositorioDeEquipos,
} from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * D-11 · EL SUPERADMINISTRADOR REGISTRA LA VERIFICACIÓN FÍSICA DE UNA CÁMARA
 *
 * Lo que se atesta, y nada más: con ESTE firmware pasó un vehículo con una
 * placa de la lista blanca del equipo y otro con una desconocida, y ninguno
 * abrió. Quién, cuándo y qué vio quedan en una tabla de sólo inserción.
 *
 * Lo que la atestación NO hace: volver verde a la cámara. El veredicto de la
 * API sigue sin confirmarlo, y la consola la pinta en ámbar.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface EntradaDeAtestacion {
  readonly equipoId: string;
  readonly placaEnListaBlanca: string;
  readonly placaDesconocida: string;
  readonly evidencia: string;
}

const EVIDENCIA_MINIMA = 20;
const EVIDENCIA_MAXIMA = 2000;

/** §2.7.4 · NFC, sin controles (salvo el salto de línea) y recortada. */
const evidenciaSaneada = (texto: string): string =>
  [...texto.normalize('NFC')]
    .map((c) => {
      const codigo = c.codePointAt(0) ?? 0;
      return c === '\n' || (codigo >= 0x20 && codigo !== 0x7f) ? c : ' ';
    })
    .join('')
    .trim();

const invalido = (detalle: string): ErrorDominio => errorDominio('DATO_INVALIDO', detalle, 'D-11');
const prohibido = (detalle: string): ErrorDominio =>
  errorDominio('OPERACION_NO_PERMITIDA', detalle, 'D-11');

export class RegistrarAtestacionDelInstalador {
  constructor(
    private readonly equipos: RepositorioDeEquipos,
    private readonly atestaciones: RepositorioDeAtestaciones,
    private readonly bitacora: Bitacora,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
    entrada: EntradaDeAtestacion,
  ): Promise<Resultado<AtestacionDelInstalador, ErrorDominio>> {
    // La ruta ya lo exige; el caso de uso no se fía de que siempre lo llame una ruta.
    if (ctx.rol !== 'superadministrador') {
      return fallo(prohibido('Sólo el superadministrador registra una atestación'));
    }
    const equipo = (await this.equipos.listar(ctx, copropiedadId)).find(
      (e) => e.id === entrada.equipoId,
    );
    if (equipo === undefined) {
      return fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'No se encontró el equipo', 'RN-15'));
    }
    if (equipo.tipo !== 'camara_lpr') {
      return fallo(invalido('Sólo se atesta una cámara: es la que puede abrir por su cuenta'));
    }
    if (equipo.estado !== 'activo') {
      return fallo(prohibido('El equipo está dado de baja'));
    }
    if (equipo.firmware === null) {
      return fallo(
        prohibido(
          'No se conoce el firmware del equipo: pruebe la conexión antes. La atestación vale ' +
            'para UN firmware, y sin él no hay contra qué compararla',
        ),
      );
    }

    const blanca = Placa.crear(entrada.placaEnListaBlanca);
    const desconocida = Placa.crear(entrada.placaDesconocida);
    if (esFallo(blanca))
      return fallo(invalido(`Placa de la lista blanca: ${blanca.error.detalle}`));
    if (esFallo(desconocida)) {
      return fallo(invalido(`Placa desconocida: ${desconocida.error.detalle}`));
    }
    if (blanca.valor.valor === desconocida.valor.valor) {
      return fallo(invalido('Las dos placas deben ser distintas: una conocida y una desconocida'));
    }
    const evidencia = evidenciaSaneada(entrada.evidencia);
    if (evidencia.length < EVIDENCIA_MINIMA || evidencia.length > EVIDENCIA_MAXIMA) {
      return fallo(
        invalido(
          `Describa lo que vio (hora, carril, qué pasó) entre ${String(EVIDENCIA_MINIMA)} y ` +
            `${String(EVIDENCIA_MAXIMA)} caracteres`,
        ),
      );
    }

    const atestacion = await this.atestaciones.registrar(ctx, copropiedadId, {
      dispositivoId: equipo.id,
      firmware: equipo.firmware,
      placaEnListaBlanca: blanca.valor.valor,
      placaDesconocida: desconocida.valor.valor,
      evidencia,
      registradaPor: ctx.usuarioId,
    });
    this.bitacora.registrar(
      'aviso',
      'cámara ATESTADA por el instalador: se operará aunque la API no confirme que no decide',
      {
        copropiedadId,
        dispositivoId: equipo.id,
        firmware: equipo.firmware,
        registradaPor: ctx.usuarioId,
      },
    );
    return exito(atestacion);
  }
}
