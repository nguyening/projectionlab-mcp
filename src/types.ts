/**
 * TypeScript types for ProjectionLab export data
 * Generated from schema/projectionlab-export.schema.json
 */

// =============================================================================
// Core Types
// =============================================================================

export type Owner = "me" | "spouse" | "joint";

export interface DateReference {
  type: "keyword" | "milestone" | "date" | "year";
  value: string;
  modifier?: "include" | "exclude" | number;
  logic?: "and" | "or";
}

export interface YearlyChange {
  type?: "none" | "match-inflation" | "inflation+" | "increase" | "decrease" | "depreciate" | "appreciate" | "custom";
  amount?: number;
  amountType?: "today$" | "%";
  limitEnabled?: boolean;
  limit?: number;
  limitType?: "today$" | "%";
  custom?: CustomCurve;
}

export interface CustomCurve {
  type?: "%" | "today$";
  data?: Array<{ x: number; y: number }>;
}

// =============================================================================
// Top-Level Export Structure
// =============================================================================

export interface ProjectionLabExport {
  meta: Meta;
  today: Today;
  plans: Plan[];
  progress?: Progress;
  settings: Settings;
}

export interface Meta {
  version: string;
  lastUpdated: number;
}

// =============================================================================
// Today (Current Financial Snapshot)
// =============================================================================

export interface Today {
  schema?: number;
  tab?: number;
  lastUpdated?: number;
  location?: {
    country?: string;
    state?: string;
  };
  partnerStatus?: "single" | "couple";
  age?: number;
  birthYear?: number;
  birthMonth?: number;
  yourName?: string;
  yourColor?: string;
  yourIcon?: string;
  spouseAge?: number;
  spouseAgeGap?: number;
  spouseBirthYear?: number;
  spouseBirthMonth?: number;
  spouseName?: string;
  spouseColor?: string;
  spouseIcon?: string;
  savingsAccounts?: SavingsAccount[];
  investmentAccounts?: InvestmentAccount[];
  debts?: Debt[];
  assets?: Asset[];
}

// =============================================================================
// Account Types
// =============================================================================

export interface SavingsAccount {
  id: string;
  type: "savings";
  name?: string;
  title?: string;
  balance: number;
  owner?: Owner;
  color?: string;
  icon?: string;
  liquid?: boolean;
  withdraw?: boolean;
  withdrawAge?: DateReference;
  repurpose?: boolean;
  isPassiveIncome?: boolean;
  investmentGrowthType?: "fixed" | "plan" | "none" | "custom";
  investmentGrowthRate?: number;
  dividendType?: "none" | "plan" | "fixed" | "custom";
  dividendRate?: number;
}

export interface InvestmentAccount {
  id: string;
  type: "401k" | "roth-ira" | "traditional-ira" | "hsa" | "taxable" | "529";
  name?: string;
  title?: string;
  subtitle?: string;
  balance: number;
  costBasis?: number;
  owner?: Owner;
  color?: string;
  icon?: string;
  country?: string;
  liquid?: boolean;
  withdraw?: boolean;
  withdrawAge?: DateReference;
  withdrawContribsFree?: boolean;
  isPassiveIncome?: boolean;
  hasEWPenalty?: boolean;
  EWAge?: number;
  EWPenaltyRate?: number;
  rmdType?: "us" | "none";
  investmentGrowthType?: "fixed" | "plan" | "none" | "custom";
  investmentGrowthRate?: number;
  dividendType?: "none" | "plan" | "fixed" | "custom";
  dividendRate?: number;
  dividendReinvestment?: boolean;
  dividendsArePassiveIncome?: boolean;
  dividendTaxType?: "plan" | "income" | "capGains";
  yearlyFee?: number;
  yearlyFeeType?: "%" | "today$";
  displayAge?: DateReference;
  excludeFromFinances?: boolean;
}

