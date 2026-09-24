# Expense, Budget & Reimbursement Management System - API reference

Local REST API for the MERN build. Base URL: `http://localhost:5000/api`.
Run the backend with `npm run dev` (in `backend/`) and seed demo data with `npm run seed`.

## Conventions

- **Auth** - `Authorization: Bearer <JWT>` from `POST /api/auth/login`.
- **Success envelope** - `{ "success": true, "message"?: string, "data": any, "meta"?: object }`
- **Error envelope** - `{ "success": false, "message": string, "errors"?: array }`
- **Lists** accept `page`, `limit` (max 100), `search`, `sort=field:asc|desc` plus the filters
  documented per endpoint. Paginated payloads add `meta: { page, limit, total, totalPages, hasNextPage, hasPrevPage }`.
- **Uploads** use `multipart/form-data`. Receipts / invoices accept JPG, PNG and PDF up to 5 MB
  (env `MAX_FILE_SIZE`). Profile pictures accept JPG, PNG and WEBP up to 2 MB (env `MAX_AVATAR_SIZE`).
  Stored files are served read-only from `/uploads/<fileName>`.
- **Exports** - append `?format=csv` (spreadsheet friendly, opens in Excel / Sheets) or
  `?format=pdf` to any exportable endpoint. The PDF is a report grade document: gradient brand
  band with the product mark and an "INTERNAL USE" badge, KPI summary cards, accent table header
  with column separators, zebra rows, coloured status pills, progress bars for percentage
  columns, an optional bold totals row, "Page x of y" footers and a low opacity watermark.
  Exports always contain every record matching the filters, not just the current page.
  Both writers are hand written (`utils/csv.js`, `utils/pdf.js`), so no PDF dependency is needed.
- **Caching** - API responses are never cached (`Cache-Control: no-store`, no ETag), so polling
  endpoints such as the notification badge always return a real `200` body.

## Health & docs

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/health` | public | liveness probe + database name |
| GET | `/docs` | public | pointer to this document |

## Auth

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| POST | `/auth/login` | public | `{ email, password }` -> `{ token, expiresAt, user }` |
| GET | `/auth/me` | any signed in | current user |
| POST | `/auth/logout` | any signed in | stateless acknowledgement |
| POST | `/auth/change-password` | any signed in | `{ currentPassword, newPassword }` |

## Users

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/users` | Admin, Finance Manager | `search, role, department, isActive, page, limit, sort` |
| GET | `/users/:id` | Admin, Finance Manager | single user |
| POST | `/users` | Admin | `{ name, email, password, role, department?, employeeCode?, designation?, phone? }` |
| PUT | `/users/:id` | Admin | name, role, department, designation, phone, employee code |
| PATCH | `/users/:id/status` | Admin | `{ isActive, reason }` - reason is mandatory when deactivating; the last active admin is protected |
| POST | `/users/:id/reset-password` | Admin | `{ newPassword }` - forces a change at next sign in |
| POST | `/users/me/avatar` | any signed in | multipart field `avatar` (JPG/PNG/WEBP, 2 MB). Replaces the previous picture and deletes the old file |
| DELETE | `/users/me/avatar` | any signed in | removes the stored picture and its file |

## Departments and categories

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/departments` | any signed in | `search, isActive, page, limit, sort` |
| GET | `/departments/:id` | any signed in | |
| POST | `/departments` | Admin | `{ name, code?, description?, manager? }` |
| PUT | `/departments/:id` | Admin | |
| PATCH | `/departments/:id/archive` | Admin | `{ reason? }` - blocked while the department is in use |
| PATCH | `/departments/:id/restore` | Admin | |
| GET | `/categories` | any signed in | `search, isActive, page, limit, sort` |
| GET | `/categories/:id` | any signed in | |
| POST | `/categories` | Admin | `{ name, description?, maxClaimAmount?, receiptRequired? }` |
| PUT | `/categories/:id` | Admin | |
| PATCH | `/categories/:id/archive` | Admin | `{ reason? }` |
| PATCH | `/categories/:id/restore` | Admin | |

## Budgets

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/budgets` | Admin, Finance Manager | `search, department, category, periodType, period, state, page, limit, sort`. Each row carries derived `usage` (allocated / used / committed / remaining / percentages) |
| GET | `/budgets/:id` | Admin, Finance Manager | |
| POST | `/budgets` | Admin | `{ department, category, periodType, period, allocatedAmount, warningThresholdPercent? }` - unique per department + category + period |
| POST | `/budgets/:id/revise` | Admin | `{ allocatedAmount, reason }` - reason mandatory, fully audited |
| DELETE | `/budgets/:id` | Admin | blocked once spending exists |

