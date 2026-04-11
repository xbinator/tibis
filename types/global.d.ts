declare type AsyncResult<T, U = Error> = Promise<[U] | [undefined, T]>;

declare type Recordable<T = any> = Record<string, T>;
