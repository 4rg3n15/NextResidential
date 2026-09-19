import 'package:flutter/material.dart';

import '../../aplicacion/sesion_en_uso.dart';
import '../../configuracion/ambiente.dart';
import '../../configuracion/tema.dart';
import '../../dominio/puertos.dart';

/// Acceso del residente.
///
/// No está en el mockup —los ocho dibujos empiezan con la sesión abierta— y sin
/// ella no hay app: es el hueco número catorce de la auditoría, y se construye
/// con lo que el resto del sistema ya decidió.
///
/// **Sin segundo factor, y eso es una decisión, no un olvido.** RN-20 exige MFA
/// a los roles administrativos; el residente no es uno. Pedírselo aquí
/// bloquearía a quien no tiene app de autenticador —que es la mayoría de los
/// residentes— sin ningún requisito que lo respalde. El perfil ofrecerá
/// activarlo voluntariamente en 11-B.
class PantallaDeAcceso extends StatefulWidget {
  const PantallaDeAcceso({
    super.key,
    required this.ambiente,
    required this.sesion,
    required this.alEntrar,
  });

  final Ambiente ambiente;
  final SesionEnUso sesion;
  final void Function() alEntrar;

  @override
  State<PantallaDeAcceso> createState() => _PantallaDeAccesoState();
}

class _PantallaDeAccesoState extends State<PantallaDeAcceso> {
  final _correo = TextEditingController();
  final _clave = TextEditingController();
  final _formulario = GlobalKey<FormState>();
  bool _enviando = false;
  Fallo? _fallo;

  @override
  void dispose() {
    _correo.dispose();
    _clave.dispose();
    super.dispose();
  }

  Future<void> _entrar() async {
    if (!(_formulario.currentState?.validate() ?? false)) return;
    setState(() {
      _enviando = true;
      _fallo = null;
    });
    try {
      await widget.sesion.iniciar(correo: _correo.text.trim(), clave: _clave.text);
      if (!mounted) return;
      widget.alEntrar();
    } on Fallo catch (f) {
      if (!mounted) return;
      setState(() => _fallo = f);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final faltaConfigurar = widget.ambiente.faltaSupabase;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _formulario,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Icon(Icons.shield_outlined, size: 48, color: Paleta.marca),
                    const SizedBox(height: 12),
                    Text(
                      'Next Control Residencial',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Acceso del residente',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Paleta.textoSuave),
                    ),
                    const SizedBox(height: 24),
                    if (faltaConfigurar) ...[
                      // Falta configuración, y se dice ANTES de dejar teclear:
                      // sin esto, el residente escribiría sus credenciales y
                      // recibiría un error de red que no explica nada.
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Paleta.avisoSuave.fondo,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          'La app se compiló sin SUPABASE_URL o sin la llave publicable, así que '
                          'no hay a quién pedirle la sesión. Se pasan con --dart-define; están en '
                          'apps/mobile/.env.example.',
                          style: TextStyle(color: Paleta.avisoSuave.texto),
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],
                    TextFormField(
                      controller: _correo,
                      autofillHints: const [AutofillHints.email],
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(labelText: 'Correo'),
                      validator: (v) =>
                          (v == null || !v.contains('@')) ? 'Escriba su correo' : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _clave,
                      obscureText: true,
                      autofillHints: const [AutofillHints.password],
                      decoration: const InputDecoration(labelText: 'Contraseña'),
                      validator: (v) =>
                          (v == null || v.isEmpty) ? 'Escriba su contraseña' : null,
                      onFieldSubmitted: (_) => _entrar(),
                    ),
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: _enviando || faltaConfigurar ? null : _entrar,
                      child: _enviando
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Entrar'),
                    ),
                    if (_fallo != null) ...[
                      const SizedBox(height: 16),
                      Semantics(
                        liveRegion: true,
                        child: Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Paleta.peligroSuave.fondo,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text(
                            // El texto sale del fallo tipado: «sin conexión» y
                            // «credenciales incorrectas» no se pueden confundir,
                            // que es lo que manda a reescribir una contraseña
                            // que estaba bien.
                            _fallo!.detalle,
                            style: TextStyle(color: Paleta.peligroSuave.texto),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
