import 'package:flutter/material.dart';

import 'notificaciones.dart';

import '../../aplicacion/estado.dart';
import '../../aplicacion/sesion_en_uso.dart';
import '../../configuracion/tema.dart';
import '../../dominio/entidades.dart';
import '../controlador.dart';

/// M-8 · Mi Perfil — HU-37 (parcial).
///
/// ─────────────────────────────────────────────────────────────────────────────
/// LOS TRES INTERRUPTORES DEL MOCKUP ESTÁN, DESHABILITADOS, CON SU MOTIVO
///
/// El dibujo pone «Notificaciones push», «Alertas de seguridad» y «Resumen
/// semanal». Pintarlos como si funcionaran sería la peor de las opciones: el
/// residente los apagaría y seguiría recibiendo avisos, o los encendería y no
/// recibiría nada. No hay dónde guardar esa preferencia —no existe la columna—
/// ni quién la respete, porque el envío por FCM es de 11-B.
///
/// Se muestran deshabilitados y diciendo cuándo llegan. Es la misma decisión
/// que el vídeo de la guardia virtual en la ETAPA 10.
///
/// Lo que sí hay: la vivienda, el correo de la sesión y **cerrar sesión**, que
/// borra el llavero. Y lo que falta y queda dicho: cambio de contraseña,
/// segundo factor voluntario, revocación del propio consentimiento biométrico
/// (HU-15) y la política de privacidad con su versión aceptada — los cuatro en
/// 11-B, porque los cuatro escriben.
class PantallaDePerfil extends StatelessWidget {
  const PantallaDePerfil({
    super.key,
    required this.sesion,
    required this.controladorDeInicio,
    required this.alCerrarSesion,
    required this.alPedirAcceso,
    required this.alAbrirFamilia,
    required this.alAbrirHistorial,
    required this.alAbrirNotificaciones,
    required this.estadoDeAvisos,
  });

  final SesionEnUso sesion;
  final ControladorDeVista controladorDeInicio;
  final void Function() alCerrarSesion;
  final void Function() alPedirAcceso;
  final void Function() alAbrirFamilia;
  final void Function() alAbrirHistorial;
  final void Function() alAbrirNotificaciones;

  /// En qué punto está el registro del aparato. Se recibe como VALOR: el perfil
  /// no tiene por qué saber que hay un controlador detrás, y así el resumen que
  /// enseña aquí y el detalle de M-7 no pueden contradecirse.
  final EstadoDeAvisos estadoDeAvisos;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controladorDeInicio,
      builder: (context, _) {
        final estado = controladorDeInicio.estado;
        final hogar = estado is ConDatos<MiHogar> ? estado.datos : null;
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Mi perfil', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    CircleAvatar(
                      radius: 26,
                      backgroundColor: Paleta.peligroSuave.fondo,
                      child: Text(
                        (sesion.sesion?.correo ?? '?').characters.first.toUpperCase(),
                        style: TextStyle(
                          color: Paleta.peligroSuave.texto,
                          fontWeight: FontWeight.w700,
                          fontSize: 20,
                        ),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            sesion.sesion?.correo ?? 'Sin sesión',
                            style: const TextStyle(fontWeight: FontWeight.w600),
                          ),
                          if (hogar != null) ...[
                            const SizedBox(height: 2),
                            Text(
                              hogar.vivienda.titulo,
                              style: const TextStyle(color: Paleta.textoSuave),
                            ),
                            Text(
                              hogar.vinculo.esTitular ? 'Titular de la vivienda' : 'Residente',
                              style: const TextStyle(color: Paleta.textoSuave, fontSize: 13),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
            Text('Atajos', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Card(
              child: Column(
                children: [
                  ListTile(
                    leading: const Icon(Icons.people_outline),
                    title: const Text('Mi familia'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: alAbrirFamilia,
                  ),
                  const Divider(height: 1),
                  ListTile(
                    leading: const Icon(Icons.history),
                    title: const Text('Historial de accesos'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: alAbrirHistorial,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Text('Preferencias', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Card(
              child: Column(
                children: [
                  ListTile(
                    leading: const Icon(Icons.notifications_outlined),
                    title: const Text('Notificaciones'),
                    // El resumen dice el estado REAL, no «activadas». Que la
                    // app tenga permiso no significa que los avisos lleguen:
                    // hace falta además que el conjunto tenga el token.
                    subtitle: Text(
                      resumenDeAvisos(estadoDeAvisos),
                      style: const TextStyle(fontSize: 12),
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: alAbrirNotificaciones,
                  ),
                  const Divider(height: 1),
                  _InterruptorPendiente(
                    titulo: 'Resumen semanal',
                    detalle: 'Sin dónde guardar la preferencia todavía (11-B).',
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Paleta.neutroSuave.fondo,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                'Pendiente en 11-B: cambio de contraseña, segundo factor voluntario, revocar mi '
                'consentimiento biométrico (HU-15, RN-11 — el residente también es titular de sus '
                'datos) y la política de privacidad con la versión aceptada (Ley 1581).',
                style: TextStyle(color: Paleta.neutroSuave.texto, fontSize: 13),
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

class _InterruptorPendiente extends StatelessWidget {
  const _InterruptorPendiente({required this.titulo, required this.detalle});
  final String titulo;
  final String detalle;

  @override
  Widget build(BuildContext context) {
    return SwitchListTile(
      value: false,
      // `null` deshabilita de verdad: un interruptor que se mueve y no guarda
      // nada es una mentira con animación.
      onChanged: null,
      title: Text(titulo),
      subtitle: Text(detalle, style: const TextStyle(fontSize: 12)),
    );
  }
}
