import { PaginaLegal } from "@/components/ui/PaginaLegal";

export const metadata = { title: "Política de privacidad · Factudex" };

export default function PaginaPrivacidad() {
  return (
    <PaginaLegal titulo="Política de privacidad">
      <p>
        Factudex es una herramienta interna de Compañía San Lorenzo S.A.C. y SIPE para registrar y liquidar
        cajas chicas. Solo la usan colaboradores con una cuenta creada por el administrador.
      </p>
      <h2>Qué datos guardamos</h2>
      <ul>
        <li>Nombre y correo de cada usuario, para el inicio de sesión.</li>
        <li>Los gastos registrados (fecha, proveedor, monto, centro de costo, solicitante) y sus comprobantes.</li>
      </ul>
      <h2>Google Drive</h2>
      <p>
        Si el administrador conecta una cuenta de Google, Factudex usa el acceso a Google Drive únicamente para
        crear carpetas y guardar las fotos de los comprobantes dentro de la carpeta que el administrador elige, y
        para mostrarlas dentro de la app. No lee, modifica ni borra otros archivos, no comparte los datos con
        terceros y no los usa para publicidad ni para entrenar modelos de IA. El uso de la información recibida de
        las API de Google se ajusta a la{" "}
        <a
          className="text-fx-primary-light underline"
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noreferrer"
        >
          Política de datos de usuario de los servicios de API de Google
        </a>
        , incluidos los requisitos de uso limitado.
      </p>
      <h2>Dónde se guardan</h2>
      <p>
        Los registros se guardan en una base de datos Supabase con acceso restringido por usuario y caja. Los
        comprobantes, en el Google Drive de la empresa o, como respaldo, en un almacenamiento privado de Supabase.
      </p>
      <h2>Cómo desconectar o eliminar datos</h2>
      <p>
        El administrador puede revocar el acceso en cualquier momento desde{" "}
        <a className="text-fx-primary-light underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
          myaccount.google.com/permissions
        </a>
        . Para pedir la eliminación de tus datos, escribe a mtts01.san.lorenzo@gmail.com.
      </p>
    </PaginaLegal>
  );
}
