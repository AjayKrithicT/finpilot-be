import type { AssetClass, AccountType, AccountStatus } from '../constants/domain.constants';

// ----- Database / view row -----
export interface PortfolioPositionRow {
  customer_id: string;
  account_id: string;
  account_type: AccountType;
  provider: string;
  account_status: AccountStatus;
  holding_id: string;
  snapshot_date: Date;
  instrument_id: string;
  symbol: string;
  instrument_name: string;
  asset_class: AssetClass;
  sector: string | null;
  exchange: string;
  risk_band: string;
  quantity: string;        // NUMERIC comes back as string from pg
  avg_cost: string;        // NUMERIC comes back as string from pg
  last_price: string;      // NUMERIC comes back as string from pg
  price_as_of: Date;
  cost_basis: string;      // NUMERIC comes back as string from pg
  market_value: string;    // NUMERIC comes back as string from pg
  unrealised_gain_loss: string;         // NUMERIC comes back as string from pg
  unrealised_gain_loss_pct: string;     // NUMERIC comes back as string from pg
}

// ----- Response DTOs -----
export interface PortfolioTotalsDto {
  total_cost_basis: number;
  total_market_value: number;
  total_unrealised_gain_loss: number;
  total_unrealised_gain_loss_pct: number;
}

export interface AccountAllocationDto {
  account_id: string;
  account_type: AccountType;
  provider: string;
  cost_basis: number;
  market_value: number;
  unrealised_gain_loss: number;
}

export interface AssetClassAllocationDto {
  asset_class: AssetClass;
  market_value: number;
  allocation_pct: number;
}

export interface PortfolioPositionDto {
  instrument_id: string;
  symbol: string;
  instrument_name: string;
  asset_class: AssetClass;
  account_id: string;
  quantity: number;
  avg_cost: number;
  last_price: number;
  cost_basis: number;
  market_value: number;
  unrealised_gain_loss: number;
  unrealised_gain_loss_pct: number;
}

export interface PortfolioResponseDto {
  customer_id: string;
  snapshot_date: string | null;
  price_as_of: string | null;
  totals: PortfolioTotalsDto;
  accounts: AccountAllocationDto[];
  allocation_by_asset_class: AssetClassAllocationDto[];
  positions: PortfolioPositionDto[];
}
