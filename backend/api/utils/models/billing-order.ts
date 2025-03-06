import { Expose, Type } from "class-transformer";
import { IsEmail, IsNotEmpty, ValidateNested } from "class-validator";

export class Customer {
  @IsNotEmpty()
  @IsEmail()
  @Expose()
  @Type(() => String)
  email: string;
}

export class Product {
  @IsNotEmpty()
  @Expose()
  @Type(() => Number)
  amount: number;
}

export class Article {
  @IsNotEmpty()
  @ValidateNested()
  @Expose()
  @Type(() => Product)
  product: Product;
}

export class BillingOrder {
  @IsNotEmpty()
  @ValidateNested()
  @Expose()
  @Type(() => Article)
  article: Article;

  @IsNotEmpty()
  @ValidateNested()
  @Expose()
  @Type(() => Customer)
  user: Customer;
}
