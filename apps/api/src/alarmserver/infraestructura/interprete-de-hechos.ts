import {
  CONFIANZA_DE_ROSTRO_RECONOCIDO,
  referenciaDePlaca,
  referenciaDeRostro,
} from '@ncr/providers';
import type { InterpreteDeHechos } from '../aplicacion/interprete-de-hechos';

/** 15-Q · la implementación ÚNICA de `providers`, la misma que usa el Edge. */
export const INTERPRETE_DE_HECHOS: InterpreteDeHechos = {
  referenciaDePlaca,
  referenciaDeRostro,
  confianzaDeRostroReconocido: CONFIANZA_DE_ROSTRO_RECONOCIDO,
};
