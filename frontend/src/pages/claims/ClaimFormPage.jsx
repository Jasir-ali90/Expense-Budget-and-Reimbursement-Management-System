import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { categoryApi, claimApi } from '../../api';
import { useApiQuery } from '../../hooks/useApi';
import { AsyncBoundary, InlineAlert } from '../../components/StateViews';
import FileUpload from '../../components/FileUpload';
import useToast from '../../hooks/useToast';
import { formatMoney, toInputDate } from '../../utils/format';

/** One row of the claim item editor (extracted to keep the page readable). */
const ItemFields = ({ item, errors, category, categoryOptions, onChange }) => (
  <div className="form-grid form-grid--2">
    <label className="field">
      <span className="field__label">
        Date<span className="req">*</span>
      </span>
      <input
        type="date"
        className={`input${errors.date ? ' input--error' : ''}`}
        value={item.date}
        max={toInputDate(new Date())}
        onChange={(event) => onChange(item.key, { date: event.target.value })}
      />
      {errors.date ? <span className="field__error">{errors.date}</span> : null}
    </label>

    <label className="field">
      <span className="field__label">
        Category<span className="req">*</span>
      </span>
      <select
        className={`select${errors.category ? ' input--error' : ''}`}
        value={item.category}
        onChange={(event) => onChange(item.key, { category: event.target.value })}
      >
        <option value="">Select a category</option>
        {categoryOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {category ? (
        <span className="field__hint">
          {category.requiresReceipt ? 'Receipt required' : 'No receipt required'}
          {category.maxClaimAmount ? ` · claim limit ${formatMoney(category.maxClaimAmount)}` : ''}
        </span>
      ) : null}
      {errors.category ? <span className="field__error">{errors.category}</span> : null}
    </label>

    <label className="field">
      <span className="field__label">
        Description<span className="req">*</span>
      </span>
      <input
        className={`input${errors.description ? ' input--error' : ''}`}
        value={item.description}
        maxLength={500}
        placeholder="What was purchased?"
        onChange={(event) => onChange(item.key, { description: event.target.value })}
      />
      {errors.description ? <span className="field__error">{errors.description}</span> : null}
    </label>

    <label className="field">
      <span className="field__label">Merchant (optional)</span>
      <input
        className="input"
        value={item.merchant}
        maxLength={150}
        onChange={(event) => onChange(item.key, { merchant: event.target.value })}
      />
    </label>

    <label className="field">
      <span className="field__label">
        Amount<span className="req">*</span>
      </span>
      <input
        type="number"
        min="0.01"
        step="0.01"
        className={`input${errors.requestedAmount ? ' input--error' : ''}`}
        value={item.requestedAmount}
        onChange={(event) => onChange(item.key, { requestedAmount: event.target.value })}
      />
      {errors.requestedAmount ? <span className="field__error">{errors.requestedAmount}</span> : null}
    </label>

    <FileUpload
      label="Receipt"
      required={Boolean(category?.requiresReceipt)}
      existingFile={item.existingReceipt}
      currentFile={item.receiptFile}
      error={errors.receipt}
      onFileSelected={(file) => onChange(item.key, { receiptFile: file })}
    />
  </div>
);

/** A blank claim item row. */
const blankItem = () => ({
  key: `item-${Math.random().toString(36).slice(2, 9)}`,
  _id: null,
  date: toInputDate(new Date()),
  category: '',
  description: '',
  merchant: '',
  requestedAmount: '',
  receiptFile: null,
  existingReceipt: null,
});

/**
 * Create / edit a reimbursement claim.
 *
 * Draft and Returned claims can be edited by their owner; everything else is
 * read only (the backend refuses the write, and this screen hides the actions).
 * Receipts are uploaded per item after the draft exists, because the upload
 * endpoint is scoped to a claim item.
 */
const ClaimFormPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({ title: '', purpose: '', items: [blankItem()] });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(false);

  const categories = useApiQuery(() => categoryApi.list({ limit: 100 }), []);
  const claimQuery = useApiQuery(() => claimApi.get(id), [id], { immediate: isEdit });

  const categoryOptions = useMemo(() => {
    const items = categories.data?.items || [];
    return items.map((category) => ({
      value: category._id,
      label: `${category.name}${category.maxClaimAmount ? ` (max ${category.maxClaimAmount})` : ''}`,
      meta: category,
    }));
  }, [categories.data]);

  const categoryById = useMemo(() => {
    const map = new Map();
    (categories.data?.items || []).forEach((category) => map.set(String(category._id), category));
    return map;
  }, [categories.data]);

  // Populate the form when editing an existing claim.
  useEffect(() => {
    const claim = claimQuery.data?.claim;
    if (!claim) return;
    setForm({
      title: claim.title || '',
      purpose: claim.purpose || '',
      items:
        (claim.items || []).length > 0
          ? claim.items.map((item) => ({
              key: `item-${item._id}`,
              _id: item._id,
              date: toInputDate(item.date),
              category: String(item.category?._id || item.category || ''),
              description: item.description || '',
              merchant: item.merchant || '',
              requestedAmount: String(item.requestedAmount ?? ''),
              receiptFile: null,
              existingReceipt: item.receipt || null,
            }))
          : [blankItem()],
    });
  }, [claimQuery.data]);

  const claim = claimQuery.data?.claim;
  const editable = !isEdit || ['Draft', 'Returned'].includes(claim?.status);

  const updateItem = useCallback((key, patch) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    }));
  }, []);

  const addItem = () => setForm((current) => ({ ...current, items: [...current.items, blankItem()] }));

  const removeItem = (key) =>
    setForm((current) => ({
      ...current,
      items: current.items.length === 1 ? current.items : current.items.filter((item) => item.key !== key),
    }));

  const total = useMemo(
    () =>
      form.items.reduce((sum, item) => {
        const value = Number(item.requestedAmount);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0),
    [form.items],
  );

  /** Client side validation mirroring the backend rules. */
  const validate = () => {
    const nextErrors = {};
    if (!form.title.trim()) nextErrors.title = 'A claim title is required';

    const itemErrors = {};
    form.items.forEach((item) => {
      const row = {};
      if (!item.date) row.date = 'Date is required';
      if (!item.category) row.category = 'Category is required';
      if (!item.description.trim()) row.description = 'Description is required';

      const amount = Number(item.requestedAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        row.requestedAmount = 'Enter an amount greater than 0';
      } else {
        const category = categoryById.get(String(item.category));
        if (category?.maxClaimAmount && amount > category.maxClaimAmount) {
          row.requestedAmount = `This category allows a maximum of ${formatMoney(category.maxClaimAmount)}`;
        }
        if (category?.requiresReceipt && !item.receiptFile && !item.existingReceipt) {
          row.receipt = `A receipt is required for ${category.name}`;
        }
      }
      if (Object.keys(row).length > 0) itemErrors[item.key] = row;
    });

    if (Object.keys(itemErrors).length > 0) nextErrors.items = itemErrors;
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const buildPayload = () => ({
    title: form.title.trim(),
    purpose: form.purpose.trim() || undefined,
    items: form.items.map((item) => ({
      ...(item._id ? { _id: item._id } : {}),
      date: item.date,
      category: item.category,
      description: item.description.trim(),
      merchant: item.merchant.trim() || undefined,
      requestedAmount: Number(item.requestedAmount),
    })),
  });

  /**
   * Persist the claim, upload any pending receipts and optionally submit it.
   * The API is always the final authority - a rejected save surfaces the
   * backend message instead of a generic failure.
   */
  const persist = async ({ submitAfter = false } = {}) => {
    if (!validate()) {
      toast.warning('Check the form', 'Some required fields need your attention.');
      return;
    }
    setBusy(true);
    try {
      const payload = buildPayload();
      const saved = isEdit
        ? await claimApi.update(id, payload)
        : await claimApi.create(payload);

      let savedClaim = saved.claim || saved;
      const claimId = savedClaim._id;

      // Upload receipts: for a new claim the returned item order matches the
      // payload order, so index i maps to payload item i.
      const savedItems = savedClaim.items || [];
      const pendingUploads = form.items
        .map((item, index) => ({ item, savedItem: savedItems[index] }))
        .filter(({ item, savedItem }) => item.receiptFile && savedItem);

      if (pendingUploads.length > 0) {
        setUploadProgress(true);
        for (const { item, savedItem } of pendingUploads) {
          // Sequential so a single failure leaves earlier receipts intact.
          // eslint-disable-next-line no-await-in-loop
          const uploaded = await claimApi.uploadItemReceipt(claimId, savedItem._id, item.receiptFile);
          savedClaim = uploaded.claim || uploaded;
        }
        setUploadProgress(false);
      }

      if (submitAfter) {
        const submitted = await claimApi.submit(claimId);
        savedClaim = submitted.claim || submitted;
        toast.success(
          'Claim submitted',
          `${savedClaim.claimNo} is now with ${
            savedClaim.assignedToName || 'the Finance Manager'
          } for review.`,
        );
      } else {
        toast.success('Draft saved', `${savedClaim.claimNo} was saved as a draft.`);
      }

      navigate(`/claims/${claimId}`);
    } catch (error) {
      setUploadProgress(false);
      toast.error('Could not save the claim', error.message);
    } finally {
      setBusy(false);
    }
  };

  if (isEdit && claimQuery.loading) {
    return <AsyncBoundary loading />;
  }

  if (isEdit && claimQuery.error) {
    return (
      <AsyncBoundary
        error={claimQuery.error}
        onRetry={claimQuery.reload}
        loading={false}
      />
    );
  }

  if (isEdit && claim && !editable) {
    return (
      <div className="card">
        <InlineAlert tone="warning">
          A claim in status <strong>{claim.status}</strong> is read only. Only draft or returned claims
          can be edited.
        </InlineAlert>
        <Link className="btn btn--secondary" to={`/claims/${id}`}>
          Back to claim
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{isEdit ? `Edit claim ${claim?.claimNo || ''}` : 'New reimbursement claim'}</h1>
          <p className="page-header__sub">
            Save as a draft at any time. Submitted claims become read only until Finance returns them.
          </p>
        </div>
        <Link className="btn btn--secondary" to={isEdit ? `/claims/${id}` : '/claims'}>
          Cancel
        </Link>
      </div>

      {Object.keys(errors).length > 0 ? (
        <InlineAlert tone="error">Please fix the highlighted fields before saving.</InlineAlert>
      ) : null}

      <div className="card">
        <div className="card__header">
          <h2 className="card__title">Claim details</h2>
        </div>
        <div className="form-grid form-grid--2">
          <label className="field">
            <span className="field__label">
              Title<span className="req">*</span>
            </span>
            <input
              className={`input${errors.title ? ' input--error' : ''}`}
              value={form.title}
              maxLength={160}
              placeholder="e.g. Client visit travel - September"
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            />
            {errors.title ? <span className="field__error">{errors.title}</span> : null}
          </label>
          <label className="field">
            <span className="field__label">Purpose (optional)</span>
            <input
              className="input"
              value={form.purpose}
              maxLength={500}
              placeholder="Short justification"
              onChange={(event) => setForm((current) => ({ ...current, purpose: event.target.value }))}
            />
          </label>
        </div>
      </div>

      <div className="card">
        <div className="card__header">
          <h2 className="card__title">Expense items</h2>
          <div className="inline">
            <strong>{formatMoney(total)}</strong>
            <span className="small muted">client side preview - the server calculates the official total</span>
          </div>
        </div>

        <div className="stack">
          {form.items.map((item, index) => {
            const rowErrors = errors.items?.[item.key] || {};
            const category = categoryById.get(String(item.category));

            return (
              <div key={item.key} className="card" style={{ boxShadow: 'none' }}>
                <div className="card__header">
                  <h3 className="card__title">Item {index + 1}</h3>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => removeItem(item.key)}
                    disabled={form.items.length === 1}
                  >
                    Remove
                  </button>
                </div>
                <ItemFields
                  item={item}
                  index={index}
                  errors={rowErrors}
                  category={category}
                  categoryOptions={categoryOptions}
                  onChange={updateItem}
                />
              </div>
            );
          })}
        </div>

        <div className="btn-row mt-2">
          <button type="button" className="btn btn--secondary" onClick={addItem}>
            Add another item
          </button>
        </div>
      </div>

      <div className="card">
        <div className="btn-row">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => persist({ submitAfter: false })}
            disabled={busy}
          >
            {busy && !uploadProgress ? 'Saving…' : 'Save as draft'}
          </button>
          <button type="button" className="btn" onClick={() => persist({ submitAfter: true })} disabled={busy}>
            {uploadProgress ? 'Uploading receipts…' : busy ? 'Working…' : 'Save and submit'}
          </button>
        </div>
        <p className="small muted mt-1">
          Receipts are validated on the server (type and size). Submitting locks the claim for editing.
        </p>
      </div>
    </>
  );
};

export default ClaimFormPage;