export interface Debt {
  id: string;
  type: "debt";
  subtype?: "student-loans" | "mortgage" | "auto" | "credit-card" | "personal" | "other";
  name?: string;
  title?: string;
  amount: number;
  amountType?: "today$" | "future$";
  owner?: Owner;
  color?: string;
  icon?: string;
  interestRate?: number;
  interestType?: "simple" | "compound";
  compounding?: "daily" | "monthly" | "yearly";
  monthlyPayment?: number;
  monthlyPaymentType?: "today$" | "future$";
  frequency?: "monthly" | "bi-weekly" | "weekly" | "yearly";
  frequencyChoices?: boolean;
  start?: DateReference;
  end?: DateReference;
  effectiveDate?: DateReference;
  hasForgiveness?: boolean;
  forgiveAt?: DateReference;
  yearlyChange?: YearlyChange;
  planPath?: string;
}

export interface Asset {
  id: string;
  type: "car" | "real-estate" | "other";
  name?: string;
  title?: string;
  owner?: Owner;
  color?: string;
  icon?: string;
  initialValue?: number;
  initialValueType?: "today$" | "future$";
  amount?: number;
  amountType?: "today$" | "future$";
  balance?: number;
  balanceType?: "today$" | "future$";
  paymentMethod?: "pay-in-full" | "financed";
  downPayment?: number;
  downPaymentType?: "today$" | "future$";
  monthlyPayment?: number;
  monthlyPaymentType?: "today$" | "future$";
  interestRate?: number;
  interestType?: "simple" | "compound";
  compounding?: "daily" | "monthly" | "yearly";
  taxRate?: number;
  taxRateType?: "%" | "today$";
  maintenanceRate?: number;
  maintenanceRateType?: "%" | "today$";
  insuranceRate?: number;
  insuranceRateType?: "%" | "today$";
  brokersFee?: number;
  yearlyChange?: YearlyChange;
  start?: DateReference;
  end?: DateReference;
  repeat?: boolean;
  excludeLoanFromLNW?: boolean;
  sellIfNeeded?: boolean;
  modifyAccount?: boolean;
  planPath?: string;
  // Real estate specific
  improvementRate?: number;
  improvementRateType?: "%" | "today$";
  managementRate?: number;
  managementRateType?: "%" | "today$";
  cancelRent?: boolean;
  generateIncome?: boolean;
  isPassiveIncome?: boolean;
  incomeRate?: number;
  incomeRateType?: "%" | "today$";
  monthlyHOA?: number;
  estimateRentalDeductions?: boolean;
  estimateQBI?: boolean;
  percentRented?: number;
  initialBuildingValue?: number;
  initialBuildingValueType?: "today$" | "future$";
  selfEmployment?: boolean;
  classification?: "residential" | "commercial";
}

// =============================================================================
// Plan Types
// =============================================================================

export interface Plan {
  id: string;
  name: string;
  icon?: string;
  schema?: number;
  simKey?: number;
  active?: boolean;
  initialized?: boolean;
  hasNotes?: boolean;
  lastUpdated?: number;
  variables?: PlanVariables;
  milestones?: Milestone[];
  computedMilestones?: Milestone[];
  accounts?: { events?: PlanAccount[] };
  income?: { events?: IncomeEvent[] };
  expenses?: { events?: ExpenseEvent[] };
  assets?: { events?: AssetEvent[] };
  priorities?: { events?: PriorityEvent[] };
  withdrawalStrategy?: WithdrawalStrategy;
  montecarlo?: MonteCarloSettings;
  meta?: Record<string, unknown>;
  startingConditionsType?: string;
  startingConditions?: Record<string, unknown>;
}

export interface PlanVariables {
  assumptionsMode?: "fixed" | "custom" | "backtest";
  startYear?: number;
  loopYear?: number;
  startDate?: string;
  projectFrom?: string;
  showFutureDollars?: boolean;

  // Investment returns
  investmentReturn?: number;
  investmentReturnModifier?: number;
  investmentReturnCustom?: CustomCurve;
  dividendRate?: number;
  dividendRateModifier?: number;
  dividendRateCustom?: CustomCurve;
  inflation?: number;
  inflationModifier?: number;
  inflationCustom?: CustomCurve;

