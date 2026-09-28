import type { DatosDeEquipo } from './puertos';

/**
 * C2 (ETAPA 15-L) · QUÉ CAMBIÓ EN UNA EDICIÓN, para la auditoría.
 *
 * «Todo auditado» no es «alguien editó el equipo»: es qué campo y, cuando no
 * es sensible, de qué valor a cuál. La dirección, el usuario de servicio y la
 * credencial se nombran sin valores —la credencial jamás; la dirección y el
 * usuario porque la bitácora la lee más gente que la ficha—.
 */
const CON_VALOR: readonly (readonly [keyof DatosDeEquipo, string])[] = [
  ['nombre', 'nombre'],
  ['tipo', 'tipo'],
  ['puerto', 'puerto'],
  ['protocolo', 'protocolo'],
  ['numeroDePuerta', 'puerta'],
  ['canalBarrera', 'barrera'],
  ['canalDeAudio', 'canal de audio'],
  ['canalDeVideo', 'canal de video'],
  ['zonaId', 'zona'],
  ['modoDeTerminal', 'modo'],
  ['canalDeAudioHabilitado', 'audio habilitado'],
  ['fabricante', 'fabricante'],
];
const SIN_VALOR: readonly (readonly [keyof DatosDeEquipo, string])[] = [
  ['host', 'dirección'],
  ['usuario', 'usuario de servicio'],
];

const texto = (v: unknown): string => (v === null || v === undefined ? '—' : String(v));

export const cambiosDeEquipo = (
  antes: DatosDeEquipo,
  despues: DatosDeEquipo,
  credencialNueva: boolean,
): string => {
  const cambios = [
    ...CON_VALOR.filter(([campo]) => antes[campo] !== despues[campo]).map(
      ([campo, nombre]) => `${nombre}: ${texto(antes[campo])} → ${texto(despues[campo])}`,
    ),
    ...SIN_VALOR.filter(([campo]) => antes[campo] !== despues[campo]).map(([, nombre]) => nombre),
    ...(credencialNueva ? ['credencial reemplazada'] : []),
  ];
  return cambios.length === 0 ? 'sin cambios' : cambios.join('; ').slice(0, 900);
};
