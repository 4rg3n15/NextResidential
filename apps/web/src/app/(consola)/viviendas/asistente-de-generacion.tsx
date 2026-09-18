'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { PlanDeGeneracion, TipoDeCopropiedad, VistaPreviaDeGeneracion } from '@ncr/contracts';
import { Boton } from '@/componentes/ui/boton';
import { Campo } from '@/componentes/ui/campo';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import type { Vocabulario } from '@/lib/vocabulario';
import { nombreDeGrupo } from '@/lib/vocabulario';

/**
 * Asistente de generación del padrón.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DOS PASOS, Y EL SEGUNDO NO SE PUEDE SALTAR
 *
 * Generar 300 viviendas a ciegas y descubrir después que el patrón estaba mal
 * es caro de deshacer: la baja es una por una y cada una exige motivo (RN-19).
 * Por eso el botón de crear **no existe** hasta que la vista previa ha vuelto
 * del servidor, y vuelve a desaparecer en cuanto se toca un campo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE SE ENSEÑA, Y POR QUÉ NO SON LAS 300
 *
 * Por grupo: las dos primeras, las dos últimas y el recuento. Ver que la Torre C
 * acaba en 303 y no en 503 es lo que detecta un patrón mal puesto; ver las
 * trescientas no ayuda a nadie a decidir.
 *
 * El total llega en el cuerpo de la confirmación como `totalEsperado`. Si el
 * servidor recalcula el plan y le sale otro número, no crea nada — cierra la
 * ventana en que el formulario cambió después de previsualizar sin pedir al
 * usuario que teclee una confirmación que acabaría escribiendo sin leer.
 */

interface Excepcion {
  readonly agrupacion: string;
  readonly pisos: string;
  readonly porPiso: string;
}

const numero = (texto: string): number => {
  const n = Number(texto.trim());
  return Number.isFinite(n) ? n : 0;
};

