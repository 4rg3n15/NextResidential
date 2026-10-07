/// «Mi rostro» (RONDA 15-X, D2, ADR-039): el rostro propio del adulto con
/// cuenta, para que la terminal facial de la portería lo reconozca.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// OPCIONAL, ANUAL Y RETIRABLE
///
/// El rostro es un dato SENSIBLE (Ley 1581 de 2012): el residente lo registra
/// sólo si quiere, aceptando la política que el SERVIDOR le manda —texto y
/// versión—, vence al año y lo retira cuando quiera; el retiro lo saca también
/// de los equipos de la portería, en el acto. Puede entrar sin él.
///
/// La foto es la MISMA que la de una visita —tipo, tope y medidas de calidad—,
/// así que viaja con la misma entidad (`FotoDeVisita`); el servidor la vuelve a
/// juzgar. La imagen nunca vuelve al teléfono: el estado no tiene dónde ponerla.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// SIN CONEXIÓN NO HAY ROSTRO
///
/// A diferencia de una visita, el rostro NO entra en la bandeja de salida: una
/// foto de la cara esperando en el teléfono a que vuelva la red es justo lo que
/// la minimización de la ley pide no tener. Sin red, la pantalla lo dice y la
/// foto se descarta; la cámara ya borró su archivo temporal al leerla.
library;

import 'entidades.dart';

/// La foto del rostro: la misma forma que la de una visita.
typedef FotoDeRostro = FotoDeVisita;

/// Lo que el servidor dice del rostro de la persona (`estado` del contrato).
enum EstadoDelRostro {
  sinRostro('sin_rostro'),
  pendiente('pendiente'),
  activa('activa'),
  parcial('parcial'),
  porVencer('por_vencer'),
  enRetiro('en_retiro');

  const EstadoDelRostro(this.valor);
  final String valor;

  /// Un valor que el servidor añada mañana se lee como «pendiente»: nunca como
  /// «activa», que prometería un acceso que nadie comprobó.
  static EstadoDelRostro de(String valor) =>
      values.firstWhere((e) => e.valor == valor, orElse: () => EstadoDelRostro.pendiente);
}

enum EstadoEnEquipo { sincronizada, pendiente, fallida }

class EquipoDelRostro {
  const EquipoDelRostro({required this.nombre, required this.estado});
  final String nombre;
  final EstadoEnEquipo estado;
}

class PoliticaDelRostro {
  const PoliticaDelRostro({required this.version, required this.texto});
  final String version;
  final String texto;
}

class EstadoDeMiRostro {
  const EstadoDeMiRostro({
    required this.estado,
    required this.calidad,
    required this.registradoEn,
    required this.venceEn,
    required this.diasParaVencer,
    required this.equiposConRostro,
    required this.equiposConMiRostro,
    required this.equipos,
    this.politica,
  });

  final EstadoDelRostro estado;
  final double? calidad;
  final DateTime? registradoEn;
  final DateTime? venceEn;
  final int? diasParaVencer;
  final int equiposConRostro;
  final int equiposConMiRostro;
  final List<EquipoDelRostro> equipos;

  /// La vigente. Sólo la trae la lectura; el registro y el retiro, no.
  final PoliticaDelRostro? politica;

  /// Hay un rostro vivo: se ofrece renovar y retirar, no registrar.
  bool get tieneRostro => estado != EstadoDelRostro.sinRostro && estado != EstadoDelRostro.enRetiro;

  EstadoDeMiRostro conPolitica(PoliticaDelRostro? p) => EstadoDeMiRostro(
    estado: estado,
    calidad: calidad,
    registradoEn: registradoEn,
    venceEn: venceEn,
    diasParaVencer: diasParaVencer,
    equiposConRostro: equiposConRostro,
    equiposConMiRostro: equiposConMiRostro,
    equipos: equipos,
    politica: p,
  );
}

/// Lo que se le dice al residente de su rostro, en una frase.
String textoDelEstado(EstadoDeMiRostro e) => switch (e.estado) {
  EstadoDelRostro.sinRostro => 'No ha registrado su rostro. Es opcional: puede entrar sin él.',
  EstadoDelRostro.enRetiro => 'Su rostro se está retirando de los equipos de la portería.',
  EstadoDelRostro.pendiente =>
    e.equiposConRostro == 0
        ? 'Registrado. El conjunto todavía no tiene equipos que reconozcan rostros.'
        : 'Registrado. Se está enviando a los equipos de la portería.',
  EstadoDelRostro.parcial =>
    'Registrado en ${e.equiposConMiRostro} de ${e.equiposConRostro} equipos. '
        'Los demás lo recibirán en cuanto respondan.',
  EstadoDelRostro.activa =>
    e.equiposConRostro == 1
        ? 'Activo: el equipo de la portería lo reconoce.'
        : 'Activo: los ${e.equiposConRostro} equipos de la portería lo reconocen.',
  EstadoDelRostro.porVencer => _porVencer(e.diasParaVencer),
};

String _porVencer(int? dias) => switch (dias) {
  null || 0 => 'Su rostro vence hoy: renuévelo para seguir entrando con él.',
  1 => 'Su rostro vence mañana: renuévelo para seguir entrando con él.',
  _ => 'Su rostro vence en $dias días: renuévelo para seguir entrando con él.',
};

/// Lo que se dice de un equipo.
String textoDelEquipo(EstadoEnEquipo e) => switch (e) {
  EstadoEnEquipo.sincronizada => 'Lo reconoce',
  EstadoEnEquipo.pendiente => 'Pendiente',
  EstadoEnEquipo.fallida => 'No lo recibió todavía',
};

/// Lo que el teléfono pide a la API. La persona sale de la cuenta, nunca de
/// aquí: no hay parámetro donde ponerla.
abstract interface class RostroDelResidente {
  /// El estado y la política vigente.
  Future<EstadoDeMiRostro> miRostro();

  /// Registra o renueva, con la versión de la política que se MOSTRÓ.
  Future<EstadoDeMiRostro> registrar(FotoDeRostro foto, {required String versionPolitica});

  /// Revoca y suprime en el acto, también en los equipos.
  Future<EstadoDeMiRostro> retirar();
}
