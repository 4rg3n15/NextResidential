import { describe, expect, it } from 'vitest';
import { alertarRechazosDelEdge } from '../src/edge/aplicacion/alerta-de-rechazo';
import { AbrirAlertaDeEquipo } from '../src/eventos/aplicacion/deduplicacion-de-alertas';
import { EscalarAlerta } from '../src/eventos/aplicacion/escalamiento';
import { RepositorioAlertasEnMemoria } from '../src/eventos/infraestructura/repositorios-en-memoria';
import {
  bitacoraDePrueba,
  canalCon,
  idsSecuenciales,
  pushDePrueba,
  relojFijo,
} from '../src/eventos/aplicacion/dobles';

/**
 * 15-R · E6 · P-31 · el rechazo de un acceso del Edge abre UNA alerta alta y
 * persistente por evento: los reintentos del Edge no abren más.
 */
const COP = 'cop-1';
const evento = (referenciaExterna: string) => ({
  copropiedadId: COP,
  dispositivoId: 'camara-1',
  referenciaExterna,
});

const montar = () => {
  const repo = new RepositorioAlertasEnMemoria();
  const reloj = relojFijo(new Date('2026-10-03T12:00:00Z'));
  const bitacora = bitacoraDePrueba();
  const canal = canalCon(1);
  const alertas = new AbrirAlertaDeEquipo(
    repo,
    new EscalarAlerta(canal, repo, reloj, bitacora, pushDePrueba()),
    reloj,
    idsSecuenciales('al'),
    bitacora,
  );
  return { repo, alertas, reloj };
};

describe('E6 · la nube avisa al rechazar un acceso del Edge', () => {
  it('rechazado: una alerta alta, persistente, con el motivo; aceptado: ninguna', async () => {
    const { repo, alertas } = montar();
    const n = await alertarRechazosDelEdge(
      alertas,
      [evento('ref-ok'), evento('ref-ilegible')],
      [{ aceptado: true }, { aceptado: false, detalle: 'placa ilegible' }],
      'actor',
    );
    expect(n).toBe(1);
    const [alerta, ...otras] = await repo.abiertasDe(COP);
    expect(otras).toHaveLength(0);
    expect(alerta).toMatchObject({ tipo: 'acceso_dudoso', severidad: 'alta' });
    expect(alerta?.notas).toMatch(/placa ilegible/);
    expect(alerta?.notas).toMatch(/cuarentena/);
  });

  it('los reintentos del Edge NO abren más alertas del mismo evento', async () => {
    const { repo, alertas, reloj } = montar();
    for (let i = 0; i < 3; i += 1) {
      await alertarRechazosDelEdge(alertas, [evento('ref-x')], [{ aceptado: false }], 'actor');
      reloj.avanzar(15 * 60_000); // más allá de la ventana: la persistente sigue abierta
    }
    expect(await repo.abiertasDe(COP)).toHaveLength(1);
  });
});
