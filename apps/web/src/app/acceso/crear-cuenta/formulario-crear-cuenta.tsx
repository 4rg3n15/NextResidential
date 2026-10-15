'use client';

import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Boton } from '@/componentes/ui/boton';
import { causaDelError, rechazosPorCampo, textoDelError } from '@/lib/api/cliente';
import {
  copropiedadDelCodigo,
  motivoDeCodigoDeInvitacion,
  motivoDeCorreoInvalido,
  motivoDeFechaDeAdulto,
  motivoDeRechazoDeContrasena,
  motivoDeUsuarioInvalido,
  normalizarUsuario,
  registroListoParaEnviar,
} from '@/lib/registro/reglas';
import { mensajeDeEspera, politicaDelRechazo, segundosDeEspera } from '@/lib/registro/respuesta';
import type { PoliticaDeDatos } from '@/lib/registro/respuesta';
import { CamposDeRegistro, VALORES_VACIOS } from './campos-de-registro';
import type { CampoDeRegistro, ValoresDeRegistro } from './campos-de-registro';
import { CasillaDePolitica } from './casilla-de-politica';

/**
 * 15-Y1 · «CREAR CUENTA» EN LA CONSOLA (D-W1, D-W8; P-23, DT-15W-07)
 *
 * El mismo flujo que la app: seis campos, la política vigente con su versión,
 * la casilla, y al crearla se entra solo con el prefijo del código como código
 * de la copropiedad. Las reglas de forma y sus textos son los de la app
 * (`lib/registro/reglas.ts`); la verdad la dice el servidor, y un código
 * incorrecto, usado o de otro conjunto recibe UNA respuesta genérica que se
 * pinta tal cual. Un menor no envía nada: la fecha lo dice antes.
 *
 * Nada de esto se guarda en el navegador: ni la contraseña ni el código ni el
 * correo tocan `localStorage`, `sessionStorage` ni la caché.
 */
const SIN_CONEXION = 'No hay conexión con la consola. Revisa tu red e inténtalo de nuevo.';
const POLITICA_CAMBIO =
  'La política cambió mientras llenaba el formulario. Léala y acéptela de nuevo.';

type Errores = Partial<Record<CampoDeRegistro, string>>;

const motivoLocal = (campo: CampoDeRegistro, v: ValoresDeRegistro, hoy: Date): string | null => {
  switch (campo) {
    case 'usuario':
      return motivoDeUsuarioInvalido(v.usuario);
    case 'correo':
      return motivoDeCorreoInvalido(v.correo);
    case 'contrasena':
      return motivoDeRechazoDeContrasena(v.contrasena);
    case 'confirmacion':
      return v.confirmacion !== '' && v.confirmacion !== v.contrasena
        ? 'Las contraseñas no coinciden'
        : null;
    case 'codigoDeInvitacion':
      return motivoDeCodigoDeInvitacion(v.codigoDeInvitacion);
    case 'fechaNacimiento':
      return motivoDeFechaDeAdulto(v.fechaNacimiento, hoy);
  }
};

const CAMPOS: readonly CampoDeRegistro[] = [
  'usuario',
  'correo',
  'contrasena',
  'confirmacion',
  'codigoDeInvitacion',
  'fechaNacimiento',
];

