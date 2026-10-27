# Manual del registrador — Factudex

Factudex es la app de caja chica de **Compañía San Lorenzo** y **SIPE**. Tú registras cada gasto
de tu caja con su comprobante y, cuando toca, generas la **liquidación** para que tesorería la apruebe.

- Entra en **https://factudex.vercel.app** con el correo y la contraseña que te dio tesorería.
- Solo ves **tus cajas** (las que te asignaron). Si al entrar sale *"Tu usuario todavía no tiene
  cajas asignadas"*, pide a tesorería que te asigne una.
- Cambia tu contraseña en **Mi cuenta** (el círculo con tus iniciales, arriba a la derecha).

## 1. La pantalla

Arriba tienes la **empresa** (San Lorenzo / SIPE), tus **cajas** con su código y su **saldo**
(ej. `SL-CAJA-MT-01 · S/ 560.00`). Toca una caja para trabajar en ella.

Debajo, las pestañas:

| Pestaña | Para qué |
| --- | --- |
| **Registro** | Cargar un gasto nuevo. Es la pantalla con la que abre la app. |
| **Pendientes** | Gastos a los que les falta el comprobante o el pago. |
| **Historial** | Todos los gastos de tu caja, con buscador y filtros. |
| **Liquidaciones** | Rendir la caja a tesorería. |

Si el saldo baja del umbral de la caja, sale un aviso en ámbar: es momento de liquidar.

## 2. Registrar un gasto

1. Ve a **Registro** y elige **de qué caja sale el dinero** (si manejas más de una).
2. Toca **Tomar foto del comprobante** o sube el archivo (foto o PDF): factura, boleta, recibo por
   honorarios, planilla de movilidad, comprobante de egreso…
3. Si no pagaste en efectivo, sube también la **constancia de pago** (captura de Yape o Plin,
   voucher o constancia de transferencia).
4. La **IA lee el comprobante** y llena los datos (ver punto 3). **Revísalos siempre.**
5. Completa lo que falte:
   - **Categoría** (combustible, peajes, repuestos…).
   - **Centro de costo / placa**: escribe y elige de la lista. Si no existe, toca **＋ Agregar**.
     Si no aplica, deja *General*.
   - **Solicitante**: quién pidió el gasto (la app sugiere nombres).
   - **Detalle**: qué se compró, corto y claro.
   - **Medio de pago**: efectivo, Yape, transferencia u otro.
6. Toca **Guardar**.

**¿Completo o pendiente?**

- **Completo** = tiene el **comprobante** y la **constancia de pago**. Si fue en **efectivo**, basta
  el comprobante.
- **Pendiente** = le falta algo. Se guarda igual y lo completas después en **Pendientes**.
- Solo los gastos **completos** entran a una liquidación. Los pendientes no vencen: esperan a que
  los completes.

**Gastos sobre el tope (S/ 300).** Si un gasto pasa el tope, la app te avisa. Se guarda, pero queda
**por autorizar**: no entra a ninguna liquidación hasta que tesorería lo autorice.

## 3. La IA (lectura automática)

Al subir la foto o el PDF, la app lo manda a la IA y **pre-llena** el formulario. **Nunca guarda sola**:
siempre revisas y tocas *Guardar*. Solo llena campos vacíos; lo que tú escribiste no lo cambia.

**Qué lee:**

- De un **comprobante**: monto total, fecha, RUC o DNI y razón social del proveedor, tipo y N° de
  documento (ej. F001-00012345), concepto.
- De un **Yape, Plin o voucher**: monto, fecha, medio de pago y N° de operación.
  Si lo pusiste en el espacio del comprobante, lo pasa a *Constancia de pago*.

**Qué te sugiere:**

- El **proveedor**: lo busca por RUC; en un Yape, por el nombre. Si es nuevo, ofrece
  **"Agregar y usar"**.
- La **categoría** y el **centro de costo o placa** de la lista de tu empresa. Si lee una placa que no
  está, ofrece agregarla.

**Avisos que da:**

- **Comprobante ya registrado**: mismo RUC y mismo N°. Revisa que no lo estés subiendo dos veces.
- **Montos distintos**: el comprobante y el pago no dicen lo mismo.
- **Lectura dudosa** (en ámbar): la foto está borrosa o cortada. Revisa con más cuidado.