## Expenses (direct company spending)

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/expenses` | Admin, Finance Manager | `search, department, category, status, paymentMethod, from, to, minAmount, maxAmount, page, limit, sort`; add `format=csv\|pdf` to export every matching record |
| GET | `/expenses/:id` | Admin, Finance Manager | includes adjustments |
| POST | `/expenses` | Admin, Finance Manager | multipart, optional `receipt` field |
| PUT | `/expenses/:id` | Admin, Finance Manager | multipart, optional replacement `receipt` |
| DELETE | `/expenses/:id` | Admin | |
| POST | `/expenses/:id/submit` | Admin, Finance Manager | Draft -> Submitted |
| POST | `/expenses/:id/approve` | Admin, Finance Manager | `{ approvedAmount?, comment? }` |
| POST | `/expenses/:id/reject` | Admin, Finance Manager | `{ reason }` |
| POST | `/expenses/:id/pay` | Admin, Finance Manager | `{ amount, paymentMethod, reference?, paidAt? }` |
| POST | `/expenses/:id/adjustments` | Admin, Finance Manager | `{ amount, reason }` |

## Claims (employee reimbursements)

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/claims` | any signed in | employees are scoped to their own claims. `search, status, department, category, employee, from, to, page, limit, sort` |
| GET | `/claims/:id` | any signed in | ownership enforced in the service layer |
| POST | `/claims` | Employee, Admin | `{ title, department?, items: [...] }` |
| PUT | `/claims/:id` | owner (draft / returned) | same shape as create |
| DELETE | `/claims/:id` | owner (draft) | |
| POST | `/claims/:id/submit` | owner | validates items, receipts and category limits |
| POST | `/claims/:id/approve` | Finance Manager, Admin | `{ items?, comment? }` - partial approval supported |
| POST | `/claims/:id/reject` | Finance Manager, Admin | `{ reason }` |
| POST | `/claims/:id/return` | Finance Manager, Admin | `{ reason }` - back to the employee |
| POST | `/claims/:id/request-receipt` | Finance Manager, Admin | `{ reason }` |
| POST | `/claims/:id/reassign` | Admin | `{ financeManagerId, reason }` |
| POST | `/claims/:id/payments` | Finance Manager, Admin | `{ amount, paymentMethod, reference?, paidAt? }` - partial payments allowed |
| POST | `/claims/:id/adjustments` | Finance Manager, Admin | `{ amount, reason }` |
| POST | `/claims/:id/items/:itemId/receipt` | owner / Finance | multipart field `receipt` |
| GET | `/claims/finance-managers` | Admin | finance managers for reassignment |

Nobody can approve their own claim: the service rejects it even for Admins.

## Notifications

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/notifications` | any signed in | own notifications only; `isRead, type, search, page, limit, sort`; `meta.unread` included |
| GET | `/notifications/unread-count` | any signed in | `{ unread }` - polled by the header badge (never cached, always 200) |
| PATCH | `/notifications/:id/read` | owner | |
| PATCH | `/notifications/read-all` | any signed in | |
| DELETE | `/notifications/:id` | owner | |

## Audit log (append-only)

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/audit-logs` | Admin, Finance Manager | `search, entityType, entityId, action, performedBy, from, to, page, limit, sort` |
| GET | `/audit-logs/entity/:entityType/:entityId` | Admin, Finance Manager | full history of one record |
| GET | `/audit-logs/export?format=csv\|pdf` | Admin, Finance Manager | filtered export (CSV is the default when no format is given) |

## Dashboard

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/dashboard` | any signed in | role scoped payload: budgets, claims by status, monthly trend, top categories / vendors, recent activity |

## Reports

Every report endpoint accepts the shared filter vocabulary
(`from, to, department, category, status, employee, search`) and returns
`{ window, rows }` plus `totals` where meaningful. Append `?format=csv` (spreadsheet) or
`?format=pdf` (branded, printable) to any of them to download exactly the filtered result set.
The Expenses, Claims and Budget usage reports are rendered in landscape because of their
column count.

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/reports/expenses` | Admin, Finance Manager | one row per direct expense + `totals` |
| GET | `/reports/claims` | Admin, Finance Manager | one row per claim + `totals` |
| GET | `/reports/approval-summary` | Admin, Finance Manager | claims grouped by status plus `approvedTotal`, `rejectedTotal`, `pendingTotal`, `approvalRate` |
| GET | `/reports/budget-usage` | Admin, Finance Manager | `periodType`, `period`; rows carry allocated / used / committed / remaining / usagePercent / state |
| GET | `/reports/monthly-trend` | Admin, Finance Manager | direct expenses vs approved reimbursements per month |
| GET | `/reports/top-categories` | Admin, Finance Manager | `limit` (max 50) |
| GET | `/reports/top-vendors` | Admin, Finance Manager | `limit` (max 50) |
| GET | `/reports/employee-reimbursements` | any signed in | employees see only their own history |

## Settings

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/settings` | any signed in | currency, thresholds, SLA days, claim defaults |
| PUT | `/settings` | Admin | audited as `UPDATE_SETTINGS` |

## Roles at a glance

| Role | Can do |
| --- | --- |
| Admin | everything, including user / department / category / budget / settings management and the audit log |
| Finance Manager | review, approve, reject, return, pay and adjust claims and expenses; manage budgets; run reports; read the audit log |
| Employee | create and track own reimbursement claims, upload receipts, see own history and notifications |


