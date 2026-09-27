'use client';

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Portero } from '@ncr/contracts';
import { Campo } from '@/componentes/ui/campo';
import { DialogoDeFormulario } from '@/componentes/dialogo-formulario';
import { ErrorDeApi, cliente, desenvolver } from '@/lib/api/cliente';
import { contrasenaValida, motivoDeRechazo } from '@/lib/politica-contrasena';

/** El documento como lo normaliza la API: mayúsculas, sin espacios ni puntos. */
const documentoNormalizado = (texto: string): string =>
  texto.normalize('NFKC').toUpperCase().replace(/[\s.]/g, '');
const FORMATO_DOCUMENTO = /^[0-9A-Z-]{3,20}$/;
const sectoresDe = (texto: string): string[] =>
  texto
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .slice(0, 50);
const opcional = (v: string): string | undefined => (v.trim() === '' ? undefined : v.trim());

/**
 * ALTA Y DATOS DEL PORTERO. El alta lleva nombre, documento y contraseña
 * temporal; el NÚMERO con el que entrará lo asigna el sistema y se enseña al
 * terminar (`alCrear`), porque es lo que hay que decirle al portero. Con
 * `portero` es edición: el número no cambia nunca y la contraseña se
 * RESTABLECE, con su propio rastro. Los sectores son informativos: no filtran
 * alarmas, y el texto de ayuda lo dice.
 */
export const DialogoDePortero = ({
  copropiedadId,
  abierto,
  portero,
  alCerrar,
  alCrear,
}: {
  readonly copropiedadId: string;
  readonly abierto: boolean;
  readonly portero: Portero | null;
  readonly alCerrar: () => void;
  readonly alCrear?: (numero: number, nombre: string) => void;
}): JSX.Element => {
  const consultas = useQueryClient();
  const [documento, setDocumento] = useState('');
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
    setDocumento(portero?.documento ?? '');
    setInicial('');
    setNombre(portero?.nombre ?? '');
    setTelefono(portero?.telefono ?? '');
    setCorreo(portero?.correoContacto ?? '');
    setPorteria(portero?.porteria ?? '');
    setSectores((portero?.sectores ?? []).join(', '));
    setError(undefined);
  }, [abierto, portero]);

  const esAlta = portero === null;
  const documentoValido =
    (!esAlta && documento.trim() === '') || FORMATO_DOCUMENTO.test(documentoNormalizado(documento));
  const inicialValida = !esAlta || contrasenaValida(inicial);
  const datos = {
    nombre: nombre.trim(),
    sectores: sectoresDe(sectores),
    ...(opcional(telefono) === undefined ? {} : { telefono: telefono.trim() }),
    ...(opcional(correo) === undefined ? {} : { correoContacto: correo.trim() }),
    ...(opcional(porteria) === undefined ? {} : { porteria: porteria.trim() }),
    ...(opcional(documento) === undefined ? {} : { documento: documentoNormalizado(documento) }),
  };

  const enviar = async (): Promise<void> => {
    setEnviando(true);
    setError(undefined);
    try {
      if (esAlta) {
        const creado = desenvolver(
          await cliente.POST('/copropiedades/{id}/porteros', {
            params: { path: { id: copropiedadId } },
            body: {
              ...datos,
              documento: documentoNormalizado(documento),
              contrasenaInicial: inicial,
            },
          }),
        );
        alCrear?.(creado.numero, datos.nombre);
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
          ? 'El sistema le asigna un número, que verás al terminar: con él y la contraseña entra. La contraseña inicial la escribes tú y tendrá que cambiarla en su primer ingreso.'
          : `Entra con el número ${String(portero.numero ?? '—')}, que no cambia. Para una contraseña nueva, usa «Restablecer contraseña».`
      }
      etiquetaEnviar={esAlta ? 'Dar de alta' : 'Guardar'}
      enviando={enviando}
      error={error}
      puedeEnviar={nombre.trim() !== '' && documentoValido && inicialValida}
      alEnviar={() => void enviar()}
      alCancelar={alCerrar}
    >
      <div className="space-y-3">
        <Campo
          etiqueta="Documento de identidad"
          name="documento"
          autoCapitalize="characters"
          spellCheck={false}
          required={esAlta}
          value={documento}
          onChange={(e) => setDocumento(e.target.value)}
          ayuda="De 3 a 20 letras, números o guiones; los puntos y espacios se quitan."
          error={documento !== '' && !documentoValido ? 'Formato no admitido.' : undefined}
        />
        {esAlta ? (
          <>
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
          ayuda="Separados por comas. Son informativos: el portero sigue viendo todas las alarmas."
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
