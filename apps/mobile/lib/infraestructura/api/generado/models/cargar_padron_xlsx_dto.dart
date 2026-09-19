// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'cargar_padron_xlsx_dto.g.dart';

@JsonSerializable()
class CargarPadronXlsxDto {
  const CargarPadronXlsxDto({
    required this.xlsxBase64,
  });
  
  factory CargarPadronXlsxDto.fromJson(Map<String, Object?> json) => _$CargarPadronXlsxDtoFromJson(json);
  
  /// Hoja .xlsx en base64. Se valida el TIPO REAL por firma, nunca la extensión.
  final String xlsxBase64;

  Map<String, Object?> toJson() => _$CargarPadronXlsxDtoToJson(this);
}
