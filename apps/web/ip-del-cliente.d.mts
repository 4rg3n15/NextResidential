export function proxiesDeConfianza(texto: string | undefined): Set<string>;
export function ipDelCliente(
  socket: string | undefined,
  cabecera: string | string[] | undefined,
  deConfianza: ReadonlySet<string>,
): string;
