/**
 * ¿PUEDE ESTE RESIDENTE CREAR ESTA AUTORIZACIÓN, Y SI NO, POR QUÉ?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ES UNA FUNCIÓN PURA Y NO TRES `if` EN EL CASO DE USO
 *
 * Son tres reglas de negocio con nombre propio —RN-06, RN-13 y RN-04/CA-03— y
 * un orden entre ellas que **cambia el motivo que ve el residente**. Escritas
 * como comprobaciones sueltas en la capa de aplicación, el orden queda a merced
 * de cómo se ordenaron las líneas, y nadie lo prueba. Aquí el orden es la
 * función, y hay una prueba por rama.
 *
 * Es la misma decisión que el motor de reglas de la ETAPA 05: **la precedencia
 * es parte de la regla, no del código que la ejecuta**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PRECEDENCIA, Y POR QUÉ ESA
 *
 *   listaNegra > vivienda inactiva > nivel de acceso > placa duplicada
 *
 * **RN-06 va primero y es absoluta.** El documento lo dice para la evaluación
 * del acceso —un visitante vetado se niega aunque tenga autorización vigente,
 * CA-13— y aquí se aplica el mismo criterio a la creación: si la lista negra no
 * ganara también al crear, el sistema permitiría fabricar autorizaciones que
 * nacen muertas, y el residente vería «creada» algo que nunca abrirá una
 * puerta. Peor: dejaría un rastro de intentos que parece legítimo.
 *
 * Que RN-06 gane **también determina el mensaje**. Con una vivienda inactiva y
 * un visitante vetado a la vez, el residente debe leer «está en lista negra»,
 * no «su vivienda está inactiva»: lo segundo lo mandaría a la administración a
 * resolver un problema que no es el que bloquea.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTA FUNCIÓN NO HACE
 *
 * No consulta nada. Recibe hechos ya averiguados y decide. Quien los averigua
 * es la infraestructura, y quien garantiza la placa única es **la base de
 * datos** con su índice único parcial (ADR-04): la comprobación de aquí es para
 * poder decirlo con un motivo entendible antes de intentarlo, **no** para
 * sustituir la restricción. Dos residentes creando a la vez la misma placa
 * pasan los dos por aquí y solo uno pasa por el índice; el otro recibe
 * `PLACA_DUPLICADA` desde el adaptador. Por eso el motivo es el mismo en los
 * dos caminos.
 */

/**
 * Motivos por los que NO se crea. Enumerado propio, deliberadamente distinto
 * del de `ResultadoAcceso` (§2.4): aquello responde «¿se abre la puerta?» y
 * esto responde «¿se registra la autorización?». Compartir el enumerado habría
 * mezclado dos preguntas que el documento separa, y habría obligado a que cada
 * motivo nuevo de una sirviera en la otra.
 */
export type MotivoDeNoAutorizar =
  | 'LISTA_NEGRA'
  | 'VIVIENDA_INACTIVA'
  | 'SIN_NIVEL_DE_ACCESO'
  | 'PLACA_DUPLICADA';

/** Hechos que la infraestructura averigua; aquí solo se juzgan. */
export interface HechosParaAutorizar {
  /** RN-06 · el visitante —o su placa— está vetado en la copropiedad. */
  readonly visitanteVetado: boolean;
  /** RN-13 · una vivienda inactiva conserva lo vigente y no genera nuevo. */
  readonly viviendaActiva: boolean;
  /** `[SUPUESTO]` P-11 · el nivel de acceso del vínculo permite autorizar. */
  readonly vinculoPuedeAutorizar: boolean;
  /** RN-04 · CA-03 · la placa ya está activa en otra vivienda del conjunto. */
  readonly placaYaActiva: boolean;
}

export type VeredictoDeAutorizacion =
  | { readonly puede: true }
  | { readonly puede: false; readonly motivo: MotivoDeNoAutorizar };

/**
 * El orden de estos cuatro `if` ES la regla. Cambiarlo cambia lo que lee el
 * residente, así que hay una prueba que fija cada pareja en conflicto.
 */
export const puedeAutorizar = (hechos: HechosParaAutorizar): VeredictoDeAutorizacion => {
  if (hechos.visitanteVetado) return { puede: false, motivo: 'LISTA_NEGRA' };
  if (!hechos.viviendaActiva) return { puede: false, motivo: 'VIVIENDA_INACTIVA' };
  if (!hechos.vinculoPuedeAutorizar) return { puede: false, motivo: 'SIN_NIVEL_DE_ACCESO' };
  if (hechos.placaYaActiva) return { puede: false, motivo: 'PLACA_DUPLICADA' };
  return { puede: true };
};

/**
 * El motivo, en castellano llano y dirigido al residente.
 *
 * Vive en el dominio y no en la pantalla porque la app móvil y la consola web
 * tienen que decir lo mismo: un residente al que la app le dice una cosa y el
 * portero otra deja de confiar en las dos. Lo que la pantalla decide es cómo
 * lo pinta, no qué dice.
 *
 * Y ninguno de los cuatro nombra a nadie: «está en lista negra» no dice quién
 * lo vetó ni por qué —eso es de la administración (RN-07)—, y «esa placa ya
 * está registrada» no dice en qué vivienda, porque sería decirle al residente
 * algo de su vecino.
 */
export const explicacionDe = (motivo: MotivoDeNoAutorizar): string => {
  switch (motivo) {
    case 'LISTA_NEGRA':
      return 'Esta persona está en la lista negra del conjunto. La administración es quien puede levantarla.';
    case 'VIVIENDA_INACTIVA':
      return 'Su vivienda está inactiva: las autorizaciones vigentes siguen funcionando, pero no se pueden crear nuevas. Consulte con la administración.';
    case 'SIN_NIVEL_DE_ACCESO':
      return 'Su nivel de acceso no permite autorizar visitantes. El titular de la vivienda sí puede hacerlo.';
    case 'PLACA_DUPLICADA':
      return 'Esa placa ya está registrada y activa en el conjunto. Debe darse de baja antes de volver a registrarla.';
  }
};
