import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { categoryApi, departmentApi, expenseApi } from '../../api';
import { useApiQuery } from '../../hooks/useApi';
import { InlineAlert } from '../../components/StateViews';
import FileUpload from '../../components/FileUpload';
import { PAYMENT_METHODS, RECURRING_LABELS } from '../../utils/options';
import { toInputDate } from '../../utils/format';
import useToast from '../../hooks/useToast';

/**
 * Record / edit a direct company expense.
 * Recurring expenses are *labelled* only - the system never auto-creates
 * future transactions, exactly as the brief requires.
 */
const ExpenseFormPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({
    date: toInputDate(new Date()),
    vendor: '',
    category: '',
    department: '',
    description: '',
    amount: '',
    paymentMethod: 'Bank Transfer',
    recurringLabel: 'None',
  });
  const [receiptFile, setReceiptFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const departments = useApiQuery(() => departmentApi.list({ limit: 100 }), []);
  const categories = useApiQuery(() => categoryApi.list({ limit: 100 }), []);
  const expenseQuery = useApiQuery(() => expenseApi.get(id), [id], { immediate: isEdit });

  useEffect(() => {
    const expense = expenseQuery.data?.expense;
    if (!expense) return;
    setForm({
      date: toInputDate(expense.date),
      vendor: expense.vendor || '',
      category: String(expense.category?._id || expense.category || ''),
      department: String(expense.department?._id || expense.department || ''),
      description: expense.description || '',
      amount: String(expense.amount ?? ''),
      paymentMethod: expense.paymentMethod || 'Bank Transfer',
      recurringLabel: expense.recurringLabel || 'None',
    });
  }, [expenseQuery.data]);

  const expense = expenseQuery.data?.expense;
  const isDraft = !isEdit || expense?.status === 'Draft';
  const selectedCategory = (categories.data?.items || []).find(
    (category) => String(category._id) === String(form.category),
  );

  const validate = () => {
    const next = {};
    if (!form.date) next.date = 'Date is required';
    if (!form.vendor.trim()) next.vendor = 'Vendor is required';
    if (!form.category) next.category = 'Category is required';
    if (!form.department) next.department = 'Department is required';
    if (!form.description.trim()) next.description = 'Description is required';
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) next.amount = 'Enter an amount greater than 0';
    if (selectedCategory?.requiresReceipt && !receiptFile && !expense?.receipt) {
      next.receipt = `A receipt is required for ${selectedCategory.name}`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async ({ submitAfter = false } = {}) => {
    if (!validate()) {
      toast.warning('Check the form', 'Some required fields need your attention.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        date: form.date,
        vendor: form.vendor.trim(),
        category: form.category,
        department: form.department,
        description: form.description.trim(),
        amount: Number(form.amount),
        paymentMethod: form.paymentMethod,
        recurringLabel: form.recurringLabel,
      };

      const saved = isEdit ? await expenseApi.update(id, payload) : await expenseApi.create(payload);
      const expenseId = (saved.expense || saved)._id;

      if (receiptFile) {
        await expenseApi.uploadReceipt(expenseId, receiptFile);
      }
      if (submitAfter) {
        await expenseApi.submit(expenseId);
        toast.success('Expense submitted', 'The expense is awaiting approval.');
      } else {
        toast.success('Expense saved', 'The record was saved as a draft.');
      }
      navigate(`/expenses/${expenseId}`);
    } catch (error) {
      toast.error('Could not save the expense', error.message);
    } finally {
      setBusy(false);
    }
  };

  if (isEdit && expenseQuery.loading) {
    return (
      <div className="state">
        <div className="spinner" />
        Loading expense…
      </div>
    );
  }

  if (isEdit && expense && !isDraft) {
    return (
      <div className="card">
        <InlineAlert tone="warning">
          Only draft expenses can be edited. This record is <strong>{expense.status}</strong> - use an
          adjustment instead of changing a posted record.
        </InlineAlert>
        <Link className="btn btn--secondary" to={`/expenses/${id}`}>
          Back to expense
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{isEdit ? `Edit expense ${expense?.expenseNo || ''}` : 'New company expense'}</h1>
          <p className="page-header__sub">
            Direct company spending. Receipts are validated on the server (JPG, PNG or PDF up to 5 MB).
          </p>
        </div>
        <Link className="btn btn--secondary" to={isEdit ? `/expenses/${id}` : '/expenses'}>
          Cancel
        </Link>
      </div>

      <div className="card">
        <div className="form-grid form-grid--2">
          <label className="field">
            <span className="field__label">
              Date<span className="req">*</span>
            </span>
            <input
              type="date"
              className={`input${errors.date ? ' input--error' : ''}`}
              value={form.date}
              max={toInputDate(new Date())}
              onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
            />
            {errors.date ? <span className="field__error">{errors.date}</span> : null}
          </label>

          <label className="field">
            <span className="field__label">
              Vendor<span className="req">*</span>
            </span>
            <input
              className={`input${errors.vendor ? ' input--error' : ''}`}
              value={form.vendor}
              maxLength={150}
              onChange={(event) => setForm((current) => ({ ...current, vendor: event.target.value }))}
            />
            {errors.vendor ? <span className="field__error">{errors.vendor}</span> : null}
          </label>

          <label className="field">
            <span className="field__label">
              Category<span className="req">*</span>
            </span>
            <select
              className={`select${errors.category ? ' input--error' : ''}`}
              value={form.category}
              onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
            >
              <option value="">Select a category</option>
              {(categories.data?.items || []).map((category) => (
                <option key={category._id} value={category._id}>
                  {category.name}
                  {category.requiresReceipt ? ' (receipt required)' : ''}
                </option>
              ))}
            </select>
            {errors.category ? <span className="field__error">{errors.category}</span> : null}
          </label>

          <label className="field">
            <span className="field__label">
              Department<span className="req">*</span>
            </span>
            <select
              className={`select${errors.department ? ' input--error' : ''}`}
              value={form.department}
              onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))}
            >
              <option value="">Select a department</option>
              {(departments.data?.items || []).map((department) => (
                <option key={department._id} value={department._id}>
                  {department.name}
                  {department.isArchived ? ' (archived)' : ''}
                </option>
              ))}
            </select>
            {errors.department ? <span className="field__error">{errors.department}</span> : null}
          </label>

          <label className="field">
            <span className="field__label">
              Amount<span className="req">*</span>
            </span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              className={`input${errors.amount ? ' input--error' : ''}`}
              value={form.amount}
              onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
            />
            {errors.amount ? <span className="field__error">{errors.amount}</span> : null}
          </label>

          <label className="field">
            <span className="field__label">
              Payment method<span className="req">*</span>
            </span>
            <select
              className="select"
              value={form.paymentMethod}
              onChange={(event) => setForm((current) => ({ ...current, paymentMethod: event.target.value }))}
            >
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </label>

          <FieldsRest
            form={form}
            setForm={setForm}
            errors={errors}
            expense={expense}
            receiptFile={receiptFile}
            setReceiptFile={setReceiptFile}
            selectedCategory={selectedCategory}
          />
        </div>
      </div>

      <div className="card">
        <div className="btn-row">
          <button type="button" className="btn btn--secondary" onClick={() => save({})} disabled={busy}>
            {busy ? 'Saving…' : 'Save as draft'}
          </button>
          <button type="button" className="btn" onClick={() => save({ submitAfter: true })} disabled={busy}>
            Save and submit
          </button>
        </div>
      </div>
    </>
  );
};

