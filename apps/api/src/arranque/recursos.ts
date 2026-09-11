import type { ProveedorDeJwks } from '../autenticacion';
import type { RecursoExterno, ResultadoDeRecurso } from './recursos-externos';

/**
 * Los recursos externos concretos que este despliegue declara.
 *
 * Cada uno habla con el recurso REAL. Ninguno acepta un doble: el doble es
 * exactamente lo que dejó pasar el fallo del JWKS durante nueve etapas.
 */

/**
 * **JWKS.** Crítico: sin claves no se verifica ni un token y nadie entra.
 *
 * Distingue tres fallos porque piden tres acciones distintas, y confundirlos
 * fue lo que costó tres rondas de trabajo: `inalcanzable` se arregla en el
 * entorno, `sin-claves` se arregla en el panel de Supabase, y `en-espera` se
 * arregla esperando.
 */
export const recursoJwks = (jwks: ProveedorDeJwks): RecursoExterno => ({
  nombre: 'JWKS de Supabase Auth',
  critico: true,
  comprobar: async (): Promise<ResultadoDeRecurso> => {
    const estado = await jwks.sondear();
    switch (estado.estado) {
      case 'ok':
        return { estado: 'ok', detalle: `${estado.claves} clave(s) pública(s) descargada(s)` };
      case 'sin-claves':
        return {
          estado: 'roto',
          detalle: 'el endpoint responde 200 pero el documento no trae ninguna clave',
          remedio:
            'el proyecto no tiene llaves asimétricas habilitadas: Panel > Project Settings > JWT Keys > migrar a llave asimétrica',
        };
      case 'en-espera':
        return {
          estado: 'roto',
          detalle: 'un fallo reciente mantiene la descarga en espera',
          remedio: 'reintenta pasado el suelo de refresco; consulta /ready',
        };
      default:
        return {
          estado: 'roto',
          detalle: `no se pudo descargar el documento (${estado.detalle})`,
          remedio:
            'revisa SUPABASE_JWKS_URL. La ruta correcta termina en /auth/v1/.well-known/jwks.json; /auth/v1/jwks NO existe y devuelve 404',
        };
    }
  },
});

/**
 * **Bucket de evidencia.** Crítico cuando está configurado (RN-21, §2.7.8): la
 * evidencia de un acceso es prueba, y un bucket público la expone entera.
 *
 * Comprueba las dos mitades, porque una sola no dice nada:
 *
 *  1. Que el bucket **existe** y está marcado privado, preguntándoselo a la
 *     API de Storage con la llave secreta.
 *  2. Que un `GET` **sin firmar** al objeto se rechaza de verdad. Esto es lo
 *     que ninguna prueba hacía: la suite comprobaba la fila `evidencias`, no el
 *     bucket, y `public: false` es una propiedad declarada — que se cumpla es
 *     otra cosa, y solo lo demuestra una petición anónima que falla.
 */
