/**
 * Mode Switcher & Economics Engine
 * Handles Live Mode vs Simulation Mode orchestration
 * Centralizes all economics calculations to avoid metric drift
 */

// ============================================================================
// MODE CONTROL
// ============================================================================

let CURRENT_MODE = 'LIVE'; // 'LIVE' or 'SIMULATION'

function switchMode(newMode) {
    if (newMode !== 'LIVE' && newMode !== 'SIMULATION') return;
    
    CURRENT_MODE = newMode;
    localStorage.setItem('stockballer_admin_mode', newMode);
    
    // Update UI toggle buttons
    document.querySelectorAll('[data-mode-toggle]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === newMode);
    });

    // Update mode label
    const modeLabel = document.getElementById('current-mode-label');
    if (modeLabel) {
        if (newMode === 'LIVE') {
            modeLabel.textContent = '⚡ LIVE';
            modeLabel.style.color = '#00ff88';
        } else {
            modeLabel.textContent = '🔄 SIMULATION';
            modeLabel.style.color = '#ffaa00';
        }
    }

    // Show/hide panels
    document.querySelectorAll('[data-panel-mode]').forEach(panel => {
        const panelMode = panel.dataset.panelMode;
        panel.style.display = (panelMode === newMode) ? 'block' : 'none';
    });

    // Hide legacy live-only sections when in simulation mode.
    document.querySelectorAll('[data-live-only]').forEach(panel => {
        if (!panel.dataset.originalDisplay) {
            panel.dataset.originalDisplay = panel.style.display || '';
        }
        panel.style.display = newMode === 'LIVE' ? panel.dataset.originalDisplay : 'none';
    });

    // Toast notification if function exists
    if (window.showToast) {
        window.showToast(`📢 Switched to ${newMode} MODE`);
    }

    // Reload data for new mode
    if (window.loadModeData) {
        window.loadModeData();
    }
}

function initModeFromStorage() {
    const savedMode = localStorage.getItem('stockballer_admin_mode') || 'LIVE';
    switchMode(savedMode);
}

// ============================================================================
// CENTRALIZED ECONOMICS ENGINE
// ============================================================================

class EconomicsCalculator {
    /**
     * Calculate trading fee from transaction amount
     * Trading fee: 1.0% (100 basis points)
     */
    static calculateTradingFee(transactionAmount) {
        return transactionAmount * 0.01;
    }

    /**
     * Calculate cumulative fees from multiple trades
     */
    static calculateCumulativeFees(trades) {
        return trades.reduce((sum, trade) => {
            return sum + this.calculateTradingFee(trade.totalAmount);
        }, 0);
    }

    /**
     * Monthly operating expenses (OpEx)
     * From EARNINGS_PROJECTION.md
     */
    static getMonthlyOpEx() {
        return {
            infrastructure: 200,      // Server/API/MongoDB
            gasFeesBlockchain: 50,    // Base L2 gas fees
            apiFootballData: 100,     // API-Football subscription
            domainSsl: 10,           // Domain/SSL
            monitoringTools: 50,     // Monitoring/Analytics
            emailService: 30,        // Email/Notifications
            security: 40,            // Security/Backup
            miscBuffer: 30,          // Miscellaneous/Buffer
        };
    }

    static getTotalMonthlyOpEx() {
        const opex = this.getMonthlyOpEx();
        return Object.values(opex).reduce((sum, val) => sum + val, 0);
    }

    static getAnnualOpEx() {
        return this.getTotalMonthlyOpEx() * 12;
    }

    /**
     * Calculate net revenue after OpEx
     * For a season run: fees accrued - proportional OpEx
     */
    static calculateNetRevenue(totalFees, daysActive = 7) {
        const annualOpEx = this.getAnnualOpEx();
        const dailyOpEx = annualOpEx / 365;
        const proportionalOpEx = dailyOpEx * daysActive;
        return totalFees - proportionalOpEx;
    }

    /**
     * Format currency consistently across dashboard
     */
    static formatCurrency(value) {
        return `$${value.toFixed(2)}`;
    }

    /**
     * Calculate ROI: (Net Profit / OpEx) * 100
     */
    static calculateROI(netProfit, baseOpEx = null) {
        const opex = baseOpEx || this.getTotalMonthlyOpEx();
        if (opex === 0) return 0;
        return (netProfit / opex) * 100;
    }

    /**
     * Data source badge helper
     */
    static getDataSourceBadge(isSimulated) {
        if (isSimulated) {
            return '<span class="data-badge simulated">🔄 SIMULATED</span>';
        } else {
            return '<span class="data-badge live">⚡ LIVE</span>';
        }
    }
}