  // Bond allocation
  bondAllocationType?: "fixed" | "custom" | "age-in-bonds";
  bondAllocation?: Array<{ x: number; y: number }>;
  bondDividendRate?: number;
  bondDividendRateModifier?: number;
  bondDividendRateCustom?: CustomCurve;
  bondInvestmentReturn?: number;
  bondInvestmentReturnModifier?: number;
  bondInvestmentReturnCustom?: CustomCurve;
  bondLocation?: { type?: string; accountOrder?: string[] };

  // Cash flow
  cashFlowDefault?: "save" | "spend";
  drawdownOrder?: string[];

  // Tax settings
  filingStatus?: "single" | "joint" | "married-separate" | "head-of-household";
  incomeTaxMode?: "fixed" | "brackets" | "custom";
  effectiveIncomeTaxRate?: number;
  incomeTaxNational?: {
    name?: string;
    icon?: string;
    brackets?: unknown[];
    standardDeduction?: number;
  };
  incomeTaxExtra?: unknown[];
  incomeTaxModifier?: number;
  localIncomeTaxRate?: number;

  // Capital gains
  capGainsMode?: "fixed" | "brackets" | "income";
  capGainsTaxRate?: number;
  capGainsTaxablePercent?: number;
  capGainsTaxAsIncome?: boolean;
  capGains?: { brackets?: unknown[]; offset?: string };
  capGainsModifier?: number;

  // Dividend tax
  dividendTaxMode?: "fixed" | "capGains" | "income" | "brackets";
  dividendTaxRate?: number;
  dividendTax?: Record<string, unknown>;
  bondDividendTaxMode?: "income" | "capGains" | "fixed";
  bondDividendTaxRate?: number;
  bondDividendTax?: Record<string, unknown>;

  // Other taxes
  fttMode?: "none" | "fixed";
  fttRate?: number;
  fttTaxableEvent?: string;
  wealthTaxMode?: "none" | "fixed" | "brackets";
  wealthTaxRate?: number;
  wealthTaxMetric?: string;
  wealthTax?: Record<string, unknown>;

  // Medicare / IRMAA
  medicare?: boolean;
  irmaa?: boolean;

  // Policy settings
  tcjaReversion?: boolean;
  bbbSaltReversion?: boolean;
  bbbSeniorReversion?: boolean;

  // Tax estimation
  estimateTaxes?: boolean;
  withholding?: {
    taxDeferred?: number;
    taxable?: number;
    conversions?: number;
  };
  showRothConversionIcons?: boolean;

  // Flex spending
  flexSpending?: {
    enabled?: boolean;
    points?: unknown[];
    scope?: string;
    interpolation?: string;
  };
}

export interface Milestone {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  removable?: boolean;
  version?: string;
  showChartIcon?: boolean;
  goalId?: string;
  criteria?: MilestoneCriterion[];
}

export interface MilestoneCriterion {
  type?: "year" | "date" | "milestone" | "netWorth" | "account" | "totalDebt";
  value?: string | number;
  valueType?: "$" | "today$" | "expenses" | "%";
  operator?: ">=" | "<=" | "==" | ">" | "<";
  modifier?: "include" | "exclude";
  logic?: "and" | "or";
  range?: number;
  fixedRange?: boolean;
  measurement?: string;
  removable?: boolean;
  refId?: string;
}

export interface PlanAccount {
  id?: string;
  accountId?: string;
  planPath?: string;
  persistent?: boolean;
  key?: number;
  [key: string]: unknown;
}

