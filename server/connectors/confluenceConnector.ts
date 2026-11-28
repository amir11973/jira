import crypto from 'node:crypto';
import type { AuthMethod } from '../httpClient.ts';
import { buildAuthHeaders, safeExternalFetch } from '../httpClient.ts';
import type { StoredConnectionRecord } from '../store.ts';
import type { DetectedColumnType } from './jiraConnector.ts';

export type DocStructuredBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'code'; language?: string; code: string }
  | { type: 'quote'; text: string }
  | { type: 'image'; alt: string; url: string }
  | { type: 'macro_warning'; macroName: string; fallbackText: string };

function decodeEntities(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripTags(raw: string): string {
  return decodeEntities(raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

export function parseConfluenceXhtml(html: string): {
  markdown: string;
  structuredBlocks: DocStructuredBlock[];
  conversionWarnings: string[];
} {
  if (!html) {
    return { markdown: '', structuredBlocks: [], conversionWarnings: [] };
  }

  const structuredBlocks: DocStructuredBlock[] = [];
  const conversionWarnings: string[] = [];

  // 1. Detect unsupported/complex Confluence macros first and preserve safely
  let sanitized = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  sanitized = sanitized.replace(
    /<ac:structured-macro[^>]*ac:name="([^"]+)"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
    (_m, macroName: string, inner: string) => {
      const cleanName = String(macroName || 'macro').trim();
      if (cleanName.toLowerCase() === 'code') {
        const bodyMatch = /<ac:plain-text-body><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>/i.exec(inner);
        const codeText = bodyMatch ? bodyMatch[1] : stripTags(inner);
        structuredBlocks.push({ type: 'code', code: codeText });
        return `\n\`\`\`\n${codeText}\n\`\`\`\n`;
      }
      const fallback = stripTags(inner);
      conversionWarnings.push(`Macro "${cleanName}" converted to safe plain-text fallback.`);
      structuredBlocks.push({
        type: 'macro_warning',
        macroName: cleanName,
        fallbackText: fallback || `[${cleanName}]`,
      });
      return `\n> [${cleanName}] ${fallback}\n`;
    }
  );

  // 2. Extract images (ac:image / img)
  sanitized = sanitized.replace(
    /<ac:image[^>]*>[\s\S]*?<ri:attachment[^>]*ri:filename="([^"]+)"[^>]*\/?>[\s\S]*?<\/ac:image>/gi,
    (_m, filename: string) => {
      structuredBlocks.push({ type: 'image', alt: filename, url: `attachment://${filename}` });
      return `\n![${filename}](attachment://${filename})\n`;
    }
  );
  sanitized = sanitized.replace(
    /<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*\/?>/gi,
    (_m, src: string, alt: string) => {
      const safeSrc = /^(https?:|attachment:)/i.test(src) ? src : '';
      if (safeSrc) {
        structuredBlocks.push({ type: 'image', alt: alt || 'image', url: safeSrc });
        return `\n![${alt || 'image'}](${safeSrc})\n`;
      }
      conversionWarnings.push('Unsafe or relative image source skipped during sanitization.');
      return '';
    }
  );

  // 3. Extract HTML tables cleanly
  sanitized = sanitized.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_m, tableHtml: string) => {
    const rows: string[][] = [];
    let headers: string[] = [];
    const trMatches = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    trMatches.forEach((tr, idx) => {
      const thMatches = tr.match(/<th[^>]*>([\s\S]*?)<\/th>/gi) || [];
      const tdMatches = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
      if (idx === 0 && thMatches.length > 0) {
        headers = thMatches.map(cell => stripTags(cell));
      } else {
        const cells = (tdMatches.length > 0 ? tdMatches : thMatches).map(c => stripTags(c));
        if (cells.length > 0) rows.push(cells);
      }
    });
    if (headers.length === 0 && rows.length > 0) {
      headers = rows.shift() || [];
    }
    if (headers.length > 0 || rows.length > 0) {
      structuredBlocks.push({ type: 'table', headers, rows });
      const mdHeader = `| ${headers.join(' | ')} |`;
      const mdSep = `| ${headers.map(() => '---').join(' | ')} |`;
      const mdRows = rows.map(r => `| ${r.join(' | ')} |`).join('\n');
      return `\n${mdHeader}\n${mdSep}\n${mdRows}\n`;
    }
    return '';
  });

  // 4. Headings, blockquotes, lists, paragraphs
  const headingOrBlockRegex = /<(h[1-6]|p|blockquote|ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = headingOrBlockRegex.exec(sanitized)) !== null) {
    const tag = match[1].toLowerCase();
    const inner = match[2];
    if (tag.startsWith('h')) {
      const level = Number(tag.slice(1)) || 2;
      const text = stripTags(inner);
      if (text) structuredBlocks.push({ type: 'heading', level, text });
    } else if (tag === 'blockquote') {
      const text = stripTags(inner);
      if (text) structuredBlocks.push({ type: 'quote', text });
    } else if (tag === 'ul' || tag === 'ol') {
      const items = (inner.match(/<li[^>]*>[\s\S]*?<\/li>/gi) || [])
        .map(li => stripTags(li))
        .filter(Boolean);
      if (items.length > 0) {
        structuredBlocks.push({ type: 'list', ordered: tag === 'ol', items });
      }
    } else {
      const text = stripTags(inner);
      if (text) structuredBlocks.push({ type: 'paragraph', text });
    }
  }

  // Convert remaining HTML to clean markdown
  const markdown = decodeEntities(
    sanitized
      .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, lvl, txt) => `\n${'#'.repeat(Number(lvl))} ${stripTags(txt)}\n`)
      .replace(/<\/(p|div|tr)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, txt) => `- ${stripTags(txt)}\n`)
      .replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, txt) => {
        const cleanHref = /^https?:/i.test(href) ? href : '#';
        return `[${stripTags(txt)}](${cleanHref})`;
      })
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (structuredBlocks.length === 0 && markdown) {
    structuredBlocks.push({ type: 'paragraph', text: markdown });
  }

  return {
    markdown,
    structuredBlocks,
    conversionWarnings: Array.from(new Set(conversionWarnings)),
  };
}