// ============================================================================
// LIVE MODE DATA FETCHING
// ============================================================================

function getApiBase() {
    return window.API_BASE || localStorage.getItem('stockballer_admin_api_base') || 'https://stockballer-api-production.up.railway.app/api';
}

function getActiveSeasonRunId() {
    return window.activeSeasonRunId || null;
}

function formatLiveTime(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function loadLiveData() {
    try {
        const [matches, tokens, activity, gameFlow] = await Promise.all([
            fetchLiveMatches(),
            fetchLiveTokenData(),
            fetchLiveActivity(),
            fetchGameFlowHealth(),
        ]);

        updateLiveMatchContext(matches);
        updateLiveTokenBoard(tokens);
        updateLiveActivityPanel(activity);
        updateLiveGameFlowPanel(gameFlow);

        // For Live economics: get bot stats from existing admin.html data
        if (window.lastStats) {
            updateLiveEconomics(window.lastStats);
        }
    } catch (error) {
        console.error('[LiveMode] Load error:', error);
    }
}

async function fetchLiveMatches() {
    try {
        const fixturesResponse = await fetch(`${getApiBase()}/predictions/fixtures`);
        if (!fixturesResponse.ok) {
            console.error('[LiveMatches] HTTP error:', fixturesResponse.status);
            return [];
        }

        const fixturesPayload = await fixturesResponse.json();
        const fixtures = Array.isArray(fixturesPayload?.fixtures) ? fixturesPayload.fixtures : [];

        const matchIds = fixtures
            .map((fixture) => Number(fixture?.matchId || 0))
            .filter((id) => Number.isFinite(id) && id > 0)
            .slice(0, 20);

        if (matchIds.length === 0) {
            return fixtures;
        }

        try {
            const statusResponse = await fetch(`${getApiBase()}/predictions/status/${matchIds.join(',')}`);
            if (!statusResponse.ok) {
                return fixtures;
            }

            const statusPayload = await statusResponse.json();
            const statusMap = new Map(
                (Array.isArray(statusPayload?.matches) ? statusPayload.matches : [])
                    .map((match) => [Number(match.matchId), match])
            );

            return fixtures.map((fixture) => ({
                ...fixture,
                ...(statusMap.get(Number(fixture.matchId)) || {}),
            }));
        } catch (statusError) {
            console.warn('[LiveMatches] status merge failed:', statusError?.message || statusError);
            return fixtures;
        }
    } catch (error) {
        console.error('[LiveMatches] Fetch error:', error);
        return [];
    }
}

function updateLiveMatchContext(fixtures) {
    const panel = document.getElementById('live-match-context');
    if (!panel) return;

    if (!Array.isArray(fixtures) || fixtures.length === 0) {
        panel.innerHTML = '<div style="padding: 16px; color: rgba(255,255,255,0.5);">No upcoming fixtures available</div>';
        return;
    }

    const now = Date.now();
    const rows = fixtures
        .sort((a, b) => (a.matchStartTime || 0) - (b.matchStartTime || 0))
        .slice(0, 5)
        .map((fixture) => {
            const startTime = fixture.matchStartTime || 0;
            const minutesUntil = Math.round((startTime - now) / 60000);
            const started = Boolean(fixture.started);
            const finished = Boolean(fixture.isFinished);
            const homeScore = fixture.homeScore;
            const awayScore = fixture.awayScore;
            const showScore = started || typeof homeScore === 'number' || typeof awayScore === 'number';

            let timingLabel = minutesUntil > 0
                ? `Starts in ${Math.floor(minutesUntil / 60)}h ${Math.max(minutesUntil % 60, 0)}m`
                : 'Live / recent';

            if (finished) {
                timingLabel = 'Final';
            } else if (fixture.statusShort === 'HT') {
                timingLabel = 'Half-time';
            } else if (started && typeof fixture.elapsed === 'number') {
                timingLabel = `${fixture.elapsed}'`;
            } else if (fixture.status) {
                timingLabel = String(fixture.status);
            }

            const timingColor = finished
                ? '#94a3b8'
                : started
                    ? '#fb7185'
                    : '#34d399';

            const scoreLine = showScore
                ? `<div style="font-size: 12px; color: rgba(255,255,255,0.88); margin-top: 4px; font-weight: 700;">${typeof homeScore === 'number' ? homeScore : '-'} - ${typeof awayScore === 'number' ? awayScore : '-'}</div>`
                : '';

            return `
                <div style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.06);">
                    <div style="font-size: 13px; color: #fff; font-weight: 600;">${fixture.homeTeam || 'Home'} vs ${fixture.awayTeam || 'Away'}</div>
                    ${scoreLine}
                    <div style="font-size: 11px; color: rgba(255,255,255,0.65); margin-top: 4px;">${fixture.league || 'League'} • ${fixture.round || 'Round TBD'}</div>
                    <div style="font-size: 11px; color: ${timingColor}; margin-top: 2px; font-weight: 600;">${timingLabel}</div>
                    <div style="font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 2px;">Kickoff ${formatLiveTime(startTime)}</div>
                </div>
            `;
        })
        .join('');

    panel.innerHTML = rows;
}

async function fetchLiveTokenData() {
    try {
        const response = await fetch(`${getApiBase()}/market/players`);
        if (!response.ok) {
            console.error('[LiveTokens] HTTP error:', response.status);
            return [];
        }

        const data = await response.json();
        const tokens = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);

        return tokens.map((token) => {
            const current = Number(token.currentPrice || 0);
            const base = Number(token.ipoPrice || 0);
            const changePct = base > 0 ? ((current - base) / base) * 100 : 0;
            return {
                ...token,
                changePct,
            };
        });
    } catch (error) {
        console.error('[LiveTokens] Fetch error:', error);
        return [];
    }
}

