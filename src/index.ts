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
  MilestoneCriterion,
  DateReference,
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

// Validate milestone criteria - ensure correct value types
function validateCriteria(criteria: MilestoneCriterion[]): void {
  for (const c of criteria) {
    if (c.type === "year" && typeof c.value !== "string") {
      throw new Error(`Criterion type 'year' requires value to be a date string (e.g., "2053-01-01"), got ${typeof c.value}: ${c.value}`);
    }
    if (c.type === "date" && typeof c.value !== "string") {
      throw new Error(`Criterion type 'date' requires value to be a date string, got ${typeof c.value}`);
    }
    if ((c.type === "netWorth" || c.type === "account" || c.type === "totalDebt") && typeof c.value !== "number") {
      throw new Error(`Criterion type '${c.type}' requires value to be a number, got ${typeof c.value}: "${c.value}"`);
    }
    if (c.type === "milestone" && typeof c.value !== "string") {
      throw new Error(`Criterion type 'milestone' requires value to be a string (milestone ID), got ${typeof c.value}`);
    }
  }
}

// Validate milestone criteria references - ensure refId points to existing entities
function validateCriteriaReferences(criteria: MilestoneCriterion[], today: ProjectionLabExport["today"], plan?: Plan): void {
  for (const c of criteria) {
    if (!c.refId) continue;

    switch (c.type) {
      case "account": {
        // Check if account exists in savingsAccounts or investmentAccounts
        const savingsMatch = today.savingsAccounts?.find((a: { id?: string }) => a.id === c.refId);
        const investmentMatch = today.investmentAccounts?.find((a: { id?: string }) => a.id === c.refId);
        if (!savingsMatch && !investmentMatch) {
          throw new Error(`Criterion references non-existent account: "${c.refId}". Check today.savingsAccounts and today.investmentAccounts for valid IDs.`);
        }
        break;
      }

      case "debt":
      case "totalDebt": {
        // Check if debt exists in today.debts
        const debtMatch = today.debts?.find((d: { id?: string }) => d.id === c.refId);
        if (!debtMatch) {
          throw new Error(`Criterion references non-existent debt: "${c.refId}". Check today.debts for valid IDs.`);
        }
        break;
      }

      case "milestone": {
        // Check if milestone exists in plan milestones (if plan provided)
        if (plan) {
          const milestoneMatch = plan.milestones?.find((m) => m.id === c.refId);
          const computedMatch = plan.computedMilestones?.find((m) => m.id === c.refId);
          // Also check for built-in milestone names
          const builtInMilestones = ["retirement", "spouseRetirement", "fire"];
          if (!milestoneMatch && !computedMatch && !builtInMilestones.includes(c.refId)) {
            throw new Error(`Criterion references non-existent milestone: "${c.refId}". Check plan.milestones for valid IDs.`);
          }
        }
        break;
      }
    }
  }
}

// Valid keyword values for DateReference start/end properties
const VALID_DATE_KEYWORDS = ["now", "endOfPlan", "beforeCurrentYear", "never"] as const;