export async function connectConfluence(params: {
  serverUrl: string;
  authMethod: AuthMethod;
  email?: string;
  username?: string;
  secret: string;
}) {
  const { serverUrl, authMethod, email, username, secret } = params;
  const headers = buildAuthHeaders(authMethod, secret, email, username);

  let apiPrefix = '/wiki';
  let userRes = await safeExternalFetch(serverUrl, '/wiki/rest/api/user/current', headers);
  if (userRes.status === 404) {
    userRes = await safeExternalFetch(serverUrl, '/rest/api/user/current', headers);
    if (userRes.status !== 404) apiPrefix = '';
  }

  if (!userRes.ok) {
    const status = userRes.status === 401 || userRes.status === 403 ? 401 : 502;
    return {
      ok: false as const,
      status,
      error:
        status === 401
          ? 'Confluence authentication failed. Verify your credentials and permissions.'
          : `Confluence server returned HTTP ${userRes.status}.`,
    };
  }

  const userObj = (userRes.data || {}) as {
    accountId?: string;
    userKey?: string;
    username?: string;
    displayName?: string;
    email?: string;
  };

  const spacesList: Array<{ id: string; key: string; name: string; type?: string; description?: string }> = [];
  const v2Res = await safeExternalFetch(serverUrl, `${apiPrefix}/api/v2/spaces?limit=100`, headers).catch(() => null);

  if (v2Res?.ok && v2Res.data && typeof v2Res.data === 'object' && 'results' in v2Res.data) {
    const results = (v2Res.data as {
      results: Array<{
        id?: string;
        key?: string;
        name?: string;
        type?: string;
        description?: { plain?: { value?: string } };
      }>;
    }).results;
    for (const sp of results || []) {
      spacesList.push({
        id: String(sp.id || sp.key),
        key: String(sp.key || sp.id),
        name: String(sp.name || sp.key),
        type: sp.type || 'global',
        description: sp.description?.plain?.value || '',
      });
    }
  } else {
    const v1Res = await safeExternalFetch(serverUrl, `${apiPrefix}/rest/api/space?limit=100`, headers);
    if (v1Res.ok && v1Res.data && typeof v1Res.data === 'object' && 'results' in v1Res.data) {
      const results = (v1Res.data as {
        results: Array<{ id?: number; key?: string; name?: string; type?: string }>;
      }).results;
      for (const sp of results || []) {
        spacesList.push({
          id: String(sp.id || sp.key),
          key: String(sp.key),
          name: String(sp.name || sp.key),
          type: sp.type || 'global',
        });
      }
    }
  }

  return {
    ok: true as const,
    account: {
      accountId: String(userObj.accountId || userObj.userKey || userObj.username || 'conf-user'),
      displayName: String(userObj.displayName || userObj.username || email || 'Confluence User'),
      email: String(userObj.email || email || ''),
    },
    projectsOrSpaces: spacesList,
  };
}

