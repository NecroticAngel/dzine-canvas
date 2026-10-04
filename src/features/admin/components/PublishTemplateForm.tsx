import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  apiError,
  grantTemplate,
  listAdminTemplates,
  publishTemplate,
  revokeTemplateGrant,
  slugify,
  type DesignSummary,
  type TenantSummary,
} from '../api';

const inputCss = {
  width: '100%',
  boxSizing: 'border-box' as const,
  padding: '9px 11px',
  borderRadius: 8,
  border: '1px solid var(--app-border)',
  background: 'var(--app-surface)',
  color: 'var(--app-text-strong)',
  fontSize: 13,
  fontFamily: 'inherit',
};

const labelCss = {
  display: 'block',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  color: 'var(--app-text-muted)',
  marginBottom: 6,
};

const hintCss = {
  margin: '6px 0 0',
  fontSize: 12,
  color: 'var(--app-text-muted)',
};

type Source = 'design' | 'paste';
type Visibility = 'everyone' | 'copy' | 'some';

/** A template is one page. A design export is a list of them. */
const readElements = (raw: string) => {
  const parsed = JSON.parse(raw) as unknown;
  const page = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!page || typeof page !== 'object' || !('layers' in page)) {
    throw new Error('That JSON is not a design export — it has no "layers".');
  }
  return { page, pageCount: Array.isArray(parsed) ? parsed.length : 1 };
};

