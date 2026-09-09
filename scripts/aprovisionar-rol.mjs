#!/usr/bin/env node
/**
 * Aprovisiona el ROL de un usuario que YA EXISTE en Supabase Auth.
 *
 * LO QUE ESTE GUION NO HACE, y no es una limitación sino el diseño:
 *
 *  - **No crea usuarios ni contraseñas.** El alta la hace una persona en el
 *    panel, o el propio usuario por invitación. Una contraseña generada por una
 *    herramienta acaba en el historial del intérprete de órdenes, en un
 *    registro de CI o en una captura de pantalla.
 *  - **No lee ningún secreto de un fichero del repositorio.** Sale del entorno.
 *  - **No inscribe el segundo factor.** Lo hace el titular desde su propia
 *    sesión (ADR-008); nadie más debería poder.
 *
 * POR QUÉ LLAMA A UNA FUNCIÓN Y NO INSERTA. La versión anterior escribía en
 * `usuarios` y `roles_usuario` con dos peticiones REST, y fallaba con
 * `creado_por` nulo. Corregir esa columna no habría bastado:
 *
 *  1. `creado_por` y `actualizado_por` son NOT NULL en las tres tablas del
 *     arranque, y son claves ajenas a `usuarios`. Sobre una base vacía no hay
 *     ningún usuario al que apuntar: es un ciclo, y lo rompe el **actor de
 *     sistema** de la migración 0025.
 *  2. `tg_usuario_tenant` es un disparador de restricción DEFERRABLE INITIALLY
 *     DEFERRED, o sea que se comprueba **al commit**. El usuario y su rol
 *     tienen que escribirse en la MISMA transacción, y cada petición REST es
 *     una transacción distinta. Desde aquí no se podía.
 *
 * Por eso la escritura vive en `arranque_vincular_usuario` y este guion es
 * transporte y validación de argumentos.
 *
 *   SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
 *   node scripts/aprovisionar-rol.mjs \
 *     --correo admin@copropiedad.com --rol administrador \
 *     --copropiedad <uuid> --nombre "Nombre Apellido"
 */
import { crearCliente, exigirCopropiedad, leerArgumentos, morir } from './lib/supabase-admin.mjs';

const ROLES = [
  'superadministrador',
  'administrador',
  'portero',
  'operador_central',
  'residente',
  'servicio',
];
const EXIGEN_MFA = new Set(['superadministrador', 'administrador', 'operador_central']);

const args = leerArgumentos(process.argv.slice(2));
const correo = args.correo;
const rol = args.rol;
const copropiedad = args.copropiedad;
const nombre = args.nombre ?? correo;

if (correo === undefined || rol === undefined) {
  morir('Uso: --correo <correo> --rol <rol> --copropiedad <uuid> [--nombre "..."]');
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) morir(`«${correo}» no tiene forma de correo.`);
if (!ROLES.includes(rol)) morir(`Rol no válido: «${rol}».\n  Válidos: ${ROLES.join(', ')}`);
if (copropiedad === undefined) {
  morir(
    'Falta --copropiedad.\n' +
      '  También el superadministrador la necesita: `roles_usuario.copropiedad_id` es NOT NULL.\n' +
      '  No lo ata a ella — su alcance real es global y lo resuelve `app.es_superadmin()`,\n' +
      '  y su `usuarios.copropiedad_id` queda nulo.',
  );
}

const cliente = crearCliente();

// Los argumentos se validan ANTES de escribir nada. El fallo que motivó esta
// versión fue llegar hasta el INSERT con un identificador que no existía.
await exigirCopropiedad(cliente, copropiedad);

console.log(`\n▸ Aprovisionando «${correo}» como ${rol}`);

const identidad = await cliente.identidadPorCorreo(correo);
if (identidad === null) {
  morir(
    `No existe ninguna identidad con el correo «${correo}» en Supabase Auth.\n` +
      '  Créala primero en Authentication → Users → Add user (o envíale una invitación).\n' +
      '  Este guion no crea usuarios ni contraseñas.',
  );
}
console.log(`   ✓ identidad encontrada: ${identidad.id}`);

const usuarioId = await cliente.rpc('arranque_vincular_usuario', {
  p_auth_user_id: identidad.id,
  p_correo: correo,
  p_nombre: nombre,
  p_rol: rol,
  p_copropiedad_id: copropiedad,
});

console.log(`   ✓ public.usuarios + roles_usuario: ${usuarioId}`);
console.log(
  '\n▸ Listo. El gancho de claims (migración 0024) emitirá `rol` y `copropiedad_id` en el\n' +
    '  PRÓXIMO token: si la persona tenía sesión abierta, tiene que volver a entrar.\n' +
    (EXIGEN_MFA.has(rol)
      ? '  Este rol EXIGE segundo factor (RN-20): sin él, la API responderá 401.\n'
      : ''),
);
