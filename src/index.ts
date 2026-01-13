#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs/promises";
import * as path from "path";
import {
  ProjectionLabExport,
  Plan,
  SavingsAccount,
  InvestmentAccount,
  Debt,
  Asset,
  IncomeEvent,
  ExpenseEvent,
  AssetEvent,
  PriorityEvent,
  Milestone,
  PlanVariables,
  WithdrawalStrategy,
  MonteCarloSettings,
} from "./types.js";

// Global state
let dataFilePath: string | null = null;
let data: ProjectionLabExport | null = null;

async function loadData(): Promise<ProjectionLabExport> {
  if (!dataFilePath) {
    throw new Error("Data file path not set. Use set_data_file tool first.");
  }
  const content = await fs.readFile(dataFilePath, "utf-8");
  data = JSON.parse(content) as ProjectionLabExport;
  return data;
}

async function saveData(): Promise<void> {
  if (!dataFilePath || !data) {
    throw new Error("No data loaded to save.");
  }
  // Update lastUpdated timestamp
  data.meta.lastUpdated = Date.now();
  await fs.writeFile(dataFilePath, JSON.stringify(data, null, 2), "utf-8");
}

function getData(): ProjectionLabExport {
  if (!data) {
    throw new Error("Data not loaded. Use set_data_file tool first.");
  }
  return data;
}

function findPlan(planId: string): Plan {
  const plan = getData().plans.find((p) => p.id === planId);
  if (!plan) {
    throw new Error(`Plan not found: ${planId}`);
  }
  return plan;
}

