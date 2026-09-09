import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { AccesosPorHora, DispositivoDelTablero, EventoRegistrado } from '@ncr/contracts';
import { TablaDeDatos } from './tabla-datos';
import { FilaDeDispositivo } from './tarjeta-dispositivo';
import { FilaDeEvento } from './fila-evento';
import { HistogramaDeAccesos } from './histograma-accesos';
import { TarjetaKpi } from './tarjeta-kpi';
import { Distintivo, DistintivoDePlaca } from './ui/distintivo';
import { IndicadorDeCanal } from './cabecera';

const dispositivo = (parcial: Partial<DispositivoDelTablero> = {}): DispositivoDelTablero => ({
  id: 'd1',
  nombre: 'Cámara LPR Portería',
  tipo: 'camara_lpr',
  zonaId: null,
  host: '10.0.0.5',
  puerto: 80,
  modelo: 'DS-2CD',
  firmware: 'V5.7',
  estado: 'saludable',
  ultimoLatido: '2026-09-09T12:00:00Z',
  ultimaSincronizacion: null,
  segundosSinLatir: 30,
  ...parcial,
});

const evento = (parcial: Partial<EventoRegistrado> = {}): EventoRegistrado =>
  ({
    id: 'e1',
    copropiedadId: 'c1',
    ocurridoEn: '2026-09-09T13:20:00Z',
    tipo: 'ingreso',
    resultado: 'permitido',
    motivo: null,
    metodo: 'placa',
    personaId: null,
    viviendaId: null,
    zonaId: null,
    dispositivoId: 'd1',
    placaDetectada: 'ABC123',
    confianza: 0.98,
    reglaAplicada: 'vigencia',
    versionReglas: 3,
    operadorId: null,
    motivoManual: null,
    evidenciaId: null,
    decididoPorEdge: false,
    ...parcial,
  }) as EventoRegistrado;

describe('FilaDeDispositivo · tres estados, no dos', () => {
  it('«saludable» se muestra como En línea', () => {
    render(
      <ul>
        <FilaDeDispositivo dispositivo={dispositivo()} />
      </ul>,
    );
    expect(screen.getByText('En línea')).toBeDefined();
  });

  it('«degradado» NO se colapsa con «caído»', () => {
    // El escalón intermedio es el que separa «se saltó un latido» de «lleva
    // minutos mudo». Sin él, o se alerta por cada hipo o se avisa tarde.
    render(
      <ul>
        <FilaDeDispositivo dispositivo={dispositivo({ estado: 'degradado' })} />
      </ul>,
    );
    expect(screen.getByText('Degradado')).toBeDefined();
    expect(screen.queryByText('Sin señal')).toBeNull();
  });

  it('un equipo que nunca latió lo dice, no muestra «hace 0 s»', () => {
    render(
      <ul>
        <FilaDeDispositivo
          dispositivo={dispositivo({ estado: 'caido', ultimoLatido: null, segundosSinLatir: null })}
        />
      </ul>,
    );
    expect(screen.getByText(/nunca ha reportado/)).toBeDefined();
  });

  it('el direccionamiento se oculta cuando la API no lo envía (C-11)', () => {
    render(
      <ul>
        <FilaDeDispositivo dispositivo={dispositivo({ host: null })} />
      </ul>,
    );
    expect(screen.queryByText(/10\.0\.0\.5/)).toBeNull();
  });

  it('nunca pinta nada que se parezca a una credencial', () => {
    const { container } = render(
      <ul>
        <FilaDeDispositivo dispositivo={dispositivo()} />
      </ul>,
    );
    expect(container.textContent).not.toMatch(/vault:|env:|credencial/i);
  });
});

