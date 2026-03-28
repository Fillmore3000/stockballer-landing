// Audit Trail dashboard module
// Keeps scope limited to audit rendering/filtering and avoids overriding existing admin helpers.

let allAuditTrailEvents = [];
let filteredAuditTrailEvents = [];
let auditTrailFilter = 'all';
let auditTrailStatus = 'all';
let auditTrailGameTypeFilter = 'all';
let auditTrailWindowMinutes = 1440;
let auditTrailSearchTerm = '';
let auditTrailCurrentPage = 1;
const AUDIT_TRAIL_PER_PAGE = 20;

function auditFormatMoney(value) {
    const amount = Number(value || 0);
    return `$${amount.toFixed(2)}`;
}

// Parse the 'required' dollar amount from an INSUFFICIENT_BALANCE_REQUIRED_NNN_NN errorCode
function auditParseRequiredFromErrorCode(errorCode) {
    if (!errorCode) return null;
    const m = String(errorCode).match(/REQUIRED_?(\d+)_?(\d+)?(?:_|$)/);
    if (m && m[1]) {
        const dollars = parseInt(m[1], 10);
        const cents = m[2] ? parseInt(m[2].slice(0, 2).padEnd(2, '0'), 10) : 0;
        return dollars + cents / 100;
    }
    return null;
}

// Normalize budget amounts – contest/prediction fees are stored as micro-USDC (1e6 per $)
// in records created before the unit-fix; detect by size and convert.
function auditNormalizeBudget(event) {
    const raw = event.budgetAmount;
    // Null/undefined – try parsing from errorCode
    if (raw == null || raw === '') {
        const errorAmt = auditParseRequiredFromErrorCode(
            event.metadata && (event.metadata.errorCode || event.metadata.reason)
        );
        return { amount: errorAmt, isEstimate: errorAmt != null };
    }
    const num = Number(raw);
    // Legacy micro-USDC sentinel (entryFee stored as 10_000_000 before unit fix)
    if ((event.gameType === 'CONTEST' || event.gameType === 'PREDICTION') && num > 100000) {
        return { amount: num / 1_000_000, isEstimate: false };
    }
    return { amount: num, isEstimate: false };
}

function auditStatusChip(status) {
    if (status === 'PENDING') {
        return {
            text: 'PENDING',
            color: '#f8fafc',
            background: 'rgba(148,163,184,0.12)',
        };
    }
    if (status === 'WON') {
        return {
            text: 'WON',
            color: '#00ff88',
            background: 'rgba(0,255,136,0.10)',
        };
    }
    if (status === 'LOST') {
        return {
            text: 'LOST',
            color: '#ff6666',
            background: 'rgba(255,68,68,0.10)',
        };
    }
    if (status === 'REJECTED') {
        return {
            text: 'REJECTED',
            color: '#fbbf24',
            background: 'rgba(245,158,11,0.10)',
        };
    }
    if (status === 'CANCELLED') {
        return {
            text: 'CANCELLED',
            color: '#94a3b8',
            background: 'rgba(148,163,184,0.10)',
        };
    }
    return {
        text: status || 'SETTLED',
        color: '#ffaa00',
        background: 'rgba(255,170,0,0.10)',
    };
}

function auditActionChip(action) {
    if (action === 'BUY') {
        return {
            color: '#00ff88',
            background: 'rgba(0,255,136,0.08)',
        };
    }
    if (action === 'SELL') {
        return {
            color: '#ff6666',
            background: 'rgba(255,68,68,0.08)',
        };
    }
    if (action === 'PLAY') {
        return {
            color: '#7dd3fc',
            background: 'rgba(0,170,255,0.08)',
        };
    }
    if (action === 'BET') {
        return {
            color: '#6ee7b7',
            background: 'rgba(52,211,153,0.08)',
        };
    }
    if (action === 'SKIP') {
        return {
            color: '#fbbf24',
            background: 'rgba(245,158,11,0.08)',
        };
    }
    return {
        color: 'rgba(255,255,255,0.8)',
        background: 'rgba(255,255,255,0.08)',
    };
}