export async function checkConfluenceHealth(conn: StoredConnectionRecord, secret: string) {
  const headers = buildAuthHeaders(conn.authMethod, secret, conn.email, conn.username);
  let res = await safeExternalFetch(conn.serverUrl, '/wiki/rest/api/user/current', headers).catch(() => null);
  if (!res || res.status === 404) {
    res = await safeExternalFetch(conn.serverUrl, '/rest/api/user/current', headers).catch(() => null);
  }
  if (!res) {
    return { healthStatus: 'unreachable' as const, healthMessage: 'Confluence host did not respond.' };
  }
  if (res.status === 401 || res.status === 403) {
    return { healthStatus: 'needs_reauth' as const, healthMessage: 'Confluence token/password rejected.' };
  }
  if (!res.ok) {
    return { healthStatus: 'degraded' as const, healthMessage: `Confluence returned HTTP ${res.status}.` };
  }
  return { healthStatus: 'healthy' as const, healthMessage: 'Confluence REST API reachable and authenticated.' };
}

export async function discoverConfluenceData(params: {
  conn: StoredConnectionRecord;
  secret: string;
  spaceKeys?: string[];
  maxResults?: number;
  updatedSince?: string;
}) {
  const { conn, secret, spaceKeys = [], maxResults = 150, updatedSince } = params;
  const headers = buildAuthHeaders(conn.authMethod, secret, conn.email, conn.username);
  const safeKeys = spaceKeys.map(k => String(k).replace(/[^A-Za-z0-9_~-]/g, '')).filter(Boolean);
  const totalCap = Math.min(400, Math.max(5, Number(maxResults || 150)));

  let apiPrefix = '/wiki';
  const probe = await safeExternalFetch(conn.serverUrl, '/wiki/rest/api/user/current', headers);
  if (probe.status === 404) apiPrefix = '';

  const targetSpaces = safeKeys.length > 0 ? safeKeys : conn.projectsOrSpaces.slice(0, 4).map(s => s.key);
  const pages: Array<{
    id: string;
    title: string;
    content: string;
    structuredBlocks: DocStructuredBlock[];
    conversionWarnings: string[];
    spaceKey: string;
    spaceName: string;
    status: string;
    author: string;
    createdAt: string;
    updatedAt: string;
    version: number;
    parentId?: string;
    ancestors: Array<{ id: string; title: string }>;
    sourceUrl: string;
    labels: string[];
    attachments: Array<{ id: string; name: string; size: string; mimeType: string }>;
    comments: Array<{ id: string; author: string; text: string; createdAt: string }>;
  }> = [];

  for (const sk of targetSpaces) {
    if (pages.length >= totalCap) break;

    for (let start = 0; start < totalCap; start += 50) {
      const limit = Math.min(50, totalCap - pages.length);
      if (limit <= 0) break;

      const expand = 'body.storage,version,history,space,ancestors,metadata.labels,children.attachment,children.comment.body.storage,children.comment.version';
      let pathUrl = `${apiPrefix}/rest/api/content?spaceKey=${encodeURIComponent(sk)}&type=page&start=${start}&limit=${limit}&expand=${expand}`;
      if (updatedSince) {
        const safeDate = updatedSince.replace('T', ' ').slice(0, 16);
        const cql = `space = "${sk}" AND type = page AND lastmodified >= "${safeDate}"`;
        pathUrl = `${apiPrefix}/rest/api/content/search?cql=${encodeURIComponent(cql)}&start=${start}&limit=${limit}&expand=${expand}`;
      }

      const contentRes = await safeExternalFetch(conn.serverUrl, pathUrl, headers);
      if (!contentRes.ok || !contentRes.data || typeof contentRes.data !== 'object') {
        // a failed listing must not look like an empty space (synced pages would be reported as removed)
        throw new Error(`Confluence page listing failed for space ${sk} (HTTP ${contentRes.status}).`);
      }

      const results = (contentRes.data as {
        results?: Array<{
          id?: string;
          title?: string;
          status?: string;
          space?: { key?: string; name?: string };
          history?: { createdDate?: string; createdBy?: { displayName?: string; email?: string } };
          version?: { number?: number; when?: string; by?: { displayName?: string; email?: string } };
          ancestors?: Array<{ id?: string; title?: string }>;
          _links?: { webui?: string };
          body?: { storage?: { value?: string } };
          metadata?: { labels?: { results?: Array<{ name?: string }> } };
          children?: {
            attachment?: {
              results?: Array<{
                id?: string;
                title?: string;
                extensions?: { mediaType?: string; fileSize?: number };
              }>;
            };
            comment?: {
              results?: Array<{
                id?: string;
                version?: { when?: string; by?: { displayName?: string } };
                body?: { storage?: { value?: string } };
              }>;
            };
          };
        }>;
      }).results;

      const batch = results || [];
      for (const item of batch) {
        const parsedBody = parseConfluenceXhtml(item.body?.storage?.value || '');
        const ancestors = (item.ancestors || [])
          .filter(a => a.id && a.title)
          .map(a => ({ id: String(a.id), title: String(a.title) }));
        const parentId = ancestors.length > 0 ? ancestors[ancestors.length - 1].id : undefined;

        const labels = (item.metadata?.labels?.results || []).map(l => l.name || '').filter(Boolean);
        const attachments = (item.children?.attachment?.results || []).map(a => ({
          id: String(a.id || crypto.randomUUID()),
          name: String(a.title || 'attachment'),
          size: a.extensions?.fileSize ? `${Math.max(1, Math.round(a.extensions.fileSize / 1024))} KB` : '16 KB',
          mimeType: a.extensions?.mediaType || 'application/octet-stream',
        }));
        const comments = (item.children?.comment?.results || []).slice(0, 15).map(c => ({
          id: String(c.id || crypto.randomUUID()),
          author: c.version?.by?.displayName || 'Confluence User',
          text: parseConfluenceXhtml(c.body?.storage?.value || '').markdown,
          createdAt: c.version?.when || new Date().toISOString(),
        }));

        const webui = item._links?.webui || `/spaces/${sk}/pages/${item.id}`;
        const sourceUrl = `${conn.serverUrl}${apiPrefix}${webui.startsWith('/') ? webui : `/${webui}`}`;

        pages.push({
          id: String(item.id || crypto.randomUUID()),
          title: String(item.title || 'Untitled Page'),
          content: parsedBody.markdown,
          structuredBlocks: parsedBody.structuredBlocks,
          conversionWarnings: parsedBody.conversionWarnings,
          spaceKey: item.space?.key || sk,
          spaceName: item.space?.name || sk,
          status: item.status || 'current',
          author:
            item.version?.by?.email ||
            item.version?.by?.displayName ||
            item.history?.createdBy?.displayName ||
            conn.account.displayName,
          createdAt: item.history?.createdDate || item.version?.when || new Date().toISOString(),
          updatedAt: item.version?.when || new Date().toISOString(),
          version: Number(item.version?.number || 1),
          parentId,
          ancestors,
          sourceUrl,
          labels,
          attachments,
          comments,
        });
      }

      if (batch.length < limit) break;
    }
  }

  const sourceFields: Array<{ key: string; label: string; type: DetectedColumnType }> = [
    { key: 'title', label: 'Page Title', type: 'text' },
    { key: 'content', label: 'Body Content (Structured XHTML)', type: 'text' },
    { key: 'spaceKey', label: 'Space Key', type: 'text' },
    { key: 'spaceName', label: 'Space Name', type: 'text' },
    { key: 'author', label: 'Author', type: 'email' },
    { key: 'createdAt', label: 'Created Date', type: 'date' },
    { key: 'updatedAt', label: 'Last Updated', type: 'date' },
    { key: 'version', label: 'Page Version', type: 'number' },
    { key: 'parentId', label: 'Parent Page ID', type: 'text' },
    { key: 'status', label: 'Page Status', type: 'status' },
    { key: 'labels', label: 'Labels', type: 'list' },
    { key: 'sourceUrl', label: 'Source URL', type: 'text' },
  ];

  return {
    sourceFields,
    distinctStatuses: Array.from(new Set(pages.map(p => p.status).filter(Boolean))),
    spaces: conn.projectsOrSpaces.filter(s => safeKeys.length === 0 || safeKeys.includes(s.key)),
    pages,
    totalCount: pages.length,
  };
}
