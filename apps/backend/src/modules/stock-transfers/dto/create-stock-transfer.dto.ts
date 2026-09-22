import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { IsUuidLoose } from '../../../common/validators/is-uuid-loose.decorator';

export class CreateStockTransferDto {
  /**
   * Succursale source. OPTIONNELLE : un produit est toujours rattaché à une
   * seule succursale, donc la source est déductible de `productId` côté
   * serveur. Le client peut l'envoyer pour être explicite — dans ce cas elle
   * doit correspondre à la succursale du produit (400 sinon).
   *
   * `IsUuidLoose` et non `IsUUID` : la succursale Joliette porte l'id
   * déterministe `11111111-1111-1111-1111-111111111111` posé par la migration
   * multi-succursales, que `IsUUID` rejette (champ de variante non conforme
   * RFC 4122) alors que PostgreSQL l'accepte.
   */
  @IsUuidLoose()
  @IsOptional()
  fromBranchId?: string;

  @IsUuidLoose()
  @IsNotEmpty()
  toBranchId!: string;

  @IsUuidLoose()
  @IsNotEmpty()
  productId!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsString()
  @IsOptional()
  note?: string;
}
