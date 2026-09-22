import type { NextFunction, Request, Response } from 'express';
import type { EquipoDeclarado } from './equipos-de-alarm-server';

/**
 * La petición de un equipo, con lo que le cuelgan el middleware y el guard.
 *
 * Vive aquí, y no dentro del módulo, por la misma razón que el registro de
 * equipos: `main.ts` y el banco de pruebas montan el middleware, y alcanzarlo
 * a través del barril del módulo **arrastra todo su grafo de módulos al
 * principio de la carga**. Eso destapó un ciclo que ya existía —`eventos` →
 * `autorizaciones` → su controlador → `eventos`— y que hasta entonces era
 * inofensivo sólo por el orden en que `app.module` lo recorría. Nest lo
 * manifiesta como «can't resolve dependencies … Function», que es el nombre
 * que recibe una clase todavía sin evaluar. La fontanería no arrastra módulos.
 */
export interface PeticionDeEquipo extends Request {
  equipoAcreditado?: EquipoDeclarado;
  sobreCrudo?: Buffer;
}

/** Prefijo de las rutas que reciben publicaciones de equipo. */
export const RUTA_DE_ALARM_SERVER = '/alarm-server';

/**
 * Techo del sobre **en el transporte**, antes de que exista un Buffer entero.
 *
 * Es el mismo número que `LIMITES.cuerpoMaximoBytes` del analizador, y estar en
 * dos sitios es deliberado: aquí protege la memoria del proceso —se corta el
 * flujo a mitad— y allí protege al analizador. Comprobarlo sólo después de
 * haber acumulado los bytes no protege de nada.
 */
export const SOBRE_MAXIMO_BYTES = 8 * 1024 * 1024;

/**
 * Acumula el cuerpo CRUDO de las publicaciones de equipo.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ NO LO HACE `express.json` NI UN PARSER DE MULTIPART
 *
 * `express.json` ignora `multipart/form-data` y dejaría el flujo sin consumir.
 * Un parser de multipart completo escribiría ficheros temporales en disco —con
 * lo que eso trae: rutas, permisos, limpieza y una superficie nueva— para algo
 * que cabe en memoria y se acota en tres dimensiones. Aquí se acumula el sobre
 * y `@ncr/providers` lo abre, que es donde vive el vocabulario del fabricante.
 *
 * Se monta **sólo** bajo `/alarm-server`: fuera de ahí, ningún cuerpo binario
 * se acumula en memoria.
 */
export const acumularSobreCrudo = (req: Request, res: Response, siguiente: NextFunction): void => {
  if (req.method !== 'POST') {
    siguiente();
    return;
  }

  const trozos: Buffer[] = [];
  let acumulado = 0;
  let cortado = false;

  req.on('data', (trozo: Buffer) => {
    if (cortado) return;
    acumulado += trozo.length;
    if (acumulado > SOBRE_MAXIMO_BYTES) {
      cortado = true;
      // 413 y se corta el flujo: seguir leyendo un cuerpo que ya se rechazó es
      // exactamente lo que convierte un envío grande en una caída de memoria.
      res.status(413).json({ mensaje: 'Envío demasiado grande' });
      req.destroy();
      return;
    }
    trozos.push(trozo);
  });

  req.on('end', () => {
    if (cortado) return;
    (req as PeticionDeEquipo).sobreCrudo = Buffer.concat(trozos);
    // `body` vacío y no el Buffer: el saneamiento global recorre `body`, y
    // pasearle bytes de una imagen no tiene sentido ni es barato.
    req.body = {};
    /**
     * La marca que `body-parser` usa para saber que el cuerpo YA se leyó.
     *
     * Sin ella, `express.json` —que corre después, también para esta ruta—
     * vuelve a esperar un flujo que este middleware ya consumió y la petición
     * muere con 500. Se vio contra la suite de aislamiento, que recorre TODA
     * ruta sin token esperando 401: ésta contestaba 500, y un 500 en una ruta
     * pública oculta si el guard llegó a ejercerse.
     */
    (req as Request & { _body?: boolean })._body = true;
    siguiente();
  });

  req.on('error', () => {
    if (!cortado) siguiente();
  });
};
