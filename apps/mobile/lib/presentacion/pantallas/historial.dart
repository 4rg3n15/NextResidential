import 'package:flutter/material.dart';

import '../../configuracion/tema.dart';
import '../../dominio/entidades.dart';
import '../controlador.dart';
import '../widgets/estados.dart';
import 'comunes.dart';

/// M-6 · Historial — HU-33.
///
/// Los cuatro chips del mockup —Hoy · Esta Semana · Este Mes · Todo— y, sobre
/// el dibujo, tres cosas que el residente necesita y no estaban:
///
/// 1. **El motivo de la negación se muestra.** El mockup pone el distintivo
///    «Denegado» y nada más. Un residente al que le niegan una visita tiene
///    derecho a saber si fue el horario, el aforo o la lista negra: es su
///    invitado y su puerta. El enumerado del dominio se traduce a lenguaje
///    llano aquí, y **no** se inventa texto para un motivo desconocido — se
///    muestra el código, que al menos es buscable.
/// 2. **Lo decidido por el Edge se marca** (KPI-31). Un acceso resuelto sin
///    nube es información del usuario, no un detalle de implementación.
/// 3. **El gráfico de tendencia del mockup no está**, y se dice: «34 visitas
///    este mes» es un conteo que hoy nadie calcula, y dibujar una tendencia con
///    los eventos de la página visible sería un gráfico que miente al cambiar
///    de filtro.
class PantallaDeHistorial extends StatelessWidget {
  const PantallaDeHistorial({
    super.key,
    required this.controlador,
    required this.alPedirAcceso,
  });

  final ControladorDeHistorial controlador;
  final void Function() alPedirAcceso;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Historial')),
      body: AnimatedBuilder(
        animation: controlador,
        builder: (context, _) => Column(
          children: [
            _Filtros(
              periodo: controlador.periodo,
              alElegir: controlador.cambiarPeriodo,
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: controlador.cargarAhora,
                child: VistaConEstado<List<EventoDeAcceso>>(
                  estado: controlador.estado,
                  alReintentar: controlador.cargarAhora,
                  alPedirAcceso: alPedirAcceso,
                  mensajeVacio: 'Sin accesos registrados en el periodo elegido.',
                  conDatos: (eventos, {required desdeCache}) => ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      if (desdeCache) const MarcaDeCache(),
                      Text(
                        '${eventos.length} acceso(s) en el periodo',
                        style: const TextStyle(color: Paleta.textoSuave),
                      ),
                      const SizedBox(height: 12),
                      ...eventos.map((e) => _Evento(e)),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Filtros extends StatelessWidget {
  const _Filtros({required this.periodo, required this.alElegir});
  final PeriodoDeHistorial periodo;
  final Future<void> Function(PeriodoDeHistorial) alElegir;

  static const _etiquetas = {
    PeriodoDeHistorial.hoy: 'Hoy',
    PeriodoDeHistorial.semana: 'Esta semana',
    PeriodoDeHistorial.mes: 'Este mes',
    PeriodoDeHistorial.todo: 'Todo',
  };

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: PeriodoDeHistorial.values
            .map(
              (p) => Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(_etiquetas[p]!),
                  selected: p == periodo,
                  onSelected: (_) => alElegir(p),
                ),
              ),
            )
            .toList(),
      ),
    );
  }
}

class _Evento extends StatelessWidget {
  const _Evento(this.e);
  final EventoDeAcceso e;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  e.negado ? Icons.block_outlined : Icons.login_outlined,
                  size: 18,
                  color: e.negado ? Paleta.peligroSuave.texto : Paleta.exitoSuave.texto,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    e.persona ?? e.placaDetectada ?? 'Acceso',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                ),
                Distintivo(
                  texto: e.resultado ?? e.tipo,
                  pareja: e.negado ? Paleta.peligroSuave : Paleta.exitoSuave,
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              [
                momentoLegible(e.ocurridoEn),
                e.metodo,
                if (e.zona != null) e.zona!,
                if (e.placaDetectada != null && e.persona != null) e.placaDetectada!,
              ].join(' · '),
              style: const TextStyle(color: Paleta.textoSuave, fontSize: 13),
            ),
            if (e.motivo != null) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: Paleta.peligroSuave.fondo,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  motivoLegible(e.motivo!),
                  style: TextStyle(color: Paleta.peligroSuave.texto, fontSize: 13),
                ),
              ),
            ],
            if (e.decididoPorEdge) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(Icons.cloud_off_outlined, size: 14, color: Paleta.neutroSuave.texto),
                  const SizedBox(width: 6),
                  Text(
                    'Decidido en el conjunto, sin nube',
                    style: TextStyle(color: Paleta.neutroSuave.texto, fontSize: 12),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Los diez motivos del dominio, en lenguaje llano.
///
/// **Un motivo que no esté aquí se muestra tal cual**, no como «Acceso
/// denegado». Si mañana el dominio añade el motivo once —como añadió
/// `FUERA_DE_HORARIO`, que era el décimo—, la app enseñaría un texto genérico
/// que oculta la causa; mostrar el código deja algo que se puede buscar.
String motivoLegible(String motivo) => switch (motivo) {
      'VIGENCIA_EXPIRADA' => 'La autorización ya no estaba vigente',
      'AFORO_SUPERADO' => 'La zona estaba llena',
      'LISTA_NEGRA' => 'La persona o la placa está en lista negra',
      'ZONA_NO_AUTORIZADA' => 'No tenía permiso sobre esa zona',
      'FUERA_DE_PATRON' => 'Fuera de los días u horas autorizados',
      'FUERA_DE_HORARIO' => 'La zona estaba cerrada a esa hora',
      'SIN_CONSENTIMIENTO' => 'Falta el consentimiento biométrico del titular',
      'PLACA_DESCONOCIDA' => 'La placa no estaba registrada',
      'CONFIANZA_INSUFICIENTE' => 'La lectura no fue lo bastante clara',
      'FALLO_TECNICO' => 'Hubo un fallo técnico en el equipo',
      _ => motivo,
    };
