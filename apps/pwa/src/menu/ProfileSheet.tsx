import type { MenuProfile } from "@miramenu/contracts";
import { useId } from "react";
import { t } from "../i18n";
import { Icon } from "../ui/Icon";
import { MediaImage } from "../ui/MediaImage";
import { useModalDialog } from "../ui/use-modal-dialog";
import styles from "./ProfileSheet.module.css";

/** The restaurant's profile on a solid reading surface: logo, name and its networks. */
export function ProfileSheet({
  profile,
  onClose,
}: {
  profile: MenuProfile;
  onClose: () => void;
}) {
  const dialog = useModalDialog(onClose);
  const titleId = useId();

  return (
    <dialog ref={dialog} className={styles.sheet} aria-labelledby={titleId}>
      <button
        type="button"
        className={styles.close}
        aria-label={t("profile.close")}
        onClick={onClose}
      >
        <Icon name="close" />
      </button>
      {profile.logo && (
        <MediaImage
          image={profile.logo}
          sizes="6rem"
          eager
          className={styles.logo}
        />
      )}
      <h2 id={titleId} className={styles.name}>
        {profile.name}
      </h2>
      {profile.socialLinks.length > 0 && (
        <nav aria-label={t("profile.links")}>
          <ul className={styles.links}>
            {profile.socialLinks.map((link) => (
              <li key={link.url}>
                <a
                  className={styles.link}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t(`social.${link.network}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </dialog>
  );
}
