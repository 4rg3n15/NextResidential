/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · E5 · DT-15N-01 · UNA DECISIÓN A LA VEZ POR CLAVE
 *
 * «Leer la última alerta y abrir una si no hay» son dos pasos: dos lecturas de
 * la misma placa en el mismo instante leían las dos «no hay ninguna» y abrían
 * dos alertas. `AbrirAlertaDeEquipo` lo resolvió en la 15-N encadenando las
 * decisiones por clave; esto es lo mismo, reutilizable: cada tarea de una
 * clave espera a la anterior de ESA clave, y las de claves distintas no se
 * esperan entre sí. Basta en un proceso: la API es una (P-30). Un fallo de una
 * tarea no bloquea a la siguiente.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export class FilaPorClave {
  private readonly enCurso = new Map<string, Promise<unknown>>();

  async en<T>(clave: string, tarea: () => Promise<T>): Promise<T> {
    const anterior = this.enCurso.get(clave) ?? Promise.resolve();
    const esta = anterior.then(tarea, tarea);
    this.enCurso.set(clave, esta);
    try {
      return await esta;
    } finally {
      if (this.enCurso.get(clave) === esta) this.enCurso.delete(clave);
    }
  }
}
