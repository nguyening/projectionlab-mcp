# projectionlab-mcp

An MCP (Model Context Protocol) server for [ProjectionLab](https://projectionlab.com/) financial planning data. This allows AI assistants like Claude to read and modify your ProjectionLab export files.

## Usage

Add to your MCP settings:

```json
{
  "mcpServers": {
    "projectionlab": {
      "command": "npx",
      "args": ["@nguyening/projectionlab-mcp"]
    }
  }
}
```

## Usage

1. Export your data from ProjectionLab (Settings > Export Data)
2. Start a conversation with Claude and use the `set_data_file` tool to point to your export file
3. Ask questions or make modifications to your financial data

### Example Prompts

- "Load my ProjectionLab data from ~/Documents/projectionlab-export.json and give me an overview"
- "What's my current net worth?"
- "List all my investment accounts"
- "Show me the income sources in my retirement plan"
- "Update my 401k balance to $150,000"
- "What are my monthly expenses?"

## Available Tools

### Setup
- `set_data_file` - Set the path to your ProjectionLab export JSON file

### Overview & Plans
- `get_overview` - High-level summary including net worth, plan count, and personal info
- `list_plans` - List all financial plans
- `get_plan` - Get detailed information about a specific plan

### Accounts
- `list_accounts` - List all savings and investment accounts
- `get_account` - Get details of a specific account
- `update_account_balance` - Update an account's balance
- `rename_account` - Rename an account
- `add_account` - Add a new savings or investment account

### Debts
- `list_debts` - List all debts
- `get_debt` - Get details of a specific debt
- `update_debt` - Update debt properties (amount, interest rate, monthly payment)
- `add_debt` - Add a new debt (student loans, credit card, personal loan, etc.)

### Assets
- `list_assets` - List all physical assets (real estate, vehicles, etc.)
- `get_asset` - Get details of a specific asset
- `update_asset` - Update asset value or loan balance
- `add_asset` - Add a new physical asset (real estate, car, etc.)

### Plan Income
- `list_income` - List all income events in a plan
- `get_income` - Get details of a specific income event
- `update_income` - Update income properties (amount, name, frequency, start/end timing, withhold, taxWithholding, isDividendIncome, yearlyChange)
- `add_income` - Add a new income event (supports yearlyChange for inflation/growth)

### Plan Expenses
- `list_expenses` - List all expense events in a plan
- `get_expense` - Get details of a specific expense event
- `update_expense` - Update expense properties (amount, name, frequency, start/end timing, owner, yearlyChange)
- `add_expense` - Add a new expense event (supports owner and yearlyChange for inflation/growth)

### Cash Flow Priorities
- `list_priorities` - List cash flow priorities (401k contributions, debt payments, etc.)
- `get_priority` - Get details of a specific priority
- `update_priority` - Update priority contribution settings
- `add_priority` - Add a new cash flow priority (401k, IRA, debt payment, savings goal)
- `delete_priority` - Delete a priority from a plan

### Milestones
- `list_milestones` - List plan milestones (retirement, FIRE, etc.)
- `get_milestone` - Get details of a specific milestone
- `update_milestone` - Update milestone properties
- `add_milestone` - Add a new milestone (retirement, FIRE, career change, etc.)
- `delete_milestone` - Delete a milestone from a plan

### Plan Configuration
- `get_plan_variables` - Get plan assumptions and tax settings
- `update_plan_variables` - Update investment return, inflation, tax rates, etc.
- `get_withdrawal_strategy` - Get withdrawal strategy settings
- `update_withdrawal_strategy` - Update withdrawal strategy
- `get_montecarlo_settings` - Get Monte Carlo simulation settings
- `update_montecarlo_settings` - Update Monte Carlo settings

### Progress Tracking
- `get_progress` - Get historical net worth tracking data
- `add_progress_snapshot` - Add a new progress snapshot

### Delete Operations
- `delete_account` - Delete a savings or investment account
- `delete_debt` - Delete a debt
- `delete_asset` - Delete an asset
- `delete_income` - Delete an income event from a plan
- `delete_expense` - Delete an expense event from a plan

### Plan Management
- `duplicate_plan` - Create a copy of an existing plan with a new name
- `delete_plan` - Delete a plan (prevents deleting the last plan)

## DateReference Format

Many tools that work with timing (income, expenses, priorities) use a `DateReference` object for `start` and `end` properties. This object specifies when something begins or ends.

### Structure

```json
{
  "type": "keyword" | "milestone" | "date" | "year",
  "value": "<string>",
  "modifier": "include" | "exclude" | <number>  // optional
}
```

### Types and Values

| Type | Value Format | Example |
|------|--------------|---------|
| `keyword` | `now`, `endOfPlan`, `beforeCurrentYear`, `never` | `{ "type": "keyword", "value": "now" }` |
| `year` | 4-digit year string | `{ "type": "year", "value": "2059" }` |
| `date` | ISO date string | `{ "type": "date", "value": "2029-06-01" }` |
| `milestone` | Milestone ID (e.g., `retirement`, `fire`, or UUID) | `{ "type": "milestone", "value": "retirement" }` |

### Modifier

- `"include"` / `"exclude"` - Whether to include or exclude the boundary
- Number - Year offset (e.g., `5` to add 5 years)

### Examples

```json
// Start now, end at retirement
{ "start": { "type": "keyword", "value": "now" }, "end": { "type": "milestone", "value": "retirement" } }

// Start in 2030, end when plan ends
{ "start": { "type": "year", "value": "2030" }, "end": { "type": "keyword", "value": "endOfPlan" } }

// Start at specific date, never end
{ "start": { "type": "date", "value": "2025-09-01" }, "end": { "type": "keyword", "value": "never" } }
```

## Data Safety

- All changes are written to your local export file
- The `lastUpdated` timestamp is automatically updated on saves
- Keep backups of your export file before making bulk changes
- You can re-import modified data back into ProjectionLab

## License

ISC
