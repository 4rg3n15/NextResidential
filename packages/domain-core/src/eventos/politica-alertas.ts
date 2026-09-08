import type { Acceso } from './acceso';
import type { Severidad, TipoDeAlerta } from './alerta';

export interface DescriptorDeAlerta {
  readonly tipo: TipoDeAlerta;
  readonly severidad: Severidad;
  readonly porQue: string;
}

/**
 * Definición de «acceso dudoso» — **P-07, resuelta el 2026-09-07**.
 *
 * El pendiente traía un supuesto de «dos motivos tipados»; el usuario lo cerró
 * con un criterio distinto y más simple de sostener: *ante la duda, un humano*.
 * Dudoso no es un motivo concreto, es **toda decisión que el motor no pudo
 * cerrar con certeza**, y su consecuencia no es negar ni abrir: es **escalar**.
 *
 * Se enumera aquí, en el dominio y no en el adaptador de alertas, porque la
 * pregunta «¿esto merece un humano?» es de negocio. Los cuatro casos:
 *
 * 1. Un permiso marcado `requiereConfirmacionHumana` — lectura entre la mitad
 *    del umbral y el umbral (CU-01, excepción 3a). Se permitió, sí, pero con
 *    una lectura que nadie confirmó.
 * 2. `CONFIANZA_INSUFICIENTE` — lectura por debajo de la mitad del umbral.
 * 3. `PLACA_DESCONOCIDA` por el método de placa: un vehículo que nadie
 *    registró en la puerta es exactamente el caso que un portero debe mirar.
 * 4. `FALLO_TECNICO` — el motor no pudo decidir. Denegar por defecto (§2.1.4)
 *    protege la puerta; escalar además evita que un fallo de configuración se
 *    quede callado en el histórico.
 *
 * Lo que NO entra: una vigencia expirada o un patrón incumplido. Ahí el motor
 * decidió con certeza y el visitante simplemente no tenía permiso; convertir eso
 * en alerta ahogaría al operador de central en ruido y haría que se dejaran de
 * mirar las que importan — que es la forma habitual de que un sistema de alertas
 * deje de servir.
 */
const esDudoso = (acceso: Acceso): string | null => {
  if (acceso.permitido) {
    return acceso.requiereConfirmacionHumana ? 'permitido con lectura sin confirmar' : null;
  }
  if (acceso.motivo === 'CONFIANZA_INSUFICIENTE') return 'lectura por debajo del umbral';
  if (acceso.motivo === 'PLACA_DESCONOCIDA' && acceso.metodo === 'placa') {
    return 'placa no registrada en la copropiedad';
  }
  if (acceso.motivo === 'FALLO_TECNICO') return 'el motor no pudo decidir';
  return null;
};

/**
 * Clasifica un acceso ya registrado. Función pura: mismo evento, misma alerta.
 * Devuelve `null` cuando el acceso no merece una — que es el caso común, y por
 * eso `null` significa «nada que escalar» y no «alerta informativa».
 */
export const clasificarAcceso = (acceso: Acceso): DescriptorDeAlerta | null => {
  // RN-06 tiene precedencia también aquí: un vetado que se presenta en la
  // puerta es el evento crítico del sistema, aunque además fuera dudoso.
  if (!acceso.permitido && acceso.motivo === 'LISTA_NEGRA') {
    return {
      tipo: 'lista_negra',
      severidad: 'critica',
      porQue: 'identidad o placa en lista negra se presentó en un punto de acceso',
    };
  }

  const dudoso = esDudoso(acceso);
  if (dudoso !== null) {
    return {
      tipo: 'acceso_dudoso',
      severidad: acceso.permitido ? 'alta' : 'media',
      porQue: dudoso,
    };
  }

  return null;
};

/**
 * Severidad de la caída de un dispositivo. Separada de `clasificarAcceso`
 * porque su origen no es un evento sino la ausencia de uno (SRP).
 */
export const alertaDeDispositivoCaido = (dispositivoId: string): DescriptorDeAlerta => ({
  tipo: 'dispositivo_caido',
  severidad: 'alta',
  porQue: `sin latido dentro del umbral configurado: ${dispositivoId}`,
});
