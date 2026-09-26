'use client';

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Campo } from '@/componentes/ui/campo';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { cliente, desenvolver } from '@/lib/api/cliente';
import { contrasenaValida, motivoDeRechazo } from '@/lib/politica-contrasena';

const FORMATO_USUARIO = /^[a-z0-9][a-z0-9._-]{2,31}$/;

/**
 * 3.1 · ALTA DEL RESIDENTE. El superadministrador escribe el usuario y la
 * contraseña inicial y se los entrega en persona junto al código de la
 * copropiedad. Sin correo (el que exige el proveedor es sintético y no sale de
 * la API) y sin vivienda: la declara el residente en su primer ingreso.
 */
export const DialogoDeResidente = ({
  copropiedadId,
  abierto,
  alCerrar,
}: {
  readonly copropiedadId: string;
  readonly abierto: boolean;
  readonly alCerrar: () => void;
}): JSX.Element => {
  const consultas = useQueryClient();
  const [usuario, setUsuario] = useState('');
  const [inicial, setInicial] = useState('');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setUsuario('');
    setInicial('');
    setNombre('');
    setTelefono('');
    setError(undefined);
  }, [abierto]);

  const usuarioValido = FORMATO_USUARIO.test(usuario.trim().toLowerCase());
  const enviar = async (): Promise<void> => {
    setEnviando(true);
    setError(undefined);
    try {
      desenvolver(
        await cliente.POST('/copropiedades/{id}/residentes/cuentas', {
          params: { path: { id: copropiedadId } },
          body: {
            usuario: usuario.trim().toLowerCase(),
            contrasenaInicial: inicial,
            nombre: nombre.trim(),
            ...(telefono.trim() === '' ? {} : { telefono: telefono.trim() }),
          },
        }),
      );
      await consultas.invalidateQueries({ queryKey: ['residentes', copropiedadId] });
      alCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo dar de alta.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <DialogoDeFormulario
      abierto={abierto}
      titulo="Nuevo residente"
      descripcion="Entra en la app con el código de la copropiedad, este usuario y la contraseña inicial, que tendrá que cambiar. En su primer ingreso declara su vivienda."
      etiquetaEnviar="Dar de alta"
      enviando={enviando}
      error={error}
      puedeEnviar={nombre.trim() !== '' && usuarioValido && contrasenaValida(inicial)}
      alEnviar={() => void enviar()}
      alCancelar={alCerrar}
    >
      <div className="space-y-3">
        <Campo
          etiqueta="Usuario"
          name="usuario"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
          ayuda="De 3 a 32: letras sin tilde, números, punto, guion o guion bajo. Por ejemplo, casa42.ana."
          error={usuario !== '' && !usuarioValido ? 'Formato no admitido.' : undefined}
        />
        <Campo
          etiqueta="Contraseña inicial"
          name="contrasenaInicial"
          type="password"
          autoComplete="new-password"
          required
          value={inicial}
          onChange={(e) => setInicial(e.target.value)}
          error={inicial !== '' ? (motivoDeRechazo(inicial) ?? undefined) : undefined}
        />
        <Campo
          etiqueta="Nombre"
          name="nombre"
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <Campo
          etiqueta="Teléfono"
          name="telefono"
          inputMode="tel"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
        />
      </div>
    </DialogoDeFormulario>
  );
};

/** D4 · restablecer la contraseña del residente: temporal escrita aquí y cambio obligatorio. */
export const DialogoDeRestablecimientoDeResidente = ({
  copropiedadId,
  cuenta,
  alCerrar,
}: {
  readonly copropiedadId: string;
  readonly cuenta: { readonly usuarioId: string; readonly nombre: string } | null;
  readonly alCerrar: () => void;
}): JSX.Element => {
  const consultas = useQueryClient();
  const [temporal, setTemporal] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    setTemporal('');
    setError(undefined);
  }, [cuenta]);

  const enviar = async (): Promise<void> => {
    if (cuenta === null) return;
    setEnviando(true);
    try {
      desenvolver(
        await cliente.POST('/copropiedades/{id}/usuarios/{usuarioId}/restablecimiento', {
          params: { path: { id: copropiedadId, usuarioId: cuenta.usuarioId } },
          body: { temporal },
        }),
      );
      await consultas.invalidateQueries({ queryKey: ['residentes', copropiedadId] });
      alCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo restablecer.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <DialogoDeFormulario
      abierto={cuenta !== null}
      titulo={`Restablecer la contraseña de ${cuenta?.nombre ?? ''}`}
      descripcion="Al volver a entrar con esta contraseña tendrá que cambiarla (D4). No hay correo: dísela en persona."
      etiquetaEnviar="Restablecer"
      enviando={enviando}
      error={error}
      puedeEnviar={contrasenaValida(temporal)}
      alEnviar={() => void enviar()}
      alCancelar={alCerrar}
    >
      <Campo
        etiqueta="Contraseña temporal"
        name="temporal"
        type="password"
        autoComplete="new-password"
        required
        value={temporal}
        onChange={(e) => setTemporal(e.target.value)}
        error={temporal !== '' ? (motivoDeRechazo(temporal) ?? undefined) : undefined}
      />
    </DialogoDeFormulario>
  );
};
