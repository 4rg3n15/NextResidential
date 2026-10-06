import 'package:flutter/material.dart';

import '../../aplicacion/sesion_en_uso.dart';
import '../../configuracion/ambiente.dart';
import '../../configuracion/tema.dart';
import '../../dominio/acceso.dart';
import '../../dominio/puertos.dart';
import '../widgets/detalle_de_fallo.dart';
import '../widgets/servidor.dart';

/// Acceso del residente.
///
/// No está en el mockup —los ocho dibujos empiezan con la sesión abierta— y sin
/// ella no hay app: es el hueco número catorce de la auditoría, y se construye
/// con lo que el resto del sistema ya decidió.
///
/// **Código de la copropiedad + usuario + contraseña (D1, 15-I).** El usuario
/// lo creó el superadministrador; no es un correo, así que ya no se exige la
/// arroba. Las cuentas anteriores siguen entrando con su correo: si lo escrito
/// en «Usuario» lleva arroba, el código no se pide (`identificadorDesde`).
///
/// **Sin segundo factor, y eso es una decisión, no un olvido.** RN-20 exige MFA
/// a los roles administrativos; el residente no es uno. Pedírselo aquí
/// bloquearía a quien no tiene app de autenticador —que es la mayoría de los
/// residentes— sin ningún requisito que lo respalde. El perfil ofrecerá
/// activarlo voluntariamente en 11-B.
///
/// **«Crear cuenta» (15-W).** Quien recibió un código de invitación de su
/// titular crea aquí su propia cuenta; al terminar entra solo. Sin quien sepa
/// abrir esa pantalla (una prueba suelta), el enlace no se pinta.
///
/// **«Servidor», a la vista (15-L).** La dirección del Mac cambia de una red a
/// otra; si la app no llega, el acceso es la primera pantalla donde se nota y
/// la única donde no hay otra cosa que hacer. Por eso la dirección se ve abajo
/// y se cambia desde aquí, y un error de conexión ofrece «Reintentar» y
/// «Cambiar servidor» en el mismo recuadro.
class PantallaDeAcceso extends StatefulWidget {
  const PantallaDeAcceso({
    super.key,
    required this.ambiente,
    required this.sesion,
    required this.alEntrar,
    this.alCrearCuenta,
  });

  final Ambiente ambiente;
  final SesionEnUso sesion;
  final void Function() alEntrar;

  /// 15-W · abre «Crear cuenta».
  final VoidCallback? alCrearCuenta;

  @override
  State<PantallaDeAcceso> createState() => _PantallaDeAccesoState();
}

class _PantallaDeAccesoState extends State<PantallaDeAcceso> {
  final _codigo = TextEditingController();
  final _usuario = TextEditingController();
  final _clave = TextEditingController();
  final _formulario = GlobalKey<FormState>();
  bool _enviando = false;
  Fallo? _fallo;

  @override
  void dispose() {
    _codigo.dispose();
    _usuario.dispose();
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
      await widget.sesion.iniciar(
        identificador: identificadorDesde(codigo: _codigo.text, usuario: _usuario.text),
        clave: _clave.text,
      );
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
                      key: const Key('acceso.codigo'),
                      controller: _codigo,
                      textCapitalization: TextCapitalization.characters,
                      decoration: const InputDecoration(
                        labelText: 'Código de la copropiedad',
                        helperText: 'Se lo da la administración, p. ej. «MIRA»',
                      ),
                      // Sólo hace falta si el usuario no es un correo (D1).
                      validator: (v) =>
                          pideCodigo(_usuario.text) ? motivoDeCodigoInvalido(v ?? '') : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      key: const Key('acceso.usuario'),
                      controller: _usuario,
                      autofillHints: const [AutofillHints.username],
                      autocorrect: false,
                      decoration: const InputDecoration(labelText: 'Usuario'),
                      validator: (v) =>
                          (v == null || v.trim().isEmpty) ? 'Escriba su usuario' : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      key: const Key('acceso.clave'),
                      controller: _clave,
                      obscureText: true,
                      autofillHints: const [AutofillHints.password],
                      decoration: const InputDecoration(labelText: 'Contraseña'),
                      validator: (v) => (v == null || v.isEmpty) ? 'Escriba su contraseña' : null,
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
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                // El texto sale del fallo tipado: «sin conexión» y
                                // «credenciales incorrectas» no se pueden confundir,
                                // que es lo que manda a reescribir una contraseña
                                // que estaba bien.
                                _fallo!.detalle,
                                style: TextStyle(color: Paleta.peligroSuave.texto),
                              ),
                              // H-SITIO-11 · el porqué, sólo en Debug.
                              DetalleDeFallo(fallo: _fallo!),
                              if (esFalloDeConexion(_fallo!)) ...[
                                const SizedBox(height: 8),
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  children: [
                                    FilledButton.tonal(
                                      onPressed: _enviando ? null : _entrar,
                                      child: const Text('Reintentar'),
                                    ),
                                    BotonCambiarServidor(
                                      alCambiar: () => setState(() => _fallo = null),
                                    ),
                                  ],
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ],
                    // 15-W · después del error del acceso, que es de «Entrar».
                    if (widget.alCrearCuenta != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Wrap(
                          alignment: WrapAlignment.center,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            const Text(
                              '¿Tiene un código de invitación?',
                              style: TextStyle(color: Paleta.textoSuave),
                            ),
                            TextButton(
                              key: const Key('acceso.crearCuenta'),
                              onPressed: _enviando ? null : widget.alCrearCuenta,
                              child: const Text('Crear cuenta'),
                            ),
                          ],
                        ),
                      ),
                    const SizedBox(height: 24),
                    _OpcionDeServidor(alCambiar: () => setState(() => _fallo = null)),
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

/// «Servidor»: a qué dirección habla la app, y el camino para cambiarla.
class _OpcionDeServidor extends StatelessWidget {
  const _OpcionDeServidor({required this.alCambiar});
  final VoidCallback alCambiar;

  @override
  Widget build(BuildContext context) {
    final cambio = ServidorDeLaApp.de(context);
    if (cambio == null) return const SizedBox.shrink();
    return ListTile(
      key: const Key('acceso.servidor'),
      contentPadding: EdgeInsets.zero,
      leading: const Icon(Icons.dns_outlined),
      title: const Text('Servidor'),
      subtitle: Text(cambio.direccion.actual),
      trailing: const Text('Cambiar'),
      onTap: () async {
        if (await abrirServidor(context, cambio)) alCambiar();
      },
    );
  }
}
