import type { Enlace } from './sesion-de-tunel';

/**
 * 15-Q2 · dos puntas de túnel unidas en memoria, para las pruebas (la suite de
 * contrato, ADR-03). Cada entrega es ASÍNCRONA, como en la red: un adaptador
 * que dependiera de que la respuesta llegue en el mismo turno fallaría aquí
 * igual que con un WebSocket. El texto viaja como texto y los bytes se COPIAN:
 * nada se comparte por referencia entre los dos lados.
 */
export const enlacesEnMemoria = (): readonly [
  Enlace & { cortar(): void },
  Enlace & { cortar(): void },
] => {
  const receptores: [((d: string | Uint8Array) => void)[], ((d: string | Uint8Array) => void)[]] = [
    [],
    [],
  ];
  const cierres: [((m: string) => void)[], ((m: string) => void)[]] = [[], []];
  let abierto = true;
  const cerrarAmbos = (motivo: string): void => {
    if (!abierto) return;
    abierto = false;
    setImmediate(() => {
      for (const c of [...cierres[0], ...cierres[1]]) c(motivo);
    });
  };
  const punta = (yo: 0 | 1): Enlace & { cortar(): void } => {
    const otro = yo === 0 ? 1 : 0;
    return {
      enviar: (dato) => {
        if (!abierto) return;
        const copia = typeof dato === 'string' ? dato : new Uint8Array(dato);
        setImmediate(() => {
          if (abierto) for (const r of receptores[otro]) r(copia);
        });
      },
      cerrar: (_codigo, motivo) => cerrarAmbos(motivo),
      alRecibir: (m) => void receptores[yo].push(m),
      alCerrar: (m) => void cierres[yo].push(m),
      cortar: () => cerrarAmbos('corte de red simulado'),
    };
  };
  return [punta(0), punta(1)];
};