export const recursoBucketDeEvidencia = (opciones: {
  readonly supabaseUrl: string;
  readonly llaveSecreta: string;
  readonly bucket: string | undefined;
  readonly pedir?: typeof fetch;
}): RecursoExterno => ({
  nombre: 'bucket privado de evidencia',
  critico: opciones.bucket !== undefined,
  comprobar: async (): Promise<ResultadoDeRecurso> => {
    const { supabaseUrl, llaveSecreta, bucket, pedir = fetch } = opciones;
    if (bucket === undefined) {
      return {
        estado: 'sin-configurar',
        detalle:
          'EVIDENCIA_BUCKET no está definida: la evidencia se guarda en memoria del proceso y se pierde al reiniciar',
        remedio:
          'crea un bucket PRIVADO en Supabase Storage y decláralo en EVIDENCIA_BUCKET (docs/guias/CONEXION_SUPABASE.md §9)',
      };
    }

    let respuesta: Response;
    try {
      respuesta = await pedir(`${supabaseUrl}/storage/v1/bucket/${encodeURIComponent(bucket)}`, {
        headers: { apikey: llaveSecreta, Authorization: `Bearer ${llaveSecreta}` },
      });
    } catch (e) {
      return {
        estado: 'roto',
        detalle: `no se pudo contactar con Storage (${e instanceof Error ? e.message : 'error desconocido'})`,
        remedio: 'comprueba SUPABASE_URL y la conectividad de salida',
      };
    }

    if (respuesta.status === 404) {
      return {
        estado: 'roto',
        detalle: `el bucket «${bucket}» no existe`,
        remedio: 'créalo en Panel > Storage, marcado como privado',
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
    const esPublico =
      typeof cuerpo === 'object' && cuerpo !== null && (cuerpo as { public?: unknown }).public;
    if (esPublico === true) {
      return {
        estado: 'roto',
        detalle: `el bucket «${bucket}» es PÚBLICO: cualquiera con la ruta ve la evidencia`,
        remedio: 'Panel > Storage > el bucket > desmarcar «Public bucket» (RN-21)',
      };
    }

    /**
     * Segunda mitad: que la privacidad se cumpla, no solo que esté declarada.
     * Se pide un objeto SIN credencial; siendo privado, Storage responde
     * 400/401/403 porque ni siquiera llega a mirar si existe.
     *
     * **Lo que esta sonda NO puede demostrar, dicho aquí para que nadie lea el
     * verde como más de lo que es.** El objeto que pide no existe, así que un
     * bucket declarado privado pero con una política permisiva sobre
     * `storage.objects` respondería 404 y pasaría. Demostrar el negativo exige
     * un objeto REAL, y subir uno en cada arranque de la API sería escribir en
     * el almacén de evidencia cada vez que el proceso se reinicia.
     *
     * Esa comprobación existe y es un procedimiento de operador:
     * `scripts/verificar-bucket-evidencia.mjs`, documentado en
     * `docs/guias/CONEXION_SUPABASE.md` §7.2.
     */
    let anonima: Response;
    try {
      anonima = await pedir(
        `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/sonda-de-privacidad`,
      );
    } catch {
      return {
        estado: 'ok',
        detalle: `bucket «${bucket}» privado (no se pudo ejercer la petición anónima)`,
      };
    }
    if (anonima.status === 200) {
      return {
        estado: 'roto',
        detalle: `un GET sin firmar contra «${bucket}» devolvió 200`,
        remedio: 'revisa las políticas de Storage: el bucket sirve objetos sin credencial',
      };
    }

    return {
      estado: 'ok',
      detalle:
        `bucket «${bucket}» existe, es privado, y un GET sin firmar responde ${anonima.status} ` +
        '(sobre objeto inexistente; el negativo con objeto real lo ejerce scripts/verificar-bucket-evidencia.mjs)',
    };
  },
});

/**
 * **Ciclo de recuperación de contraseña.** No crítico: el sistema opera sin él,
 * pero quien pierde la contraseña se queda fuera y nadie se entera hasta que
 * pasa.
 *
 * Lo que se puede comprobar desde aquí y lo que no, dicho sin adornos: el SMTP
 * y la plantilla viven en el panel de Supabase y **no hay endpoint que los
 * exponga**, así que esta comprobación no puede afirmar que el correo salga.
 * Lo que sí comprueba es la mitad que es nuestra —que la URL de redirección
 * esté declarada y apunte a un origen que la propia API admite—, y **declara
 * explícitamente la mitad que no puede ver**, para que nadie lea un verde y
 * concluya que el ciclo está verificado.
 */
export const recursoRecuperacionDeContrasena = (opciones: {
  readonly urlDeRedireccion: string | undefined;
  readonly origenesPermitidos: readonly string[];
}): RecursoExterno => ({
  nombre: 'recuperación de contraseña (SMTP y redirección)',
  critico: false,
  comprobar: async (): Promise<ResultadoDeRecurso> => {
    const { urlDeRedireccion, origenesPermitidos } = opciones;
    if (urlDeRedireccion === undefined) {
      return {
        estado: 'sin-configurar',
        detalle:
          'RECUPERACION_URL_REDIRECCION no está definida: el enlace del correo no tiene a dónde volver',
        remedio:
          'decláralas en el entorno y en Panel > Authentication > URL Configuration > Redirect URLs',
      };
    }
    let origen: string;
    try {
      origen = new URL(urlDeRedireccion).origin;
    } catch {
      return {
        estado: 'roto',
        detalle: 'RECUPERACION_URL_REDIRECCION no es una URL absoluta',
        remedio: 'usa la forma https://consola.ejemplo/acceso/nueva-contrasena',
      };
    }
    if (!origenesPermitidos.includes(origen)) {
      return {
        estado: 'roto',
        detalle: `el origen de la redirección (${origen}) no está en CORS_ALLOWED_ORIGINS`,
        remedio: 'añádelo, o corrige RECUPERACION_URL_REDIRECCION para que apunte a la consola',
      };
    }
    return {
      estado: 'sin-configurar',
      detalle:
        `la redirección apunta a ${origen}, que sí es un origen admitido. El SMTP y la plantilla ` +
        'viven en el panel de Supabase y NO son observables desde la API: este ciclo queda SIN VERIFICAR',
      remedio:
        'ejercicio manual: pedir un enlace, recibirlo y canjearlo (docs/guias/RECUPERACION_Y_USUARIOS.md)',
    };
  },
});
