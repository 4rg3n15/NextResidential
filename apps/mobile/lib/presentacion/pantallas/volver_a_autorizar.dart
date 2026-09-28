/// F6 · Volver a autorizar a un visitante que ya vino.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// SÓLO SE PREGUNTA LO QUE CAMBIA
///
/// Quien viene cada semana ya dio su nombre, su documento y posó para su foto.
/// Volver a pedirlo sería trabajo para nada y, peor, una segunda foto distinta
/// de la que los equipos ya conocían. Así que esta pantalla pregunta CUÁNDO,
/// CUÁNTO y la casilla, y nada más: el servidor copia el resto de la visita
/// anterior, y sólo si es de la vivienda de quien lo pide.
///
/// La casilla se vuelve a marcar aunque la foto sea la misma: cada autorización
/// lleva su propia constancia de que el visitante autorizó el uso de su foto,
/// y una constancia heredada no probaría nada sobre esta visita.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// LA CLAVE LLEGA HECHA
///
/// Como en «Nuevo visitante», la clave de idempotencia se genera al ABRIR la
/// pantalla y se repite en cada intento: pulsar dos veces, o reintentar tras
/// quedarse sin red, devuelve la misma visita en vez de crear otra (RN-17).
library;

import 'package:flutter/material.dart';

import '../../configuracion/tema.dart';
import '../../dominio/entidades.dart';
import '../../dominio/puertos.dart';
import '../widgets/campos_de_visita.dart';
import 'comunes.dart';

/// La forma de `RepositorioDelResidente.volverAAutorizar`, para que la pantalla
/// reciba justo esa operación y no el repositorio entero.
typedef VolverAAutorizarVisita = Future<ResultadoDeVisita> Function({
  required String autorizacionId,
  required DateTime inicio,
  required int duracionMinutos,
  required bool casillaMarcada,
  required String claveDeIdempotencia,
});

class PantallaDeVolverAAutorizar extends StatefulWidget {
  const PantallaDeVolverAAutorizar({
    super.key,
    required this.visitante,
    required this.volverAAutorizar,
    required this.claveDeIdempotencia,
    required this.ahora,
  });

  final VisitanteReciente visitante;
  final VolverAAutorizarVisita volverAAutorizar;
  final String claveDeIdempotencia;
  final DateTime ahora;

  @override
  State<PantallaDeVolverAAutorizar> createState() => _EstadoDeLaRepeticion();
}

class _EstadoDeLaRepeticion extends State<PantallaDeVolverAAutorizar> {
  late DateTime _inicio = alMinuto(widget.ahora);
  int _duracion = duracionPorOmision;
  bool _casilla = false;
  bool _enviando = false;
  ResultadoDeVisita? _desenlace;
  String? _error;

  Future<void> _enviar() async {
    if (!_casilla || _enviando) return;
    setState(() {
      _enviando = true;
      _desenlace = null;
      _error = null;
    });
    try {
      final r = await widget.volverAAutorizar(
        autorizacionId: widget.visitante.autorizacionId,
        inicio: _inicio,
        duracionMinutos: _duracion,
        casillaMarcada: _casilla,
        claveDeIdempotencia: widget.claveDeIdempotencia,
      );
      if (mounted) setState(() => _desenlace = r);
    } on Fallo catch (f) {
      // Sin red, una visita que no es de su vivienda, una visita sin foto que
      // copiar: el motivo, tal como lo dijo quien lo sabe. Reintentar es seguro
      // porque la clave no cambia.
      if (mounted) setState(() => _error = f.detalle);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final v = widget.visitante;
    final habilitado = !_enviando;
    return Scaffold(
      appBar: AppBar(title: const Text('Volver a autorizar')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(v.visitante, style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 4),
                  Text(
                    [
                      'Documento ${v.documento}',
                      if (v.placa != null) 'placa ${v.placa}',
                      'vino el ${momentoLegible(v.ultimaVisita)}',
                    ].join(' · '),
                    style: const TextStyle(color: Paleta.textoSuave, fontSize: 13),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Se usan de nuevo su nombre, su documento, su placa y su foto. '
                    'Sólo falta decir cuándo viene.',
                    style: TextStyle(fontSize: 13),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          CuandoYCuantoDura(
            inicio: _inicio,
            duracionMinutos: _duracion,
            hoy: widget.ahora.toLocal(),
            habilitado: habilitado,
            alCambiarInicio: (d) => setState(() => _inicio = d),
            alCambiarDuracion: (m) => setState(() => _duracion = m),
          ),
          const SizedBox(height: 16),
          CasillaDeLaFoto(
            nombreDelVisitante: v.visitante,
            marcada: _casilla,
            habilitada: habilitado,
            alCambiar: (c) => setState(() => _casilla = c),
          ),
          if (_error != null) ...[
            const SizedBox(height: 16),
            AvisoDeVisitaFallida(detalle: _error!, alCerrar: () => setState(() => _error = null)),
          ],
          if (_desenlace != null) ...[
            const SizedBox(height: 16),
            DesenlaceDeVisita(
              resultado: _desenlace!,
              alCerrar: () => setState(() => _desenlace = null),
            ),
          ],
          const SizedBox(height: 16),
          FilledButton.icon(
            key: const Key('repeticion.autorizar'),
            onPressed: _casilla && !_enviando ? _enviar : null,
            icon: _enviando
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.check),
            label: Text(_enviando ? 'Autorizando…' : 'Autorizar de nuevo'),
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
          ),
          if (!_casilla) ...[
            const SizedBox(height: 8),
            const Text(
              'Falta: marcar la casilla.',
              style: TextStyle(color: Paleta.textoSuave, fontSize: 13),
            ),
          ],
        ],
      ),
    );
  }
}
