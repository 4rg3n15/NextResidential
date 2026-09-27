'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { VisitaGenerada } from '@ncr/contracts';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { CapturaDeFoto } from '@/componentes/captura-de-foto';
import type { FotoLista } from '@/componentes/captura-de-foto';
import { Campo } from '@/componentes/ui/campo';
import { Ayuda } from '@/componentes/ui/ayuda';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { clavesDeVisitas, useTextoDeLaCasilla, useViviendasDeVisitas } from '@/lib/api/visitas';

const TIPOS = [
  { valor: 'cedula', etiqueta: 'Cédula de ciudadanía' },
  { valor: 'cedula_extranjeria', etiqueta: 'Cédula de extranjería' },
  { valor: 'pasaporte', etiqueta: 'Pasaporte' },
  { valor: 'otro', etiqueta: 'Otro' },
] as const;
type TipoDeDocumento = (typeof TIPOS)[number]['valor'];

export const DURACIONES = [
  { minutos: 30, etiqueta: '30 minutos' },
  { minutos: 60, etiqueta: '1 hora' },
  { minutos: 120, etiqueta: '2 horas' },
  { minutos: 240, etiqueta: '4 horas' },
  { minutos: 480, etiqueta: '8 horas' },
  { minutos: 720, etiqueta: '12 horas' },
  { minutos: 1440, etiqueta: '24 horas' },
] as const;

/** Hoy y la hora actual, en hora local del navegador, para precargar el formulario. */
const ahoraLocal = (): { fecha: string; hora: string } => {
  const d = new Date();
  const dos = (n: number): string => String(n).padStart(2, '0');
  return {
    fecha: `${String(d.getFullYear())}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`,
    hora: `${dos(d.getHours())}:${dos(d.getMinutes())}`,
  };
};

const MOTIVOS_DE_FOTO: Readonly<Record<string, string>> = {
  ROSTROS_MULTIPLES: 'se ve más de un rostro',
  SIN_ROSTRO: 'no se ve ningún rostro',
  NITIDEZ: 'la foto está borrosa',
  ILUMINACION: 'la luz no es suficiente o sobra',
  ENCUADRE: 'el rostro no está bien encuadrado',
};

/**
 * F1 (15-L) · «GENERAR AUTORIZACIÓN», igual para todos los roles de la consola.
 *
 * Pide lo que pide la app del residente: nombre y documento, fecha y hora,
 * duración, la vivienda, la foto frontal y la casilla. La visita nace vigente
 * (F2) y la foto sale a todos los equipos con rostros (F3): al terminar se dice
 * cuántos la aceptaron y cuáles no.
 */
