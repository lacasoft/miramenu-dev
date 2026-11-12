import {
  largestSourceOf,
  srcSetOf,
  type MenuImage,
} from "@miramenu/diner-core";
import { useState } from "react";
import { t } from "../i18n";
import styles from "./MediaImage.module.css";

interface MediaImageProps {
  image: MenuImage | null;
  /** How wide it renders, so the browser picks the right source from the srcset. */
  sizes: string;
  /** Near the screen: load now. Otherwise the browser waits until it is close (RNF-09). */
  eager?: boolean;
  className?: string;
}

/**
 * An optimized dish or logo image, decorative: the name next to it already says what it
 * is. While it loads, the surface shows; if it is missing or fails, a quiet placeholder
 * says so, never a broken image (design-system: Estados).
 */
export function MediaImage({
  image,
  sizes,
  eager = false,
  className = "",
}: MediaImageProps) {
  const [failed, setFailed] = useState(false);
  if (image === null || failed) {
    return (
      <div className={`${styles.frame} ${styles.missing} ${className}`}>
        <span className={styles.missingText}>{t("media.unavailable")}</span>
      </div>
    );
  }
  return (
    <div className={`${styles.frame} ${className}`}>
      <img
        className={styles.image}
        src={largestSourceOf(image)}
        srcSet={srcSetOf(image)}
        sizes={sizes}
        width={image.width}
        height={image.height}
        alt=""
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
