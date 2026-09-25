import { PaginaLegal } from "@/components/ui/PaginaLegal";

export const metadata = { title: "Condiciones del servicio · Factudex" };

export default function PaginaTerminos() {
  return (
    <PaginaLegal titulo="Condiciones del servicio">
      <p>
        Factudex es una herramienta de uso interno de Compañía San Lorenzo S.A.C. y SIPE para el control de cajas
        chicas. Al usarla aceptas estas condiciones.
      </p>
      <h2>Acceso</h2>
      <ul>
        <li>Solo pueden entrar colaboradores con una cuenta creada por el administrador.</li>
        <li>Cada usuario es responsable de su contraseña y de lo que registra con su cuenta.</li>
      </ul>
      <h2>Uso</h2>
      <ul>
        <li>Registra solo gastos reales de la caja asignada, con sus comprobantes verdaderos.</li>
        <li>Los movimientos no se borran: se anulan indicando el motivo.</li>
        <li>La lectura automática de comprobantes solo sugiere datos; el usuario siempre los revisa y confirma.</li>
      </ul>
      <h2>Servicio</h2>
      <p>
        La empresa puede modificar la herramienta, suspender cuentas o cambiar estas condiciones cuando lo
        necesite. Consultas: mtts01.san.lorenzo@gmail.com.
      </p>
    </PaginaLegal>
  );
}
