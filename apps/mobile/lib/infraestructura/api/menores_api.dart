/// Los menores del hogar contra la API (RONDA 15-W, D-W2, D4).
///
/// Ninguna ruta recibe la vivienda: el servidor la saca de la identidad, y el
/// `residenteId` de otra vivienda le es desconocido (404). Los rechazos —una
/// persona de 18 o más, la plaza ya ocupada, el documento en uso— llegan como
/// `Fallo` con el texto del servidor, que la pantalla pinta tal cual.
library;

import '../../aplicacion/sesion_en_uso.dart';
import '../../dominio/menores.dart';
import 'generado/clients/residente_api.dart';
import 'generado/models/baja_de_menor_dto.dart';
import 'generado/models/edicion_de_menor_dto.dart';
import 'generado/models/menor_del_hogar_dto.dart';
import 'generado/models/menor_dto.dart';
import 'generado/models/menor_dto_tipo_documento.dart';
import 'soporte_de_api.dart';

class MenoresPorApi implements RepositorioDeMenores {
  MenoresPorApi({required ResidenteApi api, required SesionEnUso sesion})
    : _api = api,
      _sesion = sesion;

  final ResidenteApi _api;
  final SesionEnUso _sesion;

  String get _copropiedad => copropiedadDeLaSesion(_sesion);

  @override
  Future<List<MenorDelHogar>> misMenores() => pedirALaApi(() async {
    final dtos = await _api.misMenoresControllerListar(id: _copropiedad);
    return dtos.map(menorDe).toList(growable: false);
  });

  @override
  Future<void> registrarMenor(NuevoMenor m) => pedirALaApi(() async {
    await _api.misMenoresControllerRegistrar(
      id: _copropiedad,
      body: MenorDto(
        nombres: m.datos.nombres,
        apellidos: m.datos.apellidos,
        fechaNacimiento: m.datos.fechaNacimiento,
        parentesco: m.datos.parentesco,
        // La pantalla sólo ofrece los dos tipos del contrato.
        tipoDocumento: MenorDtoTipoDocumento.fromJson(m.tipoDocumento),
        numeroDocumento: m.numeroDocumento,
        plazaId: m.plazaId,
      ),
    );
  });

  @override
  Future<void> editarMenor(String residenteId, DatosDelMenor d) => pedirALaApi(() async {
    await _api.misMenoresControllerEditar(
      id: _copropiedad,
      residenteId: residenteId,
      body: EdicionDeMenorDto(
        nombres: d.nombres,
        apellidos: d.apellidos,
        fechaNacimiento: d.fechaNacimiento,
        parentesco: d.parentesco,
      ),
    );
  });

  @override
  Future<void> darDeBajaMenor(String residenteId, {required String motivo}) =>
      pedirALaApi(() async {
        await _api.misMenoresControllerBaja(
          id: _copropiedad,
          residenteId: residenteId,
          body: BajaDeMenorDto(motivo: motivo.trim()),
        );
      });

  @override
  Future<String> codigoDeTraspaso(String residenteId) => pedirALaApi(() async {
    final d = await _api.misMenoresControllerCodigoDeTraspaso(
      id: _copropiedad,
      residenteId: residenteId,
    );
    return d.codigo;
  });
}

MenorDelHogar menorDe(MenorDelHogarDto d) => MenorDelHogar(
  residenteId: d.residenteId,
  nombres: d.nombres,
  apellidos: d.apellidos,
  nombreCompleto: d.nombreCompleto,
  fechaNacimiento: d.fechaNacimiento,
  edad: d.edad?.toInt(),
  tipoDocumento: d.tipoDocumento,
  documento: d.documento,
  parentesco: d.parentesco,
  plazaId: d.plazaId,
  plazaNumero: d.plazaNumero?.toInt(),
  tieneRostro: d.tieneRostro,
);