function auditGameTypeChip(gameType) {
    if (gameType === 'TRADE') return { color: '#7dd3fc', background: 'rgba(0,170,255,0.10)' };
    if (gameType === 'H2H') return { color: '#ffaa00', background: 'rgba(255,170,0,0.10)' };
    if (gameType === 'CONTEST') return { color: '#a78bfa', background: 'rgba(167,139,250,0.10)' };
    if (gameType === 'PREDICTION') return { color: '#34d399', background: 'rgba(52,211,153,0.10)' };
    return { color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.06)' };
}

function applyAuditTrailClientFilters() {
    const now = Date.now();
    const windowMs = Math.max(1, Number(auditTrailWindowMinutes || 1440)) * 60 * 1000;

    filteredAuditTrailEvents = allAuditTrailEvents.filter((event) => {
        if (!event) return false;

        if (auditTrailGameTypeFilter !== 'all' && String(event.gameType || '').toUpperCase() !== auditTrailGameTypeFilter) return false;

        const timestampMs = event.timestamp ? new Date(event.timestamp).getTime() : 0;
        if (timestampMs && now - timestampMs > windowMs) return false;

        if (auditTrailFilter !== 'all' && String(event.action || '').toUpperCase() !== auditTrailFilter) {
            return false;
        }

        if (auditTrailStatus !== 'all' && String(event.status || '').toUpperCase() !== auditTrailStatus) {
            return false;
        }

        if (auditTrailSearchTerm) {
            const term = auditTrailSearchTerm;
            const haystack = [
                String(event.actorId || ''),
                String(event.actorName || ''),
                String(event.resourceName || ''),
                String(event.eventId || ''),
            ].join(' ').toLowerCase();

            if (!haystack.includes(term)) {
                return false;
            }
        }

        return true;
    });
}

function updateAuditTrailStats() {
    const totalTrades = filteredAuditTrailEvents.length;
    const wins = filteredAuditTrailEvents.filter((event) => event.status === 'WON').length;
    const losses = filteredAuditTrailEvents.filter((event) => event.status === 'LOST').length;
    const totalVolume = filteredAuditTrailEvents.reduce((sum, event) => {
        const b = auditNormalizeBudget(event);
        return sum + (b.amount != null ? b.amount : 0);
    }, 0);
    const netPnl = filteredAuditTrailEvents.reduce((sum, event) => sum + Number(event.profitLoss || 0), 0);

    const totalEl = document.getElementById('audit-total-trades');
    const winsEl = document.getElementById('audit-wins');
    const lossesEl = document.getElementById('audit-losses');
    const volumeEl = document.getElementById('audit-total-volume');
    const pnlEl = document.getElementById('audit-net-pnl');

    if (totalEl) totalEl.textContent = String(totalTrades);
    if (winsEl) winsEl.textContent = String(wins);
    if (lossesEl) lossesEl.textContent = String(losses);
    if (volumeEl) volumeEl.textContent = auditFormatMoney(totalVolume);
    if (pnlEl) {
        pnlEl.textContent = auditFormatMoney(netPnl);
        pnlEl.style.color = netPnl >= 0 ? '#00ff88' : '#ff6666';
    }
}