export const FormularioDeCrearCuenta = ({
  ahora = () => new Date(),
}: {
  /** El reloj, inyectable para las pruebas de la fecha de nacimiento. */
  readonly ahora?: () => Date;
}): JSX.Element => {
  const router = useRouter();
  const [valores, setValores] = useState<ValoresDeRegistro>(VALORES_VACIOS);
  const [errores, setErrores] = useState<Errores>({});
  const [politica, setPolitica] = useState<PoliticaDeDatos | null>(null);
  const [falloDePolitica, setFalloDePolitica] = useState<string | null>(null);
  const [aceptada, setAceptada] = useState(false);
  const [avisoDePolitica, setAvisoDePolitica] = useState<string | undefined>(undefined);
  const [rechazo, setRechazo] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);
  const [creadaSinEntrar, setCreadaSinEntrar] = useState<string | null>(null);

  const cargarPolitica = useCallback(async () => {
    setFalloDePolitica(null);
    try {
      const r = await fetch('/api/registro', { credentials: 'same-origin' });
      const datos: unknown = await r.json();
      const p = politicaDelRechazo({ politica: datos });
      if (!r.ok || p === null) {
        setFalloDePolitica(textoDelError(datos));
        return;
      }
      setPolitica(p);
    } catch {
      setFalloDePolitica(SIN_CONEXION);
    }
  }, []);
  useEffect(() => {
    void cargarPolitica();
  }, [cargarPolitica]);

  /** Si la vigente ya no es la que se mostró, se muestra la nueva y hay que volver a aceptarla. */
  const conPolitica = (vigente: PoliticaDeDatos | null): void => {
    if (vigente === null || vigente.version === politica?.version) return;
    setPolitica(vigente);
    setAceptada(false);
    setAvisoDePolitica(POLITICA_CAMBIO);
  };

  const validar = (campo: CampoDeRegistro, v = valores): void => {
    const motivo = motivoLocal(campo, v, ahora());
    setErrores((e) => {
      const resto: Errores = { ...e };
      delete resto[campo];
      return motivo === null ? resto : { ...resto, [campo]: motivo };
    });
  };

  const entrar = async (): Promise<void> => {
    const codigo = copropiedadDelCodigo(valores.codigoDeInvitacion) ?? '';
    const usuario = normalizarUsuario(valores.usuario);
    try {
      const r = await fetch('/api/sesion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo, usuario, contrasena: valores.contrasena, recordar: false }),
        credentials: 'same-origin',
      });
      const datos = (await r.json()) as { siguiente?: string; mensaje?: string };
      if (!r.ok) throw new Error(datos.mensaje ?? 'No se pudo entrar.');
      router.replace('/');
      router.refresh();
    } catch (e: unknown) {
      setCreadaSinEntrar(
        'Su cuenta quedó creada, pero todavía no se pudo entrar. También puede entrar desde ' +
          `el acceso con el código ${codigo}, su usuario y su contraseña. ` +
          (e instanceof Error ? e.message : ''),
      );
    }
  };

  const crear = async (): Promise<void> => {
    if (politica === null) return;
    const locales: Errores = {};
    for (const campo of CAMPOS) {
      const motivo = motivoLocal(campo, valores, ahora());
      if (motivo !== null) locales[campo] = motivo;
    }
    setErrores(locales);
    if (Object.keys(locales).length > 0) return;
    setEnviando(true);
    setRechazo(undefined);
    setAvisoDePolitica(undefined);
    try {
      const r = await fetch('/api/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...valores,
          usuario: normalizarUsuario(valores.usuario),
          correo: valores.correo.trim(),
          codigoDeInvitacion: valores.codigoDeInvitacion.trim(),
          aceptaTratamientoDeDatos: aceptada,
          versionPolitica: politica.version,
        }),
        credentials: 'same-origin',
      });
      const cuerpo: unknown = await r.json().catch(() => ({}));
      if (r.status === 201) {
        await entrar();
        return;
      }
      if (r.status === 429) {
        setRechazo(mensajeDeEspera(segundosDeEspera(r.headers)));
        return;
      }
      if (r.status === 409 && causaDelError(cuerpo) === 'USUARIO_NO_DISPONIBLE') {
        setErrores({ usuario: textoDelError(cuerpo) });
        conPolitica(politicaDelRechazo(cuerpo));
        return;
      }
      const porCampo = rechazosPorCampo(cuerpo);
      if (porCampo !== undefined) {
        const { versionPolitica, ...resto } = porCampo;
        setErrores(resto);
        if (versionPolitica !== undefined) setAvisoDePolitica(versionPolitica);
      } else {
        setRechazo(textoDelError(cuerpo));
      }
      conPolitica(politicaDelRechazo(cuerpo));
    } catch {
      setRechazo(SIN_CONEXION);
    } finally {
      setEnviando(false);
    }
  };

  const listo =
    !enviando &&
    creadaSinEntrar === null &&
    registroListoParaEnviar({
      usuario: valores.usuario,
      correo: valores.correo,
      contrasena: valores.contrasena,
      confirmacion: valores.confirmacion,
      codigo: valores.codigoDeInvitacion,
      fechaNacimiento: valores.fechaNacimiento,
      aceptada,
      hayPolitica: politica !== null,
    });

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void crear();
      }}
    >
      <p className="text-secundario text-texto-apagado">
        Necesita el código de invitación de una plaza de su vivienda. Las cuentas son para mayores
        de edad.
      </p>
      <CamposDeRegistro
        valores={valores}
        errores={errores}
        alCambiar={(campo, valor) => {
          const nuevos = { ...valores, [campo]: valor };
          setValores(nuevos);
          if (errores[campo] !== undefined) validar(campo, nuevos);
        }}
        alSalir={(campo) => validar(campo)}
      />
      <CasillaDePolitica
        politica={politica}
        fallo={falloDePolitica}
        aceptada={aceptada}
        aviso={avisoDePolitica}
        alCambiar={setAceptada}
        alReintentar={() => void cargarPolitica()}
      />
      {rechazo === undefined ? null : (
        <p
          role="alert"
          className="rounded-campo bg-peligro-suave px-3 py-2 text-secundario text-peligro-texto"
        >
          {rechazo}
        </p>
      )}
      {creadaSinEntrar === null ? (
        <Boton type="submit" anchoCompleto cargando={enviando} disabled={!listo}>
          {enviando ? 'Creando…' : 'Crear cuenta'}
        </Boton>
      ) : (
        <>
          <p
            role="status"
            className="rounded-campo bg-aviso-suave px-3 py-2 text-secundario text-aviso-texto"
          >
            {creadaSinEntrar}
          </p>
          <Boton type="button" anchoCompleto cargando={enviando} onClick={() => void entrar()}>
            Intentar entrar
          </Boton>
        </>
      )}
      <p className="text-secundario text-texto-apagado">
        ¿Ya tiene cuenta?{' '}
        <Link href="/acceso" className="font-medium text-marca-texto underline underline-offset-2">
          Entrar
        </Link>
      </p>
    </form>
  );
};
