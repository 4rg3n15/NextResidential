'use client';

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Portero } from '@ncr/contracts';
import { Campo } from '@/componentes/ui/campo';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { contrasenaValida, motivoDeRechazo } from '@/lib/politica-contrasena';

const FORMATO_USUARIO = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const sectoresDe = (texto: string): string[] =>
  texto
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .slice(0, 50);
const opcional = (v: string): string | undefined => (v.trim() === '' ? undefined : v.trim());

/**
 * ALTA Y DATOS DEL PORTERO (E-02). Con `portero` es edición: el usuario y la
 * contraseña no se tocan aquí —el usuario es la identidad; la contraseña se
 * RESTABLECE, con su propio rastro—. Los sectores se registran y son
 * INFORMATIVOS (P-17): no filtran alarmas, y el texto de ayuda lo dice.
 */
export const DialogoDePortero = ({
  copropiedadId,
  abierto,
  portero,
  alCerrar,
}: {
  readonly copropiedadId: string;
  readonly abierto: boolean;
  readonly portero: Portero | null;
  readonly alCerrar: () => void;
}): JSX.Element => {
  const consultas = useQueryClient();
  const [usuario, setUsuario] = useState('');
  const [inicial, setInicial] = useState('');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');
  const [porteria, setPorteria] = useState('');
  const [sectores, setSectores] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setUsuario(portero?.usuario ?? '');
    setInicial('');
    setNombre(portero?.nombre ?? '');
    setTelefono(portero?.telefono ?? '');
    setCorreo(portero?.correoContacto ?? '');
    setPorteria(portero?.porteria ?? '');
    setSectores((portero?.sectores ?? []).join(', '));
    setError(undefined);
  }, [abierto, portero]);

  const esAlta = portero === null;
  const usuarioValido = !esAlta || FORMATO_USUARIO.test(usuario.trim().toLowerCase());
  const inicialValida = !esAlta || contrasenaValida(inicial);
  const datos = {
    nombre: nombre.trim(),
    sectores: sectoresDe(sectores),
    ...(opcional(telefono) === undefined ? {} : { telefono: telefono.trim() }),
    ...(opcional(correo) === undefined ? {} : { correoContacto: correo.trim() }),
    ...(opcional(porteria) === undefined ? {} : { porteria: porteria.trim() }),
  };

  const enviar = async (): Promise<void> => {
    setEnviando(true);
    setError(undefined);
    try {
      if (esAlta) {
        desenvolver(
          await cliente.POST('/copropiedades/{id}/porteros', {
            params: { path: { id: copropiedadId } },
            body: { ...datos, usuario: usuario.trim().toLowerCase(), contrasenaInicial: inicial },
          }),
        );
      } else {
        desenvolver(
          await cliente.PUT('/copropiedades/{id}/porteros/{usuarioId}', {
            params: { path: { id: copropiedadId, usuarioId: portero.usuarioId } },
            body: datos,
          }),
        );
      }
      await consultas.invalidateQueries({ queryKey: ['porteria', copropiedadId] });
      alCerrar();
    } catch (e) {
      setError(e instanceof ErrorDeApi || e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <DialogoDeFormulario
      abierto={abierto}
      titulo={esAlta ? 'Nuevo portero' : `Datos de ${portero.nombre}`}
      descripcion={
        esAlta
          ? 'El portero entra con este usuario y el NIT de la copropiedad. La contraseña inicial la escribes tú y tendrá que cambiarla en su primer ingreso.'
          : 'El usuario no cambia. Para una contraseña nueva, usa «Restablecer contraseña».'
      }
      etiquetaEnviar={esAlta ? 'Dar de alta' : 'Guardar'}
      enviando={enviando}
      error={error}
      puedeEnviar={nombre.trim() !== '' && usuarioValido && inicialValida}
      alEnviar={() => void enviar()}
      alCancelar={alCerrar}
    >
      <div className="space-y-3">
        {esAlta ? (
          <>
            <Campo
              etiqueta="Usuario (identificación del portero)"
              name="usuario"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              ayuda="De 3 a 32: letras sin tilde, números, punto, guion o guion bajo."
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
          </>
        ) : null}
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
        <Campo
          etiqueta="Correo de contacto"
          name="correoContacto"
          type="email"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          ayuda="Sólo de contacto: no sirve para entrar ni para recuperar la contraseña."
        />
        <Campo
          etiqueta="Portería"
          name="porteria"
          value={porteria}
          onChange={(e) => setPorteria(e.target.value)}
          placeholder="Principal, Norte…"
        />
        <Campo
          etiqueta="Torres, sectores o fincas"
          name="sectores"
          value={sectores}
          onChange={(e) => setSectores(e.target.value)}
          ayuda="Separados por comas. Son informativos: el portero sigue viendo todas las alarmas (P-17)."
        />
      </div>
    </DialogoDeFormulario>
  );
};

/** Restablecer la contraseña del portero: temporal escrita aquí y cambio obligatorio (S-51). */
export const DialogoDeRestablecimiento = ({
  copropiedadId,
  portero,
  alCerrar,
}: {
  readonly copropiedadId: string;
  readonly portero: Portero | null;
  readonly alCerrar: () => void;
}): JSX.Element => {
  const consultas = useQueryClient();
  const [temporal, setTemporal] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    setTemporal('');
    setError(undefined);
  }, [portero]);

  const enviar = async (): Promise<void> => {
    if (portero === null) return;
    setEnviando(true);
    setError(undefined);
    try {
      desenvolver(
        await cliente.POST('/copropiedades/{id}/usuarios/{usuarioId}/restablecimiento', {
          params: { path: { id: copropiedadId, usuarioId: portero.usuarioId } },
          body: { temporal },
        }),
      );
      await consultas.invalidateQueries({ queryKey: ['porteria', copropiedadId] });
      alCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo restablecer.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <DialogoDeFormulario
      abierto={portero !== null}
      titulo={`Restablecer la contraseña de ${portero?.nombre ?? ''}`}
      descripcion="Su sesión abierta se cierra ahora y, al volver a entrar con esta contraseña, tendrá que cambiarla. Queda en la bitácora con tu nombre."
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
        ayuda="Dísela en persona o por un canal seguro: el sistema no la envía ni la muestra."
      />
    </DialogoDeFormulario>
  );
};