// Create MCP Server
const server = new Server(
  {
    name: "projectionlab-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Define all tools
const tools = [
  // ==========================================================================
  // Setup
  // ==========================================================================
  {
    name: "set_data_file",
    description: "Set the path to the ProjectionLab export JSON file",
    inputSchema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Absolute path to the ProjectionLab export JSON file" },
      },
      required: ["path"],
    },
  },

  // ==========================================================================
  // Overview / Read Tools
  // ==========================================================================
  {
    name: "get_overview",
    description: "Get a high-level overview of the financial data including net worth summary, plan count, and personal info",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "list_plans",
    description: "List all financial plans with their basic info",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_plan",
    description: "Get detailed information about a specific plan",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
      },
      required: ["planId"],
    },
  },

  // ==========================================================================
  // Account Tools
  // ==========================================================================
  {
    name: "list_accounts",
    description: "List all accounts (savings and investment) from the 'today' snapshot",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_account",
    description: "Get details of a specific account",
    inputSchema: {
      type: "object" as const,
      properties: {
        accountId: { type: "string", description: "The account ID" },
      },
      required: ["accountId"],
    },
  },
  {
    name: "update_account_balance",
    description: "Update the balance of an account",
    inputSchema: {
      type: "object" as const,
      properties: {
        accountId: { type: "string", description: "The account ID" },
        balance: { type: "number", description: "New balance" },
      },
      required: ["accountId", "balance"],
    },
  },
  {
    name: "rename_account",
    description: "Rename a savings or investment account",
    inputSchema: {
      type: "object" as const,
      properties: {
        accountId: { type: "string", description: "The account ID" },
        name: { type: "string", description: "New account name" },
      },
      required: ["accountId", "name"],
    },
  },
  {
    name: "add_account",
    description: "Add a new savings or investment account",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Account name" },
        balance: { type: "number", description: "Initial balance" },
        accountType: {
          type: "string",
          enum: ["savings", "401k", "roth-ira", "traditional-ira", "hsa", "taxable", "529"],
          description: "Type of account",
        },
        owner: {
          type: "string",
          enum: ["me", "spouse", "joint"],
          description: "Account owner (defaults to 'me')",
        },
      },
      required: ["name", "balance", "accountType"],
    },
  },

  // ==========================================================================
  // Debt Tools
  // ==========================================================================
  {
    name: "list_debts",
    description: "List all debts from the 'today' snapshot",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_debt",
    description: "Get details of a specific debt",
    inputSchema: {
      type: "object" as const,
      properties: {
        debtId: { type: "string", description: "The debt ID" },
      },
      required: ["debtId"],
    },
  },
  {
    name: "update_debt",
    description: "Update a debt's properties",
    inputSchema: {
      type: "object" as const,
      properties: {
        debtId: { type: "string", description: "The debt ID" },
        amount: { type: "number", description: "New amount" },
        interestRate: { type: "number", description: "New interest rate" },
        monthlyPayment: { type: "number", description: "New monthly payment" },
      },
      required: ["debtId"],
    },
  },
  {
    name: "add_debt",
    description: "Add a new debt (student loans, credit card, personal loan, etc.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Debt name" },
        debtType: {
          type: "string",
          enum: ["student-loans", "mortgage", "auto", "credit-card", "personal", "other"],
          description: "Type of debt",
        },
        amount: { type: "number", description: "Current balance owed" },
        interestRate: { type: "number", description: "Annual interest rate (e.g., 6.5 for 6.5%)" },
        monthlyPayment: { type: "number", description: "Monthly payment amount" },
        owner: {
          type: "string",
          enum: ["me", "spouse", "joint"],
          description: "Debt owner (defaults to 'me')",
        },
      },
      required: ["name", "debtType", "amount"],
    },
  },

  // ==========================================================================
  // Asset Tools
  // ==========================================================================
  {
    name: "list_assets",
    description: "List all physical assets (real estate, cars, etc.) from the 'today' snapshot",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_asset",
    description: "Get details of a specific asset",
    inputSchema: {
      type: "object" as const,
      properties: {
        assetId: { type: "string", description: "The asset ID" },
      },
      required: ["assetId"],
    },
  },
  {
    name: "update_asset",
    description: "Update an asset's properties",
    inputSchema: {
      type: "object" as const,
      properties: {
        assetId: { type: "string", description: "The asset ID" },
        amount: { type: "number", description: "New current value" },
        balance: { type: "number", description: "New loan balance" },
      },
      required: ["assetId"],
    },
  },
  {
    name: "add_asset",
    description: "Add a new physical asset (real estate, car, etc.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Asset name" },
        assetType: {
          type: "string",
          enum: ["car", "real-estate", "other"],
          description: "Type of asset",
        },
        amount: { type: "number", description: "Current value" },
        balance: { type: "number", description: "Loan balance (if financed)" },
        owner: {
          type: "string",
          enum: ["me", "spouse", "joint"],
          description: "Asset owner (defaults to 'me')",
        },
      },
      required: ["name", "assetType", "amount"],
    },
  },

  // ==========================================================================
  // Plan Income Tools
  // ==========================================================================
  {
    name: "list_income",
    description: "List all income events in a plan",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
      },
      required: ["planId"],
    },
  },
  {
    name: "get_income",
    description: "Get details of a specific income event",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
        incomeId: { type: "string", description: "The income event ID" },
      },
      required: ["planId", "incomeId"],
    },
  },
  {
    name: "update_income",
    description: "Update an income event's properties",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
        incomeId: { type: "string", description: "The income event ID" },
        amount: { type: "number", description: "New amount" },
        name: { type: "string", description: "New name" },
      },
      required: ["planId", "incomeId"],
    },
  },
  {
    name: "add_income",
    description: "Add a new income event to a plan",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
        type: { type: "string", enum: ["salary", "rsu", "social-security", "pension", "rental", "other"], description: "Income type" },
        name: { type: "string", description: "Income name" },
        amount: { type: "number", description: "Annual amount" },
        owner: { type: "string", enum: ["me", "spouse", "joint"], description: "Owner" },
      },
      required: ["planId", "type", "name", "amount"],
    },
  },

  // ==========================================================================
  // Plan Expense Tools
  // ==========================================================================
  {
    name: "list_expenses",
    description: "List all expense events in a plan",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
      },
      required: ["planId"],
    },
  },
  {
    name: "get_expense",
    description: "Get details of a specific expense event",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
        expenseId: { type: "string", description: "The expense event ID" },
      },
      required: ["planId", "expenseId"],
    },
  },
  {
    name: "update_expense",
    description: "Update an expense event's properties",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
        expenseId: { type: "string", description: "The expense event ID" },
        amount: { type: "number", description: "New amount" },
        name: { type: "string", description: "New name" },
      },
      required: ["planId", "expenseId"],
    },
  },
  {
    name: "add_expense",
    description: "Add a new expense event to a plan",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
        type: { type: "string", enum: ["living-expenses", "debt", "charity", "education", "dependent-support", "healthcare", "other"], description: "Expense type" },
        name: { type: "string", description: "Expense name" },
        amount: { type: "number", description: "Annual amount" },
        spendingType: { type: "string", enum: ["essential", "discretionary", "flex"], description: "Spending category" },
      },
      required: ["planId", "type", "name", "amount"],
    },
  },

  // ==========================================================================
  // Plan Priority Tools
  // ==========================================================================
  {
    name: "list_priorities",
    description: "List all cash flow priorities in a plan (401k contributions, debt payments, etc.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
      },
      required: ["planId"],
    },
  },
  {
    name: "get_priority",
    description: "Get details of a specific priority",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
        priorityId: { type: "string", description: "The priority ID" },
      },
      required: ["planId", "priorityId"],
    },
  },
  {
    name: "update_priority",
    description: "Update a priority's contribution settings",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
        priorityId: { type: "string", description: "The priority ID" },
        contribution: { type: "number", description: "New contribution amount" },
        contributionType: { type: "string", enum: ["today$", "%"], description: "Contribution type" },
        employerMatch: { type: "number", description: "Employer match percentage" },
        employerMatchLimit: { type: "number", description: "Employer match limit" },
      },
      required: ["planId", "priorityId"],
    },
  },

  // ==========================================================================
  // Milestone Tools
  // ==========================================================================
  {
    name: "list_milestones",
    description: "List all milestones in a plan (retirement, FIRE, etc.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
      },
      required: ["planId"],
    },
  },
  {
    name: "get_milestone",
    description: "Get details of a specific milestone",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
        milestoneId: { type: "string", description: "The milestone ID" },
      },
      required: ["planId", "milestoneId"],
    },
  },
  {
    name: "update_milestone",
    description: "Update a milestone's properties",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
        milestoneId: { type: "string", description: "The milestone ID" },
        name: { type: "string", description: "New name" },
      },
      required: ["planId", "milestoneId"],
    },
  },

  // ==========================================================================
  // Plan Variables (Tax & Projections) Tools
  // ==========================================================================
  {
    name: "get_plan_variables",
    description: "Get plan assumptions and tax settings",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
      },
      required: ["planId"],
    },
  },
  {
    name: "update_plan_variables",
    description: "Update plan assumptions (investment return, inflation, tax rates, etc.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
        investmentReturn: { type: "number", description: "Expected investment return %" },
        inflation: { type: "number", description: "Expected inflation %" },
        dividendRate: { type: "number", description: "Expected dividend rate %" },
        filingStatus: { type: "string", enum: ["single", "joint", "married-separate", "head-of-household"], description: "Tax filing status" },
        effectiveIncomeTaxRate: { type: "number", description: "Effective income tax rate %" },
        capGainsTaxRate: { type: "number", description: "Capital gains tax rate %" },
      },
      required: ["planId"],
    },
  },

  // ==========================================================================
  // Withdrawal Strategy Tools
  // ==========================================================================
  {
    name: "get_withdrawal_strategy",
    description: "Get the withdrawal strategy for a plan",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
      },
      required: ["planId"],
    },
  },
  {
    name: "update_withdrawal_strategy",
    description: "Update the withdrawal strategy",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
        strategy: { type: "string", enum: ["initial-%", "fixed-%", "fixed-amount", "1/N", "vpw", "kitces-ratchet", "clyatt-95%", "guyton-klinger"], description: "Strategy type" },
        enabled: { type: "boolean", description: "Enable/disable withdrawal strategy" },
      },
      required: ["planId"],
    },
  },

  // ==========================================================================
  // Monte Carlo Tools
  // ==========================================================================
  {
    name: "get_montecarlo_settings",
    description: "Get Monte Carlo simulation settings for a plan",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
      },
      required: ["planId"],
    },
  },
  {
    name: "update_montecarlo_settings",
    description: "Update Monte Carlo simulation settings",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
        trials: { type: "number", description: "Number of simulation trials" },
        mode: { type: "string", enum: ["custom", "historical", "normal"], description: "Simulation mode" },
      },
      required: ["planId"],
    },
  },

  // ==========================================================================
  // Progress Tracking Tools
  // ==========================================================================
  {
    name: "get_progress",
    description: "Get historical net worth tracking data",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "add_progress_snapshot",
    description: "Add a new progress snapshot",
    inputSchema: {
      type: "object" as const,
      properties: {
        netWorth: { type: "number", description: "Total net worth" },
        savings: { type: "number", description: "Total in savings accounts" },
        taxable: { type: "number", description: "Total in taxable accounts" },
        taxDeferred: { type: "number", description: "Total in tax-deferred accounts (401k, Traditional IRA)" },
        taxFree: { type: "number", description: "Total in tax-free accounts (Roth)" },
        debt: { type: "number", description: "Total debt" },
      },
      required: ["netWorth"],
    },
  },
];

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ========================================================================
      // Setup
      // ========================================================================
      case "set_data_file": {
        const filePath = args?.path as string;
        const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
        dataFilePath = absolutePath;
        await loadData();
        return {
          content: [{ type: "text", text: `Data loaded from: ${absolutePath}` }],
        };
      }

      // ========================================================================
      // Overview
      // ========================================================================
      case "get_overview": {
        const d = getData();
        const totalSavings = d.today.savingsAccounts?.reduce((sum, a) => sum + a.balance, 0) ?? 0;
        const totalInvestments = d.today.investmentAccounts?.reduce((sum, a) => sum + a.balance, 0) ?? 0;
        const totalDebt = d.today.debts?.reduce((sum, d) => sum + d.amount, 0) ?? 0;
        const totalAssetValue = d.today.assets?.reduce((sum, a) => sum + (a.amount ?? 0), 0) ?? 0;
        const totalAssetLoans = d.today.assets?.reduce((sum, a) => sum + (a.balance ?? 0), 0) ?? 0;

        const overview = {
          meta: d.meta,
          personal: {
            name: d.today.yourName,
            age: d.today.age,
            partnerStatus: d.today.partnerStatus,
            spouseName: d.today.spouseName,
            spouseAge: d.today.spouseAge,
            location: d.today.location,
          },
          summary: {
            totalSavings,
            totalInvestments,
            totalLiquid: totalSavings + totalInvestments,
            totalDebt,
            totalAssetValue,
            totalAssetLoans,
            estimatedNetWorth: totalSavings + totalInvestments + totalAssetValue - totalDebt - totalAssetLoans,
          },
          planCount: d.plans.length,
          planNames: d.plans.map((p) => ({ id: p.id, name: p.name, active: p.active })),
        };
        return { content: [{ type: "text", text: JSON.stringify(overview, null, 2) }] };
      }

      // ========================================================================
      // Plans
      // ========================================================================
      case "list_plans": {
        const plans = getData().plans.map((p) => ({
          id: p.id,
          name: p.name,
          active: p.active,
          icon: p.icon,
          lastUpdated: p.lastUpdated,
          milestonesCount: p.milestones?.length ?? 0,
          incomeCount: p.income?.events?.length ?? 0,
          expenseCount: p.expenses?.events?.length ?? 0,
          prioritiesCount: p.priorities?.events?.length ?? 0,
        }));
        return { content: [{ type: "text", text: JSON.stringify(plans, null, 2) }] };
      }

      case "get_plan": {
        const plan = findPlan(args?.planId as string);
        return { content: [{ type: "text", text: JSON.stringify(plan, null, 2) }] };
      }

      // ========================================================================
      // Accounts
      // ========================================================================
      case "list_accounts": {
        const d = getData();
        const accounts = [
          ...(d.today.savingsAccounts?.map((a) => ({ ...a, category: "savings" })) ?? []),
          ...(d.today.investmentAccounts?.map((a) => ({ ...a, category: "investment" })) ?? []),
        ];
        return { content: [{ type: "text", text: JSON.stringify(accounts, null, 2) }] };
      }

      case "get_account": {
        const accountId = args?.accountId as string;
        const d = getData();
        const account =
          d.today.savingsAccounts?.find((a) => a.id === accountId) ??
          d.today.investmentAccounts?.find((a) => a.id === accountId);
        if (!account) throw new Error(`Account not found: ${accountId}`);
        return { content: [{ type: "text", text: JSON.stringify(account, null, 2) }] };
      }

      case "update_account_balance": {
        const accountId = args?.accountId as string;
        const newBalance = args?.balance as number;
        const d = getData();

        const savingsAccount = d.today.savingsAccounts?.find((a) => a.id === accountId);
        if (savingsAccount) {
          savingsAccount.balance = newBalance;
          await saveData();
          return { content: [{ type: "text", text: JSON.stringify(savingsAccount, null, 2) }] };
        }

        const investmentAccount = d.today.investmentAccounts?.find((a) => a.id === accountId);
        if (investmentAccount) {
          investmentAccount.balance = newBalance;
          await saveData();
          return { content: [{ type: "text", text: JSON.stringify(investmentAccount, null, 2) }] };
        }

        throw new Error(`Account not found: ${accountId}`);
      }

      case "rename_account": {
        const accountId = args?.accountId as string;
        const newName = args?.name as string;
        const d = getData();

        const savingsAccount = d.today.savingsAccounts?.find((a) => a.id === accountId);
        if (savingsAccount) {
          savingsAccount.name = newName;
          await saveData();
          return { content: [{ type: "text", text: JSON.stringify(savingsAccount, null, 2) }] };
        }

        const investmentAccount = d.today.investmentAccounts?.find((a) => a.id === accountId);
        if (investmentAccount) {
          investmentAccount.name = newName;
          await saveData();
          return { content: [{ type: "text", text: JSON.stringify(investmentAccount, null, 2) }] };
        }

        throw new Error(`Account not found: ${accountId}`);
      }

      case "add_account": {
        const d = getData();
        const accountType = args?.accountType as string;
        const name = args?.name as string;
        const balance = args?.balance as number;
        const owner = (args?.owner as "me" | "spouse" | "joint") ?? "me";

        if (accountType === "savings") {
          if (!d.today.savingsAccounts) d.today.savingsAccounts = [];

          const newAccount: SavingsAccount = {
            id: `account-${Date.now()}`,
            type: "savings",
            name,
            balance,
            owner,
          };

          d.today.savingsAccounts.push(newAccount);
          await saveData();
          return { content: [{ type: "text", text: JSON.stringify(newAccount, null, 2) }] };
        } else {
          if (!d.today.investmentAccounts) d.today.investmentAccounts = [];

          const newAccount: InvestmentAccount = {
            id: `account-${Date.now()}`,
            type: accountType as InvestmentAccount["type"],
            name,
            balance,
            owner,
          };

          d.today.investmentAccounts.push(newAccount);
          await saveData();
          return { content: [{ type: "text", text: JSON.stringify(newAccount, null, 2) }] };
        }
      }

      // ========================================================================
      // Debts
      // ========================================================================
      case "list_debts": {
        const debts = getData().today.debts ?? [];
        return { content: [{ type: "text", text: JSON.stringify(debts, null, 2) }] };
      }

      case "get_debt": {
        const debtId = args?.debtId as string;
        const debt = getData().today.debts?.find((d) => d.id === debtId);
        if (!debt) throw new Error(`Debt not found: ${debtId}`);
        return { content: [{ type: "text", text: JSON.stringify(debt, null, 2) }] };
      }

      case "update_debt": {
        const debtId = args?.debtId as string;
        const debt = getData().today.debts?.find((d) => d.id === debtId);
        if (!debt) throw new Error(`Debt not found: ${debtId}`);

        if (args?.amount !== undefined) debt.amount = args.amount as number;
        if (args?.interestRate !== undefined) debt.interestRate = args.interestRate as number;
        if (args?.monthlyPayment !== undefined) debt.monthlyPayment = args.monthlyPayment as number;

        await saveData();
        return { content: [{ type: "text", text: JSON.stringify(debt, null, 2) }] };
      }

      case "add_debt": {
        const d = getData();
        if (!d.today.debts) d.today.debts = [];

        const newDebt: Debt = {
          id: `debt-${Date.now()}`,
          type: "debt",
          subtype: args?.debtType as Debt["subtype"],
          name: args?.name as string,
          amount: args?.amount as number,
          owner: (args?.owner as "me" | "spouse" | "joint") ?? "me",
        };

        if (args?.interestRate !== undefined) newDebt.interestRate = args.interestRate as number;
        if (args?.monthlyPayment !== undefined) newDebt.monthlyPayment = args.monthlyPayment as number;

        d.today.debts.push(newDebt);
        await saveData();
        return { content: [{ type: "text", text: JSON.stringify(newDebt, null, 2) }] };
      }

      // ========================================================================
      // Assets
      // ========================================================================
      case "list_assets": {
        const assets = getData().today.assets ?? [];
        return { content: [{ type: "text", text: JSON.stringify(assets, null, 2) }] };
      }

      case "get_asset": {
        const assetId = args?.assetId as string;
        const asset = getData().today.assets?.find((a) => a.id === assetId);
        if (!asset) throw new Error(`Asset not found: ${assetId}`);
        return { content: [{ type: "text", text: JSON.stringify(asset, null, 2) }] };
      }

      case "update_asset": {
        const assetId = args?.assetId as string;
        const asset = getData().today.assets?.find((a) => a.id === assetId);
        if (!asset) throw new Error(`Asset not found: ${assetId}`);

        if (args?.amount !== undefined) asset.amount = args.amount as number;
        if (args?.balance !== undefined) asset.balance = args.balance as number;

        await saveData();
        return { content: [{ type: "text", text: JSON.stringify(asset, null, 2) }] };
      }

      case "add_asset": {
        const d = getData();
        if (!d.today.assets) d.today.assets = [];

        const newAsset: Asset = {
          id: `asset-${Date.now()}`,
          type: args?.assetType as Asset["type"],
          name: args?.name as string,
          amount: args?.amount as number,
          owner: (args?.owner as "me" | "spouse" | "joint") ?? "me",
        };

        if (args?.balance !== undefined) newAsset.balance = args.balance as number;

        d.today.assets.push(newAsset);
        await saveData();
        return { content: [{ type: "text", text: JSON.stringify(newAsset, null, 2) }] };
      }

      // ========================================================================
      // Income
      // ========================================================================
      case "list_income": {
        const plan = findPlan(args?.planId as string);
        const income = plan.income?.events ?? [];
        return { content: [{ type: "text", text: JSON.stringify(income, null, 2) }] };
      }

      case "get_income": {
        const plan = findPlan(args?.planId as string);
        const income = plan.income?.events?.find((i) => i.id === args?.incomeId);
        if (!income) throw new Error(`Income not found: ${args?.incomeId}`);
        return { content: [{ type: "text", text: JSON.stringify(income, null, 2) }] };
      }

      case "update_income": {
        const plan = findPlan(args?.planId as string);
        const income = plan.income?.events?.find((i) => i.id === args?.incomeId);
        if (!income) throw new Error(`Income not found: ${args?.incomeId}`);

        if (args?.amount !== undefined) income.amount = args.amount as number;
        if (args?.name !== undefined) income.name = args.name as string;

        await saveData();
        return { content: [{ type: "text", text: JSON.stringify(income, null, 2) }] };
      }

      case "add_income": {
        const plan = findPlan(args?.planId as string);
        if (!plan.income) plan.income = { events: [] };
        if (!plan.income.events) plan.income.events = [];

        const newIncome: IncomeEvent = {
          id: `income-${Date.now()}`,
          type: args?.type as IncomeEvent["type"],
          name: args?.name as string,
          amount: args?.amount as number,
          amountType: "today$",
          owner: (args?.owner as IncomeEvent["owner"]) ?? "me",
          frequency: "yearly",
          start: { type: "keyword", value: "now" },
          end: { type: "keyword", value: "endOfPlan" },
        };

        plan.income.events.push(newIncome);
        await saveData();
        return { content: [{ type: "text", text: JSON.stringify(newIncome, null, 2) }] };
      }

      // ========================================================================
      // Expenses
      // ========================================================================
      case "list_expenses": {
        const plan = findPlan(args?.planId as string);
        const expenses = plan.expenses?.events ?? [];
        return { content: [{ type: "text", text: JSON.stringify(expenses, null, 2) }] };
      }

      case "get_expense": {
        const plan = findPlan(args?.planId as string);
        const expense = plan.expenses?.events?.find((e) => e.id === args?.expenseId);
        if (!expense) throw new Error(`Expense not found: ${args?.expenseId}`);
        return { content: [{ type: "text", text: JSON.stringify(expense, null, 2) }] };
      }

      case "update_expense": {
        const plan = findPlan(args?.planId as string);
        const expense = plan.expenses?.events?.find((e) => e.id === args?.expenseId);
        if (!expense) throw new Error(`Expense not found: ${args?.expenseId}`);

        if (args?.amount !== undefined) expense.amount = args.amount as number;
        if (args?.name !== undefined) expense.name = args.name as string;

        await saveData();
        return { content: [{ type: "text", text: JSON.stringify(expense, null, 2) }] };
      }

      case "add_expense": {
        const plan = findPlan(args?.planId as string);
        if (!plan.expenses) plan.expenses = { events: [] };
        if (!plan.expenses.events) plan.expenses.events = [];

        const newExpense: ExpenseEvent = {
          id: `expense-${Date.now()}`,
          type: args?.type as ExpenseEvent["type"],
          name: args?.name as string,
          amount: args?.amount as number,
          amountType: "today$",
          frequency: "yearly",
          spendingType: (args?.spendingType as ExpenseEvent["spendingType"]) ?? "discretionary",
          start: { type: "keyword", value: "now" },
          end: { type: "keyword", value: "endOfPlan" },
        };

        plan.expenses.events.push(newExpense);
        await saveData();
        return { content: [{ type: "text", text: JSON.stringify(newExpense, null, 2) }] };
      }

      // ========================================================================
      // Priorities
      // ========================================================================
      case "list_priorities": {
        const plan = findPlan(args?.planId as string);
        const priorities = plan.priorities?.events ?? [];
        return { content: [{ type: "text", text: JSON.stringify(priorities, null, 2) }] };
      }

      case "get_priority": {
        const plan = findPlan(args?.planId as string);
        const priority = plan.priorities?.events?.find((p) => p.id === args?.priorityId);
        if (!priority) throw new Error(`Priority not found: ${args?.priorityId}`);
        return { content: [{ type: "text", text: JSON.stringify(priority, null, 2) }] };
      }

      case "update_priority": {
        const plan = findPlan(args?.planId as string);
        const priority = plan.priorities?.events?.find((p) => p.id === args?.priorityId);
        if (!priority) throw new Error(`Priority not found: ${args?.priorityId}`);

        if (args?.contribution !== undefined) priority.contribution = args.contribution as number;
        if (args?.contributionType !== undefined) priority.contributionType = args.contributionType as "today$" | "%";
        if (args?.employerMatch !== undefined) priority.employerMatch = args.employerMatch as number;
        if (args?.employerMatchLimit !== undefined) priority.employerMatchLimit = args.employerMatchLimit as number;

        await saveData();
        return { content: [{ type: "text", text: JSON.stringify(priority, null, 2) }] };
      }

      // ========================================================================
      // Milestones
      // ========================================================================
      case "list_milestones": {
        const plan = findPlan(args?.planId as string);
        const milestones = plan.milestones ?? [];
        return { content: [{ type: "text", text: JSON.stringify(milestones, null, 2) }] };
      }

      case "get_milestone": {
        const plan = findPlan(args?.planId as string);
        const milestone = plan.milestones?.find((m) => m.id === args?.milestoneId);
        if (!milestone) throw new Error(`Milestone not found: ${args?.milestoneId}`);
        return { content: [{ type: "text", text: JSON.stringify(milestone, null, 2) }] };
      }

      case "update_milestone": {
        const plan = findPlan(args?.planId as string);
        const milestone = plan.milestones?.find((m) => m.id === args?.milestoneId);
        if (!milestone) throw new Error(`Milestone not found: ${args?.milestoneId}`);

        if (args?.name !== undefined) milestone.name = args.name as string;

        await saveData();
        return { content: [{ type: "text", text: JSON.stringify(milestone, null, 2) }] };
      }

      // ========================================================================
      // Plan Variables
      // ========================================================================
      case "get_plan_variables": {
        const plan = findPlan(args?.planId as string);
        return { content: [{ type: "text", text: JSON.stringify(plan.variables ?? {}, null, 2) }] };
      }

      case "update_plan_variables": {
        const plan = findPlan(args?.planId as string);
        if (!plan.variables) plan.variables = {};

        if (args?.investmentReturn !== undefined) plan.variables.investmentReturn = args.investmentReturn as number;
        if (args?.inflation !== undefined) plan.variables.inflation = args.inflation as number;
        if (args?.dividendRate !== undefined) plan.variables.dividendRate = args.dividendRate as number;
        if (args?.filingStatus !== undefined) plan.variables.filingStatus = args.filingStatus as PlanVariables["filingStatus"];
        if (args?.effectiveIncomeTaxRate !== undefined) plan.variables.effectiveIncomeTaxRate = args.effectiveIncomeTaxRate as number;
        if (args?.capGainsTaxRate !== undefined) plan.variables.capGainsTaxRate = args.capGainsTaxRate as number;

        await saveData();
        return { content: [{ type: "text", text: JSON.stringify(plan.variables, null, 2) }] };
      }

      // ========================================================================
      // Withdrawal Strategy
      // ========================================================================
      case "get_withdrawal_strategy": {
        const plan = findPlan(args?.planId as string);
        return { content: [{ type: "text", text: JSON.stringify(plan.withdrawalStrategy ?? {}, null, 2) }] };
      }

      case "update_withdrawal_strategy": {
        const plan = findPlan(args?.planId as string);
        if (!plan.withdrawalStrategy) plan.withdrawalStrategy = {};

        if (args?.strategy !== undefined) plan.withdrawalStrategy.strategy = args.strategy as WithdrawalStrategy["strategy"];
        if (args?.enabled !== undefined) plan.withdrawalStrategy.enabled = args.enabled as boolean;

        await saveData();
        return { content: [{ type: "text", text: JSON.stringify(plan.withdrawalStrategy, null, 2) }] };
      }

      // ========================================================================
      // Monte Carlo
      // ========================================================================
      case "get_montecarlo_settings": {
        const plan = findPlan(args?.planId as string);
        return { content: [{ type: "text", text: JSON.stringify(plan.montecarlo ?? {}, null, 2) }] };
      }

      case "update_montecarlo_settings": {
        const plan = findPlan(args?.planId as string);
        if (!plan.montecarlo) plan.montecarlo = {};

        if (args?.trials !== undefined) plan.montecarlo.trials = args.trials as number;
        if (args?.mode !== undefined) plan.montecarlo.mode = args.mode as MonteCarloSettings["mode"];

        await saveData();
        return { content: [{ type: "text", text: JSON.stringify(plan.montecarlo, null, 2) }] };
      }

      // ========================================================================
      // Progress
      // ========================================================================
      case "get_progress": {
        const progress = getData().progress ?? { data: [] };
        return { content: [{ type: "text", text: JSON.stringify(progress, null, 2) }] };
      }

      case "add_progress_snapshot": {
        const d = getData();
        if (!d.progress) d.progress = { data: [] };
        if (!d.progress.data) d.progress.data = [];

        const snapshot = {
          date: Date.now(),
          netWorth: args?.netWorth as number,
          savings: args?.savings as number | undefined,
          taxable: args?.taxable as number | undefined,
          taxDeferred: args?.taxDeferred as number | undefined,
          taxFree: args?.taxFree as number | undefined,
          debt: args?.debt as number | undefined,
        };

        d.progress.data.push(snapshot);
        d.progress.lastUpdated = Date.now();
        await saveData();
        return { content: [{ type: "text", text: JSON.stringify(snapshot, null, 2) }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// Handle resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  if (!data) {
    return { resources: [] };
  }

  return {
    resources: [
      {
        uri: "projectionlab://overview",
        name: "Financial Overview",
        description: "High-level summary of financial data",
        mimeType: "application/json",
      },
      ...getData().plans.map((p) => ({
        uri: `projectionlab://plan/${p.id}`,
        name: `Plan: ${p.name}`,
        description: `Financial plan: ${p.name}`,
        mimeType: "application/json",
      })),
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === "projectionlab://overview") {
    const d = getData();
    const totalSavings = d.today.savingsAccounts?.reduce((sum, a) => sum + a.balance, 0) ?? 0;
    const totalInvestments = d.today.investmentAccounts?.reduce((sum, a) => sum + a.balance, 0) ?? 0;
    const totalDebt = d.today.debts?.reduce((sum, d) => sum + d.amount, 0) ?? 0;

    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              totalSavings,
              totalInvestments,
              totalDebt,
              netWorth: totalSavings + totalInvestments - totalDebt,
              planCount: d.plans.length,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  const planMatch = uri.match(/^projectionlab:\/\/plan\/(.+)$/);
  if (planMatch) {
    const plan = findPlan(planMatch[1]);
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(plan, null, 2),
        },
      ],
    };
  }

  throw new Error(`Unknown resource: ${uri}`);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ProjectionLab MCP Server running on stdio");
}

main().catch(console.error);