function updateLiveTokenBoard(tokens) {
    const panel = document.getElementById('live-token-board');
    if (!panel) return;

    if (!Array.isArray(tokens) || tokens.length === 0) {
        panel.innerHTML = '<div style="padding: 16px; color: rgba(255,255,255,0.5);">No token data available</div>';
        return;
    }

    const rows = tokens
        .sort((a, b) => Math.abs(b.changePct || 0) - Math.abs(a.changePct || 0))
        .slice(0, 8)
        .map((token) => {
            const change = Number(token.changePct || 0);
            const up = change >= 0;
            const color = up ? '#00ff88' : '#ff6666';
            const sign = up ? '+' : '';
            return `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.06);">
                    <div>
                        <div style="font-size: 13px; color: #fff; font-weight: 600;">${token.name || 'Unknown'}</div>
                        <div style="font-size: 11px; color: rgba(255,255,255,0.5);">$${Number(token.currentPrice || 0).toFixed(2)}</div>
                    </div>
                    <div style="font-size: 12px; color: ${color}; font-weight: 700;">${sign}${change.toFixed(2)}%</div>
                </div>
            `;
        })
        .join('');

    panel.innerHTML = rows;
}

async function fetchLiveActivity() {
    if (typeof window.fetchActivitySource === 'function') {
        try {
            return await window.fetchActivitySource();
        } catch (error) {
            console.warn('[LiveActivity] canonical source helper failed, fallback to direct fetch');
        }
    }

    try {
        const response = await fetch(`${getApiBase()}/activity/events?userType=all&limit=120&offset=0`);
        if (!response.ok) {
            console.error('[LiveActivity] HTTP error:', response.status);
            return [];
        }

        const data = await response.json();
        return Array.isArray(data?.items) ? data.items : [];
    } catch (error) {
        console.error('[LiveActivity] Fetch error:', error);
        return [];
    }
}

function formatCanonicalActivityType(eventType) {
    const normalized = String(eventType || '').toLowerCase();

    if (normalized === 'trade_buy_submitted') return { label: 'BUY', color: '#00ff88' };
    if (normalized === 'trade_sell_submitted') return { label: 'SELL', color: '#ff6666' };
    if (normalized === 'challenge_created') return { label: 'H2H CREATE', color: '#7dd3fc' };
    if (normalized === 'challenge_accepted') return { label: 'H2H ACCEPT', color: '#38bdf8' };
    if (normalized === 'contest_entry_submitted') return { label: 'CONTEST ENTRY', color: '#c4b5fd' };
    if (normalized === 'prediction_bet_placed') return { label: 'PREDICTION BET', color: '#6ee7b7' };
    if (normalized === 'contest_view') return { label: 'CONTEST VIEW', color: '#fbbf24' };
    if (normalized === 'contest_enter_click') return { label: 'ENTER CLICK', color: '#f59e0b' };

    return {
        label: String(eventType || 'EVENT').replace(/_/g, ' ').toUpperCase(),
        color: '#f8fafc',
    };
}

