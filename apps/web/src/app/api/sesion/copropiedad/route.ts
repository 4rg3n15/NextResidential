import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guardarCopropiedadElegida } from '@/lib/sesion/cookies';
import { alcanceDeCopropiedades } from '@/lib/sesion/servidor';

/**
 * Fija la copropiedad activa de quien alcanza varias.
 *
 * **Valida contra el catálogo de la API antes de escribir la cookie.** Podría
 * limitarse a guardar lo que llega —la API volvería a comprobar el alcance en
 * cada consulta y respondería 404— y aun así estaría mal: la consola habría
 * aceptado una elección ajena y el usuario vería siete pantallas de «no
 * encontrado» sin entender por qué. Se rechaza aquí, con 404 y no con 403,
 * por la misma razón que la API: un 403 confirmaría que el identificador
 * existe.
 */
const esquema = z.object({ copropiedadId: z.string().uuid() });

export const POST = async (peticion: Request): Promise<NextResponse> => {
  const cuerpo: unknown = await peticion.json().catch(() => null);
  const analizado = esquema.safeParse(cuerpo);
  if (!analizado.success) {
    return NextResponse.json({ mensaje: 'Solicitud inválida' }, { status: 400 });
  }

  const catalogo = await alcanceDeCopropiedades();
  if (catalogo === null) {
    return NextResponse.json({ mensaje: 'Sesión no válida' }, { status: 401 });
  }
  const alcanzable = catalogo.copropiedades.some((c) => c.id === analizado.data.copropiedadId);
  if (!alcanzable) {
    return NextResponse.json({ mensaje: 'Recurso no encontrado' }, { status: 404 });
  }

  await guardarCopropiedadElegida(analizado.data.copropiedadId);
  return NextResponse.json({ copropiedadId: analizado.data.copropiedadId });
};
