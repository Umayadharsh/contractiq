import React, { useMemo } from 'react';
import {
  FileText,
  AlertTriangle,
  Clock,
  Calendar,
  ArrowRight,
  Upload,
  ShieldAlert,
} from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Badge, { RiskBadge } from '../components/common/Badge';

export default function Dashboard({
  contracts = [],
  pendingActions = [],
  session,
  onSelectContract,
  onNavigate,
  onOpenUpload,
}) {
  const role = session?.user?.role || 'Viewer';

  // Compute metrics from current API contracts data
  const metrics = useMemo(() => {
    let approvedCount = 0;
    let highRiskCount = 0;
    let upcomingRenewalsCount = 0;
    const now = new Date();

    contracts.forEach((c) => {
      // A contract counts as approved only when its actual status is Approved
      const statusRaw = (c.status || '').trim().toLowerCase();
      if (statusRaw === 'approved') {
        approvedCount++;
      }

      // Risk condition
      const status = c.complianceReport?.overallStatus?.toLowerCase() || '';
      if (status === 'fail' || status === 'critical' || status === 'major' || (c.complianceReport?.overallRiskScore && c.complianceReport.overallRiskScore < 70)) {
        highRiskCount++;
      }

      // Renewal condition (within 30 days)
      const endDateRaw = c.extractedFields?.endDate || c.extractedFields?.['End Date'] || c.extractedFields?.expirationDate;
      if (endDateRaw) {
        const endDateStr = typeof endDateRaw === 'object' ? (endDateRaw.value || endDateRaw.text) : endDateRaw;
        if (typeof endDateStr === 'string') {
          const match = endDateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
          if (match) {
            const targetUtc = Date.UTC(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
            const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
            const diffDays = Math.round((targetUtc - todayUtc) / (1000 * 60 * 60 * 24));
            if (diffDays <= 30 && diffDays > 0) {
              upcomingRenewalsCount++;
            }
          }
        }
      }
    });

    return {
      total: contracts.length,
      approved: approvedCount,
      highRisk: highRiskCount,
      pending: pendingActions.length,
      renewals: upcomingRenewalsCount,
    };
  }, [contracts, pendingActions, role]);

  const recentContracts = useMemo(() => {
    return [...contracts].slice(0, 5);
  }, [contracts]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Welcome Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, var(--ciq-brand-deep) 0%, #2B311E 100%)',
          borderRadius: 'var(--ciq-radius-xl)',
          padding: '2rem 2.25rem',
          color: 'var(--ciq-text-inverse)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1.5rem',
          boxShadow: 'var(--ciq-shadow-card)',
        }}
      >
        <div>
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#B4C097',
            }}
          >
            WORKSPACE OVERVIEW
          </span>
          <h1
            style={{
              fontFamily: 'var(--ciq-font-serif)',
              fontSize: '2rem',
              fontWeight: 400,
              margin: '0.35rem 0 0.5rem',
              color: '#FAF7F0',
            }}
          >
            Welcome back, {session?.user?.name || 'Reviewer'}
          </h1>
          <p
            style={{
              margin: 0,
              color: '#D8DEC9',
              fontSize: '0.95rem',
              maxWidth: '540px',
              lineHeight: 1.5,
            }}
          >
            Track contract intelligence, monitor compliance deviations, and review agent-guided action proposals.
          </p>
        </div>

        {['Admin', 'Reviewer'].includes(role) && onOpenUpload && (
          <Button
            variant="secondary"
            icon={Upload}
            onClick={onOpenUpload}
            style={{
              backgroundColor: '#FAF7F0',
              color: 'var(--ciq-brand-deep)',
              border: 'none',
              fontWeight: 600,
            }}
          >
            Upload Contract
          </Button>
        )}
      </div>

      {/* 4 Summary Stat Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1.25rem',
        }}
      >
        {/* Total Approved Contracts */}
        <div
          className="ciq-card"
          onClick={() => onNavigate && onNavigate('contracts', 'Approved')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onNavigate && onNavigate('contracts', 'Approved');
            }
          }}
          style={{
            padding: '1.5rem',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            cursor: 'pointer',
          }}
          title="View approved contracts"
        >
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--ciq-text-muted)', fontWeight: 600 }}>
              Total Approved Contracts
            </span>
            <div
              style={{
                fontFamily: 'var(--ciq-font-serif)',
                fontSize: '2.4rem',
                fontWeight: 600,
                color: 'var(--ciq-text-title)',
                marginTop: '0.35rem',
              }}
            >
              {metrics.approved}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--ciq-brand-subtle)', fontWeight: 500 }}>
              {role === 'Viewer' ? 'Approved repository' : 'Approved in workspace'}
            </span>
          </div>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--ciq-radius-lg)',
              backgroundColor: 'var(--ciq-brand-tint)',
              color: 'var(--ciq-brand-primary)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <FileText size={22} />
          </div>
        </div>

        {/* High Risk Count */}
        <div
          className="ciq-card"
          style={{
            padding: '1.5rem',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--ciq-text-muted)', fontWeight: 600 }}>
              High Risk Findings
            </span>
            <div
              style={{
                fontFamily: 'var(--ciq-font-serif)',
                fontSize: '2.4rem',
                fontWeight: 600,
                color: metrics.highRisk > 0 ? 'var(--ciq-danger-text)' : 'var(--ciq-text-title)',
                marginTop: '0.35rem',
              }}
            >
              {metrics.highRisk}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--ciq-text-muted)', fontWeight: 500 }}>
              Major or critical flags
            </span>
          </div>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--ciq-radius-lg)',
              backgroundColor: 'var(--ciq-danger-bg)',
              color: 'var(--ciq-danger-text)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <ShieldAlert size={22} />
          </div>
        </div>

        {/* Pending Items */}
        <div
          className="ciq-card"
          style={{
            padding: '1.5rem',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--ciq-text-muted)', fontWeight: 600 }}>
              Pending Approvals
            </span>
            <div
              style={{
                fontFamily: 'var(--ciq-font-serif)',
                fontSize: '2.4rem',
                fontWeight: 600,
                color: metrics.pending > 0 ? 'var(--ciq-warning-text)' : 'var(--ciq-text-title)',
                marginTop: '0.35rem',
              }}
            >
              {metrics.pending}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--ciq-text-muted)', fontWeight: 500 }}>
              Awaiting governance action
            </span>
          </div>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--ciq-radius-lg)',
              backgroundColor: 'var(--ciq-warning-bg)',
              color: 'var(--ciq-warning-text)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Clock size={22} />
          </div>
        </div>

        {/* Upcoming Renewals */}
        <div
          className="ciq-card"
          style={{
            padding: '1.5rem',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--ciq-text-muted)', fontWeight: 600 }}>
              Upcoming Renewals
            </span>
            <div
              style={{
                fontFamily: 'var(--ciq-font-serif)',
                fontSize: '2.4rem',
                fontWeight: 600,
                color: 'var(--ciq-text-title)',
                marginTop: '0.35rem',
              }}
            >
              {metrics.renewals}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--ciq-text-muted)', fontWeight: 500 }}>
              Expiring within 30 days
            </span>
          </div>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--ciq-radius-lg)',
              backgroundColor: 'var(--ciq-info-bg)',
              color: 'var(--ciq-info-text)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Calendar size={22} />
          </div>
        </div>
      </div>

      {/* Clean Recent Contracts Table */}
      <Card
        title="Recent Contracts"
        subtitle="Latest agreements uploaded and evaluated in this workspace"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigate('contracts')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <span>View All</span>
            <ArrowRight size={15} />
          </Button>
        }
      >
        {recentContracts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--ciq-text-muted)' }}>
            No contracts available yet.
          </div>
        ) : (
          <div className="ciq-table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
            <table className="ciq-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Counterparty</th>
                  <th>Status</th>
                  <th>Compliance & Risk</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentContracts.map((contract) => {
                  const report = contract.complianceReport;
                  return (
                    <tr
                      key={contract._id}
                      className="ciq-table-clickable-row"
                      onClick={() => {
                        onSelectContract(contract._id);
                        onNavigate('contracts');
                      }}
                    >
                      <td style={{ fontWeight: 600, color: 'var(--ciq-text-title)' }}>
                        {contract.title}
                      </td>
                      <td>{contract.counterparty || '—'}</td>
                      <td>
                        <RiskBadge status={contract.status} />
                      </td>
                      <td>
                        {report ? (
                          <RiskBadge
                            severity={report.overallStatus}
                            score={report.overallRiskScore}
                          />
                        ) : (
                          <span style={{ color: 'var(--ciq-text-subtle)', fontSize: '0.8rem' }}>
                            {contract.status === 'Failed' ? 'Evaluation Failed' : 'Pending Evaluation'}
                          </span>
                        )}
                      </td>
                      <td style={{ color: 'var(--ciq-text-muted)', fontSize: '0.82rem' }}>
                        {new Date(contract.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
