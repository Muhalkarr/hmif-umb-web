export const createRepository = (database, domain, methods) => Object.freeze(
  Object.fromEntries(methods.map((method) => {
    if (typeof database[method] !== 'function') {
      throw new Error(`Repository ${domain} membutuhkan metode database yang tidak tersedia: ${method}`);
    }
    return [method, database[method].bind(database)];
  }))
);
