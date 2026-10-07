import 'package:flutter/material.dart';

import 'notificaciones.dart' show FilaDeNotificaciones;
import 'ocupantes.dart';

import '../../aplicacion/estado.dart';
import '../../configuracion/tema.dart';
import '../../dominio/entidades.dart';
import '../../dominio/hogar.dart';
import '../controlador.dart';

/// M-8 · Mi Perfil — HU-37, y 3.5 de la ETAPA 15-I.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// QUÉ SE EDITA, QUÉ SE VE Y QUÉ NO SE TOCA
///
///  · Se EDITAN nombre, apellidos, fecha de nacimiento, documento, correo y
///    teléfono (con su propio formulario), y los vehículos (su pestaña).
///  · Se VE la vivienda, y cambiarla exige el código de quien ya vive allí.
///  · La copropiedad —nombre y dirección— es de SOLO LECTURA.
///  · «Ocupantes» lleva a las plazas y sus códigos, para compartirlos con
///    quien vive con el residente; el titular añade y retira plazas (15-W).
///  · «Llamar a portería» marca el teléfono que registró el superadministrador
///    (D7) y, si no hay ninguno, lo dice en vez de quedarse mudo.
///
/// El nombre que se muestra es el de la PERSONA, no el correo de la sesión:
/// una cuenta por usuario no tiene correo que enseñar (C-36).
///
/// 15-L · **ningún interruptor de avisos.** Esta compilación no lleva servicio
/// de mensajería: la fila de notificaciones dice «Los avisos llegan mientras la
/// app está abierta» y lleva a la lista. El «Resumen semanal» deshabilitado se
/// quitó: un interruptor que no se puede mover sigue prometiendo algo.
class PantallaDePerfil extends StatelessWidget {
  const PantallaDePerfil({
    super.key,
    required this.controladorDeInicio,
    required this.controladorDePerfil,
    required this.controladorDeOcupantes,
    required this.llamador,
    required this.alCerrarSesion,
    required this.alAbrirFamilia,
    required this.alAbrirHistorial,
    required this.alAbrirVehiculos,
    required this.alAbrirNotificaciones,
    required this.alEditarPerfil,
    required this.alCambiarVivienda,
    required this.alCambiarContrasena,
    this.alAbrirOcupantes,
    this.alAbrirMiRostro,
    this.alRecargar,
  });

  /// 15-L · tirar hacia abajo: la vuelta del ciclo del armazón, si la hay.
  final Future<void> Function()? alRecargar;

  Future<void> _recargar() async {
    final r = alRecargar;
    if (r != null) return r();
    await Future.wait([
      controladorDeInicio.refrescar(),
      controladorDePerfil.refrescar(),
      controladorDeOcupantes.refrescar(),
    ]);
  }

  final ControladorDeVista controladorDeInicio;
  final ControladorDeVista<PerfilDelResidente> controladorDePerfil;
  final ControladorDeVista<MisOcupantes> controladorDeOcupantes;
  final LlamadorDeTelefono llamador;
  final void Function() alCerrarSesion;
  final void Function() alAbrirFamilia;
  final void Function() alAbrirHistorial;
  final void Function() alAbrirVehiculos;
  final void Function() alAbrirNotificaciones;
  final void Function(PerfilDelResidente perfil) alEditarPerfil;
  final void Function(PerfilDelResidente? perfil) alCambiarVivienda;
  final void Function() alCambiarContrasena;
  final void Function()? alAbrirOcupantes;

  /// 15-X (D2) · el rostro propio: opcional, anual y retirable.
  final void Function()? alAbrirMiRostro;

