# Manual de tesorería — Factudex

Tesorería controla el dinero de las cajas chicas de **Compañía San Lorenzo** y **SIPE**: abre las cajas
y les da su dinero, revisa y aprueba las liquidaciones, autoriza los gastos grandes y da de alta a
los registradores. Tesorería **no registra gastos ni genera liquidaciones**: eso lo hace el registrador
de cada caja.

- Entra en **https://factudex.vercel.app** con tu correo y contraseña.
- Ves **Panel**, **Tesorería** y **Usuarios**. Tienes acceso a **todas las cajas**.

## 1. Panel

Resumen de todas las cajas del mes:

- **Saldo disponible**, **gastado en el mes**, **ingresos del mes** y **por sustentar** (gastos pendientes).
- Las **cajas**, con su saldo; las que bajaron de su umbral se marcan.
- **Gasto por mes** y **en qué se gastó** (por centro de costo o placa).
- Filtros por **empresa** (Todas, San Lorenzo, SIPE) y por **mes**.
- Avisos de lo que espera tu acción (gastos por autorizar, liquidaciones por aprobar), con enlace
  directo.

## 2. Tesorería → Bandeja

**Por aprobar.** Las liquidaciones que generaron los registradores.

1. Toca el **folio** (ej. `SL-LIQ-MT-001`) para ver el detalle: gastos, archivos, ingresos y totales.
2. Descarga el **Excel** si contabilidad lo necesita.
3. **Aprobar**, u **Observar** escribiendo qué hay que corregir. La observada vuelve al registrador,
   que corrige y la reenvía.

**Historial de cajas.** Todas las cajas, también las cerradas, con su saldo y cuánto se ha liquidado.
Toca una para ver sus liquidaciones; toca una liquidación para abrirla.

## 3. Tesorería → Por autorizar

Los gastos que pasan el **tope por gasto** (S/ 300 por defecto). No entran a ninguna liquidación
hasta que los autorices.

- **Autorizar gasto**: entra a la próxima liquidación de su caja.
- Si no corresponde: ábrelo y **anúlalo** con el motivo. El monto vuelve al saldo de la caja.

## 4. Tesorería → Ingresos

Aquí entra el dinero a las cajas. Hay dos opciones arriba.

### Abrir caja nueva (＋ Abrir caja nueva)

Cada vez que se liquida una caja y se necesita una nueva:

1. **Empresa**: San Lorenzo o SIPE.
2. **Área**: elígela de la lista.
   - **MT** · Mantenimiento · **AD** · Administración · **OP** · Operaciones.
   - **＋ Agregar área nueva…**: pon la **sigla** (2 a 4 letras, ej. LG), el **nombre** (Logística) y una
     **descripción**. Queda en la lista para las siguientes cajas.
3. **N° de caja**: déjalo vacío para usar el **siguiente** de la empresa. Si ya venían trabajando con
   otras cajas, pon el número que toca (ej. 05). Si ese número ya existe en la empresa, te avisa.
4. **Nombre**: se propone solo con el área ("Caja chica Mantenimiento"); puedes cambiarlo.
5. **Monto de apertura** y **umbral de alerta** (cuando el saldo baje de ese monto, se avisa).
6. Datos del depósito: **fecha**, **forma** (banco, efectivo, otros), **banco** y la **foto de la
   operación** (foto o PDF del voucher o Yape).
7. **Abrir caja.**

El **código se arma solo** y lo ves arriba del formulario mientras escribes:
`EMPRESA-CAJA-ÁREA-NN`, por ejemplo `SL-CAJA-MT-01`, `SIPE-CAJA-AD-02`.

- El número cuenta por **empresa**, no por área: si San Lorenzo tiene la 01, la siguiente es la 02
  aunque sea de otra área.
- Las liquidaciones de la caja también se numeran solas: `SL-LIQ-MT-001`, `002`…

**Después de abrirla:** ve a **Usuarios** y asígnala al registrador que la va a manejar.

### Recargar caja (agregar dinero a una caja que ya existe)

1. Elige la **caja**.
2. **¿A qué corresponde?**: recarga extraordinaria, apertura o ajuste. Si hay una liquidación
   aprobada pendiente de reponer, también aparece.
3. **Monto** (un ajuste puede ser negativo, ej. `-20.00`), **fecha**, **forma**, **banco** y la
   **foto de la operación**.
4. **Registrar ingreso.** Entra a la liquidación abierta de esa caja.

### Últimos ingresos

La lista de los ingresos registrados. Cada uno tiene **Ver foto**. Si se registró sin foto, toca
**＋ Foto** para adjuntarla después.

## 5. Tesorería → Cajas

- Editar una caja: área, número, nombre y umbral de alerta.
- **Cerrar una caja** que ya no se usará: desmarca *activa*. Sale de la vista de los registradores y
  queda en el historial como *Cerrada*.
- **Tope por gasto** de cada empresa: el monto sobre el cual un gasto necesita tu autorización.

## 6. Usuarios (registradores)

Tesorería crea y edita **registradores**. Los administradores y la otra gente de tesorería los
gestiona el administrador.

**Dar de alta a un registrador:**

1. **＋ Nuevo usuario**: nombre, correo y contraseña temporal (botón **Generar**).
2. Tipo **Registrador**.
3. Marca las **cajas que maneja** (con su código, ej. `SL-CAJA-MT-01`).
4. **Crear usuario.** La app muestra el correo y la contraseña **una sola vez**: pásaselos. Puede
   cambiar la contraseña en *Mi cuenta*.

**Después:**

- **Agregar o quitar cajas**: *Editar* → marca o desmarca → *Guardar cambios*.
- **Cambiar contraseña** (si la olvidó): *Editar* → *Generar* → *Cambiar contraseña* y pásasela.
- **Desactivar** a alguien que ya no trabaja: *Editar* → desmarca *Activo*. No puede entrar y su
  historial se conserva.

## 7. El ciclo de una caja

1. Tesorería **abre la caja** con su monto de apertura y la asigna al registrador.
2. El registrador **registra los gastos** con su comprobante y pago.
3. Los gastos sobre el tope esperan tu **autorización**.
4. El registrador **genera la liquidación** de un rango de fechas → *En revisión*.
5. Tesorería **aprueba** u **observa**.
6. Cuando la caja se agota: se liquida hasta el último gasto, tesorería la **cierra** (Cajas → desmarcar
   *activa*) y **abre una caja nueva** con su dinero.

## 8. Preguntas rápidas

- **Un registrador no ve su caja:** en Usuarios, revisa que tenga la caja marcada y que esté *Activo*.
- **Un gasto no entra a la liquidación:** está pendiente (le falta comprobante o pago) o espera tu
  autorización (pasó el tope).
- **Me equivoqué de número de caja:** corrígelo en Tesorería → Cajas.
- **La foto de un ingreso no se subió:** en Últimos ingresos toca **＋ Foto** y súbela de nuevo.
