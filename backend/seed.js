/**
 * Seed script - deterministic, clearly fake sample data.
 * Wipes all application collections and rebuilds:
 *   users, departments, categories, settings, counters,
 *   budgets, direct expenses, claims, notifications, audit entries.
 *
 * Usage:  npm run seed
 * Test accounts (all fake):
 *   admin@company.local    / Admin@123
 *   finance@company.local  / Finance@123
 *   employee@company.local / Employee@123
 */
require('dotenv').config();
const path = require('path');
const { connectDB, disconnectDB } = require('./config/db');
const User = require('./models/User');
const Department = require('./models/Department');
const Category = require('./models/Category');
const Budget = require('./models/Budget');
const Expense = require('./models/Expense');
const Claim = require('./models/Claim');
const Setting = require('./models/Setting');
const Notification = require('./models/Notification');
const AuditLog = require('./models/AuditLog');
const counterService = require('./services/counterService');
const { currentPeriod } = require('./utils/period');
const { DEFAULT_SETTINGS, ROLES, CLAIM_STATUS, EXPENSE_STATUS, ITEM_STATUS, PAYMENT_STATUS, BUDGET_PERIOD_TYPE, REVIEW_ACTION } = require('./config/constants');

/** Sample receipt files produced by scripts/sample-receipts.js. */
const RECEIPT = (name) => path.join('uploads', 'samples', name);
const RECEIPTS = [
  RECEIPT('sample-receipt-1.png'),
  RECEIPT('sample-receipt-2.png'),
  RECEIPT('sample-receipt-4.png'),
  RECEIPT('sample-receipt-5.png'),
  RECEIPT('sample-invoice-3.png'),
  RECEIPT('sample-invoice-6.png'),
];

/** Date helper: N days before today. */
const daysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(12, 0, 0, 0);
  return date;
};

