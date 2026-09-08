import type { HorarioDeZona } from './horario-zona';
import type { DiaDeSemana } from '../autorizaciones/patron-recurrencia';

const MINUTOS_DEL_DIA = 24 * 60;
const MS_POR_MINUTO = 60_000;
const MS_POR_DIA = MINUTOS_DEL_DIA * MS_POR_MINUTO;

/**
 * Espejo del enumerado `politica_reinicio` de la migración 0002.
 * P-04 sigue abierta; el valor por defecto del esquema es `cierre_horario`.
 */
export const POLITICAS_REINICIO = ['cierre_horario', 'manual', 'nunca'] as const;
export type PoliticaReinicio = (typeof POLITICAS_REINICIO)[number];

/**
 * Reinicio del contador de aforo — CU-05 excepción 6a, P-04, **S-09**.
 *
 * EL PROBLEMA QUE RESUELVE. Un sensor de salida que falla deja el contador
 * inflado: la zona se llena con gente que ya se fue y deja de admitir a nadie.
 * La salida no es «no contar», sino aceptar que el contador se desvía y
 * devolverlo a cero cuando la zona cierra y, por tanto, está vacía de verdad.
 *
 * EL CORTE DE MEDIANOCHE NO ES UN CIERRE (S-09). Una zona con horario de
 * viernes 22:00 a sábado 01:00 se representa con dos franjas porque una franja
 * no puede terminar antes de empezar. Reiniciar en el corte —a las 00:00—
 * vaciaría el contador con la zona **llena de gente dentro**: a la 00:01 la
 * zona admitiría su aforo entero otra vez, que es justo la violación de RN-14
 * que el contador existe para impedir. El cierre real es a la 01:00.
 *
 * Por eso el cálculo no busca «cuándo termina una franja» sino «cuándo termina
 * una JORNADA», y `HorarioDeZona.cierraJornada` es quien distingue las dos.
 */

/**
 * Instante del último cierre de jornada anterior o igual a `ahora`.
 * `null` si la zona no tiene horario —sin cierres no hay reinicio automático—.
 *
 * Función pura con el instante inyectado: no lee ningún reloj.
 */
export const ultimoCierreDeJornada = (horario: HorarioDeZona, ahora: Date): Date | null => {
  const cierres = horario.franjas.filter((f) => horario.cierraJornada(f));
  if (cierres.length === 0) return null;

  const { dia, minuto } = horario.localDe(ahora);
  // Instante local de `ahora` a medianoche, como origen del cálculo semanal.
  const localAhora = ahora.getTime() + horario.desplazamientoUtcMinutos * MS_POR_MINUTO;
  const medianocheLocal = localAhora - minuto * MS_POR_MINUTO - (localAhora % MS_POR_MINUTO);

  let mejor: number | null = null;
  for (const franja of cierres) {
    // 24:00 del día D es 00:00 del día D+1. Normalizar evita un caso especial
    // en la aritmética de más abajo.
    const cierraEn24 = franja.minutoFin === MINUTOS_DEL_DIA;
    const diaCierre = (cierraEn24 ? (franja.dia + 1) % 7 : franja.dia) as DiaDeSemana;
    const minutoCierre = cierraEn24 ? 0 : franja.minutoFin;

    const diasAtras = (dia - diaCierre + 7) % 7;
    let candidato = medianocheLocal - diasAtras * MS_POR_DIA + minutoCierre * MS_POR_MINUTO;
    // Si el cierre de hoy aún no ha ocurrido, el último fue el de la semana pasada.
    if (candidato > localAhora) candidato -= 7 * MS_POR_DIA;
    if (mejor === null || candidato > mejor) mejor = candidato;
  }

  return mejor === null ? null : new Date(mejor - horario.desplazamientoUtcMinutos * MS_POR_MINUTO);
};

/**
 * ¿Corresponde reiniciar el contador ahora?
 *
 * `true` solo si la política lo automatiza **y** ha ocurrido un cierre de
 * jornada desde el último reinicio. `manual` y `nunca` no reinician solas: la
 * primera espera al operador, la segunda es para zonas donde el conteo es
 * acumulado y reiniciarlo sería perder el dato.
 *
 * SIN REINICIO PREVIO —una zona recién configurada— se exige además que la
 * zona esté **cerrada ahora mismo**. Sin esa condición, una zona nueva con
 * gente dentro se vaciaría a mitad de jornada la primera vez que alguien la
 * consultara, que es el mismo daño que S-09 evita en el corte de medianoche
 * pero por otra puerta: el contador se pone a cero con la zona ocupada.
 */
export const debeReiniciarAforo = (entrada: {
  politica: PoliticaReinicio;
  horario: HorarioDeZona;
  ultimoReinicio: Date | null;
  ahora: Date;
}): boolean => {
  if (entrada.politica !== 'cierre_horario') return false;

  const cierre = ultimoCierreDeJornada(entrada.horario, entrada.ahora);
  if (cierre === null) return false;
  if (entrada.ultimoReinicio === null) return entrada.horario.franjaEn(entrada.ahora) === null;
  return cierre.getTime() > entrada.ultimoReinicio.getTime();
};