describe('FilaDeEvento · un solo motivo, tipado', () => {
  it('un acceso permitido muestra la regla y la versión que lo decidió', () => {
    render(
      <ul>
        <FilaDeEvento evento={evento()} zonaHoraria="America/Bogota" />
      </ul>,
    );
    expect(screen.getByText('Autorizado')).toBeDefined();
    expect(screen.getByText(/versión 3/)).toBeDefined();
  });

  it('una denegación muestra UN motivo, el que determinó la decisión', () => {
    // El mockup mezclaba «Sin Registro / Lista Negra» en la misma línea. Son
    // excluyentes y con precedencia: mostrar los dos impide saber cuál fue.
    render(
      <ul>
        <FilaDeEvento
          evento={evento({ resultado: 'negado', motivo: 'LISTA_NEGRA', tipo: 'denegado' })}
          zonaHoraria="America/Bogota"
        />
      </ul>,
    );
    expect(screen.getByText('Persona o placa en lista negra')).toBeDefined();
    expect(screen.queryByText(/Placa no registrada/)).toBeNull();
  });

  it('la hora se muestra en la zona de la COPROPIEDAD, no en la del navegador', () => {
    // 13:20 UTC son las 08:20 en Bogotá. Con la zona del navegador el mismo
    // evento aparecería a otra hora según quién lo mire.
    render(
      <ul>
        <FilaDeEvento evento={evento()} zonaHoraria="America/Bogota" />
      </ul>,
    );
    expect(screen.getByText('08:20 a. m.')).toBeDefined();
  });

  it('marca los eventos decididos por el Edge (RN-16, KPI-31)', () => {
    render(
      <ul>
        <FilaDeEvento evento={evento({ decididoPorEdge: true })} zonaHoraria="America/Bogota" />
      </ul>,
    );
    expect(screen.getByText('Decidido por el Edge')).toBeDefined();
  });

  it('la placa va en monoespaciada', () => {
    render(
      <ul>
        <FilaDeEvento evento={evento()} zonaHoraria="America/Bogota" />
      </ul>,
    );
    expect(screen.getByText('ABC123').className).toContain('font-mono');
  });
});

