/// La dirección del servidor: verla, cambiarla y PROBARLA antes de guardarla.
///
/// Se llega desde el acceso («Servidor») y desde cualquier aviso de error de
/// conexión («Cambiar servidor»). Lo que se escribe pasa por la regla del
/// dominio (`revisarDireccion`), se prueba contra `/health` y sólo si contesta
/// Next Control se guarda. Cambiarla cierra la sesión: la sesión es de un
/// servidor, y la pantalla lo dice ANTES de pulsar.
library;

import 'package:flutter/material.dart';

import '../../aplicacion/servidor_en_uso.dart';
import '../../configuracion/tema.dart';

class PantallaDelServidor extends StatefulWidget {
  const PantallaDelServidor({super.key, required this.cambio});
  final CambioDeServidor cambio;

  @override
  State<PantallaDelServidor> createState() => _PantallaDelServidorState();
}

class _PantallaDelServidorState extends State<PantallaDelServidor> {
  late final _campo = TextEditingController(text: widget.cambio.direccion.actual);
  bool _probando = false;
  String? _rechazo;

  DireccionDelServidor get _direccion => widget.cambio.direccion;

  @override
  void dispose() {
    _campo.dispose();
    super.dispose();
  }

  Future<void> _probar() async {
    setState(() {
      _probando = true;
      _rechazo = null;
    });
    final mensajero = ScaffoldMessenger.of(context);
    final r = await widget.cambio.cambiar(_campo.text);
    if (!mounted) return;
    switch (r) {
      case ServidorRechazado(motivo: final m):
        setState(() {
          _probando = false;
          _rechazo = m;
        });
      case ServidorCambiado(cerroSesion: final cerro):
        mensajero.showSnackBar(
          SnackBar(
            content: Text(
              cerro
                  ? 'El servidor responde. Dirección guardada: entre otra vez con su usuario.'
                  : 'El servidor responde. Dirección guardada.',
            ),
          ),
        );
        _salir();
    }
  }

  Future<void> _restablecer() async {
    await widget.cambio.restablecer();
    if (mounted) _salir();
  }

  /// Al cambiar de servidor el armazón vuelve al acceso y cierra lo que haya
  /// encima, esta pantalla incluida. Sólo se sale a mano si sigue arriba: un
  /// segundo `pop` cerraría la pantalla de debajo.
  void _salir() {
    setState(() => _probando = false);
    if (ModalRoute.of(context)?.isCurrent ?? false) Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Servidor')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Text('La app se conecta al servidor de Next Control en esta dirección:'),
            const SizedBox(height: 6),
            SelectableText(
              _direccion.actual,
              key: const Key('servidor.actual'),
              style: t.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
            if (!_direccion.esLaCompilada) ...[
              const SizedBox(height: 4),
              Text(
                'La dirección con que se instaló la app es ${_direccion.compilada}.',
                style: const TextStyle(color: Paleta.textoSuave, fontSize: 13),
              ),
            ],
            const SizedBox(height: 16),
            const Text(
              'Para usar la app igual en casa y en el conjunto, lo más cómodo es el nombre del Mac '
              'terminado en .local (por ejemplo http://nombre-del-mac.local:3000), que no cambia de '
              'una red a otra. Si esta red no lo encuentra, escriba la IP del Mac en esta red.',
              style: TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 16),
            TextField(
              key: const Key('servidor.direccion'),
              controller: _campo,
              keyboardType: TextInputType.url,
              autocorrect: false,
              enableSuggestions: false,
              decoration: const InputDecoration(
                labelText: 'Dirección del servidor',
                hintText: 'http://nombre-del-mac.local:3000',
              ),
              onSubmitted: (_) => _probando ? null : _probar(),
            ),
            const SizedBox(height: 8),
            const Text(
              'Antes de guardarla, la app comprueba que responde. Cambiar de servidor cierra la '
              'sesión: tendrá que entrar otra vez.',
              style: TextStyle(color: Paleta.textoSuave, fontSize: 12),
            ),
            const SizedBox(height: 16),
            FilledButton(
              key: const Key('servidor.probar'),
              onPressed: _probando ? null : _probar,
              child: _probando
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Probar y guardar'),
            ),
            if (_rechazo != null) ...[
              const SizedBox(height: 16),
              Semantics(
                liveRegion: true,
                child: Container(
                  key: const Key('servidor.rechazo'),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Paleta.peligroSuave.fondo,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(_rechazo!, style: TextStyle(color: Paleta.peligroSuave.texto)),
                ),
              ),
            ],
            if (!_direccion.esLaCompilada) ...[
              const SizedBox(height: 12),
              TextButton(
                onPressed: _probando ? null : _restablecer,
                child: const Text('Volver a la dirección de instalación'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
