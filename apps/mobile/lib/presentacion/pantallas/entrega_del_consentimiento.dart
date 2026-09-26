/// Punto 5 (15-I) · cómo le llega al VISITANTE el enlace para que él responda.
///
/// El residente no consiente por su visitante (RN-10): le ENTREGA el enlace.
/// Tres formas, porque el visitante puede estar delante o no:
///
///  · el QR, para que lo escanee con su propio teléfono ahí mismo;
///  · el panel nativo de compartir (WhatsApp, SMS…), para enviárselo;
///  · el enlace en texto, seleccionable, por si ninguna de las dos sirve.
///
/// Y el ESTADO —pendiente, aceptado, rechazado— se consulta a la API, no se
/// supone: mientras diga «pendiente», la foto no va a ninguna terminal (RN-09).
library;

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../dominio/hogar.dart';
import '../../dominio/puertos.dart';

class EntregaDelConsentimiento extends StatefulWidget {
  const EntregaDelConsentimiento({
    super.key,
    required this.titular,
    required this.enlace,
    required this.compartidor,
    required this.consultar,
  });

  final String titular;

  /// Ya completo (`enlaceParaCompartir`): un visitante no puede abrir una ruta.
  final String enlace;
  final Compartidor compartidor;
  final Future<EstadoDeConsentimiento> Function() consultar;

  @override
  State<EntregaDelConsentimiento> createState() => _EstadoDeLaEntrega();
}

class _EstadoDeLaEntrega extends State<EntregaDelConsentimiento> {
  EstadoDeConsentimiento _estado = EstadoDeConsentimiento.pendiente;
  bool _consultando = false;
  String? _error;

  Future<void> _consultar() async {
    setState(() {
      _consultando = true;
      _error = null;
    });
    try {
      final e = await widget.consultar();
      if (mounted) setState(() => _estado = e);
    } on Fallo catch (f) {
      if (mounted) setState(() => _error = f.detalle);
    } finally {
      if (mounted) setState(() => _consultando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final esquema = Theme.of(context).colorScheme;
    final (texto, color) = switch (_estado) {
      EstadoDeConsentimiento.aceptado => ('Aceptado por ${widget.titular}', Colors.green.shade700),
      EstadoDeConsentimiento.rechazado => ('Rechazado por ${widget.titular}', esquema.error),
      EstadoDeConsentimiento.revocado => ('Revocado por ${widget.titular}', esquema.error),
      EstadoDeConsentimiento.expirado => ('El enlace caducó sin respuesta', esquema.error),
      EstadoDeConsentimiento.pendiente => (
        'Pendiente: ${widget.titular} aún no responde',
        esquema.tertiary,
      ),
    };
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Entréguele el enlace a ${widget.titular}',
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: 4),
            const Text(
              'Es de un solo uso y caduca. Sólo el visitante puede responder.',
              style: TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 12),
            Center(
              child: Semantics(
                label: 'Código QR del enlace de consentimiento',
                child: Container(
                  color: Colors.white,
                  padding: const EdgeInsets.all(8),
                  child: QrImageView(
                    key: const Key('consentimiento.qr'),
                    data: widget.enlace,
                    size: 200,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            SelectableText(
              widget.enlace,
              key: const Key('consentimiento.enlace'),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 12),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              key: const Key('consentimiento.compartir'),
              onPressed: () => widget.compartidor.compartir(
                mensajeParaElVisitante(widget.titular, widget.enlace),
              ),
              icon: const Icon(Icons.share_outlined),
              label: const Text('Compartir enlace'),
            ),
            const Divider(height: 24),
            Row(
              children: [
                Expanded(
                  child: Semantics(
                    liveRegion: true,
                    child: Text(
                      texto,
                      key: const Key('consentimiento.estado'),
                      style: TextStyle(color: color, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
                TextButton.icon(
                  key: const Key('consentimiento.actualizar'),
                  onPressed: _consultando ? null : _consultar,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Actualizar'),
                ),
              ],
            ),
            if (_error != null) Text(_error!, style: TextStyle(color: esquema.error, fontSize: 12)),
          ],
        ),
      ),
    );
  }
}