describe('Distintivo · el color no es el único portador de significado', () => {
  it('cada tono lleva icono además de color', () => {
    const { container } = render(<Distintivo tono="exito">Autorizado</Distintivo>);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('la placa se distingue del resto por tipografía, no solo por color', () => {
    render(<DistintivoDePlaca placa="XYZ999" />);
    expect(screen.getByText('XYZ999').className).toContain('font-mono');
  });
});

describe('HistogramaDeAccesos', () => {
  const datos = (franjas: AccesosPorHora['franjas']): AccesosPorHora => ({
    franjas,
    zonaHoraria: 'America/Bogota',
    desde: '2026-09-09T05:00:00Z',
    hasta: '2026-09-10T05:00:00Z',
  });

  const vacio = Array.from({ length: 24 }, (_, hora) => ({ hora, permitidos: 0, negados: 0 }));

  it('un día sin accesos lo dice, en vez de pintar un eje vacío', () => {
    render(<HistogramaDeAccesos datos={datos(vacio)} />);
    expect(screen.getByText(/Todavía no hay accesos registrados hoy/)).toBeDefined();
  });

  it('ofrece un equivalente textual con las mismas cifras', () => {
    // Un gráfico sin equivalente es contenido inaccesible: el lector de
    // pantalla anuncia «gráfico» y nada más.
    const conDatos = [...vacio];
    conDatos[8] = { hora: 8, permitidos: 12, negados: 1 };
    render(<HistogramaDeAccesos datos={datos(conDatos)} />);
    const tabla = screen.getByRole('table', { hidden: true });
    expect(within(tabla).getByText('08:00')).toBeDefined();
    expect(within(tabla).getByText('12')).toBeDefined();
  });

  it('declara la zona horaria con la que se agrupó', () => {
    const conDatos = [...vacio];
    conDatos[9] = { hora: 9, permitidos: 3, negados: 0 };
    render(<HistogramaDeAccesos datos={datos(conDatos)} />);
    expect(screen.getAllByText(/America\/Bogota/).length).toBeGreaterThan(0);
  });
});

describe('TarjetaKpi · una tarjeta caída no tumba el tablero', () => {
  it('muestra su propio error sin afectar a las demás', () => {
    render(
      <TarjetaKpi
        etiqueta="Alertas pendientes"
        valor={null}
        icono={<span />}
        error={{ descripcion: 'La consulta falló' }}
      />,
    );
    expect(screen.getByText('La consulta falló')).toBeDefined();
  });

  it('mientras carga no enseña un cero, que se leería como un dato', () => {
    render(<TarjetaKpi etiqueta="Residentes activos" valor={null} icono={<span />} cargando />);
    expect(screen.queryByText('0')).toBeNull();
  });

  it('formatea la cifra en español', () => {
    render(<TarjetaKpi etiqueta="Residentes" valor={1247} icono={<span />} />);
    expect(screen.getByText('1.247')).toBeDefined();
  });
});

describe('IndicadorDeCanal · una lista congelada sin avisar es peor que una vacía', () => {
  it('anuncia cuando el canal NO está entregando', () => {
    render(<IndicadorDeCanal estado="sin-conexion" />);
    expect(screen.getByText('Sin canal en vivo')).toBeDefined();
    expect(screen.getByText(/no está entregando eventos/)).toBeDefined();
  });

  it('y cuando sí lo está', () => {
    render(<IndicadorDeCanal estado="conectado" />);
    expect(screen.getByText('En vivo')).toBeDefined();
  });
});

describe('TablaDeDatos', () => {
  interface Fila {
    id: string;
    nombre: string;
  }
  const filas: Fila[] = Array.from({ length: 25 }, (_, i) => ({
    id: `f${i}`,
    nombre: `Vivienda ${String(i).padStart(2, '0')}`,
  }));

  const tabla = (props: Partial<Parameters<typeof TablaDeDatos<Fila>>[0]> = {}) =>
    render(
      <TablaDeDatos<Fila>
        titulo="Viviendas"
        columnas={[
          { clave: 'nombre', titulo: 'Nombre', celda: (f) => f.nombre, texto: (f) => f.nombre },
        ]}
        filas={filas}
        claveDeFila={(f) => f.id}
        buscador={{ marcador: 'Buscar vivienda' }}
        {...props}
      />,
    );

  it('usa semántica real de tabla, con encabezados asociados', () => {
    tabla();
    expect(screen.getByRole('table')).toBeDefined();
    expect(screen.getByRole('columnheader', { name: 'Nombre' })).toBeDefined();
  });

  it('pagina y anuncia la página actual', () => {
    tabla();
    expect(screen.getByText(/Página 1 de 3 · 25 registros/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText(/Página 2 de 3/)).toBeDefined();
  });

  it('distingue «no hay datos» de «el filtro no encuentra nada»', () => {
    // Son dos situaciones con salidas opuestas: crear algo, o quitar el filtro.
    tabla();
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'no existe' } });
    expect(screen.getByText('Sin resultados')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Quitar el filtro' })).toBeDefined();

    tabla({ filas: [] });
    expect(screen.getAllByText('Todavía no hay datos').length).toBeGreaterThan(0);
  });

  it('al filtrar vuelve a la primera página', () => {
    tabla();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'Vivienda 0' } });
    // Sin esto la tabla se vería vacía teniendo resultados: la página anterior
    // queda fuera del conjunto reducido.
    expect(screen.getByText('Vivienda 00')).toBeDefined();
  });

  it('una fila pulsable responde también al teclado', () => {
    const alPulsar = vi.fn();
    tabla({ alPulsarFila: alPulsar });
    fireEvent.keyDown(screen.getAllByRole('button', { name: /Vivienda 00/ })[0]!, { key: 'Enter' });
    expect(alPulsar).toHaveBeenCalledWith(filas[0]);
  });
});