  static T? _datos<T>(Estado<T> e) => switch (e) {
    ConDatos<T>(datos: final d) => d,
    Cargando<T>(previo: final p) => p,
    Fallido<T>(previo: final p) => p,
    _ => null,
  };

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([
        controladorDeInicio,
        controladorDePerfil,
        controladorDeOcupantes,
      ]),
      builder: (context, _) {
        final hogar = _datos(controladorDeInicio.estado as Estado<MiHogar>);
        final perfil = _datos(controladorDePerfil.estado);
        final ocupantes = _datos(controladorDeOcupantes.estado);
        final nombre = perfil?.nombreCompleto ?? '';
        final t = Theme.of(context).textTheme;
        return RefreshIndicator(
          onRefresh: _recargar,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [
              Text('Mi perfil', style: t.headlineSmall),
              const SizedBox(height: 16),
              Card(
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: Paleta.peligroSuave.fondo,
                    child: Text(
                      nombre.isEmpty ? '?' : nombre.characters.first.toUpperCase(),
                      style: TextStyle(
                        color: Paleta.peligroSuave.texto,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  title: Text(
                    nombre.isEmpty ? 'Mi cuenta' : nombre,
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  subtitle: hogar == null
                      ? null
                      : Text(
                          '${hogar.vivienda.titulo} · '
                          '${hogar.vinculo.esTitular ? 'Titular' : 'Residente'}',
                        ),
                ),
              ),
              if (perfil != null) ...[
                const SizedBox(height: 12),
                _Datos(perfil: perfil, alEditar: () => alEditarPerfil(perfil)),
                const SizedBox(height: 12),
                Card(
                  child: Column(
                    children: [
                      ListTile(
                        leading: const Icon(Icons.apartment_outlined),
                        title: Text(perfil.copropiedadNombre),
                        subtitle: Text(perfil.copropiedadDireccion ?? 'Sin dirección registrada'),
                      ),
                      const Divider(height: 1),
                      ListTile(
                        key: const Key('perfil.cambiarVivienda'),
                        leading: const Icon(Icons.home_outlined),
                        title: Text(hogar?.vivienda.titulo ?? 'Mi vivienda'),
                        subtitle: const Text('Cambiar de vivienda exige un código'),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => alCambiarVivienda(perfil),
                      ),
                      const Divider(height: 1),
                      ListTile(
                        key: const Key('perfil.porteria'),
                        leading: const Icon(Icons.phone_outlined),
                        title: const Text('Llamar a portería'),
                        subtitle: Text(
                          perfil.telefonoPorteria ?? 'La administración no registró el teléfono',
                        ),
                        onTap: () => llamarAPorteria(context, llamador, perfil.telefonoPorteria),
                      ),
                    ],
                  ),
                ),
              ],
              if (ocupantes != null && ocupantes.plazas.isNotEmpty) ...[
                const SizedBox(height: 12),
                TarjetaDeOcupantes(ocupantes: ocupantes, alAbrir: alAbrirOcupantes),
              ],
              const SizedBox(height: 20),
              Text('Atajos', style: t.titleMedium),
              const SizedBox(height: 8),
              Card(
                child: Column(
                  children: [
                    _Atajo(Icons.people_outline, 'Mi familia', alAbrirFamilia),
                    _Atajo(Icons.directions_car_outlined, 'Mis vehículos', alAbrirVehiculos),
                    _Atajo(Icons.history, 'Historial de accesos', alAbrirHistorial),
                    _Atajo(Icons.password_outlined, 'Cambiar contraseña', alCambiarContrasena),
                    if (alAbrirMiRostro != null)
                      _Atajo(Icons.face_outlined, 'Mi rostro', alAbrirMiRostro!),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              Text('Preferencias', style: t.titleMedium),
              const SizedBox(height: 8),
              FilaDeNotificaciones(alAbrir: alAbrirNotificaciones),
              const SizedBox(height: 20),
              OutlinedButton.icon(
                onPressed: alCerrarSesion,
                icon: const Icon(Icons.logout),
                label: const Text('Cerrar sesión'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(48),
                  foregroundColor: Paleta.peligroSuave.texto,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Cerrar sesión borra los tokens del llavero del dispositivo.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Paleta.textoSuave, fontSize: 12),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _Datos extends StatelessWidget {
  const _Datos({required this.perfil, required this.alEditar});
  final PerfilDelResidente perfil;
  final void Function() alEditar;

  @override
  Widget build(BuildContext context) {
    final documento = perfil.numeroDocumento == null
        ? 'Sin documento'
        : '${tiposDeDocumento[perfil.tipoDocumento] ?? 'Documento'} ${perfil.numeroDocumento}';
    return Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ListTile(
            title: const Text('Mis datos'),
            trailing: TextButton(
              key: const Key('perfil.editar'),
              onPressed: alEditar,
              child: const Text('Editar'),
            ),
          ),
          _Fila(Icons.mail_outline, perfil.correo ?? 'Sin correo de contacto'),
          _Fila(Icons.phone_iphone, perfil.telefono ?? 'Sin teléfono'),
          _Fila(Icons.badge_outlined, documento),
          if (perfil.fechaNacimiento != null) _Fila(Icons.cake_outlined, perfil.fechaNacimiento!),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

class _Fila extends StatelessWidget {
  const _Fila(this.icono, this.texto);
  final IconData icono;
  final String texto;

  @override
  Widget build(BuildContext context) =>
      ListTile(dense: true, leading: Icon(icono, size: 20), title: Text(texto));
}

class _Atajo extends StatelessWidget {
  const _Atajo(this.icono, this.titulo, this.alPulsar);
  final IconData icono;
  final String titulo;
  final void Function() alPulsar;

  @override
  Widget build(BuildContext context) => ListTile(
    leading: Icon(icono),
    title: Text(titulo),
    trailing: const Icon(Icons.chevron_right),
    onTap: alPulsar,
  );
}

/// D7 · marca el teléfono de portería, o dice por qué no puede.
Future<void> llamarAPorteria(
  BuildContext context,
  LlamadorDeTelefono llamador,
  String? telefono,
) async {
  final mensajero = ScaffoldMessenger.of(context);
  if (telefono == null || telefono.isEmpty) {
    mensajero.showSnackBar(
      const SnackBar(
        content: Text('La administración todavía no registró el teléfono de portería.'),
      ),
    );
    return;
  }
  final pudo = await llamador.llamar(telefono);
  if (!pudo) {
    mensajero.showSnackBar(
      SnackBar(content: Text('Este aparato no puede llamar. El número es $telefono.')),
    );
  }
}
