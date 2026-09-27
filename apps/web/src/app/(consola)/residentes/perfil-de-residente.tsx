'use client';

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CuentaDeResidente } from '@ncr/contracts';
import { Campo } from '@/componentes/ui/campo';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { cliente, textoDelError } from '@/lib/api/cliente';

const TIPOS = [
  { valor: 'cedula', etiqueta: 'Cédula de ciudadanía' },
  { valor: 'cedula_extranjeria', etiqueta: 'Cédula de extranjería' },
  { valor: 'pasaporte', etiqueta: 'Pasaporte' },
  { valor: 'otro', etiqueta: 'Otro' },
] as const;
type TipoDeDocumento = (typeof TIPOS)[number]['valor'];

interface Borrador {
  nombres: string;
  apellidos: string;
  fechaNacimiento: string;
  tipoDocumento: TipoDeDocumento;
  numeroDocumento: string;
  correo: string;
  telefono: string;
}

const VACIO: Borrador = {
  nombres: '',
  apellidos: '',
  fechaNacimiento: '',
  tipoDocumento: 'cedula',
  numeroDocumento: '',
  correo: '',
  telefono: '',
};

const esTipo = (v: string | null): v is TipoDeDocumento => TIPOS.some((t) => t.valor === v);

/** Los rechazos por campo que devuelve la API al validar el perfil. */
const camposRechazados = (error: unknown): Record<string, string> => {
  const mensaje = (error as { mensaje?: unknown } | null)?.mensaje;
  const campos = (mensaje as { campos?: unknown } | null | undefined)?.campos;
  if (!Array.isArray(campos)) return {};
  return Object.fromEntries(
    campos.flatMap((c: unknown) => {
      const { campo, motivo } = (c ?? {}) as { campo?: unknown; motivo?: unknown };
      return typeof campo === 'string' && typeof motivo === 'string' ? [[campo, motivo]] : [];
    }),
  );
};

/**
 * G (15-L) · el superadministrador edita el perfil de un residente: los mismos
 * campos que el residente edita en la app, con las mismas reglas del servidor.
 * Cada cambio queda en la bitácora del residente con quién lo hizo y qué campos
 * tocó (nunca los valores).
 */
export const DialogoDePerfilDeResidente = ({
  copropiedadId,
  cuenta,
  alCerrar,
}: {
  readonly copropiedadId: string;
  readonly cuenta: CuentaDeResidente | null;
  readonly alCerrar: () => void;
}): JSX.Element => {
  const consultas = useQueryClient();
  const [borrador, setBorrador] = useState<Borrador>(VACIO);
  const [cargando, setCargando] = useState(false);
  const [rechazos, setRechazos] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    setRechazos({});
    setError(undefined);
    setBorrador(VACIO);
    if (cuenta === null) return;
    setCargando(true);
    void cliente
      .GET('/copropiedades/{id}/residentes/cuentas/{usuarioId}/perfil', {
        params: { path: { id: copropiedadId, usuarioId: cuenta.usuarioId } },
      })
      .then(({ data, error: fallo }) => {
        if (data === undefined) {
          setError(textoDelError(fallo));
          return;
        }
        setBorrador({
          nombres: data.nombres ?? '',
          apellidos: data.apellidos ?? '',
          fechaNacimiento: data.fechaNacimiento ?? '',
          tipoDocumento: esTipo(data.tipoDocumento) ? data.tipoDocumento : 'cedula',
          numeroDocumento: data.numeroDocumento ?? '',
          correo: data.correo ?? '',
          telefono: data.telefono ?? '',
        });
      })
      .finally(() => setCargando(false));
  }, [copropiedadId, cuenta]);

  const cambiar = (campo: keyof Borrador, valor: string): void =>
    setBorrador((b) => ({ ...b, [campo]: valor }));

  const guardar = async (): Promise<void> => {
    if (cuenta === null) return;
    setEnviando(true);
    setError(undefined);
    setRechazos({});
    try {
      const { data, error: fallo } = await cliente.PUT(
        '/copropiedades/{id}/residentes/cuentas/{usuarioId}/perfil',
        {
          params: { path: { id: copropiedadId, usuarioId: cuenta.usuarioId } },
          body: {
            ...borrador,
            fechaNacimiento: borrador.fechaNacimiento === '' ? null : borrador.fechaNacimiento,
          },
        },
      );
      if (data === undefined) {
        const porCampo = camposRechazados(fallo);
        setRechazos(porCampo);
        if (Object.keys(porCampo).length === 0) setError(textoDelError(fallo));
        return;
      }
      if (!data.guardado) {
        setRechazos({ numeroDocumento: 'Ese documento ya es de otra persona de la copropiedad.' });
        return;
      }
      await consultas.invalidateQueries({ queryKey: ['residentes', copropiedadId] });
      alCerrar();
    } catch {
      setError('No hay conexión con el servidor.');
    } finally {
      setEnviando(false);
    }
  };

  const completo =
    borrador.nombres.trim() !== '' &&
    borrador.apellidos.trim() !== '' &&
    borrador.numeroDocumento.trim().length >= 4 &&
    borrador.correo.trim() !== '' &&
    borrador.telefono.trim() !== '';

  return (
    <DialogoDeFormulario
      abierto={cuenta !== null}
      titulo={`Perfil de ${cuenta?.nombre ?? ''}`}
      descripcion="Los mismos datos que el residente ve y edita en la app. El cambio queda en su historial con tu nombre."
      etiquetaEnviar="Guardar"
      enviando={enviando}
      error={error}
      puedeEnviar={!cargando && completo}
      alEnviar={() => void guardar()}
      alCancelar={alCerrar}
    >
      {cargando ? (
        <p role="status" className="text-secundario text-texto-apagado">
          Cargando el perfil…
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            etiqueta="Nombres"
            name="nombres"
            required
            value={borrador.nombres}
            onChange={(e) => cambiar('nombres', e.target.value)}
            error={rechazos['nombres']}
          />
          <Campo
            etiqueta="Apellidos"
            name="apellidos"
            required
            value={borrador.apellidos}
            onChange={(e) => cambiar('apellidos', e.target.value)}
            error={rechazos['apellidos']}
          />
          <label className="block space-y-1.5">
            <span className="block text-etiqueta font-medium text-texto">Tipo de documento</span>
            <select
              name="tipoDocumento"
              value={borrador.tipoDocumento}
              onChange={(e) => cambiar('tipoDocumento', e.target.value)}
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
            name="numeroDocumento"
            required
            value={borrador.numeroDocumento}
            onChange={(e) => cambiar('numeroDocumento', e.target.value)}
            error={rechazos['numeroDocumento']}
          />
          <Campo
            etiqueta="Fecha de nacimiento"
            name="fechaNacimiento"
            type="date"
            value={borrador.fechaNacimiento}
            onChange={(e) => cambiar('fechaNacimiento', e.target.value)}
            error={rechazos['fechaNacimiento']}
          />
          <Campo
            etiqueta="Teléfono"
            name="telefono"
            inputMode="tel"
            required
            value={borrador.telefono}
            onChange={(e) => cambiar('telefono', e.target.value)}
            error={rechazos['telefono']}
          />
          <div className="sm:col-span-2">
            <Campo
              etiqueta="Correo de contacto"
              name="correo"
              type="email"
              required
              value={borrador.correo}
              onChange={(e) => cambiar('correo', e.target.value)}
              error={rechazos['correo']}
              ayuda="Sólo para contactarlo: no sirve para entrar."
            />
          </div>
        </div>
      )}
    </DialogoDeFormulario>
  );
};
