import { nameProblemOf, socialUrlProblemOf } from "@miramenu/admin-core";
import {
  MENU_LIMITS,
  socialNetworkSchema,
  type Media,
  type Profile,
  type PutProfileRequest,
  type SocialNetwork,
} from "@miramenu/contracts";
import type { AdminApi } from "@miramenu/api-client";
import type { QueryKey } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { useAdminApi } from "../app/api-context";
import { keys } from "../app/keys";
import { fieldText } from "../app/problems";
import { t } from "../i18n";
import controls from "../ui/controls.module.css";
import { Field, SelectField } from "../ui/Field";
import page from "../ui/page.module.css";
import { businessMedia } from "./media-scope";
import { MediaSlot } from "./MediaSlot";
import styles from "./menu.module.css";
import { menuProblemText, useMenuChange } from "./use-menu-change";

interface LinkRow {
  key: number;
  network: SocialNetwork;
  url: string;
}

const urlText = (url: string) => {
  const problem = socialUrlProblemOf(url);
  return problem === "format"
    ? t("field.url.format")
    : fieldText("name", problem);
};

/** A profile's name and links; saving keeps its logo, which the `PUT` would detach. */
export function ProfileForm({
  draftKey,
  profile,
  suggestedName,
  save,
  onDone,
}: {
  /** The draft the profile belongs to: the base menu's or a branch's. */
  draftKey: QueryKey;
  /** What the form starts from; its logo is kept. */
  profile: Profile | null;
  suggestedName: string;
  save: (api: AdminApi, profile: PutProfileRequest) => Promise<Profile>;
  onDone: (saved: boolean) => void;
}) {
  const nextKey = useRef(profile?.socialLinks.length ?? 0);
  const [name, setName] = useState(profile?.name ?? suggestedName);
  const [links, setLinks] = useState<LinkRow[]>(
    (profile?.socialLinks ?? []).map((link, key) => ({ key, ...link })),
  );
  const [tried, setTried] = useState(false);
  const { change, problem } = useMenuChange(draftKey, save, () => onDone(true));
  const update = (key: number, patch: Partial<LinkRow>) =>
    setLinks((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (change.isPending) return;
    if (
      nameProblemOf(name) !== null ||
      links.some((link) => socialUrlProblemOf(link.url) !== null)
    )
      return;
    change.mutate({
      name: name.trim(),
      socialLinks: links.map(({ network, url }) => ({
        network,
        url: url.trim(),
      })),
      // Replacing the profile without its logo would detach it.
      logoId: profile?.logoId ?? null,
    });
  };

  return (
    <form className={page.form} onSubmit={submit} noValidate>
      <Field
        label={t("menu.profileName")}
        value={name}
        error={fieldText("name", tried ? nameProblemOf(name) : null)}
        onChange={(event) => setName(event.target.value)}
      />
      {links.map((link, index) => (
        <fieldset key={link.key} className={styles.group}>
          <legend className={styles.legend}>
            {t("menu.socialLink", { number: index + 1 })}
          </legend>
          <SelectField
            label={t("menu.network")}
            value={link.network}
            onChange={(event) =>
              update(link.key, {
                network: socialNetworkSchema.parse(event.target.value),
              })
            }
          >
            {socialNetworkSchema.options.map((network) => (
              <option key={network} value={network}>
                {t(`network.${network}`)}
              </option>
            ))}
          </SelectField>
          <Field
            label={t("menu.url")}
            hint={t("menu.urlHint")}
            type="url"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            value={link.url}
            error={tried ? urlText(link.url) : null}
            onChange={(event) => update(link.key, { url: event.target.value })}
          />
          <button
            type="button"
            className={controls.link}
            onClick={() =>
              setLinks((rows) => rows.filter((row) => row.key !== link.key))
            }
          >
            {t("menu.removeSocialLink", { number: index + 1 })}
          </button>
        </fieldset>
      ))}
      {links.length < MENU_LIMITS.socialLinks ? (
        <button
          type="button"
          className={`${controls.secondary} ${styles.start}`}
          onClick={() => {
            const key = nextKey.current;
            nextKey.current += 1;
            setLinks((rows) => [
              ...rows,
              { key, network: "instagram", url: "" },
            ]);
          }}
        >
          {t("menu.addSocialLink")}
        </button>
      ) : (
        <p className={page.hint}>{t("menu.socialLimit")}</p>
      )}
      {problem !== null && (
        <p className={controls.problem} role="alert">
          {menuProblemText(problem)}
        </p>
      )}
      <div className={page.actions}>
        <button
          type="submit"
          className={controls.primary}
          disabled={change.isPending}
        >
          {t(change.isPending ? "common.saving" : "common.save")}
        </button>
        <button
          type="button"
          className={controls.secondary}
          onClick={() => onDone(false)}
        >
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

export function ProfileFacts({ profile }: { profile: Profile }) {
  return (
    <dl className={page.facts}>
      <div>
        <dt>{t("menu.profileName")}</dt>
        <dd>{profile.name}</dd>
      </div>
      <div>
        <dt>{t("menu.socialLinks")}</dt>
        {profile.socialLinks.length === 0 ? (
          <dd>{t("menu.noSocialLinks")}</dd>
        ) : (
          profile.socialLinks.map((link) => (
            <dd key={`${link.network}:${link.url}`}>
              {t(`network.${link.network}`)}: {link.url}
            </dd>
          ))
        )}
      </div>
    </dl>
  );
}

/** The name and links diners see on top of the menu; publishing needs it. */
export function ProfileSection({
  businessId,
  profile,
  suggestedName,
  media,
  editable,
}: {
  businessId: string;
  profile: Profile | null;
  suggestedName: string;
  /** The media the draft uses, by id. */
  media: ReadonlyMap<string, Media>;
  editable: boolean;
}) {
  const api = useAdminApi();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <section
      className={`${controls.card} ${page.section}`}
      aria-labelledby="menu-profile"
    >
      <div className={page.sectionHeader}>
        <h2 id="menu-profile" className={page.sectionTitle}>
          {t("menu.profile")}
        </h2>
        {editable && !editing && (
          <button
            type="button"
            className={controls.secondary}
            onClick={() => {
              setSaved(false);
              setEditing(true);
            }}
          >
            {t(profile === null ? "menu.createProfile" : "menu.editProfile")}
          </button>
        )}
      </div>
      <p className={page.hint}>{t("menu.profileDescription")}</p>
      {saved && (
        <p className={controls.notice} role="status">
          {t("menu.profileSaved")}
        </p>
      )}
      {editing ? (
        <ProfileForm
          draftKey={keys.menuDraft(businessId)}
          save={(client, value) => client.putProfile(businessId, value)}
          profile={profile}
          suggestedName={suggestedName}
          onDone={(didSave) => {
            setSaved(didSave);
            setEditing(false);
          }}
        />
      ) : profile === null ? (
        <p className={controls.problem}>{t("menu.profileMissing")}</p>
      ) : (
        <>
          <ProfileFacts profile={profile} />
          <MediaSlot
            scope={businessMedia(businessId)}
            slot="logo"
            mediaId={profile.logoId}
            media={media}
            name={profile.name}
            editable={editable}
            attach={(logoId) => api.putProfile(businessId, { ...profile, logoId })}
          />
        </>
      )}
      {!editing && profile === null && editable && <p className={page.hint}>{t("media.logoNeedsProfile")}</p>}
    </section>
  );
}
