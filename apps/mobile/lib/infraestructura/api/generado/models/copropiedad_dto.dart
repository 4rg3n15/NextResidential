// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'copropiedad_dto_alcance.dart';

part 'copropiedad_dto.g.dart';

@JsonSerializable()
class CopropiedadDto {
  const CopropiedadDto({
    required this.id,
    required this.alcance,
  });
  
  factory CopropiedadDto.fromJson(Map<String, Object?> json) => _$CopropiedadDtoFromJson(json);
  
  final String id;

  /// Rol con el que el llamante alcanza esta copropiedad
  final CopropiedadDtoAlcance alcance;

  Map<String, Object?> toJson() => _$CopropiedadDtoToJson(this);
}