const run = async () => {
  console.log('[seed] connecting to database...');
  await connectDB();

  console.log('[seed] wiping collections...');
  await Promise.all([
    User.deleteMany({}),
    Department.deleteMany({}),
    Category.deleteMany({}),
    Budget.deleteMany({}),
    Expense.deleteMany({}),
    Claim.deleteMany({}),
    Setting.deleteMany({}),
    Notification.deleteMany({}),
    AuditLog.deleteMany({}),
    counterService.resetCounters(),
  ]);

  console.log('[seed] creating settings...');
  await Setting.create({ ...DEFAULT_SETTINGS });

  console.log('[seed] creating departments...');
  const engineering = await Department.create({
    name: 'Engineering',
    code: 'ENG',
    description: 'Product development (sample department)',
  });
  const marketing = await Department.create({
    name: 'Marketing',
    code: 'MKT',
    description: 'Marketing and events (sample department)',
  });
  const operations = await Department.create({
    name: 'Operations',
    code: 'OPS',
    description: 'Facilities and logistics (sample department)',
  });
  const archivedDept = await Department.create({
    name: 'Legacy Projects',
    code: 'LGC',
    description: 'Archived sample department kept for historical reports',
    isArchived: true,
    archivedAt: daysAgo(120),
    archiveReason: 'Sample archived department',
  });

  console.log('[seed] creating categories...');
  const travel = await Category.create({
    name: 'Travel',
    code: 'TRV',
    description: 'Flights, trains and taxis (sample category)',
    requiresReceipt: true,
    maxClaimAmount: 1000,
  });
  const meals = await Category.create({
    name: 'Meals',
    code: 'MEA',
    description: 'Business meals (sample category)',
    requiresReceipt: true,
    maxClaimAmount: 100,
  });
  const fuel = await Category.create({
    name: 'Fuel',
    code: 'FUL',
    description: 'Company vehicle fuel (sample category)',
    requiresReceipt: true,
    maxClaimAmount: 200,
  });
  const software = await Category.create({
    name: 'Software',
    code: 'SFT',
    description: 'Licences and subscriptions (sample category)',
    requiresReceipt: false,
    maxClaimAmount: 500,
  });
  const supplies = await Category.create({
    name: 'Office Supplies',
    code: 'OFC',
    description: 'Stationery and small equipment (sample category)',
    requiresReceipt: false,
    maxClaimAmount: null,
  });
  const archivedCategory = await Category.create({
    name: 'Client Entertainment',
    code: 'ENT',
    description: 'Archived sample category kept for historical records',
    requiresReceipt: true,
    maxClaimAmount: 300,
    isArchived: true,
    archivedAt: daysAgo(90),
    archiveReason: 'Sample archived category',
  });

  console.log('[seed] creating users...');
  const [admin, finance1, finance2] = await User.create([
    {
      name: 'System Admin',
      email: 'admin@company.local',
      password: 'Admin@123',
      role: ROLES.ADMIN,
      designation: 'Administrator',
      isActive: true,
    },
    {
      name: 'Fiona Finance',
      email: 'finance@company.local',
      password: 'Finance@123',
      role: ROLES.FINANCE_MANAGER,
      designation: 'Finance Manager',
      phone: '+10000000001',
      isActive: true,
    },
    {
      name: 'Farah Finance',
      email: 'finance2@company.local',
      password: 'Finance@123',
      role: ROLES.FINANCE_MANAGER,
      designation: 'Senior Finance Manager',
      phone: '+10000000002',
      isActive: true,
    },
  ]);

  const [employee1, employee2, employee3] = await User.create([
    {
      name: 'Ethan Engineering',
      email: 'employee@company.local',
      password: 'Employee@123',
      role: ROLES.EMPLOYEE,
      department: engineering._id,
      employeeCode: 'ENG-001',
      designation: 'Software Engineer',
      isActive: true,
    },
    {
      name: 'Mia Marketing',
      email: 'mia@company.local',
      password: 'Employee@123',
      role: ROLES.EMPLOYEE,
      department: marketing._id,
      employeeCode: 'MKT-001',
      designation: 'Marketing Specialist',
      isActive: true,
    },
    {
      name: 'Oliver Operations',
      email: 'oliver@company.local',
      password: 'Employee@123',
      role: ROLES.EMPLOYEE,
      department: operations._id,
      employeeCode: 'OPS-001',
      designation: 'Operations Coordinator',
      isActive: true,
    },
    {
      name: 'Riley Retired',
      email: 'riley@company.local',
      password: 'Employee@123',
      role: ROLES.EMPLOYEE,
      department: archivedDept._id,
      employeeCode: 'LGC-001',
      designation: 'Project Coordinator (former)',
      isActive: false,
      deactivatedAt: daysAgo(100),
      deactivationReason: 'Sample deactivated account',
    },
  ]);

  // Department managers (Finance Managers act as reviewers).
  engineering.manager = finance1._id;
  marketing.manager = finance2._id;
  operations.manager = finance1._id;
  await Promise.all([engineering.save(), marketing.save(), operations.save()]);

  console.log('[seed] creating budgets...');
  const month = currentPeriod(BUDGET_PERIOD_TYPE.MONTHLY);
  const lastMonthDate = new Date();
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

  await Budget.create([
    {
      department: engineering._id,
      category: travel._id,
      periodType: BUDGET_PERIOD_TYPE.MONTHLY,
      period: month,
      allocatedAmount: 5000,
      warningThresholdPercent: 80,
      createdBy: admin._id,
      history: [{ revisedBy: admin._id, revisedByName: 'System Admin', previousAmount: 0, newAmount: 5000, reason: 'Initial sample budget' }],
    },
    {
      department: engineering._id,
      category: meals._id,
      periodType: BUDGET_PERIOD_TYPE.MONTHLY,
      period: month,
      allocatedAmount: 800,
      warningThresholdPercent: 80,
      createdBy: admin._id,
    },
    {
      department: marketing._id,
      category: travel._id,
      periodType: BUDGET_PERIOD_TYPE.MONTHLY,
      period: month,
      allocatedAmount: 600,
      warningThresholdPercent: 80,
      createdBy: admin._id,
    },
    {
      department: operations._id,
      category: fuel._id,
      periodType: BUDGET_PERIOD_TYPE.MONTHLY,
      period: month,
      allocatedAmount: 400,
      warningThresholdPercent: 75,
      createdBy: admin._id,
    },
    {
      department: engineering._id,
      category: software._id,
      periodType: BUDGET_PERIOD_TYPE.YEARLY,
      period: String(new Date().getFullYear()),
      allocatedAmount: 12000,
      warningThresholdPercent: 85,
      createdBy: admin._id,
    },
    {
      department: engineering._id,
      category: supplies._id,
      periodType: BUDGET_PERIOD_TYPE.MONTHLY,
      period: lastMonth,
      allocatedAmount: 500,
      createdBy: admin._id,
    },
  ]);

  console.log('[seed] creating direct expenses...');
  const receiptRef = (file, size) => ({
    fileName: file,
    originalName: file,
    mimeType: 'image/png',
    size,
    url: `/uploads/samples/${file}`,
    extension: '.png',
  });

  await Expense.create([
    {
      expenseNo: await counterService.nextExpenseNumber(),
      date: daysAgo(10),
      vendor: 'Sample Cloud Hosting Co',
      category: software._id,
      categoryName: software.name,
      department: engineering._id,
      departmentName: engineering.name,
      description: 'Monthly hosting invoice (sample)',
      amount: 320,
      approvedAmount: 320,
      paymentMethod: 'Corporate Card',
      status: EXPENSE_STATUS.PAID,
      receipt: receiptRef('sample-invoice-3.png', 2554),
      submittedAt: daysAgo(9),
      approvedBy: finance1._id,
      approvedAt: daysAgo(9),
      paidBy: finance1._id,
      paidAt: daysAgo(8),
      paymentReference: 'SAMPLE-TXN-0001',
      createdBy: finance1._id,
    },
    {
      expenseNo: await counterService.nextExpenseNumber(),
      date: daysAgo(5),
      vendor: 'Sample Stationery Ltd',
      category: supplies._id,
      categoryName: supplies.name,
      department: marketing._id,
      departmentName: marketing.name,
      description: 'Printer paper and ink (sample)',
      amount: 85.5,
      approvedAmount: 85.5,
      paymentMethod: 'Cash',
      status: EXPENSE_STATUS.APPROVED,
      submittedAt: daysAgo(4),
      approvedBy: finance2._id,
      approvedAt: daysAgo(4),
      createdBy: finance2._id,
    },
    {
      expenseNo: await counterService.nextExpenseNumber(),
      date: daysAgo(2),
      vendor: 'Sample Fuel Stop',
      category: fuel._id,
      categoryName: fuel.name,
      department: operations._id,
      departmentName: operations.name,
      description: 'Delivery van fuel (sample)',
      amount: 60,
      paymentMethod: 'Corporate Card',
      status: EXPENSE_STATUS.SUBMITTED,
      submittedAt: daysAgo(2),
      createdBy: finance1._id,
    },
    {
      expenseNo: await counterService.nextExpenseNumber(),
      date: daysAgo(1),
      vendor: 'Sample Catering',
      category: meals._id,
      categoryName: meals.name,
      department: engineering._id,
      departmentName: engineering.name,
      description: 'Sprint review lunch (sample)',
      amount: 140,
      paymentMethod: 'Corporate Card',
      status: EXPENSE_STATUS.DRAFT,
      createdBy: finance1._id,
    },
    {
      expenseNo: await counterService.nextExpenseNumber(),
      date: daysAgo(45),
      vendor: 'Sample Travel Agency',
      category: travel._id,
      categoryName: travel.name,
      department: engineering._id,
      departmentName: engineering.name,
      description: 'Conference flights - rejected: duplicate booking (sample)',
      amount: 900,
      paymentMethod: 'Bank Transfer',
      status: EXPENSE_STATUS.REJECTED,
      submittedAt: daysAgo(44),
      rejectedBy: finance1._id,
      rejectedAt: daysAgo(43),
      rejectionReason: 'Duplicate booking - cancel with vendor (sample)',
      createdBy: finance1._id,
    },
  ]);

  console.log('[seed] creating reimbursement claims...');
  const slaDays = DEFAULT_SETTINGS.approvalSlaDays;
  const receiptItem = (file, size) => ({
    fileName: file,
    originalName: file,
    mimeType: 'image/png',
    size,
    url: `/uploads/samples/${file}`,
    extension: '.png',
  });
  const claimNo = () => counterService.nextClaimNumber();
  const entry = (action, actor, comment, previousStatus, newStatus, when) => ({
    action,
    actor: actor._id,
    actorName: actor.name,
    actorRole: actor.role,
    comment,
    previousStatus,
    newStatus,
    timestamp: when,
  });

  // 1) Draft - still editable by the employee.
  await Claim.create({
    claimNo: await claimNo(),
    employee: employee1._id,
    employeeName: employee1.name,
    department: engineering._id,
    departmentName: engineering.name,
    title: 'Client visit travel (draft)',
    purpose: 'Draft travel claim - not yet submitted (sample)',
    items: [
      {
        date: daysAgo(1),
        category: travel._id,
        categoryName: travel.name,
        description: 'Taxi to client office (sample)',
        merchant: 'Sample Cabs',
        requestedAmount: 45,
        status: ITEM_STATUS.PENDING,
      },
    ],
    status: CLAIM_STATUS.DRAFT,
    createdBy: employee1._id,
  });

  // 2) Submitted - waiting for review, on time.
  await Claim.create({
    claimNo: await claimNo(),
    employee: employee1._id,
    employeeName: employee1.name,
    department: engineering._id,
    departmentName: engineering.name,
    title: 'Team lunch and supplies',
    purpose: 'Monthly team lunch plus office supplies (sample)',
    items: [
      {
        date: daysAgo(4),
        category: meals._id,
        categoryName: meals.name,
        description: 'Team lunch (sample)',
        merchant: 'Sample Cafe',
        requestedAmount: 64.5,
        status: ITEM_STATUS.PENDING,
        receipt: receiptItem('sample-receipt-1.png', 2100),
      },
      {
        date: daysAgo(3),
        category: supplies._id,
        categoryName: supplies.name,
        description: 'Notebooks and pens (sample)',
        merchant: 'Sample Stationery Ltd',
        requestedAmount: 22.25,
        status: ITEM_STATUS.PENDING,
        receipt: receiptItem('sample-receipt-2.png', 1980),
      },
    ],
    status: CLAIM_STATUS.SUBMITTED,
    assignedTo: finance1._id,
    assignedToName: finance1.name,
    submittedAt: daysAgo(2),
    dueAt: new Date(Date.now() + slaDays * 86400000),
    createdBy: employee1._id,
    timeline: [entry(REVIEW_ACTION.SUBMITTED, employee1, null, CLAIM_STATUS.DRAFT, CLAIM_STATUS.SUBMITTED, daysAgo(2))],
  });

  // 3) Submitted - OVERDUE (past its review due date).
  await Claim.create({
    claimNo: await claimNo(),
    employee: employee1._id,
    employeeName: employee1.name,
    department: engineering._id,
    departmentName: engineering.name,
    title: 'Software licence reimbursement',
    purpose: 'Developer tool licence paid personally (sample)',
    items: [
      {
        date: daysAgo(12),
        category: software._id,
        categoryName: software.name,
        description: 'Code editor subscription (sample)',
        merchant: 'Sample Software Co',
        requestedAmount: 120,
        status: ITEM_STATUS.PENDING,
        receipt: receiptItem('sample-invoice-6.png', 2400),
      },
    ],
    status: CLAIM_STATUS.SUBMITTED,
    assignedTo: finance1._id,
    assignedToName: finance1.name,
    submittedAt: daysAgo(10),
    dueAt: daysAgo(2),
    createdBy: employee1._id,
    timeline: [entry(REVIEW_ACTION.SUBMITTED, employee1, null, CLAIM_STATUS.DRAFT, CLAIM_STATUS.SUBMITTED, daysAgo(10))],
  });

  // 4) Approved with a PARTIAL item approval.
  const approvedClaim = await Claim.create({
    claimNo: await claimNo(),
    employee: employee2._id,
    employeeName: employee2.name,
    department: marketing._id,
    departmentName: marketing.name,
    title: 'Campaign travel and meals',
    purpose: 'Product launch trip (sample)',
    items: [
      {
        date: daysAgo(8),
        category: travel._id,
        categoryName: travel.name,
        description: 'Train tickets (sample)',
        merchant: 'Sample Rail',
        requestedAmount: 120,
        approvedAmount: 120,
        status: ITEM_STATUS.APPROVED,
        reviewerComment: 'Matches policy (sample)',
        receipt: receiptItem('sample-receipt-4.png', 1875),
      },
      {
        date: daysAgo(8),
        category: meals._id,
        categoryName: meals.name,
        description: 'Client dinner (sample)',
        merchant: 'Sample Bistro',
        requestedAmount: 80,
        approvedAmount: 60,
        status: ITEM_STATUS.PARTIALLY_APPROVED,
        reviewerComment: 'Over per-meal limit - partial (sample)',
        receipt: receiptItem('sample-receipt-5.png', 2210),
      },
      {
        date: daysAgo(7),
        category: fuel._id,
        categoryName: fuel.name,
        description: 'Taxi fuel top-up (sample)',
        merchant: 'Sample Fuel Stop',
        requestedAmount: 45,
        approvedAmount: 0,
        status: ITEM_STATUS.REJECTED,
        reviewerComment: 'No receipt attached (sample)',
      },
    ],
    status: CLAIM_STATUS.APPROVED,
    assignedTo: finance2._id,
    assignedToName: finance2.name,
    submittedAt: daysAgo(7),
    dueAt: daysAgo(4),
    reviewedAt: daysAgo(5),
    createdBy: employee2._id,
    timeline: [
      entry(REVIEW_ACTION.SUBMITTED, employee2, null, CLAIM_STATUS.DRAFT, CLAIM_STATUS.SUBMITTED, daysAgo(7)),
      entry(REVIEW_ACTION.PARTIALLY_APPROVED, finance2, 'Travel approved; meal partially approved; fuel rejected without receipt (sample)', CLAIM_STATUS.SUBMITTED, CLAIM_STATUS.APPROVED, daysAgo(5)),
    ],
  });
  approvedClaim.applyTotals();
  await approvedClaim.save();

  // 5) Fully approved and PAID.
  const paidClaim = await Claim.create({
    claimNo: await claimNo(),
    employee: employee2._id,
    employeeName: employee2.name,
    department: marketing._id,
    departmentName: marketing.name,
    title: 'Conference attendance',
    purpose: 'Regional marketing conference (sample)',
    items: [
      {
        date: daysAgo(30),
        category: travel._id,
        categoryName: travel.name,
        description: 'Conference transport (sample)',
        merchant: 'Sample Transit',
        requestedAmount: 90,
        approvedAmount: 90,
        status: ITEM_STATUS.APPROVED,
        receipt: receiptItem('sample-receipt-2.png', 1980),
      },
      {
        date: daysAgo(29),
        category: meals._id,
        categoryName: meals.name,
        description: 'Conference meals (sample)',
        merchant: 'Sample Deli',
        requestedAmount: 55,
        approvedAmount: 55,
        status: ITEM_STATUS.APPROVED,
        receipt: receiptItem('sample-receipt-1.png', 2100),
      },
    ],
    status: CLAIM_STATUS.PAID,
    assignedTo: finance2._id,
    assignedToName: finance2.name,
    submittedAt: daysAgo(28),
    dueAt: daysAgo(25),
    reviewedAt: daysAgo(26),
    createdBy: employee2._id,
    payments: [
      {
        amount: 145,
        method: 'Bank Transfer',
        referenceNumber: 'SAMPLE-TXN-0002',
        paidAt: daysAgo(20),
        recordedBy: finance2._id,
        recordedByName: finance2.name,
        note: 'Full reimbursement (sample)',
      },
    ],
    paymentDetails: {
      paidAt: daysAgo(20),
      method: 'Bank Transfer',
      referenceNumber: 'SAMPLE-TXN-0002',
    },
    timeline: [
      entry(REVIEW_ACTION.SUBMITTED, employee2, null, CLAIM_STATUS.DRAFT, CLAIM_STATUS.SUBMITTED, daysAgo(28)),
      entry(REVIEW_ACTION.APPROVED, finance2, 'All items verified (sample)', CLAIM_STATUS.SUBMITTED, CLAIM_STATUS.APPROVED, daysAgo(26)),
      entry(REVIEW_ACTION.PAID, finance2, 'Paid via bank transfer (sample)', CLAIM_STATUS.APPROVED, CLAIM_STATUS.PAID, daysAgo(20)),
    ],
  });
  paidClaim.applyTotals();
  await paidClaim.save();

  // 6) RETURNED for correction (employee can edit and resubmit).
  await Claim.create({
    claimNo: await claimNo(),
    employee: employee3._id,
    employeeName: employee3.name,
    department: operations._id,
    departmentName: operations.name,
    title: 'Warehouse supplies',
    purpose: 'Packing materials (sample)',
    items: [
      {
        date: daysAgo(6),
        category: supplies._id,
        categoryName: supplies.name,
        description: 'Packing boxes and tape (sample)',
        merchant: 'Sample Depot',
        requestedAmount: 78,
        status: ITEM_STATUS.PENDING,
      },
    ],
    status: CLAIM_STATUS.RETURNED,
    assignedTo: finance1._id,
    assignedToName: finance1.name,
    submittedAt: daysAgo(5),
    returnedCount: 1,
    lastComment: 'Please attach the store receipt and confirm the date (sample)',
    createdBy: employee3._id,
    timeline: [
      entry(REVIEW_ACTION.SUBMITTED, employee3, null, CLAIM_STATUS.DRAFT, CLAIM_STATUS.SUBMITTED, daysAgo(5)),
      entry(REVIEW_ACTION.RETURNED, finance1, 'Please attach the store receipt and confirm the date (sample)', CLAIM_STATUS.SUBMITTED, CLAIM_STATUS.RETURNED, daysAgo(4)),
    ],
  });

  // 7) REJECTED (closed without payment).
  await Claim.create({
    claimNo: await claimNo(),
    employee: employee3._id,
    employeeName: employee3.name,
    department: operations._id,
    departmentName: operations.name,
    title: 'Personal equipment',
    purpose: 'Not business related (sample)',
    items: [
      {
        date: daysAgo(15),
        category: software._id,
        categoryName: software.name,
        description: 'Personal headphones (sample)',
        merchant: 'Sample Electronics',
        requestedAmount: 199,
        approvedAmount: 0,
        status: ITEM_STATUS.REJECTED,
        reviewerComment: 'Not a business expense (sample)',
      },
    ],
    status: CLAIM_STATUS.REJECTED,
    assignedTo: finance1._id,
    assignedToName: finance1.name,
    submittedAt: daysAgo(14),
    reviewedAt: daysAgo(13),
    lastComment: 'Not a business expense (sample)',
    createdBy: employee3._id,
    timeline: [
      entry(REVIEW_ACTION.SUBMITTED, employee3, null, CLAIM_STATUS.DRAFT, CLAIM_STATUS.SUBMITTED, daysAgo(14)),
      entry(REVIEW_ACTION.REJECTED, finance1, 'Not a business expense (sample)', CLAIM_STATUS.SUBMITTED, CLAIM_STATUS.REJECTED, daysAgo(13)),
    ],
  });

  // 8) PAID - approved and reimbursed, with payment info.
  await Claim.create({
    claimNo: await claimNo(),
    employee: employee2._id,
    employeeName: employee2.name,
    department: marketing._id,
    departmentName: marketing.name,
    title: 'Event travel reimbursement (paid)',
    purpose: 'Trade show travel, reimbursed (sample)',
    items: [
      {
        date: daysAgo(30),
        category: travel._id,
        categoryName: travel.name,
        description: 'Train tickets to trade show (sample)',
        merchant: 'Sample Rail',
        requestedAmount: 150,
        approvedAmount: 150,
        status: ITEM_STATUS.APPROVED,
      },
    ],
    status: CLAIM_STATUS.PAID,
    assignedTo: finance1._id,
    assignedToName: finance1.name,
    submittedAt: daysAgo(28),
    reviewedAt: daysAgo(27),
    paidAt: daysAgo(25),
    paymentMethod: 'Bank Transfer',
    paymentReference: 'SAMPLE-TXN-0002',
    paymentStatus: PAYMENT_STATUS.PAID,
    lastComment: 'Reimbursed via bank transfer (sample)',
    createdBy: employee2._id,
    timeline: [
      entry(REVIEW_ACTION.SUBMITTED, employee2, null, CLAIM_STATUS.DRAFT, CLAIM_STATUS.SUBMITTED, daysAgo(28)),
      entry(REVIEW_ACTION.APPROVED, finance1, 'Receipts verified (sample)', CLAIM_STATUS.SUBMITTED, CLAIM_STATUS.APPROVED, daysAgo(27)),
      entry(REVIEW_ACTION.PAID, finance1, 'Paid by bank transfer (sample)', CLAIM_STATUS.APPROVED, CLAIM_STATUS.PAID, daysAgo(25)),
    ],
  });


  console.log('[seed] verifying counts...');
  const [userCount, deptCount, catCount, budgetCount, expenseCount, claimCount] = await Promise.all([
    User.countDocuments(),
    Department.countDocuments(),
    Category.countDocuments(),
    Budget.countDocuments(),
    Expense.countDocuments(),
    Claim.countDocuments(),
  ]);
  console.log(
    `[seed] users=${userCount} departments=${deptCount} categories=${catCount} ` +
      `budgets=${budgetCount} expenses=${expenseCount} claims=${claimCount}`,
  );

  console.log('-------------------------------------------');
  console.log('Database seeded successfully (all data is fake sample data).');
  console.log('Test accounts:');
  console.log('  Admin:    admin@company.local    / Admin@123');
  console.log('  Finance:  finance@company.local  / Finance@123');
  console.log('  Finance2: finance2@company.local / Finance@123');
  console.log('  Employee: employee@company.local / Employee@123');
  console.log('  (also mia@, oliver@, riley@company.local / Employee@123)');
  console.log('-------------------------------------------');

  await disconnectDB();
};

run().catch(async (error) => {
  console.error('[seed] failed:', error);
  process.exitCode = 1;
  try {
    await disconnectDB();
  } catch (disconnectError) {
    console.error('[seed] disconnect failed:', disconnectError);
  }
});