// Validate DateReference objects for start/end properties
function validateDateReference(ref: unknown, fieldName: string): void {
  if (!ref || typeof ref !== "object") {
    throw new Error(`${fieldName} cannot be empty - must be a DateReference object with type and value`);
  }

  const dateRef = ref as Record<string, unknown>;

  if (!dateRef.type) {
    throw new Error(`${fieldName}.type is required - must be one of: keyword, milestone, date, year`);
  }

  if (!dateRef.value && dateRef.value !== 0) {
    throw new Error(`${fieldName}.value is required`);
  }

  const validTypes = ["keyword", "milestone", "date", "year"];
  if (!validTypes.includes(dateRef.type as string)) {
    throw new Error(`${fieldName}.type must be one of: ${validTypes.join(", ")}. Got: "${dateRef.type}"`);
  }

  // Type-specific validation
  switch (dateRef.type) {
    case "keyword":
      if (!VALID_DATE_KEYWORDS.includes(dateRef.value as typeof VALID_DATE_KEYWORDS[number])) {
        throw new Error(`${fieldName}.value for type 'keyword' must be one of: ${VALID_DATE_KEYWORDS.join(", ")}. Got: "${dateRef.value}"`);
      }
      break;

    case "year":
      // Year should be a 4-digit year string like "2059"
      if (typeof dateRef.value !== "string" || !/^\d{4}$/.test(dateRef.value)) {
        throw new Error(`${fieldName}.value for type 'year' must be a 4-digit year string (e.g., "2059"). Got: "${dateRef.value}"`);
      }
      break;

    case "date":
      // Date can be ISO date "2059-01-01" or just year "2027"
      if (typeof dateRef.value !== "string" || !/^\d{4}(-\d{2}(-\d{2})?)?/.test(dateRef.value)) {
        throw new Error(`${fieldName}.value for type 'date' must be a date string (e.g., "2059-01-01" or "2027"). Got: "${dateRef.value}"`);
      }
      break;

    case "milestone":
      // Milestone should be a non-empty string (milestone ID like "retirement", "fire", or UUID)
      if (typeof dateRef.value !== "string" || dateRef.value.trim() === "") {
        throw new Error(`${fieldName}.value for type 'milestone' must be a non-empty milestone ID string. Got: "${dateRef.value}"`);
      }
      break;
  }

  // Validate modifier if present
  if (dateRef.modifier !== undefined) {
    if (typeof dateRef.modifier !== "number" && dateRef.modifier !== "include" && dateRef.modifier !== "exclude") {
      throw new Error(`${fieldName}.modifier must be a number (year offset) or "include"/"exclude". Got: "${dateRef.modifier}"`);
    }
  }
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
  // Person Info Tools
  // ==========================================================================
  {
    name: "update_person",
    description: "Update primary person's info (name, birth year/month, age). Birth year combined with plan's loopYear determines life expectancy.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Person's name" },
        birthYear: { type: "number", description: "Birth year (e.g., 1992). Combined with plan loopYear to determine life expectancy" },
        birthMonth: { type: "number", description: "Birth month (1-12)" },
        age: { type: "number", description: "Current age" },
      },
    },
  },
  {
    name: "update_spouse",
    description: "Update spouse's info (name, birth year/month, age). Birth year combined with plan's loopYear determines life expectancy.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Spouse's name" },
        birthYear: { type: "number", description: "Birth year (e.g., 1992). Combined with plan loopYear to determine life expectancy" },
        birthMonth: { type: "number", description: "Birth month (1-12)" },
        age: { type: "number", description: "Current age" },
      },
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
    description: "Update an income event's properties including start/end timing",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
        incomeId: { type: "string", description: "The income event ID" },
        amount: { type: "number", description: "New amount" },
        name: { type: "string", description: "New name" },
        frequency: { type: "string", enum: ["yearly", "monthly", "bi-weekly", "weekly", "quarterly", "once"], description: "Payment frequency" },
        start: {
          type: "object",
          description: "When the income starts. Use type='year' with value='2059' for a specific year, type='keyword' with value='now' or 'endOfPlan', or type='milestone' with value=milestone ID",
          properties: {
            type: { type: "string", enum: ["keyword", "milestone", "date", "year"], description: "Type of date reference" },
            value: { type: "string", description: "The value (year like '2059', keyword like 'now'/'endOfPlan', milestone ID, or ISO date)" },
            modifier: { oneOf: [{ type: "string" }, { type: "number" }], description: "Offset in years (number) or 'include'/'exclude'" },
          },
          required: ["type", "value"],
        },
        end: {
          type: "object",
          description: "When the income ends. Same format as start",
          properties: {
            type: { type: "string", enum: ["keyword", "milestone", "date", "year"], description: "Type of date reference" },
            value: { type: "string", description: "The value (year like '2059', keyword like 'now'/'endOfPlan', milestone ID, or ISO date)" },
            modifier: { oneOf: [{ type: "string" }, { type: "number" }], description: "Offset in years (number) or 'include'/'exclude'" },
          },
          required: ["type", "value"],
        },
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
        amount: { type: "number", description: "Amount (interpretation depends on frequency)" },
        frequency: { type: "string", enum: ["yearly", "monthly", "bi-weekly", "weekly", "quarterly", "once"], description: "Payment frequency (default: yearly)" },
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
    description: "Update an expense event's properties including start/end timing",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
        expenseId: { type: "string", description: "The expense event ID" },
        amount: { type: "number", description: "New amount" },
        name: { type: "string", description: "New name" },
        frequency: { type: "string", enum: ["yearly", "monthly", "bi-weekly", "weekly", "quarterly", "once"], description: "Payment frequency" },
        start: {
          type: "object",
          description: "When the expense starts. Use type='year' with value='2043' for a specific year, type='keyword' with value='now' or 'endOfPlan', or type='milestone' with value=milestone ID (e.g., for 'Sungmin 2nd Career')",
          properties: {
            type: { type: "string", enum: ["keyword", "milestone", "date", "year"], description: "Type of date reference" },
            value: { type: "string", description: "The value (year like '2043', keyword like 'now'/'endOfPlan', milestone ID, or ISO date)" },
            modifier: { oneOf: [{ type: "string" }, { type: "number" }], description: "Offset in years (number) or 'include'/'exclude'" },
          },
          required: ["type", "value"],
        },
        end: {
          type: "object",
          description: "When the expense ends. Same format as start",
          properties: {
            type: { type: "string", enum: ["keyword", "milestone", "date", "year"], description: "Type of date reference" },
            value: { type: "string", description: "The value (year like '2057', keyword like 'now'/'endOfPlan', milestone ID, or ISO date)" },
            modifier: { oneOf: [{ type: "string" }, { type: "number" }], description: "Offset in years (number) or 'include'/'exclude'" },
          },
          required: ["type", "value"],
        },
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
        amount: { type: "number", description: "Amount (interpretation depends on frequency)" },
        frequency: { type: "string", enum: ["yearly", "monthly", "bi-weekly", "weekly", "quarterly", "once"], description: "Payment frequency (default: yearly)" },
        spendingType: { type: "string", enum: ["essential", "discretionary", "flex"], description: "Spending category" },
        start: {
          type: "object",
          description: "When the expense starts. Use type='year' with value='2043' for a specific year, type='keyword' with value='now' or 'endOfPlan', or type='milestone' with value=milestone ID",
          properties: {
            type: { type: "string", enum: ["keyword", "milestone", "date", "year"], description: "Type of date reference" },
            value: { type: "string", description: "The value (year like '2043', keyword like 'now'/'endOfPlan', milestone ID, or ISO date)" },
            modifier: { oneOf: [{ type: "string" }, { type: "number" }], description: "Offset in years (number) or 'include'/'exclude'" },
          },
          required: ["type", "value"],
        },
        end: {
          type: "object",
          description: "When the expense ends. Same format as start",
          properties: {
            type: { type: "string", enum: ["keyword", "milestone", "date", "year"], description: "Type of date reference" },
            value: { type: "string", description: "The value (year like '2057', keyword like 'now'/'endOfPlan', milestone ID, or ISO date)" },
            modifier: { oneOf: [{ type: "string" }, { type: "number" }], description: "Offset in years (number) or 'include'/'exclude'" },
          },
          required: ["type", "value"],
        },
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
    description: "Update a priority's settings including target amounts and contribution settings",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
        priorityId: { type: "string", description: "The priority ID" },
        amount: { type: "number", description: "Target amount for savings goals (e.g., $150000 for Emergency Fund target)" },
        amountType: { type: "string", enum: ["today$", "future$"], description: "How to interpret the target amount" },
        mode: { type: "string", enum: ["target", "contribution"], description: "Whether this priority tracks a target amount or ongoing contributions" },
        contribution: { type: "number", description: "Contribution amount per period" },
        contributionType: { type: "string", enum: ["today$", "%"], description: "Contribution type (fixed dollars or percentage)" },
        employerMatch: { type: "number", description: "Employer match percentage" },
        employerMatchLimit: { type: "number", description: "Employer match limit" },
        start: {
          type: "object",
          description: "When the priority starts",
          properties: {
            type: { type: "string", enum: ["keyword", "milestone", "date", "year"], description: "Type of date reference" },
            value: { type: "string", description: "The value (year, keyword, milestone ID, or ISO date)" },
            modifier: { oneOf: [{ type: "string" }, { type: "number" }], description: "Offset in years or include/exclude" },
          },
          required: ["type", "value"],
        },
        end: {
          type: "object",
          description: "When the priority ends",
          properties: {
            type: { type: "string", enum: ["keyword", "milestone", "date", "year"], description: "Type of date reference" },
            value: { type: "string", description: "The value (year, keyword, milestone ID, or ISO date)" },
            modifier: { oneOf: [{ type: "string" }, { type: "number" }], description: "Offset in years or include/exclude" },
          },
          required: ["type", "value"],
        },
      },
      required: ["planId", "priorityId"],
    },
  },
  {
    name: "add_priority",
    description: "Add a new cash flow priority to a plan (401k contribution, debt payment, savings goal, etc.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
        type: {
          type: "string",
          enum: ["401k", "roth-ira", "traditional-ira", "hsa", "529", "taxable", "savings", "debt", "asset", "mega-backdoor", "espp"],
          description: "Type of priority"
        },
        name: { type: "string", description: "Priority name" },
        accountId: { type: "string", description: "Target account ID (for account-based priorities)" },
        debtId: { type: "string", description: "Target debt ID (for debt payment priorities)" },
        owner: { type: "string", enum: ["me", "spouse", "joint"], description: "Owner" },
        mode: { type: "string", enum: ["target", "contribution"], description: "Target amount or contribution mode" },
        amount: { type: "number", description: "Target amount (for target mode)" },
        amountType: { type: "string", enum: ["today$", "future$"], description: "How to interpret target amount" },
        contribution: { type: "number", description: "Contribution amount per period" },
        contributionType: { type: "string", enum: ["today$", "%"], description: "Contribution type" },
        employerMatch: { type: "number", description: "Employer match percentage" },
        employerMatchLimit: { type: "number", description: "Employer match limit" },
        start: {
          type: "object",
          description: "When the priority starts",
          properties: {
            type: { type: "string", enum: ["keyword", "milestone", "date", "year"] },
            value: { type: "string" },
            modifier: { oneOf: [{ type: "string" }, { type: "number" }] },
          },
          required: ["type", "value"],
        },
        end: {
          type: "object",
          description: "When the priority ends",
          properties: {
            type: { type: "string", enum: ["keyword", "milestone", "date", "year"] },
            value: { type: "string" },
            modifier: { oneOf: [{ type: "string" }, { type: "number" }] },
          },
          required: ["type", "value"],
        },
      },
      required: ["planId", "type", "name"],
    },
  },
  {
    name: "delete_priority",
    description: "Delete a priority from a plan",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
        priorityId: { type: "string", description: "The priority ID to delete" },
      },
      required: ["planId", "priorityId"],
    },
  },

  // ==========================================================================
  // Milestone Tools
  // ==========================================================================
  {
    name: "list_milestones",
    description: "List all milestones in a plan (retirement, FIRE, etc.) including computed milestones derived from goals",
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
    description: "Update a milestone's properties including when it triggers (criteria)",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
        milestoneId: { type: "string", description: "The milestone ID" },
        name: { type: "string", description: "New name" },
        criteria: {
          type: "array",
          description: "Conditions that trigger the milestone. Multiple criteria can be combined with 'and'/'or' logic",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["year", "date", "milestone", "netWorth", "account", "totalDebt"],
                description: "Type of criterion: 'year' for specific year, 'date' for specific date, 'milestone' to reference another milestone, 'netWorth'/'account'/'totalDebt' for financial targets"
              },
              value: {
                oneOf: [{ type: "string" }, { type: "number" }],
                description: "The target value. For type='year'/'date', must be a date string (e.g., '2053-01-01'). For type='netWorth'/'account'/'totalDebt', must be a NUMBER. For type='milestone', use milestone ID string."
              },
              valueType: {
                type: "string",
                enum: ["$", "today$", "expenses", "%"],
                description: "How to interpret the value for financial targets"
              },
              operator: {
                type: "string",
                enum: [">=", "<=", "==", ">", "<"],
                description: "Comparison operator for financial targets"
              },
              modifier: {
                type: "string",
                enum: ["include", "exclude"],
                description: "Whether to include or exclude the boundary"
              },
              logic: {
                type: "string",
                enum: ["and", "or"],
                description: "How to combine with previous criteria. Required for 2nd+ criteria in a list (e.g., 'and' or 'or')"
              },
              refId: {
                type: "string",
                description: "Reference ID for account/debt when type is 'account' or 'totalDebt'"
              },
            },
          },
        },
      },
      required: ["planId", "milestoneId"],
    },
  },
  {
    name: "add_milestone",
    description: "Add a new milestone to a plan (e.g., retirement, FIRE, career change)",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
        name: { type: "string", description: "Milestone name (e.g., 'Retirement', 'FIRE', 'Career Change')" },
        icon: { type: "string", description: "Icon identifier" },
        color: { type: "string", description: "Color for the milestone" },
        criteria: {
          type: "array",
          description: "Conditions that trigger the milestone",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["year", "date", "milestone", "netWorth", "account", "totalDebt"],
                description: "Type of criterion"
              },
              value: {
                oneOf: [{ type: "string" }, { type: "number" }],
                description: "The target value. For type='year'/'date', must be a DATE STRING (e.g., '2053-01-01'). For type='netWorth'/'account'/'totalDebt', must be a NUMBER. For type='milestone', use the milestone ID string."
              },
              valueType: {
                type: "string",
                enum: ["$", "today$", "expenses", "%"],
                description: "How to interpret the value"
              },
              operator: {
                type: "string",
                enum: [">=", "<=", "==", ">", "<"],
                description: "Comparison operator"
              },
              modifier: {
                type: "string",
                enum: ["include", "exclude"],
                description: "Include or exclude boundary"
              },
              logic: {
                type: "string",
                enum: ["and", "or"],
                description: "How to combine with previous criteria. Required for 2nd+ criteria in a list (e.g., 'and' or 'or')"
              },
              refId: {
                type: "string",
                description: "Reference ID for account/debt"
              },
            },
          },
        },
      },
      required: ["planId", "name"],
    },
  },
  {
    name: "delete_milestone",
    description: "Delete a milestone from a plan",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
        milestoneId: { type: "string", description: "The milestone ID to delete" },
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
    description: "Update plan assumptions (investment return, inflation, tax rates, plan end year/life expectancy, etc.)",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
        loopYear: { type: "number", description: "Plan end year - sets when the projection ends (effectively life expectancy). E.g., 2088 for Richard born 1992 with 96-year life expectancy" },
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

  // ==========================================================================
  // Delete Operations
  // ==========================================================================
  {
    name: "delete_account",
    description: "Delete a savings or investment account",
    inputSchema: {
      type: "object" as const,
      properties: {
        accountId: { type: "string", description: "The account ID to delete" },
      },
      required: ["accountId"],
    },
  },
  {
    name: "delete_debt",
    description: "Delete a debt",
    inputSchema: {
      type: "object" as const,
      properties: {
        debtId: { type: "string", description: "The debt ID to delete" },
      },
      required: ["debtId"],
    },
  },
  {
    name: "delete_asset",
    description: "Delete an asset",
    inputSchema: {
      type: "object" as const,
      properties: {
        assetId: { type: "string", description: "The asset ID to delete" },
      },
      required: ["assetId"],
    },
  },
  {
    name: "delete_income",
    description: "Delete an income event from a plan",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
        incomeId: { type: "string", description: "The income event ID to delete" },
      },
      required: ["planId", "incomeId"],
    },
  },
  {
    name: "delete_expense",
    description: "Delete an expense event from a plan",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID" },
        expenseId: { type: "string", description: "The expense event ID to delete" },
      },
      required: ["planId", "expenseId"],
    },
  },

  // ==========================================================================
  // Plan Management
  // ==========================================================================
  {
    name: "duplicate_plan",
    description: "Create a copy of an existing plan with a new name",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID to duplicate" },
        newName: { type: "string", description: "Name for the new plan" },
      },
      required: ["planId", "newName"],
    },
  },
  {
    name: "delete_plan",
    description: "Delete a plan",
    inputSchema: {
      type: "object" as const,
      properties: {
        planId: { type: "string", description: "The plan ID to delete" },
      },
      required: ["planId"],
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
      // Person Info
      // ========================================================================
      case "update_person": {
        const d = getData();
        if (args?.name !== undefined) d.today.yourName = args.name as string;
        if (args?.birthYear !== undefined) d.today.birthYear = args.birthYear as number;
        if (args?.birthMonth !== undefined) d.today.birthMonth = args.birthMonth as number;
        if (args?.age !== undefined) d.today.age = args.age as number;

        await saveData();
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              name: d.today.yourName,
              birthYear: d.today.birthYear,
              birthMonth: d.today.birthMonth,
              age: d.today.age,
            }, null, 2)
          }]
        };
      }

      case "update_spouse": {
        const d = getData();
        if (args?.name !== undefined) d.today.spouseName = args.name as string;
        if (args?.birthYear !== undefined) d.today.spouseBirthYear = args.birthYear as number;
        if (args?.birthMonth !== undefined) d.today.spouseBirthMonth = args.birthMonth as number;
        if (args?.age !== undefined) d.today.spouseAge = args.age as number;

        await saveData();
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              name: d.today.spouseName,
              birthYear: d.today.spouseBirthYear,
              birthMonth: d.today.spouseBirthMonth,
              age: d.today.spouseAge,
            }, null, 2)
          }]
        };
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
        if (args?.frequency !== undefined) income.frequency = args.frequency as IncomeEvent["frequency"];
        if (args?.start !== undefined) {
          validateDateReference(args.start, "start");
          income.start = args.start as DateReference;
        }
        if (args?.end !== undefined) {
          validateDateReference(args.end, "end");
          income.end = args.end as DateReference;
        }

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
          frequency: (args?.frequency as IncomeEvent["frequency"]) ?? "yearly",
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
        if (args?.frequency !== undefined) expense.frequency = args.frequency as ExpenseEvent["frequency"];
        if (args?.start !== undefined) {
          validateDateReference(args.start, "start");
          expense.start = args.start as DateReference;
        }
        if (args?.end !== undefined) {
          validateDateReference(args.end, "end");
          expense.end = args.end as DateReference;
        }

        await saveData();
        return { content: [{ type: "text", text: JSON.stringify(expense, null, 2) }] };
      }

      case "add_expense": {
        const plan = findPlan(args?.planId as string);
        if (!plan.expenses) plan.expenses = { events: [] };
        if (!plan.expenses.events) plan.expenses.events = [];

        // Validate start/end if provided
        if (args?.start !== undefined) {
          validateDateReference(args.start, "start");
        }
        if (args?.end !== undefined) {
          validateDateReference(args.end, "end");
        }

        const newExpense: ExpenseEvent = {
          id: `expense-${Date.now()}`,
          type: args?.type as ExpenseEvent["type"],
          name: args?.name as string,
          amount: args?.amount as number,
          amountType: "today$",
          frequency: (args?.frequency as ExpenseEvent["frequency"]) ?? "yearly",
          spendingType: (args?.spendingType as ExpenseEvent["spendingType"]) ?? "discretionary",
          start: (args?.start as DateReference) ?? { type: "keyword", value: "now" },
          end: (args?.end as DateReference) ?? { type: "keyword", value: "endOfPlan" },
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

        if (args?.amount !== undefined) priority.amount = args.amount as number;
        if (args?.amountType !== undefined) priority.amountType = args.amountType as "today$" | "future$";
        if (args?.mode !== undefined) priority.mode = args.mode as "target" | "contribution";
        if (args?.contribution !== undefined) priority.contribution = args.contribution as number;
        if (args?.contributionType !== undefined) priority.contributionType = args.contributionType as "today$" | "%";
        if (args?.employerMatch !== undefined) priority.employerMatch = args.employerMatch as number;
        if (args?.employerMatchLimit !== undefined) priority.employerMatchLimit = args.employerMatchLimit as number;
        if (args?.start !== undefined) {
          validateDateReference(args.start, "start");
          priority.start = args.start as DateReference;
        }
        if (args?.end !== undefined) {
          validateDateReference(args.end, "end");
          priority.end = args.end as DateReference;
        }

        await saveData();
        return { content: [{ type: "text", text: JSON.stringify(priority, null, 2) }] };
      }

      case "add_priority": {
        const plan = findPlan(args?.planId as string);
        if (!plan.priorities) plan.priorities = { events: [] };
        if (!plan.priorities.events) plan.priorities.events = [];

        // Validate start/end if provided
        if (args?.start !== undefined) {
          validateDateReference(args.start, "start");
        }
        if (args?.end !== undefined) {
          validateDateReference(args.end, "end");
        }

        const newPriority: PriorityEvent = {
          id: `priority-${Date.now()}`,
          type: args?.type as PriorityEvent["type"],
          name: args?.name as string,
          owner: (args?.owner as PriorityEvent["owner"]) ?? "me",
          mode: (args?.mode as PriorityEvent["mode"]) ?? "contribution",
          start: (args?.start as DateReference) ?? { type: "keyword", value: "now" },
          end: (args?.end as DateReference) ?? { type: "keyword", value: "endOfPlan" },
        };

        if (args?.accountId !== undefined) newPriority.accountId = args.accountId as string;
        if (args?.debtId !== undefined) newPriority.debtId = args.debtId as string;
        if (args?.amount !== undefined) newPriority.amount = args.amount as number;
        if (args?.amountType !== undefined) newPriority.amountType = args.amountType as "today$" | "future$";
        if (args?.contribution !== undefined) newPriority.contribution = args.contribution as number;
        if (args?.contributionType !== undefined) newPriority.contributionType = args.contributionType as "today$" | "%";
        if (args?.employerMatch !== undefined) newPriority.employerMatch = args.employerMatch as number;
        if (args?.employerMatchLimit !== undefined) newPriority.employerMatchLimit = args.employerMatchLimit as number;

        plan.priorities.events.push(newPriority);
        await saveData();
        return { content: [{ type: "text", text: JSON.stringify(newPriority, null, 2) }] };
      }

      // ========================================================================
      // Milestones
      // ========================================================================
      case "list_milestones": {
        const plan = findPlan(args?.planId as string);
        const milestones = plan.milestones ?? [];
        const computedMilestones = plan.computedMilestones ?? [];
        return { content: [{ type: "text", text: JSON.stringify({ milestones, computedMilestones }, null, 2) }] };
      }

      case "get_milestone": {
        const plan = findPlan(args?.planId as string);
        const milestone = plan.milestones?.find((m) => m.id === args?.milestoneId)
          ?? plan.computedMilestones?.find((m) => m.id === args?.milestoneId);
        if (!milestone) throw new Error(`Milestone not found: ${args?.milestoneId}`);
        return { content: [{ type: "text", text: JSON.stringify(milestone, null, 2) }] };
      }

      case "update_milestone": {
        const plan = findPlan(args?.planId as string);
        const milestone = plan.milestones?.find((m) => m.id === args?.milestoneId);
        if (!milestone) throw new Error(`Milestone not found: ${args?.milestoneId}`);

        if (args?.name !== undefined) milestone.name = args.name as string;
        if (args?.criteria !== undefined) {
          const criteria = args.criteria as MilestoneCriterion[];
          validateCriteria(criteria);
          validateCriteriaReferences(criteria, data!.today, plan);
          milestone.criteria = criteria;
        }

        await saveData();
        return { content: [{ type: "text", text: JSON.stringify(milestone, null, 2) }] };
      }

      case "add_milestone": {
        const plan = findPlan(args?.planId as string);
        if (!plan.milestones) plan.milestones = [];

        const newMilestone: Milestone = {
          id: `milestone-${Date.now()}`,
          name: args?.name as string,
          removable: true,
        };

        if (args?.icon !== undefined) newMilestone.icon = args.icon as string;
        if (args?.color !== undefined) newMilestone.color = args.color as string;
        if (args?.criteria !== undefined) {
          const criteria = args.criteria as MilestoneCriterion[];
          validateCriteria(criteria);
          validateCriteriaReferences(criteria, data!.today, plan);
          newMilestone.criteria = criteria;
        }

        plan.milestones.push(newMilestone);
        await saveData();
        return { content: [{ type: "text", text: JSON.stringify(newMilestone, null, 2) }] };
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

        if (args?.loopYear !== undefined) plan.variables.loopYear = args.loopYear as number;
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

      // ========================================================================
      // Delete Operations
      // ========================================================================
      case "delete_account": {
        const accountId = args?.accountId as string;
        const d = getData();

        const savingsIdx = d.today.savingsAccounts?.findIndex((a) => a.id === accountId) ?? -1;
        if (savingsIdx >= 0) {
          const deleted = d.today.savingsAccounts!.splice(savingsIdx, 1)[0];
          await saveData();
          return { content: [{ type: "text", text: `Deleted savings account: ${deleted.name}` }] };
        }

        const investmentIdx = d.today.investmentAccounts?.findIndex((a) => a.id === accountId) ?? -1;
        if (investmentIdx >= 0) {
          const deleted = d.today.investmentAccounts!.splice(investmentIdx, 1)[0];
          await saveData();
          return { content: [{ type: "text", text: `Deleted investment account: ${deleted.name}` }] };
        }

        throw new Error(`Account not found: ${accountId}`);
      }

      case "delete_debt": {
        const debtId = args?.debtId as string;
        const d = getData();

        const idx = d.today.debts?.findIndex((debt) => debt.id === debtId) ?? -1;
        if (idx < 0) throw new Error(`Debt not found: ${debtId}`);

        const deleted = d.today.debts!.splice(idx, 1)[0];
        await saveData();
        return { content: [{ type: "text", text: `Deleted debt: ${deleted.name}` }] };
      }

      case "delete_asset": {
        const assetId = args?.assetId as string;
        const d = getData();

        const idx = d.today.assets?.findIndex((asset) => asset.id === assetId) ?? -1;
        if (idx < 0) throw new Error(`Asset not found: ${assetId}`);

        const deleted = d.today.assets!.splice(idx, 1)[0];
        await saveData();
        return { content: [{ type: "text", text: `Deleted asset: ${deleted.name}` }] };
      }

      case "delete_income": {
        const plan = findPlan(args?.planId as string);
        const incomeId = args?.incomeId as string;

        const idx = plan.income?.events?.findIndex((i) => i.id === incomeId) ?? -1;
        if (idx < 0) throw new Error(`Income not found: ${incomeId}`);

        const deleted = plan.income!.events!.splice(idx, 1)[0];
        await saveData();
        return { content: [{ type: "text", text: `Deleted income: ${deleted.name}` }] };
      }

      case "delete_expense": {
        const plan = findPlan(args?.planId as string);
        const expenseId = args?.expenseId as string;

        const idx = plan.expenses?.events?.findIndex((e) => e.id === expenseId) ?? -1;
        if (idx < 0) throw new Error(`Expense not found: ${expenseId}`);

        const deleted = plan.expenses!.events!.splice(idx, 1)[0];
        await saveData();
        return { content: [{ type: "text", text: `Deleted expense: ${deleted.name}` }] };
      }

      case "delete_priority": {
        const plan = findPlan(args?.planId as string);
        const priorityId = args?.priorityId as string;

        const idx = plan.priorities?.events?.findIndex((p) => p.id === priorityId) ?? -1;
        if (idx < 0) throw new Error(`Priority not found: ${priorityId}`);

        const deleted = plan.priorities!.events!.splice(idx, 1)[0];
        await saveData();
        return { content: [{ type: "text", text: `Deleted priority: ${deleted.name}` }] };
      }

      case "delete_milestone": {
        const plan = findPlan(args?.planId as string);
        const milestoneId = args?.milestoneId as string;

        const idx = plan.milestones?.findIndex((m) => m.id === milestoneId) ?? -1;
        if (idx < 0) throw new Error(`Milestone not found: ${milestoneId}`);

        const deleted = plan.milestones!.splice(idx, 1)[0];
        await saveData();
        return { content: [{ type: "text", text: `Deleted milestone: ${deleted.name}` }] };
      }

      // ========================================================================
      // Plan Management
      // ========================================================================
      case "duplicate_plan": {
        const sourcePlan = findPlan(args?.planId as string);
        const newName = args?.newName as string;
        const d = getData();

        // Deep clone the plan
        const newPlan: Plan = JSON.parse(JSON.stringify(sourcePlan));
        newPlan.id = `plan-${Date.now()}`;
        newPlan.name = newName;
        newPlan.lastUpdated = Date.now();

        d.plans.push(newPlan);
        await saveData();
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ id: newPlan.id, name: newPlan.name, copiedFrom: sourcePlan.name }, null, 2)
          }]
        };
      }

      case "delete_plan": {
        const planId = args?.planId as string;
        const d = getData();

        const idx = d.plans.findIndex((p) => p.id === planId);
        if (idx < 0) throw new Error(`Plan not found: ${planId}`);

        if (d.plans.length === 1) {
          throw new Error("Cannot delete the last plan");
        }

        const deleted = d.plans.splice(idx, 1)[0];
        await saveData();
        return { content: [{ type: "text", text: `Deleted plan: ${deleted.name}` }] };
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
