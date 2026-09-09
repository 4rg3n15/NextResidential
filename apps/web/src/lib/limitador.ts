/**
 * Limitador de peticiones de la consola — **por IP y por identidad**.
 *
 * §2.7.5 exige límite endurecido en recuperación de contraseña, y aquí hace
 * falta por dos motivos distintos que un solo contador no cubre:
 *
 *  - **Por IP**, contra quien prueba muchos correos desde un sitio.
 *  - **Por identidad**, contra quien inunda un buzón concreto desde muchas IP.
 *    Sin este segundo, una botnet enviaría cien correos de recuperación a la
 *    misma persona sin superar ningún tope por IP.
 *
 * Es una ventana deslizante en memoria, y **eso se declara**: vive en el
 * proceso, así que con varias instancias de la consola cada una lleva su
 * cuenta. No es la barrera definitiva —lo son el limitador de Supabase y el
 * `ThrottlerModule` de la API—, es la que evita gastar una llamada al proveedor
 * de identidad por cada intento. La ETAPA 14, cuando el despliegue pase de una
 * instancia, lo mueve a almacenamiento compartido: está anotado en el ADR-006
 * como el mismo peldaño que el canal de tiempo real.
 *
 * Estructura pura y con reloj inyectado, para poder probar los bordes sin
 * esperar un minuto real.
 */

export interface Cupo {
  readonly permitidos: number;
  readonly ventanaMs: number;
}

export interface Veredicto {
  readonly admitido: boolean;
  /** Segundos que faltan para volver a intentarlo; 0 si está admitido. */
  readonly reintentarEnSegundos: number;
}

export class Limitador {
  private readonly marcas = new Map<string, number[]>();

  constructor(
    private readonly cupo: Cupo,
    private readonly ahora: () => number = Date.now,
  ) {}

  consultar(clave: string): Veredicto {
    const t = this.ahora();
    const desde = t - this.cupo.ventanaMs;
    const previas = (this.marcas.get(clave) ?? []).filter((m) => m > desde);

    if (previas.length >= this.cupo.permitidos) {
      const masAntigua = previas[0] ?? t;
      this.marcas.set(clave, previas);
      return {
        admitido: false,
        reintentarEnSegundos: Math.max(1, Math.ceil((masAntigua + this.cupo.ventanaMs - t) / 1000)),
      };
    }

    previas.push(t);
    this.marcas.set(clave, previas);
    // Poda perezosa: sin ella el mapa crece con cada clave vista. Se hace aquí
    // y no con un temporizador porque un temporizador mantiene vivo el proceso.
    if (this.marcas.size > 10_000) this.podar(desde);
    return { admitido: true, reintentarEnSegundos: 0 };
  }

  private podar(desde: number): void {
    for (const [clave, marcas] of this.marcas) {
      const vivas = marcas.filter((m) => m > desde);
      if (vivas.length === 0) this.marcas.delete(clave);
      else this.marcas.set(clave, vivas);
    }
  }
}

/**
 * Clave de identidad **normalizada y con longitud acotada**. Sin normalizar,
 * `Admin@X.com` y `admin@x.com` serían dos cupos para el mismo buzón; sin
 * acotar, un correo de diez mil caracteres sería una clave de diez mil
 * caracteres en el mapa.
 */
export const claveDeIdentidad = (correo: string): string =>
  correo.trim().toLocaleLowerCase('en').slice(0, 254);

/** Primera dirección de `X-Forwarded-For`, o la del socket. */
export const ipDe = (cabeceras: Headers): string => {
  const reenviada = cabeceras.get('x-forwarded-for');
  if (reenviada !== null && reenviada.trim() !== '') {
    return (reenviada.split(',')[0] ?? '').trim().slice(0, 64) || 'desconocida';
  }
  return (cabeceras.get('x-real-ip') ?? 'desconocida').slice(0, 64);
};
