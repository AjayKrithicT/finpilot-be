import { findActiveInstruments } from '../repositories/transaction.repository';
import type { InstrumentOptionDto } from '../types/transaction.types';

export async function listActiveInstruments(): Promise<InstrumentOptionDto[]> {
  const rows = await findActiveInstruments();

  return rows.map((r) => ({
    instrument_id: r.instrument_id,
    symbol: r.symbol,
    instrument_name: r.instrument_name,
    asset_class: r.asset_class,
  }));
}
