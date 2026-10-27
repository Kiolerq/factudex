// Generado desde Supabase (proyecto factudex). No editar a mano:
//   npx supabase gen types typescript --project-id twbwgoyfbhvjwxuuhiwo > src/types/database.ts
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accesos_caja: {
        Row: {
          caja_id: string
          rol: Database["public"]["Enums"]["rol_usuario"]
          usuario_id: string
        }
        Insert: {
          caja_id: string
          rol: Database["public"]["Enums"]["rol_usuario"]
          usuario_id: string
        }
        Update: {
          caja_id?: string
          rol?: Database["public"]["Enums"]["rol_usuario"]
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accesos_caja_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accesos_caja_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_cajas"
            referencedColumns: ["caja_id"]
          },
          {
            foreignKeyName: "accesos_caja_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      areas: {
        Row: {
          codigo: string
          created_at: string
          descripcion: string | null
          nombre: string
        }
        Insert: {
          codigo: string
          created_at?: string
          descripcion?: string | null
          nombre: string
        }
        Update: {
          codigo?: string
          created_at?: string
          descripcion?: string | null
          nombre?: string
        }
        Relationships: []
      }
      adjuntos: {
        Row: {
          almacen: string
          created_at: string
          id: string
          mime_type: string
          movimiento_id: string
          nombre_archivo: string | null
          storage_path: string
          subido_por: string
          tamano_bytes: number
          tipo: Database["public"]["Enums"]["tipo_adjunto"]
        }
        Insert: {
          almacen?: string
          created_at?: string
          id?: string
          mime_type: string
          movimiento_id: string
          nombre_archivo?: string | null
          storage_path: string
          subido_por?: string
          tamano_bytes: number
          tipo: Database["public"]["Enums"]["tipo_adjunto"]
        }
        Update: {
          almacen?: string
          created_at?: string
          id?: string
          mime_type?: string
          movimiento_id?: string
          nombre_archivo?: string | null
          storage_path?: string
          subido_por?: string
          tamano_bytes?: number
          tipo?: Database["public"]["Enums"]["tipo_adjunto"]
        }
        Relationships: [
          {
            foreignKeyName: "adjuntos_movimiento_id_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "movimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adjuntos_movimiento_id_fkey"
            columns: ["movimiento_id"]
            isOneToOne: false
            referencedRelation: "v_pendientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adjuntos_subido_por_fkey"
            columns: ["subido_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cajas: {
        Row: {
          activa: boolean
          area: string
          created_at: string
          empresa_id: string
          id: string
          nombre: string
          numero: number
          responsable_id: string | null
          umbral_alerta: number
        }
        Insert: {
          activa?: boolean
          area: string
          created_at?: string
          empresa_id: string
          id?: string
          nombre: string
          numero: number
          responsable_id?: string | null
          umbral_alerta?: number
        }
        Update: {
          activa?: boolean
          area?: string
          created_at?: string
          empresa_id?: string
          id?: string
          nombre?: string
          numero?: number
          responsable_id?: string | null
          umbral_alerta?: number
        }
        Relationships: [
          {
            foreignKeyName: "cajas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cajas_responsable_fk"
            columns: ["responsable_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias: {
        Row: {
          activa: boolean
          empresa_id: string | null
          id: string
          nombre: string
          orden: number
        }
        Insert: {
          activa?: boolean
          empresa_id?: string | null
          id?: string
          nombre: string
          orden?: number
        }
        Update: {
          activa?: boolean
          empresa_id?: string | null
          id?: string
          nombre?: string
          orden?: number
        }
        Relationships: [
          {
            foreignKeyName: "categorias_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      centros_costo: {
        Row: {
          activo: boolean
          codigo: string
          empresa_id: string
          id: string
          nombre: string
          orden: number
        }
        Insert: {
          activo?: boolean
          codigo: string
          empresa_id: string
          id?: string
          nombre: string
          orden?: number
        }
        Update: {
          activo?: boolean
          codigo?: string
          empresa_id?: string
          id?: string
          nombre?: string
          orden?: number
        }
        Relationships: [
          {
            foreignKeyName: "centros_costo_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      drive_carpetas: {
        Row: {
          created_at: string
          folder_id: string
          ruta: string
        }
        Insert: {
          created_at?: string
          folder_id: string
          ruta: string
        }
        Update: {
          created_at?: string
          folder_id?: string
          ruta?: string
        }
        Relationships: []
      }
      empresas: {
        Row: {
          activa: boolean
          ciudad: string
          codigo: string
          color_acento: string
          color_primario: string
          created_at: string
          id: string
          nombre_corto: string
          razon_social: string
          ruc: string | null
          sigla: string
          tope_gasto: number
        }
        Insert: {
          activa?: boolean
          ciudad?: string
          codigo: string
          color_acento: string
          color_primario: string
          created_at?: string
          id?: string
          nombre_corto: string
          razon_social: string
          ruc?: string | null
          sigla: string
          tope_gasto?: number
        }
        Update: {
          activa?: boolean
          ciudad?: string
          codigo?: string
          color_acento?: string
          color_primario?: string
          created_at?: string
          id?: string
          nombre_corto?: string
          razon_social?: string
          ruc?: string | null
          sigla?: string
          tope_gasto?: number
        }
        Relationships: []
      }
      extracciones_ocr: {
        Row: {
          aceptada: boolean | null
          adjunto_id: string | null
          created_at: string
          error: string | null
          id: string
          modelo: string
          respuesta: Json | null
          solicitado_por: string
          storage_path: string
        }
        Insert: {
          aceptada?: boolean | null
          adjunto_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          modelo: string
          respuesta?: Json | null
          solicitado_por?: string
          storage_path: string
        }
        Update: {
          aceptada?: boolean | null
          adjunto_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          modelo?: string
          respuesta?: Json | null
          solicitado_por?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "extracciones_ocr_adjunto_id_fkey"
            columns: ["adjunto_id"]
            isOneToOne: false
            referencedRelation: "adjuntos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracciones_ocr_solicitado_por_fkey"
            columns: ["solicitado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      integraciones: {
        Row: {
          carpeta_raiz_id: string
          conectado_en: string
          conectado_por: string | null
          cuenta_email: string | null
          proveedor: string
          refresh_token: string
        }
        Insert: {
          carpeta_raiz_id: string
          conectado_en?: string
          conectado_por?: string | null
          cuenta_email?: string | null
          proveedor: string
          refresh_token: string
        }
        Update: {
          carpeta_raiz_id?: string
          conectado_en?: string
          conectado_por?: string | null
          cuenta_email?: string | null
          proveedor?: string
          refresh_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "integraciones_conectado_por_fkey"
            columns: ["conectado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      liquidaciones: {
        Row: {
          aprobada_en: string | null
          aprobada_por: string | null
          caja_id: string
          cerrada_en: string | null
          cerrada_por: string | null
          correlativo: number
          created_at: string
          estado: Database["public"]["Enums"]["estado_liquidacion"]
          fecha_cierre: string | null
          fecha_inicio: string
          folio: string
          id: string
          observaciones: string | null
          saldo_final: number | null
          saldo_inicial: number
          total_gastado: number | null
          total_ingresos: number | null
        }
        Insert: {
          aprobada_en?: string | null
          aprobada_por?: string | null
          caja_id: string
          cerrada_en?: string | null
          cerrada_por?: string | null
          correlativo: number
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_liquidacion"]
          fecha_cierre?: string | null
          fecha_inicio?: string
          folio: string
          id?: string
          observaciones?: string | null
          saldo_final?: number | null
          saldo_inicial?: number
          total_gastado?: number | null
          total_ingresos?: number | null
        }
        Update: {
          aprobada_en?: string | null
          aprobada_por?: string | null
          caja_id?: string
          cerrada_en?: string | null
          cerrada_por?: string | null
          correlativo?: number
          created_at?: string
          estado?: Database["public"]["Enums"]["estado_liquidacion"]
          fecha_cierre?: string | null
          fecha_inicio?: string
          folio?: string
          id?: string
          observaciones?: string | null
          saldo_final?: number | null
          saldo_inicial?: number
          total_gastado?: number | null
          total_ingresos?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "liquidaciones_aprobada_por_fkey"
            columns: ["aprobada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidaciones_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidaciones_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_cajas"
            referencedColumns: ["caja_id"]
          },
          {
            foreignKeyName: "liquidaciones_cerrada_por_fkey"
            columns: ["cerrada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos: {
        Row: {
          anulado: boolean
          caja_id: string
          categoria_id: string | null
          centro_costo_id: string | null
          creado_por: string
          created_at: string
          detalle: string
          estado: Database["public"]["Enums"]["estado_movimiento"]
          fecha: string
          id: string
          liquidacion_id: string
          medio_pago: Database["public"]["Enums"]["medio_pago"] | null
          monto: number
          motivo_anulacion: string | null
          operacion_pago: string | null
          origen: Database["public"]["Enums"]["origen_movimiento"]
          proveedor_id: string | null
          serie_numero: string | null
          solicitante: string | null
          tipo_documento: Database["public"]["Enums"]["tipo_documento"] | null
          updated_at: string
          requiere_autorizacion: boolean
          autorizado_por: string | null
          autorizado_en: string | null
        }
        Insert: {
          anulado?: boolean
          caja_id: string
          categoria_id?: string | null
          centro_costo_id?: string | null
          creado_por?: string
          created_at?: string
          detalle: string
          estado?: Database["public"]["Enums"]["estado_movimiento"]
          fecha: string
          id?: string
          liquidacion_id: string
          medio_pago?: Database["public"]["Enums"]["medio_pago"] | null
          monto: number
          motivo_anulacion?: string | null
          operacion_pago?: string | null
          origen?: Database["public"]["Enums"]["origen_movimiento"]
          proveedor_id?: string | null
          serie_numero?: string | null
          solicitante?: string | null
          tipo_documento?: Database["public"]["Enums"]["tipo_documento"] | null
          updated_at?: string
          requiere_autorizacion?: boolean
          autorizado_por?: string | null
          autorizado_en?: string | null
        }
        Update: {
          anulado?: boolean
          caja_id?: string
          categoria_id?: string | null
          centro_costo_id?: string | null
          creado_por?: string
          created_at?: string
          detalle?: string
          estado?: Database["public"]["Enums"]["estado_movimiento"]
          fecha?: string
          id?: string
          liquidacion_id?: string
          medio_pago?: Database["public"]["Enums"]["medio_pago"] | null
          monto?: number
          motivo_anulacion?: string | null
          operacion_pago?: string | null
          origen?: Database["public"]["Enums"]["origen_movimiento"]
          proveedor_id?: string | null
          serie_numero?: string | null
          solicitante?: string | null
          tipo_documento?: Database["public"]["Enums"]["tipo_documento"] | null
          updated_at?: string
          requiere_autorizacion?: boolean
          autorizado_por?: string | null
          autorizado_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_cajas"
            referencedColumns: ["caja_id"]
          },
          {
            foreignKeyName: "movimientos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_centro_costo_id_fkey"
            columns: ["centro_costo_id"]
            isOneToOne: false
            referencedRelation: "centros_costo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_liquidacion_id_fkey"
            columns: ["liquidacion_id"]
            isOneToOne: false
            referencedRelation: "liquidaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_liquidacion_id_fkey"
            columns: ["liquidacion_id"]
            isOneToOne: false
            referencedRelation: "v_liquidaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      perfiles: {
        Row: {
          activo: boolean
          created_at: string
          email: string | null
          id: string
          modulos: string[] | null
          nombre: string
          rol: Database["public"]["Enums"]["rol_usuario"]
          es_tesoreria: boolean
        }
        Insert: {
          activo?: boolean
          created_at?: string
          email?: string | null
          id: string
          modulos?: string[] | null
          nombre: string
          rol?: Database["public"]["Enums"]["rol_usuario"]
          es_tesoreria?: boolean
        }
        Update: {
          activo?: boolean
          created_at?: string
          email?: string | null
          id?: string
          modulos?: string[] | null
          nombre?: string
          rol?: Database["public"]["Enums"]["rol_usuario"]
          es_tesoreria?: boolean
        }
        Relationships: []
      }
      proveedores: {
        Row: {
          activo: boolean
          creado_por: string | null
          created_at: string
          id: string
          nombre_comercial: string | null
          num_doc: string
          razon_social: string
          tipo_doc: Database["public"]["Enums"]["tipo_doc_identidad"]
          updated_at: string
        }
        Insert: {
          activo?: boolean
          creado_por?: string | null
          created_at?: string
          id?: string
          nombre_comercial?: string | null
          num_doc: string
          razon_social: string
          tipo_doc: Database["public"]["Enums"]["tipo_doc_identidad"]
          updated_at?: string
        }
        Update: {
          activo?: boolean
          creado_por?: string | null
          created_at?: string
          id?: string
          nombre_comercial?: string | null
          num_doc?: string
          razon_social?: string
          tipo_doc?: Database["public"]["Enums"]["tipo_doc_identidad"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proveedores_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recargas: {
        Row: {
          comprobante_mime: string | null
          comprobante_path: string | null
          banco: string | null
          caja_id: string
          created_at: string
          descripcion: string | null
          fecha: string
          forma: Database["public"]["Enums"]["forma_ingreso"]
          id: string
          liquidacion_ingreso_id: string
          liquidacion_repuesta_id: string | null
          monto: number
          nota: string | null
          operacion: string | null
          recibo: string | null
          registrado_por: string
          traspaso_caja_id: string | null
          tipo: Database["public"]["Enums"]["tipo_recarga"]
        }
        Insert: {
          comprobante_mime?: string | null
          comprobante_path?: string | null
          banco?: string | null
          caja_id: string
          created_at?: string
          descripcion?: string | null
          fecha?: string
          forma?: Database["public"]["Enums"]["forma_ingreso"]
          id?: string
          liquidacion_ingreso_id: string
          liquidacion_repuesta_id?: string | null
          monto: number
          nota?: string | null
          operacion?: string | null
          recibo?: string | null
          registrado_por?: string
          traspaso_caja_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_recarga"]
        }
        Update: {
          comprobante_mime?: string | null
          comprobante_path?: string | null
          banco?: string | null
          caja_id?: string
          created_at?: string
          descripcion?: string | null
          fecha?: string
          forma?: Database["public"]["Enums"]["forma_ingreso"]
          id?: string
          liquidacion_ingreso_id?: string
          liquidacion_repuesta_id?: string | null
          monto?: number
          nota?: string | null
          operacion?: string | null
          recibo?: string | null
          registrado_por?: string
          traspaso_caja_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_recarga"]
        }
        Relationships: [
          {
            foreignKeyName: "recargas_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recargas_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_cajas"
            referencedColumns: ["caja_id"]
          },
          {
            foreignKeyName: "recargas_liquidacion_ingreso_id_fkey"
            columns: ["liquidacion_ingreso_id"]
            isOneToOne: false
            referencedRelation: "liquidaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recargas_liquidacion_ingreso_id_fkey"
            columns: ["liquidacion_ingreso_id"]
            isOneToOne: false
            referencedRelation: "v_liquidaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recargas_liquidacion_repuesta_id_fkey"
            columns: ["liquidacion_repuesta_id"]
            isOneToOne: true
            referencedRelation: "liquidaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recargas_liquidacion_repuesta_id_fkey"
            columns: ["liquidacion_repuesta_id"]
            isOneToOne: true
            referencedRelation: "v_liquidaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recargas_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitantes: {
        Row: {
          activo: boolean
          area: string | null
          created_at: string
          empresa_id: string
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          area?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          area?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitantes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_liquidaciones: {
        Row: {
          aprobada_en: string | null
          aprobada_por: string | null
          caja_id: string | null
          cerrada_en: string | null
          cerrada_por: string | null
          correlativo: number | null
          created_at: string | null
          estado: Database["public"]["Enums"]["estado_liquidacion"] | null
          fecha_cierre: string | null
          fecha_inicio: string | null
          folio: string | null
          id: string | null
          ingresos_actual: number | null
          num_incompletos: number | null
          num_movimientos: number | null
          observaciones: string | null
          saldo_final: number | null
          saldo_final_actual: number | null
          saldo_inicial: number | null
          total_actual: number | null
          total_gastado: number | null
          total_ingresos: number | null
          total_liquidable: number | null
        }
        Relationships: [
          {
            foreignKeyName: "liquidaciones_aprobada_por_fkey"
            columns: ["aprobada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidaciones_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquidaciones_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_cajas"
            referencedColumns: ["caja_id"]
          },
          {
            foreignKeyName: "liquidaciones_cerrada_por_fkey"
            columns: ["cerrada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_pendientes: {
        Row: {
          anulado: boolean | null
          caja_id: string | null
          categoria_id: string | null
          centro_costo_id: string | null
          creado_por: string | null
          created_at: string | null
          detalle: string | null
          dias_antiguedad: number | null
          estado: Database["public"]["Enums"]["estado_movimiento"] | null
          falta_documento: boolean | null
          falta_pago: boolean | null
          fecha: string | null
          id: string | null
          liquidacion_id: string | null
          medio_pago: Database["public"]["Enums"]["medio_pago"] | null
          monto: number | null
          motivo_anulacion: string | null
          operacion_pago: string | null
          origen: Database["public"]["Enums"]["origen_movimiento"] | null
          proveedor_id: string | null
          serie_numero: string | null
          solicitante: string | null
          tipo_documento: Database["public"]["Enums"]["tipo_documento"] | null
          updated_at: string | null
        }
        Insert: {
          anulado?: boolean | null
          caja_id?: string | null
          categoria_id?: string | null
          centro_costo_id?: string | null
          creado_por?: string | null
          created_at?: string | null
          detalle?: string | null
          dias_antiguedad?: never
          estado?: Database["public"]["Enums"]["estado_movimiento"] | null
          falta_documento?: never
          falta_pago?: never
          fecha?: string | null
          id?: string | null
          liquidacion_id?: string | null
          medio_pago?: Database["public"]["Enums"]["medio_pago"] | null
          monto?: number | null
          motivo_anulacion?: string | null
          operacion_pago?: string | null
          origen?: Database["public"]["Enums"]["origen_movimiento"] | null
          proveedor_id?: string | null
          serie_numero?: string | null
          solicitante?: string | null
          tipo_documento?: Database["public"]["Enums"]["tipo_documento"] | null
          updated_at?: string | null
        }
        Update: {
          anulado?: boolean | null
          caja_id?: string | null
          categoria_id?: string | null
          centro_costo_id?: string | null
          creado_por?: string | null
          created_at?: string | null
          detalle?: string | null
          dias_antiguedad?: never
          estado?: Database["public"]["Enums"]["estado_movimiento"] | null
          falta_documento?: never
          falta_pago?: never
          fecha?: string | null
          id?: string | null
          liquidacion_id?: string | null
          medio_pago?: Database["public"]["Enums"]["medio_pago"] | null
          monto?: number | null
          motivo_anulacion?: string | null
          operacion_pago?: string | null
          origen?: Database["public"]["Enums"]["origen_movimiento"] | null
          proveedor_id?: string | null
          serie_numero?: string | null
          solicitante?: string | null
          tipo_documento?: Database["public"]["Enums"]["tipo_documento"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "cajas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_caja_id_fkey"
            columns: ["caja_id"]
            isOneToOne: false
            referencedRelation: "v_saldo_cajas"
            referencedColumns: ["caja_id"]
          },
          {
            foreignKeyName: "movimientos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_centro_costo_id_fkey"
            columns: ["centro_costo_id"]
            isOneToOne: false
            referencedRelation: "centros_costo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_liquidacion_id_fkey"
            columns: ["liquidacion_id"]
            isOneToOne: false
            referencedRelation: "liquidaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_liquidacion_id_fkey"
            columns: ["liquidacion_id"]
            isOneToOne: false
            referencedRelation: "v_liquidaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      v_saldo_cajas: {
        Row: {
          bajo_umbral: boolean | null
          caja_area: string | null
          caja_id: string | null
          caja_numero: number | null
          empresa_codigo: string | null
          empresa_id: string | null
          movimientos_pendientes: number | null
          nombre: string | null
          saldo: number | null
          umbral_alerta: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cajas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      traspasar_caja: {
        Args: { p_anterior: string; p_nueva: string }
        Returns: number
      }
      adjuntar_comprobante_recarga: {
        Args: { p_mime: string; p_path: string; p_recarga: string }
        Returns: undefined
      }
      cerrar_liquidacion: {
        Args: { p_fecha_cierre?: string; p_liquidacion: string }
        Returns: {
          aprobada_en: string | null
          aprobada_por: string | null
          caja_id: string
          cerrada_en: string | null
          cerrada_por: string | null
          correlativo: number
          created_at: string
          estado: Database["public"]["Enums"]["estado_liquidacion"]
          fecha_cierre: string | null
          fecha_inicio: string
          folio: string
          id: string
          observaciones: string | null
          saldo_final: number | null
          saldo_inicial: number
          total_gastado: number | null
          total_ingresos: number | null
        }
        SetofOptions: {
          from: "*"
          to: "liquidaciones"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      drive_conectado: {
        Args: never
        Returns: {
          carpeta_id: string
          conectado: boolean
          cuenta_email: string
        }[]
      }
      es_admin: { Args: never; Returns: boolean }
      es_tesoreria: { Args: never; Returns: boolean }
      autorizar_movimiento: { Args: { p_mov: string }; Returns: undefined }
      generar_liquidacion: {
        Args: { p_caja: string; p_desde: string; p_hasta: string; p_excluir?: string[] }
        Returns: Database["public"]["Tables"]["liquidaciones"]["Row"]
      }
      fx_estado_movimiento: {
        Args: {
          p_medio: Database["public"]["Enums"]["medio_pago"]
          p_mov: string
        }
        Returns: Database["public"]["Enums"]["estado_movimiento"]
      }
      fx_liquidacion_abierta: { Args: { p_caja: string }; Returns: string }
      revisar_liquidacion: {
        Args: {
          p_aprobar: boolean
          p_liquidacion: string
          p_observaciones?: string
        }
        Returns: {
          aprobada_en: string | null
          aprobada_por: string | null
          caja_id: string
          cerrada_en: string | null
          cerrada_por: string | null
          correlativo: number
          created_at: string
          estado: Database["public"]["Enums"]["estado_liquidacion"]
          fecha_cierre: string | null
          fecha_inicio: string
          folio: string
          id: string
          observaciones: string | null
          saldo_final: number | null
          saldo_inicial: number
          total_gastado: number | null
          total_ingresos: number | null
        }
        SetofOptions: {
          from: "*"
          to: "liquidaciones"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      tiene_acceso_caja: {
        Args: {
          p_caja: string
          p_min?: Database["public"]["Enums"]["rol_usuario"]
        }
        Returns: boolean
      }
      tiene_acceso_empresa: { Args: { p_empresa: string }; Returns: boolean }
    }
    Enums: {
      estado_liquidacion:
        | "abierta"
        | "en_revision"
        | "observada"
        | "aprobada"
        | "repuesta"
      estado_movimiento: "pendiente" | "completo"
      forma_ingreso: "banco" | "efectivo" | "otros"
      medio_pago: "efectivo" | "yape" | "plin" | "transferencia" | "otro"
      origen_movimiento: "manual" | "compartido" | "ocr"
      rol_usuario: "admin" | "aprobador" | "registrador" | "lector"
      tipo_adjunto: "documento" | "pago" | "otro"
      tipo_doc_identidad: "RUC" | "DNI" | "CE" | "OTRO"
      tipo_documento:
        | "factura"
        | "boleta"
        | "rxh"
        | "planilla_movilidad"
        | "comprobante_egreso"
        | "otro"
      tipo_recarga: "apertura" | "reposicion" | "extraordinaria" | "ajuste"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      estado_liquidacion: [
        "abierta",
        "en_revision",
        "observada",
        "aprobada",
        "repuesta",
      ],
      estado_movimiento: ["pendiente", "completo"],
      forma_ingreso: ["banco", "efectivo", "otros"],
      medio_pago: ["efectivo", "yape", "plin", "transferencia", "otro"],
      origen_movimiento: ["manual", "compartido", "ocr"],
      rol_usuario: ["admin", "aprobador", "registrador", "lector"],
      tipo_adjunto: ["documento", "pago", "otro"],
      tipo_doc_identidad: ["RUC", "DNI", "CE", "OTRO"],
      tipo_documento: [
        "factura",
        "boleta",
        "rxh",
        "planilla_movilidad",
        "comprobante_egreso",
        "otro",
      ],
      tipo_recarga: ["apertura", "reposicion", "extraordinaria", "ajuste"],
    },
  },
} as const
