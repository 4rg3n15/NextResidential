// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'autorizacion_en_la_instantanea_dto.dart';
import 'instantanea_sin_cambios_dto_sin_cambios.dart';
import 'plantilla_en_la_instantanea_dto.dart';
import 'vehiculo_en_la_instantanea_dto.dart';
import 'zona_en_la_instantanea_dto.dart';
import 'instantanea_de_reglas_dto.dart';
import 'instantanea_sin_cambios_dto.dart';


part 'get_copropiedades_id_reglas_instantanea_response_sealed.g.dart';

@JsonSerializable(createFactory: false)
sealed class GetCopropiedadesIdReglasInstantaneaResponseSealed {
  const GetCopropiedadesIdReglasInstantaneaResponseSealed();
  
  factory GetCopropiedadesIdReglasInstantaneaResponseSealed.fromJson(Map<String, dynamic> json) =>
      GetCopropiedadesIdReglasInstantaneaResponseSealedDeserializer.tryDeserialize(json);
  
  Map<String, dynamic> toJson();
}

extension GetCopropiedadesIdReglasInstantaneaResponseSealedDeserializer on GetCopropiedadesIdReglasInstantaneaResponseSealed {
  static GetCopropiedadesIdReglasInstantaneaResponseSealed tryDeserialize(Map<String, dynamic> json) {
    try {
      return GetCopropiedadesIdReglasInstantaneaResponseSealedInstantaneaDeReglasDto.fromJson(json);
    } catch (_) {}
    try {
      return GetCopropiedadesIdReglasInstantaneaResponseSealedInstantaneaSinCambiosDto.fromJson(json);
    } catch (_) {}


    throw FormatException('Could not determine the correct type for GetCopropiedadesIdReglasInstantaneaResponseSealed from: $json');
  }
}

@JsonSerializable()
class GetCopropiedadesIdReglasInstantaneaResponseSealedInstantaneaDeReglasDto extends GetCopropiedadesIdReglasInstantaneaResponseSealed implements InstantaneaDeReglasDto {
  @override
  final String copropiedadId;
  @override
  final num version;
  @override
  final String hash;
  @override
  final DateTime generadaEn;
  @override
  final List<AutorizacionEnLaInstantaneaDto> autorizaciones;
  @override
  final List<String> personasEnListaNegra;
  @override
  final List<String> placasEnListaNegra;
  @override
  final List<String> viviendasActivas;
  @override
  final List<VehiculoEnLaInstantaneaDto> vehiculos;
  @override
  final List<ZonaEnLaInstantaneaDto> zonas;
  @override
  final List<String> personasConConsentimiento;
  @override
  final List<PlantillaEnLaInstantaneaDto> plantillas;
  @override
  final num umbralDeConfianza;

  const GetCopropiedadesIdReglasInstantaneaResponseSealedInstantaneaDeReglasDto({
    required this.copropiedadId,
    required this.version,
    required this.hash,
    required this.generadaEn,
    required this.autorizaciones,
    required this.personasEnListaNegra,
    required this.placasEnListaNegra,
    required this.viviendasActivas,
    required this.vehiculos,
    required this.zonas,
    required this.personasConConsentimiento,
    required this.plantillas,
    required this.umbralDeConfianza,
  });
  
  factory GetCopropiedadesIdReglasInstantaneaResponseSealedInstantaneaDeReglasDto.fromJson(Map<String, dynamic> json) =>
      _$GetCopropiedadesIdReglasInstantaneaResponseSealedInstantaneaDeReglasDtoFromJson(json);
      
  @override
  Map<String, dynamic> toJson() => _$GetCopropiedadesIdReglasInstantaneaResponseSealedInstantaneaDeReglasDtoToJson(this);
}
@JsonSerializable()
class GetCopropiedadesIdReglasInstantaneaResponseSealedInstantaneaSinCambiosDto extends GetCopropiedadesIdReglasInstantaneaResponseSealed implements InstantaneaSinCambiosDto {
  @override
  final String copropiedadId;
  @override
  final num version;
  @override
  final InstantaneaSinCambiosDtoSinCambios sinCambios;
  @override
  final DateTime generadaEn;

  const GetCopropiedadesIdReglasInstantaneaResponseSealedInstantaneaSinCambiosDto({
    required this.copropiedadId,
    required this.version,
    required this.sinCambios,
    required this.generadaEn,
  });
  
  factory GetCopropiedadesIdReglasInstantaneaResponseSealedInstantaneaSinCambiosDto.fromJson(Map<String, dynamic> json) =>
      _$GetCopropiedadesIdReglasInstantaneaResponseSealedInstantaneaSinCambiosDtoFromJson(json);
      
  @override
  Map<String, dynamic> toJson() => _$GetCopropiedadesIdReglasInstantaneaResponseSealedInstantaneaSinCambiosDtoToJson(this);
}
