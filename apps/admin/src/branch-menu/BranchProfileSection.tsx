import type { BranchMenuDraft, Media, Profile } from "@miramenu/contracts";
import { useState } from "react";
import { useAdminApi } from "../app/api-context";
import { keys } from "../app/keys";
import { t } from "../i18n";
import { branchMedia } from "../menu/media-scope";
import { MediaSlot } from "../menu/MediaSlot";
import { ProfileFacts, ProfileForm } from "../menu/ProfileSection";
import { menuProblemText, useMenuChange } from "../menu/use-menu-change";
import controls from "../ui/controls.module.css";
import page from "../ui/page.module.css";

type Mode = "view" | "edit" | "back";

/**
 * What the branch's diners see on top of its menu: its business's profile, or one of
 * its own, started from the business's and with its own logo. Going back to the
 * business's profile is asked first: the own profile is lost.
 */
export function BranchProfileSection({
  branchId,
  branchName,
  draft,
  baseProfile,
  baseMedia,
  editable,
}: {
  branchId: string;
  branchName: string;
  draft: BranchMenuDraft;
  /** The business's profile, which the branch uses when it has none of its own. */
  baseProfile: Profile | null;
  baseMedia: ReadonlyMap<string, Media>;
  editable: boolean;
}) {
  const api = useAdminApi();
  const draftKey = keys.branchMenuDraft(branchId);
  const [mode, setMode] = useState<Mode>("view");
  const [said, setSaid] = useState<string | null>(null);
  const back = useMenuChange<void, void>(
    draftKey,
    (client) => client.removeBranchProfile(branchId),
    () => {
      setMode("view");
      setSaid(t("branchMenu.profileRemoved"));
    },
  );
  const own = draft.profile;
  const ownMedia = new Map(draft.media.map((each) => [each.id, each]));
  const start = (next: Mode) => {
    setSaid(null);
    back.clearProblem();
    setMode(next);
  };

  return (
    <section
      className={`${controls.card} ${page.section}`}
      aria-labelledby="branch-profile"
    >
      <h2 id="branch-profile" className={page.sectionTitle}>
        {t("branchMenu.profile")}
      </h2>
      <p className={page.hint}>{t("branchMenu.profileDescription")}</p>
      {said !== null && (
        <p className={controls.notice} role="status">
          {said}
        </p>
      )}
      {mode === "edit" ? (
        <ProfileForm
          draftKey={draftKey}
          profile={own ?? baseProfile}
          suggestedName={branchName}
          save={(client, value) => client.putBranchProfile(branchId, value)}
          onDone={(saved) => {
            setSaid(saved ? t("menu.profileSaved") : null);
            setMode("view");
          }}
        />
      ) : own === null ? (
        <>
          <p>
            {baseProfile === null
              ? t("branchMenu.noBusinessProfile")
              : t("branchMenu.usesBusinessProfile", { name: baseProfile.name })}
          </p>
          {baseProfile !== null && (
            <MediaSlot
              scope={branchMedia(branchId)}
              slot="logo"
              mediaId={baseProfile.logoId}
              media={baseMedia}
              name={baseProfile.name}
              editable={false}
              attach={async () => undefined}
            />
          )}
          {editable && (
            <button
              type="button"
              className={controls.secondary}
              onClick={() => start("edit")}
            >
              {t("branchMenu.ownProfile")}
            </button>
          )}
        </>
      ) : (
        <>
          <ProfileFacts profile={own} />
          <MediaSlot
            scope={branchMedia(branchId)}
            slot="logo"
            mediaId={own.logoId}
            media={ownMedia}
            name={own.name}
            editable={editable}
            attach={(logoId) =>
              api.putBranchProfile(branchId, { ...own, logoId })
            }
          />
          {back.problem !== null && (
            <p className={controls.problem} role="alert">
              {menuProblemText(back.problem)}
            </p>
          )}
          {editable && (
            <div className={page.actions}>
              {mode === "back" ? (
                <>
                  <button
                    type="button"
                    className={controls.primary}
                    disabled={back.change.isPending}
                    onClick={() => back.change.mutate()}
                  >
                    {t("branchMenu.confirmBackToBusiness")}
                  </button>
                  <button
                    type="button"
                    className={controls.secondary}
                    onClick={() => start("view")}
                  >
                    {t("common.cancel")}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={controls.secondary}
                    onClick={() => start("edit")}
                  >
                    {t("menu.editProfile")}
                  </button>
                  <button
                    type="button"
                    className={controls.secondary}
                    onClick={() => start("back")}
                  >
                    {t("branchMenu.backToBusinessProfile")}
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
