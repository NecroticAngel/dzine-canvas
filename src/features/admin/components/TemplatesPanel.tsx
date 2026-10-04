import { useState } from 'react';
import {
  apiError,
  deleteTemplate,
  grantTemplate,
  revokeTemplateGrant,
  type AdminTemplate,
  type DesignSummary,
  type TenantSummary,
} from '../api';
import { PublishTemplateForm } from './PublishTemplateForm';

const nameOf = (tenants: TenantSummary[], id: string) =>
  tenants.find((tenant) => tenant.id === id)?.name ?? id;

/**
 * Templates and who can see them.
 *
 * The sharing model is the part worth stating plainly, because it is not the
 * obvious one: a shared template is visible to everyone *until it has a grant*,
 * and each grant narrows it. So "share with Acme" is really "only Acme", and
 * the copy says as much rather than letting an admin hide a template by accident.
 */
export const TemplatesPanel = ({
  templates,
  tenants,
  designs,
  onChanged,
}: {
  templates: AdminTemplate[];
  tenants: TenantSummary[];
  designs: DesignSummary[];
  onChanged: () => void | Promise<void>;
}) => {
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (problem) {
      setError(apiError(problem, 'That change did not go through.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div css={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div css={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <strong css={{ color: 'var(--app-text-strong)', fontSize: 15 }}>
          {templates.length} {templates.length === 1 ? 'template' : 'templates'}
        </strong>
        <button
          type="button"
          onClick={() => setShowForm((value) => !value)}
          css={{
            marginLeft: 'auto',
            border: 'none',
            borderRadius: 8,
            padding: '10px 16px',
            fontWeight: 800,
            fontSize: 13,
            color: '#fff',
            background: 'var(--app-brand-gradient)',
            cursor: 'pointer',
          }}
        >
          {showForm ? 'Close' : 'New template'}
        </button>
      </div>

      {error && (
        <p css={{ margin: 0, fontSize: 13, color: '#ff8f8f' }} role="alert">
          {error}
        </p>
      )}

      {showForm && (
        <PublishTemplateForm
          designs={designs}
          tenants={tenants}
          onDone={async () => {
            setShowForm(false);
            await onChanged();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {templates.length === 0 && (
        <p css={{ margin: 0, color: 'var(--app-text-muted)' }}>
          No templates yet. Publish one to get started.
        </p>
      )}

      <div
        css={{
          display: 'grid',
          gap: 14,
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        }}
      >
        {templates.map((template) => {
          const restricted = template.scope === 'global' && template.grants.length > 0;
          return (
            <article
              key={template.id}
              css={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                border: '1px solid var(--app-border)',
                borderRadius: 12,
                background: 'var(--app-panel)',
                padding: 14,
              }}
            >
              <div css={{ display: 'flex', gap: 12 }}>
                <div
                  css={{
                    position: 'relative',
                    width: 92,
                    height: 62,
                    flexShrink: 0,
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: 'var(--app-surface)',
                    border: '1px solid var(--app-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 800,
                    color: 'var(--app-text-muted)',
                    letterSpacing: '0.04em',
                  }}
                >
                  {/*
                    The tile goes underneath rather than in an else, so a preview
                    whose file has gone leaves this instead of an empty box.
                  */}
                  NO PREVIEW
                  {template.thumbUrl && (
                    <img
                      alt={`${template.name} preview`}
                      src={template.thumbUrl}
                      css={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        background: '#fff',
                      }}
                      onError={(event) => {
                        event.currentTarget.style.display = 'none';
                      }}
                    />
                  )}
                </div>
                <div css={{ minWidth: 0 }}>
                  <div
                    css={{
                      fontWeight: 800,
                      color: 'var(--app-text-strong)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {template.name}
                  </div>
                  <code
                    css={{ fontSize: 12, color: 'var(--app-text-muted)' }}
                  >
                    {template.id}
                  </code>
                  <div
                    css={{
                      marginTop: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      color: restricted ? 'var(--app-brand-orange)' : 'var(--app-guide)',
                    }}
                  >
                    {template.scope === 'tenant'
                      ? `Private to ${nameOf(tenants, template.tenantId)}`
                      : restricted
                        ? `Only ${template.grants.length} ${
                            template.grants.length === 1 ? 'company' : 'companies'
                          }`
                        : 'Everyone'}
                  </div>
                </div>
              </div>

              {template.scope === 'global' && (
                <div css={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {template.grants.length > 0 && (
                    <div css={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {template.grants.map((grant) => {
                        const label = grant.tenantName ?? nameOf(tenants, grant.tenantId);
                        return (
                          <span
                            key={grant.tenantId}
                            css={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              borderRadius: 999,
                              padding: '4px 6px 4px 10px',
                              fontSize: 12,
                              fontWeight: 700,
                              background: 'rgba(176,14,84,.12)',
                              border: '1px solid var(--app-brand-magenta)',
                              color: 'var(--app-text-strong)',
                            }}
                          >
                            {label}
                            <button
                              type="button"
                              aria-label={`Stop sharing with ${label}`}
                              disabled={busy === `${template.id}:${grant.tenantId}`}
                              onClick={() =>
                                run(`${template.id}:${grant.tenantId}`, () =>
                                  revokeTemplateGrant(template.id, grant.tenantId),
                                )
                              }
                              css={{
                                border: 'none',
                                background: 'transparent',
                                color: 'inherit',
                                cursor: 'pointer',
                                fontSize: 13,
                                lineHeight: 1,
                                padding: 2,
                              }}
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <div css={{ display: 'flex', gap: 8 }}>
                    <select
                      css={{
                        flex: 1,
                        minWidth: 0,
                        padding: '7px 9px',
                        borderRadius: 8,
                        border: '1px solid var(--app-border)',
                        background: 'var(--app-surface)',
                        color: 'var(--app-text-strong)',
                        fontSize: 12,
                        fontFamily: 'inherit',
                      }}
                      value=""
                      disabled={busy === `${template.id}:add`}
                      aria-label={`Share ${template.name} with a company`}
                      onChange={(event) => {
                        const tenantId = event.target.value;
                        if (!tenantId) return;
                        void run(`${template.id}:add`, () =>
                          grantTemplate(template.id, tenantId),
                        );
                      }}
                    >
                      <option value="">
                        {template.grants.length ? 'Add another company…' : 'Limit to a company…'}
                      </option>
                      {tenants
                        .filter(
                          (tenant) =>
                            !template.grants.some((grant) => grant.tenantId === tenant.id),
                        )
                        .map((tenant) => (
                          <option key={tenant.id} value={tenant.id}>
                            {tenant.name}
                          </option>
                        ))}
                    </select>
                    {template.grants.length > 0 && (
                      <button
                        type="button"
                        disabled={busy === `${template.id}:all`}
                        onClick={() =>
                          void run(`${template.id}:all`, async () => {
                            for (const grant of template.grants) {
                              await revokeTemplateGrant(template.id, grant.tenantId);
                            }
                          })
                        }
                        css={{
                          border: '1px solid var(--app-border)',
                          background: 'transparent',
                          color: 'var(--app-text)',
                          borderRadius: 8,
                          padding: '7px 10px',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Everyone
                      </button>
                    )}
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={busy === `${template.id}:delete`}
                onClick={() => {
                  if (!window.confirm(`Delete the template “${template.name}”?`)) return;
                  void run(`${template.id}:delete`, () => deleteTemplate(template.id));
                }}
                css={{
                  alignSelf: 'flex-start',
                  border: 'none',
                  background: 'transparent',
                  color: '#ff8f8f',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Delete
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
};
