import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { configuracion } from '@/lib/configuracion';
import { reenvioDeIp } from '@/lib/ip-de-la-peticion';
import { Limitador, ipDe } from '@/lib/limitador';
import { politicaDelRechazo } from '@/lib/registro/respuesta';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Y1 · «CREAR CUENTA» DESDE LA CONSOLA (P-23, DT-15W-07)
 *
 * El residente que no tiene la app —el de iPhone, hoy— crea su cuenta desde
 * el navegador con el mismo `POST /auth/registro` que usa la app. La ruta de
 * la API es pública y no emite tokens, así que esta no abre sesión: el
 * navegador entra después por `/api/sesion` con el prefijo del código, igual
 * que la app.
 *
 * Por qué pasa por aquí y no por `/api/ncr/*`: el proxy exige sesión, y quien
 * crea su cuenta no la tiene todavía. Esta ruta reenvía SOLO dos cosas y nada
 * más: el formulario, y la IP del navegador para que la API aplique sus
 * límites por IP y por prefijo (10 cada 10 min, 5 cada 15 min). Además lleva
 * su propio límite por IP (§2.7.5), como las demás rutas de sesión.
 *
 * `GET` devuelve la política de tratamiento de datos vigente, de la única forma
 * en que la API la entrega: adjunta a un 400. Es lo que hace la app con el
 * formulario vacío (`registro_api.dart`); un formulario vacío nunca llega a
 * juzgar un código ni cuenta un intento contra ningún conjunto.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const POR_IP = new Limitador({ permitidos: 20, ventanaMs: 10 * 60_000 });

const CAMPOS = [
  'usuario',
  'correo',
  'contrasena',
  'confirmacion',
  'codigoDeInvitacion',
  'fechaNacimiento',
  'versionPolitica',
] as const;

const FORMULARIO_VACIO = {
  usuario: '',
  correo: '',
  contrasena: '',
  confirmacion: '',
  codigoDeInvitacion: '',
  fechaNacimiento: '',
  aceptaTratamientoDeDatos: false,
  versionPolitica: '',
};

const enviarALaApi = async (
  peticion: NextRequest,
  cuerpo: Record<string, unknown>,
): Promise<Response> => {
  const { apiUrl } = configuracion();
  return fetch(`${apiUrl}/auth/registro`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...reenvioDeIp(peticion.headers),
    },
    body: JSON.stringify(cuerpo),
    cache: 'no-store',
  });
};

const sinConexion = (): NextResponse =>
  NextResponse.json({ mensaje: 'La API de Next Control no responde.' }, { status: 502 });

export const GET = async (peticion: NextRequest): Promise<NextResponse> => {
  let respuesta: Response;
  try {
    respuesta = await enviarALaApi(peticion, FORMULARIO_VACIO);
  } catch {
    return sinConexion();
  }
  const cuerpo: unknown = await respuesta.json().catch(() => null);
  const politica = politicaDelRechazo(cuerpo);
  if (politica === null) {
    return NextResponse.json(
      { mensaje: 'El servidor no entregó la política de tratamiento de datos.' },
      { status: 502 },
    );
  }
  return NextResponse.json(politica, { headers: { 'Cache-Control': 'no-store' } });
};

/** Sólo los campos del contrato, como texto acotado; nada más viaja. */
const leerFormulario = (cuerpo: unknown): Record<string, unknown> | null => {
  if (typeof cuerpo !== 'object' || cuerpo === null) return null;
  const c = cuerpo as Record<string, unknown>;
  const formulario: Record<string, unknown> = {};
  for (const campo of CAMPOS) {
    const valor = c[campo];
    if (typeof valor !== 'string' || valor.length > 256) return null;
    formulario[campo] = valor;
  }
  formulario['aceptaTratamientoDeDatos'] = c['aceptaTratamientoDeDatos'] === true;
  return formulario;
};

export const POST = async (peticion: NextRequest): Promise<NextResponse> => {
  const limite = POR_IP.consultar(ipDe(peticion.headers));
  if (!limite.admitido) {
    return NextResponse.json(
      { mensaje: 'Demasiados intentos seguidos. Espere unos minutos y vuelva a intentarlo.' },
      { status: 429, headers: { 'Retry-After': String(limite.reintentarEnSegundos) } },
    );
  }
  const formulario = leerFormulario(await peticion.json().catch(() => null));
  if (formulario === null) {
    return NextResponse.json({ mensaje: 'Revise los datos' }, { status: 400 });
  }
  let respuesta: Response;
  try {
    respuesta = await enviarALaApi(peticion, formulario);
  } catch {
    return sinConexion();
  }
  // La respuesta de la API va tal cual —estado, `campos`, `codigo`, `politica`,
  // `Retry-After`—: el formulario decide con ella, como la app.
  const cuerpo: unknown = await respuesta.json().catch(() => ({}));
  const cabeceras: Record<string, string> = { 'Cache-Control': 'no-store' };
  const espera = respuesta.headers.get('retry-after');
  if (espera !== null) cabeceras['Retry-After'] = espera;
  return NextResponse.json(cuerpo, { status: respuesta.status, headers: cabeceras });
};
