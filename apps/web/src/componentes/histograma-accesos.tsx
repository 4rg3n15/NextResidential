import type { JSX } from 'react';
import type { AccesosPorHora } from '@ncr/contracts';
import { cn } from '@/lib/cn';
import { claseDeAlto } from '@/lib/proporcion';

/**
 * «Accesos por hora» — barras del día, W-02.
 *
 * SVG y CSS, sin biblioteca de gráficas: son veinticuatro barras apiladas y
 * traer una dependencia entera para eso engorda el paquete que se descarga en
 * cada carga de la consola.
 *
 * **Los datos no se leen solo con la vista.** El gráfico es `role="img"` con una
 * descripción, y debajo hay una tabla equivalente marcada como `sr-only`: quien
 * usa lector de pantalla obtiene las mismas cifras, no un «gráfico» sin
 * contenido. Es la misma regla de §5.6.2 aplicada a una visualización.
 *
 * Las horas son **locales de la copropiedad**, calculadas por la API. Pintarlas
 * con la zona del navegador correría las barras cinco horas en Colombia y nadie
 * lo notaría hasta comparar con el histórico.
 */
export const HistogramaDeAccesos = ({ datos }: { readonly datos: AccesosPorHora }): JSX.Element => {
  const maximo = Math.max(1, ...datos.franjas.map((f) => f.permitidos + f.negados));
  const total = datos.franjas.reduce((s, f) => s + f.permitidos + f.negados, 0);

  if (total === 0) {
    return (
      <p className="px-5 py-8 text-center text-secundario text-texto-apagado">
        Todavía no hay accesos registrados hoy en la zona horaria de la copropiedad (
        {datos.zonaHoraria}).
      </p>
    );
  }

  return (
    <div className="px-5 pb-2">
      <div
        role="img"
        aria-label={`Accesos por hora del día en ${datos.zonaHoraria}: ${total} en total.`}
        className="flex h-40 items-end gap-1"
      >
        {datos.franjas.map((f) => {
          const suma = f.permitidos + f.negados;
          const alto = (suma / maximo) * 100;
          return (
            <div key={f.hora} className="flex h-full flex-1 flex-col justify-end gap-px">
              {f.negados > 0 ? (
                <div
                  className={cn(
                    'w-full rounded-t-sm bg-peligro',
                    claseDeAlto((f.negados / maximo) * 100),
                  )}
                />
              ) : null}
              {f.permitidos > 0 ? (
                <div
                  className={cn(
                    'w-full bg-marca',
                    f.negados === 0 && 'rounded-t-sm',
                    claseDeAlto((f.permitidos / maximo) * 100),
                  )}
                />
              ) : null}
              {suma === 0 ? (
                <div className={cn('h-px w-full bg-borde', claseDeAlto(alto))} />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between text-secundario text-texto-apagado">
        <span>00:00</span>
        <span>12:00</span>
        <span>23:00</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-secundario text-texto-apagado">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-marca" aria-hidden="true" /> Permitidos
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-peligro" aria-hidden="true" /> Denegados
        </span>
        <span>Hora local de la copropiedad ({datos.zonaHoraria})</span>
      </div>

      {/* Equivalente textual: las mismas cifras, sin depender de la vista. */}
      <table className="sr-only">
        <caption>Accesos por hora, {datos.zonaHoraria}</caption>
        <thead>
          <tr>
            <th scope="col">Hora</th>
            <th scope="col">Permitidos</th>
            <th scope="col">Denegados</th>
          </tr>
        </thead>
        <tbody>
          {datos.franjas
            .filter((f) => f.permitidos + f.negados > 0)
            .map((f) => (
              <tr key={f.hora}>
                <th scope="row">{String(f.hora).padStart(2, '0')}:00</th>
                <td>{f.permitidos}</td>
                <td>{f.negados}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
};
