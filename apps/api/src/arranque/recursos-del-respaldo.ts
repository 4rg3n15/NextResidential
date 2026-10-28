import type { CorreoSaliente } from '@ncr/domain-core';
import type { RecursoExterno, ResultadoDeRecurso } from './recursos-externos';

/**
 * D-147 · LOS DOS RECURSOS DEL RESPALDO DIARIO, COMPROBADOS AL ARRANCAR
 *
 * Ninguno es crítico: sin ellos la API opera y el histórico sigue entero en la
 * base. Pero ninguno se pinta de verde si no lo está: sin SMTP el envío queda
 * SIN CONFIGURAR, como la recuperación de contraseña, y sin Storage el
 * respaldo vive en memoria y se pierde al reiniciar.
 */
const BUCKET = 'respaldo-de-eventos';

/** El SMTP: si está declarado, se conecta, negocia TLS y se autentica, sin enviar nada. */
export const recursoCorreoDelRespaldo = (
  correo: CorreoSaliente & { comprobar?: () => Promise<void> },
): RecursoExterno => ({
  nombre: 'correo del respaldo diario (SMTP con TLS)',
  critico: false,
  comprobar: async (): Promise<ResultadoDeRecurso> => {
    if (!correo.configurado || correo.comprobar === undefined) {
      return {
        estado: 'sin-configurar',
        detalle:
          'CORREO_SMTP_* y CORREO_REMITENTE no están: el respaldo diario se guarda, pero su envío ' +
          'queda «sin configurar»',
        remedio: 'declara las cinco variables CORREO_* (docs/guias/CONEXION_SUPABASE.md §14)',
      };
    }
    try {
      await correo.comprobar();
      return { estado: 'ok', detalle: 'el servidor SMTP acepta TLS y la cuenta de envío' };
    } catch (error) {
      // Sólo el código del fallo: ni el host, ni el usuario, ni la clave.
      const codigo =
        typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code)
          : 'desconocido';
      return {
        estado: 'roto',
        detalle: `el SMTP no aceptó la conexión segura o la cuenta (código ${codigo})`,
        remedio:
          'revisa CORREO_SMTP_HOST, el puerto (465 TLS implícito; otro, STARTTLS obligatorio) ' +
          'y la cuenta de envío',
      };
    }
  },
});

/** El bucket privado que crea la 0061: que exista y que no sea público. */
export const recursoBucketDeRespaldos = (opciones: {
  readonly supabaseUrl: string;
  readonly llaveSecreta: string;
  readonly enBase: boolean;
  readonly pedir?: typeof fetch;
}): RecursoExterno => ({
  nombre: 'bucket privado del respaldo de eventos',
  critico: false,
  comprobar: async (): Promise<ResultadoDeRecurso> => {
    const { supabaseUrl, llaveSecreta, enBase, pedir = fetch } = opciones;
    if (!enBase) {
      return {
        estado: 'sin-configurar',
        detalle:
          'el respaldo diario vive en MEMORIA (histórico en memoria o EVIDENCIA_BUCKET sin ' +
          'declarar): se pierde al reiniciar',
        remedio:
          'PERSISTENCIA_DE_EVENTOS=postgres, EVIDENCIA_BUCKET declarada y la migración 0061 aplicada',
      };
    }
    let respuesta: Response;
    try {
      respuesta = await pedir(`${supabaseUrl}/storage/v1/bucket/${BUCKET}`, {
        headers: { apikey: llaveSecreta, Authorization: `Bearer ${llaveSecreta}` },
      });
    } catch (e) {
      return {
        estado: 'roto',
        detalle: `no se pudo contactar con Storage (${e instanceof Error ? e.message : 'error desconocido'})`,
        remedio: 'comprueba SUPABASE_URL y la conectividad de salida',
      };
    }
    if (respuesta.status === 404 || respuesta.status === 400) {
      return {
        estado: 'roto',
        detalle: `el bucket «${BUCKET}» no existe`,
        remedio: 'aplica la migración 0061 (supabase db push): ella lo crea, privado',
      };
    }
    if (!respuesta.ok) {
      return {
        estado: 'roto',
        detalle: `Storage respondió ${respuesta.status} al describir el bucket`,
        remedio: 'comprueba que SUPABASE_SECRET_KEY es la llave secreta y no la publicable',
      };
    }
    const cuerpo: unknown = await respuesta.json().catch(() => null);
    if (typeof cuerpo === 'object' && cuerpo !== null && (cuerpo as { public?: unknown }).public) {
      return {
        estado: 'roto',
        detalle: `el bucket «${BUCKET}» es PÚBLICO: cualquiera con la ruta lee los eventos`,
        remedio: 'Panel > Storage > el bucket > desmarcar «Public bucket» (RN-21)',
      };
    }
    return { estado: 'ok', detalle: `bucket «${BUCKET}» existe y es privado` };
  },
});