function formatCanonicalActivitySubject(item) {
    if (!item || typeof item !== 'object') {
        return 'Activity event';
    }

    const metadata = item.metadata || {};
    const eventType = String(item.eventType || '').toLowerCase();

    if (eventType === 'trade_buy_submitted' || eventType === 'trade_sell_submitted') {
        return item.entityId || metadata.playerId || metadata.tokenId || 'Player trade';
    }

    if (eventType === 'challenge_created' || eventType === 'challenge_accepted') {
        if (item.entityId) {
            return `Challenge ${String(item.entityId).slice(0, 8)}`;
        }
        return 'Head-to-head flow';
    }

    if (eventType === 'contest_entry_submitted') {
        return item.entityId || 'Parlay contest entry';
    }

    if (eventType === 'prediction_bet_placed') {
        return item.entityId || metadata.predictionId || 'Parlay prediction';
    }

    if (eventType === 'contest_view' || eventType === 'contest_enter_click') {
        return item.entityId || item.screen || 'Contest flow';
    }

    return item.entityId || item.screen || item.eventType || 'Activity event';
}

function formatCanonicalActivityMeta(item) {
    const metadata = item?.metadata || {};
    const eventType = String(item?.eventType || '').toLowerCase();

    if (eventType === 'trade_buy_submitted' || eventType === 'trade_sell_submitted') {
        const qty = Number(metadata.quantity || 0);
        return qty > 0 ? `Qty ${qty}` : 'Trade action';
    }

    if (eventType === 'challenge_created' || eventType === 'challenge_accepted') {
        return metadata.mode ? `Mode ${String(metadata.mode).toUpperCase()}` : 'H2H gameplay';
    }

    if (eventType === 'contest_entry_submitted' || eventType === 'prediction_bet_placed') {
        const legs = Number(metadata.legsCount || 0);
        return legs > 0 ? `${legs} legs` : 'Contest gameplay';
    }

    return item?.screen || 'App event';
}

function updateLiveActivityPanel(activities) {
    const panel = document.getElementById('live-activity');
    if (!panel) return;

    if (!Array.isArray(activities) || activities.length === 0) {
        panel.innerHTML = '<div style="padding: 16px; color: rgba(255,255,255,0.5);">No recent activity yet</div>';
        return;
    }

    const rows = activities
        .slice(0, 12)
        .map((item) => {
            const isCanonical = Boolean(item?.eventType);
            const canonicalType = isCanonical ? formatCanonicalActivityType(item.eventType) : null;
            const type = isCanonical ? canonicalType.label : String(item.type || 'BUY').toUpperCase();
            const typeColor = isCanonical ? canonicalType.color : (type === 'BUY' ? '#00ff88' : '#ff6666');
            const actor = isCanonical
                ? (item.walletHash || item.walletAddress || item.sessionId || 'Unknown actor')
                : (item.trader?.displayName || item.trader?.walletAddress || 'Unknown trader');
            const shortActor = actor.length > 18 ? `${actor.slice(0, 18)}...` : actor;
            const playerName = isCanonical
                ? formatCanonicalActivitySubject(item)
                : (item.player?.name || 'Unknown token');
            const total = Number((isCanonical ? item.amount : item.totalAmount) || 0);
            const time = formatLiveTime(item.timestamp);
            const actorType = isCanonical
                ? String(item.userType || 'live').toUpperCase()
                : (item.trader?.isBot ? 'BOT' : 'LIVE');
            const result = isCanonical ? String(item.result || 'unknown').toUpperCase() : 'SUCCESS';
            const typeLabel = (type.length > 18 ? `${type.slice(0, 18)}...` : type);
            const metaLabel = isCanonical ? formatCanonicalActivityMeta(item) : `Qty ${Number(item.quantity || 0)}`;
            const amountLabel = total > 0 ? `$${total.toFixed(2)}` : '---';
            return `
                <div style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.06);">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                        <div style="font-size: 12px; color: #fff;"><span style="color: ${typeColor}; font-weight: 700;">${typeLabel}</span> ${playerName}</div>
                        <div style="font-size: 11px; color: #ffaa00; font-weight: 700;">${amountLabel}</div>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-top: 4px; font-size: 11px; color: rgba(255,255,255,0.5);">
                        <span>${shortActor} • ${actorType} • ${metaLabel}</span>
                        <span style="color:${result === 'SUCCESS' ? '#00ff88' : result === 'FAILED' ? '#ff6666' : '#ffaa00'}; font-weight:600;">${result}</span>
                        <span>${time}</span>
                    </div>
                </div>
            `;
        })
        .join('');

    panel.innerHTML = rows;
}

