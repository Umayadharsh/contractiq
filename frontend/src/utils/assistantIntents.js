/**
 * Deterministic rule-based intent matcher for ContractIQ Portfolio Assistant.
 * Computes answers ONLY from already-fetched data (stats & contracts).
 * No LLM calls, no API keys, no external guessing.
 */

/**
 * Helper to extract remaining days until renewal for a contract.
 * Returns diffDays if contract expires within 30 days and > 0, otherwise null.
 */
export function getDaysUntilRenewal(contract) {
  if (!contract) return null;
  const endDateRaw =
    contract.extractedFields?.endDate ||
    contract.extractedFields?.['End Date'] ||
    contract.extractedFields?.expirationDate;

  if (!endDateRaw) return null;
  const endDateStr = typeof endDateRaw === 'object' ? (endDateRaw.value || endDateRaw.text) : endDateRaw;
  if (typeof endDateStr !== 'string') return null;

  const match = endDateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;

  const now = new Date();
  const targetUtc = Date.UTC(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((targetUtc - todayUtc) / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * Helper to check if a contract has critical or major risk.
 */
export function hasCriticalOrMajorRisk(contract) {
  if (!contract) return false;
  const status = contract.complianceReport?.overallStatus?.toLowerCase();
  return status === 'critical' || status === 'major';
}

/**
 * Standard suggestion chips.
 */
export const ASSISTANT_SUGGESTION_CHIPS = [
  'How many critical contracts?',
  'Contracts renewing soon',
  'Pending approvals',
  'Summary',
  'Total contracts',
  'Approved vs rejected',
];

/**
 * Process a user question deterministically against portfolio data.
 *
 * @param {string} userQuery
 * @param {Object} context
 * @param {Array} context.contracts - Currently loaded contracts for this role
 * @param {Object|null} context.stats - Portfolio stats from GET /api/contracts/stats
 * @param {string|null} context.statsError - Error message if stats returned 401/403/etc.
 * @param {Object|null} context.session - Active user session (role, email, etc.)
 * @returns {Object} { text, contracts: [], source, isError }
 */
export function processAssistantQuery(userQuery, { contracts = [], stats = null, statsError = null, session = null } = {}) {
  const query = (userQuery || '').trim().toLowerCase();
  const role = session?.user?.role || 'Viewer';

  if (!query) {
    return {
      text: 'Please enter a question or click one of the suggested topics below.',
      source: 'Source: system capabilities',
    };
  }

  // Helper for permission denied response
  const permissionDenied = () => ({
    text: `You do not have access to that portfolio statistics data with your current role (${role}).`,
    source: 'Source: permission check',
    isError: true,
  });

  // -------------------------------------------------------------
  // Intent 7: Short portfolio summary
  // -------------------------------------------------------------
  if (
    query === 'summary' ||
    query.includes('portfolio summary') ||
    query.includes('summary of portfolio') ||
    query.includes('portfolio overview') ||
    query.includes('give me a summary') ||
    query.includes('brief summary') ||
    query.includes('overall summary')
  ) {
    if (statsError && (statsError.includes('403') || statsError.includes('401'))) return permissionDenied();

    if (stats?.summary && typeof stats.summary === 'string' && stats.summary.trim()) {
      return {
        text: stats.summary.trim(),
        source: 'Source: portfolio statistics',
      };
    }

    // Deterministic summary constructed from stats or contracts
    const totalCount = stats?.total ?? contracts.length;
    const approvedCount = stats?.approved ?? contracts.filter((c) => String(c.status).toLowerCase() === 'approved').length;
    const rejectedCount = stats?.rejected ?? contracts.filter((c) => String(c.status).toLowerCase() === 'rejected').length;
    const waitingAppr = stats?.waitingForApproval ?? contracts.filter((c) => String(c.status).toLowerCase() === 'waiting for approval').length;
    const waitingEval = stats?.waitingForEvaluation ?? contracts.filter((c) => ['waiting for evaluation', 'needsreview'].includes(String(c.status).toLowerCase())).length;
    const criticalCount = stats?.criticalMajorRisks ?? contracts.filter(hasCriticalOrMajorRisk).length;

    return {
      text: `Portfolio Overview:\n• Total contracts: ${totalCount}\n• Approved: ${approvedCount}\n• Rejected: ${rejectedCount}\n• Waiting for approval: ${waitingAppr}\n• Waiting for evaluation: ${waitingEval}\n• Critical or major risk: ${criticalCount} contract${criticalCount === 1 ? '' : 's'}`,
      source: 'Source: portfolio statistics',
    };
  }

  // -------------------------------------------------------------
  // Intent 5: Contracts approaching renewal (list them)
  // -------------------------------------------------------------
  if (
    query.includes('renew') ||
    query.includes('renewal') ||
    query.includes('renewing') ||
    query.includes('expir')
  ) {
    const renewing = [];
    contracts.forEach((c) => {
      const diffDays = getDaysUntilRenewal(c);
      if (diffDays !== null && diffDays <= 30 && diffDays > 0) {
        renewing.push({ contract: c, diffDays });
      }
    });

    renewing.sort((a, b) => a.diffDays - b.diffDays);

    if (renewing.length === 0) {
      return {
        text: 'There are currently no contracts approaching renewal within the next 30 days.',
        contracts: [],
        source: 'Source: contract documents',
      };
    }

    return {
      text: `The following ${renewing.length} contract${renewing.length === 1 ? ' is' : 's are'} approaching renewal within the next 30 days:`,
      contracts: renewing.map((item) => item.contract),
      source: 'Source: contract documents',
    };
  }

  // -------------------------------------------------------------
  // Intent 6: Contracts with a given status, or from a given counterparty (match by name)
  // Checked early to capture specific requests like "status approved" or "from Acme"
  // -------------------------------------------------------------
  // 6a: By Status (explicit keyword: status, or list/show requests for specific status)
  const knownStatuses = [
    { label: 'approved', key: 'approved' },
    { label: 'rejected', key: 'rejected' },
    { label: 'waiting for approval', key: 'waiting for approval' },
    { label: 'waiting for evaluation', key: 'waiting for evaluation' },
    { label: 'needs review', key: 'needsreview' },
    { label: 'needsreview', key: 'needsreview' },
    { label: 'failed', key: 'failed' },
    { label: 'uploaded', key: 'uploaded' },
    { label: 'processing', key: 'processing' },
    { label: 'reviewed', key: 'reviewed' },
  ];

  for (const item of knownStatuses) {
    const patternStatus = `status ${item.label}`;
    const patternStatusColon = `status: ${item.label}`;
    const patternStatusIs = `status is ${item.label}`;
    const patternStatusWord = `${item.label} status`;

    if (
      query.includes(patternStatus) ||
      query.includes(patternStatusColon) ||
      query.includes(patternStatusIs) ||
      query.includes(patternStatusWord) ||
      (query.startsWith('contracts with status') && query.includes(item.label))
    ) {
      const matching = contracts.filter((c) => {
        const s = String(c.status || '').toLowerCase();
        return s === item.key || s === item.label;
      });
      return {
        text: matching.length > 0
          ? `Found ${matching.length} contract${matching.length === 1 ? '' : 's'} with status "${item.label}":`
          : `No contracts found with status "${item.label}".`,
        contracts: matching,
        source: 'Source: contract documents',
      };
    }
  }

  // 6b: By Counterparty
  let targetCounterparty = null;

  const counterpartyPatterns = [
    /(?:from|counterparty|with|for|vendor|client)\s+([a-z0-9\s&._-]+)/i,
    /contracts?\s+(?:of|by)\s+([a-z0-9\s&._-]+)/i,
  ];

  for (const pattern of counterpartyPatterns) {
    const match = userQuery.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim();
      // Ignore generic keywords that belong to other intents
      if (!['all', 'any', 'my', 'the', 'each', 'every', 'renewal', 'renewals', 'status', 'approval', 'review', 'evaluation', 'critical', 'major', 'risk'].includes(candidate.toLowerCase())) {
        targetCounterparty = candidate;
        break;
      }
    }
  }

  // If no regex match, check if any contract's counterparty is directly contained in user query
  if (!targetCounterparty) {
    for (const c of contracts) {
      if (c.counterparty && c.counterparty.trim().length > 2) {
        if (query.includes(c.counterparty.trim().toLowerCase())) {
          targetCounterparty = c.counterparty.trim();
          break;
        }
      }
    }
  }

  if (targetCounterparty) {
    const targetLower = targetCounterparty.toLowerCase();
    const matching = contracts.filter((c) => (c.counterparty || '').toLowerCase().includes(targetLower));

    return {
      text: matching.length > 0
        ? `Found ${matching.length} contract${matching.length === 1 ? '' : 's'} for counterparty "${targetCounterparty}":`
        : `No contracts found for counterparty "${targetCounterparty}".`,
      contracts: matching,
      source: 'Source: contract documents',
    };
  }

  // -------------------------------------------------------------
  // Intent 1: Total number of contracts
  // -------------------------------------------------------------
  if (
    query === 'total' ||
    query === 'total contracts' ||
    query.includes('total number of contracts') ||
    query.includes('how many contracts') ||
    query.includes('total contracts count') ||
    query.includes('number of contracts') ||
    query.includes('count of contracts') ||
    query.includes('contracts count') ||
    query.includes('how many total')
  ) {
    if (statsError && (statsError.includes('403') || statsError.includes('401'))) return permissionDenied();

    if (stats && typeof stats.total === 'number') {
      const isSingular = stats.total === 1;
      return {
        text: `${isSingular ? 'There is 1 contract' : `There are ${stats.total} total contracts`} in the portfolio.`,
        source: 'Source: portfolio statistics',
      };
    }

    const count = contracts.length;
    return {
      text: `${count === 1 ? 'There is 1 loaded contract' : `There are ${count} loaded contracts`} visible in your workspace.`,
      source: 'Source: contract documents',
    };
  }

  // -------------------------------------------------------------
  // Intent 2: Critical / major / high-risk contracts
  // Note: criticalMajorRisks in stats counts CONTRACTS whose overallStatus
  // is critical or major, NOT individual risk findings.
  // -------------------------------------------------------------
  if (
    query.includes('critical') ||
    query.includes('major risk') ||
    query.includes('major risks') ||
    query.includes('high risk') ||
    query.includes('high-risk') ||
    query.includes('risk contracts') ||
    query.includes('at risk')
  ) {
    if (statsError && (statsError.includes('403') || statsError.includes('401'))) return permissionDenied();

    const criticalCount = typeof stats?.criticalMajorRisks === 'number'
      ? stats.criticalMajorRisks
      : contracts.filter(hasCriticalOrMajorRisk).length;

    // Filter accessible contracts that have critical or major risks
    const matchingContracts = contracts.filter(hasCriticalOrMajorRisk);

    const message = criticalCount === 1
      ? '1 contract has critical or major risks.'
      : `${criticalCount} contracts have critical or major risks.`;

    return {
      text: message,
      contracts: matchingContracts,
      source: 'Source: portfolio statistics',
    };
  }

  // -------------------------------------------------------------
  // Intent 4: Waiting for evaluation, waiting for approval
  // -------------------------------------------------------------
  if (
    query.includes('waiting for evaluation') ||
    query.includes('pending evaluation') ||
    query.includes('awaiting evaluation') ||
    query.includes('waiting for approval') ||
    query.includes('pending approval') ||
    query.includes('pending approvals') ||
    query.includes('awaiting approval')
  ) {
    if (statsError && (statsError.includes('403') || statsError.includes('401'))) return permissionDenied();

    const waitingEval = stats?.waitingForEvaluation ?? contracts.filter((c) => ['waiting for evaluation', 'needsreview'].includes(String(c.status).toLowerCase())).length;
    const waitingAppr = stats?.waitingForApproval ?? contracts.filter((c) => String(c.status).toLowerCase() === 'waiting for approval').length;

    const asksOnlyEval = (query.includes('evaluation') || query.includes('evaluate')) && !query.includes('approval');
    const asksOnlyAppr = (query.includes('approval') || query.includes('approve')) && !query.includes('evaluation');

    if (asksOnlyEval) {
      const matching = contracts.filter((c) => ['waiting for evaluation', 'needsreview'].includes(String(c.status).toLowerCase()));
      const isSingular = waitingEval === 1;
      return {
        text: `${isSingular ? 'There is 1 contract' : `There are ${waitingEval} contracts`} waiting for evaluation.`,
        contracts: matching,
        source: 'Source: portfolio statistics',
      };
    }

    if (asksOnlyAppr) {
      const matching = contracts.filter((c) => String(c.status).toLowerCase() === 'waiting for approval');
      const isSingular = waitingAppr === 1;
      return {
        text: `${isSingular ? 'There is 1 contract' : `There are ${waitingAppr} contracts`} waiting for approval.`,
        contracts: matching,
        source: 'Source: portfolio statistics',
      };
    }

    return {
      text: `There are ${waitingEval} contract${waitingEval === 1 ? '' : 's'} waiting for evaluation and ${waitingAppr} contract${waitingAppr === 1 ? '' : 's'} waiting for approval.`,
      source: 'Source: portfolio statistics',
    };
  }

  // -------------------------------------------------------------
  // Intent 3: Approved count, rejected count
  // -------------------------------------------------------------
  if (
    query.includes('approved') ||
    query.includes('rejected') ||
    query.includes('approval count') ||
    query.includes('rejection count')
  ) {
    if (statsError && (statsError.includes('403') || statsError.includes('401'))) return permissionDenied();

    const approvedCount = stats?.approved ?? contracts.filter((c) => String(c.status).toLowerCase() === 'approved').length;
    const rejectedCount = stats?.rejected ?? contracts.filter((c) => String(c.status).toLowerCase() === 'rejected').length;

    const asksOnlyApproved = query.includes('approved') && !query.includes('rejected');
    const asksOnlyRejected = query.includes('rejected') && !query.includes('approved');

    if (asksOnlyApproved) {
      const matching = contracts.filter((c) => String(c.status).toLowerCase() === 'approved');
      const isSingular = approvedCount === 1;
      return {
        text: `${isSingular ? 'There is 1 approved contract' : `There are ${approvedCount} approved contracts`} in the portfolio.`,
        contracts: matching,
        source: 'Source: portfolio statistics',
      };
    }

    if (asksOnlyRejected) {
      const matching = contracts.filter((c) => String(c.status).toLowerCase() === 'rejected');
      const isSingular = rejectedCount === 1;
      return {
        text: `${isSingular ? 'There is 1 rejected contract' : `There are ${rejectedCount} rejected contracts`} in the portfolio.`,
        contracts: matching,
        source: 'Source: portfolio statistics',
      };
    }

    return {
      text: `There are ${approvedCount} approved contract${approvedCount === 1 ? '' : 's'} and ${rejectedCount} rejected contract${rejectedCount === 1 ? '' : 's'} in the portfolio.`,
      source: 'Source: portfolio statistics',
    };
  }

  // -------------------------------------------------------------
  // Unsupported Question / Fallback
  // -------------------------------------------------------------
  return {
    text: `I cannot answer that question yet. I provide deterministic answers based exclusively on your portfolio statistics and loaded contracts.\n\nHere are the questions I can answer:\n• Total number of contracts\n• Contracts with critical or major risks\n• Approved and rejected contract counts\n• Contracts waiting for evaluation or approval\n• Contracts approaching renewal (within 30 days)\n• Contracts filtered by status or counterparty name\n• Short portfolio summary\n\nTry selecting one of the suggested chips below.`,
    source: 'Source: system capabilities',
    isError: false,
  };
}
