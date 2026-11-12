import { qrFileNameOf, qrPathOf, qrSvgOf } from "@miramenu/admin-core";
import type { Branch } from "@miramenu/contracts";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { encode } from "uqr";
import { useAdminApi } from "../app/api-context";
import { keys } from "../app/keys";
import { t } from "../i18n";
import { downloadBlob, pngOf } from "../platform/files";
import controls from "../ui/controls.module.css";
import page from "../ui/page.module.css";
import styles from "./QrCard.module.css";

/**
 * Error correction M (15%) survives a stained or folded table card; four modules of quiet
 * zone is what scanners expect around a code.
 */
const QR_OPTIONS = { ecc: "M", border: 4 } as const;

/** The branch's QR code, drawn from its short link (ADR-0010), to download or print. */
export function QrCard({ branch, businessName }: { branch: Branch; businessName?: string }) {
  const api = useAdminApi();
  const [pngFailed, setPngFailed] = useState(false);
  const qr = useQuery({ queryKey: keys.qr(branch.id), queryFn: () => api.branchQr(branch.id) });
  const modules = useMemo(() => (qr.data === undefined ? null : encode(qr.data.shortUrl, QR_OPTIONS).data), [qr.data]);
  const label = t("qr.image", { name: branch.name });

  const downloadPng = async (cells: boolean[][]) => {
    setPngFailed(false);
    try {
      downloadBlob(await pngOf(cells), qrFileNameOf(branch.slug, "png"));
    } catch {
      setPngFailed(true);
    }
  };

  return (
    <section className={`${controls.card} ${page.section}`} aria-labelledby="branch-qr">
      <h2 id="branch-qr" className={page.sectionTitle}>
        {t("qr.title")}
      </h2>
      <p className={page.hint}>{t("qr.description")}</p>
      {qr.isPending ? (
        <p className={page.hint} role="status">
          {t("qr.loading")}
        </p>
      ) : qr.data === undefined || modules === null ? (
        <>
          <p className={controls.problem} role="alert">
            {t("qr.failed")}
          </p>
          <button type="button" className={controls.secondary} onClick={() => void qr.refetch()}>
            {t("status.retry")}
          </button>
        </>
      ) : (
        <>
          {/* What gets printed: the code, the branch's name and its short link. */}
          <div className={`printable ${styles.printable}`}>
            <p className={styles.printName}>
              {businessName === undefined ? branch.name : t("qr.printName", { business: businessName, branch: branch.name })}
            </p>
            <svg
              className={styles.code}
              role="img"
              aria-label={label}
              viewBox={`0 0 ${modules.length} ${modules.length}`}
              shapeRendering="crispEdges"
            >
              <rect width={modules.length} height={modules.length} fill="#FFFFFF" />
              <path d={qrPathOf(modules)} fill="#000000" />
            </svg>
            <p className={styles.link}>{qr.data.shortUrl}</p>
          </div>
          <dl className={page.facts}>
            <div>
              <dt>{t("qr.link")}</dt>
              <dd>{qr.data.shortUrl}</dd>
            </div>
          </dl>
          {pngFailed && (
            <p className={controls.problem} role="alert">
              {t("qr.pngFailed")}
            </p>
          )}
          <div className={page.actions}>
            <button
              type="button"
              className={controls.secondary}
              onClick={() =>
                downloadBlob(new Blob([qrSvgOf(modules, label)], { type: "image/svg+xml" }), qrFileNameOf(branch.slug, "svg"))
              }
            >
              {t("qr.downloadSvg")}
            </button>
            <button type="button" className={controls.secondary} onClick={() => void downloadPng(modules)}>
              {t("qr.downloadPng")}
            </button>
            <button type="button" className={controls.primary} onClick={() => window.print()}>
              {t("qr.print")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