async function fetchGameFlowHealth() {
    try {
        const [h2hResponse, contestResponse] = await Promise.all([
            fetch(`${getApiBase()}/h2h/open?limit=50&offset=0`),
            fetch(`${getApiBase()}/predictions/contests`),
        ]);

        const h2hData = h2hResponse.ok ? await h2hResponse.json() : null;
        const contestData = contestResponse.ok ? await contestResponse.json() : null;

        return {
            h2hOpenCount: Number(h2hData?.pagination?.total || h2hData?.total || 0),
            contest: contestData?.contest || null,
            contestLeaderboardCount: Array.isArray(contestData?.leaderboard) ? contestData.leaderboard.length : 0,
        };
    } catch (error) {
        console.error('[GameFlowHealth] Fetch error:', error);
        return null;
    }
}

function updateLiveGameFlowPanel(gameFlow) {
    const panel = document.getElementById('live-game-health');
    if (!panel) return;

    if (!gameFlow) {
        panel.innerHTML = '<div style="padding: 16px; color: rgba(255,255,255,0.5);">Game flow status unavailable</div>';
        return;
    }

    const contest = gameFlow.contest;
    const contestStatus = contest?.status || 'NONE';
    const contestEntries = Number(contest?.entryCount || 0);
    const contestPrizePool = Number(contest?.prizePool || 0) / 1_000_000;

    panel.innerHTML = `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div style="background: rgba(0,170,255,0.10); border: 1px solid rgba(0,170,255,0.25); border-radius: 8px; padding: 10px;">
                <div style="font-size: 11px; color: rgba(255,255,255,0.6); text-transform: uppercase; margin-bottom: 4px;">H2H Open Challenges</div>
                <div style="font-size: 18px; font-weight: 700; color: #7dd3fc;">${gameFlow.h2hOpenCount}</div>
            </div>
            <div style="background: rgba(167,139,250,0.10); border: 1px solid rgba(167,139,250,0.25); border-radius: 8px; padding: 10px;">
                <div style="font-size: 11px; color: rgba(255,255,255,0.6); text-transform: uppercase; margin-bottom: 4px;">Parlay Contest Status</div>
                <div style="font-size: 18px; font-weight: 700; color: #c4b5fd;">${contestStatus}</div>
            </div>
            <div style="background: rgba(52,211,153,0.10); border: 1px solid rgba(52,211,153,0.25); border-radius: 8px; padding: 10px;">
                <div style="font-size: 11px; color: rgba(255,255,255,0.6); text-transform: uppercase; margin-bottom: 4px;">Contest Entries</div>
                <div style="font-size: 18px; font-weight: 700; color: #6ee7b7;">${contestEntries}</div>
            </div>
            <div style="background: rgba(245,158,11,0.10); border: 1px solid rgba(245,158,11,0.25); border-radius: 8px; padding: 10px;">
                <div style="font-size: 11px; color: rgba(255,255,255,0.6); text-transform: uppercase; margin-bottom: 4px;">Contest Prize Pool</div>
                <div style="font-size: 18px; font-weight: 700; color: #fbbf24;">$${contestPrizePool.toFixed(2)}</div>
            </div>
        </div>
    `;
}



