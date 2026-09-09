import type { JSX } from 'react';
import type { DispositivoDelTablero, EstadoDeDispositivo } from '@ncr/contracts';
import { Distintivo } from './ui/distintivo';
import type { TonoDeDistintivo } from './ui/distintivo';

/**
 * Elemento de la lista de dispositivos — §5.5 del catálogo, CA-26, RN-12.
 *
 * **Tres estados y no dos.** El mockup dibuja «EN LÍNEA / FALLA»; el dominio
 * distingue además `degradado`, que es el que hace útil el conjunto: separa «se
 * saltó un latido» de «lleva cinco minutos mudo», y solo el segundo levanta
 * alerta. Colapsarlo a dos obligaría a elegir entre avisar por cada hipo de la
 * red o esperar tanto que el aviso llegue cuando ya no sirve.
 *
 * El estado llega **derivado por la API** desde el último latido contra el
 * umbral de la copropiedad. La consola no lo recalcula: hacerlo aquí sería
 * reimplementar una regla que ya vive en el dominio, y las dos versiones se
 * separarían en cuanto alguien cambiara el umbral.
 */
const PRESENTACION: Readonly<
  Record<EstadoDeDispositivo, { readonly tono: TonoDeDistintivo; readonly texto: string }>
> = {
  saludable: { tono: 'exito', texto: 'En línea' },
  degradado: { tono: 'aviso', texto: 'Degradado' },
  caido: { tono: 'peligro', texto: 'Sin señal' },
};

const TIPO: Readonly<Record<string, string>> = {
  camara_lpr: 'Cámara LPR',
  terminal_facial: 'Terminal facial',
  rele: 'Relé',
  intercom: 'Intercom',
  controlador_io: 'Controlador E/S',
};

const silencio = (segundos: number | null): string => {
  if (segundos === null) return 'nunca ha reportado';
  if (segundos < 60) return `hace ${segundos} s`;
  if (segundos < 3600) return `hace ${Math.floor(segundos / 60)} min`;
  return `hace ${Math.floor(segundos / 3600)} h`;
};

export const FilaDeDispositivo = ({
  dispositivo,
}: {
  readonly dispositivo: DispositivoDelTablero;
}): JSX.Element => {
  const { tono, texto } = PRESENTACION[dispositivo.estado];
  return (
    <li className="flex items-center justify-between gap-3 border-b border-borde-suave px-5 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-cuerpo font-medium text-texto">{dispositivo.nombre}</p>
        <p className="mt-0.5 truncate text-secundario text-texto-apagado">
          {TIPO[dispositivo.tipo] ?? dispositivo.tipo}
          {/* El direccionamiento solo llega a roles administrativos (C-11); para
              el resto la API manda `null` y aquí simplemente no se pinta. La
              credencial NUNCA llega, ni enmascarada (RN-21). */}
          {dispositivo.host === null ? null : (
            <>
              {' · '}
              <span className="font-mono">{dispositivo.host}</span>
            </>
          )}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Distintivo tono={tono}>{texto}</Distintivo>
        <span className="text-secundario text-texto-apagado">
          Latido {silencio(dispositivo.segundosSinLatir)}
        </span>
      </div>
    </li>
  );
};