function renderAuditTrailTable() {
    const table = document.getElementById('audit-trail-table');
    const info = document.getElementById('audit-trail-info');
    const pageInfo = document.getElementById('audit-page-info');
    const prevBtn = document.getElementById('audit-prev-page');
    const nextBtn = document.getElementById('audit-next-page');

    if (!table) return;

    const totalRows = filteredAuditTrailEvents.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / AUDIT_TRAIL_PER_PAGE));

    if (auditTrailCurrentPage > totalPages) {
        auditTrailCurrentPage = totalPages;
    }

    const start = (auditTrailCurrentPage - 1) * AUDIT_TRAIL_PER_PAGE;
    const pageRows = filteredAuditTrailEvents.slice(start, start + AUDIT_TRAIL_PER_PAGE);

    if (pageRows.length === 0) {
        table.innerHTML = '<tr><td colspan="9" style="padding: 16px; text-align:center; color: rgba(255,255,255,0.5);">No audit events for the selected filters.</td></tr>';
    } else {
        table.innerHTML = pageRows.map((event) => {
            const time = event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : '--';
            const action = String(event.action || '').toUpperCase();
            const actionChip = auditActionChip(action);
            const statusChip = auditStatusChip(String(event.status || '').toUpperCase());
            const pnl = Number(event.profitLoss || 0);
            const hasPnl = event.profitLoss != null && event.profitLoss !== 0;
            const pnlSign = pnl > 0 ? '+' : '';
            const pnlColor = pnl > 0 ? '#00ff88' : pnl < 0 ? '#ff6666' : 'rgba(255,255,255,0.7)';
            const actorLabel = event.actorName || event.actorId || '--';
            const actorType = event.actorType || '--';
            // Build resource label with rejection reason when available
            const rejectionReason = event.metadata && (event.metadata.reason || event.metadata.errorCode);
            let resourceBase = event.resourceName || (event.resourceId ? `Token #${event.resourceId}` : '--');
            // Append short rejection tag for SKIP/LOST rows so operator sees the reason inline
            const showRejectionTag = (event.status === 'PENDING' || event.status === 'LOST') && rejectionReason &&
                rejectionReason !== 'undefined' && !resourceBase.toLowerCase().includes('failed');
            const playerLabel = showRejectionTag
                ? `${resourceBase} <span style="font-size:10px; color:#fbbf24; font-family:monospace;">[${String(rejectionReason).slice(0,32)}]</span>`
                : resourceBase;
            const gameTypeChip = auditGameTypeChip(String(event.gameType || '').toUpperCase());
            const budgetInfo = auditNormalizeBudget(event);
            const budgetDisplay = budgetInfo.amount != null
                ? `<span style="color:${budgetInfo.isEstimate ? '#fbbf24' : 'rgba(255,255,255,0.75)'}" title="${budgetInfo.isEstimate ? 'Required amount (estimate from error)' : ''}">${auditFormatMoney(budgetInfo.amount)}${budgetInfo.isEstimate ? ' req' : ''}</span>`
                : '<span style="color:rgba(255,255,255,0.3)">—</span>';

            return `
        <tr>
          <td style="padding:10px; border-bottom: 1px solid rgba(255,255,255,0.05); color: rgba(255,255,255,0.8); white-space:nowrap;">${time}</td>
          <td style="padding:10px; border-bottom: 1px solid rgba(255,255,255,0.05); color: rgba(255,255,255,0.8);">
            <span style="font-size:10px; color: rgba(255,255,255,0.5); text-transform: uppercase;">${actorType}</span><br>${actorLabel}
          </td>
          <td style="padding:10px; border-bottom: 1px solid rgba(255,255,255,0.05); text-align:center;">
            <span style="display:inline-block; padding:3px 8px; border-radius:6px; background:${gameTypeChip.background}; color:${gameTypeChip.color}; font-weight:700; font-size:10px; text-transform:uppercase;">${event.gameType || '--'}</span>
          </td>
          <td style="padding:10px; border-bottom: 1px solid rgba(255,255,255,0.05); text-align:center;">
            <span style="display:inline-block; padding:4px 10px; border-radius:6px; background:${actionChip.background}; color:${actionChip.color}; font-weight:700; font-size:11px;">${action || '--'}</span>
          </td>
          <td style="padding:10px; border-bottom: 1px solid rgba(255,255,255,0.05); color: rgba(255,255,255,0.8);">${playerLabel}</td>
          <td style="padding:10px; border-bottom: 1px solid rgba(255,255,255,0.05); text-align:right; font-family: monospace;">${budgetDisplay}</td>
          <td style="padding:10px; border-bottom: 1px solid rgba(255,255,255,0.05); text-align:right; color: rgba(255,255,255,0.75); font-family: monospace;">${event.outcomeAmount != null ? auditFormatMoney(event.outcomeAmount) : '<span style="color:rgba(255,255,255,0.3)">—</span>'}</td>
          <td style="padding:10px; border-bottom: 1px solid rgba(255,255,255,0.05); text-align:right; color: ${pnlColor}; font-family: monospace; font-weight:600;">${hasPnl ? pnlSign + auditFormatMoney(Math.abs(pnl)) : '<span style="color:rgba(255,255,255,0.3)">—</span>'}</td>
          <td style="padding:10px; border-bottom: 1px solid rgba(255,255,255,0.05); text-align:center;">
            <span style="display:inline-block; padding:4px 8px; border-radius:6px; background:${statusChip.background}; color:${statusChip.color}; font-weight:700; font-size:11px;">${statusChip.text}</span>
          </td>
        </tr>
      `;
        }).join('');
    }

    if (info) {
        if (totalRows === 0) {
            info.textContent = 'No matching records';
        } else {
            const end = Math.min(start + pageRows.length, totalRows);
            info.textContent = `Showing ${start + 1}-${end} of ${totalRows}`;
        }
    }

    if (pageInfo) pageInfo.textContent = `Page ${auditTrailCurrentPage} of ${totalPages}`;
    if (prevBtn) prevBtn.disabled = auditTrailCurrentPage <= 1;
    if (nextBtn) nextBtn.disabled = auditTrailCurrentPage >= totalPages;
}