export const GenerarAutorizacion = ({
  copropiedadId,
  abierto,
  alCerrar,
}: {
  readonly copropiedadId: string;
  readonly abierto: boolean;
  readonly alCerrar: () => void;
}): JSX.Element => {
  const consultas = useQueryClient();
  const viviendas = useViviendasDeVisitas(copropiedadId);
  const casilla = useTextoDeLaCasilla(copropiedadId);
  const inicial = ahoraLocal();

  const [nombre, setNombre] = useState('');
  const [tipoDocumento, setTipo] = useState<TipoDeDocumento>('cedula');
  const [documento, setDocumento] = useState('');
  const [viviendaId, setViviendaId] = useState('');
  const [fecha, setFecha] = useState(inicial.fecha);
  const [hora, setHora] = useState(inicial.hora);
  const [duracion, setDuracion] = useState(120);
  const [placa, setPlaca] = useState('');
  const [foto, setFoto] = useState<FotoLista | null>(null);
  const [casillaMarcada, setCasilla] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [resultado, setResultado] = useState<VisitaGenerada | null>(null);
  /** La captura se vuelve a montar para vaciarla al generar otra. */
  const [ronda, setRonda] = useState(0);

  const completo =
    nombre.trim().length >= 3 &&
    documento.trim().length >= 4 &&
    viviendaId !== '' &&
    fecha !== '' &&
    hora !== '' &&
    foto !== null &&
    casillaMarcada;

  const limpiar = (): void => {
    setNombre('');
    setDocumento('');
    setViviendaId('');
    setPlaca('');
    setFoto(null);
    setCasilla(false);
    setError(undefined);
    setRonda((r) => r + 1);
  };

  const cerrar = (): void => {
    limpiar();
    setResultado(null);
    alCerrar();
  };

  const generar = async (): Promise<void> => {
    if (!completo || foto === null) return;
    setEnviando(true);
    setError(undefined);
    try {
      const r = desenvolver(
        await cliente.POST('/copropiedades/{id}/visitas', {
          params: { path: { id: copropiedadId } },
          body: {
            nombre: nombre.trim(),
            tipoDocumento,
            documento: documento.trim(),
            viviendaId,
            inicio: new Date(`${fecha}T${hora}:00`).toISOString(),
            duracionMinutos: duracion,
            placa: placa.trim() === '' ? null : placa.trim(),
            foto,
            casillaMarcada,
          },
        }),
      );
      if (!r.generada) {
        const porque = r.motivosDeFoto.map((m) => MOTIVOS_DE_FOTO[m] ?? m).join(', ');
        setError(`La foto no sirve: ${porque}. Tome otra.`);
        return;
      }
      setResultado(r);
      limpiar();
      await consultas.invalidateQueries({ queryKey: clavesDeVisitas.raiz(copropiedadId) });
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : 'No hay conexión con el servidor.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <DialogoDeFormulario
      abierto={abierto}
      titulo="Generar autorización"
      descripcion="La visita queda autorizada al guardarla. Portería puede rechazarla."
      etiquetaEnviar={enviando ? 'Generando…' : 'Generar autorización'}
      enviando={enviando}
      error={error}
      puedeEnviar={completo && !enviando}
      alEnviar={() => void generar()}
      alCancelar={cerrar}
    >
      {resultado !== null ? (
        <div role="status" className="space-y-1 rounded-md border border-borde p-3 text-secundario">
          <p className="font-medium text-texto">Autorización generada.</p>
          <p>
            Foto enviada a {String(resultado.sincronizadas)} de {String(resultado.equipos)} equipos
            {resultado.fallidas > 0 ? `; ${String(resultado.fallidas)} no la aceptaron` : ''}.
          </p>
          {resultado.porEquipo
            .filter((e) => !e.sincronizada)
            .map((e) => (
              <p key={e.dispositivoId} className="text-aviso-texto">
                {e.nombre}: {e.detalle}
              </p>
            ))}
          {resultado.avisoDeSincronizacion !== null ? (
            <p className="text-aviso-texto">{resultado.avisoDeSincronizacion}</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Campo
            etiqueta="Nombre del visitante"
            name="nombre"
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>
        <label className="block space-y-1.5">
          <span className="block text-etiqueta font-medium text-texto">Tipo de documento</span>
          <select
            name="tipoDocumento"
            value={tipoDocumento}
            onChange={(e) => setTipo(e.target.value as TipoDeDocumento)}
            className="h-11 w-full rounded-campo border border-borde bg-campo px-3 text-cuerpo text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
          >
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <Campo
          etiqueta="Número de documento"
          name="documento"
          required
          value={documento}
          onChange={(e) => setDocumento(e.target.value)}
        />
        <label className="block space-y-1.5 sm:col-span-2">
          <span className="block text-etiqueta font-medium text-texto">Vivienda que visita</span>
          <select
            name="viviendaId"
            required
            value={viviendaId}
            onChange={(e) => setViviendaId(e.target.value)}
            className="h-11 w-full rounded-campo border border-borde bg-campo px-3 text-cuerpo text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
          >
            <option value="">
              {viviendas.isLoading ? 'Cargando viviendas…' : 'Elija la vivienda'}
            </option>
            {(viviendas.data ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.nombre}
              </option>
            ))}
          </select>
        </label>
        <Campo
          etiqueta="Fecha de la visita"
          name="fecha"
          type="date"
          required
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />
        <Campo
          etiqueta="Hora de llegada"
          name="hora"
          type="time"
          required
          value={hora}
          onChange={(e) => setHora(e.target.value)}
        />
        <label className="block space-y-1.5">
          <span className="block text-etiqueta font-medium text-texto">Duración</span>
          <select
            name="duracion"
            value={duracion}
            onChange={(e) => setDuracion(Number(e.target.value))}
            className="h-11 w-full rounded-campo border border-borde bg-campo px-3 text-cuerpo text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto"
          >
            {DURACIONES.map((d) => (
              <option key={d.minutos} value={d.minutos}>
                {d.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <Campo
          etiqueta="Placa (opcional)"
          name="placa"
          value={placa}
          onChange={(e) => setPlaca(e.target.value.toUpperCase())}
          ayuda="Sólo si entra en vehículo."
        />
        <div className="sm:col-span-2">
          <CapturaDeFoto key={ronda} alCambiar={setFoto} />
        </div>
        <label className="flex items-start gap-2 sm:col-span-2">
          <input
            type="checkbox"
            name="casilla"
            checked={casillaMarcada}
            onChange={(e) => setCasilla(e.target.checked)}
            required
          />
          <span className="text-secundario text-texto">
            {casilla.data?.texto ?? 'El visitante autorizó el uso de su foto para el ingreso'}
            <Ayuda texto="Queda guardado quién marcó la casilla y cuándo. La foto se borra de los equipos al terminar la visita o si se rechaza." />
          </span>
        </label>
      </div>
    </DialogoDeFormulario>
  );
};
