#!/usr/bin/env node
/**
 * Aprovisiona el ROL de un usuario que YA EXISTE en Supabase Auth.
 *
 * LO QUE ESTE GUION NO HACE, y no es una limitación sino el diseño:
 *
 *  - **No crea usuarios ni contraseñas.** El alta la hace una persona en el
 *    panel de Supabase, o el propio usuario por invitación. Una contraseña
 *    generada por una herramienta acaba en el historial del intérprete de
 *    órdenes, en un registro de CI o en una captura de pantalla.
 *  - **No lee ningún secreto de un fichero del repositorio.** Las credenciales
 *    salen del entorno: `SUPABASE_URL` y `SUPABASE_SECRET_KEY`. Si falta
 *    alguna, el guion se detiene antes de hacer nada.
 *  - **No inscribe el segundo factor.** Eso lo hace el titular desde su
 *    aplicación de autenticación (ADR-008); nadie más debería poder.
 *
 * Lo que sí hace: enlazar la identidad de Supabase con `public.usuarios` y
 * darle una fila en `public.roles_usuario`, que es lo que el gancho de claims
 * de la migración 0024 lee para emitir `rol` y `copropiedad_id`.
 *
 * Usa la llave SECRETA, que OMITE la RLS. Por eso es un guion de operador que
 * se ejecuta a mano y no un endpoint: §2.7.6 exige que toda ruta que use esa
 * llave valide la copropiedad en la capa de aplicación, y aquí quien valida es
 * la persona que lo ejecuta.
 *
 *   SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
 *   node scripts/aprovisionar-rol.mjs \
 *     --correo admin@copropiedad.com \
 *     --rol administrador \
 *     --copropiedad 00000000-0000-4000-8000-000000000001 \
 *     --nombre "Nombre Apellido"
 *
 * El superadministrador se aprovisiona SIN `--copropiedad`.
 */

const ROLES = [
  'superadministrador',
  'administrador',
  'portero',
  'operador_central',
  'residente',
  'servicio',
];

const leerArgumentos = (argv) => {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const actual = argv[i];
    if (!actual.startsWith('--')) continue;
    const siguiente = argv[i + 1];
    args[actual.slice(2)] =
      siguiente !== undefined && !siguiente.startsWith('--') ? siguiente : 'true';
  }
  return args;
};

const morir = (mensaje) => {
  console.error(`\n✗ ${mensaje}\n`);
  process.exit(1);
};

const entorno = (nombre) => {
  const valor = process.env[nombre];
  if (valor === undefined || valor.trim() === '') {
    morir(
      `Falta la variable de entorno ${nombre}. No se lee de ningún fichero del ` +
        'repositorio a propósito: expórtala en la sesión donde ejecutes esto.',
    );
  }
  return valor.replace(/\/+$/, '');
};

const args = leerArgumentos(process.argv.slice(2));
const correo = args.correo;
const rol = args.rol;
const copropiedad = args.copropiedad ?? null;
const nombre = args.nombre ?? correo;

if (correo === undefined || rol === undefined) {
  morir('Uso: --correo <correo> --rol <rol> [--copropiedad <uuid>] [--nombre "..."]');
}
if (!ROLES.includes(rol)) morir(`Rol no válido: «${rol}». Válidos: ${ROLES.join(', ')}`);
if (rol !== 'superadministrador' && copropiedad === null) {
  morir(`El rol «${rol}» necesita --copropiedad. Solo el superadministrador va sin ella.`);
}

const SUPABASE_URL = entorno('SUPABASE_URL');
const SECRETO = entorno('SUPABASE_SECRET_KEY');

const cabeceras = {
  apikey: SECRETO,
  Authorization: `Bearer ${SECRETO}`,
  'Content-Type': 'application/json',
};

const pedir = async (ruta, opciones = {}) => {
  const respuesta = await fetch(`${SUPABASE_URL}${ruta}`, {
    ...opciones,
    headers: { ...cabeceras, ...(opciones.headers ?? {}) },
  });
  if (!respuesta.ok) {
    const cuerpo = await respuesta.text();
    // El cuerpo puede traer detalles; la llave NUNCA se imprime.
    morir(`${opciones.method ?? 'GET'} ${ruta} → ${respuesta.status}\n  ${cuerpo.slice(0, 400)}`);
  }
  const texto = await respuesta.text();
  return texto === '' ? null : JSON.parse(texto);
};

