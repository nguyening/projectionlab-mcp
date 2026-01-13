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
- `update_income` - Update income properties
- `add_income` - Add a new income event

### Plan Expenses
- `list_expenses` - List all expense events in a plan
- `get_expense` - Get details of a specific expense event
- `update_expense` - Update expense properties
- `add_expense` - Add a new expense event

### Cash Flow Priorities
- `list_priorities` - List cash flow priorities (401k contributions, debt payments, etc.)
- `get_priority` - Get details of a specific priority
- `update_priority` - Update priority contribution settings

### Milestones
- `list_milestones` - List plan milestones (retirement, FIRE, etc.)
- `get_milestone` - Get details of a specific milestone
- `update_milestone` - Update milestone properties

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

## Data Safety

- All changes are written to your local export file
- The `lastUpdated` timestamp is automatically updated on saves
- Keep backups of your export file before making bulk changes
- You can re-import modified data back into ProjectionLab

## License

ISC
