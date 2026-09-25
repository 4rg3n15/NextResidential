/**
 * HU-12 · HU-13 · CU-02 · El residente fotografía a SU visitante (M-4).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LA LÍNEA QUE ESTE CASO DE USO EXISTE PARA TRAZAR · RN-10
 *
 * El titular del dato biométrico es **el visitante**, y el residente es quien
 * sostiene el teléfono. Son dos personas distintas y el sistema tiene que
 * tratarlas como tales, aunque una esté delante de la otra.
 *
 * De ahí la forma de la entrada: **`titularId` no se recibe**. Se deriva de la
 * autorización, que ya dice de quién es la visita. Si viniera en el cuerpo, un
 * residente podría capturar un rostro y colgárselo a cualquiera, y el
 * consentimiento quedaría pedido a la persona equivocada — que es precisamente
 * la forma de incumplir la Ley 1581 sin escribir una sola línea de más.
 *
 * Y de ahí también lo que este caso de uso **no** hace: no otorga nada. Crea la
 * solicitud en estado `pendiente` y ahí se detiene. El consentimiento lo
 * responde el titular, por su propio canal, con su propia identidad, y el
 * agregado lo verifica (`quienAcepta !== titularId` es un fallo del dominio).
 * Una casilla en la pantalla del residente sería la firma de otro en un papel.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * Y POR QUÉ NO SE LLAMA A `POST …/biometria/capturas`
 *
 * Esa ruta existe y funciona: es la del mostrador de portería, con rol
 * `administrador`, `portero` u `operador_central`. Abrirla al rol `residente`
 * habría sido un cambio de una palabra en el decorador —y habría dado a cada
 * residente del conjunto una ruta que recibe `titularId` desde el cuerpo.
 *
 * Aquí se reutiliza el CASO DE USO, no el controlador. La validación de
 * calidad, el cifrado del vector, la creación del consentimiento y la
 * programación de la supresión son exactamente el mismo código (KPI-16, RN-11);
 * lo único que cambia es de dónde sale el titular y quién puede pedirlo.
 */
import { Inject, Injectable } from '@nestjs/common';
import { errorDominio, exito, fallo } from '@ncr/domain-core';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { CapturarRostro, EmitirEnlaceDeConsentimiento } from '../../biometria';
import type { ResultadoCaptura } from '../../biometria';
import type { ResolverMiAmbito } from './casos-de-uso';
import { AUTORIZACIONES_DEL_RESIDENTE } from './puertos';
import type { AutorizacionesDelResidente } from './puertos';

/** Lo que la pantalla de captura envía. Sin `titularId`, y esa es la regla. */
export interface EntradaDeRostro {
  readonly autorizacionId: string;
  readonly medidas: {
    readonly nitidez: number;
    readonly iluminacion: number;
    readonly rostrosDetectados: number;
    readonly proporcionRostro: number;
  };
  /** El vector, en base64. Entra cifrado a la bóveda y no vuelve a salir. */
  readonly vector: string;
  readonly versionPolitica: string;
  /** Hasta cuándo vive la plantilla. Se acota a la vigencia de la visita. */
  readonly suprimirEn: string;
}

export type ResultadoDeRostro = ResultadoCaptura & {
  /** A QUIÉN se le pidió el consentimiento. Para que la app lo diga por su
   *  nombre y el residente entienda que no le toca a él responder. */
  readonly titular?: string;
  /**
   * A3 (15-E) · el enlace que el residente le ENTREGA al visitante para que
   * responda desde su propio teléfono. URL completa si la API declara su
   * origen público; si no, la ruta. Nunca lo abre el residente por él.
   */
  readonly enlaceDeConsentimiento?: string;
};

@Injectable()
export class CapturarRostroDeMiVisitante {
  constructor(
    private readonly resolver: ResolverMiAmbito,
    @Inject(AUTORIZACIONES_DEL_RESIDENTE)
    private readonly autorizaciones: AutorizacionesDelResidente,
    private readonly capturar: CapturarRostro,
    private readonly emitirEnlace: EmitirEnlaceDeConsentimiento,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
    entrada: EntradaDeRostro,
  ): Promise<Resultado<ResultadoDeRostro, ErrorDominio>> {
    const r = await this.resolver.ejecutar(ctx, copropiedadId);
    if (!r.ok) return r;
    const { ambito } = r.valor;

    // El segundo eje: una autorización de otra vivienda no devuelve titular, y
    // sin titular no hay captura. No hace falta un `if` de permiso porque no
    // hay nada que permitir: la consulta no la encuentra.
    const titular = await this.autorizaciones.titularDeLaAutorizacion(
      ambito,
      entrada.autorizacionId,
    );
    if (titular === null) {
      return fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'La autorización', 'RN-15'));
    }

    const capturada = await this.capturar.ejecutar(ctx, {
      // AQUÍ está RN-10: el titular sale de la autorización, no de la petición.
      titularId: titular.personaId,
      autorizacionId: entrada.autorizacionId,
      medidas: entrada.medidas,
      vector: new Uint8Array(Buffer.from(entrada.vector, 'base64')),
      versionPolitica: entrada.versionPolitica,
      // El canal dice CÓMO se pidió el consentimiento, y esto es la app del
      // residente: queda escrito para la auditoría de la Ley 1581.
      canal: 'app',
      suprimirEn: new Date(entrada.suprimirEn),
    });
    if (!capturada.ok) return capturada;
    if (!capturada.valor.aceptada) return exito(capturada.valor);

    // El enlace se emite con el contexto del residente y lleva al TITULAR
    // dentro, firmado: el residente lo entrega, no lo responde (RN-10).
    const enlace = await this.emitirEnlace.ejecutar(ctx, {
      consentimientoId: capturada.valor.consentimientoId,
    });
    return exito({
      ...capturada.valor,
      titular: titular.nombre,
      ...(enlace.ok ? { enlaceDeConsentimiento: enlace.valor.url ?? enlace.valor.ruta } : {}),
    });
  }
}
