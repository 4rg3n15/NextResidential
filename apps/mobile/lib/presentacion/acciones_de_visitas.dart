/// Las acciones de visitas que abren pantallas: crear una, volver a autorizar
/// a quien ya vino, revocar una vigente (15-W) y vaciar la bandeja de salida.
///
/// Viven fuera del armazón por lo mismo que `AccionesDelHogar`: el armazón
/// gobierna la sesión, la navegación y el ciclo de recarga; esto traduce un
/// toque en una pantalla, un envío y una recarga.
library;

import 'package:flutter/material.dart';

import '../aplicacion/envio_de_visitas.dart';
import '../dominio/entidades.dart';
import '../dominio/puertos.dart';
import '../dominio/revocacion.dart';
import 'pantallas/nuevo_visitante.dart';
import 'pantallas/volver_a_autorizar.dart';
import 'widgets/dialogo_de_motivo.dart';

/// Ejecuta una escritura y, si la sesión murió, lleva al acceso.
typedef ConSesion = Future<T> Function<T>(Future<T> Function() operacion);

class AccionesDeVisitas {
  AccionesDeVisitas({
    required this.envio,
    required this.repositorio,
    required this.revocacion,
    required this.reloj,
    required this.claves,
    required this.tomarFoto,
    required this.conSesion,
    required this.alCambiarLaBandeja,
    required this.recargarVisitas,
  });

  final EnvioDeVisitas envio;
  final RepositorioDelResidente repositorio;
  final RevocacionDeVisitas revocacion;
  final Reloj reloj;
  final String Function() claves;
  final TomarFoto tomarFoto;
  final ConSesion conSesion;

  /// La bandeja cambió: la pestaña se vuelve a pintar.
  final void Function() alCambiarLaBandeja;

  /// Lo que cambia al crear o repetir una visita: la lista de lo autorizado y
  /// la de los últimos visitantes.
  final void Function() recargarVisitas;

  /// Abre M-4. **La clave se genera aquí, al abrir el formulario**, y no dentro
  /// de la pantalla: si la fabricara el widget, cada reconstrucción la
  /// cambiaría y un reintento crearía una visita distinta en vez de recuperar
  /// la anterior (RN-17).
  Future<void> crearVisitante(BuildContext context) async {
    final clave = claves();
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => PantallaDeNuevoVisitante(
          enviar: enviarVisita,
          tomarFoto: tomarFoto,
          claveDeIdempotencia: clave,
          ahora: reloj.ahora(),
        ),
      ),
    );
    // Al volver se recarga aunque se haya encolado: la bandeja también cambió.
    alCambiarLaBandeja();
    recargarVisitas();
  }

  /// F6 · abre «Volver a autorizar» con su PROPIA clave, generada al abrir por
  /// la misma razón que la del formulario nuevo.
  Future<void> volverAAutorizar(BuildContext context, VisitanteReciente visitante) async {
    final clave = claves();
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => PantallaDeVolverAAutorizar(
          visitante: visitante,
          claveDeIdempotencia: clave,
          ahora: reloj.ahora(),
          volverAAutorizar: ({
            required autorizacionId,
            required inicio,
            required duracionMinutos,
            required casillaMarcada,
            required claveDeIdempotencia,
          }) =>
              conSesion(
                () => repositorio.volverAAutorizar(
                  autorizacionId: autorizacionId,
                  inicio: inicio,
                  duracionMinutos: duracionMinutos,
                  casillaMarcada: casillaMarcada,
                  claveDeIdempotencia: claveDeIdempotencia,
                ),
              ),
        ),
      ),
    );
    recargarVisitas();
  }

  /// 15-W · revoca una visita propia, con motivo obligatorio. Lo que conteste
  /// el servidor —de cuántos equipos salió la foto, o que ya estaba revocada—
  /// se dice tal cual, y la lista se recarga en los dos casos: si ya estaba
  /// revocada, la lista de la pantalla era la vieja.
  Future<void> revocar(BuildContext context, Autorizacion visita) async {
    final motivo = await pedirMotivo(
      context,
      titulo: '¿Revocar la visita de ${visita.visitante}?',
      explicacion: 'Ya no podrá entrar con esta autorización, y su foto sale de los equipos.',
      accion: 'Revocar',
      maximo: motivoMaximoDeRevocacion,
    );
    if (motivo == null || !context.mounted) return;
    final mensajero = ScaffoldMessenger.of(context);
    try {
      final r = await conSesion(() => revocacion.revocar(visita.id, motivo: motivo));
      mensajero.showSnackBar(SnackBar(content: Text(r.texto)));
    } on Fallo catch (f) {
      mensajero.showSnackBar(SnackBar(content: Text(f.detalle)));
    }
    recargarVisitas();
  }

  /// El puente entre la pantalla y la bandeja. Traduce el desenlace del envío al
  /// vocabulario de la pantalla, que no conoce la bandeja ni el repositorio.
  Future<ResultadoDeEnvio> enviarVisita(NuevaVisita visita) => conSesion(() async {
        final desenlace = await envio.enviar(visita);
        return switch (desenlace) {
          Aceptado(resultado: final r) => EnvioResuelto(r),
          Rechazado(resultado: final r) => EnvioResuelto(r),
          Pendiente() => const EnvioEncolado(),
        };
      });

  /// Lo que quedó sin enviar se intenta ahora. Lo llama el ciclo de recarga,
  /// la vuelta a primer plano, el regreso de la red y el botón de la pestaña.
  Future<void> vaciarBandeja(BuildContext context) async {
    try {
      final aceptados = await envio.vaciar();
      if (!context.mounted) return;
      alCambiarLaBandeja();
      if (aceptados > 0) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              aceptados == 1
                  ? 'Se envió 1 visita que estaba pendiente.'
                  : 'Se enviaron $aceptados visitas que estaban pendientes.',
            ),
          ),
        );
        recargarVisitas();
      }
    } on Fallo {
      // La sesión murió a mitad del vaciado. Lo resuelve el refresco de primer
      // plano; aquí lo que no puede pasar es que reviente el armazón entero.
      if (context.mounted) alCambiarLaBandeja();
    }
  }
}
