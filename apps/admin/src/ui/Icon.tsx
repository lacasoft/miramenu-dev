import { iconDefaults, icons, type IconShape } from "@miramenu/icons";

export type IconName = keyof typeof icons;

function Shape({ shape }: { shape: IconShape }) {
  switch (shape.kind) {
    case "path":
      return <path d={shape.d} strokeWidth={shape.strokeWidth} />;
    case "rect":
      return (
        <rect
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          rx={shape.rx}
        />
      );
    case "circle":
      return <circle cx={shape.cx} cy={shape.cy} r={shape.r} />;
  }
}

/**
 * The web renderer of @miramenu/icons: the canonical 24 × 24 geometry as inline SVG.
 * Decorative: the control that holds it carries the accessible name and the 48 px target.
 */
export function Icon({
  name,
  size = iconDefaults.size,
  filled = false,
}: {
  name: IconName;
  size?: number;
  /** Fill a fillable icon, such as the heart once liked. */
  filled?: boolean;
}) {
  const icon = icons[name];
  const isFilled = "filled" in icon || (filled && "fillable" in icon);
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={iconDefaults.viewBox}
      width={size}
      height={size}
      fill={isFilled ? "currentColor" : "none"}
      stroke={iconDefaults.stroke}
      strokeWidth={iconDefaults.strokeWidth}
      strokeLinecap={iconDefaults.strokeLinecap}
      strokeLinejoin={iconDefaults.strokeLinejoin}
    >
      {icon.shapes.map((shape, index) => (
        <Shape key={index} shape={shape} />
      ))}
    </svg>
  );
}
