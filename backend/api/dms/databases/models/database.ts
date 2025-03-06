import { Expose, Type } from "class-transformer";

export class Database {
  @Expose()
  @Type(() => String)
  id!: string;

  @Expose()
  @Type(() => String)
  title!: string;
}

export class DatabaseList {
  @Expose()
  @Type(() => Database)
  list!: Database[];
}