export interface IncomeEvent {
  id: string;
  type: "salary" | "rsu" | "social-security" | "pension" | "rental" | "other";
  name?: string;
  title?: string;
  icon?: string;
  owner?: Owner;
  amount?: number;
  amountType?: "today$" | "future$";
  frequency?: "yearly" | "monthly" | "bi-weekly" | "weekly" | "quarterly" | "once";
  frequencyChoices?: boolean;
  start?: DateReference;
  end?: DateReference;
  yearlyChange?: YearlyChange;
  taxWithholding?: boolean;
  taxExempt?: boolean;
  withhold?: number;
  selfEmployment?: boolean;
  wage?: boolean;
  goPartTime?: boolean;
  partTimeStart?: DateReference;
  partTimeEnd?: DateReference;
  partTimeRate?: number;
  hasPension?: boolean;
  pensionContribution?: number;
  pensionContributionType?: string;
  contribsReduceTaxableIncome?: boolean;
  pensionPayoutType?: string;
  pensionPayoutsStart?: DateReference;
  pensionPayoutsEnd?: DateReference;
  pensionPayoutRate?: number;
  pensionPayoutAmount?: number;
  pensionPayoutsAreTaxFree?: boolean;
  routeToAccounts?: boolean;
  repeat?: boolean;
  isDividendIncome?: boolean;
  isPassiveIncome?: boolean;
  preventOverflow?: boolean;
  planPath?: string;
  key?: number;
}

export interface ExpenseEvent {
  id: string;
  type: "living-expenses" | "debt" | "charity" | "education" | "dependent-support" | "healthcare" | "other";
  subtype?: string;
  name?: string;
  title?: string;
  icon?: string;
  color?: string;
  owner?: Owner;
  amount?: number;
  amountType?: "today$" | "future$";
  frequency?: "yearly" | "monthly" | "bi-weekly" | "weekly" | "quarterly" | "once";
  frequencyChoices?: boolean;
  start?: DateReference;
  end?: DateReference;
  yearlyChange?: YearlyChange;
  spendingType?: "essential" | "discretionary" | "flex";
  taxDeductible?: boolean | string[];
  itemized?: boolean;
  fundWithAccount?: boolean;
  fundWithAccounts?: string[];
  repeat?: boolean;
  repeatInterval?: number;
  repeatIntervalType?: string;
  repeatScaler?: number;
  repeatEnd?: DateReference;
  hidden?: boolean;
  debtId?: string;
  persistent?: boolean;
  planPath?: string;
  key?: number;
  // Debt-related fields
  monthlyPayment?: number;
  monthlyPaymentType?: string;
  interestRate?: number;
  interestType?: string;
  compounding?: string;
  effectiveDate?: DateReference;
  hasForgiveness?: boolean;
  forgiveAt?: DateReference;
}

export interface AssetEvent {
  id?: string;
  assetId?: string;
  type?: "car" | "real-estate" | "other";
  name?: string;
  title?: string;
  icon?: string;
  color?: string;
  owner?: Owner;
  persistent?: boolean;
  planPath?: string;
  key?: number;
  [key: string]: unknown;
}

export interface PriorityEvent {
  id: string;
  type: "401k" | "roth-ira" | "traditional-ira" | "hsa" | "529" | "taxable" | "savings" | "debt" | "asset" | "mega-backdoor" | "espp";
  subtype?: string;
  name?: string;
  title?: string;
  subtitle?: string;
  icon?: string;
  color?: string;
  owner?: Owner;
  accountId?: string;
  debtId?: string;
  assetId?: string;
  incomeStreamId?: string;
  deductFromIncomeId?: string;
  goalIntent?: "invest" | "maintain" | "pay-extra" | "save";
  mode?: "target" | "contribution";
  showChartIcon?: boolean;
  amount?: number;
  amountType?: "today$" | "future$";
  contribution?: number;
  contributionType?: "today$" | "%";
  contributionLimit?: number;
  contributionsAreFixed?: boolean;
  desiredContribution?: "max" | "%-remaining" | "fixed";
  employerMatch?: number;
  employerMatchType?: "%-contrib-max-$" | "%-salary-max-$" | "today$" | "%";
  employerMatchLimit?: number;
  reduceEmployerMatch?: boolean;
  yearlyLimitType?: "us" | "custom" | "none";
  yearlyLimit?: number;
  "yearlyLimit$Type"?: string;
  frequency?: "yearly" | "monthly" | "bi-weekly";
  frequencyChoices?: boolean;
  start?: DateReference;
  end?: DateReference;
  monthlyPayment?: number;
  monthlyPaymentType?: string;
  extra?: number;
  extraType?: string;
  tapFund?: boolean;
  tapRate?: number;
  taxDeductible?: boolean;
  country?: string;
  persistent?: boolean;
  hidden?: boolean;
  planPath?: string;
  key?: number;
  // Debt-related fields
  interestRate?: number;
  interestType?: string;
  compounding?: string;
  effectiveDate?: DateReference;
  hasForgiveness?: boolean;
  forgiveAt?: DateReference;
  [key: string]: unknown;
}

