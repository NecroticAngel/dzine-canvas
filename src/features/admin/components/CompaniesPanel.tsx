import { useState, type FormEvent } from 'react';
import { apiError, createTenant, slugify, type TenantSummary } from '../api';

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

/**
 * The workspaces a template can be shared with.
 *
 * One field, not two: the id is what the API keys on and the name is what the
 * admin reads, but asking for both by hand invites a mismatch. The id is derived
 * from the name and can be corrected before saving.
 */
export const CompaniesPanel = ({
  tenants,
  onCreated,
}: {
  tenants: TenantSummary[];
  onCreated: () => void | Promise<void>;
}) => {
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [idEdited, setIdEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveId = idEdited ? id : slugify(name);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createTenant({
        id: effectiveId || slugify(name) || 'company',
        name: name.trim(),
      });
      setName('');
      setId('');
      setIdEdited(false);
      await onCreated();
    } catch (problem) {
      setError(apiError(problem, 'Could not create that company.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div css={{ display: 'grid', gap: 20, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 320px)' }}>
      <section
        css={{
          border: '1px solid var(--app-border)',
          borderRadius: 12,
          background: 'var(--app-panel)',
          overflow: 'hidden',
        }}
      >
        <header
          css={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--app-border)',
            fontWeight: 800,
            color: 'var(--app-text-strong)',
          }}
        >
          {tenants.length} {tenants.length === 1 ? 'company' : 'companies'}
        </header>
        {tenants.length === 0 ? (
          <p css={{ margin: 0, padding: 16, color: 'var(--app-text-muted)' }}>
            No companies yet. Add one to share a template with it.
          </p>
        ) : (
          <ul css={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {tenants.map((tenant) => (
              <li
                key={tenant.id}
                css={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                  padding: '10px 16px',
                  borderTop: '1px solid var(--app-border)',
                }}
              >
                <span css={{ fontWeight: 700, color: 'var(--app-text-strong)' }}>
                  {tenant.name}
                </span>
                <code
                  css={{
                    fontSize: 12,
                    color: 'var(--app-text-muted)',
                    background: 'var(--app-surface)',
                    padding: '2px 6px',
                    borderRadius: 6,
                  }}
                >
                  {tenant.id}
                </code>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form
        onSubmit={submit}
        css={{
          alignSelf: 'start',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: 16,
          border: '1px solid var(--app-border)',
          borderRadius: 12,
          background: 'var(--app-panel)',
        }}
      >
        <strong css={{ color: 'var(--app-text-strong)' }}>Add a company</strong>
        <div>
          <label css={labelCss} htmlFor="company-name">
            Name
          </label>
          <input
            id="company-name"
            css={inputCss}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Northwind Studio"
          />
        </div>
        <div>
          <label css={labelCss} htmlFor="company-id">
            Id
          </label>
          <input
            id="company-id"
            css={inputCss}
            value={effectiveId}
            onChange={(event) => {
              setIdEdited(true);
              setId(event.target.value);
            }}
            placeholder="northwind-studio"
          />
          <p css={{ margin: '6px 0 0', fontSize: 12, color: 'var(--app-text-muted)' }}>
            Used in the API and in filenames. Taken from the name unless you change it.
          </p>
        </div>
        {error && (
          <p css={{ margin: 0, fontSize: 13, color: '#ff8f8f' }} role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !name.trim()}
          css={{
            border: 'none',
            borderRadius: 8,
            padding: '10px 14px',
            fontWeight: 800,
            fontSize: 13,
            color: '#fff',
            background: 'var(--app-brand-gradient)',
            cursor: busy || !name.trim() ? 'not-allowed' : 'pointer',
            opacity: busy || !name.trim() ? 0.6 : 1,
          }}
        >
          {busy ? 'Adding…' : 'Add company'}
        </button>
      </form>
    </div>
  );
};
