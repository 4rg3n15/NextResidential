/**
 * EL CARRIL DE LA CÁMARA · el único número de canal con procedencia.
 *
 * D4 (ETAPA 15-D) retiró el «canal 1 por omisión» del catálogo: el canal de
 * audio del videoportero se LEE de la lista que declara, y la puerta de la
 * terminal se DECLARA en el alta. Ninguno se supone.
 *
 * La cámara es distinta y hay que decir por qué: la DS-TCG405-E del proyecto
 * tiene **un carril**, y ese `1` está en la única ruta VERIFICADA del catálogo
 * —capturada del JavaScript de la interfaz del equipo el 15/09/2026—. No es una
 * suposición: es una medida. Se usa cuando el alta no declaró `canalBarrera`,
 * y el guion de puesta en marcha lee `supportBarrierGateNum` para confirmar
 * cuántos hay de verdad.
 */
export const CARRIL_VERIFICADO_DE_LA_CAMARA = 1;
