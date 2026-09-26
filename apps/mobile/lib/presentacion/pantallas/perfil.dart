import 'package:flutter/material.dart';

import 'notificaciones.dart';
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
///  · Los códigos de las plazas libres se ven aquí para dárselos a quien vive
///    con el residente (3.3).
///  · «Llamar a portería» marca el teléfono que registró el superadministrador
///    (D7) y, si no hay ninguno, lo dice en vez de quedarse mudo.
///
/// El nombre que se muestra es el de la PERSONA, no el correo de la sesión:
/// una cuenta por usuario no tiene correo que enseñar (C-36).
///
/// El interruptor «Resumen semanal» sigue deshabilitado con su motivo: no hay
/// dónde guardar esa preferencia, y uno que se mueve sin guardar nada es una
/// mentira con animación.
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
    required this.estadoDeAvisos,
  });

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

  /// En qué punto está el registro del aparato. Se recibe como VALOR: el perfil
  /// no tiene por qué saber que hay un controlador detrás.
  final EstadoDeAvisos estadoDeAvisos;

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
        return ListView(
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
                    style: TextStyle(color: Paleta.peligroSuave.texto, fontWeight: FontWeight.w700),
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
            if (ocupantes != null && ocupantes.declarada) ...[
              const SizedBox(height: 12),
              TarjetaDeOcupantes(ocupantes: ocupantes),
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
                ],
              ),
            ),
            const SizedBox(height: 20),
            Text('Preferencias', style: t.titleMedium),
            const SizedBox(height: 8),
            Card(
              child: Column(
                children: [
                  ListTile(
                    leading: const Icon(Icons.notifications_outlined),
                    title: const Text('Notificaciones'),
                    // El resumen dice el estado REAL, no «activadas».
                    subtitle: Text(
                      resumenDeAvisos(estadoDeAvisos),
                      style: const TextStyle(fontSize: 12),
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: alAbrirNotificaciones,
                  ),
                  const Divider(height: 1),
                  const SwitchListTile(
                    value: false,
                    // `null` deshabilita de verdad.
                    onChanged: null,
                    title: Text('Resumen semanal'),
                    subtitle: Text(
                      'Sin dónde guardar la preferencia todavía.',
                      style: TextStyle(fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),
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
