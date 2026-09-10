import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { vistaPreviaDePlaca } from './vehiculos/normalizar-placa';
import { patronEnTexto } from './visitantes/patron';
import { franjaEnTexto } from './zonas/horario';
import { GraficoDeFrecuencia } from '@/componentes/grafico-frecuencia';
import { NAVEGACION } from '@/lib/navegacion';

/**
 * Lo que estas pruebas protegen NO es la maquetación: es lo que la interfaz
 * AFIRMA. Cada una corresponde a una frase concreta del requisito que una
 * pantalla puede desmentir sin que nadie lo note.
 */

describe('la normalización de la placa se PREVISUALIZA igual que la aplica el dominio', () => {
  it('quita los separadores habituales y pasa a mayúsculas', () => {
    expect(vistaPreviaDePlaca(' abc-123 ')).toBe('ABC123');
    expect(vistaPreviaDePlaca('abc_1.2 3')).toBe('ABC123');
  });

  it('NO borra lo desconocido: un carácter raro sigue viéndose', () => {
    // Es la diferencia entre normalizar y limpiar. Si la vista previa borrara
    // el símbolo, el usuario creería tener una placa válida y el servidor la
    // rechazaría sin que él entendiera por qué.
    expect(vistaPreviaDePlaca('ABC-12Ω3')).toBe('ABC12Ω3');
  });

  it('pliega el ancho completo, como hace el objeto de valor', () => {
    expect(vistaPreviaDePlaca('ＡＢＣ１２３')).toBe('ABC123');
  });
});

describe('el patrón de una autorización recurrente se puede leer', () => {
  it('nombra los días y la franja', () => {
    expect(patronEnTexto({ dias: [1, 3, 5], horaInicio: '08:00', horaFin: '18:00' })).toBe(
      'Lun, Mié, Vie · 08:00–18:00',
    );
  });

  it('domingo es 0, el vocabulario del dominio', () => {
    expect(patronEnTexto({ dias: [0], horaInicio: '10:00', horaFin: '12:00' })).toContain('Dom');
  });
});

describe('el horario de zona dice cuándo una franja CRUZA la medianoche', () => {
  it('una franja normal se escribe sin adornos', () => {
    expect(
      franjaEnTexto({ dia: 1, minutoInicio: 360, minutoFin: 1320, continuaDelDiaAnterior: false }),
    ).toBe('Lunes 06:00–22:00');
  });

  it('una continuación lo DICE y explica que el aforo no se reinicia', () => {
    // Sin esta frase, el operador lee «domingo 00:00–02:00» y entiende que la
    // zona cerró a medianoche y el contador volvió a cero. No volvió.
    const texto = franjaEnTexto({
      dia: 0,
      minutoInicio: 0,
      minutoFin: 120,
      continuaDelDiaAnterior: true,
    });
    expect(texto).toContain('viene del día anterior');
    expect(texto).toContain('no se reinicia');
  });
});

describe('el gráfico de frecuencia es legible sin verlo', () => {
  it('cada barra lleva su cifra en texto', () => {
    render(
      <GraficoDeFrecuencia
        puntos={[
          { semana: '2026-09-01', total: 12 },
          { semana: '2026-09-08', total: 30 },
        ]}
        etiqueta="Accesos por semana"
      />,
    );
    expect(screen.getByLabelText('Semana del 2026-09-08: 30 accesos')).toBeDefined();
  });

  it('sin datos NO dibuja un gráfico vacío: lo dice', () => {
    render(<GraficoDeFrecuencia puntos={[]} etiqueta="Accesos por semana" />);
    expect(screen.getByText(/no hay accesos en el rango/i)).toBeDefined();
  });
});

describe('la navegación ya no promete pantallas que no existen', () => {
  it('las siete de la 09-B están disponibles y solo Configuración queda pendiente', () => {
    const pendientes = NAVEGACION.filter((e) => e.pendienteDeEtapa !== null).map((e) => e.clave);
    expect(pendientes).toEqual(['configuracion']);
  });
});