// =============================================================================
// Strategy Types
// =============================================================================

export interface WithdrawalStrategy {
  enabled?: boolean;
  strategy?: "initial-%" | "fixed-%" | "fixed-amount" | "1/N" | "vpw" | "kitces-ratchet" | "clyatt-95%" | "guyton-klinger";
  start?: DateReference;
  income?: string;
  spendMode?: "withdraw" | "spend";
  "initial-%"?: {
    amount?: number;
    min?: number;
    minType?: string;
    minEnabled?: boolean;
    max?: number;
    maxType?: string;
    maxEnabled?: boolean;
  };
  "fixed-%"?: Record<string, unknown>;
  "fixed-amount"?: {
    amount?: number;
    amountType?: string;
    adjust?: boolean;
  };
  "1/N"?: Record<string, unknown>;
  "vpw"?: Record<string, unknown>;
  "kitces-ratchet"?: {
    amount?: number;
    threshold?: number;
    ratchet?: number;
    cooldown?: number;
  };
  "clyatt-95%"?: Record<string, unknown>;
  "guyton-klinger"?: {
    amount?: number;
    guardrail?: number;
    adjustment?: number;
  };
}

export interface MonteCarloSettings {
  trials?: number;
  iterations?: number;
  mode?: "custom" | "historical" | "normal";
  sampling?: "backtest-random-restart" | "backtest-sequential" | "normal";
  blockSize?: number;
  metric?: string;
  metrics?: string[];
  statsMetric?: string;
  trialMetric?: string;
  splitPoint?: string;
  splitPointModifier?: string;
  investmentReturn?: string;
  investmentReturnMean?: number;
  investmentReturnStdDev?: number;
  dividendRate?: string;
  dividendRateMean?: number;
  dividendRateStdDev?: number;
  inflation?: string;
  inflationMean?: number;
  inflationStdDev?: number;
  bondReturn?: string;
  bondReturnMean?: number;
  bondReturnStdDev?: number;
  cryptoReturn?: string;
  cryptoReturnMean?: number;
  cryptoReturnStdDev?: number;
}

// =============================================================================
// Progress Tracking
// =============================================================================

export interface Progress {
  lastUpdated?: number;
  data?: ProgressSnapshot[];
}

export interface ProgressSnapshot {
  date?: number;
  netWorth?: number;
  savings?: number;
  taxable?: number;
  taxDeferred?: number;
  taxFree?: number;
  crypto?: number;
  assets?: number;
  debt?: number;
  loans?: number;
}

// =============================================================================
// Settings
// =============================================================================

export interface Settings {
  lastUpdated?: number;
  schema?: number;
  theme?: string;
  acceptedTerms?: boolean;
  storageChoice?: string;
  keepMeLoggedIn?: boolean;
  allowSupportAccess?: boolean;
  enablePlugins?: boolean;
  plugins?: Record<string, unknown>;
  completedOnboarding?: boolean;
  skipPlanWizard?: boolean;
  seenVersion?: string;
  autoProgress?: boolean;
  ci?: {
    currency?: string;
    locale?: string;
  };
  plots?: Record<string, unknown>;
  tables?: Record<string, unknown>;
  progress?: Record<string, unknown>;
  today?: Record<string, unknown>;
  plan?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  montecarlo?: Record<string, unknown>;
}