/**
 * Remaining expense fields (recurring label, description, receipt upload).
 * Extracted so the page stays within a readable size.
 */
const FieldsRest = ({ form, setForm, errors, expense, receiptFile, setReceiptFile, selectedCategory }) => (
  <>
    <label className="field">
      <span className="field__label">Recurring label</span>
      <select
        className="select"
        value={form.recurringLabel}
        onChange={(event) => setForm((current) => ({ ...current, recurringLabel: event.target.value }))}
      >
        {RECURRING_LABELS.map((label) => (
          <option key={label} value={label}>
            {label}
          </option>
        ))}
      </select>
      <span className="field__hint">
        Labels only - the system never creates future transactions automatically.
      </span>
    </label>

    <label className="field">
      <span className="field__label">
        Description<span className="req">*</span>
      </span>
      <input
        className={`input${errors.description ? ' input--error' : ''}`}
        value={form.description}
        maxLength={500}
        onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
      />
      {errors.description ? <span className="field__error">{errors.description}</span> : null}
    </label>

    <FileUpload
      label="Receipt or invoice"
      required={Boolean(selectedCategory?.requiresReceipt)}
      existingFile={expense?.receipt}
      currentFile={receiptFile}
      error={errors.receipt}
      onFileSelected={setReceiptFile}
    />
  </>
);

export default ExpenseFormPage;

