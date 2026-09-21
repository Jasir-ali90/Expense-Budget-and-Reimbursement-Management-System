const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const User = require("./models/User");
const department = require("./models/Department");
const catagory = require("./models/Category");
const budget = require("./models/Budget");
const Budget = require("./models/Budget");

const seedData = async () => {
  try {
    await mongoose.connect(
      process.env.MONGO_URI ||
        "mongodb://127.0.0.1:27017/expense_management_db",
    );
    console.log("MongoDB Connected for seeding data");

    // clear existing data
    await User.deleteMany({});
    await department.deleteMany({});
    await catagory.deleteMany({});
    await budget.deleteMany({});

    // create hashed password for the admin user
    const hashedPassword = await bcrypt.hash("admin123", 10);

    // create a department
    const engneering = await department.create({ name: "Engineering" });
    const marketing = await department.create({ name: "Marketing" });
    const hr = await department.create({ name: "Human Resources" });

    // create users
    const admin = await User.create({
      name: "System Admin",
      email: "admin@company.local",
      password: hashedPassword,
      role: "Admin",
      isActive: true,
    });

    const finance = await User.create({
      name: "Finance Lead",
      email: "finance@company.local",
      password: hashedPassword,
      role: "Finance Manager",
      department: engineering._id,
      isActive: true,
    });

    const employee = await User.create({
      name: "John Employee",
      email: "employee@company.local",
      password: hashedPassword,
      role: "Employee",
      department: engineering._id,
      isActive: true,
    });

    // Assign Managers
    engineering.manager = finance._id;
    await engineering.save();

    // create categories
    const travel = await Category.create({
      name: "Travel",
      requiresReciept: true,
      maxClaimAmount: 1000,
    });

    const meals = await Category.create({
      name: "Meals",
      requiresReceipt: true,
      maxClaimAmount: 100,
    });

    const supplies = await Category.create({
      name: "Office Supplies",
      requiresReceipt: false,
      maxClaimAmount: 500,
    });

    //create sample budgets

    await Budget.create({
      department: engineering._id,
      category: travel._id,
      period: "2026-09",
      allocatedAmount: 5000,
      warningThresholdPercent: 80,
      history: [
        {
          revisedBy: admin._id,
          previousAmount: 0,
          newAmount: 5000,
          reason: "Initial Monthly Budget Setup",
        },
      ],
    });

    console.log("-----------------------------------");
    console.log("Database Seeded Successfully!");
    console.log("Test Credentials (Password for all: Password123!):");
    console.log("Admin: admin@company.local");
    console.log("Finance: finance@company.local");
    console.log("Employee: employee@company.local");
    console.log("-----------------------------------");

    process.exit();
  } catch (error) {
    console.error("Seeding Error:", error);
    process.exit(1);
  }
};

seedData();
