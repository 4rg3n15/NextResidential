'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import type { ResultadoDeCarga } from '@ncr/contracts';
import { Boton } from '@/componentes/ui/boton';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';

/**
 * Carga de padrón desde XLSX (HU-03, D-20t).
 *
 * **La validación de verdad está en el servidor y aquí se dice.** Este
 * componente comprueba tres cosas antes de enviar —que haya archivo, que no
 * exceda el tamaño y que el nombre acabe en `.xlsx`—, y ninguna de las tres es
 * una garantía: la extensión la elige quien sube el archivo. El servidor
 * comprueba la FIRMA del contenido, acota entradas, razón de compresión y
 * filas, y rechaza entidades XML. Lo de aquí ahorra un viaje; lo de allí es lo
 * que protege.
 *
 * **La carga es de todo o nada.** Si una fila falla, no entra ninguna: por eso
 * el resultado muestra los errores fila a fila y dice explícitamente si se
 * aplicó. Una carga a medias deja al administrador sin saber qué quedó dentro,
 * y reintentar duplicaría lo que sí pasó.
 */
const MAXIMO_BYTES = 180 * 1024;

export const CargaDePadron = ({ alTerminar }: { readonly alTerminar: () => void }): JSX.Element => {
  const [abierto, setAbierto] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [resultado, setResultado] = useState<ResultadoDeCarga | null>(null);

  const enviar = async (): Promise<void> => {
    if (archivo === null) return;
    setEnviando(true);
    setError(undefined);
    setResultado(null);
    try {
      const bytes = new Uint8Array(await archivo.arrayBuffer());
      let binario = '';
      for (const b of bytes) binario += String.fromCharCode(b);
      const r = desenvolver(
        await cliente.POST('/padron/carga/xlsx', { body: { xlsxBase64: btoa(binario) } }),
      );
      setResultado(r);
      if (r.aplicada) alTerminar();
    } catch (e) {
      // El motivo del rechazo viaja tal cual: «no es un XLSX», «razón de
      // compresión sospechosa» y «supera las 5000 filas» llevan a tres
      // acciones distintas, y un «archivo inválido» genérico las borraría.
      setError(e instanceof ErrorDeApi ? e.message : 'No se pudo cargar el padrón');
    } finally {
      setEnviando(false);
    }
  };

  const demasiadoGrande = archivo !== null && archivo.size > MAXIMO_BYTES;

  return (
    <>
      <Boton variante="secundario" onClick={() => setAbierto(true)}>
        Cargar padrón
      </Boton>

      <DialogoDeFormulario
        abierto={abierto}
        titulo="Cargar padrón desde XLSX"
        descripcion="La primera fila es la cabecera y debe incluir «vivienda_id». Se admiten también «placa», «persona_id» y «es_titular»."
        etiquetaEnviar="Cargar"
        enviando={enviando}
        error={error}
        puedeEnviar={archivo !== null && !demasiadoGrande}
        alEnviar={() => void enviar()}
        alCancelar={() => {
          setAbierto(false);
          setError(undefined);
          setResultado(null);
          setArchivo(null);
        }}
      >
        <label className="block space-y-1.5">
          <span className="block text-secundario font-medium">Archivo .xlsx</span>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              setArchivo(e.target.files?.[0] ?? null);
              setResultado(null);
              setError(undefined);
            }}
            className="w-full rounded-campo border border-borde bg-white px-3 py-2 text-cuerpo"
          />
          <span className="block text-secundario text-texto-apagado">
            Hasta 180 kB. El servidor comprueba el contenido del archivo, no su extensión.
          </span>
        </label>

        {demasiadoGrande ? (
          <p role="alert" className="text-secundario text-peligro-texto">
            El archivo pesa {Math.round((archivo?.size ?? 0) / 1024)} kB y el máximo es 180 kB.
            Divide el padrón en varias cargas.
          </p>
        ) : null}

        {resultado !== null ? (
          <div
            role="status"
            className={
              resultado.aplicada
                ? 'rounded-md border border-exito bg-exito-suave px-3 py-2 text-secundario text-exito-texto'
                : 'rounded-md border border-peligro bg-peligro-suave px-3 py-2 text-secundario text-peligro-texto'
            }
          >
            <p className="font-semibold">
              {resultado.aplicada
                ? `Padrón cargado: ${resultado.aceptadas} filas de ${resultado.filasLeidas}.`
                : `No se aplicó nada. Se leyeron ${resultado.filasLeidas} filas y ${resultado.errores.length} tienen errores.`}
            </p>
            {resultado.errores.length > 0 ? (
              <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-auto pl-4">
                {resultado.errores.slice(0, 20).map((e) => (
                  <li key={`${e.fila}-${e.motivo}`}>
                    Fila {e.fila}: {e.motivo}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </DialogoDeFormulario>
    </>
  );
};
