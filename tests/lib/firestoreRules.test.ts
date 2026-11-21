import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CivicIssueSchema } from '../../shared/schemas/issue.js';
import { MAX_ISSUES_LIMIT, WEBP_DATA_URL_PREFIX } from '../../shared/types/civic.js';

describe('Spark Plan Firestore Rules, Indexes & Config Compliance', () => {
  const rulesText = readFileSync('firestore.rules', 'utf8');
  const indexesRaw = readFileSync('firestore.indexes.json', 'utf8');
  const firebaseJsonRaw = readFileSync('firebase.json', 'utf8');
  const packageJsonRaw = readFileSync('package.json', 'utf8');

  it('contains zero Blaze-only packages or storage/functions configuration', () => {
    const pkg = JSON.parse(packageJsonRaw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDepNames = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];
    expect(allDepNames).not.toContain('firebase-functions');
    expect(allDepNames).not.toContain('firebase-admin');
    expect(allDepNames).not.toContain('@firebase/storage');

    const firebaseConfig = JSON.parse(firebaseJsonRaw) as Record<string, unknown>;
    expect(firebaseConfig.storage).toBeUndefined();
    expect(firebaseConfig.functions).toBeUndefined();
    expect(firebaseConfig.firestore).toEqual({
      rules: 'firestore.rules',
      indexes: 'firestore.indexes.json',
    });

    expect(rulesText).not.toContain('firebase.storage');
    expect(rulesText).not.toContain('allow read: if true');
    expect(rulesText).not.toContain('allow write: if true');
  });

  it('uses rules_version 2, cloud.firestore, and default deny fallback', () => {
    expect(rulesText).toContain("rules_version = '2';");
    expect(rulesText).toContain('service cloud.firestore');
    expect(rulesText).toMatch(
      /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/,
    );
  });

  it('splits get and list on issues and enforces limit <= 50 only on list', () => {
    const issuesBlockMatch = rulesText.match(
      /match \/issues\/\{issueId\}\s*\{[\s\S]*?\n\s{4}\}/,
    );
    expect(issuesBlockMatch).not.toBeNull();
    const issuesBlock = issuesBlockMatch?.[0] ?? '';

    expect(issuesBlock).toContain('allow get: if isAuthenticated();');
    expect(issuesBlock).toContain('allow list: if isAuthenticated()');
    expect(issuesBlock).toContain('request.query.limit != null');
    expect(issuesBlock).toContain('request.query.limit >= 1');
    expect(issuesBlock).toContain(`request.query.limit <= ${MAX_ISSUES_LIMIT}`);
    expect(issuesBlock).not.toMatch(/allow read:/);
    expect(issuesBlock).toContain('allow delete: if false;');
  });

  it('aligns all 22 CivicIssueSchema fields 1:1 and excludes all PII fields', () => {
    const schemaKeys = Object.keys(CivicIssueSchema.shape).sort();
    expect(schemaKeys).toHaveLength(22);

    const fnMatch = rulesText.match(
      /function isValidIssueSchema\(data\)\s*\{\s*return hasExactKeys\(data,\s*\[([\s\S]*?)\]\)/,
    );
    expect(fnMatch).not.toBeNull();
    const rawList = fnMatch?.[1] ?? '';
    const ruleKeys = [...rawList.matchAll(/'([a-zA-Z0-9_]+)'/g)]
      .map((m) => m[1] ?? '')
      .sort();

    expect(ruleKeys).toEqual(schemaKeys);
    expect(ruleKeys).not.toContain('email');
    expect(ruleKeys).not.toContain('phone');
    expect(ruleKeys).not.toContain('ipAddress');
  });

  it('enforces RE2-safe WebP data URI pattern and 165000 char ceiling', () => {
    expect(rulesText).toContain('value.size() >= 27');
    expect(rulesText).toContain('value.size() <= 165000');
    expect(rulesText).toContain(
      "value.matches('^data:image/webp;base64,[A-Za-z0-9+/]+={0,2}$')",
    );

    const webpRegex = /^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/;
    expect(webpRegex.test(`${WEBP_DATA_URL_PREFIX}UklGRg==`)).toBe(true);
    expect(webpRegex.test('data:image/png;base64,iVBORw0KGgo=')).toBe(false);
    expect(webpRegex.test('https://example.com/pothole.webp')).toBe(false);
    expect(webpRegex.test('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
  });

  it('enforces atomic getAfter() upvote protection, admins ACL, and status transitions', () => {
    expect(rulesText).toContain('!exists(votePath)');
    expect(rulesText).toContain('getAfter(votePath) != null');
    expect(rulesText).toContain('request.resource.data.upvoteCount == resource.data.upvoteCount + 1');

    expect(rulesText).toContain('match /issue_votes/{voteId}');
    expect(rulesText).toContain('allow list: if false;');
    expect(rulesText).toContain('allow update, delete: if false;');
    expect(rulesText).toContain('existsAfter(/databases/$(database)/documents/issues/$(data.issueId))');

    expect(rulesText).toContain('match /admins/{uid}');
    expect(rulesText).toContain('allow get: if isOwner(uid);');
    expect(rulesText).toContain('allow list, write: if false;');

    expect(rulesText).toContain('function getAdminDepartment()');
    expect(rulesText).toContain('function isAuthorizedAdminDepartment(');
    expect(rulesText).toContain('function isAuthorizedAdminListScope()');
    expect(rulesText).toMatch(
      /isAuthorizedAdminDepartment\(\s*resource\.data\.assignedDepartment,\s*request\.resource\.data\.assignedDepartment\s*\)/,
    );

    expect(rulesText).toContain(
      "prevStatus == 'Reported' && nextStatus in ['Reported', 'In Progress', 'Resolved']",
    );
    expect(rulesText).toContain(
      "prevStatus == 'In Progress' && nextStatus in ['In Progress', 'Resolved']",
    );
    expect(rulesText).toContain(
      "prevStatus == 'Resolved' && nextStatus == 'Resolved'",
    );
    expect(rulesText).toContain('next.resolvedAt == request.time');
  });

  it('defines valid Firestore composite indexes for IssueFilterOptions and admin queue', () => {
    const parsed = JSON.parse(indexesRaw) as {
      indexes: Array<{
        collectionGroup: string;
        queryScope: string;
        fields: Array<{ fieldPath: string; order: string }>;
      }>;
      fieldOverrides: unknown[];
    };

    expect(Array.isArray(parsed.indexes)).toBe(true);
    expect(parsed.indexes.length).toBeGreaterThanOrEqual(5);
    expect(parsed.fieldOverrides).toEqual([]);

    const signatures = parsed.indexes.map((idx) => {
      expect(idx.collectionGroup).toBe('issues');
      expect(idx.queryScope).toBe('COLLECTION');
      return idx.fields.map((f) => `${f.fieldPath}:${f.order}`).join('|');
    });

    expect(signatures).toContain('assignedDepartment:ASCENDING|createdAt:DESCENDING');
    expect(signatures).toContain('status:ASCENDING|createdAt:DESCENDING');
    expect(signatures).toContain(
      'assignedDepartment:ASCENDING|status:ASCENDING|createdAt:DESCENDING',
    );
    expect(signatures).toContain(
      'status:ASCENDING|priorityLevel:DESCENDING|createdAt:DESCENDING',
    );
    expect(signatures).toContain(
      'status:ASCENDING|urgencyScore:DESCENDING|createdAt:DESCENDING',
    );
  });
});
