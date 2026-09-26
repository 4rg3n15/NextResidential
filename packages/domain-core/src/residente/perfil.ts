import type { Resultado } from '../compartido/resultado';
import { exito, fallo } from '../compartido/resultado';
import type { TipoDeDocumento } from '../padron/persona';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * PERFIL DEL RESIDENTE · ETAPA 15-I (3.2 y 3.5)
 *
 * Datos de CONTACTO, no de acceso: el correo y el teléfono de aquí sirven para
 * que la administración le escriba o le llame; con ellos no se entra (se entra
 * con código, usuario y contraseña, D1) y no se recupera nada (no hay SMTP, D9).
 *
 * Todo se sanea antes de medirse (§2.7.4). El documento se normaliza igual que
 * en el padrón (`personas_documento_normalizado`) porque es lo que cruza la
 * lista negra (RN-06), y NUNCA sale en un mensaje de error: los motivos nombran
 * el campo, no el valor.
 * ═════════════════════════════════════════════════════════════════════════════
 */

/**
 * Los del padrón (`TIPOS_DE_DOCUMENTO`) menos el NIT: una persona natural que
 * vive en la vivienda no se identifica con el documento de una empresa.
 */
export const TIPOS_DE_DOCUMENTO_DE_RESIDENTE: readonly TipoDeDocumento[] = [
  'cedula',
  'cedula_extranjeria',
  'pasaporte',
  'otro',
];

export interface DatosDelPerfil {
  readonly nombres: string;
  readonly apellidos: string;
  /** `AAAA-MM-DD`, o `null` si no la quiere dar. */
  readonly fechaNacimiento: string | null;
  readonly tipoDocumento: string;
  readonly numeroDocumento: string;
  readonly correo: string;
  readonly telefono: string;
}

export interface PerfilValido {
  readonly nombres: string;
  readonly apellidos: string;
  readonly fechaNacimiento: string | null;
  readonly tipoDocumento: TipoDeDocumento;
  readonly numeroDocumento: string;
  readonly correo: string;
  readonly telefono: string;
}

export interface CampoRechazado {
  readonly campo: keyof DatosDelPerfil;
  readonly motivo: string;
}

/**
 * Quita los caracteres de control (U+0000–U+001F y U+007F) filtrando por punto
 * de código, como `padron/persona.ts`: una regex con controles literales
 * dispara `no-control-regex`.
 */
const sinControles = (valor: string): string =>
  [...valor]
    .filter((caracter) => {
      const codigo = caracter.codePointAt(0) ?? 0;
      return codigo >= 0x20 && codigo !== 0x7f;
    })
    .join('');

const sanear = (v: string): string => sinControles(v.normalize('NFC')).trim();
const CORREO = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/;
const TELEFONO = /^\+?[0-9]{7,15}$/;
const DOCUMENTO = /^[A-Z0-9]{4,20}$/;

export const normalizarDocumento = (v: string): string =>
  v
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
export const normalizarTelefonoDeContacto = (v: string): string => v.replace(/[\s().-]/g, '');

/**
 * Devuelve TODOS los campos rechazados de una vez: quien corrige un formulario
 * en el móvil no debe descubrirlos de uno en uno. `hoy` llega del reloj
 * inyectado (§2.4): nunca `new Date()` aquí.
 */
export const validarPerfil = (
  d: DatosDelPerfil,
  hoy: Date,
): Resultado<PerfilValido, readonly CampoRechazado[]> => {
  const rechazos: CampoRechazado[] = [];
  const nombres = sanear(d.nombres);
  const apellidos = sanear(d.apellidos);
  const correo = sanear(d.correo).toLowerCase();
  const telefono = normalizarTelefonoDeContacto(sanear(d.telefono));
  const numeroDocumento = normalizarDocumento(d.numeroDocumento);
  if (nombres.length < 1 || nombres.length > 100) {
    rechazos.push({ campo: 'nombres', motivo: 'El nombre tiene de 1 a 100 caracteres' });
  }
  if (apellidos.length < 1 || apellidos.length > 100) {
    rechazos.push({ campo: 'apellidos', motivo: 'El apellido tiene de 1 a 100 caracteres' });
  }
  if (!CORREO.test(correo)) rechazos.push({ campo: 'correo', motivo: 'El correo no es válido' });
  if (!TELEFONO.test(telefono)) {
    rechazos.push({ campo: 'telefono', motivo: 'El teléfono tiene de 7 a 15 cifras' });
  }
  if (!(TIPOS_DE_DOCUMENTO_DE_RESIDENTE as readonly string[]).includes(d.tipoDocumento)) {
    rechazos.push({ campo: 'tipoDocumento', motivo: 'Tipo de documento desconocido' });
  }
  if (!DOCUMENTO.test(numeroDocumento)) {
    rechazos.push({
      campo: 'numeroDocumento',
      motivo: 'El documento tiene de 4 a 20 letras o cifras',
    });
  }
  const fecha = d.fechaNacimiento === null ? null : validarFecha(d.fechaNacimiento, hoy);
  if (fecha !== null && !fecha.ok) rechazos.push({ campo: 'fechaNacimiento', motivo: fecha.error });
  if (rechazos.length > 0) return fallo(rechazos);
  return exito({
    nombres,
    apellidos,
    fechaNacimiento: d.fechaNacimiento,
    tipoDocumento: d.tipoDocumento as TipoDeDocumento,
    numeroDocumento,
    correo,
    telefono,
  });
};

const validarFecha = (valor: string, hoy: Date): Resultado<string, string> => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return fallo('La fecha va como AAAA-MM-DD');
  const fecha = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) {
    return fallo('La fecha no existe');
  }
  if (valor < '1900-01-01') return fallo('La fecha es anterior a 1900');
  if (fecha.getTime() > hoy.getTime()) return fallo('La fecha de nacimiento no puede ser futura');
  return exito(valor);
};