export const PublishTemplateForm = ({
  designs,
  tenants,
  onDone,
  onCancel,
}: {
  designs: DesignSummary[];
  tenants: TenantSummary[];
  onDone: () => void | Promise<void>;
  onCancel: () => void;
}) => {
  const [source, setSource] = useState<Source>(designs.length ? 'design' : 'paste');
  const [designId, setDesignId] = useState(designs[0]?.id ?? '');
  const [json, setJson] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [idEdited, setIdEdited] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [img, setImg] = useState('');

  const [visibility, setVisibility] = useState<Visibility>('everyone');
  const [copyTenant, setCopyTenant] = useState('');
  const [grantTenants, setGrantTenants] = useState<string[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const effectiveId = idEdited ? id : slugify(name);

  const pickFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setJson(await file.text());
    setFileName(file.name);
    setSource('paste');
  };

  const toggleGrantTenant = (tenantId: string) =>
    setGrantTenants((current) =>
      current.includes(tenantId)
        ? current.filter((value) => value !== tenantId)
        : [...current, tenantId],
    );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setNote(null);

    if (!name.trim()) {
      setError('Give the template a name.');
      return;
    }
    if (source === 'design' && !designId) {
      setError('Pick a design to publish.');
      return;
    }
    if (visibility === 'copy' && !copyTenant) {
      setError('Pick the company that should get its own copy.');
      return;
    }
    if (visibility === 'some' && grantTenants.length === 0) {
      setError('Pick at least one company, or choose "Everyone".');
      return;
    }

    let elements: unknown;
    if (source === 'paste') {
      if (!json.trim()) {
        setError('Paste a design export, or publish one of your designs.');
        return;
      }
      try {
        const parsed = readElements(json);
        elements = parsed.page;
        if (parsed.pageCount > 1) {
          setNote(
            `That export has ${parsed.pageCount} pages; templates hold one, so page 1 is being published.`,
          );
        }
      } catch (problem) {
        setError(
          problem instanceof Error ? problem.message : 'That JSON could not be read.',
        );
        return;
      }
    }

    setBusy(true);
    try {
      const created = await publishTemplate({
        ...(effectiveId ? { id: effectiveId } : {}),
        name: name.trim(),
        ...(img.trim() ? { img: img.trim() } : {}),
        ...(overwrite ? { overwrite: true } : {}),
        scope: visibility === 'copy' ? 'tenant' : 'global',
        ...(visibility === 'copy' ? { tenantId: copyTenant } : {}),
        ...(source === 'design'
          ? { sourceDesignId: designId }
          : { elements }),
      });

      /*
       * A global template is visible to everyone until it has a grant, and each
       * grant *narrows* it. So the grants have to be reconciled with what the
       * admin chose rather than only added to: switching to "Everyone" means
       * clearing the grants that were there, and "Only these" means removing the
       * companies that are no longer ticked.
       */
      if (visibility !== 'copy') {
        const desired = visibility === 'some' ? grantTenants : [];
        const current = (
          (await listAdminTemplates()).find((item) => item.id === created.id)?.grants ?? []
        ).map((grant) => grant.tenantId);
        for (const tenantId of desired) {
          if (!current.includes(tenantId)) {
            await grantTemplate(created.id, tenantId);
          }
        }
        for (const tenantId of current) {
          if (!desired.includes(tenantId)) {
            await revokeTemplateGrant(created.id, tenantId);
          }
        }
      }

      await onDone();
    } catch (problem) {
      setError(apiError(problem, 'Could not publish that template.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      css={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: 16,
        border: '1px solid var(--app-border)',
        borderRadius: 12,
        background: 'var(--app-panel)',
      }}
    >
      <strong css={{ color: 'var(--app-text-strong)', fontSize: 15 }}>
        Publish a template
      </strong>

      <div>
        <span css={labelCss}>Contents</span>
        <div css={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setSource('design')}
            disabled={!designs.length}
            css={pillCss(source === 'design', !designs.length)}
          >
            One of my designs
          </button>
          <button
            type="button"
            onClick={() => setSource('paste')}
            css={pillCss(source === 'paste', false)}
          >
            Paste or upload JSON
          </button>
        </div>

        {source === 'design' ? (
          <>
            <select
              css={{ ...inputCss, marginTop: 10 }}
              value={designId}
              onChange={(event) => setDesignId(event.target.value)}
              aria-label="Design to publish"
            >
              {designs.length === 0 && <option value="">No designs yet</option>}
              {designs.map((design) => (
                <option key={design.id} value={design.id}>
                  {design.name}
                </option>
              ))}
            </select>
            <p css={hintCss}>
              The design&apos;s own preview comes with it. Templates hold a single
              page, so a multi-page design publishes its first.
            </p>
          </>
        ) : (
          <>
            <textarea
              css={{ ...inputCss, marginTop: 10, minHeight: 96, resize: 'vertical' }}
              value={json}
              onChange={(event) => setJson(event.target.value)}
              placeholder='Paste a design export — {"pages": […]} or a single page'
              aria-label="Design JSON"
            />
            <div css={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <label
                css={{
                  ...pillCss(false, false),
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                Choose a .json file
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={pickFile}
                  css={{ display: 'none' }}
                />
              </label>
              {fileName && (
                <span css={{ fontSize: 12, color: 'var(--app-text-muted)' }}>
                  Loaded {fileName}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <div css={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
        <div>
          <label css={labelCss} htmlFor="template-name">
            Name
          </label>
          <input
            id="template-name"
            css={inputCss}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Autumn campaign"
          />
        </div>
        <div>
          <label css={labelCss} htmlFor="template-id">
            Id
          </label>
          <input
            id="template-id"
            css={inputCss}
            value={effectiveId}
            onChange={(event) => {
              setIdEdited(true);
              setId(event.target.value);
            }}
            placeholder="autumn-campaign"
          />
        </div>
      </div>

      <div>
        <span css={labelCss}>Preview image (optional)</span>
        <input
          css={inputCss}
          value={img}
          onChange={(event) => setImg(event.target.value)}
          placeholder="https://… or assets/templates/hero.png"
          aria-label="Preview image"
        />
        <p css={hintCss}>
          A full URL is used as-is; a relative path is copied out of the API&apos;s
          public folder. Publishing a design brings its preview along already.
        </p>
      </div>

      <div>
        <span css={labelCss}>Who can use it</span>
        <div css={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label css={choiceCss}>
            <input
              type="radio"
              name="visibility"
              checked={visibility === 'everyone'}
              onChange={() => setVisibility('everyone')}
            />
            <span>
              <strong>Everyone</strong>
              <em css={emCss}>Every company, including ones added later.</em>
            </span>
          </label>

          <label css={choiceCss}>
            <input
              type="radio"
              name="visibility"
              checked={visibility === 'some'}
              onChange={() => setVisibility('some')}
            />
            <span>
              <strong>Only some companies</strong>
              <em css={emCss}>
                One shared template, limited to the companies you tick — anyone else
                loses access to it.
              </em>
            </span>
          </label>

          {visibility === 'some' && (
            <div
              css={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                padding: '4px 0 0 26px',
              }}
            >
              {tenants.length === 0 && (
                <span css={{ fontSize: 12, color: 'var(--app-text-muted)' }}>
                  No companies yet — add one on the Companies tab.
                </span>
              )}
              {tenants.map((tenant) => (
                <button
                  key={tenant.id}
                  type="button"
                  onClick={() => toggleGrantTenant(tenant.id)}
                  css={pillCss(grantTenants.includes(tenant.id), false)}
                >
                  {tenant.name}
                </button>
              ))}
            </div>
          )}

          <label css={choiceCss}>
            <input
              type="radio"
              name="visibility"
              checked={visibility === 'copy'}
              onChange={() => setVisibility('copy')}
            />
            <span>
              <strong>One company, its own copy</strong>
              <em css={emCss}>
                A private template in that company&apos;s workspace. Editing it later
                cannot affect anyone else.
              </em>
            </span>
          </label>

          {visibility === 'copy' && (
            <select
              css={{ ...inputCss, marginLeft: 26, width: 'calc(100% - 26px)' }}
              value={copyTenant}
              onChange={(event) => setCopyTenant(event.target.value)}
              aria-label="Company for the copy"
            >
              <option value="">Choose a company…</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <label css={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <input
          type="checkbox"
          checked={overwrite}
          onChange={(event) => setOverwrite(event.target.checked)}
        />
        Replace an existing template with this id
      </label>

      {note && (
        <p css={{ margin: 0, fontSize: 13, color: 'var(--app-text-muted)' }}>{note}</p>
      )}
      {error && (
        <p css={{ margin: 0, fontSize: 13, color: '#ff8f8f' }} role="alert">
          {error}
        </p>
      )}

      <div css={{ display: 'flex', gap: 10 }}>
        <button
          type="submit"
          disabled={busy}
          css={{
            border: 'none',
            borderRadius: 8,
            padding: '10px 16px',
            fontWeight: 800,
            fontSize: 13,
            color: '#fff',
            background: 'var(--app-brand-gradient)',
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? 'Publishing…' : 'Publish template'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          css={{
            border: '1px solid var(--app-border)',
            borderRadius: 8,
            padding: '10px 16px',
            fontWeight: 700,
            fontSize: 13,
            background: 'transparent',
            color: 'var(--app-text)',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

const emCss = {
  display: 'block',
  fontSize: 12,
  fontStyle: 'normal',
  color: 'var(--app-text-muted)',
  marginTop: 2,
};

const choiceCss = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  fontSize: 13,
  cursor: 'pointer',
  color: 'var(--app-text-strong)',
};

const pillCss = (active: boolean, disabled: boolean) => ({
  border: `1px solid ${active ? 'var(--app-brand-magenta)' : 'var(--app-border)'}`,
  background: active ? 'rgba(176,14,84,.12)' : 'var(--app-surface)',
  color: active ? 'var(--app-text-strong)' : 'var(--app-text)',
  borderRadius: 999,
  padding: '7px 12px',
  fontSize: 13,
  fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.55 : 1,
});