**Consejos para que lea bien:** foto de frente, con buena luz, el comprobante entero y sin dedos
encima. Lee JPG, PNG, WEBP y PDF. Las fotos de iPhone en HEIC se adjuntan, pero no se leen: llena
los datos a mano.

## 4. Compartir desde Yape, WhatsApp o la galería (Android)

1. Abre factudex.vercel.app en **Chrome** → menú ⋮ → **Instalar app**. Ábrela una vez.
2. En Yape, WhatsApp, Galería o la app del banco: **Compartir → Factudex**.
3. Se abre una ventana que pregunta:
   - **¿Qué es?** Comprobante o constancia de pago (viene marcado lo que leyó la IA).
   - **¿De qué caja?**
   - **¿Para qué gasto?** Uno **nuevo** o un **pendiente** al que le falta justo ese archivo. El que
     coincide en monto, proveedor o fecha sale primero.

En Xiaomi o Redmi, dale a Chrome el permiso *Accesos directos de la pantalla de inicio*. En iPhone
no hay "Compartir": usa el botón de foto o elige el archivo.

## 5. Completar pendientes

1. Ve a **Pendientes**. Cada gasto dice qué le falta (comprobante o pago).
2. Toca **Adjuntar**, sube el archivo y guarda. Al completarse pasa a **Completo**.

## 6. Historial y correcciones

- **Historial** muestra todos tus gastos. Busca por texto (proveedor, detalle) y filtra:
  Todos · Pendientes · Completos · Por autorizar · Anulados.
- Toca un gasto para ver su detalle y sus archivos.
- **¿Te equivocaste?** Los gastos no se borran: ábrelo, toca **Anular**, escribe el motivo y regístralo
  de nuevo bien. El monto vuelve al saldo de la caja. Solo se puede mientras su liquidación siga abierta.

## 7. Generar la liquidación

Cuando el saldo se está acabando (o cuando te lo pidan), rindes los gastos:

1. Ve a **Liquidaciones** y elige la **caja a liquidar**.
2. Pon el **rango de fechas**: **Desde** y **Hasta** (no puede ser una fecha futura).
3. La app lista los gastos **completos y autorizados** de ese rango, ya marcados.
   - **Desmarca** los que no quieras incluir: quedan en la caja para la siguiente liquidación.
   - Los pendientes y los que esperan autorización no entran. Se pasan solos a la siguiente.
4. Revisa el resumen: **saldo anterior**, **ingresos**, **gastos** y **por reembolsar**.
5. Toca **Generar liquidación** y confirma con **Sí, generar**.

Sale su **folio**, por ejemplo `SL-LIQ-MT-001`. El correlativo es por empresa y área, y lo pone el
sistema. La liquidación pasa a **En revisión** y tú sigues registrando gastos en la caja.

**Estados de la liquidación:**

| Estado | Qué significa | Qué haces |
| --- | --- | --- |
| **Abierta** | La que está en curso: ahí caen tus gastos nuevos. | Seguir registrando. |
| **En revisión** | La generaste; espera a tesorería. | Nada; espera. |
| **Observada** | Tesorería encontró algo que corregir. | Abre la liquidación, lee la observación, corrige (completa o anula y vuelve a registrar) y toca **Volver a enviar**. |
| **Aprobada** | Tesorería la aprobó. | Listo. |

En el detalle de cada liquidación puedes descargar el **Excel** con el formato de contabilidad.

**Cuando la caja se termina:** liquida todo lo que tengas completo. Tesorería abre la **caja nueva**
(ej. de `SL-CAJA-MT-02` a `SL-CAJA-MT-03`) y pasa a ella:

- El **saldo** que quedó: si sobró, se suma; si te pasaste, se descuenta.
- Tus gastos **pendientes o sin liquidar**: los sigues completando y los liquidas en la caja nueva.

La caja anterior se cierra y la nueva te aparece arriba automáticamente.

## 8. Preguntas rápidas

- **No veo mi caja:** pide a tesorería que te la asigne en Usuarios.
- **La IA no leyó nada:** revisa que sea JPG, PNG, WEBP o PDF y que la foto se vea clara. Igual puedes
  llenar a mano.
- **Mi gasto no aparece para liquidar:** está pendiente (le falta un archivo), está por autorizar
  (pasó el tope) o su fecha está fuera del rango elegido.
- **Olvidé mi contraseña:** pide a tesorería que te ponga una nueva.