function updateLiveEconomics(stats) {
    const panel = document.getElementById('live-economics');
    if (!panel) return;

    // stats should have: totalFeesPaid, activeBots, etc.
    const totalFees = stats?.totalFeesPaid || 0;
    const monthlyOpEx = EconomicsCalculator.getTotalMonthlyOpEx();
    const netDaily = (totalFees > 0) ? (totalFees / 30) - (monthlyOpEx / 30) : 0;
    const netColor = netDaily >= 0 ? '#00ff88' : '#ff6666';
    const burnRate = monthlyOpEx / 30;

    const html = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div style="background: rgba(0,255,136,0.1); padding: 12px; border-radius: 8px; border: 1px solid rgba(0,255,136,0.2);">
                <div style="font-size: 11px; color: rgba(255,255,255,0.6); text-transform: uppercase; margin-bottom: 4px;">Total Fees Collected</div>
                <div style="font-size: 18px; font-weight: 700; color: #00ff88;">$${totalFees.toFixed(2)}</div>
                <div style="font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 4px;">1% per trade</div>
            </div>
            <div style="background: rgba(255,170,0,0.1); padding: 12px; border-radius: 8px; border: 1px solid rgba(255,170,0,0.2);">
                <div style="font-size: 11px; color: rgba(255,255,255,0.6); text-transform: uppercase; margin-bottom: 4px;">Monthly OpEx</div>
                <div style="font-size: 18px; font-weight: 700; color: #ffaa00;">$${monthlyOpEx.toFixed(2)}</div>
                <div style="font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 4px;">Infrastructure costs</div>
            </div>
        </div>
        <div style="background: rgba(0,200,255,0.1); padding: 12px; border-radius: 8px; border: 1px solid rgba(0,200,255,0.2);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="font-size: 11px; color: rgba(255,255,255,0.6); text-transform: uppercase;">Estimated Daily Run-Rate</div>
                <div style="font-size: 16px; font-weight: 700; color: ${netColor};">${netDaily >= 0 ? '+' : ''}$${netDaily.toFixed(2)}/day</div>
            </div>
        </div>
    `;

    panel.innerHTML = html;
}

// ============================================================================
// SIMULATION MODE DATA FETCHING
// ============================================================================

async function loadSimulationData() {
    try {
        if (getActiveSeasonRunId()) {
            const [status, tokenMeta] = await Promise.all([
                fetchSeasonStatus(),
                fetchTokenMetadata(),
            ]);
            if (status) {
                updateSimulationModeUI(status, tokenMeta);
            }
        } else {
            updateSimulatedTokenPath(null, new Map());
            updateSimulationBotPortfolio(null);
            updateSimulationLeaderboards(null, new Map());
            updateSimulationEconomics(null);
        }
    } catch (error) {
        console.error('[SimulationMode] Load error:', error);
    }
}

async function fetchTokenMetadata() {
    try {
        const response = await fetch(`${getApiBase()}/market/players`);
        if (!response.ok) return new Map();

        const payload = await response.json();
        const rows = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []);
        return new Map(rows.map((row) => [Number(row.tokenId), row]));
    } catch (error) {
        console.error('[SimulationTokens] Metadata fetch error:', error);
        return new Map();
    }
}

async function fetchSeasonStatus() {
    try {
        const runId = getActiveSeasonRunId();
        if (!runId) {
            return null;
        }

        const apiBase = window.API_BASE || 'https://stockballer-api-production.up.railway.app/api';
        const response = await fetch(`${apiBase}/simulation/season/${runId}/status`);
        if (!response.ok) return null;
        
        const data = await response.json();
        return data.found ? (data.status || null) : null;
    } catch (e) {
        console.error('[SeasonStatus] Fetch error:', e);
        return null;
    }
}

function updateSimulationModeUI(status, tokenMeta = new Map()) {
    // Update season controls display
    updateMatchdaySnapshot(status);
    updateSimulatedTokenPath(status, tokenMeta);
    updateSimulationBotPortfolio(status);
    updateSimulationLeaderboards(status, tokenMeta);
    updateSimulationEconomics(status);
}

function updateMatchdaySnapshot(status) {
    const panel = document.getElementById('simulation-matchday');
    if (!panel) return;

    const progress = (status.currentMatchday / status.totalMatchdays * 100).toFixed(1);
    const html = `
        <div style="margin-bottom: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="font-size: 13px; color: rgba(255,255,255,0.7);">Matchday Progress</div>
                <div style="font-size: 14px; font-weight: 600; color: #00aaff;">${status.currentMatchday}/${status.totalMatchdays}</div>
            </div>
            <div style="width: 100%; height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden;">
                <div style="width: ${progress}%; height: 100%; background: linear-gradient(90deg, #00aaff 0%, #00ff88 100%); transition: width 0.3s ease;"></div>
            </div>
            <div style="font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 6px;">${progress}% complete</div>
        </div>
        <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div>
                    <div style="font-size: 11px; color: rgba(255,255,255,0.5); margin-bottom: 4px;">Status</div>
                    <div style="color: #fff; font-weight: 600;">${status.completed ? '✅ Completed' : '⏳ In Progress'}</div>
                </div>
                <div>
                    <div style="font-size: 11px; color: rgba(255,255,255,0.5); margin-bottom: 4px;">Snapshots</div>
                    <div style="color: #fff; font-weight: 600;">${status.snapshots} saved</div>
                </div>
            </div>
        </div>
    `;
    panel.innerHTML = html;
}

function updateSimulatedTokenPath(status, tokenMeta = new Map()) {
    const panel = document.getElementById('simulation-token-path');
    if (!panel) return;

    const latest = status?.latestSnapshot;
    const prices = Array.isArray(latest?.tokenPrices) ? latest.tokenPrices : [];

    if (!prices.length) {
        panel.innerHTML = `
            <div style="text-align: center; padding: 20px; color: rgba(255,255,255,0.5);">
                <div>📊 Token Price Evolution</div>
                <div style="font-size: 12px; margin-top: 8px;">Run simulation to generate token snapshots</div>
            </div>
        `;
        return;
    }

    const cards = prices
        .slice()
        .sort((a, b) => Math.abs((b.change || 0)) - Math.abs((a.change || 0)))
        .slice(0, 10)
        .map((p) => {
            const meta = tokenMeta.get(Number(p.tokenId));
            const name = meta?.name || `Token #${p.tokenId}`;
            const team = meta?.team || 'Simulation Market';
            const change = Number(p.change || 0);
            const up = change >= 0;
            return `
                <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); border-radius: 10px; padding: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                        <div>
                            <div style="font-size: 13px; color: #fff; font-weight: 700;">${name}</div>
                            <div style="font-size: 11px; color: rgba(255,255,255,0.55); margin-top: 2px;">${team}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 13px; color: rgba(255,255,255,0.9);">$${Number(p.price || 0).toFixed(2)}</div>
                            <div style="font-size: 12px; font-weight: 700; color: ${up ? '#00ff88' : '#ff6666'};">${up ? '+' : ''}${change.toFixed(2)}%</div>
                        </div>
                    </div>
                </div>
            `;
        })
        .join('');

    panel.innerHTML = `
        <div style="margin-bottom: 10px; font-size: 11px; color: rgba(255,255,255,0.55);">Live simulation token cards (updated each matchday). Current: MD ${status.currentMatchday}</div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px;">
            ${cards}
        </div>
    `;
}

