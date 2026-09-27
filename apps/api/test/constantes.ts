/**
 * Identificadores compartidos por el banco de pruebas.
 *
 * Viven aquí y no en `utilidades.ts` por un ciclo de importación real: el doble
 * del directorio del residente los necesita, `utilidades.ts` construye la app
 * con ese doble, y el doble volvía a `utilidades.ts` a buscarlos. El ciclo no
 * daba error de compilación: dejaba las constantes en `undefined` en el momento
 * de construir los datos del doble, así que la copropiedad del vínculo era
 * `undefined` y todas las peticiones del residente respondían 403 «el vínculo
 * pertenece a otra copropiedad». Un módulo de constantes sin dependencias no
 * puede participar en un ciclo.
 */
export const COP_A = '10000000-0000-4000-8000-000000000001';
export const COP_B = '10000000-0000-4000-8000-000000000002';

/**
 * 15-L · los equipos con los que operan las suites sin base, dados de alta en
 * el registro en memoria con SU copropiedad. Desde que cada operación
 * comprueba que el equipo es de la copropiedad de la ruta, un id que el
 * registro no conoce es un 404 — como en producción, donde todo equipo está en
 * `dispositivos`.
 */
export const EQUIPOS_DEL_BANCO = [
  // guardia.e2e: la talanquera de la copropiedad B.
  {
    copropiedadId: COP_B,
    id: '20000000-0000-4000-8000-000000000001',
    nombre: 'Talanquera de B',
    tipo: 'camara_lpr',
  },
  // cuentas-y-porteria.e2e: la portería de A.
  {
    copropiedadId: COP_A,
    id: '70000000-0000-4000-8000-000000000001',
    nombre: 'Portería de A',
    tipo: 'intercom',
  },
  // biometria.e2e: la terminal de A, y la que no responde (el simulado no la conoce).
  {
    copropiedadId: COP_A,
    id: '90000000-0000-4000-8000-000000000001',
    nombre: 'Terminal de A',
    tipo: 'terminal_facial',
  },
  {
    copropiedadId: COP_A,
    id: '90000000-0000-4000-8000-0000000000ff',
    nombre: 'Terminal muda de A',
    tipo: 'terminal_facial',
  },
  // saneamiento-entrada.e2e.
  {
    copropiedadId: COP_A,
    id: '00000000-0000-4000-8000-0000000000ff',
    nombre: 'Relé de A',
    tipo: 'rele',
  },
] as const;

/** 15-L · un equipo de la copropiedad B que la copropiedad A no debe poder tocar. */
export const EQUIPO_DE_B = '20000000-0000-4000-8000-000000000001';
