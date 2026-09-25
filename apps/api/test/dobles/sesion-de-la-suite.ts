import { ControlDeSesiones } from '../../src/porteria';
import type { EstadoDeLaPeticion, IdentidadDeLaPeticion } from '../../src/porteria';

/**
 * LA SESIÓN DE PORTERÍA DE LA SUITE · y por qué existe (ETAPA 15-H).
 *
 * Desde la 15-H cada petición de un portero pasa por la guarda de turno, que
 * exige una sesión registrada al iniciar sesión y un turno vigente. Las suites
 * anteriores —aislamiento, portería, guardia, zonas— emiten tokens de portero
 * con la firma de la suite y NUNCA inician sesión: el turno les es ortogonal.
 *
 * Para ellas, `tokenDe` pone en el token del portero este `session_id`, y este
 * control lo reconoce como una sesión activa con un turno que no termina. Es
 * el ÚNICO identificador que recibe ese trato; cualquier otro recorre el
 * camino real. Las suites de la 15-H (`porteria.e2e`, `porteria-pg`) inician
 * sesión de verdad, con sesiones y turnos reales, y nunca usan éste.
 */
export const SESION_DE_LA_SUITE = '5e5e5e5e-0000-4000-8000-00000000c0de';

export class ControlConLaSesionDeLaSuite extends ControlDeSesiones {
  override async validar(id: IdentidadDeLaPeticion): Promise<EstadoDeLaPeticion> {
    if (id.sesionId !== SESION_DE_LA_SUITE || id.copropiedadId === null) return super.validar(id);
    const siempre = { inicio: new Date(0), fin: new Date(8.64e15) };
    return {
      tipo: 'activa',
      sesion: {
        sesionId: SESION_DE_LA_SUITE,
        copropiedadId: id.copropiedadId,
        porteroId: id.usuarioId,
        turnoId: SESION_DE_LA_SUITE,
        estado: 'activa',
        codigoHash: 'sin-codigo-en-la-suite',
        intentosFallidos: 0,
        iniciadaEn: siempre.inicio,
        patrullajeDesde: null,
        cerradaEn: null,
        motivoCierre: null,
        origenDeclarado: null,
      },
      turno: {
        id: SESION_DE_LA_SUITE,
        copropiedadId: id.copropiedadId,
        porteroId: id.usuarioId,
        porteria: null,
        dia: '1970-01-01',
        horaInicio: '00:00',
        horaFin: '00:00',
        tipo: 'programado',
        motivo: null,
        franja: siempre,
        activo: true,
      },
    };
  }
}