function updateSimulationBotPortfolio(status) {
    const panel = document.getElementById('simulation-bot-portfolio');
    if (!panel) return;

    const latest = status?.latestSnapshot;
    const perf = Array.isArray(latest?.agentPerformance) ? latest.agentPerformance : [];
    if (!status || !latest || !perf.length) {
        panel.innerHTML = '<div style="padding: 16px; color: rgba(255,255,255,0.5);">No simulated bot portfolio data yet</div>';
        return;
    }

    const rows = perf
        .slice()
        .sort((a, b) => Number(b.avgPnL || 0) - Number(a.avgPnL || 0))
        .map((bucket) => {
            const pnl = Number(bucket.avgPnL || 0);
            const profitable = Number(bucket.profitableCount || 0);
            const total = Number(bucket.totalCount || 0);
            return `
                <div style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; gap: 10px;">
                    <div>
                        <div style="font-size: 12px; color: #fff; font-weight: 700; text-transform: capitalize;">${String(bucket.type || 'Unknown')} strategy</div>
                        <div style="font-size: 11px; color: rgba(255,255,255,0.55);">${profitable}/${total} profitable bots</div>
                    </div>
                    <div style="text-align: right; font-size: 12px; font-weight: 700; color: ${pnl >= 0 ? '#00ff88' : '#ff6666'};">
                        ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} avg P/L
                    </div>
                </div>
            `;
        })
        .join('');

    panel.innerHTML = `
        <div style="font-size: 11px; color: rgba(255,255,255,0.55); margin-bottom: 10px;">Simulation-only portfolio rebalance view (MD ${status.currentMatchday})</div>
        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; overflow: hidden;">
            ${rows}
        </div>
    `;
}

function updateSimulationLeaderboards(status, tokenMeta = new Map()) {
    const panel = document.getElementById('simulation-leaderboards');
    if (!panel) return;

    const latest = status?.latestSnapshot;
    const prices = Array.isArray(latest?.tokenPrices) ? latest.tokenPrices : [];
    const perf = Array.isArray(latest?.agentPerformance) ? latest.agentPerformance : [];

    if (!status || !latest || (!prices.length && !perf.length)) {
        panel.innerHTML = '<div style="padding: 16px; color: rgba(255,255,255,0.5);">No leaderboard data yet</div>';
        return;
    }

    const topTokens = prices
        .slice()
        .sort((a, b) => Number(b.change || 0) - Number(a.change || 0))
        .slice(0, 5)
        .map((p, idx) => {
            const meta = tokenMeta.get(Number(p.tokenId));
            const name = meta?.name || `Token #${p.tokenId}`;
            return `<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.06); font-size:12px;"><span>${idx + 1}. ${name}</span><span style="color:#00ff88; font-weight:700;">+${Number(p.change || 0).toFixed(2)}%</span></div>`;
        })
        .join('');

    const topBots = perf
        .slice()
        .sort((a, b) => Number(b.avgPnL || 0) - Number(a.avgPnL || 0))
        .slice(0, 5)
        .map((b, idx) => {
            const pnl = Number(b.avgPnL || 0);
            return `<div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.06); font-size:12px;"><span>${idx + 1}. ${String(b.type || 'Unknown')} bot</span><span style="color:${pnl >= 0 ? '#00ff88' : '#ff6666'}; font-weight:700;">${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</span></div>`;
        })
        .join('');

    panel.innerHTML = `
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px;">
            <div style="background: rgba(0,255,136,0.08); border:1px solid rgba(0,255,136,0.2); border-radius:10px; padding:12px;">
                <div style="font-size:12px; color:#8effc6; font-weight:700; margin-bottom:8px;">Best Performing Player Tokens</div>
                ${topTokens || '<div style="font-size:12px; color:rgba(255,255,255,0.5);">No token data yet</div>'}
            </div>
            <div style="background: rgba(0,170,255,0.08); border:1px solid rgba(0,170,255,0.2); border-radius:10px; padding:12px;">
                <div style="font-size:12px; color:#82d4ff; font-weight:700; margin-bottom:8px;">Best Performing Bots</div>
                ${topBots || '<div style="font-size:12px; color:rgba(255,255,255,0.5);">No bot data yet</div>'}
            </div>
        </div>
    `;
}

