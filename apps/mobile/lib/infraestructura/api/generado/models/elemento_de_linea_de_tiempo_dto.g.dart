// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'elemento_de_linea_de_tiempo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ElementoDeLineaDeTiempoDto _$ElementoDeLineaDeTiempoDtoFromJson(
  Map<String, dynamic> json,
) => ElementoDeLineaDeTiempoDto(
  origen: ElementoDeLineaDeTiempoDtoOrigen.fromJson(json['origen'] as String),
  id: json['id'] as String,
  ocurridoEn: DateTime.parse(json['ocurridoEn'] as String),
  dispositivoId: json['dispositivoId'] as String,
  tipo: json['tipo'] as String,
  titulo: json['titulo'] as String,
  resultado: json['resultado'] == null
      ? null
      : ElementoDeLineaDeTiempoDtoResultado.fromJson(
          json['resultado'] as String,
        ),
  enVivo: json['enVivo'] as bool,
  eventoId: json['eventoId'] as String?,
  codigo: json['codigo'] == null
      ? null
      : CodigoDelEquipoDto.fromJson(json['codigo'] as Map<String, dynamic>),
  horaDelEquipo: json['horaDelEquipo'] == null
      ? null
      : DateTime.parse(json['horaDelEquipo'] as String),
  relojDesviadoSegundos: json['relojDesviadoSegundos'] as num?,
);

Map<String, dynamic> _$ElementoDeLineaDeTiempoDtoToJson(
  ElementoDeLineaDeTiempoDto instance,
) => <String, dynamic>{
  'origen': instance.origen,
  'id': instance.id,
  'ocurridoEn': instance.ocurridoEn.toIso8601String(),
  'dispositivoId': instance.dispositivoId,
  'tipo': instance.tipo,
  'titulo': instance.titulo,
  'resultado': instance.resultado,
  'enVivo': instance.enVivo,
  'eventoId': instance.eventoId,
  'codigo': instance.codigo,
  'horaDelEquipo': instance.horaDelEquipo?.toIso8601String(),
  'relojDesviadoSegundos': instance.relojDesviadoSegundos,
};
