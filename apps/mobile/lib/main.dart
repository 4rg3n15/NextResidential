/// Arranque de la app del residente.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// FALLA RUIDOSAMENTE, COMO LA API
///
/// §2.7.1: si falta una variable, la aplicación no arranca. En un móvil «no
/// arrancar» no puede ser un `exit(1)` —el usuario vería un cierre sin
/// explicación—, así que la app arranca en una pantalla que dice exactamente
/// qué falta y cómo pasarlo. Y si lo que llega es **una llave secreta**, eso sí
/// es una pantalla de bloqueo: un binario distribuido con la llave que omite la
/// RLS es el proyecto entero regalado.
library;

import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'aplicacion/servidor_en_uso.dart';
import 'aplicacion/sesion_en_uso.dart';
import 'configuracion/ambiente.dart';
import 'dominio/puertos.dart';
import 'infraestructura/almacen/almacen_de_texto.dart';
import 'infraestructura/api/comprobador_de_salud.dart';
import 'infraestructura/api/generado/clients/cuentas_api.dart';
import 'infraestructura/api/generado/clients/residente_api.dart';
import 'infraestructura/api/hogar_api.dart';
import 'infraestructura/api/menores_api.dart';
import 'infraestructura/api/notificaciones_api.dart';
import 'infraestructura/api/plazas_api.dart';
import 'infraestructura/api/registro_api.dart';
import 'infraestructura/api/repositorio_api.dart';
import 'infraestructura/api/revocacion_api.dart';
import 'infraestructura/api/rostro_api.dart';
import 'infraestructura/api/soporte_de_api.dart';
import 'infraestructura/camara/camara_del_telefono.dart';
import 'infraestructura/notificaciones/fuente.dart';
import 'infraestructura/plataforma/telefono.dart';
import 'infraestructura/sesion/almacen_seguro.dart';
import 'infraestructura/sesion/autenticador_por_api.dart';
import 'infraestructura/red/tipo_de_red.dart';
import 'infraestructura/sesion/autenticador_supabase.dart';
import 'presentacion/app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final ambiente = Ambiente.deCompilacion();

  final problemas = ambiente.aserciones();
  if (problemas.isNotEmpty) {
    runApp(PantallaDeArranqueBloqueado(problemas: problemas));
    return;
  }

  const reloj = RelojDelSistema();
  // En web no hay Keychain ni Keystore: `flutter_secure_storage` cae a
  // `localStorage`, que es menos seguro. El destino web existe para el
  // recorrido de esta etapa, así que allí se usa memoria —la sesión no
  // sobrevive a la recarga y eso se declara— en vez de fingir un llavero.
  final almacen = kIsWeb ? AlmacenEnMemoria() : AlmacenSeguroDeSesion();
  // 15-L · lo que la app recuerda entre arranques y no es negocio: la
  // dirección del servidor, la bandeja de salida y las notificaciones vistas.
  final AlmacenDeTexto recuerdos = kIsWeb ? AlmacenDeTextoEnMemoria() : AlmacenDeTextoSeguro();

  // 15-L · la dirección del servidor: la compilada es el valor INICIAL, la
  // guardada gana. Se lee antes de crear ningún `Dio`.
  final direccion = DireccionDelServidor(compilada: ambiente.apiUrl, almacen: recuerdos);
  await direccion.recuperar();

  // D1 · se ENTRA por la API (código + usuario, o correo) y se RENUEVA contra
  // el proveedor. El `Dio` del acceso no lleva el interceptor de sesión: es la
  // petición que la crea, no una que la use.
  final dioDeAcceso = Dio();
  final sesion = SesionEnUso(
    almacen: almacen,
    autenticador: AutenticadorPorApi(
      api: CuentasApi(dioDeAcceso),
      renovacion: AutenticadorSupabase(
        dio: Dio(),
        urlBase: ambiente.supabaseUrl,
        clavePublicable: ambiente.supabaseClavePublicable,
      ),
      // E2 (15-L) · con la red del teléfono, el fallo de conexión dice su causa.
      consultarRed: tipoDeRedActual,
    ),
    reloj: reloj,
  );
  await sesion.recuperar();

  final dio = crearDioDeApi(urlBase: direccion.actual, sesion: sesion);
  // Los dos `Dio` que hablan con la API siguen la dirección: cambiarla los
  // cambia a los dos. El de la renovación habla con el proveedor y no la sigue.
  seguirLaDireccion(direccion, [dio, dioDeAcceso]);
  final api = ResidenteApi(dio);
  final repositorio = RepositorioApiDelResidente(api: api, sesion: sesion);

  runApp(
    AppDelResidente(
      dependencias: Dependencias(
        ambiente: ambiente,
        sesion: sesion,
        repositorio: repositorio,
        reloj: reloj,
        notificaciones: SinServicioDeMensajeria(
          identidad: IdentidadDelAparato(),
        ),
        claves: claveDeIdempotencia,
        alta: AltaPorApi(api: api, sesion: sesion),
        hogar: HogarPorApi(api: api, sesion: sesion),
        // El cambio de contraseña va CON la sesión: su `Dio` es el de la API.
        cuenta: CuentaPorApi(api: CuentasApi(dio)),
        llamador: const LlamadorDelSistema(),
        // Hito 3 · la foto real del visitante —de la cámara o de la galería—,
        // reducida en el aparato. En web (el recorrido del verificador) no hay
        // cámara ni fototeca que abrir: la simulada.
        tomarFoto: kIsWeb ? null : CamaraDelTelefono().tomar,
        servidor: CambioDeServidor(
          direccion: direccion,
          comprobador: ComprobadorPorHttp(),
          sesion: sesion,
        ),
        notificacionesDelConjunto: NotificacionesPorApi(api: api, sesion: sesion),
        // 15-W · «Crear cuenta» va SIN sesión, como el acceso: su `Dio` es el
        // del acceso, que sigue la dirección y no lleva el interceptor.
        registro: RegistroPorApi(api: CuentasApi(dioDeAcceso)),
        menores: MenoresPorApi(api: api, sesion: sesion),
        plazas: PlazasPorApi(api: api, sesion: sesion),
        revocacion: RevocacionPorApi(api: api, sesion: sesion),
        // 15-X (D2) · «Mi rostro»: el rostro propio, por la misma API.
        rostro: RostroPorApi(api: api, sesion: sesion),
        // 15-X (D3) · el de un menor del hogar, por el titular.
        rostroDeMenores: RostroDeMenoresPorApi(api: api, sesion: sesion),
        almacen: recuerdos,
        cambiosDeRed: cambiosDeRed(),
      ),
    ),
  );
}

/// Una clave de idempotencia por visita.
///
/// La genera el cliente y no el servidor, y ese es el punto: si la pidiera al
/// servidor, la petición que la trae podría perderse igual que la que crea la
/// visita, y no habría con qué reconocer el reintento. Es azar del sistema, no
/// `DateTime.now()`: dos teléfonos con el reloj sincronizado pulsando a la vez
/// no pueden producir la misma.
String claveDeIdempotencia() {
  final azar = Random.secure();
  final bytes = List<int>.generate(16, (_) => azar.nextInt(256));
  return bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
}

/// Lo que se ve si la compilación trae algo que no debe.
class PantallaDeArranqueBloqueado extends StatelessWidget {
  const PantallaDeArranqueBloqueado({super.key, required this.problemas});
  final List<String> problemas;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(
                  Icons.dangerous_outlined,
                  size: 56,
                  color: Color(0xFFDC3341),
                ),
                const SizedBox(height: 16),
                const Text(
                  'La app no puede arrancar con esta configuración',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 12),
                ...problemas.map(
                  (p) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(p, textAlign: TextAlign.center),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
