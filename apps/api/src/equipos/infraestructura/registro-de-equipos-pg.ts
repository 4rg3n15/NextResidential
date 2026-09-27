import type { Pool } from 'pg';
import type { EquipoRegistrado, RegistroDeEquipos } from '@ncr/providers';
import { capacidadesDesdeJson } from '@ncr/providers';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import { leerSobre } from './repositorio-equipos-pg';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL REGISTRO QUE ALIMENTA AL PROVEEDOR DE HARDWARE · D5, ETAPA 15-D
 *
 * `HikvisionProvider` recibe un identificador de dispositivo —el del dominio—
 * y tiene que saber a qué dirección hablar y con qué credencial. El puerto
 * `RegistroDeEquipos` lo declara el paquete de proveedores; ESTO lo implementa
 * leyendo la base. Hasta la 15-D **no existía**: `ProveedoresModule` se
 * componía sin registro, y pedir el adaptador real hacía que la API no
 * arrancara —la fábrica lanza a propósito antes que caer al simulado—. Era el
 * defecto D5: el modo hardware estaba escrito y no se podía encender.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * DOS LECTURAS, DOS JUEGOS DE CLAIMS, Y POR QUÉ
 *
 * La RLS está forzada (§2.7.6) y el proceso no tiene un token de usuario: lo
 * que tiene es la identidad de SERVICIO. Pero `es_servicio(copropiedad_id)`
 * exige saber la copropiedad, y lo único que llega aquí es el id del equipo.
 *
 *   1. `dispositivos` se lee por su clave primaria con los claims del rol
 *      `superadministrador`, que la política de lectura admite. Es la ÚNICA
 *      lectura del proyecto que usa ese rol desde el proceso, lee UNA fila por
 *      id, y no devuelve nada que no vaya a usarse para hablar con ese equipo.
 *   2. Con la copropiedad ya conocida, el sobre de la credencial se lee con
 *      los claims de SERVICIO de ESA copropiedad, que es lo que la política de
 *      `credenciales_de_equipo` exige (0032: ningún token de usuario lo lee).
 *
 * El aislamiento de aplicación que §2.7.6 pide para toda ruta de servicio se
 * cumple aguas arriba: el identificador que llega aquí lo produjo un caso de
 * uso que ya comprobó el alcance del tenant. Este registro no lo relaja: un id
 * que no exista devuelve `null`, y el proveedor lanza `EquipoNoRegistrado`.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LA CREDENCIAL VIAJA EN CLARO DESDE AQUÍ, Y NO PUEDE SER DE OTRA FORMA
 *
 * Para hablar con el equipo hay que presentarle la clave. Lo que se cumple:
 * no se registra, no se devuelve por ninguna ruta, y vive en memoria el tiempo
 * de una petición (RN-21).
 */

interface FilaDeRegistro {
  readonly id: string;
  readonly copropiedad_id: string;
  readonly tipo: EquipoRegistrado['tipo'];
  readonly host: string;
  readonly puerto: number;
  readonly protocolo: 'http' | 'https';
  readonly usuario: string | null;
  readonly modelo: string | null;
  readonly fabricante: string | null;
  readonly canal_barrera: number | null;
  readonly numero_de_puerta: number | null;
  readonly canal_de_audio: number | null;
  readonly modo_de_terminal: 'reporta_y_espera' | 'decide_el_equipo' | null;
  readonly canal_de_audio_habilitado: boolean;
  readonly canal_de_video: string | null;
  readonly capacidades: unknown;
  /** D-11 · el firmware de la atestación más reciente, si la hay. */
  readonly firmware_atestado: string | null;
}

const CLAIMS_DE_LECTURA = JSON.stringify({
  rol: 'superadministrador',
  usuario_id: ACTOR_INGESTA,
  copropiedad_id: null,
  copropiedades: [],
});

export class RegistroDeEquiposPg implements RegistroDeEquipos {
  constructor(
    private readonly pool: Pool,
    private readonly llaveMaestra: string,
  ) {}

  async buscar(dispositivoId: string): Promise<EquipoRegistrado | null> {
    const fila = await this.fila(dispositivoId);
    if (fila === null) return null;

    const clave = await leerSobre(this.pool, this.llaveMaestra, fila.copropiedad_id, fila.id);
    // Sin credencial no hay a quién hablar: es un equipo dado de alta a
    // medias, y el proveedor lo trata como no registrado en vez de intentar
    // presentarse con una clave vacía y bloquear la cuenta del aparato.
    if (clave === null || fila.usuario === null) return null;

    return {
      dispositivoId: fila.id,
      tipo: fila.tipo,
      host: fila.host,
      puerto: Number(fila.puerto),
      protocolo: fila.protocolo,
      usuario: fila.usuario,
      clave,
      canalBarrera: fila.canal_barrera,
      numeroDePuerta: fila.numero_de_puerta,
      canalDeAudio: fila.canal_de_audio,
      ...(fila.modo_de_terminal === null ? {} : { modoDeTerminal: fila.modo_de_terminal }),
      canalDeAudioHabilitado: fila.canal_de_audio_habilitado,
      canalDeVideo: fila.canal_de_video,
      fabricante: fila.fabricante,
      modelo: fila.modelo,
      ...(fila.capacidades === null ? {} : { capacidades: capacidadesDesdeJson(fila.capacidades) }),
      atestacion: fila.firmware_atestado === null ? null : { firmware: fila.firmware_atestado },
    };
  }

  /**
   * 15-K (§4) · ¿existe y está activo? Sin credencial ni sobre: es lo único
   * que el proveedor SIMULADO necesita para reconocer un equipo de la base.
   */
  async activo(dispositivoId: string): Promise<boolean> {
    // Un identificador que no es UUID no está en la tabla: se dice que no, en
    // vez de dejar que PostgreSQL lance por el tipo de la columna.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dispositivoId)) {
      return false;
    }
    return (await this.fila(dispositivoId)) !== null;
  }

  private async fila(dispositivoId: string): Promise<FilaDeRegistro | null> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        CLAIMS_DE_LECTURA,
      ]);
      const { rows } = await cliente.query<FilaDeRegistro>(
        // D-11 · la atestación más reciente viaja con el equipo: el proveedor
        // la compara con el firmware leído EN VIVO antes de operar la cámara.
        `SELECT d.id, d.copropiedad_id, d.tipo::text AS tipo, d.host, d.puerto,
                d.protocolo::text AS protocolo, d.usuario, d.modelo, d.fabricante,
                d.canal_barrera, d.numero_de_puerta, d.canal_de_audio, d.modo_de_terminal,
                d.canal_de_audio_habilitado, d.canal_de_video, d.capacidades,
                (SELECT a.firmware FROM public.atestaciones_de_equipo a
                  WHERE a.copropiedad_id = d.copropiedad_id AND a.dispositivo_id = d.id
                  ORDER BY a.registrada_en DESC LIMIT 1) AS firmware_atestado
           FROM public.dispositivos d
          WHERE d.id = $1 AND d.estado = 'activo'`,
        [dispositivoId],
      );
      return rows[0] ?? null;
    } finally {
      cliente.release();
    }
  }
}
