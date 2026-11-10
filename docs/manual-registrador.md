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
| **Registro** | Abre con tres opciones: **Nuevo registro**, **Planilla de movilidad** y **Completar un registro anterior**. |
| **Pendientes** | Gastos a los que les falta el comprobante o el pago. |
| **Historial** | Todos los gastos de tu caja, con buscador y filtros. |
| **Liquidaciones** | Rendir la caja a tesorería. |

Si el saldo baja del umbral de la caja, sale un aviso en ámbar: es momento de liquidar.

## 2. Registrar un gasto

1. Ve a **Registro** → **📷 Nuevo registro** y elige **de qué caja sale el dinero** (si manejas más de una).
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

## 4b. Un pago con varias salidas (un Yape para varios comprobantes)

Ejemplo: pagaste **un Yape de S/ 90** y eso se sustenta con un peaje de S/ 40, otro peaje de S/ 40
y una planilla de S/ 10 (alimentación del chofer).

1. Registra el **primer comprobante** (el peaje de S/ 40) como siempre.
2. En **Medio de pago** elige Yape y marca **"Este pago cubre varios comprobantes"**. Escribe el
   **monto total del pago: 90.00**. Sube la captura del Yape **una sola vez**.
   - Si la IA ve que el Yape dice más que la factura, te ofrece el botón *"Es un pago con varias salidas"*.
3. Guarda. Verás: *Pago S/ 90.00 · sustentado S/ 40.00 · **falta S/ 50.00***.
4. Toca **"＋ Agregar la siguiente salida"**: ya viene el Yape, la fecha y la caja; solo sube el
   siguiente comprobante. La constancia no se vuelve a pedir.
5. Para la planilla: **"📝 Hacer planilla de movilidad"** (ver abajo); queda como otra salida del pago.
6. **Si sobró dinero y volvió a la caja**: abre el gasto → **"↩ Registrar devolución"** con el monto,
   el motivo y la foto.

**Mientras falte sustentar, todas las salidas de ese pago quedan Pendientes** y no entran a la
liquidación. Cuando cuadra (salidas + devoluciones = monto del pago) pasan a **Completo**, y cada
salida va como una línea propia en la liquidación.

## 4c. Planilla de movilidad (y alimentación)

En **Registro** toca **"📝 Planilla de movilidad"**. Si es el resto de un pago anterior (ej. el Yape que también
pagó un peaje), elígelo arriba en **"¿Es el resto de un pago anterior?"**.

1. **Serie y N°**: vienen solos (San Lorenzo: serie 10, el siguiente número). En SIPE, la primera
   vez escribe tu serie y número; después la app propone el siguiente.
2. **Fecha de emisión**, categoría (Movilidad) y centro de costo.
3. Por cada fila: **fecha**, **trabajador** y **DNI** (la app los recuerda), **motivo**
   (*Movilidad* o *Alimentación*), **origen**, **destino**, **importe** y **tipo** (Taxi, Bus,
   Colectivo, Combi). Usa **"⧉ Copiar la fila anterior"** para no repetir.
4. **Tope: S/ 40 por trabajador y por día**, sumando todas sus planillas. En una planilla pueden ir
   varios trabajadores, cada uno con su tope. Si alguien se pasa, la app lo marca en rojo y no deja
   guardar.
5. **Guardar planilla** → **🖨 Imprimir PDF** para que firmen. **Sin firma igual vale para la
   liquidación**: el PDF ya queda adjunto como documento.

En la liquidación sale en la columna **OTROS** como *"Planilla mov. 10-157"*.

## 4d. Completar un registro anterior (un pago que cubrió más de un gasto)

Ejemplo: un **Yape de S/ 60** pagó un **peaje de S/ 40** (ya registrado, quizá ya liquidado, incluso en la caja
anterior) y **S/ 20 de comida**, que se sustenta con una planilla.

1. **Registro** → **🧩 Completar un registro anterior**.
2. Arriba están los **pagos a los que les falta sustentar**: toca **📝 Planilla de movilidad** o
   **＋ Factura, boleta u otro comprobante**.
3. Si el pago no está ahí, busca el gasto en **"¿Un gasto ya registrado se pagó junto con otro?"** (ej. *peaje*),
   toca **🧩 Este pago cubrió más gastos**, escribe el **total (60.00)** y **Guardar el pago**. Luego toca
   **📝 Planilla de movilidad** y registra los S/ 20.
   - También puedes hacerlo desde el detalle del gasto (Historial → el gasto → *Este pago cubrió más gastos*).
4. La nueva salida se rinde en tu **caja actual**. La app indica *"S/ 40.00 ya se liquidó en SL-LIQ-… (caja
   anterior)"* y lo mismo sale en el Excel, para que tesorería sepa de dónde vienen los S/ 20.

Lo que ya se liquidó no cambia. La salida nueva queda **Completa** cuando el pago cuadra (60 = 40 + 20).

**Al revés: subiste el pago nuevo y lo que falta ya se liquidó antes.** Ej.: un Yape de S/ 60 que incluye
S/ 29.30 de una planilla que ya se rindió en la caja anterior. En la tarjeta del pago (en *Completar un registro
anterior* o en el detalle del gasto) toca **"✓ Lo que falta ya se liquidó en una caja anterior"**:

- **Está en la app**: busca ese gasto (sale primero el del mismo monto) y toca **Juntar**.
- **Fuera de la app** (se liquidó en Excel o papel): escribe el monto y dónde se liquidó (ej. *Caja 4 ·
  planilla de movilidad 10-150*) y **Guardar**.

El pago cuadra y sus salidas pasan a **Completo**. Lo ya liquidado no cambia y queda indicado en la app y en el
Excel.

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
