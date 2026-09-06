export interface EventoDeDominio {
  readonly nombre: string;
  readonly ocurridoEn: Date;
  readonly copropiedadId: string;
  readonly carga: Readonly<Record<string, unknown>>;
}

export type ManejadorDeEvento = (evento: EventoDeDominio) => Promise<void>;

/**
 * Bus de eventos de dominio. Es la vía por la que los módulos se hablan sin
 * importarse entre sí (§2.2: «se comunican por interfaces y eventos»).
 */
export interface BusDeEventos {
  publicar(evento: EventoDeDominio): Promise<void>;
  suscribir(nombre: string, manejador: ManejadorDeEvento): void;
}
