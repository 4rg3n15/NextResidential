/**
 * Cliente mínimo de la API de administración de Supabase para los guiones de
 * aprovisionamiento.
 *
 * Las credenciales salen SIEMPRE del entorno y nunca de un fichero del
 * repositorio. Si falta una, el guion se detiene antes de hacer nada: es
 * preferible no arrancar a arrancar contra el proyecto equivocado.
 *
 * La llave secreta **omite la RLS**. Por eso estos guiones son operaciones de
 * operador que se ejecutan a mano y no endpoints: §2.7.6 exige que toda ruta
 * que use esa llave valide la copropiedad en la capa de aplicación, y aquí
 * quien valida es la persona que lo ejecuta —con la ayuda de las funciones de
 * la migración 0025, que validan sus argumentos del lado de la base—.
 */

export const morir = (mensaje) => {
  console.error(`\n✗ ${mensaje}\n`);
  process.exit(1);
};

export const leerArgumentos = (argv) => {
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

export const entorno = (nombre) => {
  const valor = process.env[nombre];
  if (valor === undefined || valor.trim() === '') {
    morir(
      `Falta la variable de entorno ${nombre}. No se lee de ningún fichero del ` +
        'repositorio a propósito: expórtala en la sesión donde ejecutes esto.',
    );
  }
  return valor.trim().replace(/\/+$/, '');
};

export const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const crearCliente = () => {
  const url = entorno('SUPABASE_URL');
  const secreto = entorno('SUPABASE_SECRET_KEY');
  const cabeceras = {
    apikey: secreto,
    Authorization: `Bearer ${secreto}`,
    'Content-Type': 'application/json',
  };

  /**
   * El detalle del error de PostgREST se muestra tal cual porque es donde viven
   * los mensajes de las funciones de la 0025 —«No existe ninguna copropiedad
   * activa con id …»—, que es exactamente lo que quien ejecuta necesita leer.
   * La llave NUNCA se imprime.
   */
  const fallar = async (respuesta, que) => {
    let detalle = await respuesta.text();
    try {
      const cuerpo = JSON.parse(detalle);
      detalle = cuerpo.message ?? cuerpo.error ?? detalle;
    } catch {
      /* se deja el texto crudo */
    }
    morir(`${que} → ${respuesta.status}\n  ${String(detalle).slice(0, 500)}`);
  };

  return {
    url,

    /** Llama a una función expuesta por PostgREST. */
    async rpc(funcion, argumentos) {
      let respuesta;
      try {
        respuesta = await fetch(`${url}/rest/v1/rpc/${funcion}`, {
          method: 'POST',
          headers: cabeceras,
          body: JSON.stringify(argumentos),
        });
      } catch (e) {
        morir(
          `No se pudo contactar con ${url}. Revisa SUPABASE_URL y tu red.\n` +
            `  (${e instanceof Error ? e.message : String(e)})`,
        );
      }
      if (!respuesta.ok) await fallar(respuesta, `rpc/${funcion}`);
      const texto = await respuesta.text();
      return texto === '' ? null : JSON.parse(texto);
    },

    async consultar(ruta, que) {
      let respuesta;
      try {
        respuesta = await fetch(`${url}/rest/v1/${ruta}`, { headers: cabeceras });
      } catch (e) {
        morir(`No se pudo contactar con ${url}: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (!respuesta.ok) await fallar(respuesta, que);
      return respuesta.json();
    },

    /** Identidad de Supabase Auth por correo. `null` si no existe. */
    async identidadPorCorreo(correo) {
      let respuesta;
      try {
        respuesta = await fetch(
          `${url}/auth/v1/admin/users?filter=${encodeURIComponent(correo)}&per_page=200`,
          { headers: cabeceras },
        );
      } catch (e) {
        morir(`No se pudo contactar con ${url}: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (!respuesta.ok) await fallar(respuesta, 'admin/users');
      const cuerpo = await respuesta.json();
      const usuarios = Array.isArray(cuerpo?.users) ? cuerpo.users : [];
      return usuarios.find((u) => (u.email ?? '').toLowerCase() === correo.toLowerCase()) ?? null;
    },

    /** Copropiedades activas, para validar argumentos y para poder listarlas. */
    async copropiedadesActivas() {
      return this.consultar(
        'copropiedades?estado=eq.activa&select=id,nombre,nit&order=creado_en',
        'copropiedades',
      );
    },
  };
};

/**
 * Valida que la copropiedad exista ANTES de intentar nada, y si no, enseña las
 * que hay. El fallo original de esta guía fue precisamente pasar un UUID que no
 * existía porque no había ninguno que pasar, y el guion llegaba hasta el
 * `INSERT` para morir con un error de clave ajena.
 */
export const exigirCopropiedad = async (cliente, id) => {
  if (!ES_UUID.test(id)) morir(`«${id}» no es un UUID válido.`);
  const activas = await cliente.copropiedadesActivas();
  if (activas.some((c) => c.id === id)) return;

  if (activas.length === 0) {
    morir(
      'No hay ninguna copropiedad activa en este proyecto.\n' +
        '  Crea la primera con:  node scripts/registrar-copropiedad.mjs --nombre "..." --nit "..."',
    );
  }
  morir(
    `No existe ninguna copropiedad activa con id ${id}.\n  Activas en este proyecto:\n` +
      activas.map((c) => `    ${c.id}  ${c.nombre} (NIT ${c.nit})`).join('\n'),
  );
};
