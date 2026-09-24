import React, { useEffect, useState } from 'react';
import { settingApi } from '../../api';
import { useApiQuery } from '../../hooks/useApi';
import useToast from '../../hooks/useToast';
import { AsyncBoundary, InlineAlert } from '../../components/StateViews';
import { Checkbox, Select, TextInput } from '../../components/FormField';
import { formatDateTime } from '../../utils/format';

/**
 * System settings (Admin only).
 *
 * These values drive backend behaviour, not just the UI:
 *  - approvalSlaDays / approvalThresholdAmount decide routing and overdue flags,
 *  - defaultBudgetWarningPercent is copied into new budgets,
 *  - requireReceiptByDefault seeds new categories,
 *  - allowPartialApproval switches off item level partial approvals.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const toForm = (settings) => ({
  companyName: settings?.companyName ?? '',
  currency: settings?.currency ?? 'USD',
  currencySymbol: settings?.currencySymbol ?? '$',
  fiscalYearStartMonth: String(settings?.fiscalYearStartMonth ?? 1),
  defaultBudgetWarningPercent: String(settings?.defaultBudgetWarningPercent ?? 80),
  approvalSlaDays: String(settings?.approvalSlaDays ?? 3),
  approvalThresholdAmount: String(settings?.approvalThresholdAmount ?? 0),
  highValueThresholdAmount: String(settings?.highValueThresholdAmount ?? 0),
  allowPartialApproval: Boolean(settings?.allowPartialApproval ?? true),
  maxClaimItems: String(settings?.maxClaimItems ?? 20),
  requireReceiptByDefault: Boolean(settings?.requireReceiptByDefault ?? true),
  reminderBeforeDueDays: String(settings?.reminderBeforeDueDays ?? 1),
});

const SettingsPage = () => {
  const toast = useToast();
  const query = useApiQuery(() => settingApi.get(), []);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  // Seed the form once the settings arrive (and again after a save).
  useEffect(() => {
    if (query.data?.settings) setForm(toForm(query.data.settings));
  }, [query.data]);

  const set = (key) => (event) =>
    setForm((current) => ({
      ...current,
      [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
    }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await settingApi.update({
        companyName: form.companyName.trim(),
        currency: form.currency.trim().toUpperCase(),
        currencySymbol: form.currencySymbol.trim(),
        fiscalYearStartMonth: Number(form.fiscalYearStartMonth),
        defaultBudgetWarningPercent: Number(form.defaultBudgetWarningPercent),
        approvalSlaDays: Number(form.approvalSlaDays),
        approvalThresholdAmount: Number(form.approvalThresholdAmount),
        highValueThresholdAmount: Number(form.highValueThresholdAmount),
        allowPartialApproval: form.allowPartialApproval,
        maxClaimItems: Number(form.maxClaimItems),
        requireReceiptByDefault: form.requireReceiptByDefault,
        reminderBeforeDueDays: Number(form.reminderBeforeDueDays),
      });
      toast.success('Settings saved', 'The change was recorded in the audit log.');
      query.reload();
    } catch (caught) {
      toast.error('Could not save the settings', caught.message);
    } finally {
      setBusy(false);
    }
  };

  if (!form) {
    return (
      <AsyncBoundary
        loading={query.loading}
        error={query.error}
        onRetry={query.reload}
        loadingLabel="Loading settings…"
      />
    );
  }

  const settings = query.data?.settings;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>System settings</h1>
          <p className="page-header__sub">
            Currency, approval thresholds, SLA days and claim defaults used across the system.
          </p>
        </div>
        <button type="button" className="btn" form="settings-form" disabled={busy}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      </div>

      <InlineAlert tone="info">
        The high value threshold cannot be lower than the approval threshold, and the last active
        administrator can never be deactivated or demoted. Both rules are enforced by the API.
      </InlineAlert>

      <form id="settings-form" onSubmit={submit}>
        <div className="card">
          <div className="card__header">
            <h2 className="card__title">Organisation</h2>
          </div>
          <div className="form-grid form-grid--2">
            <TextInput label="Company name" required value={form.companyName} onChange={set('companyName')} maxLength={150} />
            <Select label="Currency" value={form.currency} onChange={set('currency')}
              options={['USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD', 'AUD', 'CAD'].map((code) => ({ value: code, label: code }))} />
            <TextInput label="Currency symbol" value={form.currencySymbol} onChange={set('currencySymbol')} maxLength={5} />
            <Select label="Fiscal year starts in" value={form.fiscalYearStartMonth} onChange={set('fiscalYearStartMonth')}
              options={MONTHS.map((name, index) => ({ value: String(index + 1), label: name }))} />
          </div>
        </div>

        <div className="card">
          <div className="card__header">
            <h2 className="card__title">Approvals and budgets</h2>
          </div>
          <div className="form-grid form-grid--2">
            <TextInput
              label="Approval threshold amount"
              type="number" min="0" step="0.01"
              hint="Claims above this amount are flagged as high value for Finance."
              value={form.approvalThresholdAmount} onChange={set('approvalThresholdAmount')}
            />
            <TextInput
              label="High value threshold amount"
              type="number" min="0" step="0.01"
              hint="Must be greater than or equal to the approval threshold."
              value={form.highValueThresholdAmount} onChange={set('highValueThresholdAmount')}
            />
            <TextInput
              label="Approval SLA (days)"
              type="number" min="1" max="60"
              hint="Claims waiting longer than this are marked overdue in the queue."
              value={form.approvalSlaDays} onChange={set('approvalSlaDays')}
            />
            <TextInput
              label="Default budget warning percent"
              type="number" min="1" max="200"
              hint="Copied into new budgets as their warning threshold."
              value={form.defaultBudgetWarningPercent} onChange={set('defaultBudgetWarningPercent')}
            />
            <TextInput
              label="Maximum claim items"
              type="number" min="1" max="100"
              value={form.maxClaimItems} onChange={set('maxClaimItems')}
            />
            <TextInput
              label="Reminder before due (days)"
              type="number" min="0" max="30"
              hint="Used for the pending approval reminder notifications."
              value={form.reminderBeforeDueDays} onChange={set('reminderBeforeDueDays')}
            />
          </div>
          <div className="stack mt-2">
            <Checkbox
              label="Allow partial approval at item level"
              hint="When off, Finance must approve or reject each claim in full."
              checked={form.allowPartialApproval}
              onChange={set('allowPartialApproval')}
            />
            <Checkbox
              label="Require a receipt by default for new categories"
              hint="Each category can still override this individually."
              checked={form.requireReceiptByDefault}
              onChange={set('requireReceiptByDefault')}
            />
          </div>
        </div>
      </form>

      {settings ? (
        <p className="small muted">
          Last updated {formatDateTime(settings.updatedAt)}
          {settings.updatedBy?.name ? ` by ${settings.updatedBy.name}` : ''}.
        </p>
      ) : null}
    </>
  );
};

export default SettingsPage;

