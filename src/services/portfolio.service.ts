import {
  findPortfolioPositionsByCustomerId,
  findActiveAccountsByCustomerId,
} from '../repositories/portfolio.repository';
import { findActiveCustomerById } from '../repositories/customer.repository';
import { AppError } from '../utils/AppError';
import { HTTP_STATUS } from '../constants/http.constants';
import { ERROR_CODES } from '../constants/error.constants';
import type { PortfolioPositionRow } from '../types/portfolio.types';
import type {
  PortfolioResponseDto,
  PortfolioTotalsDto,
  AccountAllocationDto,
  AssetClassAllocationDto,
  PortfolioPositionDto,
} from '../types/portfolio.types';
import type { AssetClass } from '../constants/domain.constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Main service function
// ---------------------------------------------------------------------------

export async function getCustomerPortfolio(customerId: string): Promise<PortfolioResponseDto> {
  // Verify the customer exists and is active
  const customer = await findActiveCustomerById(customerId);
  if (!customer) {
    throw new AppError(
      HTTP_STATUS.NOT_FOUND,
      ERROR_CODES.CUSTOMER_NOT_FOUND,
      `Customer ${customerId} not found`,
    );
  }

  const [positions, accounts] = await Promise.all([
    findPortfolioPositionsByCustomerId(customerId),
    findActiveAccountsByCustomerId(customerId),
  ]);

  // -------------------------------------------------------------------------
  // Zero-position guard — return empty structure when customer has no holdings
  // -------------------------------------------------------------------------
  if (positions.length === 0) {
    const emptyAccounts: AccountAllocationDto[] = accounts.map((a) => ({
      account_id: a.account_id,
      account_type: a.account_type,
      provider: a.provider,
      cost_basis: 0,
      market_value: 0,
      unrealised_gain_loss: 0,
    }));

    return {
      customer_id: customerId,
      snapshot_date: null,
      price_as_of: null,
      totals: {
        total_cost_basis: 0,
        total_market_value: 0,
        total_unrealised_gain_loss: 0,
        total_unrealised_gain_loss_pct: 0,
      },
      accounts: emptyAccounts,
      allocation_by_asset_class: [],
      positions: [],
    };
  }

  // -------------------------------------------------------------------------
  // Build position DTOs — cast all NUMERIC strings to Number
  // -------------------------------------------------------------------------
  const positionDtos: PortfolioPositionDto[] = positions.map(
    (p: PortfolioPositionRow) => ({
      instrument_id: p.instrument_id,
      symbol: p.symbol,
      instrument_name: p.instrument_name,
      asset_class: p.asset_class,
      account_id: p.account_id,
      quantity: Number(p.quantity),
      avg_cost: Number(p.avg_cost),
      last_price: Number(p.last_price),
      cost_basis: Number(p.cost_basis),
      market_value: Number(p.market_value),
      unrealised_gain_loss: Number(p.unrealised_gain_loss),
      unrealised_gain_loss_pct: Number(p.unrealised_gain_loss_pct),
    }),
  );

  // -------------------------------------------------------------------------
  // Customer-level totals
  // -------------------------------------------------------------------------
  const totalCostBasis = round2(
    positionDtos.reduce((sum, p) => sum + p.cost_basis, 0),
  );
  const totalMarketValue = round2(
    positionDtos.reduce((sum, p) => sum + p.market_value, 0),
  );
  const totalUnrealisedGL = round2(totalMarketValue - totalCostBasis);
  const totalUnrealisedGLPct =
    totalCostBasis > 0
      ? round2((totalUnrealisedGL / totalCostBasis) * 100)
      : 0;

  const totals: PortfolioTotalsDto = {
    total_cost_basis: totalCostBasis,
    total_market_value: totalMarketValue,
    total_unrealised_gain_loss: totalUnrealisedGL,
    total_unrealised_gain_loss_pct: totalUnrealisedGLPct,
  };

  // -------------------------------------------------------------------------
  // Per-account rollups
  // -------------------------------------------------------------------------
  const accountMap = new Map<string, AccountAllocationDto>();

  // Seed all active accounts so accounts with zero holdings still appear
  for (const a of accounts) {
    accountMap.set(a.account_id, {
      account_id: a.account_id,
      account_type: a.account_type,
      provider: a.provider,
      cost_basis: 0,
      market_value: 0,
      unrealised_gain_loss: 0,
    });
  }

  for (const p of positionDtos) {
    const acc = accountMap.get(p.account_id);
    if (acc) {
      acc.cost_basis = round2(acc.cost_basis + p.cost_basis);
      acc.market_value = round2(acc.market_value + p.market_value);
      acc.unrealised_gain_loss = round2(acc.unrealised_gain_loss + p.unrealised_gain_loss);
    }
  }

  const accountAllocations = Array.from(accountMap.values());

  // -------------------------------------------------------------------------
  // Asset-class allocation
  // -------------------------------------------------------------------------
  const assetClassMap = new Map<AssetClass, number>();

  for (const p of positionDtos) {
    const existing = assetClassMap.get(p.asset_class) ?? 0;
    assetClassMap.set(p.asset_class, existing + p.market_value);
  }

  const allocationByAssetClass: AssetClassAllocationDto[] = Array.from(
    assetClassMap.entries(),
  ).map(([asset_class, market_value]) => ({
    asset_class,
    market_value: round2(market_value),
    allocation_pct:
      totalMarketValue > 0
        ? round2((market_value / totalMarketValue) * 100)
        : 0,
  }));

  // -------------------------------------------------------------------------
  // Freshness dates — latest across all positions
  // -------------------------------------------------------------------------
  const snapshotDate = toDate(
    positions.reduce<Date | null>((latest, p) => {
      const d = p.snapshot_date instanceof Date ? p.snapshot_date : new Date(p.snapshot_date);
      return latest === null || d > latest ? d : latest;
    }, null),
  );

  const priceAsOf = toDate(
    positions.reduce<Date | null>((latest, p) => {
      const d = p.price_as_of instanceof Date ? p.price_as_of : new Date(p.price_as_of);
      return latest === null || d > latest ? d : latest;
    }, null),
  );

  return {
    customer_id: customerId,
    snapshot_date: snapshotDate,
    price_as_of: priceAsOf,
    totals,
    accounts: accountAllocations,
    allocation_by_asset_class: allocationByAssetClass,
    positions: positionDtos,
  };
}