console.log(`\n▸ Aprovisionando «${correo}» como ${rol}`);

// 1 · La identidad TIENE que existir ya. Si no existe, se dice qué hacer y se
//     para: crearla aquí implicaría inventar una contraseña.
const listado = await pedir(
  `/auth/v1/admin/users?filter=${encodeURIComponent(correo)}&per_page=200`,
);
const usuarios = Array.isArray(listado?.users) ? listado.users : [];
const identidad = usuarios.find((u) => (u.email ?? '').toLowerCase() === correo.toLowerCase());

if (identidad === undefined) {
  morir(
    `No existe ninguna identidad con el correo «${correo}» en Supabase Auth.\n` +
      '  Créala primero en Authentication → Users → Add user (o envíale una invitación).\n' +
      '  Este guion no crea usuarios ni contraseñas.',
  );
}
console.log(`   ✓ identidad encontrada: ${identidad.id}`);

// 2 · Fila en `public.usuarios`, enlazada por `auth_user_id`.
const existentes = await pedir(
  `/rest/v1/usuarios?auth_user_id=eq.${identidad.id}&select=id,estado`,
);
let usuarioId = existentes?.[0]?.id ?? null;

if (usuarioId === null) {
  const creado = await pedir('/rest/v1/usuarios', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([
      {
        auth_user_id: identidad.id,
        correo,
        nombre,
        copropiedad_id: copropiedad,
        // `creado_por` y `actualizado_por` son NOT NULL y apuntan a un usuario.
        // El primero del sistema se apunta a sí mismo: no hay nadie anterior.
        creado_por: null,
        actualizado_por: null,
      },
    ]),
  });
  usuarioId = creado?.[0]?.id;
  if (usuarioId === undefined) morir('No se pudo crear la fila en public.usuarios');
  await pedir(`/rest/v1/usuarios?id=eq.${usuarioId}`, {
    method: 'PATCH',
    body: JSON.stringify({ creado_por: usuarioId, actualizado_por: usuarioId }),
  });
  console.log(`   ✓ public.usuarios creado: ${usuarioId}`);
} else {
  console.log(`   · public.usuarios ya existía: ${usuarioId}`);
}

// 3 · Rol. Idempotente: si ya lo tiene vigente, no se duplica.
const rolesActuales = await pedir(
  `/rest/v1/roles_usuario?usuario_id=eq.${usuarioId}&rol=eq.${rol}&estado=eq.activo&select=id` +
    (copropiedad === null ? '' : `&copropiedad_id=eq.${copropiedad}`),
);

if ((rolesActuales ?? []).length > 0) {
  console.log('   · el rol ya estaba asignado y vigente; nada que hacer');
} else {
  if (copropiedad === null) {
    morir(
      'El superadministrador también necesita una fila en roles_usuario, y esa tabla\n' +
        '  exige copropiedad_id NOT NULL. Pásale --copropiedad con cualquiera de las\n' +
        '  copropiedades activas: su alcance real es global y lo resuelve app.es_superadmin().',
    );
  }
  await pedir('/rest/v1/roles_usuario', {
    method: 'POST',
    body: JSON.stringify([
      {
        usuario_id: usuarioId,
        copropiedad_id: copropiedad,
        rol,
        creado_por: usuarioId,
        actualizado_por: usuarioId,
      },
    ]),
  });
  console.log(`   ✓ rol ${rol} asignado`);
}

console.log(
  '\n▸ Listo. El gancho de claims (migración 0024) emitirá `rol` y `copropiedad_id`\n' +
    '  en el PRÓXIMO token: si la persona tenía sesión abierta, tiene que volver a entrar.\n' +
    (['superadministrador', 'administrador', 'operador_central'].includes(rol)
      ? '  Este rol EXIGE segundo factor (RN-20): sin él, la API responderá 401.\n'
      : ''),
);
