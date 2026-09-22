import api from '@/lib/api';
import type { StockTransferDto } from '@inventorymdb/shared';

export interface CreateStockTransferPayload {
  /** Optionnel : le backend deduit la succursale source depuis `productId`
   *  (un produit appartient a une seule succursale). On ne l'envoie que si
   *  on la connait vraiment — jamais une chaine vide, qui ferait echouer la
   *  validation `IsUUID` cote API. */
  fromBranchId?: string;
  toBranchId: string;
  productId: string;
  quantity: number;
  note?: string;
}

class StockTransfersService {
  async findAll(): Promise<StockTransferDto[]> {
    const res = await api.get('/stock-transfers');
    return res.data;
  }

  async transfer(payload: CreateStockTransferPayload): Promise<StockTransferDto> {
    const res = await api.post('/stock-transfers', payload);
    return res.data;
  }
}

export const stockTransfersService = new StockTransfersService();