export const AsistenteDeGeneracion = ({
  copropiedadId,
  tipo,
  vocabulario,
  abierto,
  alCerrar,
  alTerminar,
}: {
  readonly copropiedadId: string;
  readonly tipo: TipoDeCopropiedad;
  readonly vocabulario: Vocabulario;
  readonly abierto: boolean;
  readonly alCerrar: () => void;
  readonly alTerminar: (creadas: number) => void;
}): JSX.Element => {
  const [agrupaciones, setAgrupaciones] = useState('1');
  const [estilo, setEstilo] = useState<'letras' | 'numeros'>('numeros');
  const [pisos, setPisos] = useState('5');
  const [porPiso, setPorPiso] = useState('3');
  const [excepciones, setExcepciones] = useState<readonly Excepcion[]>([]);
  const [hayExcepciones, setHayExcepciones] = useState(false);

  const [secciones, setSecciones] = useState('0');
  const [total, setTotal] = useState('30');
  const [reiniciar, setReiniciar] = useState(false);

  const [cantidad, setCantidad] = useState('10');

  const [vista, setVista] = useState<VistaPreviaDeGeneracion | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);

  /**
   * Cualquier cambio invalida la vista previa. Sin esto, se podría
   * previsualizar 39, añadir una torre y confirmar creyendo que son 39: el
   * servidor lo rechazaría por `totalEsperado`, pero la consola habría dejado
   * pulsar un botón que prometía otra cosa.
   */
  const cambiar = <T,>(fijar: (valor: T) => void) => {
    return (valor: T): void => {
      setVista(null);
      setError(undefined);
      fijar(valor);
    };
  };

  const plan = (): PlanDeGeneracion => {
    if (tipo === 'apartamentos') {
      return {
        tipo: 'apartamentos',
        agrupaciones: numero(agrupaciones),
        estilo,
        pisos: numero(pisos),
        porPiso: numero(porPiso),
        excepciones: hayExcepciones
          ? excepciones.map((e) => ({
              agrupacion: e.agrupacion.trim(),
              pisos: numero(e.pisos),
              porPiso: numero(e.porPiso),
            }))
          : [],
      };
    }
    if (tipo === 'casas') {
      return {
        tipo: 'casas',
        secciones: numero(secciones),
        total: numero(total),
        reiniciarNumeracion: reiniciar,
      };
    }
    return { tipo: 'fincas', cantidad: numero(cantidad) };
  };

  const previsualizar = async (): Promise<void> => {
    setEnviando(true);
    setError(undefined);
    try {
      const respuesta = desenvolver(
        await cliente.POST('/copropiedades/{id}/padron/viviendas/generacion/previsualizacion', {
          params: { path: { id: copropiedadId } },
          body: plan(),
        }),
      );
      setVista(respuesta);
    } catch (e) {
      // El mensaje del servidor viaja TAL CUAL: es quien sabe que la torre «G»
      // no existe y cuáles sí. Reescribirlo aquí produciría un texto que no
      // coincide con lo que ocurrió.
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo calcular la vista previa');
      setVista(null);
    } finally {
      setEnviando(false);
    }
  };

  const confirmar = async (): Promise<void> => {
    if (vista === null) return;
    setEnviando(true);
    setError(undefined);
    try {
      const respuesta = desenvolver(
        await cliente.POST('/copropiedades/{id}/padron/viviendas/generacion', {
          params: { path: { id: copropiedadId } },
          body: { ...plan(), totalEsperado: vista.total },
        }),
      );
      setVista(null);
      alTerminar(respuesta.creadas);
    } catch (e) {
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo generar el padrón');
    } finally {
      setEnviando(false);
    }
  };

  const bloqueada = vista !== null && vista.colisiones.length > 0;

  return (
    <DialogoDeFormulario
      abierto={abierto}
      titulo={`Generar ${vocabulario.vivienda.toLowerCase()}s`}
      descripcion="Se crean todas o ninguna. Nada se sustituye: si alguna ya existe, la operación se niega entera y las nombra."
      etiquetaEnviar={
        vista === null ? 'Ver qué se va a crear' : `Crear ${String(vista.total)} viviendas`
      }
      enviando={enviando}
      error={error}
      puedeEnviar={!bloqueada}
      alEnviar={() => void (vista === null ? previsualizar() : confirmar())}
      alCancelar={() => {
        setVista(null);
        setError(undefined);
        alCerrar();
      }}
    >
      {tipo === 'apartamentos' ? (
        <>
          <Campo
            etiqueta={`Cuántas ${vocabulario.agrupacion.toLowerCase()}s`}
            type="number"
            min={1}
            value={agrupaciones}
            onChange={(e) => cambiar(setAgrupaciones)(e.target.value)}
          />
          <fieldset className="space-y-1.5">
            <legend className="block text-secundario font-medium text-texto">
              Cómo se identifican
            </legend>
            <div className="flex gap-4">
              {(
                [
                  ['numeros', 'Números, de menor a mayor (1, 2, 3…)'],
                  ['letras', 'Letras, en orden alfabético (A, B, C…)'],
                ] as const
              ).map(([valor, texto]) => (
                <label key={valor} className="flex items-center gap-2 text-secundario text-texto">
                  <input
                    type="radio"
                    name="estilo-de-agrupacion"
                    checked={estilo === valor}
                    onChange={() => cambiar(setEstilo)(valor)}
                  />
                  {texto}
                </label>
              ))}
            </div>
          </fieldset>
          <Campo
            etiqueta={`Cuántos pisos por ${vocabulario.agrupacion.toLowerCase()}`}
            type="number"
            min={1}
            value={pisos}
            onChange={(e) => cambiar(setPisos)(e.target.value)}
          />
          <Campo
            etiqueta="Cuántas viviendas por piso"
            type="number"
            min={1}
            value={porPiso}
            onChange={(e) => cambiar(setPorPiso)(e.target.value)}
            ayuda="Se numeran piso + número: con 3 por piso y 5 pisos, 101, 102, 103, 201… hasta 503."
          />

          <label className="flex items-start gap-2 text-secundario text-texto">
            <input
              type="checkbox"
              checked={hayExcepciones}
              onChange={(e) => {
                cambiar(setHayExcepciones)(e.target.checked);
                if (e.target.checked && excepciones.length === 0) {
                  setExcepciones([{ agrupacion: '', pisos: '', porPiso: '' }]);
                }
              }}
            />
            <span>
              Hay {vocabulario.agrupacion.toLowerCase()}s con menos pisos o menos viviendas
              <span className="block text-texto-apagado">
                Lo normal en un conjunto que se amplió por etapas.
              </span>
            </span>
          </label>

          {hayExcepciones
            ? excepciones.map((excepcion, indice) => (
                <div
                  key={indice}
                  className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2 rounded-md border border-borde p-3"
                >
                  <Campo
                    etiqueta={vocabulario.agrupacion}
                    value={excepcion.agrupacion}
                    onChange={(e) =>
                      cambiar(setExcepciones)(
                        excepciones.map((x, i) =>
                          i === indice ? { ...x, agrupacion: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <Campo
                    etiqueta="Pisos"
                    type="number"
                    min={1}
                    value={excepcion.pisos}
                    onChange={(e) =>
                      cambiar(setExcepciones)(
                        excepciones.map((x, i) =>
                          i === indice ? { ...x, pisos: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <Campo
                    etiqueta="Por piso"
                    type="number"
                    min={1}
                    value={excepcion.porPiso}
                    onChange={(e) =>
                      cambiar(setExcepciones)(
                        excepciones.map((x, i) =>
                          i === indice ? { ...x, porPiso: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <Boton
                    variante="secundario"
                    tamano="sm"
                    type="button"
                    aria-label={`Quitar la excepción ${String(indice + 1)}`}
                    onClick={() =>
                      cambiar(setExcepciones)(excepciones.filter((_, i) => i !== indice))
                    }
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </Boton>
                </div>
              ))
            : null}

          {hayExcepciones ? (
            <Boton
              variante="secundario"
              tamano="sm"
              type="button"
              onClick={() =>
                cambiar(setExcepciones)([
                  ...excepciones,
                  { agrupacion: '', pisos: '', porPiso: '' },
                ])
              }
            >
              <Plus aria-hidden className="size-4" /> Incluir otra excepción
            </Boton>
          ) : null}
        </>
      ) : null}

      {tipo === 'casas' ? (
        <>
          <Campo
            etiqueta={`Cuántas ${vocabulario.agrupacion.toLowerCase()}s`}
            type="number"
            min={0}
            value={secciones}
            onChange={(e) => cambiar(setSecciones)(e.target.value)}
            ayuda="0 si el conjunto no se divide: las viviendas serán solo número."
          />
          <Campo
            etiqueta={`Cuántas ${vocabulario.vivienda.toLowerCase()}s en total`}
            type="number"
            min={1}
            value={total}
            onChange={(e) => cambiar(setTotal)(e.target.value)}
            ayuda="Se reparten por igual y el resto va a la última. La vista previa lo enseña antes de crear nada."
          />
          <label className="flex items-center gap-2 text-secundario text-texto">
            <input
              type="checkbox"
              checked={reiniciar}
              onChange={(e) => cambiar(setReiniciar)(e.target.checked)}
            />
            Reiniciar la numeración en cada {vocabulario.agrupacion.toLowerCase()}
          </label>
        </>
      ) : null}

      {tipo === 'fincas' ? (
        <Campo
          etiqueta={`Cuántas ${vocabulario.vivienda.toLowerCase()}s`}
          type="number"
          min={1}
          value={cantidad}
          onChange={(e) => cambiar(setCantidad)(e.target.value)}
        />
      ) : null}

      {vista !== null ? (
        <section
          aria-label="Vista previa de la generación"
          className="space-y-2 rounded-md border border-borde bg-borde-suave p-3"
        >
          <p className="text-secundario font-medium text-texto">
            Se van a crear {vista.total} viviendas en {vista.grupos.length}{' '}
            {vista.grupos.length === 1
              ? vocabulario.agrupacion.toLowerCase()
              : `${vocabulario.agrupacion.toLowerCase()}s`}
          </p>
          <ul className="space-y-1">
            {vista.grupos.map((grupo) => (
              <li
                key={grupo.agrupacion ?? 'sin-agrupacion'}
                className="flex flex-wrap gap-x-3 text-secundario text-texto-apagado"
              >
                <span className="font-medium text-texto">
                  {nombreDeGrupo(vocabulario, grupo.agrupacion)}
                </span>
                <span className="tabular-nums">{grupo.cantidad} viviendas</span>
                <span className="tabular-nums">
                  {grupo.primeras.join(', ')}
                  {grupo.ultimas.length > 0 ? ` … ${grupo.ultimas.join(', ')}` : ''}
                </span>
                {grupo.porExcepcion ? <span>(excepción)</span> : null}
              </li>
            ))}
          </ul>
          {vista.colisiones.length > 0 ? (
            <p
              role="alert"
              className="rounded-md border border-peligro bg-peligro-suave px-3 py-2 text-secundario text-peligro-texto"
            >
              No se puede continuar: ya existen{' '}
              {vista.colisiones
                .slice(0, 10)
                .map((c) =>
                  c.agrupacion === null
                    ? c.identificador
                    : `${nombreDeGrupo(vocabulario, c.agrupacion)} · ${c.identificador}`,
                )
                .join(', ')}
              {vista.colisiones.length > 10 ? ` y ${vista.colisiones.length - 10} más` : ''}. La
              generación no sustituye nada.
            </p>
          ) : null}
        </section>
      ) : null}
    </DialogoDeFormulario>
  );
};