function updateSimulationEconomics(status) {
    const panel = document.getElementById('simulation-economics');
    if (!panel) return;

    if (!status) {
        panel.innerHTML = '<div style="padding: 16px; color: rgba(255,255,255,0.5);">No active season run</div>';
        return;
    }

    // Calculate simulated economics from season status payload
    const latest = status.latestSnapshot || {};
    const weeklyFees = Number(latest.feesCollected || 0);
    const weeklyVolume = Number(latest.tradingVolume || 0);
    const cumulativeFees = Number(status.platformFeesCollected || 0);
    const cumulativeVolume = Number(status.totalTradingVolume || 0);
    const monthlyOpEx = EconomicsCalculator.getTotalMonthlyOpEx();
    const weeksActive = Math.ceil(status.currentMatchday / 9.5);
    const proportionalOpEx = (monthlyOpEx / 4.33) * weeksActive;
    const netValue = cumulativeFees - proportionalOpEx;

    const html = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div style="background: rgba(0,255,136,0.1); padding: 12px; border-radius: 8px; border: 1px solid rgba(0,255,136,0.2);">
                <div style="font-size: 11px; color: rgba(255,255,255,0.6); text-transform: uppercase; margin-bottom: 4px;">Cumulative Fees</div>
                <div style="font-size: 18px; font-weight: 700; color: #00ff88;">$${cumulativeFees.toFixed(2)}</div>
                <div style="font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 4px;">Weekly: $${weeklyFees.toFixed(2)}</div>
            </div>
            <div style="background: rgba(255,170,0,0.1); padding: 12px; border-radius: 8px; border: 1px solid rgba(255,170,0,0.2);">
                <div style="font-size: 11px; color: rgba(255,255,255,0.6); text-transform: uppercase; margin-bottom: 4px;">Proportional OpEx</div>
                <div style="font-size: 18px; font-weight: 700; color: #ffaa00;">$${proportionalOpEx.toFixed(2)}</div>
                <div style="font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 4px;">MD ${status.currentMatchday}/${status.totalMatchdays}</div>
            </div>
        </div>
        <div style="background: rgba(0,200,255,0.1); padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(0,200,255,0.2); margin-bottom: 12px; font-size: 12px; color: rgba(255,255,255,0.8);">
            Volume this week: $${weeklyVolume.toFixed(2)} • Cumulative volume: $${cumulativeVolume.toFixed(2)}
        </div>
        <div style="background: ${netValue >= 0 ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,68,0.1)'}; padding: 12px; border-radius: 8px; border: 1px solid ${netValue >= 0 ? 'rgba(0,255,136,0.2)' : 'rgba(255,68,68,0.2)'};">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="font-size: 11px; color: rgba(255,255,255,0.6); text-transform: uppercase;">NET VALUE CREATED</div>
                <div style="font-size: 18px; font-weight: 700; color: ${netValue >= 0 ? '#00ff88' : '#ff6666'};">
                    ${netValue >= 0 ? '+' : ''}$${netValue.toFixed(2)}
                </div>
            </div>
        </div>
    `;

    panel.innerHTML = html;
}

// ============================================================================
// UNIFIED MODE DATA LOADING
// ============================================================================

async function loadModeData() {
    try {
        if (CURRENT_MODE === 'LIVE') {
            await loadLiveData();
        } else {
            // For Simulation Mode: fetch current simulation status
            await loadSimulationData();
        }
    } catch (error) {
        console.error('[ModeData] Load error:', error);
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize mode from storage on page load
function initializeModeSwitcher() {
    setTimeout(() => {
        initModeFromStorage();
    }, 500); // Wait for admin.html to initialize
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeModeSwitcher);
} else {
    initializeModeSwitcher();
}

// Refresh mode data every 30 seconds
setInterval(() => {
    loadModeData();
}, 30000);