async function loadAuditTrail() {
    try {
        const response = await fetch(`${API_BASE}/activity/audit-trail?limit=200&offset=0`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();
        allAuditTrailEvents = Array.isArray(payload.items) ? payload.items : [];

        applyAuditTrailClientFilters();
        updateAuditTrailStats();
        renderAuditTrailTable();

        const sourceBadge = document.getElementById('audit-trail-source-badge');
        if (sourceBadge) {
            sourceBadge.textContent = allAuditTrailEvents.length > 0 ? 'live tracking' : 'no recent records';
            sourceBadge.style.background = allAuditTrailEvents.length > 0 ? 'rgba(0,255,136,0.1)' : 'rgba(255,170,0,0.12)';
            sourceBadge.style.color = allAuditTrailEvents.length > 0 ? '#00ff88' : '#ffaa00';
        }
    } catch (error) {
        const table = document.getElementById('audit-trail-table');
        if (table) {
            table.innerHTML = `<tr><td colspan="9" style="padding: 16px; color:#ff6666;">Failed to load audit trail: ${error.message || error}</td></tr>`;
        }
    }
}

function setAuditTrailFilter(action) {
    auditTrailFilter = action;
    auditTrailCurrentPage = 1;

    document.querySelectorAll('[data-audit-filter]').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.auditFilter === action);
    });

    applyAuditTrailClientFilters();
    updateAuditTrailStats();
    renderAuditTrailTable();
}

function setAuditTrailStatus(status) {
    auditTrailStatus = status;
    auditTrailCurrentPage = 1;

    document.querySelectorAll('[data-audit-status]').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.auditStatus === status);
    });

    applyAuditTrailClientFilters();
    updateAuditTrailStats();
    renderAuditTrailTable();
}

function setAuditTrailGameType(gameType) {
    auditTrailGameTypeFilter = gameType;
    auditTrailCurrentPage = 1;

    document.querySelectorAll('[data-audit-gametype]').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.auditGametype === gameType);
    });

    applyAuditTrailClientFilters();
    updateAuditTrailStats();
    renderAuditTrailTable();
}

function setAuditTrailWindow(minutes) {
    auditTrailWindowMinutes = Number(minutes) || 1440;
    auditTrailCurrentPage = 1;

    document.querySelectorAll('[data-audit-window]').forEach((tab) => {
        tab.classList.toggle('active', Number(tab.dataset.auditWindow) === auditTrailWindowMinutes);
    });

    applyAuditTrailClientFilters();
    updateAuditTrailStats();
    renderAuditTrailTable();
}

function setAuditTrailSearchTerm(term) {
    auditTrailSearchTerm = String(term || '').toLowerCase().trim();
    auditTrailCurrentPage = 1;

    applyAuditTrailClientFilters();
    updateAuditTrailStats();
    renderAuditTrailTable();
}

function auditTrailPrevPage() {
    auditTrailCurrentPage = Math.max(1, auditTrailCurrentPage - 1);
    renderAuditTrailTable();
}

function auditTrailNextPage() {
    auditTrailCurrentPage += 1;
    renderAuditTrailTable();
}
