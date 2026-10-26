import type { JSX } from 'react';
import type { FotoLista } from '@/componentes/captura-de-foto';

/**
 * D-143 · decisión del cliente (pruebas en sitio, 23/10): una visita puede
 * llegar en carro sin registrar rostro. Hace falta la placa o la foto, AL
 * MENOS UNA, y quien la genera elige. La regla la exige la API
 * (`revisarForma`); aquí sólo se evita enviar un formulario que va a volver
 * con 400, y se dice por qué.
 *
 * La comparten «Generar autorización» de la consola y «Nuevo visitante» del
 * residente, para que no puedan divergir.
 */
export const AVISO_PLACA_O_FOTO =
  'Indique la placa del vehículo, la foto del visitante o las dos: hace falta al menos una.';

export const hayPlacaOFoto = (placa: string, foto: FotoLista | null): boolean =>
  placa.trim() !== '' || foto !== null;

/**
 * La foto y la casilla viajan JUNTAS o no viajan: la casilla es el
 * consentimiento del dato biométrico (RN-10) y sin foto no hay nada que
 * consentir.
 */
export const fotoYCasilla = (
  foto: FotoLista | null,
  casillaMarcada: boolean,
): { readonly foto?: FotoLista; readonly casillaMarcada?: boolean } =>
  foto === null ? {} : { foto, casillaMarcada };

/** El aviso, siempre a la vista; en color de aviso mientras no se cumpla. */
export const AvisoPlacaOFoto = ({ cumplido }: { readonly cumplido: boolean }): JSX.Element => (
  <p
    role="note"
    className={`text-secundario ${cumplido ? 'text-texto-apagado' : 'text-aviso-texto'}`}
  >
    {AVISO_PLACA_O_FOTO}
  </p>
);
