// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'persona_dto_tipo_documento.dart';

part 'persona_dto.g.dart';

@JsonSerializable()
class PersonaDto {
  const PersonaDto({
    required this.id,
    required this.nombreCompleto,
    required this.tipoDocumento,
    required this.numeroDocumento,
    required this.esResidente,
    required this.viviendaIdentificador,
  });
  
  factory PersonaDto.fromJson(Map<String, Object?> json) => _$PersonaDtoFromJson(json);
  
  final String id;
  final String nombreCompleto;
  final PersonaDtoTipoDocumento tipoDocumento;
  final String numeroDocumento;
  final bool esResidente;
  final String? viviendaIdentificador;

  Map<String, Object?> toJson() => _$PersonaDtoToJson(this);
}
