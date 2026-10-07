/// Todo lo que la app necesita, construido una vez en `main`.
///
/// Vivía dentro de `app.dart`; salió cuando el armazón pasó a gobernar también
/// el ciclo de recarga (15-L) y el fichero dejó de caber en una lectura.
library;

import '../aplicacion/servidor_en_uso.dart';
import '../aplicacion/sesion_en_uso.dart';
import '../configuracion/ambiente.dart';
import '../dominio/causa_de_red.dart';
import '../dominio/hogar.dart';
import '../dominio/menores.dart';
import '../dominio/notificaciones.dart';
import '../dominio/puertos.dart';
import '../dominio/registro.dart';
import '../dominio/revocacion.dart';

class Dependencias {
  const Dependencias({
    required this.ambiente,
    required this.sesion,
    required this.repositorio,
    required this.reloj,
    required this.notificaciones,
    required this.claves,
    required this.alta,
    required this.hogar,
    required this.cuenta,
    required this.llamador,
    required this.servidor,
    required this.notificacionesDelConjunto,
    required this.registro,
    required this.menores,
    required this.plazas,
    required this.revocacion,
    this.tomarFoto,
    this.almacen,
    this.cambiosDeRed,
    this.intervaloDeRecarga = const Duration(seconds: 20),
  });

  final Ambiente ambiente;
  final SesionEnUso sesion;
  final RepositorioDelResidente repositorio;
  final Reloj reloj;

  /// El registro del aparato para avisos push. Sin Firebase en esta
  /// compilación no hay token, y nada de él se enseña (ver `avisos_en_uso.dart`).
  final FuenteDeNotificaciones notificaciones;

  /// ETAPA 15-I · el primer ingreso, el hogar, la contraseña y el puerto que
  /// toca el marcador del sistema operativo.
  final RepositorioDeAlta alta;
  final RepositorioDelHogar hogar;
  final ServicioDeCuenta cuenta;
  final LlamadorDeTelefono llamador;

  /// 15-L · a qué servidor habla la app, y cómo se cambia sin recompilar.
  final CambioDeServidor servidor;

  /// 15-L · las notificaciones de la vivienda, leídas de la API.
  final RepositorioDeNotificaciones notificacionesDelConjunto;

  /// RONDA 15-W · «Crear cuenta», los menores del hogar, las plazas del
  /// titular y la revocación de una visita propia.
  final ServicioDeRegistro registro;
  final RepositorioDeMenores menores;
  final RepositorioDePlazas plazas;
  final RevocacionDeVisitas revocacion;

  /// 15-I (hito 3) · la cámara REAL del teléfono, y su galería. `null` = la
  /// simulada (web, recorrido y pruebas), declarada en `fuente_de_fotos.dart`.
  final TomarFoto? tomarFoto;

  /// 15-L · lo que la app recuerda entre arranques y NO es negocio: la bandeja
  /// de salida y las notificaciones vistas. `null` = en memoria (pruebas); la
  /// prueba de «cerrar y volver a abrir» pasa el mismo almacén a dos apps.
  final AlmacenDeTexto? almacen;

  /// 15-L · cada cambio de red del teléfono. Al volver la red se envía lo
  /// pendiente sin esperar a la siguiente vuelta del ciclo.
  final Stream<TipoDeRed>? cambiosDeRed;

  /// 15-L · cada cuánto se recarga sola la pantalla visible.
  final Duration intervaloDeRecarga;

  /// De dónde sale la clave de idempotencia de cada visita. Se inyecta porque
  /// una clave que la pantalla fabricara al construirse cambiaría con cada
  /// `setState`, y entonces dejaría de ser una clave de idempotencia. Y porque
  /// una prueba necesita poder fijarla.
  final String Function() claves;
}
