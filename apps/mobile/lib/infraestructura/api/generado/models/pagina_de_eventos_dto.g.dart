// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pagina_de_eventos_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PaginaDeEventosDto _$PaginaDeEventosDtoFromJson(Map<String, dynamic> json) =>
    PaginaDeEventosDto(
      filas: (json['filas'] as List<dynamic>)
          .map((e) => EventoRegistradoDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      siguiente: json['siguiente'] as String?,
    );

Map<String, dynamic> _$PaginaDeEventosDtoToJson(PaginaDeEventosDto instance) =>
    <String, dynamic>{'filas': instance.filas, 'siguiente': instance.siguiente};
