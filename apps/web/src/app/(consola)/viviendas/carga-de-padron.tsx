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

export const CargaDePadron = ({
  copropiedadId,
  alTerminar,
}: {
  /** Destino de la carga. Va en la ruta, no en el token (D-71). */
  readonly copropiedadId: string;
  readonly alTerminar: () => void;
}): JSX.Element => {
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
        // D-71 · la copropiedad de destino en la ruta, no en el token.
        await cliente.POST('/copropiedades/{id}/padron/carga/xlsx', {
          params: { path: { id: copropiedadId } },
          body: { xlsxBase64: btoa(binario) },
        }),
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
        descripcion="La primera fila es la cabecera. La única obligatoria es «identificador»: el número de la vivienda, como está en la puerta."
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
        {/* D-72 · la hoja se rellena con lo que el conjunto tiene escrito. Antes
            pedía «vivienda_id» y «persona_id»: identificadores que solo existen
            dentro de la base, así que la hoja no la podía llenar nadie. */}
        <div className="rounded-campo border border-borde bg-lienzo px-3 py-2 text-secundario text-texto-apagado">
          <p className="font-medium text-texto">Columnas de la hoja</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>
              <strong>identificador</strong> — obligatoria. El número: «42», «101». Si su archivo
              trae la palabra delante —«Casa 42»— se guarda sin ella y el resumen lo cuenta. Si la
              vivienda no existe todavía, se crea y el resumen también lo dice.
            </li>
            <li>
              <strong>agrupacion</strong> — torre, bloque, manzana, sección o sector. Hace falta
              cuando el conjunto agrupa: el 101 de la torre 1 y el de la torre 2 son dos viviendas
              distintas. Si su conjunto no agrupa, la columna sobra.
            </li>
            <li>
              <strong>placa</strong> — para registrar un vehículo de esa vivienda.
            </li>
            <li>
              <strong>documento</strong> y <strong>nombre</strong> — para registrar un residente. El
              mismo documento en dos filas es la misma persona, se escriba con puntos o sin ellos.
            </li>
            <li>
              <strong>tipo_documento</strong> y <strong>es_titular</strong> — opcionales; por
              omisión, cédula y no titular.
            </li>
          </ul>
        </div>

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
            className="w-full rounded-campo border border-borde bg-campo px-3 py-2 text-cuerpo"
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
            {/* Lo creado se DICE. La hoja nombra la vivienda por su
                identificador, así que una errata crea una casa que nadie
                quería: con el número delante se ve en el momento. */}
            {resultado.aplicada &&
            (resultado.viviendasCreadas > 0 || resultado.personasCreadas > 0) ? (
              <p className="mt-1">
                Se crearon {resultado.viviendasCreadas} vivienda
                {resultado.viviendasCreadas === 1 ? '' : 's'} y {resultado.personasCreadas} persona
                {resultado.personasCreadas === 1 ? '' : 's'}. Si alguno de esos números te
                sorprende, revisa la hoja: una errata en «identificador» crea una vivienda nueva.
              </p>
            ) : null}
            {/* El recorte de la palabra se CUENTA. Es lo que impide que sea
                silencioso: quien cargó «Casa 42» ve que se guardó «42» y por
                qué, en vez de descubrirlo al buscar y no encontrarla. */}
            {resultado.aplicada && resultado.identificadoresRecortados > 0 ? (
              <p className="mt-1">
                {resultado.identificadoresRecortados} identificador
                {resultado.identificadoresRecortados === 1 ? '' : 'es'} traía
                {resultado.identificadoresRecortados === 1 ? '' : 'n'} la palabra dentro y se guardó
                {resultado.identificadoresRecortados === 1 ? '' : 'aron'} solo con el número: la
                palabra la pone el sistema al mostrar.
              </p>
            ) : null}
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
