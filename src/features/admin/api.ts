import axios from 'axios';

/**
 * Typed wrappers around the admin endpoints that already exist on the API.
 *
 * The app sets a 2.5s axios timeout, which is right for reads but too tight for
 * the writes here: publishing a template writes a payload and copies a preview
 * file, and granting walks a table. Those ask for longer.
 */
const WRITE = { timeout: 30000 };
const READ = { timeout: 10000 };

export type TemplateScope = 'global' | 'tenant';

/**
 * A narrowing share. The API joins the tenant in, so the name comes with it.
 */
export type TemplateGrant = {
  tenantId: string;
  tenantName?: string;
  grantedAt?: number;
};

export type AdminTemplate = {
  id: string;
  name: string;
  scope: TemplateScope;
  /** The owning workspace. Meaningful for `tenant` scope; a global row still has one. */
  tenantId: string;
  thumbUrl: string | null;
  /**
   * Workspaces a *global* template is limited to. Empty means everyone — a grant
   * narrows a shared template rather than adding to a list of invitees.
   */
  grants: TemplateGrant[];
};

export type TenantSummary = { id: string; name: string; createdAt?: number };

export type DesignSummary = {
  id: string;
  name: string;
  updatedAt?: number;
  thumbUrl?: string | null;
};

const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

export const listAdminTemplates = async (): Promise<AdminTemplate[]> => {
  const response = await axios.get<AdminTemplate[]>('/admin/templates', READ);
  return asArray<AdminTemplate>(response.data);
};

export const listTenants = async (): Promise<TenantSummary[]> => {
  const response = await axios.get<TenantSummary[]>('/admin/tenants', READ);
  return asArray<TenantSummary>(response.data);
};

export const listDesigns = async (): Promise<DesignSummary[]> => {
  const response = await axios.get<DesignSummary[]>('/designs', READ);
  return asArray<DesignSummary>(response.data);
};

export const createTenant = async (input: {
  id: string;
  name: string;
}): Promise<TenantSummary> => {
  const response = await axios.post<TenantSummary>('/admin/tenants', input, WRITE);
  return response.data;
};

export type PublishInput = {
  id?: string;
  name: string;
  /** Optional thumbnail the server can adopt as the template's preview. */
  img?: string;
  scope: TemplateScope;
  /** Required when publishing a private copy into one workspace. */
  tenantId?: string;
  overwrite?: boolean;
  /** Publish one of the caller's own designs… */
  sourceDesignId?: string;
  /** …or hand over the page itself. Exactly one of the two. */
  elements?: unknown;
};

export const publishTemplate = async (
  input: PublishInput,
): Promise<{ id: string; name: string; scope: TemplateScope }> => {
  const response = await axios.post<{
    id: string;
    name: string;
    scope: TemplateScope;
  }>('/templates', input, WRITE);
  return response.data;
};

export const grantTemplate = async (
  templateId: string,
  tenantId: string,
): Promise<TemplateGrant[]> => {
  const response = await axios.post<{ grants: TemplateGrant[] }>(
    '/admin/template-grants',
    { templateId, tenantId },
    WRITE,
  );
  return asArray<TemplateGrant>(response.data?.grants);
};

export const revokeTemplateGrant = async (
  templateId: string,
  tenantId: string,
): Promise<void> => {
  await axios.delete(
    `/admin/template-grants/${encodeURIComponent(templateId)}/${encodeURIComponent(tenantId)}`,
    WRITE,
  );
};

export const deleteTemplate = async (templateId: string): Promise<void> => {
  await axios.delete(`/templates/${encodeURIComponent(templateId)}`, WRITE);
};

/** What the API says went wrong, when it says anything at all. */
export const apiError = (error: unknown, fallback: string): string => {
  const data = (error as { response?: { data?: { error?: unknown } } })?.response?.data;
  return typeof data?.error === 'string' && data.error.trim() ? data.error : fallback;
};

/**
 * Ids end up in URLs and filenames. The server liberalises anything it is given
 * (`safeId`), so this only has to produce something predictable and readable.
 */
export const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^\w.-]+/g, '-')
    .replace(/^[-.]+|-+$/g, '')
    .slice(0, 60);
