export function Logo({ tamano = 40 }: { tamano?: number }) {
  return (
    <div
      aria-hidden
      className="flex shrink-0 items-center justify-center bg-linear-135 from-fx-primary to-fx-accent font-display font-bold text-fx-bg"
      style={{
        width: tamano,
        height: tamano,
        borderRadius: Math.round(tamano * 0.27),
        fontSize: Math.round(tamano * 0.45),
      }}
    >
      F
    </div>
  );
}
