'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { Campo } from '@/componentes/ui/campo';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { useMiFamilia } from '@/lib/api/residente';

const TIPOS = [
  { valor: 'automovil', etiqueta: 'Automóvil' },
  { valor: 'motocicleta', etiqueta: 'Motocicleta' },
  { valor: 'bicicleta', etiqueta: 'Bicicleta' },
  { valor: 'otro', etiqueta: 'Otro' },
] as const;
type TipoDeVehiculo = (typeof TIPOS)[number]['valor'];

const CLASE_DE_SELECT =
  'h-11 w-full rounded-campo border border-borde bg-campo px-3 text-cuerpo text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-texto';

/**
 * M-3 · «Registrar vehículo», los mismos campos que la app: placa, color,
 * modelo, marca opcional, tipo y quién lo usa (ocupantes activos de la
 * vivienda, elegidos con casillas; la API valida que sean de ESTA vivienda).
 * Un rechazo de negocio llega como 200 con explicación y se pinta tal cual.
 */
export const NuevoVehiculo = ({
  copropiedadId,
  abierto,
  alCerrar,
  alRegistrar,
}: {
  readonly copropiedadId: string;
  readonly abierto: boolean;
  readonly alCerrar: () => void;
  readonly alRegistrar: () => void;
}): JSX.Element => {
  const familia = useMiFamilia(copropiedadId);
  const ocupantes = (familia.data ?? []).filter((m) => m.activo);

  const [placa, setPlaca] = useState('');
  const [color, setColor] = useState('');
  const [modelo, setModelo] = useState('');
  const [marca, setMarca] = useState('');
  const [tipo, setTipo] = useState<TipoDeVehiculo>('automovil');
  const [elegidos, setElegidos] = useState<readonly string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const placaNormalizada = placa.toUpperCase().replace(/[\s-]/g, '');
  const completo =
    placaNormalizada.length >= 3 &&
    placaNormalizada.length <= 12 &&
    color.trim() !== '' &&
    modelo.trim() !== '' &&
    elegidos.length > 0;

  const limpiar = (): void => {
    setPlaca('');
    setColor('');
    setModelo('');
    setMarca('');
    setTipo('automovil');
    setElegidos([]);
    setError(undefined);
  };

  const alternar = (residenteId: string, marcado: boolean): void =>
    setElegidos((e) => (marcado ? [...e, residenteId] : e.filter((x) => x !== residenteId)));

  const registrar = async (): Promise<void> => {
    if (!completo) return;
    setEnviando(true);
    setError(undefined);
    try {
      const r = desenvolver(
        await cliente.POST('/copropiedades/{id}/mi/vehiculos', {
          params: { path: { id: copropiedadId } },
          body: {
            placa: placaNormalizada,
            color: color.trim(),
            modelo: modelo.trim(),
            marca: marca.trim() === '' ? null : marca.trim(),
            tipo,
            ocupantes: [...elegidos],
          },
        }),
      );
      if (!r.registrado) {
        const explicacion = r.explicacion ?? 'El conjunto no admitió el vehículo.';
        setError(
          r.motivo === 'TOPE_ALCANZADO'
            ? `${explicacion} Si necesitas registrar otro, pídeselo a la administración.`
            : explicacion,
        );
        return;
      }
      limpiar();
      alRegistrar();
      alCerrar();
    } catch (fallo) {
      setError(fallo instanceof ErrorDeApi ? fallo.message : 'No hay conexión con el servidor.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <DialogoDeFormulario
      abierto={abierto}
      titulo="Registrar vehículo"
      descripcion="Con la placa registrada, la entrada reconoce el vehículo como de tu vivienda."
      etiquetaEnviar={enviando ? 'Registrando…' : 'Registrar'}
      enviando={enviando}
      error={error}
      puedeEnviar={completo && !enviando}
      alEnviar={() => void registrar()}
      alCancelar={() => {
        limpiar();
        alCerrar();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          etiqueta="Placa"
          name="placa"
          required
          value={placa}
          onChange={(e) => setPlaca(e.target.value.toUpperCase())}
          ayuda="Se guarda en mayúsculas, sin espacios ni guiones."
        />
        <Campo
          etiqueta="Color"
          name="color"
          required
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
        <Campo
          etiqueta="Modelo"
          name="modelo"
          required
          value={modelo}
          onChange={(e) => setModelo(e.target.value)}
        />
        <Campo
          etiqueta="Marca (opcional)"
          name="marca"
          value={marca}
          onChange={(e) => setMarca(e.target.value)}
        />
        <label className="block space-y-1.5 sm:col-span-2">
          <span className="block text-secundario font-medium text-texto">Tipo</span>
          <select
            name="tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoDeVehiculo)}
            className={CLASE_DE_SELECT}
          >
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="space-y-1.5 sm:col-span-2">
          <legend className="text-secundario font-medium text-texto">¿Quién lo usa?</legend>
          {familia.isLoading ? (
            <p role="status" className="text-secundario text-texto-apagado">
              Cargando los ocupantes…
            </p>
          ) : null}
          {familia.data !== undefined && ocupantes.length === 0 ? (
            <p className="text-secundario text-texto-apagado">
              No hay ocupantes activos en tu vivienda.
            </p>
          ) : null}
          {ocupantes.map((o) => (
            <label key={o.residenteId} className="flex items-center gap-2 text-cuerpo text-texto">
              <input
                type="checkbox"
                name="ocupantes"
                checked={elegidos.includes(o.residenteId)}
                onChange={(e) => alternar(o.residenteId, e.target.checked)}
              />
              {o.nombre}
            </label>
          ))}
          {elegidos.length === 0 && ocupantes.length > 0 ? (
            <p className="text-secundario text-texto-apagado">
              Elige al menos un ocupante que use el vehículo.
            </p>
          ) : null}
        </fieldset>
      </div>
    </DialogoDeFormulario>
  );
};
