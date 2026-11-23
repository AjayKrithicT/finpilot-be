import {
  findTransactionsByCustomerId,
  countTransactionsByCustomerId,
} from '../repositories/transaction.repository';
import { findActiveCustomerById } from '../repositories/customer.repository';
import { AppError } from '../utils/AppError';
import { HTTP_STATUS } from '../constants/http.constants';
import { ERROR_CODES } from '../constants/error.constants';
import type { TransactionListQuery, TransactionItemDto } from '../types/transaction.types';
import type { PaginatedResponse } from '../types/common.types';

export async function listCustomerTransactions(
  customerId: string,
  query: TransactionListQuery,
): Promise<PaginatedResponse<TransactionItemDto>> {
  // Verify customer exists and is active
  const customer = await findActiveCustomerById(customerId);
  if (!customer) {
    throw new AppError(
      HTTP_STATUS.NOT_FOUND,
      ERROR_CODES.CUSTOMER_NOT_FOUND,
      `Customer ${customerId} not found`,
    );
  }

  const page = query.page ?? 1;
  const limit = query.limit ?? 20;

  const [rows, total] = await Promise.all([
    findTransactionsByCustomerId(customerId, query),
    countTransactionsByCustomerId(customerId, query),
  ]);

  const data: TransactionItemDto[] = rows.map((r) => ({
    transaction_id: r.transaction_id,
    account_id: r.account_id,
    instrument_id: r.instrument_id,
    symbol: r.symbol,
    instrument_name: r.instrument_name,
    transaction_type: r.transaction_type,
    trade_date:
      r.trade_date instanceof Date
        ? r.trade_date.toISOString().slice(0, 10)
        : String(r.trade_date),
    quantity: Number(r.quantity),
    price: Number(r.price),
    amount: Number(r.amount),
    status: r.status,
  }));

  return {
    data,
    pagination: {
      page,
      limit,
      total_items: total,
      total_pages: Math.ceil(total / limit),
    },
  };
}
