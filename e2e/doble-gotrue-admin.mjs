/**
 * 15-Y1 · LA ADMINISTRACIÓN DE USUARIOS DEL DOBLE DE GOTRUE
 *
 * «Crear cuenta» y el alta del titular hacen que la API CREE identidades en el
 * proveedor (`cuentas-supabase.ts`: `POST /admin/users`, `PUT` y `DELETE
 * /admin/users/:id`; `factores-supabase.ts`: `GET /admin/users/:id/factors`).
 * Hasta aquí el doble sólo atendía el acceso y los factores de usuarios que ya
 * existían, así que ningún recorrido podía crear una cuenta de punta a punta.
 *
 * Reproduce la semántica que la API espera y nada más:
 *  · crear devuelve `{ id, email }`; un correo repetido da `422 email_exists`,
 *    que es lo que la API traduce a «usuario ocupado»;
 *  · cambiar la contraseña por administración vale para la temporal del
 *    titular y para el cambio obligatorio;
 *  · listar factores de un usuario creado aquí devuelve la lista vacía, como
 *    el proveedor con un usuario sin segundo factor;
 *  · todo exige la llave secreta en `Authorization`: con la publicable, 401.
 *
 * Vive aparte para que `doble-gotrue.mjs` no crezca: él delega aquí antes de
 * su 404.
 */
import { randomUUID } from 'node:crypto';

const ADMIN = /^\/auth\/v1\/admin\/users(?:\/([^/]+))?(\/factors)?$/;

/**
 * @returns `true` si la ruta era de administración y ya se respondió.
 */
export const atenderAdministracion = ({
  ruta,
  metodo,
  cuerpo,
  cabeceras,
  usuarios,
  factoresPorUsuario,
  responder,
}) => {
  const m = ADMIN.exec(ruta);
  if (m === null) return false;
  const [, id, factores] = m;
  const secreta = (cabeceras.authorization ?? '').startsWith('Bearer secreta-');
  if (!secreta) {
    responder(401, { error_code: 'no_authorization' });
    return true;
  }
  if (id === undefined && metodo === 'POST') {
    const email = String(cuerpo.email ?? '').toLowerCase();
    if (email === '' || typeof cuerpo.password !== 'string') {
      responder(422, { error_code: 'validation_failed' });
      return true;
    }
    if (usuarios.some((u) => u.correo.toLowerCase() === email)) {
      responder(422, { error_code: 'email_exists' });
      return true;
    }
    const usuario = {
      id: randomUUID(),
      correo: email,
      contrasena: cuerpo.password,
      rol: null,
      copropiedadId: null,
    };
    usuarios.push(usuario);
    factoresPorUsuario.set(usuario.id, []);
    responder(200, { id: usuario.id, email });
    return true;
  }
  const usuario = usuarios.find((u) => u.id === id);
  if (usuario === undefined) {
    responder(404, { error_code: 'user_not_found' });
    return true;
  }
  if (factores !== undefined && metodo === 'GET') {
    responder(
      200,
      (factoresPorUsuario.get(usuario.id) ?? []).map(({ secret, ...f }) => f),
    );
    return true;
  }
  if (metodo === 'PUT') {
    if (typeof cuerpo.password === 'string') usuario.contrasena = cuerpo.password;
    responder(200, { id: usuario.id, email: usuario.correo });
    return true;
  }
  if (metodo === 'DELETE') {
    usuarios.splice(usuarios.indexOf(usuario), 1);
    factoresPorUsuario.delete(usuario.id);
    responder(200, {});
    return true;
  }
  responder(404, { error_code: 'not_found' });
  return true;
};
